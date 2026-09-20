/* Deadzone - persistence.

   The map is not stored; its seed is. Generation is deterministic, so a
   save only carries the seed plus the differences the player made: which
   props they cleared, where they built, and which chunks they have seen.
   That keeps a 224m world inside a few kilobytes.

   Cloud sync is best effort and never blocks play. */
(function (Z) {
  'use strict';

  var KEY = 'deadzone.world.v2';
  var DOC = 'saves/world';

  var mem = null;
  var cloud = null, cloudT = 0;
  /* Once a wipe is under way nothing may write again. The page fires
     pagehide on its way out and the autosave there would otherwise put
     the deleted save straight back. */
  var wiped = false;

  function readLocal() {
    try {
      var raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return mem; }
  }
  function writeLocal(o) {
    try { window.localStorage.setItem(KEY, JSON.stringify(o)); }
    catch (e) { mem = o; }
  }

  /* Uint8Array of 0/1 -> base64, six chunks to a character. */
  function packBits(arr) {
    var bytes = new Uint8Array(Math.ceil(arr.length / 8));
    for (var i = 0; i < arr.length; i++) {
      if (arr[i]) bytes[i >> 3] |= (1 << (i & 7));
    }
    var s = '';
    for (var b = 0; b < bytes.length; b++) s += String.fromCharCode(bytes[b]);
    try { return btoa(s); } catch (e) { return ''; }
  }
  function unpackBits(str, len) {
    var out = new Uint8Array(len);
    if (!str) return out;
    var s;
    try { s = atob(str); } catch (e) { return out; }
    for (var i = 0; i < len; i++) {
      var byte = s.charCodeAt(i >> 3) || 0;
      out[i] = (byte >> (i & 7)) & 1;
    }
    return out;
  }

  var SV = Z.save = {};

  SV.fresh = function () {
    var upg = {};
    Z.UPGRADES.forEach(function (u) { upg[u.id] = 0; });
    var res = {};
    for (var k in Z.RES) res[k] = 0;
    /* Enough to put something down on the first day, and enough fuel to
       keep the generator turning while you find more. */
    res.wood = 40; res.scrap = 30; res.coin = 120; res.fuel = 30;
    return {
      v: 2,
      seed: (Math.random() * 0xFFFFFFF) >>> 0,
      day: 1, clock: 0.34,
      level: 1, xp: 0,
      kills: 0, cleared: 0,
      wave: 1, bestWave: 1,
      cores: 0, totalCores: 0, playtime: 0,
      weapon: 'pistol',
      owned: { weapons: { pistol: 1 }, attach: { irons: 1, fmj: 1 } },
      equip: { pistol: { optic: 'irons', ammo: 'fmj' } },
      wlvl: {},
      upg: upg,
      res: res,
      bp: {},
      buildings: null,           /* null = seed a starter compound */
      cleared_props: [],
      disc: '',
      sound: true,
      autoCombat: true,
      fov: 48,
      quality: 'high',
      post: true,
      seen: {},
      t: Date.now()
    };
  };

  /* Merge a loaded blob onto a fresh state so older saves keep working. */
  SV.hydrate = function (raw) {
    var S = SV.fresh();
    if (!raw || typeof raw !== 'object') return S;
    ['seed', 'day', 'clock', 'level', 'xp', 'kills', 'cleared', 'wave', 'bestWave',
     'cores', 'totalCores', 'playtime', 'weapon', 'sound', 'autoCombat',
     'fov', 'quality', 'post',
     'disc', 't']
      .forEach(function (k) { if (raw[k] != null) S[k] = raw[k]; });

    if (raw.owned) {
      if (raw.owned.weapons) S.owned.weapons = Object.assign(S.owned.weapons, raw.owned.weapons);
      if (raw.owned.attach) S.owned.attach = Object.assign(S.owned.attach, raw.owned.attach);
    }
    if (raw.equip) {
      Object.keys(raw.equip).forEach(function (w) {
        if (Z.WEAPON[w]) S.equip[w] = raw.equip[w] || {};
      });
    }
    if (raw.upg) {
      Z.UPGRADES.forEach(function (u) {
        var v = raw.upg[u.id];
        S.upg[u.id] = (typeof v === 'number' && isFinite(v) && v >= 0) ? Math.floor(v) : 0;
      });
    }
    if (raw.wlvl) {
      Z.WEAPONS.forEach(function (w) {
        var v = raw.wlvl[w.id];
        if (typeof v === 'number' && isFinite(v) && v > 0) S.wlvl[w.id] = Math.min(Z.WMAXLVL, Math.floor(v));
      });
    }
    if (raw.res) {
      for (var k in Z.RES) {
        var n = Number(raw.res[k]);
        S.res[k] = isFinite(n) && n > 0 ? n : 0;
      }
    }
    if (raw.bp && typeof raw.bp === 'object') {
      Object.keys(raw.bp).forEach(function (id) { if (Z.BUILDING[id]) S.bp[id] = 1; });
    }
    if (Array.isArray(raw.buildings)) S.buildings = raw.buildings;
    if (Array.isArray(raw.cleared_props)) S.cleared_props = raw.cleared_props;
    if (raw.seen && typeof raw.seen === 'object') S.seen = raw.seen;

    S.level = Math.max(1, Math.floor(S.level) || 1);
    S.wave = Math.max(1, Math.floor(S.wave) || 1);
    S.bestWave = Math.max(S.wave, Math.floor(S.bestWave) || 1);
    if (!Z.WEAPON[S.weapon] || !S.owned.weapons[S.weapon]) S.weapon = 'pistol';
    return S;
  };

  SV.load = function () {
    Z.S = SV.hydrate(readLocal());
    Z.sfx.on = Z.S.sound !== false;
    return Z.S;
  };

  /* Rebuild the live world from the save. */
  SV.applyWorld = function () {
    var S = Z.S;
    Z.world.generate(S.seed);
    Z.world.t = typeof S.clock === 'number' ? S.clock : 0.34;
    Z.world.day = S.day || 1;
    Z.world.recalc();

    /* clear the props the player already worked through */
    if (S.cleared_props && S.cleared_props.length) {
      var gone = {};
      S.cleared_props.forEach(function (pid) { gone[pid] = 1; });
      var list = Z.world.props.slice();
      for (var i = 0; i < list.length; i++) {
        if (gone[list[i].pid]) Z.world.removeProp(list[i]);
      }
    }
    if (S.disc) Z.world.disc = unpackBits(S.disc, Z.world.CW * Z.world.CW);

    Z.sim.reset();
    if (S.buildings && S.buildings.length) {
      S.buildings.forEach(function (b) {
        if (!Z.BUILDING[b.i]) return;
        var made = Z.sim.addBuilding(b.i, b.x, b.y, b.l || 1, b.r || 0);
        if (made && typeof b.h === 'number') made.hp = Z.clamp(b.h, 1, made.maxHp);
        /* whatever it had made and nobody had fetched */
        if (made && b.s) {
          for (var k in b.s) {
            var v = +b.s[k];
            if (isFinite(v) && v > 0) made.stock[k] = v;
          }
        }
      });
    } else {
      Z.build.seedCompound();
    }
    Z.sim.wave = S.wave;
    Z.render.invalidateAll();
  };

  /* Snapshot the differences back out. */
  SV.capture = function () {
    var S = Z.S;
    S.seed = Z.world.seed;
    S.clock = Z.world.t;
    S.day = Z.world.day;
    S.wave = Z.sim.wave;
    S.disc = packBits(Z.world.disc);

    /* Every prop the generator made that is no longer standing. Recording
       what is gone is far smaller than recording what remains. */
    var alive = {};
    for (var i = 0; i < Z.world.props.length; i++) alive[Z.world.props[i].pid] = 1;
    var cleared = [];
    var maxPid = Z.world.maxPid || 0;
    for (var pid = 1; pid <= maxPid; pid++) if (!alive[pid]) cleared.push(pid);
    S.cleared_props = cleared;

    S.buildings = Z.sim.buildings.map(function (b) {
      var o = { i: b.defId, x: b.x, y: b.y, l: b.lvl, h: Math.round(b.hp) };
      /* what it has made and nobody has fetched; omitted when empty so an
         ordinary wall costs nothing to store */
      var st = b.stock && Z.sim.stockOf(b);
      if (st) o.s = st;
      /* only carried when it is not the default, so old saves stay small
         and a save written before rotation existed still loads */
      if (b.rot) o.r = b.rot;
      return o;
    });
    S.t = Date.now();
    return S;
  };

  SV.flush = function () {
    if (!Z.S || wiped) return;
    try { SV.capture(); } catch (e) {}
    writeLocal(Z.S);
    Z.S.dirty = false;
    if (cloud && Date.now() - cloudT > 30000) SV.pushCloud();
  };

  SV.wipe = function () {
    wiped = true;
    try { window.localStorage.removeItem(KEY); } catch (e) {}
    mem = null;
    if (cloud) { try { cloud.doc(DOC).delete(); } catch (e) {} }
    location.reload();
  };

  /* ------------------------------------------------------------------ *
   * Cloud sync
   * ------------------------------------------------------------------ */
  SV.initCloud = function () {
    if (!window.claude || !window.claude.use) return;
    var p;
    try { p = window.claude.use('db'); } catch (e) { return; }
    if (!p || !p.then) return;
    p.then(function (db) {
      if (!db) return;
      cloud = db;
      return db.doc(DOC).get().then(function (snap) {
        if (!snap || !snap.exists) { SV.pushCloud(); return; }
        var remote = snap.data();
        if (!remote || typeof remote.t !== 'number') { SV.pushCloud(); return; }
        if (remote.t > (Z.S.t || 0) + 15000) {
          Z.S = SV.hydrate(remote);
          Z.sfx.on = Z.S.sound !== false;
          SV.applyWorld();
          Z.sim.spawnPlayer();
          Z.cam.centerOn(Z.sim.p.x, Z.sim.p.y, true);
          Z.invalidate();
          Z.ui.refreshAll();
          Z.ui.toast('Cloud save restored', 'Picked up from your other device');
        } else {
          SV.pushCloud();
        }
      });
    }).catch(function () { cloud = null; });
  };

  SV.pushCloud = function () {
    if (!cloud || wiped) return;
    cloudT = Date.now();
    try {
      SV.capture();
      var body = JSON.parse(JSON.stringify(Z.S));
      body.t = Date.now();
      cloud.doc(DOC).set(body).catch(function () {});
    } catch (e) {}
  };

})(window.Z);
