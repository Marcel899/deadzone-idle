/* Deadzone - flat side-profile weapon art.

   The weapon bay renders the real mesh and should: you turn it in your
   hands and look at it. A card in the rack is a different job. The pack's
   meshes are authored very dark and very dense, and shrunk to the size of
   a card they collapse into a pale smear with no silhouette left, every
   gun's smear looking like every other gun's. Six hundred triangles do
   not survive being sixty pixels tall.

   So the rack is drawn, not rendered: flat from the side, out of solid
   parts in eight materials. A wooden forend under a blued barrel with a
   tube magazine beneath it is a pump shotgun at any size; a shaded render
   of one is a grey lozenge.

   Coordinates are in a 0..1 box running left (butt) to right (muzzle),
   with y=0 at the top. Everything is a polygon or an ellipse so shapes
   can be properly angled - a magazine that rakes forward, a stock that
   drops to the shoulder, a grip that leans back into the hand - rather
   than a stack of upright rectangles.

   The scale is measured across all seven guns together, never per gun, so
   a pistol stays a pistol next to a machine gun instead of being blown up
   to match it. That is also why each shape is authored inside the same
   box: how much of it a gun fills is how big that gun is. */
(function (Z) {
  'use strict';

  var G = Z.gunIcon = {};

  /* ------------------------------------------------------------------ *
   * Materials
   *
   * Four stops each, top to bottom: the lit edge, the upper body, the
   * turn into shadow, and the underside. Everything on a gun is a box or
   * a cylinder lit from above, and that is the whole of the shading.
   * ------------------------------------------------------------------ */
  var MAT = {
    steel: [[167, 174, 183], [118, 125, 134], [69, 74, 81], [38, 42, 48]],
    dark:  [[94, 100, 108], [65, 70, 76], [40, 44, 49], [21, 24, 27]],
    black: [[65, 69, 74], [44, 48, 52], [27, 29, 33], [12, 14, 16]],
    poly:  [[88, 88, 84], [63, 64, 61], [39, 40, 38], [21, 22, 21]],
    wood:  [[188, 136, 89], [150, 100, 59], [102, 65, 35], [59, 35, 20]],
    brass: [[204, 168, 100], [168, 131, 63], [118, 87, 32], [67, 48, 18]],
    glass: [[157, 198, 216], [94, 147, 171], [46, 85, 104], [22, 48, 62]],
    hot:   [[255, 227, 156], [242, 174, 62], [176, 100, 26], [95, 52, 11]]
  };

  /* Where a part sits on the gun decides how lit it is.

     The gradient across a part runs top to bottom, but its range is the
     PART's own height, so a deep one (a pistol grip) got the full sweep
     from lit edge to shadow while a shallow one (a handguard) got a
     compressed slice of the middle. Two things cut from the same polymer
     came out different colours, and the grip in particular read as a
     second magazine in a lighter material. So everything is also toned by
     how far down the whole gun it is: one light above, and the underside
     of the thing in shade. */
  function tone(rgb, k) {
    var d = 1 - k * 0.52;
    return 'rgb(' + ((rgb[0] * d) | 0) + ',' + ((rgb[1] * d) | 0) + ',' +
           ((rgb[2] * d) | 0) + ')';
  }

  /* polygon from an array of [x,y]; `fl` is a flag string */
  function P(mat, pts, fl) { return { mat: mat, pts: pts, fl: fl || '' }; }
  /* the common case */
  function R(mat, x, y, w, h, fl) {
    return P(mat, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fl);
  }
  function E(mat, cx, cy, rx, ry, fl) {
    return { mat: mat, e: [cx, cy, rx, ry], fl: fl || '' };
  }
  /* n evenly spaced grooves - serrations, vents, rail slots, checkering,
     pump grooves, M-LOK. They are cut INTO a surface rather than stuck on
     it, so they are drawn as etching: a translucent shadow with a lit
     edge down one side, and no keyline of their own. Drawn as solid parts
     they came out as black bars and turned a pistol slide into a
     barcode. The `mat` is ignored and kept only so the call sites still
     read as what the groove is cut in. */
  function slats(out, mat, x, y, w, h, n, duty) {
    var step = w / n, bar = step * (duty == null ? 0.42 : duty);
    for (var i = 0; i < n; i++) out.push(R(mat, x + i * step, y, bar, h, 'etch'));
  }
  /* A trigger guard, drawn as the strap it is rather than a filled lump:
     down the back, round the bottom, up the front, and back inside
     itself, so the hole in the middle is really a hole. */
  function guard(out, mat, x, y, w, drop) {
    out.push(P(mat, [
      [x, y], [x + w * 0.20, y],
      [x + w * 0.26, y + drop * 0.62], [x + w * 0.74, y + drop * 0.80],
      [x + w * 0.98, y + drop * 0.30], [x + w, y],
      [x + w * 0.86, y], [x + w * 0.80, y + drop * 0.30],
      [x + w * 0.70, y + drop * 0.58], [x + w * 0.38, y + drop * 0.44],
      [x + w * 0.34, y]
    ]));
  }

  /* ------------------------------------------------------------------ *
   * The seven
   * ------------------------------------------------------------------ */
  function pistol() {
    var s = [];
    /* grip first, so the frame and slide sit over it */
    s.push(P('poly', [[0.332, 0.470], [0.478, 0.470], [0.442, 0.874], [0.318, 0.854]]));
    slats(s, 'black', 0.330, 0.556, 0.116, 0.224, 5, 0.34);      /* checkering */
    s.push(P('black', [[0.304, 0.832], [0.450, 0.854], [0.446, 0.896], [0.300, 0.874]]));
    s.push(P('steel', [[0.466, 0.474], [0.482, 0.474], [0.456, 0.860], [0.440, 0.856]]));
    /* frame and dust cover */
    s.push(R('dark', 0.320, 0.455, 0.498, 0.082));
    s.push(R('steel', 0.560, 0.470, 0.240, 0.026));
    s.push(E('steel', 0.612, 0.498, 0.020, 0.020));              /* takedown */
    guard(s, 'dark', 0.462, 0.524, 0.156, 0.180);
    s.push(P('steel', [[0.492, 0.535], [0.523, 0.535], [0.515, 0.630], [0.487, 0.622]]));
    /* the slide */
    s.push(R('dark', 0.288, 0.300, 0.615, 0.150, 'cyl'));
    s.push(R('steel', 0.300, 0.306, 0.585, 0.026));
    slats(s, 'black', 0.302, 0.330, 0.128, 0.118, 5, 0.40);
    slats(s, 'black', 0.735, 0.332, 0.078, 0.112, 3, 0.40);
    s.push(R('black', 0.556, 0.326, 0.126, 0.058));              /* ejection port */
    /* sights, hammer, muzzle */
    s.push(R('steel', 0.296, 0.252, 0.062, 0.046));
    s.push(R('black', 0.316, 0.258, 0.020, 0.030));
    s.push(R('steel', 0.842, 0.248, 0.036, 0.050));
    s.push(P('steel', [[0.268, 0.300], [0.296, 0.296], [0.300, 0.392], [0.272, 0.392]]));
    s.push(R('steel', 0.898, 0.330, 0.052, 0.090, 'cyl'));
    s.push(E('black', 0.938, 0.375, 0.016, 0.026));              /* the bore */
    return s;
  }

  function smg() {
    var s = [];
    /* skeleton stock: a folding frame, which from the side is a C */
    s.push(P('black', [[0.020, 0.318], [0.186, 0.318], [0.186, 0.372], [0.078, 0.372],
                       [0.078, 0.452], [0.186, 0.452], [0.186, 0.508], [0.020, 0.508],
                       [0.020, 0.452], [0.040, 0.452], [0.040, 0.372], [0.020, 0.372]]));
    s.push(E('steel', 0.192, 0.412, 0.026, 0.030));              /* the hinge */
    /* grip and magazine, under the receiver */
    s.push(P('poly', [[0.310, 0.505], [0.402, 0.505], [0.366, 0.832], [0.296, 0.818]]));
    slats(s, 'black', 0.302, 0.578, 0.088, 0.194, 4, 0.36);
    s.push(P('black', [[0.452, 0.505], [0.550, 0.505], [0.538, 0.902], [0.444, 0.902]]));
    s.push(R('poly', 0.458, 0.596, 0.080, 0.024));
    s.push(R('poly', 0.457, 0.684, 0.080, 0.024));
    s.push(P('black', [[0.440, 0.886], [0.544, 0.886], [0.542, 0.926], [0.438, 0.926]]));
    guard(s, 'black', 0.412, 0.518, 0.136, 0.164);
    s.push(P('steel', [[0.440, 0.530], [0.468, 0.530], [0.460, 0.618], [0.434, 0.610]]));
    /* the receiver, a slab with a rail on it */
    s.push(R('black', 0.168, 0.298, 0.470, 0.212));
    s.push(R('dark', 0.180, 0.310, 0.448, 0.036));
    s.push(R('steel', 0.186, 0.264, 0.448, 0.040));
    slats(s, 'black', 0.196, 0.268, 0.428, 0.032, 11, 0.40);
    s.push(R('steel', 0.300, 0.352, 0.112, 0.024, 'cyl'));       /* charging handle */
    s.push(R('black', 0.480, 0.356, 0.086, 0.052));              /* ejection port */
    /* sights */
    s.push(P('steel', [[0.204, 0.212], [0.268, 0.212], [0.268, 0.266], [0.204, 0.266]]));
    s.push(R('black', 0.222, 0.220, 0.028, 0.034));
    /* shroud, barrel, brake */
    s.push(R('black', 0.628, 0.314, 0.240, 0.112, 'cyl'));
    s.push(E('dark', 0.672, 0.368, 0.020, 0.028));
    s.push(E('dark', 0.724, 0.368, 0.020, 0.028));
    s.push(E('dark', 0.776, 0.368, 0.020, 0.028));
    s.push(E('dark', 0.828, 0.368, 0.020, 0.028));
    s.push(R('steel', 0.862, 0.344, 0.062, 0.054, 'cyl'));
    s.push(R('black', 0.912, 0.328, 0.056, 0.086));
    slats(s, 'dark', 0.920, 0.336, 0.042, 0.070, 3, 0.36);
    return s;
  }

  function shotgun() {
    var s = [];
    /* walnut butt, dropping to the shoulder */
    s.push(P('wood', [[0.020, 0.352], [0.262, 0.312], [0.268, 0.470], [0.186, 0.500],
                      [0.132, 0.560], [0.022, 0.578]], 'grain'));
    s.push(P('black', [[0.020, 0.352], [0.056, 0.348], [0.058, 0.574], [0.022, 0.578]]));
    s.push(E('steel', 0.036, 0.462, 0.010, 0.014));              /* sling stud */
    /* receiver */
    s.push(R('dark', 0.250, 0.308, 0.250, 0.212));
    s.push(R('steel', 0.262, 0.316, 0.226, 0.042));
    s.push(R('black', 0.302, 0.372, 0.118, 0.062));              /* ejection port */
    s.push(R('steel', 0.308, 0.428, 0.106, 0.012));
    s.push(E('steel', 0.462, 0.400, 0.018, 0.022));              /* safety */
    guard(s, 'dark', 0.310, 0.522, 0.138, 0.160);
    s.push(P('steel', [[0.338, 0.532], [0.366, 0.532], [0.358, 0.618], [0.332, 0.612]]));
    /* barrel over a magazine tube, with the wooden pump riding it */
    s.push(R('dark', 0.492, 0.320, 0.470, 0.082, 'cyl'));
    s.push(R('steel', 0.492, 0.418, 0.412, 0.062, 'cyl'));
    s.push(R('wood', 0.560, 0.398, 0.250, 0.116, 'grain'));
    slats(s, 'black', 0.572, 0.404, 0.226, 0.104, 7, 0.24);
    s.push(R('steel', 0.884, 0.408, 0.036, 0.082));              /* barrel band */
    s.push(P('steel', [[0.938, 0.300], [0.958, 0.300], [0.956, 0.330], [0.940, 0.330]]));
    s.push(E('brass', 0.948, 0.296, 0.014, 0.016));              /* the bead */
    s.push(E('black', 0.958, 0.360, 0.014, 0.024));
    return s;
  }

  function rifle() {
    var s = [];
    /* collapsible stock on a buffer tube */
    s.push(R('black', 0.148, 0.348, 0.132, 0.062, 'cyl'));
    s.push(P('poly', [[0.020, 0.312], [0.158, 0.312], [0.158, 0.372], [0.086, 0.378],
                      [0.086, 0.434], [0.158, 0.440], [0.158, 0.492], [0.020, 0.470],
                      [0.020, 0.414], [0.048, 0.408], [0.048, 0.360], [0.020, 0.356]]));
    s.push(R('poly', 0.020, 0.312, 0.030, 0.158));               /* butt plate */
    slats(s, 'black', 0.098, 0.352, 0.052, 0.022, 3, 0.40);      /* adjust notches */
    /* grip and magazine */
    s.push(P('poly', [[0.306, 0.512], [0.396, 0.512], [0.358, 0.806], [0.292, 0.792]]));
    slats(s, 'black', 0.298, 0.584, 0.086, 0.172, 4, 0.36);
    s.push(P('black', [[0.458, 0.516], [0.552, 0.516], [0.588, 0.856], [0.500, 0.878]]));
    s.push(P('poly', [[0.466, 0.602], [0.562, 0.592], [0.565, 0.618], [0.469, 0.628]]));
    s.push(P('poly', [[0.476, 0.696], [0.574, 0.686], [0.577, 0.712], [0.479, 0.722]]));
    s.push(P('black', [[0.498, 0.852], [0.594, 0.840], [0.600, 0.888], [0.504, 0.900]]));
    guard(s, 'dark', 0.416, 0.524, 0.138, 0.164);
    s.push(P('steel', [[0.444, 0.538], [0.472, 0.538], [0.464, 0.624], [0.438, 0.616]]));
    /* lower and upper receiver */
    s.push(R('dark', 0.252, 0.410, 0.248, 0.124));
    s.push(R('dark', 0.246, 0.302, 0.336, 0.122));
    s.push(R('steel', 0.258, 0.312, 0.312, 0.030));
    s.push(P('steel', [[0.218, 0.312], [0.256, 0.312], [0.256, 0.348], [0.218, 0.348]]));
    s.push(R('black', 0.436, 0.336, 0.096, 0.056));              /* port cover */
    s.push(E('steel', 0.548, 0.372, 0.020, 0.024));              /* forward assist */
    s.push(E('steel', 0.286, 0.462, 0.018, 0.022));              /* pivot pin */
    /* one long rail, optic on it */
    s.push(R('steel', 0.252, 0.272, 0.600, 0.036));
    slats(s, 'black', 0.262, 0.276, 0.578, 0.028, 15, 0.38);
    s.push(R('black', 0.300, 0.192, 0.152, 0.082));              /* red dot */
    s.push(R('dark', 0.310, 0.200, 0.132, 0.020));
    s.push(E('glass', 0.320, 0.234, 0.018, 0.034));
    s.push(E('glass', 0.436, 0.234, 0.016, 0.032));
    /* handguard, gas block, barrel */
    s.push(R('poly', 0.586, 0.306, 0.268, 0.120));
    slats(s, 'black', 0.600, 0.336, 0.240, 0.026, 4, 0.66);
    slats(s, 'black', 0.600, 0.384, 0.240, 0.026, 4, 0.66);
    s.push(P('steel', [[0.848, 0.252], [0.884, 0.252], [0.884, 0.330], [0.848, 0.330]]));
    s.push(R('steel', 0.848, 0.330, 0.086, 0.062, 'cyl'));
    s.push(R('black', 0.916, 0.316, 0.064, 0.092));              /* flash hider */
    slats(s, 'dark', 0.924, 0.324, 0.048, 0.076, 3, 0.34);
    return s;
  }

  function lmg() {
    var s = [];
    /* stock with a cheek piece */
    s.push(P('poly', [[0.020, 0.296], [0.170, 0.296], [0.170, 0.508], [0.020, 0.474]]));
    s.push(R('poly', 0.060, 0.262, 0.112, 0.042));
    s.push(R('black', 0.020, 0.296, 0.030, 0.178));
    /* ammo box, hung under the feedway */
    s.push(R('black', 0.438, 0.548, 0.216, 0.356));
    s.push(R('dark', 0.450, 0.574, 0.192, 0.026));
    s.push(R('dark', 0.450, 0.876, 0.192, 0.026));
    s.push(R('dark', 0.516, 0.690, 0.062, 0.052));               /* the latch */
    s.push(R('brass', 0.470, 0.512, 0.020, 0.048));              /* the belt */
    s.push(R('brass', 0.502, 0.510, 0.020, 0.048));
    s.push(R('brass', 0.534, 0.512, 0.020, 0.048));
    /* grip */
    s.push(P('poly', [[0.280, 0.548], [0.372, 0.548], [0.334, 0.832], [0.266, 0.818]]));
    slats(s, 'black', 0.272, 0.616, 0.086, 0.172, 4, 0.36);
    guard(s, 'dark', 0.386, 0.556, 0.132, 0.158);
    /* a deep receiver with the feed tray cover on top */
    s.push(R('dark', 0.148, 0.272, 0.352, 0.286));
    s.push(R('steel', 0.162, 0.284, 0.320, 0.062));
    slats(s, 'black', 0.176, 0.296, 0.290, 0.040, 6, 0.30);
    s.push(R('black', 0.400, 0.400, 0.092, 0.070));
    s.push(P('steel', [[0.196, 0.230], [0.262, 0.230], [0.262, 0.276], [0.196, 0.276]]));
    /* carry handle */
    s.push(P('black', [[0.498, 0.228], [0.676, 0.228], [0.676, 0.272], [0.498, 0.272]]));
    s.push(R('black', 0.498, 0.268, 0.030, 0.076));
    s.push(R('black', 0.646, 0.268, 0.030, 0.076));
    /* barrel with a shroud, and the bipod under it */
    s.push(R('dark', 0.470, 0.334, 0.340, 0.086, 'cyl'));
    slats(s, 'black', 0.520, 0.346, 0.230, 0.062, 5, 0.26);
    s.push(R('steel', 0.478, 0.430, 0.220, 0.036, 'cyl'));       /* gas tube */
    s.push(R('black', 0.796, 0.312, 0.098, 0.128));              /* flash hider */
    slats(s, 'dark', 0.806, 0.326, 0.078, 0.100, 3, 0.34);
    s.push(P('steel', [[0.692, 0.420], [0.736, 0.420], [0.700, 0.760], [0.676, 0.752]]));
    s.push(P('steel', [[0.712, 0.424], [0.752, 0.424], [0.812, 0.756], [0.788, 0.764]]));
    s.push(E('black', 0.688, 0.768, 0.030, 0.016));
    s.push(E('black', 0.800, 0.772, 0.030, 0.016));
    return s;
  }

  function sniper() {
    var s = [];
    /* chassis stock with an adjustable comb */
    s.push(P('poly', [[0.014, 0.356], [0.196, 0.322], [0.200, 0.520], [0.116, 0.548],
                      [0.014, 0.556]]));
    s.push(R('black', 0.014, 0.356, 0.030, 0.200));
    s.push(R('poly', 0.068, 0.288, 0.124, 0.044));               /* cheek riser */
    s.push(R('black', 0.086, 0.330, 0.020, 0.034));
    s.push(R('black', 0.152, 0.328, 0.020, 0.036));
    /* grip and magazine */
    s.push(P('poly', [[0.276, 0.512], [0.362, 0.512], [0.328, 0.792], [0.262, 0.780]]));
    slats(s, 'black', 0.268, 0.580, 0.080, 0.166, 4, 0.36);
    s.push(P('black', [[0.408, 0.514], [0.496, 0.514], [0.486, 0.744], [0.398, 0.744]]));
    s.push(R('dark', 0.402, 0.730, 0.090, 0.032));
    guard(s, 'dark', 0.366, 0.522, 0.130, 0.156);
    s.push(P('steel', [[0.394, 0.534], [0.420, 0.534], [0.412, 0.616], [0.388, 0.610]]));
    /* action and bolt */
    s.push(R('dark', 0.180, 0.336, 0.268, 0.184));
    s.push(R('steel', 0.192, 0.346, 0.242, 0.038));
    s.push(R('steel', 0.200, 0.392, 0.130, 0.044, 'cyl'));       /* the bolt body */
    s.push(P('steel', [[0.306, 0.404], [0.342, 0.398], [0.378, 0.470], [0.346, 0.486]]));
    s.push(E('steel', 0.382, 0.482, 0.028, 0.030));              /* bolt knob */
    /* the glass */
    s.push(R('black', 0.238, 0.184, 0.312, 0.104, 'cyl'));
    s.push(R('black', 0.198, 0.164, 0.052, 0.144, 'cyl'));       /* ocular */
    s.push(E('glass', 0.206, 0.236, 0.016, 0.060));
    s.push(R('black', 0.528, 0.150, 0.062, 0.172, 'cyl'));       /* objective */
    s.push(E('glass', 0.574, 0.236, 0.018, 0.070));
    s.push(R('steel', 0.340, 0.140, 0.062, 0.050));              /* elevation turret */
    s.push(R('dark', 0.348, 0.146, 0.046, 0.014));
    s.push(R('steel', 0.276, 0.280, 0.038, 0.062));              /* rings */
    s.push(R('steel', 0.470, 0.280, 0.038, 0.062));
    /* barrel, handguard, can */
    s.push(R('dark', 0.440, 0.368, 0.318, 0.060, 'cyl'));
    s.push(R('poly', 0.444, 0.428, 0.226, 0.070));
    slats(s, 'black', 0.458, 0.446, 0.196, 0.026, 4, 0.62);
    s.push(R('black', 0.742, 0.338, 0.228, 0.118, 'cyl'));       /* suppressor */
    slats(s, 'dark', 0.764, 0.346, 0.184, 0.102, 5, 0.16);
    s.push(E('black', 0.962, 0.397, 0.016, 0.044));
    return s;
  }

  function rail() {
    var s = [];
    s.push(P('poly', [[0.020, 0.310], [0.176, 0.310], [0.176, 0.512], [0.020, 0.474]]));
    s.push(R('hot', 0.036, 0.352, 0.024, 0.104));
    /* grip and cell */
    s.push(P('poly', [[0.292, 0.528], [0.384, 0.528], [0.346, 0.822], [0.278, 0.808]]));
    slats(s, 'black', 0.284, 0.596, 0.086, 0.172, 4, 0.36);
    s.push(P('black', [[0.436, 0.530], [0.538, 0.530], [0.526, 0.826], [0.432, 0.826]]));
    s.push(R('hot', 0.452, 0.596, 0.068, 0.022));
    s.push(R('hot', 0.452, 0.654, 0.068, 0.022));
    s.push(R('dark', 0.428, 0.810, 0.104, 0.034));
    guard(s, 'black', 0.394, 0.538, 0.130, 0.156);
    /* the housing */
    s.push(R('poly', 0.152, 0.276, 0.372, 0.260));
    s.push(R('black', 0.168, 0.300, 0.334, 0.076));
    s.push(R('hot', 0.180, 0.322, 0.292, 0.026));
    slats(s, 'black', 0.190, 0.406, 0.300, 0.070, 4, 0.30);
    s.push(R('steel', 0.164, 0.252, 0.354, 0.032));
    s.push(P('steel', [[0.196, 0.202], [0.264, 0.202], [0.264, 0.254], [0.196, 0.254]]));
    s.push(E('hot', 0.230, 0.226, 0.018, 0.020));
    /* accelerator: two rails, three coils, the arc between them */
    s.push(R('steel', 0.512, 0.308, 0.436, 0.048, 'cyl'));
    s.push(R('steel', 0.512, 0.406, 0.436, 0.048, 'cyl'));
    s.push(R('hot', 0.522, 0.362, 0.420, 0.040));
    s.push(R('black', 0.548, 0.272, 0.050, 0.220));
    s.push(R('black', 0.684, 0.272, 0.050, 0.220));
    s.push(R('black', 0.820, 0.272, 0.050, 0.220));
    s.push(R('hot', 0.556, 0.286, 0.034, 0.018));
    s.push(R('hot', 0.692, 0.286, 0.034, 0.018));
    s.push(R('hot', 0.828, 0.286, 0.034, 0.018));
    s.push(E('hot', 0.952, 0.382, 0.026, 0.046));
    return s;
  }


  /* ---- the revolver ----
     Everything a revolver is, is the cylinder and the gap in front of
     it. Draw the frame as one piece and it becomes a blocky pistol, so
     the topstrap, the cylinder and the barrel are three separate parts
     with the crane gap left open between them. */
  function revolver() {
    var s = [];
    /* grip - walnut, and it hangs further back than an automatic's */
    s.push(P('wood', [[0.318, 0.482], [0.452, 0.482], [0.404, 0.878], [0.286, 0.846]]));
    s.push(P('black', [[0.296, 0.824], [0.418, 0.852], [0.412, 0.890], [0.290, 0.864]]));
    slats(s, 'black', 0.316, 0.560, 0.108, 0.226, 4, 0.26);
    /* frame */
    s.push(R('dark', 0.330, 0.452, 0.330, 0.088));
    guard(s, 'dark', 0.436, 0.520, 0.150, 0.176);
    s.push(P('steel', [[0.470, 0.530], [0.500, 0.530], [0.492, 0.622], [0.464, 0.614]]));
    /* the cylinder, fluted */
    s.push(R('steel', 0.470, 0.352, 0.168, 0.152, 'cyl'));
    s.push(E('black', 0.502, 0.428, 0.015, 0.038));
    s.push(E('black', 0.554, 0.428, 0.015, 0.038));
    s.push(E('black', 0.606, 0.428, 0.015, 0.038));
    s.push(R('black', 0.468, 0.346, 0.172, 0.014));
    /* topstrap over it, and the barrel with its underlug */
    s.push(R('dark', 0.404, 0.318, 0.300, 0.044));
    s.push(R('dark', 0.700, 0.336, 0.230, 0.078, 'cyl'));
    s.push(R('steel', 0.706, 0.342, 0.218, 0.020));
    s.push(R('dark', 0.706, 0.412, 0.196, 0.046, 'cyl'));   /* ejector shroud */
    s.push(E('black', 0.922, 0.375, 0.016, 0.028));
    /* hammer spur and sights */
    s.push(P('steel', [[0.376, 0.316], [0.410, 0.306], [0.416, 0.372], [0.382, 0.372]]));
    s.push(R('black', 0.410, 0.300, 0.030, 0.026));
    s.push(R('steel', 0.898, 0.302, 0.026, 0.044));
    return s;
  }

  /* ---- the PDW ----
     Tiny. The whole gun is a receiver block with a folded stock behind
     it and a magazine through the grip, which is what makes it read as
     a machine pistol rather than a short rifle. */
  function pdw() {
    var s = [];
    s.push(P('poly', [[0.396, 0.470], [0.516, 0.470], [0.502, 0.836], [0.380, 0.818]]));
    slats(s, 'black', 0.396, 0.540, 0.104, 0.230, 5, 0.32);
    s.push(P('dark', [[0.392, 0.700], [0.508, 0.716], [0.500, 0.860], [0.384, 0.842]]));
    s.push(R('dark', 0.346, 0.352, 0.416, 0.126, 'cyl'));   /* receiver */
    s.push(R('steel', 0.356, 0.358, 0.396, 0.022));
    s.push(R('black', 0.560, 0.372, 0.110, 0.050));         /* port */
    guard(s, 'dark', 0.512, 0.520, 0.130, 0.152);
    s.push(P('steel', [[0.540, 0.528], [0.566, 0.528], [0.560, 0.608], [0.536, 0.602]]));
    /* top rail */
    s.push(R('black', 0.360, 0.312, 0.380, 0.044));
    slats(s, 'steel', 0.366, 0.316, 0.368, 0.036, 9, 0.3);
    /* stubby barrel and shroud */
    s.push(R('dark', 0.762, 0.382, 0.128, 0.064, 'cyl'));
    s.push(E('black', 0.884, 0.414, 0.014, 0.022));
    /* the stock, folded alongside */
    s.push(R('black', 0.222, 0.386, 0.130, 0.032));
    s.push(R('black', 0.214, 0.372, 0.028, 0.092));
    return s;
  }

  /* ---- the auto shotgun ----
     A box magazine under a shotgun receiver, and a vented heat shield
     over the barrel - the two details that separate it at a glance from
     the pump gun's tube. */
  function autoshot() {
    var s = [];
    s.push(P('poly', [[0.196, 0.398], [0.316, 0.386], [0.300, 0.548], [0.180, 0.540]]));
    s.push(P('poly', [[0.300, 0.470], [0.404, 0.470], [0.392, 0.812], [0.282, 0.796]]));
    slats(s, 'black', 0.302, 0.548, 0.092, 0.212, 4, 0.3);
    s.push(R('dark', 0.286, 0.368, 0.330, 0.126, 'cyl'));   /* receiver */
    s.push(R('steel', 0.296, 0.374, 0.310, 0.022));
    s.push(R('black', 0.470, 0.388, 0.104, 0.048));
    guard(s, 'dark', 0.402, 0.506, 0.136, 0.158);
    s.push(P('steel', [[0.430, 0.514], [0.456, 0.514], [0.450, 0.596], [0.426, 0.590]]));
    /* the box magazine, raked forward */
    s.push(P('black', [[0.402, 0.486], [0.516, 0.486], [0.552, 0.760], [0.438, 0.760]]));
    s.push(P('steel', [[0.414, 0.700], [0.528, 0.700], [0.532, 0.726], [0.418, 0.726]]));
    /* barrel under a vented shield */
    s.push(R('dark', 0.616, 0.398, 0.312, 0.058, 'cyl'));
    s.push(R('steel', 0.622, 0.372, 0.236, 0.040, 'cyl'));
    for (var v = 0; v < 5; v++) s.push(E('black', 0.650 + v * 0.042, 0.392, 0.011, 0.015));
    s.push(R('steel', 0.902, 0.396, 0.044, 0.062, 'cyl'));
    s.push(E('black', 0.936, 0.427, 0.017, 0.026));
    s.push(R('steel', 0.628, 0.344, 0.026, 0.034));         /* bead */
    return s;
  }

  /* ---- the marksman rifle ----
     Long, thin, and mostly optic. The cheek riser and the long free
     float tube are what say precision rather than assault. */
  function dmr() {
    var s = [];
    s.push(P('poly', [[0.086, 0.398], [0.232, 0.382], [0.228, 0.520], [0.090, 0.520]]));
    s.push(P('black', [[0.082, 0.392], [0.108, 0.390], [0.106, 0.524], [0.080, 0.522]]));
    s.push(R('poly', 0.184, 0.336, 0.150, 0.062));          /* cheek riser */
    s.push(P('poly', [[0.312, 0.470], [0.418, 0.470], [0.404, 0.806], [0.298, 0.790]]));
    slats(s, 'black', 0.314, 0.542, 0.090, 0.206, 4, 0.3);
    s.push(R('dark', 0.228, 0.386, 0.322, 0.106, 'cyl'));   /* receiver */
    s.push(R('steel', 0.236, 0.392, 0.304, 0.020));
    s.push(R('black', 0.424, 0.402, 0.098, 0.042));
    guard(s, 'dark', 0.414, 0.500, 0.132, 0.152);
    s.push(P('steel', [[0.442, 0.508], [0.468, 0.508], [0.462, 0.588], [0.438, 0.582]]));
    s.push(P('black', [[0.452, 0.486], [0.552, 0.486], [0.580, 0.716], [0.480, 0.716]]));
    /* free float tube with slots */
    s.push(R('dark', 0.550, 0.398, 0.318, 0.070, 'cyl'));
    slats(s, 'black', 0.566, 0.412, 0.286, 0.042, 7, 0.34);
    s.push(R('dark', 0.862, 0.414, 0.092, 0.038, 'cyl'));
    s.push(E('black', 0.948, 0.433, 0.013, 0.019));
    /* the glass */
    s.push(R('black', 0.286, 0.276, 0.290, 0.070, 'cyl'));
    s.push(E('glass', 0.300, 0.311, 0.026, 0.034));
    s.push(E('glass', 0.562, 0.311, 0.022, 0.030));
    s.push(R('black', 0.330, 0.264, 0.030, 0.026));
    s.push(R('black', 0.510, 0.264, 0.030, 0.026));
    s.push(R('black', 0.300, 0.340, 0.024, 0.058));
    s.push(R('black', 0.520, 0.340, 0.024, 0.058));
    return s;
  }

  /* ---- the crossbow ----
     Nothing else in the rack has limbs, and the limbs are the whole
     read. The string is drawn as two straight runs from the tips to the
     latch so it is unmistakably spanned rather than slack. */
  function crossbow() {
    var s = [];
    /* stock and trigger group */
    s.push(P('wood', [[0.118, 0.430], [0.268, 0.418], [0.256, 0.556], [0.120, 0.556]]));
    s.push(P('black', [[0.112, 0.424], [0.140, 0.422], [0.138, 0.560], [0.110, 0.558]]));
    s.push(P('wood', [[0.300, 0.470], [0.402, 0.470], [0.388, 0.792], [0.286, 0.776]]));
    s.push(R('dark', 0.250, 0.432, 0.300, 0.092, 'cyl'));
    guard(s, 'dark', 0.402, 0.500, 0.128, 0.148);
    s.push(P('steel', [[0.428, 0.508], [0.454, 0.508], [0.448, 0.586], [0.424, 0.580]]));
    /* the rail the bolt runs down */
    s.push(R('black', 0.360, 0.404, 0.480, 0.036));
    s.push(R('steel', 0.366, 0.408, 0.468, 0.012));
    /* the bolt, nocked */
    s.push(R('steel', 0.400, 0.386, 0.400, 0.016));
    s.push(P('black', [[0.800, 0.380], [0.856, 0.394], [0.800, 0.408]]));
    /* limbs, swept forward from the riser */
    s.push(R('dark', 0.796, 0.352, 0.052, 0.104));
    s.push(P('black', [[0.812, 0.362], [0.944, 0.188], [0.968, 0.206], [0.836, 0.382]]));
    s.push(P('black', [[0.812, 0.446], [0.944, 0.620], [0.968, 0.602], [0.836, 0.426]]));
    /* the string */
    s.push(P('steel', [[0.950, 0.196], [0.958, 0.204], [0.410, 0.392], [0.404, 0.382]]));
    s.push(P('steel', [[0.950, 0.612], [0.958, 0.604], [0.410, 0.400], [0.404, 0.410]]));
    /* a small optic */
    s.push(R('black', 0.286, 0.316, 0.166, 0.056, 'cyl'));
    s.push(E('glass', 0.298, 0.344, 0.020, 0.026));
    return s;
  }

  /* ---- the minigun ----
     Six barrels on a rotor, a housing with no stock to speak of, and a
     belt coming in from below. It should look like it was taken off a
     vehicle, because it was. */
  function minigun() {
    var s = [];
    /* spade grips */
    s.push(P('black', [[0.168, 0.428], [0.226, 0.428], [0.214, 0.660], [0.156, 0.652]]));
    s.push(P('black', [[0.236, 0.436], [0.292, 0.436], [0.280, 0.664], [0.224, 0.656]]));
    s.push(R('dark', 0.150, 0.406, 0.160, 0.044));
    /* the housing */
    s.push(R('dark', 0.246, 0.320, 0.330, 0.226, 'cyl'));
    s.push(R('steel', 0.256, 0.328, 0.310, 0.028));
    s.push(E('black', 0.320, 0.432, 0.040, 0.054));         /* motor boss */
    s.push(E('steel', 0.320, 0.432, 0.022, 0.030));
    slats(s, 'black', 0.400, 0.352, 0.150, 0.164, 4, 0.3);
    /* the rotor and six barrels */
    s.push(R('steel', 0.572, 0.336, 0.058, 0.196, 'cyl'));
    var by = [0.352, 0.386, 0.420, 0.454, 0.488, 0.398];
    for (var b = 0; b < 6; b++) {
      s.push(R(b === 5 ? 'steel' : 'dark', 0.626, by[b], 0.300, 0.026, 'cyl'));
    }
    s.push(R('dark', 0.902, 0.340, 0.040, 0.192, 'cyl'));   /* clamp */
    s.push(E('black', 0.938, 0.398, 0.014, 0.020));
    /* the belt */
    s.push(P('black', [[0.290, 0.540], [0.400, 0.540], [0.420, 0.700], [0.310, 0.700]]));
    for (var lk = 0; lk < 4; lk++) {
      s.push(R('steel', 0.300 + lk * 0.006, 0.560 + lk * 0.034, 0.104, 0.018));
    }
    return s;
  }

  var SHAPES = {
    pistol: pistol(), smg: smg(), shotgun: shotgun(), rifle: rifle(),
    lmg: lmg(), sniper: sniper(), rail: rail(),
    revolver: revolver(), pdw: pdw(), autoshot: autoshot(),
    dmr: dmr(), crossbow: crossbow(), minigun: minigun()
  };

  /* Guns are long.

     Authoring them in a square box makes every number readable - a grip
     runs from 0.51 to 0.84, a barrel sits at 0.37 - but it also makes
     every gun about as tall as it is long, and a rifle drawn 1.3:1 in a
     card that is 2.5:1 can only ever fill half the card's width. Rather
     than re-type three hundred coordinates as thirds, the whole table is
     flattened once, here: a carbine comes out near 2.6:1 and a pump gun
     near 4.8:1, which is roughly what they are. */
  var YK = 0.50;
  (function flatten() {
    for (var k in SHAPES) {
      var parts = SHAPES[k];
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.e) { p.e[1] *= YK; p.e[3] *= YK; continue; }
        for (var j = 0; j < p.pts.length; j++) p.pts[j][1] *= YK;
      }
    }
  })();

  /* ------------------------------------------------------------------ *
   * Drawing
   * ------------------------------------------------------------------ */
  /* The extent every shape is measured against, taken across all seven
     together. Computed from the table so editing a shape cannot leave a
     hand-tuned constant behind to disagree with it. */
  function boxOf(parts) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    function hit(x, y) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.e) {
        hit(p.e[0] - p.e[2], p.e[1] - p.e[3]);
        hit(p.e[0] + p.e[2], p.e[1] + p.e[3]);
      } else {
        for (var j = 0; j < p.pts.length; j++) hit(p.pts[j][0], p.pts[j][1]);
      }
    }
    return { x0: x0, y0: y0, w: x1 - x0, h: y1 - y0 };
  }

  /* Two boxes, and the difference between them is the whole sizing rule.

     The SCALE comes from all seven measured together, so one pixel means
     the same length on every card and a pistol stays a pistol next to a
     machine gun. The CENTRING comes from the gun's own box, so a pistol
     sits in the middle of its card instead of hanging off the bottom left
     of the space a sniper rifle needs. */
  var UNION = null, GBOX = {};
  function bounds() {
    if (UNION) return UNION;
    var all = [];
    for (var k in SHAPES) all = all.concat(SHAPES[k]);
    UNION = boxOf(all);
    return UNION;
  }
  function gbox(shape) {
    if (!GBOX[shape]) GBOX[shape] = boxOf(SHAPES[shape]);
    return GBOX[shape];
  }

  function fit(shape, W, H, pad) {
    var u = bounds(), g = gbox(shape);
    var s = Math.min((W - pad * 2) / u.w, (H - pad * 2) / u.h);
    return { s: s, b: g,
             ox: (W - g.w * s) / 2 - g.x0 * s,
             oy: (H - g.h * s) / 2 - g.y0 * s };
  }

  function path(c, p, f) {
    c.beginPath();
    if (p.e) {
      c.ellipse(f.ox + p.e[0] * f.s, f.oy + p.e[1] * f.s,
                Math.max(0.6, p.e[2] * f.s), Math.max(0.6, p.e[3] * f.s), 0, 0, Z.TAU);
      return;
    }
    for (var i = 0; i < p.pts.length; i++) {
      var x = f.ox + p.pts[i][0] * f.s;
      var y = f.oy + p.pts[i][1] * f.s;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath();
  }

  function span(p, f) {
    var lo = 1e9, hi = -1e9, x0 = 1e9, x1 = -1e9;
    if (p.e) {
      lo = p.e[1] - p.e[3]; hi = p.e[1] + p.e[3];
      x0 = p.e[0] - p.e[2]; x1 = p.e[0] + p.e[2];
    } else {
      for (var j = 0; j < p.pts.length; j++) {
        if (p.pts[j][1] < lo) lo = p.pts[j][1];
        if (p.pts[j][1] > hi) hi = p.pts[j][1];
        if (p.pts[j][0] < x0) x0 = p.pts[j][0];
        if (p.pts[j][0] > x1) x1 = p.pts[j][0];
      }
    }
    var a = f.oy + lo * f.s, b = f.oy + hi * f.s;
    if (b - a < 1) b = a + 1;
    return { y0: a, y1: b, x0: f.ox + x0 * f.s, x1: f.ox + x1 * f.s };
  }

  /* Walnut. Dark lines with a light one between them, running the length
     of the part and clipped to it, which is the difference between a
     brown rectangle and a piece of wood. */
  function grain(c, p, f, sp) {
    c.save();
    path(c, p, f);
    c.clip();
    var h = sp.y1 - sp.y0, w = sp.x1 - sp.x0;
    c.lineWidth = Math.max(0.7, h * 0.05);
    for (var i = 0; i < 6; i++) {
      var t = (i + 0.6) / 6.6;
      c.strokeStyle = i % 3 === 1 ? 'rgba(236,200,154,.17)' : 'rgba(56,30,12,.26)';
      c.beginPath();
      var y = sp.y0 + h * t;
      c.moveTo(sp.x0 - 2, y);
      c.bezierCurveTo(sp.x0 + w * 0.30, y - h * 0.07,
                      sp.x0 + w * 0.62, y + h * 0.07,
                      sp.x1 + 2, y - h * 0.02);
      c.stroke();
    }
    c.restore();
  }

  G.draw = function (c, shape, W, H) {
    if (!SHAPES[shape]) shape = 'rifle';
    var parts = SHAPES[shape];
    var f = fit(shape, W, H, Math.max(2, W * 0.018));
    var gTop = f.oy + f.b.y0 * f.s, gH = (f.b.h * f.s) || 1;

    c.save();
    c.lineJoin = 'round';

    /* One pass for the dark keyline under everything, then the parts over
       it. Stroking each part on top would draw a line down every join
       inside the gun and turn it into an exploded diagram. */
    c.strokeStyle = 'rgba(6,8,10,.9)';
    c.lineWidth = Math.max(1.5, f.s * 0.020);
    for (var k = 0; k < parts.length; k++) {
      if (parts[k].fl === 'etch') continue;   /* a groove has no outline */
      path(c, parts[k], f);
      c.stroke();
    }

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var m = MAT[p.mat] || MAT.steel;
      var sp = span(p, f);
      if (p.fl === 'etch') {
        /* a cut, not a part: the shadow down in the groove, and the lit
           edge of the metal standing proud on its far side */
        c.fillStyle = 'rgba(7,9,11,.40)';
        path(c, p, f);
        c.fill();
        c.save();
        c.translate(Math.max(0.5, f.s * 0.004), 0);
        c.fillStyle = 'rgba(232,236,242,.10)';
        path(c, p, f);
        c.fill();
        c.restore();
        continue;
      }
      /* how deep into the gun's own shadow this part sits */
      var k0 = Z.clamp01((sp.y0 - gTop) / gH) * 0.82;
      var k1 = Z.clamp01((sp.y1 - gTop) / gH) * 0.82;
      var g = c.createLinearGradient(0, sp.y0, 0, sp.y1);
      if (p.fl === 'cyl') {
        /* a round thing: the lit band sits below the top edge and the
           turn into shadow is much faster */
        g.addColorStop(0, tone(m[1], k0));
        g.addColorStop(0.20, tone(m[0], k0 + (k1 - k0) * 0.20));
        g.addColorStop(0.52, tone(m[2], k0 + (k1 - k0) * 0.52));
        g.addColorStop(1, tone(m[3], k1));
      } else {
        g.addColorStop(0, tone(m[0], k0));
        g.addColorStop(0.24, tone(m[1], k0 + (k1 - k0) * 0.24));
        g.addColorStop(0.66, tone(m[2], k0 + (k1 - k0) * 0.66));
        g.addColorStop(1, tone(m[3], k1));
      }
      c.fillStyle = g;
      path(c, p, f);
      c.fill();
      if (p.fl === 'grain') grain(c, p, f, sp);
    }

    /* ---- the rim ----

       Everything above shades each part down its own height, which gives
       a gun volume but leaves the whole object the same darkness as the
       card behind it - so thirteen dark silhouettes on a dark list all
       merge at a glance. A single lit edge along the top of the WHOLE
       outline fixes that, and it has to be the whole outline rather than
       per part: lighting each part's top edge draws a bright line down
       every internal join and turns the gun into an exploded diagram,
       which is the same reason the keyline above is one pass.

       Built by filling the silhouette, then punching the same silhouette
       out of it shifted down a couple of pixels. What survives is the
       sliver along the top - exactly where a light above would catch. */
    var lift = Math.max(1, f.s * 0.016);
    var rim = Z.canvas(W, H);
    var rc = rim.getContext('2d');
    rc.fillStyle = '#FFFFFF';
    for (var r1 = 0; r1 < parts.length; r1++) {
      if (parts[r1].fl === 'etch') continue;
      path(rc, parts[r1], f); rc.fill();
    }
    rc.globalCompositeOperation = 'destination-out';
    rc.save();
    rc.translate(0, lift);
    for (var r2 = 0; r2 < parts.length; r2++) {
      if (parts[r2].fl === 'etch') continue;
      path(rc, parts[r2], f); rc.fill();
    }
    rc.restore();
    /* a cool daylight rim rather than pure white, which reads as plastic */
    rc.globalCompositeOperation = 'source-in';
    rc.fillStyle = 'rgb(226,236,248)';
    rc.fillRect(0, 0, W, H);
    rc.globalCompositeOperation = 'source-over';
    c.globalAlpha = 0.5;
    c.drawImage(rim, 0, 0);
    c.globalAlpha = 1;

    c.restore();
  };

  /* The drawing is cached; the ELEMENT never is.

     A canvas is a node, and a node is in exactly one place in the
     document. Handing the same cached canvas to the rack on the world
     screen and to the arsenal list inside the console does not put the
     gun in both: it moves it to whichever asked last, and the first one
     silently empties. So the bitmap is kept and blitted into a new
     element per call, which costs one drawImage. */
  var cache = {};
  function bitmap(shape, w, h) {
    var key = shape + ':' + w + 'x' + h;
    if (cache[key]) return cache[key];
    var cv = Z.canvas(w, h);
    G.draw(cv.getContext('2d'), shape, w, h);
    cache[key] = cv;
    return cv;
  }

  G.get = function (shape, w, h) {
    var src = bitmap(shape, w * 2, h * 2);
    var cv = Z.canvas(w * 2, h * 2);
    cv.getContext('2d').drawImage(src, 0, 0);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    return cv;
  };

})(window.Z);
