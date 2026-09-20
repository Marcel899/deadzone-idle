/* Deadzone - flow fields.

   A horde that walks straight at whatever it wants is not a horde. It is
   a queue of individuals arriving one at a time at the same stretch of
   wall, because every one of them took the same useless bearing and none
   of them ever looked for a way round. Open the gate and they walk past
   it into the fence beside it.

   So the pathfinding is done once for everybody rather than once per
   zombie. A field is a weighted breadth-first flood out from the thing
   they want - the compound, or you - and every tile in it remembers how
   far it is from there. A zombie then only ever asks one question, of
   its own tile: which neighbour is closer? That is a handful of array
   reads, so two hundred of them cost about what two of them cost with
   any per-body search, which is the whole point: the brief was more
   zombies AND better ones.

   Three things make it behave like a horde rather than a flood:

   1. Buildings are expensive, not impossible. A wall costs about a
      dozen tiles of walking, so they will go round a short barrier and
      chew through a long one - and a compound sealed on every side
      still gets attacked instead of leaving them milling in a field.
   2. The search is windowed. The world is 224 tiles square and they
      only ever care about the ground near what they are heading for, so
      the field covers a box around the target and anything outside it
      steers straight until it arrives.
   3. A clear line beats the grid. Following a tile gradient across open
      ground gives that unmistakable eight-direction stagger, so when
      nothing is in the way they just walk at the target.
*/
(function (Z) {
  'use strict';

  var F = Z.flow = {};

  var INF = 65535;
  var OPEN = 1;        /* cost to enter open ground */
  var THRU = 13;       /* cost to enter a tile something is built on */

  function Field(half) {
    this.R = half;
    this.W = half * 2 + 1;
    this.d = new Uint16Array(this.W * this.W);
    /* The cost of every tile in the window, read off the world once per
       build. Asking the world directly from inside the flood meant eight
       lookups per tile instead of one - twenty times the work, and it
       showed: a core rebuild took 43ms, which is three dropped frames
       every time you put up a wall. */
    this.c = new Uint8Array(this.W * this.W);
    this.ox = 0; this.oy = 0;
    this.tx = 0; this.ty = 0;
    this.live = false;
    this.age = 0;
    /* one bucket per reachable cost step, reused between builds */
    this.bk = [];
    for (var i = 0; i <= THRU; i++) this.bk.push([]);
  }

  /* What it costs to stand on a tile: nothing may pass water, a boulder
     or a wrecked car, and everything may pass a building for a price. */
  function tileCost(x, y) {
    var Wd = Z.world;
    if (!Wd.inside(x, y)) return 0;
    var i = Wd.idx(x, y);
    if (Wd.terrain[i] === Wd.T.WATER) return 0;
    var p = Wd.pgrid[i];
    if (p && p.def.blocks && !p.def.enter) return 0;
    var b = Wd.occ[i];
    if (b) {
      var bl = Z.sim && Z.sim.buildingById(b);
      if (bl && !bl.dead) return bl.def.floor ? OPEN : THRU;
    }
    return OPEN;
  }

  /* Dial's algorithm. Only two edge weights exist, so a ring of
     THRU + 1 buckets is a complete priority queue and the whole flood
     stays linear in the number of tiles. The ring can only be walked
     past THRU empty buckets in a row when nothing is left anywhere,
     which is the termination test. */
  Field.prototype.build = function (tx, ty) {
    tx = Math.floor(tx); ty = Math.floor(ty);
    var W = this.W, d = this.d, cg = this.c, bk = this.bk, NB = bk.length;
    var R = this.R, ox = tx - R, oy = ty - R;
    this.ox = ox; this.oy = oy;
    this.tx = tx; this.ty = ty;
    d.fill(INF);
    for (var b = 0; b < NB; b++) bk[b].length = 0;

    /* one pass over the window to price it, then the flood never touches
       the world again */
    for (var yy = 0; yy < W; yy++) {
      var row = yy * W;
      for (var xx = 0; xx < W; xx++) cg[row + xx] = tileCost(xx + ox, yy + oy);
    }

    var si = R * W + R;
    if (cg[si]) {
      d[si] = 0;
      bk[0].push(si);
    } else {
      /* the target is standing where nothing can stand - seed the ring
         around it rather than giving up on the whole field */
      var seeded = false;
      for (var a = 0; a < 8; a++) {
        var sx = R + DX[a], sy = R + DY[a];
        if (sx < 0 || sy < 0 || sx >= W || sy >= W) continue;
        var s2 = sy * W + sx;
        if (!cg[s2]) continue;
        d[s2] = 0; bk[0].push(s2); seeded = true;
      }
      if (!seeded) { this.live = false; return; }
    }

    var cur = 0, empty = 0;
    while (empty <= THRU) {
      var list = bk[cur % NB];
      if (!list.length) { cur++; empty++; continue; }
      empty = 0;
      var idx = list.pop();
      if (d[idx] !== cur) continue;            /* reached again, cheaper */
      var cx = idx % W, cy = (idx - cx) / W;
      var edge = cx === 0 || cy === 0 || cx === W - 1 || cy === W - 1;
      for (var k = 0; k < 8; k++) {
        var ax = cx + DX[k], ay = cy + DY[k];
        if (edge && (ax < 0 || ay < 0 || ax >= W || ay >= W)) continue;
        var ni = ay * W + ax;
        var c = cg[ni];
        if (!c) continue;
        /* no slipping through the corner between two blocked tiles */
        if (DX[k] && DY[k] && !cg[cy * W + ax] && !cg[ay * W + cx]) continue;
        var nd = cur + c;
        if (nd < d[ni] && nd < INF) {
          d[ni] = nd;
          bk[nd % NB].push(ni);
        }
      }
    }
    this.live = true;
    this.age = 0;
  };


  var DX = [1, -1, 0, 0, 1, 1, -1, -1];
  var DY = [0, 0, 1, -1, 1, -1, 1, -1];

  Field.prototype.at = function (wx, wy) {
    var ax = Math.floor(wx) - this.ox, ay = Math.floor(wy) - this.oy;
    if (ax < 0 || ay < 0 || ax >= this.W || ay >= this.W) return INF;
    return this.d[ay * this.W + ax];
  };

  /* Which way is downhill from here.

     Returns false when this point is off the field or in a pocket the
     flood never reached, and the caller falls back to a straight line -
     which is right, because the only places that happens are outside the
     window or inside somewhere sealed. */
  Field.prototype.dir = function (wx, wy, out) {
    if (!this.live) return false;
    var tx = Math.floor(wx), ty = Math.floor(wy);
    var ax = tx - this.ox, ay = ty - this.oy;
    if (ax < 1 || ay < 1 || ax >= this.W - 1 || ay >= this.W - 1) return false;
    var here = this.d[ay * this.W + ax];
    if (here === INF) return false;
    if (here === 0) { out.x = this.tx + 0.5 - wx; out.y = this.ty + 0.5 - wy; }
    else {
      var best = here, bx = 0, by = 0, bias = 1e9;
      for (var k = 0; k < 8; k++) {
        var nx = ax + DX[k], ny = ay + DY[k];
        var nd = this.d[ny * this.W + nx];
        if (nd === INF) continue;
        /* a diagonal covers more ground for the same step, so break ties
           toward it rather than toward whichever neighbour came first */
        var tie = (DX[k] && DY[k]) ? 0 : 1;
        if (nd < best || (nd === best && tie < bias)) {
          best = nd; bias = tie; bx = DX[k]; by = DY[k];
        }
      }
      if (!bx && !by) return false;
      out.x = (tx + bx + 0.5) - wx;
      out.y = (ty + by + 0.5) - wy;
    }
    var len = Math.sqrt(out.x * out.x + out.y * out.y) || 1;
    out.x /= len; out.y /= len;
    return true;
  };

  /* ---- cover ----

     What stops a round is not the same as what stops a walker. Water
     stops a walker and a bullet flies over it. A bush stops neither. A
     wrecked car stops both. So this is its own test, and the line it
     draws is the difference between a compound that is worth building
     and a wall you can shoot straight through.

     Height decides it for props: anything a metre or over is cover, so
     trees, cars, boulders, lockers and ruins block, while scrub, rubble,
     a scrap pile and a body on the ground do not. */
  function tileStopsShot(x, y) {
    var Wd = Z.world;
    if (!Wd.inside(x, y)) return true;
    var i = Wd.idx(x, y);
    var p = Wd.pgrid[i];
    if (p && p.def.blocks && (p.def.h || 0) >= 1.0) return true;
    var b = Wd.occ[i];
    if (b) {
      var bl = Z.sim && Z.sim.buildingById(b);
      if (bl && !bl.dead && bl.def.solid && !bl.def.floor && !bl.def.trap) return true;
    }
    return false;
  }
  F.stopsShot = tileStopsShot;

  /* How far a round gets before something stops it.

     Walked in fifths of a metre. The grid is metre tiles, so a step that
     size cannot skip one however the line is angled, and the worst case
     - a shotgun pellet at maximum range - is a hundred and fifty array
     reads, which is nothing next to the loop over the horde that
     follows it. */
  F.rayShot = function (x0, y0, dx, dy, maxD) {
    var step = 0.2;
    /* The tile the shot starts in never stops it.

       A turret stands ON a building - its own - and a survivor with his
       back to a wall is standing against one. Counting the origin tile
       meant every turret in the game shot its own housing and stopped,
       which is a worse bug than the one this whole test exists to fix. */
    var ox = Math.floor(x0), oy = Math.floor(y0);
    var lx = ox, ly = oy;
    for (var d = step; d <= maxD; d += step) {
      var tx = Math.floor(x0 + dx * d), ty = Math.floor(y0 + dy * d);
      if (tx === lx && ty === ly) continue;
      lx = tx; ly = ty;
      if (tx === ox && ty === oy) continue;
      if (tileStopsShot(tx, ty)) return Math.max(0, d - step);
    }
    return maxD;
  };

  /* Can this thing see that thing? The same test, as a yes or no. */
  F.sees = function (x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.001) return true;
    return F.rayShot(x0, y0, dx / d, dy / d, d) >= d - 0.25;
  };

  /* Is there anything at all between these two points?

     Walked a third of a tile at a time rather than with a proper grid
     traversal: this only ever runs over a dozen metres, it is asked
     once per zombie per frame at most, and a stepped walk cannot miss a
     wall a whole tile thick. */
  F.clear = function (x0, y0, x1, y1, maxD) {
    var dx = x1 - x0, dy = y1 - y0;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > (maxD || 14)) return false;
    if (d < 0.001) return true;
    var n = Math.ceil(d * 3);
    for (var i = 1; i <= n; i++) {
      var t = i / n;
      if (!tileCost(Math.floor(x0 + dx * t), Math.floor(y0 + dy * t))) return false;
    }
    return true;
  };

  /* Two fields. The compound never moves, so its field is rebuilt only
     when something is built or torn down - and it is the big one,
     because they walk to it from the edge of the map. You move
     constantly, so yours is small and cheap and rebuilt several times a
     second. */
  var core = new Field(72);
  var hero = new Field(34);
  var coreT = 0, heroT = 0, coreKey = '';

  F.core = core;
  F.hero = hero;

  F.tick = function (dt) {
    var S = Z.sim;
    if (!S) return;
    coreT -= dt; heroT -= dt;

    var c = S.core();
    if (c) {
      var key = Math.floor(c.x) + ',' + Math.floor(c.y);
      if (!core.live || key !== coreKey || S.flowDirty || coreT <= 0) {
        core.build(c.x, c.y);
        coreKey = key;
        S.flowDirty = false;
        coreT = 3.0;
      }
    }

    var p = S.p;
    if (p && !p.dead) {
      var moved = Math.abs(p.x - hero.tx) > 1.2 || Math.abs(p.y - hero.ty) > 1.2;
      if (!hero.live || (heroT <= 0 && moved)) {
        hero.build(p.x, p.y);
        heroT = 0.22;
      }
    } else {
      hero.live = false;
    }
  };

  /* Steer one body toward a target, using whichever field covers it.

     `out` is filled with a unit vector. The order matters: a clear line
     wins over everything, because following a grid across an empty field
     is the thing that looks like a robot. */
  var probe = { x: 0, y: 0 };
  F.steer = function (x, y, tx, ty, which, out) {
    if (F.clear(x, y, tx, ty, 13)) {
      out.x = tx - x; out.y = ty - y;
      var l = Math.sqrt(out.x * out.x + out.y * out.y) || 1;
      out.x /= l; out.y /= l;
      return true;
    }
    var f = which === 'hero' ? hero : core;
    if (f.live && f.dir(x, y, probe)) { out.x = probe.x; out.y = probe.y; return true; }
    /* nothing knows a way - walk at it and eat whatever is in between */
    out.x = tx - x; out.y = ty - y;
    var l2 = Math.sqrt(out.x * out.x + out.y * out.y) || 1;
    out.x /= l2; out.y /= l2;
    return false;
  };

  F.reset = function () { core.live = false; hero.live = false; coreKey = ''; };

}(window.Z = window.Z || {}));
