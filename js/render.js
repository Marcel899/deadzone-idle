/* Deadzone - the renderer.

   Draw order, and why:
     terrain      baked per chunk in full daylight, cached, blitted
     decals       blood, scorch, tracks - flat on the ground
     shadows      every body's contact shadow, in one pass, so a near
                  sprite is never dimmed by a far body's shadow
     bodies       props, structures, zombies, the survivor - one list,
                  sorted by world y, which is the depth axis
     effects      tracers, bursts, floating numbers
     light        a single darkness sheet with the lamps punched out of it
     fog          undiscovered ground
     air          ground mist, ash, vignette

   Terrain is baked lit, not shaded, and the whole frame is graded at the
   end. That is what lets a floodlight actually light the road under it
   instead of just drawing a yellow circle on top of a grey one. */
(function (Z) {
  'use strict';

  var R = Z.render = {};
  var W, H, ctx, cam, wd;

  /* Props and structures bake at this scale; characters bake larger and
     carry their own `ppm`, so nothing here may assume one number. */
  var PPM = 58;
  /* How many pixels of bitmap one metre of ground is baked at.

     It was a flat 24, and the camera runs from 15 to 74 pixels a metre -
     so at anything past halfway in it was upscaling a bitmap by two or
     three times, and every sub-cell of ground detail came out as a fat
     soft square. The ground looked like a low-resolution photograph of
     ground, which is exactly what it was.

     Tied to the quality preset instead, so the resolution rises with the
     other settings and a phone on Low still bakes small fast chunks. */
  /* TILE_PX is the space the ground is DRAWN in and never changes.
     TILE_RES is how many real pixels that space is rasterised at.

     Keeping them separate matters. Every grass blade, pebble, crack and
     bare patch in here is sized in absolute pixels against a 24-pixel
     tile, so simply enlarging the canvas made all of it proportionally
     SMALLER - a higher-resolution picture of barer ground, which is the
     opposite of the point. The bake scales the context instead, so the
     drawing is identical and only the rasterisation gets finer. */
  var TILE_PX = 24;
  var TILE_RES = 44;
  /* Pick the raster resolution from the zoom, not just the quality.

     TILE_PX is the space the ground is drawn in and never changes; this is
     how many real pixels that space is rasterised at. Last time only the
     quality setting fed it, which fixed the close-up case and quietly
     broke the far one: field of view is a setting spanning 74 pixels a
     metre down to 15, so at the widest view every chunk was baked at three
     times the resolution it would ever be shown at. That is 57MB of held
     canvas and triple the bake time, spent on detail no display can
     resolve.

     So: aim at roughly one baked pixel per displayed pixel, and snap to a
     short ladder of sizes. Snapping matters - a resolution that tracked
     the zoom continuously would throw the whole cache away on every frame
     of a zoom ease. The steps are far enough apart that the ease crosses
     at most one or two, and the field of view is a settings slider rather
     than a gesture, so that is rare anyway.

     The wait for `z` to settle is what stops a mode change (entering a
     building, opening the base view) from rebaking the world twice on its
     way to the zoom it actually wanted. */
  var TILE_LADDER = [16, 24, 32, 44, 56];
  var RES_BY_Q = { low: 0.68, med: 0.85, high: 1.0, ultra: 1.25 };

  function syncTileRes() {
    var cam = Z.cam;
    /* mid-ease: leave it alone until the camera knows where it is going */
    if (Math.abs(cam.z - cam.zt) > 0.5) return;
    var q = (Z.S && Z.S.quality) || 'high';
    var want = cam.z * (RES_BY_Q[q] || 1);
    /* nearest step, not the next one up: at the default view that is the
       difference between 44 and 56, which is four percent of sharpness
       against a third of the memory and the bake time. */
    var pick = TILE_LADDER[0], best = Infinity;
    for (var i = 0; i < TILE_LADDER.length; i++) {
      var d = Math.abs(TILE_LADDER[i] - want);
      if (d < best) { best = d; pick = TILE_LADDER[i]; }
    }
    if (pick === TILE_RES) return;
    TILE_RES = pick;
    R.invalidateAll();
  }

  /* ------------------------------------------------------------------ *
   * Terrain chunk cache
   * ------------------------------------------------------------------ */
  /* 'rgb(r,g,b)' strings, kept so the same colour is not rebuilt and
     reparsed for every cell that uses it. Bounded because the key space
     is 24-bit and a long session would otherwise hold every shade the
     terrain has ever drawn. */
  var styleCache = {}, styleCount = 0;
  function styleFor(key) {
    var v = styleCache[key];
    if (v !== undefined) return v;
    if (styleCount > 8192) { styleCache = {}; styleCount = 0; }
    v = 'rgb(' + ((key >> 16) & 255) + ',' + ((key >> 8) & 255) + ',' + (key & 255) + ')';
    styleCache[key] = v; styleCount++;
    return v;
  }

  var chunks = {};                 /* index -> {cv, used} */
  var frameSeq = 0;                /* ticks once per drawn frame */
  /* How many baked chunks to keep. Sized so the memory held stays about
     the same whatever resolution they are baked at - four times the
     pixels each means a quarter as many of them. */
  var CHUNK_MAX = 190;
  function chunkCap() {
    var k = (24 / TILE_RES);
    return Math.max(48, Math.min(190, Math.round(190 * k * k * 1.4)));
  }

  /* Evict the chunk nobody has looked at for longest - and never one that
     is on screen this frame.

     This used to be a plain insertion-ordered list, which is not an LRU at
     all: it evicts by age, so the ground under your feet goes first if it
     happened to be baked a while ago. Pace back and forth across a
     compound and the working set is wider than the cache, so every pass
     threw away chunks that were still being drawn - they came back as a
     flat placeholder square for a frame or two, which is the flicker.

     At the lowest zoom seventy chunks are visible against a cache of
     seventy-nine, so "don't evict what's visible" is not a nicety; it is
     the only thing keeping the two numbers apart. If everything resident
     is visible, hold above the cap for a frame rather than throw away
     something being drawn - a brief overshoot costs a few megabytes,
     while evicting on screen costs a visible hole in the world. */
  function evictChunk() {
    var oldest = -1, oldestUse = Infinity;
    for (var k in chunks) {
      var u = chunks[k].used;
      if (u === frameSeq) continue;          /* drawn this frame: off limits */
      if (u < oldestUse) { oldestUse = u; oldest = k; }
    }
    if (oldest !== -1) delete chunks[oldest];
  }
  var avgCol = {};                 /* index -> flat fallback colour */

  R.invalidateChunk = function (tx, ty) {
    var cx = Math.floor(tx / Z.world.CHUNK), cy = Math.floor(ty / Z.world.CHUNK);
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        var k = (cy + dy) * Z.world.CW + (cx + dx);
        if (chunks[k]) { delete chunks[k]; delete avgCol[k]; }
      }
    }
  };
  R.invalidateAll = function () { chunks = {}; avgCol = {}; };


  function dayCol(t) {
    var p = Z.world.PAL[t] || Z.world.PAL[1];
    return p.d;
  }

  /* One chunk of ground, baked in full daylight. Tiles are discrete but
     the picture must not be: neighbouring terrain types are feathered into
     each other and a layer of large soft mottling is laid over the top, so
     what you see is a surface rather than a grid of coloured squares. */
  /* One stone: a lit cap, a body, and the shadow it casts on the ground.
     Three ellipses is all a pebble needs at this size, and having them in
     one place is what stops gravel, dirt and grass each inventing their
     own. */
  function stone(c, x, y, r) {
    c.fillStyle = 'rgba(8,10,10,.20)';
    c.beginPath(); c.ellipse(x + r * 0.28, y + r * 0.42, r * 1.05, r * 0.5, 0, 0, Z.TAU); c.fill();
    c.fillStyle = 'rgba(96,94,88,.52)';
    c.beginPath(); c.ellipse(x, y, r, r * 0.78, 0, 0, Z.TAU); c.fill();
    c.fillStyle = 'rgba(190,190,180,.36)';
    c.beginPath(); c.ellipse(x - r * 0.18, y - r * 0.24, r * 0.58, r * 0.4, 0, 0, Z.TAU); c.fill();
  }

  function bakeChunk(ci) {
    var CH = Z.world.CHUNK, CWn = Z.world.CW;
    var cx = (ci % CWn) * CH, cy = Math.floor(ci / CWn) * CH;
    var size = CH * TILE_RES;
    var cv = Z.canvas(size, size);
    var c = cv.getContext('2d');
    /* draw in 24-pixel tile space, rasterise at whatever the preset asks */
    c.scale(TILE_RES / TILE_PX, TILE_RES / TILE_PX);
    var T = Z.world.T;
    var x, y, tx, ty, t, px, py, n;

    function typeAt(ax, ay) {
      return Z.world.inside(ax, ay) ? Z.world.terrain[Z.world.idx(ax, ay)] : T.WATER;
    }

    /* --- the ground itself -------------------------------------------
       Painted in sub-cells, not tiles.

       One flat rectangle per tile is why the ground came out as a grid of
       squares: the eye finds a 24px repeat instantly however subtly you
       tint each one. So every tile is broken into SUB x SUB cells and each
       cell gets its own tone, built from three scales of noise - a broad
       field that makes whole regions richer or barer, a mid patchiness,
       and a fine grain. Nothing lands on the tile boundary, so there is no
       boundary to see.

       Boundaries between two surfaces are decided per cell as well. A
       gradient between two colours reads as an airbrush; real ground
       interlocks, so a cell near an edge takes the neighbour's material
       when the noise says so. Grass frays into dirt, dirt creeps into
       sand, and the seam is ragged the way a seam should be. */
    var Q = Z.qual();
    var SUB = Q.sub;
    var SP = TILE_PX / SUB;

    /* The colour of one sub-cell, including how much of the neighbouring
       surface has crept into it.

       Returning a TYPE made every cell wholly one thing or wholly the
       other, and at six pixels a cell that reads as a staircase. So it
       returns a colour instead: ragged where the noise crosses the
       threshold, with a cell's width of mixing either side of the
       crossing so the edge frays instead of stepping. The jitter runs at
       roughly two cycles per tile, which is the scale grass actually
       gives way to earth at. */
    function cellCol(tx2, ty2, fx, fy) {
      var t0 = typeAt(tx2, ty2);
      var c0 = dayCol(t0);
      var dx = fx < 0.5 ? fx : 1 - fx;
      var dy = fy < 0.5 ? fy : 1 - fy;
      if (dx > 0.46 && dy > 0.46) return c0;
      var wx = tx2 + fx, wy = ty2 + fy;
      var sx = fx < 0.5 ? -1 : 1, sy = fy < 0.5 ? -1 : 1;
      var tn, d;
      if (dx <= dy) { tn = typeAt(tx2 + sx, ty2); d = dx; }
      else { tn = typeAt(tx2, ty2 + sy); d = dy; }
      if (tn === t0) return c0;
      /* Two octaves, because one gives a wavy line and the eye reads a
         wavy line as a line. The coarse octave decides where the material
         reaches across; the fine one eats notches out of that reach, which
         is what stops it looking drawn. */
      var jitter = Z.fbm(wx * 5.5, wy * 5.5, 907, 3) * 0.72 +
                   Z.fbm(wx * 15.0, wy * 15.0, 911, 2) * 0.28;
      /* how far past the crossing, softened over about one cell */
      var w = (jitter - (0.30 + d * 1.18)) * 4.5;
      if (w <= 0) return c0;
      return Z.mix(c0, dayCol(tn), Z.clamp01(w));
    }

    /* A tile in the middle of a field is one flat material and four
       cells across it is plenty. A tile on a boundary is where the whole
       picture is decided, and four cells across quantises the fray into
       six-pixel blocks - which is precisely the staircase you see when
       grass meets dirt. So boundary tiles get resolved much finer, and
       since they are a minority of any chunk the bake barely notices.

       The grain lattice stays pinned to SUB regardless, or the speckle
       would visibly change scale at the seam between a refined tile and
       its neighbour. */
    var ESUB = Math.max(SUB, Q.esub || SUB);
    var tone = new Float32Array(SUB * SUB);      /* reused every tile */
    for (y = 0; y < CH; y++) {
      for (x = 0; x < CH; x++) {
        tx = cx + x; ty = cy + y;
        px = x * TILE_PX; py = y * TILE_PX;
        var t0b = typeAt(tx, ty);
        var edge = typeAt(tx + 1, ty) !== t0b || typeAt(tx - 1, ty) !== t0b ||
                   typeAt(tx, ty + 1) !== t0b || typeAt(tx, ty - 1) !== t0b;
        var su = edge ? ESUB : SUB, sp = TILE_PX / su;

        /* The tone - region, patch and grain - is computed on the COARSE
           lattice even when the cells are fine, because at a fifth of a
           tile the 0.040 and 0.210 octaves have not moved enough to see
           and the grain is pinned to that lattice by definition. Six noise
           octaves per fine cell was most of what a refined tile cost, and
           all of it was spent arriving at the number next door. */
        for (var ky = 0; ky < SUB; ky++) {
          for (var kx = 0; kx < SUB; kx++) {
            var wx3 = tx + (kx + 0.5) / SUB, wy3 = ty + (ky + 0.5) / SUB;
            var broad = Z.fbm(wx3 * 0.040, wy3 * 0.040, 313, 3) - 0.5;
            var patch = Z.fbm(wx3 * 0.210, wy3 * 0.210, 419, 3) - 0.5;
            var grain = Z.hash2(Math.round(wx3 * SUB), Math.round(wy3 * SUB), 77) - 0.5;
            tone[ky * SUB + kx] = (broad * 0.62 + patch * 0.58 + grain * 0.34) * 0.34;
          }
        }

        /* Runs, not cells.

           This pass was measured at 89% of the whole bake, and most of
           that was not the noise - it was one `fillStyle` string built and
           parsed per cell, plus one `fillRect` per cell, four thousand
           times over. Two things make almost all of it disappear and
           neither changes a pixel:

           The tone lattice is SUB across while the cells are ESUB across,
           so away from a material boundary several fine cells in a row
           resolve to *exactly* the same colour. Emitting one rect per run
           of equal colour instead of one per cell is free accuracy.

           And `Z.shade` builds a new three-element array every call, which
           at four thousand calls a chunk is most of the allocation churn
           behind the occasional hundred-millisecond collection pause. The
           same arithmetic inline, into three locals, allocates nothing. */
        for (var sy2 = 0; sy2 < su; sy2++) {
          var ty2 = ((sy2 * SUB / su) | 0) * SUB;
          var rs = 0, rk = -1, rstyle = '';
          for (var sx2 = 0; sx2 <= su; sx2++) {
            var key = -1, style = '';
            if (sx2 < su) {
              var cc = cellCol(tx, ty, (sx2 + 0.5) / su, (sy2 + 0.5) / su);
              var k3 = tone[ty2 + ((sx2 * SUB / su) | 0)];
              var r3, g3, b3;
              if (k3 >= 0) {
                r3 = cc[0] + (255 - cc[0]) * k3;
                g3 = cc[1] + (255 - cc[1]) * k3;
                b3 = cc[2] + (255 - cc[2]) * k3;
              } else {
                var n3 = 1 + k3;            /* mix toward black */
                r3 = cc[0] * n3; g3 = cc[1] * n3; b3 = cc[2] * n3;
              }
              key = ((r3 | 0) << 16) | ((g3 | 0) << 8) | (b3 | 0);
              style = styleFor(key);
            }
            if (key !== rk) {
              if (rk !== -1) {
                c.fillStyle = rstyle;
                c.fillRect(px + rs * sp, py + sy2 * sp,
                           (sx2 - rs) * sp + 1, sp + 1);
              }
              rs = sx2; rk = key; rstyle = style;
            }
          }
        }
      }
    }

    /* --- the light on it ---------------------------------------------
       A very slow field over the whole map, warm where it catches and
       cool where it does not. This is depth: without it the ground is
       evenly lit everywhere and reads as paper. */
    for (y = 0; y < CH; y++) {
      for (x = 0; x < CH; x++) {
        tx = cx + x; ty = cy + y;
        px = x * TILE_PX; py = y * TILE_PX;
        for (var qy = 0; qy < 2; qy++) {
          for (var qx = 0; qx < 2; qx++) {
            var lx = tx + (qx + 0.5) / 2, ly = ty + (qy + 0.5) / 2;
            var v = Z.fbm(lx * 0.018, ly * 0.018, 613, 3) - 0.5;
            c.fillStyle = v > 0
              ? 'rgba(255,238,196,' + (v * 0.17).toFixed(3) + ')'
              : 'rgba(18,26,34,' + (-v * 0.20).toFixed(3) + ')';
            c.fillRect(px + qx * TILE_PX / 2, py + qy * TILE_PX / 2,
                       TILE_PX / 2 + 1, TILE_PX / 2 + 1);
          }
        }
      }
    }

    /* How lush the grass is at a point.

       This used to be one octave at 0.085, and 0.085 is a wavelength of
       about twelve tiles - which at any playable zoom is wider than the
       screen. Every blade in view therefore read the same number, and the
       meadow came out as one flat green no matter how much detail was
       scattered over it. A field that varies only over distances you
       cannot see is, from inside the game, a constant.

       So: the slow octave still decides which REGION is rich, and a second
       at roughly three tiles gives the variation you actually walk past. */
    function lushAt(wx, wy) {
      return Z.fbm(wx * 0.085, wy * 0.085, 761, 3) * 0.62 +
             Z.fbm(wx * 0.330, wy * 0.330, 769, 3) * 0.38;
    }

    /* --- surface detail, per tile type --- */
    for (y = 0; y < CH; y++) {
      for (x = 0; x < CH; x++) {
        tx = cx + x; ty = cy + y;
        t = typeAt(tx, ty);
        n = Z.hash2(tx, ty, 77);
        px = x * TILE_PX; py = y * TILE_PX;

        if (t === T.ROAD || t === T.ASPHALT) {
          /* worn wheel tracks - two darker bands where traffic ran */
          var along = isCenterX(tx) || isCenterY(ty);
          if (!along) {
            c.fillStyle = 'rgba(16,18,18,.10)';
            c.fillRect(px, py + TILE_PX * 0.18, TILE_PX + 1, TILE_PX * 0.2);
            c.fillRect(px, py + TILE_PX * 0.62, TILE_PX + 1, TILE_PX * 0.2);
          }
          /* patched repairs */
          if (n > 0.86) {
            c.fillStyle = 'rgba(28,30,32,.32)';
            c.fillRect(px + 2, py + 3, TILE_PX * 0.7, TILE_PX * 0.6);
          }
          /* cracks */
          if (n > 0.66) {
            c.strokeStyle = 'rgba(14,16,16,.40)';
            c.lineWidth = 1.2;
            c.beginPath();
            c.moveTo(px + n * TILE_PX, py);
            c.lineTo(px + (1 - n) * TILE_PX, py + TILE_PX * 0.55);
            c.lineTo(px + n * TILE_PX * 0.7, py + TILE_PX);
            c.stroke();
          }
          if (t === T.ASPHALT && isCenterX(tx) && (ty % 6 < 3)) {
            c.fillStyle = 'rgba(210,200,152,.30)';
            c.fillRect(px + TILE_PX * 0.42, py, TILE_PX * 0.16, TILE_PX);
          }

        } else if (t === T.WATER) {
          /* ripple bands, brighter where they catch the sky */
          for (var wv = 0; wv < 2; wv++) {
            var wy = py + TILE_PX * (0.2 + wv * 0.42 + n * 0.2);
            c.fillStyle = 'rgba(158,212,226,' + (0.05 + n * 0.07) + ')';
            c.fillRect(px + TILE_PX * 0.08, wy, TILE_PX * 0.84, 1.8);
          }

        } else if (t === T.GRASS) {
          /* How lush this patch is, from the same slow field the ground
             tone came off - so the thick grass grows where the ground
             already looks rich, and the bare patches are bare in both
             passes rather than disagreeing with each other.

             The field is sampled AT EACH BLADE, not once per tile. Reading
             it once per tile and deriving a blade count from it is what put
             a chequerboard of denser and thinner squares across every
             meadow: the count can only step at a tile edge, and a step in
             density across a straight line is a tile you can see. Drawing
             a fixed number of candidates and rejecting each one against
             the field where it actually stands costs the same and has no
             edges in it at all. */

          /* bare earth showing through where the grass is thin */
          for (var bp = 0; bp < 3; bp++) {
            var efx = Z.hash2(tx * 7 + bp, ty, 53), efy = Z.hash2(tx, ty * 7 + bp, 59);
            var elu = lushAt(tx + efx, ty + efy);
            if (elu >= 0.42) continue;
            var bn = (0.42 - elu) * 2.4;
            var er = 2 + Z.hash2(tx + bp, ty + bp, 61) * 5;
            c.fillStyle = 'rgba(122,98,64,' + (0.10 + bn * 0.16).toFixed(3) + ')';
            c.beginPath();
            c.ellipse(px + efx * TILE_PX, py + efy * TILE_PX, er, er * 0.74, 0, 0, Z.TAU);
            c.fill();
          }

          /* blades - in three tones, leaning together */
          var cand = Math.max(2, Math.round(11 * Q.detail));
          for (var g2 = 0; g2 < cand; g2++) {
            var gfx = Z.hash2(tx * 3 + g2, ty, 41), gfy = Z.hash2(tx, ty * 3 + g2, 43);
            var lu = lushAt(tx + gfx, ty + gfy);
            /* thinner ground sheds blades first */
            if (Z.hash2(tx * 3 + g2, ty * 3 + g2, 73) > 0.20 + lu * 0.88) continue;
            var gx = px + gfx * TILE_PX, gy = py + gfy * TILE_PX;
            var tall = 3 + Z.hash2(tx + g2, ty, 47) * 5 * (0.6 + lu * 0.8);
            var lean = (Z.hash2(tx + g2, ty + g2, 71) - 0.5) * 3;
            var tone = g2 % 3;
            c.strokeStyle = tone === 0 ? 'rgba(158,180,96,.46)'
                          : tone === 1 ? 'rgba(104,132,66,.42)'
                                       : 'rgba(58,78,44,.40)';
            c.lineWidth = 1.1;
            c.beginPath();
            c.moveTo(gx, gy);
            c.quadraticCurveTo(gx + lean * 0.4, gy - tall * 0.6,
                               gx + lean, gy - tall);
            c.stroke();
          }

          /* Tussocks. A meadow drawn as an even scatter of single blades
             is, at any real zoom, a field of noise - the eye is given
             nothing with a size to it and calls the whole thing flat, even
             when the pixels say otherwise. Grass in life grows in clumps
             with shadow pooled under them, and a clump is a shape you can
             see. Two or three a tile is the difference between a green
             rectangle and a meadow. */
          var tuss = Math.max(1, Math.round(3 * Q.detail));
          for (var tu = 0; tu < tuss; tu++) {
            var ufx = Z.hash2(tx * 13 + tu, ty, 401), ufy = Z.hash2(tx, ty * 13 + tu, 409);
            var ulu = lushAt(tx + ufx, ty + ufy);
            if (Z.hash2(tx * 13 + tu, ty * 13 + tu, 419) > ulu * 0.9) continue;
            var ux = px + ufx * TILE_PX, uy = py + ufy * TILE_PX;
            var ur = 2.6 + Z.hash2(tx + tu, ty, 421) * 3.4;
            /* shadow pooled at the base */
            c.fillStyle = 'rgba(28,40,24,.26)';
            c.beginPath(); c.ellipse(ux, uy + 0.8, ur * 1.1, ur * 0.5, 0, 0, Z.TAU); c.fill();
            /* the fan */
            var fanN = 5 + ((Z.hash2(tx + tu, ty + tu, 431) * 3) | 0);
            for (var fb = 0; fb < fanN; fb++) {
              var sp2 = (fb / (fanN - 1) - 0.5) * 2;             /* -1 .. 1 */
              var fh = ur * (2.4 - Math.abs(sp2) * 0.9);
              c.strokeStyle = fb % 2 ? 'rgba(148,176,92,.52)' : 'rgba(92,124,60,.50)';
              c.lineWidth = 1.2;
              c.beginPath();
              c.moveTo(ux, uy);
              c.quadraticCurveTo(ux + sp2 * ur * 0.7, uy - fh * 0.62,
                                 ux + sp2 * ur * 1.7, uy - fh);
              c.stroke();
            }
            /* a lit tip on the windward side */
            c.strokeStyle = 'rgba(196,214,138,.34)';
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(ux - ur * 0.3, uy - ur * 0.4);
            c.lineTo(ux - ur * 1.5, uy - ur * 2.0);
            c.stroke();
          }

          /* Dry patches: where the field has gone over to straw. This is
             the mid-scale tone the meadow was missing - broad enough to
             read as ground rather than grain, and keyed off its own field
             so it does not simply repeat the lushness map. */
          var dry = Z.fbm(tx * 0.30, ty * 0.30, 787, 3);
          if (dry > 0.58) {
            c.fillStyle = 'rgba(196,186,112,' +
                          ((dry - 0.58) * 0.52).toFixed(3) + ')';
            c.fillRect(px, py, TILE_PX + 1, TILE_PX + 1);
            var straws = Math.max(1, Math.round(4 * Q.detail));
            for (var st2 = 0; st2 < straws; st2++) {
              var sfx = Z.hash2(tx * 17 + st2, ty, 439) * TILE_PX;
              var sfy = Z.hash2(tx, ty * 17 + st2, 443) * TILE_PX;
              c.strokeStyle = 'rgba(184,168,102,.44)';
              c.lineWidth = 1;
              c.beginPath();
              c.moveTo(px + sfx, py + sfy);
              c.lineTo(px + sfx + (Z.hash2(tx + st2, ty, 449) - 0.5) * 5,
                       py + sfy - 3 - Z.hash2(tx, ty + st2, 457) * 4);
              c.stroke();
            }
          }

          /* the odd clump that has gone to seed, and the odd stone */
          if (n > 0.80) {
            var cxp = px + n * TILE_PX * 0.7, cyp = py + (1 - n) * TILE_PX * 0.7;
            c.fillStyle = 'rgba(176,186,112,.30)';
            c.beginPath();
            c.ellipse(cxp, cyp, 3.4, 2.2, 0, 0, Z.TAU);
            c.fill();
          }
          if (n > 0.93) stone(c, px + n * TILE_PX * 0.6, py + n * TILE_PX * 0.4,
                              1.8 + n * 2.2);

        } else if (t === T.GRAVEL) {
          /* pebbles, each with a lit top and a dark base */
          var pebbles = Math.max(2, Math.round(5 * Q.detail));
          for (var pb = 0; pb < pebbles; pb++) {
            var bx = px + Z.hash2(tx * 5 + pb, ty, 13) * TILE_PX;
            var by = py + Z.hash2(tx, ty * 5 + pb, 29) * TILE_PX;
            var bs = 1.4 + Z.hash2(tx + pb, ty + pb, 31) * 2.6;
            c.fillStyle = 'rgba(206,204,186,.16)';
            c.beginPath(); c.ellipse(bx, by - 0.6, bs, bs * 0.7, 0, 0, Z.TAU); c.fill();
            c.fillStyle = 'rgba(10,12,12,.22)';
            c.beginPath(); c.ellipse(bx, by + 0.7, bs, bs * 0.5, 0, 0, Z.TAU); c.fill();
          }

        } else if (t === T.DIRT || t === T.CLEARED) {
          /* Bare ground is most of the map, so it has to carry itself.

             It used to be six faint clods a tile at thirteen percent
             alpha, which over a field forty metres across averages out to
             a flat tan rectangle - and a flat rectangle is exactly what
             the eye complains about even when it cannot say why. So: five
             things at five scales. A broad mottle so no two square metres
             match, coarse grit, real clods with a lit top and a shadowed
             underside, dried cracks where a patch has baked hard, and the
             weeds and stones that always find bare earth.

             None of it is expensive. All of it is hash-driven off the
             tile coordinate, so it is stable between bakes and never
             tiles visibly - the same reason the ground tone underneath
             is built from three octaves rather than one. */
          var lean = t === T.CLEARED ? 0.55 : 1;

          /* 1. broad mottling - patches of lighter and darker earth */
          for (var mq = 0; mq < 4; mq++) {
            var mx2 = px + Z.hash2(tx * 5 + mq, ty, 131) * TILE_PX;
            var my2 = py + Z.hash2(tx, ty * 5 + mq, 137) * TILE_PX;
            var mr = TILE_PX * (0.22 + Z.hash2(tx + mq, ty + mq, 139) * 0.4);
            var up = Z.hash2(tx * 3 + mq, ty * 3, 149) > 0.5;
            c.fillStyle = up ? 'rgba(206,186,148,.10)' : 'rgba(78,62,44,.12)';
            c.beginPath();
            c.ellipse(mx2, my2, mr, mr * 0.72,
                      Z.hash2(tx + mq, ty, 151) * 3, 0, Z.TAU);
            c.fill();
          }

          /* 2. grit - the fine stuff, cheap and everywhere */
          var grit = Math.max(4, Math.round(22 * Q.detail * lean));
          for (var gq = 0; gq < grit; gq++) {
            var gx2 = px + Z.hash2(tx * 9 + gq, ty, 163) * TILE_PX;
            var gy2 = py + Z.hash2(tx, ty * 9 + gq, 167) * TILE_PX;
            var gv = Z.hash2(tx + gq, ty + gq, 173);
            c.fillStyle = gv > 0.55 ? 'rgba(222,208,178,.22)' : 'rgba(46,38,28,.20)';
            c.fillRect(gx2, gy2, 1 + gv, 1 + gv * 0.8);
          }

          /* 3. clods, lit from above */
          var clods = Math.max(2, Math.round((t === T.CLEARED ? 4 : 8) * Q.detail));
          for (var cl = 0; cl < clods; cl++) {
            var dx2 = px + Z.hash2(tx * 4 + cl, ty, 13) * TILE_PX;
            var dy2 = py + Z.hash2(tx, ty * 4 + cl, 29) * TILE_PX;
            var ds = 1.8 + Z.hash2(tx + cl, ty, 19) * 4.2;
            c.fillStyle = 'rgba(12,10,8,.26)';
            c.beginPath(); c.ellipse(dx2, dy2 + 1, ds, ds * 0.5, 0, 0, Z.TAU); c.fill();
            c.fillStyle = 'rgba(158,138,104,.30)';
            c.beginPath(); c.ellipse(dx2, dy2, ds, ds * 0.62, 0, 0, Z.TAU); c.fill();
            c.fillStyle = 'rgba(226,212,182,.26)';
            c.beginPath();
            c.ellipse(dx2 - ds * 0.22, dy2 - ds * 0.24, ds * 0.54, ds * 0.32, 0, 0, Z.TAU);
            c.fill();
          }

          /* 4. where a patch has dried and split */
          if (n > 0.55 && Q.detail > 0.5) {
            var ccx = px + Z.hash2(tx, ty, 181) * TILE_PX;
            var ccy = py + Z.hash2(ty, tx, 191) * TILE_PX;
            c.strokeStyle = 'rgba(38,30,22,.30)';
            c.lineWidth = 0.9;
            for (var ck = 0; ck < 3; ck++) {
              var ca = Z.hash2(tx + ck, ty, 193) * Z.TAU;
              var cl2 = TILE_PX * (0.18 + Z.hash2(tx, ty + ck, 197) * 0.3);
              c.beginPath();
              c.moveTo(ccx, ccy);
              c.lineTo(ccx + Math.cos(ca) * cl2 * 0.6,
                       ccy + Math.sin(ca) * cl2 * 0.6);
              c.lineTo(ccx + Math.cos(ca + 0.5) * cl2,
                       ccy + Math.sin(ca + 0.5) * cl2);
              c.stroke();
            }
          }

          /* 5. stones work their way up, and something green always
             finds a foothold */
          if (n > 0.52) stone(c, px + n * TILE_PX * 0.8, py + (1 - n) * TILE_PX * 0.8,
                              1.8 + n * 3.2);
          if (n > 0.78) stone(c, px + (1 - n) * TILE_PX * 0.6, py + n * TILE_PX * 0.5,
                              1.4 + n * 1.8);
          if (n > 0.66) {
            var wx3 = px + (1 - n) * TILE_PX * 0.7, wy3 = py + n * TILE_PX * 0.7;
            var blades = Math.max(2, Math.round(5 * Q.detail));
            for (var wd2 = 0; wd2 < blades; wd2++) {
              c.strokeStyle = wd2 % 2 ? 'rgba(132,150,88,.40)' : 'rgba(96,114,62,.36)';
              c.lineWidth = 1.1;
              c.beginPath();
              c.moveTo(wx3 + wd2 * 1.5, wy3);
              c.quadraticCurveTo(wx3 + wd2 * 1.5 + (wd2 - 2) * 0.8, wy3 - 2.6,
                                 wx3 + wd2 * 1.5 + (wd2 - 2) * 1.8, wy3 - 4.4 - wd2 * 0.7);
              c.stroke();
            }
          }

        } else if (t === T.PAVED || t === T.SIDEWALK || t === T.PLAZA) {
          /* Concrete is poured in slabs, and the joints between them are
             the only reason a pavement reads as a pavement rather than a
             grey rectangle. The joint lattice is keyed to the tile grid so
             it runs unbroken from chunk to chunk - a plaza lays smaller
             pavers, two to a tile, which is what makes it read as a plaza
             standing next to an ordinary path.

             Then the things that happen to concrete over a few unmaintained
             years: it stains, it cracks, corners spall off, and anything
             green that can hold on in a 4mm gap does. */
          var sub = t === T.PLAZA ? 2 : 1;
          var sw = TILE_PX / sub;
          for (var jy2 = 0; jy2 < sub; jy2++) {
            for (var jx2 = 0; jx2 < sub; jx2++) {
              var sx3 = px + jx2 * sw, sy3 = py + jy2 * sw;
              var sk = Z.hash2(tx * 2 + jx2, ty * 2 + jy2, 241);
              /* no two pours cured the same shade */
              c.fillStyle = sk > 0.5
                ? 'rgba(214,212,202,' + (0.03 + sk * 0.05).toFixed(3) + ')'
                : 'rgba(28,30,30,' + (0.03 + sk * 0.06).toFixed(3) + ')';
              c.fillRect(sx3, sy3, sw, sw);
              /* the joint: a dark gap with a lit lip on its far side */
              c.fillStyle = 'rgba(18,20,20,.30)';
              c.fillRect(sx3, sy3, sw, 1.2);
              c.fillRect(sx3, sy3, 1.2, sw);
              c.fillStyle = 'rgba(226,226,216,.13)';
              c.fillRect(sx3, sy3 + 1.2, sw, 0.8);
              c.fillRect(sx3 + 1.2, sy3, 0.8, sw);
              /* a corner that has spalled away */
              if (sk > 0.86) {
                c.fillStyle = 'rgba(122,116,104,.30)';
                c.beginPath();
                c.moveTo(sx3 + sw, sy3 + sw);
                c.lineTo(sx3 + sw - 3 - sk * 3, sy3 + sw);
                c.lineTo(sx3 + sw, sy3 + sw - 2 - sk * 3);
                c.closePath(); c.fill();
              }
            }
          }
          /* a crack wandering across the slab */
          if (n > 0.6 && Q.detail > 0.5) {
            c.strokeStyle = 'rgba(22,24,24,.34)';
            c.lineWidth = 1;
            var kx = px + Z.hash2(tx, ty, 251) * TILE_PX * 0.6 + TILE_PX * 0.2;
            var ky = py + 2;
            c.beginPath();
            c.moveTo(kx, ky);
            for (var kk = 1; kk <= 3; kk++) {
              c.lineTo(kx + (Z.hash2(tx + kk, ty, 257) - 0.5) * TILE_PX * 0.45,
                       ky + kk * (TILE_PX / 3));
            }
            c.stroke();
          }
          /* stains, and the weeds that live in the joints */
          if (n > 0.4) {
            c.fillStyle = 'rgba(58,54,44,.10)';
            c.beginPath();
            c.ellipse(px + n * TILE_PX * 0.7, py + (1 - n) * TILE_PX * 0.7,
                      TILE_PX * 0.3, TILE_PX * 0.2, n * 3, 0, Z.TAU);
            c.fill();
          }
          if (n > 0.72) {
            c.strokeStyle = 'rgba(106,126,70,.42)';
            c.lineWidth = 1;
            var gx3 = px + Z.hash2(tx, ty, 263) * TILE_PX;
            for (var gb = 0; gb < 3; gb++) {
              c.beginPath();
              c.moveTo(gx3 + gb * 1.3, py + 1);
              c.lineTo(gx3 + gb * 1.3 + (gb - 1) * 1.6, py + 1 - 3 - gb * 0.8);
              c.stroke();
            }
          }

        } else if (t === T.BALLAST) {
          /* Track ballast is crushed, not rounded - every face is flat and
             catches the light differently, which is why it is drawn as
             angular chips rather than the soft pebbles gravel uses. */
          var chips = Math.max(4, Math.round(14 * Q.detail));
          for (var bc = 0; bc < chips; bc++) {
            var bx2 = px + Z.hash2(tx * 7 + bc, ty, 271) * TILE_PX;
            var by2 = py + Z.hash2(tx, ty * 7 + bc, 277) * TILE_PX;
            var bs2 = 1.3 + Z.hash2(tx + bc, ty + bc, 281) * 2.4;
            var ba = Z.hash2(tx + bc, ty, 283) * Z.TAU;
            c.save();
            c.translate(bx2, by2); c.rotate(ba);
            c.fillStyle = 'rgba(8,10,10,.26)';
            c.fillRect(-bs2, -bs2 * 0.4 + 1, bs2 * 2, bs2 * 0.9);
            c.fillStyle = Z.hash2(tx, ty + bc, 293) > 0.5
              ? 'rgba(178,176,168,.26)' : 'rgba(126,122,116,.26)';
            c.beginPath();
            c.moveTo(-bs2, 0); c.lineTo(-bs2 * 0.3, -bs2 * 0.7);
            c.lineTo(bs2, -bs2 * 0.2); c.lineTo(bs2 * 0.4, bs2 * 0.6);
            c.closePath(); c.fill();
            c.restore();
          }

        } else if (t === T.PARKPATH) {
          /* Compacted fines, worn pale down the middle where feet go and
             loose at the edges where they do not. */
          c.fillStyle = 'rgba(224,214,190,.07)';
          c.fillRect(px + TILE_PX * 0.18, py, TILE_PX * 0.64, TILE_PX);
          var fines = Math.max(4, Math.round(16 * Q.detail));
          for (var pf = 0; pf < fines; pf++) {
            var fx2 = px + Z.hash2(tx * 11 + pf, ty, 307) * TILE_PX;
            var fy2 = py + Z.hash2(tx, ty * 11 + pf, 311) * TILE_PX;
            var fv = Z.hash2(tx + pf, ty + pf, 313);
            c.fillStyle = fv > 0.5 ? 'rgba(232,222,198,.20)' : 'rgba(76,66,52,.20)';
            c.fillRect(fx2, fy2, 1 + fv * 1.4, 1 + fv);
          }
          if (n > 0.7) stone(c, px + n * TILE_PX * 0.85, py + (1 - n) * TILE_PX * 0.8,
                             1.3 + n * 1.6);
        }
      }
    }

    /* --- shoreline ---
       Land that touches water gets a wet, darker margin and a pale line of
       dried silt just above it. Terrain is tile-resolution, so the edge is
       always going to be blocky; what softens it is the material change,
       not more blending. */
    for (y = 0; y < CH; y++) {
      for (x = 0; x < CH; x++) {
        tx = cx + x; ty = cy + y;
        if (typeAt(tx, ty) === T.WATER) continue;
        var touches = typeAt(tx + 1, ty) === T.WATER || typeAt(tx - 1, ty) === T.WATER ||
                      typeAt(tx, ty + 1) === T.WATER || typeAt(tx, ty - 1) === T.WATER;
        if (!touches) continue;
        px = x * TILE_PX; py = y * TILE_PX;
        /* wet mud, not grey concrete */
        c.fillStyle = 'rgba(46,38,26,.22)';
        c.fillRect(px, py, TILE_PX + 1, TILE_PX + 1);
        c.fillStyle = 'rgba(188,172,132,.11)';
        for (var si = 0; si < 4; si++) {
          var sx2 = px + Z.hash2(tx * 7 + si, ty, 83) * TILE_PX;
          var sy2 = py + Z.hash2(tx, ty * 7 + si, 89) * TILE_PX;
          c.fillRect(sx2, sy2, 3 + Z.hash2(tx + si, ty, 91) * 4, 1.6);
        }
      }
    }

    /* --- large soft mottling ---
       The blobs sit on a world-space lattice, and each chunk draws every
       lattice point that reaches into it from a tile beyond its own edge.
       Seeding them per chunk instead was what put a faint grid of squares
       across the grass. */
    var LAT = 5;                                  /* lattice spacing, tiles */
    var l0 = Math.floor(cx / LAT) - 1, l1 = Math.floor((cx + CH) / LAT) + 1;
    var m0 = Math.floor(cy / LAT) - 1, m1 = Math.floor((cy + CH) / LAT) + 1;
    for (var ly = m0; ly <= m1; ly++) {
      for (var lx = l0; lx <= l1; lx++) {
        var jx = Z.hash2(lx, ly, 211), jy = Z.hash2(lx, ly, 223), jr = Z.hash2(lx, ly, 227);
        var wxw = (lx + jx) * LAT, wyw = (ly + jy) * LAT;      /* world tiles */
        var mr = (1.0 + jr * 2.6) * TILE_PX;
        var mx = (wxw - cx) * TILE_PX, my = (wyw - cy) * TILE_PX;
        if (mx < -mr || my < -mr || mx > size + mr || my > size + mr) continue;
        var dark = Z.hash2(lx, ly, 229) > 0.5;
        var ga = c.createRadialGradient(mx, my, 1, mx, my, mr);
        ga.addColorStop(0, dark ? 'rgba(10,13,11,.11)' : 'rgba(196,196,172,.05)');
        ga.addColorStop(1, dark ? 'rgba(10,13,11,0)' : 'rgba(196,196,172,0)');
        c.fillStyle = ga;
        c.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
      }
    }

    return cv;
  }

  var centerXs = null, centerYs = null;
  function roadCenters() {
    if (centerXs) return;
    centerXs = {}; centerYs = {};
    (Z.world.roads || []).forEach(function (r) {
      if (r.h) centerYs[r.at] = 1; else centerXs[r.at] = 1;
    });
  }
  function isCenterX(tx) { roadCenters(); return !!centerXs[tx]; }
  function isCenterY(ty) { roadCenters(); return !!centerYs[ty]; }

  function chunkAvg(ci) {
    if (avgCol[ci] != null) return avgCol[ci];
    var CH = Z.world.CHUNK, CWn = Z.world.CW;
    var cx = (ci % CWn) * CH, cy = Math.floor(ci / CWn) * CH;
    var acc = [0, 0, 0], n = 0;
    for (var y = 0; y < CH; y += 2) {
      for (var x = 0; x < CH; x += 2) {
        var tx = cx + x, ty = cy + y;
        if (!Z.world.inside(tx, ty)) continue;
        var col = dayCol(Z.world.terrain[Z.world.idx(tx, ty)]);
        acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2]; n++;
      }
    }
    if (!n) n = 1;
    avgCol[ci] = Z.rgb([acc[0] / n, acc[1] / n, acc[2] / n]);
    return avgCol[ci];
  }

  var bakeBudget = 0;

  function drawTerrain(b) {
    syncTileRes();
    frameSeq++;
    var CH = Z.world.CHUNK, CWn = Z.world.CW;
    var c0 = Math.max(0, Math.floor(b.x0 / CH)), c1 = Math.min(CWn - 1, Math.floor(b.x1 / CH));
    var r0 = Math.max(0, Math.floor(b.y0 / CH)), r1 = Math.min(CWn - 1, Math.floor(b.y1 / CH));
    /* The budget is milliseconds, not chunks.

       Counting chunks means guessing what a chunk costs, and that guess is
       wrong in both directions: a chunk of open grass and a chunk where
       four materials meet differ by an order of magnitude, and the same
       number that is comfortable at 24px a metre is a 300ms stall at 56.
       Every time the terrain gained detail the constant had to be guessed
       again. Timing the work instead needs no guess and stays right when
       the next pass is added.

       One chunk always goes through, however long it takes - a screenful
       of flat placeholder squares is worse than a single long frame, and
       a budget that can refuse everything never catches up. */
    bakeBudget = 6;

    /* out-of-bounds ground reads as void, so the map has a real edge */
    ctx.fillStyle = '#05070A';
    ctx.fillRect(0, 0, W, H);

    /* Draw what is baked, and note what is not.

       A chunk that has not been baked falls back to one flat colour, and a
       screenful of those is a visible grid of eight-metre squares - which
       is what you get if you pan faster than the baker can keep up. Two
       things help: a bigger budget per frame, and baking from the middle
       of the screen outwards, so the ground under the camera is real
       first and the placeholders are pushed to the edges where they are
       least obvious. */
    var pending = null;
    for (var cy = r0; cy <= r1; cy++) {
      for (var cx = c0; cx <= c1; cx++) {
        var ci = cy * CWn + cx;
        var x = cam.sx(cx * CH), y = cam.sy(cy * CH);
        var w = CH * cam.z + 1, h = CH * cam.z * Z.PITCH + 1;
        var e = chunks[ci];
        if (e) {
          e.used = frameSeq;
          ctx.drawImage(e.cv, 0, 0, e.cv.width, e.cv.height, x, y, w, h);
        } else {
          ctx.fillStyle = chunkAvg(ci);
          ctx.fillRect(x, y, w, h);
          if (bakeBudget > 0) {   /* ms remaining; zero disables baking */
            var dx = x + w / 2 - W / 2, dy = y + h / 2 - H / 2;
            (pending || (pending = [])).push([dx * dx + dy * dy, ci]);
          }
        }
      }
    }

    if (!pending) return;
    pending.sort(function (a, b2) { return a[0] - b2[0]; });
    var spent = 0, t0 = performance.now();
    for (var i = 0; i < pending.length; i++) {
      if (i > 0 && spent >= bakeBudget) break;
      var id = pending[i][1];
      chunks[id] = { cv: bakeChunk(id), used: frameSeq };
      spent = performance.now() - t0;
      var over = 0;
      while (Object.keys(chunks).length > chunkCap() && over++ < 8) evictChunk();
    }
  }

  /* ------------------------------------------------------------------ *
   * Effects - particles, tracers, floating numbers, decals
   * ------------------------------------------------------------------ */
  var parts = [], decals = [];
  var FX = Z.fx = {};

  /* Resources you can watch arrive.

     A number that increments is information; a thing that leaps out of
     the stump, bounces, hesitates, and then comes to you is a reward. So
     a finished haul throws real objects into the world and they find
     their own way to the player - scattering on a ballistic arc, landing,
     and then accelerating in, each one punching the counter as it lands.

     `left` counts down per resource so the last nugget of a kind can
     carry the tally to the HUD rather than every one of them doing it. */
  FX.pickup = function (x, y, res, n, onGrab) {
    var col = (Z.RES[res] && Z.RES[res].color) || '#C9C2AE';
    var rgb = Z.hex2rgb ? Z.hex2rgb(col) : [200, 194, 174];
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Z.TAU, sp = 1.4 + Math.random() * 2.2;
      parts.push({ k: 'pick', x: x, y: y, z: 0.55 + Math.random() * 0.4,
                   vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6,
                   vz: 3.4 + Math.random() * 2.4,
                   life: 7, t: 0, col: rgb.join(','),
                   res: res, grab: onGrab,
                   wait: 0.22 + i * 0.045 + Math.random() * 0.1,
                   spin: Math.random() * Z.TAU,
                   spv: (Math.random() - 0.5) * 9,
                   /* sized to read at the default field of view: at 46
                      pixels a metre this is 6-9px, which is an object.
                      Any smaller and it is a speck of dust. */
                   r: 0.13 + Math.random() * 0.055, homing: 0 });
    }
  };

  /* Coins.

     One object per coin is the obvious way to do this and the wrong one:
     a blood moon kills several hundred zombies in a minute, and several
     hundred bouncing, spinning, homing objects is the frame budget gone
     on loose change. So the count is a root of the value - a two-scrip
     shambler drops one, a fourteen-scrip abomination drops six - and
     past a hard ceiling new drops are merged into the nearest coin
     already on the ground instead of adding to the pile. The player sees
     the same money either way; only the object count is bounded.

     A coin lies where it fell until you come near it, then it comes to
     you: slowly at first, then very fast, along a curve rather than a
     straight line, because a straight line reads as a UI element and an
     arc reads as a thing being pulled. */
  var COIN_MAX = 90;
  FX.coinCount = 0;

  FX.coin = function (x, y, value, onGrab) {
    var q = (Z.QUALITY[Z.S.quality] || {}).parts || 1;
    var n = Z.clamp(Math.round(Math.sqrt(Math.max(1, value)) * 0.8), 1, 8);
    n = Math.max(1, Math.round(n * Z.clamp(q, 0.4, 1.3)));

    /* over the ceiling, fold the money into the nearest coin already out */
    if (FX.coinCount >= COIN_MAX) {
      var best = null, bd = 1e9;
      for (var i = 0; i < parts.length; i++) {
        var pc = parts[i];
        if (pc.k !== 'coin') continue;
        var d = (pc.x - x) * (pc.x - x) + (pc.y - y) * (pc.y - y);
        if (d < bd) { bd = d; best = pc; }
      }
      if (best) { best.val += value; best.fat = Math.min(2.2, best.fat + 0.18); return; }
    }

    var per = value / n;
    for (var c = 0; c < n; c++) {
      var a = Math.random() * Z.TAU, sp = 1.6 + Math.random() * 2.4;
      parts.push({ k: 'coin', x: x, y: y, z: 0.5 + Math.random() * 0.35,
                   vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6,
                   vz: 3.6 + Math.random() * 2.6,
                   life: 26, t: 0, val: per, grab: onGrab,
                   spin: Math.random() * Z.TAU, spv: 6 + Math.random() * 7,
                   rest: 0, homing: 0, fat: 1,
                   curl: (Math.random() - 0.5) * 2.2, r: 0.115 });
      FX.coinCount++;
    }
  };

  FX.burst = function (x, y, n, col, spd, kind) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Z.TAU, s = (0.4 + Math.random()) * (spd || 3.4);
      parts.push({ k: kind || 'p', x: x, y: y, z: 0.7 + Math.random() * 0.5,
                   vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6,
                   vz: 1.4 + Math.random() * 2.6,
                   life: 0.42 + Math.random() * 0.5, t: 0, col: col,
                   r: 0.04 + Math.random() * 0.07 });
    }
  };
  FX.smoke = function (x, y, n, col) {
    for (var i = 0; i < n; i++) {
      parts.push({ k: 'smoke', x: x + (Math.random() - 0.5) * 0.4, y: y, z: 0.6,
                   vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.3,
                   vz: 0.7 + Math.random() * 0.8,
                   life: 1.1 + Math.random() * 1.0, t: 0, col: col || '160,158,150',
                   r: 0.14 + Math.random() * 0.16 });
    }
  };
  FX.tracer = function (x0, y0, x1, y1, col, wide, z0, z1) {
    parts.push({ k: 'tracer', x: x0, y: y0, x1: x1, y1: y1, z: z0 == null ? 1.1 : z0,
                 z1: z1 == null ? 1.0 : z1, life: 0.075, t: 0, col: col, w: wide || 1.6 });
  };
  FX.beam = function (x0, y0, x1, y1, col, wide, life) {
    parts.push({ k: 'tracer', x: x0, y: y0, x1: x1, y1: y1, z: 1.1, z1: 1.0,
                 life: life || 0.2, t: 0, col: col, w: wide || 3 });
  };
  FX.num = function (x, y, text, col, big) {
    parts.push({ k: 'num', x: x + (Math.random() - 0.5) * 0.3, y: y, z: 1.5,
                 vz: 1.5, vx: 0, vy: 0, life: 0.95, t: 0, col: col, text: text, big: big });
  };
  FX.ring = function (x, y, r, col, life) {
    parts.push({ k: 'ring', x: x, y: y, z: 0.06, r: r, life: life || 0.45, t: 0, col: col });
  };
  /* A shock ring: thin, fast, and gone. Different from `ring`, which
     drifts outward slowly - this one is the wave leaving. */
  FX.shock = function (x, y, r, col, life, wide) {
    parts.push({ k: 'shock', x: x, y: y, z: 0.05, r: r, life: life || 0.34, t: 0,
                 col: col, w: wide || 3 });
  };
  /* A ball of fire that climbs and goes out. Several of these, offset and
     started at slightly different moments, is what makes a blast read as
     a volume of burning air rather than a circle of orange paint. */
  FX.fire = function (x, y, z, r, life, delay) {
    parts.push({ k: 'fire', x: x, y: y, z: z, r: r, vz: 0.9 + Math.random() * 1.1,
                 life: life || 0.5, t: -(delay || 0) });
  };

  /* ---- the whole explosion, in one call ----

     Stacking the generic effects gave a flash and some orange dots. A
     blast wants five things happening on different clocks: the white
     core that is gone before you see it, the fireball that climbs, the
     shock leaving along the ground, debris thrown out on gravity, and
     smoke that hangs around afterwards to say something happened here. */
  FX.boom = function (x, y, r) {
    r = r || 3.4;
    /* 1. the core - very bright, very short */
    FX.flash(x, y, 0.6, r * 0.9, '255,246,214', 0.09);
    FX.flash(x, y, 0.5, r * 1.5, '255,190,96', 0.22);
    /* 2. the fireball, in overlapping lobes on staggered starts */
    FX.fire(x, y, 0.5, r * 0.52, 0.46, 0);
    for (var i = 0; i < 5; i++) {
      var a = Math.random() * Z.TAU, d = Math.random() * r * 0.46;
      FX.fire(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7,
              0.4 + Math.random() * 0.5, r * (0.24 + Math.random() * 0.2),
              0.4 + Math.random() * 0.25, i * 0.028);
    }
    /* 3. the wave along the ground, and the dust it lifts */
    FX.shock(x, y, r * 0.3, '255,228,180', 0.3, 4);
    FX.shock(x, y, r * 0.18, '186,172,150', 0.44, 2);
    FX.ring(x, y, r * 0.55, '255,150,60', 0.45);
    /* 4. debris, thrown hard and falling */
    FX.burst(x, y + 0.08, 22, '255,196,104', 9.5);
    FX.burst(x, y + 0.08, 14, '255,132,48', 6.5);
    FX.burst(x, y + 0.08, 12, '96,88,80', 5.0);
    /* 5. what is left of it */
    FX.smoke(x, y, 9, '104,98,92');
    FX.smoke(x, y, 4, '62,58,54');
    FX.decal(x, y, r * 0.52, '22,18,16');
    FX.decal(x, y, r * 0.28, '12,10,9');
  };
  FX.flash = function (x, y, z, r, col, life) {
    parts.push({ k: 'flash', x: x, y: y, z: z, r: r, life: life || 0.07, t: 0, col: col });
  };
  /* A spent case, thrown to the shooter's right and tumbling. Gravity and
     the bounce come from the ordinary particle step; all this needs is a
     kind the drawer knows to paint as a small bright chip. */
  FX.shell = function (x, y, ang) {
    var a = ang - Math.PI * 0.42 + (Math.random() - 0.5) * 0.5;
    parts.push({ k: 'shell', x: x, y: y, z: 1.0,
                 vx: Math.cos(a) * (2.2 + Math.random() * 1.4),
                 vy: Math.sin(a) * (2.2 + Math.random() * 1.4) * 0.6,
                 vz: 2.4 + Math.random() * 1.6, spin: (Math.random() - 0.5) * 26,
                 rot: Math.random() * Z.TAU,
                 life: 1.5 + Math.random() * 0.6, t: 0, col: '214,168,74',
                 r: 0.035 });
  };

  /* Sparks that go the way the bullet was going, not in all directions.
     A symmetric puff on an impact reads as a small explosion; a cone reads
     as something being hit by something. */
  FX.spark = function (x, y, ang, n, col, spd) {
    for (var i = 0; i < n; i++) {
      var a = ang + (Math.random() - 0.5) * 1.5;
      var s2 = (0.5 + Math.random()) * (spd || 4);
      parts.push({ k: 'p', x: x, y: y, z: 0.9 + Math.random() * 0.4,
                   vx: Math.cos(a) * s2, vy: Math.sin(a) * s2 * 0.6,
                   vz: 0.6 + Math.random() * 1.8,
                   life: 0.20 + Math.random() * 0.24, t: 0, col: col,
                   r: 0.03 + Math.random() * 0.045 });
    }
  };

  FX.decal = function (x, y, r, col) {
    decals.push({ x: x, y: y, r: r, col: col || '58,14,12', a: 0.5, t: 0 });
    if (decals.length > 220) decals.shift();
  };
  FX.clear = function () { parts.length = 0; decals.length = 0; };

  FX.step = function (dt) {
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      if (p.k === 'coin') {
        p.spin += p.spv * dt;
        var tp = Z.sim && Z.sim.p;
        var pd = tp ? Z.dist(p.x, p.y, tp.x, tp.y) : 1e9;
        /* close enough to notice - wide enough to feel generous, short
           enough that they are not teleporting across the street */
        /* Pull from much further out, and come anyway after a moment.

           A coin you have to walk onto is a chore in the middle of a
           fight: you are watching the horde, not the floor. The radius
           is wide enough to sweep up everything from a kill you walked
           past, and anything still lying there after four seconds sets
           off regardless - so money never needs collecting by hand. */
        var MAG = 8.5;
        if (p.homing > 0 || p.t > 4 || (tp && !tp.dead && pd < MAG)) {
          p.homing = Math.min(1, p.homing + dt * 1.9);
          var dx = tp.x - p.x, dy = (tp.y - 0.15) - p.y;
          var d2 = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          /* the curve: a decaying sideways push, so it sweeps in */
          var sw = p.curl * (1 - p.homing) * 0.9;
          var ux = dx / d2, uy = dy / d2;
          var v = 2.2 + p.homing * p.homing * 26;
          p.x += (ux - uy * sw) * v * dt;
          p.y += (uy + ux * sw) * v * dt;
          p.z += (0.6 - p.z) * Math.min(1, dt * 6);
          p.spv = 13 + p.homing * 16;
          if (p.homing > 0.3 && Math.random() < dt * 22) {
            parts.push({ k: 'p', x: p.x, y: p.y, z: p.z,
                         vx: 0, vy: 0, vz: 0.2, life: 0.22, t: 0,
                         col: '236,196,110', r: 0.03 });
          }
          if (d2 < 0.5) {
            if (p.grab) p.grab(p.val, p.x, p.y);
            FX.coinCount--;
            continue;
          }
        } else {
          /* lying there: a couple of bounces, then it settles and spins
             down rather than twitching on the ground for ever */
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.z += p.vz * dt; p.vz -= 13 * dt;
          if (p.z < 0.05) {
            p.z = 0.05; p.vz *= -0.4;
            p.vx *= 0.55; p.vy *= 0.55; p.spv *= 0.62;
            if (Math.abs(p.vz) < 0.5) { p.vz = 0; p.rest = 1; }
          }
          if (p.rest) p.spv *= Math.pow(0.02, dt);
        }
        if (p.t > p.life - 1) p.fade = (p.life - p.t);
        out.push(p);
        continue;
      }
      if (p.k === 'pick') {
        p.spin += p.spv * dt;
        if (p.t < p.wait) {
          /* the scatter: ballistic, and it lands */
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.z += p.vz * dt; p.vz -= 11 * dt;
          if (p.z < 0.06) {
            p.z = 0.06; p.vz *= -0.34;
            p.vx *= 0.52; p.vy *= 0.52; p.spv *= 0.5;
          }
        } else {
          /* the draw-in: accelerating, so it arrives with intent rather
             than drifting over at a constant crawl */
          var tp = Z.sim && Z.sim.p;
          if (!tp) continue;
          var dx = tp.x - p.x, dy = (tp.y - 0.15) - p.y, dz = 0.62 - p.z;
          var d2 = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          p.homing = Math.min(1, p.homing + dt * 2.4);
          var v = 5 + p.homing * 20;
          p.x += (dx / d2) * v * dt;
          p.y += (dy / d2) * v * dt;
          p.z += dz * Math.min(1, dt * 7);
          if (d2 < 0.42) {
            if (p.grab) p.grab(p.res, p.x, p.y, p.z);
            continue;                       /* consumed */
          }
        }
        out.push(p);
        continue;
      }
      if (p.k === 'p' || p.k === 'smoke' || p.k === 'shell') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vz -= (p.k === 'smoke' ? 0.4 : 9) * dt;
        if (p.z < 0) { p.z = 0; p.vz *= -0.32; p.vx *= 0.6; p.vy *= 0.6; }
        if (p.k === 'smoke') { p.r += dt * 0.28; p.vx *= 0.97; p.vy *= 0.97; }
        if (p.k === 'shell') {
          p.rot += p.spin * dt;
          /* it settles rather than skittering for its whole life */
          if (p.z <= 0.001) { p.spin *= 0.7; p.vx *= 0.82; p.vy *= 0.82; }
        }
      } else if (p.k === 'num') {
        p.z += p.vz * dt; p.vz -= 1.6 * dt;
      } else if (p.k === 'fire') {
        /* it climbs, slows, and swells as it goes out */
        if (p.t > 0) { p.z += p.vz * dt; p.vz *= 0.94; p.r += dt * 1.1; }
      }
      out.push(p);
    }
    parts = out;
    for (var d = 0; d < decals.length; d++) { decals[d].t += dt; }
  };

  /* Lights the effects contribute this frame - muzzle flashes, fires. */
  var frameLights = [];
  FX.light = function (x, y, r, a, col) { frameLights.push([x, y, r, a, col]); };

  /* ------------------------------------------------------------------ *
   * Sprite blitting
   * ------------------------------------------------------------------ */
  function blit(cv, wx, wy, alpha, flip, tint) {
    var s = cam.z / (cv._ppm || PPM);
    var x = cam.sx(wx), y = cam.sy(wy);
    ctx.save();
    if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(flip ? -s : s, s);
    ctx.drawImage(cv, -cv._ox, -cv._oy);
    ctx.restore();
  }

  function blitFrame(fr, wx, wy, alpha, extraFlip) {
    var s = cam.z / (fr.ppm || PPM);
    var x = cam.sx(wx), y = cam.sy(wy);
    var flip = fr.flip ^ (extraFlip ? 1 : 0);
    ctx.save();
    if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(flip ? -s : s, s);
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -fr.ox, -fr.oy, fr.sw, fr.sh);
    ctx.restore();
  }

  /* Contact shadow. Length and direction follow the sun, which is what
     stops bodies from looking pasted onto the ground. */
  /* Two rings rather than one flat pool: a dark core right under the feet
     and a wider soft one around it. A single even ellipse reads as a decal
     lying on the grass; the core is what actually plants a body on the
     ground, and it is the cheapest thing in the renderer that makes the
     world look drawn rather than composited. */
  function shadow(wx, wy, rx, ry, a) {
    var l = wd.l;
    var sunA = (Z.world.t - 0.25) * Z.TAU;
    var off = (1 - Math.abs(Math.sin(sunA))) * 0.5;
    var x = cam.sx(wx + Math.cos(sunA + Math.PI) * off * 0.4);
    var y = cam.sy(wy + 0.06);
    var base = a * (0.20 + l * 0.26);
    ctx.fillStyle = 'rgba(6,10,8,' + (base * 0.55) + ')';
    ctx.beginPath();
    ctx.ellipse(x, y, rx * cam.z * 1.28, ry * cam.z * Z.PITCH * 1.28, 0, 0, Z.TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(4,7,6,' + base + ')';
    ctx.beginPath();
    ctx.ellipse(x, y, rx * cam.z, ry * cam.z * Z.PITCH, 0, 0, Z.TAU);
    ctx.fill();
  }

  /* A wall's shadow has to be as continuous as the wall is. An ellipse
     per tile scallops along the bottom of a run and undoes the joining
     the art just did; overlapping rectangles that match the arms merge
     into one edge. */
  function runShadow(bl) {
    var m = bl.mask | 0;
    if (!(m & 15)) m = (bl.rot & 1) ? 5 : 10;
    var t = 0.34, e = 0.55;
    var x0 = bl.x - (m & 8 ? e : t), x1 = bl.x + (m & 2 ? e : t);
    var y0 = bl.y - (m & 1 ? e : t), y1 = bl.y + (m & 4 ? e : t);

    var sunA = (wd.t - 0.25) * Z.TAU;
    var off = (1 - Math.abs(Math.sin(sunA))) * 0.5;
    var ox = Math.cos(sunA + Math.PI) * off * 0.4;
    var a = 0.8 * (0.20 + wd.l * 0.26);

    var sx = cam.sx(x0 + ox), sw = (x1 - x0) * cam.z;
    var sy = cam.sy(y0 + 0.10), sh = (y1 - y0) * cam.z * Z.PITCH;
    ctx.fillStyle = 'rgba(6,10,8,' + (a * 0.5) + ')';
    ctx.fillRect(sx - 2, sy - 2, sw + 4, sh + 4);
    ctx.fillStyle = 'rgba(4,7,6,' + a + ')';
    ctx.fillRect(sx, sy, sw, sh);
  }

  /* ------------------------------------------------------------------ *
   * Body list
   * ------------------------------------------------------------------ */
  var list = [];

  function push(y, fn) { list.push({ y: y, fn: fn }); }

  /* ------------------------------------------------------------------ *
   * Main
   * ------------------------------------------------------------------ */
  R.init = function (canvas) {
    R.cv = canvas;
    ctx = R.ctx = canvas.getContext('2d', { alpha: false });
    cam = Z.cam;
    wd = Z.world;
  };

  /* ------------------------------------------------------------------ *
   * Indoors
   *
   * Its own pass, because it is its own place: a room grid rather than the
   * world's terrain, drawn with the same camera and the same projection so
   * that walking through the door does not change how anything reads.
   * ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ *
   * Indoors
   *
   * Each room is floored in its own material, which is most of what tells
   * you at a glance whether you are on a shop floor or in somebody's
   * bedroom. Walls, furniture, the dead and the living all go into one
   * depth-sorted pass for the same reason the outdoor renderer does it:
   * larger y is nearer, so it draws last and stands in front.
   * ------------------------------------------------------------------ */
  var ROOM_MAT = {
    boards:   { a: [132, 106, 74], b: [112, 88, 60], joint: 'board' },
    carpet:   { a: [116, 100, 90], b: [102, 88, 78], joint: 'none' },
    lino:     { a: [146, 146, 140], b: [132, 132, 126], joint: 'tile' },
    clinical: { a: [186, 192, 190], b: [168, 176, 176], joint: 'tile' },
    tile:     { a: [166, 170, 168], b: [146, 152, 150], joint: 'tile' },
    concrete: { a: [118, 118, 114], b: [102, 102, 98], joint: 'slab' },
    stone:    { a: [150, 144, 128], b: [132, 126, 112], joint: 'slab' },
    asphalt:  { a: [84, 86, 88], b: [72, 74, 76], joint: 'slab' }
  };
  var ROLE_MAT = {
    living: 'carpet', bed: 'carpet', hall: 'boards', lobby: 'stone',
    kitchen: 'tile', bath: 'tile', stair: 'concrete',
    sales: 'lino', checkout: 'lino', counter: 'lino', fitting: 'carpet',
    storage: 'concrete', coldroom: 'tile', staff: 'lino', office: 'carpet',
    repair: 'concrete', vault: 'concrete', timberYard: 'concrete',
    dining: 'boards', food: 'lino', atrium: 'stone',
    reception: 'lino', waiting: 'lino', ward: 'clinical', exam: 'clinical',
    theatre: 'clinical', pharmacy: 'clinical', medstore: 'clinical',
    morgue: 'tile', corridor: 'lino',
    classroom: 'lino', cells: 'concrete', armoury: 'concrete',
    lockers: 'tile', bay: 'concrete', floor: 'concrete', racking: 'concrete',
    machine: 'concrete', loading: 'concrete', workshop: 'concrete',
    parts: 'concrete', deck: 'asphalt', booth: 'lino',
    concourse: 'stone', ticket: 'stone', nave: 'stone', vestry: 'boards',
    meeting: 'carpet', garage: 'concrete', generic: 'concrete'
  };

  function drawRoom(time, dt) {
    var IN = Z.interior, r = IN.room;
    if (!r) return;
    var S = Z.sim;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07090C';
    ctx.fillRect(0, 0, W, H);

    var tz = cam.z, tp = tz * Z.PITCH;
    var ox = cam.sx(0), oy = cam.sy(0);
    var x, y, i;

    /* ---- floors, per room ---- */
    for (y = 0; y < r.h; y++) {
      for (x = 0; x < r.w; x++) {
        if (r.tiles[y * r.w + x]) continue;
        var own = r.owner[y * r.w + x];
        var role = own >= 0 ? r.rooms[own].role : 'generic';
        var mat = ROOM_MAT[ROLE_MAT[role] || 'concrete'];
        var sx = ox + x * tz, sy = oy + y * tp;
        var n = Z.hash2(x, y, 515);
        var col = ((x + y) & 1) ? mat.a : mat.b;
        ctx.fillStyle = Z.rgb(Z.shade(col, (n - 0.5) * 0.09));
        ctx.fillRect(sx, sy, tz + 1, tp + 1);

        if (mat.joint === 'board') {
          ctx.fillStyle = 'rgba(0,0,0,.17)';
          ctx.fillRect(sx, sy, 1, tp);
          ctx.fillRect(sx + tz * 0.5, sy, 1, tp);
        } else if (mat.joint === 'tile') {
          ctx.fillStyle = 'rgba(0,0,0,.13)';
          ctx.fillRect(sx, sy, tz, 1);
          ctx.fillRect(sx, sy, 1, tp);
          ctx.fillRect(sx + tz * 0.5, sy, 1, tp);
          ctx.fillRect(sx, sy + tp * 0.5, tz, 1);
        } else if (mat.joint === 'slab') {
          ctx.fillStyle = 'rgba(0,0,0,.14)';
          ctx.fillRect(sx, sy, tz, 1);
          ctx.fillRect(sx, sy, 1, tp);
        }

        /* the floor has been walked on, flooded and burnt in places */
        if (n > 0.93) {
          ctx.fillStyle = 'rgba(28,34,30,.22)';
          ctx.beginPath();
          ctx.ellipse(sx + tz * 0.5, sy + tp * 0.5, tz * 0.4, tp * 0.45, 0, 0, Z.TAU);
          ctx.fill();
        } else if (n < 0.06) {
          ctx.fillStyle = 'rgba(96,74,40,.14)';
          ctx.fillRect(sx + 2, sy + 1, tz * 0.6, tp * 0.6);
        }
      }
    }

    /* ---- one depth-sorted pass ---- */
    var list = [];
    for (y = 0; y < r.h; y++) {
      for (x = 0; x < r.w; x++) {
        if (!r.tiles[y * r.w + x]) continue;
        list.push({ y: y + 1, wall: [x, y] });
      }
    }
    for (i = 0; i < r.items.length; i++) list.push({ y: r.items[i].y, it: r.items[i] });
    if (S) {
      for (i = 0; i < S.zombies.length; i++) {
        if (S.zombies[i].indoor) list.push({ y: S.zombies[i].y, zb: S.zombies[i] });
      }
      for (i = 0; i < S.corpses.length; i++) {
        if (S.corpses[i].indoor) list.push({ y: S.corpses[i].y, cp: S.corpses[i] });
      }
    }
    var pl = S && S.p;
    if (pl) list.push({ y: pl.y, player: true });
    list.sort(function (a, b) { return a.y - b.y; });

    /* walls take their colour from the room they face into */
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.wall) drawWall(e.wall[0], e.wall[1], ox, oy, tz, tp, wallColFor(r, e.wall[0], e.wall[1]));
      else if (e.it) Z.artint.draw(ctx, e.it, cam);
      else if (e.zb) drawZombie(e.zb, time);
      else if (e.cp) drawCorpse(e.cp, time);
      else drawPlayer(pl, time);
    }

    /* ---- the way out, lit from the other side ----
       Daylight through the door is the only daylight in here, so it
       follows the clock: a doorway at midnight is a dark rectangle. */
    var day = Z.world.l;
    var ex = ox + (r.exit.x - 0.5) * tz, ey = oy + (r.exit.y + 0.5) * tp;
    var dg = ctx.createLinearGradient(0, ey - tz * 1.4, 0, ey);
    dg.addColorStop(0, 'rgba(255,232,178,0)');
    dg.addColorStop(1, 'rgba(255,232,178,' + (0.06 + day * 0.30).toFixed(3) + ')');
    ctx.fillStyle = dg;
    ctx.fillRect(ex, ey - tz * 1.4, tz, tz * 1.4);

    /* ---- light ----
       A pool round the survivor, and what gets in through the windows.
       Both fall away after dark, which is what makes going into a
       hospital at night a different proposition from going in at noon. */
    if (pl) {
      var lx = cam.sx(pl.x), ly = cam.sy(pl.y);
      var lg = ctx.createRadialGradient(lx, ly - tz * 0.4, 2, lx, ly, tz * 4.8);
      lg.addColorStop(0, 'rgba(255,230,184,' + (0.18 + (1 - day) * 0.18).toFixed(3) + ')');
      lg.addColorStop(1, 'rgba(255,230,184,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, W, H);
    }

    /* the dark that is left over */
    var gloom = 0.30 + (1 - day) * 0.34;
    var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34,
                                      W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,' + gloom.toFixed(3) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    if (day < 0.5) {
      ctx.fillStyle = 'rgba(18,28,54,' + ((0.5 - day) * 0.34).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    /* ---- what the room is called ---- */
    var here = IN.roomAt(pl ? pl.x : 0, pl ? pl.y : 0);
    if (here && here.def) roomLabel(here.def.name);

    /* ---- prompts ---- */
    var f = IN.focus;
    if (pl && IN.atExit(pl.x, pl.y)) prompt(r.exit.x, r.exit.y - 0.5, 'E  Leave');
    else if (f) prompt(f.x, f.y - 0.5, IN.searching ? 'Searching...' : 'E  Search');
  }

  /* A wall between two rooms takes the colour of whichever one is in
     front of it, so a ward does not have a warehouse's walls. */
  var WALL_COL = {
    carpet: [92, 78, 66], boards: [96, 80, 64], lino: [110, 112, 110],
    clinical: [146, 156, 158], tile: [128, 136, 138], concrete: [84, 86, 86],
    stone: [116, 112, 100], asphalt: [70, 72, 74]
  };
  function wallColFor(r, x, y) {
    var below = y + 1 < r.h ? r.owner[(y + 1) * r.w + x] : -1;
    var own = below >= 0 ? below : (y > 0 ? r.owner[(y - 1) * r.w + x] : -1);
    var role = own >= 0 ? r.rooms[own].role : 'generic';
    return WALL_COL[ROLE_MAT[role] || 'concrete'] || [84, 86, 86];
  }

  function roomLabel(text) {
    ctx.font = '600 11px Barlow,system-ui,sans-serif';
    ctx.textAlign = 'center';
    var tw = ctx.measureText(text).width + 22;
    var x = W / 2, y = 26;
    ctx.fillStyle = 'rgba(10,13,16,.72)';
    R.roundRect(x - tw / 2, y - 12, tw, 20, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(198,192,176,.8)';
    ctx.fillText(text.toUpperCase(), x, y + 2);
  }

  function drawWall(x, y, ox, oy, tz, tp, wallCol) {
    var wx = ox + x * tz, wy = oy + (y + 1) * tp;
    var wh = 1.15 * tz;
    ctx.fillStyle = Z.rgb(Z.shade(wallCol, 0.44));
    ctx.fillRect(wx, wy - tp - wh, tz + 1, tp + 1);
    var g = ctx.createLinearGradient(0, wy - wh, 0, wy);
    g.addColorStop(0, Z.rgb(Z.shade(wallCol, 0.12)));
    g.addColorStop(1, Z.rgb(Z.shade(wallCol, -0.46)));
    ctx.fillStyle = g;
    ctx.fillRect(wx, wy - wh, tz + 1, wh);
    /* a dado rail and a skirting, so it is a wall and not a slab */
    ctx.fillStyle = 'rgba(0,0,0,.20)';
    ctx.fillRect(wx, wy - wh * 0.46, tz + 1, 2);
    ctx.fillStyle = 'rgba(228,222,208,.07)';
    ctx.fillRect(wx, wy - wh * 0.46 + 2, tz + 1, 1.5);
    ctx.fillStyle = 'rgba(0,0,0,.26)';
    ctx.fillRect(wx, wy - 3, tz + 1, 3);
  }

  function prompt(wx, wy, text) {
    var x = cam.sx(wx), y = cam.sy(wy) - cam.z * 0.9;
    ctx.font = '600 13px Barlow,system-ui,sans-serif';
    ctx.textAlign = 'center';
    var tw = ctx.measureText(text).width + 18;
    ctx.fillStyle = 'rgba(10,13,16,.88)';
    R.roundRect(x - tw / 2, y - 10, tw, 22, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(227,166,63,.5)';
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#E4E0D6';
    ctx.fillText(text, x, y + 5);
  }


  var frameDt = 0.016;

  R.frame = function (time, dt) {
    frameDt = dt || 0.016;
    if (Z.interior && Z.interior.active()) { drawRoom(time, dt); FX.step(dt); return; }
    var S = Z.sim;
    W = cam.W; H = cam.H;
    var dpr = cam.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    frameLights.length = 0;

    var b = cam.bounds(6);
    drawTerrain(b);
    drawFloors(b);
    drawDecals(b);

    list.length = 0;
    collectProps(b);
    collectBuildings(b, time);
    collectBodies(b, time);

    /* shadows in one pass under everything */
    drawShadows(b, S);

    list.sort(function (a, c) { return a.y - c.y; });
    for (var i = 0; i < list.length; i++) list[i].fn(time);

    drawEffects(time);
    drawNades(time);
    drawNadeAim(time);
    if (Z.build && Z.build.ghost) Z.build.drawGhost(ctx, time);
    drawOverlays(time, S);
    drawLighting(time);
    drawFog(b);
    drawAir(time);
  };

  /* ------------------------------------------------------------------ *
   * Grenades
   * ------------------------------------------------------------------ */
  function drawNades(time) {
    var S = Z.sim;
    if (!S || !S.nades || !S.nades.length) return;
    for (var i = 0; i < S.nades.length; i++) {
      var g = S.nades[i];
      var sx = cam.sx(g.x), sy = cam.sy(g.y);
      /* the shadow stays on the ground and shrinks as it climbs, which
         is the only cue that says how high the thing is */
      var k = 1 / (1 + g.z * 0.55);
      ctx.fillStyle = 'rgba(0,0,0,' + (0.34 * k) + ')';
      ctx.beginPath();
      ctx.ellipse(sx, sy, 0.16 * cam.z * k, 0.16 * cam.z * k * Z.PITCH, 0, 0, Z.TAU);
      ctx.fill();

      var by = sy - g.z * cam.z;
      var r = Math.max(2.2, cam.z * 0.115);
      ctx.save();
      ctx.translate(sx, by);
      ctx.rotate(g.rot);
      var gr = ctx.createLinearGradient(-r, -r, r, r);
      gr.addColorStop(0, '#6E7A5E');
      gr.addColorStop(0.5, '#4A5442');
      gr.addColorStop(1, '#2C3228');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 1.18, 0, 0, Z.TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,12,10,.75)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      /* the band round its middle and the spoon on the side */
      ctx.fillStyle = 'rgba(16,18,14,.55)';
      ctx.fillRect(-r, -r * 0.18, r * 2, r * 0.36);
      ctx.fillStyle = 'rgba(180,176,160,.8)';
      ctx.fillRect(r * 0.2, -r * 0.9, r * 0.36, r * 0.8);
      ctx.restore();

      /* once it is down it blinks, faster as it runs out */
      if (g.cook >= 0) {
        var left = Z.clamp01(1 - g.cook / Z.GRENADE.cook);
        var blink = Math.sin(time * (26 + (1 - left) * 40)) > 0;
        if (blink) {
          ctx.fillStyle = 'rgba(255,120,60,.95)';
          ctx.beginPath();
          ctx.arc(sx, by - r * 0.7, Math.max(1.4, r * 0.34), 0, Z.TAU);
          ctx.fill();
          FX.light(g.x, g.y, 1.6, 0.35, '255,140,60');
        }
      }
    }
  }

  /* The arc, and the circle it lands in.

     A throwable without a preview is a guess, and a guess you only get
     once every seven seconds is not a mechanic - it is a punishment. The
     dots follow the same parabola the sim will use, so what you are
     shown is exactly what happens. */
  function drawNadeAim(time) {
    var S = Z.sim;
    if (!S || !S.nadeArmed || !S.p || S.p.dead) return;
    var t = S.nadeTarget();
    if (!t) return;
    var p = S.p, G = Z.GRENADE;
    var dx = t.x - p.x, dy = t.y - p.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    var T = Z.clamp(d / 11, 0.34, 0.95);
    var vz = 0.5 * 22 * T + 0.95 / T;

    ctx.save();
    for (var i = 1; i <= 16; i++) {
      var f = i / 16, tt = f * T;
      var wx = p.x + dx * f, wy = p.y + dy * f;
      var z = 0.95 + vz * tt - 0.5 * 22 * tt * tt;
      var sx = cam.sx(wx), sy = cam.sy(wy) - Math.max(0, z) * cam.z;
      var rr = Math.max(1.1, cam.z * 0.03) * (1 - f * 0.4);
      ctx.fillStyle = 'rgba(227,166,63,' + (0.25 + f * 0.55) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, rr, 0, Z.TAU);
      ctx.fill();
    }
    ctx.restore();

    /* where it goes off */
    var pulse = 0.5 + Math.sin(time * 6) * 0.14;
    var tx = cam.sx(t.x), ty = cam.sy(t.y);
    var rad = G.radius * cam.z;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(1, Z.PITCH);
    var rg = ctx.createRadialGradient(0, 0, rad * 0.2, 0, 0, rad);
    rg.addColorStop(0, 'rgba(227,120,52,.20)');
    rg.addColorStop(1, 'rgba(227,120,52,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(0, 0, rad, 0, Z.TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(240,150,70,' + (0.6 + pulse * 0.3) + ')';
    ctx.lineWidth = Math.max(1.6, cam.z * 0.035);
    ctx.beginPath(); ctx.arc(0, 0, rad, 0, Z.TAU); ctx.stroke();
    /* crosshair marks at the cardinal points, so the centre is obvious */
    ctx.lineWidth = Math.max(1.2, cam.z * 0.025);
    for (var a = 0; a < 4; a++) {
      var an = a * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(an) * rad * 0.74, Math.sin(an) * rad * 0.74);
      ctx.lineTo(Math.cos(an) * rad * 0.94, Math.sin(an) * rad * 0.94);
      ctx.stroke();
    }
    ctx.restore();
    /* how many are standing in it right now */
    var caught = 0;
    for (var zi = 0; zi < S.zombies.length; zi++) {
      var zb = S.zombies[zi];
      if (!zb.dying && Z.dist2(t.x, t.y, zb.x, zb.y) < G.radius * G.radius) caught++;
    }
    if (caught > 0) {
      ctx.font = '700 13px Barlow,system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(8,10,12,.8)';
      ctx.fillText(caught + ' in range', tx + 1, ty - rad * Z.PITCH - 7);
      ctx.fillStyle = '#F0BC58';
      ctx.fillText(caught + ' in range', tx, ty - rad * Z.PITCH - 8);
      ctx.textAlign = 'left';
    }
  }

  /* ---- player-laid paving sits on the ground, under everything ---- */
  function drawFloors(b) {
    var S = Z.sim;
    if (!S || !S.buildings) return;
    for (var i = 0; i < S.buildings.length; i++) {
      var bl = S.buildings[i];
      if (!bl.def.floor || bl.dead) continue;
      if (bl.x < b.x0 || bl.x > b.x1 || bl.y < b.y0 || bl.y > b.y1) continue;
      var fw = Z.fpw(bl.def, bl.rot), fh = Z.fph(bl.def, bl.rot);
      var x = cam.sx(bl.x - fw / 2), y = cam.sy(bl.y - fh / 2);
      ctx.fillStyle = 'rgba(112,110,102,.92)';
      ctx.fillRect(x, y, fw * cam.z, fh * cam.z * Z.PITCH);
      ctx.strokeStyle = 'rgba(0,0,0,.18)';
      ctx.strokeRect(x, y, fw * cam.z, fh * cam.z * Z.PITCH);
    }
  }

  function drawDecals(b) {
    for (var i = 0; i < decals.length; i++) {
      var d = decals[i];
      if (d.x < b.x0 || d.x > b.x1 || d.y < b.y0 || d.y > b.y1) continue;
      var a = d.a * Math.max(0, 1 - d.t / 120);
      if (a <= 0.01) continue;
      ctx.fillStyle = 'rgba(' + d.col + ',' + a + ')';
      ctx.beginPath();
      ctx.ellipse(cam.sx(d.x), cam.sy(d.y), d.r * cam.z, d.r * cam.z * Z.PITCH, 0, 0, Z.TAU);
      ctx.fill();
    }
  }

  function drawShadows(b, S) {
    var i;
    for (i = 0; i < wd.props.length; i++) {
      var p = wd.props[i];
      if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) continue;
      shadow(p.x, p.y, p.def.r * 0.95, p.def.r * 0.55, p.def.big ? 0.9 : 0.75);
    }
    if (!S) return;
    for (i = 0; i < S.buildings.length; i++) {
      var bl = S.buildings[i];
      if (bl.dead || bl.def.floor) continue;
      if (bl.x < b.x0 || bl.x > b.x1 || bl.y < b.y0 || bl.y > b.y1) continue;
      if (bl.def.chain) runShadow(bl);
      else shadow(bl.x, bl.y, Z.fpw(bl.def, bl.rot) * 0.55,
                  Z.fph(bl.def, bl.rot) * 0.42, 0.8);
    }
    for (i = 0; i < S.zombies.length; i++) {
      var zb = S.zombies[i];
      if (zb.x < b.x0 || zb.x > b.x1 || zb.y < b.y0 || zb.y > b.y1) continue;
      shadow(zb.x, zb.y, 0.34 * zb.size, 0.22 * zb.size, zb.dying ? 0.5 : 0.85);
    }
    for (i = 0; i < S.corpses.length; i++) {
      var cp = S.corpses[i];
      if (cp.x < b.x0 - 2 || cp.x > b.x1 + 2 || cp.y < b.y0 - 3 || cp.y > b.y1 + 1) continue;
      shadow(cp.x, cp.y, 0.4, 0.2, 0.4);
    }
    if (S.p && !(Z.base && Z.base.isBase())) shadow(S.p.x, S.p.y, 0.36, 0.23, 0.95);
  }

  /* ------------------------------------------------------------------ *
   * Seeing past things
   *
   * A five-storey block between the camera and the survivor hides him
   * completely, and in a city that is most of the time. Anything tall
   * standing in front of him fades to a ghost of itself while it is in
   * the way, and comes back when it is not.
   *
   * The test is a column test, not a sprite-rectangle one: the sprite has
   * transparent margins, and using its bounds faded buildings the player
   * was merely walking beside. A prop hides him when he is behind it in
   * depth, within its footprint across, and his feet fall inside the
   * height it is drawn at.
   * ------------------------------------------------------------------ */
  function hides(p, tx, ty) {
    if (ty >= p.y) return false;                       /* he is in front */
    var half = (p.def.fw || 1) / 2 + 0.35;
    if (Math.abs(tx - p.x) > half) return false;
    var baseY = cam.sy(p.y);
    return cam.sy(ty) > baseY - (p.def.h || 1) * cam.z;
  }

  function occlusion(p, dt) {
    var want = 0;
    if ((p.def.h || 0) >= 2.2) {
      var S = Z.sim, pl = S && S.p;
      if (pl && !pl.dead && hides(p, pl.x, pl.y)) want = 1;
    }
    /* eased, so walking behind a building is a fade and not a flicker */
    p.hid = Z.approach(p.hid || 0, want, 0.00002, dt || 0.016);
    if (p.hid < 0.004) p.hid = 0;
    return p.hid;
  }

  function collectProps(b) {
    for (var i = 0; i < wd.props.length; i++) {
      var p = wd.props[i];
      if (p.x < b.x0 - 3 || p.x > b.x1 + 3 || p.y < b.y0 - 4 || p.y > b.y1) continue;
      (function (p) {
        push(p.y, function (time) {
          var cv = Z.art.prop(p.def.art, p.v);
          var sway = 0;
          if (p.def.art === 'tree' || p.def.art === 'pine' || p.def.art === 'bush') {
            sway = Math.sin(time * 0.8 + p.x * 0.4 + p.y * 0.3) * 0.012;
          }
          if (p.work > 0) {
            /* shivers while it is being worked on */
            sway += Math.sin(time * 34) * 0.02;
          }
          var fade = 1 - occlusion(p, frameDt) * 0.68;
          if (sway) {
            var s = cam.z / (cv._ppm || PPM);
            ctx.save();
            if (fade < 1) ctx.globalAlpha = fade;
            ctx.translate(cam.sx(p.x), cam.sy(p.y));
            ctx.transform(1, 0, sway, 1, 0, 0);
            ctx.scale(s, s);
            ctx.drawImage(cv, -cv._ox, -cv._oy);
            ctx.restore();
          } else {
            blit(cv, p.x, p.y, fade, false);
          }
          if (p.work > 0) drawWorkRing(p);
          if (p.def.glow) {
            /* a fire somebody else is still keeping: light after dark, and
               a column of smoke all day, which is how you spot a camp
               from the other side of the map */
            if (wd.l < 0.5) {
              FX.light(p.x + 0.5, p.y - 0.2, 4.2, 0.55 * (1 - wd.l / 0.5), '255,214,140');
            }
            if (Math.random() < 0.05) FX.smoke(p.x, p.y - 0.1, 1, '152,148,140');
            if (Math.random() < 0.02) FX.burst(p.x, p.y - 0.1, 1, '232,150,58', 0.8);
          }
          if (cv._wins && wd.l < 0.52) litWindows(cv, p, time);
        });
      })(p);
    }
  }

  /* ------------------------------------------------------------------ *
   * Windows after dark
   *
   * The facade is baked once, unlit. Which of its windows are burning is
   * decided here, every frame, against the clock - so the same building
   * is dark at noon, half lit at dusk and a different half lit tomorrow,
   * and a street of them reads as a place where something is still on
   * rather than a picture of one.
   *
   * Baking the lit state into the sprite instead would have meant a
   * second copy of every variant and a city that never changed.
   * ------------------------------------------------------------------ */
  function litWindows(cv, p, time) {
    var wins = cv._wins;
    if (!wins.length) return;
    var night = Z.clamp01(1 - wd.l / 0.52);
    if (night <= 0.02) return;
    var s = cam.z / (cv._ppm || PPM);
    var ox = cam.sx(p.x) - cv._ox * s;
    var oy = cam.sy(p.y) - cv._oy * s;
    /* most buildings have no power at all: a city where every block is
       lit is a city that is still running */
    var live = Z.hash2(p.pid, 3, 6101);
    if (live > 0.34) return;
    /* how much of it is lit, and a slow drift so it is not a fixed pattern */
    var drift = time * 0.035 + p.pid * 0.37;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < wins.length; i++) {
      var w = wins[i];
      if (w.beacon) {
        /* an aircraft warning light, still blinking on its own supply */
        var b = 0.5 + 0.5 * Math.sin(time * 2.2 + p.pid);
        if (b < 0.4) continue;
        ctx.fillStyle = 'rgba(226,54,34,' + (b * 0.75).toFixed(3) + ')';
        ctx.fillRect(ox + (w.x - 2) * s, oy + (w.y - 2) * s, (w.w + 4) * s, (w.h + 4) * s);
        continue;
      }
      /* a stable per-window roll, nudged by the drift so a few change */
      var k = w.k + Math.sin(drift + w.k * 19) * 0.07;
      if (k > 0.22) continue;
      var a = (0.34 + (0.22 - k) * 1.3) * night;
      /* curtains glow rather than shine */
      var col = w.curtain ? '255,204,146' : '255,222,164';
      ctx.fillStyle = 'rgba(' + col + ',' + (a * (w.curtain ? 0.42 : 0.6)).toFixed(3) + ')';
      ctx.fillRect(ox + w.x * s, oy + w.y * s, w.w * s, w.h * s);
      /* the spill onto the wall around it */
      ctx.fillStyle = 'rgba(' + col + ',' + (a * 0.07).toFixed(3) + ')';
      ctx.fillRect(ox + (w.x - w.w * 0.22) * s, oy + (w.y - w.h * 0.18) * s,
                   w.w * 1.44 * s, w.h * 1.36 * s);
    }
    ctx.restore();
  }

  function drawWorkRing(p) {
    var S = Z.sim;
    var need = p.def.work;
    var k = Z.clamp01(p.work / need);
    var x = cam.sx(p.x), y = cam.sy(p.y) - 6;
    var r = Math.max(10, p.def.r * cam.z * 0.8);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(8,10,10,.7)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Z.TAU); ctx.stroke();
    ctx.strokeStyle = '#D2562A';
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + k * Z.TAU); ctx.stroke();
    ctx.lineWidth = 1;
  }

  function collectBuildings(b, time) {
    var S = Z.sim;
    if (!S) return;
    for (var i = 0; i < S.buildings.length; i++) {
      var bl = S.buildings[i];
      if (bl.def.floor) continue;
      if (bl.x < b.x0 - 4 || bl.x > b.x1 + 4 || bl.y < b.y0 - 5 || bl.y > b.y1) continue;
      (function (bl) {
        push(bl.y, function (time) { drawBuilding(bl, time); });
      })(bl);
    }
  }

  function drawBuilding(bl, time) {
    var def = bl.def;
    var cv = Z.art.building(def.id, bl.lvl, bl.rot, bl.mask);
    var dead = bl.dead;
    blit(cv, bl.x, bl.y, dead ? 0.35 : 1, false);

    /* turret head tracks its target */
    if (def.gun && !dead) {
      var hx = cam.sx(bl.x), hy = cam.sy(bl.y) - (def.art === 'tower' ? 2.25 : 0.62) * cam.z;
      var len = (def.art === 'mortar' || def.art === 'arclance' ? 1.0 : 0.62) * cam.z;
      Z.art.turretGun(ctx, hx, hy, bl.ang, len, def.gun.color, Math.max(2, cam.z * 0.09));
      if (bl.flash > 0) {
        var ex = hx + Math.cos(bl.ang) * len, ey = hy + Math.sin(bl.ang) * len * Z.PITCH;
        var g = ctx.createRadialGradient(ex, ey, 1, ex, ey, cam.z * 0.5 * bl.flash);
        g.addColorStop(0, 'rgba(255,238,196,' + (0.9 * bl.flash) + ')');
        g.addColorStop(1, 'rgba(255,170,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(ex, ey, cam.z * 0.5 * bl.flash, 0, Z.TAU); ctx.fill();
        FX.light(bl.x, bl.y - 0.4, 3.4, bl.flash * 0.8, '255,214,150');
      }
    }

    /* lamps and fires contribute to the light pass */
    if (def.light && !dead && bl.powered) {
      var flick = def.art === 'campfire' ? 0.86 + Math.sin(time * 9 + bl.x) * 0.14 : 1;
      FX.light(bl.x, bl.y - 0.3,
               (def.light * Z.bScale(bl.lvl) * 0.55 + def.light * 0.6) * Z.upMul('night'),
               0.85 * flick, def.art === 'campfire' ? '255,168,86' : '255,232,190');
      if (def.art === 'campfire') {
        drawFire(cam.sx(bl.x), cam.sy(bl.y) - cam.z * 0.18, cam.z * 0.4, time);
      }
    }
    if (def.art === 'smelter' && bl.powered && !dead) {
      FX.light(bl.x, bl.y, 3.6, 0.5, '255,150,60');
    }
    if (def.art === 'windmill' && !dead) {
      /* blades turn - drawn over the baked mast */
      var wx = cam.sx(bl.x), wy = cam.sy(bl.y) - 2.6 * cam.z;
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(time * (bl.powered ? 1.4 : 0.5));
      ctx.strokeStyle = 'rgba(178,182,186,.92)';
      ctx.lineWidth = Math.max(2, cam.z * 0.07);
      for (var k = 0; k < 3; k++) {
        ctx.rotate(Z.TAU / 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -cam.z * 0.95); ctx.stroke();
      }
      ctx.restore();
      ctx.lineWidth = 1;
    }

    /* damage: a hurt structure shows it before the bar appears */
    var hpK = bl.hp / bl.maxHp;
    if (hpK < 0.999 && !dead) {
      var bx = cam.sx(bl.x), by = cam.sy(bl.y);
      if (hpK < 0.6) {
        ctx.fillStyle = 'rgba(30,26,22,' + ((1 - hpK) * 0.30) + ')';
        ctx.beginPath();
        ctx.ellipse(bx, by - cam.z * 0.3, Z.fpw(def, bl.rot) * cam.z * 0.4,
                    cam.z * 0.4, 0, 0, Z.TAU);
        ctx.fill();
      }
      if (bl.hurt > 0 || hpK < 0.999) {
        bar(bx, by - (Z.fph(def, bl.rot) * 0.5 + 1.1) * cam.z,
            Z.fpw(def, bl.rot) * cam.z * 0.8, hpK,
            hpK < 0.35 ? '#D2562A' : '#7FA45C');
      }
    }
    if (!bl.powered && def.draw > 0 && !dead) {
      /* a structure without power says so where it stands */
      var px = cam.sx(bl.x);
      var py = cam.sy(bl.y) - (Z.fph(def, bl.rot) * 0.5 + 0.5) * cam.z;
      ctx.font = '700 ' + Math.max(9, cam.z * 0.38) + 'px "JetBrains Mono",monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(210,86,42,.92)';
      ctx.fillText('\u26A0', px, py);
    }
    if (bl.selected) selRing(bl.x, bl.y, Math.max(def.w, def.h) * 0.62, '#E4E0D6');
  }

  function drawFire(x, y, r, time) {
    for (var i = 0; i < 3; i++) {
      var t = time * 6 + i * 2.1;
      var fy = y - (i * 0.3 + (t % 1) * 0.5) * r;
      var rr = r * (0.7 - i * 0.16) * (0.8 + Math.sin(t) * 0.2);
      var g = ctx.createRadialGradient(x, fy, 1, x, fy, rr);
      g.addColorStop(0, 'rgba(255,244,196,.95)');
      g.addColorStop(0.4, 'rgba(255,164,54,.72)');
      g.addColorStop(1, 'rgba(200,70,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x + Math.sin(t * 1.4) * r * 0.16, fy, rr, 0, Z.TAU); ctx.fill();
    }
  }

  function collectBodies(b, time) {
    var S = Z.sim;
    if (!S) return;
    var i;
    /* Corpses were the one body list that went into the sort whatever
       the camera was looking at - forty of them, each a sprite blit and
       a shadow, most of them a map away. Same bounds test the living
       get. */
    for (i = 0; i < S.corpses.length; i++) {
      var cq = S.corpses[i];
      if (cq.x < b.x0 - 2 || cq.x > b.x1 + 2 || cq.y < b.y0 - 3 || cq.y > b.y1 + 1) continue;
      (function (c) { push(c.y - 0.01, function (t) { drawCorpse(c, t); }); })(cq);
    }
    R.zVisible = 0;
    for (i = 0; i < S.zombies.length; i++) {
      var zb = S.zombies[i];
      if (zb.x < b.x0 - 2 || zb.x > b.x1 + 2 || zb.y < b.y0 - 3 || zb.y > b.y1 + 1) continue;
      R.zVisible++;
      (function (zb) { push(zb.y, function (t) { drawZombie(zb, t); }); })(zb);
    }
    /* no survivor in base mode - you are the planner, not the man */
    if (S.p && !(Z.base && Z.base.isBase())) {
      push(S.p.y + 0.001, function (t) { drawPlayer(S.p, t); });
    }
  }

  /* World heading -> sprite facing.
     Slot 0 is walking toward the camera (+y, screen down); slots advance
     anticlockwise in world terms, which is clockwise on screen, so the
     art's mirrored halves land on the right side of the body. */
  function dir8(ang) {
    var k = Math.round((ang - Math.PI / 2) / (Z.TAU / 8));
    return ((k % 8) + 8) % 8;
  }
  R.dir8 = dir8;

  /* How many bodies are on screen this frame, counted by the pass that
     sorts them. Past a crowd, the trimmings come off the far ones: a
     health bar over a zombie forty metres away is four pixels nobody
     reads, and four hundred of them is the frame budget. */
  R.zVisible = 0;

  function drawZombie(zb, time) {
    var A = Z.art;
    var fr = A.zframe(zb.type.id, zb.anim, dir8(zb.face), zb.frame);
    if (!fr) {
      /* atlas still baking - a dark silhouette keeps the fight readable */
      var x = cam.sx(zb.x), y = cam.sy(zb.y);
      ctx.fillStyle = 'rgba(30,38,28,.9)';
      ctx.beginPath();
      ctx.ellipse(x, y - cam.z * 0.8, cam.z * 0.26, cam.z * 0.8, 0, 0, Z.TAU);
      ctx.fill();
      return;
    }
    var a = zb.dying ? Z.clamp01(1 - (zb.dieT - 0.7) / 0.5) : 1;
    var s = cam.z / fr.ppm * zb.size;
    ctx.save();
    if (a < 1) ctx.globalAlpha = a;
    ctx.translate(cam.sx(zb.x), cam.sy(zb.y));
    ctx.scale(fr.flip ? -s : s, s);
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -fr.ox, -fr.oy, fr.sw, fr.sh);
    ctx.restore();

    if (zb.flashT > 0) {
      /* white-out on the hit frame, clipped to the sprite */
      ctx.save();
      ctx.globalAlpha = Math.min(0.75, zb.flashT * 5);
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cam.sx(zb.x), cam.sy(zb.y));
      ctx.scale(fr.flip ? -s : s, s);
      ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -fr.ox, -fr.oy, fr.sw, fr.sh);
      ctx.restore();
    }
    if (zb.burn > 0) {
      drawFire(cam.sx(zb.x), cam.sy(zb.y) - cam.z * 0.7, cam.z * 0.34, time + zb.id);
      FX.light(zb.x, zb.y, 2.6, 0.5, '255,150,60');
    }
    if (zb.chill > 0) {
      ctx.fillStyle = 'rgba(140,224,226,.20)';
      ctx.beginPath();
      ctx.ellipse(cam.sx(zb.x), cam.sy(zb.y) - cam.z * 0.7, cam.z * 0.34, cam.z * 0.8, 0, 0, Z.TAU);
      ctx.fill();
    }
    if (!zb.dying && !(R.zVisible > 40 && zb.size < 1.2 &&
                       Z.dist2(zb.x, zb.y, cam.x, cam.y) > 400)) {
      var hk = zb.hp / zb.maxHp;
      if (hk < 0.999) {
        bar(cam.sx(zb.x), cam.sy(zb.y) - (1.95 * zb.size) * cam.z,
            Math.max(16, cam.z * 0.9 * zb.size), hk, zb.type.boss ? '#D2562A' : '#C8615A');
      }
      if (zb.marked > 0) {
        ctx.strokeStyle = 'rgba(210,86,42,.8)';
        ctx.lineWidth = 1.5;
        var mx = cam.sx(zb.x), my = cam.sy(zb.y) - 2.15 * zb.size * cam.z;
        ctx.beginPath();
        ctx.moveTo(mx - 5, my - 5); ctx.lineTo(mx, my); ctx.lineTo(mx + 5, my - 5);
        ctx.stroke();
      }
    }
    if (zb === Z.sim.target && !zb.dying) selRing(zb.x, zb.y, 0.55 * zb.size, '#D2562A');
  }


  /* Acid, in the air and on the ground.

     The glob was drawn as `tracer(mx, my, mx, my, ...)` - a line from a
     point to itself, which rasterises to nothing. So a spitter has been
     firing genuinely invisible projectiles that take a third of your
     health out of clear air. It gets a real body: a lit blob on an arc,
     a thinning tail behind it, and its own shadow tracking along the
     ground underneath so you can read where it is going to land. */
  function drawSpits() {
    var S = Z.sim;
    if (!S || !S.spits || !S.spits.length) return;
    for (var i = 0; i < S.spits.length; i++) {
      var sp = S.spits[i];
      var k = Z.clamp01(sp.t / sp.dur);
      var mx = Z.lerp(sp.x, sp.tx, k), my = Z.lerp(sp.y, sp.ty, k);
      var arc = Math.sin(k * Math.PI) * 1.7;
      var gx = cam.sx(mx), gy = cam.sy(my);
      var by = gy - arc * cam.z;
      var r = cam.z * 0.10;

      /* where it will land, and where it is over right now */
      ctx.fillStyle = 'rgba(8,14,8,.34)';
      ctx.beginPath(); ctx.ellipse(gx, gy, r * 1.1, r * 0.45, 0, 0, Z.TAU); ctx.fill();
      var tx2 = cam.sx(sp.tx), ty2 = cam.sy(sp.ty);
      ctx.strokeStyle = 'rgba(126,196,104,' + (0.16 + 0.2 * k).toFixed(2) + ')';
      ctx.lineWidth = Math.max(1, cam.z * 0.02);
      ctx.beginPath();
      ctx.ellipse(tx2, ty2, cam.z * 0.5, cam.z * 0.5 * Z.PITCH, 0, 0, Z.TAU);
      ctx.stroke();

      /* the tail */
      for (var t = 1; t <= 4; t++) {
        var kt = Math.max(0, k - t * 0.045);
        var lx = cam.sx(Z.lerp(sp.x, sp.tx, kt));
        var ly = cam.sy(Z.lerp(sp.y, sp.ty, kt)) - Math.sin(kt * Math.PI) * 1.7 * cam.z;
        ctx.fillStyle = 'rgba(110,176,92,' + (0.26 - t * 0.05).toFixed(2) + ')';
        ctx.beginPath();
        ctx.ellipse(lx, ly, r * (1 - t * 0.16), r * (0.8 - t * 0.13), 0, 0, Z.TAU);
        ctx.fill();
      }
      /* the glob */
      var g2 = ctx.createRadialGradient(gx - r * 0.3, by - r * 0.35, r * 0.1, gx, by, r);
      g2.addColorStop(0, 'rgba(206,240,168,.95)');
      g2.addColorStop(0.5, 'rgba(126,196,104,.95)');
      g2.addColorStop(1, 'rgba(58,110,52,.9)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.ellipse(gx, by, r, r * 1.12, 0, 0, Z.TAU);
      ctx.fill();
      FX.light(mx, my - arc, 1.5, 0.35, '130,220,110');
    }
  }

  function drawCorpse(c, time) {
    var A = Z.art;
    var fr = A.zframe(c.typeId, 'death', dir8(c.face), A.ZANIMS.death.n - 1);
    if (!fr) return;
    var a = Z.clamp01(1 - (c.t - 16) / 6);
    if (a <= 0) return;
    var s = cam.z / fr.ppm * c.size;
    ctx.save();
    ctx.globalAlpha = a * 0.92;
    ctx.translate(cam.sx(c.x), cam.sy(c.y));
    ctx.scale(fr.flip ? -s : s, s);
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -fr.ox, -fr.oy, fr.sw, fr.sh);
    ctx.restore();
  }

  function drawPlayer(p, time) {
    var A = Z.art;
    /* The dash leaves a few of him behind.

       Drawn first, so the real one is always in front of his own
       afterimages, and in a flat cold tone rather than a copy of the
       sprite's own colour - a faded duplicate reads as a second
       survivor, a silhouette reads as speed. */
    if (p.trail && p.trail.length) {
      for (var ti = 0; ti < p.trail.length; ti++) {
        var g = p.trail[ti];
        var gf = A.frame(g.anim, dir8(g.face), g.frame);
        if (!gf) continue;
        var ga = (1 - g.t / 0.26) * 0.34 * ((ti + 1) / p.trail.length);
        if (ga <= 0.01) continue;
        var gs = cam.z / gf.ppm;
        ctx.save();
        ctx.globalAlpha = ga;
        ctx.translate(cam.sx(g.x), cam.sy(g.y));
        ctx.scale(gf.flip ? -gs : gs, gs);
        ctx.drawImage(gf.img, gf.sx, gf.sy, gf.sw, gf.sh, -gf.ox, -gf.oy, gf.sw, gf.sh);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(150,196,220,.85)';
        ctx.fillRect(-gf.ox, -gf.oy, gf.sw, gf.sh);
        ctx.restore();
      }
    }
    /* A thin rust arc on the ground under him. In a crowd of bodies at
       this scale the eye needs one mark that is unambiguously you. */
    if (!p.dead) {
      var mx = cam.sx(p.x), my = cam.sy(p.y);
      var mr = 0.46 * cam.z;
      ctx.strokeStyle = 'rgba(210,86,42,.72)';
      ctx.lineWidth = Math.max(1.4, cam.z * 0.055);
      ctx.beginPath();
      ctx.ellipse(mx, my, mr, mr * Z.PITCH, 0, Math.PI * 0.14, Math.PI * 0.86);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(mx, my, mr, mr * Z.PITCH, 0, Math.PI * 1.14, Math.PI * 1.86);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    var fr = A.frame(p.anim, dir8(p.face), p.frame);
    if (!fr) fr = A.frame('idle', dir8(p.face), 0);
    if (!fr) return;
    var s = cam.z / fr.ppm;
    var wpn = Z.WEAPON[Z.S.weapon];
    var spr = wpn && Z.art.weaponSprite(wpn.shape, dir8(p.face));
    var behind = fr.grip && fr.grip.behind;

    function drawWeapon() {
      if (!spr || !fr.grip || p.anim === 'death') return;
      var cv = spr.cv;
      ctx.save();
      ctx.translate(cam.sx(p.x), cam.sy(p.y));
      ctx.scale(fr.flip ? -s : s, s);
      ctx.translate(fr.grip.x, fr.grip.y);
      ctx.rotate(fr.grip.a + (p.recoil || 0) * -0.5);
      ctx.drawImage(cv, -cv._ox, -cv._oy);
      ctx.restore();
    }

    if (behind) drawWeapon();
    ctx.save();
    ctx.translate(cam.sx(p.x), cam.sy(p.y));
    ctx.scale(fr.flip ? -s : s, s);
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -fr.ox, -fr.oy, fr.sw, fr.sh);
    ctx.restore();
    if (!behind) drawWeapon();

    if (p.hurtFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.6, p.hurtFlash * 4);
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cam.sx(p.x), cam.sy(p.y));
      ctx.scale(fr.flip ? -s : s, s);
      ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -fr.ox, -fr.oy, fr.sw, fr.sh);
      ctx.restore();
    }

    /* Muzzle flash, on the muzzle.

       It used to sit 0.55m in front of him at a fixed 1.02m off the
       ground, which put it halfway down a sniper's barrel and out past
       the end of a pistol's. Both numbers now come from the weapon and
       from the rig that holds it. */
    if (p.flash > 0 && fr.grip && spr) {
      var gl = wpn ? A.weaponReach(wpn.shape) : 0.3;
      var mx = cam.sx(p.x) + Math.cos(p.aim) * gl * cam.z;
      var my = cam.sy(p.y) - cam.z * A.GRIP_Z + Math.sin(p.aim) * gl * cam.z * Z.PITCH;
      var r = cam.z * 0.45 * p.flash;

      /* A cone out of the muzzle before the glow. The glow alone is a
         symmetric blob that could be coming from anywhere; the cone is
         what says the shot went that way. */
      var fl = cam.z * (0.30 + 0.42 * p.flash);
      var fw2 = cam.z * 0.16 * p.flash;
      var ca = Math.cos(p.aim), sa2 = Math.sin(p.aim) * Z.PITCH;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,236,186,' + (0.7 * p.flash) + ')';
      ctx.beginPath();
      ctx.moveTo(mx + ca * fl, my + sa2 * fl);
      ctx.lineTo(mx - sa2 * fw2 / Z.PITCH, my + ca * fw2 * Z.PITCH);
      ctx.lineTo(mx + sa2 * fw2 / Z.PITCH, my - ca * fw2 * Z.PITCH);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      var g = ctx.createRadialGradient(mx, my, 1, mx, my, r);
      g.addColorStop(0, 'rgba(255,246,214,' + (0.95 * p.flash) + ')');
      g.addColorStop(0.35, 'rgba(255,180,72,' + (0.6 * p.flash) + ')');
      g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Z.TAU); ctx.fill();
      FX.light(p.x, p.y - 0.5, 5.5, p.flash * 0.9, '255,216,160');
    }

    /* ---- the laser is a range preview ----

       It used to be a red line fading to nothing at the weapon's range,
       which told you a direction you already knew and hid the one fact
       worth knowing: where your bullets stop. Now the beam is solid for
       exactly as far as the gun reaches and the end of it is marked, so
       the line answers "can I hit that from here" without you having to
       fire to find out. It also stops at whatever is in the way, using
       the same raycast the shot itself uses - a laser that paints
       through a wall is worse than no laser.

       Drawn whenever the module is fitted rather than only while aiming:
       a range preview you can only see once you have committed to a
       target is not a preview. */
    if (p.hasLaser && !p.dead) {
      var range = p.stats ? Z.effRange(p.stats) : 8;
      /* rayShot answers with a distance, not a hit record */
      var reach = Z.flow && Z.flow.rayShot
        ? Math.min(range, Z.flow.rayShot(p.x, p.y, Math.cos(p.aim), Math.sin(p.aim), range))
        : range;
      var blocked = reach < range - 0.05;

      var lx = cam.sx(p.x), ly = cam.sy(p.y) - cam.z * 0.98;
      var ox2 = p.x + Math.cos(p.aim) * reach, oy2 = p.y + Math.sin(p.aim) * reach;
      var ex = cam.sx(ox2), ey = cam.sy(oy2) - cam.z * 0.6;
      var dim = p.aiming ? 1 : 0.5;

      ctx.save();
      ctx.lineCap = 'round';
      /* the beam: solid the whole way, because the whole way is the point */
      ctx.strokeStyle = 'rgba(232,72,58,' + (0.5 * dim).toFixed(2) + ')';
      ctx.lineWidth = Math.max(1, cam.z * 0.035);
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,190,180,' + (0.75 * dim).toFixed(2) + ')';
      ctx.lineWidth = Math.max(0.8, cam.z * 0.013);
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(ex, ey); ctx.stroke();

      /* where it stops, on the ground: a ring if that is the limit of
         the gun, a tight cross if something is in the way */
      var gx3 = cam.sx(ox2), gy3 = cam.sy(oy2);
      ctx.strokeStyle = blocked ? 'rgba(255,200,120,' + (0.8 * dim).toFixed(2) + ')'
                                : 'rgba(232,72,58,' + (0.7 * dim).toFixed(2) + ')';
      ctx.lineWidth = Math.max(1, cam.z * 0.022);
      if (blocked) {
        var cs2 = cam.z * 0.14;
        ctx.beginPath();
        ctx.moveTo(gx3 - cs2, gy3 - cs2 * Z.PITCH);
        ctx.lineTo(gx3 + cs2, gy3 + cs2 * Z.PITCH);
        ctx.moveTo(gx3 + cs2, gy3 - cs2 * Z.PITCH);
        ctx.lineTo(gx3 - cs2, gy3 + cs2 * Z.PITCH);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(gx3, gy3, cam.z * 0.26, cam.z * 0.26 * Z.PITCH, 0, 0, Z.TAU);
        ctx.stroke();
      }
      /* the dot on the target itself */
      ctx.fillStyle = 'rgba(255,120,104,' + (0.9 * dim).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(ex, ey, Math.max(1.4, cam.z * 0.035), 0, Z.TAU); ctx.fill();
      ctx.restore();
      ctx.lineCap = 'butt';
    }

    /* ---- the torch actually lights the ground ----

       A cone of real light, fed into the same light pass the muzzle
       flash and the lamps use, so it brightens the world rather than
       being a pale triangle drawn over the top of it. Three lights down
       the beam is enough to read as a cone once the night grade has it,
       and costs three entries in a list. */
    if (p.hasLight && !p.dead) {
      var lr = 7.2, night = Z.world.nightF ? Z.world.nightF() : 1;
      /* Three overlapping lights at full strength stacked into a white
         hole in the middle of the screen. A torch should let you read
         ground you otherwise could not, not erase it - so each sample is
         weak on its own and it is the overlap that makes the cone. */
      var pw = 0.12 + night * 0.26;
      for (var li = 1; li <= 3; li++) {
        var t3 = li / 3;
        FX.light(p.x + Math.cos(p.aim) * lr * t3 * 0.8,
                 p.y + Math.sin(p.aim) * lr * t3 * 0.8,
                 2.0 + t3 * 2.6, pw * (1.0 - t3 * 0.34), '255,238,202');
      }
      FX.light(p.x, p.y - 0.2, 1.9, pw * 0.5, '255,236,198');
      /* and the beam itself, so the source is visible in the dark */
      if (night > 0.12) {
        var bx = cam.sx(p.x), by = cam.sy(p.y) - cam.z * 0.95;
        var fx2 = cam.sx(p.x + Math.cos(p.aim) * lr);
        var fy2 = cam.sy(p.y + Math.sin(p.aim) * lr) - cam.z * 0.5;
        var perp = p.aim + Math.PI / 2;
        var spread = cam.z * 1.5;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        var cg = ctx.createLinearGradient(bx, by, fx2, fy2);
        cg.addColorStop(0, 'rgba(255,240,206,' + (0.09 * night).toFixed(3) + ')');
        cg.addColorStop(1, 'rgba(255,240,206,0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(fx2 + Math.cos(perp) * spread, fy2 + Math.sin(perp) * spread * Z.PITCH);
        ctx.lineTo(fx2 - Math.cos(perp) * spread, fy2 - Math.sin(perp) * spread * Z.PITCH);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }

  function bar(x, y, w, k, col) {
    var h = Math.max(3, cam.z * 0.10);
    ctx.fillStyle = 'rgba(6,9,10,.82)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = col;
    ctx.fillRect(x - w / 2, y, w * Z.clamp01(k), h);
  }
  R.bar = bar;

  function selRing(wx, wy, r, col) {
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(cam.sx(wx), cam.sy(wy), r * cam.z, r * cam.z * Z.PITCH, 0, 0, Z.TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  }
  R.selRing = selRing;

  R.rangeRing = function (wx, wy, r, col, fill) {
    var x = cam.sx(wx), y = cam.sy(wy);
    if (fill) {
      var g = ctx.createRadialGradient(x, y, 1, x, y, r * cam.z);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.72, 'rgba(0,0,0,0)');
      g.addColorStop(1, fill);
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(x, y); ctx.scale(1, Z.PITCH); ctx.translate(-x, -y);
      ctx.beginPath(); ctx.arc(x, y, r * cam.z, 0, Z.TAU); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(x, y, r * cam.z, r * cam.z * Z.PITCH, 0, 0, Z.TAU);
    ctx.stroke();
    ctx.lineWidth = 1;
  };

  /* ------------------------------------------------------------------ *
   * Effects pass
   * ------------------------------------------------------------------ */
  function drawEffects(time) {
    drawSpits();
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var k = 1 - p.t / p.life;
      var x = cam.sx(p.x), y = cam.sy(p.y) - p.z * cam.z;
      if (p.k === 'tracer') {
        var x1 = cam.sx(p.x1), y1 = cam.sy(p.y1) - p.z1 * cam.z;
        ctx.strokeStyle = 'rgba(' + p.col + ',' + (k * 0.9) + ')';
        ctx.lineWidth = p.w * Math.max(0.6, cam.z / 30);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.lineWidth = 1;
      } else if (p.k === 'smoke') {
        ctx.fillStyle = 'rgba(' + p.col + ',' + (k * 0.22) + ')';
        ctx.beginPath(); ctx.arc(x, y, p.r * cam.z, 0, Z.TAU); ctx.fill();
      } else if (p.k === 'num') {
        var sz = Math.max(10, cam.z * (p.big ? 0.62 : 0.44));
        ctx.font = '700 ' + sz + 'px "JetBrains Mono",ui-monospace,monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(4,6,8,' + (k * 0.8) + ')';
        ctx.fillText(p.text, x + 1, y + 1);
        ctx.fillStyle = 'rgba(' + p.col + ',' + k + ')';
        ctx.fillText(p.text, x, y);
      } else if (p.k === 'ring') {
        var rr = p.r * (1 + (1 - k) * 1.5);
        ctx.strokeStyle = 'rgba(' + p.col + ',' + (k * 0.7) + ')';
        ctx.lineWidth = 2 * Math.max(0.6, cam.z / 30);
        ctx.beginPath();
        ctx.ellipse(cam.sx(p.x), cam.sy(p.y), rr * cam.z, rr * cam.z * Z.PITCH, 0, 0, Z.TAU);
        ctx.stroke();
        ctx.lineWidth = 1;
      } else if (p.k === 'shock') {
        /* out fast and thin, easing off - the wave arriving */
        var sk = 1 - k;
        var sr = p.r * (1 + Z.smooth(sk) * 5.5);
        ctx.strokeStyle = 'rgba(' + p.col + ',' + (k * k * 0.8) + ')';
        ctx.lineWidth = Math.max(1, p.w * k) * Math.max(0.6, cam.z / 30);
        ctx.beginPath();
        ctx.ellipse(cam.sx(p.x), cam.sy(p.y), sr * cam.z, sr * cam.z * Z.PITCH,
                    0, 0, Z.TAU);
        ctx.stroke();
        ctx.lineWidth = 1;
      } else if (p.k === 'fire') {
        if (p.t < 0) continue;
        /* white at the heart, orange through the body, black at the edge
           as it turns to smoke - one gradient doing the whole life */
        var fk = 1 - p.t / p.life;
        var fr = p.r * (0.6 + (1 - fk) * 0.9) * cam.z;
        var fx2 = cam.sx(p.x), fy2 = cam.sy(p.y) - p.z * cam.z;
        var fg = ctx.createRadialGradient(fx2, fy2 - fr * 0.2, fr * 0.1, fx2, fy2, fr);
        fg.addColorStop(0, 'rgba(255,250,228,' + (fk * fk * 0.95) + ')');
        fg.addColorStop(0.32, 'rgba(255,196,96,' + (fk * 0.85) + ')');
        fg.addColorStop(0.7, 'rgba(226,108,36,' + (fk * 0.55) + ')');
        fg.addColorStop(1, 'rgba(60,46,40,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(fx2, fy2, fr, 0, Z.TAU); ctx.fill();
        FX.light(p.x, p.y, p.r * 3.2, fk * 0.9, '255,166,70');
      } else if (p.k === 'coin') {
        /* Not a disc - a disc spinning about a vertical axis is what a
           coin does, so the width is a cosine of the spin and the edge
           shows when it turns side-on. That is the whole read. */
        var cr = p.r * p.fat * cam.z, cz = p.z * cam.z;
        var gy2 = cam.sy(p.y);
        var turn = Math.cos(p.spin);
        var wide = Math.abs(turn);
        var al = p.fade != null ? Z.clamp01(p.fade) : 1;
        ctx.globalAlpha = al;
        ctx.fillStyle = 'rgba(8,8,6,' + (0.32 * Math.max(0, 1 - p.z)).toFixed(2) + ')';
        ctx.beginPath();
        ctx.ellipse(x, gy2, cr * 1.05, cr * 0.42, 0, 0, Z.TAU);
        ctx.fill();
        var cy2 = gy2 - cz;
        /* the edge, drawn behind so the face sits on it */
        ctx.fillStyle = '#8A6420';
        ctx.beginPath();
        ctx.ellipse(x, cy2 + cr * 0.12, Math.max(1.2, cr * wide), cr, 0, 0, Z.TAU);
        ctx.fill();
        var gg = ctx.createLinearGradient(x, cy2 - cr, x, cy2 + cr);
        gg.addColorStop(0, '#FFE9A6');
        gg.addColorStop(0.45, '#E3A63F');
        gg.addColorStop(1, '#A87A24');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.ellipse(x, cy2, Math.max(1, cr * wide), cr, 0, 0, Z.TAU);
        ctx.fill();
        if (wide > 0.45) {
          ctx.fillStyle = 'rgba(255,244,206,.5)';
          ctx.beginPath();
          ctx.ellipse(x - cr * wide * 0.28, cy2 - cr * 0.26,
                      cr * wide * 0.36, cr * 0.32, 0, 0, Z.TAU);
          ctx.fill();
        }
        if (p.homing > 0.2) {
          ctx.fillStyle = 'rgba(255,214,120,' + (0.26 * p.homing).toFixed(2) + ')';
          ctx.beginPath();
          ctx.ellipse(x, cy2, cr * 2.3, cr * 1.5, 0, 0, Z.TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else if (p.k === 'pick') {
        /* a nugget with a lit face, and its own shadow on the ground so
           it reads as an object in the world rather than a sprite over it */
        var pr = p.r * cam.z, pz = p.z * cam.z;
        var gy = cam.sy(p.y);
        ctx.fillStyle = 'rgba(8,8,6,' + (0.3 * Math.max(0, 1 - p.z)).toFixed(2) + ')';
        ctx.beginPath();
        ctx.ellipse(x, gy, pr * 1.1, pr * 0.5, 0, 0, Z.TAU);
        ctx.fill();
        ctx.save();
        ctx.translate(x, gy - pz);
        ctx.rotate(p.spin);
        ctx.fillStyle = 'rgb(' + p.col + ')';
        ctx.fillRect(-pr, -pr * 0.82, pr * 2, pr * 1.64);
        ctx.fillStyle = 'rgba(255,255,255,.38)';
        ctx.fillRect(-pr, -pr * 0.82, pr * 2, pr * 0.5);
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.fillRect(-pr, pr * 0.42, pr * 2, pr * 0.4);
        ctx.restore();
        /* a faint trail once it is coming for you */
        if (p.homing > 0.15) {
          ctx.fillStyle = 'rgba(' + p.col + ',' + (0.22 * p.homing).toFixed(2) + ')';
          ctx.beginPath();
          ctx.ellipse(x, gy - pz, pr * 2.4, pr * 1.2, 0, 0, Z.TAU);
          ctx.fill();
        }
      } else if (p.k === 'flash') {
        var g = ctx.createRadialGradient(x, y, 1, x, y, p.r * cam.z * (0.6 + k * 0.4));
        g.addColorStop(0, 'rgba(' + p.col + ',' + (k * 0.9) + ')');
        g.addColorStop(1, 'rgba(' + p.col + ',0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, p.r * cam.z, 0, Z.TAU); ctx.fill();
        FX.light(p.x, p.y, p.r * 1.6, k * 0.8, p.col);
      } else if (p.k === 'shell') {
        /* fades only at the very end, so the brass lies on the ground for
           a moment after the shot - the thing that says a lot just
           happened here */
        var sa = Math.min(1, k * 5);
        var sl = Math.max(1.5, p.r * cam.z * 2.4), sw = Math.max(1, p.r * cam.z);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillStyle = 'rgba(' + p.col + ',' + sa + ')';
        ctx.fillRect(-sl / 2, -sw / 2, sl, sw);
        ctx.fillStyle = 'rgba(255,238,190,' + (sa * 0.6) + ')';
        ctx.fillRect(-sl / 2, -sw / 2, sl * 0.4, sw * 0.5);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(' + p.col + ',' + (k * 0.95) + ')';
        var s = Math.max(1, p.r * cam.z);
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Overlays that live in the world but are not bodies
   * ------------------------------------------------------------------ */
  function drawOverlays(time, S) {
    if (!S || !S.p) return;

    if (Z.base && Z.base.isBase()) return;

    /* A task you picked but have not walked to yet. The survivor never
       travels on his own, so this marks where you have to take him. */
    if (S.p.task && S.p.task.prop && !S.p.task.prop.gone && S.p.workT <= 0) {
      var tp = S.p.task.prop;
      var k = (time * 1.4) % 1;
      ctx.strokeStyle = 'rgba(227,166,63,' + (0.55 * (1 - k)) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cam.sx(tp.x), cam.sy(tp.y),
                  (tp.def.r + k * 0.6) * cam.z, (tp.def.r + k * 0.6) * cam.z * Z.PITCH,
                  0, 0, Z.TAU);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    /* Anything with a crate full of something says so, from across the
       compound. A shed you have to walk up to and click to find out is a
       shed you forget about. */
    for (var bi = 0; bi < S.buildings.length; bi++) {
      var bb = S.buildings[bi];
      if (bb.dead || !bb.def.makes) continue;
      var fill = S.stockFill(bb);
      if (fill < 0.14) continue;
      /* off to the shoulder, not straight up: the hover label lives
         directly above a building and the two were sitting on top of
         each other the moment you pointed at one */
      var px = cam.sx(bb.x) + Math.max(0.5, (bb.def.w || 1) * 0.45) * cam.z;
      var py = cam.sy(bb.y) - (bb.def.z || 1.4) * cam.z - 6;
      if (px < -40 || py < -40 || px > W + 40 || py > H + 40) continue;
      var full = fill > 0.995;
      var bob = Math.sin(time * 2.6 + bi) * 2;
      ctx.save();
      ctx.globalAlpha = full ? 1 : 0.55 + fill * 0.45;
      ctx.fillStyle = full ? 'rgba(227,166,63,.95)' : 'rgba(127,164,92,.9)';
      ctx.beginPath();
      ctx.arc(px, py + bob, full ? 6.5 : 5, 0, Z.TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,11,13,.7)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      if (full) {
        ctx.globalAlpha = 0.34 + Math.sin(time * 4) * 0.16;
        ctx.beginPath();
        ctx.arc(px, py + bob, 11, 0, Z.TAU);
        ctx.stroke();
      }
      ctx.restore();
      ctx.lineWidth = 1;
    }

    /* whatever is hovered gets named where it stands, not in a panel */
    var h = S.hover;
    if (h && h.obj && h.kind === 'building' && !h.obj.dead) outlineBuilding(h.obj);
    if (h && h.obj) {
      var label = h.label, x = cam.sx(h.x), y = cam.sy(h.y) - (h.h || 1.4) * cam.z - 8;
      ctx.font = '600 12px Barlow,system-ui,sans-serif';
      ctx.textAlign = 'center';
      var w = ctx.measureText(label).width + 16;
      ctx.fillStyle = 'rgba(8,11,13,.82)';
      roundRect(x - w / 2, y - 17, w, 19, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(226,222,212,.14)';
      ctx.stroke();
      ctx.fillStyle = '#E4E0D6';
      ctx.fillText(label, x, y - 3.5);
      if (h.sub) {
        ctx.font = '500 10px "JetBrains Mono",monospace';
        ctx.fillStyle = h.subCol || '#8A939B';
        ctx.fillText(h.sub, x, y + 12);
      }
    }

    /* selected structure shows what it covers */
    if (S.sel && !S.sel.dead) {
      var def = S.sel.def;
      if (def.gun) R.rangeRing(S.sel.x, S.sel.y, def.gun.range * Z.bScale(S.sel.lvl) * 0.5 + def.gun.range * 0.5,
                               'rgba(210,86,42,.42)', 'rgba(210,86,42,.10)');
      else if (def.light) R.rangeRing(S.sel.x, S.sel.y, def.light, 'rgba(227,166,63,.40)', 'rgba(227,166,63,.08)');
      else if (def.radius) R.rangeRing(S.sel.x, S.sel.y, def.radius, 'rgba(127,164,92,.40)', 'rgba(127,164,92,.08)');
    }
  }

  /* A silhouette of the sprite, drawn eight ways round the real one.

     There is no stroke that follows a bitmap, so the outline is the
     sprite itself: painted into a scratch canvas, flooded with one colour
     through source-in, and stamped around the edge before the real thing
     goes on top of it. One hovered building a frame, so one scratch
     canvas is enough. */
  var outCv = null, outCtx = null;
  function outlineBuilding(b) {
    var cv = Z.art.building(b.defId, b.lvl, b.rot, b.mask);
    if (!cv) return;
    if (!outCv || outCv.width < cv.width || outCv.height < cv.height) {
      outCv = Z.canvas(Math.max(cv.width, 64), Math.max(cv.height, 64));
      outCtx = outCv.getContext('2d');
    }
    var oc = outCtx;
    oc.setTransform(1, 0, 0, 1, 0, 0);
    oc.clearRect(0, 0, outCv.width, outCv.height);
    oc.globalCompositeOperation = 'source-over';
    oc.drawImage(cv, 0, 0);
    oc.globalCompositeOperation = 'source-in';
    oc.fillStyle = '#FFF4D8';
    oc.fillRect(0, 0, cv.width, cv.height);
    oc.globalCompositeOperation = 'source-over';

    var sc = cam.z / (cv._ppm || PPM);
    var x = cam.sx(b.x) - cv._ox * sc, y = cam.sy(b.y) - cv._oy * sc;
    var w = cv.width * sc, hgt = cv.height * sc;
    var d = Math.max(1.4, 1.9 * sc);
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      ctx.drawImage(outCv, 0, 0, cv.width, cv.height,
                    x + Math.cos(a) * d, y + Math.sin(a) * d, w, hgt);
    }
    /* and the building itself back over the top of its own halo - this
       pass runs after the world is drawn, so without it the silhouette
       is all you see and the thing you are pointing at disappears */
    ctx.globalAlpha = 1;
    ctx.drawImage(cv, 0, 0, cv.width, cv.height, x, y, w, hgt);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  R.roundRect = roundRect;

  /* ------------------------------------------------------------------ *
   * Lighting - one darkness sheet, lamps cut out of it
   * ------------------------------------------------------------------ */
  var lightCv = null, lightCtx = null;

  function drawLighting(time) {
    var l = wd.l;
    var dark = Z.clamp01(1 - l);
    /* Night has to be dark enough that a floodlight matters and light
       enough that the map is still playable in it. Past about 0.6 the
       ground disappears entirely and the game stops. */
    var amount = dark * dark * 0.58;
    if (amount < 0.015 && frameLights.length === 0) return;

    var lw = Math.max(64, Math.ceil(W / 2)), lh = Math.max(64, Math.ceil(H / 2));
    if (!lightCv || lightCv.width !== lw || lightCv.height !== lh) {
      lightCv = Z.canvas(lw, lh);
      lightCtx = lightCv.getContext('2d');
    }
    var c = lightCtx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, lw, lh);
    /* Night is blue-black, dusk keeps a little warmth in it - and a
       blood moon is neither. The dark itself goes red, so the whole
       frame tells you what kind of night it is without a word on it. */
    var nb = Z.mix([8, 14, 30], [26, 16, 14], wd.warm * 0.5);
    if (Z.sim.bloodMoon) nb = Z.mix(nb, [58, 8, 10], 0.78);
    c.fillStyle = 'rgba(' + (nb[0] | 0) + ',' + (nb[1] | 0) + ',' + (nb[2] | 0) + ',' + amount + ')';
    c.fillRect(0, 0, lw, lh);

    c.globalCompositeOperation = 'destination-out';
    for (var i = 0; i < frameLights.length; i++) {
      var L = frameLights[i];
      var x = cam.sx(L[0]) / 2, y = cam.sy(L[1]) / 2;
      var r = Math.max(4, L[2] * cam.z / 2);
      if (x < -r || y < -r || x > lw + r || y > lh + r) continue;
      var g = c.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,' + Math.min(1, L[3]) + ')');
      g.addColorStop(0.55, 'rgba(0,0,0,' + Math.min(1, L[3] * 0.55) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, Z.TAU); c.fill();
    }
    c.globalCompositeOperation = 'source-over';

    ctx.drawImage(lightCv, 0, 0, lw, lh, 0, 0, W, H);

    /* Warm spill on top of the darkness, so a lamp reads as a lamp.

       Two passes, because one gradient cannot be both. The wide one is
       the pool the light throws across the ground and falls away slowly;
       the tight one is the glare close in, which is what makes a fire
       look hot rather than look like an orange circle. */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var k = 0; k < frameLights.length; k++) {
      var L2 = frameLights[k];
      var lx = cam.sx(L2[0]), ly = cam.sy(L2[1]);
      var lr = L2[2] * cam.z;
      if (lx < -lr || ly < -lr || lx > W + lr || ly > H + lr) continue;
      var col = L2[4] || '255,224,170';
      ctx.save();
      ctx.translate(lx, ly); ctx.scale(1, Z.PITCH * 1.25); ctx.translate(-lx, -ly);

      var gg = ctx.createRadialGradient(lx, ly, 1, lx, ly, lr);
      var a = L2[3] * (0.19 + dark * 0.42);
      gg.addColorStop(0, 'rgba(' + col + ',' + a + ')');
      gg.addColorStop(0.42, 'rgba(' + col + ',' + (a * 0.46) + ')');
      gg.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Z.TAU); ctx.fill();

      var hr = lr * 0.34;
      var hg = ctx.createRadialGradient(lx, ly, 1, lx, ly, hr);
      var ha = L2[3] * (0.10 + dark * 0.30);
      hg.addColorStop(0, 'rgba(' + col + ',' + ha + ')');
      hg.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(lx, ly, hr, 0, Z.TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * Fog of war
   * ------------------------------------------------------------------ */
  /* Fog is drawn into a quarter-scale buffer and blown back up, so the
     boundary between what you have seen and what you have not is a soft
     edge rather than a staircase of 8m squares. The upscale alone only
     feathers a pixel or two, which still read as a black rectangle ruled
     across the map, so the buffer is blurred first - at quarter scale,
     where the blur costs a sixteenth of what it would on the full frame. */
  var fogCv = null, fogCtx = null;
  var fogBlur = null, fogBlurCtx = null;

  /* Buffer overscan, in buffer pixels. A blur reads anything past the edge
     of a canvas as transparent, so without margin the fog would fade out
     along the borders of the screen and leave a bright rim exactly where
     it should be solid. */
  var FOG_PAD = 24;

  function drawFog(b) {
    var CH = wd.CHUNK, CWn = wd.CW;
    var fw = Math.max(32, Math.ceil(W / 4)) + FOG_PAD * 2;
    var fh = Math.max(32, Math.ceil(H / 4)) + FOG_PAD * 2;
    if (!fogCv || fogCv.width !== fw || fogCv.height !== fh) {
      fogCv = Z.canvas(fw, fh);
      fogCtx = fogCv.getContext('2d');
      fogBlur = Z.canvas(fw, fh);
      fogBlurCtx = fogBlur.getContext('2d');
    }
    var c = fogCtx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, fw, fh);

    var c0 = Math.max(-2, Math.floor(b.x0 / CH)), c1 = Math.min(CWn + 1, Math.floor(b.x1 / CH));
    var r0 = Math.max(-2, Math.floor(b.y0 / CH)), r1 = Math.min(CWn + 1, Math.floor(b.y1 / CH));
    var any = false;
    for (var cy = r0; cy <= r1; cy++) {
      for (var cx = c0; cx <= c1; cx++) {
        var inb = cx >= 0 && cy >= 0 && cx < CWn && cy < CWn;
        if (inb && wd.disc[cy * CWn + cx]) continue;
        any = true;
        var x = cam.sx(cx * CH) / 4 + FOG_PAD, y = cam.sy(cy * CH) / 4 + FOG_PAD;
        var w = CH * cam.z / 4 + 0.6, h = CH * cam.z * Z.PITCH / 4 + 0.6;
        c.fillStyle = inb ? 'rgba(6,8,11,.93)' : 'rgba(3,4,6,1)';
        c.fillRect(x, y, w, h);
      }
    }
    if (!any) return;

    /* a fifth of a chunk, so the edge softens with the zoom */
    var soft = Z.clamp(CH * cam.z / 4 * 0.2, 1.5, FOG_PAD * 0.5);
    var src = fogCv;
    if (fogBlurCtx) {
      fogBlurCtx.setTransform(1, 0, 0, 1, 0, 0);
      fogBlurCtx.clearRect(0, 0, fw, fh);
      fogBlurCtx.filter = 'blur(' + soft.toFixed(1) + 'px)';
      fogBlurCtx.drawImage(fogCv, 0, 0);
      fogBlurCtx.filter = 'none';
      src = fogBlur;
    }

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, FOG_PAD, FOG_PAD, fw - FOG_PAD * 2, fh - FOG_PAD * 2, 0, 0, W, H);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * Air - mist, ash, vignette
   * ------------------------------------------------------------------ */
  function drawAir(time) {
    var l = wd.l;

    /* drifting ash. Positions are a pure function of time, so this
       carries no state and cannot accumulate drift. */
    var n = W > 900 ? 70 : 42;
    for (var i = 0; i < n; i++) {
      var sp = 7 + Z.hash1(i * 3, 2) * 16;
      var x = ((Z.hash1(i, 1) * W + time * sp) % (W + 60)) - 30;
      var y = ((Z.hash1(i, 9) * H + time * sp * 0.34) % (H + 60)) - 30;
      var r = 0.7 + Z.hash1(i * 7, 4) * 1.5;
      var a = (0.05 + Z.hash1(i * 11, 6) * 0.13) * (0.5 + l * 0.5);
      ctx.fillStyle = 'rgba(214,208,192,' + a + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Z.TAU); ctx.fill();
    }

    /* Birds. The only thing left in this city that is going anywhere, and
       the clearest signal that it is daytime - they are gone by dusk. */
    if (l > 0.45) {
      var flocks = 2;
      for (var fl = 0; fl < flocks; fl++) {
        var t = (time * 0.05 + fl * 0.4) % 1;
        var bx = -60 + t * (W + 120);
        var by = H * (0.12 + fl * 0.17) + Math.sin(time * 0.5 + fl) * 14;
        var dir = fl % 2 ? 1 : -1;
        if (dir < 0) bx = W + 60 - t * (W + 120);
        ctx.strokeStyle = 'rgba(38,40,42,' + (0.18 * (l - 0.45) / 0.55 + 0.05).toFixed(3) + ')';
        ctx.lineWidth = 1.3;
        for (var b = 0; b < 5; b++) {
          var ox2 = bx + b * 13 * dir + Math.sin(time * 1.2 + b) * 3;
          var oy2 = by + (b % 3) * 7 + Math.cos(time * 0.9 + b * 2) * 3;
          var flap = Math.sin(time * 7 + b * 1.7) * 3;
          ctx.beginPath();
          ctx.moveTo(ox2 - 4, oy2 + flap);
          ctx.lineTo(ox2, oy2 - 1);
          ctx.lineTo(ox2 + 4, oy2 + flap);
          ctx.stroke();
        }
        ctx.lineWidth = 1;
      }
    }

    /* ground mist, heaviest before dawn */
    var mist = Z.clamp01((0.34 - l) / 0.34) * 0.30 + wd.warm * 0.12;
    if (mist > 0.02) {
      for (var m = 0; m < 3; m++) {
        var my = H * (0.35 + m * 0.22) + Math.sin(time * 0.12 + m * 2) * 18;
        var g = ctx.createLinearGradient(0, my - 90, 0, my + 90);
        g.addColorStop(0, 'rgba(150,160,166,0)');
        g.addColorStop(0.5, 'rgba(150,160,166,' + (mist * 0.10) + ')');
        g.addColorStop(1, 'rgba(150,160,166,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, my - 90, W, 180);
      }
    }

    /* warm horizon wash at dawn and dusk */
    if (wd.warm > 0.06) {
      var wg = ctx.createLinearGradient(0, 0, 0, H);
      wg.addColorStop(0, 'rgba(226,122,52,' + (wd.warm * 0.10) + ')');
      wg.addColorStop(0.6, 'rgba(226,122,52,0)');
      ctx.fillStyle = wg;
      ctx.fillRect(0, 0, W, H);
    }

    /* Vignette - pulls the eye to the middle. It eases off after dark,
       because the darkness pass has already done that job and stacking the
       two closes the frame down to a keyhole. */
    /* The frame closes in at night rather than opening up: the dark is
       the pressure, and a lit pool in the middle of a dark edge is the
       whole look. */
    if (!Z.postOn()) return;
    var vg2 = 0.27 + l * 0.15;
    if (Z.sim.bloodMoon) {
      /* the edges close in further and go the colour of the moon */
      var bm = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.26,
                                        W / 2, H / 2, Math.max(W, H) * 0.74);
      bm.addColorStop(0, 'rgba(120,10,12,0)');
      bm.addColorStop(1, 'rgba(120,10,12,.30)');
      ctx.fillStyle = bm;
      ctx.fillRect(0, 0, W, H);
    }
    var v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34,
                                     W / 2, H / 2, Math.max(W, H) * 0.76);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,' + vg2 + ')');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);

    /* Taking damage tints the outer edge. It has to be felt at a glance
       and then get out of the way: flooding the frame at full strength
       makes a bad moment unreadable exactly when you need to see. */
    var p = Z.sim && Z.sim.p;
    if (p) {
      var low = p.hp / p.maxHp < 0.3 ? (0.09 + Math.sin(time * 3.4) * 0.035) : 0;
      var hurt = Math.max(p.hurtFlash * 0.42, low);
      if (hurt > 0.02) {
        var hg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.46,
                                          W / 2, H / 2, Math.max(W, H) * 0.66);
        hg.addColorStop(0, 'rgba(176,28,22,0)');
        hg.addColorStop(1, 'rgba(176,28,22,' + Math.min(0.30, hurt) + ')');
        ctx.fillStyle = hg;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

})(window.Z);
