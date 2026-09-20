/* Deadzone - shared namespace and small maths helpers.
   Loaded first; everything else hangs off window.Z. */
window.Z = window.Z || {};
(function (Z) {
  'use strict';

  Z.TAU = Math.PI * 2;

  Z.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  Z.clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  Z.lerp = function (a, b, k) { return a + (b - a) * k; };
  Z.smooth = function (v) { return v * v * (3 - 2 * v); };
  Z.sign = function (v) { return v < 0 ? -1 : v > 0 ? 1 : 0; };

  /* Frame-rate independent approach. k is "fraction remaining after 1s". */
  Z.approach = function (cur, target, k, dt) {
    return target + (cur - target) * Math.pow(k, dt);
  };

  /* ------------------------------------------------------------------ *
   * Footprints
   *
   * A structure is placed with a rotation of 0-3 quarter turns. Every
   * piece of code that asks how many tiles it covers has to ask through
   * these, because a 3x2 depot turned side-on covers 2x3 and the
   * occupancy grid, the ghost, the health bar and the minimap all have to
   * agree about that.
   * ------------------------------------------------------------------ */
  Z.fpw = function (def, rot) { return (rot & 1) ? def.h : def.w; };
  Z.fph = function (def, rot) { return (rot & 1) ? def.w : def.h; };

  Z.dist2 = function (ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy;
  };
  Z.dist = function (ax, ay, bx, by) { return Math.sqrt(Z.dist2(ax, ay, bx, by)); };

  /* Shortest signed angular difference, b - a, wrapped to [-PI, PI]. */
  Z.angDiff = function (a, b) {
    var d = (b - a) % Z.TAU;
    if (d > Math.PI) d -= Z.TAU;
    if (d < -Math.PI) d += Z.TAU;
    return d;
  };
  /* Turn toward an angle at a limited rate. The result is wrapped, so a
     body that keeps turning one way does not drift its angle off toward
     the far end of the float range. */
  Z.angTo = function (cur, target, maxStep) {
    var d = Z.angDiff(cur, target);
    if (d > maxStep) d = maxStep;
    if (d < -maxStep) d = -maxStep;
    var a = (cur + d) % Z.TAU;
    if (a > Math.PI) a -= Z.TAU;
    if (a < -Math.PI) a += Z.TAU;
    return a;
  };

  /* ------------------------------------------------------------------ *
   * Deterministic noise. Everything generated from the world seed runs
   * through these, so a save only ever has to store the seed.
   * ------------------------------------------------------------------ */
  /* A proper 32-bit mixer. The obvious `a * BIG + b * BIG` version loses
     its low bits to double precision once the coordinates are large, and
     the "noise" it returns is then visibly correlated - which showed up as
     half the map drowning. Math.imul keeps every step inside 32 bits. */
  Z.hash2 = function (x, y, seed) {
    var h = Math.imul(x | 0, 0x27D4EB2D) ^
            Math.imul(y | 0, 0x165667B1) ^
            Math.imul(seed | 0, 0x9E3779B1);
    h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B);
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  Z.hash1 = function (i, seed) { return Z.hash2(i | 0, (i * 7919) | 0, seed); };

  /* Value noise with smooth interpolation - used for terrain fields. */
  Z.noise2 = function (x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = Z.smooth(x - xi), yf = Z.smooth(y - yi);
    var a = Z.hash2(xi, yi, seed), b = Z.hash2(xi + 1, yi, seed);
    var c = Z.hash2(xi, yi + 1, seed), d = Z.hash2(xi + 1, yi + 1, seed);
    return Z.lerp(Z.lerp(a, b, xf), Z.lerp(c, d, xf), yf);
  };
  Z.fbm = function (x, y, seed, oct) {
    var v = 0, amp = 0.5, f = 1, norm = 0;
    for (var i = 0; i < (oct || 3); i++) {
      v += Z.noise2(x * f, y * f, seed + i * 101) * amp;
      norm += amp; amp *= 0.5; f *= 2;
    }
    return v / norm;
  };

  /* Seeded stream RNG, for one-off generation passes. */
  Z.rng = function (seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  /* ------------------------------------------------------------------ *
   * Colour
   * ------------------------------------------------------------------ */
  Z.rgb = function (c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; };
  Z.rgba = function (c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')';
  };
  Z.mix = function (a, b, k) {
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  };
  Z.mixc = function (a, b, k) { return Z.rgb(Z.mix(a, b, k)); };
  Z.shade = function (c, k) {
    /* k > 0 lightens toward white, k < 0 darkens toward black */
    return k >= 0 ? Z.mix(c, [255, 255, 255], k) : Z.mix(c, [0, 0, 0], -k);
  };
  Z.hex = function (h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  Z.hexA = function (h, a) { return Z.rgba(Z.hex(h), a); };

  /* ------------------------------------------------------------------ *
   * Formatting
   * ------------------------------------------------------------------ */
  var SUF = ['', 'K', 'M', 'B', 'T', 'aa', 'ab', 'ac', 'ad'];
  Z.fmt = function (n) {
    n = Number(n) || 0;
    var neg = n < 0; n = Math.abs(n);
    if (n < 1000) {
      var s = n < 10 && n % 1 !== 0 ? n.toFixed(1) : String(Math.floor(n));
      return (neg ? '-' : '') + s;
    }
    var t = 0;
    while (n >= 1000 && t < SUF.length - 1) { n /= 1000; t++; }
    var out = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
    return (neg ? '-' : '') + out + SUF[t];
  };
  Z.fmtInt = function (n) { return Math.floor(Number(n) || 0).toLocaleString('en-US'); };

  /* Game clock -> "18:42" */
  Z.clockStr = function (t) {
    var mins = Math.floor((t % 1) * 1440);
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  };

  Z.dur = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return h + 'h ' + m + 'm';
    if (m) return m + 'm ' + s + 's';
    return s + 's';
  };

  /* ------------------------------------------------------------------ *
   * Tiny DOM helpers - the UI is hand-rolled, not framework-driven.
   * ------------------------------------------------------------------ */
  Z.$ = function (id) { return document.getElementById(id); };
  Z.el = function (tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };
  Z.clear = function (node) { while (node.firstChild) node.removeChild(node.firstChild); };


  /* ------------------------------------------------------------------ *
   * Resource glyphs
   *
   * Drawn rather than typed. Emoji render differently on every platform,
   * break with the page's charset, and sit badly in a dark instrument
   * panel; these are 16px vector marks that take the resource's own
   * colour and line up on a baseline with the numbers beside them.
   * ------------------------------------------------------------------ */
  /* The small-size twins. Only for the marks whose full version has more
     in it than thirteen pixels can hold. */
  var SMALL = {
    wood:  '<path d="M4.0 2.4h6.4a2.6 2.6 0 0 1 0 5.2H4.0a2.6 2.6 0 0 1 0-5.2z"/>' +
           '<ellipse cx="4.4" cy="5.0" rx="1.7" ry="2.6" fill="var(--p)"/>' +
           '<path d="M7.2 8.4h6.4a2.7 2.7 0 0 1 0 5.4H7.2a2.7 2.7 0 0 1 0-5.4z"/>' +
           '<ellipse cx="7.6" cy="11.1" rx="1.75" ry="2.7" fill="var(--p)"/>' +
           '<path d="M1.0 8.4h4.6a2.7 2.7 0 0 1 0 5.4H1.0a2.7 2.7 0 0 1 0-5.4z" fill="var(--d)"/>' +
           '<ellipse cx="1.8" cy="11.1" rx="1.6" ry="2.6" fill="var(--p)"/>',
    scrap: '<path d="M2.2 5.2l4.6-3.0 3.2 1.6 4.0-1.0-.6 4.4-3.4 1.6.9 3.4-4.4 2.0-3.4-2.6z"/>' +
           '<path d="M2.2 5.2l4.6-3.0 3.2 1.6-2.6 2.0-1.2 3.2z" fill="var(--l)"/>',
    power: '<path d="M2.6 1.8h10.8a1.4 1.4 0 0 1 1.4 1.4v9.6a1.4 1.4 0 0 1-1.4 1.4H2.6a1.4 1.4 0 0 1-1.4-1.4V3.2a1.4 1.4 0 0 1 1.4-1.4z" fill="var(--d)"/>' +
           '<path d="M9.6 3.2L4.0 9.4h3.2l-.9 4.0 5.6-6.2H8.8z" fill="var(--p)"/>'
  };

  var GLYPH = {
    /* Three logs, stacked, seen from the end. The pale ellipse is the
       cut face and the hook inside it is the heartwood - that pair is the
       whole read, and it is why this is timber and not three sausages.
       The bark lines are cut with the darker tone so the round of the log
       turns away from the light. */
    wood:  '<path d="M3.4 2.0h7.2a2.9 2.9 0 0 1 0 5.8H3.4a2.9 2.9 0 0 1 0-5.8z"/>' +
           '<path d="M8.0 3.3h3.2a.42.42 0 0 1 0 .84H8.0a.42.42 0 0 1 0-.84z" fill="var(--d)"/>' +
           '<path d="M9.4 5.5h2.6a.42.42 0 0 1 0 .84H9.4a.42.42 0 0 1 0-.84z" fill="var(--d)"/>' +
           '<ellipse cx="4.9" cy="4.9" rx="1.85" ry="2.9" fill="var(--p)"/>' +
           '<path d="M5.5 3.3a1.5 1.5 0 0 0-.9 1.5 1.3 1.3 0 0 0 .9 1.3" ' +
           'fill="none" stroke="var(--l)" stroke-width=".72" stroke-linecap="round"/>' +
           '<path d="M6.6 8.3h6.6a2.95 2.95 0 0 1 0 5.9H6.6a2.95 2.95 0 0 1 0-5.9z"/>' +
           '<path d="M10.6 9.7h2.9a.42.42 0 0 1 0 .84h-2.9a.42.42 0 0 1 0-.84z" fill="var(--d)"/>' +
           '<path d="M11.3 11.9h2.2a.42.42 0 0 1 0 .84h-2.2a.42.42 0 0 1 0-.84z" fill="var(--d)"/>' +
           '<ellipse cx="8.1" cy="11.25" rx="1.8" ry="2.95" fill="var(--p)"/>' +
           '<path d="M8.1 9.7v1.0M8.1 12.0v1.0" stroke="var(--l)" stroke-width=".72" ' +
           'stroke-linecap="round" fill="none"/>' +
           '<path d="M0.8 8.3h5.0a2.95 2.95 0 0 1 0 5.9H0.8a2.95 2.95 0 0 1 0-5.9z" fill="var(--d)"/>' +
           '<ellipse cx="2.3" cy="11.25" rx="1.75" ry="2.9" fill="var(--p)"/>' +
           '<path d="M2.9 9.7a1.45 1.45 0 0 0-.85 1.45 1.25 1.25 0 0 0 .85 1.25" ' +
           'fill="none" stroke="var(--l)" stroke-width=".72" stroke-linecap="round"/>',

    /* A bent plate with a torn edge and two rivet holes - salvage, not a
       tidy hex nut. A nut reads as hardware you would buy; scrap is what
       you prise off something. The fold catches the light down one side. */
    scrap: '<path d="M2.1 5.3l4.6-2.9 3.1 1.5 4.2-1.1-.6 4.3-3.5 1.6.9 3.4-4.4 2.1-3.4-2.6 1.2-3z"/>' +
           '<path d="M2.1 5.3l4.6-2.9 3.1 1.5-2.4 1.9-1.2 3.2-1.9-1.1z" fill="var(--l)"/>' +
           '<path d="M9.9 12.2l-4.4 2.1-3.4-2.6 4.0-.5z" fill="var(--d)"/>' +
           '<circle cx="5.5" cy="6.2" r="1.0" fill="#0A0E12" opacity=".62"/>' +
           '<circle cx="9.7" cy="10.2" r=".9" fill="#0A0E12" opacity=".62"/>',

    /* A bolt inside a plug housing: the bolt alone was a lightning icon,
       which is weather. The housing makes it mains, and the bolt is lit
       against it rather than the same colour as it. */
    power: '<path d="M3.0 1.8h10a1.6 1.6 0 0 1 1.6 1.6v9.2a1.6 1.6 0 0 1-1.6 1.6H3.0a1.6 1.6 0 0 1-1.6-1.6V3.4A1.6 1.6 0 0 1 3.0 1.8z" fill="var(--d)"/>' +
           '<path d="M3.0 1.8h10a1.6 1.6 0 0 1 1.6 1.6v1.2H1.4V3.4A1.6 1.6 0 0 1 3.0 1.8z" opacity=".55"/>' +
           '<path d="M9.4 3.5L4.3 9.1h2.9l-.8 4.5 5.0-5.9H8.9z" fill="var(--p)"/>',
    /* stamped chit */
    coin:  '<circle cx="8" cy="8" r="6.2"/><circle cx="8" cy="8" r="3" fill="#0A0E12"/>',
    /* broken masonry */
    stone: '<path d="M2.4 9.2l3.4-4.6 3.9 2 4 -1.4 .9 5.6-5.3 3.2-6.4-2.4z"/>',
    /* a clean ingot */
    metal: '<path d="M3 6h10l1.6 4.6H1.4z"/><path d="M4.6 3.2h6.8L12.4 6H3.6z"/>',
    /* bolt of fabric */
    cloth: '<path d="M2.6 3.4h10.8v3.2c-2.6 1-3.4 2.6-3.4 5.2v2.2H6v-2.2c0-2.6-.8-4.2-3.4-5.2z"/>',
    /* ration tin */
    food:  '<ellipse cx="8" cy="4.2" rx="5" ry="2.1"/><path d="M3 4.2v7.4c0 1.2 2.2 2.1 5 2.1' +
           's5-.9 5-2.1V4.2c0 1.2-2.2 2.1-5 2.1S3 5.4 3 4.2z"/>',
    /* jerry can */
    fuel:  '<path d="M3.4 3h7.2l2 2.4v8.2H3.4z"/><path d="M5.4 1.4h3.2V3H5.4z"/>',
    /* a first-aid cross in a case */
    meds:  '<rect x="1.6" y="3.4" width="12.8" height="9.6" rx="1.6"/>' +
           '<path d="M7 5.6h2v2.2h2.2v2H9v2.2H7V9.8H4.8v-2H7z" fill="#0A0E12"/>',
    /* a board with legs */
    parts: '<rect x="4.4" y="4.4" width="7.2" height="7.2" rx="1"/>' +
           '<path d="M2 6h2.4M2 9.6h2.4M11.6 6H14M11.6 9.6H14M6 2v2.4M9.6 2v2.4' +
           'M6 11.6V14M9.6 11.6V14" stroke-width="1.3"/>'
  };

  /* Inline SVG for a resource, sized to sit with 12px type. */
  /* '#A8763F' -> [168,118,63]. The resource table is authored in hex
     because that is what CSS wants; the particle system wants the parts. */
  /* ------------------------------------------------------------------ *
   * Display settings
   *
   * One place the renderer, the camera and the terrain baker all read, so
   * a preset is a single change rather than four that can disagree.
   * `sub` is how finely the ground is painted, `detail` scales the things
   * scattered on it, `parts` the particle budget, `ao` whether anything
   * casts onto the ground.
   * ------------------------------------------------------------------ */
  Z.QUALITY = {
    /* `sub` is how finely a tile's interior is shaded; `esub` is how finely
       a tile that BORDERS another material is, which is where the picture
       is actually decided and where the pixels are worth paying for. */
    low:   { name: 'Low',    sub: 2, esub: 4,  post: false, ao: false, detail: 0.45, parts: 0.4 },
    med:   { name: 'Medium', sub: 3, esub: 6,  post: true,  ao: false, detail: 0.8,  parts: 0.7 },
    high:  { name: 'High',   sub: 4, esub: 8,  post: true,  ao: true,  detail: 1.0,  parts: 1.0 },
    ultra: { name: 'Ultra',  sub: 5, esub: 12, post: true,  ao: true,  detail: 1.4,  parts: 1.3 }
  };
  Z.QORDER = ['low', 'med', 'high', 'ultra'];

  Z.qual = function () {
    return Z.QUALITY[(Z.S && Z.S.quality) || 'high'] || Z.QUALITY.high;
  };
  /* Post-processing is both a preset feature and its own switch, because
     wanting a sharp picture and wanting a fast one are different wants. */
  Z.postOn = function () {
    return Z.qual().post && (!Z.S || Z.S.post !== false);
  };

  Z.hex2rgb = function (h) {
    var v = parseInt(String(h).replace('#', ''), 16);
    if (!isFinite(v)) return [228, 224, 214];
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };

  /* A mark in three tones.

     Every glyph used to be flooded with one flat colour, which is why a
     stack of logs read as a brown blob: a shape needs a lit face, a body
     and a shaded face before it looks like an object rather than a
     silhouette. The three come off the resource's own colour so there is
     still one place to change what wood looks like, and a glyph picks
     them up as var(--l), var(--b) and var(--d). Anything that names no
     fill gets the body tone, so the older one-tone glyphs are unchanged. */
  Z.icon = function (id, px) {
    var r = Z.RES[id];
    if (!r) return '';
    var s = px || 13;
    /* Detail that helps at 64px is mush at 13.

       Three logs with bark lines and heartwood came out as a brown smear
       on a cost chip, which is where these are read most. Anything with a
       simpler twin swaps to it below 20px - same silhouette, half the
       shapes - so a cost reads at a glance and the big one still holds up
       in a panel. */
    var g = (s < 20 && SMALL[id]) || GLYPH[id] || GLYPH.scrap;
    var rgb = Z.hex2rgb(r.color);
    return '<svg class="gi" viewBox="0 0 16 16" width="' + s + '" height="' + s +
           '" aria-hidden="true" style="--b:' + r.color +
           ';--d:' + Z.rgb(Z.shade(rgb, -0.36)) +
           ';--l:' + Z.rgb(Z.shade(rgb, 0.46)) +
           ';--p:' + Z.rgb(Z.shade(rgb, 0.78)) +
           ';fill:var(--b)">' + g + '</svg>';
  };

  /* The same mark, drawn straight onto a canvas is never needed - the HUD
     is DOM - so this stays a string helper only. */
  Z.GLYPH = GLYPH;

  /* Offscreen canvas at a given pixel size, ready to draw into. */
  Z.canvas = function (w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  };

})(window.Z);
