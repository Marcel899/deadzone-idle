/* Deadzone - character art.

   The survivor and the zombies are real sprites, but nothing is loaded
   from disk: a small 3D skeleton is posed per animation frame, projected
   through the same pitched camera the world uses, shaded with volume and
   a rim light, and baked once into a texture atlas. After boot the game
   only ever blits from that atlas, so a hundred bodies on screen cost
   about as much as a hundred rectangles.

   Two things decide whether a body 120px tall reads as a person:

   1. Limb thickness. Every radius here is a real half-width in metres
      multiplied by PPM, not a pixel number picked by eye. Guessed pixel
      radii came out near twice life size, which welded the legs into one
      column and buried the arms inside the chest.
   2. Value. The jacket is light, the trousers are dark and the boots are
      nearly black, so the figure splits into readable blocks at a glance.
      A body painted one colour is a blob however well it is posed.

   Baking runs progressively - `bakeStep` does a slice per call - so the
   world is already up and moving while the later animations fill in.

   Five directions are baked and three are mirrored. At the size a body
   occupies on this map the swapped gun hand is invisible, and it halves
   both the atlas and the time spent filling it. */
(function (Z) {
  'use strict';

  /* World depth -> screen y. Shared with the camera so a body posed here
     stands correctly on ground drawn there. */
  Z.PITCH = 0.58;

  var A = Z.art = {};
  A.BUILD = '2026091509';

  var PPM = 72;             /* bake resolution, pixels per metre */
  var CW = 148, CH = 172;   /* atlas cell */
  var FOOT_X = CW / 2, FOOT_Y = CH - 26;   /* where the ground plane sits */

  /* Zombies come off the same rig at a smaller scale: there are many of
     them, each type needs its own tinted copy of the sheet, and they never
     occupy as much of the screen as the survivor does. */
  var ZK = 0.70;
  /* The extra strip is under the feet, for the ones that end up lying in
     it. A standing body needs 26px below the ground line; a body on its
     back reaches much further toward the camera than that, and the last
     frame of the death animation was running off the bottom of its cell
     - which is the head or the legs simply missing from every corpse,
     depending on which way it fell. The origin does not move, so nothing
     else in the sheet shifts. */
  var ZCW = Math.round(CW * ZK), ZCH = Math.round(CH * ZK) + 30;

  /* Unique baked facings. 0 = walking toward the camera. */
  var DIR_YAW = [0, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75, Math.PI];

  /* dir index 0..7 -> [bakedIndex, mirror].
     0 S, 1 SW, 2 W, 3 NW, 4 N, 5 NE, 6 E, 7 SE */
  var DIR_MAP = [
    [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [3, 1], [2, 1], [1, 1]
  ];
  A.DIR_MAP = DIR_MAP;

  /* Facing away from the camera puts the held weapon behind the body. */
  var WPN_BEHIND = [0, 0, 0, 1, 1];

  A.ANIMS = {
    idle:   { n: 4, loop: true,  fps: 6 },
    walk:   { n: 8, loop: true,  fps: 11 },
    shoot:  { n: 3, loop: false, fps: 20 },
    reload: { n: 8, loop: false, fps: 10 },
    /* Reloading on the move. The legs do not stop because the hands are
       busy: this clip takes its upper body from `reload` and its legs
       from `walk`, frame for frame, which is why both are eight frames
       long. Sprites are baked, so a layered animation has to be baked as
       its own clip - there is no runtime blend to do it with. */
    reloadwalk: { n: 8, loop: false, fps: 10 },
    work:   { n: 6, loop: true,  fps: 9 },
    hit:    { n: 2, loop: false, fps: 14 },
    death:  { n: 6, loop: false, fps: 10, dirs: 3 }
  };

  /* which joints belong to which half, for the composite clips */
  var LEG_J = ['hpL', 'hpR', 'knL', 'knR', 'ftL', 'ftR'];
  var TOP_J = ['hip', 'chest', 'neck', 'head', 'shL', 'shR',
               'elL', 'elR', 'hdL', 'hdR'];

  /* Warmer and a shade more saturated than the world it stands in, so he
     reads as the one thing on screen that is alive. The blue cap and the
     tan pack are the two colours nothing else in the game uses. */
  var PAL = {
    jacket: [106, 120, 96],
    vest:   [48, 54, 50],
    pants:  [54, 58, 64],
    boot:   [31, 30, 28],
    skin:   [222, 172, 130],
    cap:    [66, 104, 140],
    pack:   [176, 142, 90],
    strap:  [62, 62, 56],
    accent: [214, 94, 44]
  };

  /* ------------------------------------------------------------------ *
   * 3D helpers - x right, y forward (away from camera), z up.
   * ------------------------------------------------------------------ */
  function rotY(p, yaw) {
    var c = Math.cos(yaw), s = Math.sin(yaw);
    return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
  }
  /* Everything vertical is squashed by this on the way to the screen, and
     nothing else is. Limb radii are screen pixels and the head is drawn
     from its own radii, so shortening the skeleton alone makes the head a
     quarter of the figure and the arms and legs proportionally thick -
     the whole stylised look, from one number, without retuning a single
     keyframe. The poses stay written in real metres, which is what keeps
     them readable. */
  var BODY_K = 0.80;
  A.BODY_K = BODY_K;

  function proj(p) {
    return { x: FOOT_X + p[0] * PPM,
             y: FOOT_Y - p[2] * PPM * BODY_K + p[1] * PPM * Z.PITCH };
  }
  function v(x, y, z) { return [x, y, z]; }
  function addv(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }

  /* Every radius below is a real half-width in metres. */
  function R(m) { return m * PPM; }

  /* The survivor's proportions, and the default for anything else.

     `LIMB` is read all through drawBody, so giving a body its own build
     is a matter of pointing LIMB somewhere else for the length of one
     bake rather than threading a parameter through thirty call sites.
     See `withBuild`. */
  var BASE_LIMB = {
    thighA: R(0.095), thighB: R(0.078),
    calfA:  R(0.074), calfB:  R(0.056),
    footA:  R(0.074), footB:  R(0.056),
    armA:   R(0.058), armB:   R(0.047),
    foreA:  R(0.044), foreB:  R(0.036),
    hand:   R(0.048),
    waist:  R(0.168), chest:  R(0.198),
    shoulder: R(0.190), neckTop: R(0.074),
    neck:   R(0.070),
    vestA:  R(0.142), vestB: R(0.162),
    /* Deliberately out of scale. A head at life size is 14% of a standing
       figure, and at the size this game draws him that is four pixels of
       the only part anyone looks at. The reference art solves it the same
       way every game at this camera does: shorten the torso and make the
       head a fifth of the body. */
    headX:  R(0.152), headY: R(0.174)
  };
  var LIMB = BASE_LIMB;

  /* A build is a set of multipliers on the standard proportions. Run a
     drawing inside one and every capsule it lays down comes out at that
     body's thickness - which is what makes a brute a brute rather than a
     survivor scaled up by 45%. */
  function withBuild(mul, fn) {
    if (!mul) { fn(); return; }
    var prev = LIMB, o = {};
    for (var k in BASE_LIMB) o[k] = BASE_LIMB[k] * (mul[k] || 1);
    LIMB = o;
    try { fn(); } finally { LIMB = prev; }
  }

  /* ------------------------------------------------------------------ *
   * Shaded capsule - one limb.
   * The gradient runs across the limb, not along it, which is what reads
   * as a cylinder rather than a flat lozenge.
   * ------------------------------------------------------------------ */
  function capsulePath(ctx, x0, y0, r0, x1, y1, r1) {
    var dx = x1 - x0, dy = y1 - y0;
    var L = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    var a0 = Math.atan2(dx / L, -dy / L);
    ctx.beginPath();
    ctx.arc(x0, y0, r0, a0, a0 + Math.PI);
    ctx.arc(x1, y1, r1, a0 + Math.PI, a0 + Math.PI * 2);
    ctx.closePath();
  }

  function limb(ctx, p0, p1, r0, r1, col, outline) {
    var a = proj(p0), b = proj(p1);
    var dx = b.x - a.x, dy = b.y - a.y;
    var L = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    var nx = -dy / L, ny = dx / L;
    var rr = Math.max(r0, r1);
    var g = ctx.createLinearGradient(a.x - nx * rr, a.y - ny * rr, a.x + nx * rr, a.y + ny * rr);
    /* light sits high and to the camera's left */
    var lit = Z.shade(col, 0.34), dark = Z.shade(col, -0.42);
    if (nx < 0) { var t = lit; lit = dark; dark = t; }
    g.addColorStop(0, Z.rgb(lit));
    g.addColorStop(0.44, Z.rgb(col));
    g.addColorStop(1, Z.rgb(dark));
    capsulePath(ctx, a.x, a.y, r0, b.x, b.y, r1);
    ctx.fillStyle = g;
    ctx.fill();
    if (outline !== false) {
      ctx.strokeStyle = 'rgba(8,10,9,.78)';
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
  }

  function blob(ctx, p, rx, ry, col, outline) {
    var s = proj(p);
    var g = ctx.createRadialGradient(s.x - rx * 0.42, s.y - ry * 0.5, rx * 0.08,
                                     s.x, s.y, rx * 1.4);
    g.addColorStop(0, Z.rgb(Z.shade(col, 0.38)));
    g.addColorStop(0.55, Z.rgb(col));
    g.addColorStop(1, Z.rgb(Z.shade(col, -0.44)));
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, rx, ry, 0, 0, Z.TAU);
    ctx.fillStyle = g;
    ctx.fill();
    if (outline !== false) {
      ctx.strokeStyle = 'rgba(8,10,9,.72)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    return s;
  }

  /* ------------------------------------------------------------------ *
   * The rig
   * ------------------------------------------------------------------ */
  function basePose() {
    return {
      /* Legs are 48% of standing height, not the 52% they were: long
         shins on a short torso is what made him read as stilty. The
         torso then gives up 8cm to the head without the whole figure
         getting shorter, so he still stands the right height in a doorway. */
      hip: v(0, 0, 0.68), chest: v(0, 0, 1.08), neck: v(0, 0, 1.26),
      head: v(0, 0.012, 1.44),
      shL: v(-0.215, 0, 1.17), shR: v(0.215, 0, 1.17),
      elL: v(-0.26, 0.09, 1.04), elR: v(0.26, 0.09, 1.04),
      hdL: v(-0.22, 0.29, 0.93), hdR: v(0.22, 0.29, 0.93),
      hpL: v(-0.125, 0, 0.66), hpR: v(0.125, 0, 0.66),
      knL: v(-0.135, 0.02, 0.34), knR: v(0.135, 0.02, 0.34),
      ftL: v(-0.14, 0.04, 0.05), ftR: v(0.14, 0.04, 0.05),
      lean: 0, grip: null, gripAng: 0
    };
  }

  /* The standing height of every joint, so a pose can move away from it
     instead of restating it. */
  function baseZ(p) {
    var o = {};
    for (var k in p) if (p[k] && p[k].length === 3) o[k] = p[k][2];
    return o;
  }
  /* Not "down": the reload pose already declares a local by that name,
     and a var declaration shadows the whole function it sits in. */
  function sunk(z, by) { return Math.max(0.05, z - by); }

  /* Point both hands at a grip in front of the chest. */
  function holdTwo(p, fwd, up, side) {
    var gx = side == null ? 0.06 : side;
    p.hdR = v(gx + 0.03, fwd, up);
    p.hdL = v(gx - 0.21, fwd - 0.05, up - 0.03);
    p.elR = v(0.275, fwd * 0.40, up + 0.11);
    p.elL = v(-0.285, fwd * 0.28, up + 0.03);
    p.grip = v(gx, fwd, up);
  }

  function pose(anim, f, n) {
    var p = basePose();
    var k = n > 1 ? f / n : 0;
    var loopK = k * Z.TAU;

    if (anim === 'idle') {
      var br = Math.sin(loopK) * 0.5 + 0.5;
      p.chest[2] += br * 0.013;
      p.neck[2] += br * 0.015;
      p.head[2] += br * 0.016;
      p.shL[2] += br * 0.011; p.shR[2] += br * 0.011;
      holdTwo(p, 0.20, 1.02);
      p.gripAng = -0.16;
      p.lean = Math.sin(loopK) * 0.008;

    } else if (anim === 'walk') {
      var s = Math.sin(loopK), c = Math.cos(loopK);
      var swing = 0.40;
      /* The knee leads and the foot follows, lifting on the forward half.
         The stride has to clear the body's own width or the legs read as
         a single post. */
      p.knL = v(-0.135, 0.02 + s * swing * 0.50, 0.34 + Math.max(0, s) * 0.055);
      p.knR = v(0.135, 0.02 - s * swing * 0.50, 0.34 + Math.max(0, -s) * 0.055);
      p.ftL = v(-0.15, 0.04 + s * swing, 0.05 + Math.max(0, s) * 0.13);
      p.ftR = v(0.15, 0.04 - s * swing, 0.05 + Math.max(0, -s) * 0.13);
      var bob = Math.abs(c) * 0.035;
      ['hip', 'chest', 'neck', 'head', 'shL', 'shR', 'hpL', 'hpR'].forEach(function (j) {
        p[j][2] += bob;
      });
      /* shoulders and hips counter-rotate */
      p.shL[1] += s * 0.055; p.shR[1] -= s * 0.055;
      p.hpL[1] -= s * 0.045; p.hpR[1] += s * 0.045;
      holdTwo(p, 0.22, 1.00 + bob);
      p.hdL[1] -= s * 0.03;
      p.elL[1] -= s * 0.02;
      p.gripAng = -0.14 + s * 0.06;
      p.lean = 0.06;

    } else if (anim === 'shoot') {
      /* frame 0 is the shot, the rest is the gun settling back down */
      var kick = [1, 0.5, 0.16][f] || 0;
      holdTwo(p, 0.31 - kick * 0.08, 1.15 + kick * 0.03);
      p.chest[2] += kick * 0.012;
      p.head[1] -= 0.025;
      p.gripAng = -0.02 - kick * 0.30;
      p.lean = -0.07 - kick * 0.05;
      p.knL[1] -= 0.05; p.ftL[1] -= 0.11;
      p.knR[1] += 0.06; p.ftR[1] += 0.12;

    } else if (anim === 'reload') {
      var st = f / (n - 1);
      var down = Math.sin(Math.min(1, st * 1.6) * Math.PI * 0.5);
      holdTwo(p, 0.24, 1.10 - down * 0.20);
      p.gripAng = -0.16 - down * 0.44;
      /* the off hand leaves the foregrip, dips to the belt, comes back */
      var mag = st < 0.42 ? st / 0.42 : st < 0.72 ? 1 : 1 - (st - 0.72) / 0.28;
      p.hdL = v(-0.17 - mag * 0.06, 0.19 - mag * 0.06, 1.02 - down * 0.20 - mag * 0.23);
      p.elL = v(-0.31, 0.07, 1.06 - mag * 0.12);
      p.head[2] -= down * 0.02;
      p.lean = -0.02;

    } else if (anim === 'work') {
      /* a two-handed overhead swing - chopping, prising, breaking up */
      var sw = Math.sin(loopK - Math.PI * 0.5);
      var hi = (1 - sw) * 0.5;
      holdTwo(p, 0.27 + sw * 0.17, 0.96 + hi * 0.60);
      p.gripAng = -0.30 + hi * 1.45;
      p.chest[2] -= (1 - hi) * 0.05;
      p.hip[2] -= (1 - hi) * 0.045;
      p.head[1] += (1 - hi) * 0.05;
      p.knL[2] -= (1 - hi) * 0.045; p.knR[2] -= (1 - hi) * 0.045;
      p.ftL[1] -= 0.09; p.ftR[1] += 0.10;
      p.lean = 0.11 + (1 - hi) * 0.17;

    } else if (anim === 'reloadwalk') {
      /* Upper body from the reload, legs from the stride.

         The torso then has to ride the walk's vertical bob, or the head
         floats at a fixed height over legs that are rising and falling
         under it - which looks worse than not animating the legs at all.
         The shoulders keep some of their counter-rotation too, but only
         some: the arms are working the magazine, not swinging. */
      p = pose('reload', f, n);
      var wk = pose('walk', f, n);
      var b0 = basePose();
      LEG_J.forEach(function (jn) { p[jn] = wk[jn]; });
      var bob = wk.hip[2] - b0.hip[2];
      TOP_J.forEach(function (jn) { p[jn][2] += bob; });
      if (p.grip) p.grip[2] += bob;
      var cr = (wk.shL[1] - b0.shL[1]) * 0.55;
      p.shL[1] += cr; p.shR[1] -= cr;
      p.lean = 0.035;

    } else if (anim === 'hit') {
      var h = f === 0 ? 1 : 0.45;
      holdTwo(p, 0.13, 1.06);
      p.gripAng = -0.5;
      ['hip', 'chest', 'neck', 'head'].forEach(function (j) { p[j][1] += h * 0.10; });
      p.head[1] += h * 0.07;
      p.lean = -0.27 * h;

    } else if (anim === 'death') {
      var t = f / (n - 1), fall = Z.smooth(Z.clamp01(t * 1.15)), sink = fall * 0.88;
      /* Heights are taken from the standing pose and sunk from there,
         never written as absolute metres. Written the other way, frame 0
         of the fall carried whatever proportions the skeleton happened to
         have when it was typed, and he jumped the moment he died. */
      var B = baseZ(p);
      p.hip = v(0, fall * 0.30, sunk(B.hip, sink));
      p.chest = v(0, fall * 0.54, sunk(B.chest, sink * 1.30));
      p.neck = v(0, fall * 0.66, sunk(B.neck, sink * 1.50));
      p.head = v(0, fall * 0.76, sunk(B.head, sink * 1.70));
      p.shL = v(-0.23, fall * 0.58, sunk(B.shL, sink * 1.38));
      p.shR = v(0.23, fall * 0.58, sunk(B.shR, sink * 1.38));
      p.elL = v(-0.35, fall * 0.72, sunk(B.elL, sink * 1.20));
      p.elR = v(0.35, fall * 0.72, sunk(B.elR, sink * 1.20));
      p.hdL = v(-0.42, fall * 0.92, sunk(B.hdL, sink * 1.10));
      p.hdR = v(0.42, fall * 0.92, sunk(B.hdR, sink * 1.10));
      p.hpL = v(-0.125, fall * 0.26, sunk(B.hpL, sink));
      p.hpR = v(0.125, fall * 0.26, sunk(B.hpR, sink));
      p.knL = v(-0.17, 0.04 - fall * 0.12, sunk(B.knL, sink * 0.52));
      p.knR = v(0.18, 0.04 - fall * 0.10, sunk(B.knR, sink * 0.50));
      p.ftL = v(-0.19, -0.18 - fall * 0.16, 0.05);
      p.ftR = v(0.20, -0.16 - fall * 0.14, 0.05);
      p.grip = null;
    }
    return p;
  }

  /* ------------------------------------------------------------------ *
   * Drawing one posed frame
   * ------------------------------------------------------------------ */
  function drawBody(ctx, p, yaw, pal, opt) {
    opt = opt || {};
    var j = {};
    for (var key2 in p) {
      var val = p[key2];
      if (val && val.length === 3) {
        var r = rotY(val, yaw);
        if (p.lean) r = [r[0], r[1] + p.lean * (val[2] - 0.4), r[2]];
        j[key2] = r;
      }
    }
    var back = Math.cos(yaw) < -0.25;      /* facing away from the camera */

    /* How side-on he is: 0 facing us or away, 1 in profile. A body is
       wider than it is deep, and a capsule has one fixed radius, so
       without this the torso stayed full width at every angle and he
       never actually looked turned - he just shuffled his limbs. */
    var turn = Math.abs(Math.sin(yaw));
    function bw(wide, deep) { return wide + (deep - wide) * turn; }
    var W = {
      waist: bw(LIMB.waist, R(0.126)),
      chest: bw(LIMB.chest, R(0.146)),
      shoulder: bw(LIMB.shoulder, R(0.140)),
      vestA: bw(LIMB.vestA, R(0.104)),
      vestB: bw(LIMB.vestB, R(0.120)),
      headX: bw(LIMB.headX, R(0.138))
    };

    /* In proj() a larger y sits lower on screen, which is nearer the
       camera - so "far" is negative y. This test used to read the sign
       the other way, which drew the far arm and leg in front on every
       turned view. That is what made walking sideways look wrong. */
    var leftFar = rotY(v(-1, 0, 0), yaw)[1] < 0;

    function leg(far) {
      var S = (leftFar === far) ? ['hpL', 'knL', 'ftL'] : ['hpR', 'knR', 'ftR'];
      limb(ctx, j[S[0]], j[S[1]], LIMB.thighA, LIMB.thighB, pal.pants);
      limb(ctx, j[S[1]], j[S[2]], LIMB.calfA, LIMB.calfB, pal.pants);
      /* the toe points the way he is going */
      var f0 = j[S[2]], toe = addv(f0, rotY(v(0, 0.15, 0.005), yaw));
      limb(ctx, f0, toe, LIMB.footA, LIMB.footB, pal.boot);
    }
    /* The sleeve is a step off the coat. Painted the same colour, the arm
       in front of the chest vanished into it and he lost the pose. The far
       arm goes darker still, which is the cheapest depth cue there is. */
    function arm(far) {
      var S = (leftFar === far) ? ['shL', 'elL', 'hdL'] : ['shR', 'elR', 'hdR'];
      var col = Z.shade(pal.jacket, far ? -0.26 : 0.13);
      limb(ctx, j[S[0]], j[S[1]], LIMB.armA, LIMB.armB, col);
      limb(ctx, j[S[1]], j[S[2]], LIMB.foreA, LIMB.foreB, col);
      blob(ctx, j[S[2]], LIMB.hand, LIMB.hand * 0.9,
           far ? Z.shade(pal.skin, -0.22) : pal.skin);
    }
    /* The pack rides on his back: negative y, because positive y is the
       way he faces. It used to sit at +y, which put it on his chest the
       moment he turned side-on. */
    /* Big enough to see from the front as a rim either side of him,
       which is what makes the silhouette read as "survivor" rather than
       "man". A flap band across it stops it being one flat oval. */
    /* A rounded box, not a ball. Seen at three times size the sphere read
       as a balloon tied to his shoulder; a squarer pack with a flap and a
       little height above the shoulders reads as kit. It also narrows
       when he turns, like everything else on him. */
    function pack() {
      var c = addv(j.chest, rotY(v(0, -0.19, 0.05), yaw));
      var s2 = proj(c);
      var pw = bw(R(0.190), R(0.140)), ph = R(0.235);
      var lit = back ? pal.pack : Z.shade(pal.pack, -0.26);
      var g = ctx.createLinearGradient(s2.x - pw, 0, s2.x + pw, 0);
      g.addColorStop(0, Z.rgb(Z.shade(lit, 0.26)));
      g.addColorStop(0.6, Z.rgb(lit));
      g.addColorStop(1, Z.rgb(Z.shade(lit, -0.36)));
      ctx.fillStyle = g;
      rrect(ctx, s2.x - pw, s2.y - ph, pw * 2, ph * 2, Math.min(pw, ph) * 0.42);
      ctx.fill();
      /* the flap, and the roll strapped under it */
      ctx.fillStyle = Z.rgb(Z.shade(lit, -0.34));
      ctx.fillRect(s2.x - pw, s2.y - ph * 0.42, pw * 2, ph * 0.26);
      ctx.fillStyle = Z.rgb(Z.shade(lit, -0.16));
      ctx.fillRect(s2.x - pw * 0.86, s2.y + ph * 0.38, pw * 1.72, ph * 0.30);
    }

    /* --- far side first --- */
    leg(true);
    if (!opt.noArms) arm(true);
    /* Seen from behind, BOTH arms are on the far side of him: he carries
       the weapon out in front, which from here is behind his chest. The
       near arm was still being drawn last, so it came across the pack as
       a sleeve and a hand laid over his own back - which read as the left
       shoulder being on the wrong side of him. The weapon already knew to
       go behind at these facings (see WPN_BEHIND); the arm holding it did
       not. Only the shoulders stay visible, out at the sides, which is
       what you actually see from behind. */
    if (back && !opt.noArms) arm(false);
    if (!opt.noPack && !back) pack();     /* behind him, so behind the torso */

    /* --- torso --- */
    limb(ctx, j.hip, j.chest, W.waist, W.chest, pal.jacket);
    limb(ctx, j.chest, j.neck, W.shoulder, LIMB.neckTop, pal.jacket);
    /* plate carrier on the chest - forward, the same way the hands are */
    limb(ctx,
         addv(j.hip, rotY(v(0, 0.055, 0.10), yaw)),
         addv(j.chest, rotY(v(0, 0.06, 0.08), yaw)),
         W.vestA, W.vestB, pal.vest);

    /* A belt at the hip. Without it the coat and the trousers met in a
       straight vertical seam and the whole lower half read as one tube. */
    var beltA = proj(addv(j.hip, rotY(v(-0.01, 0.02, 0.055), yaw)));
    var beltB = proj(addv(j.hip, rotY(v(0.01, 0.02, 0.012), yaw)));
    ctx.strokeStyle = Z.rgb(Z.shade(pal.boot, 0.18));
    ctx.lineWidth = W.waist * 2 * 0.92;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(beltA.x, beltA.y); ctx.lineTo(beltB.x, beltB.y);
    ctx.stroke();
    ctx.lineWidth = 1;
    /* The sling.

       It used to be drawn in the accent colour, which is the same rust
       this game uses for damage and for danger. On a body the size of a
       thumbnail a bright red diagonal across the chest does not read as a
       strap, it reads as a wound. Webbing is webbing-coloured. */
    if (!back && pal.strap) {
      limb(ctx,
           addv(j.shL, rotY(v(0, 0.06, -0.02), yaw)),
           addv(j.hip, rotY(v(0.07, 0.07, 0.10), yaw)),
           R(0.011), R(0.010), pal.strap, false);
    }
    if (!opt.noPack && back) pack();      /* we are looking at his back */

    /* --- neck, then head --- */
    limb(ctx, j.neck, addv(j.neck, v(0, 0, 0.055)), LIMB.neck, LIMB.neck * 0.92,
         Z.shade(pal.skin, -0.34));
    var hs = blob(ctx, j.head, W.headX, LIMB.headY, pal.skin);

    /* The survivor wears a cap. A walker does not: it is a corpse, and a
       corpse in a neat peaked cap reads as a groundsman. Same geometry,
       filled as matted hair with no peak - which still gives the skull a
       front and a back, which is all the band was ever for. */
    var bald = !!pal.noCap;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(hs.x, hs.y, W.headX, LIMB.headY, 0, 0, Z.TAU);
    ctx.clip();
    var cg = ctx.createLinearGradient(hs.x - LIMB.headX, 0, hs.x + LIMB.headX, 0);
    cg.addColorStop(0, Z.rgb(Z.shade(pal.cap, 0.26)));
    cg.addColorStop(1, Z.rgb(Z.shade(pal.cap, -0.34)));
    ctx.fillStyle = cg;
    ctx.fillRect(hs.x - W.headX, hs.y - LIMB.headY,
                 W.headX * 2, LIMB.headY * (back ? 1.34 : 0.88));
    if (!back && !bald) {
      /* the brim's shadow - never drawn eyes, which at this size read as
         a skull rather than a face */
      ctx.fillStyle = 'rgba(24,18,12,.46)';
      ctx.fillRect(hs.x - W.headX, hs.y - LIMB.headY * 0.14,
                   W.headX * 2, LIMB.headY * 0.20);
    }
    if (bald) {
      /* hair hanging in clumps rather than a clean band */
      ctx.fillStyle = 'rgba(22,18,16,.34)';
      for (var hk = 0; hk < 3; hk++) {
        var hx = hs.x + (hk - 1) * W.headX * 0.62;
        ctx.beginPath();
        ctx.ellipse(hx, hs.y - LIMB.headY * 0.10, W.headX * 0.42,
                    LIMB.headY * (0.52 + hk * 0.12), 0, 0, Z.TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    /* The peak sits outside the skull, so it is drawn after the clip is
       released. It is the one silhouette cue that says which way he is
       looking when he is nearly side-on. */
    if (!back && !bald) {
      var pk = proj(addv(j.head, rotY(v(0, 0.13, 0.015), yaw)));
      ctx.fillStyle = Z.rgb(Z.shade(pal.cap, -0.20));
      ctx.beginPath();
      ctx.ellipse(pk.x, pk.y - LIMB.headY * 0.18, W.headX * 0.78,
                  LIMB.headY * 0.20, 0, 0, Z.TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,10,9,.62)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(8,10,9,.72)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(hs.x, hs.y, W.headX, LIMB.headY, 0, 0, Z.TAU);
    ctx.stroke();

    /* --- near side --- */
    leg(false);
    if (!back && !opt.noArms) arm(false);

    /* Whatever this body has that a body should not: a swollen throat,
       a split belly, plate bolted to a shoulder, a hood. Drawn after the
       whole figure and given the projected joints, so it can hang things
       off real anatomy instead of guessing where the anatomy went. */
    if (opt.deco) opt.deco(ctx, j, yaw, pal, back, W, proj);

    /* --- rim light along the top, tying the body to the sky --- */
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    var rim = ctx.createLinearGradient(0, proj(j.head).y - 16, 0, FOOT_Y);
    rim.addColorStop(0, 'rgba(228,226,210,.16)');
    rim.addColorStop(0.45, 'rgba(228,226,210,.03)');
    rim.addColorStop(1, 'rgba(8,10,14,.26)');
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, CW, CH);
    ctx.restore();

    return j;
  }

  /* ------------------------------------------------------------------ *
   * Atlas plumbing
   * ------------------------------------------------------------------ */
  function Atlas(cols, rows, cw, ch) {
    this.cw = cw; this.ch = ch; this.cols = cols;
    this.cv = Z.canvas(cols * cw, rows * ch);
    this.ctx = this.cv.getContext('2d');
  }
  Atlas.prototype.cell = function (i) {
    return { x: (i % this.cols) * this.cw, y: Math.floor(i / this.cols) * this.ch };
  };
  Atlas.prototype.begin = function (i) {
    var c = this.cell(i);
    this.ctx.save();
    this.ctx.translate(c.x, c.y);
    this.ctx.beginPath();
    this.ctx.rect(0, 0, this.cw, this.ch);
    this.ctx.clip();
    return this.ctx;
  };
  Atlas.prototype.end = function () { this.ctx.restore(); };

  /* ------------------------------------------------------------------ *
   * Keyline
   *
   * The body is drawn into a scratch cell, that cell is smeared around a
   * small circle to grow a dark silhouette, and the two go into the atlas
   * outline-first. Stroking each limb instead would draw a line down every
   * internal seam - between the arm and the coat behind it - and the point
   * of a keyline is that it is the outside edge only.
   *
   * It is what makes a small figure hold together against busy ground, and
   * it costs nine drawImages once per frame at bake time, never per frame
   * at play time.
   * ------------------------------------------------------------------ */
  var outA = null, outB = null;

  function rrect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function scratch(w, h) {
    if (!outA || outA.width !== w || outA.height !== h) {
      outA = Z.canvas(w, h);
      outB = Z.canvas(w, h);
    }
    return [outA.getContext('2d'), outB.getContext('2d')];
  }

  /* dst is already translated and clipped to the cell */
  function withKeyline(dst, w, h, r, draw) {
    var cc = scratch(w, h);
    var a = cc[0], b = cc[1];
    a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, w, h);
    b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, w, h);

    a.save();
    draw(a);
    a.restore();

    /* eight taps round a circle grow the shape by r on every side */
    for (var i = 0; i < 8; i++) {
      var t = i / 8 * Z.TAU;
      b.drawImage(outA, Math.cos(t) * r, Math.sin(t) * r);
    }
    b.globalCompositeOperation = 'source-in';
    b.fillStyle = 'rgba(10,13,12,.92)';
    b.fillRect(0, 0, w, h);
    b.globalCompositeOperation = 'source-over';

    dst.drawImage(outB, 0, 0);
    dst.drawImage(outA, 0, 0);
  }

  var slots = {};
  var atlas = null;
  var grips = {};

  function key(anim, dir, f) { return anim + ':' + dir + ':' + f; }

  A.survivorReady = false;
  A.progress = 0;

  var bakeQueue = [];

  A.init = function () {
    var plan = [], i;
    Object.keys(A.ANIMS).forEach(function (nm) {
      var an = A.ANIMS[nm], dn = an.dirs || 5;
      for (var d = 0; d < dn; d++) {
        for (var f = 0; f < an.n; f++) plan.push([nm, d, f]);
      }
    });
    var cols = 16, rows = Math.ceil(plan.length / cols);
    atlas = new Atlas(cols, rows, CW, CH);
    for (i = 0; i < plan.length; i++) slots[key(plan[i][0], plan[i][1], plan[i][2])] = i;
    bakeQueue = plan;
    A.total = plan.length;
    A.done = 0;
    A.atlas = atlas;
  };

  A.bakeStep = function (budgetMs) {
    var t0 = performance.now();
    budgetMs = budgetMs || 8;
    while (A.done < bakeQueue.length) {
      var it = bakeQueue[A.done];
      bakeFrame(it[0], it[1], it[2]);
      A.done++;
      if (performance.now() - t0 > budgetMs) break;
    }
    A.progress = A.done / bakeQueue.length;
    if (A.done >= bakeQueue.length) { A.survivorReady = true; return true; }
    return false;
  };

  function bakeFrame(anim, dir, f) {
    var an = A.ANIMS[anim];
    var i = slots[key(anim, dir, f)];
    var ctx = atlas.begin(i);
    var yaw = DIR_YAW[dir];
    var p = pose(anim, f, an.n);
    withKeyline(ctx, CW, CH, 2.1, function (c) {
      drawBody(c, p, yaw, PAL, {});
    });
    if (p.grip) {
      var g = proj(rotY(p.grip, yaw));
      grips[i] = { x: g.x - FOOT_X, y: g.y - FOOT_Y, a: p.gripAng, behind: WPN_BEHIND[dir] };
    } else {
      grips[i] = null;
    }
    atlas.end();
  }

  A.frame = function (anim, dir8, f) {
    var m = DIR_MAP[dir8 & 7];
    var an = A.ANIMS[anim] || A.ANIMS.idle;
    var bd = m[0];
    if (an.dirs && bd >= an.dirs) bd = an.dirs - 1;
    var i = slots[key(anim, bd, Z.clamp(f | 0, 0, an.n - 1))];
    if (i == null || i >= A.done) return null;
    var c = atlas.cell(i);
    return { img: atlas.cv, sx: c.x, sy: c.y, sw: CW, sh: CH,
             ox: FOOT_X, oy: FOOT_Y, flip: m[1], grip: grips[i], ppm: PPM };
  };

  A.CW = CW; A.CH = CH; A.PPM = PPM;
  A.FOOT_X = FOOT_X; A.FOOT_Y = FOOT_Y;

  /* ------------------------------------------------------------------ *
   * Zombies
   * ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ *
   * Zombies
   *
   * These used to be the survivor's sheet with a colour washed over it.
   * Nine types, one body, one gait, nine tints - so a Brute was a man in
   * brown and an Abomination was the same man in red, and the only thing
   * that told them apart was the scale the renderer happened to draw
   * them at. You cannot learn to read a horde like that.
   *
   * Now each type is its own body: its own proportions, its own colours,
   * its own walk, and its own thing wrong with it. They bake to their
   * own sheets, so nothing is tinted at runtime either - which is both
   * cheaper and the reason they can differ at all.
   *
   * The budget for that is smaller than it looks. The old code kept nine
   * full tinted copies of one sheet alive for the life of the page; nine
   * real sheets is the same memory and less compositing.
   * ------------------------------------------------------------------ */

  /* the rot everything shares - flesh that has been out in the weather */
  function zpal(o) {
    var base = {
      jacket: [104, 104, 96], vest: [62, 62, 58], pants: [80, 80, 74],
      boot: [38, 37, 34], skin: [176, 178, 158], cap: [58, 54, 48],
      noCap: true, pack: null, strap: null, accent: [92, 92, 84],
      wound: [122, 46, 40], bone: [206, 200, 178]
    };
    for (var k in o) base[k] = o[k];
    return base;
  }

  var ZANIMS = A.ZANIMS = {
    walk:  { n: 6, loop: true,  fps: 7 },
    lunge: { n: 3, loop: false, fps: 11 },
    hit:   { n: 2, loop: false, fps: 14 },
    death: { n: 5, loop: false, fps: 9, dirs: 3 }
  };

  /* ---------------------------------------------------------------- *
   * Decorations: the part that is not a person any more.
   * ---------------------------------------------------------------- */
  function sac(ctx, at, rx, ry, col, lit) {
    var s = proj(at);
    var g = ctx.createRadialGradient(s.x - rx * 0.4, s.y - ry * 0.5, rx * 0.1,
                                     s.x, s.y, rx * 1.3);
    g.addColorStop(0, Z.rgb(Z.shade(col, 0.42)));
    g.addColorStop(0.6, Z.rgb(col));
    g.addColorStop(1, Z.rgb(Z.shade(col, -0.5)));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, rx, ry, 0, 0, Z.TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(8,10,9,.72)'; ctx.lineWidth = 1.2; ctx.stroke();
    if (lit) {
      ctx.fillStyle = lit;
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(s.x + i * rx * 0.42, s.y + ry * 0.12,
                    rx * 0.14, ry * 0.42, i * 0.3, 0, Z.TAU);
        ctx.fill();
      }
    }
    return s;
  }
  function ribs(ctx, j, pal, count) {
    var a = proj(j.chest), b = proj(j.hip);
    ctx.strokeStyle = Z.rgba(pal.bone, 0.5);
    ctx.lineWidth = 1.6;
    for (var i = 0; i < (count || 3); i++) {
      var t = 0.22 + i * 0.22;
      var y = a.y + (b.y - a.y) * t;
      var w = LIMB.chest * (0.72 - i * 0.1);
      ctx.beginPath();
      ctx.moveTo(a.x - w, y - 2);
      ctx.quadraticCurveTo(a.x, y + 2.4, a.x + w, y - 2);
      ctx.stroke();
    }
  }
  function maw(ctx, j, pal, back, big) {
    if (back) return;
    var h = proj(j.head);
    ctx.fillStyle = 'rgba(14,10,10,.88)';
    ctx.beginPath();
    ctx.ellipse(h.x, h.y + LIMB.headY * (big ? 0.26 : 0.30),
                LIMB.headX * (big ? 0.62 : 0.4),
                LIMB.headY * (big ? 0.52 : 0.26), 0, 0, Z.TAU);
    ctx.fill();
    ctx.strokeStyle = Z.rgba(pal.bone, 0.55); ctx.lineWidth = 1.1;
    ctx.stroke();
    /* teeth */
    ctx.fillStyle = Z.rgba(pal.bone, 0.8);
    var tw = LIMB.headX * (big ? 0.62 : 0.4);
    for (var i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(h.x + i * tw * 0.36, h.y + LIMB.headY * (big ? -0.2 : 0.16));
      ctx.lineTo(h.x + i * tw * 0.36 + 1.6, h.y + LIMB.headY * (big ? 0.06 : 0.3));
      ctx.lineTo(h.x + i * tw * 0.36 - 1.6, h.y + LIMB.headY * (big ? 0.06 : 0.3));
      ctx.closePath(); ctx.fill();
    }
  }
  function stain(ctx, j, pal, down) {
    var a = proj(j.chest);
    ctx.fillStyle = Z.rgba(pal.wound, 0.34);
    ctx.beginPath();
    ctx.ellipse(a.x - LIMB.chest * 0.2, a.y + LIMB.chest * (down || 0.5),
                LIMB.chest * 0.5, LIMB.chest * 0.75, 0.2, 0, Z.TAU);
    ctx.fill();
  }

  /* A slab of something bolted, strapped or grown across a body. Used
     by both heavies, which is most of what makes them read as armoured
     rather than merely large. */
  function plate(ctx, at, w, h, col, tilt) {
    var s = proj(at);
    var g = ctx.createLinearGradient(s.x - w, s.y, s.x + w, s.y);
    g.addColorStop(0, Z.rgb(Z.shade(col, 0.24)));
    g.addColorStop(0.45, Z.rgb(col));
    g.addColorStop(1, Z.rgb(Z.shade(col, -0.38)));
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(tilt || 0);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w, -h * 0.82);
    ctx.lineTo(w, -h);
    ctx.lineTo(w * 0.86, h);
    ctx.lineTo(-w * 0.92, h * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,250,236,.16)';
    ctx.fillRect(-w, -h * 0.82, w * 2, Math.max(1.4, h * 0.14));
    ctx.strokeStyle = 'rgba(8,10,9,.78)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(176,182,188,.5)';
    for (var i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(i * w * 0.55, -h * 0.3, Math.max(1.1, w * 0.07), 0, Z.TAU);
      ctx.fill();
    }
    ctx.restore();
    return s;
  }

  var ZDECO = {
    /* a coat gone to rags and whatever opened the chest */
    shambler: function (ctx, j, yaw, pal, back) {
      stain(ctx, j, pal, 0.55);
      if (back) return;
      var c = proj(j.chest);
      ctx.strokeStyle = 'rgba(16,18,14,.55)'; ctx.lineWidth = 1.4;
      for (var i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(c.x - LIMB.chest * 0.5 + i * LIMB.chest * 0.42, c.y + 2);
        ctx.lineTo(c.x - LIMB.chest * 0.3 + i * LIMB.chest * 0.42, c.y + LIMB.chest * 1.3);
        ctx.stroke();
      }
    },
    /* stripped to the ribs, and running on them */
    runner: function (ctx, j, yaw, pal, back) {
      if (!back) { ribs(ctx, j, pal, 4); maw(ctx, j, pal, back, false); }
      stain(ctx, j, pal, 0.2);
    },
    /* the throat it spits with */
    spitter: function (ctx, j, yaw, pal, back) {
      var at = [j.neck[0], j.neck[1] + (back ? -0.04 : 0.10), j.neck[2] - 0.10];
      sac(ctx, at, LIMB.headX * 0.72, LIMB.headY * 0.56,
          [110, 138, 84], 'rgba(184,214,110,.38)');
      if (!back) maw(ctx, j, pal, back, false);
    },
    /* Down on its hands. The head is turned up to look at you, which is
       the detail that makes a low silhouette read as hunting rather than
       as something merely bent over. */
    crawler: function (ctx, j, yaw, pal, back) {
      stain(ctx, j, pal, 0.42);
      if (back) return;
      ribs(ctx, j, pal, 5);
      maw(ctx, j, pal, back, true);
      /* splayed fingers taking the weight */
      [j.hdL, j.hdR].forEach(function (h) {
        var q = proj(h);
        ctx.strokeStyle = 'rgba(22,24,18,.6)'; ctx.lineWidth = 1.2;
        for (var f = -1; f <= 1; f++) {
          ctx.beginPath();
          ctx.moveTo(q.x, q.y);
          ctx.lineTo(q.x + f * LIMB.hand * 0.8, q.y + LIMB.hand * 1.1);
          ctx.stroke();
        }
      });
    },

    /* Everything is in the legs. Knotted thighs, and a spine that is
       already wound up even when it is walking. */
    leaper: function (ctx, j, yaw, pal, back) {
      stain(ctx, j, pal, 0.3);
      if (back) {
        /* the vertebrae that do the work, seen from behind */
        var c0 = proj(j.chest), w0 = proj(j.hip);
        ctx.fillStyle = 'rgba(220,214,186,.42)';
        for (var v = 0; v < 5; v++) {
          var t = v / 4;
          ctx.beginPath();
          ctx.ellipse(c0.x + (w0.x - c0.x) * t, c0.y + (w0.y - c0.y) * t,
                      LIMB.chest * 0.16, LIMB.chest * 0.1, 0, 0, Z.TAU);
          ctx.fill();
        }
        return;
      }
      maw(ctx, j, pal, back, false);
      /* sinew down the thighs */
      [j.knL, j.knR].forEach(function (k) {
        var q = proj(k);
        ctx.strokeStyle = 'rgba(196,182,150,.34)'; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(q.x - LIMB.thighA * 0.3, q.y - LIMB.thighA * 1.1);
        ctx.lineTo(q.x + LIMB.thighA * 0.2, q.y);
        ctx.stroke();
      });
    },

    /* Built to move earth: the hands are the whole animal. */
    burrower: function (ctx, j, yaw, pal, back) {
      stain(ctx, j, pal, 0.5);
      [j.hdL, j.hdR].forEach(function (h, i) {
        var q = proj(h);
        /* three heavy claws a side, dark at the root and pale at the tip */
        for (var cN = -1; cN <= 1; cN++) {
          var len = LIMB.hand * (2.4 - Math.abs(cN) * 0.5);
          var g = ctx.createLinearGradient(q.x, q.y, q.x + cN * LIMB.hand,
                                           q.y + len);
          g.addColorStop(0, 'rgba(44,38,26,.9)');
          g.addColorStop(1, 'rgba(214,206,178,.95)');
          ctx.strokeStyle = g;
          ctx.lineWidth = LIMB.hand * 0.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(q.x, q.y);
          ctx.quadraticCurveTo(q.x + cN * LIMB.hand * 0.7, q.y + len * 0.6,
                               q.x + cN * LIMB.hand * 0.9, q.y + len);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      });
      if (back) return;
      /* soil packed into everything */
      var c = proj(j.chest);
      ctx.fillStyle = 'rgba(78,62,38,.5)';
      for (var d = 0; d < 6; d++) {
        ctx.beginPath();
        ctx.ellipse(c.x + (Z.hash1(d * 3, 11) - 0.5) * LIMB.chest * 1.6,
                    c.y + Z.hash1(d * 5, 13) * LIMB.chest * 1.4,
                    LIMB.chest * 0.16, LIMB.chest * 0.11, 0, 0, Z.TAU);
        ctx.fill();
      }
    },

    /* The one that is still thinking. Hooded, hollow, and holding
       something up that the others are answering. */
    summoner: function (ctx, j, yaw, pal, back) {
      var h = proj(j.head);
      /* the hood, drawn over whatever head is under it */
      ctx.fillStyle = 'rgba(46,34,58,.95)';
      ctx.beginPath();
      ctx.ellipse(h.x, h.y - LIMB.headY * 0.1, LIMB.headX * 1.25,
                  LIMB.headY * 1.3, 0, 0, Z.TAU);
      ctx.fill();
      if (!back) {
        /* nothing inside it but two lights */
        ctx.fillStyle = 'rgba(10,6,14,.92)';
        ctx.beginPath();
        ctx.ellipse(h.x, h.y + LIMB.headY * 0.16, LIMB.headX * 0.82,
                    LIMB.headY * 0.86, 0, 0, Z.TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(206,150,255,.9)';
        [-1, 1].forEach(function (sx) {
          ctx.beginPath();
          ctx.ellipse(h.x + sx * LIMB.headX * 0.3, h.y + LIMB.headY * 0.16,
                      LIMB.headX * 0.16, LIMB.headY * 0.14, 0, 0, Z.TAU);
          ctx.fill();
        });
      }
      /* the robe, hanging past the knees so the legs barely show */
      var c = proj(j.chest), w = proj(j.hip);
      ctx.fillStyle = 'rgba(58,42,72,.9)';
      ctx.beginPath();
      ctx.moveTo(c.x - LIMB.chest * 0.85, c.y);
      ctx.quadraticCurveTo(w.x - LIMB.waist * 1.5, w.y + LIMB.waist * 1.8,
                           w.x - LIMB.waist * 1.1, w.y + LIMB.waist * 3.4);
      ctx.lineTo(w.x + LIMB.waist * 1.1, w.y + LIMB.waist * 3.4);
      ctx.quadraticCurveTo(w.x + LIMB.waist * 1.5, w.y + LIMB.waist * 1.8,
                           c.x + LIMB.chest * 0.85, c.y);
      ctx.closePath(); ctx.fill();
      stain(ctx, j, pal, 0.3);
    },

    /* plate and bone across a body that stopped being shaped like one */
    brute: function (ctx, j, yaw, pal, back) {
      /* bone pushing through the shoulders, not pauldrons */
      [j.shL, j.shR].forEach(function (sh, i) {
        var s = proj(sh);
        ctx.fillStyle = Z.rgb(Z.shade(pal.bone, -0.4));
        ctx.beginPath();
        ctx.ellipse(s.x + (i ? 2 : -2), s.y - 2, LIMB.shoulder * 0.3,
                    LIMB.shoulder * 0.19, i ? 0.4 : -0.4, 0, Z.TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(8,10,9,.7)'; ctx.lineWidth = 1.1; ctx.stroke();
        /* three spurs along it */
        ctx.fillStyle = Z.rgb(Z.shade(pal.bone, -0.12));
        for (var k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(s.x + k * LIMB.shoulder * 0.18 - 1.6, s.y - 3);
          ctx.lineTo(s.x + k * LIMB.shoulder * 0.18, s.y - 3 - LIMB.shoulder * 0.24);
          ctx.lineTo(s.x + k * LIMB.shoulder * 0.18 + 1.6, s.y - 3);
          ctx.closePath(); ctx.fill();
        }
      });
      if (!back) { stain(ctx, j, pal, 0.4); maw(ctx, j, pal, back, false); }
    },
    /* head back, jaw unhinged, ribs showing through */
    screamer: function (ctx, j, yaw, pal, back) {
      if (back) return;
      maw(ctx, j, pal, back, true);
      ribs(ctx, j, pal, 4);
      var h = proj(j.head);
      /* the sound coming out of it, as rings rather than a glow */
      ctx.strokeStyle = 'rgba(204,186,194,.22)';
      for (var r = 1; r <= 2; r++) {
        ctx.lineWidth = 2.6 - r * 0.8;
        ctx.beginPath();
        ctx.arc(h.x, h.y + LIMB.headY * 0.2, LIMB.headX * (1.1 + r * 0.7),
                -0.9, 0.9);
        ctx.stroke();
      }
    },
    /* small and mean; nothing to add but the teeth */
    swarm: function (ctx, j, yaw, pal, back) {
      if (!back) maw(ctx, j, pal, back, false);
    },
    /* the belly, and what is coming out of it */
    exploder: function (ctx, j, yaw, pal, back) {
      var at = [j.hip[0], j.hip[1] + (back ? -0.06 : 0.11), j.hip[2] + 0.19];
      sac(ctx, at, LIMB.waist * 1.06, LIMB.waist * 0.98,
          [118, 128, 62], 'rgba(198,212,104,.42)');
      if (back) return;
      var s = proj(at);
      ctx.strokeStyle = 'rgba(190,206,96,.45)'; ctx.lineWidth = 1.3;
      for (var i = 0; i < 3; i++) {
        var a2 = -0.8 + i * 0.8;
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(a2) * LIMB.waist * 0.36,
                   s.y + Math.sin(a2) * LIMB.waist * 0.3);
        ctx.lineTo(s.x + Math.cos(a2) * LIMB.waist * 0.9,
                   s.y + Math.sin(a2) * LIMB.waist * 0.74);
        ctx.stroke();
      }
      maw(ctx, j, pal, back, false);
    },
    /* a hood, and nothing under it you want to see */
    stalker: function (ctx, j, yaw, pal, back) {
      var h = proj(j.head);
      ctx.fillStyle = Z.rgb(Z.shade(pal.jacket, -0.34));
      ctx.beginPath();
      ctx.ellipse(h.x, h.y - LIMB.headY * 0.18, LIMB.headX * 1.26,
                  LIMB.headY * 1.14, 0, Math.PI, Z.TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(h.x - LIMB.headX * 1.26, h.y - LIMB.headY * 0.18);
      ctx.quadraticCurveTo(h.x, h.y + LIMB.headY * 0.5,
                           h.x + LIMB.headX * 1.26, h.y - LIMB.headY * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,10,9,.72)'; ctx.lineWidth = 1.2; ctx.stroke();
      if (back) return;
      /* two lights in the dark of it */
      ctx.fillStyle = 'rgba(210,228,236,.8)';
      ctx.beginPath();
      ctx.ellipse(h.x - LIMB.headX * 0.34, h.y + 1, 1.9, 1.3, 0, 0, Z.TAU);
      ctx.ellipse(h.x + LIMB.headX * 0.34, h.y + 1, 1.9, 1.3, 0, 0, Z.TAU);
      ctx.fill();
    },
    /* A hulk is several people that did not finish separating. The
       shoulders carry the extra: two more heads' worth of mass, one of
       them still recognisable, and the whole thing hangs forward off a
       spine that gave up holding it upright. */
    hulk: function (ctx, j, yaw, pal, back) {
      /* the growths across the back and shoulders */
      sac(ctx, [j.shL[0] - 0.05, j.shL[1] - 0.06, j.shL[2] + 0.04],
          LIMB.headX * 0.62, LIMB.headY * 0.52, [104, 92, 64], null);
      sac(ctx, [j.shR[0] + 0.07, j.shR[1] - 0.05, j.shR[2] + 0.09],
          LIMB.headX * 0.46, LIMB.headY * 0.4, [96, 86, 60], null);
      if (back) return;
      /* the second face, small and sunk into the chest */
      var c = proj([j.chest[0] + 0.1, j.chest[1] + 0.1, j.chest[2] + 0.04]);
      ctx.fillStyle = Z.rgb(Z.shade(pal.skin, -0.2));
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, LIMB.headX * 0.4, LIMB.headY * 0.36, 0.2, 0, Z.TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,10,9,.7)'; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.fillStyle = 'rgba(14,10,10,.82)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + LIMB.headY * 0.12, LIMB.headX * 0.22,
                  LIMB.headY * 0.13, 0, 0, Z.TAU);
      ctx.fill();
      stain(ctx, j, pal, 0.85);
      maw(ctx, j, pal, back, true);
      /* split skin over the ribs, where it could not stretch any further */
      ctx.strokeStyle = Z.rgba(pal.wound, 0.5);
      ctx.lineWidth = 2;
      for (var i = 0; i < 3; i++) {
        var y = proj(j.chest).y + i * LIMB.chest * 0.42;
        ctx.beginPath();
        ctx.moveTo(proj(j.chest).x - LIMB.chest * 0.6, y);
        ctx.quadraticCurveTo(proj(j.chest).x, y + 3, proj(j.chest).x + LIMB.chest * 0.55, y - 1);
        ctx.stroke();
      }
    },

    /* A warden went down in its kit and got back up in it. Riot helmet,
       a chest plate strapped over the front, pads on the shoulders -
       every one of them dented, and none of it coming off. */
    warden: function (ctx, j, yaw, pal, back) {
      /* shoulder pads */
      plate(ctx, [j.shL[0] - 0.04, j.shL[1], j.shL[2] + 0.04],
            LIMB.shoulder * 0.42, LIMB.shoulder * 0.3, [92, 98, 106], -0.32);
      plate(ctx, [j.shR[0] + 0.04, j.shR[1], j.shR[2] + 0.04],
            LIMB.shoulder * 0.42, LIMB.shoulder * 0.3, [92, 98, 106], 0.32);
      /* the chest plate */
      plate(ctx, [j.chest[0], j.chest[1] + (back ? -0.08 : 0.09), j.chest[2] - 0.02],
            LIMB.chest * 0.82, LIMB.chest * 0.86, [78, 86, 94], 0);
      /* the helmet, over the whole skull, with a visor across the front */
      var h = proj(j.head);
      var hg = ctx.createLinearGradient(h.x - LIMB.headX, h.y - LIMB.headY,
                                        h.x + LIMB.headX, h.y + LIMB.headY);
      hg.addColorStop(0, 'rgb(122,130,138)');
      hg.addColorStop(0.5, 'rgb(84,92,100)');
      hg.addColorStop(1, 'rgb(48,54,60)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.ellipse(h.x, h.y - LIMB.headY * 0.12, LIMB.headX * 1.2,
                  LIMB.headY * 1.12, 0, 0, Z.TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,10,9,.8)'; ctx.lineWidth = 1.3; ctx.stroke();
      if (!back) {
        /* the visor - cracked, and nothing behind it catching the light */
        ctx.fillStyle = 'rgba(18,24,28,.92)';
        ctx.beginPath();
        ctx.ellipse(h.x, h.y + LIMB.headY * 0.16, LIMB.headX * 0.94,
                    LIMB.headY * 0.44, 0, 0, Z.TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(186,194,200,.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(h.x - LIMB.headX * 0.7, h.y + LIMB.headY * 0.02);
        ctx.lineTo(h.x - LIMB.headX * 0.1, h.y + LIMB.headY * 0.34);
        ctx.lineTo(h.x + LIMB.headX * 0.5, h.y + LIMB.headY * 0.06);
        ctx.stroke();
        /* one point of light where an eye should be */
        ctx.fillStyle = 'rgba(214,120,72,.8)';
        ctx.beginPath();
        ctx.arc(h.x + LIMB.headX * 0.22, h.y + LIMB.headY * 0.16, 1.7, 0, Z.TAU);
        ctx.fill();
      }
      /* a strap down the side of the plate */
      ctx.fillStyle = 'rgba(38,36,32,.8)';
      var cc = proj(j.chest);
      ctx.fillRect(cc.x - LIMB.chest * 0.9, cc.y - LIMB.chest * 0.1,
                   LIMB.chest * 1.8, Math.max(1.6, LIMB.chest * 0.12));
    },

    /* several things that used to be people */
    boss: function (ctx, j, yaw, pal, back) {
      /* a second growth off the shoulder - a head that never finished */
      sac(ctx, [j.shR[0] + 0.14, j.shR[1] - 0.03, j.shR[2] + 0.07],
          LIMB.headX * 0.54, LIMB.headY * 0.46, [124, 74, 64], null);
      /* A strap of plate across one side of the chest, bolted through.
         A slab over the whole torso reads as a signboard and hides every
         bit of the anatomy that makes the thing frightening. */
      var c = proj(j.chest);
      var gp = ctx.createLinearGradient(c.x - LIMB.chest, c.y, c.x + LIMB.chest, c.y);
      gp.addColorStop(0, 'rgb(104,106,108)');
      gp.addColorStop(0.45, 'rgb(80,82,84)');
      gp.addColorStop(1, 'rgb(54,56,58)');
      ctx.fillStyle = gp;
      ctx.beginPath();
      ctx.moveTo(c.x - LIMB.chest * 0.72, c.y - LIMB.chest * 0.06);
      ctx.lineTo(c.x + LIMB.chest * 0.28, c.y - LIMB.chest * 0.3);
      ctx.lineTo(c.x + LIMB.chest * 0.4, c.y + LIMB.chest * 0.52);
      ctx.lineTo(c.x - LIMB.chest * 0.62, c.y + LIMB.chest * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,250,236,.14)';
      ctx.fillRect(c.x - LIMB.chest * 0.72, c.y - LIMB.chest * 0.08,
                   LIMB.chest * 1.0, 2.2);
      ctx.strokeStyle = 'rgba(8,10,9,.78)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = 'rgba(176,182,188,.55)';
      [-0.5, -0.05, 0.28].forEach(function (f) {
        ctx.beginPath();
        ctx.arc(c.x + LIMB.chest * f, c.y + LIMB.chest * 0.16, 1.5, 0, Z.TAU);
        ctx.fill();
      });
      if (!back) { stain(ctx, j, pal, 0.9); maw(ctx, j, pal, back, true); }
    }
  };

  /* ---------------------------------------------------------------- *
   * The nine bodies.
   *
   * `limb` multiplies the standard proportions, `gait` changes how it
   * moves, `pal` is what it is made of, `deco` is what is wrong with it.
   * ---------------------------------------------------------------- */
  var ZBUILD = {
    shambler: {
      limb: { chest: 0.94, waist: 0.96, shoulder: 0.98, armA: 0.92, armB: 0.92,
              foreA: 0.9, foreB: 0.9, thighA: 0.94, calfA: 0.9, headX: 0.98 },
      gait: { tall: 1.0, hunch: 0.10, stride: 1.0, limp: 0.55, armHang: 0.1, lean: 0.15 },
      pal: zpal({ jacket: [98, 104, 84], vest: [58, 62, 52], pants: [74, 76, 66],
                  skin: [156, 168, 140] }),
      deco: ZDECO.shambler
    },
    runner: {
      limb: { chest: 0.8, waist: 0.78, shoulder: 0.86, armA: 0.74, armB: 0.72,
              foreA: 0.7, foreB: 0.68, thighA: 0.82, thighB: 0.78,
              calfA: 0.74, calfB: 0.7, headX: 0.9, headY: 0.92 },
      gait: { tall: 1.06, hunch: 0.2, stride: 1.26, limp: 0.05, armHang: 0.24,
              lean: 0.3, bob: 1.4 },
      pal: zpal({ jacket: [120, 128, 74], vest: [72, 78, 46], pants: [86, 88, 58],
                  skin: [182, 188, 146] }),
      deco: ZDECO.runner
    },
    spitter: {
      limb: { chest: 1.06, waist: 1.1, shoulder: 0.92, armA: 0.8, armB: 0.78,
              foreA: 0.76, foreB: 0.74, neck: 1.5, neckTop: 1.6,
              thighA: 0.96, headX: 0.94, headY: 0.9 },
      gait: { tall: 0.94, hunch: 0.26, drop: 0.06, stride: 0.8, limp: 0.3,
              armHang: 0.18, lean: 0.24 },
      pal: zpal({ jacket: [84, 116, 92], vest: [48, 70, 56], pants: [66, 88, 70],
                  skin: [150, 178, 142] }),
      deco: ZDECO.spitter
    },
    /* On all fours: long arms, folded legs, and a body that sits at
       knee height. Nothing else out there has this outline. */
    crawler: {
      limb: { chest: 0.92, waist: 0.84, shoulder: 1.04, armA: 1.22, armB: 1.18,
              foreA: 1.3, foreB: 1.26, hand: 1.2,
              thighA: 0.72, thighB: 0.7, calfA: 0.66, calfB: 0.64,
              footA: 0.9, footB: 0.88, headX: 1.0, headY: 0.94, neck: 1.3 },
      gait: { tall: 0.86, quad: 1.0, hunch: 0.16, stride: 1.28, limp: 0.18,
              lean: 0.30, bob: 1.5, sway: 0.1 },
      pal: zpal({ jacket: [96, 106, 66], vest: [56, 64, 40], pants: [72, 78, 52],
                  skin: [168, 176, 132] }),
      deco: ZDECO.crawler
    },
    /* Coiled. Short body, enormous legs, always half-crouched. */
    leaper: {
      limb: { chest: 0.96, waist: 0.9, shoulder: 1.0, armA: 0.88, armB: 0.86,
              foreA: 0.9, foreB: 0.88,
              thighA: 1.34, thighB: 1.3, calfA: 1.4, calfB: 1.36,
              footA: 1.24, footB: 1.2, headX: 0.88, headY: 0.86 },
      gait: { tall: 0.84, hunch: 0.46, drop: 0.16, stride: 1.12, limp: 0.1,
              armHang: 0.4, lean: 0.44, bob: 1.5 },
      pal: zpal({ jacket: [74, 102, 80], vest: [42, 62, 48], pants: [58, 82, 64],
                  skin: [150, 176, 148] }),
      deco: ZDECO.leaper
    },
    /* All shoulder and hand. The head is nearly an afterthought. */
    burrower: {
      limb: { chest: 1.22, waist: 1.1, shoulder: 1.38, armA: 1.3, armB: 1.26,
              foreA: 1.36, foreB: 1.32, hand: 1.9,
              thighA: 0.9, thighB: 0.88, calfA: 0.84, calfB: 0.82,
              headX: 0.7, headY: 0.68, neck: 0.6 },
      gait: { tall: 0.8, hunch: 0.6, drop: 0.14, stride: 0.86, limp: 0.45,
              armHang: 0.56, lean: 0.4, sway: 0.08 },
      pal: zpal({ jacket: [104, 88, 58], vest: [64, 54, 36], pants: [80, 68, 46],
                  skin: [158, 142, 108] }),
      deco: ZDECO.burrower
    },
    /* Tall, thin and upright - the only one that has not given up its
       posture, which is what makes it read as the one in charge. */
    summoner: {
      limb: { chest: 0.82, waist: 0.78, shoulder: 0.9, armA: 1.16, armB: 1.12,
              foreA: 1.24, foreB: 1.2, hand: 1.1,
              thighA: 0.88, thighB: 0.86, calfA: 0.92, calfB: 0.9,
              headX: 0.9, headY: 0.92, neck: 1.5, neckTop: 1.4 },
      gait: { tall: 1.16, hunch: 0.04, stride: 0.66, limp: 0.05, armHang: 0.5,
              lean: 0.06, sway: 0.12 },
      pal: zpal({ jacket: [76, 56, 92], vest: [48, 34, 60], pants: [58, 44, 72],
                  skin: [166, 150, 184] }),
      deco: ZDECO.summoner
    },
    brute: {
      limb: { chest: 1.46, waist: 1.36, shoulder: 1.52, vestA: 1.4, vestB: 1.44,
              armA: 1.5, armB: 1.44, foreA: 1.5, foreB: 1.4, hand: 1.5,
              thighA: 1.28, thighB: 1.2, calfA: 1.2, calfB: 1.14,
              footA: 1.2, footB: 1.16, headX: 0.76, headY: 0.74, neck: 1.3 },
      gait: { tall: 0.96, hunch: 0.2, drop: 0.09, stride: 0.72, limp: 0.9,
              armHang: 0.34, lean: 0.2, sway: 0.05 },
      pal: zpal({ jacket: [116, 92, 70], vest: [74, 58, 44], pants: [88, 70, 54],
                  skin: [168, 146, 118] }),
      deco: ZDECO.brute
    },
    screamer: {
      limb: { chest: 0.84, waist: 0.8, shoulder: 0.9, armA: 0.72, armB: 0.7,
              foreA: 0.68, foreB: 0.66, thighA: 0.84, calfA: 0.8,
              headX: 1.1, headY: 1.14, neck: 1.35, neckTop: 1.3 },
      gait: { tall: 1.08, hunch: -0.12, drop: -0.08, stride: 0.95, limp: 0.2,
              armHang: 0.3, lean: -0.08 },
      pal: zpal({ jacket: [108, 84, 96], vest: [68, 50, 60], pants: [82, 64, 74],
                  skin: [178, 158, 164] }),
      deco: ZDECO.screamer
    },
    swarm: {
      limb: { chest: 0.72, waist: 0.7, shoulder: 0.74, armA: 0.66, armB: 0.64,
              foreA: 0.62, foreB: 0.6, thighA: 0.7, calfA: 0.66,
              headX: 1.04, headY: 1.02 },
      gait: { tall: 0.78, hunch: 0.3, stride: 1.18, limp: 0.1, armHang: 0.3,
              lean: 0.34, bob: 1.6 },
      pal: zpal({ jacket: [110, 128, 72], vest: [66, 78, 44], pants: [78, 90, 54],
                  skin: [168, 180, 138] }),
      deco: ZDECO.swarm
    },
    exploder: {
      limb: { chest: 1.24, waist: 1.5, vestA: 1.4, vestB: 1.5,
              armA: 0.78, armB: 0.74, foreA: 0.72, foreB: 0.7,
              thighA: 0.9, calfA: 0.8, headX: 0.88, headY: 0.86 },
      gait: { tall: 0.9, hunch: 0.16, stride: 0.86, limp: 0.45, armHang: 0.3,
              lean: 0.1, sway: 0.06 },
      pal: zpal({ jacket: [140, 148, 80], vest: [92, 98, 50], pants: [104, 110, 60],
                  skin: [186, 192, 132] }),
      deco: ZDECO.exploder
    },
    stalker: {
      limb: { chest: 0.86, waist: 0.82, shoulder: 0.92, armA: 0.78, armB: 0.74,
              foreA: 0.76, foreB: 0.7, hand: 1.2,
              thighA: 0.86, calfA: 0.84, headX: 0.92, headY: 0.94 },
      gait: { tall: 1.1, hunch: 0.3, drop: 0.08, stride: 1.12, limp: 0.08,
              armHang: 0.46, lean: 0.26 },
      pal: zpal({ jacket: [62, 76, 94], vest: [40, 50, 62], pants: [52, 62, 76],
                  skin: [138, 152, 166] }),
      deco: ZDECO.stalker
    },
    /* A hulk is wrong in its proportions, not just its size: a torso
       that outgrew everything attached to it, arms it drags, a head
       pushed down between the shoulders, and legs far too short for the
       weight above them. Nothing here is the survivor's rig scaled up. */
    hulk: {
      /* Wide, but not wider than the cell it bakes into. The first pass
         at this ran off both sides of a 104px tile and came back with
         its shoulders sliced off - the world scale is what makes a hulk
         big, so the build only has to make it the wrong SHAPE. */
      limb: { chest: 1.62, waist: 1.56, shoulder: 1.74, vestA: 1.54, vestB: 1.6,
              armA: 1.6, armB: 1.4, foreA: 1.62, foreB: 1.44, hand: 1.72,
              thighA: 1.32, thighB: 1.2, calfA: 1.2, calfB: 1.14,
              footA: 1.3, footB: 1.26, headX: 0.7, headY: 0.66, neck: 1.7,
              neckTop: 1.6 },
      gait: { tall: 0.9, hunch: 0.34, drop: 0.14, stride: 0.56, limp: 0.95,
              armHang: 0.52, lean: 0.24, sway: 0.09, bob: 0.6 },
      pal: zpal({ jacket: [116, 100, 70], vest: [74, 64, 44], pants: [88, 78, 54],
                  skin: [150, 136, 100], bone: [198, 186, 152] }),
      deco: ZDECO.hulk
    },

    /* A warden is a normal frame under a great deal of kit, so its
       proportions stay human and the armour does the widening. That
       difference is the point: a hulk is a body that went wrong, a
       warden is a body that was already protected when it died. */
    warden: {
      limb: { chest: 1.34, waist: 1.24, shoulder: 1.5, vestA: 1.36, vestB: 1.42,
              armA: 1.3, armB: 1.22, foreA: 1.28, foreB: 1.2, hand: 1.24,
              thighA: 1.26, thighB: 1.2, calfA: 1.24, calfB: 1.18,
              footA: 1.3, footB: 1.26, headX: 0.96, headY: 0.94, neck: 1.2 },
      gait: { tall: 1.02, hunch: 0.12, drop: 0.03, stride: 0.74, limp: 0.35,
              armHang: 0.22, lean: 0.14, sway: 0.03, bob: 0.7 },
      pal: zpal({ jacket: [76, 84, 92], vest: [48, 54, 62], pants: [60, 66, 74],
                  boot: [30, 32, 36], skin: [150, 158, 164],
                  bone: [196, 202, 208] }),
      deco: ZDECO.warden
    },

    boss: {
      limb: { chest: 1.6, waist: 1.5, shoulder: 1.7, vestA: 1.5, vestB: 1.56,
              armA: 1.66, armB: 1.5, foreA: 1.62, foreB: 1.46, hand: 1.7,
              thighA: 1.4, thighB: 1.3, calfA: 1.3, calfB: 1.24,
              footA: 1.3, footB: 1.26, headX: 0.86, headY: 0.82, neck: 1.5 },
      gait: { tall: 1.0, hunch: 0.24, drop: 0.1, stride: 0.66, limp: 0.8,
              armHang: 0.4, lean: 0.22, sway: 0.07 },
      pal: zpal({ jacket: [128, 74, 64], vest: [82, 46, 40], pants: [96, 58, 50],
                  skin: [174, 132, 118] }),
      deco: ZDECO.boss
    }
  };
  A.ZBUILD = ZBUILD;

  var zAtlas = null, zSlots = {}, zPlan = [], zDone = 0;
  var zSheets = {};          /* typeId -> its own atlas */
  var zReady = {};           /* typeId -> that sheet is finished */
  A.zombieReady = false;

  function zPose(anim, f, n, b) {
    var g = (b && b.gait) || {};
    var stride = g.stride == null ? 1 : g.stride;
    var limp = g.limp == null ? 0.55 : g.limp;
    var p = basePose();
    var k = n > 1 ? f / n : 0;
    var loopK = k * Z.TAU;

    if (anim === 'walk') {
      var s = Math.sin(loopK), c = Math.cos(loopK);
      /* One leg drags, and how much is what tells a runner from a brute.

         The lead leg carries the stride and the trailing one carries a
         fraction of it - which is the limp. Multiplying BOTH by the full
         stride, as a first pass did, does not produce a longer walk: it
         produces the splits, because the two legs are then swinging the
         same distance in opposite directions at once. */
      var lead = 0.30 * stride, drag = 0.15 * stride * (1 - limp * 0.6);
      p.knL = v(-0.14, 0.02 + s * lead, 0.43 + Math.max(0, s) * 0.04);
      p.knR = v(0.14, 0.02 - s * drag, 0.42);
      p.ftL = v(-0.15, 0.04 + s * lead * 1.8, 0.05 + Math.max(0, s) * 0.10 * stride);
      p.ftR = v(0.15, 0.02 - s * drag * 1.75, 0.04);
      var bob = Math.abs(c) * 0.026 * (g.bob == null ? 1 : g.bob);
      ['hip', 'chest', 'neck', 'head', 'shL', 'shR', 'hpL', 'hpR'].forEach(function (jn) {
        p[jn][2] += bob;
      });
      if (g.sway) { p.chest[0] += s * g.sway; p.head[0] += s * g.sway * 0.7; }
      p.elR = v(0.31, 0.26, 1.16 + s * 0.03);
      p.hdR = v(0.29, 0.51, 1.06 + s * 0.05);
      p.elL = v(-0.30, 0.16, 1.08 - s * 0.04);
      p.hdL = v(-0.31, 0.39, 0.92 - s * 0.06);
      p.lean = 0.15;

    } else if (anim === 'lunge') {
      var lg = [0.15, 1, 0.5][f] || 0;
      p.elR = v(0.31, 0.20 + lg * 0.22, 1.20 + lg * 0.10);
      p.hdR = v(0.25, 0.53 + lg * 0.30, 1.14 + lg * 0.16);
      p.elL = v(-0.31, 0.20 + lg * 0.22, 1.18 + lg * 0.10);
      p.hdL = v(-0.25, 0.53 + lg * 0.30, 1.12 + lg * 0.16);
      ['hip', 'chest', 'neck', 'head'].forEach(function (jn) { p[jn][1] += lg * 0.12; });
      p.knL[1] += lg * 0.10; p.ftL[1] += lg * 0.18;
      p.lean = 0.25 + lg * 0.16;

    } else if (anim === 'hit') {
      var h = f === 0 ? 1 : 0.4;
      ['hip', 'chest', 'neck', 'head'].forEach(function (jn) { p[jn][1] += h * 0.09; });
      p.elR = v(0.33, 0.12, 1.22); p.hdR = v(0.31, 0.30, 1.22);
      p.elL = v(-0.33, 0.12, 1.20); p.hdL = v(-0.31, 0.30, 1.20);
      p.lean = -0.17 * h;

    } else if (anim === 'death') {
      var t = f / (n - 1), fall = Z.smooth(Z.clamp01(t * 1.2)), sink = fall * 0.88;
      var B = baseZ(p);
      p.hip = v(0, fall * 0.26, sunk(B.hip, sink));
      p.chest = v(0, fall * 0.50, sunk(B.chest, sink * 1.32));
      p.neck = v(0, fall * 0.62, sunk(B.neck, sink * 1.52));
      p.head = v(0.04, fall * 0.74, sunk(B.head, sink * 1.72));
      p.shL = v(-0.23, fall * 0.54, sunk(B.shL, sink * 1.40));
      p.shR = v(0.23, fall * 0.54, sunk(B.shR, sink * 1.40));
      p.elL = v(-0.39, fall * 0.66, sunk(B.elL, sink * 1.22));
      p.elR = v(0.39, fall * 0.66, sunk(B.elR, sink * 1.22));
      p.hdL = v(-0.47, fall * 0.86, sunk(B.hdL, sink * 1.12));
      p.hdR = v(0.47, fall * 0.86, sunk(B.hdR, sink * 1.12));
      p.hpL = v(-0.125, fall * 0.22, sunk(B.hpL, sink));
      p.hpR = v(0.125, fall * 0.22, sunk(B.hpR, sink));
      p.knL = v(-0.19, 0.04 - fall * 0.16, sunk(B.knL, sink * 0.54));
      p.knR = v(0.19, 0.02 - fall * 0.12, sunk(B.knR, sink * 0.52));
      p.ftL = v(-0.21, -0.20 - fall * 0.14, 0.05);
      p.ftR = v(0.22, -0.18 - fall * 0.12, 0.04);
      p.grip = null;
      applyStature(p, g, anim);
      return p;
    }

    /* Stature last, over whatever the clip did.

       Written into each clip instead, every posture would have to be
       restated four times and a new type would be four chances to get
       one of them wrong. */
    applyStature(p, g, anim);
    p.grip = null;
    return p;
  }

  /* Height, hunch and hang - the three things that make a silhouette
     recognisable from across a field before any detail resolves. */
  function applyStature(p, g, anim) {
    var tall = g.tall == null ? 1 : g.tall;
    if (tall !== 1) {
      for (var k in p) {
        var val = p[k];
        if (val && val.length === 3) val[2] *= tall;
      }
    }
    if (g.hunch) {
      p.chest[1] += g.hunch * 0.5;
      p.neck[1] += g.hunch * 0.9;
      p.head[1] += g.hunch * 1.4;
      p.shL[1] += g.hunch * 0.45; p.shR[1] += g.hunch * 0.45;
      p.chest[2] -= g.hunch * 0.16;
      p.neck[2] -= g.hunch * 0.22;
      p.head[2] -= g.hunch * 0.26;
    }
    /* On all fours.

       `tall` only scales the rig down, which squashes a person rather
       than putting them on their hands - the crawler came out as a
       compressed blob with its limbs inside each other. This pitches the
       torso toward horizontal instead: chest and head forward and low,
       hips left back, and the arms taken down to the ground in front so
       they read as forelegs rather than as arms held oddly. */
    /* Not while it is dying. The death clip lays a body down by its own
       route, and pitching the torso forward at the same time fought it:
       the crawler came back up onto its hind legs and died standing
       bolt upright, which is the one pose a thing on all fours should
       never reach. It collapses from where it was instead. */
    if (g.quad && anim !== 'death') {
      var q = g.quad;
      p.chest[1] += q * 0.50; p.chest[2] -= q * 0.44;
      p.neck[1] += q * 0.74;  p.neck[2] -= q * 0.52;
      p.head[1] += q * 0.98;  p.head[2] -= q * 0.44;   /* muzzle up, watching */
      p.shL[1] += q * 0.48; p.shR[1] += q * 0.48;
      p.shL[2] -= q * 0.42; p.shR[2] -= q * 0.42;
      p.hip[2] -= q * 0.26;
      p.hpL[2] -= q * 0.24; p.hpR[2] -= q * 0.24;
      p.elL[1] += q * 0.60; p.elR[1] += q * 0.60;
      p.elL[2] -= q * 0.40; p.elR[2] -= q * 0.40;
      p.hdL[1] += q * 0.90; p.hdR[1] += q * 0.90;
      p.hdL[2] = Math.min(p.hdL[2], q * 0.05);
      p.hdR[2] = Math.min(p.hdR[2], q * 0.05);
      p.knL[1] += q * 0.10; p.knR[1] += q * 0.10;
      p.knL[2] -= q * 0.14; p.knR[2] -= q * 0.14;
    }
    if (g.drop) { p.head[2] -= g.drop; p.neck[2] -= g.drop * 0.5; }
    if (g.armHang && anim !== 'death') {
      p.elL[2] -= g.armHang * 0.5; p.elR[2] -= g.armHang * 0.5;
      p.hdL[2] -= g.armHang; p.hdR[2] -= g.armHang;
      p.hdL[1] += g.armHang * 0.2; p.hdR[1] += g.armHang * 0.2;
    }
    if (g.lean != null && anim === 'walk') p.lean = g.lean;
  }

  A.initZombies = function () {
    /* The shambler is baked first because it is the stand-in: anything
       whose own sheet is not finished yet is drawn as one. Left in table
       order it came third, so for the first quarter of the bake there was
       nothing to stand in WITH, and the whole horde drew as the black
       silhouette that means "no sprite". */
    var ids = Object.keys(Z.ZTYPES).sort(function (a, b) {
      if (a === 'shambler') return -1;
      if (b === 'shambler') return 1;
      return 0;
    });
    var plan = [];
    zSheets = {}; zReady = {};
    ids.forEach(function (tid) {
      var cells = [];
      Object.keys(ZANIMS).forEach(function (nm) {
        var an = ZANIMS[nm], dn = an.dirs || 5;
        for (var d = 0; d < dn; d++) {
          for (var f = 0; f < an.n; f++) cells.push([nm, d, f]);
        }
      });
      /* One sheet per type rather than one enormous shared one. Same
         pixels in total, but no single canvas over a megapixel or two,
         which is what an iPad is happiest with. */
      var cols = 10, rows = Math.ceil(cells.length / cols);
      zSheets[tid] = { atlas: new Atlas(cols, rows, ZCW, ZCH), slots: {} };
      for (var i = 0; i < cells.length; i++) {
        zSheets[tid].slots[key(cells[i][0], cells[i][1], cells[i][2])] = i;
        plan.push([tid, cells[i][0], cells[i][1], cells[i][2], i]);
      }
      zReady[tid] = false;
    });
    zPlan = plan;
    zDone = 0;
    A.zTotal = plan.length;
    A.zombieReady = false;
  };

  A.bakeZombieStep = function (budgetMs) {
    var t0 = performance.now();
    budgetMs = budgetMs || 8;
    while (zDone < zPlan.length) {
      var it = zPlan[zDone];
      var tid = it[0], sheet = zSheets[tid];
      var b = ZBUILD[tid] || ZBUILD.shambler;
      var ctx = sheet.atlas.begin(it[4]);
      /* thinner line: these cells are baked at 0.7 scale, and a keyline
         that does not shrink with the body turns a walker into a blob */
      withKeyline(ctx, ZCW, ZCH, 1.5, function (c) {
        c.scale(ZK, ZK);
        withBuild(b.limb, function () {
          drawBody(c, zPose(it[1], it[3], ZANIMS[it[1]].n, b), DIR_YAW[it[2]],
                   b.pal, { noPack: true, deco: b.deco });
        });
      });
      sheet.atlas.end();
      zDone++;
      /* A type becomes usable the moment its own sheet is finished,
         rather than everything waiting on the last one.

         `zombieReady` is NOT that. It means the whole plan is baked,
         because that is what the boot loop uses to decide it can stop
         calling this - setting it after the first type meant ten of the
         eleven never baked at all and the horde stayed a field of black
         ovals for the rest of the run. */
      if (zDone >= zPlan.length || zPlan[zDone][0] !== tid) zReady[tid] = true;
      if (performance.now() - t0 > budgetMs) break;
    }
    if (zDone >= zPlan.length) { A.zombieReady = true; return true; }
    return false;
  };

  /* Is there anything at all to draw a body with yet? The renderer asks
     before it falls back to a silhouette. */
  A.zombieAny = function () { return !!zReady.shambler; };

  A.zframe = function (typeId, anim, dir8, f) {
    var sheet = zSheets[typeId];
    if (!sheet || !zReady[typeId]) {
      /* fall back to a walker while this type is still baking, rather
         than showing nothing where something is about to bite you */
      sheet = zSheets.shambler;
      if (!sheet || !zReady.shambler) return null;
    }
    var m = DIR_MAP[dir8 & 7];
    var an = ZANIMS[anim] || ZANIMS.walk;
    var bd = m[0];
    if (an.dirs && bd >= an.dirs) bd = an.dirs - 1;
    var i = sheet.slots[key(anim, bd, Z.clamp(f | 0, 0, an.n - 1))];
    if (i == null) return null;
    var c = sheet.atlas.cell(i);
    return { img: sheet.atlas.cv, sx: c.x, sy: c.y, sw: ZCW, sh: ZCH,
             ox: FOOT_X * ZK, oy: FOOT_Y * ZK, flip: m[1], ppm: PPM * ZK };
  };

  /* ------------------------------------------------------------------ *
   * Held weapons - one sprite per weapon per baked facing, so a rifle
   * foreshortens when the survivor turns rather than spinning flat.
   * ------------------------------------------------------------------ */
  var wCache = {};

  /* `furniture` is what the stock and grip are made of, `muzzle` the
     device on the end, and `drum` swaps the box magazine for one. They are
     what tell a shotgun from a rifle at arm's length, which capsule
     dimensions alone never did. */
  var WSHAPE = {
    pistol:  { len: 0.24, barrel: 0.022, body: 0.055, stock: 0,    mag: 0.075, scope: 0,
               furniture: 'poly',  muzzle: 0 },
    smg:     { len: 0.50, barrel: 0.024, body: 0.060, stock: 0.15, mag: 0.135, scope: 0.022,
               furniture: 'poly',  muzzle: 0.03, folding: true },
    shotgun: { len: 0.74, barrel: 0.030, body: 0.056, stock: 0.21, mag: 0.045, scope: 0,
               furniture: 'wood',  muzzle: 0, pump: true },
    rifle:   { len: 0.80, barrel: 0.024, body: 0.060, stock: 0.21, mag: 0.145, scope: 0.030,
               furniture: 'wood',  muzzle: 0.05 },
    lmg:     { len: 0.92, barrel: 0.034, body: 0.082, stock: 0.19, mag: 0.200, scope: 0.026,
               furniture: 'poly',  muzzle: 0.06, drum: true, bipod: true },
    sniper:  { len: 1.05, barrel: 0.024, body: 0.058, stock: 0.25, mag: 0.095, scope: 0.052,
               furniture: 'poly',  muzzle: 0.07, bipod: true },
    rail:    { len: 0.98, barrel: 0.042, body: 0.094, stock: 0.21, mag: 0.095, scope: 0.040,
               furniture: 'poly',  muzzle: 0, glow: true }
  };

  A.weaponSprite = function (shape, dir8) {
    var m = DIR_MAP[dir8 & 7];
    var k = shape + ':' + m[0];
    if (wCache[k]) return { cv: wCache[k], flip: m[1] };
    var S = WSHAPE[shape] || WSHAPE.rifle;
    var yaw = DIR_YAW[m[0]];
    var pad = 18;
    var w = Math.ceil(S.len * PPM * 1.4) + pad * 2, h = 78;
    var cv = Z.canvas(w, h);
    var c = cv.getContext('2d');
    var ox = pad + 8, oy = h * 0.62;
    function P(fw, up, sd) {
      var r = rotY(v(sd || 0, fw, up || 0), yaw);
      return { x: ox + r[0] * PPM, y: oy - r[2] * PPM + r[1] * PPM * Z.PITCH };
    }
    function bar(a, b, r, col) {
      var g = c.createLinearGradient(a.x, a.y - r, a.x, a.y + r);
      g.addColorStop(0, Z.rgb(Z.shade(col, 0.38)));
      g.addColorStop(0.5, Z.rgb(col));
      g.addColorStop(1, Z.rgb(Z.shade(col, -0.44)));
      capsulePath(c, a.x, a.y, r, b.x, b.y, r * 0.9);
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(6,8,10,.8)'; c.lineWidth = 1.1; c.stroke();
    }
    var GM = [88, 92, 98], WOOD = [122, 88, 54], DARK = [40, 42, 46];
    var POLY = [58, 58, 56];
    var furn = S.furniture === 'wood' ? WOOD : POLY;

    function dot(pt, r, col) {
      var g2 = c.createRadialGradient(pt.x - r * 0.4, pt.y - r * 0.4, 0.5, pt.x, pt.y, r);
      g2.addColorStop(0, Z.rgb(Z.shade(col, 0.4)));
      g2.addColorStop(1, Z.rgb(Z.shade(col, -0.4)));
      c.fillStyle = g2;
      c.beginPath(); c.arc(pt.x, pt.y, r, 0, Z.TAU); c.fill();
      c.strokeStyle = 'rgba(6,8,10,.75)'; c.lineWidth = 1; c.stroke();
    }

    /* butt, then the receiver, then the barrel */
    if (S.stock) {
      bar(P(-S.stock, 0.012), P(-0.02, 0.018), R(0.044), furn);
      /* a cheek rest on anything you shoulder properly */
      if (!S.folding) bar(P(-S.stock * 0.62, 0.052), P(-0.10, 0.050), R(0.018), furn);
    }
    bar(P(-0.02, 0.018), P(S.len * 0.44, 0.026), R(S.body * 0.5), GM);
    bar(P(S.len * 0.44, 0.026), P(S.len - S.muzzle, 0.026), R(S.barrel * 0.5) + 1.2, DARK);

    /* the handguard, which is the wood you see on a rifle and a shotgun */
    if (shape !== 'pistol') {
      bar(P(S.len * 0.40, 0.006), P(S.len * 0.70, 0.010), R(S.body * 0.46), furn);
    }
    if (S.pump) bar(P(S.len * 0.46, -0.026), P(S.len * 0.72, -0.024), R(0.026), furn);

    /* magazine: a box that rakes forward, or a drum */
    if (S.mag) {
      if (S.drum) {
        dot(P(0.06, -S.mag * 0.55), R(S.mag * 0.55), [52, 56, 60]);
      } else {
        bar(P(0.05, 0.0), P(0.02 - S.mag * 0.22, -S.mag), R(0.030), DARK);
      }
    }
    /* pistol grip */
    if (shape !== 'pistol') bar(P(S.len * 0.06, -0.01), P(S.len * 0.02, -0.16), R(0.030), furn);

    /* optic with a lens in it, rather than a bare tube */
    if (S.scope) {
      bar(P(0.10, 0.050 + S.scope), P(0.28, 0.050 + S.scope), R(0.028), [56, 60, 66]);
      dot(P(0.30, 0.050 + S.scope), R(0.034), [30, 44, 58]);
      bar(P(0.13, 0.026 + S.scope), P(0.13, 0.050 + S.scope), R(0.012), [56, 60, 66]);
      bar(P(0.25, 0.026 + S.scope), P(0.25, 0.050 + S.scope), R(0.012), [56, 60, 66]);
    }

    /* muzzle device, front sight, bipod - the end of the gun is the end
       the player looks at when they are aiming */
    if (S.muzzle) {
      bar(P(S.len - S.muzzle, 0.026), P(S.len, 0.026), R(S.barrel * 0.85) + 1.6,
          [52, 54, 58]);
    }
    if (shape !== 'pistol') bar(P(S.len * 0.86, 0.030), P(S.len * 0.86, 0.086), R(0.020), DARK);
    if (S.bipod) {
      bar(P(S.len * 0.74, 0.0), P(S.len * 0.86, -0.13), R(0.014), [64, 68, 72]);
      bar(P(S.len * 0.74, 0.0), P(S.len * 0.62, -0.13), R(0.014), [64, 68, 72]);
    }
    /* the rail hums */
    if (S.glow) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      bar(P(S.len * 0.30, 0.048), P(S.len * 0.92, 0.046), R(0.012), [110, 200, 236]);
      c.restore();
    }
    wCache[k] = cv;
    cv._ox = ox; cv._oy = oy; cv._ppm = PPM;
    return { cv: cv, flip: m[1] };
  };

  /* Metres from the body's centre to the muzzle, for whatever is in his
     hands. The flash, the smoke and the brass all hang off this, so they
     move when the gun does instead of all sitting at one fixed distance
     that was right for the pistol and nothing else. */
  A.weaponReach = function (shape) {
    var S = WSHAPE[shape] || WSHAPE.rifle;
    return 0.22 + S.len * 0.78;
  };
  /* and how high off the ground the gun is held */
  A.GRIP_Z = 1.02 * BODY_K;

  A.WPN_BEHIND = WPN_BEHIND;

})(window.Z);
