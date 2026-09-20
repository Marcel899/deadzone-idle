/* Deadzone - going inside.

   Every other mode in this game is a state of the one world, deliberately.
   This one is not: stepping through a door puts you in a place with its
   own grid and its own collision, and the street carries on without you
   until you come out.

   What is in there is not random. It runs down the building's own
   programme, in this order:

     building type -> floor plan -> rooms -> furniture -> damage -> loot
                   -> whatever is still walking about in it

   The plan is a binary split of the footprint, so the rooms tile it with
   nothing left over and no corridors to nowhere. Roles come off the
   catalogue's `rooms` list and are handed to leaves by size, largest
   first, with the room behind the front door always getting the public
   one - the shop floor, the reception, the living room. Furniture is then
   laid out by the role's own rule rather than dropped at random: shelving
   runs in aisles because a shop floor runs in aisles, beds go against
   walls because beds go against walls, and a fridge is in the kitchen
   because only the kitchen asks for one.

   None of it is saved. The room is a pure function of the building's id
   and art seed, so the same shop is the same shop every time you go in. */
(function (Z) {
  'use strict';

  var I = Z.interior = {
    room: null,          /* the place you are in, or null */
    from: null,          /* where you were standing outside */
    fade: 0
  };

  I.active = function () { return !!I.room; };

  var WALL = 1, FLOOR = 0;

  /* ------------------------------------------------------------------ *
   * The plan
   * ------------------------------------------------------------------ */
  /* Split until there are as many leaves as the programme wants rooms.
     Always cut the longer way, never leave a room too small to stand a
     bed in, and punch the connecting door as the recursion unwinds - a
     door per split means the plan is a tree, and a tree is connected. */
  function subdivide(t, w, rect, want, rnd, out, doors) {
    var bw = rect.x1 - rect.x0 + 1, bh = rect.y1 - rect.y0 + 1;
    var MIN = 3;
    if (want <= 1 || (bw < MIN * 2 + 1 && bh < MIN * 2 + 1)) {
      out.push(rect);
      return;
    }
    var vertical = bw === bh ? rnd() < 0.5 : bw > bh;
    var span = vertical ? bw : bh;
    if (span < MIN * 2 + 1) {
      vertical = !vertical;
      span = vertical ? bw : bh;
      if (span < MIN * 2 + 1) { out.push(rect); return; }
    }
    /* the cut lands somewhere in the middle two thirds */
    var lo = MIN, hi = span - MIN - 1;
    var cut = lo + Math.floor(rnd() * (hi - lo + 1));
    var at = (vertical ? rect.x0 : rect.y0) + cut;

    var a, b;
    if (vertical) {
      a = { x0: rect.x0, y0: rect.y0, x1: at - 1, y1: rect.y1 };
      b = { x0: at + 1, y0: rect.y0, x1: rect.x1, y1: rect.y1 };
      for (var y = rect.y0; y <= rect.y1; y++) t[y * w + at] = WALL;
    } else {
      a = { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: at - 1 };
      b = { x0: rect.x0, y0: at + 1, x1: rect.x1, y1: rect.y1 };
      for (var x = rect.x0; x <= rect.x1; x++) t[at * w + x] = WALL;
    }

    /* how the want is divided: the bigger half asks for more rooms */
    var aArea = (a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1);
    var bArea = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
    var aWant = Math.max(1, Math.round((want - 1) * aArea / (aArea + bArea)));
    var bWant = Math.max(1, want - aWant);

    subdivide(t, w, a, aWant, rnd, out, doors);
    subdivide(t, w, b, bWant, rnd, out, doors);

    /* the doorway, always away from the corners so furniture cannot sit
       across it */
    var dpos;
    if (vertical) {
      dpos = rect.y0 + 1 + Math.floor(rnd() * Math.max(1, rect.y1 - rect.y0 - 1));
      t[dpos * w + at] = FLOOR;
      doors.push([at, dpos, true]);
      /* wide openings in the public parts read better than a door */
      if (rnd() < 0.3 && dpos + 1 <= rect.y1) {
        t[(dpos + 1) * w + at] = FLOOR;
        doors.push([at, dpos + 1, true]);
      }
    } else {
      dpos = rect.x0 + 1 + Math.floor(rnd() * Math.max(1, rect.x1 - rect.x0 - 1));
      t[at * w + dpos] = FLOOR;
      doors.push([dpos, at, false]);
      if (rnd() < 0.3 && dpos + 1 <= rect.x1) {
        t[at * w + dpos + 1] = FLOOR;
        doors.push([dpos + 1, at, false]);
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Furniture
   *
   * One function per arrangement rule. They all take the room, a seeded
   * random, and an `add` that refuses anything which will not fit or
   * which would block a doorway.
   * ------------------------------------------------------------------ */
  var LAYOUT = {};

  /* Parallel runs down the long axis with a gangway between them. A shop
     floor, a stock room, a pharmacy: anywhere people walked up and down
     rather than around. */
  LAYOUT.aisles = function (R, add, rnd, kinds) {
    var horiz = (R.x1 - R.x0) >= (R.y1 - R.y0);
    var k = kinds[0];
    var spacing = 3;
    if (horiz) {
      for (var y = R.y0 + 1; y <= R.y1 - 1; y += spacing) {
        for (var x = R.x0; x <= R.x1; x++) {
          if (rnd() < 0.14) { x++; continue; }        /* a gap in the run */
          add(k, x, y, 0);
          x++;                                        /* shelves are 2 wide */
        }
      }
    } else {
      for (var x2 = R.x0 + 1; x2 <= R.x1 - 1; x2 += spacing) {
        for (var y2 = R.y0; y2 <= R.y1; y2++) {
          if (rnd() < 0.14) { y2++; continue; }
          add(k, x2, y2, 1);
          y2++;
        }
      }
    }
  };

  LAYOUT.racking = function (R, add, rnd, kinds) {
    var horiz = (R.x1 - R.x0) >= (R.y1 - R.y0);
    var step = 4;
    var n = 0;
    if (horiz) {
      for (var y = R.y0; y <= R.y1; y += step) {
        for (var x = R.x0; x <= R.x1 - 1; x += 2) {
          add(rnd() < 0.78 ? kinds[0] : kinds[1 % kinds.length], x, y, 0);
          n++;
        }
      }
    } else {
      for (var x2 = R.x0; x2 <= R.x1; x2 += step) {
        for (var y2 = R.y0; y2 <= R.y1 - 1; y2 += 2) {
          add(rnd() < 0.78 ? kinds[0] : kinds[1 % kinds.length], x2, y2, 1);
          n++;
        }
      }
    }
    /* loose pallets in the gangways */
    for (var i = 0; i < 3; i++) {
      add(kinds[kinds.length - 1], R.x0 + Math.floor(rnd() * (R.x1 - R.x0 + 1)),
          R.y0 + Math.floor(rnd() * (R.y1 - R.y0 + 1)), 0);
    }
  };

  /* Everything with its back to a wall, which is where furniture goes in
     a room somebody lived in. */
  LAYOUT.perimeter = function (R, add, rnd, kinds) {
    var walls = [];
    var x, y;
    for (x = R.x0; x <= R.x1; x++) { walls.push([x, R.y0, 0]); walls.push([x, R.y1, 0]); }
    for (y = R.y0; y <= R.y1; y++) { walls.push([R.x0, y, 1]); walls.push([R.x1, y, 1]); }
    /* shuffle, deterministically */
    for (var i = walls.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = walls[i]; walls[i] = walls[j]; walls[j] = tmp;
    }
    var want = Math.max(2, Math.round(walls.length * 0.16));
    for (var w = 0; w < walls.length && want > 0; w++) {
      var k = kinds[Math.floor(rnd() * kinds.length)];
      if (add(k, walls[w][0], walls[w][1], walls[w][2])) want--;
    }
  };

  /* A run of counters along one wall, with the room left open in front of
     it - a kitchen, a ticket hall, a gun shop. */
  LAYOUT.counterRun = function (R, add, rnd, kinds) {
    var side = Math.floor(rnd() * 4);
    var x, y;
    if (side < 2) {
      y = side ? R.y1 : R.y0;
      for (x = R.x0; x <= R.x1; x++) {
        add(kinds[Math.min(kinds.length - 1, x % kinds.length === 0 ? 0
              : Math.floor(rnd() * kinds.length))], x, y, 0);
      }
    } else {
      x = side === 3 ? R.x1 : R.x0;
      for (y = R.y0; y <= R.y1; y++) {
        add(kinds[Math.floor(rnd() * kinds.length)], x, y, 1);
      }
    }
    /* and a table or two out in the floor */
    for (var i = 1; i < kinds.length; i++) {
      add(kinds[i], R.x0 + 1 + Math.floor(rnd() * Math.max(1, R.x1 - R.x0 - 1)),
          R.y0 + 1 + Math.floor(rnd() * Math.max(1, R.y1 - R.y0 - 1)), 0);
    }
  };

  /* Beds with their heads to a wall and something beside each one. */
  LAYOUT.beds = function (R, add, rnd, kinds) {
    var bed = kinds[0], side = kinds[1], extra = kinds[2];
    var horiz = (R.x1 - R.x0) > (R.y1 - R.y0);
    var placed = 0;
    if (horiz) {
      for (var x = R.x0; x <= R.x1 - 1; x += 3) {
        if (add(bed, x, R.y0 + 1, 0)) { placed++; if (side) add(side, x + 1, R.y0, 0); }
        if (R.y1 - R.y0 >= 4 && add(bed, x, R.y1 - 1, 0)) {
          placed++; if (side) add(side, x + 1, R.y1, 0);
        }
      }
    } else {
      for (var y = R.y0; y <= R.y1 - 1; y += 3) {
        if (add(bed, R.x0 + 1, y, 1)) { placed++; if (side) add(side, R.x0, y + 1, 1); }
        if (R.x1 - R.x0 >= 4 && add(bed, R.x1 - 1, y, 1)) {
          placed++; if (side) add(side, R.x1, y + 1, 1);
        }
      }
    }
    if (!placed) add(bed, R.x0, R.y0, 0);
    if (extra) add(extra, R.x1, R.y1, 0);
  };

  LAYOUT.desks = function (R, add, rnd, kinds) {
    for (var y = R.y0; y <= R.y1; y += 2) {
      for (var x = R.x0; x <= R.x1 - 1; x += 3) {
        if (add(kinds[0], x, y, 0) && kinds[1]) add(kinds[1], x, y + 1, 0);
      }
    }
    for (var i = 2; i < kinds.length; i++) {
      add(kinds[i], R.x1, R.y0 + Math.floor(rnd() * (R.y1 - R.y0 + 1)), 1);
    }
  };

  LAYOUT.tables = function (R, add, rnd, kinds) {
    for (var y = R.y0; y <= R.y1; y += 3) {
      for (var x = R.x0; x <= R.x1; x += 3) {
        if (rnd() < 0.15) continue;
        if (!add(kinds[0], x, y, 0)) continue;
        /* chairs round it, some knocked over */
        if (kinds[1]) {
          if (rnd() > 0.25) add(kinds[1], x - 1, y, 0, rnd() < 0.3);
          if (rnd() > 0.25) add(kinds[1], x + 1, y, 0, rnd() < 0.3);
          if (rnd() > 0.45) add(kinds[1], x, y + 1, 0, rnd() < 0.3);
        }
      }
    }
    for (var i = 2; i < kinds.length; i++) add(kinds[i], R.x0, R.y1, 0);
  };

  LAYOUT.benchRows = function (R, add, rnd, kinds) {
    for (var y = R.y0 + 1; y <= R.y1; y += 2) {
      for (var x = R.x0; x <= R.x1 - 1; x += 2) add(kinds[0], x, y, 0);
    }
    for (var i = 1; i < kinds.length; i++) {
      add(kinds[i], R.x0 + Math.floor(rnd() * (R.x1 - R.x0 + 1)), R.y0, 0);
    }
  };

  LAYOUT.pews = function (R, add, rnd, kinds) {
    for (var y = R.y0 + 2; y <= R.y1; y += 2) {
      add(kinds[0], R.x0 + 1, y, 0);
      if (R.x1 - R.x0 > 4) add(kinds[0], R.x1 - 1, y, 0);
    }
    if (kinds[1]) add(kinds[1], Math.round((R.x0 + R.x1) / 2), R.y0, 0);
  };

  /* Tills in a row across the way out, which is what a checkout is. */
  LAYOUT.checkouts = function (R, add, rnd, kinds) {
    var horiz = (R.x1 - R.x0) >= (R.y1 - R.y0);
    if (horiz) {
      for (var x = R.x0 + 1; x <= R.x1; x += 2) add(kinds[0], x, R.y1 - 1, 0);
    } else {
      for (var y = R.y0 + 1; y <= R.y1; y += 2) add(kinds[0], R.x1 - 1, y, 1);
    }
    for (var i = 0; i < 4; i++) {
      add(kinds[1] || kinds[0], R.x0 + Math.floor(rnd() * (R.x1 - R.x0 + 1)),
          R.y0 + Math.floor(rnd() * (R.y1 - R.y0 + 1)), Math.floor(rnd() * 2));
    }
  };

  /* Cubicles along a wall: fitting rooms, cells, lavatories. */
  LAYOUT.stalls = function (R, add, rnd, kinds) {
    for (var x = R.x0; x <= R.x1; x += 2) {
      add(kinds[0], x, R.y0, 0);
      if (kinds[1] && R.y1 > R.y0 + 1) add(kinds[1], x, R.y1, 0);
    }
  };

  /* One thing in the middle that the room exists for, and the rest round
     the edge - an operating theatre, a boardroom, an appliance bay. */
  LAYOUT.centre = function (R, add, rnd, kinds) {
    var cx = Math.round((R.x0 + R.x1) / 2), cy = Math.round((R.y0 + R.y1) / 2);
    add(kinds[0], cx, cy, (R.x1 - R.x0) < (R.y1 - R.y0) ? 0 : 1);
    if (kinds[1]) add(kinds[1], cx, cy - 1, 0);
    for (var i = 2; i < kinds.length; i++) {
      add(kinds[i], i % 2 ? R.x0 : R.x1,
          R.y0 + Math.floor(rnd() * (R.y1 - R.y0 + 1)), 1);
    }
  };

  LAYOUT.corridor = function (R, add, rnd, kinds) {
    var horiz = (R.x1 - R.x0) >= (R.y1 - R.y0);
    var n = Math.max(1, Math.round((horiz ? R.x1 - R.x0 : R.y1 - R.y0) * 0.22));
    for (var i = 0; i < n; i++) {
      var k = kinds[Math.floor(rnd() * kinds.length)];
      if (horiz) add(k, R.x0 + Math.floor(rnd() * (R.x1 - R.x0 + 1)),
                     rnd() < 0.5 ? R.y0 : R.y1, 0);
      else add(k, rnd() < 0.5 ? R.x0 : R.x1,
               R.y0 + Math.floor(rnd() * (R.y1 - R.y0 + 1)), 1);
    }
  };

  LAYOUT.stair = function (R, add, rnd, kinds) {
    add(kinds[0], Math.round((R.x0 + R.x1) / 2), Math.round((R.y0 + R.y1) / 2), 0);
  };

  /* Cars nose to tail in bays, for a parking deck. */
  LAYOUT.parking = function (R, add, rnd, kinds) {
    for (var x = R.x0; x <= R.x1; x += 2) {
      if (rnd() < 0.45) continue;
      add(kinds[0], x, R.y0 + 2, 0);
      if (R.y1 - R.y0 > 6 && rnd() > 0.4) add(kinds[0], x, R.y1 - 2, 0);
    }
  };

  LAYOUT.scatter = function (R, add, rnd, kinds) {
    var area = (R.x1 - R.x0 + 1) * (R.y1 - R.y0 + 1);
    var want = Math.max(2, Math.round(area * 0.14));
    var guard = 0;
    while (want > 0 && guard++ < area * 4) {
      var k = kinds[Math.floor(rnd() * kinds.length)];
      /* things still prefer a wall, the way they do in a real room */
      var hug = rnd() < 0.62;
      var x = hug && rnd() < 0.5 ? (rnd() < 0.5 ? R.x0 : R.x1)
                                 : R.x0 + Math.floor(rnd() * (R.x1 - R.x0 + 1));
      var y = hug && rnd() < 0.5 ? (rnd() < 0.5 ? R.y0 : R.y1)
                                 : R.y0 + Math.floor(rnd() * (R.y1 - R.y0 + 1));
      if (add(k, x, y, Math.floor(rnd() * 2))) want--;
    }
  };

  /* ------------------------------------------------------------------ *
   * Building the room
   * ------------------------------------------------------------------ */
  function build(prop) {
    var def = prop.def;
    var B = def.building;
    var program = (B && B.rooms) || ['generic'];
    var rnd = Z.rng((Math.round(prop.v * 1e6) ^ (prop.pid * 2654435761)) >>> 0);

    /* Inside is bigger than the footprint - a house exactly as big inside
       as its roof is a cupboard - but not without limit, or a hospital
       becomes a field. */
    var w = Z.clamp(Math.round(def.fw * 2.3), 9, 34);
    var h = Z.clamp(Math.round(def.fh * 2.3), 8, 26);

    var t = new Uint8Array(w * h);
    var x, y, i;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        t[y * w + x] = (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? WALL : FLOOR;
      }
    }

    /* the way out, in the south wall */
    var ex = 1 + Math.floor(rnd() * (w - 2));
    t[(h - 1) * w + ex] = FLOOR;
    var exit = { x: ex + 0.5, y: h - 0.5 };

    /* the plan */
    var leaves = [], doors = [];
    var want = Math.min(program.length, Math.max(1, Math.floor((w - 2) * (h - 2) / 18)));
    subdivide(t, w, { x0: 1, y0: 1, x1: w - 2, y1: h - 2 }, want, rnd, leaves, doors);

    /* The tile behind the door is always open. A partition is allowed to
       run along the row just inside the south wall, and when it did it
       sealed the doorway off from its own room. */
    t[(h - 2) * w + ex] = FLOOR;
    connect(t, w, h, ex, h - 1);

    /* ---- roles ----
       The leaf the front door opens into gets the public room; the rest
       are handed out biggest first to whichever role wants the most
       space. That is what keeps the operating theatre off the street and
       the shop floor on it. */
    var roles = program.slice();
    var front = null;
    for (i = 0; i < leaves.length; i++) {
      var L = leaves[i];
      if (ex >= L.x0 - 1 && ex <= L.x1 + 1 && L.y1 >= h - 3) { front = L; break; }
    }
    if (!front) front = leaves[leaves.length - 1];
    front.role = roles.shift();

    var rest = leaves.filter(function (L) { return L !== front; });
    rest.sort(function (a, b) {
      return ((b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1)) - ((a.x1 - a.x0 + 1) * (a.y1 - a.y0 + 1));
    });
    roles.sort(function (a, b) {
      return ((Z.ROOMS[b] || Z.ROOMS.generic).min || 4) - ((Z.ROOMS[a] || Z.ROOMS.generic).min || 4);
    });
    for (i = 0; i < rest.length; i++) {
      rest[i].role = roles[i] || program[program.length - 1] || 'generic';
    }
    leaves.forEach(function (L) { L.def = Z.ROOMS[L.role] || Z.ROOMS.generic; });

    /* which room every tile belongs to, for floor materials and for
       telling the player what they are standing in */
    var owner = new Int8Array(w * h).fill(-1);
    leaves.forEach(function (L, n) {
      for (var yy = L.y0; yy <= L.y1; yy++) {
        for (var xx = L.x0; xx <= L.x1; xx++) owner[yy * w + xx] = n;
      }
    });

    /* ---- furniture ---- */
    var items = [];
    var occ = new Uint8Array(w * h);
    /* The threshold, the way in from it, and both sides of every internal
       door are reserved before a single thing is placed.

       This is the cheap half of keeping the place walkable, and it does
       most of the work: the repair pass that runs afterwards used to tip
       nearly half the furniture in the building over, because almost every
       room had something parked in its doorway to begin with. */
    occ[(h - 1) * w + ex] = 1;
    occ[(h - 2) * w + ex] = 1;
    if (h > 3) occ[(h - 3) * w + ex] = 1;
    for (var di = 0; di < doors.length; di++) {
      var dxy = doors[di], dx0 = dxy[0], dy0 = dxy[1];
      occ[dy0 * w + dx0] = 1;
      /* and the tile each side of it, along the way through */
      if (dxy[2]) {
        if (dx0 > 0) occ[dy0 * w + dx0 - 1] = 1;
        if (dx0 < w - 1) occ[dy0 * w + dx0 + 1] = 1;
      } else {
        if (dy0 > 0) occ[(dy0 - 1) * w + dx0] = 1;
        if (dy0 < h - 1) occ[(dy0 + 1) * w + dx0] = 1;
      }
    }

    function add(kind, x, y, rot, tipped) {
      var K = Z.artint.sizeOf(kind);
      if (!K) return false;
      var fw = Math.max(1, Math.round(rot & 1 ? K.d : K.w));
      var fh = Math.max(1, Math.round(rot & 1 ? K.w : K.d));
      var dx, dy;
      for (dy = 0; dy < fh; dy++) {
        for (dx = 0; dx < fw; dx++) {
          var tx = x + dx, ty = y + dy;
          if (tx < 1 || ty < 1 || tx >= w - 1 || ty >= h - 1) return false;
          if (t[ty * w + tx] === WALL || occ[ty * w + tx]) return false;
          /* never in a doorway: a tile with walls either side of it is
             one, and a wardrobe across it seals the room */
          if (isDoorway(t, w, h, tx, ty)) return false;
        }
      }
      for (dy = 0; dy < fh; dy++) {
        for (dx = 0; dx < fw; dx++) occ[(y + dy) * w + (x + dx)] = 1;
      }
      /* Which room this is standing in. The dividing walls belong to
         neither child rectangle, so a door punched through one is floor
         that no room owns - and clamping the index to zero rather than
         checking it read `leaves[-1].role` and threw. */
      var oi = owner[y * w + x];
      var R = (oi >= 0 && leaves[oi] ? Z.ROOMS[leaves[oi].role] : null) || Z.ROOMS.generic;
      var lootable = (R.cont || []).indexOf(kind) >= 0;
      items.push({
        x: x + fw / 2, y: y + fh / 2, kind: kind, rot: rot & 1,
        w: fw, h: fh,
        loot: lootable, table: R.loot || def.loot || 'house',
        done: false, work: 0, v: rnd(),
        tipped: !!tipped || (rnd() < 0.09 && !lootable)
      });
      return true;
    }

    /* A rule that does not fit falls back to one that will. An aisle
       needs three metres to run down, and a pharmacy that happened to be
       cut two metres wide came out as an empty box - which is worse than
       a wrong-looking room, because there is then no reason to walk into
       it at all. */
    leaves.forEach(function (L) {
      var R = L.def;
      var kinds = R.furn && R.furn.length ? R.furn : ['crate'];
      var before = items.length;
      (LAYOUT[R.fill] || LAYOUT.scatter)(L, add, rnd, kinds);
      if (items.length === before) LAYOUT.perimeter(L, add, rnd, kinds);
      if (items.length === before) LAYOUT.scatter(L, add, rnd, kinds);
    });

    /* ---- damage ----
       Debris in the open floor, heaviest in the rooms nobody would have
       tidied. Placed last so it can use whatever space is left. */
    var debris = Math.round((w * h) * 0.012);
    for (i = 0; i < debris; i++) {
      add(rnd() < 0.5 ? 'crate' : 'chair',
          1 + Math.floor(rnd() * (w - 2)), 1 + Math.floor(rnd() * (h - 2)), 0, true);
    }

    /* ---- clear the way ----
       `isDoorway` only refuses a tile with wall on both sides, which is
       not every door: an opening at the end of a partition has wall on one
       side only, and a wardrobe parked across it sealed a room off with no
       way to tell from the outside. Rather than enumerate the cases, walk
       the room the way the player will - over floor that no solid piece of
       furniture is standing on - and pull out whatever is corking a room
       that cannot otherwise be reached. */
    unblock({ w: w, h: h, tiles: t, items: items, exit: exit });

    /* ---- the guarantee ----
       A building with nothing to open in it is a building you walked into
       for no reason, so if the layout happened to produce no container,
       one goes in. */
    var haveLoot = false;
    for (i = 0; i < items.length; i++) if (items[i].loot) { haveLoot = true; break; }
    if (!haveLoot) {
      for (i = 0; i < 60 && !haveLoot; i++) {
        var gx = 1 + Math.floor(rnd() * (w - 2)), gy = 1 + Math.floor(rnd() * (h - 2));
        if (add('crate', gx, gy, 0)) {
          items[items.length - 1].loot = true;
          items[items.length - 1].tipped = false;
          haveLoot = true;
        }
      }
    }

    var room = {
      w: w, h: h, tiles: t, items: items, exit: exit, rooms: leaves, owner: owner,
      prop: prop, kind: def.loot || 'house', name: def.name,
      zone: Z.city && Z.city.zoneAt ? Z.city.zoneAt(prop.x, prop.y) : 0,
      risk: Z.city && Z.city.riskAt ? Z.city.riskAt(prop.x, prop.y) : 1,
      lit: 0.34 + rnd() * 0.2,
      rnd: rnd
    };
    return room;
  }

  /* Walk the room the way the player will - over floor that no solid
     piece of furniture is standing on - and shove aside whatever is
     corking it.

     Two things have to hold when this returns: every room can be walked
     into from the front door, and every container can be stood next to.
     Neither is guaranteed by placement alone. `isDoorway` refuses a tile
     with wall on both sides, which is not every door - an opening at the
     end of a partition has wall on one side only, and a wardrobe parked
     across it sealed a room off with no way to tell from outside.

     A cork is tipped over rather than deleted: the room keeps its
     furniture, and a chair on its side in a doorway tells the same story
     as the room having been ransacked. Tipped furniture is not solid, so
     one pass of tipping opens one layer; the loop runs until nothing is
     left stranded, which also handles a doorway blocked two deep. */
  function unblock(r) {
    var w = r.w, h = r.h, t = r.tiles, items = r.items;
    var nb = [-1, 1, -w, w];
    var i, j, k, m, dx, dy;

    function ortho(j2, k2) {
      var m2 = j2 + nb[k2];
      if (m2 < 0 || m2 >= w * h) return -1;
      /* do not wrap round the row ends */
      if (k2 < 2 && Math.floor(m2 / w) !== Math.floor(j2 / w)) return -1;
      return m2;
    }

    for (var pass = 0; pass < 14; pass++) {
      /* where the solid furniture is, and which piece owns each tile */
      var solid = new Uint8Array(w * h);
      var own = new Int16Array(w * h);
      for (i = 0; i < own.length; i++) own[i] = -1;
      var boxes = [];
      for (i = 0; i < items.length; i++) {
        var it = items[i];
        var K = Z.artint.sizeOf(it.kind);
        var fw = it.w || 1, fh = it.h || 1;
        var x0 = Math.round(it.x - fw / 2), y0 = Math.round(it.y - fh / 2);
        boxes.push([x0, y0, fw, fh]);
        if (!K.solid || it.tipped) continue;
        for (dy = 0; dy < fh; dy++) {
          for (dx = 0; dx < fw; dx++) {
            var tx = x0 + dx, ty = y0 + dy;
            if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
            solid[ty * w + tx] = 1;
            own[ty * w + tx] = i;
          }
        }
      }

      /* flood from the threshold over standable floor */
      var seen = new Uint8Array(w * h);
      var start = (h - 1) * w + Math.floor(r.exit.x);
      var q = [start];
      seen[start] = 1;
      while (q.length) {
        i = q.pop();
        for (k = 0; k < 4; k++) {
          j = ortho(i, k);
          if (j < 0 || seen[j] || t[j] === WALL || solid[j]) continue;
          seen[j] = 1;
          q.push(j);
        }
      }

      /* what is still cut off: stranded floor, and containers you could
         never stand beside */
      var stranded = false;
      for (j = 0; j < w * h; j++) {
        if (t[j] === WALL || seen[j] || solid[j]) continue;
        stranded = true; break;
      }
      var starved = [];
      for (i = 0; i < items.length; i++) {
        if (!items[i].loot || items[i].tipped) continue;
        var bx = boxes[i], reach = false;
        for (dy = -1; dy <= bx[3] && !reach; dy++) {
          for (dx = -1; dx <= bx[2]; dx++) {
            var nx = bx[0] + dx, ny = bx[1] + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (seen[ny * w + nx]) { reach = true; break; }
          }
        }
        if (!reach) starved.push(i);
      }
      if (!stranded && !starved.length) return;

      /* Which furniture is actually in the way.

         Tipping everything on the frontier between reached and unreached
         flattened three rooms in five - a run of shelving is one long
         frontier and almost none of it is blocking anything. Instead the
         solid furniture is grouped into touching clusters, and only a
         cluster with reachable floor on one side and stranded floor on
         the other is a plug. Of that cluster only the pieces facing the
         player are tipped, so a door blocked two deep opens over two
         passes and the shelves behind it stay standing. */
      var cluster = new Int16Array(w * h);
      for (j = 0; j < w * h; j++) cluster[j] = -1;
      var nClusters = 0, cin = [], cout = [];
      for (j = 0; j < w * h; j++) {
        if (!solid[j] || cluster[j] >= 0) continue;
        var cid = nClusters++;
        cin[cid] = false; cout[cid] = false;
        var cq = [j];
        cluster[j] = cid;
        while (cq.length) {
          var ci = cq.pop();
          for (k = 0; k < 4; k++) {
            m = ortho(ci, k);
            if (m < 0) continue;
            if (solid[m]) {
              if (cluster[m] < 0) { cluster[m] = cid; cq.push(m); }
            } else if (t[m] !== WALL) {
              if (seen[m]) cin[cid] = true; else cout[cid] = true;
            }
          }
        }
      }

      var pull = {};
      for (j = 0; j < w * h; j++) {
        if (!solid[j] || own[j] < 0) continue;
        var cid2 = cluster[j];
        if (cid2 < 0 || !cin[cid2] || !cout[cid2]) continue;
        /* only the face of the plug the player can actually reach */
        for (k = 0; k < 4; k++) {
          m = ortho(j, k);
          if (m >= 0 && seen[m]) { pull[own[j]] = 1; break; }
        }
      }
      /* a container nobody can get to gets its own neighbours moved, and
         failing that gets tipped itself */
      for (i = 0; i < starved.length; i++) {
        var si = starved[i], sb = boxes[si], freed = false;
        for (dy = -1; dy <= sb[3]; dy++) {
          for (dx = -1; dx <= sb[2]; dx++) {
            var ax = sb[0] + dx, ay = sb[1] + dy;
            if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;
            var o = own[ay * w + ax];
            if (o >= 0 && o !== si) { pull[o] = 1; freed = true; }
          }
        }
        if (!freed) pull[si] = 1;
      }

      var any = false;
      for (var key in pull) { any = true; items[key].tipped = true; }
      if (!any) return;
    }
  }

  /* A tile flanked by wall on both sides is a doorway, and nothing may
     stand in it. */
  function isDoorway(t, w, h, x, y) {
    var horiz = t[y * w + x - 1] === WALL && t[y * w + x + 1] === WALL;
    var vert = t[(y - 1) * w + x] === WALL && t[(y + 1) * w + x] === WALL;
    return horiz || vert;
  }

  /* Flood from the doorway; anything unreached gets a hole knocked in it.

     Iterative, and bounded. The first version re-entered itself after
     every hole it punched, and a hole that happened to land on a tile
     which was already floor connected nothing, so it recursed until the
     stack gave out. */
  function connect(t, w, h, sx, sy) {
    var n = [-1, 1, -w, w];
    for (var pass = 0; pass < 24; pass++) {
      var seen = new Uint8Array(w * h);
      var q = [sy * w + sx];
      seen[sy * w + sx] = 1;
      while (q.length) {
        var i = q.pop();
        for (var k = 0; k < 4; k++) {
          var j = i + n[k];
          if (j < 0 || j >= w * h) continue;
          if ((n[k] === -1 || n[k] === 1) &&
              Math.floor(j / w) !== Math.floor(i / w)) continue;
          if (seen[j] || t[j] === WALL) continue;
          seen[j] = 1;
          q.push(j);
        }
      }

      var fixed = false;
      for (var y = 1; y < h - 1 && !fixed; y++) {
        for (var x = 1; x < w - 1 && !fixed; x++) {
          if (t[y * w + x] !== FLOOR || seen[y * w + x]) continue;
          for (var r = 1; r < Math.max(w, h) && !fixed; r++) {
            var dirs = [[-r, 0], [r, 0], [0, -r], [0, r]];
            for (var d = 0; d < 4; d++) {
              var tx = x + dirs[d][0], ty = y + dirs[d][1];
              if (tx < 1 || ty < 1 || tx >= w - 1 || ty >= h - 1) continue;
              if (!seen[ty * w + tx]) continue;
              var bx = x + Math.sign(dirs[d][0]), by = y + Math.sign(dirs[d][1]);
              if (t[by * w + bx] === WALL) { t[by * w + bx] = FLOOR; fixed = true; break; }
              var cx = bx + Math.sign(dirs[d][0]), cy = by + Math.sign(dirs[d][1]);
              if (cx > 0 && cy > 0 && cx < w - 1 && cy < h - 1 &&
                  t[cy * w + cx] === WALL) {
                t[cy * w + cx] = FLOOR; fixed = true; break;
              }
            }
          }
        }
      }
      if (!fixed) return;
    }
  }

  /* ------------------------------------------------------------------ *
   * What is still in there
   *
   * The risk half of risk and reward. A hospital in the middle of town is
   * worth crossing the map for and it is full; a bungalow in the suburbs
   * has one in the kitchen. Cleared buildings stay cleared for as long as
   * the session lasts, so a good building is worth taking once rather
   * than farming.
   * ------------------------------------------------------------------ */
  function populate(room) {
    var prop = room.prop;
    if (prop.cleared) return;
    var S = Z.sim;
    if (!S || !S.spawnZombie) return;

    var area = (room.w - 2) * (room.h - 2);
    var n = Math.round((0.4 + room.risk * 1.1) * (0.6 + area / 90));
    n = Z.clamp(n, 0, 11);
    if (!n) return;

    var wave = Math.max(1, (Z.S && Z.S.wave ? Z.S.wave : 1) - 1);
    var guard = 0;
    room.zoms = [];
    while (room.zoms.length < n && guard++ < n * 30) {
      var x = 1 + Math.floor(room.rnd() * (room.w - 2)) + 0.5;
      var y = 1 + Math.floor(room.rnd() * (room.h - 2)) + 0.5;
      /* never right on top of the door */
      if (Z.dist(x, y, room.exit.x, room.exit.y) < 3.5) continue;
      if (!I.walkableRaw(room, x, y)) continue;
      var t = S.pickType ? S.pickType(wave) : Z.ZTYPES.shambler;
      var z = S.spawnZombie(t, x, y, wave);
      z.indoor = true;
      room.zoms.push(z);
    }
  }

  /* Take the indoor ones back out of the world when you leave, and note
     whether the place is cleared. */
  function depopulate(room) {
    var S = Z.sim;
    if (!S || !room) return;
    var left = 0, i;
    for (i = S.zombies.length - 1; i >= 0; i--) {
      if (!S.zombies[i].indoor) continue;
      if (!S.zombies[i].dying) left++;
      S.zombies.splice(i, 1);
    }
    /* and the bodies, which are in room coordinates and would otherwise
       reappear lying in a field somewhere */
    for (i = S.corpses.length - 1; i >= 0; i--) {
      if (S.corpses[i].indoor) S.corpses.splice(i, 1);
    }
    if (!left && room.prop) room.prop.cleared = true;
  }

  /* ------------------------------------------------------------------ *
   * Coming and going
   * ------------------------------------------------------------------ */
  I.canEnter = function (prop) {
    return !!(prop && prop.def && prop.def.enter && !prop.gone);
  };

  I.enter = function (prop) {
    if (!I.canEnter(prop) || I.room) return false;
    var p = Z.sim.p;
    if (!p) return false;

    I.from = { x: p.x, y: p.y, face: p.face, camZ: Z.cam.z };
    I.room = build(prop);
    Z.sim.cancelTask();

    p.x = I.room.exit.x;
    p.y = I.room.exit.y - 0.9;
    p.vx = p.vy = 0;
    p.face = -Math.PI / 2;
    p.manualAim = false;

    populate(I.room);

    Z.cam.follow = true;
    Z.cam.centerOn(p.x, p.y, true);
    Z.cam.zt = Z.cam.z = 54;
    document.body.classList.add('indoors');
    Z.ui.setMode(null);
    var zn = I.room.zoms ? I.room.zoms.length : 0;
    Z.ui.banner(prop.def.name.toUpperCase(),
                zn ? 'Something is still in here. The door is behind you.'
                   : 'Search it. The door is behind you.');
    Z.sfx.play('tick');
    return true;
  };

  I.leave = function () {
    if (!I.room) return false;
    var p = Z.sim.p;
    depopulate(I.room);
    I.room = null;
    if (p && I.from) {
      p.x = I.from.x; p.y = I.from.y;
      p.vx = p.vy = 0;
      p.face = I.from.face;
      Z.cam.zt = Z.cam.z = I.from.camZ;
    }
    I.from = null;
    Z.cam.follow = true;
    if (p) Z.cam.centerOn(p.x, p.y, true);
    document.body.classList.remove('indoors');
    Z.render.invalidateAll();
    Z.sfx.play('tick');
    return true;
  };

  /* ------------------------------------------------------------------ *
   * Collision
   * ------------------------------------------------------------------ */
  I.walkableRaw = function (r, x, y) {
    var tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= r.w || ty >= r.h) return false;
    if (r.tiles[ty * r.w + tx] === WALL) return false;
    for (var i = 0; i < r.items.length; i++) {
      var it = r.items[i];
      var K = Z.artint.sizeOf(it.kind);
      if (!K.solid || it.tipped) continue;
      var hw = (it.w || 1) / 2, hh = (it.h || 1) / 2;
      if (Math.abs(x - it.x) < hw && Math.abs(y - it.y) < hh) return false;
    }
    return true;
  };

  I.walkable = function (x, y) {
    return I.room ? I.walkableRaw(I.room, x, y) : false;
  };

  /* Which room the point is in, by name - the HUD says it. */
  I.roomAt = function (x, y) {
    var r = I.room;
    if (!r) return null;
    var tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= r.w || ty >= r.h) return null;
    var n = r.owner[ty * r.w + tx];
    return n >= 0 ? r.rooms[n] : null;
  };

  /* What you are standing next to, for the prompt and for searching. */
  I.nearest = function (x, y) {
    var r = I.room;
    if (!r) return null;
    var best = null, bd = 1.5;
    for (var i = 0; i < r.items.length; i++) {
      var it = r.items[i];
      if (!it.loot || it.done) continue;
      var d = Z.dist(x, y, it.x, it.y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  };

  I.atExit = function (x, y) {
    var r = I.room;
    return !!r && Z.dist(x, y, r.exit.x, r.exit.y) < 1.2;
  };

  /* ------------------------------------------------------------------ *
   * Searching
   * ------------------------------------------------------------------ */
  I.step = function (dt) {
    var r = I.room;
    if (!r) return;
    var p = Z.sim.p;
    if (!p || p.dead) return;

    var it = I.nearest(p.x, p.y);
    I.focus = it;
    if (!it || !I.searching) return;

    var st = Z.curStats();
    it.work += dt * st.gather;
    p.workT = 0.15;
    if (!p.manualAim) p.face = Math.atan2(it.y - p.y, it.x - p.x);
    if (Math.random() < dt * 5) {
      Z.fx.burst(it.x, it.y - 0.2, 1, '186,164,120', 1.4);
    }
    if (it.work >= 2.2) {
      it.done = true;
      it.work = 0;
      I.searching = false;
      payout(r, it);
    }
  };

  /* What a container gives up. The table comes from the room it stands
     in, not from the building, which is why the pharmacy counter in a
     supermarket pays out medicine and the aisle beside it pays out food.
     The zone multiplies it: the same shelf downtown is worth more than
     the same shelf in the suburbs, and that is the reward half of the
     bargain the city is offering. */
  function payout(room, it) {
    var tbl = Z.LOOT && Z.LOOT[it.table];
    if (!tbl) tbl = Z.LOOT[room.kind] || Z.LOOT.house;
    var mult = 0.75 + Z.clamp(room.risk, 0.4, 2.2) * 0.4;
    var got = {};
    var rolls = tbl.rolls;
    var n = 1 + Math.floor(Math.random() * 2);
    for (var i = 0; i < n; i++) {
      var r = rolls[Math.floor(Math.random() * rolls.length)];
      var amt = Math.round((r[1] + Math.random() * (r[2] - r[1])) * mult);
      if (amt > 0) got[r[0]] = (got[r[0]] || 0) + amt;
    }
    for (var k in got) Z.sim.give(k, got[k]);
    Z.fx.ring(it.x, it.y, 0.5, '227,166,63', 0.4);
    Z.sfx.play('loot');
    Z.ui.lootToast('Searched', got);
    Z.sim.addXp(2);
  }

  I.searching = false;
  I.focus = null;

  I.beginSearch = function () {
    if (!I.room) return false;
    var p = Z.sim.p;
    if (I.atExit(p.x, p.y)) { I.leave(); return true; }
    if (!I.nearest(p.x, p.y)) return false;
    I.searching = true;
    return true;
  };
  I.endSearch = function () { I.searching = false; };

})(window.Z);
