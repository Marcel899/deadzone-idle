/* Deadzone - the simulation.

   One world, one tick. Exploration, clearing, looting, building, defence
   and the idle economy are all states of the same survivor standing on
   the same map, which is the whole point of the redesign: there is no
   combat scene to enter and no base scene to leave.

   Everything here works in metres and seconds. */
(function (Z) {
  'use strict';

  var S = Z.sim = {
    p: null,
    zombies: [], corpses: [], buildings: [], spits: [],
    target: null, sel: null, hover: null,
    wave: 1, waveLeft: 0, waveTotal: 0, waveT: 0, inWave: false, mod: null,
    nextId: 1, nextBid: 1, bIndex: {},
    combo: 0, comboT: 0,
    power: { supply: 0, draw: 0, ratio: 1, stored: 0, cap: 0 },
    cap: 300,
    threat: 0,
    statsDirty: true
  };

  var TAU = Z.TAU;

  /* ------------------------------------------------------------------ *
   * Derived stats
   * ------------------------------------------------------------------ */
  Z.equipOf = function (wid) {
    var e = Z.S.equip[wid] || (Z.S.equip[wid] = {});
    return e;
  };

  Z.coreMult = function () { return 1 + (Z.S.cores || 0) * Z.CORE_BONUS; };

  Z.comboMult = function () {
    return 1 + Math.min(0.75, S.combo * 0.015);
  };

  /* An attachment in a slot the weapon does not have is worse than
     useless: `Z.stats` iterates the WEAPON's slots, so the thing sits in
     the loadout looking fitted and changes nothing at all. That is
     exactly the "equipped but does nothing" case. Fitting goes through
     here now, and anything already stored in a slot its weapon lacks is
     dropped the first time the loadout is read. */
  Z.canFit = function (wid, slot, aid) {
    var w = Z.WEAPON[wid], a = Z.ATTACH[aid];
    if (!w || !a) return false;
    if (a.slot !== slot) return false;
    return (w.slots || []).indexOf(slot) >= 0;
  };

  Z.setAttach = function (wid, slot, aid) {
    if (aid && !Z.canFit(wid, slot, aid)) return false;
    var e = Z.equipOf(wid);
    if (aid) e[slot] = aid; else delete e[slot];
    Z.invalidate();
    Z.S.dirty = true;
    return true;
  };

  /* Drop anything that cannot actually be fitted. Runs on load and on
     any read of a loadout, so a save written before a weapon's slots
     changed cannot keep a ghost attachment alive. */
  Z.cleanEquip = function (wid) {
    var w = Z.WEAPON[wid]; if (!w) return;
    var e = Z.S.equip[wid]; if (!e) return;
    var slots = w.slots || [];
    for (var slot in e) {
      if (slots.indexOf(slot) < 0 || !Z.canFit(wid, slot, e[slot])) delete e[slot];
    }
  };

  Z.stats = function (wid, equip) {
    var w = Z.WEAPON[wid] || Z.WEAPON.pistol;
    var b = w.base;
    var o = {
      dmg: b.dmg, rpm: b.rpm, mag: b.mag, reload: b.reload, range: b.range,
      spread: b.spread, pierce: b.pierce, crit: b.crit, critMult: b.critMult,
      pellets: b.pellets, specials: {}
    };
    var m = { dmg: 1, rpm: 1, reload: 1, range: 1, spread: 1, mag: 1 };
    var flat = { crit: 0, critMult: 0, pierce: 0 };

    equip = equip || {};
    (w.slots || []).forEach(function (slot) {
      var a = Z.ATTACH[equip[slot]];
      if (!a) return;
      var mods = a.mods || {};
      for (var k in mods) {
        if (k === 'critFlat') flat.crit += mods[k];
        else if (k === 'critMultFlat') flat.critMult += mods[k];
        else if (k === 'pierceFlat') flat.pierce += mods[k];
        else if (m[k] != null) m[k] *= (1 + mods[k]);
      }
      if (a.special) o.specials[a.special] = true;
    });

    /* weapon level track */
    var wl = Z.wlvlOf(wid);
    if (wl) {
      var wb = Z.wlvlBonus(wl);
      m.dmg *= wb.dmg; m.rpm *= wb.rpm;
      flat.crit += wb.crit; o.mag += wb.mag;
    }

    /* permanent upgrades */
    var U = Z.S.upg || {};
    var lv = function (id) { return U[id] || 0; };
    m.dmg *= 1 + lv('dmg') * Z.UPGRADE.dmg.step;
    m.rpm *= 1 + lv('rpm') * Z.UPGRADE.rpm.step;
    m.reload *= Math.max(0.28, 1 - lv('reload') * Z.UPGRADE.reload.step);
    m.mag *= 1 + lv('magsz') * Z.UPGRADE.magsz.step;
    flat.crit += lv('crit') * Z.UPGRADE.crit.step;
    flat.critMult += lv('critx') * Z.UPGRADE.critx.step;
    m.spread *= Z.upCut('aimspd', 0.3);
    m.range *= Z.upMul('rangeup');
    flat.pierce += Z.upAdd('pierce');

    var core = Z.coreMult();
    o.dmg = o.dmg * m.dmg * core;
    o.rpm = o.rpm * m.rpm;
    o.mag = Math.max(1, Math.round(o.mag * m.mag));
    o.reload = Math.max(0.25, o.reload * m.reload);
    o.range = o.range * m.range;
    o.spread = Math.max(0, o.spread * m.spread);
    o.crit = Z.clamp01(o.crit + flat.crit);
    o.critMult = o.critMult + flat.critMult;
    o.pierce = Math.max(0, o.pierce + flat.pierce);
    if (o.specials.laser) o.spread = 0;

    /* survivor */
    o.maxHp = 100 + lv('hp') * Z.UPGRADE.hp.step;
    o.regen = lv('regen') * Z.UPGRADE.regen.step;
    o.speed = 3.05 * (1 + lv('speed') * Z.UPGRADE.speed.step);
    o.gather = 1 + lv('carry') * Z.UPGRADE.carry.step;
    /* Survival and Player, read once so the rest of the sim can ask for
       them by name rather than reaching back into the upgrade table. */
    o.dodge = Z.upAdd('dodge');
    o.armor = Z.upCut('armor', 0.5);
    o.bloodArmor = Z.upCut('blood', 0.5);
    o.lifesteal = Z.upAdd('lifest');
    o.xpMult = Z.upMul('xp');
    o.cashMult = (1 + lv('cash') * Z.UPGRADE.cash.step) * core * S.scripMult();
    o.turretMult = (1 + lv('turret') * Z.UPGRADE.turret.step) * core *
                   (o.specials.sentry ? 1.6 : 1);
    o.turretRate = Z.upMul('trate');
    o.turretRange = Z.upMul('trange');
    o.turretCrit = Z.upAdd('tcrit');
    o.offRate = Math.min(0.95, 0.35 + lv('offrate') * Z.UPGRADE.offrate.step);
    o.offCap = (2 + lv('offcap')) * 3600;
    o.dps = o.dmg * o.pellets * (o.rpm / 60) * (1 + o.crit * (o.critMult - 1));
    return o;
  };

  Z.curStats = function () {
    if (S.statsDirty || !S._st) {
      S._st = Z.stats(Z.S.weapon, Z.equipOf(Z.S.weapon));
      S.statsDirty = false;
    }
    return S._st;
  };
  Z.invalidate = function () { S.statsDirty = true; S.dirty = true; };

  /* Dense fog and the like shorten your reach. */
  Z.effRange = function (st) {
    var r = st.range;
    if (S.mod && S.mod.range) r *= S.mod.range;
    if (Z.world.isNight()) r *= 0.84 + S.litAt(S.p ? S.p.x : 0, S.p ? S.p.y : 0) * 0.16;
    return r;
  };

  /* ------------------------------------------------------------------ *
   * Resources
   * ------------------------------------------------------------------ */
  S.res = function (id) { return (Z.S.res && Z.S.res[id]) || 0; };

  S.capOf = function () { return S.cap; };

  S.give = function (id, n) {
    if (!n) return 0;
    var R = Z.S.res;
    var before = R[id] || 0;
    var lim = id === 'coin' ? Infinity : S.cap;
    R[id] = Math.min(lim, before + n);
    Z.S.dirty = true;
    return R[id] - before;
  };

  S.canAfford = function (cost) {
    for (var k in cost) if (S.res(k) < cost[k]) return false;
    return true;
  };
  S.missing = function (cost) {
    var out = [];
    for (var k in cost) if (S.res(k) < cost[k]) out.push(k);
    return out;
  };
  S.spend = function (cost) {
    if (!S.canAfford(cost)) return false;
    for (var k in cost) Z.S.res[k] -= cost[k];
    Z.S.dirty = true;
    return true;
  };

  S.scripMult = function () {
    var m = 1;
    for (var i = 0; i < S.buildings.length; i++) {
      var b = S.buildings[i];
      if (b.dead || !b.powered) continue;
      if (b.def.scripMult) m += b.def.scripMult * Z.bScale(b.lvl);
    }
    return m;
  };

  /* ------------------------------------------------------------------ *
   * Buildings
   * ------------------------------------------------------------------ */
  /* Structures get their own id counter: the occupancy grid is a
     Uint16Array, and sharing a counter with zombies would overflow it in a
     long session. Lookup is a map because walkable() hits it on every
     movement step of every body. */
  S.buildingById = function (id) { return S.bIndex[id] || null; };

  function stampBuilding(b, on) {
    var fw = Z.fpw(b.def, b.rot), fh = Z.fph(b.def, b.rot);
    var x0 = Math.round(b.x - fw / 2), y0 = Math.round(b.y - fh / 2);
    for (var dy = 0; dy < fh; dy++) {
      for (var dx = 0; dx < fw; dx++) {
        var tx = x0 + dx, ty = y0 + dy;
        if (!Z.world.inside(tx, ty)) continue;
        var i = Z.world.idx(tx, ty);
        if (b.def.floor) Z.world.floor[i] = on ? b.id : 0;
        else Z.world.occ[i] = on ? b.id : 0;
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * Chain connections
   *
   * A wall is one tile, and a run of them should read as a wall rather
   * than as a row of crates. Each chain piece carries a four-bit mask of
   * which of its neighbours it joins, and the art draws itself to meet
   * them. The mask is recomputed for the piece and for its four
   * neighbours whenever anything is built or removed - never per frame,
   * because it only changes when the compound does.
   * ------------------------------------------------------------------ */
  var NB = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]];

  /* The four tiles just outside a footprint, one per side.

     These have to be worked out from the footprint's edges, not from its
     centre. A 1x1 wall sits at x.5 and occupies floor(x); stepping one
     metre from the centre and rounding lands on the tile after the one
     you wanted, which is why nothing connected the first time. */
  function nbTile(def, x, y, rot, dir) {
    var fw = Z.fpw(def, rot), fh = Z.fph(def, rot);
    var x0 = Math.round(x - fw / 2), y0 = Math.round(y - fh / 2);
    var x1 = x0 + fw - 1, y1 = y0 + fh - 1;
    switch (dir) {
      case 1: return [x0, y0 - 1];      /* north */
      case 2: return [x1 + 1, y0];      /* east  */
      case 4: return [x0, y1 + 1];      /* south */
      default: return [x0 - 1, y0];     /* west  */
    }
  }

  function joins(a, b) {
    if (!a || !b || b.dead) return false;
    if (!a.def.chain || !b.def.chain) return false;
    /* A fence does not become a wall because it touches one. Pieces join
       things of their own build, plus gates, which are doorways in a run
       of whatever surrounds them. */
    return a.defId === b.defId || a.def.gateway || b.def.gateway;
  }

  function buildingAt(tx, ty) {
    if (!Z.world.inside(tx, ty)) return null;
    var id = Z.world.occ[Z.world.idx(tx, ty)];
    return id ? S.bIndex[id] : null;
  }
  S.buildingAt = buildingAt;

  S.chainMask = function (b) {
    if (!b || !b.def.chain) return 0;
    var m = 0;
    for (var i = 0; i < 4; i++) {
      var bit = NB[i][2];
      var t = nbTile(b.def, b.x, b.y, b.rot, bit);
      if (joins(b, buildingAt(t[0], t[1]))) m |= bit;
    }
    return m;
  };

  /* The piece and everything it touches, because a new wall changes its
     neighbours' shape as much as its own. */
  function remask(b) {
    if (!b) return;
    if (b.def.chain) b.mask = S.chainMask(b);
    for (var i = 0; i < 4; i++) {
      var t = nbTile(b.def, b.x, b.y, b.rot, NB[i][2]);
      var o = buildingAt(t[0], t[1]);
      if (o && o.def.chain) o.mask = S.chainMask(o);
    }
  }
  S.remask = remask;

  /* What a piece *would* connect to if it were placed here - the ghost
     shows the join before you commit to it. */
  S.maskAt = function (def, x, y, rot) {
    if (!def.chain) return 0;
    var probe = { def: def, defId: def.id, x: x, y: y };
    var m = 0;
    for (var i = 0; i < 4; i++) {
      var bit = NB[i][2];
      var t = nbTile(def, x, y, rot, bit);
      if (joins(probe, buildingAt(t[0], t[1]))) m |= bit;
    }
    return m;
  };

  /* Base mode picks structures up and puts them down, so the occupancy
     stamp has to be reversible from outside this file. */
  S.stamp = function (b) { stampBuilding(b, true); remask(b); };
  S.unstamp = function (b) { stampBuilding(b, false); remask(b); };

  S.addBuilding = function (defId, x, y, lvl, rot) {
    var def = Z.BUILDING[defId];
    if (!def) return null;
    var b = {
      id: S.nextBid++, defId: defId, def: def,
      x: x, y: y, lvl: lvl || 1, rot: (rot | 0) & 3,
      hp: def.hp * Z.bHpScale(lvl || 1) * Z.upMul('bhp'),
      maxHp: def.hp * Z.bHpScale(lvl || 1) * Z.upMul('bhp'),
      ang: Math.PI / 2, cool: 0, flash: 0, powered: def.draw === 0,
      dead: false, selected: false, hurt: 0,
      stock: {}          /* what it has made and nobody has fetched yet */
    };
    b.mask = 0;
    S.buildings.push(b);
    S.bIndex[b.id] = b;
    stampBuilding(b, true);
    remask(b);
    Z.world.discover(x, y, 5 + (def.vision || 0));
    S.gridDirty = true;
    Z.S.dirty = true;
    return b;
  };

  S.removeBuilding = function (b, refund) {
    stampBuilding(b, false);
    delete S.bIndex[b.id];
    remask(b);              /* the gap it leaves reshapes what was beside it */
    var i = S.buildings.indexOf(b);
    if (i >= 0) S.buildings.splice(i, 1);
    if (refund) {
      var c = b.def.cost;
      var back = Math.min(0.95, 0.6 * Z.upMul('breclaim'));
      for (var k in c) S.give(k, Math.floor(c[k] * back * b.lvl));
    }
    if (S.sel === b) S.sel = null;
    S.gridDirty = true;
    S.flowDirty = true;
    Z.S.dirty = true;
  };

  S.core = function () {
    for (var i = 0; i < S.buildings.length; i++) {
      if (S.buildings[i].defId === 'core') return S.buildings[i];
    }
    return null;
  };

  /* How lit a point is right now: 1 in daylight, and whatever the lamps
     manage after dark. Zombies avoid light, turrets shoot further in it. */
  S.litAt = function (x, y) {
    var l = Z.world.l;
    if (l > 0.5) return 1;
    var best = l * 2;
    for (var i = 0; i < S.buildings.length; i++) {
      var b = S.buildings[i];
      if (b.dead || !b.def.light || !b.powered) continue;
      var r = b.def.light * (0.55 + Z.bScale(b.lvl) * 0.45) * Z.upMul('night');
      var d = Z.dist(x, y, b.x, b.y);
      if (d < r) best = Math.max(best, 1 - d / r);
    }
    return Z.clamp01(best);
  };

  /* ---- power ------------------------------------------------------- */
  var PRIORITY = { defense: 0, utility: 1, prod: 2, struct: 3, storage: 4, special: 5, power: 6 };

  function updatePower(dt) {
    var l = Z.world.l;
    var supply = 0, draw = 0, storeCap = 0;
    var i, b;
    var hasFuel = S.res('fuel') > 0;

    for (i = 0; i < S.buildings.length; i++) {
      b = S.buildings[i];
      if (b.dead) continue;
      var sc = Z.bScale(b.lvl);
      if (b.def.gen) {
        var gk = Z.upMul('power');
        if (b.def.solar) supply += b.def.gen * sc * l * gk;
        else if (b.def.burns) { if (hasFuel) supply += b.def.gen * sc * gk; }
        else supply += b.def.gen * sc * gk;
      }
      if (b.def.store) storeCap += b.def.store * sc;
      if (b.def.draw) draw += b.def.draw;
    }

    /* the bank soaks up surplus and gives it back after dark */
    S.power.cap = storeCap;
    S.power.stored = Math.min(S.power.stored, storeCap);
    var net = supply - draw;
    if (net > 0) {
      var room = storeCap - S.power.stored;
      S.power.stored += Math.min(room, net * dt * 0.25);
    } else if (S.power.stored > 0) {
      var need = Math.min(-net, S.power.stored / Math.max(0.1, dt));
      supply += need;
      S.power.stored = Math.max(0, S.power.stored - need * dt);
    }

    S.power.supply = supply;
    S.power.draw = draw;
    S.power.ratio = draw <= 0 ? 1 : Z.clamp01(supply / draw);

    /* Allocate in priority order rather than dimming everything: a
       brownout should switch off the silo, not the turrets. */
    var order = S.buildings.slice().sort(function (a, c) {
      return (PRIORITY[a.def.cat] || 9) - (PRIORITY[c.def.cat] || 9);
    });
    var left = supply;
    for (i = 0; i < order.length; i++) {
      b = order[i];
      if (b.dead) { b.powered = false; continue; }
      if (!b.def.draw) { b.powered = true; continue; }
      if (left >= b.def.draw) { b.powered = true; left -= b.def.draw; }
      else b.powered = false;
    }
  }

  /* ---- production -------------------------------------------------- *
   *
   * A farm fills its own crate and waits. Output used to teleport into
   * the stores the instant it existed, which meant the row of sheds along
   * the fence was a number going up somewhere else - nothing to look at,
   * nowhere to walk, no reason to ever touch one again. Now it fills, it
   * says so, and you go and take it.
   *
   * Only while you are playing. Time away is settled by offlineReport,
   * which pays out directly and is not touched by any of this, so going
   * to bed does not cost you a shed full of wheat.
   * ------------------------------------------------------------------ */
  var prodAcc = 0;

  /* Four minutes of output, so a shed is worth visiting but not a
     stopwatch. Bigger buildings hold proportionally more. */
  S.stockCap = function (b, k) {
    var sc = Z.bScale(b.lvl);
    return Math.max(6, (b.def.makes[k] || 0) * sc * 240 * Z.upMul('bank'));
  };
  S.stockOf = function (b) {
    var out = null;
    if (!b.stock) return null;
    for (var k in b.stock) {
      if (b.stock[k] >= 1) { (out = out || {})[k] = Math.floor(b.stock[k]); }
    }
    return out;
  };
  /* 0..1, the fullest single resource - what the pip over it shows */
  S.stockFill = function (b) {
    if (!b.def.makes || !b.stock) return 0;
    var most = 0;
    for (var k in b.def.makes) {
      most = Math.max(most, (b.stock[k] || 0) / S.stockCap(b, k));
    }
    return Z.clamp01(most);
  };

  S.collect = function (b) {
    var got = S.stockOf(b);
    if (!got) return null;
    var any = 0, k;
    for (k in got) {
      /* Take out exactly what the stores took in. Deducting what was
         ASKED for instead threw the difference away, so collecting into
         a full warehouse emptied the shed and gave you nothing for it. */
      var real = S.give(k, got[k]);
      if (real > 0) {
        b.stock[k] -= real;
        if (b.stock[k] < 0.001) b.stock[k] = 0;
        got[k] = real;
        any++;
      } else {
        delete got[k];
      }
    }
    if (!any) { Z.ui.hint('Nowhere to put it - the stores are full'); return null; }

    /* Taking a crate off a shed should land. One ring and a number was
       a receipt; this is a flash at the source, a wide ring going out
       after it, a spray in the colour of whatever came out, and a knock
       on the camera - all of it short, none of it in the way. */
    var rad = Math.max(b.def.w, b.def.h) * 0.6;
    var first = null;
    for (k in got) { if (!first) first = k; }
    var col = first && Z.RES[first] ? Z.hex2rgb(Z.RES[first].color).join(',') : '227,166,63';
    Z.fx.flash(b.x, b.y - 0.4, 0.9, rad * 1.5, col, 0.16);
    Z.fx.ring(b.x, b.y, rad * 0.7, col, 0.36);
    Z.fx.ring(b.x, b.y, rad * 1.5, '234,226,198', 0.6);
    Z.fx.burst(b.x, b.y - 0.3, 18, col, 3.4);
    Z.cam.shake = Math.min(3.2, (Z.cam.shake || 0) + 2.2);
    S.showGains(b.x, b.y - 0.3, got);
    spillLoot(b.x, b.y - 0.3, got);
    Z.sfx.play('loot');
    Z.S.dirty = true;
    return got;
  };

  /* One floating figure per resource, in that resource's own colour, so
     a haul reads as a haul rather than as a number quietly changing in
     the corner of the screen. */
  S.showGains = function (x, y, got) {
    var i = 0;
    for (var k in got) {
      if (!got[k]) continue;
      var r = Z.RES[k];
      var col = r ? (Z.hex2rgb ? Z.hex2rgb(r.color).join(',') : '228,224,214') : '228,224,214';
      /* a clear line apart, or three resources land on top of one
         another and a good haul reads as one smudge */
      Z.fx.num(x, y - i * 0.52, '+' + Z.fmt(got[k]) + ' ' + (r ? r.name : k), col, true);
      Z.fx.burst(x, y, 6, col, 2.1);
      i++;
    }
  };
  function produce(dt) {
    var i, b, k;
    for (i = 0; i < S.buildings.length; i++) {
      b = S.buildings[i];
      if (b.dead || !b.powered) continue;
      var sc = Z.bScale(b.lvl);
      if (b.def.makes) {
        var ok = true;
        if (b.def.eats) {
          for (k in b.def.eats) if (S.res(k) < b.def.eats[k] * sc * dt) ok = false;
        }
        if (ok) {
          /* only eat while there is somewhere to put the result */
          var room = false;
          for (k in b.def.makes) {
            if ((b.stock[k] || 0) < S.stockCap(b, k)) room = true;
          }
          if (room) {
            if (b.def.eats) for (k in b.def.eats) Z.S.res[k] -= b.def.eats[k] * sc * dt;
            for (k in b.def.makes) {
              b.stock[k] = Math.min(S.stockCap(b, k),
                                    (b.stock[k] || 0) +
                                    b.def.makes[k] * sc * Z.upMul('prod') * dt);
            }
          }
        }
      }
      if (b.def.burns) {
        Z.S.res.fuel = Math.max(0, S.res('fuel') -
                                b.def.burns * Z.upCut('fuel', 0.35) * dt);
      }
    }
    /* storage ceiling */
    var cap = 300;
    for (i = 0; i < S.buildings.length; i++) {
      b = S.buildings[i];
      if (!b.dead && b.def.cap) cap += b.def.cap * Z.bScale(b.lvl) * Z.upMul('store');
    }
    S.cap = Math.floor(cap);
  }

  /* ------------------------------------------------------------------ *
   * Survivor
   * ------------------------------------------------------------------ */
  S.spawnPlayer = function () {
    /* a loadout restored from disk may predate a weapon's slot list */
    for (var wid in (Z.S.equip || {})) Z.cleanEquip(wid);

    var st = Z.curStats();
    S.p = {
      x: Z.world.CENTER + 3, y: Z.world.CENTER + 4, vx: 0, vy: 0,
      face: Math.PI / 2, aim: Math.PI / 2,
      hp: st.maxHp, maxHp: st.maxHp,
      ammo: st.mag, reloadT: 0, reloadTot: 1, fireT: 0,
      anim: 'idle', animT: 0, frame: 0,
      task: null, shootT: 0, hitT: 0, moveSpeed: 0, bloom: 0,
      flash: 0, recoil: 0, hurtFlash: 0, dead: false, deadT: 0,
      aiming: false, manualAim: false, hasLaser: false, hasLight: false,
      nadeT: 0, nadeHold: 0, dashT: 0, dashTime: 0, dashVX: 0, dashVY: 0,
      invuln: 0, trail: [],
      stats: st, workT: 0
    };
    return S.p;
  };

  /* Clips that are the same performance filmed two ways. Crossing
     between them mid-action must not rewind the action: start walking
     halfway through a magazine change and the magazine change carries
     on from where it was, it does not start again. */
  var SIBLING = { reload: 'reloadwalk', reloadwalk: 'reload' };

  function setAnim(p, name) {
    if (p.anim === name) return;
    if (!Z.art.ANIMS[name]) return;
    if (SIBLING[p.anim] === name) { p.anim = name; return; }
    p.anim = name; p.animT = 0; p.frame = 0; p.animDone = false;
  }
  function restartAnim(p, name) {
    if (!Z.art.ANIMS[name]) return;
    p.anim = name; p.animT = 0; p.frame = 0; p.animDone = false;
  }
  function clipLen(name) {
    var a = Z.art.ANIMS[name];
    return a ? a.n / a.fps : 0.2;
  }

  /* One place decides what the body is doing, in priority order. The old
     code set the animation from four separate branches and force-restarted
     it every frame the muzzle was hot, so the shoot clip never advanced
     past its first frame and walking overwrote it anyway. */
  function pickAnim(p, moving) {
    if (p.dead) return 'death';
    /* A reload can run far longer than the clip that shows it - a belt
       fed weapon is three seconds, the clip is eight tenths of one. Play
       the magazine change once and then hand the body back to walking or
       standing, rather than holding the last frame of it rigid for two
       more seconds. */
    if (p.reloadT > 0 && (p.reloadTot - p.reloadT) < clipLen('reload')) {
      return moving ? 'reloadwalk' : 'reload';
    }
    if (p.hitT > 0) return 'hit';
    if (p.workT > 0) return 'work';
    if (moving) return 'walk';
    if (p.shootT > 0) return 'shoot';
    return 'idle';
  }

  function stepAnim(e, dt, anims) {
    var A = anims[e.anim];
    if (!A) return;
    e.animT += dt;
    var f = Math.floor(e.animT * A.fps);
    if (A.loop) e.frame = f % A.n;
    else {
      if (f >= A.n) { e.frame = A.n - 1; e.animDone = true; }
      else { e.frame = f; e.animDone = false; }
    }
  }

  /* Move with sliding: if the direct step is blocked, try each axis on
     its own, which is what lets you walk along a wall instead of sticking
     to it. */
  /* Move one axis at a time, testing only the edge that is leading.

     This used to ask `free()` whether the destination had clearance on
     all four sides, and `free()` ANDs its four probes - so a survivor
     standing with anything at all half a metre to the north could not
     walk north, south, east OR west. He played a full walk cycle on the
     spot, which is what "the walking animation is broken" looks like
     from the outside. Nothing was wrong with the animation.

     Per axis, leading edge, is the ordinary way to do this: moving east
     cares about what is east of you and nothing else, so you slide along
     a wall instead of being welded to it, and you can always walk back
     out of whatever you are touching. */
  function moveBody(e, dx, dy, radius) {
    var r = radius || 0.28;
    var moved = false;
    if (dx) {
      var nx = e.x + dx;
      if (solid(nx + (dx > 0 ? r : -r), e.y) && solid(nx, e.y)) {
        e.x = nx;
        moved = true;
      }
    }
    if (dy) {
      var ny = e.y + dy;
      if (solid(e.x, ny + (dy > 0 ? r : -r)) && solid(e.x, ny)) {
        e.y = ny;
        moved = true;
      }
    }
    return moved;
  }

  /* Confusingly named and kept that way because everything calls it:
     this returns whether a point can be STOOD ON, not whether it is
     blocked. Indoors the room's own grid answers; outside, the world's. */
  function solid(x, y) {
    return Z.interior && Z.interior.active()
      ? Z.interior.walkable(x, y) : Z.world.walkable(x, y);
  }
  S.solid = solid;

  /* Clearance on every side. Right for choosing somewhere to put a body
     down, wrong for deciding whether one may take a step - see moveBody. */
  function free(x, y, r) {
    r = r || 0.28;
    return solid(x - r, y) && solid(x + r, y) &&
           solid(x, y - r) && solid(x, y + r);
  }
  S.free = free;

  /* Marks something to work on. Returns true when he can already reach it
     from where he is standing; the caller uses that to tell the player
     whether they need to walk over. */
  S.setTask = function (prop, kind) {
    if (!S.p || S.p.dead || !prop) return false;
    /* You do not take a house apart for timber. You go in. */
    if (prop.def.enter) {
      S.p.task = null;
      var near = Z.dist(S.p.x, S.p.y, prop.x, prop.y) <= prop.def.r + 1.6;
      if (near) Z.interior.enter(prop);
      return near;
    }
    if (S.p.task && S.p.task.prop && S.p.task.prop !== prop) S.p.task.prop.work = 0;
    S.p.task = { prop: prop, kind: kind };
    return Z.dist(S.p.x, S.p.y, prop.x, prop.y) <= prop.def.r + 1.15;
  };

  S.cancelTask = function () {
    if (!S.p) return;
    if (S.p.task && S.p.task.prop) S.p.task.prop.work = 0;
    S.p.task = null;
  };

  function stepPlayer(dt, time) {
    var p = S.p;
    if (!p) return;
    if (Z.interior && Z.interior.active()) Z.interior.step(dt);

    /* In base mode the survivor is not in the picture: he does not walk,
       aim or fire, and nothing about him is drawn. Everything else in the
       world carries on, which is the point of not making this a scene. */
    if (Z.base && Z.base.isBase()) {
      p.vx = p.vy = 0;
      p.manualAim = false;
      p.aiming = false;
      p.flash = Math.max(0, p.flash - dt * 9);
      p.recoil = Math.max(0, p.recoil - dt * 7);
      p.hurtFlash = Math.max(0, p.hurtFlash - dt * 3.2);
      setAnim(p, 'idle');
      stepAnim(p, dt, Z.art.ANIMS);
      return;
    }

    var st = Z.curStats();
    p.stats = st;
    p.maxHp = st.maxHp;
    /* A magazine can never hold more than it holds. Anything that
       changes capacity - a weapon swap, an extended mag coming off, a
       skill respec - could otherwise leave a count above the maximum
       sitting in the HUD reading "32 / 12". */
    if (p.ammo > st.mag) p.ammo = st.mag;
    p.hasLaser = !!st.specials.laser;
    p.hasLight = !!st.specials.light;

    if (p.dead) {
      p.deadT += dt;
      stepAnim(p, dt, Z.art.ANIMS);
      if (p.deadT > 3.2) respawn();
      return;
    }

    p.flash = Math.max(0, p.flash - dt * 9);
    p.recoil = Math.max(0, p.recoil - dt * 7);
    p.hurtFlash = Math.max(0, p.hurtFlash - dt * 3.2);

    /* ---- healing: regen, plus an infirmary if you are standing near one ---- */
    var heal = st.regen;
    for (var i = 0; i < S.buildings.length; i++) {
      var b = S.buildings[i];
      if (b.dead || !b.powered || !b.def.heal) continue;
      if (Z.dist(p.x, p.y, b.x, b.y) < (b.def.radius || 5) * Z.upMul('radius')) {
        heal += b.def.heal * Z.bScale(b.lvl);
      }
    }
    if (heal > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + heal * dt);

    /* ---- movement ----
       The survivor only ever walks because you told him to, with the
       keyboard or the thumb stick. Nothing in the world moves him for
       you: tapping a tree marks it, it does not send him to it.

       Velocity is eased toward the stick rather than snapped to it, and
       the body turns at a finite rate. Driving position straight off the
       input made him start and stop like a cursor and flick between the
       eight facings; a short ramp and a turn rate are the whole
       difference between that and something that feels like a person. */
    var inx = (Z.input && Z.input.axis) ? Z.input.axis.x : 0;
    var iny = (Z.input && Z.input.axis) ? Z.input.axis.y : 0;
    var held = !!(inx || iny);
    var sp = st.speed * Z.world.speedAt(p.x, p.y);

    var tvx = 0, tvy = 0;
    if (held) {
      var mag = Math.sqrt(inx * inx + iny * iny) || 1;
      /* a part-pushed thumb stick walks, a full one runs */
      var push = Math.min(1, mag);
      tvx = (inx / mag) * sp * push;
      tvy = (iny / mag) * sp * push;
    }
    /* accelerate briskly, stop a little faster still */
    var k = held ? 0.00002 : 0.0000005;
    p.vx = Z.approach(p.vx, tvx, k, dt);
    p.vy = Z.approach(p.vy, tvy, k, dt);
    if (Math.abs(p.vx) < 0.02) p.vx = 0;
    if (Math.abs(p.vy) < 0.02) p.vy = 0;

    /* ---- cooldowns ---- */
    if (p.nadeT > 0) p.nadeT = Math.max(0, p.nadeT - dt);
    if (p.dashT > 0) p.dashT = Math.max(0, p.dashT - dt);
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (S.nadeArmed) p.nadeHold += dt;

    var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    var moving = speed > 0.12;

    /* ---- the dash ----

       It overrides the walk for its fifth of a second and goes through
       exactly the same collision, so it stops against a wall instead of
       passing through one. The trail is a handful of recent positions;
       the renderer draws the survivor again, faded, at each. */
    if (p.dashTime > 0) {
      p.dashTime = Math.max(0, p.dashTime - dt);
      moveBody(p, p.dashVX * dt, p.dashVY * dt, 0.3);
      p.trail.push({ x: p.x, y: p.y, face: p.face, frame: p.frame,
                     anim: p.anim, t: 0 });
      if (p.trail.length > 7) p.trail.shift();
      moving = true;
      speed = Math.abs(p.dashVX) + Math.abs(p.dashVY);
      if (p.dashTime <= 0) {
        /* leave with the speed the dash gave you rather than stopping
           dead, which reads as a stumble rather than an exit */
        p.vx = p.dashVX * 0.28; p.vy = p.dashVY * 0.28;
        Z.fx.burst(p.x, p.y + 0.1, 4, '186,196,204', 2.2);
      }
    } else if (moving) {
      moveBody(p, p.vx * dt, p.vy * dt, 0.3);
    }
    /* the afterimages fade whether or not you are still dashing */
    for (var tr = p.trail.length - 1; tr >= 0; tr--) {
      p.trail[tr].t += dt;
      if (p.trail[tr].t > 0.26) p.trail.splice(tr, 1);
    }

    /* the body swings round to where it is going rather than snapping */
    if (!p.manualAim && moving) {
      p.face = Z.angTo(p.face, Math.atan2(p.vy, p.vx), dt * 11);
    }
    p.moveSpeed = speed;

    /* ---- the job in hand, once you are standing close enough ---- */
    p.workT = Math.max(0, p.workT - dt);
    /* the report fades; what the horde hears fades with it */
    if (S.noiseT > 0) { S.noiseT -= dt; if (S.noiseT <= 0) S.noiseR = 0; }
    S.flushCoins(dt);
    /* acid on the ground */
    for (var ap = S.pools.length - 1; ap >= 0; ap--) {
      var pl = S.pools[ap];
      pl.t += dt;
      if (pl.t >= pl.life) { S.pools.splice(ap, 1); continue; }
      if (Math.random() < dt * 6) {
        var aa = Math.random() * TAU, ar = Math.random() * pl.r;
        Z.fx.burst(pl.x + Math.cos(aa) * ar, pl.y + Math.sin(aa) * ar, 1,
                   '120,190,100', 0.8);
      }
      if (S.p && !S.p.dead && Z.dist(S.p.x, S.p.y, pl.x, pl.y) < pl.r) {
        S.hurtPlayer(pl.dmg * dt);
      }
    }
    if (p.task) {
      var pr = p.task.prop;
      if (!pr || pr.gone) { p.task = null; }
      else if (Z.dist(p.x, p.y, pr.x, pr.y) <= pr.def.r + 1.15) {
        if (!moving) doWork(p, pr, dt, st);
      } else if (pr.work > 0) {
        /* walking off lets the work slip back rather than banking it */
        pr.work = Math.max(0, pr.work - dt * 0.6);
      }
    }

    if (!Z.interior.active()) Z.world.discover(p.x, p.y, 11);

    /* ---- targeting ---- */
    var range = Z.effRange(st);
    if (p.manualAim) {
      p.face = p.aim;
      p.aiming = true;
    } else {
      /* auto: the nearest live zombie inside reach */
      var best = null, bd = range * range;
      for (var zi = 0; zi < S.zombies.length; zi++) {
        var zb = S.zombies[zi];
        if (zb.dying) continue;
        var dd = Z.dist2(p.x, p.y, zb.x, zb.y);
        if (dd < bd) { bd = dd; best = zb; }
      }
      if (S.target && (S.target.dying || Z.dist2(p.x, p.y, S.target.x, S.target.y) > range * range)) {
        S.target = null;
      }
      var tgt = S.target || best;
      p.aiming = !!tgt && Z.S.autoCombat !== false;
      if (tgt) {
        p.aim = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        if (!moving) p.face = p.aim;
      }
    }

    /* ---- firing ---- */
    p.fireT -= dt;
    if (p.reloadT > 0) {
      p.reloadT -= dt * reloadSpeed(p);
      if (p.reloadT <= 0) { p.ammo = st.mag; p.reloadT = 0; }
    } else if (p.ammo <= 0) {
      startReload(p, st);
    } else if (p.aiming && p.fireT <= 0 && !p.task) {
      var shouldFire = p.manualAim ? Z.input.firing : (Z.S.autoCombat !== false && inRange(p, range));
      if (shouldFire) fire(p, st);
    }

    /* ---- animation ---- */
    p.shootT = Math.max(0, p.shootT - dt);
    /* the group tightens again the moment you stop */
    if (p.bloom) p.bloom = Math.max(0, p.bloom - dt * 1.9);
    p.hitT = Math.max(0, p.hitT - dt);
    setAnim(p, pickAnim(p, moving));
    /* the stride keeps pace with the legs, so a half-pushed stick ambles */
    var animDt = dt;
    if (p.anim === 'walk' || p.anim === 'reloadwalk') {
      animDt = dt * Z.clamp(speed / Math.max(0.1, st.speed), 0.45, 1.5);
    }
    stepAnim(p, animDt, Z.art.ANIMS);
  }

  function inRange(p, range) {
    for (var i = 0; i < S.zombies.length; i++) {
      var zb = S.zombies[i];
      if (zb.dying) continue;
      if (Z.dist2(p.x, p.y, zb.x, zb.y) <= range * range) return true;
    }
    return false;
  }

  function reloadSpeed(p) {
    var k = 1;
    for (var i = 0; i < S.buildings.length; i++) {
      var b = S.buildings[i];
      if (b.dead || !b.powered || !b.def.reload) continue;
      if (Z.dist(p.x, p.y, b.x, b.y) < (b.def.radius || 6) * Z.upMul('radius')) {
        k += b.def.reload;
      }
    }
    return k;
  }

  function startReload(p, st) {
    if (p.reloadT > 0) return;
    p.reloadT = p.reloadTot = st.reload;
    restartAnim(p, 'reload');
    Z.sfx.play('reload');
  }
  S.reload = function () {
    var p = S.p;
    if (!p || p.dead || p.reloadT > 0) return;
    var st = Z.curStats();
    if (p.ammo >= st.mag) return;
    startReload(p, st);
  };

  /* ------------------------------------------------------------------ *
   * Grenades
   *
   * Aimed at a point rather than thrown in a direction, because the
   * whole value of a grenade is landing it in the middle of the group
   * rather than near it - and a preview that shows you the landing spot
   * is only honest if that is genuinely what the sim is aiming at.
   *
   * Where the point comes from depends on how you are playing. With the
   * cursor down you already have a world position under it, so that is
   * the target. Otherwise it is straight ahead at a distance you charge
   * up by holding the button, which is what a thumb on a phone can do.
   * ------------------------------------------------------------------ */
  S.nades = [];

  S.nadeTarget = function () {
    var p = S.p, G = Z.GRENADE;
    if (!p) return null;
    var aw = Z.input && Z.input.aimWorld;
    var tx, ty;
    if (p.manualAim && aw) { tx = aw.x; ty = aw.y; }
    else {
      var k = Z.clamp01(p.nadeHold / G.charge);
      var d = G.minRange + (G.maxRange - G.minRange) * k;
      tx = p.x + Math.cos(p.aim) * d;
      ty = p.y + Math.sin(p.aim) * d;
    }
    /* never further than an arm can throw */
    var dx = tx - p.x, dy = ty - p.y;
    var dd = Math.sqrt(dx * dx + dy * dy) || 1;
    if (dd > G.maxRange) { tx = p.x + dx / dd * G.maxRange; ty = p.y + dy / dd * G.maxRange; }
    else if (dd < G.minRange) { tx = p.x + dx / dd * G.minRange; ty = p.y + dy / dd * G.minRange; }
    return { x: tx, y: ty };
  };

  S.nadeReady = function () {
    var p = S.p;
    return !!p && !p.dead && p.nadeT <= 0;
  };

  S.armNade = function () {
    var p = S.p;
    if (!p || p.dead || p.nadeT > 0) { if (p && p.nadeT > 0) Z.sfx.play('deny'); return false; }
    S.nadeArmed = true;
    p.nadeHold = 0;
    return true;
  };

  S.cancelNade = function () {
    S.nadeArmed = false;
    if (S.p) S.p.nadeHold = 0;
  };

  S.throwNade = function () {
    var p = S.p, G = Z.GRENADE;
    if (!p || p.dead || p.nadeT > 0) { S.cancelNade(); return false; }
    var t = S.nadeTarget();
    S.nadeArmed = false;
    p.nadeHold = 0;
    p.nadeT = G.cool;
    p.face = p.aim = Math.atan2(t.y - p.y, t.x - p.x);

    var dx = t.x - p.x, dy = t.y - p.y;
    var d = Math.sqrt(dx * dx + dy * dy) || 1;
    /* a longer throw takes longer and goes higher, which is what makes
       the arc read as an arc rather than a straight line with a curve
       drawn on it */
    var T = Z.clamp(d / 11, 0.34, 0.95);
    S.nades.push({
      x: p.x, y: p.y, z: 0.95,
      vx: dx / T, vy: dy / T, vz: 0.5 * 22 * T + 0.95 / T,
      spin: (Math.random() - 0.5) * 22,
      rot: 0, t: 0, cook: -1
    });
    Z.sfx.play('throw');
    return true;
  };

  function blast(x, y) {
    var G = Z.GRENADE;
    Z.cam.quake(11);
    Z.sfx.play('boom');
    Z.fx.boom(x, y, G.radius);

    /* What it does grows with what you have built yourself into.

       A flat figure is a grenade that clears night four and tickles
       night forty, which is exactly backwards - the crowds that most
       need clearing are the late ones. Tying it to your own damage stat
       means the throwable rides the same curve as the gun. */
    var power = G.dmg + Z.curStats().dmg * 2.4;
    var caught = 0;
    for (var i = 0; i < S.zombies.length; i++) {
      var zb = S.zombies[i];
      if (zb.dying) continue;
      var d = Z.dist(x, y, zb.x, zb.y);
      if (d > G.radius) continue;
      /* full force at the centre, still worth having at the rim */
      var k = 1 - (d / G.radius) * 0.55;
      hurtZombie(zb, power * k, d < G.radius * 0.35, null);
      /* and the ones it did not kill are knocked about */
      if (!zb.dying) {
        var a = Math.atan2(zb.y - y, zb.x - x);
        var push = (1 - d / G.radius) * 1.5 / Math.max(0.6, zb.size);
        moveBody(zb, Math.cos(a) * push, Math.sin(a) * push, 0.26 * zb.size);
        zb.chill = Math.max(zb.chill || 0, G.stun);
        zb.anim = 'hit'; zb.animT = 0; zb.frame = 0;
      }
      caught++;
    }
    if (caught >= 4) Z.ui.hint(caught + ' caught in the blast');
  }

  function stepNades(dt) {
    if (!S.nades.length) return;
    var out = [];
    for (var i = 0; i < S.nades.length; i++) {
      var g = S.nades[i];
      g.t += dt;
      if (g.cook < 0) {
        g.x += g.vx * dt; g.y += g.vy * dt;
        g.z += g.vz * dt;
        g.vz -= 22 * dt;
        g.rot += g.spin * dt;
        if (g.z <= 0) {
          g.z = 0;
          /* it arrives, settles, and then goes off - the beat between
             the two is what lets you see where it landed */
          g.cook = 0;
          g.vx *= 0.24; g.vy *= 0.24;
          Z.fx.burst(g.x, g.y, 3, '150,142,128', 1.8);
          Z.sfx.play('clink');
        }
      } else {
        g.cook += dt;
        g.x += g.vx * dt; g.y += g.vy * dt;
        g.vx *= 0.86; g.vy *= 0.86;
        if (g.cook >= Z.GRENADE.cook) { blast(g.x, g.y); continue; }
      }
      out.push(g);
    }
    S.nades = out;
  }

  /* ------------------------------------------------------------------ *
   * Dash
   *
   * A short hard shove in the direction you are already going, or the
   * way you are facing if you are standing still. It goes through the
   * same collision as walking does - a dash that teleports you through
   * your own wall would undo the cover work - so it stops dead against
   * a building rather than passing into it.
   * ------------------------------------------------------------------ */
  S.dashReady = function () {
    var p = S.p;
    return !!p && !p.dead && p.dashT <= 0 && p.dashTime <= 0;
  };

  S.dash = function () {
    var p = S.p, D = Z.DASH;
    if (!p || p.dead) return false;
    if (p.dashT > 0 || p.dashTime > 0) { Z.sfx.play('deny'); return false; }
    var ax = Z.input && Z.input.axis ? Z.input.axis.x : 0;
    var ay = Z.input && Z.input.axis ? Z.input.axis.y : 0;
    var m = Math.sqrt(ax * ax + ay * ay);
    var dx, dy;
    if (m > 0.2) { dx = ax / m; dy = ay / m; }
    else { dx = Math.cos(p.face); dy = Math.sin(p.face); }
    p.dashVX = dx * (D.dist / D.time);
    p.dashVY = dy * (D.dist / D.time);
    p.dashTime = D.time;
    p.dashT = D.cool;
    p.invuln = Math.max(p.invuln, D.iframes);
    p.face = Math.atan2(dy, dx);
    p.trail.length = 0;
    Z.sfx.play('dash');
    Z.cam.quake(1.6);
    Z.fx.burst(p.x, p.y + 0.1, 7, '206,214,220', 3.4);
    return true;
  };

  /* What the round looks like, per weapon class. A pistol and a railgun
     firing the same pale streak was the single biggest reason every gun
     felt the same to shoot. */
  var ROUND = {
    pistols:  { col: '255,226,160', w: 1.5, glow: 0.5 },
    smgs:     { col: '255,214,132', w: 1.3, glow: 0.4 },
    shotguns: { col: '255,190,110', w: 1.9, glow: 0.7 },
    ar:       { col: '255,236,178', w: 1.7, glow: 0.6 },
    heavy:    { col: '255,178,86',  w: 2.4, glow: 0.9 },
    snipers:  { col: '206,232,255', w: 2.2, glow: 1.0 },
    special:  { col: '150,232,255', w: 3.2, glow: 1.3 }
  };
  function roundOf() {
    var w = Z.WEAPON[Z.S.weapon];
    return (w && ROUND[w.cat]) || ROUND.pistols;
  }

  function fire(p, st) {
    p.fireT = 60 / st.rpm;
    p.ammo--;
    p.flash = 1;
    p.recoil = 1;
    /* restart the clip only if it is already the one playing; otherwise
       let pickAnim switch to it and run it from the top */
    if (p.anim === 'shoot') restartAnim(p, 'shoot');
    p.shootT = clipLen('shoot');

    /* The kick scales with what the gun does rather than being one of two
       values. A hand cannon should move the camera; an SMG should not, or
       holding the trigger turns the screen to soup. */
    var heft = st.dmg * Math.max(1, st.pellets) / Math.max(1, st.rpm / 60);
    Z.cam.quake(Z.clamp(0.5 + heft * 0.055, 0.5, 4.2));
    S.noiseR = st.specials.quiet ? 2.5 : 9;
    S.noiseT = 1.2;
    if (st.specials.quiet) Z.sfx.play('clink');
    else Z.sfx.play(st.pellets > 1 ? 'shotgun' : (st.rpm > 400 ? 'smg' : 'shot'));
    Z.S.dirty = true;

    /* Bloom: hold the trigger and the group opens up, and it closes again
       when you stop. It is what makes an automatic feel like one instead
       of a pistol that repeats quickly. */
    p.bloom = Math.min(1, (p.bloom || 0) + 0.34);
    var spread = st.spread * (1 + p.bloom * 1.5);

    var round = roundOf();
    var range = Z.effRange(st);
    var reach = Z.art.weaponReach(Z.WEAPON[Z.S.weapon].shape);
    for (var s = 0; s < st.pellets; s++) {
      var a = p.aim + (Math.random() - 0.5) * spread;
      shot(p, a, range, st, round, reach);
    }

    /* brass, smoke and a bloom of light off the barrel, all hung on the
       muzzle of the gun he is actually carrying */
    var mz = Z.art.weaponReach(Z.WEAPON[Z.S.weapon].shape);
    var mx = p.x + Math.cos(p.aim) * mz, my = p.y + Math.sin(p.aim) * mz;
    Z.fx.shell(p.x, p.y, p.aim);
    Z.fx.spark(mx, my, p.aim, st.pellets > 1 ? 5 : 3, round.col, 5.5);
    if (Math.random() < 0.34 || st.pellets > 1) Z.fx.smoke(mx, my, 1, '186,180,168');

    if (p.ammo <= 0) startReload(p, st);
  }

  /* One hitscan line. Pierce lets a round carry on into the queue.

     The line stops at the first thing solid. Without that, cover was
     decorative: you could stand behind your own wall and shoot through
     it, and so could everything else. */
  function shot(p, ang, range, st, round, reach) {
    round = round || ROUND.pistols;
    if (reach == null) reach = 0.55;
    var hits = [];
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var wall = Z.flow ? Z.flow.rayShot(p.x, p.y, dx, dy, range) : range;
    var hitWall = wall < range - 0.01;
    if (hitWall) range = wall;
    for (var i = 0; i < S.zombies.length; i++) {
      var zb = S.zombies[i];
      if (zb.dying) continue;
      var rx = zb.x - p.x, ry = zb.y - p.y;
      var t = rx * dx + ry * dy;
      if (t < 0 || t > range) continue;
      var px = rx - dx * t, py = ry - dy * t;
      /* the hitbox follows the body: a hulk is genuinely easier to hit
         than a runner, which is the trade for how long it takes to drop */
      var r = 0.42 * zb.size + 0.10 + (zb.type.heavy || 0) * 0.06;
      if (px * px + py * py > r * r) continue;
      hits.push({ zb: zb, t: t });
    }
    hits.sort(function (a, b) { return a.t - b.t; });

    var pierce = st.pierce, end = range, any = false;
    for (var h = 0; h < hits.length; h++) {
      var zb2 = hits[h].zb;
      var crit = Math.random() < st.crit;
      var dmg = st.dmg * (crit ? st.critMult : 1) * Z.comboMult();
      if (!st.specials.ap) dmg *= (1 - zb2.armor);
      hurtZombie(zb2, dmg, crit, st, ang);
      any = true;
      end = hits[h].t;
      if (st.specials.explosive) splash(zb2.x, zb2.y, 1.5, dmg * 0.5, st);
      if (st.specials.burn) zb2.burn = Math.max(zb2.burn, 3.2);
      if (pierce-- <= 0) break;
      end = range;
    }
    var ex = p.x + dx * (any ? end + 0.2 : range);
    var ey = p.y + dy * (any ? end + 0.2 : range);
    /* the tracer leaves the muzzle, wherever this weapon's muzzle is */
    Z.fx.tracer(p.x + dx * reach, p.y + dy * reach, ex, ey,
                round.col, round.w, Z.art.GRIP_Z, 0.95);
    if (!any) {
      /* Masonry off a wall, dirt off the ground. Two different sounds to
         look at, and the one that says "you are shooting your own
         compound" is worth telling apart from a miss. */
      if (hitWall) {
        Z.fx.spark(ex, ey, ang + Math.PI, 5, '206,198,180', 3.4);
        Z.fx.burst(ex, ey, 2, '128,124,112', 1.8);
        if (Math.random() < 0.45) Z.fx.decal(ex, ey, 0.12, '32,30,28');
      } else {
        Z.fx.spark(ex, ey, ang, 3, '168,156,132', 2.6);
        if (Math.random() < 0.3) Z.fx.decal(ex, ey, 0.10, '40,36,30');
      }
    }
  }

  function splash(x, y, r, dmg, st) {
    Z.fx.ring(x, y, r * 0.5, '255,150,60', 0.35);
    for (var i = 0; i < S.zombies.length; i++) {
      var zb = S.zombies[i];
      if (zb.dying) continue;
      var d = Z.dist(x, y, zb.x, zb.y);
      if (d > r) continue;
      hurtZombie(zb, dmg * (1 - d / r), false, st);
    }
  }

  /* ---- working: clearing and looting --------------------------------- */
  function doWork(p, pr, dt, st) {
    if (!p.manualAim) p.face = Math.atan2(pr.y - p.y, pr.x - p.x);
    p.workT = 0.15;
    var rate = st.gather * (pr.def.loot ? 1.15 : 1);
    pr.work += dt * rate;

    /* Blows, not a drizzle.

       This used to emit one particle on a random roll six times a second,
       which is a texture rather than an action - nothing to brace against
       and no sense of getting anywhere. Work lands in strikes now, and
       the strikes tighten and brighten as the node gives way, so the last
       few are visibly the last few. */
    var k = Z.clamp01(pr.work / pr.def.work);
    pr.hitT = (pr.hitT || 0) - dt * rate;
    if (pr.hitT <= 0) {
      pr.hitT = 0.44 - k * 0.16;
      var chips = 3 + Math.round(k * 5);
      Z.fx.burst(pr.x + (Math.random() - 0.5) * 0.4, pr.y - 0.1, chips,
                 pr.def.loot ? '186,164,120' : '120,96,58', 2.2 + k * 1.6);
      Z.fx.ring(pr.x, pr.y, 0.34 + k * 0.3,
                pr.def.loot ? '227,166,63' : '150,124,78', 0.24);
      Z.sfx.play(pr.def.loot ? 'tick' : 'chop');
      Z.cam.shake = Math.min(1.4, (Z.cam.shake || 0) + 0.35 + k * 0.5);
    }

    if (pr.work >= pr.def.work) {
      finishWork(p, pr);
    }
  }

  /* Throw a haul into the world as things rather than as a number.

     One nugget per unit reads as a slot machine on a big pull and as
     nothing on a small one, so the count is a root: three of something is
     three, a hundred is ten. The first to land carries the tally up to
     the HUD; the rest just punch their own counter, which is what makes a
     large haul feel large - it keeps arriving. */
  function spillLoot(x, y, got) {
    var first = true;
    for (var k in got) {
      var amt = got[k];
      if (!(amt > 0)) continue;
      var n = Z.clamp(Math.round(Math.sqrt(amt) * 1.1), 1, 14);
      (function (res, tally) {
        Z.fx.pickup(x, y, res, n, function (r2, gx, gy) {
          if (first) { first = false; Z.ui.flyRes(gx, gy, tally); }
          if (Z.ui.resPop) Z.ui.resPop(r2);
          Z.sfx.play('tick');
        });
      })(k, got);
    }
    if (first === true && Z.ui.flyRes) Z.ui.flyRes(x, y, got);
  }

  function finishWork(p, pr) {
    var def = pr.def;
    var got = {};
    if (def.yield) {
      for (var k in def.yield) {
        var n = Math.round(def.yield[k] * (0.85 + Math.random() * 0.4) *
                           Z.upMul('yield'));
        var real = S.give(k, n);
        if (real > 0) got[k] = (got[k] || 0) + real;
      }
    }
    if (def.loot) {
      var tbl = Z.LOOT[def.loot];
      var total = 0;
      tbl.rolls.forEach(function (r) { total += r[3]; });
      for (var i = 0; i < tbl.n; i++) {
        var pick = Math.random() * total, acc = 0, chosen = tbl.rolls[0];
        for (var j = 0; j < tbl.rolls.length; j++) {
          acc += tbl.rolls[j][3];
          if (pick <= acc) { chosen = tbl.rolls[j]; break; }
        }
        var amt = Math.round(chosen[1] + Math.random() * (chosen[2] - chosen[1]));
        var g2 = S.give(chosen[0], amt);
        if (g2 > 0) got[chosen[0]] = (got[chosen[0]] || 0) + g2;
      }
      S.addXp(6 + Math.round(def.work));
    } else {
      S.addXp(2 + Math.round(def.work * 0.6));
    }

    Z.fx.burst(pr.x, pr.y, 14, def.loot ? '227,166,63' : '150,120,70', 3.2);
    Z.fx.ring(pr.x, pr.y, def.r, '127,164,92', 0.5);
    S.showGains(pr.x, pr.y - 0.3, got);
    spillLoot(pr.x, pr.y - 0.2, got);
    if (def.loot) {
      Z.fx.flash(pr.x, pr.y - 0.3, 0.8, def.r * 1.6, '227,166,63', 0.14);
      Z.fx.ring(pr.x, pr.y, def.r * 1.7, '234,226,198', 0.55);
      Z.cam.shake = Math.min(2.6, (Z.cam.shake || 0) + 1.6);
    }
    Z.sfx.play(def.loot ? 'loot' : 'chop');

    var tiles = [];
    var hw = (def.fw - 1) / 2, hh = (def.fh - 1) / 2;
    var x0 = Math.round(pr.x - 0.5 - hw), y0 = Math.round(pr.y - 0.5 - hh);
    Z.world.removeProp(pr);
    Z.render.invalidateChunk(x0, y0);
    Z.render.invalidateChunk(x0 + def.fw, y0 + def.fh);

    Z.ui.lootToast(def.name, got);
    p.task = null;
    p.workT = 0;
    Z.S.cleared = (Z.S.cleared || 0) + 1;
    Z.S.dirty = true;
  }

  S.addXp = function (n) {
    Z.S.xp += Math.max(1, Math.round(n * Z.upMul('xp')));
    var need = Z.xpFor(Z.S.level);
    while (Z.S.xp >= need) {
      Z.S.xp -= need;
      Z.S.level++;
      Z.ui.toast('Level ' + Z.S.level, 'New blueprints unlocked');
      Z.sfx.play('level');
      need = Z.xpFor(Z.S.level);
    }
    Z.S.dirty = true;
  };

  function respawn() {
    var p = S.p;
    var core = S.core();
    p.x = core ? core.x : Z.world.CENTER;
    p.y = (core ? core.y : Z.world.CENTER) + 2.5;
    p.hp = p.maxHp * 0.5;
    p.dead = false; p.deadT = 0;
    p.ammo = Z.curStats().mag;
    p.task = null;
    p.shootT = p.hitT = p.workT = 0;
    p.dashTime = 0; p.trail.length = 0; S.cancelNade();
    restartAnim(p, 'idle');
    Z.cam.centerOn(p.x, p.y, true);
    Z.ui.toast('You came to', 'Back at the compound, half strength');
  }

  /* One hit, one reaction.
  
     hurtPlayer is called by sources that arrive at wildly different
     rates. A shambler lands one blow a second. A pack of twelve lands
     eleven. Standing in acid calls it sixty times a second, because the
     pool bills you `dmg * dt` every frame. The reaction was flat - four
     blood, one grunt, one restarted hit clip, per call - so three
     seconds in a puddle cost eighteen health and produced seven hundred
     and twenty particles and a hundred and eighty overlapping copies of
     one sample, which is not a sound, it is a buzz. Measured against a
     twelve-zombie swarm over the same three seconds: 136 particles, 34
     grunts, 371 damage. The puddle was five times louder than the swarm
     for a twentieth of the harm.
  
     So the reaction is driven by the damage, not by the call. Blood is
     paid out of a running debt measured in health: a tick too small to
     see banks instead of spraying, and when the debt is worth a spatter
     it pays at once - which means a real blow now throws MORE blood
     than before while a drizzle throws almost none. The grunt has a
     floor and a cooldown, both scaled by severity, so a heavy hit
     always speaks straight away and a drizzle speaks about once a
     second. The hit clip only restarts for a blow worth flinching at,
     because restarting it every frame pinned the player on frame one
     for as long as they stood in the acid. */
  var bloodDebt = 0, bloodT = 0, hurtSndT = 0, hurtAcc = 0;

  /* The debt alone is not enough: twelve zombies whose cooldowns line up
     all land on the same frame, and twelve separate payouts on one frame
     is twelve sprays stacked in one place - measured at 360 particles
     where the flat four-per-call it replaced managed 136. So a payout
     also holds a floor of a frame or eight, and damage arriving inside
     that window banks instead. A volley becomes one dense spatter whose
     size reflects the whole volley, which is both cheaper and a truer
     picture of what just happened to you. */
  function bleed(n, p) {
    var unit = Math.max(1.2, p.maxHp * 0.04);       /* health per spatter */
    bloodDebt += n;
    if (bloodT > 0 || bloodDebt < unit) return;
    var k = Math.floor(bloodDebt / unit);
    bloodDebt -= k * unit;
    if (k > 5) k = 5;                                /* a spray, not a flood */
    bloodT = 0.18;
    /* cap times floor is the ceiling: about forty particles a second no
       matter how many things are biting you. The flat four-per-call this
       replaced had no ceiling at all - it simply scaled with the size of
       the crowd, which is exactly backwards, because the crowd is when
       the frame budget is already gone. */
    Z.fx.burst(p.x, p.y + 0.1, 2 + Math.round(k * 1.2), '176,32,26',
               2.0 + k * 0.4);
  }

  function hurtCry(n, p, sev) {
    if (hurtSndT > 0) return;
    if (sev < 0.14) {
      /* a drizzle is still worth a noise, just not sixty of them */
      hurtAcc += n;
      if (hurtAcc < p.maxHp * 0.05) return;
      hurtAcc = 0;
    }
    hurtSndT = 0.30 - sev * 0.12;        /* harder hits may follow sooner */
    Z.sfx.play('hurt');
  }

  S.hurtDecay = function (dt) {
    if (hurtSndT > 0) hurtSndT -= dt;
    if (bloodT > 0) bloodT -= dt;
  };

  S.hurtPlayer = function (n) {
    var p = S.p;
    if (!p || p.dead) return;
    /* mid-dash you are not there to be hit */
    if (p.invuln > 0) return;
    /* Evasion first: a hit you slipped never happened, so there is no
       flash, no shake and no blood for it. */
    if (Math.random() < Z.upAdd('dodge')) {
      Z.fx.ring(p.x, p.y + 0.1, 0.55, '228,224,214', 0.26);
      Z.ui.hint('Dodged');
      return;
    }
    n *= Z.upCut('armor', 0.5);
    if (S.bloodMoon) n *= Z.upCut('blood', 0.5);
    p.hp -= n;
    /* how bad was this, as a share of what you can take */
    var sev = Z.clamp01(n / Math.max(1, p.maxHp * 0.06));
    var real = n > p.maxHp * 0.015;
    /* a held flash rather than a re-lit one: standing in acid used to
       re-light it every frame and pin the screen solid red */
    /* the renderer multiplies this by four and caps at .6, so even a
       quarter reads as a full red screen - a drizzle gets a tint */
    p.hurtFlash = Math.max(p.hurtFlash || 0, 0.04 + sev * 0.96);
    if (real) Z.cam.quake(Math.min(6, n * 0.25));
    bleed(n, p);
    /* Last Stand: the killing blow leaves you at a sliver instead, a
       set number of times a night. It resets when the night does, which
       is what makes it a night's insurance rather than an extra life. */
    if (p.hp <= 0 && (S.stands || 0) > 0) {
      S.stands--;
      p.hp = p.maxHp * 0.22;
      p.hurtFlash = 1;
      Z.cam.quake(7);
      Z.fx.ring(p.x, p.y + 0.1, 1.5, '227,166,63', 0.7);
      Z.ui.toast('Last Stand', 'Still up' +
        (S.stands ? ' \u2014 ' + S.stands + ' left tonight' : ''));
      Z.sfx.play('build');
      return;
    }
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true; p.deadT = 0;
      restartAnim(p, 'death');
      S.combo = 0;
      Z.sfx.play('death');
      Z.ui.toast('You went down', 'Everything you carried stays with you');
    } else {
      if (real || p.hitT <= 0) { p.hitT = clipLen('hit'); restartAnim(p, 'hit'); }
      hurtCry(n, p, sev);
    }
    Z.S.dirty = true;
  };

  /* ------------------------------------------------------------------ *
   * Zombies
   * ------------------------------------------------------------------ */
  function pickType(wave) {
    var pool = [];
    for (var k in Z.ZTYPES) {
      var t = Z.ZTYPES[k];
      if (t.boss) continue;
      if (wave < t.from) continue;
      if (t.night && !Z.world.isNight()) continue;
      var weight = 1 + Math.max(0, 6 - (wave - t.from) * 0.3);
      pool.push([t, weight]);
    }
    if (!pool.length) return Z.ZTYPES.shambler;
    var total = 0;
    pool.forEach(function (p) { total += p[1]; });
    var r = Math.random() * total, acc = 0;
    for (var i = 0; i < pool.length; i++) {
      acc += pool[i][1];
      if (r <= acc) return pool[i][0];
    }
    return pool[0][0];
  }

  /* The interior generator needs to pick a plausible type for whatever is
     standing in a building, on the same curve the waves use. */
  S.pickType = pickType;

  S.spawnZombie = function (type, x, y, wave) {
    /* never let one begin its night inside a wall */
    if (!free(x, y, 0.34)) {
      for (var er = 1; er <= 6 && !free(x, y, 0.34); er++) {
        for (var ek = 0; ek < 10; ek++) {
          var ea = (ek / 10) * TAU;
          var ex2 = x + Math.cos(ea) * er, ey2 = y + Math.sin(ea) * er;
          if (free(ex2, ey2, 0.34)) { x = ex2; y = ey2; break; }
        }
      }
    }
    var hpBase = Z.curve.zombieHp(wave) * type.hp;
    if (S.mod && S.mod.hp) hpBase *= S.mod.hp;
    var z = {
      id: S.nextId++, type: type, typeId: type.id,
      x: x, y: y, face: Math.PI / 2, size: type.size,
      hp: hpBase, maxHp: hpBase,
      armor: type.armor + (S.mod && S.mod.armorAdd ? S.mod.armorAdd : 0),
      spd: type.spd * (S.mod && S.mod.spd ? S.mod.spd : 1),
      anim: 'walk', animT: Math.random() * 2, frame: 0,
      cool: 0, burn: 0, chill: 0, flashT: 0, marked: 0,
      dying: false, dieT: 0, wave: wave, tgt: null, wander: null
    };
    S.zombies.push(z);
    return z;
  };

  function hurtZombie(zb, dmg, crit, st, ang) {
    if (zb.dying) return;
    var heavy = zb.type.heavy || 0;
    zb.hp -= dmg;
    zb.flashT = heavy ? 0.2 : 0.14;
    Z.fx.num(zb.x, zb.y, Math.round(dmg) + (crit ? '!' : ''),
             crit ? '227,166,63' : '226,222,212', crit);
    /* Spray, and something left on the ground afterwards.

       There was blood already but it was three particles that vanished,
       so a firefight left the ground exactly as clean as it started.
       Most of a hit landing is what is still there a second later. */
    var big = (crit ? 1.9 : 1) * (1 + heavy * 0.3);
    /* A round into something heavy is a different event: it lands with
       a thud rather than a slap, it throws more off, and it shifts the
       camera a little. The feedback is most of what tells you that the
       health bar creeping down is normal rather than broken. */
    if (heavy) {
      Z.sfx.play('thud');
      if (crit || Math.random() < 0.3) Z.cam.quake(0.8 + heavy * 0.5);
      Z.fx.spark(zb.x, zb.y + 0.3 * zb.size, (ang == null ? Math.random() * TAU : ang),
                 3 + heavy * 2, '206,196,178', 3.2);
    }
    if (ang == null) Z.fx.burst(zb.x, zb.y + 0.2, Math.round(9 * big), '138,26,22', 3.0);
    else {
      Z.fx.spark(zb.x, zb.y + 0.2, ang, Math.round(13 * big), '150,30,24', crit ? 5.4 : 3.8);
      Z.fx.burst(zb.x, zb.y + 0.2, Math.round(5 * big), '108,18,16', 2.2);
    }
    /* a splash on the ground, thrown the way the round was going */
    var sa = ang == null ? Math.random() * TAU : ang;
    var sd = 0.25 + Math.random() * 0.5 * big;
    Z.fx.decal(zb.x + Math.cos(sa) * sd, zb.y + Math.sin(sa) * sd * 0.6,
               (0.20 + Math.random() * 0.22) * big, '96,16,14');
    if (crit) Z.fx.flash(zb.x, zb.y + 0.3, 0.7, 0.5, '190,40,30', 0.08);
    /* Light things flinch, heavy things do not. A hulk that staggers
       every time a pistol round touches it is not heavy, whatever its
       health bar says. */
    if (zb.anim === 'walk' && (!heavy || Math.random() < 0.3 / heavy)) {
      zb.anim = 'hit'; zb.animT = 0; zb.frame = 0;
    }
    if (zb.hp <= 0) killZombie(zb, st);
  }
  S.hurtZombie = hurtZombie;

  /* A coin arriving at the player.

     This is the seam between the two halves of the effect: the physical
     coin ends here and the screen coin starts here, in the same call, so
     they read as one movement rather than as a world effect and an
     unrelated UI animation. Small change is batched - forty coins in two
     seconds should not be forty counter pops and forty sounds - but the
     batch still flies as a group and still lands as one satisfying hit. */
  var coinBatch = 0, coinBatchT = 0, coinChain = 0;

  var coinSndT = 0;

  S.takeCoin = function (value, x, y) {
    S.give('coin', value);
    coinBatch += value;
    coinBatchT = 0.12;
    coinChain = Math.min(12, coinChain + 1);
    /* One sound per coin is not a chime, it is a burst of static: eight
       of them land inside a second and the samples pile on top of each
       other into a click. Rate-limited to roughly seven a second, which
       still reads as a run of coins rather than as one event. */
    if (coinSndT <= 0) { coinSndT = 0.14; Z.sfx.play('pickup'); }
  };

  S.flushCoins = function (dt) {
    if (coinBatchT > 0) {
      coinBatchT -= dt;
      if (coinBatchT <= 0 && coinBatch > 0) {
        var p = S.p;
        if (p && Z.ui.flyRes) Z.ui.flyRes(p.x, p.y - 0.4, { coin: coinBatch });
        if (Z.ui.resPop) Z.ui.resPop('coin');
        if (coinBatch >= 40) {
          Z.fx.num(p.x, p.y - 1.1, '+' + Z.fmt(Math.round(coinBatch)), '255,214,120');
          Z.cam.shake = Math.min(2.2, (Z.cam.shake || 0) + 0.7);
        }
        coinBatch = 0;
      }
    }
    if (coinSndT > 0) coinSndT -= dt;
    S.hurtDecay(dt);
    if (coinChain > 0) coinChain = Math.max(0, coinChain - dt * 3.2);
  };

  function killZombie(zb, st) {
    zb.dying = true; zb.dieT = 0;
    zb.anim = 'death'; zb.animT = 0; zb.frame = 0;
    Z.fx.decal(zb.x, zb.y, 0.5 * zb.size, '58,14,12');
    Z.fx.burst(zb.x, zb.y + 0.2, 10, '138,26,22', 3.2);
    Z.sfx.play('kill');

    var cash = Z.curve.zombieCash(zb.wave) * zb.type.cash *
               (S.mod && S.mod.cash ? S.mod.cash : 1) * (st ? st.cashMult : Z.curStats().cashMult);
    /* The money is dropped, not granted. It lands where the body did and
       has to be walked over - which is what turns a number going up into
       a thing you did. `FX.coin` decides how many objects that is worth
       and merges into what is already on the ground once the ceiling is
       reached, so a blood moon does not become three hundred bouncing
       discs. Crediting happens when each one reaches the player. */
    Z.fx.coin(zb.x, zb.y + 0.15, cash, S.takeCoin);
    if (Math.random() < 0.22) {
      var drop = Math.random() < 0.5 ? 'scrap' : 'cloth';
      var n = 1 + Math.floor(Math.random() * 3);
      S.give(drop, n);
    }
    Z.S.kills++;
    S.combo++; S.comboT = 3.2;
    S.addXp(zb.type.boss ? 120 : 3);
    /* Adrenaline - a kill gives a little back, which is what turns a
       Survival build into a way of playing rather than a bigger number */
    var bleed = Z.upAdd('lifest');
    if (bleed > 0 && S.p && !S.p.dead && S.p.hp < S.p.maxHp) {
      S.p.hp = Math.min(S.p.maxHp, S.p.hp + bleed * (zb.type.boss ? 8 : 1));
    }

    if (zb.type.explodes) {
      splash(zb.x, zb.y, 2.6, zb.maxHp * 0.6, null);
      Z.fx.flash(zb.x, zb.y, 0.6, 2.6, '255,180,80', 0.22);
      Z.cam.quake(5);
      if (S.p && Z.dist(S.p.x, S.p.y, zb.x, zb.y) < 2.6) S.hurtPlayer(zb.type.dmg * 0.6);
    }
    /* Only this night's dead count against this night. Stragglers left
       over from an earlier wave, ambient roamers and anything killed
       indoors used to decrement the counter too, which could close a
       night early - and now that dawn leaves stragglers alive, that would
       happen most nights. Ambient spawns are already tagged one wave
       back, so the wave number is enough to tell them apart. */
    if (S.inWave && !zb.indoor && zb.wave === S.wave) {
      S.waveLeft--;
      if (S.waveLeft <= 0 && S.spawnLeft <= 0) endWave();
    }
    Z.S.dirty = true;
  }

  /* one scratch vector for the whole horde - a fresh object per zombie
     per frame is a few hundred allocations a second for nothing */
  var STEER = { x: 0, y: 0 };

  /* ---- who is standing next to whom ----

     Keeping a horde from collapsing into one point means every body
     pushing away from every body near it, and the old code found "near"
     by walking the entire list. At forty zombies that is 1,600 distance
     checks a frame and nobody notices. The brief asks for hundreds: at
     four hundred it is 160,000 a frame, which is the entire budget.

     So they go into a coarse grid once per frame - two metres a cell,
     which is wider than anything can reach - and each one then looks at
     nine cells instead of the whole map. The work stops growing with
     the square of the horde and starts growing with its size. */
  var CELL = 2, GW = 0, gridBuckets = null, gridStamp = 0, gridTick = 0;

  function buildNeighbourGrid() {
    GW = Math.ceil(Z.world.SIZE / CELL) + 1;
    if (!gridBuckets || gridBuckets.length !== GW * GW) {
      gridBuckets = new Array(GW * GW);
      gridStamp = new Int32Array(GW * GW);
      gridTick = 0;
    }
    gridTick++;
    for (var i = 0; i < S.zombies.length; i++) {
      var z = S.zombies[i];
      if (z.dying) continue;
      var gi = ((z.y / CELL) | 0) * GW + ((z.x / CELL) | 0);
      if (gi < 0 || gi >= gridBuckets.length) continue;
      if (gridStamp[gi] !== gridTick) {
        gridStamp[gi] = gridTick;
        if (gridBuckets[gi]) gridBuckets[gi].length = 0;
        else gridBuckets[gi] = [];
      }
      gridBuckets[gi].push(z);
    }
  }

  /* the push away from everybody within arm's length */
  function separation(zb, out) {
    out.x = 0; out.y = 0;
    if (!gridBuckets) return;
    var gx = (zb.x / CELL) | 0, gy = (zb.y / CELL) | 0;
    for (var oy = -1; oy <= 1; oy++) {
      for (var ox = -1; ox <= 1; ox++) {
        var gi = (gy + oy) * GW + (gx + ox);
        if (gi < 0 || gi >= gridBuckets.length) continue;
        if (gridStamp[gi] !== gridTick) continue;
        var list = gridBuckets[gi];
        for (var j = 0; j < list.length; j++) {
          var o = list[j];
          if (o === zb) continue;
          var dx2 = zb.x - o.x, dy2 = zb.y - o.y;
          var od = dx2 * dx2 + dy2 * dy2;
          if (od < 0.44 && od > 0.0001) {
            var k = 1 / Math.sqrt(od);
            out.x += dx2 * k * 0.4; out.y += dy2 * k * 0.4;
          }
        }
      }
    }
  }
  var SEP = { x: 0, y: 0 };
  function FXLIGHT(zb) { Z.fx.light(zb.x, zb.y - 0.5, 2.4, 0.4, '236,90,60'); }

  function stepZombies(dt, time) {
    var p = S.p;
    var out = [];
    buildNeighbourGrid();
    for (var i = 0; i < S.zombies.length; i++) {
      var zb = S.zombies[i];

      if (zb.dying) {
        zb.dieT += dt;
        stepAnim(zb, dt, Z.art.ZANIMS);
        if (zb.dieT > 1.2) {
          /* A body remembers which side of a door it fell on, so the
             ones left in a shop do not turn up lying in the street. */
          S.corpses.push({ x: zb.x, y: zb.y, face: zb.face, size: zb.size,
                           typeId: zb.typeId, t: 0, indoor: !!zb.indoor });
          if (S.corpses.length > 40) S.corpses.shift();
          continue;
        }
        out.push(zb);
        continue;
      }

      /* Nothing this far away is part of anyone's game.

         The widest field of view shows about forty tiles across, so at
         seventy-eight a zombie is not merely off screen, it is most of a
         map away - and it still costs a path lookup, a separation query
         and an animation step every frame. Wave bodies are exempt while
         their night is running, or a horde could quietly evaporate on its
         way in. */
      if (!zb.indoor && !(S.inWave && zb.wave === S.wave) &&
          p && Z.dist(zb.x, zb.y, p.x, p.y) > 78) continue;

      zb.flashT = Math.max(0, zb.flashT - dt);
      zb.marked = Math.max(0, zb.marked - dt);
      if (zb.burn > 0) {
        zb.burn -= dt;
        zb.hp -= zb.maxHp * 0.10 * dt;
        if (zb.hp <= 0) { killZombie(zb); out.push(zb); continue; }
      }
      var spd = zb.spd * (zb.chill > 0 ? 0.5 : 1) * (S.bloodMoon ? 1.32 : 1);
      if (zb.chill > 0) zb.chill -= dt;

      /* ---- pick something to walk at ---- */
      var tx, ty, tgtB = null;
      var pd = p && !p.dead ? Z.dist(zb.x, zb.y, p.x, p.y) : 1e9;
      var core = S.core();
      /* On a blood moon nothing wanders and nothing gets distracted:
         every one of them is walking at the compound until something is
         close enough to bite. */
      /* Gunfire carries: whatever was last fired widens the range at
         which the horde notices you, and a suppressor cuts it to a
         quarter - the effect that attachment has always described in
         its blurb and never actually had. */
      var hear = (S.bloodMoon ? 9 : 13) + (S.noiseR || 0);
      var seek = null;
      if (zb.detour > 0) zb.detour -= dt;
      if (zb.detour > 0 && zb.wander) {
        /* committed to going round something for a moment */
        tx = zb.wander.x; ty = zb.wander.y;
        if (Z.dist(zb.x, zb.y, tx, ty) < 1.2) zb.detour = 0;
      }
      else if (pd < hear) { tx = p.x; ty = p.y; seek = 'hero'; }
      else if ((S.inWave || S.bloodMoon) && core) { tx = core.x; ty = core.y; seek = 'core'; }
      else if (zb.wander && Z.dist(zb.x, zb.y, zb.wander.x, zb.wander.y) > 1.2) {
        tx = zb.wander.x; ty = zb.wander.y;
      } else {
        /* aimless drift by day; light repels them */
        var a = Math.random() * TAU, rr = 4 + Math.random() * 10;
        zb.wander = { x: Z.clamp(zb.x + Math.cos(a) * rr, 2, Z.world.SIZE - 2),
                      y: Z.clamp(zb.y + Math.sin(a) * rr, 2, Z.world.SIZE - 2) };
        tx = zb.wander.x; ty = zb.wander.y;
      }

      var d = Z.dist(zb.x, zb.y, tx, ty) || 1;
      var dx, dy;
      /* Something it actually wants gets the shared field: a way round
         the wall rather than a bearing into it. Wandering does not -
         drifting is meant to be aimless, and a drifter that pathfinds
         perfectly to a random tile reads as purposeful. */
      if (zb.noLos > 0) zb.noLos -= dt;
      if (seek && Z.flow) {
        if (zb.noLos > 0) {
          /* field only - the direct line is what it just failed at */
          var f = seek === 'hero' ? Z.flow.hero : Z.flow.core;
          if (!(f.live && f.dir(zb.x, zb.y, STEER))) {
            Z.flow.steer(zb.x, zb.y, tx, ty, seek, STEER);
          }
        } else {
          Z.flow.steer(zb.x, zb.y, tx, ty, seek, STEER);
        }
        dx = STEER.x; dy = STEER.y;
      } else {
        dx = (tx - zb.x) / d; dy = (ty - zb.y) / d;
      }
      zb.face = Math.atan2(dy, dx);

      /* ------------------------------------------------------------ *
       * What this one does that the others do not
       *
       * All of it hangs off the steering that has already been worked
       * out above, so a special never loses the pathfinding - a leaper
       * still routes round a wall on its way to a place worth leaping
       * from, and a burrower surfaces on ground the field says is
       * reachable.
       * ------------------------------------------------------------ */
      var T = zb.type;

      /* ---- the Abomination turns ---- */
      if (T.enrage && !zb.enraged && zb.hp <= zb.maxHp * T.enrage) {
        zb.enraged = 1;
        zb.spd *= 1.5;
        zb.rageDmg = 1.6;
        Z.fx.ring(zb.x, zb.y, 2.6, '226,70,50', 0.7);
        Z.fx.burst(zb.x, zb.y + 0.3, 22, '210,60,44', 5);
        Z.fx.flash(zb.x, zb.y - 0.5, 1.0, 4.4, '255,90,60', 0.26);
        Z.cam.quake(7);
        Z.sfx.play('slam');        /* the deepest hit the kit has */
      }
      if (zb.enraged) {
        /* it keeps steaming for the rest of the fight */
        if (Math.random() < dt * 9) {
          Z.fx.burst(zb.x + (Math.random() - 0.5) * zb.size,
                     zb.y - 0.4 - Math.random() * 0.6, 1, '226,86,60', 1.1);
        }
        FXLIGHT(zb);
      }

      /* ---- the Harbinger hangs back and keeps them coming ---- */
      if (T.keepAway && p && !p.dead) {
        if (pd < T.keepAway) {
          /* back off along the line it came in on, rather than turning
             its back and walking into whatever is behind it */
          dx = -(p.x - zb.x) / (pd || 1);
          dy = -(p.y - zb.y) / (pd || 1);
          zb.face = Math.atan2(p.y - zb.y, p.x - zb.x);   /* still facing you */
        }
      }
      if (T.summons) {
        zb.sumCd = (zb.sumCd || 3 + Math.random() * 2) - dt;
        if (zb.sumCd <= 0 && S.zombies.length < 200) {
          zb.sumCd = 7 + Math.random() * 4;
          zb.anim = 'lunge'; zb.animT = 0; zb.frame = 0;
          Z.fx.ring(zb.x, zb.y, 2.2, '196,130,246', 0.6);
          Z.fx.flash(zb.x, zb.y - 0.6, 0.7, 3.2, '188,120,255', 0.22);
          Z.sfx.play('level');
          var born = 2 + (S.bloodMoon ? 2 : 0);
          for (var sN = 0; sN < born; sN++) {
            var sa = Math.random() * TAU, sr = 1.1 + Math.random() * 0.9;
            var sx2 = zb.x + Math.cos(sa) * sr, sy2 = zb.y + Math.sin(sa) * sr;
            if (!free(sx2, sy2, 0.3)) continue;
            var kid = S.spawnZombie(Z.ZTYPES.swarm, sx2, sy2, zb.wave);
            if (kid) Z.fx.burst(sx2, sy2, 7, '188,120,255', 2.6);
          }
        }
      }

      /* ---- the Leaper gathers, then crosses in one go ---- */
      if (T.leap && p && !p.dead) {
        zb.leapCd = Math.max(0, (zb.leapCd || 0) - dt);
        if (zb.leaping > 0) {
          /* airborne: no steering, no collision, it is committed */
          zb.leaping -= dt;
          zb.z = Math.sin((1 - zb.leaping / zb.leapDur) * Math.PI) * 1.5;
          zb.x += zb.lvx * dt; zb.y += zb.lvy * dt;
          if (zb.leaping <= 0) {
            zb.z = 0; zb.leapCd = 4.5 + Math.random() * 2;
            Z.fx.ring(zb.x, zb.y, 1.1, '150,190,150', 0.34);
            Z.fx.burst(zb.x, zb.y, 8, '120,150,110', 2.4);
            Z.cam.quake(2);
            if (Z.dist(zb.x, zb.y, p.x, p.y) < 1.5) {
              S.hurtPlayer(T.dmg * (1 + zb.wave * 0.06) * 1.4);
            }
          }
          out.push(zb);
          continue;                      /* nothing else applies mid-air */
        }
        if (zb.charge > 0) {
          /* wound up and telegraphing - this is the window to move */
          zb.charge -= dt;
          if (Math.random() < dt * 14) {
            Z.fx.burst(zb.x, zb.y, 1, '180,220,170', 1.4);
          }
          if (zb.charge <= 0) {
            var ld = pd || 1;
            zb.leapDur = Math.min(0.62, 0.2 + ld * 0.055);
            zb.lvx = (p.x - zb.x) / zb.leapDur;
            zb.lvy = (p.y - zb.y) / zb.leapDur;
            zb.leaping = zb.leapDur;
            zb.anim = 'lunge'; zb.animT = 0; zb.frame = 0;
            Z.sfx.play('dash');        /* the same air-move the player's dash uses */
          }
          out.push(zb);
          continue;                      /* rooted while it winds up */
        }
        if (zb.leapCd <= 0 && pd > 3.2 && pd < 9.5 &&
            (!Z.flow || Z.flow.sees(zb.x, zb.y, p.x, p.y))) {
          zb.charge = 0.55;
          Z.fx.ring(zb.x, zb.y, 1.5, '170,220,160', 0.55);
          Z.sfx.play('tick');
        }
      }

      /* ---- the Burrower goes under it ---- */
      if (T.burrow && p && !p.dead) {
        zb.digCd = Math.max(0, (zb.digCd || 2) - dt);
        if (zb.under > 0) {
          zb.under -= dt;
          /* straight at the player and untouchable, but it leaves a
             mound so the ground tells you where it is */
          var bd = pd || 1;
          zb.x += ((p.x - zb.x) / bd) * spd * 2.1 * dt;
          zb.y += ((p.y - zb.y) / bd) * spd * 2.1 * dt;
          if (Math.random() < dt * 26) {
            Z.fx.burst(zb.x, zb.y, 2, '124,100,64', 1.8);
          }
          if (zb.under <= 0 || bd < 1.6) {
            zb.under = 0; zb.digCd = 8 + Math.random() * 4;
            /* the warning is the second before it is out, not after */
            Z.fx.ring(zb.x, zb.y, 1.8, '150,122,78', 0.5);
            Z.fx.burst(zb.x, zb.y, 20, '124,100,64', 4.2);
            Z.cam.quake(3.5);
            Z.sfx.play('thud');
            eject(zb);
          }
          out.push(zb);
          continue;                      /* no collision while under */
        }
        if (zb.digCd <= 0 && pd > 6 && pd < 34) {
          zb.under = Math.min(4.5, pd / (spd * 2.1));
          Z.fx.burst(zb.x, zb.y, 16, '124,100,64', 3.6);
          Z.fx.ring(zb.x, zb.y, 1.4, '150,122,78', 0.45);
          Z.sfx.play('thud');
          out.push(zb);
          continue;
        }
      }

      /* ---- attack whatever is in the way ---- */
      zb.cool -= dt;
      var reach = 0.55 + zb.size * 0.35;
      var hitPlayer = p && !p.dead && pd < reach + 0.35;
      var block = blockerAt(zb.x + dx * (reach + 0.2), zb.y + dy * (reach + 0.2));

      if (zb.type.ranged && pd < 8 && pd > 2 &&
          (!Z.flow || Z.flow.sees(zb.x, zb.y, p.x, p.y))) {
        if (zb.cool <= 0) {
          zb.cool = 2.6;
          zb.anim = 'lunge'; zb.animT = 0; zb.frame = 0;
          S.spits.push({ x: zb.x, y: zb.y, tx: p.x, ty: p.y, t: 0,
                         dur: pd / 9, dmg: zb.type.dmg * (1 + zb.wave * 0.05) });
        }
      } else if (hitPlayer) {
        if (zb.cool <= 0) {
          var hv = zb.type.heavy || 0;
          zb.cool = 1.15 + hv * 0.35;        /* slower, but it hurts */
          zb.anim = 'lunge'; zb.animT = 0; zb.frame = 0;
          S.hurtPlayer(zb.type.dmg * (1 + zb.wave * 0.07) * (zb.rageDmg || 1));
          if (hv) { Z.cam.quake(3 + hv * 2.2); Z.sfx.play('slam'); }
        }
      } else if (block) {
        if (zb.cool <= 0) {
          zb.cool = 1.05;
          zb.anim = 'lunge'; zb.animT = 0; zb.frame = 0;
          hurtBuilding(block, zb.type.dmg * (1 + zb.wave * 0.08) * 1.4);
          if (block.def.thorns) {
            hurtZombie(zb, block.def.thorns * Z.bScale(block.lvl) * Z.upMul('thorns'),
                       false, null);
          }
        }
      } else {
        /* a little separation so a horde does not collapse to one point */
        separation(zb, SEP);
        var moved = moveBody(zb, (dx + SEP.x) * spd * dt, (dy + SEP.y) * spd * dt,
                             0.26 * zb.size);
        /* Did that actually get anywhere? Measured against the ground
           rather than against the attempt, because a body pressed into a
           corner tries just as hard as one in open country. */
        var gx = zb.x - (zb.px == null ? zb.x : zb.px);
        var gy = zb.y - (zb.py == null ? zb.y : zb.py);
        zb.px = zb.x; zb.py = zb.y;
        if (!moved || (gx * gx + gy * gy) < (spd * dt * 0.3) * (spd * dt * 0.3)) {
          zb.stuck = (zb.stuck || 0) + dt;
        } else if (zb.stuck) {
          zb.stuck = Math.max(0, zb.stuck - dt * 2);
        }
        if (zb.stuck > 0.55) {
          /* inside something: put it back on the map */
          if (!eject(zb)) {
            /* outside something: stop trusting the straight line, and
               slide along whatever is in the way while the field works */
            zb.noLos = 1.6;
            var slide = (zb.slide = -(zb.slide || 1));
            moveBody(zb, -dy * slide * spd * dt * 1.5,
                     dx * slide * spd * dt * 1.5, 0.26 * zb.size);
          }
          zb.stuck = 0;
        }
        if (zb.anim !== 'walk' && (zb.animDone || zb.anim === 'hit')) {
          zb.anim = 'walk'; zb.animT = Math.random(); zb.frame = 0;
        }
      }

      /* traps under foot */
      var fi = Z.world.idx(Math.floor(zb.x), Math.floor(zb.y));
      if (Z.world.inside(Math.floor(zb.x), Math.floor(zb.y)) && Z.world.occ[fi]) {
        var tb = S.buildingById(Z.world.occ[fi]);
        if (tb && tb.def.trap && !tb.dead) {
          zb.hp -= tb.def.trap * Z.bScale(tb.lvl) * Z.upMul('traps') * dt;
          if (zb.hp <= 0) { killZombie(zb); out.push(zb); continue; }
        }
      }

      /* Something this size puts its weight down and you feel it - but
         only if it is near enough to be your problem, or every distant
         brute on the map shakes the screen at once. */
      if (zb.type.heavy >= 2 && zb.anim === 'walk' && p) {
        var fp = zb.frame;
        if (fp !== zb.lastFoot && (fp === 1 || fp === 4)) {
          zb.lastFoot = fp;
          var fd = Z.dist(zb.x, zb.y, p.x, p.y);
          if (fd < 13) {
            Z.cam.quake((1 - fd / 13) * (zb.type.heavy >= 3 ? 3.4 : 2.1));
            Z.sfx.play('stomp');
            Z.fx.burst(zb.x, zb.y, 2, '128,118,100', 1.4);
          }
        }
      }
      if (zb.anim === 'lunge' || zb.anim === 'hit') {
        stepAnim(zb, dt, Z.art.ZANIMS);
        if (zb.animDone) { zb.anim = 'walk'; zb.animT = 0; }
      } else {
        stepAnim(zb, dt, Z.art.ZANIMS);
      }
      out.push(zb);
    }
    S.zombies = out;

    for (var c = S.corpses.length - 1; c >= 0; c--) {
      S.corpses[c].t += dt;
      if (S.corpses[c].t > 22) S.corpses.splice(c, 1);
    }

    /* spitter projectiles */
    for (var s = S.spits.length - 1; s >= 0; s--) {
      var sp = S.spits[s];
      sp.t += dt;
      var k2 = sp.t / sp.dur;
      if (k2 >= 1) {
        Z.fx.burst(sp.tx, sp.ty, 12, '108,170,96', 3.0);
        Z.fx.decal(sp.tx, sp.ty, 0.7, '46,72,40');
        Z.fx.ring(sp.tx, sp.ty, 1.1, '126,196,104', 0.4);
        if (p && !p.dead && Z.dist(p.x, p.y, sp.tx, sp.ty) < 1.1) S.hurtPlayer(sp.dmg);
        /* and it keeps burning where it fell - standing in it is the
           mistake a spitter is trying to make you make */
        S.pools.push({ x: sp.tx, y: sp.ty, r: 1.25, t: 0,
                       life: 4.5, dmg: sp.dmg * 0.55 });
        if (S.pools.length > 14) S.pools.shift();
        S.spits.splice(s, 1);
        continue;
      }
      /* the glob itself is drawn by the renderer - it used to be a
         zero-length tracer here, which is to say nothing at all */
    }
  }

  function blockerAt(x, y) {
    var tx = Math.floor(x), ty = Math.floor(y);
    if (!Z.world.inside(tx, ty)) return null;
    var id = Z.world.occ[Z.world.idx(tx, ty)];
    if (!id) return null;
    var b = S.buildingById(id);
    return b && !b.dead ? b : null;
  }

  function hurtBuilding(b, n) {
    b.hp -= n;
    b.hurt = 0.4;
    Z.fx.burst(b.x, b.y + 0.2, 3, '150,140,124', 2);
    if (b.hp <= 0) {
      b.hp = 0;
      b.dead = true;
      stampBuilding(b, false);
      Z.fx.burst(b.x, b.y, 22, '120,112,100', 4.2);
      Z.fx.smoke(b.x, b.y, 8);
      Z.cam.quake(4);
      Z.sfx.play('break');
      Z.ui.toast(b.def.name + ' destroyed', 'Rebuild it before the next night');
      /* rubble is left behind: losing a structure costs you the ground too */
      setTimeout(function () {
        delete S.bIndex[b.id];
        var i = S.buildings.indexOf(b);
        if (i >= 0) S.buildings.splice(i, 1);
      }, 2400);
      S.gridDirty = true;
    }
    Z.S.dirty = true;
  }
  S.hurtBuilding = hurtBuilding;

  S.repair = function (b) {
    if (!b || b.dead || b.hp >= b.maxHp) return false;
    var missing = 1 - b.hp / b.maxHp;
    var cost = {};
    var rk = Z.upCut('brepair', 0.4);
    for (var k in b.def.cost) {
      var n = Math.ceil(b.def.cost[k] * missing * 0.4 * b.lvl * rk);
      if (n > 0) cost[k] = n;
    }
    if (!S.spend(cost)) return false;
    b.hp = b.maxHp;
    Z.fx.ring(b.x, b.y, 0.8, '127,164,92', 0.5);
    Z.sfx.play('build');
    return true;
  };

  S.upgradeBuilding = function (b) {
    if (!b || b.dead || b.lvl >= Z.BMAXLVL) return false;
    var cost = Z.bUpCost(b.def, b.lvl);
    if (!S.spend(cost)) return false;
    b.lvl++;
    b.maxHp = b.def.hp * Z.bHpScale(b.lvl) * Z.upMul('bhp');
    b.hp = b.maxHp;
    Z.fx.ring(b.x, b.y, 1.0, '227,166,63', 0.6);
    Z.sfx.play('build');
    S.gridDirty = true;
    Z.S.dirty = true;
    return true;
  };

  /* ------------------------------------------------------------------ *
   * Turrets
   * ------------------------------------------------------------------ */
  function stepTurrets(dt) {
    var st = Z.curStats();
    for (var i = 0; i < S.buildings.length; i++) {
      var b = S.buildings[i];
      b.hurt = Math.max(0, (b.hurt || 0) - dt);
      b.flash = Math.max(0, b.flash - dt * 12);
      if (b.dead || !b.def.gun || !b.powered) continue;
      var g = b.def.gun;
      var sc = Z.bScale(b.lvl);
      var range = g.range * (0.6 + sc * 0.4) * Z.upMul('trange');
      if (S.mod && S.mod.range) range *= S.mod.range;

      /* A turret shoots at what it can see. It used to pick the nearest
         body in range whatever was between them, so a gun behind a wall
         emptied itself into its own masonry all night. */
      var best = null, bd = range * range;
      for (var j = 0; j < S.zombies.length; j++) {
        var zb = S.zombies[j];
        if (zb.dying) continue;
        var d = Z.dist2(b.x, b.y, zb.x, zb.y);
        if (d >= bd) continue;
        if (Z.flow && !Z.flow.sees(b.x, b.y + 0.35, zb.x, zb.y)) continue;
        bd = d; best = zb;
      }
      if (!best) continue;
      var want = Math.atan2(best.y - b.y, best.x - b.x);
      b.ang = Z.angTo(b.ang, want, dt * 6);
      if (Math.abs(Z.angDiff(b.ang, want)) > 0.35) continue;

      b.cool -= dt;
      if (b.cool > 0) continue;
      b.cool = 1 / (g.rps * Z.upMul('trate'));
      b.flash = 1;
      var dmg = g.dmg * sc * st.turretMult;
      var tcrit = Math.random() < Z.upAdd('tcrit');
      if (tcrit) dmg *= 2.2;
      var hz = (b.def.art === 'tower' ? 2.4 : 0.7);

      if (g.special === 'chain') {
        var chain = [best], last = best;
        for (var c = 0; c < 2; c++) {
          var nx = null, nd = 9;
          for (var k = 0; k < S.zombies.length; k++) {
            var o = S.zombies[k];
            if (o.dying || chain.indexOf(o) >= 0) continue;
            var dd = Z.dist2(last.x, last.y, o.x, o.y);
            if (dd < nd) { nd = dd; nx = o; }
          }
          if (!nx) break;
          chain.push(nx); last = nx;
        }
        var prev = { x: b.x, y: b.y };
        chain.forEach(function (t) {
          Z.fx.beam(prev.x, prev.y, t.x, t.y, '176,206,255', 2.4, 0.14);
          hurtZombie(t, dmg * (1 - t.armor), false, st);
          prev = t;
        });
      } else if (g.special === 'pierce') {
        var ang = b.ang, dx = Math.cos(ang), dy = Math.sin(ang);
        Z.fx.beam(b.x, b.y, b.x + dx * range, b.y + dy * range, '240,232,255', 5, 0.24);
        for (var q = 0; q < S.zombies.length; q++) {
          var zq = S.zombies[q];
          if (zq.dying) continue;
          var rx = zq.x - b.x, ry = zq.y - b.y;
          var t2 = rx * dx + ry * dy;
          if (t2 < 0 || t2 > range) continue;
          var ox = rx - dx * t2, oy = ry - dy * t2;
          if (ox * ox + oy * oy > 0.7) continue;
          hurtZombie(zq, dmg * (1 - zq.armor), false, st);
        }
        Z.cam.quake(3);
      } else if (g.special === 'splash') {
        Z.fx.flash(best.x, best.y, 0.5, 2.2, '255,190,90', 0.24);
        splash(best.x, best.y, 2.4, dmg, st);
        Z.cam.quake(2.5);
      } else {
        Z.fx.tracer(b.x, b.y, best.x, best.y, hexRgb(g.color), 1.4, hz, 0.9);
        hurtZombie(best, dmg * (1 - best.armor), false, st);
        if (g.special === 'burn') best.burn = Math.max(best.burn, 2.6);
        if (g.special === 'slow') best.chill = 2.2;
      }
    }
  }

  function hexRgb(h) {
    var c = Z.hex(h);
    return c[0] + ',' + c[1] + ',' + c[2];
  }

  /* ------------------------------------------------------------------ *
   * Waves
   *
   * Night is the wave. Nothing announces a scene change: the light goes,
   * the threat meter climbs, and things start walking in from the dark.
   * ------------------------------------------------------------------ */
  S.spawnLeft = 0;
  S.pools = [];            /* acid left on the ground by spitters */
  var spawnT = 0;

  function startWave(n) {
    S.wave = n;
    S.inWave = true;
    S.bloodMoon = Z.isBloodMoon(n);
    pickLanes(n);
    /* Last Stand recharges with the night, which is what makes it a
       night's insurance rather than a stack of extra lives. */
    S.stands = Z.upLv('revive');
    S.mod = null;
    if (n >= 5 && n % 3 === 2) {
      S.mod = Z.MODIFIERS[Math.floor(Math.random() * Z.MODIFIERS.length)];
    }
    var count = Z.curve.waveCount(n);
    if (S.mod && S.mod.count) count = Math.round(count * S.mod.count);
    S.spawnLeft = count;
    S.waveLeft = count;
    S.waveTotal = count;    /* what the objective card measures against */
    spawnT = 0;
    Z.S.wave = n;
    Z.S.bestWave = Math.max(Z.S.bestWave || 1, n);
    Z.ui.banner(S.bloodMoon ? 'BLOOD MOON' : 'NIGHT ' + n,
                S.bloodMoon
                  ? 'Night ' + n + '  ·  all of them, and they know where you live'
                  : (S.mod ? S.mod.name + ' - ' + S.mod.desc : 'They are coming'));
    Z.sfx.play('wave');
    if (Z.curve.isBoss(n)) {
      setTimeout(function () {
        if (!S.inWave) return;
        var pt = ringPoint(26);
        S.spawnZombie(Z.ZTYPES.boss, pt.x, pt.y, n);
        S.waveLeft++;
        S.waveTotal++;
        Z.ui.banner('ABOMINATION', 'Something big came with them');
      }, 9000);
    }
  }
  S.startWave = startWave;

  var DAWN_STRAGGLERS = 10;

  function endWave() {
    S.inWave = false;
    S.bloodMoon = false;
    S.mod = null;

    /* Thin what the night left standing.

       Dawn now closes the wave whatever survives, which is right - but
       every straggler that lives becomes permanent furniture, and the
       next night adds its own. Measured without this: 528 zombies by day
       20, and a single in-game day taking twenty-two seconds to simulate.
       That is not a difficulty curve, it is a leak.

       So a handful stay - the ones near enough to still be your problem,
       which is the mop-up this is meant to create - and the rest are
       taken to have drifted off into the ruins with the light. Anything
       mid-death or indoors is left alone; it is already on its way out or
       somewhere else entirely. */
    var p = S.p;
    if (p && S.zombies.length) {
      var left = [];
      for (var qi = 0; qi < S.zombies.length; qi++) {
        var zq = S.zombies[qi];
        if (zq.dying || zq.indoor || zq.wave !== S.wave) continue;
        left.push(zq);
      }
      if (left.length > DAWN_STRAGGLERS) {
        left.sort(function (a, b) {
          return Z.dist(a.x, a.y, p.x, p.y) - Z.dist(b.x, b.y, p.x, p.y);
        });
        var cull = {};
        for (var ci = DAWN_STRAGGLERS; ci < left.length; ci++) cull[left[ci].id] = 1;
        var keep = [];
        for (var ki = 0; ki < S.zombies.length; ki++) {
          if (!cull[S.zombies[ki].id]) keep.push(S.zombies[ki]);
        }
        S.zombies = keep;
      }
    }
    var reward = Math.round(Z.curve.zombieCash(S.wave) * 14);
    S.give('coin', reward);
    S.addXp(20 + S.wave * 3);
    Z.ui.banner('DAWN', 'Night ' + S.wave + ' survived  \u00B7  +' + Z.fmt(reward) + ' scrip');
    Z.sfx.play('clear');
    S.wave++;
    Z.S.wave = S.wave;
    Z.S.dirty = true;
  }

  /* A point on a ring around the compound, biased to the dark side. */
  /* A place on the perimeter that something can actually stand.

     The old fallback - "give up and use the point on the circle" -
     dropped bodies inside whatever happened to be there: a wall, a
     house, the middle of a wrecked car. They then spent the night
     shivering against geometry they could not leave. The fallback now
     walks outward looking for open ground, and only ever returns
     somewhere a body fits. */
  function ringPoint(r, ang, spread) {
    var core = S.core();
    var cx = core ? core.x : Z.world.CENTER, cy = core ? core.y : Z.world.CENTER;
    var a, x, y;
    for (var tries = 0; tries < 26; tries++) {
      a = ang == null ? Math.random() * TAU
                      : ang + (Math.random() - 0.5) * (spread || 0.5);
      x = Z.clamp(cx + Math.cos(a) * r, 2, Z.world.SIZE - 3);
      y = Z.clamp(cy + Math.sin(a) * r, 2, Z.world.SIZE - 3);
      if (free(x, y, 0.42) && S.litAt(x, y) < 0.45) return { x: x, y: y };
    }
    /* nothing dark and clear on that bearing - take clear over dark */
    a = ang == null ? Math.random() * TAU : ang;
    for (var out = 0; out < 30; out++) {
      var rr = r + out * 0.9;
      for (var k = 0; k < 6; k++) {
        var aa = a + (k - 2.5) * 0.22;
        x = Z.clamp(cx + Math.cos(aa) * rr, 2, Z.world.SIZE - 3);
        y = Z.clamp(cy + Math.sin(aa) * rr, 2, Z.world.SIZE - 3);
        if (free(x, y, 0.42)) return { x: x, y: y };
      }
    }
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  }

  /* ---- getting unstuck ----

     Two different failures look the same from the outside.

     One is standing INSIDE something: a wall put up on top of you, a
     spawn that squeezed through, a blast that shoved you into a
     building. Nothing walks out of that, because every direction it
     tries is blocked. The answer is to put the body back on open
     ground - spiral out from where it is and take the first tile that
     will hold it.

     The other is standing OUTSIDE something and not getting past it: a
     corner, a doorway two bodies wide, a queue. The body is free, it is
     just not making progress. The answer there is to stop taking the
     direct line and follow the field instead, which knows about the way
     round, and to slide along the obstacle while it does.  */
  function eject(zb) {
    if (free(zb.x, zb.y, 0.2)) return false;
    for (var ring = 1; ring <= 5; ring++) {
      for (var k = 0; k < 12; k++) {
        var a = (k / 12) * TAU;
        var nx = zb.x + Math.cos(a) * ring * 0.85;
        var ny = zb.y + Math.sin(a) * ring * 0.85;
        if (free(nx, ny, 0.3)) {
          zb.x = nx; zb.y = ny;
          zb.stuck = 0;
          return true;
        }
      }
    }
    return false;
  }

  /* ---- approaches ----

     Pressure from every compass point at once averages out to no
     pressure at all: you stand in the middle and turn on the spot. A
     night picks two or three bearings instead and feeds them in waves
     off those, moving them a little as the night wears on - so a side
     of the compound is the side under attack for a while, and then a
     different one is. */
  var lanes = [];
  function pickLanes(w) {
    var count = 2 + (w % 3 === 0 ? 1 : 0) + (S.bloodMoon ? 1 : 0);
    lanes = [];
    var base = Math.random() * TAU;
    for (var i = 0; i < count; i++) {
      lanes.push(base + (i / count) * TAU + (Math.random() - 0.5) * 0.7);
    }
  }
  function laneAngle(dt) {
    if (!lanes.length) pickLanes(S.wave);
    /* they drift, so the pressure walks round the perimeter */
    for (var i = 0; i < lanes.length; i++) lanes[i] += dt * 0.05;
    return lanes[(Math.random() * lanes.length) | 0];
  }

  function stepWaves(dt) {
    var night = Z.world.isNight();

    if (!S.inWave && night && Z.S.level >= 1) {
      startWave(Z.S.wave || 1);
    }
    if (S.inWave && !night) {
      /* Dawn ends the night, whatever is still standing.

         This was guarded on `S.spawnLeft > 0` and additionally required
         `S.waveLeft <= 0` before it would close the wave. So it was a
         one-shot that could only fire while bodies were still queued to
         spawn, and even then only if every one of them was already dead.
         Miss that window with a single straggler alive - one that
         wandered off, or got stuck on geometry - and `inWave` stayed true
         for good.

         Nothing recovers from that. `startWave` only fires on
         `!S.inWave`, so no night ever begins again; ambient spawning is
         gated on `!S.inWave` too, so the world stops producing zombies at
         all. Simulated twelve in-game days from that state and not one
         kill, coin, level or zombie count changed - the game was over
         without saying so.

         The night is over when the sun comes up. Whatever is still on its
         feet stays on its feet, as stragglers to mop up in daylight. */
      S.spawnLeft = 0;
      endWave();
    }

    /* The horde arrives at a rate the frame can carry.

       The curve asks for 342 bodies on wave 12 and 522 on wave 20, at a
       spawn gap of 0.12s in packs of seven - which is fifty-eight a
       second, so the entire night's worth lands in about nine seconds and
       then stands around. Measured on this machine: a full frame is 7ms
       at 220 zombies and 15ms at 320, and a phone is a good deal slower
       than this machine.

       Capping the number ALIVE rather than the number spawned keeps the
       whole wave to be fought - nothing is subtracted from the night -
       but meters it in as the player clears space, which both protects
       the frame and makes a wave last its night instead of resolving in
       the first ten seconds. Dawn still zeroes whatever never arrived, so
       being overwhelmed is not a permanent debt. */
    var liveCap = S.bloodMoon ? 210 : 165;
    if (S.inWave && S.spawnLeft > 0 && S.zombies.length >= liveCap) spawnT = 0.25;

    if (S.inWave && S.spawnLeft > 0 && S.zombies.length < liveCap) {
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = Z.curve.spawnGap(S.wave);
        var t = pickType(S.wave);
        /* a clump off one approach, not one body out of the whole dark */
        var n = Math.max(t.pack || 1, Z.curve.spawnPack(S.wave));
        var ang = laneAngle(dt);
        var rad = 22 + Math.random() * 12;
        for (var i = 0; i < n && S.spawnLeft > 0; i++) {
          var pt = ringPoint(rad + Math.random() * 5, ang, 0.34);
          S.spawnZombie(t, pt.x, pt.y, S.wave);
          S.spawnLeft--;
        }
        /* now and then a second group off a different bearing lands at
           the same moment, which is what makes a night feel unplanned */
        if (Math.random() < (S.bloodMoon ? 0.42 : 0.22) && S.spawnLeft > 0) {
          var t2 = pickType(S.wave);
          var a2 = laneAngle(0);
          var m = Math.min(S.spawnLeft, Math.ceil(n * 0.7));
          for (var k2 = 0; k2 < m; k2++) {
            var p2 = ringPoint(24 + Math.random() * 12, a2, 0.34);
            S.spawnZombie(t2, p2.x, p2.y, S.wave);
            S.spawnLeft--;
          }
        }
      }
    }

    /* ---- stragglers ----
       The map is never actually safe, and how unsafe depends on where you
       are standing. A suburban street keeps a couple of them about; the
       middle of town, a hospital, or a nest keeps a crowd. This is the
       risk half of the bargain the city offers - the districts with the
       best loot are the ones you cannot stand still in.

       Nothing spawns outdoors while the player is inside a building:
       everything out there would be pathing against the room's walls. */
    if (!S.inWave && !(Z.interior && Z.interior.active())) {
      var p = S.p;
      var risk = p && Z.city && Z.city.riskAt ? Z.city.riskAt(p.x, p.y) : 1;
      /* a nest nearby is worth more than the zone it sits in */
      if (p && Z.city && Z.city.nests) {
        for (var ni = 0; ni < Z.city.nests.length; ni++) {
          var nd = Z.dist(p.x, p.y, Z.city.nests[ni].x, Z.city.nests[ni].y);
          if (nd < 26) risk += (1 - nd / 26) * 1.8;
        }
      }
      var dark = 1 + Z.world.nightF() * 1.1;
      var cap = Math.round(4 + risk * 5 * dark);
      if (S.zombies.length < cap) {
        S.ambientT = (S.ambientT || 0) - dt;
        if (S.ambientT <= 0) {
          S.ambientT = (7 + Math.random() * 9) / Math.max(0.35, risk * dark);
          if (p) {
            var a = Math.random() * TAU, r = 24 + Math.random() * 18;
            var x = Z.clamp(p.x + Math.cos(a) * r, 2, Z.world.SIZE - 3);
            var y = Z.clamp(p.y + Math.sin(a) * r, 2, Z.world.SIZE - 3);
            /* the tougher types keep to the tougher ground */
            var lvl = Math.max(1, Math.round((S.wave - 2) * Z.clamp(risk * 0.8, 0.5, 2.2)));
            if (free(x, y, 0.3)) S.spawnZombie(pickType(lvl), x, y, Math.max(1, S.wave - 1));
          }
        }
      }
    }

    /* threat meter: what is actually near the compound right now */
    var core = S.core();
    var near = 0;
    if (core) {
      for (var z = 0; z < S.zombies.length; z++) {
        if (!S.zombies[z].dying && Z.dist(S.zombies[z].x, S.zombies[z].y, core.x, core.y) < 30) near++;
      }
    }
    S.threat = near;
  }

  /* ------------------------------------------------------------------ *
   * Tick
   * ------------------------------------------------------------------ */
  S.step = function (dt, time) {
    if (S.comboT > 0) { S.comboT -= dt; if (S.comboT <= 0) S.combo = 0; }
    /* One flood for the whole horde, before anything walks on it. */
    if (Z.flow) Z.flow.tick(dt);
    updatePower(dt);
    produce(dt);
    stepPlayer(dt, time);
    stepNades(dt);
    stepZombies(dt, time);
    stepTurrets(dt);
    stepWaves(dt);
    Z.fx.step(dt);
  };

  /* ------------------------------------------------------------------ *
   * Offline
   *
   * What the compound banked while you were gone. Production is real
   * (the buildings were there), defence is modelled, and nothing is paid
   * until the player taps Collect.
   * ------------------------------------------------------------------ */
  S.offlineReport = function (seconds) {
    var st = Z.curStats();
    var capped = Math.min(seconds, st.offCap);
    if (capped < 90) return null;
    var rate = st.offRate;
    for (var i = 0; i < S.buildings.length; i++) {
      if (!S.buildings[i].dead && S.buildings[i].def.idle) rate += S.buildings[i].def.idle;
    }
    rate = Math.min(1.25, rate);

    var res = {};
    var k, b;
    for (i = 0; i < S.buildings.length; i++) {
      b = S.buildings[i];
      if (b.dead || !b.def.makes) continue;
      var sc = Z.bScale(b.lvl);
      for (k in b.def.makes) {
        res[k] = (res[k] || 0) +
                 b.def.makes[k] * sc * Z.upMul('prod') * capped * rate * 0.55;
      }
    }

    /* the rearguard keeps working: turret dps against the night's hp */
    var tdps = 0;
    for (i = 0; i < S.buildings.length; i++) {
      b = S.buildings[i];
      if (b.dead || !b.def.gun) continue;
      tdps += b.def.gun.dmg * b.def.gun.rps * Z.bScale(b.lvl) * st.turretMult;
    }
    var avgHp = Z.curve.zombieHp(S.wave) * 1.4;
    var kps = Math.min(tdps / Math.max(1, avgHp), 1 / Z.curve.spawnGap(S.wave));
    var kills = Math.floor(kps * capped * rate * 0.5);
    var coin = kills * Z.curve.zombieCash(S.wave) * 1.2 * st.cashMult;
    if (coin > 0) res.coin = (res.coin || 0) + coin;

    var any = false;
    for (k in res) { res[k] = Math.floor(res[k]); if (res[k] > 0) any = true; else delete res[k]; }
    if (!any) return null;
    return { seconds: capped, real: seconds, res: res, kills: kills,
             capped: seconds > st.offCap, rate: rate, paid: false };
  };

  S.claimOffline = function (rep) {
    if (!rep || rep.paid) return;
    rep.paid = true;
    for (var k in rep.res) S.give(k, rep.res[k]);
    Z.S.kills += rep.kills || 0;
    Z.S.dirty = true;
  };

  /* ------------------------------------------------------------------ *
   * Picking - what is under this world point
   * ------------------------------------------------------------------ */
  S.pick = function (wx, wy) {
    /* zombies first: if something is on you, clicking means shoot it */
    var best = null, bd = 1.2;
    var i;
    for (i = 0; i < S.zombies.length; i++) {
      var zb = S.zombies[i];
      if (zb.dying) continue;
      var d = Z.dist(wx, wy, zb.x, zb.y) - 0.34 * zb.size;
      if (d < bd) { bd = d; best = { kind: 'zombie', obj: zb, x: zb.x, y: zb.y, h: 1.9 * zb.size }; }
    }
    if (best) return best;

    var tx = Math.floor(wx), ty = Math.floor(wy);
    if (Z.world.inside(tx, ty)) {
      var bid = Z.world.occ[Z.world.idx(tx, ty)];
      if (bid) {
        var b = S.buildingById(bid);
        if (b) return { kind: 'building', obj: b, x: b.x, y: b.y,
                        h: Z.fph(b.def, b.rot) * 0.6 + 0.9 };
      }
    }
    var p = Z.world.propNear(wx, wy, 1.1);
    if (p) return { kind: 'prop', obj: p, x: p.x, y: p.y, h: p.def.h };
    return null;
  };

  S.reset = function () {
    S.zombies.length = 0;
    S.corpses.length = 0;
    S.spits.length = 0;
    S.buildings.length = 0;
    S.bIndex = {};
    S.nextBid = 1;
    S.target = null; S.sel = null; S.hover = null;
    S.inWave = false; S.bloodMoon = false; S.mod = null; S.combo = 0;
    S.stands = Z.upLv('revive');
    Z.fx.clear();
  };

})(window.Z);
