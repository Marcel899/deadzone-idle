/* Deadzone - drawing the city.

   Two things live here. The first is a facade baker: rather than an art
   function per building, there is one function that reads a building's
   recipe and a variant number and draws whatever that combination comes
   to. A supermarket and a tower block go through the same code and come
   out unmistakably different, and two supermarkets with different variant
   numbers differ in material, height, glazing, signage, damage and what
   is bolted to the roof.

   The second is the street: forty-odd small props that are the difference
   between a road with buildings beside it and a place.

   Windows are the part worth reading twice. A window here is a hole with
   a reveal, a frame, glass with sky in it, a bar across the middle, a
   sill, and a state - intact, cracked, boarded, curtained, lit or gone.
   Every one of them is also recorded in `cv._wins`, because a window that
   can be lit at night must be lit by the renderer against the clock, not
   baked bright into the sprite. */
(function (Z) {
  'use strict';

  var A = Z.art;
  var K = A.kit;
  var PITCH = K.PITCH;
  var PPM = 46;                    /* buildings bake coarser than props:
                                      they are large, and there are many */

  /* ------------------------------------------------------------------ *
   * A bounded cache
   *
   * Facades are big canvases and there are hundreds of possible ones. The
   * unbounded object the props use would hold every building the player
   * has ever walked past; this keeps the ones on screen and forgets the
   * rest.
   * ------------------------------------------------------------------ */
  var CAP = 80;
  var bcache = {}, border = [];
  function keep(key, cv) {
    bcache[key] = cv;
    border.push(key);
    while (border.length > CAP) {
      var old = border.shift();
      if (old !== key) delete bcache[old];
    }
    return cv;
  }

  /* ------------------------------------------------------------------ *
   * Materials
   *
   * Colour plus a texture pass. The texture is what tells brick from
   * render from panel at a glance, and it is drawn over the box's own
   * shading so the lighting still reads.
   * ------------------------------------------------------------------ */
  /* Kept deliberately dark and low in chroma. These were a third brighter
     to begin with and the city read as a model village in daylight and a
     pale grey smear at night: the frame is graded down after dark, but
     grading cannot darken one thing more than another, so anything baked
     bright stays the brightest thing on screen. The colour of this place
     has gone out of it, and the palette has to start there. */
  var MAT = {
    brick:    { base: [[126, 78, 60], [106, 66, 52], [140, 92, 66], [96, 68, 58]], tex: 'courses' },
    stucco:   { base: [[140, 132, 116], [122, 118, 106], [150, 140, 120], [116, 110, 98]], tex: 'render' },
    concrete: { base: [[114, 112, 108], [96, 96, 94], [124, 122, 116], [88, 88, 86]], tex: 'panelJoint' },
    panel:    { base: [[126, 126, 120], [106, 110, 112], [138, 134, 124], [94, 100, 104]], tex: 'ribs' },
    steel:    { base: [[100, 106, 112], [88, 94, 102], [110, 116, 120], [78, 86, 92]], tex: 'ribs' },
    siding:   { base: [[132, 126, 112], [110, 114, 106], [144, 132, 112], [100, 104, 102]], tex: 'boards' },
    block:    { base: [[118, 116, 110], [102, 102, 98], [128, 124, 114], [92, 92, 90]], tex: 'blocks' },
    stone:    { base: [[130, 126, 112], [116, 112, 100], [140, 134, 118], [106, 104, 96]], tex: 'ashlar' },
    glass:    { base: [[74, 84, 92], [62, 74, 84], [82, 94, 100], [56, 68, 78]], tex: 'none' }
  };

  /* Faded exterior paint. Desaturated on purpose - this is a place where
     the colour has gone out of everything - but they are still colours,
     and a street of them is the difference between a city and a diagram. */
  var PAINT = [
    [148, 128, 96],   /* ochre        */
    [104, 122, 116],  /* eau de nil   */
    [150, 108, 92],   /* terracotta   */
    [112, 124, 144],  /* slate blue   */
    [162, 152, 128],  /* stone cream  */
    [120, 130, 106],  /* sage         */
    [142, 112, 112],  /* dusty rose   */
    [96, 110, 124],   /* steel blue   */
    [158, 138, 104],  /* wheat        */
    [108, 104, 112]   /* lilac grey   */
  ];
  var PAINTABLE = { stucco: 1, siding: 1, panel: 1, block: 1, concrete: 1, steel: 1 };

  /* Curtains and blinds, from the same curated instinct. */
  var CURTAIN = [
    '212,196,164', '186,166,150', '164,158,146', '198,180,142',
    '150,142,138', '176,150,132', '200,192,176', '142,136,128'
  ];

  function texture(c, b, mat, h2) {
    var t = MAT[mat] ? MAT[mat].tex : 'render';
    var x, y;
    c.save();
    c.beginPath(); c.rect(b.x0, b.yF, b.W, b.H); c.clip();

    if (t === 'courses') {
      var ch = Math.max(3, PPM * 0.085);
      for (y = b.yF; y < b.y0; y += ch) {
        c.fillStyle = 'rgba(0,0,0,.13)';
        c.fillRect(b.x0, y, b.W, 1);
        c.fillStyle = 'rgba(255,248,236,.05)';
        c.fillRect(b.x0, y + 1, b.W, 1);
      }
      /* perpends, offset every other course, and a few bricks a shade off */
      var bw = ch * 2.1, row = 0;
      for (y = b.yF; y < b.y0; y += ch, row++) {
        for (x = b.x0 + (row % 2 ? bw / 2 : 0); x < b.x1; x += bw) {
          c.fillStyle = 'rgba(0,0,0,.10)';
          c.fillRect(x, y, 1, ch);
          if (h2(Math.round(x * 0.4), Math.round(y * 0.4)) > 0.9) {
            c.fillStyle = 'rgba(64,30,22,.16)';
            c.fillRect(x + 1, y + 1, bw - 2, ch - 2);
          }
        }
      }
    } else if (t === 'blocks') {
      var bh = Math.max(5, PPM * 0.17), bw2 = bh * 2;
      for (y = b.yF, row = 0; y < b.y0; y += bh, row++) {
        c.fillStyle = 'rgba(0,0,0,.14)';
        c.fillRect(b.x0, y, b.W, 1.4);
        for (x = b.x0 + (row % 2 ? bw2 / 2 : 0); x < b.x1; x += bw2) {
          c.fillRect(x, y, 1.4, bh);
        }
      }
    } else if (t === 'ashlar') {
      var ah = Math.max(6, PPM * 0.22);
      for (y = b.yF, row = 0; y < b.y0; y += ah, row++) {
        c.fillStyle = 'rgba(0,0,0,.18)';
        c.fillRect(b.x0, y, b.W, 1.6);
        c.fillStyle = 'rgba(255,250,236,.06)';
        c.fillRect(b.x0, y + 1.6, b.W, 1);
        for (x = b.x0 + (row % 2 ? ah : 0); x < b.x1; x += ah * 2.4) {
          c.fillStyle = 'rgba(0,0,0,.13)';
          c.fillRect(x, y, 1.4, ah);
        }
      }
    } else if (t === 'boards') {
      var sh = Math.max(3.5, PPM * 0.10);
      for (y = b.yF; y < b.y0; y += sh) {
        c.fillStyle = 'rgba(0,0,0,.15)';
        c.fillRect(b.x0, y + sh - 1.4, b.W, 1.4);
        c.fillStyle = 'rgba(255,250,240,.06)';
        c.fillRect(b.x0, y, b.W, 1);
      }
    } else if (t === 'panelJoint') {
      var pw = Math.max(14, b.W / 4);
      for (x = b.x0 + pw; x < b.x1; x += pw) {
        c.fillStyle = 'rgba(0,0,0,.16)';
        c.fillRect(x, b.yF, 1.6, b.H);
      }
      for (y = b.yF + b.H / 3; y < b.y0; y += b.H / 3) {
        c.fillStyle = 'rgba(0,0,0,.12)';
        c.fillRect(b.x0, y, b.W, 1.4);
      }
    } else if (t === 'ribs') {
      for (x = b.x0 + 3; x < b.x1; x += Math.max(5, PPM * 0.13)) {
        c.fillStyle = 'rgba(255,255,248,.045)';
        c.fillRect(x, b.yF, 1.4, b.H);
        c.fillStyle = 'rgba(0,0,0,.10)';
        c.fillRect(x + 1.4, b.yF, 1.4, b.H);
      }
    } else if (t === 'render') {
      /* blown render: patches where it has come off, showing block */
      for (var i = 0; i < 7; i++) {
        var px = b.x0 + h2(i * 3, 1) * b.W, py = b.yF + h2(i * 5, 2) * b.H;
        var pw2 = 6 + h2(i, 3) * 26, ph = 5 + h2(i, 4) * 20;
        c.fillStyle = 'rgba(96,88,76,.18)';
        c.beginPath();
        c.ellipse(px, py, pw2, ph, 0, 0, Z.TAU);
        c.fill();
      }
    }

    /* Weathering every material shares: dirt gathering at the bottom of
       the wall and running down from wherever water sits. */
    var g = c.createLinearGradient(0, b.y0 - b.H * 0.34, 0, b.y0);
    g.addColorStop(0, 'rgba(24,22,18,0)');
    g.addColorStop(1, 'rgba(24,22,18,.30)');
    c.fillStyle = g;
    c.fillRect(b.x0, b.yF, b.W, b.H);
    c.restore();
  }

  /* Secondary volumes get windows but not the full treatment: a grid of
     plain lights on the same storey rhythm as the block they belong to.
     They are there to be read as part of the same building, not to be
     looked at closely. */
  function secondaryWindows(c, b, g, def, h2, wins, salt) {
    if (b.H < PPM * 1.2 || b.W < PPM * 0.8) return;
    var rows = Math.max(1, Math.round(b.H / (PPM * 1.5)));
    var cols = Math.max(1, Math.round(b.W / (PPM * 1.5)));
    var pad = b.W * 0.12, usable = b.W - pad * 2;
    var gap = usable / (cols * 3.4);
    var ww = (usable - gap * (cols - 1)) / cols;
    var stH = b.H / rows;
    var pal = {
      frame: 'rgba(216,212,200,.26)', sill: 'rgba(206,202,190,.22)',
      curtain: 'rgba(186,166,150,.85)'
    };
    for (var r = 0; r < rows; r++) {
      for (var k = 0; k < cols; k++) {
        var wh = stH * 0.46;
        window1(c, b.x0 + pad + k * (ww + gap), b.yF + stH * r + (stH - wh) * 0.42,
                ww, wh, windowState(def, g, h2, k + salt * 7, r), pal, wins, 'counter');
      }
    }
  }

  /* The corners of the building, at the building's own scale.

     A wall this size needs its edges to turn, not to be edged: a soft
     gradient in from each side, one lit and one in shade, plus a hard
     line right on the arris. Masonry gets quoins, because a brick corner
     is a visibly different thing from a rendered one. */
  function corners(c, b, g) {
    var band = Math.max(5, b.W * 0.07);
    var gl = c.createLinearGradient(b.x0, 0, b.x0 + band, 0);
    gl.addColorStop(0, 'rgba(255,250,238,.16)');
    gl.addColorStop(1, 'rgba(255,250,238,0)');
    c.fillStyle = gl;
    c.fillRect(b.x0, b.yF, band, b.H);

    var gr = c.createLinearGradient(b.x1 - band, 0, b.x1, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,.18)');
    c.fillStyle = gr;
    c.fillRect(b.x1 - band, b.yF, band, b.H);

    /* the arris itself. The right-hand one is where the front wall turns
       into the flank, so it catches light rather than going dark. */
    c.fillStyle = 'rgba(255,250,238,.14)';
    c.fillRect(b.x0, b.yF, 1.4, b.H);
    c.fillStyle = 'rgba(255,250,238,.10)';
    c.fillRect(b.x1 - 1.4, b.yF, 1.4, b.H);

    if (g.mat === 'brick' || g.mat === 'stone' || g.mat === 'block') {
      var qh = Math.max(6, b.H * 0.045), qw = band * 0.72;
      for (var i = 0, y = b.yF; y < b.y0; y += qh, i++) {
        if (i % 2) continue;
        c.fillStyle = 'rgba(255,250,238,.07)';
        c.fillRect(b.x0, y, qw, qh - 1.5);
        c.fillStyle = 'rgba(0,0,0,.14)';
        c.fillRect(b.x1 - qw, y, qw, qh - 1.5);
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Windows
   * ------------------------------------------------------------------ */
  /* What a single window is. `state` does the work:
       0 intact   1 dirty   2 cracked   3 broken   4 boarded   5 curtained
     A window that can be lit reports itself back to the caller, so the
     renderer can turn it on after dark instead of the sprite deciding. */
  function window1(c, x, y, w, h, state, pal, wins, deep, arch) {
    var frame = pal.frame, r = Math.max(1, w * 0.06);

    /* An arched head, for the two types that asked for one. Drawn as a
       clip so every state below - glass, boards, curtains, the lot -
       comes out the right shape without any of them knowing about it. */
    if (arch) {
      c.save();
      c.beginPath();
      c.moveTo(x - r, y + w * 0.5);
      c.lineTo(x - r, y + h + r);
      c.lineTo(x + w + r, y + h + r);
      c.lineTo(x + w + r, y + w * 0.5);
      c.quadraticCurveTo(x + w / 2, y - r * 2, x - r, y + w * 0.5);
      c.closePath();
      c.clip();
    }

    /* The reveal: the wall is thick, so the glass is set back into it.

       Fully opaque, deliberately. The material texture - brick courses,
       panel joints, the ribs on a steel shed - is laid over the whole
       wall before any window is cut into it, and the glass below is
       painted with alpha. At 85% the joints showed straight through the
       glass, so every window on a panelled building had a set of fine
       lines ruled across it and the wall appeared to be drawn on top of
       its own windows. The opening has to actually mask the wall. */
    c.fillStyle = 'rgb(10,12,14)';
    c.fillRect(x - r, y - r, w + r * 2, h + r * 2);
    /* the shaded cheek of the reveal on one side proves the depth */
    c.fillStyle = 'rgba(0,0,0,.45)';
    c.fillRect(x - r, y - r, r + w * 0.10, h + r * 2);
    c.fillStyle = 'rgba(255,250,238,.10)';
    c.fillRect(x + w - w * 0.06, y - r, r + w * 0.06, h + r * 2);

    if (state === 4) {
      /* boarded: planks across, at angles, with the dark of the room in
         the gaps between them */
      c.fillStyle = 'rgb(14,16,18)';
      c.fillRect(x, y, w, h);
      for (var p = 0; p < 3; p++) {
        var py = y + h * (0.12 + p * 0.33);
        c.save();
        c.translate(x + w / 2, py + h * 0.1);
        c.rotate((p - 1) * 0.05);
        c.fillStyle = p % 2 ? 'rgba(126,98,62,.95)' : 'rgba(104,80,52,.95)';
        c.fillRect(-w * 0.58, -h * 0.09, w * 1.16, h * 0.19);
        c.fillStyle = 'rgba(255,240,210,.10)';
        c.fillRect(-w * 0.58, -h * 0.09, w * 1.16, 1.2);
        c.restore();
      }
      sill(c, x, y, w, h, pal);
      if (arch) { c.restore(); archRing(c, x, y, w, h, pal); }
      return;
    }

    if (state === 3) {
      /* gone: the room behind, a jagged rim of glass still in the frame */
      c.fillStyle = 'rgb(8,10,12)';
      c.fillRect(x, y, w, h);
      if (deep) interiorHint(c, x, y, w, h, deep);
      c.fillStyle = 'rgba(176,198,208,.30)';
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + w * 0.34, y + h * 0.20);
      c.lineTo(x + w * 0.62, y + h * 0.05);
      c.lineTo(x + w, y + h * 0.26);
      c.lineTo(x + w, y);
      c.closePath(); c.fill();
      c.beginPath();
      c.moveTo(x, y + h);
      c.lineTo(x + w * 0.28, y + h * 0.82);
      c.lineTo(x + w * 0.7, y + h * 0.92);
      c.lineTo(x + w, y + h);
      c.closePath(); c.fill();
      frameOf(c, x, y, w, h, frame);
      sill(c, x, y, w, h, pal);
      if (arch) { c.restore(); archRing(c, x, y, w, h, pal); }
      return;
    }

    /* an opaque backing, so the glass tints a room and not the brickwork */
    c.fillStyle = 'rgb(16,19,22)';
    c.fillRect(x, y, w, h);

    /* glass: dark room at the bottom, a slip of sky at the top. This
       gradient is the whole reason a window is not a grey rectangle. */
    var g = c.createLinearGradient(0, y, 0, y + h);
    if (state === 1) {
      g.addColorStop(0, 'rgba(86,96,100,.9)');
      g.addColorStop(0.5, 'rgba(46,52,54,.92)');
      g.addColorStop(1, 'rgba(24,28,30,.95)');
    } else {
      g.addColorStop(0, 'rgba(120,144,160,.9)');
      g.addColorStop(0.42, 'rgba(58,72,82,.93)');
      g.addColorStop(1, 'rgba(22,27,32,.96)');
    }
    c.fillStyle = g;
    c.fillRect(x, y, w, h);

    /* a hard diagonal highlight where the sky catches it */
    c.save();
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.fillStyle = 'rgba(206,224,236,.11)';
    c.beginPath();
    c.moveTo(x - w * 0.2, y + h * 0.75);
    c.lineTo(x + w * 0.55, y - h * 0.1);
    c.lineTo(x + w * 0.95, y - h * 0.1);
    c.lineTo(x + w * 0.2, y + h * 0.75);
    c.closePath(); c.fill();
    c.restore();

    if (state === 5) {
      /* curtains: two panels drawn most of the way across, hanging in
         folds, with a slot of dark room between them */
      c.fillStyle = pal.curtain;
      for (var s2 = 0; s2 < 2; s2++) {
        var cx0 = s2 ? x + w * 0.52 : x;
        c.fillRect(cx0, y, w * 0.48, h);
        c.fillStyle = 'rgba(0,0,0,.18)';
        for (var f = 0; f < 3; f++) {
          c.fillRect(cx0 + w * (0.08 + f * 0.14), y, 1.4, h);
        }
        c.fillStyle = pal.curtain;
      }
      c.fillStyle = 'rgba(6,8,10,.75)';
      c.fillRect(x + w * 0.47, y, w * 0.06, h);
    }

    if (state === 2) {
      /* cracked: a star from one point, which is what a stone does */
      var sx = x + w * 0.4, sy = y + h * 0.45;
      c.strokeStyle = 'rgba(232,240,246,.5)';
      c.lineWidth = 1;
      for (var k = 0; k < 6; k++) {
        var a = k * 1.04 + 0.3;
        c.beginPath();
        c.moveTo(sx, sy);
        c.lineTo(sx + Math.cos(a) * w * 0.55, sy + Math.sin(a) * h * 0.6);
        c.stroke();
      }
      c.beginPath();
      c.arc(sx, sy, Math.max(1.2, w * 0.07), 0, Z.TAU);
      c.fillStyle = 'rgba(14,16,18,.8)';
      c.fill();
    }

    /* glazing bars */
    c.fillStyle = 'rgba(232,228,216,.22)';
    c.fillRect(x, y + h * 0.5 - 0.7, w, 1.4);
    if (w > 14) c.fillRect(x + w * 0.5 - 0.7, y, 1.4, h);

    frameOf(c, x, y, w, h, frame);
    sill(c, x, y, w, h, pal);
    if (arch) { c.restore(); archRing(c, x, y, w, h, pal); }

    /* Only glass that still has a room behind it can light up. */
    if (wins && state !== 4) {
      wins.push({ x: x, y: y, w: w, h: h,
                  k: Z.hash2(Math.round(x * 3), Math.round(y * 3), 991),
                  curtain: state === 5 });
    }
  }

  /* The stone ring round an arched head, plus the mullion that makes it
     read as a church window rather than a doorway. */
  function archRing(c, x, y, w, h, pal) {
    var r = Math.max(1, w * 0.06);
    c.strokeStyle = pal.frame;
    c.lineWidth = Math.max(1.8, w * 0.09);
    c.beginPath();
    c.moveTo(x - r, y + h + r);
    c.lineTo(x - r, y + w * 0.5);
    c.quadraticCurveTo(x + w / 2, y - r * 2, x + w + r, y + w * 0.5);
    c.lineTo(x + w + r, y + h + r);
    c.stroke();
    c.lineWidth = 1;
    c.fillStyle = 'rgba(232,228,216,.20)';
    c.fillRect(x + w * 0.5 - 0.8, y + w * 0.3, 1.6, h - w * 0.3);
  }

  function frameOf(c, x, y, w, h, col) {
    c.strokeStyle = col;
    c.lineWidth = Math.max(1.4, w * 0.08);
    c.strokeRect(x + c.lineWidth / 2, y + c.lineWidth / 2, w - c.lineWidth, h - c.lineWidth);
    c.lineWidth = 1;
  }
  function sill(c, x, y, w, h, pal) {
    c.fillStyle = pal.sill;
    c.fillRect(x - w * 0.09, y + h, w * 1.18, Math.max(1.6, h * 0.07));
    c.fillStyle = 'rgba(0,0,0,.30)';
    c.fillRect(x - w * 0.09, y + h + Math.max(1.6, h * 0.07), w * 1.18, 1.4);
    /* the dirty streak that runs from every sill in a wet climate */
    var g = c.createLinearGradient(0, y + h, 0, y + h + h * 0.9);
    g.addColorStop(0, 'rgba(26,24,20,.26)');
    g.addColorStop(1, 'rgba(26,24,20,0)');
    c.fillStyle = g;
    c.fillRect(x, y + h, w, h * 0.9);
  }

  /* What you can see through a broken window or a shopfront: shelving,
     a counter, the suggestion of a room. Cheap, and it does more for
     "this building has an inside" than anything else on the facade. */
  function interiorHint(c, x, y, w, h, kind) {
    c.save();
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    if (kind === 'shelves') {
      c.fillStyle = 'rgba(58,56,50,.9)';
      for (var i = 0; i < 3; i++) {
        var sy = y + h * (0.34 + i * 0.24);
        c.fillRect(x + w * 0.06, sy, w * 0.88, Math.max(1.6, h * 0.05));
        for (var j = 0; j < 5; j++) {
          if (Z.hash2(i * 7 + j, Math.round(x), 61) < 0.4) continue;
          c.fillStyle = 'rgba(122,110,86,.55)';
          c.fillRect(x + w * (0.1 + j * 0.17), sy - h * 0.09, w * 0.11, h * 0.09);
          c.fillStyle = 'rgba(58,56,50,.9)';
        }
      }
    } else if (kind === 'counter') {
      c.fillStyle = 'rgba(64,62,58,.9)';
      c.fillRect(x + w * 0.1, y + h * 0.55, w * 0.8, h * 0.3);
      c.fillStyle = 'rgba(96,94,88,.6)';
      c.fillRect(x + w * 0.1, y + h * 0.55, w * 0.8, h * 0.06);
    } else if (kind === 'beds') {
      c.fillStyle = 'rgba(78,76,70,.8)';
      c.fillRect(x + w * 0.12, y + h * 0.6, w * 0.34, h * 0.24);
      c.fillRect(x + w * 0.56, y + h * 0.6, w * 0.34, h * 0.24);
    } else {
      c.fillStyle = 'rgba(48,46,44,.7)';
      c.fillRect(x + w * 0.2, y + h * 0.5, w * 0.6, h * 0.4);
    }
    c.restore();
  }

  /* ------------------------------------------------------------------ *
   * The genome
   *
   * Everything that makes this building this building, from the recipe
   * and one integer. Quantised on purpose: two buildings with the same
   * genome share a bake, which is what keeps a city of four hundred
   * buildings inside a cache of eighty.
   * ------------------------------------------------------------------ */
  function genome(def, vi) {
    var f = def.face || {};
    var H = function (n) { return Z.hash2(vi, n, 7717); };
    var mats = { brick: ['brick', 'brick', 'stucco', 'block'],
                 stucco: ['stucco', 'stucco', 'render', 'brick'],
                 concrete: ['concrete', 'concrete', 'panel'],
                 panel: ['panel', 'panel', 'steel', 'concrete'],
                 steel: ['steel', 'steel', 'panel'],
                 siding: ['siding', 'siding', 'stucco'],
                 block: ['block', 'block', 'concrete'],
                 stone: ['stone', 'stone', 'brick'],
                 glass: ['glass', 'glass', 'panel'] };
    var fam = mats[f.mat] || ['stucco'];
    var mat = fam[Math.floor(H(1) * fam.length) % fam.length];
    if (!MAT[mat]) mat = 'stucco';

    var pal = MAT[mat].base;
    var wall = pal[Math.floor(H(2) * pal.length) % pal.length];

    /* Paint.

       Materials alone gave a city of nine greys and two browns. Anything
       rendered, clad or boarded was painted at some point, so those
       materials take a colour off a curated list and keep it at low
       strength - faded, chalky, and never a hue the concrete could not
       have been painted. Brick and stone are left as they are.

       The list matters: an earlier version randomised the three channels
       independently, which is how the suburbs ended up with mint green
       curtains. A hue nobody chose is the one thing that reads as a bug. */
    if (PAINTABLE[mat]) {
      var paint = PAINT[Math.floor(H(12) * PAINT.length) % PAINT.length];
      wall = Z.mix(wall, paint, 0.34 + H(13) * 0.36);
    }

    /* Storey count wanders, but never below one and never so far that a
       bungalow turns into a tower. */
    var st = f.storeys || 1;
    var jitter = st <= 2 ? Math.round(H(3) * 1.4 - 0.4)
               : Math.round((H(3) - 0.45) * Math.max(2, st * 0.4));
    var storeys = Math.max(1, st + jitter);

    var dmg = f.damage != null ? f.damage : Math.floor(H(4) * 3.3);   /* 0..3 */

    return {
      mat: mat,
      wall: wall,
      roofCol: Z.shade(wall, -0.30),
      storeys: storeys,
      storeyH: (f.storeyH || 3) * (0.92 + H(5) * 0.2),
      win: f.win || 'punched',
      front: f.front || 'porch',
      roof: f.roof || 'flat',
      kit: f.kit || [],
      extras: f.extras || [],
      sign: f.sign,
      damage: dmg,
      cols: 0,
      H: H
    };
  }

  /* ------------------------------------------------------------------ *
   * Volumes
   *
   * Every building used to be one box drawn by the prop kit, which gives
   * a front face and a top face and nothing else. Head-on that is all you
   * can see - which is why they read as cardboard: a flat wall, a hard cut
   * at each edge, and no sense of the thing being solid.
   *
   * So the whole city is pushed a few degrees off axis. The top face is a
   * parallelogram sheared to the right rather than a rectangle, which
   * means the left flank of every building comes into view and can be
   * drawn as a wall in its own right. The shear is the same for every
   * volume in the city, so nothing disagrees about where the camera is.
   * ------------------------------------------------------------------ */
  var SHEAR = 0.26;                /* how much of the depth shows as flank */
  /* How much of the footprint's depth is actually drawn as roof.

     Geometrically it should be all of it, and it was: a five-metre-deep
     shop then had a roof plane two thirds as tall as its walls, and a
     street of them read as a row of ramps with windows underneath. The
     heights are already stylised (see Z.wallHeight); the roofs have to
     be stylised with them or the two do not agree. */
  var ROOFD = 0.52;

  function drawVolume(c, cx, baseY, w, d, h, wall, roofCol, opt) {
    opt = opt || {};
    var W = w * PPM, D = d * PPM * PITCH * ROOFD, H = h * PPM;
    var x0 = cx - W / 2, x1 = x0 + W;
    var y0 = baseY, yF = y0 - H, yB = yF - D;
    var sh = D * SHEAR;

    /* ---- the base course ----

       Every volume stands on its own, and it wraps round onto the flank
       with the wall above it. There used to be a single plinth drawn for
       the whole footprint before any volume went up, which on anything
       with a wing was wider than the block standing on it and offset from
       it - so the ground floor appeared to hang out past its own walls. */
    var pH = 0.11 * PPM, pO = 3;
    c.fillStyle = Z.rgb(Z.shade(wall, -0.46));
    c.fillRect(x0 - pO, y0, W + pO * 2, pH);
    if (sh > 1.5) {
      c.fillStyle = Z.rgb(Z.shade(wall, -0.54));
      c.beginPath();
      c.moveTo(x1 + pO, y0);
      c.lineTo(x1 + pO + sh, y0 - D);
      c.lineTo(x1 + pO + sh, y0 - D + pH);
      c.lineTo(x1 + pO, y0 + pH);
      c.closePath(); c.fill();
    }
    c.fillStyle = Z.rgb(Z.shade(wall, -0.20));
    c.fillRect(x0 - pO, y0 - 1.5, W + pO * 2, 1.5);

    /* ---- the flank ----

       On the RIGHT, because that is the side the shear actually reveals.
       The top face leans up and to the right going back, so the depth
       axis points that way, so the face you can see round the corner is
       the right-hand one. Drawing it on the left instead - which is what
       the first version did - put it underneath the front wall, where it
       was covered completely and did nothing, and left the roof jutting
       out to the right over open air with no wall beneath it. That
       floating flap of roof is the thing that looked broken. */
    if (sh > 1.5) {
      var fg = c.createLinearGradient(x1, 0, x1 + sh, 0);
      fg.addColorStop(0, Z.rgb(Z.shade(wall, -0.24)));
      fg.addColorStop(1, Z.rgb(Z.shade(wall, -0.42)));
      c.fillStyle = fg;
      c.beginPath();
      c.moveTo(x1, yF);
      c.lineTo(x1 + sh, yB);
      c.lineTo(x1 + sh, yB + H);
      c.lineTo(x1, y0);
      c.closePath();
      c.fill();

      c.save();
      c.beginPath();
      c.moveTo(x1, yF); c.lineTo(x1 + sh, yB);
      c.lineTo(x1 + sh, yB + H); c.lineTo(x1, y0);
      c.closePath(); c.clip();
      /* courses running back along it, so it reads as a wall turning the
         corner rather than as a wedge of shadow */
      c.strokeStyle = 'rgba(0,0,0,.20)';
      c.lineWidth = 1;
      for (var fy = yF; fy < y0 + D; fy += Math.max(9, H / 7)) {
        c.beginPath();
        c.moveTo(x1, fy); c.lineTo(x1 + sh, fy - D);
        c.stroke();
      }
      /* and the same ground contact the front face gets */
      var fgs = c.createLinearGradient(0, y0 - H * 0.3, 0, y0);
      fgs.addColorStop(0, 'rgba(0,0,0,0)');
      fgs.addColorStop(1, 'rgba(0,0,0,.34)');
      c.fillStyle = fgs;
      c.fillRect(x1, yF - D, sh + 2, H + D);
      c.restore();
    }

    /* ---- the top ---- */
    var gt = c.createLinearGradient(0, yB, 0, yF);
    gt.addColorStop(0, Z.rgb(Z.shade(roofCol, 0.22)));
    gt.addColorStop(1, Z.rgb(Z.shade(roofCol, -0.04)));
    c.fillStyle = gt;
    c.beginPath();
    c.moveTo(x0, yF);
    c.lineTo(x1, yF);
    c.lineTo(x1 + sh, yB);
    c.lineTo(x0 + sh, yB);
    c.closePath();
    c.fill();

    /* ---- the face ---- */
    var g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, Z.rgb(Z.shade(wall, 0.14)));
    g.addColorStop(0.62, Z.rgb(wall));
    g.addColorStop(1, Z.rgb(Z.shade(wall, -0.26)));
    c.fillStyle = g;
    c.fillRect(x0, yF, W, H);

    /* where the face meets the ground */
    var gs = c.createLinearGradient(0, y0 - H * 0.3, 0, y0);
    gs.addColorStop(0, 'rgba(0,0,0,0)');
    gs.addColorStop(1, 'rgba(0,0,0,.32)');
    c.fillStyle = gs;
    c.fillRect(x0, yF, W, H);

    /* the arris between face and flank, which is what sells the turn */
    c.fillStyle = 'rgba(255,250,238,.15)';
    c.fillRect(x0, yF, 1.6, H);
    c.fillStyle = 'rgba(255,250,238,.10)';
    c.fillRect(x1 - 1.6, yF, 1.6, H);
    c.strokeStyle = 'rgba(6,8,10,.55)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x0, yF); c.lineTo(x1, yF); c.lineTo(x1 + sh, yB);
    c.moveTo(x1, yF); c.lineTo(x1, y0);
    c.moveTo(x1 + sh, yB); c.lineTo(x1 + sh, yB + H);
    c.stroke();
    c.lineWidth = 1;

    return { x0: x0, x1: x1, yF: yF, yB: yB, y0: y0, W: W, D: D, H: H, sh: sh };
  }

  /* ------------------------------------------------------------------ *
   * Massing
   *
   * A city of one silhouette is a city of one building. Every type keeps
   * its footprint - the collision and the lots depend on it - but the
   * volume standing on that footprint is composed rather than assumed:
   * a wing dropping to two storeys, a tower set back off a podium, a
   * stair core projecting past the front wall, an upper floor stepped in.
   *
   * The detailed facade - windows, shopfront, signage - is always drawn on
   * the primary volume. The secondaries are plain walls with a light pass
   * of glazing, which is enough: what they are for is the outline.
   * ------------------------------------------------------------------ */
  function massing(def, g, w, d, wallH, H) {
    /* `podium` is gone: it stood a full-width volume in front of the main
       block, which is exactly where the shopfront, the doorway and the
       sign are, so a third of the shops in town had their own frontage
       built over. Variety has to come from the outline, not from burying
       the part of the building the player reads. */
    var forms = ['slab', 'slab', 'wing', 'wing', 'setback', 'bay'];
    /* small houses stay simple; only something with room gets a wing */
    if (w < 4.4) forms = ['slab', 'slab', 'bay'];
    /* A storey set back on top only works over a flat roof. Offering it
       to a house put a little walled box on the tiles, and since the box
       gets ordinary windows the result was a boarded-up window lying flat
       on the roof - which is what "the roofs are still broken" was.
       A roof that has fallen in cannot carry one either. */
    var rk = def.face.roof;
    if (rk === 'hip' || rk === 'gable' || rk === 'collapsed' || rk === 'vault') {
      forms = ['slab', 'slab', 'slab', 'wing', 'bay'];
    }
    var form = forms[Math.floor(H(20) * forms.length) % forms.length];
    var left = H(21) > 0.5;
    var main = { w: w, cx: 0, d: d, h: wallH }, sec = [];

    if (form === 'wing') {
      var cut = 0.34 + H(22) * 0.14;
      main.w = w * (1 - cut);
      main.cx = (left ? 1 : -1) * (w * cut) / 2;
      /* Same depth as the block it is attached to. Giving the wing its
         own shallower depth put its back wall somewhere else, so the two
         roofs stepped apart and the result read as two buildings shoved
         together rather than one with a lower wing. */
      sec.push({ w: w * cut, cx: (left ? -1 : 1) * main.w / 2,
                 d: d,
                 h: wallH * (0.52 + H(24) * 0.2),
                 /* a lean-to on a tiled house is tiled, not felted */
                 roofKind: (rk === 'hip' || rk === 'gable' || rk === 'collapsed')
                           ? 'hip' : 'flat' });

    } else if (form === 'setback') {
      main.h = wallH * (0.66 + H(25) * 0.12);
      sec.push({ w: w * (0.46 + H(26) * 0.16), cx: (H(27) - 0.5) * w * 0.14,
                 d: d * 0.62, h: wallH * (0.34 + H(34) * 0.16),
                 top: true, roofKind: 'flat' });

    } else if (form === 'bay') {
      sec.push({ w: w * (0.15 + H(31) * 0.08), cx: (H(32) - 0.5) * w * 0.52,
                 d: d * 0.22, h: wallH * (0.34 + H(33) * 0.16),
                 front: true, roofKind: 'flat' });
    }
    return { form: form, main: main, sec: sec };
  }

  /* ------------------------------------------------------------------ *
   * The facade
   * ------------------------------------------------------------------ */
  function facade(def, vi) {
    var g = genome(def, vi);
    var H = g.H;
    var w = def.fw - 0.3, d = def.fh - 0.4;
    /* Stylised, not measured - see Z.wallHeight. */
    var wallH = Z.wallHeight(g.storeys, g.storeyH);
    var roofExtra = g.roof === 'hip' || g.roof === 'gable' ? 1.5
                  : g.roof === 'vault' ? 1.9 : 0.5;
    /* Headroom above the wall head for whatever stands on the roof. A
       steeple or a clock tower is several metres of spire, not an
       air-conditioning unit, and at 1.6m their tips were sliced off by
       the top of the sprite. */
    var hasTower = (g.kit.indexOf('steeple') >= 0) || (g.kit.indexOf('clockTower') >= 0);
    var kitH = hasTower ? 6.4 : 1.6;

    var plan = massing(def, g, w, d, wallH, H);
    /* the canvas has to hold the tallest thing the massing put up */
    var tallest = wallH;
    for (var si = 0; si < plan.sec.length; si++) {
      tallest = Math.max(tallest, plan.sec[si].top ? plan.main.h + plan.sec[si].h
                                                   : plan.sec[si].h);
    }

    /* The sprite has to hold more than the footprint: the flank sticks out
       to the right by the shear, the eaves overhang both sides, and a
       wing can reach past the main block. The margin is computed rather
       than guessed - a fixed one clipped the new right-hand wall off
       every building in the catalogue. */
    var pad = Math.ceil(d * PPM * PITCH * ROOFD * SHEAR) +
              Math.ceil(w * PPM * 0.07) + 30;
    var cw = Math.ceil(w * PPM) + pad * 2;
    var ch = Math.ceil((tallest + roofExtra + kitH) * PPM) +
             Math.ceil(d * PPM * PITCH) + 44;
    /* Room under the origin. Half a depth puts the front wall on the front
       of the footprint; the extra covers a volume that projects forward of
       it - an entrance bay stands nearer the camera than the wall it is
       attached to, and at half a depth its base was sliced off. */
    var below = 18 + Math.ceil(d * PPM * PITCH * 0.72);
    var cv = K.mk(cw, ch + below, cw / 2, ch + below - below);
    cv._ppm = PPM;
    var c = cv.getContext('2d');

    /* The sprite's origin is the centre of the footprint, so a building
       drawn from the prop's position must be pushed back by half its own
       depth or it stands entirely behind the tiles it occupies. */
    var ox = cv._ox, oy = cv._oy + d * PPM * PITCH * 0.5;

    var wins = [];
    var h2 = function (a, b) { return Z.hash2(a + vi * 31, b, 4441); };

    /* Secondaries that stand behind or beside the main block go down
       first; the one that projects in front of it goes down last, after
       the primary facade has been detailed. */
    var baseY = oy - 0.10 * PPM;
    var frontSec = [], topSec = [];
    for (si = 0; si < plan.sec.length; si++) {
      var sv = plan.sec[si];
      if (sv.front) { frontSec.push(sv); continue; }
      if (sv.top) { topSec.push(sv); continue; }
      var sb = drawVolume(c, ox + sv.cx * PPM, baseY,
                          sv.w, sv.d, sv.h, Z.shade(g.wall, -0.06),
                          Z.shade(g.roofCol, -0.04));
      texture(c, sb, g.mat, h2);
      secondaryWindows(c, sb, g, def, h2, wins, si);
      if (sv.roofKind === 'hip') {
        pitchRoof(c, sb, g, sv.d, h2, false);
      } else {
        var sg = { kit: ['vent'], wall: g.wall, roofCol: g.roofCol,
                   storeys: 1, roof: 'flat' };
        roofDeck(c, sb, sg, h2);
        roofKit(c, sb, sg, h2, null, false);
      }
    }

    var b = drawVolume(c, ox + plan.main.cx * PPM, baseY,
                       plan.main.w, plan.main.d, plan.main.h, g.wall, g.roofCol);
    g.sh = b.sh;
    texture(c, b, g.mat, h2);
    corners(c, b, g);

    var pal = {
      frame: 'rgba(216,212,200,.34)',
      sill: 'rgba(206,202,190,.30)',
      curtain: 'rgba(' + CURTAIN[Math.floor(H(9) * CURTAIN.length) % CURTAIN.length] + ',.85)'
    };

    /* ---- how the wall is divided ---- */
    var groundFrac = g.win === 'storefront' ? 0.62 / Math.max(1, g.storeys)
                   : (g.storeys > 1 ? 1 / g.storeys : 0.55);
    var groundH = b.H * groundFrac;
    var upperTop = b.yF, upperH = b.H - groundH;
    var upperStoreys = Math.max(0, g.storeys - 1);
    if (g.win === 'storefront' && g.storeys === 1) upperStoreys = 0;

    wallH = plan.main.h;
    var interior = def.loot === 'food' || def.loot === 'grocery' ? 'shelves'
                 : def.loot === 'meds' || def.loot === 'medsAdv' ? 'shelves'
                 : def.loot === 'house' || def.loot === 'hotel' ? 'beds'
                 : 'counter';

    /* ---- the windows above ---- */
    /* A single-storey shed or supermarket has no upper floors, and the
       first build left it a blank wall three metres high. Real ones have
       a strip of clerestory glazing up under the eaves, which is also the
       only thing that lights them; that is what this is. */
    if (upperStoreys === 0 && g.win !== 'openDeck' && g.front !== 'glazing') {
      var cn = Math.max(3, Math.round(w / 1.5));
      var chH = Math.min(b.H * 0.16, PPM * 0.4);
      var chY = b.yF + b.H * 0.12;
      for (var ci = 0; ci < cn; ci++) {
        var cx2 = b.x0 + b.W * (0.06 + ci * (0.88 / cn));
        window1(c, cx2, chY, b.W * (0.88 / cn) * 0.78, chH,
                h2(ci * 5, 61) > 0.72 ? 3 : (h2(ci * 5, 62) > 0.5 ? 1 : 0),
                pal, wins, interior, g.win === 'arched');
      }
    }

    var cols, r, k2;
    if (upperStoreys > 0 && g.win !== 'openDeck') {
      /* arched windows are tall and few; punched ones are neither */
      cols = Math.max(2, Math.round(w / (g.win === 'curtain' ? 1.0
                                       : g.win === 'arched' ? 2.1 : 1.55)));
      g.cols = cols;
      var pad = b.W * 0.045;
      var usable = b.W - pad * 2;
      var gapX = g.win === 'ribbon' ? usable * 0.012 : usable / (cols * 3.1);
      var ww = (usable - gapX * (cols - 1)) / cols;
      var stH = upperH / upperStoreys;

      for (r = 0; r < upperStoreys; r++) {
        var rowY = upperTop + stH * r;
        var wh = g.win === 'ribbon' ? stH * 0.46
               : g.win === 'arched' ? stH * 0.74 : stH * 0.56;
        var wy = rowY + (stH - wh) * (g.win === 'ribbon' ? 0.32 : 0.42);
        for (k2 = 0; k2 < cols; k2++) {
          var wx = b.x0 + pad + k2 * (ww + gapX);
          var st8 = windowState(def, g, h2, k2, r);
          window1(c, wx, wy, ww, wh, st8, pal, wins, interior, g.win === 'arched');
        }
        /* a spandrel band between floors reads as a floor slab */
        if (g.win === 'ribbon' || g.win === 'curtain') {
          c.fillStyle = 'rgba(228,224,210,.09)';
          c.fillRect(b.x0, rowY + stH - 2.5, b.W, 2.5);
          c.fillStyle = 'rgba(0,0,0,.16)';
          c.fillRect(b.x0, rowY + stH, b.W, 1.6);
        }
      }
    } else if (g.win === 'openDeck') {
      /* a parking deck: open sides with a spandrel at every level */
      var lv = g.storeys;
      for (r = 0; r < lv; r++) {
        var ly = b.yF + (b.H / lv) * r;
        c.fillStyle = 'rgba(10,12,14,.72)';
        c.fillRect(b.x0 + 3, ly + b.H / lv * 0.25, b.W - 6, b.H / lv * 0.55);
        c.fillStyle = Z.rgb(Z.shade(g.wall, -0.1));
        c.fillRect(b.x0, ly, b.W, b.H / lv * 0.25);
        c.fillStyle = 'rgba(232,228,214,.10)';
        c.fillRect(b.x0, ly, b.W, 2);
        /* cars parked on the deck, seen end-on through the opening */
        for (k2 = 0; k2 < 4; k2++) {
          if (h2(r * 5 + k2, 3) < 0.45) continue;
          var cxp = b.x0 + b.W * (0.1 + k2 * 0.22);
          c.fillStyle = 'rgba(70,76,82,.8)';
          c.fillRect(cxp, ly + b.H / lv * 0.55, b.W * 0.15, b.H / lv * 0.22);
        }
      }
    }

    /* ---- the ground floor ---- */
    groundFloor(c, b, g, def, groundH, pal, wins, interior, h2);

    /* ---- what is bolted on ---- */
    extras(c, b, g, def, h2, wins);

    /* ---- the sign ---- */
    if (g.sign && g.sign.style !== 'none') sign(c, b, g, def, groundH, h2);

    /* ---- damage ---- */
    damage(c, b, g, h2);

    /* ---- the roof ---- */
    roofOf(c, b, g, ox, w, d, h2, wins);

    /* ---- the storey set back on top of it ----
       Drawn after the main roof, because that is what it is standing on. */
    for (si = 0; si < topSec.length; si++) {
      var tv = topSec[si];
      var tb = drawVolume(c, ox + tv.cx * PPM, b.yF + 2,
                          tv.w, tv.d, tv.h, Z.shade(g.wall, 0.03),
                          Z.shade(g.roofCol, 0.02));
      texture(c, tb, g.mat, h2);
      corners(c, tb, g);
      secondaryWindows(c, tb, g, def, h2, wins, 20 + si);
      var tg = { kit: ['hvac'], wall: g.wall, roofCol: g.roofCol,
                 storeys: 1, roof: 'flat' };
      roofDeck(c, tb, tg, h2);
      roofKit(c, tb, tg, h2, wins, false);
    }

    /* ---- and whatever stands in front of it ----
       A stair core or an entrance bay is nearer the camera than the wall
       it is attached to, so it has to go down after the wall is finished
       or the windows would show through it. */
    for (si = 0; si < frontSec.length; si++) {
      var fv = frontSec[si];
      var fb = drawVolume(c, ox + fv.cx * PPM, baseY + fv.d * PPM * PITCH * 0.5,
                          fv.w, fv.d, fv.h, Z.shade(g.wall, 0.05),
                          Z.shade(g.roofCol, 0.03));
      texture(c, fb, g.mat, h2);
      secondaryWindows(c, fb, g, def, h2, wins, 40 + si);
      roofDeck(c, fb, { kit: [], wall: g.wall, roofCol: g.roofCol,
                        storeys: 1, roof: 'flat' }, h2);
    }

    cv._wins = wins;
    return cv;
  }

  /* How likely a given window is to be in a given state. Derelict
     buildings board up and break; a tower's curtain wall mostly just gets
     dirty, because nobody was throwing bricks at the tenth floor. */
  function windowState(def, g, h2, col, row) {
    var n = h2(col * 13 + 5, row * 7 + 3);
    var high = row < g.storeys - 3;
    var d = g.damage;
    if (g.win === 'curtain') return n > 0.93 - d * 0.04 ? 3 : (n > 0.6 ? 1 : 0);

    /* One damage budget, split three ways, instead of three independent
       thresholds. The thresholds version compounded: a derelict building
       came out with half its windows boarded over, which buries the glass
       - and the glass is the most detailed thing on the wall. */
    var dmg = 0.10 + d * 0.055;
    if (!high && n > 1 - dmg * 0.38) return 4;              /* boarded up */
    if (n > 1 - dmg * 0.75) return 3;                       /* gone */
    if (n > 1 - dmg) return 2;                              /* cracked */
    if (def.loot === 'house' || def.loot === 'hotel') {
      if (n < 0.32) return 5;                               /* curtains */
    }
    return n < 0.56 ? 1 : 0;
  }

  /* ------------------------------------------------------------------ *
   * Ground floors
   * ------------------------------------------------------------------ */
  function groundFloor(c, b, g, def, gh, pal, wins, interior, h2) {
    var y0 = b.y0 - gh;
    var f = g.front;

    if (f === 'glazing' || f === 'forecourt') {
      /* A shopfront: a stall riser, full-height glass in bays, a door in
         one of them, and the shop visible through whatever is left. */
      c.fillStyle = Z.rgb(Z.shade(g.wall, -0.26));
      c.fillRect(b.x0, y0, b.W, gh);
      var bays = Math.max(2, Math.round(b.W / (PPM * 1.5)));
      var riser = gh * 0.14;
      var bw = b.W / bays;
      for (var i = 0; i < bays; i++) {
        var bx = b.x0 + i * bw + bw * 0.08;
        var bwid = bw * 0.84;
        var st = h2(i * 11, 21) > 0.62 ? 3 : (h2(i * 11, 23) > 0.72 ? 2 : 0);
        var doorBay = i === Math.floor(bays * 0.5);
        if (doorBay) {
          shopDoor(c, bx, y0 + riser * 0.4, bwid, gh - riser * 0.4, pal, h2);
        } else {
          window1(c, bx, y0 + riser, bwid, gh - riser * 2.0, st, pal, wins, interior);
        }
      }
      /* stall riser and the transom above */
      c.fillStyle = Z.rgb(Z.shade(g.wall, -0.42));
      c.fillRect(b.x0, b.y0 - riser, b.W, riser);
      c.fillStyle = 'rgba(232,228,214,.12)';
      c.fillRect(b.x0, y0, b.W, 2.4);

    } else if (f === 'dock') {
      /* roller shutters, a loading platform and the yellow line */
      var doors = Math.max(2, Math.round(b.W / (PPM * 2.0)));
      for (var d2 = 0; d2 < doors; d2++) {
        var dx = b.x0 + b.W * ((d2 + 0.5) / doors) - b.W / doors * 0.34;
        var dw = b.W / doors * 0.68, dh = gh * 0.82;
        shutter(c, dx, b.y0 - dh, dw, dh, h2, d2);
      }
      c.fillStyle = 'rgba(92,90,84,.95)';
      c.fillRect(b.x0 - 4, b.y0 - gh * 0.16, b.W + 8, gh * 0.16);
      c.fillStyle = 'rgba(206,166,52,.45)';
      c.fillRect(b.x0 - 4, b.y0 - gh * 0.16, b.W + 8, 2.4);

    } else if (f === 'shutter') {
      shutter(c, b.x0 + b.W * 0.08, b.y0 - gh * 0.8, b.W * 0.55, gh * 0.8, h2, 1);
      doorway(c, b.x0 + b.W * 0.74, b.y0 - gh * 0.72, b.W * 0.16, gh * 0.72, pal);

    } else if (f === 'lobby' || f === 'canopy' || f === 'emergency') {
      /* glazed lobby, dark, with a revolving door or a bay of glass */
      c.fillStyle = 'rgba(14,20,26,.72)';
      c.fillRect(b.x0 + b.W * 0.04, y0, b.W * 0.92, gh);
      for (var l = 0; l < 5; l++) {
        c.fillStyle = 'rgba(168,190,206,.13)';
        c.fillRect(b.x0 + b.W * (0.07 + l * 0.18), y0 + 3, b.W * 0.12, gh - 8);
      }
      doorway(c, b.x0 + b.W * 0.44, b.y0 - gh * 0.78, b.W * 0.15, gh * 0.78, pal);
      c.fillStyle = 'rgba(232,228,214,.12)';
      c.fillRect(b.x0, y0, b.W, 2.2);
      if (f === 'canopy' || f === 'emergency') {
        c.fillStyle = 'rgba(64,68,72,.95)';
        c.fillRect(b.x0 + b.W * 0.2, y0 - 7, b.W * 0.6, 6);
        c.fillStyle = 'rgba(232,228,214,.16)';
        c.fillRect(b.x0 + b.W * 0.2, y0 - 7, b.W * 0.6, 2);
      }
      if (f === 'emergency') {
        /* the one red thing on the building */
        c.fillStyle = 'rgba(196,58,48,.9)';
        c.fillRect(b.x0 + b.W * 0.22, y0 - 16, b.W * 0.3, 9);
        c.fillStyle = 'rgba(255,240,236,.9)';
        c.fillRect(b.x0 + b.W * 0.34, y0 - 14.5, b.W * 0.045, 6);
        c.fillRect(b.x0 + b.W * 0.305, y0 - 12.8, b.W * 0.115, 2.6);
      }

    } else if (f === 'colonnade') {
      /* columns, a recessed entrance and steps: the civic front */
      c.fillStyle = 'rgba(12,14,16,.62)';
      c.fillRect(b.x0 + b.W * 0.06, y0, b.W * 0.88, gh);
      var n = Math.max(3, Math.round(b.W / (PPM * 1.1)));
      for (var p = 0; p < n; p++) {
        var px = b.x0 + b.W * (0.05 + p * (0.9 / (n - 1))) - b.W * 0.022;
        K.cyl(c, px + b.W * 0.022, b.y0, b.W * 0.024 / PPM, gh / PPM,
              Z.shade(g.wall, 0.12), Z.shade(g.wall, 0.22));
      }
      doorway(c, b.x0 + b.W * 0.44, b.y0 - gh * 0.66, b.W * 0.14, gh * 0.66, pal);
      steps(c, b, gh * 0.12);

    } else if (f === 'walkway') {
      /* motel: doors in a row under a continuous balcony */
      var rooms = Math.max(3, Math.round(b.W / (PPM * 1.0)));
      for (var m = 0; m < rooms; m++) {
        var mx = b.x0 + b.W * ((m + 0.5) / rooms);
        doorway(c, mx - b.W * 0.028, b.y0 - gh * 0.72, b.W * 0.056, gh * 0.72, pal);
        window1(c, mx + b.W * 0.04, b.y0 - gh * 0.66, b.W * 0.05, gh * 0.4,
                h2(m, 31) > 0.7 ? 3 : 5, pal, wins, 'beds');
      }

    } else if (f === 'stoop') {
      steps(c, b, gh * 0.2);
      doorway(c, b.x0 + b.W * (0.2 + h2(1, 1) * 0.5), b.y0 - gh * 0.7, b.W * 0.17, gh * 0.7, pal);
      window1(c, b.x0 + b.W * 0.06, b.y0 - gh * 0.72, b.W * 0.22, gh * 0.44,
              h2(2, 2) > 0.7 ? 4 : 5, pal, wins, 'beds');

    } else if (f === 'ramp') {
      c.fillStyle = 'rgba(10,12,14,.75)';
      c.fillRect(b.x0 + b.W * 0.1, b.y0 - gh * 0.7, b.W * 0.3, gh * 0.7);
      c.fillStyle = 'rgba(206,166,52,.35)';
      c.fillRect(b.x0 + b.W * 0.1, b.y0 - 3, b.W * 0.3, 3);
      c.fillStyle = Z.rgb(Z.shade(g.wall, -0.1));
      c.fillRect(b.x0 + b.W * 0.45, b.y0 - gh, b.W * 0.5, gh);

    } else {
      /* porch: the ordinary front of an ordinary house */
      var dx2 = 0.22 + h2(3, 3) * 0.44;
      doorway(c, b.x0 + b.W * dx2, b.y0 - gh * 0.68, b.W * 0.15, gh * 0.68, pal);
      /* a canopy on two posts over it */
      c.fillStyle = Z.rgb(Z.shade(g.roofCol, 0.1));
      c.fillRect(b.x0 + b.W * dx2 - 7, b.y0 - gh * 0.72, b.W * 0.15 + 14, 5);
      c.fillStyle = 'rgba(60,54,46,.8)';
      c.fillRect(b.x0 + b.W * dx2 - 5, b.y0 - gh * 0.72, 2.5, gh * 0.72);
      c.fillRect(b.x0 + b.W * dx2 + b.W * 0.15 + 2.5, b.y0 - gh * 0.72, 2.5, gh * 0.72);
      /* and the front windows either side */
      var fw2 = b.W * 0.2;
      if (dx2 > 0.34) {
        window1(c, b.x0 + b.W * 0.06, b.y0 - gh * 0.76, fw2, gh * 0.46,
                windowState(def, g, h2, 1, 0), pal, wins, 'beds');
      }
      if (dx2 < 0.5) {
        window1(c, b.x1 - b.W * 0.06 - fw2, b.y0 - gh * 0.76, fw2, gh * 0.46,
                windowState(def, g, h2, 2, 0), pal, wins, 'beds');
      }
      steps(c, b, gh * 0.08);
    }

    /* the street number, beside whatever the door was */
    c.fillStyle = 'rgba(224,220,206,.34)';
    c.fillRect(b.x0 + b.W * 0.9, b.y0 - gh * 0.62, 5, 7);
  }

  function doorway(c, x, y, w, h, pal) {
    c.fillStyle = 'rgba(206,202,190,.18)';
    c.fillRect(x - 2.5, y - 2.5, w + 5, h + 2.5);
    c.fillStyle = 'rgba(12,14,16,.94)';
    c.fillRect(x, y, w, h);
    /* a door still on its hinges, half open more often than not */
    c.fillStyle = 'rgba(86,74,58,.85)';
    c.fillRect(x + w * 0.04, y + 2, w * 0.58, h - 3);
    c.fillStyle = 'rgba(0,0,0,.3)';
    c.fillRect(x + w * 0.62, y + 2, w * 0.34, h - 3);
    c.fillStyle = 'rgba(214,206,186,.5)';
    c.fillRect(x + w * 0.5, y + h * 0.5, 2.4, 2.4);
  }

  function shopDoor(c, x, y, w, h, pal, h2) {
    c.fillStyle = 'rgba(10,12,14,.9)';
    c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(142,164,178,.2)';
    c.fillRect(x + w * 0.08, y + h * 0.06, w * 0.38, h * 0.8);
    c.fillRect(x + w * 0.54, y + h * 0.06, w * 0.38, h * 0.8);
    c.fillStyle = 'rgba(206,202,190,.3)';
    c.fillRect(x + w * 0.48, y, w * 0.045, h);
    c.fillRect(x, y, w, 2);
    /* the handle bar across both leaves */
    c.fillStyle = 'rgba(226,222,210,.4)';
    c.fillRect(x + w * 0.1, y + h * 0.52, w * 0.8, 2);
  }

  function shutter(c, x, y, w, h, h2, seed) {
    var open = h2(seed * 17, 41);
    var shown = open > 0.72 ? h * (0.3 + h2(seed, 9) * 0.4) : h;
    c.fillStyle = 'rgba(10,12,14,.95)';
    c.fillRect(x, y, w, h);
    interiorHint(c, x, y, w, h, 'counter');
    c.fillStyle = 'rgba(112,110,102,.96)';
    c.fillRect(x, y, w, shown);
    c.strokeStyle = 'rgba(30,32,32,.5)';
    c.lineWidth = 1;
    for (var s = 0; s < 14; s++) {
      var sy = y + s * (h / 14);
      if (sy > y + shown) break;
      c.beginPath(); c.moveTo(x, sy); c.lineTo(x + w, sy); c.stroke();
    }
    /* the guide rails either side, and a dent or two */
    c.fillStyle = 'rgba(70,70,66,.9)';
    c.fillRect(x - 2.5, y, 2.5, h);
    c.fillRect(x + w, y, 2.5, h);
    if (open > 0.86) {
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.beginPath();
      c.moveTo(x + w * 0.3, y + shown);
      c.lineTo(x + w * 0.55, y + shown - h * 0.1);
      c.lineTo(x + w * 0.7, y + shown);
      c.closePath(); c.fill();
    }
  }

  function steps(c, b, h) {
    for (var i = 0; i < 3; i++) {
      c.fillStyle = 'rgba(' + (128 - i * 12) + ',' + (126 - i * 12) + ',' + (118 - i * 12) + ',.9)';
      c.fillRect(b.x0 + b.W * 0.3 - i * 3, b.y0 - h + i * (h / 3), b.W * 0.4 + i * 6, h / 3 + 1);
    }
  }

  /* ------------------------------------------------------------------ *
   * Signage
   * ------------------------------------------------------------------ */
  /* Letters are drawn as blocks rather than typed. Canvas text at this
     size turns to mush when the sprite is scaled down, and a row of
     bars reads as a word from further away than real glyphs do. */
  function letters(c, x, y, w, h, text, col, alpha) {
    var n = Math.max(1, text.replace(/ /g, '').length);
    var cw = w / (text.length || 1);
    c.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (alpha == null ? 0.9 : alpha) + ')';
    for (var i = 0; i < text.length; i++) {
      if (text[i] === ' ') continue;
      var lx = x + i * cw;
      var lw = cw * 0.68;
      /* a couple of letters have fallen off every sign in this city */
      if (Z.hash2(i * 7, Math.round(x), 313) > 0.86) continue;
      c.fillRect(lx, y, Math.max(1.4, lw), h);
      /* knock a notch out so it is not a solid bar */
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = 'rgba(0,0,0,1)';
      c.fillRect(lx + lw * 0.3, y + h * 0.28, Math.max(1, lw * 0.4), h * 0.2);
      c.restore();
      c.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (alpha == null ? 0.9 : alpha) + ')';
    }
  }

  function sign(c, b, g, def, gh, h2) {
    var s = g.sign;
    var col = s.col || [200, 196, 182];
    var style = s.style;
    var text = s.text || def.name.toUpperCase();

    if (style === 'band') {
      /* a fascia board over the shopfront */
      var y = b.y0 - gh - 3;
      var hgt = Math.min(b.H * 0.16, PPM * 0.5);
      c.fillStyle = 'rgba(' + Math.round(col[0] * 0.34) + ',' +
                    Math.round(col[1] * 0.34) + ',' + Math.round(col[2] * 0.34) + ',.95)';
      c.fillRect(b.x0 + 2, y - hgt, b.W - 4, hgt);
      c.fillStyle = 'rgba(0,0,0,.3)';
      c.fillRect(b.x0 + 2, y - 2.5, b.W - 4, 2.5);
      letters(c, b.x0 + b.W * 0.08, y - hgt * 0.72, b.W * 0.84, hgt * 0.46, text, col, 0.92);
      /* the strip light under it, hanging off at one end */
      c.fillStyle = 'rgba(226,222,206,.14)';
      c.fillRect(b.x0 + 4, y - 1.6, b.W * (0.5 + h2(1, 5) * 0.45), 1.6);

    } else if (style === 'box') {
      var bx = b.x0 + b.W * 0.06, by = b.y0 - gh - PPM * 0.8;
      var bw = b.W * 0.36, bh = PPM * 0.46;
      c.fillStyle = 'rgba(28,30,32,.95)';
      c.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
      c.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',.55)';
      c.fillRect(bx, by, bw, bh);
      letters(c, bx + bw * 0.1, by + bh * 0.3, bw * 0.8, bh * 0.4, text, [18, 18, 20], 0.8);

    } else if (style === 'vertical') {
      var vx = b.x0 + b.W * (h2(2, 2) > 0.5 ? 0.06 : 0.86);
      var vh = Math.min(b.H * 0.6, PPM * 3.4);
      c.fillStyle = 'rgba(26,28,30,.95)';
      c.fillRect(vx - 2, b.yF + b.H * 0.1, PPM * 0.34, vh);
      for (var i = 0; i < 5; i++) {
        c.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (0.5 + (i % 2) * 0.25) + ')';
        c.fillRect(vx + 1, b.yF + b.H * 0.1 + vh * (0.06 + i * 0.18), PPM * 0.34 - 6, vh * 0.12);
      }

    } else if (style === 'pole') {
      /* out at the kerb on a mast, which is how you see a filling
         station from the other end of the street */
      var px = b.x0 + b.W * 0.88;
      var py = b.yF - PPM * 1.5;
      c.fillStyle = 'rgba(64,64,60,.95)';
      c.fillRect(px - 2, py, 4, b.y0 - py);
      c.fillStyle = 'rgba(24,26,28,.95)';
      c.fillRect(px - PPM * 0.5, py - PPM * 0.6, PPM, PPM * 0.66);
      c.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',.8)';
      c.fillRect(px - PPM * 0.44, py - PPM * 0.54, PPM * 0.88, PPM * 0.54);
      letters(c, px - PPM * 0.38, py - PPM * 0.42, PPM * 0.76, PPM * 0.2, text, [20, 20, 22], 0.85);

    } else if (style === 'carved') {
      /* incised into the stone over the entrance */
      var cy = b.y0 - gh - PPM * 0.22;
      letters(c, b.x0 + b.W * 0.12, cy, b.W * 0.76, PPM * 0.2, text, [60, 56, 48], 0.5);
      c.fillStyle = 'rgba(255,250,236,.12)';
      c.fillRect(b.x0 + b.W * 0.1, cy + PPM * 0.24, b.W * 0.8, 1.6);

    } else if (style === 'stencil') {
      letters(c, b.x0 + b.W * 0.1, b.yF + b.H * 0.16, b.W * 0.4, PPM * 0.28, text, col, 0.4);
    }
  }

  /* ------------------------------------------------------------------ *
   * Bolted on
   * ------------------------------------------------------------------ */
  function extras(c, b, g, def, h2, wins) {
    var e = g.extras, i;
    function has(k) { return e.indexOf(k) >= 0; }

    if (has('fireEscape')) {
      /* zigzag stair down the face, the single most recognisable thing
         on the back of a city building */
      var fx = b.x0 + b.W * (h2(4, 1) > 0.5 ? 0.12 : 0.66);
      var fw2 = b.W * 0.22;
      var levels = Math.max(2, g.storeys - 1);
      c.strokeStyle = 'rgba(38,40,42,.9)';
      c.lineWidth = 1.6;
      for (i = 0; i < levels; i++) {
        var ly = b.yF + (b.H / g.storeys) * (i + 0.5);
        c.fillStyle = 'rgba(46,48,50,.85)';
        c.fillRect(fx, ly, fw2, 3);
        c.beginPath();
        c.moveTo(fx + (i % 2 ? fw2 : 0), ly);
        c.lineTo(fx + (i % 2 ? 0 : fw2), ly + b.H / g.storeys);
        c.stroke();
        /* railings */
        for (var rr = 0; rr < 5; rr++) {
          c.beginPath();
          c.moveTo(fx + fw2 * (rr / 4), ly);
          c.lineTo(fx + fw2 * (rr / 4), ly - 7);
          c.stroke();
        }
        c.beginPath();
        c.moveTo(fx, ly - 7); c.lineTo(fx + fw2, ly - 7); c.stroke();
      }
      c.lineWidth = 1;
    }

    if (has('balcony')) {
      var st = g.storeys;
      for (i = 1; i < st; i++) {
        if (h2(i * 3, 7) < 0.4) continue;
        var by = b.yF + (b.H / st) * i;
        var bx = b.x0 + b.W * (0.08 + h2(i, 11) * 0.5);
        var bw = b.W * 0.34;
        c.fillStyle = 'rgba(96,94,88,.9)';
        c.fillRect(bx, by, bw, 4);
        c.fillStyle = 'rgba(58,60,62,.8)';
        c.fillRect(bx, by - 11, bw, 2);
        for (var k = 0; k < 7; k++) {
          c.fillRect(bx + bw * (k / 6) - 0.8, by - 11, 1.6, 11);
        }
        /* somebody's things still out on it */
        if (h2(i, 13) > 0.6) {
          c.fillStyle = 'rgba(126,104,72,.8)';
          c.fillRect(bx + bw * 0.6, by - 9, bw * 0.2, 8);
        }
      }
    }

    if (has('awning')) {
      var ay = b.y0 - b.H * 0.34;
      var lobes = 5;
      var aw = b.W * 0.7, ax = b.x0 + b.W * 0.15;
      for (i = 0; i < lobes; i++) {
        c.fillStyle = i % 2 ? 'rgba(146,62,52,.9)' : 'rgba(196,188,168,.9)';
        c.beginPath();
        c.moveTo(ax + aw * (i / lobes), ay);
        c.lineTo(ax + aw * ((i + 1) / lobes), ay);
        c.lineTo(ax + aw * ((i + 1) / lobes), ay + 9);
        c.quadraticCurveTo(ax + aw * ((i + 0.5) / lobes), ay + 15,
                           ax + aw * (i / lobes), ay + 9);
        c.closePath(); c.fill();
      }
      c.fillStyle = 'rgba(0,0,0,.24)';
      c.fillRect(ax, ay + 14, aw, 4);
      /* torn, in one place */
      if (h2(9, 9) > 0.5) {
        c.fillStyle = 'rgba(0,0,0,.5)';
        c.beginPath();
        c.moveTo(ax + aw * 0.4, ay);
        c.lineTo(ax + aw * 0.52, ay + 13);
        c.lineTo(ax + aw * 0.58, ay);
        c.closePath(); c.fill();
      }
    }

    if (has('bars')) {
      /* security grilles over the low windows */
      c.strokeStyle = 'rgba(40,42,44,.75)';
      c.lineWidth = 1.4;
      for (i = 0; i < 12; i++) {
        var gx = b.x0 + b.W * (0.08 + i * 0.072);
        c.beginPath();
        c.moveTo(gx, b.y0 - b.H * 0.34);
        c.lineTo(gx, b.y0 - b.H * 0.05);
        c.stroke();
      }
      c.lineWidth = 1;
    }

    if (has('vines') || (g.damage > 1 && h2(21, 21) > 0.55)) {
      /* ivy climbing one edge, heavier at the bottom */
      var vx = h2(22, 1) > 0.5 ? b.x0 : b.x1 - b.W * 0.2;
      for (i = 0; i < 90; i++) {
        var t = i / 90;
        var lx2 = vx + h2(i, 31) * b.W * 0.2;
        var ly2 = b.y0 - t * b.H * (0.4 + h2(23, 3) * 0.5);
        var s2 = 2 + (1 - t) * 3.4;
        c.fillStyle = i % 3 ? 'rgba(62,84,44,.62)' : 'rgba(84,104,54,.5)';
        c.beginPath();
        c.ellipse(lx2, ly2, s2, s2 * 0.8, 0, 0, Z.TAU);
        c.fill();
      }
    }

    if (has('crossSign')) {
      var cx = b.x1 - b.W * 0.14, cy = b.yF + b.H * 0.12;
      var s3 = Math.min(b.W * 0.1, PPM * 0.4);
      c.fillStyle = 'rgba(70,142,190,.9)';
      c.fillRect(cx - s3 * 0.18, cy, s3 * 0.36, s3);
      c.fillRect(cx - s3 * 0.5, cy + s3 * 0.32, s3, s3 * 0.36);
    }

    if (has('flagpole')) {
      var px = b.x0 + b.W * 0.9;
      c.fillStyle = 'rgba(190,188,178,.7)';
      c.fillRect(px, b.yF - PPM * 1.3, 2, PPM * 1.3 + b.H * 0.4);
      c.fillStyle = 'rgba(120,116,106,.55)';
      c.beginPath();
      c.moveTo(px + 2, b.yF - PPM * 1.25);
      c.lineTo(px + 2 + PPM * 0.4, b.yF - PPM * 1.1);
      c.lineTo(px + 2, b.yF - PPM * 0.85);
      c.closePath(); c.fill();
    }

    if (has('clock')) {
      var qx = b.x0 + b.W / 2, qy = b.yF + b.H * 0.13;
      var rq = Math.min(b.W * 0.08, PPM * 0.3);
      c.fillStyle = 'rgba(226,222,206,.55)';
      c.beginPath(); c.arc(qx, qy, rq, 0, Z.TAU); c.fill();
      c.strokeStyle = 'rgba(24,26,28,.8)'; c.lineWidth = 1.6;
      c.beginPath(); c.arc(qx, qy, rq, 0, Z.TAU); c.stroke();
      c.beginPath(); c.moveTo(qx, qy); c.lineTo(qx + rq * 0.5, qy - rq * 0.3);
      c.moveTo(qx, qy); c.lineTo(qx, qy - rq * 0.7); c.stroke();
      c.lineWidth = 1;
    }

    if (has('pipes')) {
      c.fillStyle = 'rgba(88,86,78,.9)';
      for (i = 0; i < 3; i++) {
        var ppx = b.x0 + b.W * (0.1 + i * 0.35);
        c.fillRect(ppx, b.yF + b.H * 0.1, 4, b.H * 0.85);
        c.fillStyle = 'rgba(120,116,106,.5)';
        c.fillRect(ppx, b.yF + b.H * 0.3, 4, 3);
        c.fillStyle = 'rgba(88,86,78,.9)';
      }
    }

    if (has('screens')) {
      for (i = 0; i < 3; i++) {
        c.fillStyle = 'rgba(18,22,26,.9)';
        c.fillRect(b.x0 + b.W * (0.14 + i * 0.26), b.y0 - b.H * 0.3, b.W * 0.16, b.H * 0.12);
      }
    }

    if (has('mannequin')) {
      for (i = 0; i < 2; i++) {
        var mx = b.x0 + b.W * (0.2 + i * 0.5);
        c.fillStyle = 'rgba(196,188,170,.55)';
        c.fillRect(mx, b.y0 - b.H * 0.26, 4, b.H * 0.2);
        c.beginPath(); c.arc(mx + 2, b.y0 - b.H * 0.27, 3, 0, Z.TAU); c.fill();
      }
    }

    /* exterior lights - dead, but the fittings are still there, and at
       night the renderer picks them up */
    if (g.storeys <= 3 || h2(30, 1) > 0.5) {
      for (i = 0; i < 2; i++) {
        var ex = b.x0 + b.W * (0.14 + i * 0.66);
        c.fillStyle = 'rgba(52,52,50,.9)';
        c.fillRect(ex - 3, b.y0 - b.H * 0.78, 6, 3);
        c.fillStyle = 'rgba(226,214,180,.18)';
        c.fillRect(ex - 2, b.y0 - b.H * 0.78 + 3, 4, 2);
      }
    }

    /* graffiti - low down, where somebody could reach */
    if (h2(40, 3) > 0.42) {
      var gx2 = b.x0 + b.W * (0.1 + h2(41, 4) * 0.5);
      var gy2 = b.y0 - b.H * (0.14 + h2(42, 5) * 0.14);
      var gcol = ['196,88,52', '92,124,168', '188,168,74', '160,86,128',
                  '120,140,96'][Math.floor(h2(43, 6) * 5) % 5];
      c.save();
      c.globalAlpha = 0.30;
      c.strokeStyle = 'rgba(' + gcol + ',1)';
      c.lineWidth = Math.max(2, b.W * 0.018);
      c.beginPath();
      c.moveTo(gx2, gy2);
      for (i = 1; i <= 5; i++) {
        c.lineTo(gx2 + b.W * 0.06 * i,
                 gy2 + Math.sin(i * 1.7 + h2(44, 7) * 6) * b.H * 0.035);
      }
      c.stroke();
      c.restore();
      c.lineWidth = 1;
    }
  }

  /* ------------------------------------------------------------------ *
   * Damage
   * ------------------------------------------------------------------ */
  function damage(c, b, g, h2) {
    var d = g.damage, i;
    if (d <= 0) return;

    /* Cracks.

       These used to wander up to half the width of the building and a
       third of its height, which at any distance reads as a stray line
       scribbled across the wall rather than as damage. A crack in masonry
       is short, mostly vertical, and follows the joints - so this one
       steps down in small jogs and stops. */
    c.strokeStyle = 'rgba(18,16,14,.34)';
    var runH = b.H * 0.11;
    for (i = 0; i < d * 2; i++) {
      var cx = b.x0 + b.W * (0.06 + h2(i * 5, 51) * 0.88);
      var cy = b.yF + b.H * (0.1 + h2(i * 7, 52) * 0.74);
      var dir = h2(i, 54) > 0.5 ? 1 : -1;
      c.lineWidth = 1.1;
      c.beginPath();
      c.moveTo(cx, cy);
      var px2 = cx, py2 = cy;
      for (var s = 1; s <= 4; s++) {
        px2 += dir * h2(i * 3 + s, 53) * b.W * 0.012;
        py2 += runH * 0.25;
        c.lineTo(px2, py2);
      }
      c.stroke();
      /* a hairline branch, which is what makes it look like masonry */
      if (h2(i, 55) > 0.55) {
        c.lineWidth = 0.8;
        c.beginPath();
        c.moveTo(px2, py2 - runH * 0.5);
        c.lineTo(px2 - dir * b.W * 0.02, py2 - runH * 0.18);
        c.stroke();
      }
    }
    c.lineWidth = 1;

    if (d >= 2) {
      /* A corner gone, with the floors inside showing through. Kept well
         below the wall head and narrower than it was: at full width and
         starting on the eave line it read as a black gash hanging off the
         roof rather than as a hole in a building. */
      var side = h2(60, 1) > 0.5;
      var hw = b.W * (0.17 + h2(62, 4) * 0.08);
      var hx = side ? b.x1 - hw : b.x0;
      var hy = b.yF + b.H * (0.20 + h2(68, 8) * 0.16), hh = b.H * (0.16 + h2(61, 2) * 0.20);
      c.save();
      c.beginPath();
      c.moveTo(hx, hy);
      c.lineTo(hx + hw, hy);
      c.lineTo(hx + hw * 0.8, hy + hh);
      c.lineTo(hx + hw * 0.25, hy + hh * 0.7);
      c.closePath();
      c.clip();
      c.fillStyle = 'rgba(16,18,20,.88)';
      c.fillRect(hx, hy, hw, hh);
      /* floor slabs, broken off, and the room behind them */
      for (i = 0; i < 3; i++) {
        c.fillStyle = 'rgba(96,94,88,.55)';
        c.fillRect(hx, hy + hh * (0.3 + i * 0.3), hw * (0.4 + h2(i, 63) * 0.5), 3);
      }
      c.fillStyle = 'rgba(58,54,48,.5)';
      c.fillRect(hx + hw * 0.2, hy + hh * 0.55, hw * 0.5, hh * 0.3);
      c.restore();
      /* the ragged edge */
      c.strokeStyle = 'rgba(212,206,190,.22)';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(hx + hw, hy);
      c.lineTo(hx + hw * 0.8, hy + hh);
      c.lineTo(hx + hw * 0.25, hy + hh * 0.7);
      c.stroke();
      c.lineWidth = 1;
      /* the rubble it made, piled at the foot of the wall */
      for (i = 0; i < 6; i++) {
        c.fillStyle = 'rgba(104,100,92,.55)';
        c.beginPath();
        c.ellipse(hx + h2(i * 7, 64) * hw, b.y0 - h2(i * 9, 65) * b.H * 0.05,
                  2 + h2(i, 66) * 4, 1.6 + h2(i, 67) * 2, 0, 0, Z.TAU);
        c.fill();
      }
    }

    if (d >= 3) {
      /* scorching above the openings, where the fire came out */
      for (i = 0; i < 3; i++) {
        var sx = b.x0 + b.W * (0.1 + h2(i * 11, 71) * 0.7);
        var sy = b.y0 - b.H * (0.24 + h2(i * 13, 72) * 0.3);
        var gr = c.createRadialGradient(sx, sy, 1, sx, sy, b.W * 0.22);
        gr.addColorStop(0, 'rgba(12,10,10,.6)');
        gr.addColorStop(1, 'rgba(12,10,10,0)');
        c.fillStyle = gr;
        c.fillRect(sx - b.W * 0.22, sy - b.W * 0.3, b.W * 0.44, b.W * 0.44);
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Roofs
   *
   * At this camera you see as much roof as wall, so a flat grey top face
   * is half the building wasted. A roof here is a deck with a membrane on
   * it, a parapet round the edge, standing water, and the plant spread
   * across the plane rather than lined up along its front edge - which is
   * what the first version did, and it made every roof look like a shelf.
   * ------------------------------------------------------------------ */
  /* The roof plane, as the sheared parallelogram it actually is. */
  function deckPath(c, b) {
    var sh = b.sh || 0;
    c.beginPath();
    c.moveTo(b.x0, b.yF);
    c.lineTo(b.x1, b.yF);
    c.lineTo(b.x1 + sh, b.yB);
    c.lineTo(b.x0 + sh, b.yB);
    c.closePath();
  }

  function roofDeck(c, b, g, h2) {
    var yB = b.yB, yF = b.yF, D = yF - yB;
    var sh = b.sh || 0;
    if (D < 3) return;

    /* the membrane: a colour of its own, not the wall's */
    var mem = Z.mix(g.roofCol, [74, 74, 70], 0.45);
    var gr = c.createLinearGradient(0, yB, 0, yF);
    gr.addColorStop(0, Z.rgb(Z.shade(mem, 0.14)));
    gr.addColorStop(1, Z.rgb(Z.shade(mem, -0.10)));
    c.fillStyle = gr;
    deckPath(c, b); c.fill();

    c.save();
    deckPath(c, b); c.clip();

    /* felt laps running across it */
    var lap = Math.max(4, D / 5);
    for (var y = yB + lap; y < yF; y += lap) {
      var lean = sh * ((yF - y) / Math.max(1, D));
      c.fillStyle = 'rgba(0,0,0,.16)';
      c.fillRect(b.x0 + lean, y, b.W, 1.3);
      c.fillStyle = 'rgba(255,250,236,.05)';
      c.fillRect(b.x0 + lean, y + 1.3, b.W, 1);
    }

    /* grit, and the patches where it has washed away */
    for (var i = 0; i < 26; i++) {
      var pf = h2(i * 5, 82);
      var px = b.x0 + h2(i * 3, 81) * b.W + sh * (1 - pf);
      var py = yB + pf * D;
      c.fillStyle = i % 2 ? 'rgba(212,208,190,.07)' : 'rgba(18,18,16,.10)';
      c.beginPath(); c.ellipse(px, py, 2 + h2(i, 83) * 5, 1.4 + h2(i, 84) * 3, 0, 0, Z.TAU); c.fill();
    }

    /* standing water - the thing that says nobody has been up here */
    for (var p2 = 0; p2 < 3; p2++) {
      if (h2(p2 * 7, 85) < 0.35) continue;
      var wf = 0.25 + h2(p2, 87) * 0.6;
      var wx = b.x0 + b.W * (0.15 + h2(p2, 86) * 0.7) + sh * (1 - wf);
      var wy = yB + D * wf;
      var wr = 4 + h2(p2, 88) * Math.min(b.W * 0.16, 16);
      c.fillStyle = 'rgba(28,38,42,.42)';
      c.beginPath(); c.ellipse(wx, wy, wr, wr * 0.5, 0, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgba(150,178,192,.16)';
      c.beginPath(); c.ellipse(wx - wr * 0.2, wy - wr * 0.15, wr * 0.5, wr * 0.22, 0, 0, Z.TAU); c.fill();
      /* the green round the edge of it */
      c.fillStyle = 'rgba(78,96,52,.24)';
      c.beginPath(); c.ellipse(wx, wy, wr * 1.25, wr * 0.62, 0, 0, Z.TAU);
      c.ellipse(wx, wy, wr, wr * 0.5, 0, 0, Z.TAU);
      c.fill('evenodd');
    }

    /* a roof hatch and a couple of soil pipes, on every roof */
    var hx = b.x0 + b.W * (0.2 + h2(9, 89) * 0.55) + sh * 0.6;
    var hy = yB + D * 0.4;
    c.fillStyle = 'rgba(88,86,80,.95)';
    c.fillRect(hx - 7, hy - 4, 14, 9);
    c.fillStyle = 'rgba(122,120,112,.95)';
    c.fillRect(hx - 7, hy - 6, 14, 3);
    for (var v2 = 0; v2 < 2; v2++) {
      var vf = 0.3 + v2 * 0.3;
      var vx = b.x0 + b.W * (0.72 + v2 * 0.12) + sh * (1 - vf);
      var vy = yB + D * vf;
      c.fillStyle = 'rgba(70,70,66,.95)';
      c.fillRect(vx - 2, vy - 9, 4, 10);
      c.fillStyle = 'rgba(40,40,38,.9)';
      c.beginPath(); c.ellipse(vx, vy - 9, 3, 1.6, 0, 0, Z.TAU); c.fill();
    }
    c.restore();

    /* the parapet: a raised lip all the way round, with its inside face
       in shadow at the back and catching light at the front */
    /* ---- the parapet ----

       A parapet goes round all four sides of a flat roof, not just the
       front and back. Only those two were drawn, so a roof had a coping
       line along its top and bottom edges and nothing at all down its
       sloping left and right ones - the two edges that actually describe
       the shape of the plane. Every side gets the same treatment now:
       a wall standing on the deck edge, a coping course along its top,
       and a shadow where it meets the deck.

       Drawn back first, then the sides, then the front: nearest last, so
       the front parapet crosses in front of the side ones the way it
       would if you were standing there. */
    var lipH = Math.max(3, Math.min(7, D * 0.34));
    var lit = Z.rgb(Z.shade(g.wall, 0.16));
    var cope = Z.rgb(Z.shade(g.wall, 0.32));
    var dark = Z.rgb(Z.shade(g.wall, -0.12));

    /* the four corners of the deck, and of the coping above it */
    var fl = [b.x0, yF], fr = [b.x1, yF];
    var bl = [b.x0 + sh, yB], br = [b.x1 + sh, yB];
    function band(a, b2, face, top) {
      c.fillStyle = face;
      c.beginPath();
      c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]);
      c.lineTo(b2[0], b2[1] - lipH); c.lineTo(a[0], a[1] - lipH);
      c.closePath(); c.fill();
      c.fillStyle = top;
      c.beginPath();
      c.moveTo(a[0], a[1] - lipH); c.lineTo(b2[0], b2[1] - lipH);
      c.lineTo(b2[0], b2[1] - lipH - 2); c.lineTo(a[0], a[1] - lipH - 2);
      c.closePath(); c.fill();
    }

    /* back */
    band([bl[0] - 2, bl[1]], [br[0] + 2, br[1]], lit, cope);
    c.fillStyle = 'rgba(0,0,0,.34)';
    c.fillRect(bl[0] - 2, yB, b.W + 4, 2.4);
    /* left and right, running down the slope of the plane */
    if (sh > 1.5) {
      band(fl, bl, dark, cope);
      band([fr[0], fr[1]], [br[0], br[1]], Z.rgb(Z.shade(g.wall, 0.06)), cope);
    } else {
      band(fl, bl, dark, cope);
      band(fr, br, dark, cope);
    }
    /* front, over the wall head */
    band([fl[0] - 2, fl[1]], [fr[0] + 2, fr[1]], Z.rgb(Z.shade(g.wall, 0.10)), cope);
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.fillRect(b.x0 - 2, yF, b.W + 4, 2);
  }

  /* A pitched roof, drawn as one closed silhouette.

     The first version borrowed `hipRoof` from the prop kit, which draws a
     trapezoid narrowing to a ridge at 44% of the width. On a house that is
     four metres deep that trapezoid is most of the sprite, and the two
     triangles left over at the top corners are not drawn at all - so the
     sky showed through them and every pitched roof in the city had a notch
     bitten out of each shoulder.

     This draws the whole roof as a single path: eave, shoulder, chamfer,
     ridge, and back down. There is no corner left over to leak, the hip
     ends are shaded as planes rather than cut away, and the roof is
     deliberately shallower than the true projection because at this camera
     a geometrically honest roof on a deep building is taller than the
     house under it. */
  function pitchRoof(c, b, g, d, h2, gable) {
    var over = Math.max(4, b.W * 0.045);
    var x0 = b.x0 - over, x1 = b.x1 + over, W = x1 - x0;
    var eave = b.yF + 2;
    /* stylised depth, and never taller than the roof would look sensible */
    var D = Math.min(d * PPM * PITCH * 0.66, b.W * 0.44);
    var rise = (gable ? 0.62 : 0.4) * PPM;
    var topY = eave - D - rise;
    var hh = eave - topY;
    var chamf = gable ? W * 0.02 : W * 0.15;
    var shoulder = eave - hh * 0.26;
    var col = Z.shade(g.roofCol, -0.10);

    /* the ridge sits at the back of the roof, so it leans with the same
       shear the flat decks use and the house stays the same solid */
    var sh = b.sh || 0;
    function silhouette() {
      c.beginPath();
      c.moveTo(x0, eave);
      c.lineTo(x0 + sh * 0.3, shoulder);
      c.lineTo(x0 + chamf + sh, topY);
      c.lineTo(x1 - chamf + sh, topY);
      c.lineTo(x1 + sh * 0.3, shoulder);
      c.lineTo(x1, eave);
      c.closePath();
    }

    /* the near slope */
    var gr = c.createLinearGradient(0, topY, 0, eave);
    gr.addColorStop(0, Z.rgb(Z.shade(col, 0.24)));
    gr.addColorStop(0.55, Z.rgb(col));
    gr.addColorStop(1, Z.rgb(Z.shade(col, -0.26)));
    c.fillStyle = gr;
    silhouette();
    c.fill();

    /* the hip ends, as planes turned away from the light */
    if (!gable) {
      c.fillStyle = Z.rgb(Z.shade(col, -0.40));
      c.beginPath();
      c.moveTo(x0, eave); c.lineTo(x0 + sh * 0.3, shoulder);
      c.lineTo(x0 + chamf + sh, topY); c.lineTo(x0 + chamf * 1.6, eave);
      c.closePath(); c.fill();
      c.fillStyle = Z.rgb(Z.shade(col, -0.30));
      c.beginPath();
      c.moveTo(x1, eave); c.lineTo(x1 + sh * 0.3, shoulder);
      c.lineTo(x1 - chamf + sh, topY); c.lineTo(x1 - chamf * 1.6, eave);
      c.closePath(); c.fill();
    }

    /* courses of tile running across the slope, clipped to the silhouette */
    c.save();
    silhouette();
    c.clip();
    var step = Math.max(5, hh / 7);
    for (var y = topY + step; y < eave; y += step) {
      c.fillStyle = 'rgba(0,0,0,.16)';
      c.fillRect(x0, y, W, 1.5);
      c.fillStyle = 'rgba(255,250,238,.05)';
      c.fillRect(x0, y + 1.5, W, 1);
    }
    /* slipped and missing tiles, and moss in the hollows */
    for (var i = 0; i < 10; i++) {
      var px = x0 + h2(i * 3, 141) * W;
      var py = topY + h2(i * 5, 142) * hh;
      if (h2(i, 143) > 0.5) {
        c.fillStyle = 'rgba(12,12,14,.45)';
        c.fillRect(px, py, 6, Math.max(3, step * 0.6));
      } else {
        c.fillStyle = 'rgba(72,90,50,.28)';
        c.beginPath(); c.ellipse(px, py, 5, 3, 0, 0, Z.TAU); c.fill();
      }
    }
    c.restore();

    /* ridge, and the eave shadow it throws down the wall */
    c.fillStyle = 'rgba(236,232,218,.20)';
    c.fillRect(x0 + chamf + sh, topY, W - chamf * 2, 2.4);
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.fillRect(x0 + chamf + sh, topY + 2.4, W - chamf * 2, 1.6);

    c.strokeStyle = 'rgba(6,8,10,.5)';
    c.lineWidth = 1.2;
    silhouette();
    c.stroke();
    c.lineWidth = 1;

    /* the gutter along the eave, and the shade under the overhang */
    c.fillStyle = 'rgba(52,50,46,.9)';
    c.fillRect(x0, eave - 3, W, 4);
    var eg = c.createLinearGradient(0, eave, 0, eave + 12);
    eg.addColorStop(0, 'rgba(0,0,0,.40)');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = eg;
    c.fillRect(b.x0, eave, b.W, 12);

    return topY;
  }

  function roofOf(c, b, g, ox, w, d, h2, wins) {
    var kind = g.roof;

    if (kind === 'hip' || kind === 'gable') {
      pitchRoof(c, b, g, d, h2, kind === 'gable');
    } else if (kind === 'sawtooth') {
      roofDeck(c, b, g, h2);
      var n = Math.max(3, Math.round(w / 2.4));
      for (var t = 0; t < n; t++) {
        var tx = b.x0 + b.W * (t / n);
        c.fillStyle = Z.rgb(Z.shade(g.roofCol, 0.06));
        c.beginPath();
        c.moveTo(tx, b.yF);
        c.lineTo(tx + b.W / n, b.yF - PPM * 0.62);
        c.lineTo(tx + b.W / n, b.yF);
        c.closePath(); c.fill();
        /* the glazed face of each tooth, which is what makes it a shed */
        c.fillStyle = 'rgba(120,146,160,.34)';
        c.beginPath();
        c.moveTo(tx + b.W / n, b.yF - PPM * 0.62);
        c.lineTo(tx + b.W / n, b.yF);
        c.lineTo(tx + b.W / n * 0.7, b.yF);
        c.closePath(); c.fill();
      }
    } else if (kind === 'vault') {
      c.fillStyle = Z.rgb(Z.shade(g.roofCol, 0.1));
      c.beginPath();
      c.moveTo(b.x0 - 3, b.yF);
      c.quadraticCurveTo(ox, b.yF - PPM * 1.5, b.x1 + 3, b.yF);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(160,178,188,.24)';
      c.lineWidth = 1.6;
      for (var v = 1; v < 6; v++) {
        c.beginPath();
        c.moveTo(b.x0 + b.W * (v / 6), b.yF);
        c.lineTo(b.x0 + b.W * (v / 6), b.yF - PPM * 1.5 * Math.sin(Math.PI * v / 6) * 0.7);
        c.stroke();
      }
      c.lineWidth = 1;
    } else if (kind === 'collapsed') {
      /* A roof that fell in, not a hole where a roof should be.

         The first version drew a black quadrilateral over two thirds of
         the roof plane with a few orange lines across it, on a flat deck.
         On a street of ruined houses that is what you saw: black
         trapezoids, and no roofs at all. A collapsed roof is a roof
         first - pitched, like the house it belongs to - with a ragged
         hole broken through one end of it. */
      var top = pitchRoof(c, b, g, d, h2, false);
      var sh2 = b.sh || 0;

      /* Where it went in: a point on the slope, not a panel on it. The
         previous attempt clipped a clean quadrilateral and filled it with
         evenly spaced bright rafters, which reads as decking laid on the
         roof - a pallet, not a hole. What makes it a hole is a ragged
         rim, a dark that gets darker upslope, and only two or three
         rafters, broken, stopping short of the far side. */
      var cx = b.x0 + b.W * (0.28 + h2(90, 1) * 0.4) + sh2 * 0.5;
      var cy = top + (b.yF - top) * (0.46 + h2(91, 2) * 0.2);
      var rx = b.W * (0.14 + h2(92, 3) * 0.07);
      var ry = (b.yF - top) * (0.22 + h2(93, 4) * 0.1);

      var pts = [], NP = 11, ai, pr;
      for (ai = 0; ai < NP; ai++) {
        var a = (ai / NP) * Z.TAU;
        pr = 0.62 + h2(ai * 5, 96) * 0.58;
        pts.push([cx + Math.cos(a) * rx * pr, cy + Math.sin(a) * ry * pr]);
      }
      function rim() {
        c.beginPath();
        c.moveTo(pts[0][0], pts[0][1]);
        for (var q = 1; q < NP; q++) c.lineTo(pts[q][0], pts[q][1]);
        c.closePath();
      }

      c.save();
      rim();
      c.clip();
      /* the dark of the roof space, deepest at the top of the slope */
      var hg = c.createLinearGradient(0, cy - ry, 0, cy + ry);
      hg.addColorStop(0, 'rgba(6,6,7,.99)');
      hg.addColorStop(1, 'rgba(26,22,18,.95)');
      c.fillStyle = hg;
      c.fillRect(cx - rx * 1.4, cy - ry * 1.4, rx * 2.8, ry * 2.8);
      /* two or three rafters, snapped, not spanning */
      c.strokeStyle = 'rgba(96,74,46,.9)';
      c.lineCap = 'round';
      for (var j = 0; j < 3; j++) {
        var jx = cx + (j - 1) * rx * 0.62 + (h2(j, 97) - 0.5) * rx * 0.3;
        var stop = 0.25 + h2(j, 98) * 0.55;
        c.lineWidth = 1.6 + h2(j, 99) * 1.1;
        c.beginPath();
        c.moveTo(jx, cy + ry);
        c.lineTo(jx + sh2 * 0.3, cy + ry - ry * 2 * stop);
        c.stroke();
      }
      c.lineCap = 'butt';
      c.lineWidth = 1;
      c.restore();

      /* the broken edge catches the light on the upslope side only */
      c.save();
      rim();
      c.clip();
      c.strokeStyle = 'rgba(226,220,202,.30)';
      c.lineWidth = 3;
      rim();
      c.stroke();
      c.restore();
      c.lineWidth = 1;

      /* tiles that came off, lying round the rim */
      for (var r2 = 0; r2 < 12; r2++) {
        var ra = h2(r2 * 3, 100) * Z.TAU;
        var rr = 1 + h2(r2 * 7, 101) * 0.7;
        c.fillStyle = r2 % 3 ? 'rgba(52,44,38,.75)' : 'rgba(96,84,66,.6)';
        c.save();
        c.translate(cx + Math.cos(ra) * rx * rr, cy + Math.sin(ra) * ry * rr);
        c.rotate(h2(r2, 102) * 3);
        c.fillRect(-3, -1.6, 6, 3.2);
        c.restore();
      }
    } else {
      roofDeck(c, b, g, h2);
    }

    roofKit(c, b, g, h2, wins, kind === 'hip' || kind === 'gable');
  }

  /* Anything with a roof gets at least something standing on it. A bare
     deck reads as an unfinished sprite, and `burntOut` had an empty kit. */
  function roofFallback(g) {
    if (g.kit.length) return g.kit;
    return g.roof === 'hip' || g.roof === 'gable' ? ['chimney'] : ['vent'];
  }

  /* The plant on top. This is the silhouette the player sees over the
     other rooftops, so it matters more than its size suggests. Items are
     scattered across the deck and drawn back to front, so the roof has
     depth instead of a row of boxes along its front edge. */
  /* A tower - a steeple, a station clock - rises off the ground at one
     end of the building. Scattering it with the air-conditioning units
     put a two-metre stub in the middle of the roof slope with a cross
     floating over it: a chimney, not a church. It is drawn separately,
     from the wall base up, after the roof it passes through. */
  function tower(c, b, g, h2, kind, wins) {
    var end = h2(70, 1) > 0.5 ? 0.17 : 0.83;
    var x = b.x0 + b.W * end + (b.sh || 0) * 0.35;
    var wide = Math.min(b.W * 0.24, PPM * (kind === 'clockTower' ? 1.0 : 0.82));
    var base = b.y0;
    var top = b.yF - PPM * (kind === 'clockTower' ? 2.0 : 2.4);
    var dpt = wide * PITCH * 0.7;

    /* the shaft, with its flank on the same side as everything else */
    c.fillStyle = Z.rgb(Z.shade(g.wall, -0.34));
    c.beginPath();
    c.moveTo(x + wide / 2, top);
    c.lineTo(x + wide / 2 + dpt, top - dpt);
    c.lineTo(x + wide / 2 + dpt, base - dpt);
    c.lineTo(x + wide / 2, base);
    c.closePath(); c.fill();
    var gs = c.createLinearGradient(x - wide / 2, 0, x + wide / 2, 0);
    gs.addColorStop(0, Z.rgb(Z.shade(g.wall, 0.12)));
    gs.addColorStop(1, Z.rgb(Z.shade(g.wall, -0.22)));
    c.fillStyle = gs;
    c.fillRect(x - wide / 2, top, wide, base - top);
    c.fillStyle = 'rgba(255,250,238,.12)';
    c.fillRect(x - wide / 2, top, 1.6, base - top);
    c.strokeStyle = 'rgba(6,8,10,.5)'; c.lineWidth = 1.2;
    c.strokeRect(x - wide / 2 + 0.5, top + 0.5, wide - 1, base - top - 1);
    c.lineWidth = 1;

    /* string courses, so it has floors */
    for (var sc = 1; sc < 4; sc++) {
      c.fillStyle = 'rgba(0,0,0,.16)';
      c.fillRect(x - wide / 2, top + (base - top) * (sc / 4), wide, 2);
      c.fillStyle = 'rgba(255,250,238,.07)';
      c.fillRect(x - wide / 2, top + (base - top) * (sc / 4) + 2, wide, 1);
    }

    /* the belfry: a louvred opening on each visible face */
    var by = top + wide * 0.34, bh = wide * 0.72;
    c.fillStyle = 'rgba(12,14,16,.9)';
    c.fillRect(x - wide * 0.3, by, wide * 0.6, bh);
    c.strokeStyle = 'rgba(178,172,156,.45)';
    for (var lv = 0; lv < 5; lv++) {
      c.beginPath();
      c.moveTo(x - wide * 0.3, by + bh * (lv / 5) + 2);
      c.lineTo(x + wide * 0.3, by + bh * (lv / 5) + 2);
      c.stroke();
    }
    c.fillStyle = 'rgba(206,200,184,.28)';
    c.fillRect(x - wide * 0.34, by - 3, wide * 0.68, 3);

    if (kind === 'clockTower') {
      var cy2 = top + wide * 1.5;
      c.fillStyle = 'rgba(224,220,204,.72)';
      c.beginPath(); c.arc(x, cy2, wide * 0.3, 0, Z.TAU); c.fill();
      c.strokeStyle = 'rgba(24,26,28,.85)'; c.lineWidth = 1.8;
      c.beginPath(); c.arc(x, cy2, wide * 0.3, 0, Z.TAU); c.stroke();
      c.beginPath();
      c.moveTo(x, cy2); c.lineTo(x + wide * 0.17, cy2 - wide * 0.1);
      c.moveTo(x, cy2); c.lineTo(x, cy2 - wide * 0.22);
      c.stroke(); c.lineWidth = 1;
      /* a shallow pyramid cap */
      c.fillStyle = Z.rgb(Z.shade(g.roofCol, -0.18));
      c.beginPath();
      c.moveTo(x - wide * 0.62, top);
      c.lineTo(x, top - wide * 0.7);
      c.lineTo(x + wide * 0.62, top);
      c.closePath(); c.fill();
    } else {
      /* the spire, tall and narrow, and the cross on it */
      var spire = wide * 2.6;
      c.fillStyle = Z.rgb(Z.shade(g.roofCol, -0.12));
      c.beginPath();
      c.moveTo(x - wide * 0.58, top);
      c.lineTo(x + dpt * 0.5, top - spire);
      c.lineTo(x + wide * 0.58, top);
      c.closePath(); c.fill();
      c.fillStyle = Z.rgb(Z.shade(g.roofCol, -0.36));
      c.beginPath();
      c.moveTo(x - wide * 0.58, top);
      c.lineTo(x + dpt * 0.5, top - spire);
      c.lineTo(x - wide * 0.05, top);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(6,8,10,.5)'; c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(x - wide * 0.58, top);
      c.lineTo(x + dpt * 0.5, top - spire);
      c.lineTo(x + wide * 0.58, top);
      c.closePath(); c.stroke();
      c.lineWidth = 1;
      /* a band of slates part way up */
      c.fillStyle = 'rgba(0,0,0,.2)';
      c.beginPath();
      c.moveTo(x - wide * 0.34, top - spire * 0.42);
      c.lineTo(x + wide * 0.34, top - spire * 0.42);
      c.lineTo(x + wide * 0.3, top - spire * 0.36);
      c.lineTo(x - wide * 0.3, top - spire * 0.36);
      c.closePath(); c.fill();

      var tipY = top - spire;
      c.strokeStyle = 'rgba(214,208,190,.8)';
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(x + dpt * 0.5, tipY); c.lineTo(x + dpt * 0.5, tipY - wide * 0.52);
      c.moveTo(x + dpt * 0.5 - wide * 0.2, tipY - wide * 0.36);
      c.lineTo(x + dpt * 0.5 + wide * 0.2, tipY - wide * 0.36);
      c.stroke();
      c.lineWidth = 1;
      if (wins) {
        wins.push({ x: x - wide * 0.3, y: by, w: wide * 0.6, h: bh, k: 0.12 });
      }
    }
  }

  function roofKit(c, b, g, h2, wins, pitched) {
    var kit = roofFallback(g), i;
    if (!kit.length) return;
    /* towers are drawn from the ground, not scattered on the deck */
    var towers = [];
    kit = kit.filter(function (k) {
      if (k === 'steeple' || k === 'clockTower') { towers.push(k); return false; }
      return true;
    });
    for (i = 0; i < towers.length; i++) tower(c, b, g, h2, towers[i], wins);
    if (!kit.length) return;
    var yB = b.yB, yF = b.yF, D = Math.max(4, yF - yB);

    var sh = b.sh || 0;
    var items = [];
    for (i = 0; i < kit.length; i++) {
      var fx = 0.13 + h2(i * 7 + 1, 111) * 0.74;
      var fy = pitched ? 0.5 : (0.18 + h2(i * 11 + 3, 112) * 0.66);
      /* things at the back of the roof lean with the plane */
      items.push({ k: kit[i], x: b.x0 + b.W * fx + sh * (1 - fy),
                   y: pitched ? yF - 2 : yB + D * fy, i: i });
    }
    items.sort(function (a, b2) { return a.y - b2.y; });

    for (var n = 0; n < items.length; n++) {
      var it = items[n];
      var x = it.x, y = it.y, k = it.k;
      i = it.i;

      /* everything up here casts a little shadow onto the deck */
      if (!pitched) {
        c.fillStyle = 'rgba(0,0,0,.22)';
        c.beginPath(); c.ellipse(x + 3, y + 1, 11, 4, 0, 0, Z.TAU); c.fill();
      }

      if (k === 'hvac') {
        var uw = Math.min(b.W * 0.22, PPM * 0.7), uh = PPM * 0.3, ud = uw * PITCH;
        c.fillStyle = 'rgba(96,98,96,.96)';
        c.fillRect(x - uw / 2, y - uh, uw, uh);
        c.fillStyle = 'rgba(146,148,144,.96)';
        c.fillRect(x - uw / 2, y - uh - ud, uw, ud + 1);
        c.strokeStyle = 'rgba(40,42,42,.5)';
        for (var f = 1; f < 4; f++) {
          c.beginPath();
          c.moveTo(x - uw / 2 + 2, y - uh + f * (uh / 4));
          c.lineTo(x + uw / 2 - 2, y - uh + f * (uh / 4));
          c.stroke();
        }
        /* the fan cowl, seen from above */
        c.fillStyle = 'rgba(78,80,78,.95)';
        c.beginPath(); c.ellipse(x, y - uh - ud * 0.5, uw * 0.2, uw * 0.2 * PITCH, 0, 0, Z.TAU); c.fill();
        c.strokeStyle = 'rgba(180,182,178,.3)';
        c.beginPath(); c.ellipse(x, y - uh - ud * 0.5, uw * 0.2, uw * 0.2 * PITCH, 0, 0, Z.TAU); c.stroke();
        /* ducting running off it */
        c.fillStyle = 'rgba(122,124,120,.8)';
        c.fillRect(x + uw / 2, y - uh * 0.7, uw * 0.5, 4);

      } else if (k === 'tank') {
        var tr = PPM * 0.26;
        c.fillStyle = 'rgba(58,52,42,.92)';
        for (var lgs = -1; lgs <= 1; lgs++) {
          c.fillRect(x + lgs * tr * 0.7 - 1.5, y - PPM * 0.26, 3, PPM * 0.28);
        }
        K.cyl(c, x, y - PPM * 0.26, tr / PPM, 0.58, [104, 82, 58], [126, 102, 74]);
        /* hoops round it */
        c.strokeStyle = 'rgba(48,42,34,.6)';
        c.beginPath(); c.moveTo(x - tr, y - PPM * 0.5); c.lineTo(x + tr, y - PPM * 0.5); c.stroke();

      } else if (k === 'dish') {
        c.strokeStyle = 'rgba(70,70,68,.9)';
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - PPM * 0.3); c.stroke();
        c.lineWidth = 1;
        c.fillStyle = 'rgba(184,182,170,.8)';
        c.beginPath();
        c.ellipse(x + 3, y - PPM * 0.36, PPM * 0.15, PPM * 0.17, 0.4, 0, Z.TAU);
        c.fill();
        c.fillStyle = 'rgba(56,56,54,.75)';
        c.beginPath();
        c.ellipse(x + 3, y - PPM * 0.36, PPM * 0.085, PPM * 0.1, 0.4, 0, Z.TAU);
        c.fill();

      } else if (k === 'stair') {
        var sw = PPM * 0.46, sd = sw * PITCH;
        c.fillStyle = Z.rgb(Z.shade(g.wall, -0.2));
        c.fillRect(x - sw / 2, y - PPM * 0.56, sw, PPM * 0.56);
        c.fillStyle = Z.rgb(Z.shade(g.wall, 0.14));
        c.fillRect(x - sw / 2, y - PPM * 0.56 - sd, sw, sd + 1);
        c.fillStyle = 'rgba(12,14,16,.85)';
        c.fillRect(x - sw * 0.15, y - PPM * 0.34, sw * 0.3, PPM * 0.34);
        c.fillStyle = 'rgba(226,222,206,.14)';
        c.fillRect(x - sw / 2, y - PPM * 0.56 - sd, sw, 2);

      } else if (k === 'vent') {
        for (var vv = 0; vv < 3; vv++) {
          var vx2 = x - 9 + vv * 9, vy2 = y - vv * 3;
          c.fillStyle = 'rgba(100,102,100,.94)';
          c.fillRect(vx2 - 2.5, vy2 - PPM * 0.2, 5, PPM * 0.2);
          c.fillStyle = 'rgba(64,66,66,.92)';
          c.beginPath(); c.ellipse(vx2, vy2 - PPM * 0.2, 4, 2.2, 0, 0, Z.TAU); c.fill();
        }

      } else if (k === 'mast') {
        c.strokeStyle = 'rgba(56,58,60,.95)';
        c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - PPM * 1.4); c.stroke();
        c.lineWidth = 1.2;
        for (var gy = 0; gy < 4; gy++) {
          c.beginPath();
          c.moveTo(x - 3, y - PPM * (0.3 + gy * 0.28));
          c.lineTo(x + 3, y - PPM * (0.3 + gy * 0.28));
          c.stroke();
        }
        /* stay wires down to the deck */
        c.strokeStyle = 'rgba(48,50,52,.5)';
        c.beginPath();
        c.moveTo(x, y - PPM * 1.2); c.lineTo(x - PPM * 0.4, y);
        c.moveTo(x, y - PPM * 1.2); c.lineTo(x + PPM * 0.4, y);
        c.stroke();
        c.lineWidth = 1;
        c.fillStyle = 'rgba(214,72,48,.95)';
        c.beginPath(); c.arc(x, y - PPM * 1.4, 3, 0, Z.TAU); c.fill();
        if (wins) wins.push({ x: x - 3, y: y - PPM * 1.4 - 3, w: 6, h: 6, k: 0.02, beacon: true });

      } else if (k === 'chimney') {
        var cwid = PPM * 0.22, cd = cwid * PITCH;
        c.fillStyle = Z.rgb(Z.shade(g.wall, -0.26));
        c.fillRect(x - cwid / 2, y - PPM * 0.6, cwid, PPM * 0.6);
        c.fillStyle = Z.rgb(Z.shade(g.wall, 0.06));
        c.fillRect(x - cwid / 2 - 2, y - PPM * 0.6 - cd, cwid + 4, cd + 2);
        c.fillStyle = 'rgba(14,14,14,.85)';
        c.fillRect(x - cwid * 0.22, y - PPM * 0.6 - cd, cwid * 0.2, cd);
        c.fillRect(x + cwid * 0.04, y - PPM * 0.6 - cd, cwid * 0.2, cd);

      } else if (k === 'aerial') {
        c.strokeStyle = 'rgba(46,46,44,.9)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(x, y); c.lineTo(x, y - PPM * 0.56);
        c.moveTo(x - 7, y - PPM * 0.46); c.lineTo(x + 7, y - PPM * 0.46);
        c.moveTo(x - 5, y - PPM * 0.52); c.lineTo(x + 5, y - PPM * 0.52);
        c.moveTo(x - 3, y - PPM * 0.56); c.lineTo(x + 3, y - PPM * 0.56);
        c.stroke();
        c.lineWidth = 1;

      } else if (k === 'stack') {
        K.cyl(c, x, y, 0.2, 1.9, [128, 96, 78], [104, 78, 62]);
        c.fillStyle = 'rgba(28,26,24,.55)';
        c.fillRect(x - PPM * 0.2, y - PPM * 1.9, PPM * 0.4, 4);
        /* bands up it */
        c.strokeStyle = 'rgba(226,222,206,.14)';
        for (var bd = 1; bd < 4; bd++) {
          c.beginPath();
          c.moveTo(x - PPM * 0.2, y - PPM * 1.9 * (bd / 4));
          c.lineTo(x + PPM * 0.2, y - PPM * 1.9 * (bd / 4));
          c.stroke();
        }

      } else if (k === 'helipad') {
        var hr = Math.min(b.W * 0.3, PPM * 1.2);
        c.fillStyle = 'rgba(52,54,52,.9)';
        c.fillRect(x - hr * 0.7, y - 9, 3, 10);
        c.fillRect(x + hr * 0.7, y - 9, 3, 10);
        c.fillStyle = 'rgba(84,86,82,.96)';
        c.beginPath(); c.ellipse(x, y - 9, hr, hr * PITCH, 0, 0, Z.TAU); c.fill();
        c.strokeStyle = 'rgba(226,222,206,.45)';
        c.lineWidth = 2;
        c.beginPath(); c.ellipse(x, y - 9, hr * 0.74, hr * PITCH * 0.74, 0, 0, Z.TAU); c.stroke();
        c.lineWidth = 1;
        /* the H */
        c.fillStyle = 'rgba(226,222,206,.5)';
        c.fillRect(x - hr * 0.26, y - 9 - hr * PITCH * 0.34, hr * 0.13, hr * PITCH * 0.68);
        c.fillRect(x + hr * 0.13, y - 9 - hr * PITCH * 0.34, hr * 0.13, hr * PITCH * 0.68);
        c.fillRect(x - hr * 0.26, y - 9 - hr * PITCH * 0.07, hr * 0.52, hr * PITCH * 0.14);

      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Dispatch
   *
   * Everything else in the game asks `Z.art.prop(kind, v)` for a sprite.
   * Buildings answer through the baker; anything else falls through to
   * the original prop art.
   * ------------------------------------------------------------------ */
  var VARIANTS = 12;
  var origProp = A.prop;

  A.prop = function (kind, v) {
    var def = Z.PLACES && Z.PLACES[kind];
    if (!def) return origProp(kind, v);
    var vi = Math.floor((v || 0) * VARIANTS) % VARIANTS;
    var key = kind + ':' + vi;
    if (bcache[key]) return bcache[key];
    return keep(key, facade(def, vi));
  };

  Z.artcity = { facade: facade, PPM: PPM, cacheSize: function () { return border.length; } };

})(window.Z);
