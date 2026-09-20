/* Deadzone - input.

   One gesture vocabulary for the whole game, because there is only one
   screen:

     WASD / arrows     walk. This is the only thing that moves him.
     tap / click       act on what is under it - target, clear, loot,
                       select a structure, or place what you are building
     drag              pan the camera (a drag never also counts as a tap)
     wheel / pinch     zoom
     right-hold        take manual aim and fire; release to hand the gun
                       back to the survivor
     1-7               pick a structure out of the base catalogue
     Esc / right-click cancel whatever is in your hands

   Clicking the ground does NOT send the survivor anywhere, and neither
   does clicking a tree: you mark the job and then walk over yourself.
   On touch the two thumb pads stand in for the keys and the right button
   - left moves, right aims and fires. */
(function (Z) {
  'use strict';

  var I = Z.input = {
    axis: { x: 0, y: 0 },
    firing: false,
    mouse: { x: 0, y: 0, inside: false },
    world: { x: 0, y: 0 },
    keys: {}
  };

  var cv, down = null, moved = false, pointers = {}, pinch = null;
  var DRAG_PX = 9;
  var aimPad = null, aimActive = false;
  var movePad = null, moveId = null;

  I.init = function (canvas) {
    cv = canvas;

    cv.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    /* Right-click aims, so the browser's menu must not answer it - and
       not only over the canvas. Bound to the canvas alone, a right-click
       that started on the world but finished a pixel over the HUD, or
       one anywhere near a panel, still brought up Copy / Select All and
       swallowed the button. */
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('wheel', onWheel, { passive: false });

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', function (e) {
      if ((e.key || '').toLowerCase() === 'g' && Z.sim.nadeArmed) Z.sim.throwNade();
    });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () {
      I.keys = {}; I.axis.x = I.axis.y = 0; I.firing = false;
      if (Z.sim.p) Z.sim.p.manualAim = false;
    });

    aimPad = Z.$('aimpad');
    if (aimPad) {
      aimPad.addEventListener('pointerdown', padDown);
      window.addEventListener('pointermove', padMove);
      window.addEventListener('pointerup', padUp);
      window.addEventListener('pointercancel', padUp);
    }

    movePad = Z.$('movepad');
    if (movePad) {
      movePad.addEventListener('pointerdown', moveDown);
      window.addEventListener('pointermove', moveMove);
      window.addEventListener('pointerup', moveUp);
      window.addEventListener('pointercancel', moveUp);
    }
  };

  /* ------------------------------------------------------------------ *
   * Touch movement stick
   *
   * A phone has no WASD, and click-to-move is exactly what we removed, so
   * this is the thumb equivalent of the keys: it writes the same axis the
   * keyboard writes and nothing else in the game knows the difference.
   * ------------------------------------------------------------------ */
  function moveDown(e) {
    e.preventDefault();
    moveId = e.pointerId;
    movePad.classList.add('on');
    moveMove(e);
  }
  function moveMove(e) {
    if (moveId !== e.pointerId) return;
    if (Z.base && Z.base.isBase()) { I.axis.x = I.axis.y = 0; return; }
    var r = movePad.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var dx = e.clientX - cx, dy = e.clientY - cy;
    var d = Math.hypot(dx, dy);
    var dead = r.width * 0.12;
    if (d < dead) { I.axis.x = I.axis.y = 0; knob(movePad, 0, 0); return; }
    var k = Math.min(1, d / (r.width * 0.42));
    I.axis.x = (dx / d) * k;
    I.axis.y = (dy / d) * k;
    knob(movePad, (dx / d) * k * r.width * 0.29, (dy / d) * k * r.width * 0.29);
    Z.cam.follow = true;
    Z.ui.showRecenter(false);
  }
  function moveUp(e) {
    if (moveId !== e.pointerId && e.type !== 'pointercancel') return;
    moveId = null;
    I.axis.x = I.axis.y = 0;
    movePad.classList.remove('on');
    knob(movePad, 0, 0);
  }
  function knob(pad, x, y) {
    var k = pad.firstElementChild;
    if (k) k.style.transform = x || y ? 'translate(' + x + 'px,' + y + 'px)' : '';
  }

  function local(e) {
    var r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /* ------------------------------------------------------------------ *
   * Pointer
   * ------------------------------------------------------------------ */
  function onDown(e) {
    if (Z.ui.modal) return;
    /* Capture can refuse - a pointer already released, one the element
       never saw. It throws when it does, and a throw here abandons the
       rest of the press: no aim, no fire, no tap. The press matters more
       than the capture. */
    try { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); } catch (err) {}
    var p = local(e);
    pointers[e.pointerId] = p;

    if (Object.keys(pointers).length === 2) {
      var ids = Object.keys(pointers);
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: Z.cam.zt };
      down = null;
      return;
    }

    if (e.button === 2) {
      if (Z.base && Z.base.moving) { Z.base.cancelMove(); return; }
      if (Z.build.active()) { Z.build.cancel(); return; }
      if (Z.base && Z.base.isBase()) return;    /* no manual aim in base mode */
      startManualAim(p);
      return;
    }

    down = { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), id: e.pointerId };
    moved = false;

    /* dragging a run of walls starts on the press, not the release */
    if (Z.build.active() && Z.build.ghost.def.chain) {
      Z.build.dragging = true;
      var w = Z.cam.toWorld(p.x, p.y);
      Z.build.dragPlace(w.x, w.y);
    } else if (Z.base && Z.base.isBase() && Z.base.tool === 'demolish') {
      /* Only if the press landed on a wall. Starting a demolish drag from
         open ground would take panning away, which is the one thing you
         need constantly in base mode. */
      var wd2 = Z.cam.toWorld(p.x, p.y);
      var hit = Z.sim.pick(wd2.x, wd2.y);
      if (hit && hit.kind === 'building' && hit.obj.def.chain) Z.base.razing = true;
    }
  }

  function onMove(e) {
    var p = local(e);
    I.mouse.x = p.x; I.mouse.y = p.y; I.mouse.inside = true;
    var w = Z.cam.toWorld(p.x, p.y);
    I.world.x = w.x; I.world.y = w.y;

    if (pointers[e.pointerId]) pointers[e.pointerId] = p;

    /* pinch */
    if (pinch) {
      var ids = Object.keys(pointers);
      if (ids.length >= 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.d > 8) {
          /* Two fingers pan. They used to zoom, and the view is a
             setting now - see Settings > View. */
          var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          if (pinch.mx != null) Z.cam.pan(mx - pinch.mx, my - pinch.my);
          pinch.mx = mx; pinch.my = my;
          Z.cam.clampToWorld();
        }
      }
      return;
    }

    if (Z.sim.p && Z.sim.p.manualAim && !aimActive) {
      aimToward(w);
    }

    if (Z.build.active()) Z.build.update(w.x, w.y);
    else hover(w);

    if (!down) return;
    var dx = p.x - down.x, dy = p.y - down.y;
    if (!moved && Math.hypot(p.x - down.sx, p.y - down.sy) > DRAG_PX) moved = true;

    if (Z.build.dragging) {
      Z.build.dragPlace(w.x, w.y);
    } else if (Z.base && Z.base.razing) {
      Z.base.dragDemolish(w.x, w.y);
    } else if (moved) {
      Z.cam.pan(dx, dy);
      Z.ui.showRecenter(true);
    }
    down.x = p.x; down.y = p.y;
  }

  function onUp(e) {
    if (Z.interior && Z.interior.active()) Z.interior.endSearch();
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinch = null;

    /* Hand the gun back whenever no button is still down. Keying this to
       button 2 alone leaves the survivor stuck in manual aim if the
       matching pointerup is ever missed - dragging off the window, a lost
       capture, a context menu stealing the release. */
    if (e.button === 2 || (e.buttons === 0 && !aimActive && Z.sim.p && Z.sim.p.manualAim)) {
      endManualAim();
      if (e.button === 2) return;
    }
    if (Z.build.dragging) { Z.build.dragging = false; down = null; return; }
    /* A drag that razed a run is finished; a press that never moved falls
       through to the ordinary click, so tapping one wall still works. */
    if (Z.base && Z.base.razing) {
      Z.base.razing = false;
      if (moved) { down = null; moved = false; return; }
    }
    if (!down || down.id !== e.pointerId) { down = null; return; }

    var p = local(e);
    var was = moved;
    down = null;
    moved = false;
    if (was) return;                 /* that was a pan, not a tap */
    tap(p);
  }

  /* Nothing scrolls the page.

     The CSS pins html and body, which is most of it, but a browser will
     still pan a fixed pane in a few cases: a touch drag that begins on a
     HUD element, a stray `scrollIntoView` from a focused control, and
     iOS's own rubber band. So the page is pinned again here, from the
     other side: a touchmove that is not inside something which is itself
     a scrollport gets cancelled, and any scroll that does slip through
     is put straight back. Both listeners are cheap and neither one can
     interfere with the game's own input, which lives on the canvas and
     uses pointer events. */
  function inScroller(node) {
    for (var el2 = node; el2 && el2 !== document.body; el2 = el2.parentNode) {
      if (el2.nodeType !== 1) continue;
      var cs = getComputedStyle(el2);
      var ov = cs.overflowY + ' ' + cs.overflowX;
      if (/(auto|scroll)/.test(ov) &&
          (el2.scrollHeight > el2.clientHeight + 1 ||
           el2.scrollWidth > el2.clientWidth + 1)) return true;
    }
    return false;
  }
  document.addEventListener('touchmove', function (e) {
    if (e.touches.length > 1) { e.preventDefault(); return; }   /* no pinch pan */
    if (inScroller(e.target)) return;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  window.addEventListener('scroll', function () {
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  }, { passive: true });
  /* iOS pinch-zoom on the game surface, which leaves the HUD off screen */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (g) {
    document.addEventListener(g, function (e) { e.preventDefault(); }, { passive: false });
  });

  /* The wheel does nothing.

     It used to zoom, then it panned, and both were wrong for the same
     reason: a wheel under your finger while you are trying to shoot is
     an accident waiting to move the camera. Panning is dragging; the
     view is a setting. The listener stays only to swallow the event so
     the page itself does not scroll under the game. */
  function onWheel(e) {
    e.preventDefault();
  }

  /* ------------------------------------------------------------------ *
   * Tap - the one place that decides what a click means
   * ------------------------------------------------------------------ */
  function tap(p) {
    Z.ui.closeWeaponRail();
    var w = Z.cam.toWorld(p.x, p.y);

    /* Indoors there is one verb. Tapping searches what you are beside or
       leaves by the door - the same thing E does, because a phone has no
       E and the room has nothing else to click. */
    if (Z.interior && Z.interior.active()) {
      if (!Z.interior.beginSearch()) Z.ui.hint('Stand next to something to search it');
      return;
    }

    /* base mode has its own vocabulary: the tool decides what a click on
       a structure does, and the ground never moves anybody */
    if (Z.base && Z.base.isBase()) { Z.base.clickWorld(w.x, w.y); return; }

    if (Z.build.active()) {
      Z.build.update(w.x, w.y);
      Z.build.place();
      return;
    }

    var hit = Z.sim.pick(w.x, w.y);
    Z.sim.sel = null;

    /* Empty ground clears what you had picked. It never walks him there. */
    if (!hit) {
      Z.sim.cancelTask();
      Z.sim.target = null;
      return;
    }

    if (hit.kind === 'zombie') {
      Z.sim.target = hit.obj;
      hit.obj.marked = Math.max(hit.obj.marked, 2.5);
      Z.sim.cancelTask();
      Z.sfx.play('tick');
      return;
    }
    if (hit.kind === 'prop') {
      var pr = hit.obj;
      var inReach = Z.sim.setTask(pr, pr.def.loot ? 'loot' : 'clear');
      Z.ui.hint(inReach
        ? (pr.def.enter ? 'Going inside'
           : (pr.def.loot ? 'Searching ' : 'Clearing ') + pr.def.name.toLowerCase())
        : (pr.def.enter ? 'Walk up to the door'
           : 'Walk over to the ' + pr.def.name.toLowerCase()));
      Z.sfx.play('tick');
      return;
    }
    if (hit.kind === 'building') {
      Z.sim.sel = hit.obj;
      Z.ui.openStructure(hit.obj);
      return;
    }
  }

  function hover(w) {
    var S = Z.sim;
    var hit = S.pick(w.x, w.y);
    if (!hit) { S.hover = null; return; }
    var o = hit.obj, label = '', sub = '', subCol = null;
    if (hit.kind === 'zombie') {
      label = o.type.name;
      sub = Math.ceil(o.hp) + ' hp';
      subCol = '#C8615A';
    } else if (hit.kind === 'prop') {
      label = o.def.name;
      if (o.def.loot) { sub = 'Search'; subCol = '#E3A63F'; }
      else if (o.def.yield) {
        var bits = [];
        for (var k in o.def.yield) bits.push('+' + o.def.yield[k] + ' ' + Z.RES[k].name);
        sub = bits.join('   ');
        subCol = '#7FA45C';
      }
    } else {
      label = o.def.name + (o.lvl > 1 ? '  Lv ' + o.lvl : '');
      sub = Math.ceil(o.hp) + ' / ' + Math.ceil(o.maxHp);
      if (!o.powered && o.def.draw) { sub = 'No power'; subCol = '#D2562A'; }
    }
    S.hover = { kind: hit.kind, obj: o, x: hit.x, y: hit.y, h: hit.h,
                label: label, sub: sub, subCol: subCol };
  }

  /* ------------------------------------------------------------------ *
   * Manual aim
   * ------------------------------------------------------------------ */
  function startManualAim(p) {
    var pl = Z.sim.p;
    if (!pl || pl.dead) return;
    if (Z.base && Z.base.isBase()) return;
    pl.manualAim = true;
    I.firing = true;
    Z.sim.target = null;
    aimToward(Z.cam.toWorld(p.x, p.y));
    Z.ui.setMode('aim');
  }
  function endManualAim() {
    var pl = Z.sim.p;
    I.firing = false;
    if (pl) pl.manualAim = false;
    if (!Z.build.active()) Z.ui.setMode(null);
  }
  function aimToward(w) {
    var pl = Z.sim.p;
    if (!pl) return;
    /* Where the cursor is in the world, kept for anything that needs a
       point rather than a bearing - the grenade aims at one. */
    I.aimWorld = w;
    pl.aim = Math.atan2(w.y - pl.y, w.x - pl.x);
  }

  /* ---- touch thumb pad ---- */
  function padDown(e) {
    e.preventDefault();
    var pl = Z.sim.p;
    if (!pl || pl.dead) return;
    aimActive = true;
    pl.manualAim = true;
    I.firing = true;
    Z.sim.target = null;
    aimPad.classList.add('on');
    Z.ui.setMode('aim');
    padMove(e);
  }
  function padMove(e) {
    if (!aimActive) return;
    var r = aimPad.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var dx = e.clientX - cx, dy = e.clientY - cy;
    if (Math.hypot(dx, dy) < 6) return;
    /* the pad is a compass: up on the pad is up the map, which is -y */
    var pl = Z.sim.p;
    if (pl) pl.aim = Math.atan2(dy / Z.PITCH, dx);
    var knob = aimPad.firstElementChild;
    if (knob) {
      var m = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
      var a = Math.atan2(dy, dx);
      knob.style.transform = 'translate(' + (Math.cos(a) * m * r.width * 0.3) + 'px,' +
                             (Math.sin(a) * m * r.width * 0.3) + 'px)';
    }
  }
  function padUp() {
    if (!aimActive) return;
    /* fires for any pointer release, so a lost touch cannot latch the pad */
    aimActive = false;
    I.firing = false;
    if (Z.sim.p) Z.sim.p.manualAim = false;
    aimPad.classList.remove('on');
    var knob = aimPad.firstElementChild;
    if (knob) knob.style.transform = '';
    if (!Z.build.active()) Z.ui.setMode(null);
  }

  /* ------------------------------------------------------------------ *
   * Keyboard
   * ------------------------------------------------------------------ */
  function axisFromKeys() {
    if (Z.base && Z.base.isBase()) { I.axis.x = I.axis.y = 0; return; }
    if (moveId !== null) return;          /* the thumb stick has the wheel */
    var k = I.keys;
    var x = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
    var y = (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0);
    I.axis.x = x; I.axis.y = y;
    if (x || y) { Z.cam.follow = true; Z.ui.showRecenter(false); }
  }

  function onKey(e) {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    var k = e.key.toLowerCase();
    I.keys[k] = true;

    /* The digits mean the thing you are looking at: a blueprint while the
       base dock is up, otherwise the nth weapon in the rack. */
    if (k >= '1' && k <= '7') {
      if (Z.base && Z.base.isBase()) Z.ui.pickCatalog(parseInt(k, 10) - 1);
      else if (!Z.ui.sheet) Z.ui.pickRack(parseInt(k, 10) - 1);
      e.preventDefault();
      return;
    }
    switch (k) {
      case 'escape':
        if (Z.interior.active()) Z.interior.leave();
        else if (Z.base && Z.base.moving) Z.base.cancelMove();
        else if (Z.build.active()) Z.build.cancel();
        else if (Z.base && Z.base.isBase()) Z.base.leave();
        else if (Z.ui.sheet) Z.ui.closeSheet();
        else Z.sim.cancelTask();
        break;
      case 'b': Z.base.toggle(); break;
      case 'v': Z.ui.openBuildMenu(); break;   /* blueprint shop */
      /* R turns the piece while something is on the cursor, and reloads
         the rest of the time. Placing and shooting never overlap, so the
         one key can mean both without ever being ambiguous. */
      case 'r':
        if (Z.build.active()) Z.build.rotate(e.shiftKey ? -1 : 1);
        else Z.sim.reload();
        break;
      /* indoors: E searches what you are next to, or leaves by the door */
      case 'e':
        if (Z.interior.active()) Z.interior.beginSearch();
        break;
      /* Q is the dash. The menu moved to C - it is one of five things on
         the command rail and nobody reaches for a keyboard to open it,
         whereas a dash is worth a key under the left hand. */
      case 'q': Z.sim.dash(); break;
      case 'c': Z.ui.openMenu(); break;
      /* G arms the throw; letting go of it throws. Holding it also winds
         the range up, which is how a thumb aims one on a phone. */
      case 'g':
        if (!e.repeat) Z.sim.armNade();
        break;
      case 'm': Z.ui.openMap(); break;
      case 'f': Z.ui.openWeapons(); break;
      /* step through the weapons you own without leaving the world */
      case 'x': Z.ui.cycleWeapon(1); break;
      case 'z': Z.ui.cycleWeapon(-1); break;
      case ' ':
        Z.cam.follow = true;
        Z.cam.centerOn(Z.sim.p.x, Z.sim.p.y, false);
        Z.ui.showRecenter(false);
        e.preventDefault();
        break;
      case 'shift':
        startManualAim({ x: I.mouse.x, y: I.mouse.y });
        break;
      /* the view is a setting, not something you wrestle with mid-fight */
    }
    axisFromKeys();
  }

  function onKeyUp(e) {
    var k = e.key.toLowerCase();
    I.keys[k] = false;
    if (k === 'shift') endManualAim();
    if (k === 'e' && Z.interior.active()) Z.interior.endSearch();
    axisFromKeys();
  }

})(window.Z);
