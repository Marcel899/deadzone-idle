/* Deadzone - weapon inspection.

   A real 3D viewer for the weapon bay: free orbit on both axes with
   inertia, dolly zoom, a three-point studio rig, per-material specular
   and a faint environment reflection. The player can turn the gun over in
   their hands and look at it from underneath, which is the whole point of
   giving it its own screen.

   The meshes come from the pack as flat vertex and index arrays with a
   per-triangle material index, and their winding is not consistent - not
   between meshes and not within one. So this renderer does NOT cull back
   faces and does not try to re-wind them either. Re-winding each triangle
   to face away from the mesh centroid only works on a roughly star-shaped
   solid; a gun is nothing of the sort (barrel bore, trigger guard,
   magazine well, scope tube) and the guess deleted real surfaces, which
   is what turned the weapon into a flat sheet with holes in it.

   Instead: depth-sort every triangle and light two-sided, flipping the
   normal toward the camera. That is correct whichever way a face happens
   to be wound, at the cost of shading both sides of the shell. */
(function (Z) {
  'use strict';

  var V = Z.gunView = {
    yaw: 0.62, pitch: 0.17, dist: 2.4,
    vYaw: 0, vPitch: 0,
    dragging: false,
    auto: true                    /* idle turntable until the player grabs it */
  };

  var REST = { yaw: 0.62, pitch: 0.17, dist: 2.4, roll: 0.20 };
  var ROLL = REST.roll;

  var cache = {};

  function build(id) {
    if (cache[id]) return cache[id];
    var src = Z.GUNS && Z.GUNS[id];
    if (!src) return null;
    var n = src.v.length / 3, tn = src.t.length / 3;
    var m = {
      n: n, tn: tn,
      vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n),
      sx: new Float32Array(n), sy: new Float32Array(n),
      wx: new Float32Array(n), wy: new Float32Array(n), wz: new Float32Array(n),
      tri: new Uint32Array(src.t), mat: src.m ? new Uint16Array(src.m) : null,
      pal: src.c || [[120, 124, 130]],
      order: new Int32Array(tn), depth: new Float32Array(tn)
    };
    var i, cx = 0, cy = 0, cz = 0;
    var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (i = 0; i < n; i++) {
      var x = src.v[i * 3], y = src.v[i * 3 + 1], z = src.v[i * 3 + 2];
      m.vx[i] = x; m.vy[i] = y; m.vz[i] = z;
      cx += x; cy += y; cz += z;
      if (x < mn[0]) mn[0] = x; if (x > mx[0]) mx[0] = x;
      if (y < mn[1]) mn[1] = y; if (y > mx[1]) mx[1] = y;
      if (z < mn[2]) mn[2] = z; if (z > mx[2]) mx[2] = z;
    }
    cx /= n; cy /= n; cz /= n;
    m.centre = [cx, cy, cz];
    m.mn = mn; m.mx = mx;
    m.size = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;

    for (var t = 0; t < tn; t++) m.order[t] = t;

    /* per-material finish: barrels and receivers are glossier than
       polymer furniture, and the pack gives us no such hint, so infer it
       from how dark and how neutral the diffuse colour is */
    m.gloss = [];
    for (i = 0; i < m.pal.length; i++) {
      var col = m.pal[i];
      var lum = (col[0] * 0.3 + col[1] * 0.59 + col[2] * 0.11) / 255;
      var sat = (Math.max(col[0], col[1], col[2]) - Math.min(col[0], col[1], col[2])) / 255;
      m.gloss.push(Z.clamp01(0.85 - lum * 0.5 - sat * 1.2));
    }
    cache[id] = m;
    return m;
  }

  V.has = function (shape) { return !!(Z.GUNS && Z.GUNS[shape]); };

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */
  var KEY = norm([-0.42, 0.70, 0.58]);
  var FILL = norm([0.68, -0.18, 0.42]);
  var RIM = norm([0.30, 0.34, -0.90]);
  /* The pack authors its diffuse very dark - a receiver is around RGB 50.
     Without a gain the whole weapon renders as a silhouette; with a flat
     one it renders as white plastic, because the gain multiplies the lit
     faces just as hard as the dark ones and everything facing the key
     light clips. So the gain is followed by a shoulder: linear through
     the midtones, compressed as it approaches white. A receiver comes out
     as metal in shade rather than as a lamp. */
  var GAIN = 1.62;
  var KNEE = 170;
  function roll(v) {
    if (v <= KNEE) return v < 0 ? 0 : v;
    return KNEE + (255 - KNEE) * (1 - Math.exp(-(v - KNEE) / 58));
  }
  /* thumbnails sit on a dark panel with no backdrop of their own, so they
     get a little extra exposure to stay legible at 60px wide */
  var THUMB_GAIN = 1.28;

  function norm(v) {
    var L = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / L, v[1] / L, v[2] / L];
  }

  V.draw = function (cv, shape, opt) {
    opt = opt || {};
    var m = build(shape);
    var c = cv.getContext('2d');
    var W, H, dpr;
    if (opt.w) {
      /* fixed-size render, used for thumbnails */
      W = opt.w; H = opt.h; dpr = 1;
      c.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth || cv.width; H = cv.clientHeight || cv.height;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    c.clearRect(0, 0, W, H);

    /* studio backdrop: a pool of light behind the object */
    if (!opt.thumb) {
      var bg = c.createRadialGradient(W * 0.5, H * 0.42, 10, W * 0.5, H * 0.46, Math.max(W, H) * 0.62);
      bg.addColorStop(0, '#1A2026');
      bg.addColorStop(0.55, '#10151A');
      bg.addColorStop(1, '#080B0E');
      c.fillStyle = bg;
      c.fillRect(0, 0, W, H);
      /* floor line */
      var fg = c.createLinearGradient(0, H * 0.72, 0, H);
      fg.addColorStop(0, 'rgba(0,0,0,0)');
      fg.addColorStop(1, 'rgba(0,0,0,.45)');
      c.fillStyle = fg;
      c.fillRect(0, H * 0.72, W, H * 0.28);
    }
    if (!m) {
      c.fillStyle = '#5A646D';
      c.font = '600 13px Barlow,system-ui,sans-serif';
      c.textAlign = 'center';
      c.fillText('No model', W / 2, H / 2);
      return;
    }

    var yaw = opt.yaw != null ? opt.yaw : V.yaw;
    var pitch = opt.pitch != null ? opt.pitch : V.pitch;
    var dist = opt.dist != null ? opt.dist : V.dist;
    /* Frame to the width: a rifle is long, and fitting it to the shorter
       side leaves the hero shot two-thirds empty. */
    var fit = opt.thumb ? 0.86 : 0.82;
    var scale = W / m.size * fit * (2.4 / dist);
    scale = Math.min(scale, H / m.size * (opt.thumb ? 1.9 : 1.65) * (2.4 / dist));
    var cxp = W / 2, cyp = H * (opt.thumb ? 0.5 : 0.46);

    var cr = Math.cos(ROLL), sr = Math.sin(ROLL);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var cy2 = Math.cos(yaw), sy2 = Math.sin(yaw);
    var focal = 3.4;

    var i, n = m.n;
    var ox = m.centre[0], oy = m.centre[1], oz = m.centre[2];
    for (i = 0; i < n; i++) {
      var x = m.vx[i] - ox, y = m.vy[i] - oy, z = m.vz[i] - oz;
      /* roll in the model's own plane so the gun is presented, not laid flat */
      var x1 = x * cr - y * sr, y1 = x * sr + y * cr, z1 = z;
      /* pitch about the screen x axis */
      var y2 = y1 * cp - z1 * sp, z2 = y1 * sp + z1 * cp;
      /* yaw about the vertical */
      var x3 = x1 * cy2 + z2 * sy2, z3 = -x1 * sy2 + z2 * cy2;
      m.wx[i] = x3; m.wy[i] = y2; m.wz[i] = z3;
      var persp = focal / (focal + z3 * 1.4);
      m.sx[i] = cxp + x3 * scale * persp;
      m.sy[i] = cyp - y2 * scale * persp;
    }

    /* depth sort back to front */
    var tn = m.tn, tri = m.tri, depth = m.depth, order = m.order;
    for (i = 0; i < tn; i++) {
      var a = tri[i * 3], b = tri[i * 3 + 1], cc = tri[i * 3 + 2];
      depth[i] = m.wz[a] + m.wz[b] + m.wz[cc];
      order[i] = i;
    }
    order.sort(function (p, q) { return depth[q] - depth[p]; });

    var pal = m.pal, mat = m.mat, gloss = m.gloss;
    var drawn = 0;
    for (var k = 0; k < tn; k++) {
      var t = order[k];
      var ia = tri[t * 3], ib = tri[t * 3 + 1], ic = tri[t * 3 + 2];
      var ax = m.wx[ia], ay = m.wy[ia], az = m.wz[ia];
      var e1x = m.wx[ib] - ax, e1y = m.wy[ib] - ay, e1z = m.wz[ib] - az;
      var e2x = m.wx[ic] - ax, e2y = m.wy[ic] - ay, e2z = m.wz[ic] - az;
      var nx = e1y * e2z - e1z * e2y;
      var ny = e1z * e2x - e1x * e2z;
      var nz = e1x * e2y - e1y * e2x;
      var L = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (L < 1e-9) continue;                      /* degenerate sliver */
      nx /= L; ny /= L; nz /= L;
      /* two-sided: face whichever way the camera is looking from */
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }

      var mi = mat ? mat[t] : 0;
      var base = pal[mi] || pal[0];
      var gl = gloss[mi] != null ? gloss[mi] : 0.4;

      /* three-point rig */
      var key = Math.max(0, nx * KEY[0] + ny * KEY[1] + nz * KEY[2]);
      var fill = Math.max(0, nx * FILL[0] + ny * FILL[1] + nz * FILL[2]);
      var rim = Math.max(0, nx * RIM[0] + ny * RIM[1] + nz * RIM[2]);
      /* environment: sky above, floor below - the cheap reflection that
         makes metal read as metal */
      var env = 0.5 + ny * 0.5;

      var lum = 0.30 + key * 0.86 + fill * 0.26 + env * 0.20 * (0.4 + gl);
      /* specular from the key light, tightened by the material finish */
      var hx = KEY[0], hy = KEY[1], hz = KEY[2] + 1;
      var hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
      var spec = Math.max(0, nx * hx / hl + ny * hy / hl + nz * hz / hl);
      spec = Math.pow(spec, 16 + gl * 46) * gl * 1.05;

      var gain = opt.thumb ? GAIN * THUMB_GAIN : GAIN;
      var r = base[0] * lum * gain + spec * 255 + rim * 52 * gl;
      var g2 = base[1] * lum * gain + spec * 250 + rim * 58 * gl;
      var b2 = base[2] * lum * gain + spec * 240 + rim * 70 * gl;

      c.fillStyle = 'rgb(' + (roll(r) | 0) + ',' + (roll(g2) | 0) + ',' +
                             (roll(b2) | 0) + ')';
      c.beginPath();
      c.moveTo(m.sx[ia], m.sy[ia]);
      c.lineTo(m.sx[ib], m.sy[ib]);
      c.lineTo(m.sx[ic], m.sy[ic]);
      c.closePath();
      c.fill();
      drawn++;
    }

    if (!opt.thumb) {
      /* contact shadow under the object */
      var sh = c.createRadialGradient(cxp, H * 0.84, 4, cxp, H * 0.84, Math.min(W, H) * 0.33);
      sh.addColorStop(0, 'rgba(0,0,0,.42)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sh;
      c.save();
      c.translate(cxp, H * 0.84); c.scale(1, 0.22); c.translate(-cxp, -H * 0.84);
      c.beginPath(); c.arc(cxp, H * 0.84, Math.min(W, H) * 0.33, 0, Z.TAU); c.fill();
      c.restore();
      /* a hair of vignette to seat it in the frame */
      var vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,.42)');
      c.fillStyle = vg;
      c.fillRect(0, 0, W, H);
    }
  };

  /* ------------------------------------------------------------------ *
   * Interaction - orbit with inertia, dolly on wheel and pinch
   * ------------------------------------------------------------------ */
  V.attach = function (surface) {
    if (surface._dzBound) return;
    surface._dzBound = true;
    var last = null, pts = {}, pinchD = 0;

    function down(e) {
      surface.setPointerCapture && surface.setPointerCapture(e.pointerId);
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(pts).length === 2) {
        var ids = Object.keys(pts);
        pinchD = Math.hypot(pts[ids[0]].x - pts[ids[1]].x, pts[ids[0]].y - pts[ids[1]].y);
        return;
      }
      V.dragging = true;
      V.auto = false;
      V.vYaw = V.vPitch = 0;
      last = { x: e.clientX, y: e.clientY };
      surface.classList.add('grabbing');
    }
    function move(e) {
      if (pts[e.pointerId]) pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pts);
      if (ids.length === 2) {
        var d = Math.hypot(pts[ids[0]].x - pts[ids[1]].x, pts[ids[0]].y - pts[ids[1]].y);
        if (pinchD > 8) V.dist = Z.clamp(V.dist * (pinchD / d), 1.25, 6.0);
        pinchD = d;
        return;
      }
      if (!V.dragging || !last) return;
      var dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      V.yaw += dx * 0.011;
      V.pitch = Z.clamp(V.pitch + dy * 0.011, -1.45, 1.45);
      V.vYaw = dx * 0.011;
      V.vPitch = dy * 0.011;
    }
    function up(e) {
      delete pts[e.pointerId];
      if (Object.keys(pts).length < 2) pinchD = 0;
      V.dragging = false;
      last = null;
      surface.classList.remove('grabbing');
    }
    surface.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    surface.addEventListener('wheel', function (e) {
      e.preventDefault();
      V.dist = Z.clamp(V.dist * (e.deltaY > 0 ? 1.10 : 1 / 1.10), 1.25, 6.0);
      V.auto = false;
    }, { passive: false });
    surface.addEventListener('dblclick', function () { V.reset(); });
  };

  V.reset = function () {
    V.yaw = REST.yaw; V.pitch = REST.pitch; V.dist = REST.dist;
    V.vYaw = V.vPitch = 0;
    V.auto = true;
  };

  /* Called every frame the bay is open. */
  V.step = function (dt) {
    if (V.dragging) return;
    if (Math.abs(V.vYaw) > 0.0002 || Math.abs(V.vPitch) > 0.0002) {
      V.yaw += V.vYaw;
      V.pitch = Z.clamp(V.pitch + V.vPitch, -1.45, 1.45);
      var damp = Math.pow(0.022, dt);
      V.vYaw *= damp; V.vPitch *= damp;
    } else if (V.auto) {
      V.yaw += dt * 0.22;
    }
  };

  /* Small static render for list rows and the HUD weapon chip. */
  var thumbs = {};
  V.thumb = function (shape, w, h) {
    var key = shape + ':' + w + 'x' + h;
    if (thumbs[key]) return thumbs[key];
    var cv = Z.canvas(w * 2, h * 2);
    V.draw(cv, shape, { thumb: true, w: w * 2, h: h * 2,
                        yaw: 0.58, pitch: 0.30, dist: 2.2 });
    thumbs[key] = cv;
    return cv;
  };

})(window.Z);
