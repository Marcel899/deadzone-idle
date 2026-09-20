/* Deadzone - boot and the main loop.

   The character atlases are baked progressively rather than up front, so
   the world is on screen and the survivor is already walking while the
   later animations fill in behind the loading bar. */
(function (Z) {
  'use strict';

  var STEP = 1 / 60;
  var acc = 0, last = 0, started = false;

  function frame(now) {
    var dt = (now - last) / 1000;
    last = now;
    if (!isFinite(dt) || dt < 0) dt = STEP;
    if (dt > 0.25) dt = 0.25;

    /* keep baking until both atlases are complete */
    if (!Z.art.survivorReady || !Z.art.zombieReady) {
      var budget = Z.art.survivorReady ? 7 : 9;
      if (!Z.art.survivorReady) Z.art.bakeStep(budget);
      else Z.art.bakeZombieStep(budget);
      var k = (Z.art.done / Z.art.total) * 0.7 +
              (Z.art.zombieReady ? 0.3 : (Z.art.survivorReady ? 0.15 : 0));
      Z.ui.bootProgress(k);
      if (Z.art.survivorReady && Z.art.zombieReady) Z.ui.bootDone();
    }

    acc += dt;
    var iter = 0;
    while (acc >= STEP && iter < 6) {
      Z.world.step(STEP);
      Z.sim.step(STEP, now / 1000);
      acc -= STEP;
      iter++;
    }
    if (iter >= 6) acc = 0;

    Z.cam.step(dt, Z.sim.p);
    Z.render.frame(now / 1000, dt);
    Z.ui.tick(dt);
    Z.ui.tickFps(dt);

    if (Z.S) Z.S.playtime = (Z.S.playtime || 0) + dt;
    requestAnimationFrame(frame);
  }

  function start(restored) {
    var cv = Z.$('scene');
    Z.cam.resize(cv);
    Z.render.init(cv);

    Z.save.load();
    if (restored && restored.S) {
      /* carried across a republish of the live page */
      try { Z.S = Z.save.hydrate(restored.S); } catch (e) {}
    }

    Z.art.init();
    Z.art.initZombies();
    Z.ui.init();

    Z.save.applyWorld();
    Z.sim.spawnPlayer();
    Z.cam.centerOn(Z.sim.p.x, Z.sim.p.y, true);
    /* Close enough to read a face and a muzzle flash. The wide view is
       still a scroll away, but it should not be where you start. */
    Z.cam.applyFov();
    Z.input.init(cv);

    /* bake enough of the survivor to have something to look at before the
       first frame goes up */
    var t0 = performance.now();
    while (Z.art.done < 90 && performance.now() - t0 < 260) Z.art.bakeStep(30);

    window.addEventListener('resize', function () {
      Z.cam.resize(cv);
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { Z.cam.resize(cv); }, 140);
    });

    /* what the compound banked while the tab was closed */
    var away = (Date.now() - (Z.S.t || Date.now())) / 1000;
    if (away > 120) {
      var rep = null;
      try { rep = Z.sim.offlineReport(away); } catch (e) {}
      Z.cam.applyFov();
      if (rep) setTimeout(function () { Z.ui.showOffline(rep); }, 900);
    }
    if (!Z.S.seen.intro) {
      Z.S.seen.intro = 1;
      setTimeout(function () {
        Z.ui.banner('DEADZONE', 'Clear the ground. Build. Hold the night.');
      }, 500);
      setTimeout(function () {
        Z.ui.toast('WASD to move', 'Walk up to a tree and tap it to cut it down');
      }, 3200);
    }

    last = performance.now();
    started = true;
    requestAnimationFrame(frame);

    setInterval(function () { Z.save.flush(); }, 6000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        Z.save.flush();
      } else {
        last = performance.now();
        acc = 0;
        var gone = (Date.now() - (Z.S.t || Date.now())) / 1000;
        if (gone > 180) {
          var r = null;
          try { r = Z.sim.offlineReport(gone); } catch (e) {}
          if (r) Z.ui.showOffline(r);
        }
      }
    });
    window.addEventListener('pagehide', function () { Z.save.flush(); });
    window.addEventListener('blur', function () { Z.save.flush(); });

    setTimeout(function () { try { Z.save.initCloud(); } catch (e) {} }, 1200);

    try {
      if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
        window.claude.hot.snapshot(function () {
          Z.save.flush();
          return { S: Z.S };
        });
      }
    } catch (e) {}
  }

  /* Extraction: keep the cores, lose the map. A new seed means a new
     suburb to clear, which is the point of going again. */
  Z.doPrestige = function () {
    var S = Z.S;
    var keep = {
      cores: S.cores, totalCores: S.totalCores,
      owned: S.owned, equip: S.equip, wlvl: S.wlvl, weapon: S.weapon,
      upg: S.upg, bp: S.bp,
      sound: S.sound, autoCombat: S.autoCombat,
      kills: S.kills, bestWave: S.bestWave, playtime: S.playtime
    };
    var fresh = Z.save.fresh();
    for (var k in keep) fresh[k] = keep[k];
    fresh.seen = { intro: 1 };
    Z.S = fresh;
    Z.save.applyWorld();
    Z.sim.spawnPlayer();
    Z.invalidate();
    Z.cam.centerOn(Z.sim.p.x, Z.sim.p.y, true);
    Z.ui.closeModal();
    Z.ui.refreshAll();
    Z.ui.banner('NEW GROUND', 'Cores carried over: ' + S.cores);
    Z.save.flush();
  };

  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    /* Never retry start(): a partial run has already attached listeners,
       and running it twice double-fires every control. */
    try {
      if (window.claude && window.claude.hot && window.claude.hot.ready) {
        window.claude.hot.ready(start);
      } else {
        start((window.claude && window.claude.hot && window.claude.hot.data) || {});
      }
    } catch (e) {
      if (window.console && console.error) console.error('boot failed', e);
      var b = Z.$('boot');
      if (b) {
        b.innerHTML = '<div class="bootmsg"><b>Could not start</b><span>' +
                      (e && e.message ? e.message : 'unknown error') + '</span></div>';
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window.Z);
