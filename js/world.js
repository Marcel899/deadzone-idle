/* Deadzone - the world itself.

   One persistent 224m square of dead suburb. Terrain, roads, water and
   every prop on it are a pure function of the save's seed, so a save only
   ever has to store the seed plus the handful of tiles the player changed.

   The same clock that moves the sun drives gameplay: light level feeds
   solar panels, zombie aggression and how far you can see. */
(function (Z) {
  'use strict';

  var W = Z.world = {};

  /* Tile kinds. Index into PAL below. */
  /* Four of these are new with the city: a pavement is not a road and
     not a yard, a plaza is not a pavement, ballast is not gravel, and a
     park path is not any of them. They index into PAL below, which is why
     they go on the end rather than anywhere tidier. */
  var T = W.T = {
    WATER: 0, GRASS: 1, DIRT: 2, GRAVEL: 3, ROAD: 4, ASPHALT: 5, CLEARED: 6, PAVED: 7,
    SIDEWALK: 8, PLAZA: 9, BALLAST: 10, PARKPATH: 11
  };

  W.SIZE = 224;            /* tiles on a side; 1 tile = 1 metre */
  W.CHUNK = 8;             /* discovery granularity */
  W.CW = W.SIZE / W.CHUNK;

  W.DAY_LEN = 600;         /* real seconds for one in-game day */
  W.t = 0.34;              /* 0 = midnight, 0.5 = noon */
  W.day = 1;
  W.l = 1;                 /* cached light 0..1 */
  W.warm = 0;              /* dawn/dusk warmth 0..1 */

  W.terrain = null;        /* Uint8Array SIZE*SIZE */
  W.disc = null;           /* Uint8Array CW*CW, 0 unseen 1 seen */
  W.props = [];            /* live prop list */
  W.pgrid = null;          /* tile index -> prop, for O(1) hit tests */
  W.occ = null;            /* tile index -> building id + 1 */
  W.floor = null;          /* tile index -> floor building id + 1 (paving) */
  W.seed = 1;

  var idx = W.idx = function (x, y) { return y * W.SIZE + x; };
  W.inside = function (x, y) { return x >= 0 && y >= 0 && x < W.SIZE && y < W.SIZE; };

  /* ------------------------------------------------------------------ *
   * Generation
   * ------------------------------------------------------------------ */
  W.CENTER = W.SIZE / 2;

  W.generate = function (seed) {
    W.seed = seed >>> 0 || 1;
    var N = W.SIZE, n = N * N;
    var ter = W.terrain = new Uint8Array(n);
    W.occ = new Uint16Array(n);
    W.floor = new Uint16Array(n);
    W.disc = new Uint8Array(W.CW * W.CW);
    W.pgrid = new Array(n);
    W.props = [];
    nextPid = 1;

    var s = W.seed, x, y, i;

    /* ---- base terrain: grass with dirt patches, ponds in the low spots ---- */
    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) {
        i = idx(x, y);
        var h = Z.fbm(x * 0.028, y * 0.028, s, 4);
        var d = Z.fbm(x * 0.075 + 40, y * 0.075 - 20, s + 7, 3);
        var t = T.GRASS;
        /* water only in the genuinely low ground, with a muddy shore */
        if (h < 0.255) t = T.WATER;
        else if (h < 0.30) t = T.DIRT;
        else if (d > 0.68) t = T.DIRT;
        else if (d < 0.28) t = T.GRAVEL;
        ter[i] = t;
      }
    }

    /* ---- the starting clearing: guarantee a flat, dry, empty home ---- */
    /* A ragged clearing rather than a square: the edge wanders with the
       same noise the rest of the map uses, so it reads as ground somebody
       cleared and not as a painted rectangle. */
    var c = W.CENTER;
    for (y = c - 13; y <= c + 13; y++) {
      for (x = c - 13; x <= c + 13; x++) {
        if (!W.inside(x, y)) continue;
        var dx2 = x - c, dy2 = y - c;
        var rr = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        var wob = 7.4 + Z.fbm(x * 0.16, y * 0.16, s + 31, 2) * 3.6;
        if (rr <= wob) ter[idx(x, y)] = T.CLEARED;
        else if (rr <= wob + 2.4 && ter[idx(x, y)] === T.WATER) ter[idx(x, y)] = T.DIRT;
        else if (rr <= 11 && ter[idx(x, y)] === T.WATER) ter[idx(x, y)] = T.DIRT;
      }
    }

    /* ---- the city ----
       Everything above this line is ground. Everything below it - the
       streets, the districts, every building and every wreck - comes out
       of city.js, which needs the terrain and the clearing to already be
       there before it can decide what belongs where. */
    Z.city.generate(W.seed);

    /* Every prop the generator will ever make has a stable id, so a save
       only has to list the ones that are gone. */
    W.maxPid = nextPid - 1;
    W.discover(c, c, 14);
    return W;
  };

  var nextPid = 1;
  function add(kind, x, y, rnd) {
    var def = Z.PROPS[kind];
    var p = {
      pid: nextPid++, kind: kind, def: def, x: x, y: y,
      v: rnd ? rnd() : Math.random(),         /* art variation */
      hp: def.hp, work: 0, gone: false
    };
    W.props.push(p);
    stamp(p, p);
    return p;
  }

  /* ------------------------------------------------------------------ *
   * Interiors
   *
   * An enterable building is a ring of wall with a gap in it, not a solid
   * block. The mask is one byte per footprint tile: 1 stops you, 0 does
   * not. It is derived from the building's own art seed, so it is the same
   * every time the world is generated from the same seed and never has to
   * be saved.
   *
   * The door always goes in the south wall - the face toward the camera -
   * because a door you cannot see is a door you will not find.
   * ------------------------------------------------------------------ */
  function shell(def, v) {
    var fw = def.fw, fh = def.fh;
    var m = new Uint8Array(fw * fh);
    var i, x, y;
    for (y = 0; y < fh; y++) {
      for (x = 0; x < fw; x++) {
        m[y * fw + x] = (x === 0 || y === 0 || x === fw - 1 || y === fh - 1) ? 1 : 0;
      }
    }
    /* the front door, and a second opening on a big building */
    var door = 1 + Math.floor(v * (fw - 2));
    m[(fh - 1) * fw + door] = 0;
    if (fw >= 6) m[(fh - 1) * fw + Math.max(1, fw - 2 - door % 2)] = 0;

    /* one internal wall once there is room for two rooms, with a gap in
       it, so the inside has a shape instead of being one empty box */
    if (fw >= 5 && fh >= 4) {
      var wx = 2 + Math.floor(v * (fw - 4));
      var gap = 1 + Math.floor((1 - v) * (fh - 2));
      for (y = 1; y < fh - 1; y++) {
        if (y !== gap) m[y * fw + wx] = 1;
      }
    }
    return m;
  }

  /* The prop whose inside you are standing in, or null. */
  W.insideOf = function (x, y) {
    var tx = Math.floor(x), ty = Math.floor(y);
    if (!W.inside(tx, ty)) return null;
    var p = W.pgrid[idx(tx, ty)];
    if (!p || !p.inner) return null;
    return p;
  };

  /* Is this tile blocked by the prop that stands on it? */
  function propBlocks(p, tx, ty) {
    if (!p) return false;
    if (!p.inner) return !!p.def.blocks;
    var hw = (p.def.fw - 1) / 2, hh = (p.def.fh - 1) / 2;
    var x0 = Math.round(p.x - 0.5 - hw), y0 = Math.round(p.y - 0.5 - hh);
    var lx = tx - x0, ly = ty - y0;
    if (lx < 0 || ly < 0 || lx >= p.def.fw || ly >= p.def.fh) return true;
    return !!p.inner[ly * p.def.fw + lx];
  }
  W.propBlocks = propBlocks;
  W.addProp = add;

  function stamp(p, val) {
    var hw = (p.def.fw - 1) / 2, hh = (p.def.fh - 1) / 2;
    var x0 = Math.round(p.x - 0.5 - hw), y0 = Math.round(p.y - 0.5 - hh);
    for (var dy = 0; dy < p.def.fh; dy++) {
      for (var dx = 0; dx < p.def.fw; dx++) {
        var tx = x0 + dx, ty = y0 + dy;
        if (W.inside(tx, ty)) W.pgrid[idx(tx, ty)] = val;
      }
    }
  }

  /* Clearing a prop turns the ground it stood on into usable base area -
     that is the whole point of the mechanic, so it happens here and not
     as a side effect somewhere in the sim. */
  W.removeProp = function (p) {
    if (p.gone) return;
    p.gone = true;
    stamp(p, null);
    var i = W.props.indexOf(p);
    if (i >= 0) W.props.splice(i, 1);
    var hw = (p.def.fw - 1) / 2, hh = (p.def.fh - 1) / 2;
    var x0 = Math.round(p.x - 0.5 - hw), y0 = Math.round(p.y - 0.5 - hh);
    for (var dy = 0; dy < p.def.fh; dy++) {
      for (var dx = 0; dx < p.def.fw; dx++) {
        var tx = x0 + dx, ty = y0 + dy;
        if (!W.inside(tx, ty)) continue;
        var t = W.terrain[idx(tx, ty)];
        if (t === T.GRASS || t === T.DIRT || t === T.GRAVEL) W.terrain[idx(tx, ty)] = T.CLEARED;
      }
    }
  };

  W.propAt = function (x, y) {
    var tx = Math.floor(x), ty = Math.floor(y);
    if (!W.inside(tx, ty)) return null;
    return W.pgrid[idx(tx, ty)] || null;
  };

  /* Nearest prop to a world point within r, for click targeting. */
  W.propNear = function (x, y, r) {
    var best = null, bd = r * r;
    for (var i = 0; i < W.props.length; i++) {
      var p = W.props[i];
      var d = Z.dist2(x, y, p.x, p.y);
      var rr = p.def.r;
      d -= rr * rr;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };

  /* ------------------------------------------------------------------ *
   * Queries
   * ------------------------------------------------------------------ */
  W.tile = function (x, y) {
    var tx = Math.floor(x), ty = Math.floor(y);
    if (!W.inside(tx, ty)) return T.WATER;
    return W.terrain[idx(tx, ty)];
  };

  /* Can a body stand here? Water and solid things say no. */
  W.walkable = function (x, y) {
    var tx = Math.floor(x), ty = Math.floor(y);
    if (!W.inside(tx, ty)) return false;
    var i = idx(tx, ty);
    if (W.terrain[i] === T.WATER) return false;
    var p = W.pgrid[i];
    if (p && p.def.blocks) return false;
    var b = W.occ[i];
    if (b) {
      var bl = Z.sim && Z.sim.buildingById(b);
      if (bl && !bl.dead) return false;
    }
    return true;
  };

  /* Ground speed multiplier - roads and player paving are quicker. */
  W.speedAt = function (x, y) {
    var tx = Math.floor(x), ty = Math.floor(y);
    if (!W.inside(tx, ty)) return 1;
    var i = idx(tx, ty);
    if (W.floor[i]) return 1.35;
    var t = W.terrain[i];
    if (t === T.ROAD || t === T.ASPHALT) return 1.22;
    if (t === T.CLEARED || t === T.PAVED) return 1.10;
    if (t === T.DIRT) return 1.0;
    return 0.94;
  };

  /* ------------------------------------------------------------------ *
   * Discovery - chunk granularity, so the reveal has a shape rather than
   * being a perfect circle following the player around.
   * ------------------------------------------------------------------ */
  W.discover = function (x, y, r) {
    var c0 = Math.max(0, Math.floor((x - r) / W.CHUNK));
    var c1 = Math.min(W.CW - 1, Math.floor((x + r) / W.CHUNK));
    var r0 = Math.max(0, Math.floor((y - r) / W.CHUNK));
    var r1 = Math.min(W.CW - 1, Math.floor((y + r) / W.CHUNK));
    var found = 0;
    for (var cy = r0; cy <= r1; cy++) {
      for (var cx = c0; cx <= c1; cx++) {
        var mx = cx * W.CHUNK + W.CHUNK / 2, my = cy * W.CHUNK + W.CHUNK / 2;
        if (Z.dist2(x, y, mx, my) > (r + W.CHUNK * 0.7) * (r + W.CHUNK * 0.7)) continue;
        var ci = cy * W.CW + cx;
        if (!W.disc[ci]) { W.disc[ci] = 1; found++; }
      }
    }
    return found;
  };

  W.seen = function (x, y) {
    var cx = Math.floor(x / W.CHUNK), cy = Math.floor(y / W.CHUNK);
    if (cx < 0 || cy < 0 || cx >= W.CW || cy >= W.CW) return false;
    return !!W.disc[cy * W.CW + cx];
  };

  W.explored = function () {
    var n = 0;
    for (var i = 0; i < W.disc.length; i++) if (W.disc[i]) n++;
    return n / W.disc.length;
  };

  /* ------------------------------------------------------------------ *
   * Clock
   * ------------------------------------------------------------------ */
  W.step = function (dt) {
    var prev = W.t;
    W.t = (W.t + dt / W.DAY_LEN) % 1;
    if (W.t < prev) W.day++;
    W.recalc();
  };

  W.recalc = function () {
    var a = Math.cos((W.t - 0.5) * Math.PI * 2);   /* 1 at noon, -1 at midnight */
    W.l = Z.smooth(Z.clamp01(a * 0.62 + 0.5));
    W.warm = 1 - Math.abs(W.l * 2 - 1);
  };

  W.isNight = function () { return W.l < 0.32; };
  W.phase = function () {
    if (W.l > 0.72) return 'Day';
    if (W.l < 0.18) return 'Night';
    return W.t < 0.5 ? 'Dawn' : 'Dusk';
  };
  W.nightF = function () { return Z.clamp01(1 - W.l / 0.5); };

  /* Seconds of real time until the sun next comes up - the HUD counts
     this down so a player can judge whether to push on or head home. */
  W.untilPhase = function () {
    var target = W.l < 0.42 ? 0.30 : 0.76;     /* dawn : dusk, in clock units */
    var d = target - W.t;
    if (d <= 0) d += 1;
    return d * W.DAY_LEN;
  };

  /* ------------------------------------------------------------------ *
   * Palettes - every colour the ground is painted with, keyed by tile,
   * given as a night and a day pair that the renderer blends by light.
   * ------------------------------------------------------------------ */
  /* Desaturated on purpose. This is a place where the colour has gone out
     of everything; the only saturated things left in frame are fire, a
     turret's tracer and the rust-orange marks the survivors paint on. */
  /* Daylight is greener and a step brighter than it was, and the two road
     materials went the other way. The ground used to sit in the same
     narrow grey-olive band as the tarmac, so a lawn and a car park were
     told apart only by their texture; now the grass is a colour and the
     road is the dark thing you walk across it. */
  /* Warmer and a shade richer than the first city build, which drifted
     grey on grey: the tarmac went blue-black, the pavements went the same
     grey as the walls above them, and a lawn and a car park were told
     apart only by their texture. Grass is a colour again, earth is warm,
     and the two road materials are cool against both. */
/* Two colours per surface: what it is by day, and what it is by night.

     They used to sit within a few points of each other in hue - grass,
     dirt, gravel and road were all the same olive at different
     brightnesses - and a map made of one colour reads as mud whatever
     you light it with. Ground is green, made ground is grey, tarmac is
     cold, and the night versions lean blue rather than brown so a warm
     lamp has something to be warm against. */
  W.PAL = [
    { n: [14, 32, 48],  d: [56, 108, 130] },   /* water    */
    { n: [20, 38, 32],  d: [116, 166, 74] },   /* grass    */
    { n: [31, 28, 25],  d: [158, 124, 78] },   /* dirt     */
    { n: [26, 27, 28],  d: [132, 128, 118] },  /* gravel   */
    { n: [16, 20, 28],  d: [68, 75, 86] },     /* road     */
    { n: [14, 18, 26],  d: [57, 66, 79] },     /* asphalt  */
    { n: [28, 30, 24],  d: [140, 130, 90] },   /* cleared  */
    { n: [28, 30, 32],  d: [128, 128, 126] },  /* paved    */
    { n: [31, 32, 34],  d: [152, 152, 147] },  /* sidewalk */
    { n: [29, 30, 32],  d: [139, 139, 136] },  /* plaza    */
    { n: [26, 25, 23],  d: [122, 113, 101] },  /* ballast  */
    { n: [31, 29, 25],  d: [162, 143, 105] }   /* parkpath */
  ];

  /* The colour distance fades toward. Everything far from the camera is
     blended toward this, which is what gives the map its depth. */
  W.haze = function () {
    var l = W.l;
    return [Z.lerp(9, 128, l), Z.lerp(13, 138, l), Z.lerp(18, 140, l)];
  };

  /* Ambient tint over the whole frame - cool and dark at night, warm at
     the edges of the day. */
  W.grade = function () {
    var n = W.nightF(), w = W.warm;
    return { night: n, warm: w,
             tint: n > 0.02 ? 'rgba(20,34,68,' + (n * 0.30) + ')' : null,
             warmTint: w > 0.05 ? 'rgba(232,132,52,' + (w * 0.11) + ')' : null };
  };

})(window.Z);
