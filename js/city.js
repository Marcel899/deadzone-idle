/* Deadzone - laying out the city.

   The old generator walked each road and offered a building to every gap
   along it. That gives you buildings beside a road, which is not a town:
   nothing lines up into a block, there is no reason for one street to
   differ from the next, and a supermarket could end up in the woods.

   This one works the way a town does, from the top down:

     zones    -> which part of town every square metre belongs to
     streets  -> a hierarchy laid over the zones, spaced by what they are
     blocks   -> whatever the streets enclosed, found by flooding
     lots     -> each block's frontage cut into plots facing the kerb
     building -> a type drawn from the zone's bag, set back from the kerb
     yards    -> what is left in the middle: car parks, gardens, alleys
     detail   -> everything that says people left in a hurry

   Every stage reads the one before it, so the reason a pharmacy stands
   next to a hospital is not a special case anywhere - it falls out of the
   zone the hospital seeded. */
(function (Z) {
  'use strict';

  var C = Z.city = {};
  var ZONE = Z.ZONE;

  var W, N, T, ctr, rnd, seedv;
  var zone;                 /* Uint8Array, one zone per tile */
  var road;                 /* Uint8Array, 1 where a vehicle could drive */
  var used;                 /* Uint8Array, 1 where a lot has been claimed */

  function idx(x, y) { return y * N + x; }
  function inb(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }

  C.zoneAt = function (x, y) {
    var tx = Math.floor(x), ty = Math.floor(y);
    if (!zone || !inb(tx, ty)) return ZONE.WILD;
    return zone[idx(tx, ty)];
  };
  C.riskAt = function (x, y) {
    var d = Z.ZONE_DEF[C.zoneAt(x, y)];
    return d ? d.risk : 0.5;
  };
  C.zoneName = function (x, y) {
    var d = Z.ZONE_DEF[C.zoneAt(x, y)];
    return d ? d.name : 'Open Country';
  };

  /* ------------------------------------------------------------------ *
   * 1. Zones
   *
   * Seeds with a radius, and every tile joins whichever seed shouts
   * loudest at it. Distance is divided rather than compared, so a big
   * district reaches further than a small one, and the shout is multiplied
   * by noise, which is what makes the borders wander instead of being the
   * straight bisectors a plain Voronoi would give.
   *
   * The seeds ring the compound rather than the city centre, because the
   * player is meant to be surrounded by town and to have to choose a
   * direction - downtown one way, the works another, the woods behind.
   * ------------------------------------------------------------------ */
  function layZones() {
    zone = W.zone = new Uint8Array(N * N);
    var seeds = [];
    function seed(kind, x, y, r) { seeds.push({ k: kind, x: x, y: y, r: r }); }
    function around(a, d) {
      return { x: Math.round(ctr + Math.cos(a) * d), y: Math.round(ctr + Math.sin(a) * d) };
    }

    var ang = rnd() * Z.TAU;              /* the way downtown lies */
    C.axis = ang;
    var D = C.downtown = around(ang, N * 0.27);
    var i, p, a;

    seed(ZONE.DOWNTOWN, D.x, D.y, 34);
    /* the commercial strips that spill off the middle, back toward home */
    for (i = 0; i < 3; i++) {
      a = ang + (i - 1) * 0.8;
      p = around(a, N * (0.15 + i * 0.02));
      seed(ZONE.COMMERCIAL, p.x, p.y, 28);
    }
    /* a retail park, a hospital campus and the works, each on its own
       bearing so that heading out of the gate is a decision */
    p = around(ang + 1.15, N * 0.26); seed(ZONE.SHOPPING, p.x, p.y, 31);
    p = around(ang - 1.25, N * 0.25); seed(ZONE.HOSPITAL, p.x, p.y, 23);
    C.indAngle = ang + 2.0;
    for (i = 0; i < 2; i++) {
      p = around(C.indAngle + (i - 0.5) * 0.45, N * (0.28 + i * 0.06));
      seed(ZONE.INDUSTRIAL, p.x, p.y, 35);
    }

    /* the streets people lived on, all the way round the compound */
    for (i = 0; i < 7; i++) {
      a = (i / 7) * Z.TAU + rnd() * 0.4;
      p = around(a, N * (0.15 + rnd() * 0.12));
      seed(ZONE.RESIDENTIAL, p.x, p.y, 30);
    }
    for (i = 0; i < 4; i++) {
      a = (i / 4) * Z.TAU + 0.4 + rnd() * 0.4;
      p = around(a, N * (0.35 + rnd() * 0.08));
      seed(ZONE.SUBURB, p.x, p.y, 29);
    }

    for (i = 0; i < 3; i++) {
      p = around(rnd() * Z.TAU, N * (0.12 + rnd() * 0.26));
      seed(ZONE.PARK, p.x, p.y, 14 + rnd() * 6);
    }
    for (i = 0; i < 2; i++) {
      p = around(rnd() * Z.TAU, N * (0.16 + rnd() * 0.2));
      seed(ZONE.CONSTRUCTION, p.x, p.y, 12 + rnd() * 4);
    }

    /* The woods are a zone like any other, seeded opposite downtown, and
       they out-shout the suburb out there rather than being carved back
       afterwards. */
    var wa = ang + Math.PI;
    C.wood = W.wood = { x: Math.round(ctr + Math.cos(wa) * N * 0.33),
                        y: Math.round(ctr + Math.sin(wa) * N * 0.33),
                        r: N * 0.26 };
    for (i = 0; i < 3; i++) {
      p = around(wa + (i - 1) * 0.55, N * (0.30 + rnd() * 0.12));
      seed(ZONE.WILD, p.x, p.y, 40);
    }

    C.seeds = seeds;

    var x, y, k, best, bestK, sc, ss;
    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) {
        best = 0.5; bestK = ZONE.WILD;
        var nz = Z.fbm(x * 0.045, y * 0.045, seedv + 61, 3);
        for (k = 0; k < seeds.length; k++) {
          ss = seeds[k];
          var dx = x - ss.x, dy = y - ss.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          sc = (ss.r / (d * 0.92 + 8)) * (0.78 + nz * 0.5);
          if (sc > best) { best = sc; bestK = ss.k; }
        }
        zone[idx(x, y)] = bestK;
      }
    }

    /* The compound's own ground is nobody's district. Leaving it zoned
       residential put houses in the clearing on the first frame. */
    for (y = ctr - 20; y <= ctr + 20; y++) {
      for (x = ctr - 20; x <= ctr + 20; x++) {
        if (!inb(x, y)) continue;
        if (Math.max(Math.abs(x - ctr), Math.abs(y - ctr)) < 15) zone[idx(x, y)] = ZONE.WILD;
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * 2. Streets
   *
   * Every through street runs the full width of the map. That is not a
   * detail - it is the difference between a street plan and a scribble.
   * An earlier version stopped each street where the buildings stopped,
   * which left the grid full of gaps; a flood fill then found that three
   * quarters of the map was one connected "block" 175 metres across, and
   * a block that size has no frontage to build on. Full-length lines
   * enclose cells, and a cell is a block.
   *
   * Spacing still comes from the ground: close together near downtown,
   * further apart the further out you get.
   * ------------------------------------------------------------------ */
  function spacingAt(x, y) {
    var z = C.zoneAt(x, y);
    var d = Z.dist(x, y, C.downtown.x, C.downtown.y);
    var base = z === ZONE.DOWNTOWN ? 17
             : z === ZONE.COMMERCIAL || z === ZONE.SHOPPING ? 21
             : z === ZONE.HOSPITAL ? 23
             : z === ZONE.RESIDENTIAL ? 24
             : z === ZONE.INDUSTRIAL ? 29
             : z === ZONE.SUBURB ? 27
             : 34;
    if (d > N * 0.42) base += 8;          /* streets thin out as the town does */
    return base + (rnd() - 0.5) * 5;
  }

  function layStreets() {
    road = new Uint8Array(N * N);
    var lines = C.streets = [];
    var D = C.downtown;

    function line(vertical, at, w, kind) {
      at = Math.round(at);
      if (at < 4 || at > N - 5) return null;
      /* never two streets close enough to leave a sliver between them */
      for (var q = 0; q < lines.length; q++) {
        if (lines[q].v === vertical && Math.abs(lines[q].at - at) < 7) return null;
      }
      var L = { v: vertical, at: at, w: w, kind: kind, a: 0, b: N - 1 };
      lines.push(L);
      return L;
    }

    function run(vertical, dir) {
      var from = vertical ? D.x : D.y;
      var cross = vertical ? D.y : D.x;
      var pos = from, n = 0;
      while (pos > 4 && pos < N - 5 && n < 26) {
        var sp = spacingAt(vertical ? Math.round(pos) : cross,
                           vertical ? cross : Math.round(pos));
        pos += dir * sp;
        n++;
        if (pos < 4 || pos > N - 5) break;
        var arterial = (n % 3 === 0);
        line(vertical, pos, arterial ? 3 : 2, arterial ? 'arterial' : 'street');
      }
    }
    line(true, D.x, 4, 'arterial');
    line(false, D.y, 4, 'arterial');
    run(true, 1); run(true, -1);
    run(false, 1); run(false, -1);

    /* ---- the highway ----
       Wide, and laid across a corner rather than through the middle, so
       it reads as passing by rather than serving. */
    var hv = Math.abs(Math.cos(C.axis)) > 0.5;
    var far = (hv ? D.x : D.y) > ctr;
    var hpos = far ? 18 + Math.floor(rnd() * 12) : N - 30 + Math.floor(rnd() * 12);
    C.highway = line(hv, hpos, 7, 'highway');

    /* ---- the railway ----
       On the industrial flank. Nothing drives on it, but it cuts blocks
       the same way a road does and the station sits beside it. */
    var rp = Math.round(ctr + (hv ? Math.sin(C.indAngle) : Math.cos(C.indAngle)) * N * 0.3);
    C.rail = line(!hv, Z.clamp(rp, 20, N - 21), 4, 'rail');

    /* ---- stamp ---- */
    stampLines(lines);
  }

  /* Water a road runs through.

     The street grid is stamped without asking what was underneath, so an
     arterial laid across a pond simply becomes tarmac with water on both
     sides of it - a road running into a lake and out the other side, with
     no bank and no bridge. Rather than build bridges, the ponds that get
     in the way are drained: any body of water a road touches, and any
     body too small to read as a lake, becomes the damp ground it would be
     once the drainage stopped being maintained. Big ponds out in the
     country that no road reaches are left alone. */
  /* Note on water: after this runs there is usually none left on the map.
     The terrain lays small ponds in the low ground before the city exists
     and the street grid reaches almost everywhere, so nearly every one of
     them ends up with a road in it. Draining them is the right trade -
     a road running into a lake and out the other side with no bank and no
     bridge was the thing that looked broken. If lakes are wanted back
     they need to be a feature of their own: carved before the streets are
     laid, with the grid routed around them. */
  function drainWater() {
    var seen = new Uint8Array(N * N);
    var x, y, i;
    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) {
        i = idx(x, y);
        if (seen[i] || W.terrain[i] !== T.WATER) continue;
        var body = [], q = [i], touches = false, open = 0;
        seen[i] = 1;
        while (q.length) {
          var j = q.pop();
          body.push(j);
          var jz = zone[j];
          if (jz === ZONE.WILD || jz === ZONE.PARK) open++;
          var jx = j % N, jy = (j / N) | 0;
          for (var k = 0; k < 4; k++) {
            var nx = jx + [1, -1, 0, 0][k], ny = jy + [0, 0, 1, -1][k];
            if (!inb(nx, ny)) continue;
            var m = idx(nx, ny);
            if (road[m]) touches = true;
            if (seen[m] || W.terrain[m] !== T.WATER) continue;
            seen[m] = 1;
            q.push(m);
          }
        }
        /* A body of water survives if no road runs into it, it is big
           enough to read as a pond rather than a puddle, and it is
           mostly lying in open country or parkland. Testing the zone of
           the tiles *around* it instead drained every pond on the map,
           because open country always borders something. */
        if (!touches && body.length >= 30 && open / body.length > 0.7) continue;
        for (var b2 = 0; b2 < body.length; b2++) W.terrain[body[b2]] = T.DIRT;
      }
    }
  }

  function stampLines(lines) {
    lines.forEach(function (L) {
      for (var k = L.a; k <= L.b; k++) {
        for (var o = -L.w; o <= L.w; o++) {
          var x = L.v ? L.at + o : k;
          var y = L.v ? k : L.at + o;
          if (!inb(x, y)) continue;
          var i2 = idx(x, y);
          /* The compound is not on the street plan. Without this an
             arterial that happens to line up with the middle of the map
             paves straight through the player's own ground. */
          if (W.terrain[i2] === T.CLEARED) continue;
          if (Math.max(Math.abs(x - ctr), Math.abs(y - ctr)) < 13) continue;
          var edge = Math.abs(o) === L.w;
          if (L.kind === 'rail') {
            W.terrain[i2] = edge ? T.GRAVEL : T.BALLAST;
            zone[i2] = ZONE.RAIL;
            road[i2] = edge ? 0 : 2;          /* 2: crossable, not a road */
            continue;
          }
          W.terrain[i2] = edge ? T.GRAVEL : (L.w >= 3 ? T.ASPHALT : T.ROAD);
          if (L.kind === 'highway') zone[i2] = ZONE.HIGHWAY;
          road[i2] = 1;
        }
      }
    });

    /* The renderer paints centre lines down whatever `world.roads` says
       is a road, in the shape the old generator used. Handing it that
       shape here is cheaper than teaching it about street objects. */
    W.roads = lines.filter(function (l) { return l.kind !== 'rail'; })
                   .map(function (l) { return { h: !l.v, at: l.at, w: l.w }; });

    C.road = road;
  }

  function isRoad(x, y) { return inb(x, y) && road[idx(x, y)] === 1; }
  function nearRoad(x, y, r) {
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        if (isRoad(x + dx, y + dy)) return true;
      }
    }
    return false;
  }

  /* Cul-de-sacs: a stub off a suburban street with a turning head on the
     end. They are the reason a suburb does not read as a grid. */
  function layCulDeSacs() {
    var hs = C.streets.filter(function (l) { return !l.v && l.kind === 'street'; });
    for (var i = 0; i < hs.length; i++) {
      if (rnd() > 0.45) continue;
      var L = hs[i];
      var sx = 14 + Math.floor(rnd() * (N - 28));
      if (C.zoneAt(sx, L.at) !== ZONE.SUBURB) continue;
      var dir = rnd() < 0.5 ? 1 : -1;
      var len = 8 + Math.floor(rnd() * 7);
      var t, ox, cx, cy;

      /* Look before stamping. Nothing stopped a stub being laid straight
         down an existing street, or crossing one, which is what a road
         running through the middle of another road is. The first two
         tiles are the junction it comes off, so those are allowed. */
      var blocked = false;
      for (t = 3; t <= len + 4 && !blocked; t++) {
        for (ox = -2; ox <= 2; ox++) {
          var px = sx + ox, py = L.at + dir * t;
          if (!inb(px, py)) { blocked = true; break; }
          if (road[idx(px, py)]) { blocked = true; break; }
        }
      }
      if (blocked) continue;

      for (t = 0; t <= len; t++) {
        var yy = L.at + dir * t;
        for (ox = -1; ox <= 1; ox++) {
          if (!inb(sx + ox, yy)) continue;
          var j = idx(sx + ox, yy);
          if (W.terrain[j] === T.CLEARED || W.terrain[j] === T.WATER) continue;
          if (Math.max(Math.abs(sx + ox - ctr), Math.abs(yy - ctr)) < 13) continue;
          W.terrain[j] = T.ROAD;
          road[j] = 1;
        }
      }
      for (cy = -3; cy <= 3; cy++) {
        for (cx = -3; cx <= 3; cx++) {
          if (cx * cx + cy * cy > 9) continue;
          var hx = sx + cx, hy = L.at + dir * len + cy;
          if (!inb(hx, hy)) continue;
          var j2 = idx(hx, hy);
          if (W.terrain[j2] === T.CLEARED || W.terrain[j2] === T.WATER) continue;
          if (Math.max(Math.abs(hx - ctr), Math.abs(hy - ctr)) < 13) continue;
          W.terrain[j2] = T.ROAD;
          road[j2] = 1;
        }
      }
    }
  }

  /* Alleys and service lanes, cut into blocks once the blocks are known.
     A width of one and no pavement: this is the back of the shops. The
     alley splits its block in two, and both halves go back in the list,
     which is what gives a deep commercial block frontage on both sides
     instead of a dead middle. */
  function layAlleys(blocks) {
    var n = blocks.length;
    for (var i = 0; i < n; i++) {
      var b = blocks[i];
      var bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
      var z = b.zone;
      if (z === ZONE.WILD || z === ZONE.PARK) continue;
      var urban = z === ZONE.DOWNTOWN || z === ZONE.COMMERCIAL || z === ZONE.SHOPPING;
      var long = Math.max(bw, bh);
      if (long < (urban ? 19 : 27)) continue;
      var vertical = bw > bh;
      var at = Math.round(vertical ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2);
      for (var k = (vertical ? b.y0 : b.x0); k <= (vertical ? b.y1 : b.x1); k++) {
        var x = vertical ? at : k, y = vertical ? k : at;
        if (!inb(x, y)) continue;
        var j = idx(x, y);
        if (W.terrain[j] === T.CLEARED || W.terrain[j] === T.WATER) continue;
        if (Math.max(Math.abs(x - ctr), Math.abs(y - ctr)) < 13) continue;
        W.terrain[j] = T.ASPHALT;
        if (urban) zone[j] = ZONE.ALLEY;
        road[j] = 1;
      }
      var half = vertical ? { x0: b.x0, x1: at - 2, y0: b.y0, y1: b.y1, zone: z }
                          : { x0: b.x0, x1: b.x1, y0: b.y0, y1: at - 2, zone: z };
      var other = vertical ? { x0: at + 2, x1: b.x1, y0: b.y0, y1: b.y1, zone: z }
                           : { x0: b.x0, x1: b.x1, y0: at + 2, y1: b.y1, zone: z };
      blocks[i] = half;
      blocks.push(other);
    }
  }

  /* ------------------------------------------------------------------ *
   * 3. Ground
   *
   * Pavements next to the kerb, tarmac where the zone is hard, grass
   * where it is not. Doing this after the streets and before the
   * buildings means a building always lands on a surface that already
   * makes sense for where it is.
   * ------------------------------------------------------------------ */
  function paintGround() {
    var x, y, i, z, t;

    /* ---- drain the town ----
       The terrain lays ponds in the low ground before the city exists, and
       a pond that lands inside a block is left as the one thing the yard
       pass will not pave: the result is a crisp rectangle of open water in
       the middle of a car park. Anywhere built-up, it gets filled in and
       reads as the damp ground it would be. Parks and open country keep
       their water. */
    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) {
        i = idx(x, y);
        if (W.terrain[i] !== T.WATER) continue;
        z = zone[i];
        if (z === ZONE.WILD || z === ZONE.PARK) continue;
        W.terrain[i] = T.DIRT;
      }
    }

    for (y = 0; y < N; y++) {
      for (x = 0; x < N; x++) {
        i = idx(x, y);
        if (road[i]) continue;
        t = W.terrain[i];
        if (t === T.WATER || t === T.CLEARED) continue;
        z = zone[i];
        var kerb = isRoad(x + 1, y) || isRoad(x - 1, y) || isRoad(x, y + 1) || isRoad(x, y - 1) ||
                   isRoad(x + 1, y + 1) || isRoad(x - 1, y - 1) || isRoad(x + 1, y - 1) || isRoad(x - 1, y + 1);
        var n = Z.hash2(x, y, 909);

        if (z === ZONE.DOWNTOWN) {
          W.terrain[i] = kerb || n > 0.35 ? T.SIDEWALK : T.PLAZA;
        } else if (z === ZONE.SHOPPING || z === ZONE.COMMERCIAL || z === ZONE.HOSPITAL) {
          W.terrain[i] = kerb ? T.SIDEWALK : (n > 0.62 ? T.SIDEWALK : T.ASPHALT);
        } else if (z === ZONE.ALLEY) {
          W.terrain[i] = T.ASPHALT;
        } else if (z === ZONE.INDUSTRIAL) {
          W.terrain[i] = kerb ? T.SIDEWALK : (n > 0.5 ? T.GRAVEL : T.ASPHALT);
        } else if (z === ZONE.RAIL) {
          W.terrain[i] = n > 0.5 ? T.GRAVEL : T.BALLAST;
        } else if (z === ZONE.CONSTRUCTION) {
          W.terrain[i] = n > 0.4 ? T.DIRT : T.GRAVEL;
        } else if (z === ZONE.RESIDENTIAL) {
          if (kerb) W.terrain[i] = T.SIDEWALK;
          else if (t !== T.GRASS && n > 0.5) W.terrain[i] = T.GRASS;
        } else if (z === ZONE.SUBURB) {
          if (kerb && n > 0.3) W.terrain[i] = T.SIDEWALK;
        } else if (z === ZONE.PARK) {
          if (t === T.GRAVEL || t === T.DIRT) W.terrain[i] = T.GRASS;
        }
      }
    }

    /* Park paths: a wandering line of fine gravel through each park, so
       a park is somewhere you walk rather than a field. */
    C.seeds.forEach(function (s) {
      if (s.k !== ZONE.PARK) return;
      var a = rnd() * Z.TAU, px = s.x, py = s.y;
      for (var t2 = 0; t2 < 70; t2++) {
        a += (rnd() - 0.5) * 0.5;
        px += Math.cos(a); py += Math.sin(a);
        var tx = Math.round(px), ty = Math.round(py);
        if (!inb(tx, ty)) break;
        if (C.zoneAt(tx, ty) !== ZONE.PARK) break;
        for (var o = -1; o <= 1; o++) {
          if (inb(tx + o, ty) && !road[idx(tx + o, ty)] && W.terrain[idx(tx + o, ty)] !== T.WATER)
            W.terrain[idx(tx + o, ty)] = T.PARKPATH;
        }
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 4. Blocks
   *
   * The cells of the street grid. Because every through street spans the
   * map, the blocks are exactly the rectangles between consecutive lines,
   * and there is no need to go looking for them.
   * ------------------------------------------------------------------ */
  function gridBlocks() {
    var vs = [], hs = [], i, j;
    C.streets.forEach(function (L) {
      (L.v ? vs : hs).push({ at: L.at, w: L.w });
    });
    function bySide(a, b) { return a.at - b.at; }
    vs.sort(bySide); hs.sort(bySide);
    /* the map edge closes the outermost cells */
    vs.unshift({ at: 1, w: 0 }); vs.push({ at: N - 2, w: 0 });
    hs.unshift({ at: 1, w: 0 }); hs.push({ at: N - 2, w: 0 });

    var out = [];
    for (i = 0; i < vs.length - 1; i++) {
      for (j = 0; j < hs.length - 1; j++) {
        var x0 = vs[i].at + vs[i].w + 1, x1 = vs[i + 1].at - vs[i + 1].w - 1;
        var y0 = hs[j].at + hs[j].w + 1, y1 = hs[j + 1].at - hs[j + 1].w - 1;
        if (x1 - x0 < 5 || y1 - y0 < 5) continue;
        /* what kind of place is this, by majority of its own ground */
        var zc = {}, n = 0;
        for (var y = y0; y <= y1; y += 2) {
          for (var x = x0; x <= x1; x += 2) {
            if (!inb(x, y)) continue;
            var z = zone[idx(x, y)];
            zc[z] = (zc[z] || 0) + 1; n++;
          }
        }
        if (!n) continue;
        var dom = ZONE.WILD, dn = 0;
        for (var zk in zc) if (zc[zk] > dn) { dn = zc[zk]; dom = +zk; }
        out.push({ x0: x0, y0: y0, x1: x1, y1: y1, zone: dom,
                   n: (x1 - x0 + 1) * (y1 - y0 + 1) });
      }
    }
    C.blocks = out;
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 5. Lots
   * ------------------------------------------------------------------ */
  /* Lot depth, back from the kerb, per zone. */
  var DEPTH = {};
  DEPTH[ZONE.DOWNTOWN] = 9; DEPTH[ZONE.COMMERCIAL] = 9; DEPTH[ZONE.SHOPPING] = 11;
  DEPTH[ZONE.HOSPITAL] = 12; DEPTH[ZONE.RESIDENTIAL] = 9; DEPTH[ZONE.SUBURB] = 9;
  DEPTH[ZONE.INDUSTRIAL] = 12; DEPTH[ZONE.RAIL] = 11; DEPTH[ZONE.CONSTRUCTION] = 9;
  DEPTH[ZONE.PARK] = 7; DEPTH[ZONE.WILD] = 8; DEPTH[ZONE.HIGHWAY] = 10;
  DEPTH[ZONE.ALLEY] = 8; DEPTH[ZONE.PARKING] = 9;

  /* Which building types want to stand in which zone, as a weighted bag
     built once from the catalogue's own `zones` field. */
  var BAGS = null;
  function bags() {
    if (BAGS) return BAGS;
    BAGS = {};
    for (var k in ZONE) BAGS[ZONE[k]] = [];
    for (var id in Z.PLACES) {
      var d = Z.PLACES[id];
      for (var zn in d.zones) {
        if (ZONE[zn] === undefined) continue;
        BAGS[ZONE[zn]].push([id, d.zones[zn]]);
      }
    }
    return BAGS;
  }

  /* Draw a type that fits the space. Weighted, and it will give up
     rather than force a tower onto a plot the size of a shed. */
  function pick(z, maxW, maxD) {
    var bag = bags()[z] || [];
    var ok = [], total = 0, i;
    for (i = 0; i < bag.length; i++) {
      var d = Z.PLACES[bag[i][0]];
      if (d.fw > maxW || d.fh > maxD) continue;
      /* prefer a building that nearly fills its plot: it is what stops
         a row of bungalows appearing on a downtown block */
      var fitness = (d.fw * d.fh) / (maxW * maxD);
      var wgt = bag[i][1] * (0.35 + fitness);
      ok.push([bag[i][0], wgt]);
      total += wgt;
    }
    if (!ok.length) return null;
    var r = rnd() * total;
    for (i = 0; i < ok.length; i++) {
      r -= ok[i][1];
      if (r <= 0) return ok[i][0];
    }
    return ok[0][0];
  }

  /* Is every tile of this footprint free, unpaved by another lot, and
     off the road? */
  function clear(x0, y0, w, h) {
    for (var y = y0; y < y0 + h; y++) {
      for (var x = x0; x < x0 + w; x++) {
        if (!inb(x, y)) return false;
        var i = idx(x, y);
        if (road[i] || used[i] || W.pgrid[i]) return false;
        if (W.terrain[i] === T.WATER || W.terrain[i] === T.CLEARED) return false;
        if (Math.max(Math.abs(x - ctr), Math.abs(y - ctr)) < 16) return false;
      }
    }
    return true;
  }
  function claim(x0, y0, w, h) {
    for (var y = y0; y < y0 + h; y++) {
      for (var x = x0; x < x0 + w; x++) if (inb(x, y)) used[idx(x, y)] = 1;
    }
  }

  /* Put a building down with its south wall toward the street, which is
     the face the camera sees and the face the door is in. */
  function place(id, x0, y0) {
    var d = Z.PLACES[id];
    if (!clear(x0, y0, d.fw, d.fh)) return null;
    var p = W.addProp(id, x0 + d.fw / 2, y0 + d.fh / 2, rnd);
    claim(x0 - 1, y0 - 1, d.fw + 2, d.fh + 2);
    p.zone = C.zoneAt(x0 + d.fw / 2, y0 + d.fh / 2);
    return p;
  }

  /* One block: a strip of frontage along every side that has a street,
     then whatever is left over in the middle. */
  function buildBlock(b) {
    var z = b.zone;
    if (z === ZONE.PARK || z === ZONE.HIGHWAY) return;

    /* Open country is not a building plot.

       It was being cut into lots like anywhere else, and the only type
       with any weight out there is the ruined house - so every block of
       field and woodland came out as a terrace of derelicts, and two
       buildings in five on the whole map were ruins. The country gets at
       most one abandoned place per block, set well back from the road,
       and otherwise stays country. */
    if (z === ZONE.WILD) {
      if (rnd() < 0.7) { yard(b); return; }
      var wid = Z.PLACES[rnd() < 0.55 ? 'ruin' : 'bungalow'];
      var wx = b.x0 + 2 + Math.floor(rnd() * Math.max(1, (b.x1 - b.x0 - wid.fw - 3)));
      var wy = b.y0 + 2 + Math.floor(rnd() * Math.max(1, (b.y1 - b.y0 - wid.fh - 3)));
      place(wid.id, wx, wy);
      yard(b);
      return;
    }
    var bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    if (bw < 5 || bh < 5) return;
    var depth = Math.min(DEPTH[z] || 9, Math.floor(Math.min(bw, bh) / 2) + 3);

    /* south side first: it is the one the player sees the front of */
    var sides = [
      { side: 's', along: 'x', at: b.y1, dir: -1 },
      { side: 'n', along: 'x', at: b.y0, dir: 1 },
      { side: 'w', along: 'y', at: b.x0, dir: 1 },
      { side: 'e', along: 'y', at: b.x1, dir: -1 }
    ];

    for (var s = 0; s < sides.length; s++) {
      var sd = sides[s];
      var horiz = sd.along === 'x';
      var lo = horiz ? b.x0 : b.y0, hi = horiz ? b.x1 : b.y1;
      /* only build against a side that actually faces a street */
      var probeX = horiz ? Math.round((b.x0 + b.x1) / 2) : sd.at - sd.dir * 2;
      var probeY = horiz ? sd.at - sd.dir * 2 : Math.round((b.y0 + b.y1) / 2);
      if (!nearRoad(probeX, probeY, 3)) continue;

      var at = lo + Math.floor(rnd() * 3);
      var guard = 0;
      while (at < hi - 2 && guard++ < 60) {
        var room = hi - at + 1;
        var id = pick(z, Math.min(room, 15), depth);
        if (!id) break;
        var d = Z.PLACES[id];
        var setback = 1 + Math.floor(rnd() * 2);
        var x0, y0;
        if (horiz) {
          x0 = at;
          y0 = sd.dir < 0 ? sd.at - setback - d.fh + 1 : sd.at + setback;
        } else {
          y0 = at;
          x0 = sd.dir < 0 ? sd.at - setback - d.fw + 1 : sd.at + setback;
        }
        if (place(id, x0, y0)) {
          at += (horiz ? d.fw : d.fh) + 1 + Math.floor(rnd() * 3);
        } else {
          at += 2;
        }
      }
    }

    yard(b);
  }

  /* ------------------------------------------------------------------ *
   * 6. Yards
   *
   * What a block has in the middle once its frontage is built. This is
   * the difference between a city of buildings and a city: car parks
   * behind the shops, gardens behind the houses, containers behind the
   * units.
   * ------------------------------------------------------------------ */
  function yard(b) {
    var z = b.zone, x, y, i;
    var free = [];
    for (y = b.y0; y <= b.y1; y++) {
      for (x = b.x0; x <= b.x1; x++) {
        if (!inb(x, y)) continue;
        i = idx(x, y);
        if (road[i] || used[i] || W.pgrid[i]) continue;
        if (W.terrain[i] === T.WATER || W.terrain[i] === T.CLEARED) continue;
        free.push([x, y]);
      }
    }
    if (free.length < 8) return;

    var park = (z === ZONE.DOWNTOWN || z === ZONE.SHOPPING || z === ZONE.COMMERCIAL ||
                z === ZONE.HOSPITAL || z === ZONE.INDUSTRIAL);

    if (park && free.length > 24) {
      /* a car park: tarmac, painted bays, and what was left in them */
      for (i = 0; i < free.length; i++) {
        var fi = idx(free[i][0], free[i][1]);
        W.terrain[fi] = T.ASPHALT;
        if (zone[fi] !== ZONE.DOWNTOWN) zone[fi] = ZONE.PARKING;
      }
      var cars = Math.floor(free.length / 16);
      for (i = 0; i < cars; i++) {
        var f = free[Math.floor(rnd() * free.length)];
        tryProp(rnd() < 0.24 ? 'burntCar' : 'car', f[0], f[1]);
      }
      scatterIn(free, 'bollard', Math.floor(free.length / 40));
      scatterIn(free, 'lamp', Math.floor(free.length / 60));
      scatterIn(free, 'shoppingCart', z === ZONE.SHOPPING ? 4 : 1);
    } else if (z === ZONE.RESIDENTIAL || z === ZONE.SUBURB) {
      scatterIn(free, 'tree', Math.floor(free.length / 14));
      scatterIn(free, 'bush', Math.floor(free.length / 12));
      scatterIn(free, 'shed', Math.floor(free.length / 45));
      scatterIn(free, 'washingLine', Math.floor(free.length / 70));
      scatterIn(free, 'car', Math.floor(free.length / 70));
    } else if (z === ZONE.INDUSTRIAL || z === ZONE.RAIL) {
      scatterIn(free, 'container', Math.floor(free.length / 22));
      scatterIn(free, 'palletStack', Math.floor(free.length / 26));
      scatterIn(free, 'drum', Math.floor(free.length / 30));
      scatterIn(free, 'scrapPile', Math.floor(free.length / 34));
    } else if (z === ZONE.CONSTRUCTION) {
      scatterIn(free, 'scaffold', Math.floor(free.length / 26));
      scatterIn(free, 'sandPile', Math.floor(free.length / 30));
      scatterIn(free, 'pipeStack', Math.floor(free.length / 30));
      scatterIn(free, 'digger', Math.floor(free.length / 70));
      scatterIn(free, 'portaloo', Math.floor(free.length / 60));
    } else {
      scatterIn(free, 'bush', Math.floor(free.length / 16));
      scatterIn(free, 'rubble', Math.floor(free.length / 30));
    }
  }

  /* Block interiors are yards and gardens: a tree behind a house is a
     garden tree, so these are allowed through the woodland gate. */
  function scatterIn(cells, kind, n) {
    for (var i = 0; i < n; i++) {
      var c = cells[Math.floor(rnd() * cells.length)];
      tryProp(kind, c[0], c[1], true);
    }
  }

  /* Where woodland is allowed to grow.

     Forest trees were being scattered by `woods()` on nothing but a free
     tile, and the woodland lobe overlaps the edge of town - so pines came
     up through the pavement in the middle of downtown. Anything that
     belongs in a wood now has to pass this first. Garden trees in a back
     yard and the pollarded street trees on a kerb are placed elsewhere and
     are deliberately not affected. */
  var WILDING = { tree: 1, pine: 1, deadtree: 1, bush: 1, rock: 1, sapling: 1 };
  function greenOk(x, y) {
    var z = C.zoneAt(x, y);
    return z === ZONE.WILD || z === ZONE.PARK || z === ZONE.SUBURB ||
           z === ZONE.CONSTRUCTION;
  }

  /* Place if there is room, quietly do nothing if not. Everything in the
     detail pass goes through here, so no caller has to handle failure. */
  function tryProp(kind, x, y, anywhere) {
    var d = Z.PROPS[kind];
    if (!d || !inb(x, y)) return null;
    if (!anywhere && WILDING[kind] && !greenOk(x, y)) return null;
    /* `used` is the lot grid: a building's footprint plus a tile all round
       it. Only `clear()` consulted it, so nothing stopped the detail pass
       dropping a barrel or a bin in that ring - hard against a wall, where
       a building three storeys tall draws straight over it and it reads as
       something standing inside the shop. */
    var fw = d.fw || 1, fh = d.fh || 1;
    var x0 = Math.round(x - (fw - 1) / 2), y0 = Math.round(y - (fh - 1) / 2);
    for (var dy = 0; dy < fh; dy++) {
      for (var dx = 0; dx < fw; dx++) {
        var tx = x0 + dx, ty = y0 + dy;
        if (!inb(tx, ty)) return null;
        var i = idx(tx, ty);
        if (W.pgrid[i] || used[i]) return null;
        if (W.terrain[i] === T.WATER || W.terrain[i] === T.CLEARED) return null;
        if (Math.max(Math.abs(tx - ctr), Math.abs(ty - ctr)) < 13) return null;
      }
    }
    return W.addProp(kind, x0 + fw / 2, y0 + fh / 2, rnd);
  }
  C.tryProp = function (k, x, y) { return tryProp(k, x, y); };

  /* ------------------------------------------------------------------ *
   * 7. Detail
   *
   * Everything that is not a building. This is most of what sells the
   * place: a street with no lamp posts, no wrecks, no bins and no weeds
   * is a diagram of a street.
   * ------------------------------------------------------------------ */
  function detail() {
    var i, x, y, L;
    var lines = C.streets;

    /* --- kerbside furniture, walked along each street --- */
    for (i = 0; i < lines.length; i++) {
      L = lines[i];
      if (L.kind === 'rail') continue;
      var z0 = C.zoneAt(L.v ? L.at : (L.a + L.b) / 2, L.v ? (L.a + L.b) / 2 : L.at);
      var built = z0 !== ZONE.WILD;
      var step = L.kind === 'highway' ? 14 : (built ? 9 : 16);
      for (var k = L.a + 4; k < L.b - 4; k += step + Math.floor(rnd() * 5)) {
        for (var sd = -1; sd <= 1; sd += 2) {
          if (rnd() < 0.3) continue;
          var off = L.w + 1 + Math.floor(rnd() * 2);
          x = L.v ? L.at + sd * off : k;
          y = L.v ? k : L.at + sd * off;
          var z = C.zoneAt(x, y);
          var roll = rnd();
          if (z === ZONE.WILD || z === ZONE.SUBURB) {
            tryProp(roll < 0.5 ? 'powerPole' : (roll < 0.62 ? 'fallenPole' : 'lamp'), x, y);
          } else if (roll < 0.42) {
            tryProp('lamp', x, y);
          } else if (roll < 0.56) {
            tryProp('roadSign', x, y);
          } else if (roll < 0.66) {
            tryProp('hydrant', x, y);
          } else if (roll < 0.76 && (z === ZONE.DOWNTOWN || z === ZONE.COMMERCIAL)) {
            tryProp(rnd() < 0.5 ? 'bench' : 'bin', x, y);
          } else if (roll < 0.84 && (z === ZONE.DOWNTOWN || z === ZONE.SHOPPING)) {
            tryProp(rnd() < 0.5 ? 'busShelter' : 'vending', x, y);
          } else if (roll < 0.9) {
            tryProp('planter', x, y);
          } else {
            tryProp('streetTree', x, y);
          }
        }
      }
    }

    /* --- traffic lights on the big junctions --- */
    var arts = lines.filter(function (l) { return l.kind === 'arterial'; });
    for (i = 0; i < arts.length; i++) {
      for (var j = 0; j < arts.length; j++) {
        if (arts[i].v === arts[j].v) continue;
        var jx = arts[i].v ? arts[i].at : arts[j].at;
        var jy = arts[i].v ? arts[j].at : arts[i].at;
        if (C.zoneAt(jx, jy) === ZONE.WILD) continue;
        for (var q = 0; q < 2; q++) {
          tryProp('trafficLight', jx + (q ? 5 : -5), jy + (q ? 5 : -5));
        }
      }
    }

    /* --- wrecks on the road ---
       Density follows the zone, and the highway gets a jam: a line of
       them nose to tail, which is the single clearest way to say that
       everybody tried to leave at once and nobody got out. */
    for (i = 0; i < lines.length; i++) {
      L = lines[i];
      if (L.kind === 'rail' || L.kind === 'alley') continue;
      var jam = L.kind === 'highway';
      var gap = jam ? 3 : 13;
      for (var t = L.a + 3; t < L.b - 3; t += gap + Math.floor(rnd() * (jam ? 3 : 14))) {
        if (!jam && rnd() > 0.55) continue;
        var lane = Math.round((rnd() - 0.5) * (L.w * 1.4));
        x = L.v ? L.at + lane : t;
        y = L.v ? t : L.at + lane;
        var rr = rnd();
        var kind = rr < 0.5 ? 'car' : rr < 0.66 ? 'burntCar' : rr < 0.78 ? 'truckWreck'
                 : rr < 0.86 ? 'policeCar' : rr < 0.93 ? 'busWreck' : 'ambulance';
        tryProp(kind, x, y);
      }
    }

    /* --- alleys: bins, skips, pallets, and the fire escapes above --- */
    for (y = 1; y < N - 1; y++) {
      for (x = 1; x < N - 1; x++) {
        if (zone[idx(x, y)] !== ZONE.ALLEY || road[idx(x, y)]) continue;
        if (rnd() > 0.10) continue;
        var ar = rnd();
        tryProp(ar < 0.4 ? 'dumpster' : ar < 0.62 ? 'bin' : ar < 0.8 ? 'palletStack'
              : ar < 0.92 ? 'scrapPile' : 'drum', x, y);
      }
    }

    /* --- barricades and checkpoints ---
       Placed where a road enters downtown, because that is where they
       would have been: the cordon that did not hold. */
    var D = C.downtown;
    for (i = 0; i < lines.length; i++) {
      L = lines[i];
      if (L.kind !== 'arterial' && L.kind !== 'highway') continue;
      for (var side = -1; side <= 1; side += 2) {
        var dist = 30 + rnd() * 12;
        x = L.v ? L.at : Math.round(D.x + side * dist);
        y = L.v ? Math.round(D.y + side * dist) : L.at;
        if (!inb(x, y) || C.zoneAt(x, y) === ZONE.WILD) continue;
        if (rnd() < 0.55) {
          for (var o = -L.w; o <= L.w; o += 2) {
            tryProp('barricade', L.v ? x + o : x, L.v ? y : y + o);
          }
          tryProp(rnd() < 0.5 ? 'policeCar' : 'sandbagWall', x + (L.v ? 3 : 0), y + (L.v ? 0 : 3));
        }
      }
    }
    /* one army checkpoint on the highway, with the hardware to match */
    if (C.highway) {
      var H = C.highway;
      var hk = Math.round((H.a + H.b) / 2 + (rnd() - 0.5) * 40);
      for (var o2 = -H.w; o2 <= H.w; o2 += 1) {
        if (Math.abs(o2) < 2) continue;
        tryProp('barricade', H.v ? H.at + o2 : hk, H.v ? hk : H.at + o2);
      }
      tryProp('checkpoint', H.v ? H.at + H.w + 3 : hk + 4, H.v ? hk : H.at + H.w + 3);
      tryProp('sandbagWall', H.v ? H.at - H.w - 3 : hk - 4, H.v ? hk : H.at - H.w - 3);
      tryProp('locker', H.v ? H.at + H.w + 4 : hk + 6, H.v ? hk + 2 : H.at + H.w + 4);
    }

    /* --- the railway: rolling stock and a station --- */
    if (C.rail) {
      var R = C.rail;
      for (var rt = R.a + 8; rt < R.b - 8; rt += 18 + Math.floor(rnd() * 30)) {
        if (rnd() < 0.45) tryProp('railCar', R.v ? R.at : rt, R.v ? rt : R.at);
      }
      /* the station goes beside the line, in the rail zone */
      for (var tries = 0; tries < 40; tries++) {
        var st = R.a + 20 + Math.floor(rnd() * Math.max(1, R.b - R.a - 40));
        var sx = R.v ? R.at + (rnd() < 0.5 ? -9 : 6) : st;
        var sy = R.v ? st : R.at + (rnd() < 0.5 ? -9 : 6);
        var d = Z.PLACES.trainStation;
        if (place('trainStation', Math.round(sx - d.fw / 2), Math.round(sy - d.fh / 2))) break;
      }
    }

    /* --- parks --- */
    for (y = 1; y < N - 1; y++) {
      for (x = 1; x < N - 1; x++) {
        if (zone[idx(x, y)] !== ZONE.PARK) continue;
        var pr = rnd();
        if (pr < 0.055) tryProp(rnd() < 0.75 ? 'tree' : 'pine', x, y, true);
        else if (pr < 0.075) tryProp('bush', x, y, true);
        else if (pr < 0.080) tryProp(rnd() < 0.5 ? 'bench' : 'planter', x, y);
        else if (pr < 0.0815) tryProp('bin', x, y);
      }
    }

    /* --- survivor camps ---
       Somebody else got this far. Three of them, in the green, each one
       a ring of tents round a fire behind a barricade. */
    var camps = 3;
    for (i = 0; i < camps * 14 && camps > 0; i++) {
      x = 6 + Math.floor(rnd() * (N - 12));
      y = 6 + Math.floor(rnd() * (N - 12));
      var cz = C.zoneAt(x, y);
      if (cz !== ZONE.PARK && cz !== ZONE.WILD && cz !== ZONE.SUBURB) continue;
      if (Math.max(Math.abs(x - ctr), Math.abs(y - ctr)) < 30) continue;
      if (!tryProp('campfire', x, y)) continue;
      for (var c2 = 0; c2 < 5; c2++) {
        var ca = rnd() * Z.TAU, cr = 2 + rnd() * 2.5;
        tryProp(rnd() < 0.6 ? 'tent' : 'barricade',
                Math.round(x + Math.cos(ca) * cr), Math.round(y + Math.sin(ca) * cr));
      }
      tryProp('crate', x + 2, y + 2);
      tryProp('corpse', x - 2, y + 1);
      camps--;
    }

    /* --- nests ---
       A nest is the risk half of risk and reward: it sits on good ground,
       it is visible from a distance, and the sim reads it as a reason to
       keep a crowd standing there. */
    C.nests = [];
    var want = 6;
    for (i = 0; i < 300 && want > 0; i++) {
      x = 6 + Math.floor(rnd() * (N - 12));
      y = 6 + Math.floor(rnd() * (N - 12));
      if (C.riskAt(x, y) < 1.2) continue;
      if (Math.max(Math.abs(x - ctr), Math.abs(y - ctr)) < 34) continue;
      if (!tryProp('nest', x, y)) continue;
      C.nests.push({ x: x + 0.5, y: y + 0.5 });
      for (var n2 = 0; n2 < 4; n2++) {
        tryProp('corpse', x + Math.round((rnd() - 0.5) * 6), y + Math.round((rnd() - 0.5) * 6));
      }
      want--;
    }

    /* --- what the city is losing to ---
       Weeds and saplings through the tarmac, vines up the walls, rubble
       where something came down. Scaled by how long ago this was a town. */
    var tries2 = N * N * 0.09;
    for (i = 0; i < tries2; i++) {
      x = 2 + Math.floor(rnd() * (N - 4));
      y = 2 + Math.floor(rnd() * (N - 4));
      var ti = idx(x, y);
      var tt = W.terrain[ti];
      var zz = zone[ti];
      if (tt === T.WATER || tt === T.CLEARED) continue;
      var pr2 = rnd();
      if (tt === T.ROAD || tt === T.ASPHALT || tt === T.SIDEWALK || tt === T.PLAZA) {
        if (pr2 < 0.055) tryProp('weeds', x, y);
        else if (pr2 < 0.064) tryProp('sapling', x, y);
        else if (pr2 < 0.070) tryProp('rubble', x, y);
        else if (pr2 < 0.074) tryProp('trash', x, y);
      } else if (zz === ZONE.WILD) {
        if (pr2 < 0.05) tryProp(rnd() < 0.6 ? 'tree' : 'pine', x, y);
        else if (pr2 < 0.075) tryProp('bush', x, y);
        else if (pr2 < 0.082) tryProp('rock', x, y);
      } else if (pr2 < 0.035) {
        /* built-up ground gets weeds and refuse, never undergrowth */
        tryProp('weeds', x, y);
      } else if (pr2 < 0.045) {
        tryProp(greenOk(x, y) ? 'bush' : 'trash', x, y);
      }
    }

    /* --- lootables, thickest where it is worst --- */
    for (i = 0; i < 1500; i++) {
      x = 3 + Math.floor(rnd() * (N - 6));
      y = 3 + Math.floor(rnd() * (N - 6));
      var risk = C.riskAt(x, y);
      if (rnd() > risk * 0.35) continue;
      var lr = rnd();
      tryProp(lr < 0.42 ? 'crate' : lr < 0.62 ? 'corpse' : lr < 0.78 ? 'locker'
            : lr < 0.9 ? 'scrapPile' : 'barrel', x, y);
    }
  }

  /* ------------------------------------------------------------------ *
   * The woods
   *
   * Still here, still opposite downtown - it is where the timber is, and
   * a horizon of trees is what stops the map being city in every
   * direction.
   * ------------------------------------------------------------------ */
  function woods() {
    var D = C.downtown;
    var wx = Math.round(ctr - (D.x - ctr) * 1.1);
    var wy = Math.round(ctr - (D.y - ctr) * 1.1);
    C.wood = W.wood = { x: wx, y: wy, r: N * 0.24 };
    var want = 1500, tries = 0;
    while (want > 0 && tries++ < 26000) {
      var a = rnd() * Z.TAU, rr = Math.sqrt(rnd()) * C.wood.r * 1.15;
      var tx = Math.round(wx + Math.cos(a) * rr);
      var ty = Math.round(wy + Math.sin(a) * rr);
      if (!inb(tx, ty)) continue;
      var dens = 1 - Math.min(1, Z.dist(tx, ty, wx, wy) / C.wood.r);
      if (rnd() > dens * 0.95 + 0.06) continue;
      if (road[idx(tx, ty)]) continue;
      var pine = Z.hash2(tx >> 3, ty >> 3, 41) > 0.5;
      if (tryProp(rnd() < 0.08 ? 'deadtree' : (pine ? 'pine' : 'tree'), tx, ty)) want--;
    }
  }

  /* ------------------------------------------------------------------ *
   * Entry point
   * ------------------------------------------------------------------ */
  C.generate = function (seed) {
    W = Z.world; N = W.SIZE; T = W.T; ctr = W.CENTER;
    seedv = seed >>> 0 || 1;
    rnd = Z.rng(seedv ^ 0x5bf03635);
    used = new Uint8Array(N * N);
    BAGS = null;

    layZones();
    layStreets();
    drainWater();

    var blocks = gridBlocks();
    layAlleys(blocks);
    layCulDeSacs();
    paintGround();

    /* biggest blocks first: a mall or a hospital needs a whole block, and
       if the small ones go first the big types never find room */
    blocks.sort(function (a, b) {
      return ((b.x1 - b.x0) * (b.y1 - b.y0)) - ((a.x1 - a.x0) * (a.y1 - a.y0));
    });
    for (var i = 0; i < blocks.length; i++) buildBlock(blocks[i]);


    woods();
    detail();


    C.stats = {
      blocks: blocks.length,
      props: W.props.length,
      buildings: W.props.filter(function (p) { return p.def.enter; }).length
    };
    return C;
  };

})(window.Z);
