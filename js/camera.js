/* Deadzone - the camera.

   One transform for the whole game. The world is metres; the screen is
   pixels; `z` is how many pixels a metre is worth right now. Depth is the
   same y axis, foreshortened by Z.PITCH, which is why a body standing at
   y = 40 is drawn below a body at y = 39 and why depth sorting is just a
   sort on y. */
(function (Z) {
  'use strict';

  var C = Z.cam = {
    x: 112, y: 112,          /* world point under the centre of the screen */
    z: 46,                   /* pixels per metre */
    zt: 46,                  /* zoom target, eased toward */
    follow: true,            /* stick to the survivor until the player pans */
    shake: 0, shx: 0, shy: 0,
    W: 0, H: 0, dpr: 1
  };

  C.MINZ = 15;
  C.MAXZ = 74;

  C.resize = function (cv) {
    var r = cv.getBoundingClientRect();
    C.dpr = Math.min(window.devicePixelRatio || 1, 2);
    C.W = Math.max(1, Math.round(r.width));
    C.H = Math.max(1, Math.round(r.height));
    cv.width = Math.round(C.W * C.dpr);
    cv.height = Math.round(C.H * C.dpr);
  };

  C.toScreen = function (wx, wy) {
    return {
      x: (wx - C.x) * C.z + C.W / 2 + C.shx,
      y: (wy - C.y) * C.z * Z.PITCH + C.H / 2 + C.shy
    };
  };
  /* Screen x only - hot path in the renderer, avoids the object. */
  C.sx = function (wx) { return (wx - C.x) * C.z + C.W / 2 + C.shx; };
  C.sy = function (wy) { return (wy - C.y) * C.z * Z.PITCH + C.H / 2 + C.shy; };

  C.toWorld = function (sx, sy) {
    return {
      x: (sx - C.W / 2 - C.shx) / C.z + C.x,
      y: (sy - C.H / 2 - C.shy) / (C.z * Z.PITCH) + C.y
    };
  };

  /* What slice of the world is on screen, padded so tall sprites whose
     feet are just off the bottom still get drawn. */
  C.bounds = function (pad) {
    pad = pad || 4;
    var hw = C.W / 2 / C.z, hh = C.H / 2 / (C.z * Z.PITCH);
    return {
      x0: C.x - hw - pad, x1: C.x + hw + pad,
      y0: C.y - hh - pad, y1: C.y + hh + pad * 2.5
    };
  };

  /* Field of view, 1 to 100, and the only thing that sets the zoom.

     Pinching and scrolling the world used to change it, which meant the
     framing was different every time you looked at the game and half of
     those framings were wrong - too close to see what was coming, or so
     far out the survivor was four pixels. It is a setting now: you pick
     the view you want once and the camera holds it.

     Higher is wider, the way a lens is. */
  C.FOV_DEF = 48;
  C.fovToZoom = function (fov) {
    var k = Z.clamp01((Z.clamp(fov, 1, 100) - 1) / 99);
    return C.MAXZ + (C.MINZ - C.MAXZ) * k;
  };
  C.applyFov = function (fov) {
    if (fov == null) fov = (Z.S && Z.S.fov) || C.FOV_DEF;
    C.zt = C.z = C.fovToZoom(fov);
    C.clampToWorld();
  };

  /* Kept so the old callers do not have to care that zoom is gone. */
  C.zoomAt = function () {};

  C.pan = function (dxPx, dyPx) {
    C.x -= dxPx / C.z;
    C.y -= dyPx / (C.z * Z.PITCH);
    C.follow = false;
    C.clampToWorld();
  };

  C.clampToWorld = function () {
    var N = Z.world.SIZE;
    C.x = Z.clamp(C.x, -8, N + 8);
    C.y = Z.clamp(C.y, -8, N + 8);
  };

  C.centerOn = function (x, y, snap) {
    if (snap) { C.x = x; C.y = y; }
    C.follow = true;
  };

  C.quake = function (amt) { C.shake = Math.min(14, C.shake + amt); };

  C.step = function (dt, target) {
    C.z = Z.approach(C.z, C.zt, 0.0005, dt);
    if (C.follow && target) {
      /* lead the camera slightly in the direction of travel so you can
         see what you are walking into */
      var lx = target.x + (target.vx || 0) * 0.35;
      var ly = target.y + (target.vy || 0) * 0.35;
      C.x = Z.approach(C.x, lx, 0.0006, dt);
      C.y = Z.approach(C.y, ly, 0.0006, dt);
    }
    if (C.shake > 0.01) {
      C.shake = Math.max(0, C.shake - dt * 26);
      var a = Math.random() * Z.TAU;
      C.shx = Math.cos(a) * C.shake;
      C.shy = Math.sin(a) * C.shake * 0.6;
    } else { C.shx = C.shy = 0; C.shake = 0; }
  };

  /* Distance in screen pixels from the camera centre, used to decide how
     much haze to fold into something far away. */
  C.depthK = function (wy) {
    var d = (wy - C.y) / 70;
    return Z.clamp01(-d * 0.9);
  };

})(window.Z);
