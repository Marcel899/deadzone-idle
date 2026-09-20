/* Deadzone - what is inside.

   A table of everything that can stand in a room: how big it is, whether
   you can walk through it, and how it is drawn. The interior generator
   reads the sizes from here and the renderer reads the drawing from here,
   so a bed is the same size to the collision as it looks.

   Most entries are a box with a colour. The ones that get a `detail`
   function are the ones where the silhouette alone would not tell you
   what room you are in - a hospital bed, a checkout, a shelf with stock
   still on it. That is the whole test applied here: would a player
   glancing at this room know what it was for? */
(function (Z) {
  'use strict';

  var AI = Z.artint = {};
  var F = AI.FURN = {};

  function def(id, o) {
    o.id = id;
    o.w = o.w || 0.8; o.d = o.d || 0.7; o.h = o.h || 0.7;
    if (o.solid == null) o.solid = true;
    o.top = o.top || [116, 108, 94];
    o.side = o.side || Z.shade(o.top, -0.22);
    F[id] = o;
    return o;
  }

  function hash(it, n) {
    return Z.hash2(Math.round((it.v || 0) * 733), n, 3313);
  }

  /* ------------------------------------------------------------------ *
   * Domestic
   * ------------------------------------------------------------------ */
  def('sofa', { w: 1.9, d: 0.9, h: 0.72, top: [128, 112, 96], side: [104, 90, 76],
    detail: function (c, g) {
      /* back cushions and arms, so it is not a crate */
      c.fillStyle = 'rgba(0,0,0,.22)';
      c.fillRect(g.x0 + g.W * 0.08, g.cy - g.D - g.H, g.W * 0.84, g.D * 0.42);
      c.fillStyle = 'rgba(255,248,236,.10)';
      c.fillRect(g.x0, g.cy - g.D - g.H, g.W * 0.1, g.D + g.H * 0.4);
      c.fillRect(g.x1 - g.W * 0.1, g.cy - g.D - g.H, g.W * 0.1, g.D + g.H * 0.4);
      for (var i = 1; i < 3; i++) {
        c.fillStyle = 'rgba(0,0,0,.18)';
        c.fillRect(g.x0 + g.W * (i / 3), g.cy - g.D - g.H, 1.4, g.D);
      }
    } });

  def('tv', { w: 1.1, d: 0.3, h: 0.66, top: [46, 48, 50], side: [30, 32, 34],
    detail: function (c, g) {
      c.fillStyle = 'rgba(12,14,16,.95)';
      c.fillRect(g.x0 + 2, g.cy - g.H + 2, g.W - 4, g.H - 5);
      /* the one dead screen in every living room */
      c.fillStyle = 'rgba(96,112,120,.16)';
      c.beginPath();
      c.moveTo(g.x0 + 2, g.cy - 3);
      c.lineTo(g.x0 + g.W * 0.5, g.cy - g.H + 2);
      c.lineTo(g.x0 + g.W * 0.75, g.cy - g.H + 2);
      c.lineTo(g.x0 + g.W * 0.2, g.cy - 3);
      c.closePath(); c.fill();
      if (hash(g.it, 1) > 0.6) {
        c.strokeStyle = 'rgba(200,210,214,.4)'; c.lineWidth = 1;
        c.beginPath();
        c.moveTo(g.x0 + g.W * 0.4, g.cy - g.H * 0.7);
        c.lineTo(g.x0 + g.W * 0.7, g.cy - g.H * 0.3);
        c.stroke();
      }
    } });

  def('table', { w: 1.1, d: 0.8, h: 0.4, top: [124, 98, 66], side: [96, 74, 48],
    solid: false,
    detail: function (c, g) {
      c.fillStyle = 'rgba(0,0,0,.3)';
      c.fillRect(g.x0 + 3, g.cy - 4, 3, 4);
      c.fillRect(g.x1 - 6, g.cy - 4, 3, 4);
    } });

  def('chair', { w: 0.46, d: 0.46, h: 0.5, top: [110, 88, 60], side: [86, 68, 44],
    solid: false,
    detail: function (c, g) {
      c.fillStyle = 'rgba(0,0,0,.24)';
      c.fillRect(g.x0, g.cy - g.D - g.H - g.H * 0.5, g.W, g.H * 0.5);
    } });

  def('bookcase', { w: 1.0, d: 0.34, h: 1.25, top: [104, 82, 56], side: [84, 66, 44],
    detail: function (c, g) { shelfFront(c, g, 4, 'rgba(120,108,86,.7)'); } });

  def('lamp', { w: 0.32, d: 0.32, h: 1.3, top: [132, 120, 92], side: [72, 68, 62],
    solid: false,
    detail: function (c, g) {
      c.fillStyle = 'rgba(56,54,50,.9)';
      c.fillRect(g.x0 + g.W * 0.4, g.cy - g.H, g.W * 0.2, g.H);
      c.fillStyle = 'rgba(176,164,132,.7)';
      c.beginPath();
      c.moveTo(g.x0 - 3, g.cy - g.H);
      c.lineTo(g.x0 + g.W + 3, g.cy - g.H);
      c.lineTo(g.x0 + g.W - 1, g.cy - g.H - g.H * 0.28);
      c.lineTo(g.x0 + 1, g.cy - g.H - g.H * 0.28);
      c.closePath(); c.fill();
    } });

  def('rug', { w: 1.8, d: 1.3, h: 0.02, top: [118, 78, 68], side: [98, 62, 54],
    solid: false, flat: true,
    detail: function (c, g) {
      c.strokeStyle = 'rgba(226,210,180,.22)'; c.lineWidth = 2;
      c.strokeRect(g.x0 + 4, g.cy - g.D + 2, g.W - 8, g.D - 4);
      c.lineWidth = 1;
    } });

  def('bed', { w: 1.0, d: 1.9, h: 0.42, top: [166, 158, 142], side: [110, 100, 88],
    detail: function (c, g) {
      /* headboard at the far end, a pillow, a cover thrown back */
      c.fillStyle = 'rgba(92,72,50,.95)';
      c.fillRect(g.x0, g.cy - g.D - g.H - g.H * 0.7, g.W, g.H * 0.7);
      c.fillStyle = 'rgba(226,222,208,.75)';
      c.fillRect(g.x0 + 3, g.cy - g.D - g.H + 2, g.W - 6, g.D * 0.22);
      c.fillStyle = 'rgba(96,86,76,.55)';
      c.beginPath();
      c.moveTo(g.x0 + 2, g.cy - g.D * 0.44 - g.H);
      c.lineTo(g.x1 - 2, g.cy - g.D * 0.52 - g.H);
      c.lineTo(g.x1 - 2, g.cy - g.H);
      c.lineTo(g.x0 + 2, g.cy - g.H);
      c.closePath(); c.fill();
    } });

  def('wardrobe', { w: 1.0, d: 0.56, h: 1.6, top: [102, 80, 54], side: [82, 64, 42],
    detail: function (c, g) {
      c.fillStyle = 'rgba(0,0,0,.28)';
      c.fillRect(g.x0 + g.W / 2 - 1, g.cy - g.H + 3, 2, g.H - 6);
      /* one door standing open on darkness */
      if (hash(g.it, 2) > 0.5) {
        c.fillStyle = 'rgba(10,12,14,.8)';
        c.fillRect(g.x0 + 3, g.cy - g.H + 3, g.W * 0.44, g.H - 6);
      }
      c.fillStyle = 'rgba(214,206,186,.4)';
      c.fillRect(g.x0 + g.W * 0.44, g.cy - g.H * 0.55, 3, 3);
    } });

  def('dresser', { w: 0.95, d: 0.46, h: 0.8, top: [110, 88, 60], side: [88, 70, 46],
    detail: function (c, g) { drawers(c, g, 3); } });

  def('cabinet', { w: 0.86, d: 0.46, h: 0.92, top: [104, 108, 112], side: [78, 84, 88],
    detail: function (c, g) { drawers(c, g, 3); } });

  def('toilet', { w: 0.46, d: 0.66, h: 0.66, top: [204, 202, 194], side: [172, 170, 162],
    detail: function (c, g) {
      c.fillStyle = 'rgba(224,222,214,.9)';
      c.fillRect(g.x0, g.cy - g.D - g.H - g.H * 0.5, g.W, g.H * 0.5);
      c.fillStyle = 'rgba(40,46,48,.55)';
      c.beginPath(); c.ellipse(g.x0 + g.W / 2, g.cy - g.D * 0.4 - g.H, g.W * 0.3, g.D * 0.24, 0, 0, Z.TAU); c.fill();
    } });

  def('bath', { w: 1.7, d: 0.75, h: 0.55, top: [206, 204, 196], side: [168, 166, 158],
    detail: function (c, g) {
      c.fillStyle = 'rgba(44,52,54,.6)';
      c.fillRect(g.x0 + 5, g.cy - g.D - g.H + 3, g.W - 10, g.D - 6);
      c.fillStyle = 'rgba(80,96,100,.35)';
      c.fillRect(g.x0 + 7, g.cy - g.D - g.H + 5, g.W - 14, g.D * 0.4);
    } });

  def('sink', { w: 0.6, d: 0.45, h: 0.85, top: [200, 198, 190], side: [160, 158, 150],
    detail: function (c, g) {
      c.fillStyle = 'rgba(44,52,54,.5)';
      c.fillRect(g.x0 + 4, g.cy - g.D - g.H + 2, g.W - 8, g.D - 4);
      c.fillStyle = 'rgba(190,192,186,.7)';
      c.fillRect(g.x0 + g.W / 2 - 1, g.cy - g.D - g.H - 6, 2, 6);
    } });

  def('stairs', { w: 1.2, d: 1.6, h: 1.1, top: [112, 106, 96], side: [86, 82, 74],
    detail: function (c, g) {
      /* a flight going up into the dark */
      for (var i = 0; i < 6; i++) {
        c.fillStyle = 'rgba(' + (128 - i * 10) + ',' + (122 - i * 10) + ',' + (110 - i * 10) + ',.95)';
        c.fillRect(g.x0, g.cy - g.D - g.H + i * (g.D / 6), g.W, g.D / 6 + 1);
      }
      c.fillStyle = 'rgba(8,10,12,.8)';
      c.fillRect(g.x0, g.cy - g.D - g.H - 6, g.W, 8);
    } });

  /* ------------------------------------------------------------------ *
   * Kitchen
   * ------------------------------------------------------------------ */
  def('counter', { w: 1.2, d: 0.62, h: 0.9, top: [140, 134, 120], side: [104, 98, 86],
    detail: function (c, g) {
      c.fillStyle = 'rgba(226,222,208,.16)';
      c.fillRect(g.x0, g.cy - g.D - g.H, g.W, 2.4);
      drawers(c, g, 2);
    } });

  def('stove', { w: 0.8, d: 0.62, h: 0.9, top: [92, 94, 96], side: [70, 72, 74],
    detail: function (c, g) {
      for (var i = 0; i < 4; i++) {
        c.fillStyle = 'rgba(24,26,28,.85)';
        c.beginPath();
        c.ellipse(g.x0 + g.W * (0.28 + (i % 2) * 0.44),
                  g.cy - g.D * (0.34 + Math.floor(i / 2) * 0.4) - g.H,
                  g.W * 0.14, g.D * 0.16, 0, 0, Z.TAU);
        c.fill();
      }
      c.fillStyle = 'rgba(20,22,24,.8)';
      c.fillRect(g.x0 + 4, g.cy - g.H * 0.72, g.W - 8, g.H * 0.5);
      c.fillStyle = 'rgba(150,160,164,.25)';
      c.fillRect(g.x0 + 6, g.cy - g.H * 0.68, g.W - 12, g.H * 0.3);
    } });

  def('fridge', { w: 0.78, d: 0.62, h: 1.7, top: [178, 178, 172], side: [148, 150, 146],
    detail: function (c, g) {
      var open = hash(g.it, 3) > 0.55;
      c.fillStyle = 'rgba(0,0,0,.22)';
      c.fillRect(g.x0 + 2, g.cy - g.H * 0.66, g.W - 4, 2);
      if (open) {
        c.fillStyle = 'rgba(12,14,16,.9)';
        c.fillRect(g.x0 + 4, g.cy - g.H + 4, g.W - 8, g.H - 8);
        for (var s = 0; s < 3; s++) {
          c.fillStyle = 'rgba(126,130,124,.5)';
          c.fillRect(g.x0 + 5, g.cy - g.H + 8 + s * (g.H / 3.6), g.W - 10, 2);
        }
      }
      c.fillStyle = 'rgba(210,210,204,.5)';
      c.fillRect(g.x1 - 7, g.cy - g.H * 0.8, 3, g.H * 0.3);
    } });

  def('freezer', { w: 1.5, d: 0.8, h: 0.95, top: [172, 182, 188], side: [128, 142, 150],
    detail: function (c, g) {
      c.fillStyle = 'rgba(158,190,204,.35)';
      c.fillRect(g.x0 + 3, g.cy - g.D - g.H + 3, g.W - 6, g.D - 6);
      c.fillStyle = 'rgba(226,240,246,.2)';
      c.fillRect(g.x0 + 5, g.cy - g.D - g.H + 5, g.W * 0.4, g.D * 0.4);
    } });

  /* ------------------------------------------------------------------ *
   * Retail
   * ------------------------------------------------------------------ */
  def('shelf', { w: 1.9, d: 0.5, h: 1.35, top: [112, 112, 108], side: [88, 90, 88],
    detail: function (c, g) { shelfFront(c, g, 4, 'rgba(150,132,96,.65)'); } });

  def('medShelf', { w: 1.7, d: 0.46, h: 1.3, top: [186, 190, 192], side: [150, 156, 160],
    detail: function (c, g) { shelfFront(c, g, 4, 'rgba(180,206,200,.7)'); } });

  def('rack', { w: 1.9, d: 0.7, h: 1.9, top: [122, 96, 60], side: [104, 82, 50],
    detail: function (c, g) {
      /* industrial racking: uprights, beams, pallets on them */
      c.fillStyle = 'rgba(146,108,54,.95)';
      c.fillRect(g.x0, g.cy - g.H, 4, g.H);
      c.fillRect(g.x1 - 4, g.cy - g.H, 4, g.H);
      for (var lv = 1; lv <= 2; lv++) {
        var ly = g.cy - g.H * (lv / 2.6);
        c.fillStyle = 'rgba(176,132,64,.95)';
        c.fillRect(g.x0, ly, g.W, 3.4);
        if (hash(g.it, lv) > 0.35) {
          c.fillStyle = 'rgba(126,100,64,.85)';
          c.fillRect(g.x0 + g.W * 0.1, ly - g.H * 0.26, g.W * 0.36, g.H * 0.26);
          c.fillStyle = 'rgba(96,78,52,.85)';
          c.fillRect(g.x0 + g.W * 0.54, ly - g.H * 0.2, g.W * 0.32, g.H * 0.2);
        }
      }
    } });

  def('till', { w: 0.9, d: 1.5, h: 0.95, top: [130, 132, 128], side: [98, 100, 98],
    detail: function (c, g) {
      /* a belt, a register and the divider rail */
      c.fillStyle = 'rgba(48,50,50,.85)';
      c.fillRect(g.x0 + 3, g.cy - g.D - g.H + 3, g.W - 6, g.D * 0.6);
      c.fillStyle = 'rgba(66,68,68,.9)';
      c.fillRect(g.x0 + g.W * 0.3, g.cy - g.D - g.H - g.H * 0.4, g.W * 0.5, g.H * 0.4);
      c.fillStyle = 'rgba(150,170,176,.4)';
      c.fillRect(g.x0 + g.W * 0.36, g.cy - g.D - g.H - g.H * 0.34, g.W * 0.36, g.H * 0.16);
    } });

  def('cart', { w: 0.6, d: 0.9, h: 0.9, top: [168, 172, 174], side: [140, 144, 146],
    solid: false,
    detail: function (c, g) {
      c.strokeStyle = 'rgba(190,194,196,.7)'; c.lineWidth = 1.4;
      for (var i = 1; i < 4; i++) {
        c.beginPath();
        c.moveTo(g.x0 + g.W * (i / 4), g.cy - g.H);
        c.lineTo(g.x0 + g.W * (i / 4), g.cy - g.H * 0.2);
        c.stroke();
      }
      c.lineWidth = 1;
    } });

  def('mirror', { w: 0.9, d: 0.16, h: 1.5, top: [186, 194, 198], side: [148, 156, 160],
    detail: function (c, g) {
      c.fillStyle = 'rgba(158,180,190,.38)';
      c.fillRect(g.x0 + 3, g.cy - g.H + 3, g.W - 6, g.H - 6);
      if (hash(g.it, 4) > 0.5) {
        c.strokeStyle = 'rgba(232,240,244,.5)'; c.lineWidth = 1;
        c.beginPath();
        c.moveTo(g.x0 + g.W * 0.3, g.cy - g.H + 4);
        c.lineTo(g.x0 + g.W * 0.6, g.cy - g.H * 0.4);
        c.lineTo(g.x0 + g.W * 0.35, g.cy - 6);
        c.stroke();
      }
    } });

  def('safe', { w: 0.9, d: 0.8, h: 1.1, top: [72, 76, 80], side: [54, 58, 62],
    detail: function (c, g) {
      c.fillStyle = 'rgba(40,44,48,.9)';
      c.fillRect(g.x0 + 4, g.cy - g.H + 4, g.W - 8, g.H - 8);
      c.fillStyle = 'rgba(176,170,148,.6)';
      c.beginPath(); c.arc(g.x0 + g.W * 0.6, g.cy - g.H * 0.5, Math.max(2, g.W * 0.12), 0, Z.TAU); c.fill();
    } });

  def('timber', { w: 2.2, d: 0.7, h: 0.9, top: [150, 122, 78], side: [120, 96, 58],
    detail: function (c, g) {
      c.fillStyle = 'rgba(0,0,0,.18)';
      for (var i = 1; i < 7; i++) c.fillRect(g.x0, g.cy - g.D - g.H + i * (g.D / 7), g.W, 1.4);
      for (var j = 1; j < 4; j++) c.fillRect(g.x0, g.cy - g.H * (j / 4), g.W, 1.4);
    } });

  /* ------------------------------------------------------------------ *
   * Office and civic
   * ------------------------------------------------------------------ */
  def('desk', { w: 1.5, d: 0.8, h: 0.76, top: [126, 106, 78], side: [98, 82, 58],
    detail: function (c, g) {
      drawers(c, g, 2);
      /* a monitor and the scatter of paper that outlived everybody */
      c.fillStyle = 'rgba(40,42,44,.9)';
      c.fillRect(g.x0 + g.W * 0.56, g.cy - g.D - g.H - g.H * 0.44, g.W * 0.3, g.H * 0.44);
      c.fillStyle = 'rgba(110,124,130,.3)';
      c.fillRect(g.x0 + g.W * 0.58, g.cy - g.D - g.H - g.H * 0.4, g.W * 0.26, g.H * 0.3);
      c.fillStyle = 'rgba(220,216,200,.5)';
      c.fillRect(g.x0 + g.W * 0.12, g.cy - g.D - g.H + g.D * 0.3, g.W * 0.24, g.D * 0.3);
    } });

  def('board', { w: 1.9, d: 0.14, h: 1.1, top: [88, 100, 88], side: [66, 78, 68],
    detail: function (c, g) {
      c.fillStyle = 'rgba(56,70,60,.95)';
      c.fillRect(g.x0 + 3, g.cy - g.H + 3, g.W - 6, g.H - 6);
      c.strokeStyle = 'rgba(226,222,208,.3)'; c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(g.x0 + 8, g.cy - g.H * 0.7); c.lineTo(g.x0 + g.W * 0.6, g.cy - g.H * 0.68);
      c.moveTo(g.x0 + 8, g.cy - g.H * 0.5); c.lineTo(g.x0 + g.W * 0.45, g.cy - g.H * 0.48);
      c.stroke(); c.lineWidth = 1;
    } });

  def('plant', { w: 0.6, d: 0.6, h: 1.1, top: [102, 84, 62], side: [82, 66, 48],
    solid: false,
    detail: function (c, g) {
      c.fillStyle = 'rgba(78,62,44,.95)';
      c.fillRect(g.x0 + g.W * 0.2, g.cy - g.H * 0.4, g.W * 0.6, g.H * 0.4);
      for (var i = 0; i < 9; i++) {
        var a = (i / 9) * Z.TAU;
        c.strokeStyle = i % 2 ? 'rgba(88,112,56,.75)' : 'rgba(64,88,44,.75)';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(g.x0 + g.W / 2, g.cy - g.H * 0.4);
        c.lineTo(g.x0 + g.W / 2 + Math.cos(a) * g.W * 0.5,
                 g.cy - g.H * 0.4 - Math.abs(Math.sin(a)) * g.H * 0.6);
        c.stroke();
      }
      c.lineWidth = 1;
    } });

  def('bench', { w: 1.7, d: 0.5, h: 0.44, top: [122, 100, 68], side: [96, 78, 50],
    solid: false,
    detail: function (c, g) {
      c.fillStyle = 'rgba(0,0,0,.2)';
      for (var i = 1; i < 3; i++) c.fillRect(g.x0, g.cy - g.D - g.H + i * (g.D / 3), g.W, 1.4);
    } });

  def('locker', { w: 1.2, d: 0.46, h: 1.75, top: [96, 106, 112], side: [76, 86, 94],
    detail: function (c, g) {
      for (var i = 1; i < 3; i++) {
        c.fillStyle = 'rgba(0,0,0,.3)';
        c.fillRect(g.x0 + g.W * (i / 3), g.cy - g.H + 2, 2, g.H - 4);
      }
      if (hash(g.it, 5) > 0.55) {
        c.fillStyle = 'rgba(10,12,14,.85)';
        c.fillRect(g.x0 + 3, g.cy - g.H + 3, g.W * 0.3, g.H - 6);
      }
      c.fillStyle = 'rgba(206,202,186,.35)';
      for (var v = 0; v < 3; v++) c.fillRect(g.x0 + g.W * (0.12 + v * 0.33), g.cy - g.H * 0.86, g.W * 0.12, 2);
    } });

  def('bunk', { w: 0.9, d: 1.8, h: 1.5, top: [96, 100, 104], side: [74, 80, 84],
    detail: function (c, g) {
      c.fillStyle = 'rgba(150,146,134,.6)';
      c.fillRect(g.x0 + 3, g.cy - g.D - g.H * 0.5, g.W - 6, g.D * 0.5);
      c.fillStyle = 'rgba(120,116,106,.5)';
      c.fillRect(g.x0 + 3, g.cy - g.D - g.H, g.W - 6, g.D * 0.5);
    } });

  def('bars', { w: 1.9, d: 0.16, h: 2.0, solid: true, top: [72, 76, 78], side: [56, 60, 62],
    detail: function (c, g) {
      c.fillStyle = 'rgba(88,92,94,.95)';
      for (var i = 0; i < 9; i++) c.fillRect(g.x0 + g.W * (i / 8) - 1.4, g.cy - g.H, 2.8, g.H);
      c.fillRect(g.x0, g.cy - g.H, g.W, 3);
    } });

  def('gunRack', { w: 1.6, d: 0.36, h: 1.5, top: [92, 74, 52], side: [72, 58, 40],
    detail: function (c, g) {
      c.fillStyle = 'rgba(18,20,22,.85)';
      c.fillRect(g.x0 + 3, g.cy - g.H + 3, g.W - 6, g.H - 6);
      for (var i = 0; i < 4; i++) {
        if (hash(g.it, i) < 0.42) continue;
        c.fillStyle = 'rgba(58,54,48,.9)';
        c.fillRect(g.x0 + g.W * (0.14 + i * 0.2), g.cy - g.H * 0.85, 3.4, g.H * 0.6);
        c.fillStyle = 'rgba(96,78,54,.9)';
        c.fillRect(g.x0 + g.W * (0.14 + i * 0.2) - 1, g.cy - g.H * 0.3, 5.4, g.H * 0.16);
      }
    } });

  def('pew', { w: 2.4, d: 0.5, h: 0.85, top: [116, 90, 58], side: [92, 72, 46],
    solid: false,
    detail: function (c, g) {
      c.fillStyle = 'rgba(102,80,52,.95)';
      c.fillRect(g.x0, g.cy - g.D - g.H - g.H * 0.5, g.W, g.H * 0.5);
      c.fillStyle = 'rgba(0,0,0,.2)';
      c.fillRect(g.x0, g.cy - g.D - g.H - g.H * 0.2, g.W, 2);
    } });

  def('altar', { w: 1.6, d: 0.8, h: 1.0, top: [176, 168, 146], side: [140, 134, 116],
    detail: function (c, g) {
      c.fillStyle = 'rgba(206,200,180,.5)';
      c.fillRect(g.x0 - 3, g.cy - g.D - g.H - 3, g.W + 6, 4);
      c.fillStyle = 'rgba(180,164,110,.6)';
      c.fillRect(g.x0 + g.W * 0.46, g.cy - g.D - g.H - g.H * 0.5, 3, g.H * 0.5);
      c.fillRect(g.x0 + g.W * 0.38, g.cy - g.D - g.H - g.H * 0.36, g.W * 0.2, 3);
    } });

  def('sign', { w: 1.2, d: 0.14, h: 1.9, top: [70, 74, 78], side: [52, 56, 60],
    solid: false,
    detail: function (c, g) {
      c.fillStyle = 'rgba(40,58,72,.9)';
      c.fillRect(g.x0, g.cy - g.H, g.W, g.H * 0.38);
      c.fillStyle = 'rgba(206,214,218,.45)';
      for (var i = 0; i < 3; i++) c.fillRect(g.x0 + 5, g.cy - g.H + 5 + i * 5, g.W * (0.7 - i * 0.16), 2.4);
    } });

  def('fountain', { w: 2.2, d: 2.2, h: 0.6, top: [142, 140, 132], side: [110, 108, 102],
    detail: function (c, g) {
      c.fillStyle = 'rgba(40,58,62,.7)';
      c.beginPath(); c.ellipse(g.x0 + g.W / 2, g.cy - g.D / 2 - g.H, g.W * 0.36, g.D * 0.36, 0, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgba(122,150,156,.25)';
      c.beginPath(); c.ellipse(g.x0 + g.W * 0.42, g.cy - g.D * 0.58 - g.H, g.W * 0.16, g.D * 0.12, 0, 0, Z.TAU); c.fill();
    } });

  /* ------------------------------------------------------------------ *
   * Medical
   * ------------------------------------------------------------------ */
  def('hospBed', { w: 0.9, d: 2.0, h: 0.66, top: [196, 200, 198], side: [126, 134, 138],
    detail: function (c, g) {
      /* the raised head end, the rails, and the frame under it */
      c.fillStyle = 'rgba(150,158,162,.95)';
      c.fillRect(g.x0, g.cy - g.D - g.H - g.H * 0.85, g.W, g.H * 0.85);
      c.fillStyle = 'rgba(226,226,220,.7)';
      c.fillRect(g.x0 + 3, g.cy - g.D - g.H + 2, g.W - 6, g.D * 0.2);
      c.strokeStyle = 'rgba(178,184,188,.8)'; c.lineWidth = 2;
      c.beginPath();
      c.moveTo(g.x0 + 1, g.cy - g.D * 0.72 - g.H); c.lineTo(g.x0 + 1, g.cy - g.D * 0.3 - g.H);
      c.moveTo(g.x1 - 1, g.cy - g.D * 0.72 - g.H); c.lineTo(g.x1 - 1, g.cy - g.D * 0.3 - g.H);
      c.stroke(); c.lineWidth = 1;
      /* a sheet, thrown back */
      c.fillStyle = 'rgba(178,182,178,.55)';
      c.beginPath();
      c.moveTo(g.x0 + 2, g.cy - g.D * 0.5 - g.H);
      c.lineTo(g.x1 - 2, g.cy - g.D * 0.42 - g.H);
      c.lineTo(g.x1 - 2, g.cy - g.H);
      c.lineTo(g.x0 + 2, g.cy - g.H);
      c.closePath(); c.fill();
    } });

  def('opTable', { w: 0.8, d: 2.0, h: 0.95, top: [176, 190, 192], side: [96, 112, 120],
    detail: function (c, g) {
      c.fillStyle = 'rgba(60,78,86,.8)';
      c.fillRect(g.x0 + g.W * 0.3, g.cy - g.H, g.W * 0.4, g.H);
      c.fillStyle = 'rgba(120,150,156,.5)';
      c.fillRect(g.x0 + 3, g.cy - g.D - g.H + 3, g.W - 6, g.D * 0.3);
    } });

  def('lightRig', { w: 1.1, d: 1.1, h: 2.1, top: [196, 198, 192], side: [130, 134, 134],
    solid: false,
    detail: function (c, g) {
      c.fillStyle = 'rgba(70,74,76,.9)';
      c.fillRect(g.x0 + g.W * 0.44, g.cy - g.H, g.W * 0.12, g.H);
      c.fillStyle = 'rgba(206,210,206,.85)';
      c.beginPath(); c.ellipse(g.x0 + g.W / 2, g.cy - g.H, g.W * 0.46, g.D * 0.34, 0, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgba(248,244,224,.3)';
      c.beginPath(); c.ellipse(g.x0 + g.W / 2, g.cy - g.H + 2, g.W * 0.3, g.D * 0.22, 0, 0, Z.TAU); c.fill();
    } });

  def('monitor', { w: 0.5, d: 0.5, h: 1.4, top: [80, 88, 92], side: [58, 66, 72],
    detail: function (c, g) {
      c.fillStyle = 'rgba(18,22,26,.9)';
      c.fillRect(g.x0 + 2, g.cy - g.H + 3, g.W - 4, g.H * 0.4);
      c.fillStyle = 'rgba(96,142,120,.35)';
      c.fillRect(g.x0 + 4, g.cy - g.H + 5, g.W - 8, g.H * 0.3);
    } });

  def('medCab', { w: 0.9, d: 0.42, h: 1.6, top: [196, 200, 198], side: [156, 164, 166],
    detail: function (c, g) {
      c.fillStyle = 'rgba(140,170,178,.4)';
      c.fillRect(g.x0 + 4, g.cy - g.H + 4, g.W - 8, g.H * 0.6);
      shelfFront(c, g, 3, 'rgba(198,214,208,.6)');
      c.fillStyle = 'rgba(78,150,198,.7)';
      c.fillRect(g.x0 + g.W * 0.42, g.cy - g.H * 0.2, g.W * 0.16, g.H * 0.1);
      c.fillRect(g.x0 + g.W * 0.33, g.cy - g.H * 0.17, g.W * 0.34, g.H * 0.04);
    } });

  def('gurney', { w: 0.7, d: 1.8, h: 0.8, top: [180, 186, 186], side: [118, 126, 130],
    detail: function (c, g) {
      c.strokeStyle = 'rgba(160,168,172,.8)'; c.lineWidth = 2;
      c.beginPath();
      c.moveTo(g.x0 + 2, g.cy - g.H); c.lineTo(g.x0 + 2, g.cy - 2);
      c.moveTo(g.x1 - 2, g.cy - g.H); c.lineTo(g.x1 - 2, g.cy - 2);
      c.stroke(); c.lineWidth = 1;
    } });

  def('slab', { w: 0.9, d: 2.0, h: 0.8, top: [168, 174, 176], side: [122, 128, 132],
    detail: function (c, g) {
      c.fillStyle = 'rgba(0,0,0,.2)';
      c.fillRect(g.x0 + 3, g.cy - g.D - g.H + 3, g.W - 6, g.D - 6);
      c.fillStyle = 'rgba(190,190,182,.5)';
      c.fillRect(g.x0 + 5, g.cy - g.D - g.H + 5, g.W - 10, g.D * 0.5);
    } });

  def('curtain', { w: 1.9, d: 0.14, h: 2.0, top: [150, 166, 172], side: [116, 134, 142],
    solid: false,
    detail: function (c, g) {
      c.fillStyle = 'rgba(0,0,0,.16)';
      for (var i = 1; i < 8; i++) c.fillRect(g.x0 + g.W * (i / 8), g.cy - g.H, 1.6, g.H);
      c.fillStyle = 'rgba(178,184,186,.8)';
      c.fillRect(g.x0 - 2, g.cy - g.H - 3, g.W + 4, 3);
    } });

  /* ------------------------------------------------------------------ *
   * Industry and garage
   * ------------------------------------------------------------------ */
  def('crate', { w: 0.85, d: 0.75, h: 0.68, top: [128, 98, 58], side: [104, 78, 44],
    detail: function (c, g) {
      c.strokeStyle = 'rgba(58,40,22,.5)'; c.lineWidth = 2;
      c.beginPath();
      c.moveTo(g.x0 + 2, g.cy - g.H + 2); c.lineTo(g.x1 - 2, g.cy - 2);
      c.moveTo(g.x1 - 2, g.cy - g.H + 2); c.lineTo(g.x0 + 2, g.cy - 2);
      c.stroke(); c.lineWidth = 1;
    } });

  def('pallet', { w: 1.2, d: 1.0, h: 0.18, top: [134, 106, 66], side: [104, 80, 48],
    solid: false,
    detail: function (c, g) {
      c.fillStyle = 'rgba(0,0,0,.24)';
      for (var i = 1; i < 5; i++) c.fillRect(g.x0, g.cy - g.D - g.H + i * (g.D / 5), g.W, 1.4);
    } });

  def('toolbox', { w: 0.8, d: 0.5, h: 0.9, top: [150, 62, 50], side: [116, 48, 40],
    detail: function (c, g) { drawers(c, g, 3); } });

  def('bench2', { w: 1.9, d: 0.7, h: 0.88, top: [120, 100, 70], side: [94, 78, 52],
    detail: function (c, g) {
      c.fillStyle = 'rgba(70,72,70,.6)';
      c.fillRect(g.x0 + g.W * 0.6, g.cy - g.D - g.H - 4, g.W * 0.24, 5);
      drawers(c, g, 2);
    } });
  F.bench2.id = 'bench2';

  def('machine', { w: 1.6, d: 1.2, h: 1.7, top: [96, 100, 104], side: [72, 78, 84],
    detail: function (c, g) {
      c.fillStyle = 'rgba(48,52,56,.9)';
      c.fillRect(g.x0 + 4, g.cy - g.H + 6, g.W - 8, g.H * 0.4);
      c.fillStyle = 'rgba(176,132,48,.5)';
      c.fillRect(g.x0, g.cy - g.H * 0.2, g.W, 3.4);
      c.fillStyle = 'rgba(140,146,150,.7)';
      c.fillRect(g.x0 + g.W * 0.7, g.cy - g.D - g.H - g.H * 0.4, g.W * 0.16, g.H * 0.4);
    } });

  def('forklift', { w: 1.1, d: 1.9, h: 1.9, top: [190, 156, 48], side: [158, 128, 38],
    detail: function (c, g) {
      c.fillStyle = 'rgba(40,42,44,.9)';
      c.fillRect(g.x0 + g.W * 0.1, g.cy - g.H * 0.3, g.W * 0.8, g.H * 0.3);
      c.fillStyle = 'rgba(120,124,128,.9)';
      c.fillRect(g.x0 + g.W * 0.2, g.cy - g.D - g.H - g.H * 0.6, 4, g.H * 0.6);
      c.fillRect(g.x0 + g.W * 0.7, g.cy - g.D - g.H - g.H * 0.6, 4, g.H * 0.6);
    } });

  def('drum', { w: 0.6, d: 0.6, h: 0.92, top: [126, 82, 40], side: [100, 66, 32],
    detail: function (c, g) {
      c.fillStyle = 'rgba(0,0,0,.22)';
      c.fillRect(g.x0, g.cy - g.H * 0.66, g.W, 2.4);
      c.fillRect(g.x0, g.cy - g.H * 0.33, g.W, 2.4);
    } });

  def('car', { w: 1.9, d: 4.2, h: 1.4, top: [96, 102, 110], side: [74, 80, 88],
    detail: function (c, g) {
      /* seen from above and behind, so: roof, screen, bonnet */
      c.fillStyle = 'rgba(24,30,34,.75)';
      c.fillRect(g.x0 + g.W * 0.1, g.cy - g.D * 0.72 - g.H, g.W * 0.8, g.D * 0.3);
      c.fillStyle = 'rgba(120,146,160,.35)';
      c.fillRect(g.x0 + g.W * 0.12, g.cy - g.D * 0.42 - g.H, g.W * 0.76, g.D * 0.12);
      c.fillStyle = 'rgba(0,0,0,.3)';
      c.fillRect(g.x0, g.cy - g.D - g.H, g.W, g.D * 0.06);
      c.fillStyle = 'rgba(206,82,56,.55)';
      c.fillRect(g.x0 + 3, g.cy - g.H - 3, g.W * 0.2, 4);
      c.fillRect(g.x1 - g.W * 0.2 - 3, g.cy - g.H - 3, g.W * 0.2, 4);
    } });

  def('lift', { w: 2.4, d: 1.4, h: 0.4, top: [90, 96, 100], side: [66, 72, 78],
    solid: false,
    detail: function (c, g) {
      c.fillStyle = 'rgba(176,132,48,.45)';
      c.fillRect(g.x0, g.cy - g.D - g.H, g.W, 3);
      c.fillStyle = 'rgba(50,54,58,.9)';
      c.fillRect(g.x0 + g.W * 0.44, g.cy - g.D - g.H - 6, g.W * 0.12, 8);
    } });

  def('tyres', { w: 0.9, d: 0.9, h: 0.9, top: [42, 42, 44], side: [30, 30, 32],
    detail: function (c, g) {
      for (var i = 0; i < 3; i++) {
        c.fillStyle = i % 2 ? 'rgba(52,52,54,.95)' : 'rgba(38,38,40,.95)';
        c.beginPath();
        c.ellipse(g.x0 + g.W / 2, g.cy - g.H * (0.2 + i * 0.3), g.W * 0.48, g.D * 0.42, 0, 0, Z.TAU);
        c.fill();
      }
      c.fillStyle = 'rgba(90,92,94,.6)';
      c.beginPath(); c.ellipse(g.x0 + g.W / 2, g.cy - g.H * 0.8, g.W * 0.2, g.D * 0.17, 0, 0, Z.TAU); c.fill();
    } });

  def('engine', { w: 2.4, d: 5.0, h: 2.4, top: [168, 52, 44], side: [132, 40, 34],
    detail: function (c, g) {
      /* a fire appliance: the one thing in a fire station */
      c.fillStyle = 'rgba(30,34,36,.85)';
      c.fillRect(g.x0 + g.W * 0.08, g.cy - g.D * 0.78 - g.H, g.W * 0.84, g.D * 0.2);
      c.fillStyle = 'rgba(214,218,220,.35)';
      c.fillRect(g.x0, g.cy - g.H * 0.5, g.W, 4);
      for (var i = 0; i < 3; i++) {
        c.fillStyle = 'rgba(180,184,186,.4)';
        c.fillRect(g.x0 + 4, g.cy - g.D * (0.3 + i * 0.18) - g.H, g.W - 8, 2.4);
      }
      c.fillStyle = 'rgba(70,110,196,.6)';
      c.fillRect(g.x0 + g.W * 0.3, g.cy - g.D - g.H - 4, g.W * 0.4, 4);
    } });

  /* generic fallbacks */
  def('generic', { w: 0.8, d: 0.7, h: 0.7, top: [110, 100, 88], side: [86, 78, 68] });

  /* aliases used by the room programme */
  F.bench_work = F.bench2;
  F.stall = F.mirror;

  /* ------------------------------------------------------------------ *
   * Shared detail helpers
   * ------------------------------------------------------------------ */
  /* An open front with shelves and whatever is left on them. Half the
     furniture in a city is a variation on this. */
  function shelfFront(c, g, n, stock) {
    c.fillStyle = 'rgba(12,14,16,.7)';
    c.fillRect(g.x0 + 3, g.cy - g.H + 3, g.W - 6, g.H - 6);
    for (var i = 0; i < n; i++) {
      var sy = g.cy - g.H + 5 + i * ((g.H - 8) / n);
      c.fillStyle = 'rgba(122,118,106,.9)';
      c.fillRect(g.x0 + 3, sy, g.W - 6, 2.2);
      /* stock, thinning as you go up, and gaps where it was taken */
      for (var j = 0; j < 5; j++) {
        if (Z.hash2(Math.round(g.x0) + i * 7, j * 13 + i, 4821) < 0.42) continue;
        c.fillStyle = stock;
        var bw = (g.W - 10) / 5;
        c.fillRect(g.x0 + 5 + j * bw, sy - ((g.H - 8) / n) * 0.55, bw * 0.75,
                   ((g.H - 8) / n) * 0.55);
      }
    }
  }

  function drawers(c, g, n) {
    for (var i = 0; i < n; i++) {
      var dy = g.cy - g.H + 3 + i * ((g.H - 5) / n);
      c.fillStyle = 'rgba(0,0,0,.24)';
      c.fillRect(g.x0 + 3, dy, g.W - 6, (g.H - 5) / n - 2);
      c.fillStyle = 'rgba(255,248,236,.08)';
      c.fillRect(g.x0 + 3, dy, g.W - 6, 1.4);
      c.fillStyle = 'rgba(206,202,186,.3)';
      c.fillRect(g.x0 + g.W * 0.42, dy + ((g.H - 5) / n) * 0.35, g.W * 0.16, 2);
    }
    /* one pulled out and emptied onto the floor */
    if (Z.hash2(Math.round(g.x0), n, 771) > 0.6) {
      c.fillStyle = 'rgba(10,12,14,.8)';
      c.fillRect(g.x0 + 3, g.cy - g.H * 0.45, g.W - 6, g.H * 0.2);
    }
  }

  AI.sizeOf = function (kind) { return F[kind] || F.generic; };

  /* ------------------------------------------------------------------ *
   * Drawing
   *
   * One box per item, in the same projection the outdoor renderer uses,
   * plus whatever the entry's own detail function adds. Tipped items are
   * drawn on their side, which is the cheapest way to say that something
   * came through here.
   * ------------------------------------------------------------------ */
  AI.draw = function (c, it, cam, lit) {
    var K = F[it.kind] || F.generic;
    var tz = cam.z, tp = tz * Z.PITCH;
    var w = K.w, d = K.d;
    if (it.rot & 1) { w = K.d; d = K.w; }
    var hgt = K.h * (it.tipped ? 0.34 : 1);

    var cx = cam.sx(it.x), cy = cam.sy(it.y + d / 2);
    var W = w * tz, D = d * tp, H = hgt * tz;
    var x0 = cx - W / 2;
    var g = { x0: x0, x1: x0 + W, cy: cy, W: W, D: D, H: H, it: it, K: K };

    /* contact shadow */
    c.fillStyle = 'rgba(4,6,8,.30)';
    c.beginPath();
    c.ellipse(cx, cy - D / 2, W * 0.58, D * 0.66, 0, 0, Z.TAU);
    c.fill();

    if (K.flat) {
      c.fillStyle = Z.rgb(Z.shade(K.top, it.done ? -0.2 : 0));
      c.fillRect(x0, cy - D, W, D);
      if (K.detail) K.detail(c, g);
      return;
    }

    var dim = it.done ? -0.22 : 0;
    /* top face */
    c.fillStyle = Z.rgb(Z.shade(K.top, 0.14 + dim));
    c.fillRect(x0, cy - D - H, W, D);
    /* front face */
    var lg = c.createLinearGradient(0, cy - H, 0, cy);
    lg.addColorStop(0, Z.rgb(Z.shade(K.side, 0.08 + dim)));
    lg.addColorStop(1, Z.rgb(Z.shade(K.side, -0.38 + dim)));
    c.fillStyle = lg;
    c.fillRect(x0, cy - H, W, H);

    if (K.detail && !it.tipped) K.detail(c, g);

    c.strokeStyle = 'rgba(8,10,12,.55)';
    c.lineWidth = 1.2;
    c.strokeRect(x0 + 0.5, cy - D - H + 0.5, W - 1, D + H - 1);
    c.lineWidth = 1;

    /* a searchable container that is still shut gets a catch of light on
       it, and an emptied one stands open */
    if (it.loot) {
      c.fillStyle = it.done ? 'rgba(18,20,22,.7)' : 'rgba(206,166,52,.4)';
      c.fillRect(x0 + W * 0.2, cy - H * 0.6, W * 0.6, Math.max(2, H * 0.09));
    }
  };

})(window.Z);
