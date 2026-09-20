/* Deadzone - building.

   Build Mode is a state of the ordinary game, not a scene. The world keeps
   running underneath it: the survivor still walks, turrets still fire,
   zombies still come. All that changes is that a translucent structure
   follows the cursor and the ground says yes or no.

   Placement is free-form. There are no pads and no slots - the terrain
   decides, and the compound grows outward from what you have already put
   down, which is what makes clearing forest feel like it bought you
   something. */
(function (Z) {
  'use strict';

  var B = Z.build = {
    ghost: null,          /* {def, x, y, rot, ok, reason} */
    dragging: false,
    lastPlaced: null
  };

  /* How far from an existing structure you may build. Anything further is
     out of the compound, and the ghost says so. */
  B.REACH = 7.5;

  B.bpCost = function (def) {
    if (!def.unlock) return 0;
    var mat = 0;
    for (var k in def.cost) mat += def.cost[k] * (k === 'coin' ? 0.4 : 4);
    return Math.ceil(180 * Math.pow(1.34, def.unlock) + mat);
  };

  B.owned = function (id) {
    var def = Z.BUILDING[id];
    if (!def) return false;
    if (!def.unlock) return true;
    return !!(Z.S.bp && Z.S.bp[id]);
  };

  B.locked = function (id) {
    var def = Z.BUILDING[id];
    if (!def) return 'Unknown';
    if (Z.S.level < def.unlock) return 'Level ' + def.unlock;
    if (!B.owned(id)) return 'Blueprint';
    return null;
  };

  B.unlock = function (id) {
    var def = Z.BUILDING[id];
    if (!def || B.owned(id)) return false;
    if (Z.S.level < def.unlock) return false;
    var cost = B.bpCost(def);
    if (!Z.sim.spend({ coin: cost })) return false;
    Z.S.bp[id] = 1;
    Z.sfx.play('unlock');
    Z.ui.toast(def.name + ' unlocked', 'Added to the build menu');
    Z.S.dirty = true;
    return true;
  };

  /* ------------------------------------------------------------------ *
   * Mode
   * ------------------------------------------------------------------ */
  B.active = function () { return !!B.ghost; };

  B.select = function (id) {
    var def = Z.BUILDING[id];
    if (!def) return;
    if (B.ghost && B.ghost.def.id === id) { B.cancel(); return; }
    var why = B.locked(id);
    if (why) {
      Z.ui.toast(def.name + ' is locked', why === 'Blueprint'
        ? 'Buy the blueprint in the build menu' : 'Reach ' + why);
      return;
    }
    /* The rotation carries over from the last thing you placed. Laying a
       run of wall along one edge and then starting the next piece square
       again is the kind of small betrayal that makes a builder feel
       fiddly. */
    B.ghost = { def: def, x: Z.sim.p.x, y: Z.sim.p.y, rot: B.lastRot | 0,
                ok: false, reason: '' };
    Z.ui.setMode('build');
    Z.sfx.play('tick');
  };

  B.cancel = function () {
    if (!B.ghost) return;
    B.ghost = null;
    B.dragging = false;
    Z.ui.setMode(null);
  };

  /* Snap so an even footprint straddles a tile boundary and an odd one
     sits on a tile centre. Without this, 2x2 structures jitter. */
  function snap(v, size) {
    return size % 2 === 0 ? Math.round(v) : Math.floor(v) + 0.5;
  }

  B.update = function (wx, wy) {
    var g = B.ghost;
    if (!g) return;
    g.x = snap(wx, Z.fpw(g.def, g.rot));
    g.y = snap(wy, Z.fph(g.def, g.rot));
    g.mask = Z.sim.maskAt(g.def, g.x, g.y, g.rot);
    var v = B.validate(g.def, g.x, g.y, g.rot);
    g.ok = v.ok;
    g.reason = v.reason;
  };

  /* A quarter turn, about the piece rather than about the cursor, so the
     thing under your pointer stays under your pointer. */
  B.rotate = function (dir) {
    var g = B.ghost;
    if (!g) return false;
    var square = g.def.w === g.def.h;
    g.rot = (g.rot + (dir < 0 ? 3 : 1)) & 3;
    B.lastRot = g.rot;
    /* re-snap: an even footprint straddles a boundary, an odd one centres
       on a tile, and turning a 3x2 changes which rule applies on each axis */
    B.update(g.x, g.y);
    Z.sfx.play('tick');
    /* Said once, not every time you press the key. A square piece still
       turns - its art does - it just cannot cover different ground. */
    if (square && !saidSquare) {
      saidSquare = true;
      Z.ui.hint('Turned. A square piece covers the same ground either way');
    }
    return true;
  };
  B.lastRot = 0;
  var saidSquare = false;

  /* Every reason a structure cannot go down, in the order the player
     most needs to hear it. */
  B.validate = function (def, x, y, rot) {
    var W = Z.world, T = W.T;
    var fw = Z.fpw(def, rot), fh = Z.fph(def, rot);
    var x0 = Math.round(x - fw / 2), y0 = Math.round(y - fh / 2);
    var dx, dy, tx, ty, i;

    for (dy = 0; dy < fh; dy++) {
      for (dx = 0; dx < fw; dx++) {
        tx = x0 + dx; ty = y0 + dy;
        if (!W.inside(tx, ty)) return { ok: false, reason: 'Off the map' };
        if (!W.seen(tx, ty)) return { ok: false, reason: 'Undiscovered ground' };
        i = W.idx(tx, ty);
        if (W.terrain[i] === T.WATER) return { ok: false, reason: 'Water' };
        var p = W.pgrid[i];
        if (p) return { ok: false, reason: 'Clear the ' + p.def.name.toLowerCase() + ' first' };
        if (!def.floor && W.occ[i]) return { ok: false, reason: 'Something is already here' };
        if (def.floor && W.floor[i]) return { ok: false, reason: 'Already paved' };
      }
    }

    if (def.unique) {
      for (i = 0; i < Z.sim.buildings.length; i++) {
        if (Z.sim.buildings[i].defId === def.id) return { ok: false, reason: 'Only one allowed' };
      }
    }

    /* the compound has to stay joined up */
    if (!withinReach(x, y)) return { ok: false, reason: 'Too far from the compound' };

    var cost = B.costOf(def);
    var miss = Z.sim.missing(cost);
    if (miss.length) {
      return { ok: false, reason: 'Need ' + miss.map(function (k) {
        return Z.fmt(cost[k] - Z.sim.res(k)) + ' ' + Z.RES[k].name.toLowerCase();
      }).join(', ') };
    }
    return { ok: true, reason: '' };
  };

  function withinReach(x, y) {
    var S = Z.sim;
    if (!S.buildings.length) return true;      /* the very first structure */
    for (var i = 0; i < S.buildings.length; i++) {
      var b = S.buildings[i];
      if (b.dead) continue;
      var r = b.def.radius ? b.def.radius : B.REACH;
      var dx = Math.abs(x - b.x) - Z.fpw(b.def, b.rot) / 2;
      var dy = Math.abs(y - b.y) - Z.fph(b.def, b.rot) / 2;
      dx = Math.max(0, dx); dy = Math.max(0, dy);
      if (Math.sqrt(dx * dx + dy * dy) <= r) return true;
    }
    return false;
  }
  B.withinReach = withinReach;

  B.costOf = function (def) {
    /* Repeats of the same structure cost a little more each time, so a
       wall of turrets is a real decision rather than a formality. */
    var n = 0;
    for (var i = 0; i < Z.sim.buildings.length; i++) {
      if (Z.sim.buildings[i].defId === def.id) n++;
    }
    var k = Math.pow(1.055, n) * Z.upCut('bcost', 0.5);
    var out = {};
    for (var r in def.cost) out[r] = Math.max(1, Math.ceil(def.cost[r] * k));
    return out;
  };

  B.place = function () {
    var g = B.ghost;
    if (!g || !g.ok) {
      if (g && g.reason) Z.ui.hint(g.reason);
      Z.sfx.play('deny');
      return false;
    }
    var cost = B.costOf(g.def);
    if (!Z.sim.spend(cost)) { Z.sfx.play('deny'); return false; }

    var b = Z.sim.addBuilding(g.def.id, g.x, g.y, 1, g.rot);
    Z.fx.ring(g.x, g.y, Math.max(g.def.w, g.def.h) * 0.5, '127,164,92', 0.45);
    Z.fx.burst(g.x, g.y, 10, '150,140,120', 2.4);
    Z.cam.quake(1.2);
    Z.sfx.play('build');
    Z.sim.addXp(3 + Math.round((g.def.unlock || 0) * 1.5));
    B.lastPlaced = b;

    if (g.def.floor) Z.render.invalidateChunk(Math.floor(g.x), Math.floor(g.y));

    /* re-validate in place so the ghost immediately shows the new cost */
    B.update(g.x, g.y);
    if (Z.base.isBase()) Z.ui.syncBasePanel();
    return true;
  };

  /* Walls, fences and barricades can be dragged out in a run. */
  B.dragPlace = function (wx, wy) {
    var g = B.ghost;
    if (!g || !g.def.chain) return;
    B.update(wx, wy);
    if (g.ok) B.place();
  };

  /* ------------------------------------------------------------------ *
   * Ghost
   * ------------------------------------------------------------------ */
  B.drawGhost = function (ctx, time) {
    var g = B.ghost;
    if (!g) return;
    var cam = Z.cam, def = g.def;
    var ok = g.ok;
    var col = ok ? '127,164,92' : '210,86,42';

    /* --- footprint on the ground --- */
    var fw = Z.fpw(def, g.rot), fh = Z.fph(def, g.rot);
    var x0 = g.x - fw / 2, y0 = g.y - fh / 2;
    var sx = cam.sx(x0), sy = cam.sy(y0);
    var w = fw * cam.z, h = fh * cam.z * Z.PITCH;
    var pulse = 0.5 + Math.sin(time * 4) * 0.12;

    ctx.fillStyle = 'rgba(' + col + ',' + (0.16 * pulse + 0.10) + ')';
    ctx.fillRect(sx, sy, w, h);
    /* A full rectangle is a box drawn on the grass. Corner brackets are
       what a surveyor leaves: they say the same thing about extent, and
       they leave the ground inside visible so you can see what you are
       about to build on top of. A thin continuous line underneath keeps
       the shape unambiguous where a bracket does not reach. */
    ctx.strokeStyle = 'rgba(' + col + ',.30)';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, w - 1, h - 1);
    var arm = Math.max(7, Math.min(w, h) * 0.30);
    ctx.strokeStyle = 'rgba(' + col + ',' + (0.8 + pulse * 0.2) + ')';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    [[sx, sy, 1, 1], [sx + w, sy, -1, 1],
     [sx, sy + h, 1, -1], [sx + w, sy + h, -1, -1]].forEach(function (k) {
      ctx.beginPath();
      ctx.moveTo(k[0] + k[2] * arm, k[1]);
      ctx.lineTo(k[0], k[1]);
      ctx.lineTo(k[0], k[1] + k[3] * arm);
      ctx.stroke();
    });
    ctx.lineCap = 'butt';

    /* tile grid inside the footprint, so the size is unambiguous */
    ctx.strokeStyle = 'rgba(' + col + ',.28)';
    ctx.lineWidth = 1;
    for (var i = 1; i < fw; i++) {
      var gx = cam.sx(x0 + i);
      ctx.beginPath(); ctx.moveTo(gx, sy); ctx.lineTo(gx, sy + h); ctx.stroke();
    }
    for (var j = 1; j < fh; j++) {
      var gy = cam.sy(y0 + j);
      ctx.beginPath(); ctx.moveTo(sx, gy); ctx.lineTo(sx + w, gy); ctx.stroke();
    }

    /* --- effect radius, when the structure has one ---
       Never green or red: those two colours mean placeable and not, and
       borrowing one of them for the radius makes a perfectly good spot
       look rejected. Each kind of effect gets its own colour instead, and
       a turret's is its own tracer colour. */
    var r = 0, rc = null;
    if (def.gun) { r = def.gun.range; rc = Z.hex(def.gun.color); }
    else if (def.light) { r = def.light * Z.upMul('night'); rc = [227, 166, 63]; }
    else if (def.vision) { r = def.vision; rc = [111, 168, 196]; }
    else if (def.radius) { r = def.radius * Z.upMul('radius'); rc = [228, 224, 214]; }
    if (r) Z.render.rangeRing(g.x, g.y, r, Z.rgba(rc, 0.55), Z.rgba(rc, 0.08));

    /* --- the shadow it would cast, so the sprite reads as standing on
           the footprint rather than floating over it --- */
    var cx = cam.sx(g.x), cy = cam.sy(g.y);
    var sg = ctx.createRadialGradient(cx, cy, 1, cx, cy, Math.max(w, h) * 0.52);
    sg.addColorStop(0, 'rgba(0,0,0,.34)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, Z.PITCH);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(w, h) * 0.52, 0, Z.TAU);
    ctx.fill();
    ctx.restore();

    /* --- the structure itself, as a translucent tinted ghost --- */
    var cv = tinted(def.id, ok, g.rot, g.mask);
    var s = cam.z / (cv._ppm || 58);
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.drawImage(cv, -cv._ox, -cv._oy);
    ctx.restore();

    /* --- what it costs, on the thing you are about to pay for ---
       The price is on the card at the bottom of the screen and your eyes
       are up here on the ground. Put it where you are looking. */
    if (ok) {
      var cost = B.costOf(def);
      var bits = [];
      for (var ck in cost) bits.push([ck, cost[ck]]);
      if (bits.length) {
        ctx.font = '600 11.5px Barlow,system-ui,sans-serif';
        ctx.textAlign = 'left';
        var pad = 7, gapx = 11, iw = 11;
        var cw = pad * 2;
        bits.forEach(function (bt) {
          cw += iw + 3 + ctx.measureText(String(bt[1])).width + gapx;
        });
        cw -= gapx;
        var px = cx - cw / 2, py = cam.sy(y0) - 26;
        ctx.fillStyle = 'rgba(10,13,16,.9)';
        Z.render.roundRect(px, py, cw, 20, 5);
        ctx.fill();
        ctx.strokeStyle = 'rgba(' + col + ',.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        var tx = px + pad;
        bits.forEach(function (bt) {
          var res = Z.RES[bt[0]];
          ctx.fillStyle = (res && res.color) || '#E4E0D6';
          ctx.beginPath();
          ctx.arc(tx + iw / 2, py + 10, 3.6, 0, Z.TAU);
          ctx.fill();
          ctx.fillStyle = Z.sim.res(bt[0]) >= bt[1] ? '#E4E0D6' : '#D2603A';
          ctx.fillText(String(bt[1]), tx + iw + 3, py + 14);
          tx += iw + 3 + ctx.measureText(String(bt[1])).width + gapx;
        });
        ctx.textAlign = 'center';
      }
    }

    /* --- why not --- */
    if (!ok && g.reason) {
      var lx = cam.sx(g.x), ly = cam.sy(g.y) + h * 0.5 + 20;
      ctx.font = '600 12px Barlow,system-ui,sans-serif';
      ctx.textAlign = 'center';
      var tw = ctx.measureText(g.reason).width + 18;
      ctx.fillStyle = 'rgba(10,7,6,.88)';
      Z.render.roundRect(lx - tw / 2, ly - 8, tw, 21, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(210,86,42,.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#E8A98C';
      ctx.fillText(g.reason, lx, ly + 6.5);
    }

    /* --- where the compound currently reaches --- */
    if (!ok && g.reason === 'Too far from the compound') drawReach(ctx);
  };

  /* A tinted copy of the structure's sprite. Tinting the sprite itself
     rather than washing the screen is what keeps the verdict colour on
     the ghost instead of over the whole world. */
  var ghostCache = {};
  function tinted(id, ok, rot, mask) {
    var key = id + (ok ? ':y' : ':n') + ':' + (rot | 0) + ':' + (mask | 0);
    if (ghostCache[key]) return ghostCache[key];
    var src = Z.art.building(id, 1, rot, mask);
    var cv = Z.canvas(src.width, src.height);
    var c = cv.getContext('2d');
    c.drawImage(src, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = ok ? 'rgba(127,164,92,.55)' : 'rgba(210,86,42,.58)';
    c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(src, 0, 0);
    cv._ox = src._ox; cv._oy = src._oy; cv._ppm = src._ppm;
    ghostCache[key] = cv;
    return cv;
  }

  function drawReach(ctx) {
    var S = Z.sim, cam = Z.cam;
    ctx.save();
    ctx.strokeStyle = 'rgba(127,164,92,.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 6]);
    for (var i = 0; i < S.buildings.length; i++) {
      var b = S.buildings[i];
      if (b.dead) continue;
      var r = b.def.radius ? b.def.radius : B.REACH;
      ctx.beginPath();
      ctx.ellipse(cam.sx(b.x), cam.sy(b.y), r * cam.z, r * cam.z * Z.PITCH, 0, 0, Z.TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * First-run compound
   * ------------------------------------------------------------------ */
  B.seedCompound = function () {
    var c = Z.world.CENTER;
    Z.sim.addBuilding('core', c, c, 1);
    Z.sim.addBuilding('generator', c - 3, c + 3, 1);
    Z.sim.addBuilding('campfire', c + 3, c + 3, 1);
    Z.sim.addBuilding('stockpile', c + 3.5, c - 3, 1);
  };

})(window.Z);
