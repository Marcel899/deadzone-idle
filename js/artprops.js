/* Deadzone - world art: props and structures.

   Same idea as the character atlas, different subject. Every tree, wreck
   and building is composed from a handful of solids drawn through the
   world's pitched camera - a top face and a front face, lit from the same
   direction as the survivor - then cached as a sprite the first time it
   is asked for. Nothing here re-draws per frame.

   Because the camera only pitches and never yaws, a box shows its top and
   its near face and nothing else. That is the whole visual grammar of the
   map, and keeping to it is what makes a shack, a solar panel and a
   burnt-out hatchback look like they belong in the same world. */
(function (Z) {
  'use strict';

  var A = Z.art;
  var PPM = 58;                    /* bake resolution, matches the character atlas */
  var PITCH = Z.PITCH;

  var cache = {};

  function mk(w, h, ox, oy) {
    var cv = Z.canvas(w, h);
    cv._ox = ox; cv._oy = oy; cv._ppm = PPM;
    return cv;
  }

  /* ------------------------------------------------------------------ *
   * Solids
   * ------------------------------------------------------------------ */

  /* An axis-aligned box standing on the ground. Origin is the centre of
     its footprint; w/d are metres across and deep, h is metres tall. */
  /* Quarter turns applied to everything the structure art builds itself
     from. A box seen from a quarter turn away is the same box with its
     width and its depth exchanged, so one flag here turns every structure
     in the game rather than forty art functions each learning to. */
  var ROT = 0;
  function swapWD(w, d) { return (ROT & 1) ? [d, w] : [w, d]; }

  /* Which neighbours the piece being baked joins: 1 north, 2 east, 4
     south, 8 west. Only the chain art looks at it. */
  var MASK = 0;

  /* How a chain piece runs. With no neighbours at all it falls back to
     its own rotation, which is the only time R means anything for a wall:
     a lone post is either an east-west stub or a north-south one. */
  function runOf() {
    var m = MASK;
    if (!(m & 15)) m = (ROT & 1) ? 5 : 10;
    return { ew: !!(m & 10), ns: !!(m & 5),
             n: !!(m & 1), e: !!(m & 2), s: !!(m & 4), w: !!(m & 8) };
  }

  /* A box centred on its tile in depth as well as in width.

     box() puts the front face on the origin and grows backwards, which is
     right for a thing that sits at the back of its tile and wrong for a
     wall: two walls stacked north-south left a third of a tile of grass
     showing between them. Chain pieces are centred instead, so a run of
     them meets. */
  function chainBox(c, x, y, w, d, h, top, side, opt) {
    var was = ROT; ROT = 0;                  /* w and d are already resolved */
    var r = box(c, x, y + d * PPM * PITCH * 0.5, w, d, h, top, side, opt);
    ROT = was;
    return r;
  }

  /* ------------------------------------------------------------------ *
   * Continuous runs
   *
   * A wall tile is not a box. Drawn as one, every tile brought its own
   * left-hand highlight, right-hand shadow, left-to-right gradient and
   * outline, so a straight run came out as a row of separately lit blocks
   * with a seam every metre. You cannot build a base out of that.
   *
   * Instead each tile draws a centre block and an arm out to the edge for
   * every neighbour it has. Arms from adjacent tiles meet and overlap, and
   * all the shading runs top-to-bottom - the same at every x - so two
   * pieces side by side are indistinguishable from one long one. The edge
   * treatment only goes on the ends that are actually exposed.
   * ------------------------------------------------------------------ */

  /* xa..xb across, dNear..dFar in depth, all in metres from the tile
     centre. Positive depth is toward the camera. */
  function slab(c, ox, oy, xa, xb, dNear, dFar, h, top, side) {
    var X0 = ox + xa * PPM, X1 = ox + xb * PPM;
    var yN = oy + dNear * PPM * PITCH;
    var yF = oy + dFar * PPM * PITCH;
    var H = h * PPM;
    var W = X1 - X0;

    /* top first, so the front face sits over its lower edge */
    var gt = c.createLinearGradient(0, yF - H, 0, yN - H);
    gt.addColorStop(0, Z.rgb(Z.shade(top, 0.22)));
    gt.addColorStop(1, Z.rgb(Z.shade(top, -0.04)));
    c.fillStyle = gt;
    c.fillRect(X0, yF - H, W, yN - yF);

    /* the face is shaded down the wall, never across it */
    var gf = c.createLinearGradient(0, yN - H, 0, yN);
    gf.addColorStop(0, Z.rgb(Z.shade(side, 0.13)));
    gf.addColorStop(0.55, Z.rgb(side));
    gf.addColorStop(1, Z.rgb(Z.shade(side, -0.34)));
    c.fillStyle = gf;
    c.fillRect(X0, yN - H, W, H);

    return { X0: X0, X1: X1, yN: yN, yF: yF, H: H, W: W };
  }

  /* The four sides of a chain piece, resolved. */
  function armsOf() {
    var m = MASK;
    if (!(m & 15)) m = (ROT & 1) ? 5 : 10;   /* alone: R decides which way */
    return { n: !!(m & 1), e: !!(m & 2), s: !!(m & 4), w: !!(m & 8) };
  }

  /* One tile of a continuous run. */
  function runPiece(c, ox, oy, h, top, side, opt) {
    opt = opt || {};
    var a = armsOf();
    var t = opt.thick || 0.30;      /* half thickness */
    var e = 0.54;                   /* past the tile edge, so arms overlap */

    /* back to front, so the nearer pieces occlude the further ones */
    if (a.n) slab(c, ox, oy, -t, t, -t, -e, h, top, side);
    slab(c, ox, oy, a.w ? -e : -t, a.e ? e : t, t, -t, h, top, side);
    if (a.s) slab(c, ox, oy, -t, t, e, t, h, top, side);

    /* Ends, and only ends. A pilaster where two tiles meet is exactly the
       seam this is here to remove. */
    var H = h * PPM, yN = oy + t * PPM * PITCH;
    var cap = 3.5;
    if (!a.w && !(a.n || a.s)) {
      c.fillStyle = 'rgba(232,228,214,.10)';
      c.fillRect(ox - t * PPM, yN - H, cap, H);
    }
    if (!a.e && !(a.n || a.s)) {
      c.fillStyle = 'rgba(0,0,0,.24)';
      c.fillRect(ox + t * PPM - cap, yN - H, cap, H);
    }

    /* What the wall is made of.

       A slab with two lines across it is a slab with two lines across it,
       whatever colour you make it. Timber has planks, and planks have
       seams, grain, knots and the nails holding them on; concrete has
       chips and run-off. Drawn across the whole run so it crosses the
       joins like the courses do, rather than per tile, which would print
       the same plank every 24px. */
    if (opt.mat) {
      var fx0 = ox + (a.w ? -e : -t) * PPM, fx1 = ox + (a.e ? e : t) * PPM;
      var fy1 = yN, fy0 = yN - H, fw = fx1 - fx0;
      var seed = Math.round(ox * 0.31 + oy * 0.57);
      c.save();
      c.beginPath();
      c.rect(fx0, fy0, fw, H);
      c.clip();
      if (opt.mat === 'wood') {
        var pw = Math.max(9, H * 0.42);           /* one plank wide */
        for (var pk = 0; pk * pw < fw + pw; pk++) {
          var pxx = fx0 + pk * pw;
          /* No two boards in a scavenged wall came off the same pile, and
             a row of identical planks is the thing that made this read as
             one printed texture rather than as timber. A little tone per
             board, keyed off the run so it does not repeat per tile. */
          var pv = Z.hash1(seed + pk * 11, 53) - 0.5;
          c.fillStyle = pv > 0 ? 'rgba(255,238,206,' + (pv * 0.20).toFixed(3) + ')'
                               : 'rgba(46,32,18,' + (-pv * 0.26).toFixed(3) + ')';
          c.fillRect(pxx, fy0, pw, H);
          /* the seam, and the lit edge of the plank beyond it */
          c.fillStyle = 'rgba(0,0,0,.42)';
          c.fillRect(pxx, fy0, 1.8, H);
          c.fillStyle = 'rgba(255,244,222,.16)';
          c.fillRect(pxx + 1.8, fy0, 1.2, H);
          /* grain, two streaks that wander down the plank */
          for (var gr = 0; gr < 2; gr++) {
            var gy0 = fy0 + H * (0.22 + gr * 0.38);
            c.strokeStyle = gr ? 'rgba(0,0,0,.13)' : 'rgba(255,240,210,.08)';
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(pxx + 2, gy0);
            c.bezierCurveTo(pxx + pw * 0.35, gy0 - 1.6,
                            pxx + pw * 0.65, gy0 + 1.6, pxx + pw - 1, gy0);
            c.stroke();
          }
          /* a knot on roughly every third plank */
          if (Z.hash1(seed + pk * 7, 23) > 0.66) {
            var kx = pxx + pw * 0.5, ky = fy0 + H * (0.3 + Z.hash1(seed + pk, 29) * 0.4);
            c.fillStyle = 'rgba(0,0,0,.22)';
            c.beginPath(); c.ellipse(kx, ky, 2.1, 1.5, 0, 0, Z.TAU); c.fill();
            c.fillStyle = 'rgba(255,238,206,.10)';
            c.beginPath(); c.ellipse(kx - 0.4, ky - 0.4, 1.1, 0.7, 0, 0, Z.TAU); c.fill();
          }
          /* the nails holding it on */
          for (var nl = 0; nl < 2; nl++) {
            var nx = pxx + pw * 0.5, ny = fy0 + H * (0.16 + nl * 0.66);
            c.fillStyle = 'rgba(0,0,0,.3)';
            c.fillRect(nx - 1, ny, 2, 2);
            c.fillStyle = 'rgba(232,226,208,.22)';
            c.fillRect(nx - 1, ny, 2, 1);
          }
        }
        /* damp creeping up from the ground */
        var dg = c.createLinearGradient(0, fy1 - H * 0.26, 0, fy1);
        dg.addColorStop(0, 'rgba(38,28,16,0)');
        dg.addColorStop(1, 'rgba(38,28,16,.26)');
        c.fillStyle = dg;
        c.fillRect(fx0, fy1 - H * 0.26, fw, H * 0.26);
      } else {
        /* concrete: chipped corners and a stain or two */
        for (var ch = 0; ch < 5; ch++) {
          var cxx = fx0 + Z.hash1(seed + ch * 3, 37) * fw;
          var cyy = fy0 + Z.hash1(seed + ch * 5, 41) * H;
          var cs = 1.6 + Z.hash1(seed + ch, 43) * 3;
          c.fillStyle = 'rgba(0,0,0,.16)';
          c.beginPath(); c.ellipse(cxx, cyy, cs, cs * 0.7, 0, 0, Z.TAU); c.fill();
          c.fillStyle = 'rgba(236,232,220,.10)';
          c.beginPath(); c.ellipse(cxx - 0.5, cyy - 0.6, cs * 0.6, cs * 0.4, 0, 0, Z.TAU); c.fill();
        }
        var sg = c.createLinearGradient(0, fy0, 0, fy1);
        sg.addColorStop(0, 'rgba(58,52,40,.16)');
        sg.addColorStop(0.5, 'rgba(58,52,40,0)');
        c.fillStyle = sg;
        c.fillRect(fx0 + fw * 0.28, fy0, Math.max(6, fw * 0.1), H);
      }
      c.restore();

      /* ---- the top ----

         A wall is a solid, and the top of it is the end of whatever it is
         built from - but `slab` fills it with a plain gradient and the
         material pass above only ever clipped to the FACE, so every wall
         in the game carried a bare tan trapezoid over it. At this camera
         the top is a third of the wall's whole silhouette, which is why a
         timber palisade with planks, grain, knots and nails on its front
         still read as a cardboard box.

         Vertical boards show their end grain up there, and the seams
         between them line up with the seams on the face - that alignment
         is most of what sells it as one solid object rather than two
         surfaces that happen to touch. */
      var tFar = oy + (a.n ? -e : -t) * PPM * PITCH - H;
      var tNear = oy + (a.s ? e : t) * PPM * PITCH - H;
      c.save();
      c.beginPath();
      c.rect(fx0, oy - t * PPM * PITCH - H, fw, 2 * t * PPM * PITCH);
      if (a.n) c.rect(ox - t * PPM, tFar, t * 2 * PPM, (e - t) * PPM * PITCH);
      if (a.s) c.rect(ox - t * PPM, oy + t * PPM * PITCH - H,
                      t * 2 * PPM, (e - t) * PPM * PITCH);
      c.clip();
      var tH = tNear - tFar;
      /* The top gets its OWN colour, laid over slab's.

         `slab` lifts every top toward white by a fifth, which is right for
         a lit plane but takes all the hue out with it: the timber arrived
         at rgb(134,115,90) against ground of rgb(128,115,79), so the
         largest surface on the wall was the same colour as the field
         behind it. Sky light is a tint, not a bleach - this keeps the
         wood's own brown and lifts it a little, which separates it by
         value without pretending the boards are painted. */
      var tg2 = c.createLinearGradient(0, tFar, 0, tNear);
      tg2.addColorStop(0, Z.rgb(Z.shade(side, 0.18)));
      tg2.addColorStop(1, Z.rgb(Z.shade(side, -0.02)));
      c.fillStyle = tg2;
      c.fillRect(fx0 - PPM, tFar, fw + PPM * 2, tH);
      c.fillStyle = 'rgba(214,230,255,.05)';
      c.fillRect(fx0 - PPM, tFar, fw + PPM * 2, tH);
      if (opt.mat === 'wood') {
        /* end grain, board by board */
        for (var tk = 0; tk * pw < fw + pw; tk++) {
          var txx = fx0 + tk * pw;
          var tv = Z.hash1(seed + tk * 11, 53) - 0.5;
          c.fillStyle = tv > 0 ? 'rgba(255,238,206,' + (tv * 0.18).toFixed(3) + ')'
                               : 'rgba(46,32,18,' + (-tv * 0.22).toFixed(3) + ')';
          c.fillRect(txx, tFar, pw, tH);
          c.fillStyle = 'rgba(0,0,0,.36)';
          c.fillRect(txx, tFar, 1.6, tH);
          c.fillStyle = 'rgba(255,244,222,.13)';
          c.fillRect(txx + 1.6, tFar, 1.1, tH);
          /* the rings, cut across */
          c.strokeStyle = 'rgba(60,42,24,.26)';
          c.lineWidth = 1;
          for (var rg = 0; rg < 2; rg++) {
            c.beginPath();
            c.ellipse(txx + pw * 0.5, tFar + tH * 0.5,
                      pw * (0.16 + rg * 0.17), tH * (0.2 + rg * 0.2), 0, 0, Z.TAU);
            c.stroke();
          }
        }
      } else {
        /* concrete: a floated top, pitted and run off at the edges */
        for (var pc = 0; pc < 9; pc++) {
          var px2 = fx0 + Z.hash1(seed + pc * 3, 61) * fw;
          var py2 = tFar + Z.hash1(seed + pc * 5, 67) * tH;
          var ps = 1.2 + Z.hash1(seed + pc, 71) * 2.2;
          c.fillStyle = 'rgba(0,0,0,.17)';
          c.beginPath(); c.ellipse(px2, py2, ps, ps * 0.7, 0, 0, Z.TAU); c.fill();
        }
      }
      c.restore();

      /* the arris - the lit edge where the top turns into the face. A
         solid reads as solid at its corners. */
      c.fillStyle = 'rgba(255,248,230,.20)';
      c.fillRect(fx0, fy0 - 1, fw, 1.6);
      c.fillStyle = 'rgba(0,0,0,.26)';
      c.fillRect(fx0, fy0 + 0.6, fw, 1);
    }

    /* the courses, which run along the wall and so cross every join */
    if (opt.courses !== false) {
      var xa = (a.w ? -e : -t) * PPM, xb = (a.e ? e : t) * PPM;
      c.fillStyle = 'rgba(0,0,0,.17)';
      for (var i = 1; i < 3; i++) {
        c.fillRect(ox + xa, yN - H + H * i / 3, xb - xa, 2);
      }
      if (a.n || a.s) {
        var ya = (a.n ? -e : -t), yb = (a.s ? e : t);
        for (var j = 1; j < 3; j++) {
          c.fillRect(ox - t * PPM, oy + ya * PPM * PITCH - H + H * j / 3,
                     t * 2 * PPM, 2);
          c.fillRect(ox - t * PPM, oy + yb * PPM * PITCH - H + H * j / 3,
                     t * 2 * PPM, 2);
        }
      }
    }

    /* contact shade along the bottom, planting it on the ground */
    var gs = c.createLinearGradient(0, yN - H * 0.3, 0, yN);
    gs.addColorStop(0, 'rgba(0,0,0,0)');
    gs.addColorStop(1, 'rgba(0,0,0,.30)');
    c.fillStyle = gs;
    var sx0 = ox + (a.w ? -e : -t) * PPM, sx1 = ox + (a.e ? e : t) * PPM;
    c.fillRect(sx0, yN - H * 0.3, sx1 - sx0, H * 0.3);

    /* And a shadow on the GROUND. The gradient above darkens the wall's
       own lower courses, which is not the same thing and cannot plant it:
       with nothing cast in front of the base, a wall sits on the terrain
       like a sticker. Drawn as a band across the whole run rather than a
       blob per tile, because a blob per tile scallops along every fence
       line in the compound. */
    var shH = H * 0.30;
    var sg2 = c.createLinearGradient(0, yN, 0, yN + shH);
    sg2.addColorStop(0, 'rgba(12,10,8,.42)');
    sg2.addColorStop(0.45, 'rgba(12,10,8,.20)');
    sg2.addColorStop(1, 'rgba(12,10,8,0)');
    c.fillStyle = sg2;
    c.fillRect(sx0, yN, sx1 - sx0, shH);
    return a;
  }

  function box(c, ox, oy, w, d, h, top, side, opt) {
    opt = opt || {};
    var wd = swapWD(w, d); w = wd[0]; d = wd[1];
    var W = w * PPM, D = d * PPM * PITCH, H = h * PPM;
    var x0 = ox - W / 2, y0 = oy;                 /* near-bottom-left */
    var yTopFront = y0 - H;                       /* where the front face ends */
    var yTopBack = yTopFront - D;

    /* front face, shaded left-to-right */
    var g = c.createLinearGradient(x0, 0, x0 + W, 0);
    g.addColorStop(0, Z.rgb(Z.shade(side, 0.16)));
    g.addColorStop(0.62, Z.rgb(side));
    g.addColorStop(1, Z.rgb(Z.shade(side, -0.30)));
    c.fillStyle = g;
    c.fillRect(x0, yTopFront, W, H);

    /* top face, lighter and squashed by the camera pitch */
    var gt = c.createLinearGradient(0, yTopBack, 0, yTopFront);
    gt.addColorStop(0, Z.rgb(Z.shade(top, 0.20)));
    gt.addColorStop(1, Z.rgb(Z.shade(top, -0.06)));
    c.fillStyle = gt;
    if (opt.inset) {
      c.beginPath();
      c.moveTo(x0 + opt.inset, yTopBack);
      c.lineTo(x0 + W - opt.inset, yTopBack);
      c.lineTo(x0 + W, yTopFront);
      c.lineTo(x0, yTopFront);
      c.closePath();
      c.fill();
    } else {
      c.fillRect(x0, yTopBack, W, D);
    }

    /* corner pilasters: two vertical strips catching and losing the light
       at the edges. Without them a wall is a flat rectangle of paint. */
    if (opt.posts !== false && W > 22) {
      c.fillStyle = 'rgba(232,228,214,.10)';
      c.fillRect(x0, yTopFront, 3.5, H);
      c.fillStyle = 'rgba(0,0,0,.24)';
      c.fillRect(x0 + W - 3.5, yTopFront, 3.5, H);
    }

    /* a horizontal seam where the cladding is joined */
    if (opt.seam !== false && H > 28) {
      c.fillStyle = 'rgba(0,0,0,.16)';
      c.fillRect(x0, yTopFront + H * 0.42, W, 1.6);
      c.fillStyle = 'rgba(232,228,214,.05)';
      c.fillRect(x0, yTopFront + H * 0.42 + 1.6, W, 1);
    }

    /* contact shade where the front meets the ground keeps it planted */
    var gs = c.createLinearGradient(0, y0 - H * 0.35, 0, y0);
    gs.addColorStop(0, 'rgba(0,0,0,0)');
    gs.addColorStop(1, 'rgba(0,0,0,.34)');
    c.fillStyle = gs;
    c.fillRect(x0, yTopFront, W, H);

    if (opt.line !== false) {
      c.strokeStyle = 'rgba(6,8,10,.55)';
      c.lineWidth = 1.2;
      c.strokeRect(x0 + 0.5, yTopBack + 0.5, W - 1, H + D - 1);
    }
    return { x0: x0, x1: x0 + W, yF: yTopFront, yB: yTopBack, y0: y0, W: W, D: D, H: H };
  }

  /* A vertical cylinder - drums, silos, poles. */
  /* A ground-level plot: tilled earth, furrows and an edging board.

     Both farms are plots rather than sheds. Drawn as another grey box a
     farm would be a fourth grey box in a row of them, and you could not
     tell your food supply from your smelter at a glance. */
  function plot(c, x, y, w, d, soil, edge) {
    var W = w * PPM, D = d * PPM * PITCH;
    var x0 = x - W / 2, y0 = y + D / 2;
    var g = c.createLinearGradient(0, y0 - D, 0, y0);
    g.addColorStop(0, Z.rgb(Z.shade(soil, 0.16)));
    g.addColorStop(1, Z.rgb(Z.shade(soil, -0.18)));
    c.fillStyle = g;
    c.fillRect(x0, y0 - D, W, D);
    c.fillStyle = 'rgba(0,0,0,.16)';
    for (var i = 1; i < 5; i++) c.fillRect(x0, y0 - D + D * i / 5, W, 1.5);
    c.fillStyle = Z.rgb(edge);
    c.fillRect(x0 - 2, y0 - D - 2, W + 4, 3);
    c.fillRect(x0 - 2, y0 - 1, W + 4, 3);
    c.fillStyle = Z.rgb(Z.shade(edge, -0.3));
    c.fillRect(x0 - 2, y0 - D - 2, 3, D + 4);
    c.fillRect(x0 + W - 1, y0 - D - 2, 3, D + 4);
    return { x0: x0, y0: y0, W: W, D: D };
  }

  /* The yellow-and-black skirt under a weapon emplacement.

     Every defence in the game was a grey box with something on top, and at
     a glance a turret, a flamer and a tesla coil were the same object. The
     hazard skirt is the one mark that says "this thing is dangerous and it
     is bolted down", and it costs four polygons. */
  function hazardBase(c, x, y, w, d, lvl) {
    var W = w * PPM, D = d * PPM * PITCH;
    var x0 = x - W / 2, y0 = y + D / 2;
    var pad = Math.max(3, W * 0.09);

    c.fillStyle = 'rgba(18,20,18,.5)';
    c.beginPath();
    c.ellipse(x, y0 - D / 2, W * 0.58, D * 0.62, 0, 0, Z.TAU);
    c.fill();

    /* the plinth, then the stripes clipped to its face */
    c.fillStyle = 'rgb(56,58,54)';
    c.fillRect(x0, y0 - D - 3, W, D + 3);
    c.save();
    c.beginPath();
    c.rect(x0, y0 - 6, W, 6);
    c.clip();
    for (var i = -2; i < W / 9 + 2; i++) {
      c.fillStyle = (i & 1) ? 'rgb(206,166,52)' : 'rgb(28,28,26)';
      c.beginPath();
      c.moveTo(x0 + i * 9, y0);
      c.lineTo(x0 + i * 9 + 5, y0 - 8);
      c.lineTo(x0 + i * 9 + 14, y0 - 8);
      c.lineTo(x0 + i * 9 + 9, y0);
      c.closePath();
      c.fill();
    }
    c.restore();

    /* bolt heads at the corners, which is what says "bolted down" */
    c.fillStyle = 'rgba(148,156,162,.75)';
    [[x0 + pad, y0 - D + 2], [x0 + W - pad, y0 - D + 2],
     [x0 + pad, y0 - 9], [x0 + W - pad, y0 - 9]].forEach(function (pt) {
      c.beginPath(); c.arc(pt[0], pt[1], 1.8, 0, Z.TAU); c.fill();
    });
    return { x0: x0, y0: y0, W: W, D: D };
  }

  function cyl(c, ox, oy, r, h, col, capCol) {
    var R = r * PPM, H = h * PPM, RD = R * PITCH;
    var g = c.createLinearGradient(ox - R, 0, ox + R, 0);
    g.addColorStop(0, Z.rgb(Z.shade(col, 0.10)));
    g.addColorStop(0.46, Z.rgb(Z.shade(col, 0.20)));
    g.addColorStop(1, Z.rgb(Z.shade(col, -0.34)));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(ox - R, oy - H);
    c.lineTo(ox - R, oy);
    c.ellipse(ox, oy, R, RD, 0, Math.PI, 0, true);
    c.lineTo(ox + R, oy - H);
    c.closePath();
    c.fill();
    c.fillStyle = Z.rgb(Z.shade(capCol || col, 0.26));
    c.beginPath();
    c.ellipse(ox, oy - H, R, RD, 0, 0, Z.TAU);
    c.fill();
    c.strokeStyle = 'rgba(6,8,10,.5)';
    c.lineWidth = 1.2;
    c.stroke();
  }

  /* ------------------------------------------------------------------ *
   * Architecture
   *
   * A structure is a plinth, walls with corner pilasters, openings, and a
   * roof. Building every structure out of these instead of one flat box
   * is what separates a shed from a command post at a glance.
   * ------------------------------------------------------------------ */

  /* A low concrete pad, slightly proud of the walls. Nothing sits on bare
     grass; the pad is what stops a structure looking pasted on. */
  function plinth(c, ox, oy, w, d, col) {
    var W = w * PPM, D = d * PPM * PITCH, H = 0.10 * PPM;
    c.fillStyle = Z.rgb(Z.shade(col || [96, 94, 88], -0.34));
    c.fillRect(ox - W / 2 - 3, oy - H, W + 6, H);
    c.fillStyle = Z.rgb(Z.shade(col || [96, 94, 88], 0.10));
    c.fillRect(ox - W / 2 - 3, oy - H - D, W + 6, D);
    c.strokeStyle = 'rgba(6,8,10,.4)';
    c.lineWidth = 1;
    c.strokeRect(ox - W / 2 - 2.5, oy - H - D + 0.5, W + 5, D + H - 1);
  }

  /* A hip roof: the near slope, the two end slopes, a ridge and an eave
     shadow under the overhang. */
  function hipRoof(c, ox, oy, w, d, rise, col) {
    var W = w * PPM, D = d * PPM * PITCH, R = rise * PPM;
    var over = 5;
    var x0 = ox - W / 2 - over, x1 = ox + W / 2 + over;
    var yB = oy, yT = oy - D - R;
    var ridgeIn = W * 0.22;

    /* near slope */
    var g = c.createLinearGradient(0, yT, 0, yB);
    g.addColorStop(0, Z.rgb(Z.shade(col, 0.30)));
    g.addColorStop(1, Z.rgb(Z.shade(col, -0.26)));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x0, yB); c.lineTo(ox - ridgeIn, yT);
    c.lineTo(ox + ridgeIn, yT); c.lineTo(x1, yB);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(6,8,10,.55)'; c.lineWidth = 1.1; c.stroke();

    /* end slopes, darker so the hip reads as three planes */
    c.fillStyle = Z.rgb(Z.shade(col, -0.40));
    c.beginPath();
    c.moveTo(x0, yB); c.lineTo(ox - ridgeIn, yT); c.lineTo(ox - ridgeIn, yT + 2);
    c.lineTo(x0 + 6, yB); c.closePath(); c.fill();

    /* ridge line catches the light */
    c.strokeStyle = 'rgba(232,228,214,.20)';
    c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(ox - ridgeIn, yT + 0.8); c.lineTo(ox + ridgeIn, yT + 0.8); c.stroke();

    /* eave shadow cast down the wall */
    var eg = c.createLinearGradient(0, yB, 0, yB + 9);
    eg.addColorStop(0, 'rgba(0,0,0,.42)');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = eg;
    c.fillRect(x0, yB, x1 - x0, 9);
    c.lineWidth = 1;
  }

  /* A flat roof with a parapet, plus whatever clutter sits on it. */
  function flatRoof(c, b, col, clutter) {
    c.fillStyle = Z.rgb(Z.shade(col, 0.16));
    c.fillRect(b.x0 - 2, b.yB - 4, b.W + 4, 5);
    c.fillStyle = Z.rgb(Z.shade(col, -0.34));
    c.fillRect(b.x0 - 2, b.yB + 1, b.W + 4, 2.5);
    if (clutter) {
      c.fillStyle = Z.rgb(Z.shade(col, -0.18));
      c.fillRect(b.x0 + b.W * 0.16, b.yB - 11, b.W * 0.2, 9);
      c.fillStyle = Z.rgb(Z.shade(col, 0.22));
      c.fillRect(b.x0 + b.W * 0.16, b.yB - 13, b.W * 0.2, 2.5);
      c.fillStyle = 'rgba(40,44,46,.9)';
      c.fillRect(b.x0 + b.W * 0.66, b.yB - 14, 5, 13);
    }
  }

  /* One window: reveal, glass, sill. Lit ones are the only warm thing on
     a structure at night. */
  function win(c, x, y, w, h, lit) {
    c.fillStyle = 'rgba(18,20,22,.9)';
    c.fillRect(x - 1, y - 1, w + 2, h + 2);
    if (lit) {
      var g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, 'rgba(255,208,132,.92)');
      g.addColorStop(1, 'rgba(228,150,62,.82)');
      c.fillStyle = g;
    } else {
      c.fillStyle = 'rgba(30,38,44,.95)';
    }
    c.fillRect(x, y, w, h);
    /* a slip of reflected sky across the top of the glass */
    c.fillStyle = lit ? 'rgba(255,244,210,.5)' : 'rgba(150,176,196,.18)';
    c.fillRect(x, y, w, Math.max(1.5, h * 0.22));
    /* sill */
    c.fillStyle = 'rgba(226,222,210,.16)';
    c.fillRect(x - 1.5, y + h + 1, w + 3, 1.6);
  }

  /* Windows, with a ground floor left for the door.

     They used to be spread evenly over the whole face, so the bottom row
     sat on the pavement and the front door was punched through the middle
     of it. Every building has a storey at the bottom that is entrance
     rather than window, and reserving it is what makes the rest read as
     floors. */
  function winRow(c, b, cols, rows, lit, baseFrac) {
    var base = b.H * (baseFrac == null ? 0.26 : baseFrac);
    var top = b.yF, usable = b.H - base;
    var pw = b.W / (cols * 2 + 1), ph = usable / (rows * 2 + 1);
    for (var r = 0; r < rows; r++) {
      for (var k = 0; k < cols; k++) {
        win(c, b.x0 + pw * (k * 2 + 1), top + ph * (r * 2 + 1), pw, ph,
            lit && (k + r) % 3 !== 1);
      }
    }
    /* the ground floor reads darker, the way a shopfront or a lobby does */
    var g = c.createLinearGradient(0, b.y0 - base, 0, b.y0);
    g.addColorStop(0, 'rgba(0,0,0,.10)');
    g.addColorStop(1, 'rgba(0,0,0,.26)');
    c.fillStyle = g;
    c.fillRect(b.x0, b.y0 - base, b.W, base);
    c.fillStyle = 'rgba(228,222,208,.08)';
    c.fillRect(b.x0, b.y0 - base, b.W, 1.5);
  }

  /* A door with a frame and a step, so the front of a building has a
     front. */
  function door(c, b, atX, wFrac, hFrac) {
    var dw = b.W * (wFrac || 0.17), dh = b.H * (hFrac || 0.62);
    var x = b.x0 + b.W * atX - dw / 2, y = b.y0 - dh;
    c.fillStyle = 'rgba(226,222,210,.13)';
    c.fillRect(x - 2, y - 2, dw + 4, dh + 2);
    c.fillStyle = 'rgba(14,16,18,.92)';
    c.fillRect(x, y, dw, dh);
    c.fillStyle = 'rgba(96,92,84,.55)';
    c.fillRect(x + 1.5, y + 2, dw - 3, dh * 0.45);
    c.fillStyle = 'rgba(180,176,164,.22)';
    c.fillRect(x - 3, b.y0 - 2, dw + 6, 2.5);
  }

  /* Sandbags along a wall base - the compound's signature. */
  function sandbags(c, b, n) {
    for (var i = 0; i < n; i++) {
      var t = (i + 0.5) / n;
      var sx = b.x0 + 6 + t * (b.W - 12);
      c.fillStyle = Z.rgb(Z.mix([124, 114, 88], [92, 84, 62], (i % 3) / 3));
      c.beginPath();
      c.ellipse(sx, b.y0 - 5, 11, 6.5, 0, 0, Z.TAU);
      c.fill();
      c.strokeStyle = 'rgba(8,10,10,.4)'; c.lineWidth = 1; c.stroke();
    }
  }

  /* ------------------------------------------------------------------ *
   * Props
   * ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ *
   * Trees
   *
   * The canopy is ONE silhouette, not a pile of circles. Drawing each
   * lobe with its own radial gradient is exactly what made the old tree
   * read as a bunch of green balls: every lobe got its own highlight, so
   * the eye counted spheres instead of seeing foliage. Here the lobes are
   * unioned into a single path, filled with one directional gradient, and
   * only then broken up from the inside with clump shadows and a lit
   * crown. Same geometry, completely different read.
   * ------------------------------------------------------------------ */
  /* An outline for a union-of-ellipses silhouette. Stroking the path
     directly also strokes every interior arc, which drew circles all over
     the foliage. Stroking it underneath the already-painted canopy means
     only the part that sticks out past the edge is ever seen. */
  function canopyEdge(c, lobes, col, wide) {
    c.save();
    c.globalCompositeOperation = 'destination-over';
    canopyPath(c, lobes);
    c.strokeStyle = col;
    c.lineWidth = wide;
    c.lineJoin = 'round';
    c.stroke();
    c.fillStyle = col;
    c.fill();
    c.restore();
  }

  function canopyPath(c, lobes) {
    c.beginPath();
    for (var i = 0; i < lobes.length; i++) {
      var L = lobes[i];
      c.moveTo(L[0] + L[2], L[1]);
      c.ellipse(L[0], L[1], L[2], L[3], 0, 0, Z.TAU);
    }
  }

  function drawTree(c, ox, oy, v, pine) {
    var seed = Math.round(v * 977);
    var lean = (Z.hash2(seed, 5, 41) - 0.5) * 0.16;

    if (pine) return drawPine(c, ox, oy, v, seed, lean);

    var trunkH = 1.35 + Z.hash2(seed, 1, 17) * 0.45;
    var bark = [58, 44, 31];
    var tw = 0.085 * PPM;

    /* trunk: wider at the base, leaning slightly, with a root flare */
    var topX = ox + lean * PPM, topY = oy - trunkH * PPM;
    var g = c.createLinearGradient(ox - tw, 0, ox + tw, 0);
    g.addColorStop(0, Z.rgb(Z.shade(bark, 0.30)));
    g.addColorStop(0.45, Z.rgb(bark));
    g.addColorStop(1, Z.rgb(Z.shade(bark, -0.44)));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(ox - tw * 1.5, oy);
    c.quadraticCurveTo(ox - tw * 0.9, oy - trunkH * PPM * 0.4, topX - tw * 0.5, topY);
    c.lineTo(topX + tw * 0.5, topY);
    c.quadraticCurveTo(ox + tw * 0.9, oy - trunkH * PPM * 0.4, ox + tw * 1.5, oy);
    c.closePath();
    c.fill();
    /* bark grain */
    c.strokeStyle = 'rgba(20,14,9,.32)';
    c.lineWidth = 1;
    for (var bi = 0; bi < 3; bi++) {
      var bx = ox + (bi - 1) * tw * 0.7;
      c.beginPath();
      c.moveTo(bx, oy - 3);
      c.lineTo(bx + lean * PPM * 0.8, topY + 4);
      c.stroke();
    }

    /* two branches climbing into the crown */
    c.strokeStyle = Z.rgb(Z.shade(bark, -0.2));
    c.lineCap = 'round';
    for (var br = 0; br < 2; br++) {
      var side = br ? 1 : -1;
      c.lineWidth = 4.2;
      c.beginPath();
      c.moveTo(topX, topY + 10);
      c.quadraticCurveTo(topX + side * 0.28 * PPM, topY - 0.05 * PPM,
                         topX + side * 0.40 * PPM, topY - 0.24 * PPM);
      c.stroke();
    }
    c.lineWidth = 1;

    /* --- canopy --- */
    var base = [54, 74, 42];
    base = Z.mix(base, [76, 70, 34], Z.hash2(seed, 7, 23) * 0.5);   /* some are turning */
    var cx = topX, cy = topY - 0.62 * PPM;
    var lobes = [];
    var N = 6;
    for (var k = 0; k < N; k++) {
      var a = (k / N) * Z.TAU + v * 5.1;
      var spread = 0.40 + Z.hash2(seed, k, 31) * 0.26;
      var rr = (0.44 + Z.hash2(seed, k * 3, 37) * 0.26) * PPM;
      lobes.push([cx + Math.cos(a) * spread * PPM,
                  cy + Math.sin(a) * spread * PPM * 0.72,
                  rr, rr * 0.88]);
    }
    lobes.push([cx, cy - 0.06 * PPM, 0.62 * PPM, 0.54 * PPM]);

    /* one silhouette, one light */
    canopyPath(c, lobes);
    var cg = c.createLinearGradient(cx - 0.9 * PPM, cy - 0.9 * PPM,
                                    cx + 0.8 * PPM, cy + 0.8 * PPM);
    cg.addColorStop(0, Z.rgb(Z.shade(base, 0.46)));
    cg.addColorStop(0.40, Z.rgb(Z.shade(base, 0.10)));
    cg.addColorStop(1, Z.rgb(Z.shade(base, -0.46)));
    c.fillStyle = cg;
    c.fill();

    /* break the mass up from the inside, clipped to the silhouette */
    c.save();
    canopyPath(c, lobes);
    c.clip();
    /* clump shadows under the lower-right of each lobe */
    for (var q = 0; q < lobes.length; q++) {
      var L = lobes[q];
      c.fillStyle = 'rgba(14,26,12,.22)';
      c.beginPath();
      c.ellipse(L[0] + L[2] * 0.26, L[1] + L[3] * 0.34, L[2] * 0.82, L[3] * 0.72, 0, 0, Z.TAU);
      c.fill();
    }
    /* a lit crown across the top-left */
    var hg = c.createLinearGradient(cx - 0.8 * PPM, cy - 0.9 * PPM, cx, cy + 0.1 * PPM);
    hg.addColorStop(0, 'rgba(186,204,126,.30)');
    hg.addColorStop(1, 'rgba(186,204,126,0)');
    c.fillStyle = hg;
    c.fillRect(cx - 1.3 * PPM, cy - 1.3 * PPM, 2.6 * PPM, 2.6 * PPM);
    /* leaf speckle */
    for (var sp = 0; sp < 22; sp++) {
      var sa = Z.hash2(seed, sp, 53) * Z.TAU;
      var sr = Math.sqrt(Z.hash2(seed, sp * 3, 59)) * 0.9 * PPM;
      var sx = cx + Math.cos(sa) * sr, sy = cy + Math.sin(sa) * sr * 0.78;
      var up = Z.hash2(seed, sp * 5, 61) > 0.5;
      c.fillStyle = up ? 'rgba(160,184,104,.22)' : 'rgba(22,38,18,.20)';
      c.beginPath();
      c.ellipse(sx, sy, 3.4, 2.4, sa, 0, Z.TAU);
      c.fill();
    }
    c.restore();

    canopyEdge(c, lobes, 'rgba(12,24,12,.62)', 3.2);
  }

  function drawPine(c, ox, oy, v, seed, lean) {
    var bark = [52, 38, 26];
    var trunkH = 0.75;
    c.fillStyle = Z.rgb(bark);
    c.beginPath();
    c.moveTo(ox - 0.075 * PPM, oy);
    c.lineTo(ox - 0.04 * PPM, oy - (trunkH + 2.6) * PPM);
    c.lineTo(ox + 0.04 * PPM, oy - (trunkH + 2.6) * PPM);
    c.lineTo(ox + 0.075 * PPM, oy);
    c.closePath();
    c.fill();

    var base = Z.mix([36, 58, 40], [46, 62, 36], Z.hash2(seed, 2, 13));
    var tiers = 5;
    /* the whole cone as one silhouette */
    c.beginPath();
    for (var i = 0; i < tiers; i++) {
      var y = oy - (trunkH + i * 0.56) * PPM;
      var w = (1.24 - i * 0.21) * PPM;
      var top = y - 0.92 * PPM;
      c.moveTo(ox - w, y);
      c.quadraticCurveTo(ox - w * 0.34, y + 5, ox + lean * PPM * (i * 0.2), top);
      c.quadraticCurveTo(ox + w * 0.34, y + 5, ox + w, y);
      c.quadraticCurveTo(ox, y + 10, ox - w, y);
    }
    var cg = c.createLinearGradient(ox - 1.2 * PPM, oy - 3.4 * PPM, ox + 1.1 * PPM, oy);
    cg.addColorStop(0, Z.rgb(Z.shade(base, 0.44)));
    cg.addColorStop(0.42, Z.rgb(base));
    cg.addColorStop(1, Z.rgb(Z.shade(base, -0.48)));
    c.fillStyle = cg;
    c.fill();
    c.strokeStyle = 'rgba(8,18,10,.48)';
    c.lineWidth = 1.2;
    c.stroke();

    /* shadow under each skirt so the tiers separate */
    c.save();
    c.beginPath();
    for (var j = 0; j < tiers; j++) {
      var y2 = oy - (trunkH + j * 0.56) * PPM;
      var w2 = (1.24 - j * 0.21) * PPM;
      c.moveTo(ox - w2, y2);
      c.quadraticCurveTo(ox - w2 * 0.34, y2 + 5, ox, y2 - 0.92 * PPM);
      c.quadraticCurveTo(ox + w2 * 0.34, y2 + 5, ox + w2, y2);
      c.quadraticCurveTo(ox, y2 + 10, ox - w2, y2);
    }
    c.clip();
    for (var t = 0; t < tiers; t++) {
      var yy = oy - (trunkH + t * 0.56) * PPM;
      var ww = (1.24 - t * 0.21) * PPM;
      var sg = c.createLinearGradient(0, yy - 12, 0, yy + 6);
      sg.addColorStop(0, 'rgba(10,22,12,0)');
      sg.addColorStop(1, 'rgba(10,22,12,.38)');
      c.fillStyle = sg;
      c.fillRect(ox - ww, yy - 12, ww * 2, 18);
    }
    c.restore();
  }

  function drawDead(c, ox, oy, v) {
    var col = [74, 66, 54];
    c.strokeStyle = Z.rgb(col);
    c.lineCap = 'round';
    c.lineWidth = 7;
    c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + (v - 0.5) * 12, oy - 2.4 * PPM); c.stroke();
    c.lineWidth = 4;
    for (var i = 0; i < 5; i++) {
      var t = 0.35 + i * 0.14;
      var bx = ox + (v - 0.5) * 12 * t, by = oy - t * 2.4 * PPM;
      var dir = i % 2 ? 1 : -1;
      c.beginPath();
      c.moveTo(bx, by);
      c.lineTo(bx + dir * (0.30 + Z.hash1(i + v * 40, 2) * 0.35) * PPM, by - (0.3 + Z.hash1(i, 6) * 0.4) * PPM);
      c.stroke();
    }
    c.lineWidth = 1;
  }

  function drawRock(c, ox, oy, v) {
    var seed = Math.round(v * 733);
    /* Darker than it looks in isolation: a boulder lying on grass should
       sit into the scene, not read as a white pebble. */
    var col = Z.mix([82, 80, 76], [96, 92, 84], Z.hash2(seed, 9, 7));
    var cy = oy - 0.34 * PPM;
    var n = 7, pts = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Z.TAU - 0.4;
      var rr = (0.40 + Z.hash2(seed, i, 11) * 0.24) * PPM;
      pts.push([ox + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.66]);
    }
    /* body */
    var g = c.createLinearGradient(ox - 0.6 * PPM, cy - 0.5 * PPM,
                                   ox + 0.5 * PPM, cy + 0.4 * PPM);
    g.addColorStop(0, Z.rgb(Z.shade(col, 0.34)));
    g.addColorStop(0.5, Z.rgb(col));
    g.addColorStop(1, Z.rgb(Z.shade(col, -0.46)));
    c.fillStyle = g;
    c.beginPath();
    pts.forEach(function (pt, i) { i ? c.lineTo(pt[0], pt[1]) : c.moveTo(pt[0], pt[1]); });
    c.closePath();
    c.fill();

    /* Facets: triangles from a high point out to the rim. A boulder is
       cleaved stone, not a smooth pebble, and the flat planes are what
       say so. */
    var apex = [ox - 0.10 * PPM, cy - 0.30 * PPM];
    for (var f = 0; f < n; f++) {
      var a2 = pts[f], b2 = pts[(f + 1) % n];
      var mid = (a2[0] + b2[0]) / 2;
      var lit = (mid - ox) / (0.6 * PPM);            /* -1 left .. 1 right */
      var k = Z.clamp01(0.5 - lit * 0.42);
      c.fillStyle = 'rgba(' + (k > 0.5 ? '210,208,192,' : '10,12,12,') +
                    (Math.abs(k - 0.5) * 0.28).toFixed(3) + ')';
      c.beginPath();
      c.moveTo(apex[0], apex[1]); c.lineTo(a2[0], a2[1]); c.lineTo(b2[0], b2[1]);
      c.closePath();
      c.fill();
    }
    /* cracks */
    c.strokeStyle = 'rgba(14,16,16,.42)';
    c.lineWidth = 1.2;
    for (var cr = 0; cr < 2; cr++) {
      var p0 = pts[(cr * 3) % n];
      c.beginPath();
      c.moveTo(apex[0], apex[1]);
      c.lineTo((apex[0] + p0[0]) / 2 + 4, (apex[1] + p0[1]) / 2);
      c.lineTo(p0[0], p0[1]);
      c.stroke();
    }
    /* seated in the ground, not resting on it */
    c.fillStyle = 'rgba(10,12,12,.30)';
    c.beginPath();
    c.ellipse(ox, oy - 0.03 * PPM, 0.52 * PPM, 0.15 * PPM, 0, 0, Z.TAU);
    c.fill();
    c.strokeStyle = 'rgba(10,14,14,.5)';
    c.lineWidth = 1.3;
    c.beginPath();
    pts.forEach(function (pt, i) { i ? c.lineTo(pt[0], pt[1]) : c.moveTo(pt[0], pt[1]); });
    c.closePath();
    c.stroke();
    c.lineWidth = 1;
  }

  function drawRubble(c, ox, oy, v) {
    for (var i = 0; i < 9; i++) {
      var a = Z.hash1(i * 3 + v * 50, 13) * Z.TAU;
      var rr = Z.hash1(i * 7, 17);
      var x = ox + Math.cos(a) * rr * 0.55 * PPM;
      var y = oy - 0.05 * PPM + Math.sin(a) * rr * 0.30 * PPM;
      var s = (0.10 + Z.hash1(i * 11, 19) * 0.16) * PPM;
      var col = Z.mix([98, 94, 88], [64, 60, 56], Z.hash1(i, 23));
      c.fillStyle = Z.rgb(Z.shade(col, 0.12));
      c.fillRect(x - s, y - s * 0.9, s * 2, s * 0.9);
      c.fillStyle = Z.rgb(Z.shade(col, -0.30));
      c.fillRect(x - s, y, s * 2, s * 0.5);
    }
    /* a couple of bent rebar stubs */
    c.strokeStyle = 'rgba(128,84,56,.8)'; c.lineWidth = 2;
    for (var k = 0; k < 3; k++) {
      var bx = ox + (Z.hash1(k * 31 + v * 20, 3) - 0.5) * 0.8 * PPM;
      c.beginPath(); c.moveTo(bx, oy - 0.05 * PPM);
      c.quadraticCurveTo(bx + 6, oy - 0.36 * PPM, bx + 12, oy - 0.30 * PPM);
      c.stroke();
    }
    c.lineWidth = 1;
  }

  function drawCar(c, ox, oy, v) {
    var body = Z.mix([96, 46, 36], [46, 62, 78], Z.hash1(v * 80, 29));
    body = Z.mix(body, [72, 68, 62], 0.45);            /* everything is faded */
    /* wheels first, so the body sits over them */
    c.fillStyle = 'rgba(16,16,18,.95)';
    [-0.62, 0.62].forEach(function (dx) {
      c.beginPath();
      c.ellipse(ox + dx * PPM, oy - 0.08 * PPM, 0.20 * PPM, 0.14 * PPM, 0, 0, Z.TAU);
      c.fill();
    });
    var b = box(c, ox, oy - 0.06 * PPM, 1.85, 0.95, 0.56, Z.shade(body, -0.1), body, { line: true });
    /* The greenhouse.

       It was a slab with a near-black rectangle filling almost the whole
       of its face, and at the size a car is seen at in the world that is
       not a windscreen, it is a black box sitting on the roof. A cabin
       is glass set between pillars with a roof above it and a sill
       below, and none of those three are the glass. */
    var b2 = box(c, ox - 0.05 * PPM, b.yF + 1, 0.92, 0.74, 0.40,
                 Z.shade(body, -0.16), Z.shade(body, -0.04), { inset: 5 });
    var gx = b2.x0 + b2.W * 0.12, gw = b2.W * 0.76;
    var gy = b2.yF + b2.H * 0.30, gh = b2.H * 0.46;
    c.fillStyle = 'rgba(24,32,37,.8)';
    c.fillRect(gx, gy, gw, gh);
    c.fillStyle = 'rgba(196,214,224,.14)';
    c.fillRect(gx, gy, gw, gh * 0.44);
    /* the pillar between windscreen and door glass */
    c.fillStyle = Z.rgb(Z.shade(body, -0.24));
    c.fillRect(gx + gw * 0.47, gy, Math.max(1.6, gw * 0.05), gh);
    /* roof above, sill below */
    c.fillStyle = Z.rgb(Z.shade(body, 0.08));
    c.fillRect(b2.x0 + 2, b2.yF + 1.5, b2.W - 4, b2.H * 0.24);
    c.fillStyle = Z.rgb(Z.shade(body, -0.12));
    c.fillRect(b2.x0 + 2, gy + gh, b2.W - 4, b2.H * 0.2);
    /* rust streaks */
    c.fillStyle = 'rgba(122,62,28,.30)';
    for (var i = 0; i < 5; i++) {
      var rx = b.x0 + Z.hash1(i * 9 + v * 30, 31) * b.W;
      c.fillRect(rx, b.yF + b.H * 0.35, 3, b.H * 0.6);
    }
    /* one headlight left intact */
    c.fillStyle = 'rgba(210,214,200,.5)';
    c.fillRect(b.x1 - 9, b.yF + b.H * 0.3, 6, 5);
  }

  function drawScrap(c, ox, oy, v) {
    for (var i = 0; i < 12; i++) {
      var a = Z.hash1(i * 5 + v * 44, 37) * Z.TAU;
      var rr = Z.hash1(i * 3, 41);
      var x = ox + Math.cos(a) * rr * 0.52 * PPM;
      var y = oy - 0.02 * PPM + Math.sin(a) * rr * 0.26 * PPM - rr * 0.22 * PPM;
      var w = (0.10 + Z.hash1(i * 7, 43) * 0.26) * PPM;
      var h = (0.05 + Z.hash1(i * 13, 47) * 0.10) * PPM;
      var col = Z.mix([132, 138, 144], [116, 74, 46], Z.hash1(i, 53));
      c.save();
      c.translate(x, y);
      c.rotate((Z.hash1(i * 17, 59) - 0.5) * 1.4);
      c.fillStyle = Z.rgb(Z.shade(col, 0.16));
      c.fillRect(-w, -h, w * 2, h);
      c.fillStyle = Z.rgb(Z.shade(col, -0.32));
      c.fillRect(-w, 0, w * 2, h);
      c.restore();
    }
  }

  function drawBush(c, ox, oy, v) {
    /* A shrub is a heap of small leaf clusters, not one smooth lozenge
       with a gradient over it - at sprite size a wash averages straight
       back out to a blob. So the clusters ARE the drawing, and the
       silhouette is built from the same clusters swollen a little: that
       way the dark shows only in the crevices between them and round the
       outside, and there is never a bare halo of it. */
    var seed = Math.round(v * 613);
    var dry = Z.hash2(seed, 9, 17) > 0.70;
    var dark = dry ? [62, 54, 32] : [24, 40, 22];
    var lit = dry ? [176, 158, 96] : [130, 166, 78];

    /* the shadow it sits in */
    c.fillStyle = 'rgba(14,20,12,.26)';
    c.beginPath();
    c.ellipse(ox, oy - 2, 0.28 * PPM, 0.10 * PPM, 0, 0, Z.TAU);
    c.fill();

    /* the woody frame, mostly buried by what grows on it */
    c.strokeStyle = 'rgba(48,38,24,.9)';
    for (var st = 0; st < 5; st++) {
      var sa = -Math.PI / 2 + (Z.hash2(seed, st, 53) - 0.5) * 1.8;
      c.lineWidth = 2.6 - st * 0.35;
      c.beginPath();
      c.moveTo(ox + (Z.hash2(seed, st, 59) - 0.5) * 5, oy - 2);
      c.quadraticCurveTo(ox + Math.cos(sa) * 0.05 * PPM, oy - 0.13 * PPM,
                         ox + Math.cos(sa) * 0.17 * PPM,
                         oy - 0.19 * PPM + Math.sin(sa) * 0.09 * PPM);
      c.stroke();
    }
    c.lineWidth = 1;

    /* the clusters: position, size, tilt - back to front */
    var cy0 = oy - 0.19 * PPM;
    var cl = [];
    for (var k = 0; k < 30; k++) {
      var ka = Z.hash2(seed, k, 101) * Z.TAU;
      var kr = Math.sqrt(Z.hash2(seed, k, 103)) * 0.22 * PPM;
      cl.push([ox + Math.cos(ka) * kr,
               cy0 + Math.sin(ka) * kr * 0.62,
               (0.055 + Z.hash2(seed, k, 107) * 0.040) * PPM,
               (Z.hash2(seed, k, 109) - 0.5) * 1.2]);
    }
    cl.sort(function (p, q) { return p[1] - q[1]; });

    /* one path of every cluster swollen - this is the silhouette */
    c.beginPath();
    cl.forEach(function (p) {
      c.moveTo(p[0] + p[2] * 1.26, p[1]);
      c.ellipse(p[0], p[1], p[2] * 1.26, p[2] * 0.96, p[3], 0, Z.TAU);
    });
    c.fillStyle = Z.rgb(dark);
    c.fill();

    /* and the lit face of each one on top of it */
    cl.forEach(function (p, ki) {
      /* how much light this clump catches: high and to the left wins */
      var t = Z.clamp01(0.16 +
        ((oy - 0.10 * PPM) - p[1]) / (0.24 * PPM) * 0.72 +
        ((ox - p[0]) / (0.34 * PPM)) * 0.24);
      c.fillStyle = Z.rgb(Z.mix(dark, lit, t));
      c.beginPath();
      c.ellipse(p[0], p[1], p[2], p[2] * 0.74, p[3], 0, Z.TAU);
      c.fill();
      if (t > 0.66) {
        c.fillStyle = 'rgba(' + (dry ? '228,214,152' : '180,214,118') + ',.42)';
        c.beginPath();
        c.ellipse(p[0] - p[2] * 0.26, p[1] - p[2] * 0.30,
                  p[2] * 0.44, p[2] * 0.28, p[3], 0, Z.TAU);
        c.fill();
      }
      if (ki % 3 === 0) {
        c.fillStyle = 'rgba(10,18,10,.20)';
        c.beginPath();
        c.ellipse(p[0] + p[2] * 0.20, p[1] + p[2] * 0.44,
                  p[2] * 0.58, p[2] * 0.24, p[3], 0, Z.TAU);
        c.fill();
      }
    });

    /* seed heads on the dry ones, a berry or two on the rest */
    for (var b = 0; b < 2; b++) {
      var bx = ox + (Z.hash2(seed, b, 79) - 0.5) * 0.24 * PPM;
      var by = cy0 + (Z.hash2(seed, b, 83) - 0.7) * 0.10 * PPM;
      c.fillStyle = dry ? 'rgba(208,192,136,.6)' : 'rgba(150,54,48,.65)';
      c.beginPath(); c.arc(bx, by, 1.3, 0, Z.TAU); c.fill();
    }
    /* twigs poking out of the bottom, and litter round the base */
    c.strokeStyle = 'rgba(44,34,22,.6)';
    for (var t2 = 0; t2 < 3; t2++) {
      var tx = ox + (Z.hash2(seed, t2, 37) - 0.5) * 0.36 * PPM;
      c.beginPath();
      c.moveTo(tx, oy - 2);
      c.lineTo(tx + (Z.hash2(seed, t2, 41) - 0.5) * 8, oy - 0.17 * PPM);
      c.stroke();
    }
    c.fillStyle = dry ? 'rgba(120,102,62,.30)' : 'rgba(44,58,34,.30)';
    for (var l = 0; l < 5; l++) {
      c.fillRect(ox + (Z.hash2(seed, l, 89) - 0.5) * 0.46 * PPM,
                 oy - 1 - Z.hash2(seed, l, 97) * 4, 2.4, 1.6);
    }
  }

  function drawBuilding3(c, ox, oy, w, d, h, wall, roofCol, lit, v, kind) {
    /* Centred on its footprint in depth, not stood at the front of it.

       box() grows backwards from its origin, so a building drawn from the
       prop's own position sat entirely behind the tiles it occupies. You
       could not see it while the walls were solid; the moment the roof
       came off and the floor showed through, the floor and the house were
       a metre and a half apart. */
    oy += d * PPM * PITCH * 0.5;
    plinth(c, ox, oy, w + 0.25, d, [86, 84, 78]);
    var b = box(c, ox, oy - 0.10 * PPM, w, d, h, roofCol, wall, { line: true });
    winRow(c, b, kind === 'store' ? 4 : 3, h > 2.6 ? 2 : 1, lit);
    var dfrac = 0.24 + Z.hash2(Math.round(v * 97), 3, 71) * 0.5;
    door(c, b, dfrac, 0.15, 0.58);
    /* a step up to it, and a number beside it */
    c.fillStyle = 'rgba(120,116,106,.9)';
    c.fillRect(b.x0 + b.W * dfrac - 4, b.y0 - 5, b.W * 0.15 + 8, 5);
    c.fillStyle = 'rgba(214,210,198,.45)';
    c.fillRect(b.x0 + b.W * dfrac + b.W * 0.17, b.yF + b.H * 0.52, 5, 7);

    /* damage: a hole punched through one wall, with daylight behind it */
    if (v > 0.45) {
      var hx = b.x0 + b.W * (0.12 + v * 0.6), hy = b.yF + b.H * 0.42;
      c.fillStyle = 'rgba(8,10,12,.82)';
      c.beginPath();
      c.moveTo(hx, hy);
      for (var i = 1; i <= 7; i++) {
        var a2 = (i / 7) * Z.TAU;
        c.lineTo(hx + Math.cos(a2) * (11 + Z.hash2(i * 3, Math.round(v * 9), 73) * 13),
                 hy + Math.sin(a2) * (9 + Z.hash2(i * 5, 1, 79) * 10));
      }
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(226,222,210,.10)'; c.lineWidth = 1.4; c.stroke();
    }

    /* streaked weathering down from the sills */
    c.fillStyle = 'rgba(28,26,22,.16)';
    for (var st = 0; st < 5; st++) {
      var sx = b.x0 + b.W * (0.1 + st * 0.2);
      c.fillRect(sx, b.yF + b.H * 0.3, 2.5, b.H * 0.62);
    }

    if (kind === 'depot') {
      c.fillStyle = 'rgba(112,106,94,.92)';
      c.fillRect(b.x0 + b.W * 0.34, b.y0 - 1.3 * PPM, b.W * 0.32, 1.3 * PPM);
      c.strokeStyle = 'rgba(28,30,28,.5)';
      for (var sh = 0; sh < 9; sh++) {
        c.beginPath();
        c.moveTo(b.x0 + b.W * 0.34, b.y0 - 1.3 * PPM + sh * 8);
        c.lineTo(b.x0 + b.W * 0.66, b.y0 - 1.3 * PPM + sh * 8);
        c.stroke();
      }
      flatRoof(c, b, roofCol, true);
    } else {
      /* Gutter, downpipe, a chimney and an aerial. Four marks, and the
         difference between a shed and a house somebody lived in. */
      c.fillStyle = 'rgba(58,54,48,.75)';
      c.fillRect(b.x0 - 2, b.yF - 3, b.W + 4, 3);
      var dp = b.x0 + b.W * (0.06 + Z.hash2(Math.round(v * 61), 5, 23) * 0.08);
      c.fillRect(dp, b.yF, 3, b.H);
      c.fillStyle = 'rgba(78,72, 64,.9)';
      var cx2 = b.x0 + b.W * (0.66 + Z.hash2(Math.round(v * 53), 9, 31) * 0.2);
      c.fillRect(cx2, b.yF - 0.95 * PPM, 0.30 * PPM, 0.95 * PPM);
      c.fillStyle = 'rgba(48,46,42,.95)';
      c.fillRect(cx2 - 2, b.yF - 1.02 * PPM, 0.30 * PPM + 4, 6);
      c.strokeStyle = 'rgba(44,44,42,.8)';
      c.lineWidth = 1.6;
      var ax = b.x0 + b.W * 0.22;
      c.beginPath();
      c.moveTo(ax, b.yF); c.lineTo(ax, b.yF - 0.70 * PPM);
      c.moveTo(ax - 7, b.yF - 0.56 * PPM); c.lineTo(ax + 7, b.yF - 0.56 * PPM);
      c.moveTo(ax - 5, b.yF - 0.66 * PPM); c.lineTo(ax + 5, b.yF - 0.66 * PPM);
      c.stroke();
      c.lineWidth = 1;
      hipRoof(c, ox, b.yF, w + 0.3, d, 0.55, Z.shade(roofCol, -0.22));
      /* chimney */
      if (v > 0.3) {
        c.fillStyle = Z.rgb(Z.shade(wall, -0.24));
        c.fillRect(b.x0 + b.W * 0.72, b.yF - 0.75 * PPM, 0.22 * PPM, 0.5 * PPM);
        c.fillStyle = Z.rgb(Z.shade(wall, 0.12));
        c.fillRect(b.x0 + b.W * 0.72 - 2, b.yF - 0.78 * PPM, 0.22 * PPM + 4, 4);
      }
    }
    return b;
  }

  var PROP_ART = {
    tree:     { w: 2.6, h: 4.0, f: function (c, x, y, v) { drawTree(c, x, y, v, false); } },
    pine:     { w: 2.6, h: 4.6, f: function (c, x, y, v) { drawTree(c, x, y, v, true); } },
    deadtree: { w: 2.0, h: 3.2, f: drawDead },
    bush:     { w: 1.4, h: 1.0, f: drawBush },
    rock:     { w: 1.6, h: 1.2, f: drawRock },
    rubble:   { w: 2.0, h: 1.2, f: drawRubble },
    car:      { w: 2.6, h: 1.8, f: drawCar },
    scrap:    { w: 1.8, h: 1.2, f: drawScrap },
    barrel:   { w: 1.0, h: 1.4, f: function (c, x, y, v) {
      cyl(c, x, y, 0.28, 0.92, Z.mix([126, 82, 40], [70, 88, 84], Z.hash1(v * 21, 83)), [92, 92, 88]);
      c.fillStyle = 'rgba(0,0,0,.22)';
      c.fillRect(x - 0.28 * PPM, y - 0.62 * PPM, 0.56 * PPM, 4);
      c.fillRect(x - 0.28 * PPM, y - 0.30 * PPM, 0.56 * PPM, 4);
    } },
    crate:    { w: 1.2, h: 1.1, f: function (c, x, y, v) {
      var b = box(c, x, y, 0.78, 0.68, 0.64, [132, 102, 60], [110, 82, 48],
                  { seam: false });
      /* it is made of boards, so show the boards */
      for (var p = 1; p < 4; p++) {
        c.fillStyle = 'rgba(58,40,22,.34)';
        c.fillRect(b.x0, b.yF + b.H * p / 4, b.W, 1.6);
        c.fillStyle = 'rgba(255,238,200,.09)';
        c.fillRect(b.x0, b.yF + b.H * p / 4 + 1.6, b.W, 1);
      }
      /* corner battens and the diagonal brace across the face */
      c.fillStyle = 'rgba(148,116,68,.85)';
      c.fillRect(b.x0 + 1, b.yF, 4, b.H);
      c.fillRect(b.x1 - 5, b.yF, 4, b.H);
      c.strokeStyle = 'rgba(146,114,66,.9)'; c.lineWidth = 4;
      c.beginPath();
      c.moveTo(b.x0 + 4, b.y0 - 2); c.lineTo(b.x1 - 4, b.yF + 2);
      c.stroke();
      c.strokeStyle = 'rgba(58,40,22,.4)'; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(b.x0 + 4, b.y0 - 2); c.lineTo(b.x1 - 4, b.yF + 2);
      c.stroke();
      /* nail heads where the brace crosses the battens */
      c.fillStyle = 'rgba(40,36,30,.6)';
      [[b.x0 + 3, b.y0 - 4], [b.x1 - 3, b.yF + 4],
       [b.x0 + 3, b.yF + 4], [b.x1 - 3, b.y0 - 4]].forEach(function (pt) {
        c.beginPath(); c.arc(pt[0], pt[1], 1.4, 0, Z.TAU); c.fill();
      });
      /* one slat sprung, showing the dark inside - it has been opened */
      if (Z.hash1(Math.round(v * 977), 43) > 0.5) {
        c.fillStyle = 'rgba(14,12,10,.75)';
        c.fillRect(b.x0 + 9, b.yF + b.H * 0.54, b.W - 20, 4.5);
        c.save();
        c.translate(b.x0 + 9, b.yF + b.H * 0.545);
        c.rotate(-0.11);
        c.fillStyle = 'rgb(118,90,52)';
        c.fillRect(0, 0, b.W - 22, 4.2);
        c.fillStyle = 'rgba(255,238,200,.16)';
        c.fillRect(0, 0, b.W - 22, 1.2);
        c.restore();
      }
      /* stencils: a stripe, a crate number, and a fragile arrow */
      c.fillStyle = 'rgba(206,124,48,.8)';
      c.fillRect(b.x0 + 5, b.yF + 5, 11, 3);
      c.fillStyle = 'rgba(232,226,208,.32)';
      c.fillRect(b.x0 + b.W * 0.30, b.yF + b.H * 0.70, b.W * 0.40, 3);
      c.fillRect(b.x0 + b.W * 0.30, b.yF + b.H * 0.70 + 5, b.W * 0.22, 2.4);
      /* lid boards on the top face */
      c.fillStyle = 'rgba(0,0,0,.18)';
      c.fillRect(b.x0, b.yB + b.D * 0.5, b.W, 1.6);
    } },
    locker:   { w: 1.0, h: 1.9, f: function (c, x, y, v) {
      var b = box(c, x, y, 0.58, 0.46, 1.42, [96, 104, 108], [82, 90, 96]);
      c.fillStyle = 'rgba(20,24,26,.5)';
      c.fillRect(b.x0 + b.W / 2 - 1, b.yF + 4, 2, b.H - 8);
      c.fillStyle = 'rgba(226,226,214,.35)';
      c.fillRect(b.x0 + b.W * 0.62, b.yF + b.H * 0.45, 5, 2);
    } },
    corpse:   { w: 1.4, h: 0.7, f: function (c, x, y, v) {
      c.fillStyle = 'rgba(78,74,66,.95)';
      c.beginPath(); c.ellipse(x, y - 4, 0.42 * PPM, 0.16 * PPM, 0.2, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgba(52,50,44,.95)';
      c.beginPath(); c.ellipse(x - 0.28 * PPM, y - 7, 0.13 * PPM, 0.11 * PPM, 0, 0, Z.TAU); c.fill();
      c.strokeStyle = 'rgba(30,28,24,.6)'; c.lineWidth = 1.2;
      c.beginPath(); c.ellipse(x, y - 4, 0.42 * PPM, 0.16 * PPM, 0.2, 0, Z.TAU); c.stroke();
    } },
    lamp:     { w: 1.4, h: 4.8, f: function (c, x, y, v) {
      c.fillStyle = 'rgba(66,70,72,1)';
      c.fillRect(x - 3, y - 4.2 * PPM, 6, 4.2 * PPM);
      c.beginPath();
      c.moveTo(x, y - 4.2 * PPM);
      c.quadraticCurveTo(x + 22, y - 4.4 * PPM, x + 30, y - 4.1 * PPM);
      c.lineWidth = 5; c.strokeStyle = 'rgba(66,70,72,1)'; c.stroke(); c.lineWidth = 1;
      c.fillStyle = 'rgba(40,44,46,1)';
      c.fillRect(x + 24, y - 4.1 * PPM, 12, 5);
    } },
    ruin:     { w: 4.8, h: 4.4, deep: 3.4, f: function (c, x, y, v) {
      drawBuilding3(c, x, y, 3.8, 3.4, 2.6, [104, 96, 84], [84, 74, 66], false, v, 'ruin');
    } },
    store:    { w: 5.8, h: 4.6, deep: 3.4, f: function (c, x, y, v) {
      var b = drawBuilding3(c, x, y, 4.8, 3.4, 2.9, [100, 104, 100], [116, 112, 100], v > 0.6, v, 'store');
      c.fillStyle = 'rgba(180,70,44,.55)';
      c.fillRect(b.x0 + 6, b.yF + 6, b.W - 12, 10);
    } },
    depotRu:  { w: 6.8, h: 5.4, deep: 4.2, f: function (c, x, y, v) {
      drawBuilding3(c, x, y, 5.8, 4.2, 3.3, [92, 94, 96], [104, 102, 96], false, v, 'depot');
    } },

    /* ---- downtown ---- */
    block:    { w: 6.6, h: 8.4, deep: 4.2, f: function (c, x, y, v) {
      y += 4.2 * PPM * PITCH * 0.5;   /* centre on the footprint */
      plinth(c, x, y, 5.6, 4.4, [80, 78, 72]);
      var b = box(c, x, y - 0.10 * PPM, 5.2, 4.2, 5.6,
                  [86, 88, 92], [112, 104, 92], { line: true });
      /* five storeys of windows above a ground floor that is door and
         bin store, not another row of glass */
      winRow(c, b, 6, 5, v > 0.4, 0.20);
      door(c, b, 0.42, 0.13, 0.42);
      /* the fire escape is the thing that makes it read as apartments */
      c.strokeStyle = 'rgba(46,44,42,.85)';
      c.lineWidth = 2;
      var ex = b.x0 + b.W * 0.86;
      for (var f = 1; f < 5; f++) {
        var fy = b.yF + b.H * f / 5;
        c.beginPath(); c.moveTo(ex - 16, fy); c.lineTo(ex + 10, fy); c.stroke();
      }
      c.beginPath(); c.moveTo(ex - 16, b.yF + b.H * 0.2);
      c.lineTo(ex - 16, b.y0); c.stroke();
      c.lineWidth = 1;
      flatRoof(c, b, [86, 88, 92], true);
    } },

    tower:    { w: 6.8, h: 11.6, deep: 4.6, f: function (c, x, y, v) {
      y += 4.6 * PPM * PITCH * 0.5;   /* centre on the footprint */
      plinth(c, x, y, 5.4, 4.6, [76, 76, 72]);
      var b = box(c, x, y - 0.10 * PPM, 4.8, 4.2, 8.6,
                  [78, 84, 90], [96, 102, 108], { line: true });
      /* A curtain wall rather than punched windows, stopping short of the
         lobby. The last row used to start at 95% of the way down and was
         5% tall, which put half of it on the pavement. */
      var cols = 6, rows = 9;
      var lobby = b.H * 0.13;
      var wallH = b.H - lobby;
      var wh = wallH / (rows * 1.55);
      for (var r = 0; r < rows; r++) {
        for (var k = 0; k < cols; k++) {
          var wx = b.x0 + b.W * (0.07 + k * (0.86 / (cols - 1)));
          var wy = b.yF + wallH * (0.04 + r * (0.92 / rows));
          var lit = Z.hash2(k * 7 + r * 13, Math.round(v * 31), 17) > 0.86;
          c.fillStyle = lit ? 'rgba(226,182,96,.72)' : 'rgba(26,34,42,.72)';
          c.fillRect(wx, wy, b.W * 0.11, wh);
        }
      }
      /* spandrel bands catch the light and give it floors */
      c.fillStyle = 'rgba(232,228,214,.07)';
      for (var sr = 1; sr < rows; sr++) {
        c.fillRect(b.x0, b.yF + wallH * (sr / rows), b.W, 2);
      }
      /* the lobby: glazed, and darker than the floors above it */
      c.fillStyle = 'rgba(14,20,26,.55)';
      c.fillRect(b.x0, b.y0 - lobby, b.W, lobby);
      c.fillStyle = 'rgba(178,198,214,.16)';
      for (var lk = 0; lk < 5; lk++) {
        c.fillRect(b.x0 + b.W * (0.08 + lk * 0.20), b.y0 - lobby + 2,
                   b.W * 0.13, lobby - 4);
      }
      c.fillStyle = 'rgba(232,228,214,.10)';
      c.fillRect(b.x0, b.y0 - lobby, b.W, 2);
      flatRoof(c, b, [78, 84, 90], true);
      /* the mast, which is what you actually navigate by */
      c.fillStyle = 'rgba(58,60,62,.95)';
      c.fillRect(x - 2, b.yB - 1.5 * PPM, 4, 1.5 * PPM);
      c.fillStyle = 'rgba(214,72,48,.9)';
      c.beginPath(); c.arc(x, b.yB - 1.5 * PPM, 3.4, 0, Z.TAU); c.fill();
    } },

    warehouse: { w: 8.6, h: 6.0, deep: 4.4, f: function (c, x, y, v) {
      y += 4.4 * PPM * PITCH * 0.5;   /* centre on the footprint */
      plinth(c, x, y, 7.6, 4.6, [84, 82, 76]);
      var b = box(c, x, y - 0.10 * PPM, 7.2, 4.4, 3.8,
                  [96, 94, 88], [118, 114, 104], { line: true });
      /* roller shutters along the loading face */
      for (var d = 0; d < 3; d++) {
        var dx = b.x0 + b.W * (0.10 + d * 0.31);
        var dw = b.W * 0.20, dh = b.H * 0.62;
        c.fillStyle = 'rgba(104,100,92,.95)';
        c.fillRect(dx, b.y0 - dh, dw, dh);
        c.strokeStyle = 'rgba(30,32,30,.45)';
        for (var sh = 0; sh < 8; sh++) {
          c.beginPath();
          c.moveTo(dx, b.y0 - dh + sh * (dh / 8));
          c.lineTo(dx + dw, b.y0 - dh + sh * (dh / 8));
          c.stroke();
        }
        c.fillStyle = 'rgba(206,166,52,.5)';
        c.fillRect(dx, b.y0 - 3, dw, 3);
      }
      /* a sawtooth roof - the silhouette that says industry */
      c.fillStyle = Z.rgb([84, 82, 78]);
      for (var t = 0; t < 4; t++) {
        var tx = b.x0 + b.W * (t / 4);
        c.beginPath();
        c.moveTo(tx, b.yF);
        c.lineTo(tx + b.W / 8, b.yF - 0.5 * PPM);
        c.lineTo(tx + b.W / 4, b.yF);
        c.closePath(); c.fill();
      }
      flatRoof(c, b, [96, 94, 88], true);
    } }
  };

  /* ------------------------------------------------------------------ *
   * Interiors
   *
   * Drawn flat on the ground under everything, footprint-sized, and only
   * revealed when the roof above it fades. It is a floor plan rather than
   * a room: boards, the walls the mask actually blocks on, and enough
   * furniture that two houses are not the same house.
   * ------------------------------------------------------------------ */
  var FLOORS = {
    house:  { board: [104, 84, 60], grout: [70, 54, 38], wall: [126, 118, 104] },
    store:  { board: [128, 128, 124], grout: [96, 96, 92], wall: [132, 136, 132] },
    depot:  { board: [98, 98, 96], grout: [74, 74, 72], wall: [112, 112, 108] }
  };

  function furniture(c, x0, y0, tw, th, v, kind) {
    var rnd = function (n) { return Z.hash2(Math.round(v * 91), n, 29); };
    var items = kind === 'depot' ? 7 : 5;
    for (var i = 0; i < items; i++) {
      var fx = x0 + tw * (0.18 + rnd(i * 3) * 0.64);
      var fy = y0 - th * (0.22 + rnd(i * 5 + 1) * 0.56);
      var pick = rnd(i * 7 + 2);
      if (kind === 'depot' || pick > 0.72) {
        /* crates and pallets */
        box(c, fx, fy, 0.62, 0.52, 0.5, [128, 98, 58], [104, 78, 44],
            { posts: false, seam: false });
      } else if (pick > 0.46) {
        /* a table, which is the most house-shaped thing there is */
        box(c, fx, fy, 1.0, 0.62, 0.34, [118, 92, 62], [92, 70, 46],
            { posts: false, seam: false });
      } else if (pick > 0.22) {
        /* a bed or a counter, depending where you are */
        box(c, fx, fy, 0.78, 1.16, 0.26,
            kind === 'store' ? [96, 104, 110] : [150, 142, 128],
            kind === 'store' ? [72, 80, 86] : [116, 104, 92],
            { posts: false, seam: false });
      } else {
        /* a shelf against nothing in particular */
        box(c, fx, fy, 1.2, 0.34, 0.74, [110, 100, 84], [86, 78, 66],
            { posts: false, seam: false });
      }
    }
  }

  A.interior = function (kind, v, fw, fh, mask) {
    /* keyed on the mask too: the walls inside are what the plan is, and
       two buildings with the same art seed can still be laid out
       differently once the door moves */
    var mk2 = '';
    if (mask) for (var q = 0; q < mask.length; q++) mk2 += mask[q];
    var key = 'in:' + kind + ':' + Math.floor(v * 8) + ':' + fw + 'x' + fh + ':' + mk2;
    if (cache[key]) return cache[key];
    var pal = FLOORS[kind] || FLOORS.house;
    var W = Math.ceil(fw * PPM) + 8;
    var H = Math.ceil(fh * PPM * PITCH) + Math.ceil(1.4 * PPM);
    var cv = mk(W, H, W / 2, H - 4);
    var c = cv.getContext('2d');

    var tw = fw * PPM, th = fh * PPM * PITCH;
    var x0 = cv._ox - tw / 2, y0 = cv._oy;

    /* the floor */
    var g = c.createLinearGradient(0, y0 - th, 0, y0);
    g.addColorStop(0, Z.rgb(Z.shade(pal.board, 0.10)));
    g.addColorStop(1, Z.rgb(Z.shade(pal.board, -0.16)));
    c.fillStyle = g;
    c.fillRect(x0, y0 - th, tw, th);
    /* boards running the depth of the room */
    c.fillStyle = Z.rgb(pal.grout);
    for (var i = 1; i < fw * 2; i++) c.fillRect(x0 + tw * i / (fw * 2), y0 - th, 1, th);
    for (var j = 1; j < fh; j++) c.fillRect(x0, y0 - th + th * j / fh, tw, 1);

    /* the walls the mask stops you on, drawn as low stubs so you can see
       over them - this is a plan, not a first-person view */
    if (mask) {
      for (var ty = 0; ty < fh; ty++) {
        for (var tx = 0; tx < fw; tx++) {
          if (!mask[ty * fw + tx]) continue;
          var wx = x0 + tw * (tx + 0.5) / fw;
          var wy = y0 - th + th * (ty + 1) / fh;
          /* one tile is one metre, and a hair over so the run has no seam */
          box(c, wx, wy, 1.04, 1.04, 0.30,
              Z.shade(pal.wall, 0.12), pal.wall,
              { posts: false, seam: false, line: false });
        }
      }
    }

    furniture(c, x0, y0, tw, th, v, kind);

    /* the light that gets in, pooling at the door end */
    var lg = c.createLinearGradient(0, y0 - th, 0, y0);
    lg.addColorStop(0, 'rgba(6,8,10,.34)');
    lg.addColorStop(1, 'rgba(255,228,170,.07)');
    c.fillStyle = lg;
    c.fillRect(x0, y0 - th, tw, th);

    cache[key] = cv;
    return cv;
  };

  A.prop = function (kind, v) {
    var key = 'p:' + kind + ':' + Math.floor(v * 8);
    if (cache[key]) return cache[key];
    var spec = PROP_ART[kind] || PROP_ART.bush;
    var w = Math.ceil(spec.w * PPM) + 16, h = Math.ceil(spec.h * PPM) + 16;
    /* deep things now hang below their origin by half their depth */
    var below = 8 + Math.ceil((spec.deep || 0) * PPM * PITCH * 0.5);
    h += below;
    var cv = mk(w, h, w / 2, h - below);
    var c = cv.getContext('2d');
    spec.f(c, cv._ox, cv._oy, v);
    cache[key] = cv;
    return cv;
  };

  /* ------------------------------------------------------------------ *
   * Structures
   *
   * Each recipe draws into a cell sized from the building's footprint.
   * Level shows as visible upgrading: heavier materials and more of them.
   * ------------------------------------------------------------------ */
  var CONC = [118, 116, 108], CONC_D = [92, 90, 84];
  var STEEL = [116, 122, 128], STEEL_D = [78, 84, 90];
  var WOOD = [122, 94, 56], WOOD_D = [92, 68, 40];
  var DARK = [52, 56, 58];

  function tierCol(lvl, a, b2) { return Z.mix(a, b2, Z.clamp01((lvl - 1) / 6)); }

  /* The roof of a multi-tile building.

     On a 2x2 the top face is a third of the sprite, and an untextured one
     is a pale slab standing behind the building rather than a roof on it.
     Everything here exists to give that plane a surface: it falls away to
     the back, it is made of something, water has stood on it, and there
     is plant on it. */
  function roofDeck(c, b, col, kind) {
    var g = c.createLinearGradient(0, b.yB, 0, b.yF);
    g.addColorStop(0, Z.rgb(Z.shade(col, -0.26)));
    g.addColorStop(1, Z.rgb(Z.shade(col, 0.08)));
    c.fillStyle = g;
    c.fillRect(b.x0, b.yB, b.W, b.D);
    c.save();
    c.beginPath(); c.rect(b.x0, b.yB, b.W, b.D); c.clip();
    if (kind === 'gravel') {
      for (var i = 0; i < 110; i++) {
        c.fillStyle = Z.hash1(i, 197) > 0.5
          ? 'rgba(255,250,236,.08)' : 'rgba(0,0,0,.14)';
        c.fillRect(b.x0 + Z.hash1(i, 191) * b.W, b.yB + Z.hash1(i, 193) * b.D,
                   2.2, 1.6);
      }
    } else {
      for (var k = 0; k * 8 < b.W; k++) {
        c.fillStyle = 'rgba(0,0,0,.14)';
        c.fillRect(b.x0 + k * 8, b.yB, 3, b.D);
        c.fillStyle = 'rgba(255,250,236,.06)';
        c.fillRect(b.x0 + k * 8 + 3, b.yB, 2, b.D);
      }
    }
    /* standing water, and the rust ring it has left */
    c.fillStyle = 'rgba(26,34,32,.20)';
    c.beginPath();
    c.ellipse(b.x0 + b.W * 0.62, b.yB + b.D * 0.48, b.W * 0.20, b.D * 0.22,
              0, 0, Z.TAU);
    c.fill();
    c.strokeStyle = 'rgba(122,72,36,.16)';
    c.beginPath();
    c.ellipse(b.x0 + b.W * 0.62, b.yB + b.D * 0.48, b.W * 0.22, b.D * 0.25,
              0, 0, Z.TAU);
    c.stroke();
    c.restore();
    /* parapet along the back, lit on top and dark under */
    c.fillStyle = Z.rgb(Z.shade(col, 0.22));
    c.fillRect(b.x0 - 2, b.yB - 4, b.W + 4, 5);
    c.fillStyle = 'rgba(0,0,0,.30)';
    c.fillRect(b.x0 - 2, b.yB + 1, b.W + 4, 2);
    /* a plant box with a lit lid, because a flat roof always has one */
    var vx = b.x0 + b.W * 0.12, vw = b.W * 0.17, vy = b.yB + b.D * 0.22;
    c.fillStyle = Z.rgb(Z.shade(col, -0.34));
    c.fillRect(vx, vy, vw, b.D * 0.30);
    c.fillStyle = Z.rgb(Z.shade(col, 0.26));
    c.fillRect(vx, vy - 3, vw, 3.4);
    c.fillStyle = 'rgba(0,0,0,.22)';
    c.fillRect(vx, vy + b.D * 0.30, vw, 2);
  }

  /* Tread plate on the top face of a box.

     A two-tile emplacement has a deck the size of a small room, and an
     untextured one reads as a grey wall standing behind the weapon
     rather than as a floor under it. Diamonds, a bolt line round the
     edge, and a gradient falling off to the back fix that. */
  function deckPlate(c, b, tint) {
    var g = c.createLinearGradient(0, b.yB, 0, b.yF);
    g.addColorStop(0, 'rgba(0,0,0,.30)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(b.x0, b.yB, b.W, b.D);
    c.save();
    c.beginPath(); c.rect(b.x0, b.yB, b.W, b.D); c.clip();
    for (var r = 0; r * 7 < b.D; r++) {
      for (var k = 0; k * 9 < b.W + 9; k++) {
        var dx = b.x0 + k * 9 + (r & 1 ? 4.5 : 0);
        var dy = b.yB + r * 7 + 3;
        c.fillStyle = 'rgba(255,250,236,.07)';
        c.beginPath();
        c.moveTo(dx, dy - 2.4); c.lineTo(dx + 3, dy);
        c.lineTo(dx, dy + 2.4); c.lineTo(dx - 3, dy);
        c.closePath(); c.fill();
        c.fillStyle = 'rgba(0,0,0,.14)';
        c.fillRect(dx - 3, dy + 2, 6, 1);
      }
    }
    c.restore();
    /* bolts round the rim, and a panel seam across the middle */
    c.fillStyle = 'rgba(160,168,174,.35)';
    for (var bt = 0; bt * 16 < b.W; bt++) {
      c.fillRect(b.x0 + 4 + bt * 16, b.yB + 2, 2, 2);
      c.fillRect(b.x0 + 4 + bt * 16, b.yF - 4, 2, 2);
    }
    c.fillStyle = 'rgba(0,0,0,.18)';
    c.fillRect(b.x0, b.yB + b.D * 0.55, b.W, 1.6);
    if (tint) { c.fillStyle = tint; c.fillRect(b.x0, b.yB, b.W, b.D); }
  }

  var BUILD_ART = {
    wall: function (c, x, y, lvl) {
      /* Measured against the ground it stands on, the old timber came out
         at rgb(145,130,94) where the dirt was rgb(149,134,97) - four
         levels apart in every channel, which is to say the same colour.
         No amount of plank, grain or knot survives that: the detail was
         there and simply had nowhere to read, and a wall you cannot pick
         out from the field behind it is what "flat box" actually meant.

         Timber is darker and browner than dry earth, so this is what it
         should have been anyway. The top is barely lifted rather than
         lifted an eighth, because that lightening was pushing the largest
         surface of the wall straight back into the ground's tone. */
      var col = Z.shade(tierCol(lvl, WOOD, CONC), -0.34);
      var h = 0.82 + lvl * 0.03;
      var a = runPiece(c, x, y, h, Z.shade(col, 0.03), col,
                       { thick: 0.30, mat: lvl > 4 ? 'conc' : 'wood',
                         courses: lvl > 4 });
      /* a capping rail along the top once it is reinforced */
      if (lvl > 4) {
        var e = 0.54, t = 0.30, H = h * PPM;
        var yN = y + t * PPM * PITCH, yF = y - t * PPM * PITCH;
        c.fillStyle = 'rgba(158,166,172,.55)';
        var xa = (a.w ? -e : -t) * PPM, xb = (a.e ? e : t) * PPM;
        c.fillRect(x + xa, yF - H - 1, xb - xa, 3);
        if (a.n) c.fillRect(x - t * PPM, y - e * PPM * PITCH - H - 1, t * 2 * PPM, 3);
        if (a.s) c.fillRect(x - t * PPM, y + (e - 2 * t) * PPM * PITCH - H - 1,
                            t * 2 * PPM, 3);
      }
    },
    /* A chain-link panel, drawn for the way its run goes.

       The east-west panel is a rectangle across the tile. The north-south
       one is genuinely edge-on to this camera - a vertical plane running
       away from you has no width on screen - so it is drawn as what you
       would actually see: the near post, the far post, and the mesh
       between them, with the panel's own thickness giving it a face. The
       previous version sheared a flat panel sideways to fake the turn,
       which left it hanging off its tile at an angle that met nothing. */
    fence: function (c, x, y, lvl) {
      var run = runOf();
      var ns = run.ns && !run.ew;
      var H = 1.0 * PPM;
      var post = Z.rgb(STEEL_D);
      var wire = 'rgba(150,158,164,.55)';

      if (ns) {
        var yN = y + 0.54 * PPM * PITCH, yF = y - 0.54 * PPM * PITCH;
        var t = 0.10 * PPM;
        /* the panel's own thickness, lit down its length */
        var g = c.createLinearGradient(x - t, 0, x + t, 0);
        g.addColorStop(0, 'rgba(96,104,112,.42)');
        g.addColorStop(1, 'rgba(46,52,58,.42)');
        c.fillStyle = g;
        c.fillRect(x - t, yF - H, t * 2, (yN - yF) + H);
        /* mesh: the wires run away from you, so they read as ticks */
        c.strokeStyle = wire;
        c.lineWidth = 1;
        for (var i = 0; i <= 6; i++) {
          var wy = yF - H + H * 0.12 + i * H * 0.145;
          c.beginPath();
          c.moveTo(x - t, wy); c.lineTo(x + t, wy + (yN - yF));
          c.stroke();
        }
        c.fillStyle = post;
        c.fillRect(x - t - 2, yF - H, 4, H);          /* far post  */
        c.fillRect(x - t - 2, yN - H, 4, H);          /* near post */
        c.fillStyle = 'rgba(150,158,164,.5)';
        c.fillRect(x - t - 2, yF - H, 4, 3);
        c.fillRect(x - t - 2, yN - H, 4, 3);
        return;
      }

      var half = (run.ew ? 0.54 : 0.30) * PPM;
      c.strokeStyle = wire;
      c.lineWidth = 1;
      for (var j = 0; j <= 6; j++) {
        var yy = y - 0.12 * PPM - j * 0.14 * PPM;
        c.beginPath(); c.moveTo(x - half, yy); c.lineTo(x + half, yy); c.stroke();
      }
      for (var k = 0; k <= 6; k++) {
        var xx = x - half + k * (half * 2 / 6);
        c.beginPath(); c.moveTo(xx, y - 0.1 * PPM); c.lineTo(xx, y - H); c.stroke();
      }
      /* posts only where the run stops */
      c.fillStyle = post;
      if (!run.e || half < 0.5 * PPM) c.fillRect(x + half - 2, y - H, 4, H);
      if (!run.w || half < 0.5 * PPM) c.fillRect(x - half - 2, y - H, 4, H);
    },
    barricade: function (c, x, y, lvl) {
      var col = tierCol(lvl, WOOD, [96, 88, 70]);
      var run = runOf();
      /* a low sill under the planks, so a line of them is a barrier and
         not a scattering of trestles */
      runPiece(c, x, y, 0.30, Z.shade(col, 0.14), Z.shade(col, -0.10),
               { thick: 0.26, courses: false });
      /* the crossed planks lie along the run, and shorten across it */
      var bl = (run.ew ? 1.14 : 0.62) * PPM;
      var tilt = run.ns && !run.ew ? Math.PI / 2 * PITCH : 0;
      c.save();
      c.translate(x, y - 0.34 * PPM);
      c.rotate(tilt);
      [-0.5, 0.5].forEach(function (s) {
        c.save(); c.rotate(s * 0.42);
        /* the plank: lit top edge, body, shadowed underside, and the
           grain and nails that say it came off a pallet */
        var g = c.createLinearGradient(0, -5, 0, 5);
        g.addColorStop(0, Z.rgb(Z.shade(col, 0.22)));
        g.addColorStop(0.5, Z.rgb(col));
        g.addColorStop(1, Z.rgb(Z.shade(col, -0.26)));
        c.fillStyle = g;
        c.fillRect(-bl / 2, -5, bl, 10);
        c.strokeStyle = 'rgba(0,0,0,.30)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(-bl / 2 + 2, -1.4);
        c.bezierCurveTo(-bl * 0.1, -2.8, bl * 0.1, 0.4, bl / 2 - 2, -0.8);
        c.stroke();
        c.fillStyle = 'rgba(0,0,0,.34)';
        c.fillRect(-bl / 2, 3.2, bl, 2);
        for (var nb = -1; nb <= 1; nb += 2) {
          c.fillStyle = 'rgba(16,16,18,.55)';
          c.fillRect(nb * bl * 0.34 - 1.2, -1.4, 2.4, 2.4);
          c.fillStyle = 'rgba(226,222,208,.3)';
          c.fillRect(nb * bl * 0.34 - 1.2, -1.4, 2.4, 1.1);
        }
        c.restore();
      });
      c.restore();
      /* Spikes along the top, each one a lit face and a dark one so it
         reads as a point rather than a paper triangle - and rust where it
         has been standing out in the weather. */
      for (var i = 0; i < 5; i++) {
        var sx = x - 0.38 * PPM + i * 0.19 * PPM;
        var tip = y - (0.84 + (i % 2) * 0.08) * PPM;
        c.fillStyle = Z.rgb(Z.shade(STEEL, 0.18));
        c.beginPath();
        c.moveTo(sx - 3.2, y - 0.52 * PPM);
        c.lineTo(sx, tip);
        c.lineTo(sx + 0.4, y - 0.52 * PPM);
        c.closePath(); c.fill();
        c.fillStyle = Z.rgb(Z.shade(STEEL, -0.30));
        c.beginPath();
        c.moveTo(sx + 0.4, y - 0.52 * PPM);
        c.lineTo(sx, tip);
        c.lineTo(sx + 3.2, y - 0.52 * PPM);
        c.closePath(); c.fill();
        if (Z.hash1(i * 5 + Math.round(x), 61) > 0.5) {
          c.fillStyle = 'rgba(126,64,30,.42)';
          c.fillRect(sx - 1.6, y - 0.62 * PPM, 3.2, 4);
        }
      }
      /* wire strung between them */
      c.strokeStyle = 'rgba(180,176,166,.34)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x - 0.38 * PPM, y - 0.60 * PPM);
      c.lineTo(x + 0.38 * PPM, y - 0.64 * PPM);
      c.stroke();
    },
    gate: function (c, x, y, lvl) {
      var col = tierCol(lvl, WOOD, STEEL);
      /* the two posts, each with a cap so the end grain shows */
      [-0.8, 0.8].forEach(function (s) {
        var pb = box(c, x + s * PPM, y, 0.34, 0.6, 1.25,
                     Z.shade(col, -0.1), Z.shade(col, -0.2));
        c.fillStyle = Z.rgb(Z.shade(col, 0.24));
        c.fillRect(pb.x0, pb.yF - 3, pb.W, 3.4);
      });
      var b = box(c, x, y, 1.45, 0.4, 1.0, Z.shade(col, 0.1), col);
      /* boards, with the seam between each and the lit edge beyond it */
      for (var i = 1; i < 5; i++) {
        var bx = b.x0 + b.W * i / 5;
        c.fillStyle = 'rgba(0,0,0,.28)';
        c.fillRect(bx, b.yF, 1.6, b.H);
        c.fillStyle = 'rgba(255,244,222,.10)';
        c.fillRect(bx + 1.6, b.yF, 1.2, b.H);
      }
      /* the brace across it, and the hardware holding the whole thing on */
      c.save();
      c.beginPath(); c.rect(b.x0, b.yF, b.W, b.H); c.clip();
      c.strokeStyle = 'rgba(0,0,0,.22)';
      c.lineWidth = Math.max(3, b.H * 0.13);
      c.beginPath();
      c.moveTo(b.x0 + 2, b.yF + b.H - 2);
      c.lineTo(b.x0 + b.W - 2, b.yF + 2);
      c.stroke();
      c.strokeStyle = 'rgba(255,240,214,.10)';
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(b.x0 + 2, b.yF + b.H - 4);
      c.lineTo(b.x0 + b.W - 2, b.yF);
      c.stroke();
      c.restore();
      /* hinges and a latch */
      c.fillStyle = Z.rgb(Z.shade(STEEL, -0.24));
      [0.18, 0.74].forEach(function (f) {
        c.fillRect(b.x0 + 1, b.yF + b.H * f, b.W * 0.22, Math.max(3, b.H * 0.1));
        c.fillRect(b.x0 + b.W - 1 - b.W * 0.22, b.yF + b.H * f,
                   b.W * 0.22, Math.max(3, b.H * 0.1));
      });
      c.fillStyle = Z.rgb(Z.shade(STEEL, 0.1));
      c.fillRect(b.x0 + b.W * 0.46, b.yF + b.H * 0.42, b.W * 0.1, b.H * 0.2);
    },
    /* Hazard skirt, a pedestal, a turntable, the housing, and the things
       that hang off it: ammo can, optic, cable. A box with a cylinder on
       top was legible but it was not machinery, and this is the structure
       the player looks at more than any other. */
    turret: function (c, x, y, lvl) {
      hazardBase(c, x, y, 0.94, 0.82, lvl);

      /* cable running off the back to the compound's power */
      c.strokeStyle = 'rgba(30,32,34,.8)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(x - 0.10 * PPM, y - 0.04 * PPM);
      c.quadraticCurveTo(x - 0.38 * PPM, y + 0.02 * PPM,
                         x - 0.46 * PPM, y - 0.10 * PPM);
      c.stroke();
      c.lineWidth = 1;

      /* pedestal, then the turntable ring it swings on */
      cyl(c, x, y - 0.04 * PPM, 0.17, 0.26, Z.shade(STEEL_D, -0.1), STEEL_D);
      c.fillStyle = 'rgba(38,42,46,.95)';
      c.beginPath();
      c.ellipse(x, y - 0.30 * PPM, 0.30 * PPM, 0.30 * PPM * PITCH, 0, 0, Z.TAU);
      c.fill();
      c.strokeStyle = 'rgba(150,158,164,.5)'; c.stroke();

      /* the housing */
      var b = box(c, x, y - 0.30 * PPM, 0.52, 0.42, 0.34,
                  Z.shade(STEEL, 0.14), STEEL_D, { posts: false, seam: false });
      /* cooling louvres down the side of it */
      c.fillStyle = 'rgba(16,18,20,.45)';
      for (var i = 0; i < 4; i++) {
        c.fillRect(b.x0 + 4 + i * 6, b.yF + 5, 3, b.H - 10);
      }
      /* ammo can on the flank, the detail that says it is fed */
      var ab = box(c, x + 0.30 * PPM, y - 0.26 * PPM, 0.22, 0.28, 0.22,
                   [96, 102, 88], [74, 80, 66], { posts: false, seam: false });
      c.fillStyle = 'rgba(206,166,52,.55)';
      c.fillRect(ab.x0 + 2, ab.yF + 3, ab.W - 4, 2);

      /* optic block, and a lens once it has been upgraded */
      var ob = box(c, x - 0.04 * PPM, y - 0.62 * PPM, 0.26, 0.18, 0.12,
                   Z.shade(STEEL, 0.2), [52, 56, 60], { posts: false, seam: false });
      c.fillStyle = lvl > 3 ? 'rgba(143,210,232,.85)' : 'rgba(96,110,120,.8)';
      c.fillRect(ob.x0 + 3, ob.yF + 3, 6, 4);
      if (lvl > 3) {
        c.fillStyle = 'rgba(143,210,232,.30)';
        c.fillRect(ob.x0 + 1, ob.yF + 1, 10, 8);
      }
      /* the higher tiers get a second barrel mount and a shield plate */
      if (lvl > 5) {
        c.fillStyle = 'rgba(120,128,134,.9)';
        c.fillRect(x - 0.30 * PPM, y - 0.56 * PPM, 0.14 * PPM, 0.20 * PPM);
      }
    },
    flamer: function (c, x, y, lvl) {
      hazardBase(c, x, y, 0.92, 0.80, lvl);
      box(c, x, y, 0.58, 0.46, 0.22, Z.shade([98, 72, 44], 0.1), [98, 72, 44]);
      /* two tanks, strapped, with a feed line between them */
      cyl(c, x - 0.16 * PPM, y - 0.24 * PPM, 0.14, 0.46, [156, 86, 34], [190, 120, 50]);
      cyl(c, x + 0.16 * PPM, y - 0.24 * PPM, 0.14, 0.40, [128, 72, 30], [170, 104, 44]);
      c.fillStyle = 'rgba(30,26,22,.55)';
      c.fillRect(x - 0.30 * PPM, y - 0.52 * PPM, 0.60 * PPM, 3);
      c.strokeStyle = 'rgba(40,38,34,.9)'; c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(x - 0.16 * PPM, y - 0.66 * PPM);
      c.quadraticCurveTo(x, y - 0.80 * PPM, x + 0.16 * PPM, y - 0.60 * PPM);
      c.stroke();
      c.lineWidth = 1;
      /* pilot flame */
      c.fillStyle = 'rgba(238,150,54,.8)';
      c.beginPath(); c.arc(x + 0.16 * PPM, y - 0.62 * PPM, 2.6, 0, Z.TAU); c.fill();
    },
    tesla: function (c, x, y, lvl) {
      hazardBase(c, x, y, 0.90, 0.78, lvl);
      /* the transformer it sits on, with cooling fins down the flank */
      var b = box(c, x, y - 0.03 * PPM, 0.66, 0.56, 0.30,
                  Z.shade(STEEL, 0.06), [64, 68, 74], { seam: false });
      c.fillStyle = 'rgba(14,18,24,.5)';
      for (var f = 0; f < 5; f++) c.fillRect(b.x0 + 4 + f * 6, b.yF + 4, 2.4, b.H - 8);
      /* the yellow label every piece of live gear carries */
      c.fillStyle = 'rgba(206,176,52,.8)';
      c.fillRect(b.x0 + b.W * 0.58, b.yF + b.H * 0.3, 8, 6);
      c.fillStyle = 'rgba(24,22,16,.85)';
      c.fillRect(b.x0 + b.W * 0.58 + 3.4, b.yF + b.H * 0.3 + 1, 1.2, 4);

      /* mast: a stack of ceramic insulators, not a grey stick */
      var mb = y - 0.32 * PPM;
      c.fillStyle = Z.rgb([70, 74, 80]);
      c.fillRect(x - 2.2, mb - 0.66 * PPM, 4.4, 0.66 * PPM);
      for (var i = 0; i < 4; i++) {
        var iy = mb - 0.10 * PPM - i * 0.15 * PPM;
        c.fillStyle = 'rgb(176,168,150)';
        c.beginPath(); c.ellipse(x, iy, 7.5 - i * 0.7, 3.0, 0, 0, Z.TAU); c.fill();
        c.fillStyle = 'rgba(0,0,0,.26)';
        c.beginPath(); c.ellipse(x, iy + 2.2, 7.5 - i * 0.7, 2.2, 0, 0, Z.TAU); c.fill();
      }
      /* copper winding under the head */
      var wy = mb - 0.76 * PPM;
      for (var w = 0; w < 6; w++) {
        c.strokeStyle = w & 1 ? 'rgba(168,104,46,.9)' : 'rgba(208,140,66,.9)';
        c.lineWidth = 1.8;
        c.beginPath(); c.ellipse(x, wy + w * 3, 6.5, 2.2, 0, 0, Z.TAU); c.stroke();
      }
      c.lineWidth = 1;
      /* toroid, then the charge sitting in it */
      c.fillStyle = 'rgb(150,156,164)';
      c.beginPath(); c.ellipse(x, y - 1.02 * PPM, 13, 5, 0, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgba(210,220,236,.55)';
      c.beginPath(); c.ellipse(x, y - 1.04 * PPM, 13, 4, 0, 0, Z.TAU); c.fill();
      var g = c.createRadialGradient(x, y - 1.08 * PPM, 1, x, y - 1.08 * PPM, 20);
      g.addColorStop(0, 'rgba(206,224,255,.95)');
      g.addColorStop(1, 'rgba(120,160,240,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y - 1.08 * PPM, 20, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgba(214,232,255,.95)';
      c.beginPath(); c.arc(x, y - 1.08 * PPM, 5, 0, Z.TAU); c.fill();
      /* a couple of stray filaments crawling off the toroid */
      c.strokeStyle = 'rgba(190,214,255,.7)';
      c.lineWidth = 1.2;
      for (var s = 0; s < 3; s++) {
        var a = -0.5 + s * 1.1 + lvl * 0.2;
        c.beginPath();
        c.moveTo(x + Math.cos(a) * 11, y - 1.04 * PPM + Math.sin(a) * 4);
        c.lineTo(x + Math.cos(a) * 19, y - 1.10 * PPM + Math.sin(a) * 9);
        c.lineTo(x + Math.cos(a) * 24, y - 1.02 * PPM + Math.sin(a) * 13);
        c.stroke();
      }
      c.lineWidth = 1;
    },
    mortar: function (c, x, y, lvl) {
      hazardBase(c, x, y, 1.62, 1.40, lvl);
      var b = box(c, x, y - 0.04 * PPM, 1.42, 1.22, 0.24,
                  Z.shade(STEEL_D, 0.02), STEEL_D, { seam: false });
      deckPlate(c, b);
      /* sandbags banked along the front - the thing is emplaced */
      for (var s = 0; s < 4; s++) {
        var sx = b.x0 + 6 + s * (b.W - 12) / 3.4;
        c.fillStyle = s & 1 ? 'rgb(122,112,86)' : 'rgb(104,96,74)';
        c.beginPath(); c.ellipse(sx, b.y0 - 2, 11, 6, 0.1, 0, Z.TAU); c.fill();
        c.strokeStyle = 'rgba(40,36,26,.5)';
        c.beginPath(); c.ellipse(sx, b.y0 - 2, 11, 6, 0.1, 0, Z.TAU); c.stroke();
      }
      /* the baseplate and the two legs braced back off it */
      c.fillStyle = 'rgba(46,50,54,.95)';
      c.beginPath();
      c.ellipse(x, y - 0.30 * PPM, 0.34 * PPM, 0.34 * PPM * PITCH, 0, 0, Z.TAU);
      c.fill();
      c.strokeStyle = 'rgba(150,158,164,.4)'; c.stroke();
      c.strokeStyle = 'rgba(58,62,66,.95)'; c.lineWidth = 4;
      [-1, 1].forEach(function (sd) {
        c.beginPath();
        c.moveTo(x + sd * 4, y - 0.34 * PPM);
        c.lineTo(x + sd * 0.34 * PPM, y - 0.20 * PPM);
        c.stroke();
      });
      c.lineWidth = 1;

      /* the tube, elevated, with a muzzle collar and a bipod clamp */
      c.save();
      c.translate(x, y - 0.32 * PPM);
      c.rotate(-0.52);
      var tg = c.createLinearGradient(-8, 0, 8, 0);
      tg.addColorStop(0, 'rgb(96,100,104)');
      tg.addColorStop(0.42, 'rgb(74,78,82)');
      tg.addColorStop(1, 'rgb(44,48,52)');
      c.fillStyle = tg;
      c.fillRect(-7.5, -1.02 * PPM, 15, 1.02 * PPM);
      c.fillStyle = 'rgb(38,42,46)';
      c.fillRect(-9, -1.06 * PPM, 18, 8);
      c.fillStyle = 'rgba(10,12,14,.9)';
      c.beginPath(); c.ellipse(0, -1.03 * PPM, 6, 2.4, 0, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgba(58,62,66,.95)';
      c.fillRect(-9, -0.46 * PPM, 18, 6);
      c.fillStyle = 'rgba(206,166,52,.5)';
      c.fillRect(-7, -0.74 * PPM, 14, 2);
      c.restore();

      /* the sight on its own post, and a rack of shells to feed it */
      c.fillStyle = 'rgba(64,68,72,.95)';
      c.fillRect(x - 0.30 * PPM, y - 0.52 * PPM, 3, 0.22 * PPM);
      c.fillStyle = lvl > 4 ? 'rgba(217,180,90,.9)' : 'rgba(96,104,110,.9)';
      c.fillRect(x - 0.33 * PPM, y - 0.56 * PPM, 9, 6);
      for (var i = 0; i < 3; i++) {
        var rx = x + 0.34 * PPM + i * 8;
        c.fillStyle = 'rgb(92,86,58)';
        c.fillRect(rx - 3, y - 0.30 * PPM, 6, 0.24 * PPM);
        c.fillStyle = 'rgb(122,116,78)';
        c.beginPath();
        c.moveTo(rx - 3, y - 0.30 * PPM);
        c.lineTo(rx, y - 0.40 * PPM);
        c.lineTo(rx + 3, y - 0.30 * PPM);
        c.closePath(); c.fill();
      }
    },
    cryo: function (c, x, y, lvl) {
      /* rime on the ground under it, before anything else goes down */
      c.fillStyle = 'rgba(186,236,236,.16)';
      c.beginPath();
      c.ellipse(x, y - 2, 0.72 * PPM, 0.40 * PPM, 0, 0, Z.TAU); c.fill();
      hazardBase(c, x, y, 0.90, 0.76, lvl);
      var b = box(c, x, y - 0.03 * PPM, 0.72, 0.60, 0.28,
                  Z.shade([70, 84, 88], 0.12), [58, 72, 78], { seam: false });
      /* condenser coils looped along the side of the compressor */
      c.strokeStyle = 'rgba(138,164,172,.8)';
      c.lineWidth = 1.6;
      for (var i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(b.x0 + 4, b.yF + 5 + i * 5);
        c.lineTo(b.x0 + b.W - 4, b.yF + 5 + i * 5);
        c.stroke();
      }
      c.lineWidth = 1;

      /* the tank, frosting from the bottom up */
      cyl(c, x, y - 0.28 * PPM, 0.22, 0.56, [92, 150, 156], [178, 236, 232]);
      var fg = c.createLinearGradient(0, y - 0.84 * PPM, 0, y - 0.28 * PPM);
      fg.addColorStop(0, 'rgba(226,250,250,0)');
      fg.addColorStop(1, 'rgba(226,250,250,.42)');
      c.fillStyle = fg;
      c.fillRect(x - 0.22 * PPM, y - 0.84 * PPM, 0.44 * PPM, 0.56 * PPM);
      /* strap bands holding it on */
      c.fillStyle = 'rgba(48,56,60,.85)';
      c.fillRect(x - 0.23 * PPM, y - 0.70 * PPM, 0.46 * PPM, 3);
      c.fillRect(x - 0.23 * PPM, y - 0.44 * PPM, 0.46 * PPM, 3);
      /* gauge on the front */
      c.fillStyle = 'rgba(214,236,240,.9)';
      c.beginPath(); c.arc(x + 0.12 * PPM, y - 0.56 * PPM, 3.4, 0, Z.TAU); c.fill();
      c.strokeStyle = 'rgba(30,44,50,.8)';
      c.beginPath();
      c.moveTo(x + 0.12 * PPM, y - 0.56 * PPM);
      c.lineTo(x + 0.12 * PPM + 2, y - 0.58 * PPM);
      c.stroke();

      /* the emitter head, and the cold falling out of it */
      c.fillStyle = 'rgb(122,180,186)';
      c.beginPath();
      c.moveTo(x - 9, y - 0.86 * PPM);
      c.lineTo(x + 9, y - 0.86 * PPM);
      c.lineTo(x + 6, y - 1.02 * PPM);
      c.lineTo(x - 6, y - 1.02 * PPM);
      c.closePath(); c.fill();
      var g = c.createRadialGradient(x, y - 1.00 * PPM, 1, x, y - 1.00 * PPM, 16);
      g.addColorStop(0, 'rgba(224,254,252,.85)');
      g.addColorStop(1, 'rgba(126,230,224,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y - 1.00 * PPM, 16, 0, Z.TAU); c.fill();
      /* ice crystals drifting off it */
      c.fillStyle = 'rgba(226,252,250,.7)';
      for (var k = 0; k < 5; k++) {
        var a = Z.hash1(k, 71) * Z.TAU;
        c.fillRect(x + Math.cos(a) * (9 + k * 2), y - 1.02 * PPM + Math.sin(a) * 7, 2, 2);
      }
    },
    arclance: function (c, x, y, lvl) {
      hazardBase(c, x, y, 1.62, 1.40, lvl);
      var b = box(c, x, y - 0.04 * PPM, 1.44, 1.24, 0.38,
                  Z.shade([58, 54, 68], 0.04), [50, 46, 60], { seam: false });
      deckPlate(c, b, 'rgba(58,48,76,.18)');
      /* cable runs crossing the deck to the capacitor bank */
      c.strokeStyle = 'rgba(22,20,28,.6)';
      c.lineWidth = 2.6;
      [0.3, 0.55].forEach(function (f) {
        c.beginPath();
        c.moveTo(b.x0 + 6, b.yB + b.D * f);
        c.quadraticCurveTo(x, b.yB + b.D * f + 6, b.x1 - 6, b.yB + b.D * f - 2);
        c.stroke();
      });
      c.lineWidth = 1;
      /* capacitor bank along the front of the chassis: six cans, charged */
      for (var i = 0; i < 6; i++) {
        var cx = b.x0 + 8 + i * (b.W - 16) / 5;
        cyl(c, cx, b.yF + b.H - 2, 0.055, 0.22, [74, 70, 92], [128, 120, 156]);
        c.fillStyle = 'rgba(214,196,255,' + (0.30 + (i % 3) * 0.2) + ')';
        c.fillRect(cx - 2, b.yF + b.H - 0.20 * PPM, 4, 2.4);
      }
      /* vent stacks at the back throwing heat off */
      [-0.42, 0.42].forEach(function (sd) {
        cyl(c, x + sd * PPM, b.yB + 6, 0.09, 0.34, [64, 60, 74], [92, 86, 108]);
        c.fillStyle = 'rgba(200,176,255,.16)';
        c.beginPath();
        c.ellipse(x + sd * PPM, b.yB + 6 - 0.36 * PPM, 7, 4, 0, 0, Z.TAU); c.fill();
      });

      /* the emitter, ringed with focusing collars that step down as they
         climb - which is what makes it read as a barrel and not a pipe */
      cyl(c, x, y - 0.44 * PPM, 0.21, 1.02, [86, 80, 106], [174, 164, 208]);
      for (var r = 0; r < 4; r++) {
        var ry = y - 0.62 * PPM - r * 0.22 * PPM;
        var rr = 0.26 - r * 0.035;
        c.fillStyle = Z.rgb(Z.shade([150, 142, 182], r * 0.06));
        c.beginPath(); c.ellipse(x, ry, rr * PPM, rr * PPM * PITCH, 0, 0, Z.TAU); c.fill();
        c.fillStyle = 'rgba(0,0,0,.24)';
        c.beginPath(); c.ellipse(x, ry + 2.4, rr * PPM, rr * PPM * PITCH * 0.8, 0, 0, Z.TAU);
        c.fill();
      }
      /* the charge running up the inside of it */
      c.strokeStyle = 'rgba(226,212,255,.5)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x, y - 0.46 * PPM);
      c.lineTo(x, y - 1.44 * PPM);
      c.stroke();
      c.lineWidth = 1;
      var g = c.createRadialGradient(x, y - 1.52 * PPM, 1, x, y - 1.52 * PPM, 26);
      g.addColorStop(0, 'rgba(246,240,255,.95)');
      g.addColorStop(0.4, 'rgba(198,172,255,.5)');
      g.addColorStop(1, 'rgba(180,150,255,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y - 1.52 * PPM, 26, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgba(252,250,255,.95)';
      c.beginPath(); c.arc(x, y - 1.52 * PPM, 6, 0, Z.TAU); c.fill();
    },
    trap: function (c, x, y, lvl) {
      /* A pit with a rim, not a disc with pins on it. The hole has to
         look like it has depth or the spikes have nothing to come out of. */
      c.fillStyle = 'rgb(58,50,40)';
      c.beginPath(); c.ellipse(x, y - 3, 0.46 * PPM, 0.27 * PPM, 0, 0, Z.TAU); c.fill();
      /* boards framing the edge */
      c.strokeStyle = Z.rgb(Z.shade(WOOD_D, 0.16));
      c.lineWidth = 4;
      c.beginPath(); c.ellipse(x, y - 3, 0.44 * PPM, 0.25 * PPM, 0, 0, Z.TAU); c.stroke();
      c.lineWidth = 1;
      /* the dark of the hole itself */
      var pg = c.createRadialGradient(x, y - 5, 2, x, y - 3, 0.38 * PPM);
      pg.addColorStop(0, 'rgb(10,9,8)');
      pg.addColorStop(1, 'rgb(38,32,26)');
      c.fillStyle = pg;
      c.beginPath(); c.ellipse(x, y - 3, 0.37 * PPM, 0.21 * PPM, 0, 0, Z.TAU); c.fill();

      /* spikes coming up out of it, back row first so they overlap right */
      var pts = [];
      for (var i = 0; i < 9; i++) {
        var a = (i / 9) * Z.TAU + 0.3;
        pts.push([x + Math.cos(a) * (0.10 + (i % 3) * 0.07) * PPM,
                  y - 3 + Math.sin(a) * (0.06 + (i % 3) * 0.05) * PPM,
                  11 + Z.hash1(i, 83) * 7]);
      }
      pts.sort(function (p, q) { return p[1] - q[1]; });
      pts.forEach(function (p, k) {
        c.fillStyle = Z.rgb(Z.shade(STEEL, 0.20));
        c.beginPath();
        c.moveTo(p[0] - 2.6, p[1]); c.lineTo(p[0], p[1] - p[2]);
        c.lineTo(p[0] + 0.4, p[1]); c.closePath(); c.fill();
        c.fillStyle = Z.rgb(Z.shade(STEEL, -0.34));
        c.beginPath();
        c.moveTo(p[0] + 0.4, p[1]); c.lineTo(p[0], p[1] - p[2]);
        c.lineTo(p[0] + 2.6, p[1]); c.closePath(); c.fill();
        /* what the last one who stepped here left on the point */
        if (k % 3 === 0) {
          c.fillStyle = 'rgba(112,26,20,.5)';
          c.fillRect(p[0] - 1.2, p[1] - p[2] + 2, 2.4, 5);
        }
      });
      /* a trigger plate lying over one side */
      c.fillStyle = 'rgba(96,92,80,.55)';
      c.beginPath();
      c.ellipse(x - 0.18 * PPM, y - 1, 0.20 * PPM, 0.11 * PPM, 0.2, 0, Z.TAU);
      c.fill();
    },
    core: function (c, x, y, lvl) {
      plinth(c, x, y, 2.9, 2.3, [104, 100, 92]);
      var b = box(c, x, y - 0.10 * PPM, 2.5, 2.1, 1.55,
                  [102, 104, 96], [116, 112, 100], { inset: 6 });
      winRow(c, b, 3, 2, true);
      door(c, b, 0.5, 0.15, 0.55);
      flatRoof(c, b, [102, 104, 96], true);
      sandbags(c, b, 6);
      /* antenna mast with a warning lamp, and the compound's flag */
      var mx = x + 1.0 * PPM;
      c.fillStyle = Z.rgb(STEEL_D);
      c.fillRect(mx, b.yB - 1.25 * PPM, 4, 1.25 * PPM);
      c.strokeStyle = Z.rgb(STEEL_D); c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(mx + 2, b.yB - 0.9 * PPM); c.lineTo(mx - 9, b.yB - 0.55 * PPM);
      c.moveTo(mx + 2, b.yB - 0.9 * PPM); c.lineTo(mx + 13, b.yB - 0.55 * PPM);
      c.stroke(); c.lineWidth = 1;
      c.fillStyle = 'rgba(232,70,50,.92)';
      c.beginPath(); c.arc(mx + 2, b.yB - 1.27 * PPM, 3.2, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgba(206,88,42,.94)';
      c.beginPath();
      c.moveTo(mx + 4, b.yB - 1.22 * PPM);
      c.lineTo(mx + 22, b.yB - 1.14 * PPM);
      c.lineTo(mx + 4, b.yB - 1.04 * PPM);
      c.closePath(); c.fill();
      /* floodlit apron in front of the doors */
      if (lvl > 2) {
        c.fillStyle = 'rgba(255,214,150,.07)';
        c.beginPath();
        c.ellipse(x, y + 8, 1.5 * PPM, 0.5 * PPM, 0, 0, Z.TAU);
        c.fill();
      }
    },
    shelter: function (c, x, y, lvl) {
      plinth(c, x, y, 1.9, 1.5, [92, 88, 80]);
      var b = box(c, x, y - 0.10 * PPM, 1.6, 1.3, 1.02, [96, 90, 78], WOOD_D);
      winRow(c, b, 2, 1, true);
      door(c, b, 0.5, 0.2, 0.62);
      hipRoof(c, x, b.yF, 1.85, 1.3, 0.42, [82, 66, 50]);
      /* a stovepipe and a water butt */
      c.fillStyle = 'rgba(56,54,50,.95)';
      c.fillRect(b.x0 + b.W * 0.76, b.yF - 0.46 * PPM, 5, 0.46 * PPM);
      cyl(c, b.x1 + 7, b.y0 - 2, 0.15, 0.36, [78, 86, 82], [96, 104, 100]);
    },
    tower: function (c, x, y, lvl) {
      /* four legs with cross-bracing, then a cab on top */
      [-0.58, 0.58].forEach(function (sd) {
        c.fillStyle = Z.rgb(Z.shade(WOOD_D, sd < 0 ? 0.12 : -0.16));
        c.beginPath();
        c.moveTo(x + sd * PPM - 4, y);
        c.lineTo(x + sd * 0.72 * PPM - 3, y - 2.05 * PPM);
        c.lineTo(x + sd * 0.72 * PPM + 3, y - 2.05 * PPM);
        c.lineTo(x + sd * PPM + 4, y);
        c.closePath(); c.fill();
      });
      c.strokeStyle = Z.rgb(Z.shade(WOOD_D, -0.1)); c.lineWidth = 3;
      [0.35, 0.68].forEach(function (t) {
        var yy = y - t * 2.05 * PPM, sp = (1 - t * 0.28) * 0.58 * PPM;
        c.beginPath();
        c.moveTo(x - sp, yy); c.lineTo(x + sp, yy - 0.5 * PPM);
        c.moveTo(x + sp, yy); c.lineTo(x - sp, yy - 0.5 * PPM);
        c.moveTo(x - sp, yy); c.lineTo(x + sp, yy);
        c.stroke();
      });
      c.lineWidth = 1;
      var b = box(c, x, y - 2.05 * PPM, 1.55, 1.2, 0.68, [100, 94, 80], WOOD);
      /* open observation slit rather than glass */
      c.fillStyle = 'rgba(12,14,16,.88)';
      c.fillRect(b.x0 + 5, b.yF + 7, b.W - 10, 13);
      c.fillStyle = 'rgba(255,206,132,.30)';
      c.fillRect(b.x0 + 5, b.yF + 7, b.W - 10, 4);
      hipRoof(c, x, b.yF, 1.78, 1.2, 0.34, [72, 60, 46]);
      /* sandbags around the platform edge */
      for (var i = 0; i < 4; i++) {
        c.fillStyle = Z.rgb(Z.mix([124, 114, 88], [92, 84, 62], (i % 2) / 2));
        c.beginPath();
        c.ellipse(b.x0 + 9 + i * (b.W - 18) / 3, b.y0 - 3, 9, 5.5, 0, 0, Z.TAU);
        c.fill();
      }
    },
    infirmary: function (c, x, y, lvl) {
      plinth(c, x, y, 2.0, 1.6, [126, 124, 118]);
      var b = box(c, x, y - 0.10 * PPM, 1.7, 1.4, 1.08, [182, 182, 174], [162, 164, 156]);
      winRow(c, b, 2, 1, true);
      door(c, b, 0.5, 0.18, 0.56);
      flatRoof(c, b, [182, 182, 174], false);
      /* red cross on the wall, and a lit lamp over the door */
      c.fillStyle = 'rgba(206,64,58,.94)';
      c.fillRect(b.x0 + b.W / 2 - 15, b.yF + 8, 30, 9.5);
      c.fillRect(b.x0 + b.W / 2 - 4.8, b.yF - 2.5, 9.6, 30);
      c.fillStyle = 'rgba(255,226,176,.85)';
      c.beginPath(); c.arc(b.x0 + b.W * 0.5, b.y0 - b.H * 0.62 - 4, 3.4, 0, Z.TAU); c.fill();
    },
    workshop: function (c, x, y, lvl) {
      var b = box(c, x, y, 2.5, 1.6, 1.05, [104, 100, 90], [96, 92, 82]);
      /* roller door, open, with the shop lit inside it */
      var dx = b.x0 + b.W * 0.14, dw = b.W * 0.36, dh = 0.80 * PPM;
      c.fillStyle = 'rgb(26,24,22)';
      c.fillRect(dx, b.y0 - dh, dw, dh);
      var ig = c.createLinearGradient(0, b.y0 - dh, 0, b.y0);
      ig.addColorStop(0, 'rgba(255,196,96,.24)');
      ig.addColorStop(1, 'rgba(255,170,70,.05)');
      c.fillStyle = ig;
      c.fillRect(dx, b.y0 - dh, dw, dh);
      /* the shutter itself, rolled up above the opening */
      c.fillStyle = 'rgb(82,86,88)';
      c.fillRect(dx - 2, b.y0 - dh - 7, dw + 4, 7);
      c.fillStyle = 'rgba(0,0,0,.3)';
      for (var sl = 0; sl < 3; sl++) c.fillRect(dx - 2, b.y0 - dh - 6 + sl * 2.4, dw + 4, 1);
      /* a bench and a rack of tools against the back of the bay */
      c.fillStyle = 'rgba(96,74,44,.9)';
      c.fillRect(dx + 4, b.y0 - dh * 0.44, dw - 8, 4);
      c.strokeStyle = 'rgba(180,186,190,.42)';
      for (var t = 0; t < 4; t++) {
        c.beginPath();
        c.moveTo(dx + 6 + t * (dw - 12) / 3, b.y0 - dh * 0.76);
        c.lineTo(dx + 6 + t * (dw - 12) / 3, b.y0 - dh * 0.52);
        c.stroke();
      }
      /* sparks off whatever is on the bench */
      c.fillStyle = 'rgba(255,214,140,.7)';
      for (var k = 0; k < 4; k++) {
        c.fillRect(dx + dw * 0.4 + Z.hash1(k, 19) * 10,
                   b.y0 - dh * 0.46 - Z.hash1(k, 23) * 9, 1.6, 1.6);
      }
      winRow(c, b, 2, 1, true);
      /* ribs across the roof, and a stack stained by what goes up it */
      c.fillStyle = 'rgba(0,0,0,.14)';
      for (var r = 1; r < 5; r++) c.fillRect(b.x0 + b.W * r / 5, b.yB, 2.4, b.D);
      cyl(c, b.x1 - 12, b.yB + 4, 0.14, 0.7, [76, 74, 70], [56, 54, 52]);
      c.fillStyle = 'rgba(18,16,14,.5)';
      c.fillRect(b.x1 - 16, b.yB + 4 - 0.70 * PPM, 8, 10);
      /* a pallet of stock leaning on the near wall */
      c.fillStyle = 'rgb(112,86,50)';
      c.fillRect(b.x1 - 0.5 * PPM, b.y0 - 16, 0.42 * PPM, 14);
      c.fillStyle = 'rgba(0,0,0,.3)';
      c.fillRect(b.x1 - 0.5 * PPM, b.y0 - 9, 0.42 * PPM, 2);
    },
    generator: function (c, x, y, lvl) {
      /* skid frame first, so the set looks dropped onto something */
      c.fillStyle = 'rgb(58,60,56)';
      c.fillRect(x - 0.84 * PPM, y - 7, 1.68 * PPM, 7);
      c.fillStyle = 'rgba(0,0,0,.3)';
      c.fillRect(x - 0.84 * PPM, y - 2, 1.68 * PPM, 2);
      var b = box(c, x, y - 0.06 * PPM, 1.6, 0.9, 0.62,
                  [96, 102, 96], [82, 88, 84], { seam: false });
      /* radiator grille at the near end */
      c.fillStyle = 'rgba(22,26,24,.6)';
      c.fillRect(b.x0 + 6, b.yF + 7, b.W * 0.34, b.H - 14);
      c.fillStyle = 'rgba(150,158,150,.28)';
      for (var i = 0; i < 7; i++) {
        c.fillRect(b.x0 + 7, b.yF + 9 + i * ((b.H - 18) / 6), b.W * 0.32, 1.4);
      }
      /* control panel: a gauge and two lamps, one of them green */
      var px = b.x0 + b.W * 0.52;
      c.fillStyle = 'rgb(48,52,50)';
      c.fillRect(px, b.yF + 8, b.W * 0.24, b.H * 0.46);
      c.fillStyle = 'rgba(214,226,210,.8)';
      c.beginPath(); c.arc(px + b.W * 0.07, b.yF + 8 + b.H * 0.2, 3.2, 0, Z.TAU); c.fill();
      c.strokeStyle = 'rgba(28,32,30,.9)';
      c.beginPath();
      c.moveTo(px + b.W * 0.07, b.yF + 8 + b.H * 0.2);
      c.lineTo(px + b.W * 0.07 + 2.4, b.yF + 6 + b.H * 0.2);
      c.stroke();
      c.fillStyle = 'rgba(118,214,126,.95)';
      c.fillRect(px + b.W * 0.15, b.yF + 10, 3, 3);
      c.fillStyle = 'rgba(196,86,42,.6)';
      c.fillRect(px + b.W * 0.15, b.yF + 16, 3, 3);
      /* fuel tank bolted along the back */
      cyl(c, b.x0 + b.W * 0.34, b.yB + 5, 0.13, 0.26, [128, 104, 62], [162, 134, 82]);
      /* exhaust, capped, with soot around the mouth */
      cyl(c, b.x1 - 14, b.yF + 2, 0.10, 0.56, [66, 68, 70], [50, 52, 54]);
      c.fillStyle = 'rgba(16,14,12,.55)';
      c.beginPath();
      c.ellipse(b.x1 - 14, b.yF + 2 - 0.56 * PPM, 6, 3, 0, 0, Z.TAU); c.fill();
      /* the little haze of heat over it, but only when it is worth it */
      if (lvl > 2) {
        c.fillStyle = 'rgba(200,196,188,.10)';
        c.beginPath();
        c.ellipse(b.x1 - 14, b.yF - 0.66 * PPM, 9, 6, 0, 0, Z.TAU); c.fill();
      }
    },
    solar: function (c, x, y, lvl) {
      c.fillStyle = Z.rgb(STEEL_D);
      c.fillRect(x - 0.6 * PPM, y - 0.4 * PPM, 5, 0.4 * PPM);
      c.fillRect(x + 0.55 * PPM, y - 0.4 * PPM, 5, 0.4 * PPM);
      var g = c.createLinearGradient(x - 0.9 * PPM, y - 0.9 * PPM, x + 0.9 * PPM, y - 0.3 * PPM);
      g.addColorStop(0, 'rgb(46,66,96)');
      g.addColorStop(0.5, 'rgb(28,44,70)');
      g.addColorStop(1, 'rgb(58,84,118)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x - 0.92 * PPM, y - 0.44 * PPM);
      c.lineTo(x + 0.92 * PPM, y - 0.44 * PPM);
      c.lineTo(x + 0.80 * PPM, y - 0.92 * PPM);
      c.lineTo(x - 0.80 * PPM, y - 0.92 * PPM);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(150,170,200,.35)'; c.lineWidth = 1;
      for (var i = 1; i < 4; i++) {
        var t = i / 4;
        c.beginPath();
        c.moveTo(Z.lerp(x - 0.92 * PPM, x - 0.80 * PPM, 0) + t * 1.84 * PPM, y - 0.44 * PPM);
        c.lineTo(Z.lerp(x - 0.80 * PPM, x + 0.80 * PPM, t), y - 0.92 * PPM);
        c.stroke();
      }
      c.strokeStyle = 'rgba(8,10,14,.6)';
      c.beginPath();
      c.moveTo(x - 0.92 * PPM, y - 0.44 * PPM);
      c.lineTo(x + 0.92 * PPM, y - 0.44 * PPM);
      c.lineTo(x + 0.80 * PPM, y - 0.92 * PPM);
      c.lineTo(x - 0.80 * PPM, y - 0.92 * PPM);
      c.closePath(); c.stroke();
    },
    battery: function (c, x, y, lvl) {
      var b = box(c, x, y, 0.8, 1.5, 1.0, [88, 96, 104], [74, 82, 90], { seam: false });
      /* the cabinet is a stack of cells, so draw the cells */
      for (var i = 0; i < 4; i++) {
        var cy = b.yF + 8 + i * ((b.H - 20) / 4);
        c.fillStyle = 'rgba(20,24,28,.45)';
        c.fillRect(b.x0 + 5, cy, b.W - 10, (b.H - 20) / 4 - 3);
        c.fillStyle = 'rgba(146,158,168,.22)';
        c.fillRect(b.x0 + 5, cy, b.W - 10, 1.4);
        /* terminal posts on each */
        c.fillStyle = 'rgba(176,132,70,.9)';
        c.fillRect(b.x0 + 8, cy + 2, 3, 3);
        c.fillStyle = 'rgba(150,158,164,.9)';
        c.fillRect(b.x0 + b.W - 11, cy + 2, 3, 3);
      }
      /* charge bar down the front - how full it actually is */
      var fill = 0.35 + Math.min(0.6, lvl * 0.07);
      c.fillStyle = 'rgba(12,16,20,.7)';
      c.fillRect(b.x0 + b.W - 8, b.yF + 8, 4, b.H - 18);
      c.fillStyle = 'rgba(126,214,180,.9)';
      c.fillRect(b.x0 + b.W - 8, b.yF + 8 + (b.H - 18) * (1 - fill),
                 4, (b.H - 18) * fill);
      /* cable leaving the base for wherever the power goes */
      c.strokeStyle = 'rgba(28,30,32,.85)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(b.x0 + 8, b.y0 - 4);
      c.quadraticCurveTo(b.x0 - 12, b.y0 + 2, b.x0 - 20, b.y0 - 5);
      c.stroke();
      c.lineWidth = 1;
      /* vent louvres on the top face */
      c.fillStyle = 'rgba(14,18,22,.4)';
      for (var v = 0; v < 3; v++) c.fillRect(b.x0 + 6, b.yB + 3 + v * 4, b.W - 12, 2);
    },
    windmill: function (c, x, y, lvl) {
      /* tapered mast */
      c.fillStyle = Z.rgb([146, 148, 144]);
      c.beginPath();
      c.moveTo(x - 6, y); c.lineTo(x - 3, y - 2.6 * PPM);
      c.lineTo(x + 3, y - 2.6 * PPM); c.lineTo(x + 6, y);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(8,10,14,.45)'; c.stroke();
      var hy = y - 2.6 * PPM;
      c.fillStyle = Z.rgb([120, 124, 128]);
      c.beginPath(); c.ellipse(x, hy, 8, 6, 0, 0, Z.TAU); c.fill();
      /* three blades, foreshortened like everything else on the map */
      for (var i = 0; i < 3; i++) {
        var a = i * Z.TAU / 3 - 0.5;
        c.save();
        c.translate(x, hy);
        c.rotate(a);
        var g = c.createLinearGradient(0, 0, 0, -0.95 * PPM);
        g.addColorStop(0, 'rgb(176,178,180)');
        g.addColorStop(1, 'rgb(122,126,130)');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(-4, 0);
        c.quadraticCurveTo(-6, -0.55 * PPM, -1.5, -0.95 * PPM);
        c.lineTo(2, -0.92 * PPM);
        c.quadraticCurveTo(5, -0.5 * PPM, 4, 0);
        c.closePath(); c.fill();
        c.strokeStyle = 'rgba(8,10,14,.4)'; c.stroke();
        c.restore();
      }
    },
    stockpile: function (c, x, y, lvl) {
      /* a pallet under it all, which is what stops a pile of boxes
         looking like it is floating on the dirt */
      c.fillStyle = 'rgba(18,18,16,.4)';
      c.beginPath(); c.ellipse(x, y - 2, 0.96 * PPM, 0.32 * PPM, 0, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgb(122,96,58)';
      c.fillRect(x - 0.88 * PPM, y - 9, 1.76 * PPM, 8);
      c.fillStyle = 'rgba(0,0,0,.34)';
      for (var p = 0; p < 5; p++) c.fillRect(x - 0.84 * PPM + p * 0.35 * PPM, y - 9, 3, 8);

      /* crates, banded and stencilled, the middle stack the tallest */
      for (var i = 0; i < 3; i++) {
        var bx = x + (i - 1) * 0.44 * PPM;
        var by = y - 0.06 * PPM - (i === 1 ? 0.06 * PPM : 0);
        var hh = 0.42 + (i === 1 ? 0.24 : 0);
        var cb = box(c, bx, by, 0.5, 0.45, hh, [138, 106, 62], [112, 84, 48],
                     { posts: false, seam: false });
        /* corner banding and a diagonal brace */
        c.strokeStyle = 'rgba(58,40,22,.55)'; c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(cb.x0 + 2, cb.yF + 2); c.lineTo(cb.x1 - 2, cb.y0 - 2);
        c.stroke();
        c.lineWidth = 1;
        c.fillStyle = 'rgba(52,36,20,.4)';
        c.fillRect(cb.x0, cb.yF + cb.H * 0.24, cb.W, 2);
        c.fillRect(cb.x0, cb.yF + cb.H * 0.72, cb.W, 2);
        /* the stencil - never legible, always says "military" */
        c.fillStyle = 'rgba(232,226,208,.34)';
        c.fillRect(cb.x0 + 5, cb.yF + cb.H * 0.42, cb.W * 0.42, 3);
        c.fillRect(cb.x0 + 5, cb.yF + cb.H * 0.42 + 5, cb.W * 0.26, 2.4);
      }
      /* a drum and two sacks filling the gaps */
      cyl(c, x - 0.74 * PPM, y - 3, 0.15, 0.40, [92, 108, 96], [116, 134, 118]);
      for (var s = 0; s < 2; s++) {
        c.fillStyle = s ? 'rgb(150,140,110)' : 'rgb(132,122,96)';
        c.beginPath();
        c.ellipse(x + 0.62 * PPM + s * 12, y - 6 - s * 5, 12, 8, 0.18, 0, Z.TAU);
        c.fill();
        c.strokeStyle = 'rgba(56,50,36,.45)'; c.stroke();
      }
      /* a corner of tarp thrown over the tall stack */
      c.fillStyle = 'rgba(62,74,62,.85)';
      c.beginPath();
      c.moveTo(x - 0.26 * PPM, y - 0.62 * PPM);
      c.lineTo(x + 0.26 * PPM, y - 0.66 * PPM);
      c.lineTo(x + 0.30 * PPM, y - 0.44 * PPM);
      c.lineTo(x - 0.22 * PPM, y - 0.40 * PPM);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,248,226,.08)';
      c.fillRect(x - 0.26 * PPM, y - 0.64 * PPM, 0.52 * PPM, 3);
    },
    silo: function (c, x, y, lvl) {
      cyl(c, x, y, 0.62, 1.5, [128, 126, 116], [148, 146, 136]);
      /* corrugation: it is a rolled steel tank, not a painted tube */
      c.save();
      c.beginPath();
      c.rect(x - 0.62 * PPM, y - 1.5 * PPM, 1.24 * PPM, 1.5 * PPM);
      c.clip();
      for (var v = 0; v < 14; v++) {
        var vx = x - 0.62 * PPM + v * (1.24 * PPM / 13);
        c.fillStyle = 'rgba(0,0,0,.07)';
        c.fillRect(vx, y - 1.5 * PPM, 2, 1.5 * PPM);
        c.fillStyle = 'rgba(255,250,236,.05)';
        c.fillRect(vx + 2, y - 1.5 * PPM, 1.4, 1.5 * PPM);
      }
      c.restore();
      /* the hoop seams between courses */
      c.fillStyle = 'rgba(0,0,0,.20)';
      for (var i = 1; i < 4; i++) c.fillRect(x - 0.62 * PPM, y - i * 0.36 * PPM, 1.24 * PPM, 3);
      c.fillStyle = 'rgba(255,250,236,.08)';
      for (var i2 = 1; i2 < 4; i2++) c.fillRect(x - 0.62 * PPM, y - i2 * 0.36 * PPM + 3, 1.24 * PPM, 1.4);
      /* ladder up the near face, with its safety hoops */
      c.strokeStyle = 'rgba(56,58,54,.9)'; c.lineWidth = 1.8;
      c.beginPath();
      c.moveTo(x - 6, y - 4); c.lineTo(x - 6, y - 1.46 * PPM);
      c.moveTo(x + 2, y - 4); c.lineTo(x + 2, y - 1.46 * PPM);
      c.stroke();
      c.lineWidth = 1.2;
      for (var rg = 0; rg < 9; rg++) {
        var ry = y - 8 - rg * (1.36 * PPM / 9);
        c.beginPath(); c.moveTo(x - 6, ry); c.lineTo(x + 2, ry); c.stroke();
      }
      c.lineWidth = 1;
      /* discharge chute at the foot, with what it has spilled */
      c.fillStyle = 'rgb(96,94,86)';
      c.beginPath();
      c.moveTo(x + 0.22 * PPM, y - 0.30 * PPM);
      c.lineTo(x + 0.46 * PPM, y - 0.24 * PPM);
      c.lineTo(x + 0.42 * PPM, y - 4);
      c.lineTo(x + 0.26 * PPM, y - 6);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(146,124,76,.55)';
      c.beginPath(); c.ellipse(x + 0.36 * PPM, y - 2, 11, 5, 0, 0, Z.TAU); c.fill();
      /* stencilled number, and rust running from the top seam */
      c.fillStyle = 'rgba(46,44,40,.34)';
      c.fillRect(x - 0.20 * PPM, y - 0.96 * PPM, 0.22 * PPM, 9);
      c.fillStyle = 'rgba(122,72,36,.22)';
      c.fillRect(x + 0.30 * PPM, y - 1.34 * PPM, 4, 0.34 * PPM);
      hipRoof(c, x, y - 1.5 * PPM, 1.32, 0.9, 0.3, [104, 102, 94]);
      /* filling hatch on the crown */
      c.fillStyle = 'rgba(70,68,62,.9)';
      c.beginPath();
      c.ellipse(x + 6, y - 1.68 * PPM, 7, 3.4, 0, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgba(180,186,180,.35)';
      c.beginPath();
      c.ellipse(x + 6, y - 1.70 * PPM, 7, 3.0, 0, 0, Z.TAU); c.fill();
    },
    depot: function (c, x, y, lvl) {
      var b = box(c, x, y, 2.6, 1.7, 1.1, [102, 104, 100], [92, 94, 90], { seam: false });
      /* loading dock lip along the front, a step up off the ground */
      c.fillStyle = 'rgb(118,116,110)';
      c.fillRect(b.x0 - 4, b.y0 - 9, b.W + 8, 9);
      c.fillStyle = 'rgba(0,0,0,.32)';
      c.fillRect(b.x0 - 4, b.y0 - 3, b.W + 8, 3);
      /* two roller shutters, slatted, one of them up */
      [0.10, 0.56].forEach(function (f, di) {
        var dx = b.x0 + b.W * f, dw = b.W * 0.32, dh = 0.78 * PPM;
        var open = di === 1;
        c.fillStyle = open ? 'rgb(24,24,24)' : 'rgb(118,112,100)';
        c.fillRect(dx, b.y0 - 9 - dh, dw, dh);
        if (!open) {
          c.fillStyle = 'rgba(0,0,0,.24)';
          for (var s = 0; s < 11; s++) c.fillRect(dx, b.y0 - 9 - dh + s * (dh / 11), dw, 2);
          c.fillStyle = 'rgba(255,250,236,.07)';
          for (var s2 = 0; s2 < 11; s2++) {
            c.fillRect(dx, b.y0 - 9 - dh + s2 * (dh / 11) + 2, dw, 1.2);
          }
        } else {
          /* the dark of the bay, with shelving racked up inside */
          c.fillStyle = 'rgba(96,88,70,.45)';
          c.fillRect(dx + 4, b.y0 - 9 - dh * 0.72, dw - 8, 4);
          c.fillRect(dx + 4, b.y0 - 9 - dh * 0.40, dw - 8, 4);
          c.fillStyle = 'rgba(148,116,66,.5)';
          c.fillRect(dx + 7, b.y0 - 9 - dh * 0.72 - 9, 12, 9);
          c.fillRect(dx + dw - 22, b.y0 - 9 - dh * 0.40 - 8, 11, 8);
          /* the shutter rolled up over the opening */
          c.fillStyle = 'rgb(108,104,94)';
          c.fillRect(dx - 2, b.y0 - 9 - dh - 7, dw + 4, 7);
        }
        c.fillStyle = 'rgba(46,48,46,.8)';
        c.fillRect(dx - 3, b.y0 - 9 - dh, 3, dh);
        c.fillRect(dx + dw, b.y0 - 9 - dh, 3, dh);
      });
      /* bollards at the dock edge */
      [0.04, 0.5, 0.96].forEach(function (f) {
        cyl(c, b.x0 + b.W * f, b.y0 - 1, 0.055, 0.24, [156, 128, 44], [196, 168, 66]);
      });
      /* stencilled unit number over the doors */
      c.fillStyle = 'rgba(232,226,208,.28)';
      c.fillRect(b.x0 + b.W * 0.42, b.yF + 8, b.W * 0.14, 5);
      /* ribs and a rust line on the roof */
      c.fillStyle = 'rgba(0,0,0,.16)';
      for (var r = 1; r < 7; r++) c.fillRect(b.x0 + b.W * r / 7, b.yB, 2.6, b.D);
      c.fillStyle = 'rgba(196,86,42,.5)';
      c.fillRect(b.x0 + 4, b.yB + 3, b.W - 8, 4);
    },
    grove: function (c, x, y, lvl) {
      /* A managed stand: things growing on one side, things already cut
         stacked on the other. Four identical lollipops in a brown square
         told you nothing about what the building was doing. */
      var b = plot(c, x, y, 1.9, 1.9, [74, 58, 38], WOOD_D);

      /* mulch and leaf litter over the beds */
      for (var m = 0; m < 26; m++) {
        var mx = b.x0 + 3 + Z.hash1(m, 131) * (b.W - 6);
        var my = b.y0 - b.D + 2 + Z.hash1(m, 137) * (b.D - 4);
        c.fillStyle = Z.hash1(m, 139) > 0.5
          ? 'rgba(112,88,50,.34)' : 'rgba(58,44,26,.34)';
        c.fillRect(mx, my, 2.4 + Z.hash1(m, 149) * 2, 1.6);
      }

      /* the saplings, back row first so the front ones overlap correctly */
      var base = 0.30 + lvl * 0.05;
      for (var r = 0; r < 2; r++) {
        for (var k = 0; k < 2; k++) {
          var seed = r * 2 + k;
          var h = base * (0.82 + Z.hash1(seed, 151) * 0.42);
          var tx = b.x0 + b.W * (0.24 + k * 0.30) + Z.hash1(seed, 157) * 5;
          var ty = b.y0 - b.D * (0.26 + r * 0.42);
          /* the shadow it throws on its own bed */
          c.fillStyle = 'rgba(20,16,10,.26)';
          c.beginPath();
          c.ellipse(tx + 3, ty, h * PPM * 0.34, h * PPM * 0.11, 0, 0, Z.TAU);
          c.fill();
          /* trunk, tapered, with a couple of side branches */
          c.strokeStyle = Z.rgb(Z.shade(WOOD_D, 0.1));
          c.lineWidth = 3;
          c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx, ty - h * PPM * 0.6); c.stroke();
          c.lineWidth = 1.8;
          c.beginPath();
          c.moveTo(tx, ty - h * PPM * 0.6); c.lineTo(tx, ty - h * PPM * 0.95);
          c.moveTo(tx, ty - h * PPM * 0.55);
          c.lineTo(tx - 6, ty - h * PPM * 0.74);
          c.moveTo(tx, ty - h * PPM * 0.66);
          c.lineTo(tx + 6, ty - h * PPM * 0.82);
          c.stroke();
          /* crown in two lobes so it is not a perfect ball */
          var cg = c.createRadialGradient(tx - 4, ty - h * PPM - 6, 1,
                                          tx, ty - h * PPM, h * PPM * 0.66);
          cg.addColorStop(0, 'rgb(128,166,82)');
          cg.addColorStop(1, 'rgb(48,76,42)');
          c.fillStyle = cg;
          c.beginPath();
          c.ellipse(tx, ty - h * PPM, h * PPM * 0.50, h * PPM * 0.42, 0, 0, Z.TAU);
          c.fill();
          c.beginPath();
          c.ellipse(tx + h * PPM * 0.22, ty - h * PPM * 0.82,
                    h * PPM * 0.30, h * PPM * 0.26, 0, 0, Z.TAU);
          c.fill();
          c.strokeStyle = 'rgba(10,16,10,.5)'; c.lineWidth = 1;
          c.beginPath();
          c.ellipse(tx, ty - h * PPM, h * PPM * 0.50, h * PPM * 0.42, 0, 0, Z.TAU);
          c.stroke();
        }
      }
      c.lineWidth = 1;

      /* a fresh stump with its rings, and the chips round it */
      var stx = b.x0 + b.W * 0.78, sty = b.y0 - b.D * 0.30;
      c.fillStyle = 'rgb(96,72,44)';
      c.fillRect(stx - 7, sty - 9, 14, 9);
      c.fillStyle = 'rgb(186,154,104)';
      c.beginPath(); c.ellipse(stx, sty - 9, 7, 3.4, 0, 0, Z.TAU); c.fill();
      c.strokeStyle = 'rgba(126,96,56,.7)';
      for (var rg = 1; rg < 4; rg++) {
        c.beginPath();
        c.ellipse(stx, sty - 9, 7 * rg / 4, 3.4 * rg / 4, 0, 0, Z.TAU);
        c.stroke();
      }
      c.fillStyle = 'rgba(206,178,124,.55)';
      for (var ch = 0; ch < 6; ch++) {
        c.fillRect(stx - 12 + Z.hash1(ch, 163) * 24,
                   sty - 2 + Z.hash1(ch, 167) * 6, 2.6, 1.8);
      }

      /* cut timber stacked on bearers - what the stand is actually for */
      var lx = b.x0 + b.W * 0.70, ly = b.y0 - 4;
      c.fillStyle = 'rgba(20,16,10,.3)';
      c.beginPath(); c.ellipse(lx + 8, ly + 1, 22, 6, 0, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgb(78,58,34)';
      c.fillRect(lx - 12, ly - 3, 40, 3);
      for (var row = 0; row < 2; row++) {
        var cnt = 3 - row;
        for (var lg = 0; lg < cnt; lg++) {
          var gx = lx - 8 + lg * 12 + row * 6;
          var gy = ly - 4 - row * 10;
          c.fillStyle = 'rgb(112,84,50)';
          c.fillRect(gx - 5, gy - 10, 10, 10);
          c.fillStyle = 'rgba(0,0,0,.24)';
          c.fillRect(gx + 2, gy - 10, 3, 10);
          c.fillStyle = 'rgb(182,150,102)';
          c.beginPath(); c.ellipse(gx, gy - 10, 5, 2.6, 0, 0, Z.TAU); c.fill();
          c.strokeStyle = 'rgba(120,92,54,.8)';
          c.beginPath(); c.ellipse(gx, gy - 10, 2.6, 1.4, 0, 0, Z.TAU); c.stroke();
        }
      }
      /* the axe left in the block */
      c.strokeStyle = 'rgba(104,78,44,.95)'; c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(stx + 2, sty - 10); c.lineTo(stx + 11, sty - 26);
      c.stroke(); c.lineWidth = 1;
      c.fillStyle = 'rgb(168,174,178)';
      c.beginPath();
      c.moveTo(stx + 9, sty - 23);
      c.lineTo(stx + 16, sty - 28);
      c.lineTo(stx + 14, sty - 33);
      c.lineTo(stx + 8, sty - 28);
      c.closePath(); c.fill();
    },

    cropfield: function (c, x, y, lvl) {
      var b = plot(c, x, y, 2.9, 1.9, [82, 62, 40], WOOD_D);
      /* rows of greens, denser at higher levels */
      var rows = 4, per = 7 + lvl;
      for (var r = 0; r < rows; r++) {
        var ry = b.y0 - b.D * (0.16 + r * 0.24);
        for (var k = 0; k < per; k++) {
          var cx = b.x0 + b.W * (0.06 + k * (0.88 / (per - 1)));
          var hh = (0.13 + (k % 3) * 0.012) * PPM;
          c.fillStyle = k % 2 ? 'rgb(96,140,66)' : 'rgb(78,120,56)';
          c.beginPath();
          c.moveTo(cx, ry);
          c.lineTo(cx - 3, ry - hh);
          c.lineTo(cx, ry - hh * 1.3);
          c.lineTo(cx + 3, ry - hh);
          c.closePath();
          c.fill();
        }
      }
      /* a water butt at the near corner says it is tended */
      cyl(c, b.x0 + b.W - 10, b.y0 - 3, 0.13, 0.30, [76, 92, 98], [104, 124, 130]);
    },

    sawmill: function (c, x, y, lvl) {
      var b = box(c, x, y, 1.6, 1.3, 0.85, [104, 96, 80], WOOD_D);
      hipRoof(c, x, b.yF, 1.8, 1.3, 0.3, [80, 66, 50]);
      /* blade */
      c.fillStyle = 'rgba(170,176,182,.9)';
      c.beginPath(); c.arc(b.x0 + b.W * 0.7, b.y0 - 16, 13, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgba(40,44,46,.9)';
      c.beginPath(); c.arc(b.x0 + b.W * 0.7, b.y0 - 16, 4, 0, Z.TAU); c.fill();
      /* stacked logs */
      for (var i = 0; i < 3; i++) cyl(c, b.x0 + 12 + i * 9, b.y0 - 2, 0.09, 0.2, [104, 78, 46], [132, 100, 60]);
    },
    scrapyard: function (c, x, y, lvl) {
      var b = box(c, x, y, 1.5, 1.2, 0.72, [96, 100, 104], STEEL_D, { seam: false });
      roofDeck(c, b, [96, 100, 104], 'rib');
      /* the press: two uprights and a ram sitting between them */
      c.fillStyle = 'rgb(72,76,80)';
      c.fillRect(b.x0 + 6, b.yF - 0.46 * PPM, 7, 0.52 * PPM);
      c.fillRect(b.x0 + b.W * 0.46, b.yF - 0.46 * PPM, 7, 0.52 * PPM);
      c.fillStyle = 'rgb(56,60,64)';
      c.fillRect(b.x0 + 4, b.yF - 0.50 * PPM, b.W * 0.50, 8);
      c.fillStyle = 'rgba(148,156,162,.55)';
      c.fillRect(b.x0 + b.W * 0.20, b.yF - 0.42 * PPM, 5, 0.22 * PPM);
      c.fillStyle = 'rgb(64,68,72)';
      c.fillRect(b.x0 + b.W * 0.12, b.yF - 0.20 * PPM, b.W * 0.30, 9);
      /* hazard paint on the press frame */
      c.save();
      c.beginPath(); c.rect(b.x0 + 4, b.yF - 0.50 * PPM, b.W * 0.50, 8); c.clip();
      for (var hz = -1; hz < b.W * 0.5 / 7 + 1; hz++) {
        c.fillStyle = (hz & 1) ? 'rgba(206,166,52,.75)' : 'rgba(24,24,22,.75)';
        c.beginPath();
        c.moveTo(b.x0 + 4 + hz * 7, b.yF - 0.42 * PPM);
        c.lineTo(b.x0 + 8 + hz * 7, b.yF - 0.50 * PPM);
        c.lineTo(b.x0 + 15 + hz * 7, b.yF - 0.50 * PPM);
        c.lineTo(b.x0 + 11 + hz * 7, b.yF - 0.42 * PPM);
        c.closePath(); c.fill();
      }
      c.restore();
      /* a finished bale, banded, waiting on the apron */
      var bl = box(c, b.x0 + b.W * 0.78, b.y0 - 2, 0.38, 0.32, 0.30,
                   [118, 104, 94], [96, 84, 76], { posts: false, seam: false, line: false });
      c.strokeStyle = 'rgba(180,186,190,.5)'; c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(bl.x0 + bl.W * 0.3, bl.yF); c.lineTo(bl.x0 + bl.W * 0.3, bl.y0);
      c.moveTo(bl.x0 + bl.W * 0.7, bl.yF); c.lineTo(bl.x0 + bl.W * 0.7, bl.y0);
      c.stroke(); c.lineWidth = 1;
      drawScrap(c, b.x1 - 10, b.y0 - 2, 0.4);
      c.fillStyle = 'rgba(196,86,42,.5)';
      c.fillRect(b.x0 + 5, b.yF + 5, b.W - 10, 5);
    },
    farm: function (c, x, y, lvl) {
      var b = box(c, x, y, 2.5, 1.5, 0.52, [120, 128, 116], [96, 104, 96]);
      /* poly tunnel ribs */
      c.strokeStyle = 'rgba(200,220,210,.30)'; c.lineWidth = 3;
      for (var i = 0; i < 4; i++) {
        var rx = b.x0 + 10 + i * (b.W - 20) / 3;
        c.beginPath();
        c.moveTo(rx, b.yF);
        c.quadraticCurveTo(rx, b.yF - 26, rx + 12, b.yF - 4);
        c.stroke();
      }
      c.lineWidth = 1;
      c.fillStyle = 'rgba(126,186,96,.5)';
      c.fillRect(b.x0 + 6, b.yF - 4, b.W - 12, 8);
    },
    quarry: function (c, x, y, lvl) {
      var b = box(c, x, y, 1.4, 1.2, 0.60, [110, 108, 100], [92, 90, 84],
                  { seam: false });
      roofDeck(c, b, [110, 108, 100], 'rib');
      /* the crusher: a hopper that takes rock and a chute that spits stone */
      c.fillStyle = 'rgb(84,82,76)';
      c.beginPath();
      c.moveTo(b.x0 + b.W * 0.14, b.yF - 0.42 * PPM);
      c.lineTo(b.x0 + b.W * 0.62, b.yF - 0.42 * PPM);
      c.lineTo(b.x0 + b.W * 0.50, b.yF + 2);
      c.lineTo(b.x0 + b.W * 0.26, b.yF + 2);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(30,30,28,.75)';
      c.beginPath();
      c.ellipse(b.x0 + b.W * 0.38, b.yF - 0.42 * PPM, b.W * 0.24, 4.5, 0, 0, Z.TAU);
      c.fill();
      /* rock in the mouth of it */
      c.fillStyle = 'rgb(126,122,112)';
      c.beginPath();
      c.ellipse(b.x0 + b.W * 0.32, b.yF - 0.43 * PPM, 6, 3.4, 0.3, 0, Z.TAU); c.fill();
      c.beginPath();
      c.ellipse(b.x0 + b.W * 0.46, b.yF - 0.44 * PPM, 4.4, 2.6, 0, 0, Z.TAU); c.fill();
      /* the belt running the crushed stone out to a cone on the ground */
      c.save();
      c.translate(b.x0 + b.W * 0.66, b.yF + 4);
      c.rotate(0.34);
      c.fillStyle = 'rgb(48,48,46)';
      c.fillRect(0, -5, 0.60 * PPM, 6);
      c.fillStyle = 'rgba(160,166,160,.28)';
      for (var t = 0; t < 6; t++) c.fillRect(t * 0.10 * PPM, -5, 2, 6);
      c.restore();
      c.fillStyle = 'rgb(132,128,118)';
      c.beginPath();
      c.moveTo(b.x1 + 2, b.y0 - 2);
      c.lineTo(b.x1 + 0.26 * PPM, b.y0 - 2);
      c.lineTo(b.x1 + 0.13 * PPM, b.y0 - 0.26 * PPM);
      c.closePath(); c.fill();
      /* dust hanging over the whole business */
      c.fillStyle = 'rgba(206,200,184,.12)';
      c.beginPath();
      c.ellipse(b.x0 + b.W * 0.44, b.yF - 0.36 * PPM, 0.34 * PPM, 0.16 * PPM, 0, 0, Z.TAU);
      c.fill();
      drawRock(c, x + 0.5 * PPM, y - 2, 0.5);
      drawRubble(c, x - 0.45 * PPM, y - 2, 0.3);
    },
    smelter: function (c, x, y, lvl) {
      var b = box(c, x, y, 1.4, 1.2, 0.9, [96, 90, 84], [84, 78, 72], { seam: false });
      roofDeck(c, b, [96, 90, 84], 'rib');
      /* soot fanning out from the foot of the stack */
      c.fillStyle = 'rgba(22,18,14,.28)';
      c.beginPath();
      c.ellipse(b.x0 + 12, b.yB + b.D * 0.4, 16, 9, 0, 0, Z.TAU); c.fill();
      /* firebrick banding, soot climbing the wall above the door */
      c.fillStyle = 'rgba(128,84,58,.34)';
      c.fillRect(b.x0 + 3, b.yF + b.H * 0.52, b.W - 6, 6);
      /* the furnace door, open, with the heat sitting in it */
      var fx = b.x0 + b.W * 0.58, fy = b.y0 - 0.30 * PPM;
      c.fillStyle = 'rgb(38,32,28)';
      c.fillRect(fx - 11, fy, 22, 0.28 * PPM);
      var fg = c.createLinearGradient(0, fy, 0, fy + 0.28 * PPM);
      fg.addColorStop(0, 'rgba(255,214,120,.95)');
      fg.addColorStop(1, 'rgba(226,96,24,.8)');
      c.fillStyle = fg;
      c.fillRect(fx - 8, fy + 3, 16, 0.24 * PPM);
      c.fillStyle = 'rgba(28,24,20,.6)';
      c.fillRect(b.x0 + b.W * 0.50, b.yF + 4, b.W * 0.24, b.H * 0.5);
      /* the tap spout and a row of ingot moulds under it */
      c.fillStyle = 'rgb(70,64,58)';
      c.beginPath();
      c.moveTo(fx + 10, fy + 0.10 * PPM);
      c.lineTo(fx + 0.22 * PPM, fy + 0.16 * PPM);
      c.lineTo(fx + 0.22 * PPM, fy + 0.22 * PPM);
      c.lineTo(fx + 10, fy + 0.20 * PPM);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,176,60,.8)';
      c.fillRect(fx + 0.20 * PPM, fy + 0.19 * PPM, 2.4, 10);
      for (var m = 0; m < 3; m++) {
        var mx = b.x1 - 4 - m * 11;
        c.fillStyle = 'rgb(60,56,52)';
        c.fillRect(mx - 9, b.y0 - 7 - m * 1.5, 10, 6);
        c.fillStyle = m ? 'rgb(156,152,146)' : 'rgba(255,150,46,.9)';
        c.fillRect(mx - 8, b.y0 - 6 - m * 1.5, 8, 3.4);
      }
      /* the stack, taller, with heat coming off the mouth */
      cyl(c, b.x0 + 12, b.yB + 2, 0.16, 1.15, [70, 66, 62], [52, 50, 48]);
      c.fillStyle = 'rgba(16,14,12,.5)';
      c.beginPath();
      c.ellipse(b.x0 + 12, b.yB + 2 - 1.15 * PPM, 9, 4.4, 0, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgba(210,180,150,.14)';
      c.beginPath();
      c.ellipse(b.x0 + 12, b.yB - 1.28 * PPM, 12, 9, 0, 0, Z.TAU); c.fill();
      /* the glow that reaches the yard */
      var g = c.createRadialGradient(fx, fy + 0.14 * PPM, 1, fx, fy + 0.14 * PPM, 26);
      g.addColorStop(0, 'rgba(255,174,74,.55)');
      g.addColorStop(1, 'rgba(220,90,20,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(fx, fy + 0.14 * PPM, 26, 0, Z.TAU); c.fill();
    },
    refinery: function (c, x, y, lvl) {
      var b = box(c, x, y, 2.4, 1.5, 0.66, [98, 100, 96], [86, 88, 84], { seam: false });
      roofDeck(c, b, [98, 100, 96], 'gravel');
      var t1 = x - 0.6 * PPM, t2 = x + 0.5 * PPM, tb = y - 0.66 * PPM;
      cyl(c, t1, tb, 0.30, 0.95, [112, 116, 112], [138, 142, 138]);
      cyl(c, t2, tb, 0.24, 0.72, [104, 108, 104], [128, 132, 128]);
      /* hoop bands and a stripe of rust down the big tower */
      c.fillStyle = 'rgba(0,0,0,.18)';
      for (var i = 1; i < 4; i++) c.fillRect(t1 - 0.30 * PPM, tb - i * 0.24 * PPM, 0.60 * PPM, 2.4);
      c.fillStyle = 'rgba(122,72,36,.22)';
      c.fillRect(t1 + 0.18 * PPM, tb - 0.90 * PPM, 3.4, 0.62 * PPM);
      /* a stair spiralling the near face - just the treads, stepping up */
      c.fillStyle = 'rgba(56,58,54,.8)';
      for (var s = 0; s < 8; s++) {
        c.fillRect(t1 - 0.30 * PPM + s * 2.4, tb - 8 - s * (0.86 * PPM / 8), 8, 2.4);
      }
      /* the catwalk between the towers, with a handrail on it */
      c.strokeStyle = 'rgba(80,84,80,.95)'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(t1, tb - 0.95 * PPM); c.lineTo(t2, tb - 0.72 * PPM); c.stroke();
      c.strokeStyle = 'rgba(150,156,150,.45)'; c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(t1, tb - 0.95 * PPM - 8); c.lineTo(t2, tb - 0.72 * PPM - 8); c.stroke();
      c.lineWidth = 1;
      /* pipework off the bottoms, with valve wheels on it */
      c.strokeStyle = 'rgba(92,96,92,.95)'; c.lineWidth = 5;
      c.beginPath();
      c.moveTo(t1, tb - 6); c.lineTo(t1, tb + 4); c.lineTo(t2 + 0.30 * PPM, tb + 4);
      c.stroke(); c.lineWidth = 1;
      [t1 + 0.22 * PPM, t2 - 0.10 * PPM].forEach(function (vx) {
        c.strokeStyle = 'rgba(178,96,52,.9)'; c.lineWidth = 2;
        c.beginPath(); c.arc(vx, tb + 4, 4.4, 0, Z.TAU); c.stroke();
        c.beginPath();
        c.moveTo(vx - 4.4, tb + 4); c.lineTo(vx + 4.4, tb + 4);
        c.moveTo(vx, tb - 0.4); c.lineTo(vx, tb + 8.4);
        c.stroke(); c.lineWidth = 1;
      });
      /* flare stack, lit, because a refinery always is */
      c.fillStyle = 'rgb(84,88,84)';
      c.fillRect(b.x1 - 14, tb - 1.20 * PPM, 5, 1.20 * PPM);
      var fg = c.createRadialGradient(b.x1 - 11.5, tb - 1.26 * PPM, 1,
                                      b.x1 - 11.5, tb - 1.26 * PPM, 13);
      fg.addColorStop(0, 'rgba(255,220,150,.9)');
      fg.addColorStop(0.45, 'rgba(240,136,42,.55)');
      fg.addColorStop(1, 'rgba(220,90,20,0)');
      c.fillStyle = fg;
      c.beginPath(); c.arc(b.x1 - 11.5, tb - 1.26 * PPM, 13, 0, Z.TAU); c.fill();
    },
    fabricator: function (c, x, y, lvl) {
      var b = box(c, x, y, 2.4, 1.5, 1.0, [104, 102, 112], [92, 90, 100],
                  { seam: false });
      roofDeck(c, b, [104, 102, 112], 'rib');
      /* the viewing window, and the print bed behind it */
      c.fillStyle = 'rgba(18,16,26,.9)';
      c.fillRect(b.x0 + 10, b.yF + 10, b.W - 20, b.H * 0.42);
      c.fillStyle = 'rgba(126,104,170,.5)';
      c.fillRect(b.x0 + 12, b.yF + 10 + b.H * 0.30, b.W - 24, 4);
      /* the gantry, and the part half-grown on the bed under it */
      c.fillStyle = 'rgba(190,184,214,.7)';
      c.fillRect(b.x0 + 10, b.yF + 10 + b.H * 0.12, b.W - 20, 3);
      c.fillStyle = 'rgba(226,216,255,.9)';
      c.fillRect(b.x0 + b.W * 0.46, b.yF + 10 + b.H * 0.12, 7, 8);
      c.fillStyle = 'rgba(174,146,232,.75)';
      c.fillRect(b.x0 + b.W * 0.34, b.yF + 10 + b.H * 0.22, b.W * 0.22, b.H * 0.09);
      /* the light it throws out of the window */
      var g = c.createLinearGradient(0, b.yF + 10, 0, b.yF + 10 + b.H * 0.42);
      g.addColorStop(0, 'rgba(180,150,255,.30)');
      g.addColorStop(1, 'rgba(180,150,255,.04)');
      c.fillStyle = g;
      c.fillRect(b.x0 + 10, b.yF + 10, b.W - 20, b.H * 0.42);
      /* status column down the side: four lamps, three of them lit */
      for (var lp = 0; lp < 4; lp++) {
        c.fillStyle = lp < 3 ? 'rgba(160,210,255,.9)' : 'rgba(60,58,72,.9)';
        c.fillRect(b.x1 - 12, b.yF + 12 + lp * 7, 4, 4);
      }
      /* feedstock hoppers on the roof and the duct running between them */
      cyl(c, b.x0 + b.W * 0.24, b.yB + 5, 0.13, 0.30, [86, 84, 96], [122, 118, 140]);
      cyl(c, b.x0 + b.W * 0.44, b.yB + 5, 0.13, 0.24, [86, 84, 96], [122, 118, 140]);
      c.strokeStyle = 'rgba(96,94,108,.9)'; c.lineWidth = 3;
      c.beginPath();
      c.moveTo(b.x0 + b.W * 0.24, b.yB + 5 - 0.30 * PPM);
      c.lineTo(b.x0 + b.W * 0.44, b.yB + 5 - 0.24 * PPM);
      c.stroke(); c.lineWidth = 1;
      c.fillStyle = 'rgba(200,180,240,.25)';
      c.fillRect(b.x0 + b.W * 0.56, b.yB + 3, b.W * 0.34, 5);
    },
    floodlight: function (c, x, y, lvl) {
      c.fillStyle = Z.rgb(STEEL_D);
      c.fillRect(x - 3, y - 1.9 * PPM, 6, 1.9 * PPM);
      c.fillStyle = Z.rgb([70, 74, 78]);
      c.fillRect(x - 13, y - 2.15 * PPM, 26, 13);
      c.fillStyle = 'rgba(255,232,180,.85)';
      c.fillRect(x - 10, y - 2.06 * PPM, 20, 8);
    },
    /* A fire pit: a ring of stones, ash inside it, and logs stacked in a
       cone over the middle.

       Every measurement here used to be raw pixels chosen when the bake
       resolution was different, so the whole thing came out a third of a
       metre across - a smudge with an orange dot over it. Metres now, like
       everything else that stands on this ground. */
    campfire: function (c, x, y, lvl) {
      var R2 = 0.46 * PPM;

      /* the scorched ground it sits in */
      c.fillStyle = 'rgba(28,24,20,.45)';
      c.beginPath();
      c.ellipse(x, y, R2 * 1.5, R2 * 1.5 * PITCH, 0, 0, Z.TAU);
      c.fill();

      /* ash and embers inside the ring */
      var ag = c.createRadialGradient(x, y, 1, x, y, R2);
      ag.addColorStop(0, 'rgba(96,74,58,.95)');
      ag.addColorStop(1, 'rgba(48,42,38,.95)');
      c.fillStyle = ag;
      c.beginPath();
      c.ellipse(x, y, R2, R2 * PITCH, 0, 0, Z.TAU);
      c.fill();
      for (var e = 0; e < 7; e++) {
        var ea = Z.hash2(e, 3, 19) * Z.TAU, er = Z.hash2(e, 7, 23) * R2 * 0.7;
        c.fillStyle = 'rgba(206,96,34,' + (0.3 + Z.hash2(e, 11, 29) * 0.4) + ')';
        c.beginPath();
        c.ellipse(x + Math.cos(ea) * er, y + Math.sin(ea) * er * PITCH,
                  2.2, 1.6, 0, 0, Z.TAU);
        c.fill();
      }

      /* the stones, each one lit from above */
      for (var i = 0; i < 9; i++) {
        var a = (i / 9) * Z.TAU + 0.2;
        var sx = x + Math.cos(a) * R2, sy = y + Math.sin(a) * R2 * PITCH;
        var rr = 0.075 * PPM * (0.8 + Z.hash2(i, 5, 31) * 0.5);
        var sg = c.createLinearGradient(0, sy - rr, 0, sy + rr);
        sg.addColorStop(0, 'rgb(136,132,124)');
        sg.addColorStop(1, 'rgb(72,70,66)');
        c.fillStyle = sg;
        c.beginPath();
        c.ellipse(sx, sy, rr, rr * 0.78, 0, 0, Z.TAU);
        c.fill();
        c.strokeStyle = 'rgba(12,14,16,.5)'; c.lineWidth = 1; c.stroke();
      }

      /* logs leaning into the middle */
      var LOG = [88, 62, 38];
      for (var k = 0; k < 4; k++) {
        var la = (k / 4) * Z.TAU + 0.6;
        var bx = x + Math.cos(la) * R2 * 0.85;
        var by = y + Math.sin(la) * R2 * 0.85 * PITCH;
        c.strokeStyle = Z.rgb(Z.shade(LOG, Math.sin(la) * 0.2));
        c.lineWidth = 0.085 * PPM;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(bx, by);
        c.lineTo(x - Math.cos(la) * R2 * 0.1, y - 0.44 * PPM);
        c.stroke();
      }
      c.lineWidth = 1;
      c.lineCap = 'butt';
      /* charred tips */
      c.fillStyle = 'rgba(24,20,18,.8)';
      c.beginPath();
      c.ellipse(x, y - 0.42 * PPM, 0.10 * PPM, 0.07 * PPM, 0, 0, Z.TAU);
      c.fill();
    },
    beacon: function (c, x, y, lvl) {
      c.strokeStyle = Z.rgb(STEEL_D); c.lineWidth = 3;
      c.beginPath();
      c.moveTo(x - 0.30 * PPM, y); c.lineTo(x, y - 2.4 * PPM);
      c.moveTo(x + 0.30 * PPM, y); c.lineTo(x, y - 2.4 * PPM);
      c.stroke();
      for (var i = 1; i < 5; i++) {
        var t = i / 5, yy = y - t * 2.4 * PPM, w = (1 - t) * 0.30 * PPM;
        c.beginPath(); c.moveTo(x - w, yy); c.lineTo(x + w, yy); c.stroke();
      }
      c.lineWidth = 1;
      c.fillStyle = 'rgba(232,70,50,.9)';
      c.beginPath(); c.arc(x, y - 2.46 * PPM, 4, 0, Z.TAU); c.fill();
    },
    road: function (c, x, y, lvl) {
      c.fillStyle = 'rgb(104,102,96)';
      c.beginPath();
      c.moveTo(x - 0.5 * PPM, y - 0.29 * PPM);
      c.lineTo(x + 0.5 * PPM, y - 0.29 * PPM);
      c.lineTo(x + 0.5 * PPM, y);
      c.lineTo(x - 0.5 * PPM, y);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,.12)';
      c.fillRect(x - 0.5 * PPM, y - 0.29 * PPM, PPM, 2);
    },
    sensor: function (c, x, y, lvl) {
      c.fillStyle = Z.rgb(STEEL_D);
      c.fillRect(x - 2.5, y - 0.9 * PPM, 5, 0.9 * PPM);
      c.fillStyle = Z.rgb([74, 78, 82]);
      c.beginPath(); c.ellipse(x, y - 0.95 * PPM, 10, 6, 0, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgba(111,168,196,.9)';
      c.beginPath(); c.arc(x, y - 0.98 * PPM, 3, 0, Z.TAU); c.fill();
    },
    shrine: function (c, x, y, lvl) {
      var b = box(c, x, y, 0.56, 0.44, 0.28, [130, 128, 120], [110, 108, 100],
                  { posts: false, seam: false });
      /* a plaque on the face of the plinth, with names too small to read */
      c.fillStyle = 'rgba(112,96,58,.85)';
      c.fillRect(b.x0 + 4, b.yF + 5, b.W - 8, b.H - 10);
      c.fillStyle = 'rgba(40,34,22,.55)';
      for (var ln = 0; ln < 3; ln++) {
        c.fillRect(b.x0 + 7, b.yF + 8 + ln * 4, (b.W - 14) * (0.9 - ln * 0.2), 1.6);
      }
      /* the cross: two timbers bound at the join, not a grey plus sign */
      var cx = x, cb = y - 0.28 * PPM;
      c.fillStyle = 'rgb(112,88,56)';
      c.fillRect(cx - 3.4, cb - 0.78 * PPM, 6.8, 0.78 * PPM);
      c.fillStyle = 'rgba(0,0,0,.26)';
      c.fillRect(cx + 1.4, cb - 0.78 * PPM, 2, 0.78 * PPM);
      c.fillStyle = 'rgb(122,96,60)';
      c.fillRect(cx - 12, cb - 0.60 * PPM, 24, 6);
      c.fillStyle = 'rgba(0,0,0,.24)';
      c.fillRect(cx - 12, cb - 0.60 * PPM + 4, 24, 2);
      /* the binding */
      c.strokeStyle = 'rgba(178,168,142,.8)'; c.lineWidth = 1.6;
      for (var w = 0; w < 3; w++) {
        c.beginPath();
        c.moveTo(cx - 5, cb - 0.62 * PPM + w * 3.4);
        c.lineTo(cx + 5, cb - 0.60 * PPM + w * 3.4);
        c.stroke();
      }
      c.lineWidth = 1;
      /* tags hanging off the crossbar */
      c.fillStyle = 'rgba(186,192,196,.75)';
      [-7, -1, 6].forEach(function (o, k) {
        c.fillRect(cx + o, cb - 0.54 * PPM, 1, 4 + k);
        c.fillRect(cx + o - 1.4, cb - 0.54 * PPM + 4 + k, 3.6, 5);
      });
      /* flowers at the foot, and a candle still going */
      ['rgba(196,84,92,.85)', 'rgba(214,188,96,.8)', 'rgba(168,140,196,.8)']
        .forEach(function (col, k) {
          c.fillStyle = col;
          c.beginPath();
          c.arc(x - 12 + k * 9, y - 3 - (k === 1 ? 2 : 0), 3.2, 0, Z.TAU);
          c.fill();
        });
      c.strokeStyle = 'rgba(64,86,48,.7)';
      c.beginPath();
      c.moveTo(x - 12, y - 1); c.lineTo(x - 10, y - 6);
      c.moveTo(x + 6, y - 1); c.lineTo(x + 5, y - 6);
      c.stroke();
      c.fillStyle = 'rgba(226,220,198,.9)';
      c.fillRect(x + 12, y - 11, 4, 9);
      var fg = c.createRadialGradient(x + 14, y - 13, 0.5, x + 14, y - 13, 9);
      fg.addColorStop(0, 'rgba(255,224,150,.95)');
      fg.addColorStop(1, 'rgba(255,170,60,0)');
      c.fillStyle = fg;
      c.beginPath(); c.arc(x + 14, y - 13, 9, 0, Z.TAU); c.fill();
    },
    armory: function (c, x, y, lvl) {
      var b = box(c, x, y, 1.7, 1.4, 1.05, [92, 96, 96], [82, 86, 88],
                  { seam: false });
      roofDeck(c, b, [92, 96, 96], 'gravel');
      c.fillStyle = 'rgba(30,34,36,.85)';
      c.fillRect(b.x0 + b.W * 0.3, b.y0 - 0.74 * PPM, b.W * 0.4, 0.74 * PPM);
      c.fillStyle = 'rgba(196,86,42,.85)';
      c.fillRect(b.x0 + 6, b.yF + 6, b.W - 12, 5);
      c.fillStyle = 'rgba(150,158,164,.5)';
      for (var i = 0; i < 4; i++) c.fillRect(b.x0 + 8 + i * 12, b.yF + 18, 6, b.H - 30);
    },
    /* ---- sandbag line ----
       An earthwork, not a wall: two courses with the upper one offset
       half a bag, which is how they are actually stacked and the only
       reason a pile of ellipses reads as bond rather than as a heap. */
    sandbag: function (c, x, y, lvl) {
      var a = armsOf();
      var e = 0.54, t = 0.26;
      var x0 = x + (a.w ? -e : -t) * PPM, x1 = x + (a.e ? e : t) * PPM;
      var wide = x1 - x0;
      c.fillStyle = 'rgba(12,10,8,.34)';
      c.beginPath(); c.ellipse(x, y + 2, wide * 0.52, 7, 0, 0, Z.TAU); c.fill();
      var rows = 2 + (lvl > 3 ? 1 : 0);
      for (var r = 0; r < rows; r++) {
        var by = y - 3 - r * 9;
        var n = Math.max(2, Math.round(wide / 17));
        var off = (r % 2) ? 0.5 : 0;
        for (var i = 0; i < n + (off ? 1 : 0); i++) {
          var bx = x0 + (i + 0.5 - off) * (wide / n);
          if (bx < x0 - 4 || bx > x1 + 4) continue;
          var rw = wide / n * 0.56;
          c.fillStyle = Z.rgb(Z.mix([132, 122, 94], [88, 80, 58],
                                    Z.hash1(Math.round(bx) + r * 31, 17)));
          c.beginPath(); c.ellipse(bx, by, rw, 5.6, 0, 0, Z.TAU); c.fill();
          c.fillStyle = 'rgba(255,246,220,.13)';
          c.beginPath(); c.ellipse(bx - 1.5, by - 1.6, rw * 0.6, 2.6, 0, 0, Z.TAU); c.fill();
          c.strokeStyle = 'rgba(10,10,8,.42)'; c.lineWidth = 1;
          c.beginPath(); c.ellipse(bx, by, rw, 5.6, 0, 0, Z.TAU); c.stroke();
        }
      }
      return a;
    },

    /* ---- concrete barrier ----
       The jersey profile - wide foot, a kink, narrow top - is the whole
       identity of the thing, so it is drawn as a real section rather
       than as a grey box with a stripe on it. */
    jersey: function (c, x, y, lvl) {
      var a = armsOf();
      var e = 0.54, t = 0.27;
      var x0 = x + (a.w ? -e : -t) * PPM, x1 = x + (a.e ? e : t) * PPM;
      var H = 0.72 * PPM, W = x1 - x0;
      c.fillStyle = 'rgba(12,12,12,.36)';
      c.fillRect(x0, y, W, 6);
      var g = c.createLinearGradient(0, y - H, 0, y);
      g.addColorStop(0, 'rgb(158,156,148)');
      g.addColorStop(0.45, 'rgb(132,130,122)');
      g.addColorStop(1, 'rgb(84,82,76)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(x0 + 3, y - H * 0.34);
      c.lineTo(x0 + 6, y - H);
      c.lineTo(x1 - 6, y - H);
      c.lineTo(x1 - 3, y - H * 0.34);
      c.lineTo(x1, y);
      c.closePath(); c.fill();
      c.fillStyle = 'rgb(176,174,166)';
      c.fillRect(x0 + 6, y - H - 5, W - 12, 6);
      c.save();
      c.beginPath(); c.rect(x0 + 5, y - H * 0.68, W - 10, 11); c.clip();
      c.fillStyle = 'rgba(226,166,63,.45)';
      for (var i = 0; i < 4; i++) {
        c.save();
        c.translate(x0 + 4 + i * (W / 3.4), y - H * 0.68);
        c.rotate(0.5);
        c.fillRect(0, -8, 6, 26);
        c.restore();
      }
      c.restore();
      for (var k = 0; k < 4; k++) {
        c.fillStyle = 'rgba(52,52,48,.34)';
        c.beginPath();
        c.ellipse(x0 + Z.hash1(k * 7 + Math.round(x), 23) * W,
                  y - H * (0.2 + Z.hash1(k, 29) * 0.7), 2.4, 1.7, 0, 0, Z.TAU);
        c.fill();
      }
      c.strokeStyle = 'rgba(70,70,66,.7)'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y - H - 4, 4, Math.PI, 0); c.stroke();
      c.lineWidth = 1;
      return a;
    },

    /* ---- barracks ---- a long hut with the stove going ---- */
    barracks: function (c, x, y, lvl) {
      plinth(c, x, y, 2.0, 1.6, [92, 88, 80]);
      var b = box(c, x, y - 0.10 * PPM, 1.8, 1.4, 0.86, [118, 112, 98], [96, 90, 78]);
      door(c, b, 0.5, 0.16, 0.6);
      win(c, b.x0 + b.W * 0.17, b.yF + b.H * 0.26, 14, 11, lvl > 1);
      win(c, b.x0 + b.W * 0.71, b.yF + b.H * 0.26, 14, 11, lvl > 1);
      hipRoof(c, x, b.yF, 2.05, 1.4, 0.36, [86, 74, 58]);
      c.fillStyle = 'rgb(74,72,68)';
      c.fillRect(b.x1 - 20, b.yF - 0.62 * PPM, 6, 0.44 * PPM);
      c.fillStyle = 'rgba(200,200,196,.22)';
      for (var i = 0; i < 3; i++) {
        c.beginPath();
        c.ellipse(b.x1 - 17 + i * 2, b.yF - 0.66 * PPM - i * 7,
                  4 + i * 2, 3 + i, 0, 0, Z.TAU);
        c.fill();
      }
      c.fillStyle = 'rgba(46,38,30,.8)';
      c.fillRect(b.x0 + b.W * 0.62, b.y0 - 6, 7, 5);
      c.fillStyle = 'rgb(96,100,104)';
      c.beginPath(); c.ellipse(b.x0 + b.W * 0.3, b.y0 - 3, 5, 3.4, 0, 0, Z.TAU); c.fill();
      return b;
    },

    /* ---- compost bay ---- three boards and a heap that is working ---- */
    compost: function (c, x, y, lvl) {
      var W = 0.92 * PPM;
      var x0 = x - W / 2;
      var g = c.createRadialGradient(x, y - 12, 2, x, y - 12, W * 0.55);
      g.addColorStop(0, 'rgb(82,62,38)');
      g.addColorStop(1, 'rgb(48,38,24)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(x, y - 9, W * 0.46, 13, 0, 0, Z.TAU); c.fill();
      for (var i = 0; i < 9; i++) {
        c.fillStyle = i % 3 === 0 ? 'rgba(126,142,74,.7)' : 'rgba(96,74,44,.75)';
        c.beginPath();
        c.ellipse(x + (Z.hash1(i * 5, 13) - 0.5) * W * 0.8,
                  y - 6 - Z.hash1(i * 3, 19) * 14,
                  3.4, 2.2, Z.hash1(i, 23) * 3, 0, Z.TAU);
        c.fill();
      }
      for (var s2 = 0; s2 < 3; s2++) {
        c.fillStyle = Z.rgb(Z.shade([116, 92, 56], -0.08 * s2));
        c.fillRect(x0, y - 6 - s2 * 7, W, 6);
        c.fillStyle = 'rgba(0,0,0,.24)';
        c.fillRect(x0, y - 1 - s2 * 7, W, 1.4);
      }
      c.fillStyle = 'rgb(84,66,40)';
      c.fillRect(x0 - 2, y - 24, 5, 26);
      c.fillRect(x0 + W - 3, y - 24, 5, 26);
      c.fillStyle = 'rgba(214,214,204,.13)';
      for (var v = 0; v < 3; v++) {
        c.beginPath();
        c.ellipse(x + (v - 1) * 9, y - 26 - v * 6, 7 - v, 4, 0, 0, Z.TAU);
        c.fill();
      }
      return { x0: x0, W: W };
    },

    /* ---- fuel still ---- a tank, a burner, and the coil between ---- */
    fuelstill: function (c, x, y, lvl) {
      plinth(c, x, y, 1.5, 1.2, [84, 82, 78]);
      var tx = x - 0.28 * PPM;
      cyl(c, tx, y - 4, 0.42, 1.0, [128, 112, 74], [150, 134, 92]);
      c.strokeStyle = 'rgba(52,44,26,.5)'; c.lineWidth = 2;
      for (var i = 1; i <= 2; i++) {
        c.beginPath();
        c.ellipse(tx, y - 4 - i * 0.3 * PPM, 0.42 * PPM, 0.42 * PPM * PITCH, 0, 0, Z.TAU);
        c.stroke();
      }
      c.strokeStyle = 'rgb(150,140,120)'; c.lineWidth = 3;
      c.beginPath();
      c.moveTo(tx + 0.4 * PPM, y - 1.0 * PPM);
      c.bezierCurveTo(x + 0.52 * PPM, y - 0.9 * PPM,
                      x + 0.52 * PPM, y - 0.4 * PPM, x + 0.3 * PPM, y - 0.3 * PPM);
      c.stroke();
      c.lineWidth = 1;
      c.fillStyle = 'rgb(58,54,50)';
      c.fillRect(tx - 0.14 * PPM, y - 10, 0.28 * PPM, 8);
      var fg = c.createRadialGradient(tx, y - 6, 1, tx, y - 6, 11);
      fg.addColorStop(0, 'rgba(255,196,96,.85)');
      fg.addColorStop(1, 'rgba(255,120,40,0)');
      c.fillStyle = fg;
      c.beginPath(); c.arc(tx, y - 6, 11, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgb(96,104,82)';
      c.fillRect(x + 0.22 * PPM, y - 13, 11, 13);
      c.fillStyle = 'rgba(0,0,0,.3)';
      c.fillRect(x + 0.22 * PPM + 4, y - 13, 2, 13);
      return { x0: x - 0.75 * PPM, W: 1.5 * PPM };
    },

    /* ---- dispensary ---- canvas over a frame, and a red cross ---- */
    medlab: function (c, x, y, lvl) {
      var b = box(c, x, y, 1.6, 1.3, 0.62, [188, 184, 172], [164, 160, 148]);
      var rw = b.W + 8, rx = b.x0 - 4;
      var g = c.createLinearGradient(0, b.yB - 20, 0, b.yF);
      g.addColorStop(0, 'rgb(214,210,196)');
      g.addColorStop(1, 'rgb(170,166,152)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(rx, b.yF);
      c.quadraticCurveTo(x, b.yB - 24, rx + rw, b.yF);
      c.lineTo(rx + rw, b.yF + 3);
      c.quadraticCurveTo(x, b.yB - 18, rx, b.yF + 3);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(120,116,104,.5)'; c.lineWidth = 1.4;
      for (var h = 1; h < 4; h++) {
        var t2 = h / 4;
        c.beginPath();
        c.moveTo(rx + rw * t2, b.yF + 2);
        c.lineTo(rx + rw * t2, b.yF - 14 * Math.sin(t2 * Math.PI));
        c.stroke();
      }
      c.lineWidth = 1;
      c.fillStyle = 'rgb(196,62,52)';
      c.fillRect(x - 3, b.yF + b.H * 0.26, 6, 16);
      c.fillRect(x - 8, b.yF + b.H * 0.26 + 5, 16, 6);
      if (lvl > 1) {
        var lg = c.createRadialGradient(b.x1 - 8, b.yF + 4, 1, b.x1 - 8, b.yF + 4, 12);
        lg.addColorStop(0, 'rgba(255,240,206,.7)');
        lg.addColorStop(1, 'rgba(255,240,206,0)');
        c.fillStyle = lg;
        c.beginPath(); c.arc(b.x1 - 8, b.yF + 4, 12, 0, Z.TAU); c.fill();
      }
      c.fillStyle = 'rgb(140,136,124)';
      c.fillRect(b.x0 + 3, b.y0 - 10, 13, 10);
      c.fillStyle = 'rgba(196,62,52,.8)';
      c.fillRect(b.x0 + 8, b.y0 - 7, 3, 4);
      return b;
    },

    relay: function (c, x, y, lvl) {
      box(c, x, y, 1.4, 1.2, 0.56, [92, 92, 104], [82, 82, 94]);
      c.fillStyle = Z.rgb(STEEL_D);
      c.fillRect(x - 3, y - 1.7 * PPM, 6, 1.15 * PPM);
      /* dish */
      c.save();
      c.translate(x, y - 1.75 * PPM);
      c.rotate(-0.45);
      var g = c.createLinearGradient(-18, 0, 18, 0);
      g.addColorStop(0, 'rgb(182,182,190)');
      g.addColorStop(1, 'rgb(112,112,124)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(0, 0, 18, 11, 0, 0, Z.TAU); c.fill();
      c.strokeStyle = 'rgba(8,10,14,.5)'; c.stroke();
      c.restore();
    }
  };

  /* Footprint -> sprite cell. Tall things need headroom above the base.
     Cached per rotation as well as per level: a turned structure is a
     different drawing, not the same one spun, because these have a front
     face and a top and a bitmap rotation would put the roof on the wall. */
  /* ------------------------------------------------------------------ *
   * Upgrade visuals
   *
   * Ten levels used to look like one. Every recipe takes `lvl` and a
   * handful use it for a tier colour, but going from a level 1 sawmill
   * to a level 9 one changed a number in a panel and nothing on the
   * ground - so the compound you had spent a night upgrading looked
   * exactly like the one you started with.
   *
   * Editing forty recipes to each grow their own armour would be forty
   * chances to get it wrong. Instead the work you put into a structure
   * shows up AROUND it, in one place, in terms every structure shares:
   * it gets dug in, then kerbed, then framed, then marked. That reads at
   * a glance across the whole compound and costs one call.
   *
   * Split in two because of draw order. The kerb and the back posts go
   * down before the recipe so the building stands ON them; the sandbags
   * and the front posts go after, so they stand IN FRONT of it.
   * ------------------------------------------------------------------ */
  /* Tucked inside the footprint rather than sitting on its boundary.

     A recipe almost never fills its tile to the edge - it leaves a
     margin so the piece does not touch its neighbours - so kit laid on
     the true footprint line comes out detached, a row of sandbags
     hovering below a building with a gap of grass between. 0.82 across
     and 0.68 deep puts it against the walls. */
  function tierBox(ox, oy, fw, fh) {
    var W = fw * PPM * 0.82, D = fh * PPM * PITCH * 0.68;
    return { x0: ox - W / 2, x1: ox + W / 2, W: W, D: D,
             yB: oy - D / 2, yF: oy + D / 2 };
  }

  function tierBase(c, ox, oy, fw, fh, lvl) {
    if (lvl < 4) return;
    var b = tierBox(ox, oy, fw, fh);
    /* a poured kerb round the footprint - the first thing anyone does to
       a structure they intend to keep */
    var pad = 4;
    c.fillStyle = 'rgb(104,102,94)';
    c.beginPath();
    c.moveTo(b.x0 - pad, b.yB - pad);
    c.lineTo(b.x1 + pad, b.yB - pad);
    c.lineTo(b.x1 + pad, b.yF + pad);
    c.lineTo(b.x0 - pad, b.yF + pad);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255,250,236,.12)';
    c.fillRect(b.x0 - pad, b.yB - pad, b.W + pad * 2, 2.4);
    c.fillStyle = 'rgba(0,0,0,.34)';
    c.fillRect(b.x0 - pad, b.yF + pad - 3, b.W + pad * 2, 3);
    /* bolt heads at the corners */
    c.fillStyle = 'rgba(158,166,172,.7)';
    [[b.x0 - 1, b.yB - 1], [b.x1 + 1, b.yB - 1],
     [b.x0 - 1, b.yF + 1], [b.x1 + 1, b.yF + 1]].forEach(function (p) {
      c.beginPath(); c.arc(p[0], p[1], 2, 0, Z.TAU); c.fill();
    });
    /* the two back corner posts, behind the building */
    if (lvl >= 6) {
      [b.x0 + 2, b.x1 - 2].forEach(function (px) {
        c.fillStyle = 'rgb(96,102,108)';
        c.fillRect(px - 2.5, b.yB - 0.34 * PPM, 5, 0.34 * PPM);
        c.fillStyle = 'rgba(255,250,236,.16)';
        c.fillRect(px - 2.5, b.yB - 0.34 * PPM, 2, 0.34 * PPM);
      });
    }
  }

  function tierFront(c, ox, oy, fw, fh, lvl) {
    if (lvl < 2) return;
    var b = tierBox(ox, oy, fw, fh);

    /* sandbags banked along the near edge, more of them as it climbs */
    var rows = lvl >= 7 ? 2 : 1;
    var count = Math.max(3, Math.round(b.W / 15));
    for (var r = 0; r < rows; r++) {
      for (var i = 0; i < count - r; i++) {
        var sx = b.x0 + 7 + r * 7 + i * ((b.W - 14) / Math.max(1, count - 1 - r));
        var sy = b.yF - 1 - r * 6;
        c.fillStyle = (i + r) & 1 ? 'rgb(118,108,84)' : 'rgb(100,92,72)';
        c.beginPath(); c.ellipse(sx, sy, 8.5, 5, 0.08, 0, Z.TAU); c.fill();
        c.strokeStyle = 'rgba(38,34,24,.45)'; c.lineWidth = 1;
        c.beginPath(); c.ellipse(sx, sy, 8.5, 5, 0.08, 0, Z.TAU); c.stroke();
        c.fillStyle = 'rgba(255,248,226,.10)';
        c.beginPath(); c.ellipse(sx - 1.5, sy - 1.8, 5.5, 2.4, 0.08, 0, Z.TAU); c.fill();
      }
    }

    /* the two front corner posts */
    if (lvl >= 6) {
      [b.x0 + 2, b.x1 - 2].forEach(function (px) {
        c.fillStyle = 'rgb(88,94,100)';
        c.fillRect(px - 2.5, b.yF - 0.38 * PPM, 5, 0.38 * PPM);
        c.fillStyle = 'rgba(255,250,236,.18)';
        c.fillRect(px - 2.5, b.yF - 0.38 * PPM, 2, 0.38 * PPM);
        c.fillStyle = 'rgba(0,0,0,.34)';
        c.fillRect(px + 0.5, b.yF - 0.38 * PPM, 2, 0.38 * PPM);
      });
    }

    /* hazard chevrons on the kerb, and a lamp on the corner, for the
       last three levels - the mark of a position that matters */
    if (lvl >= 8) {
      c.save();
      c.beginPath();
      c.rect(b.x0 - 4, b.yF + 1, b.W + 8, 5);
      c.clip();
      for (var h = -1; h < b.W / 9 + 2; h++) {
        c.fillStyle = (h & 1) ? 'rgba(206,166,52,.85)' : 'rgba(26,26,24,.85)';
        c.beginPath();
        c.moveTo(b.x0 - 4 + h * 9, b.yF + 7);
        c.lineTo(b.x0 + h * 9, b.yF + 1);
        c.lineTo(b.x0 + 5 + h * 9, b.yF + 1);
        c.lineTo(b.x0 + 1 + h * 9, b.yF + 7);
        c.closePath(); c.fill();
      }
      c.restore();
      var lx = b.x1 - 2, ly = b.yF - 0.38 * PPM;
      c.fillStyle = 'rgba(227,166,63,.95)';
      c.beginPath(); c.arc(lx, ly - 2, 2.6, 0, Z.TAU); c.fill();
      var lg = c.createRadialGradient(lx, ly - 2, 0.5, lx, ly - 2, 11);
      lg.addColorStop(0, 'rgba(255,206,120,.55)');
      lg.addColorStop(1, 'rgba(227,166,63,0)');
      c.fillStyle = lg;
      c.beginPath(); c.arc(lx, ly - 2, 11, 0, Z.TAU); c.fill();
    }
  }

  A.building = function (id, lvl, rot, mask) {
    lvl = Z.clamp(lvl || 1, 1, Z.BMAXLVL);
    rot = (rot | 0) & 3;
    mask = (mask | 0) & 15;
    var key = 'b:' + id + ':' + lvl + ':' + rot + ':' + mask;
    if (cache[key]) return cache[key];
    var def = Z.BUILDING[id];
    if (!def) return mk(8, 8, 4, 8);      /* unknown id must not kill a frame */
    var f = BUILD_ART[def.art] || BUILD_ART.wall;
    var fw = Z.fpw(def, rot), fh = Z.fph(def, rot);
    var w = Math.ceil((fw + 1.6) * PPM);
    var h = Math.ceil((fh * PITCH + 3.8) * PPM);
    /* Room below the origin for half the footprint's depth. The margin was
       a flat 0.3m, which is fine for anything that sits at the back of its
       tile and clips the near edge clean off anything centred on it - the
       farms lost their front row to it. */
    var below = Math.ceil((fh * PITCH * 0.5 + 0.34) * PPM);
    var cv = mk(w, h, w / 2, h - below);
    var c = cv.getContext('2d');
    ROT = rot; MASK = mask;
    /* Walls, fences, paving and traps are excluded: they are placed in
       runs of twenty, and twenty kerbs with twenty sets of sandbags is
       not an upgraded compound, it is a mess. */
    var kit = def.solid && !def.chain && !def.floor && !def.trap;
    try {
      if (kit) tierBase(c, cv._ox, cv._oy, fw, fh, lvl);
      f(c, cv._ox, cv._oy, lvl);
      if (kit) tierFront(c, cv._ox, cv._oy, fw, fh, lvl);
    } catch (e) {}
    ROT = 0; MASK = 0;
    cache[key] = cv;
    return cv;
  };

  /* The turret barrel is drawn live rather than baked, because it tracks
     a target. Pitching the y component is what keeps it on the ground
     plane instead of spinning like a clock hand. */
  A.turretGun = function (c, x, y, ang, len, col, wide) {
    var ex = x + Math.cos(ang) * len;
    var ey = y + Math.sin(ang) * len * PITCH;
    c.strokeStyle = 'rgba(12,14,16,.75)';
    c.lineWidth = (wide || 3) + 2.4;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
    c.strokeStyle = col;
    c.lineWidth = wide || 3;
    c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
    c.lineWidth = 1;
    return { x: ex, y: ey };
  };

  A.PROP_ART = PROP_ART;
  A.propPPM = PPM;

  /* The city's facades are assembled from the same primitives these props
     are. Handing the kit over rather than letting artcity.js grow its own
     box is the only way a supermarket and a fuel drum end up looking like
     they were drawn by the same hand. */
  A.kit = {
    mk: mk, box: box, cyl: cyl, plinth: plinth, hipRoof: hipRoof,
    flatRoof: flatRoof, win: win, door: door, sandbags: sandbags,
    PPM: PPM, PITCH: PITCH
  };

})(window.Z);
