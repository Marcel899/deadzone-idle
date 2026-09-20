/* Deadzone - base mode.

   Not a scene. The same world keeps running underneath: turrets fire,
   production ticks, zombies walk. What changes is who you are: in Explore
   you are the survivor and the camera is on his shoulder; in Base you are
   the person planning the compound, so he steps out of the picture and
   the camera becomes yours to drag.

   Base mode carries the denser interface - a tool rail and a catalogue -
   because managing is a different job from playing, and that is the one
   place where panels earn their space. Explore mode keeps the thin HUD. */
(function (Z) {
  'use strict';

  var B = Z.base = {
    mode: 'explore',        /* 'explore' | 'base' */
    tool: 'build',          /* build | upgrade | demolish | move */
    moving: null,           /* the structure currently being picked up */
    razing: false,          /* a demolish drag is under way */
    sel: null
  };

  B.isBase = function () { return B.mode === 'base'; };

  /* ------------------------------------------------------------------ *
   * Entering and leaving
   * ------------------------------------------------------------------ */
  B.enter = function () {
    if (B.mode === 'base') return;
    B.mode = 'base';
    B.tool = 'build';
    B.moving = null;
    B.razing = false;
    Z.input.axis.x = Z.input.axis.y = 0;
    if (Z.sim.p) {
      Z.sim.p.manualAim = false;
      Z.sim.cancelTask();
    }
    frameCompound();
    Z.ui.setMode(null);
    Z.ui.enterBase();
    Z.sfx.play('tick');
  };

  B.leave = function () {
    if (B.mode === 'explore') return;
    B.mode = 'explore';
    B.cancelMove();
    Z.build.cancel();
    B.sel = null;
    Z.sim.sel = null;
    Z.cam.follow = true;
    /* Back to the view the player set. Leaving the planning screen used
       to drop you at a hard-coded 46 regardless, so anyone who had moved
       the field of view got it quietly taken off them every time they
       built something. */
    Z.cam.applyFov();
    if (Z.sim.p) Z.cam.centerOn(Z.sim.p.x, Z.sim.p.y, true);
    Z.ui.leaveBase();
    Z.sfx.play('tick');
  };

  B.toggle = function () { B.isBase() ? B.leave() : B.enter(); };

  /* Pull the camera back far enough to hold everything you have built,
     the way the reference shot frames a compound. */
  function frameCompound() {
    var S = Z.sim, list = S.buildings;
    if (!list.length) {
      Z.cam.x = Z.world.CENTER; Z.cam.y = Z.world.CENTER;
      Z.cam.zt = Z.cam.z = 40;
      Z.cam.follow = false;
      return;
    }
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var fw = Z.fpw(b.def, b.rot), fh = Z.fph(b.def, b.rot);
      x0 = Math.min(x0, b.x - fw / 2); x1 = Math.max(x1, b.x + fw / 2);
      y0 = Math.min(y0, b.y - fh / 2); y1 = Math.max(y1, b.y + fh / 2);
    }
    var pad = 7;
    var w = (x1 - x0) + pad * 2, h = (y1 - y0) + pad * 2;
    Z.cam.x = (x0 + x1) / 2;
    Z.cam.y = (y0 + y1) / 2;
    var zx = Z.cam.W / Math.max(4, w);
    var zy = Z.cam.H / Math.max(4, h * Z.PITCH);
    Z.cam.zt = Z.cam.z = Z.clamp(Math.min(zx, zy), Z.cam.MINZ, 46);
    Z.cam.follow = false;
  }
  B.frameCompound = frameCompound;

  /* ------------------------------------------------------------------ *
   * Tools
   * ------------------------------------------------------------------ */
  B.setTool = function (t) {
    if (B.tool === t && t !== 'build') { return; }
    B.cancelMove();
    if (t !== 'build') Z.build.cancel();
    B.tool = t;
    B.sel = null;
    Z.sim.sel = null;
    Z.ui.renderBaseTools();
    Z.ui.renderBasePanel();
  };

  /* ---- move ---- */
  B.startMove = function (b) {
    if (!b || b.dead) return;
    B.moving = b;
    /* it keeps the turn it was built with, and R turns it again */
    Z.build.ghost = { def: b.def, x: b.x, y: b.y, rot: b.rot | 0,
                      ok: false, reason: '', moving: b };
    /* lift it off the grid so it does not collide with itself */
    Z.sim.unstamp(b);
    Z.ui.hint('Drop ' + b.def.name + '  ·  R to turn it');
  };

  B.cancelMove = function () {
    if (!B.moving) return;
    Z.sim.stamp(B.moving);
    B.moving = null;
    Z.build.ghost = null;
    Z.ui.setMode(null);
  };

  B.dropMove = function () {
    var g = Z.build.ghost;
    if (!g || !B.moving) return false;
    if (!g.ok) { Z.ui.hint(g.reason || 'Cannot go there'); Z.sfx.play('deny'); return false; }
    var b = B.moving;
    b.x = g.x; b.y = g.y; b.rot = g.rot | 0;
    Z.sim.stamp(b);
    B.moving = null;
    Z.build.ghost = null;
    Z.sim.gridDirty = true;
    Z.S.dirty = true;
    Z.fx.ring(b.x, b.y, Math.max(b.def.w, b.def.h) * 0.5, '127,164,92', 0.4);
    Z.sfx.play('build');
    Z.ui.setMode(null);
    return true;
  };

  /* ---- what a click means, per tool ---- */
  B.clickWorld = function (wx, wy) {
    /* placing or dropping always wins */
    if (Z.build.ghost) {
      Z.build.update(wx, wy);
      if (B.moving) B.dropMove();
      else Z.build.place();
      return;
    }

    var hit = Z.sim.pick(wx, wy);
    var b = hit && hit.kind === 'building' ? hit.obj : null;

    if (!b) { B.sel = null; Z.sim.sel = null; Z.ui.renderBasePanel(); return; }

    if (B.tool === 'demolish') {
      if (b.defId === 'core') { Z.ui.hint('The command post stays'); Z.sfx.play('deny'); return; }
      /* A wall is placed by dragging a run and was removed a tile at a
         time, each behind a confirmation. Anything you can build in one
         gesture you should be able to take back in one, so chain pieces
         go without the dialogue and everything else keeps it. */
      if (b.def.chain) { B.demolishOne(b); return; }
      Z.ui.confirm('Demolish ' + b.def.name + '?',
        'You get some of the materials back. The ground it stood on stays clear.',
        function () {
          Z.sim.removeBuilding(b, true);
          Z.ui.toast('Demolished', 'Materials recovered');
          Z.ui.renderBasePanel();
        });
      return;
    }
    if (B.tool === 'move') {
      if (b.defId === 'core') { Z.ui.hint('The command post stays'); Z.sfx.play('deny'); return; }
      B.startMove(b);
      return;
    }
    if (B.tool === 'upgrade') {
      if (b.lvl >= Z.BMAXLVL) { Z.ui.hint(b.def.name + ' is at maximum'); Z.sfx.play('deny'); return; }
      if (Z.sim.upgradeBuilding(b)) {
        Z.ui.toast(b.def.name + ' Lv ' + b.lvl, 'Upgraded');
      } else {
        Z.ui.hint('Not enough materials');
        Z.sfx.play('deny');
      }
      B.sel = b; Z.sim.sel = b;
      Z.ui.renderBasePanel();
      return;
    }
    /* build tool: selecting shows what a structure does */
    B.sel = b;
    Z.sim.sel = b;
    Z.ui.renderBasePanel();
  };

  B.demolishOne = function (b) {
    if (!b || b.dead || b.defId === 'core') return false;
    Z.sim.removeBuilding(b, true);
    Z.fx.burst(b.x, b.y, 7, '150,140,120', 2.2);
    Z.sfx.play('tick');
    Z.ui.syncBasePanel();
    return true;
  };

  /* Held and dragged across a run, the way placing one works. */
  B.dragDemolish = function (wx, wy) {
    if (B.tool !== 'demolish') return;
    var hit = Z.sim.pick(wx, wy);
    var b = hit && hit.kind === 'building' ? hit.obj : null;
    if (b && b.def.chain) B.demolishOne(b);
  };

  /* ------------------------------------------------------------------ *
   * Compound readout for the panel header
   * ------------------------------------------------------------------ */
  B.summary = function () {
    var S = Z.sim, n = 0, def = 0, prod = 0, hurt = 0;
    for (var i = 0; i < S.buildings.length; i++) {
      var b = S.buildings[i];
      if (b.dead) continue;
      n++;
      if (b.def.gun) def++;
      if (b.def.makes) prod++;
      if (b.hp < b.maxHp * 0.999) hurt++;
    }
    return { total: n, defense: def, production: prod, damaged: hurt,
             power: S.power, cap: S.cap };
  };

})(window.Z);
