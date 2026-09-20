/* Deadzone - the street.

   Everything in a city that is not a building. Lamp posts and bins and
   hydrants are why a road reads as a road; wrecks and barricades are why
   it reads as a road nobody got out of.

   These register straight into the prop art table, so they bake and blit
   exactly like a tree does. Each one is deliberately small: the character
   comes from there being forty of them, not from any one being elaborate. */
(function (Z) {
  'use strict';

  var A = Z.art;
  var K = A.kit;
  var P = A.PROP_ART;
  var PPM = A.propPPM;
  var PITCH = K.PITCH;
  var box = K.box, cyl = K.cyl, plinth = K.plinth;

  function h(v, n) { return Z.hash2(Math.round(v * 97), n, 5501); }
  function rgba(r, g, b, a) { return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }

  function post(c, x, y, w, hgt, col) {
    c.fillStyle = Z.rgb(Z.shade(col, -0.1));
    c.fillRect(x - w / 2, y - hgt, w, hgt);
    c.fillStyle = 'rgba(255,250,240,.12)';
    c.fillRect(x - w / 2, y - hgt, w * 0.34, hgt);
  }

  /* Rust, dirt and moss, thrown over whatever has just been drawn. The
     single cheapest way to make a clean shape belong in this world. */
  function weather(c, x, y, w, hgt, v, amt) {
    var n = amt == null ? 5 : amt;
    for (var i = 0; i < n; i++) {
      var px = x - w / 2 + h(v, i * 3) * w;
      var py = y - hgt + h(v, i * 5 + 1) * hgt;
      var s = 1.4 + h(v, i * 7) * 3.4;
      c.fillStyle = i % 2 ? 'rgba(112,64,34,.22)' : 'rgba(44,52,32,.20)';
      c.beginPath(); c.ellipse(px, py, s, s * 0.8, 0, 0, Z.TAU); c.fill();
    }
  }

  /* ------------------------------------------------------------------ *
   * Vehicles
   *
   * One body function, four silhouettes. A car, a van, a bus and a
   * freight wagon differ in proportion and in what is on the roof, which
   * is enough at this size.
   * ------------------------------------------------------------------ */
  function vehicle(c, x, y, v, o) {
    var len = o.len, wide = o.wide, hgt = o.hgt;
    var L = len * PPM, D = wide * PPM * PITCH, H = hgt * PPM;
    var x0 = x - L / 2, y0 = y + D / 2;
    var body = o.body, dark = Z.shade(body, -0.34);

    /* wheels first, so the body sits over them */
    c.fillStyle = 'rgba(16,16,18,.95)';
    for (var wI = 0; wI < (o.axles || 2); wI++) {
      var wx = x0 + L * (0.18 + wI * (0.64 / Math.max(1, (o.axles || 2) - 1)));
      c.beginPath();
      c.ellipse(wx, y0 - 2, L * 0.075, L * 0.055, 0, 0, Z.TAU);
      c.fill();
    }

    /* The two shapes a vehicle is made of, kept as paths rather than
       drawn inline, because the burnt-out ones need to fill them a second
       time in char. Charring used to be a fillRect over the whole
       bounding box, which is a black rectangle sitting on a car. */
    var lower = o.boxy ? H : H * 0.56;
    var cw = L * (o.cabin || 0.52), cx = x0 + L * (o.cabinAt || 0.24);

    function bodyPath() {
      c.beginPath();
      if (o.boxy) {
        c.rect(x0, y0 - D - H, L, H + D);
        return;
      }
      c.moveTo(x0, y0 - lower * 0.4);
      c.quadraticCurveTo(x0, y0 - lower, x0 + L * 0.14, y0 - lower);
      c.lineTo(x0 + L * 0.86, y0 - lower);
      c.quadraticCurveTo(x0 + L, y0 - lower, x0 + L, y0 - lower * 0.4);
      c.lineTo(x0 + L, y0 - 3);
      c.lineTo(x0, y0 - 3);
      c.closePath();
    }
    function cabinPath() {
      c.beginPath();
      c.moveTo(cx, y0 - lower);
      c.lineTo(cx + cw * 0.14, y0 - lower - H * 0.46);
      c.lineTo(cx + cw * 0.86, y0 - lower - H * 0.46);
      c.lineTo(cx + cw, y0 - lower);
      c.closePath();
    }

    /* the lower body */
    var g = c.createLinearGradient(0, y0 - H, 0, y0);
    g.addColorStop(0, Z.rgb(Z.shade(body, 0.2)));
    g.addColorStop(0.55, Z.rgb(body));
    g.addColorStop(1, Z.rgb(dark));
    c.fillStyle = g;
    bodyPath();
    c.fill();

    /* the cabin */
    if (!o.boxy) {
      c.fillStyle = Z.rgb(Z.shade(body, 0.08));
      cabinPath(); c.fill();
      /* glass, or the hole where it was */
      c.fillStyle = h(v, 3) > 0.45 ? 'rgba(18,24,28,.92)' : 'rgba(128,158,172,.5)';
      c.beginPath();
      c.moveTo(cx + cw * 0.06, y0 - lower - 2);
      c.lineTo(cx + cw * 0.18, y0 - lower - H * 0.4);
      c.lineTo(cx + cw * 0.82, y0 - lower - H * 0.4);
      c.lineTo(cx + cw * 0.94, y0 - lower - 2);
      c.closePath(); c.fill();
    } else {
      /* a box van or a wagon: windows in a row along the side */
      var wins = o.wins || 0;
      for (var i = 0; i < wins; i++) {
        var wx2 = x0 + L * (0.08 + i * (0.84 / wins));
        c.fillStyle = h(v, i) > 0.6 ? 'rgba(14,18,20,.9)' : 'rgba(120,150,164,.42)';
        c.fillRect(wx2, y0 - D - H * 0.86, L * (0.84 / wins) * 0.8, H * 0.34);
      }
    }

    /* roof things */
    if (o.lightbar) {
      c.fillStyle = 'rgba(30,32,34,.95)';
      c.fillRect(x - L * 0.14, y0 - lower - H * 0.52, L * 0.28, 4);
      c.fillStyle = 'rgba(206,56,44,.8)';
      c.fillRect(x - L * 0.13, y0 - lower - H * 0.52, L * 0.12, 3.4);
      c.fillStyle = 'rgba(64,108,196,.8)';
      c.fillRect(x + L * 0.01, y0 - lower - H * 0.52, L * 0.12, 3.4);
    }
    if (o.stripe) {
      c.fillStyle = rgba(o.stripe[0], o.stripe[1], o.stripe[2], 0.7);
      c.fillRect(x0, y0 - (o.boxy ? H * 0.5 : lower * 0.55), L, Math.max(2.4, H * 0.08));
    }

    /* the state it was left in */
    if (o.burnt) {
      /* char follows the shell: fill the same two paths again, dark, and
         keep the soot inside them */
      c.save();
      c.fillStyle = 'rgba(14,13,12,.74)';
      bodyPath(); c.fill();
      if (!o.boxy) { cabinPath(); c.fill(); }

      c.beginPath();
      if (o.boxy) c.rect(x0, y0 - D - H, L, H + D);
      else {
        bodyPath();
        c.moveTo(cx, y0 - lower);
        c.lineTo(cx + cw * 0.14, y0 - lower - H * 0.46);
        c.lineTo(cx + cw * 0.86, y0 - lower - H * 0.46);
        c.lineTo(cx + cw, y0 - lower);
        c.closePath();
      }
      c.clip();
      c.fillStyle = 'rgba(58,50,42,.5)';
      for (var s = 0; s < 6; s++) {
        c.beginPath();
        c.ellipse(x0 + h(v, s) * L, y0 - h(v, s + 9) * lower,
                  4 + h(v, s) * 7, 3, 0, 0, Z.TAU);
        c.fill();
      }
      c.restore();
    }
    /* a door left open, a bonnet up, one flat tyre - always something */
    if (h(v, 21) > 0.62 && !o.boxy) {
      c.fillStyle = Z.rgb(Z.shade(body, -0.2));
      c.beginPath();
      c.moveTo(x0 + L * 0.42, y0 - lower * 0.9);
      c.lineTo(x0 + L * 0.34, y0 - lower * 1.5);
      c.lineTo(x0 + L * 0.2, y0 - lower * 1.3);
      c.lineTo(x0 + L * 0.3, y0 - lower * 0.7);
      c.closePath(); c.fill();
    }
    c.strokeStyle = 'rgba(8,10,12,.5)';
    c.lineWidth = 1.2;
    c.stroke();
    c.lineWidth = 1;
    weather(c, x, y0, L, H, v, 6);
  }

  var CARCOL = [[86, 92, 100], [120, 60, 52], [66, 82, 96], [140, 136, 126],
                [58, 70, 62], [104, 100, 92], [44, 52, 60]];

  P.burntCar = { w: 3.0, h: 2.0, deep: 1.2, f: function (c, x, y, v) {
    vehicle(c, x, y, v, { len: 2.3, wide: 1.2, hgt: 1.3, body: [46, 42, 40], burnt: true });
    /* smoke stain on the ground under it */
    c.fillStyle = 'rgba(12,12,12,.3)';
    c.beginPath(); c.ellipse(x, y, 1.3 * PPM, 0.5 * PPM, 0, 0, Z.TAU); c.fill();
  } };

  P.policeCar = { w: 3.0, h: 2.2, deep: 1.2, f: function (c, x, y, v) {
    vehicle(c, x, y, v, { len: 2.4, wide: 1.2, hgt: 1.4,
                          body: [224, 222, 214], lightbar: true, stripe: [30, 46, 92] });
  } };

  P.ambulance = { w: 4.0, h: 3.0, deep: 2.0, f: function (c, x, y, v) {
    /* The markings used to be laid out in raw pixels - a cross six by
       eighteen at `y - 1.5 * PPM`, doors twelve by thirty-four - while
       the body they belong to is built in metres by `vehicle()`. The two
       only ever agreed at one zoom: everywhere else the cross floated
       off the side of the van and the doors hung in the air behind it.
       Everything here is measured off the same box the body is. */
    var L = 3.2 * PPM, D = 1.9 * PPM * PITCH, H = 2.1 * PPM;
    vehicle(c, x, y, v, { len: 3.2, wide: 1.9, hgt: 2.1, body: [230, 228, 220],
                          boxy: true, wins: 3, lightbar: true,
                          stripe: [190, 60, 48], axles: 2 });
    var x0 = x - L / 2, y0 = y + D / 2, top = y0 - D - H;

    /* the cross, on the flat of the box behind the cab */
    var cs = H * 0.30, cx = x0 + L * 0.60, cy = top + H * 0.46;
    c.fillStyle = 'rgba(196,58,46,.92)';
    c.fillRect(cx - cs * 0.17, cy - cs * 0.5, cs * 0.34, cs);
    c.fillRect(cx - cs * 0.5, cy - cs * 0.17, cs, cs * 0.34);
    c.strokeStyle = 'rgba(120,28,22,.5)';
    c.lineWidth = 1;
    c.strokeRect(cx - cs * 0.17, cy - cs * 0.5, cs * 0.34, cs);

    /* rear doors, shut, with the seam and handles that say they open */
    var dw = L * 0.10, dx = x0 + L - dw - 2;
    c.fillStyle = 'rgba(214,212,204,.95)';
    c.fillRect(dx, top + H * 0.14, dw, H * 0.80);
    c.fillStyle = 'rgba(28,30,32,.55)';
    c.fillRect(dx + dw * 0.48, top + H * 0.14, 1.6, H * 0.80);
    c.fillStyle = 'rgba(70,72,74,.8)';
    c.fillRect(dx + dw * 0.2, top + H * 0.5, dw * 0.22, 2.4);
    c.fillRect(dx + dw * 0.58, top + H * 0.5, dw * 0.22, 2.4);
    /* the little window in each door */
    c.fillStyle = 'rgba(96,126,142,.55)';
    c.fillRect(dx + dw * 0.1, top + H * 0.22, dw * 0.32, H * 0.2);
    c.fillRect(dx + dw * 0.56, top + H * 0.22, dw * 0.32, H * 0.2);
  } };

  P.truckWreck = { w: 5.6, h: 3.4, deep: 2.0, f: function (c, x, y, v) {
    /* A box van with `wins: 0` came out as one flat grey slab the size of
       a small building - at a glance it read as an untextured placeholder
       sitting in the road. A box body is corrugated, has a roller door on
       the end and a rubbing strip down the side; that is all it needed. */
    vehicle(c, x, y, v, { len: 4.3, wide: 1.9, hgt: 2.5, body: [96, 104, 112],
                          boxy: true, wins: 0, axles: 3 });
    var L = 4.3 * PPM, D = 1.9 * PPM * PITCH, H = 2.5 * PPM;
    var x0 = x - L / 2, y0 = y + D / 2, top = y0 - D - H;

    /* corrugations down the box */
    c.fillStyle = 'rgba(0,0,0,.13)';
    for (var r = 1; r < 22; r++) c.fillRect(x0 + L * r / 22, y0 - H, 2, H);
    /* the rubbing strip, and the frame round the body */
    c.fillStyle = 'rgba(226,222,208,.10)';
    c.fillRect(x0, top + 4, L, 3);
    c.fillStyle = 'rgba(0,0,0,.22)';
    c.fillRect(x0, y0 - H * 0.42, L, 4);
    /* the roller door at the back, half up */
    var dw = L * 0.2, dx = x0 + L * 0.76;
    c.fillStyle = 'rgba(16,18,20,.92)';
    c.fillRect(dx, y0 - H, dw, H * 0.9);
    c.fillStyle = 'rgba(118,114,106,.95)';
    c.fillRect(dx, y0 - H, dw, H * (0.3 + h(v, 5) * 0.35));
    c.strokeStyle = 'rgba(30,32,32,.5)';
    for (var sh2 = 0; sh2 < 7; sh2++) {
      c.beginPath();
      c.moveTo(dx, y0 - H + sh2 * (H * 0.09));
      c.lineTo(dx + dw, y0 - H + sh2 * (H * 0.09));
      c.stroke();
    }
    /* a cab at the other end, lower than the body */
    var cw = L * 0.26, cx = x0 + 2;
    c.fillStyle = Z.rgb(Z.mix([120, 70, 56], [70, 88, 100], h(v, 2)));
    c.fillRect(cx, y0 - H * 0.82, cw, H * 0.82);
    c.fillStyle = 'rgba(18,24,28,.9)';
    c.fillRect(cx + 3, y0 - H * 0.78, cw - 6, H * 0.3);
    c.fillStyle = 'rgba(128,158,172,.28)';
    c.fillRect(cx + 4, y0 - H * 0.76, (cw - 8) * 0.6, H * 0.24);
    /* cargo spilled out the back */
    for (var i = 0; i < 4; i++) {
      box(c, x + (1.7 + h(v, i) * 1.1) * PPM, y + h(v, i + 4) * 6,
          0.5, 0.4, 0.4, [124, 96, 58], [98, 74, 44], { posts: false, seam: false });
    }
    weather(c, x, y0, L, H, v, 10);
  } };

  P.busWreck = { w: 6.4, h: 3.6, deep: 2.0, f: function (c, x, y, v) {
    vehicle(c, x, y, v, { len: 5.4, wide: 1.9, hgt: 2.6,
                          body: h(v, 1) > 0.5 ? [186, 148, 54] : [142, 146, 150],
                          boxy: true, wins: 7, axles: 2, stripe: [60, 58, 54] });
    /* the destination blind, and a door folded open */
    c.fillStyle = 'rgba(24,26,28,.9)';
    c.fillRect(x - 2.5 * PPM, y - 2.5 * PPM, 1.1 * PPM, 0.3 * PPM);
    c.fillStyle = 'rgba(206,196,150,.3)';
    c.fillRect(x - 2.45 * PPM, y - 2.45 * PPM, 1.0 * PPM, 0.2 * PPM);
  } };

  P.railCar = { w: 7.4, h: 4.2, deep: 2.0, f: function (c, x, y, v) {
    var b = box(c, x, y, 6.2, 1.9, 2.6,
                [96, 76, 62], h(v, 1) > 0.5 ? [118, 72, 54] : [86, 94, 86], { line: true });
    /* ribs and a sliding door */
    c.fillStyle = 'rgba(0,0,0,.18)';
    for (var i = 1; i < 10; i++) c.fillRect(b.x0 + b.W * i / 10, b.yF, 3, b.H);
    c.fillStyle = 'rgba(20,22,24,.7)';
    c.fillRect(b.x0 + b.W * 0.4, b.yF + b.H * 0.16, b.W * 0.24, b.H * 0.7);
    /* bogies */
    c.fillStyle = 'rgba(26,26,28,.95)';
    c.fillRect(b.x0 + b.W * 0.1, b.y0 - 6, b.W * 0.16, 8);
    c.fillRect(b.x0 + b.W * 0.74, b.y0 - 6, b.W * 0.16, 8);
    weather(c, x, y, b.W, b.H, v, 10);
  } };

  /* ------------------------------------------------------------------ *
   * Kerbside
   * ------------------------------------------------------------------ */
  P.powerPole = { w: 2.6, h: 7.0, f: function (c, x, y, v) {
    post(c, x, y, 0.16 * PPM, 6.0 * PPM, [104, 82, 56]);
    /* crossarms with insulators */
    for (var a = 0; a < 2; a++) {
      var ay = y - PPM * (5.2 - a * 0.7);
      c.fillStyle = 'rgba(92,72,48,.95)';
      c.fillRect(x - 0.9 * PPM, ay, 1.8 * PPM, 4);
      for (var i = 0; i < 3; i++) {
        c.fillStyle = 'rgba(160,170,176,.7)';
        c.fillRect(x - 0.78 * PPM + i * 0.72 * PPM, ay - 5, 4, 5);
      }
    }
    /* the wires, sagging away on both sides and one of them down */
    c.strokeStyle = 'rgba(28,30,32,.55)';
    c.lineWidth = 1.4;
    for (var w = 0; w < 3; w++) {
      var wy = y - PPM * (5.2 - (w % 2) * 0.7);
      c.beginPath();
      c.moveTo(x - 0.78 * PPM + w * 0.72 * PPM, wy - 3);
      c.quadraticCurveTo(x - 2.2 * PPM, wy + 14, x - 3.4 * PPM, wy + 4);
      c.stroke();
    }
    c.lineWidth = 1;
    weather(c, x, y, 0.4 * PPM, 6 * PPM, v, 4);
  } };

  P.fallenPole = { w: 4.0, h: 1.6, deep: 1.0, f: function (c, x, y, v) {
    c.save();
    c.translate(x, y - 6);
    c.rotate(-0.06);
    c.fillStyle = 'rgba(104,82,56,.95)';
    c.fillRect(-1.7 * PPM, -8, 3.4 * PPM, 12);
    c.fillStyle = 'rgba(255,250,240,.1)';
    c.fillRect(-1.7 * PPM, -8, 3.4 * PPM, 3);
    /* the broken end, splintered */
    c.fillStyle = 'rgba(146,118,78,.9)';
    c.beginPath();
    c.moveTo(1.7 * PPM, -8); c.lineTo(1.9 * PPM, -3);
    c.lineTo(1.7 * PPM, 4); c.closePath(); c.fill();
    c.restore();
    /* wire tangled round it */
    c.strokeStyle = 'rgba(28,30,32,.6)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(x - 1.6 * PPM, y - 8);
    c.bezierCurveTo(x - 0.4 * PPM, y - 22, x + 0.6 * PPM, y + 4, x + 1.7 * PPM, y - 10);
    c.stroke();
    c.lineWidth = 1;
  } };

  P.trafficLight = { w: 1.6, h: 4.6, f: function (c, x, y, v) {
    post(c, x, y, 0.12 * PPM, 3.6 * PPM, [58, 62, 60]);
    var hy = y - 3.6 * PPM;
    c.fillStyle = 'rgba(40,44,42,.96)';
    c.fillRect(x - 0.15 * PPM, hy, 0.3 * PPM, 0.9 * PPM);
    var cols = ['rgba(120,36,28,.8)', 'rgba(128,104,36,.8)', 'rgba(36,104,52,.8)'];
    for (var i = 0; i < 3; i++) {
      c.fillStyle = cols[i];
      c.beginPath();
      c.arc(x, hy + 0.17 * PPM + i * 0.28 * PPM, 0.08 * PPM, 0, Z.TAU);
      c.fill();
    }
    /* hanging off its bracket, because nothing here still works */
    if (h(v, 1) > 0.55) {
      c.strokeStyle = 'rgba(40,44,42,.9)';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, hy + 4); c.lineTo(x + 0.5 * PPM, hy - 4); c.stroke();
      c.lineWidth = 1;
    }
    weather(c, x, y, 0.4 * PPM, 3.6 * PPM, v, 3);
  } };

  P.roadSign = { w: 1.6, h: 3.0, f: function (c, x, y, v) {
    post(c, x, y, 0.07 * PPM, 2.3 * PPM, [136, 134, 126]);
    var sy = y - 2.3 * PPM, r = h(v, 1);
    c.save();
    c.translate(x, sy);
    c.rotate((h(v, 2) - 0.5) * 0.4);
    if (r < 0.34) {
      c.fillStyle = 'rgba(178,52,44,.85)';
      c.beginPath(); c.arc(0, 0.28 * PPM, 0.26 * PPM, 0, Z.TAU); c.fill();
      c.fillStyle = 'rgba(226,222,210,.8)';
      c.fillRect(-0.16 * PPM, 0.22 * PPM, 0.32 * PPM, 0.1 * PPM);
    } else if (r < 0.7) {
      c.fillStyle = 'rgba(60,88,58,.85)';
      c.fillRect(-0.34 * PPM, 0.08 * PPM, 0.68 * PPM, 0.4 * PPM);
      c.fillStyle = 'rgba(226,222,210,.5)';
      c.fillRect(-0.28 * PPM, 0.18 * PPM, 0.42 * PPM, 0.05 * PPM);
      c.fillRect(-0.28 * PPM, 0.3 * PPM, 0.3 * PPM, 0.05 * PPM);
    } else {
      c.fillStyle = 'rgba(196,166,52,.85)';
      c.beginPath();
      c.moveTo(0, 0.05 * PPM); c.lineTo(0.3 * PPM, 0.5 * PPM);
      c.lineTo(-0.3 * PPM, 0.5 * PPM); c.closePath(); c.fill();
      c.fillStyle = 'rgba(30,28,26,.8)';
      c.fillRect(-0.02 * PPM, 0.24 * PPM, 0.05 * PPM, 0.16 * PPM);
    }
    c.restore();
  } };

  P.hydrant = { w: 1.0, h: 1.2, f: function (c, x, y, v) {
    cyl(c, x, y, 0.13, 0.62, [168, 62, 46], [186, 84, 60]);
    c.fillStyle = 'rgba(146,50, 38,.95)';
    c.fillRect(x - 0.21 * PPM, y - 0.42 * PPM, 0.42 * PPM, 0.1 * PPM);
    c.fillStyle = 'rgba(190,90,66,.95)';
    c.beginPath(); c.arc(x, y - 0.66 * PPM, 0.1 * PPM, 0, Z.TAU); c.fill();
    weather(c, x, y, 0.4 * PPM, 0.6 * PPM, v, 3);
  } };

  P.bench = { w: 2.4, h: 1.2, deep: 0.8, f: function (c, x, y, v) {
    var b = box(c, x, y, 1.7, 0.5, 0.42, [122, 96, 62], [96, 74, 46],
                { posts: false, seam: false });
    /* slatted back */
    for (var i = 0; i < 3; i++) {
      c.fillStyle = i % 2 ? 'rgba(122,96,62,.95)' : 'rgba(104,82,52,.95)';
      c.fillRect(b.x0, b.yF - 0.38 * PPM + i * 0.13 * PPM, b.W, 0.09 * PPM);
    }
    c.fillStyle = 'rgba(58,60,58,.9)';
    c.fillRect(b.x0 + 2, b.yF - 0.4 * PPM, 3, 0.8 * PPM);
    c.fillRect(b.x1 - 5, b.yF - 0.4 * PPM, 3, 0.8 * PPM);
    weather(c, x, y, b.W, b.H, v, 4);
  } };

  P.bin = { w: 1.0, h: 1.3, f: function (c, x, y, v) {
    var tipped = h(v, 1) > 0.6;
    if (tipped) {
      c.save(); c.translate(x, y - 4); c.rotate(1.3);
      cyl(c, 0, 0, 0.22, 0.7, [72, 82, 70], [58, 66, 58]);
      c.restore();
      /* what came out of it */
      for (var i = 0; i < 5; i++) {
        c.fillStyle = i % 2 ? 'rgba(150,142,124,.7)' : 'rgba(96,90,78,.7)';
        c.beginPath();
        c.ellipse(x + (h(v, i) - 0.3) * 24, y - h(v, i + 3) * 5, 3.4, 2.2, 0, 0, Z.TAU);
        c.fill();
      }
    } else {
      cyl(c, x, y, 0.22, 0.78, [72, 82, 70], [58, 66, 58]);
      c.fillStyle = 'rgba(30,34,32,.8)';
      c.beginPath(); c.ellipse(x, y - 0.78 * PPM, 0.16 * PPM, 0.09 * PPM, 0, 0, Z.TAU); c.fill();
    }
  } };

  P.busShelter = { w: 3.4, h: 3.0, deep: 1.2, f: function (c, x, y, v) {
    var W = 2.8 * PPM, H = 2.2 * PPM;
    var x0 = x - W / 2;
    /* glass back, mostly gone */
    c.fillStyle = 'rgba(140,166,180,.22)';
    c.fillRect(x0, y - H, W, H);
    if (h(v, 1) > 0.4) {
      c.fillStyle = 'rgba(10,12,14,.45)';
      c.beginPath();
      c.moveTo(x0 + W * 0.3, y - H);
      c.lineTo(x0 + W * 0.75, y - H * 0.4);
      c.lineTo(x0 + W * 0.35, y);
      c.lineTo(x0 + W * 0.18, y - H * 0.5);
      c.closePath(); c.fill();
    }
    /* frame */
    c.fillStyle = 'rgba(64,68,70,.95)';
    c.fillRect(x0 - 3, y - H - 5, W + 6, 6);
    c.fillRect(x0 - 3, y - H, 4, H);
    c.fillRect(x0 + W - 1, y - H, 4, H);
    /* the bench inside and the ad panel at one end */
    c.fillStyle = 'rgba(92,90,84,.9)';
    c.fillRect(x0 + 6, y - H * 0.34, W - 12, 5);
    c.fillStyle = 'rgba(126,110,94,.5)';
    c.fillRect(x0 + W - 1, y - H * 0.9, 4, H * 0.7);
    weather(c, x, y, W, H, v, 5);
  } };

  P.vending = { w: 1.2, h: 2.2, f: function (c, x, y, v) {
    var b = box(c, x, y, 0.72, 0.42, 1.7,
                [70, 78, 84], h(v, 1) > 0.5 ? [150, 56, 48] : [52, 86, 120],
                { posts: false });
    /* the window, and the racks behind it, mostly empty */
    c.fillStyle = 'rgba(14,18,22,.85)';
    c.fillRect(b.x0 + 5, b.yF + 6, b.W - 16, b.H * 0.62);
    for (var r = 0; r < 4; r++) {
      for (var i = 0; i < 3; i++) {
        if (h(v, r * 5 + i) < 0.55) continue;
        c.fillStyle = 'rgba(180,170,140,.5)';
        c.fillRect(b.x0 + 8 + i * (b.W - 22) / 3, b.yF + 9 + r * b.H * 0.14, 5, 7);
      }
    }
    c.fillStyle = 'rgba(226,222,206,.14)';
    c.fillRect(b.x0 + 5, b.yF + 6, b.W - 16, 3);
    weather(c, x, y, b.W, b.H, v, 4);
  } };

  P.planter = { w: 1.6, h: 1.4, deep: 0.9, f: function (c, x, y, v) {
    var b = box(c, x, y, 1.1, 0.8, 0.5, [122, 118, 108], [104, 100, 92],
                { posts: false, seam: false });
    /* Cast concrete, weathered: a lip round the top, aggregate showing
       through where the face has spalled, and a tide line at the bottom
       where the rain has been running off it for years. */
    c.fillStyle = 'rgba(255,250,236,.12)';
    c.fillRect(b.x0, b.yF, b.W, 3);
    c.fillStyle = 'rgba(0,0,0,.16)';
    c.fillRect(b.x0, b.yF + 3, b.W, 1.6);
    for (var ag = 0; ag < 16; ag++) {
      var gx = b.x0 + 3 + h(v, ag * 7) * (b.W - 6);
      var gy = b.yF + 5 + h(v, ag * 11) * (b.H - 8);
      c.fillStyle = h(v, ag) > 0.5 ? 'rgba(0,0,0,.13)' : 'rgba(255,250,236,.10)';
      c.fillRect(gx, gy, 1.6 + h(v, ag * 3) * 2, 1.4);
    }
    c.fillStyle = 'rgba(58,54,44,.22)';
    c.fillRect(b.x0, b.yF + b.H * 0.72, b.W, b.H * 0.28);
    /* a crack down one end, and the moss that found it */
    c.strokeStyle = 'rgba(46,44,38,.4)';
    c.beginPath();
    c.moveTo(b.x0 + b.W * 0.22, b.yF + 4);
    c.lineTo(b.x0 + b.W * 0.26, b.yF + b.H * 0.5);
    c.lineTo(b.x0 + b.W * 0.20, b.yF + b.H);
    c.stroke();
    c.fillStyle = 'rgba(78,104,58,.28)';
    c.fillRect(b.x0 + b.W * 0.17, b.yF + b.H * 0.78, 9, b.H * 0.22);

    /* what is growing out of it now */
    c.fillStyle = 'rgba(44,38,28,.9)';
    c.fillRect(b.x0 + 3, b.yB + 2, b.W - 6, b.D - 3);
    /* the soil is mounded, not a flat brown rectangle */
    c.fillStyle = 'rgba(62,52,38,.8)';
    c.beginPath();
    c.ellipse(x, b.yB + b.D * 0.5, b.W * 0.40, b.D * 0.34, 0, 0, Z.TAU); c.fill();
    for (var i = 0; i < 14; i++) {
      var gx = b.x0 + 4 + h(v, i * 3) * (b.W - 8);
      var gy = b.yB + 3 + h(v, i * 5) * (b.D - 5);
      var tall = 6 + h(v, i) * 16;
      c.strokeStyle = i % 3 ? 'rgba(96,116,58,.75)' : 'rgba(64,84,44,.75)';
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(gx, gy);
      c.quadraticCurveTo(gx + 3, gy - tall * 0.6, gx + (h(v, i) - 0.5) * 9, gy - tall);
      c.stroke();
    }
    /* a woody little shrub that has taken the whole box over */
    var sx = x + (h(v, 2) - 0.5) * b.W * 0.3;
    var sy = b.yB + b.D * 0.5;
    c.fillStyle = 'rgba(64,88,50,.85)';
    for (var lb = 0; lb < 4; lb++) {
      var la = (lb / 4) * Math.PI * 2 + v * 3;
      c.beginPath();
      c.ellipse(sx + Math.cos(la) * 7, sy - 12 + Math.sin(la) * 4,
                8 + h(v, lb) * 3, 6 + h(v, lb * 2) * 2, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = 'rgba(122,156,86,.45)';
    c.beginPath();
    c.ellipse(sx - 4, sy - 16, 7, 4.6, 0, 0, Math.PI * 2); c.fill();
    /* weeds spilling over the front lip, which is what says neglected */
    c.strokeStyle = 'rgba(96,112,62,.7)';
    c.lineWidth = 1.4;
    for (var wd = 0; wd < 5; wd++) {
      var wx = b.x0 + 8 + h(v, wd * 13) * (b.W - 16);
      c.beginPath();
      c.moveTo(wx, b.yF + 2);
      c.quadraticCurveTo(wx + 2, b.yF + 10, wx + (h(v, wd) - 0.5) * 12,
                         b.yF + 8 + h(v, wd * 5) * 14);
      c.stroke();
    }
    c.lineWidth = 1;
  } };

  P.streetTree = { w: 2.4, h: 5.0, f: function (c, x, y, v) {
    /* a tree in a grate, pollarded, thin - a street tree, not a forest
       one: that difference is worth drawing */
    c.fillStyle = 'rgba(48,46,42,.9)';
    c.beginPath(); c.ellipse(x, y, 0.4 * PPM, 0.2 * PPM, 0, 0, Z.TAU); c.fill();
    c.fillStyle = 'rgba(86,68,48,.95)';
    c.fillRect(x - 0.07 * PPM, y - 2.2 * PPM, 0.14 * PPM, 2.2 * PPM);
    c.strokeStyle = 'rgba(86,68,48,.9)';
    c.lineWidth = 2.4;
    for (var i = 0; i < 4; i++) {
      var a = -Math.PI / 2 + (i - 1.5) * 0.5;
      c.beginPath();
      c.moveTo(x, y - 2.1 * PPM);
      c.lineTo(x + Math.cos(a) * 0.7 * PPM, y - 2.1 * PPM + Math.sin(a) * 0.7 * PPM);
      c.stroke();
    }
    c.lineWidth = 1;
    var lush = h(v, 1);
    for (var j = 0; j < 26; j++) {
      var a2 = h(v, j * 3) * Z.TAU, rr = h(v, j * 5) * 0.8 * PPM;
      c.fillStyle = j % 3 ? 'rgba(74,96,48,.7)' : 'rgba(96,118,58,.6)';
      c.beginPath();
      c.ellipse(x + Math.cos(a2) * rr, y - 2.5 * PPM + Math.sin(a2) * rr * 0.8,
                5 + lush * 4, 4 + lush * 3, 0, 0, Z.TAU);
      c.fill();
    }
    /* a guard round the trunk */
    c.strokeStyle = 'rgba(70,72,70,.6)';
    c.lineWidth = 1.4;
    c.strokeRect(x - 0.16 * PPM, y - 0.7 * PPM, 0.32 * PPM, 0.7 * PPM);
    c.lineWidth = 1;
  } };

  P.bollard = { w: 0.7, h: 1.1, f: function (c, x, y, v) {
    cyl(c, x, y, 0.09, 0.72, [72, 74, 72], [96, 98, 94]);
    c.fillStyle = 'rgba(214,202,150,.5)';
    c.fillRect(x - 0.09 * PPM, y - 0.58 * PPM, 0.18 * PPM, 4);
  } };

  /* ------------------------------------------------------------------ *
   * Yards and industry
   * ------------------------------------------------------------------ */
  P.container = { w: 5.0, h: 4.0, deep: 2.0, f: function (c, x, y, v) {
    var cols = [[146, 84, 52], [60, 92, 116], [72, 104, 78], [150, 142, 126], [128, 66, 62]];
    var col = cols[Math.floor(h(v, 1) * cols.length) % cols.length];
    var b = box(c, x, y, 4.0, 1.9, 2.4, Z.shade(col, 0.1), col, { line: true });
    /* corrugations and the door end */
    c.fillStyle = 'rgba(0,0,0,.16)';
    for (var i = 1; i < 22; i++) c.fillRect(b.x0 + b.W * i / 22, b.yF, 2.4, b.H);
    c.fillStyle = 'rgba(0,0,0,.2)';
    c.fillRect(b.x1 - b.W * 0.1, b.yF, b.W * 0.1, b.H);
    c.fillStyle = 'rgba(226,222,206,.14)';
    c.fillRect(b.x0, b.yF + 3, b.W, 2);
    c.fillRect(b.x0, b.y0 - 5, b.W, 2);
    weather(c, x, y, b.W, b.H, v, 12);
  } };

  P.palletStack = { w: 2.4, h: 1.8, deep: 1.6, f: function (c, x, y, v) {
    var n = 2 + Math.floor(h(v, 1) * 4);
    for (var i = 0; i < n; i++) {
      var off = (h(v, i * 3) - 0.5) * 6;
      box(c, x + off, y - i * 0.18 * PPM, 1.3, 1.1, 0.16,
          [134, 106, 66], [104, 80, 48], { posts: false, seam: false, line: i === n - 1 });
    }
    /* slats on the top one */
    c.fillStyle = 'rgba(0,0,0,.2)';
    for (var s = 0; s < 5; s++) {
      c.fillRect(x - 0.6 * PPM, y - n * 0.18 * PPM - 0.1 * PPM + s * 4, 1.2 * PPM, 1.6);
    }
  } };

  P.drum = { w: 1.0, h: 1.5, f: function (c, x, y, v) {
    var cols = [[126, 82, 40], [70, 88, 84], [140, 130, 60], [90, 94, 98]];
    var col = cols[Math.floor(h(v, 1) * 4) % 4];
    if (h(v, 2) > 0.7) {
      /* on its side, leaking */
      c.save(); c.translate(x, y - 8); c.rotate(1.57);
      cyl(c, 0, 0, 0.28, 0.9, col, Z.shade(col, 0.2));
      c.restore();
      c.fillStyle = 'rgba(38,34,26,.45)';
      c.beginPath(); c.ellipse(x + 16, y + 2, 15, 6, 0, 0, Z.TAU); c.fill();
    } else {
      cyl(c, x, y, 0.28, 0.92, col, Z.shade(col, 0.2));
      c.fillStyle = 'rgba(0,0,0,.22)';
      c.fillRect(x - 0.28 * PPM, y - 0.62 * PPM, 0.56 * PPM, 4);
      c.fillRect(x - 0.28 * PPM, y - 0.3 * PPM, 0.56 * PPM, 4);
      /* hazard diamond */
      c.fillStyle = 'rgba(214,196,60,.5)';
      c.save(); c.translate(x, y - 0.46 * PPM); c.rotate(0.78);
      c.fillRect(-5, -5, 10, 10); c.restore();
    }
    weather(c, x, y, 0.6 * PPM, 0.9 * PPM, v, 5);
  } };

  P.dumpster = { w: 3.4, h: 2.0, deep: 1.6, f: function (c, x, y, v) {
    var col = h(v, 1) > 0.5 ? [72, 96, 78] : [122, 96, 58];
    var b = box(c, x, y, 2.5, 1.5, 1.1, Z.shade(col, 0.12), col, { seam: false });
    /* sloped lid, one half thrown back */
    c.fillStyle = Z.rgb(Z.shade(col, -0.3));
    c.fillRect(b.x0 - 2, b.yF - 4, b.W * 0.55, 5);
    c.save();
    c.translate(b.x0 + b.W * 0.8, b.yF - 2);
    c.rotate(-0.5);
    c.fillStyle = Z.rgb(Z.shade(col, -0.2));
    c.fillRect(-b.W * 0.2, -4, b.W * 0.45, 5);
    c.restore();
    /* what is spilling over the edge */
    for (var i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? 'rgba(148,140,122,.7)' : 'rgba(92,86,74,.7)';
      c.beginPath();
      c.ellipse(b.x0 + b.W * (0.55 + h(v, i) * 0.4), b.yF - 2 + h(v, i + 3) * 4,
                4, 3, 0, 0, Z.TAU);
      c.fill();
    }
    weather(c, x, y, b.W, b.H, v, 8);
  } };

  P.shed = { w: 2.6, h: 2.8, deep: 1.8, f: function (c, x, y, v) {
    var b = box(c, x, y, 1.9, 1.7, 1.5, [104, 84, 56], [124, 100, 66], { seam: false });
    /* boards, a door and a small window */
    c.fillStyle = 'rgba(0,0,0,.13)';
    for (var i = 1; i < 9; i++) c.fillRect(b.x0 + b.W * i / 9, b.yF, 1.4, b.H);
    c.fillStyle = 'rgba(20,20,18,.8)';
    c.fillRect(b.x0 + b.W * 0.12, b.y0 - b.H * 0.78, b.W * 0.3, b.H * 0.78);
    c.fillStyle = 'rgba(128,150,160,.4)';
    c.fillRect(b.x0 + b.W * 0.58, b.y0 - b.H * 0.7, b.W * 0.24, b.H * 0.3);
    K.hipRoof(c, x, b.yF, 2.1, 1.7, 0.4, [86, 72, 52]);
    weather(c, x, y, b.W, b.H, v, 6);
  } };

  P.washingLine = { w: 3.6, h: 2.4, f: function (c, x, y, v) {
    for (var s = -1; s <= 1; s += 2) {
      c.fillStyle = 'rgba(112,106,92,.9)';
      c.fillRect(x + s * 1.4 * PPM - 2, y - 1.8 * PPM, 4, 1.8 * PPM);
      c.fillRect(x + s * 1.4 * PPM - 0.24 * PPM, y - 1.8 * PPM, 0.48 * PPM, 3);
    }
    c.strokeStyle = 'rgba(180,176,160,.5)';
    c.beginPath();
    c.moveTo(x - 1.4 * PPM, y - 1.76 * PPM);
    c.quadraticCurveTo(x, y - 1.5 * PPM, x + 1.4 * PPM, y - 1.76 * PPM);
    c.stroke();
    /* what is still pegged to it, grey and stiff */
    for (var i = 0; i < 4; i++) {
      var t = (i + 0.6) / 5;
      var lx = x - 1.4 * PPM + t * 2.8 * PPM;
      var ly = y - 1.76 * PPM + Math.sin(t * Math.PI) * 0.26 * PPM;
      c.fillStyle = ['rgba(172,166,150,.7)', 'rgba(124,130,132,.7)',
                     'rgba(150,132,122,.7)'][i % 3];
      c.fillRect(lx - 7, ly, 14, 20 + h(v, i) * 12);
    }
  } };

  P.shoppingCart = { w: 1.2, h: 1.3, f: function (c, x, y, v) {
    c.save();
    if (h(v, 1) > 0.6) { c.translate(x, y - 6); c.rotate(1.2); c.translate(-x, -y + 6); }
    c.strokeStyle = 'rgba(176,180,182,.8)';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x - 0.24 * PPM, y - 0.62 * PPM);
    c.lineTo(x + 0.24 * PPM, y - 0.62 * PPM);
    c.lineTo(x + 0.2 * PPM, y - 0.2 * PPM);
    c.lineTo(x - 0.2 * PPM, y - 0.2 * PPM);
    c.closePath(); c.stroke();
    for (var i = 1; i < 4; i++) {
      c.beginPath();
      c.moveTo(x - 0.24 * PPM + i * 0.12 * PPM, y - 0.62 * PPM);
      c.lineTo(x - 0.2 * PPM + i * 0.1 * PPM, y - 0.2 * PPM);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(x - 0.24 * PPM, y - 0.62 * PPM);
    c.lineTo(x - 0.3 * PPM, y - 0.86 * PPM);
    c.stroke();
    c.lineWidth = 1;
    c.fillStyle = 'rgba(24,24,26,.9)';
    c.beginPath(); c.arc(x - 0.16 * PPM, y - 0.14 * PPM, 3, 0, Z.TAU); c.fill();
    c.beginPath(); c.arc(x + 0.16 * PPM, y - 0.14 * PPM, 3, 0, Z.TAU); c.fill();
    c.restore();
  } };

  /* ------------------------------------------------------------------ *
   * Building site
   * ------------------------------------------------------------------ */
  P.scaffold = { w: 3.6, h: 5.6, deep: 1.6, f: function (c, x, y, v) {
    var W = 2.6 * PPM, H = 4.4 * PPM, x0 = x - W / 2;
    c.strokeStyle = 'rgba(148,144,132,.85)';
    c.lineWidth = 2.6;
    for (var i = 0; i < 4; i++) {
      var px = x0 + W * (i / 3);
      c.beginPath(); c.moveTo(px, y); c.lineTo(px, y - H); c.stroke();
    }
    for (var lv = 1; lv <= 3; lv++) {
      var ly = y - H * (lv / 3.4);
      c.beginPath(); c.moveTo(x0, ly); c.lineTo(x0 + W, ly); c.stroke();
      /* boards on the lifts */
      c.fillStyle = 'rgba(132,106,68,.8)';
      c.fillRect(x0, ly - 4, W, 4);
    }
    /* diagonal braces */
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x0, y); c.lineTo(x0 + W, y - H * 0.6);
    c.moveTo(x0 + W, y); c.lineTo(x0, y - H * 0.6);
    c.stroke();
    c.lineWidth = 1;
    /* torn sheeting hanging off one side */
    c.fillStyle = 'rgba(160,166,158,.28)';
    c.beginPath();
    c.moveTo(x0 + W * 0.6, y - H);
    c.lineTo(x0 + W, y - H);
    c.lineTo(x0 + W, y - H * 0.2);
    c.quadraticCurveTo(x0 + W * 0.7, y - H * 0.4, x0 + W * 0.6, y - H * 0.7);
    c.closePath(); c.fill();
  } };

  P.sandPile = { w: 2.6, h: 1.6, deep: 1.6, f: function (c, x, y, v) {
    var col = h(v, 1) > 0.5 ? [148, 132, 98] : [122, 118, 110];
    c.fillStyle = Z.rgb(Z.shade(col, -0.2));
    c.beginPath();
    c.moveTo(x - 1.1 * PPM, y);
    c.quadraticCurveTo(x, y - 1.0 * PPM, x + 1.1 * PPM, y);
    c.closePath(); c.fill();
    c.fillStyle = Z.rgb(Z.shade(col, 0.16));
    c.beginPath();
    c.moveTo(x - 1.1 * PPM, y);
    c.quadraticCurveTo(x - 0.2 * PPM, y - 0.9 * PPM, x + 0.2 * PPM, y - 0.62 * PPM);
    c.quadraticCurveTo(x - 0.1 * PPM, y - 0.2 * PPM, x - 1.1 * PPM, y);
    c.closePath(); c.fill();
    for (var i = 0; i < 12; i++) {
      c.fillStyle = 'rgba(0,0,0,.12)';
      c.beginPath();
      c.ellipse(x + (h(v, i * 3) - 0.5) * 1.8 * PPM, y - h(v, i * 5) * 0.5 * PPM,
                2.4, 1.6, 0, 0, Z.TAU);
      c.fill();
    }
  } };

  P.pipeStack = { w: 3.4, h: 1.8, deep: 1.6, f: function (c, x, y, v) {
    var r = 0.28 * PPM;
    for (var row = 0; row < 2; row++) {
      var n = 4 - row;
      for (var i = 0; i < n; i++) {
        var px = x - (n - 1) * r + i * r * 2 + (row ? r : 0);
        var py = y - r - row * r * 1.7;
        c.fillStyle = 'rgba(126,122,112,.95)';
        c.beginPath(); c.arc(px, py, r, 0, Z.TAU); c.fill();
        c.fillStyle = 'rgba(38,40,40,.9)';
        c.beginPath(); c.arc(px, py, r * 0.62, 0, Z.TAU); c.fill();
        c.strokeStyle = 'rgba(6,8,10,.5)';
        c.beginPath(); c.arc(px, py, r, 0, Z.TAU); c.stroke();
      }
    }
    /* chocks so it does not roll */
    c.fillStyle = 'rgba(96,74,48,.9)';
    c.fillRect(x - 1.5 * PPM, y - 6, 12, 6);
    c.fillRect(x + 1.2 * PPM, y - 6, 12, 6);
  } };

  P.digger = { w: 4.6, h: 4.0, deep: 1.8, f: function (c, x, y, v) {
    /* tracks */
    c.fillStyle = 'rgba(32,32,34,.95)';
    c.fillRect(x - 1.3 * PPM, y - 0.4 * PPM, 2.6 * PPM, 0.4 * PPM);
    c.fillStyle = 'rgba(58,58,60,.9)';
    for (var i = 0; i < 9; i++) c.fillRect(x - 1.25 * PPM + i * 0.29 * PPM, y - 0.4 * PPM, 6, 0.4 * PPM);
    /* body and cab, in the yellow that has not quite gone */
    var b = box(c, x, y - 0.4 * PPM, 1.7, 1.2, 0.8, [176, 148, 46], [156, 128, 38],
                { posts: false, seam: false });
    c.fillStyle = 'rgba(150,124, 36,.95)';
    c.fillRect(b.x0 + b.W * 0.1, b.yF - 0.7 * PPM, b.W * 0.5, 0.7 * PPM);
    c.fillStyle = 'rgba(20,26,30,.8)';
    c.fillRect(b.x0 + b.W * 0.14, b.yF - 0.62 * PPM, b.W * 0.42, 0.4 * PPM);
    /* the arm, folded down */
    c.strokeStyle = 'rgba(166,138,42,.95)';
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(b.x0 + b.W * 0.7, b.yF - 0.2 * PPM);
    c.lineTo(b.x0 + b.W * 1.3, b.yF - 0.7 * PPM);
    c.lineTo(b.x0 + b.W * 1.6, b.yF + 0.4 * PPM);
    c.stroke();
    c.lineWidth = 1;
    c.fillStyle = 'rgba(88,84,78,.95)';
    c.beginPath();
    c.moveTo(b.x0 + b.W * 1.52, b.yF + 0.36 * PPM);
    c.lineTo(b.x0 + b.W * 1.78, b.yF + 0.5 * PPM);
    c.lineTo(b.x0 + b.W * 1.6, b.yF + 0.76 * PPM);
    c.closePath(); c.fill();
    weather(c, x, y, 2.6 * PPM, 1.6 * PPM, v, 8);
  } };

  P.portaloo = { w: 1.4, h: 2.6, deep: 1.0, f: function (c, x, y, v) {
    var lean = h(v, 1) > 0.7;
    c.save();
    if (lean) { c.translate(x, y); c.rotate(0.14); c.translate(-x, -y); }
    var b = box(c, x, y, 0.9, 0.9, 2.0,
                [96, 140, 120], [78, 122, 104], { seam: false });
    c.fillStyle = 'rgba(0,0,0,.2)';
    c.fillRect(b.x0 + b.W * 0.08, b.yF + 4, b.W * 0.84, b.H - 8);
    c.fillStyle = Z.rgb([86, 130, 112]);
    c.fillRect(b.x0 + b.W * 0.12, b.yF + 6, b.W * 0.76, b.H - 12);
    c.fillStyle = 'rgba(140,170,158,.5)';
    c.fillRect(b.x0 + b.W * 0.3, b.yF + 10, b.W * 0.4, b.H * 0.16);
    c.restore();
  } };

  /* ------------------------------------------------------------------ *
   * The cordon
   * ------------------------------------------------------------------ */
  P.barricade = { w: 2.6, h: 1.6, deep: 0.8, f: function (c, x, y, v) {
    var W = 1.9 * PPM;
    c.save();
    c.translate(x, y);
    c.rotate((h(v, 1) - 0.5) * 0.5);
    /* the A-frame legs */
    c.strokeStyle = 'rgba(150,146,134,.9)';
    c.lineWidth = 3.4;
    for (var s = -1; s <= 1; s += 2) {
      c.beginPath();
      c.moveTo(s * W * 0.34, 0); c.lineTo(s * W * 0.26, -0.7 * PPM); c.stroke();
    }
    c.lineWidth = 1;
    /* the board, striped */
    for (var i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? 'rgba(196,72,52,.9)' : 'rgba(226,222,208,.9)';
      c.save();
      c.translate(-W / 2 + i * W / 6, -0.78 * PPM);
      c.transform(1, 0, -0.34, 1, 0, 0);
      c.fillRect(0, 0, W / 6 + 1, 0.26 * PPM);
      c.restore();
    }
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.fillRect(-W / 2, -0.52 * PPM, W, 3);
    c.restore();
    weather(c, x, y, W, 0.8 * PPM, v, 4);
  } };

  P.sandbagWall = { w: 3.4, h: 1.6, deep: 1.0, f: function (c, x, y, v) {
    var rows = 4, perRow = 7, bw = 0.42 * PPM, bh = 0.2 * PPM;
    for (var r = rows - 1; r >= 0; r--) {
      var off = (r % 2) * bw * 0.5;
      for (var i = 0; i < perRow - (r % 2); i++) {
        var bx = x - (perRow * bw) / 2 + off + i * bw;
        var by = y - (r + 1) * bh * 0.92;
        var tone = 0.9 + h(v, r * 11 + i) * 0.3;
        c.fillStyle = Z.rgb(Z.shade([132, 122, 96], (tone - 1) * 0.7));
        c.beginPath();
        c.ellipse(bx + bw / 2, by + bh / 2, bw * 0.54, bh * 0.66, 0, 0, Z.TAU);
        c.fill();
        c.strokeStyle = 'rgba(40,36,28,.4)';
        c.stroke();
      }
    }
    weather(c, x, y, perRow * bw, rows * bh, v, 6);
  } };

  P.checkpoint = { w: 3.6, h: 3.2, deep: 1.8, f: function (c, x, y, v) {
    /* a hut, a boom and a floodlight: what was meant to hold the line */
    var b = box(c, x - 0.5 * PPM, y, 1.2, 1.2, 1.9, [92, 100, 88], [76, 84, 72],
                { seam: false });
    c.fillStyle = 'rgba(14,18,18,.85)';
    c.fillRect(b.x0 + 5, b.yF + 6, b.W - 10, b.H * 0.4);
    c.fillStyle = 'rgba(128,150,150,.35)';
    c.fillRect(b.x0 + 7, b.yF + 8, b.W - 14, b.H * 0.34);
    /* the boom, up */
    c.save();
    c.translate(x + 0.4 * PPM, y - 0.9 * PPM);
    c.rotate(-0.9);
    for (var i = 0; i < 5; i++) {
      c.fillStyle = i % 2 ? 'rgba(196,72,52,.9)' : 'rgba(226,222,208,.9)';
      c.fillRect(i * 0.34 * PPM, -4, 0.34 * PPM, 7);
    }
    c.restore();
    c.fillStyle = 'rgba(70,72,68,.95)';
    c.fillRect(x + 0.36 * PPM, y - 0.95 * PPM, 8, 0.95 * PPM);
    /* floodlight on a stand */
    c.fillStyle = 'rgba(60,62,60,.95)';
    c.fillRect(x - 1.3 * PPM, y - 2.4 * PPM, 4, 2.4 * PPM);
    c.fillStyle = 'rgba(78,80,78,.95)';
    c.fillRect(x - 1.5 * PPM, y - 2.6 * PPM, 0.5 * PPM, 0.24 * PPM);
    c.fillStyle = 'rgba(226,212,170,.2)';
    c.fillRect(x - 1.46 * PPM, y - 2.44 * PPM, 0.42 * PPM, 0.08 * PPM);
  } };

  /* ------------------------------------------------------------------ *
   * Survivors, and what found them
   * ------------------------------------------------------------------ */
  P.tent = { w: 2.6, h: 1.8, deep: 1.6, f: function (c, x, y, v) {
    var cols = [[142, 98, 58], [76, 102, 82], [96, 96, 114], [138, 130, 108]];
    var col = cols[Math.floor(h(v, 1) * 4) % 4];
    var W = 1.7 * PPM, H = 1.1 * PPM;
    c.fillStyle = Z.rgb(Z.shade(col, -0.24));
    c.beginPath();
    c.moveTo(x - W / 2, y);
    c.lineTo(x, y - H);
    c.lineTo(x + W / 2, y);
    c.closePath(); c.fill();
    c.fillStyle = Z.rgb(Z.shade(col, 0.14));
    c.beginPath();
    c.moveTo(x - W / 2, y);
    c.lineTo(x, y - H);
    c.lineTo(x - W * 0.1, y);
    c.closePath(); c.fill();
    /* the flap, open, and the dark inside */
    c.fillStyle = 'rgba(12,14,14,.8)';
    c.beginPath();
    c.moveTo(x - W * 0.16, y);
    c.lineTo(x, y - H * 0.72);
    c.lineTo(x + W * 0.16, y);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(50,48,44,.7)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x - W / 2, y); c.lineTo(x - W * 0.62, y + 3);
    c.moveTo(x + W / 2, y); c.lineTo(x + W * 0.62, y + 3);
    c.stroke();
    c.lineWidth = 1;
    weather(c, x, y, W, H, v, 5);
  } };

  P.campfire = { w: 1.8, h: 1.0, deep: 1.0, f: function (c, x, y, v) {
    /* a ring of stones round grey ash and the ends of logs */
    for (var i = 0; i < 9; i++) {
      var a = (i / 9) * Z.TAU;
      c.fillStyle = i % 2 ? 'rgba(122,120,112,.9)' : 'rgba(96,94,88,.9)';
      c.beginPath();
      c.ellipse(x + Math.cos(a) * 0.46 * PPM, y + Math.sin(a) * 0.46 * PPM * PITCH,
                5, 4, 0, 0, Z.TAU);
      c.fill();
    }
    c.fillStyle = 'rgba(58,54,50,.9)';
    c.beginPath(); c.ellipse(x, y, 0.34 * PPM, 0.34 * PPM * PITCH, 0, 0, Z.TAU); c.fill();
    c.strokeStyle = 'rgba(42,34,28,.95)';
    c.lineWidth = 3.4;
    for (var j = 0; j < 3; j++) {
      var a2 = j * 1.1;
      c.beginPath();
      c.moveTo(x - Math.cos(a2) * 0.3 * PPM, y - Math.sin(a2) * 0.16 * PPM);
      c.lineTo(x + Math.cos(a2) * 0.3 * PPM, y + Math.sin(a2) * 0.16 * PPM);
      c.stroke();
    }
    c.lineWidth = 1;
    /* embers still in it */
    c.fillStyle = 'rgba(206,104,40,.5)';
    c.beginPath(); c.ellipse(x, y, 0.14 * PPM, 0.08 * PPM, 0, 0, Z.TAU); c.fill();
  } };

  P.nest = { w: 3.8, h: 2.4, deep: 2.4, f: function (c, x, y, v) {
    /* A mound of dragged-together rubbish and bone. It has to read as
       wrong from a long way off, so it is the one silhouette on the map
       with no straight lines in it at all. */
    c.fillStyle = 'rgba(48,42,36,.92)';
    c.beginPath();
    for (var i = 0; i <= 14; i++) {
      var a = (i / 14) * Z.TAU;
      var rr = (0.9 + h(v, i) * 0.5) * PPM;
      var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * PITCH * 0.9;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath(); c.fill();
    /* the heap itself */
    c.fillStyle = 'rgba(62,54,46,.95)';
    c.beginPath();
    c.moveTo(x - 1.0 * PPM, y);
    c.bezierCurveTo(x - 0.7 * PPM, y - 1.2 * PPM, x + 0.7 * PPM, y - 1.2 * PPM,
                    x + 1.0 * PPM, y);
    c.closePath(); c.fill();
    /* bones and ribs sticking out of it */
    c.strokeStyle = 'rgba(196,188,168,.55)';
    c.lineWidth = 2;
    for (var b2 = 0; b2 < 7; b2++) {
      var bx = x + (h(v, b2 * 3) - 0.5) * 1.6 * PPM;
      var by = y - h(v, b2 * 5) * 0.8 * PPM;
      c.beginPath();
      c.moveTo(bx, by);
      c.lineTo(bx + (h(v, b2) - 0.5) * 16, by - 8 - h(v, b2 + 2) * 10);
      c.stroke();
    }
    c.lineWidth = 1;
    /* a wet red centre */
    var g = c.createRadialGradient(x, y - 0.3 * PPM, 2, x, y - 0.3 * PPM, 0.7 * PPM);
    g.addColorStop(0, 'rgba(112,28,26,.55)');
    g.addColorStop(1, 'rgba(112,28,26,0)');
    c.fillStyle = g;
    c.fillRect(x - PPM, y - 1.2 * PPM, PPM * 2, PPM * 1.6);
    /* flies */
    c.fillStyle = 'rgba(16,16,18,.5)';
    for (var f = 0; f < 10; f++) {
      c.fillRect(x + (h(v, f * 7) - 0.5) * 1.8 * PPM,
                 y - h(v, f * 11) * 1.4 * PPM, 1.6, 1.6);
    }
  } };

  /* ------------------------------------------------------------------ *
   * The ground taking it back
   * ------------------------------------------------------------------ */
  P.weeds = { w: 1.4, h: 0.9, f: function (c, x, y, v) {
    for (var i = 0; i < 16; i++) {
      var gx = x + (h(v, i * 3) - 0.5) * 0.7 * PPM;
      var gy = y + (h(v, i * 5) - 0.5) * 0.22 * PPM;
      var tall = 8 + h(v, i * 7) * 18;
      var lean = (h(v, i * 11) - 0.5) * 10;
      c.strokeStyle = i % 3 === 0 ? 'rgba(126,134,74,.7)'
                    : i % 3 === 1 ? 'rgba(88,104,52,.7)' : 'rgba(146,140,88,.6)';
      c.lineWidth = 1.3;
      c.beginPath();
      c.moveTo(gx, gy);
      c.quadraticCurveTo(gx + lean * 0.4, gy - tall * 0.6, gx + lean, gy - tall);
      c.stroke();
      /* a seed head on some of them */
      if (h(v, i) > 0.72) {
        c.fillStyle = 'rgba(178,168,116,.6)';
        c.beginPath(); c.ellipse(gx + lean, gy - tall, 2, 4, 0, 0, Z.TAU); c.fill();
      }
    }
    c.lineWidth = 1;
  } };

  P.sapling = { w: 1.6, h: 2.6, f: function (c, x, y, v) {
    c.strokeStyle = 'rgba(88,72,50,.9)';
    c.lineWidth = 2.6;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + 4, y - 0.9 * PPM, x + (h(v, 1) - 0.5) * 12, y - 1.7 * PPM);
    c.stroke();
    c.lineWidth = 1;
    for (var i = 0; i < 16; i++) {
      var a = h(v, i * 3) * Z.TAU, rr = h(v, i * 5) * 0.42 * PPM;
      c.fillStyle = i % 2 ? 'rgba(96,124,58,.7)' : 'rgba(72,100,46,.7)';
      c.beginPath();
      c.ellipse(x + Math.cos(a) * rr, y - 1.7 * PPM + Math.sin(a) * rr * 0.9,
                4, 3, a, 0, Z.TAU);
      c.fill();
    }
    /* the crack it came up through */
    c.strokeStyle = 'rgba(14,16,16,.35)';
    c.beginPath();
    c.moveTo(x - 12, y + 3); c.lineTo(x, y); c.lineTo(x + 14, y + 4);
    c.stroke();
  } };

  P.trash = { w: 1.4, h: 0.7, f: function (c, x, y, v) {
    for (var i = 0; i < 9; i++) {
      var px = x + (h(v, i * 3) - 0.5) * 0.9 * PPM;
      var py = y + (h(v, i * 5) - 0.5) * 0.3 * PPM;
      var r = h(v, i);
      c.fillStyle = r < 0.3 ? 'rgba(158,152,136,.7)'
                  : r < 0.55 ? 'rgba(104,98,86,.7)'
                  : r < 0.78 ? 'rgba(126,104,78,.65)' : 'rgba(84,96,88,.6)';
      c.save();
      c.translate(px, py);
      c.rotate(r * 6);
      if (r < 0.45) c.fillRect(-4, -2.4, 8, 4.8);
      else { c.beginPath(); c.ellipse(0, 0, 4, 2.4, 0, 0, Z.TAU); c.fill(); }
      c.restore();
    }
    /* a sheet of newspaper, caught */
    c.fillStyle = 'rgba(186,180,160,.5)';
    c.save();
    c.translate(x + 8, y - 3);
    c.rotate(h(v, 2) * 3);
    c.fillRect(-7, -5, 14, 10);
    c.fillStyle = 'rgba(60,58,52,.3)';
    for (var l = 0; l < 3; l++) c.fillRect(-5, -3 + l * 3, 10, 1);
    c.restore();
  } };

})(window.Z);
