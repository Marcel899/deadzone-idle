/* Deadzone - interface.

   The rule this file follows: the world is the game, and the interface is
   only the handful of things you need while you are in it. Three small
   clusters across the top and everything else behind a single menu
   button. Building lives in Base mode, which has its own catalogue.

   Nothing that is only occasionally useful gets a permanent panel. When
   something belongs to a place in the world - what a structure does, what
   a prop is worth - it is drawn in the world by the renderer, not here. */
(function (Z) {
  'use strict';

  var U = Z.ui = { sheet: null, modal: false, mode: null, offline: null };
  var el = {};
  var $ = Z.$;

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  U.init = function () {
    ['hud', 'sv', 'svHp', 'svHpNum', 'svXp', 'svLvl', 'svWpn', 'svAmmo', 'svGun',
     'worldChip', 'wcDay', 'wcTime', 'wcPhase', 'wcZone', 'wcOrb', 'threat', 'threatN',
     'resRow', 'recenter', 'aimpad',
     'toasts', 'banner', 'hint', 'scrim', 'sheet', 'sheetTitle', 'sheetSub',
     'sheetBody', 'sheetClose', 'modal', 'modalBox', 'boot', 'bootBar', 'bootPct',
     'modeChip', 'modeText', 'modeCancel', 'modeRot',
     'baseui', 'toolrail', 'basedock', 'bdTabs', 'bdSum', 'bdExit', 'bpop',
     'acts', 'actDash', 'actNade',
     'bdList', 'bdDetail', 'navbar', 'quests', 'svRing', 'svFace',
     'svXpBar', 'svXpNum', 'wpnCard', 'wpnArt', 'wpnBar',
     'useNade', 'useMed', 'actAuto', 'actFire', 'gearcol',
     'grack', 'grackList', 'sheetWrap', 'sheetNav', 'flyers',
     'mmwrap', 'mmCv', 'mmExp'].forEach(function (id) { el[id] = $(id); });
    U.el = el;

    /* ---- the two ability buttons ----

       The grenade arms on press and throws on release, exactly as the
       key does, so the arc preview follows your thumb while you decide.
       `pointercancel` matters: a thumb that slides off the button has
       changed its mind, and should not throw. */
    el.actDash.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      Z.sim.dash();
    });
    el.actNade.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      el.actNade.setPointerCapture && el.actNade.setPointerCapture(e.pointerId);
      Z.sim.armNade();
    });
    el.actNade.addEventListener('pointerup', function (e) {
      e.preventDefault();
      if (Z.sim.nadeArmed) Z.sim.throwNade();
    });
    el.actNade.addEventListener('pointercancel', function () { Z.sim.cancelNade(); });
    el.actNade.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* ---- the trigger, and the switch that pulls it for you ---- */
    if (el.actFire) {
      el.actFire.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        el.actFire.setPointerCapture && el.actFire.setPointerCapture(e.pointerId);
        if (Z.input) Z.input.firing = true;
      });
      var stopFire = function (e) {
        if (e) e.preventDefault();
        if (Z.input) Z.input.firing = false;
      };
      el.actFire.addEventListener('pointerup', stopFire);
      el.actFire.addEventListener('pointercancel', stopFire);
      el.actFire.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
    if (el.actAuto) {
      el.actAuto.addEventListener('click', function () {
        Z.S.autoCombat = Z.S.autoCombat === false;
        U.hint(Z.S.autoCombat ? 'Auto fire on' : 'Auto fire off');
        Z.sfx.play('tick');
      });
    }
    /* ---- the two things you reach for ---- */
    if (el.useNade) {
      el.useNade.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        el.useNade.setPointerCapture && el.useNade.setPointerCapture(e.pointerId);
        Z.sim.armNade();
      });
      el.useNade.addEventListener('pointerup', function (e) {
        e.preventDefault();
        if (Z.sim.nadeArmed) { Z.sim.throwNade(); U.popUse(el.useNade); }
      });
      el.useNade.addEventListener('pointercancel', function () { Z.sim.cancelNade(); });
    }
    if (el.useMed) {
      el.useMed.addEventListener('click', function () {
        var p = Z.sim.p;
        if (!p || p.dead) return;
        if (p.hp >= p.maxHp) { U.hint('Unhurt'); return; }
        if (!Z.sim.spend({ meds: 1 })) { U.hint('No medical supplies'); Z.sfx.play('deny'); return; }
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.45);
        Z.fx.ring(p.x, p.y, 0.7, '95,196,90', 0.5);
        Z.fx.burst(p.x, p.y + 0.2, 8, '140,220,140', 3);
        Z.sfx.play('level');
        U.popUse(el.useMed);
        U.toast('Patched up', 'Back on your feet');
      });
    }
    if (el.wpnCard) {
      el.wpnCard.addEventListener('click', function () { U.openWeapons(); });
    }

    el.mmCv.addEventListener('click', function () { U.openMap(); });
    el.sheetClose.addEventListener('click', function () { U.closeSheet(); });
    el.scrim.addEventListener('click', function () { U.closeSheet(); });
    el.recenter.addEventListener('click', function () {
      Z.cam.follow = true;
      Z.cam.centerOn(Z.sim.p.x, Z.sim.p.y, false);
      U.showRecenter(false);
    });
    el.modeRot.addEventListener('click', function () { Z.build.rotate(1); });
    el.modeCancel.addEventListener('click', function () {
      if (Z.base.moving) Z.base.cancelMove(); else Z.build.cancel();
    });
    el.bdExit.addEventListener('click', function () { Z.base.leave(); });
    el.sv.addEventListener('click', function () { U.openWeapons(); });

    document.addEventListener('pointerdown', function () { Z.sfx.unlock(); }, { once: true });

    U.renderRes();
    paintGlyphs();
    U.renderNav();
    U.renderWeaponRail();
    U.renderQuests(true);
    paintFace();
  };

  /* The badge is the survivor's own face, cropped out of the front-facing
     idle frame the atlas already holds. Baking runs progressively, so this
     is called again the moment that frame exists. */
  function paintFace() {
    var cv = el.svFace;
    if (!cv) return;
    var c = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H);

    /* dir8 0 is the facing that looks straight at the camera */
    var src = null;
    try { src = Z.art.frame('idle', 0, 0); } catch (e) { src = null; }
    if (!src || !src.img) { U.faceDone = false; return; }

    /* Crop straight off the rig rather than off fractions of the cell: the
       head joint is at 1.57m and proj puts that at FOOT_Y - z*PPM. */
    var A = Z.art;
    var hy = A.FOOT_Y - 1.57 * A.PPM;
    var box = 0.46 * A.PPM;
    var sx = src.sx + A.FOOT_X - box / 2;
    var sy = src.sy + hy - box * 0.42;

    c.save();
    c.beginPath();
    c.arc(W / 2, H / 2, W / 2, 0, Z.TAU);
    c.clip();
    c.fillStyle = '#1A211B';
    c.fillRect(0, 0, W, H);
    c.imageSmoothingEnabled = true;
    c.drawImage(src.img, sx, sy, box, box, 0, 0, W, H);
    /* a little light from above so the crop does not read as a flat sticker */
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(228,224,214,.12)');
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.4)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.restore();
    U.faceDone = true;
  }
  U.paintFace = paintFace;

  U.bootProgress = function (k, label) {
    if (!el.boot) return;
    el.bootBar.style.transform = 'scaleX(' + Z.clamp01(k) + ')';
    el.bootPct.textContent = label || (Math.round(k * 100) + '%');
  };
  U.bootDone = function () {
    if (!el.boot) return;
    el.boot.classList.add('gone');
    setTimeout(function () { if (el.boot) el.boot.style.display = 'none'; }, 620);
  };

  /* ------------------------------------------------------------------ *
   * HUD - refreshed every frame, but only where the text changed
   * ------------------------------------------------------------------ */
  var lastTxt = {};
  function setTxt(node, v) {
    if (!node) return;
    var k = node.id || (node._k || (node._k = Math.random()));
    if (lastTxt[k] === v) return;
    lastTxt[k] = v;
    node.textContent = v;
  }

  var resNodes = {}, capNodes = {}, overflowCell = null;

  /* Every HUD glyph comes from one table of paths, so an icon is a name
     rather than forty lines of SVG pasted wherever it was needed. */
  function ico(name, cls) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"' +
           (cls ? ' class="' + cls + '"' : '') + '><path d="' +
           (Z.HUD_ICON[name] || '') + '"/></svg>';
  }
  U.ico = ico;
  /* fill in the placeholder paths the markup declares */
  function paintGlyphs() {
    var map = { magPath: 'mag', dashPath: 'run', nadePath: 'frag',
                autoPath: 'aim', firePath: 'bullet',
                useNadePath: 'frag', useMedPath: 'medkit' };
    for (var id in map) {
      var e = document.getElementById(id);
      if (e) e.setAttribute('d', Z.HUD_ICON[map[id]] || '');
    }
    document.documentElement.style.setProperty('--skull',
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' " +
      "viewBox='0 0 24 24'><path d='" + Z.HUD_ICON.skull + "'/></svg>\")");
  }

  /* Send the haul to the counter that is about to go up.

     A number changing in the far corner is not an acknowledgement of
     anything, and a burst at the source does not connect the two - you
     see a flash over here and, separately, a figure over there. So the
     resources travel: a handful of marks leave the thing you collected
     from and arc into the cell that counts them, and the cell only pops
     when they land. Two elements each, because an arc is a horizontal
     transition on the outer and a vertical one on the inner, and one
     element cannot ease two ways at once. */
  /* ------------------------------------------------------------------ *
   * Collecting
   *
   * A number changing in the far corner is not an acknowledgement of
   * anything, and a burst at the source does not connect the two: you
   * see a flash over here and, separately, a figure over there. So the
   * resources travel. Marks leave the thing you collected from, arc into
   * the cell that counts them, and the cell answers as each one lands.
   *
   * Everything here is built to survive a phone:
   *
   * - Nodes come from a pool and go back to it. A big haul on a slow
   *   night used to build and throw away a hundred elements a second.
   * - Only `transform` and `opacity` are animated, so the whole flight
   *   lives on the compositor and never touches layout.
   * - The number of marks is capped hard. Past a certain haul the answer
   *   is a bigger mark, not more of them - fifty icons crossing the
   *   screen is not generous, it is weather.
   * ------------------------------------------------------------------ */
  var flyPool = [], flyLive = 0, flyT = 0;
  var FLY_MAX = 26;                     /* in the air at once, all kinds */

  function takeFlyer() {
    var e = flyPool.pop();
    if (!e) {
      e = Z.el('span', 'flyer');
      e.appendChild(Z.el('span', 'flyi'));
    }
    return e;
  }
  function giveFlyer(e) {
    if (e.parentNode) e.parentNode.removeChild(e);
    e.className = 'flyer';
    e.style.cssText = '';
    var inn = e.firstChild;
    inn.className = 'flyi';
    inn.style.cssText = '';
    if (flyPool.length < 48) flyPool.push(e);
    flyLive--;
  }

  /* the puff of dust and chips where it came out of the ground */
  function sourceBurst(sx, sy, col, big) {
    var ring = Z.el('span', 'fring' + (big ? ' big' : ''));
    ring.style.left = sx + 'px';
    ring.style.top = sy + 'px';
    ring.style.setProperty('--rc', col);
    el.flyers.appendChild(ring);
    setTimeout(function () { if (ring.parentNode) ring.remove(); }, 520);

    var bits = big ? 9 : 5;
    for (var i = 0; i < bits; i++) {
      var b = Z.el('span', 'fbit');
      var a = Math.random() * Math.PI * 2;
      var d = (big ? 26 : 17) + Math.random() * (big ? 30 : 18);
      b.style.left = sx + 'px';
      b.style.top = sy + 'px';
      b.style.background = col;
      b.style.setProperty('--bx', (Math.cos(a) * d).toFixed(1) + 'px');
      b.style.setProperty('--by', (Math.sin(a) * d * 0.7 - 14).toFixed(1) + 'px');
      b.style.animationDelay = (i * 14) + 'ms';
      el.flyers.appendChild(b);
      (function (node) {
        setTimeout(function () { if (node.parentNode) node.remove(); }, 560 + i * 14);
      }(b));
    }
  }

  function flyOne(id, sx, sy, tx, ty, delay, scale, col, onLand) {
    if (flyLive >= FLY_MAX) { if (onLand) setTimeout(onLand, delay + 380); return; }
    flyLive++;
    var out = takeFlyer();
    var inn = out.firstChild;
    inn.innerHTML = Z.icon(id, Math.round(19 * scale));
    /* scattered a little so they do not leave as one lump */
    var jx = (Math.random() - 0.5) * 34, jy = (Math.random() - 0.5) * 22;
    out.style.left = (sx + jx) + 'px';
    out.style.top = (sy + jy) + 'px';
    var spin = (Math.random() - 0.5) * 90;
    el.flyers.appendChild(out);

    var dx = tx - (sx + jx), dy = ty - (sy + jy);
    var dur = 380 + Math.random() * 90;
    /* The pop on the way out matters as much as the flight: a mark that
       simply appears at full size has no moment of being picked up. */
    inn.style.transform = 'scale(.2)';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        out.style.transition = 'transform ' + dur + 'ms cubic-bezier(.35,0,.6,1)';
        inn.style.transition = 'transform ' + dur + 'ms cubic-bezier(.5,-0.45,.75,1),' +
                               'opacity ' + Math.round(dur * 0.55) + 'ms ease-in ' +
                               Math.round(dur * 0.45) + 'ms';
        out.style.transitionDelay = delay + 'ms';
        inn.style.transitionDelay = delay + 'ms';
        out.style.transform = 'translateX(' + dx.toFixed(1) + 'px)';
        inn.style.transform = 'translateY(' + dy.toFixed(1) + 'px) ' +
                              'rotate(' + spin.toFixed(0) + 'deg) scale(.5)';
        inn.style.opacity = '0.15';
      });
    });
    setTimeout(function () {
      giveFlyer(out);
      if (onLand) onLand();
    }, delay + dur + 30);
  }

  /* a landing: the cell knocks, and takes the resource's colour for a
     moment so you can see WHICH counter answered without reading it */
  function cellFor(id) { return capNodes[id] || overflowCell; }

  function landOn(id, step) {
    var cell = cellFor(id);
    if (!cell) return;
    cell.classList.remove('pop');
    void cell.offsetWidth;
    cell.classList.add('pop');
    Z.sfx.pitch = step;
    Z.sfx.play('pickup');
  }

  U.flyRes = function (wx, wy, got) {
    if (!got || !el.flyers) return;
    var reduce = window.matchMedia &&
                 window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var sx = Z.cam.sx(wx), sy = Z.cam.sy(wy);
    var keys = [], total = 0;
    for (var k0 in got) {
      if (!cellFor(k0)) continue;
      keys.push(k0);
      total += got[k0] / Math.max(1, (Z.RES[k0] && Z.RES[k0].weight) || 1);
    }
    if (!keys.length) return;
    if (reduce) { U.popRes(got); return; }

    /* What counts as a big haul is relative to the thing itself: eighty
       wood is a good tree, eighty components is a very good day. Log
       scale on the total, so both read as "a lot" at the right point. */
    var big = total >= 140 || keys.length >= 3;
    var slots = Math.max(1, keys.length);
    var perKind = Z.clamp(Math.floor(FLY_MAX / slots), 3, 9);
    var landed = 0, expect = 0, lastDelay = 0;

    keys.forEach(function (k, ki) {
      var amount = got[k];
      var res = Z.RES[k] || {};
      var col = res.color || '#E4E0D6';
      var r = cellFor(k).getBoundingClientRect();
      var tx = r.left + r.width / 2, ty = r.top + r.height / 2;

      /* more for a bigger haul, but the cap is the cap - past it the
         marks get bigger instead of more numerous */
      var num = Z.clamp(2 + Math.round(Math.log(1 + amount) * 1.7), 2, perKind);
      var scale = amount >= 300 ? 1.45 : amount >= 90 ? 1.2 : 1;

      sourceBurst(sx + (ki - (keys.length - 1) / 2) * 16, sy, col, big);

      for (var i = 0; i < num; i++) {
        var delay = ki * 40 + i * 52;
        lastDelay = Math.max(lastDelay, delay);
        expect++;
        (function (kk, step) {
          flyOne(kk, sx, sy, tx, ty, delay, scale, col, function () {
            landOn(kk, step);
            landed++;
          });
        }(k, i));
      }

      /* the figure itself, for a haul worth naming */
      if (amount >= 90) {
        var tag = Z.el('span', 'ftag');
        tag.innerHTML = Z.icon(k, 14) + '<b>+' + Z.fmt(amount) + '</b>';
        tag.style.left = sx + 'px';
        tag.style.top = (sy - 14 - ki * 20) + 'px';
        tag.style.setProperty('--rc', col);
        el.flyers.appendChild(tag);
        (function (node) {
          setTimeout(function () { if (node.parentNode) node.remove(); }, 1000);
        }(tag));
      }
    });

    if (big) {
      clearTimeout(flyT);
      flyT = setTimeout(function () { Z.sfx.play('haul'); }, lastDelay + 260);
    }
  };

  /* Knock the counters that just went up.

     The figure changing is the only acknowledgement the HUD gave, and a
     number quietly incrementing in the far corner is not an
     acknowledgement of anything. */
  U.popRes = function (got) {
    if (!got) return;
    for (var k in got) {
      var cell = cellFor(k);
      if (!cell) continue;
      cell.classList.remove('pop');
      /* reading offsetWidth restarts the animation on a cell that is
         still mid-pop from the last haul */
      void cell.offsetWidth;
      cell.classList.add('pop');
    }
  };

  U.renderRes = function () {
    Z.clear(el.resRow);
    resNodes = {};
    capNodes = {};
    Z.PRIME.forEach(function (id) {
      var r = Z.RES[id];
      /* The name belongs on the cell. Four unlabelled numbers behind four
         small marks is a puzzle every time you glance at it, and the
         glance is the whole point of a readout on the world screen. */
      var d = Z.el('button', 'res');
      /* The plus is the whole point of the chip: a number on its own only
         ever prompts one question, and this is the answer to it. */
      d.innerHTML = '<span class="rmk">' + Z.icon(id, 18) + '</span>' +
                    '<span class="rtx"><s></s><b></b></span>' +
                    '<span class="rplus">' + ico('plus') + '</span>' +
                    '<span class="rfill"><i></i></span>';
      d.querySelector('.rtx s').textContent = r.name;
      d.title = 'More ' + r.name.toLowerCase();
      /* The cell IS the answer to "where do I get more of this" - power
         and scrip come from the compound, the rest from the ground, so
         it opens whichever of the two applies. It used to be a separate
         plus button, which cost every cell 30px it could not spare once
         the cells carried their names. */
      d.addEventListener('click', function () {
        if (id === 'power' || id === 'coin') {
          if (!Z.base.isBase()) Z.base.enter();
          U.syncNav();
        } else {
          U.openStorage();
          U.sheetKey = 'storage';
          U.syncNav();
        }
      });
      el.resRow.appendChild(d);
      resNodes[id] = d.querySelector('b');
      capNodes[id] = d;
    });
    var more = Z.el('button', 'res more', '\u22EF');
    more.title = 'Everything else in storage';
    more.addEventListener('click', function () { U.openStorage(); });
    el.resRow.appendChild(more);
    /* Only four resources have a cell of their own; the rest live behind
       this button. They still need somewhere to fly to, or picking up
       forty cloth is silently ignored while picking up forty wood is a
       small celebration. */
    overflowCell = more;
  };

  /* One ability button: the sweep, the seconds, and the three states.

     `--cd` runs 360deg down to 0 as the cooldown burns off, so the dark
     wedge uncovers the icon. Writing the degrees straight onto the
     element rather than animating a class means the readout is exact at
     every frame instead of approximately right at the end of one. */
  function syncAct(node, left, total, armed) {
    if (!node) return;
    var cooling = left > 0.02;
    /* The cell CHARGES as the cooldown burns off rather than draining,
       so a full tile always means ready - the same reading whichever
       ability you glance at, and the same direction as every other
       gauge on this HUD. */
    /* clamped: a cooldown longer than its own total (a skill reset, a
       stat changing mid-cool) would otherwise hand the conic gradient a
       negative angle and unwind the ring the wrong way */
    var frac = cooling ? Z.clamp01(1 - left / total) : 1;
    node.style.setProperty('--fill', (frac * 100).toFixed(1) + '%');
    /* The disc draws its cooldown as a conic sweep reading `--cd`, and
       nothing was ever setting it - the ring sat empty through every
       cooldown the game has ever run. `--fill` is what the older square
       tiles used; both are written now so whichever styling is live has
       its number. */
    node.style.setProperty('--cd', (frac * 360).toFixed(1) + 'deg');
    var was = node.classList.contains('cooling');
    node.classList.toggle('cooling', cooling);
    node.classList.toggle('ready', !cooling);
    node.classList.toggle('armed', !!armed);
    /* one pulse the moment it comes back, and only then */
    if (was && !cooling) {
      node.classList.remove('charge');
      void node.offsetWidth;
      node.classList.add('charge');
      Z.sfx.play('tick');
    }
    var u = node.querySelector('.acd');
    if (cooling) setTxt(u, left >= 1 ? Math.ceil(left) + 's' : left.toFixed(1) + 's');
    else if (u.textContent) u.textContent = '';
  }

  /* The gun on the survivor card, painted from the same art the world
     uses rather than a separate icon - so what is drawn on the card is
     literally the thing in his hands. Repainted only when the weapon
     changes, because it is a canvas blit and nothing about it moves. */
  var wpnArtKey = '';
  function paintWpnArt() {
    if (!el.wpnArt) return;
    var id = Z.S.weapon;
    if (id === wpnArtKey) return;
    wpnArtKey = id;
    var w = Z.WEAPON[id];
    var cv = (w && Z.gunIcon) ? Z.gunIcon.get(w.shape, 64, 26) : null;
    var c = el.wpnArt.getContext('2d');
    c.clearRect(0, 0, el.wpnArt.width, el.wpnArt.height);
    if (cv) c.drawImage(cv, 0, 0, el.wpnArt.width, el.wpnArt.height);
  }

  /* The counter takes the hit.

     A resource that flies across the screen and then changes a number
     with no acknowledgement lands nowhere. The chip flinches when
     something arrives in it, which is the half-frame of feedback that
     ties the object you watched travel to the figure it became. */
  /* One frame of acknowledgement when something leaves the pouch. */
  U.popUse = function (node) {
    if (!node) return;
    node.classList.remove('used');
    void node.offsetWidth;
    node.classList.add('used');
  };

  /* What a skill does, next to the skill.

     The readout lived only in a strip along the bottom of the console,
     which is the one place you are not looking when your eye is on a
     tile near the top of a seven-branch tree - you hover something, the
     answer appears a screen away, and you have to look down and back up
     to connect them. The strip stays, because it is also the resting
     summary for the branch; this puts the same three lines beside the
     thing they describe.

     Placed against the tile and then pushed back inside the sheet if it
     would hang off an edge, so a tile at the right-hand side of the tree
     does not put its explanation off screen. */
  var skTip = null;

  function hideSkillTip() { if (skTip) skTip.classList.remove('on'); }

  function skillTip(hex, u, st) {
    if (!skTip) {
      skTip = Z.el('div', 'sktip');
      skTip.innerHTML = '<b></b><span></span><s></s>';
      document.body.appendChild(skTip);
    }
    setTxt(skTip.querySelector('b'), u.name);
    setTxt(skTip.querySelector('span'), st.locked
      ? 'Locked - needs ' + Z.UPGRADE[Z.UPG_NODE[u.id].pre].name +
        ' at level ' + Z.UPG_NODE[u.id].req
      : '+' + fmtStep(u) + ' ' + u.effect + ' per level');
    setTxt(skTip.querySelector('s'), st.max ? 'Maxed'
      : 'Lv ' + st.lvl + (u.max ? ' / ' + u.max : '') + '   next ' + Z.fmt(st.cost));
    skTip.classList.toggle('lock', !!st.locked);
    skTip.classList.add('on');

    var r = hex.getBoundingClientRect();
    var tw = skTip.offsetWidth, th = skTip.offsetHeight;
    var x = r.left + r.width / 2 - tw / 2;
    var y = r.top - th - 10;
    if (y < 8) y = r.bottom + 10;                  /* flip under the tile */
    x = Z.clamp(x, 8, Math.max(8, window.innerWidth - tw - 8));
    y = Z.clamp(y, 8, Math.max(8, window.innerHeight - th - 8));
    skTip.style.transform = 'translate(' + Math.round(x) + 'px,' +
                            Math.round(y) + 'px)';
  }

  U.resPop = function (id) {
    var node = resNodes[id];
    if (!node) return;
    node.classList.remove('pop');
    void node.offsetWidth;
    node.classList.add('pop');
  };

  /* ------------------------------------------------------------------ *
   * Frame counter
   *
   * Measured over a rolling second of real frames rather than from the
   * last delta, because a per-frame reading of 1/dt jitters between 50
   * and 70 on a machine that is holding a steady 60 and tells you
   * nothing. It also reports the worst frame in that second, which is
   * the number that actually corresponds to a stutter you felt.
   * ------------------------------------------------------------------ */
  var fpsT = 0, fpsN = 0, fpsWorst = 0, fpsEl = null;

  U.tickFps = function (dt) {
    if (!Z.S.showFps) {
      if (fpsEl && fpsEl.style.display !== 'none') fpsEl.style.display = 'none';
      return;
    }
    if (!fpsEl) {
      fpsEl = Z.el('div', 'fpsmeter');
      fpsEl.innerHTML = '<b></b><s></s>';
      document.getElementById('hud').appendChild(fpsEl);
    }
    fpsEl.style.display = '';
    fpsT += dt; fpsN++;
    if (dt > fpsWorst) fpsWorst = dt;
    if (fpsT >= 0.5) {
      var avg = fpsN / fpsT;
      var low = fpsWorst > 0 ? 1 / fpsWorst : avg;
      setTxt(fpsEl.querySelector('b'), Math.round(avg));
      setTxt(fpsEl.querySelector('s'), 'min ' + Math.round(low));
      fpsEl.classList.toggle('bad', avg < 30);
      fpsEl.classList.toggle('mid', avg >= 30 && avg < 52);
      fpsT = 0; fpsN = 0; fpsWorst = 0;
    }
  };

  U.tick = function (dt) {
    var S = Z.sim, p = S.p;
    if (!p) return;
    var st = Z.curStats();

    /* --- abilities --- */
    syncAct(el.actDash, p.dashT || 0, Z.DASH.cool, false);
    syncAct(el.actNade, p.nadeT || 0, Z.GRENADE.cool, S.nadeArmed);

    /* --- survivor --- */
    var hpK = Z.clamp01(p.hp / p.maxHp);
    el.svHp.style.transform = 'scaleX(' + hpK + ')';
    el.svHp.style.background = hpK < 0.3 ? '#D2562A' : hpK < 0.6 ? '#C08A3A' : '#7FA45C';
    setTxt(el.svLvl, Z.S.level);
    var need = Z.xpFor(Z.S.level);
    var xpK = Z.clamp01(Z.S.xp / need);
    if (el.svRing) el.svRing.style.setProperty('--xpdeg', (xpK * 360).toFixed(1) + 'deg');
    if (el.svXpBar) el.svXpBar.style.transform = 'scaleX(' + xpK + ')';
    /* No spaces around the slash. "156 / 156" is seven characters and two
       gaps in a column ninety pixels wide that also has to hold a label
       and a bar - it overflowed the row and pushed the figure thirteen
       pixels above its own bar, which is the misalignment. */
    if (el.svXpNum) setTxt(el.svXpNum, Z.fmt(Z.S.xp) + '/' + Z.fmt(need));
    if (el.svHpNum) setTxt(el.svHpNum, Math.ceil(p.hp) + '/' + Math.ceil(p.maxHp));

    /* --- the weapon in your hands --- */
    if (el.wpnBar) {
      var magK = st.mag > 0 ? Z.clamp01(p.ammo / st.mag) : 0;
      el.wpnBar.style.transform = 'scaleX(' + (p.reloadT > 0
        ? 1 - Z.clamp01(p.reloadT / Math.max(0.01, p.reloadTot)) : magK) + ')';
      el.wpnBar.style.background = p.reloadT > 0
        ? 'linear-gradient(90deg,#E3A63F,#F4CE7E)'
        : 'linear-gradient(90deg,#4EA8E8,#7ECBFF)';
    }
    paintWpnArt();
    if (U.syncWeaponRail) U.syncWeaponRail();

    /* --- what you can reach for --- */
    /* The two things in the pouch.

       A count when you have them, seconds when you are waiting, and a
       ring that drains so the wait is visible without reading the
       number. `off` is "cannot use this right now" and is deliberately
       distinct from "none left", because those are different problems. */
    if (el.useNade) {
      var ready = S.nadeReady && S.nadeReady();
      var nadeCool = Z.GRENADE && Z.GRENADE.cool || 1;
      var nLeft = p.nadeT || 0;
      /* grenades are gated by a cooldown, not a count, so the figure is
         the wait - and a mark rather than a number when there is none */
      setTxt(el.useNade.querySelector('b'), ready ? '' : Math.ceil(nLeft) + 's');
      el.useNade.style.setProperty('--fill',
        (ready ? 1 : Z.clamp01(1 - nLeft / nadeCool)) * 100 + '%');
      el.useNade.classList.toggle('off', !ready);
      el.useNade.classList.toggle('cooling', !ready);
    }
    if (el.useMed) {
      var meds = Math.floor(S.res('meds') || 0);
      var canMed = meds > 0 && p.hp < p.maxHp;
      setTxt(el.useMed.querySelector('b'), meds);
      el.useMed.style.setProperty('--fill', meds > 0 ? '100%' : '0%');
      el.useMed.classList.toggle('off', !canMed);
      el.useMed.classList.toggle('empty', meds <= 0);
    }
    if (el.actAuto) el.actAuto.classList.toggle('on', Z.S.autoCombat !== false);
    if (el.actFire) {
      el.actFire.classList.toggle('on', !!(Z.input && Z.input.firing));
    }

    var w = Z.WEAPON[Z.S.weapon];
    var ammoTxt = p.reloadT > 0 ? 'RELOADING' : p.ammo + ' / ' + st.mag;
    var lo = p.reloadT <= 0 && p.ammo <= Math.max(1, st.mag * 0.25);
    setTxt(el.svWpn, w.short);
    setTxt(el.svAmmo, ammoTxt);
    el.svAmmo.classList.toggle('lo', lo);
    el.svAmmo.classList.toggle('rel', p.reloadT > 0);
    /* the rack's equipped card carries the same round count, so you never
       have to look across the screen mid-fight to read it */
    if (el.grAmmo) {
      setTxt(el.grAmmo, ammoTxt);
      el.grAmmo.classList.toggle('lo', lo);
      el.grAmmo.classList.toggle('rel', p.reloadT > 0);
    }

    /* --- world --- */
    setTxt(el.wcDay, 'Day ' + Z.world.day);
    setTxt(el.wcTime, Z.clockStr(Z.world.t));
    var phase = Z.world.phase();
    setTxt(el.wcPhase, phase);
    if (el.wcZone && S.p) {
      var inside = Z.interior && Z.interior.active();
      var zn = inside && Z.interior.room
        ? Z.interior.room.name
        : (Z.city && Z.city.zoneName ? Z.city.zoneName(S.p.x, S.p.y) : '');
      setTxt(el.wcZone, zn);
      /* the districts worth robbing are the ones that will kill you */
      var rk = inside ? (Z.interior.room ? Z.interior.room.risk : 1)
                      : (Z.city && Z.city.riskAt ? Z.city.riskAt(S.p.x, S.p.y) : 1);
      el.wcZone.classList.toggle('hot', rk >= 1.5);
    }
    /* the orb is the sun or the moon, filled by how much light there is */
    var l = Z.world.l;
    el.wcOrb.style.background = S.bloodMoon
      ? 'radial-gradient(circle at 34% 30%, #FF8A72, #A81C16)'
      : (l > 0.4
        ? 'radial-gradient(circle at 34% 30%, #FFE7A8, #E0A33C)'
        : 'radial-gradient(circle at 34% 30%, #E8E4D8, #7E8794)');
    el.wcOrb.style.boxShadow = S.bloodMoon
      ? '0 0 14px rgba(200,30,24,.8)'
      : '0 0 ' + (4 + l * 12) + 'px rgba(227,166,63,' + (0.2 + l * 0.5) + ')';

    var showThreat = S.inWave || S.threat > 0;
    el.threat.classList.toggle('on', showThreat);
    if (showThreat) {
      setTxt(el.threatN, S.inWave
        ? 'Night ' + S.wave + '  \u00B7  ' + Math.max(0, S.waveLeft) + ' left'
        : S.threat + ' nearby');
      el.threat.classList.toggle('hot', S.inWave);
    }

    /* --- resources --- */
    var cap = S.capOf();
    for (var id in resNodes) {
      setTxt(resNodes[id], id === 'power'
        ? Math.round(S.power.supply) + '/' + Math.round(S.power.draw)
        : Z.fmt(S.res(id)));
      /* how close to the cap, drawn as a hairline under the number - a
         store that is full stops paying you for what you carry home, and
         that is worth seeing before you walk out to fetch more */
      var box = capNodes[id];
      if (!box) continue;
      var k = id === 'power'
        ? (S.power.draw > 0 ? Z.clamp01(S.power.supply / S.power.draw) : 1)
        : (id === 'coin' ? 0 : Z.clamp01(S.res(id) / Math.max(1, cap)));
      box.querySelector('.rfill i').style.transform = 'scaleX(' + k.toFixed(3) + ')';
      box.classList.toggle('full', id !== 'coin' && id !== 'power' && k > 0.995);
      box.classList.toggle('nocap', id === 'coin');
    }
    if (capNodes.power) {
      capNodes.power.classList.toggle('bad', S.power.ratio < 0.999);
    }

    /* keep the base dock's prices and power readout honest */
    if (barTick-- <= 0) {
      barTick = 12;
      if (Z.base.isBase()) U.syncBasePanel();
      U.renderQuests();
    }
    U.tickMap(dt);
    if (!U.faceDone) paintFace();

    if (U.sheet === 'weapons') {
      /* the bay is a still image - nothing to step */
      drawGunStage();
    }
  };

  var barTick = 0;

  /* ------------------------------------------------------------------ *
   * Mode chip - what is in your hands right now
   * ------------------------------------------------------------------ */
  /* Shown on the mode chip while something is on the cursor. */
  U.MODE_HINT = 'R to turn';

  U.setMode = function (mode) {
    U.mode = mode;
    el.modeChip.classList.toggle('on', !!mode);
    el.modeCancel.classList.toggle('gone', mode !== 'build');
    el.modeRot.classList.toggle('gone', mode !== 'build');
    document.body.classList.toggle('building', mode === 'build');
    if (Z.base.isBase()) U.renderBasePanel();
    if (mode === 'build') {
      var g = Z.build.ghost;
      setTxt(el.modeText, (Z.base.moving ? 'Moving ' : 'Placing ') +
                          (g ? g.def.name : ''));
    } else if (mode === 'aim') {
      setTxt(el.modeText, 'Manual aim');
    }
  };

  /* The build hotbar is gone. Building happens in Base mode, where the
     catalogue dock does the same job with room to show what a structure
     costs and does; a second bar of the same buttons over the world was
     exactly the kind of permanent panel this interface is meant to avoid. */

  function costHtml(cost) {
    var out = [];
    for (var k in cost) {
      var have = Z.sim.res(k) >= cost[k];
      out.push('<s class="' + (have ? '' : 'no') + '">' + Z.icon(k, 11) +
               Z.fmt(cost[k]) + '</s>');
    }
    return out.join('');
  }

  /* ------------------------------------------------------------------ *
   * Notices
   * ------------------------------------------------------------------ */
  U.toast = function (title, sub, kind) {
    var t = Z.el('div', 'toast' + (kind ? ' ' + kind : ''));
    t.innerHTML = '<b></b>' + (sub ? '<span></span>' : '');
    t.querySelector('b').textContent = title;
    if (sub) t.querySelector('span').textContent = sub;
    el.toasts.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { t.remove(); }, 400);
    }, 2600);
    while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
  };

  U.toastHtml = function (title, html, kind) {
    var t = Z.el('div', 'toast' + (kind ? ' ' + kind : ''));
    t.innerHTML = '<b></b><span class="tres">' + html + '</span>';
    t.querySelector('b').textContent = title;
    el.toasts.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { t.remove(); }, 400);
    }, 2600);
    while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
  };

  U.lootToast = function (name, got) {
    var bits = [];
    var html = [];
    for (var k in got) html.push(Z.icon(k, 12) + Z.fmt(got[k]));
    U.toastHtml(name, html.length ? html.join('') : 'Nothing useful', 'loot');
  };

  U.banner = function (title, sub) {
    el.banner.innerHTML = '<b></b><small></small>';
    el.banner.querySelector('b').textContent = title;
    el.banner.querySelector('small').textContent = sub || '';
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
  };

  var hintT = 0;
  U.hint = function (text) {
    el.hint.textContent = text;
    el.hint.classList.add('on');
    clearTimeout(hintT);
    hintT = setTimeout(function () { el.hint.classList.remove('on'); }, 1700);
  };

  U.showRecenter = function (on) {
    el.recenter.classList.toggle('on', !!on && !Z.cam.follow);
  };

  /* ------------------------------------------------------------------ *
   * Sheets
   * ------------------------------------------------------------------ */
/* Which section of the console a given screen belongs to.

     A screen is not always its own section - an attachment picker is part
     of Weapons, a structure's panel is part of Blueprints - and the rail
     should stay lit on the section you are in rather than going blank
     every time you step one level down. */
  var SKEY = {
    weapons: 'weapons', attach: 'weapons',
    storage: 'storage',
    build: 'build', structures: 'build', structure: 'build',
    skills: 'skills',
    map: 'map', locations: 'map',
    menu: 'menu', settings: 'menu', stats: 'menu', codex: 'menu'
  };

  U.openSheet = function (name, title, sub) {
    U.closeWeaponRail();
    var first = !U.sheet;
    U.sheet = name;
    U.sheetKey = SKEY[name] || null;
    el.sheetWrap.classList.add('open');
    el.scrim.classList.add('on');
    setTxt(el.sheetTitle, title);
    setTxt(el.sheetSub, sub || '');
    Z.clear(el.sheetBody);
    /* the class is the screen's own layout, so it goes out with the
       screen - left behind, the weapon bay's two columns were still in
       force when the blueprint catalogue drew itself into them */
    el.sheetBody.className = '';
    el.sheetBody.scrollTop = 0;
    renderSheetNav();
    U.syncNav();
    if (first) Z.sfx.play('tick');
    return el.sheetBody;
  };

  U.closeSheet = function () {
    hideSkillTip();
    if (!U.sheet) return;
    U.sheet = null;
    U.sheetKey = null;
    el.sheetWrap.classList.remove('open');
    el.scrim.classList.remove('on');
    Z.sim.sel = null;
    U.syncNav();
  };

  /* ------------------------------------------------------------------ *
   * The console's own section rail
   * ------------------------------------------------------------------ */
  var CONSOLE = [
    { k: 'weapons', name: 'Weapons', go: function () { U.openWeapons(); }, art:
      '<path d="M2.6 8.2h14.9l2 3.1H21v2.5h-4.1l-1.7 2.6h-3.4l-1-2.6H2.6z" opacity=".9"/>' +
      '<path d="M2.6 8.2h14.9l2 3.1H21v1.2H2.6z" opacity=".55"/>' +
      '<path d="M6.5 16.4h3.1l-.7 4.3H6z" opacity="1"/>' },
    { k: 'storage', name: 'Inventory', go: function () { U.openStorage(); }, art:
      '<path d="M10.2 2.2h3.6v2.6h-3.6z" opacity=".55"/>' +
      '<path d="M5.4 8.4c0-2.3 1.9-4 4.2-4h4.8c2.3 0 4.2 1.7 4.2 4v9.9c0 1.6-1 2.6-2.6 2.6H8c-1.6 0-2.6-1-2.6-2.6z" opacity=".85"/>' +
      '<path d="M5.4 8.9h13.2v2.2H5.4z" opacity="1"/>' +
      '<path d="M8.9 13.4h6.2v4.1H8.9z" opacity="1"/>' },
    { k: 'build', name: 'Build', go: function () { U.openBuildMenu(); }, art:
      '<path d="M12 3 2.6 10.4h18.8z" opacity=".95"/>' +
      '<path d="M4.8 10.4h14.4V21H4.8z" opacity=".72"/>' +
      '<path d="M9.7 14.2h4.6V21H9.7z" opacity="1"/>' },
    { k: 'skills', name: 'Skills', go: function () { U.openSkills(); }, art:
      '<path d="M12 2.6 20.4 12h-4.6v9.4h-3.8z" opacity=".95"/>' +
      '<path d="M12 2.6 3.6 12h4.6v9.4H12z" opacity=".55"/>' },
    { k: 'map', name: 'Map', go: function () { U.openMap(); }, art:
      '<path d="M2.6 5.6 9 3.2v15.2l-6.4 2.4z" opacity=".78"/>' +
      '<path d="M9 3.2 15 5.6v15.2L9 18.4z" opacity=".95"/>' +
      '<path d="M15 5.6l6.4-2.4v15.2L15 20.8z" opacity=".6"/>' },
    { k: 'menu', name: 'Menu', go: function () { U.openMenu(); }, art:
      '<path d="M3.6 5.2h16.8v2.4H3.6z" opacity=".95"/>' +
      '<path d="M3.6 10.8h16.8v2.4H3.6z" opacity=".7"/>' +
      '<path d="M3.6 16.4h16.8v2.4H3.6z" opacity=".45"/>' }
  ];

  function renderSheetNav() {
    if (!el.sheetNav) return;
    Z.clear(el.sheetNav);
    CONSOLE.forEach(function (c) {
      var b = Z.el('button', 'snav' + (U.sheetKey === c.k ? ' on' : ''));
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + c.art +
                    '</svg><span></span>';
      b.querySelector('span').textContent = c.name;
      b.addEventListener('click', function () {
        if (U.sheetKey === c.k) return;
        c.go();
      });
      el.sheetNav.appendChild(b);
    });
  }

  function section(parent, label) {
    var h = Z.el('h3', 'slab', label);
    parent.appendChild(h);
    return h;
  }

  function row(parent, cls) {
    var d = Z.el('div', cls || 'row');
    parent.appendChild(d);
    return d;
  }

  function btn(label, cls, fn) {
    var b = Z.el('button', 'btn ' + (cls || ''), label);
    if (fn) b.addEventListener('click', fn);
    return b;
  }

  /* ------------------------------------------------------------------ *
   * Build menu - the catalog
   * ------------------------------------------------------------------ */
  var buildCat = 'defense';

  U.openBuildMenu = function () {
    var body = U.openSheet('build', 'Blueprints', 'Unlock what you can build');
    var tabs = Z.el('div', 'tabs');
    Z.BCATS.forEach(function (c) {
      var t = Z.el('button', 'tab' + (c.id === buildCat ? ' on' : ''));
      t.textContent = c.name;
      t.addEventListener('click', function () { buildCat = c.id; U.openBuildMenu(); });
      tabs.appendChild(t);
    });
    body.appendChild(tabs);

    var list = Z.el('div', 'cards');
    body.appendChild(list);
    var cat = Z.BUILDINGS.filter(function (b) { return b.cat === buildCat; });
    /* measure them all in one readback before drawing any of them */
    primeInk(cat.map(function (d2) {
      return { id: d2.id, lvl: 1, rot: 0, key: inkKey(d2.id, 1, 0) };
    }));
    cat.forEach(function (def) {
      list.appendChild(buildCard(def));
    });
    U.renderStorageStrip(body);
  };

  /* A picture of a structure, sitting in the middle of its tile.

     These used to be drawn from the sprite's own anchor - the point it
     stands on the ground - which put every one of them along the bottom
     edge with a tile's worth of sky above it. The anchor is where it
     stands, not where it looks centred. */
  /* Retina backing for every preview. The declaration went missing when
     this block was rewritten, which is the sort of thing that only shows
     up the moment you open the build dock. */
  var THUMB_DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

  /* How much of a baked sprite is actually painted.

     A structure's canvas is sized for the worst case - a three-tile
     footprint with a radio mast on it - so a wall's canvas is mostly
     transparent air with a small wall near the bottom. Fitting the
     CANVAS to the tile, which is what every version of this did, sizes
     the art by how much empty space it came with: the wall got scaled to
     a fifth of the tile and sat in the corner, and every card in the
     strip looked broken.

     So measure the ink and fit that. Scanned at a two-pixel stride,
     which is plenty for a bounding box and a quarter of the reads, and
     cached per structure per level - it is the same answer every time. */
  /* ---- how much of a baked sprite is actually painted ----

     A structure's canvas is sized for the worst case - a three-tile
     footprint with a radio mast on it - so a wall's canvas is mostly
     transparent air with a small wall near the bottom of it. Fitting the
     CANVAS to a tile, which is what every version of this did, sizes the
     art by how much empty space it happened to come with: the wall was
     scaled to a fifth of its tile and sat behind its own caption, and
     every card in the strip looked blank.

     So measure the ink and fit that instead. The measuring is the
     interesting part. `getImageData` against a canvas the GPU has just
     written costs about four milliseconds whatever the size of the
     region, because it is not the reading that is slow - it is waiting
     for the card to hand the pixels back. Forty structures, forty
     stalls, and opening the build dock the first time took most of a
     second.

     One readback instead. Every sprite that needs measuring is drawn,
     small, into one grid and the whole grid comes back in a single
     call - one stall for the lot. The scaling itself is free (a
     hundredth of a millisecond), so shrinking each sprite to 56 pixels
     first costs nothing and makes the grid small enough to read in one
     go. The boxes come out accurate to a few source pixels, which is far
     finer than anything an 86px tile could show. */
  var inkCache = {};
  var INK_N = 56;

  /* find the painted rectangle inside one cell of a grid of pixels */
  function scanCell(d, gridW, gx, gy, sw, sh, k, w, h) {
    var x0 = sw, y0 = sh, x1 = -1, y1 = -1;
    for (var y = 0; y < sh; y++) {
      var row = (gy + y) * gridW + gx;
      for (var x = 0; x < sw; x++) {
        if (d[(row + x) * 4 + 3] > 6) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return { x0: 0, y0: 0, w: w, h: h };
    /* back to source pixels, with a pixel of slack for the downscale */
    var px0 = Math.max(0, (x0 - 1) / k), py0 = Math.max(0, (y0 - 1) / k);
    return { x0: px0, y0: py0,
             w: Math.min(w - px0, ((x1 - x0) + 3) / k),
             h: Math.min(h - py0, ((y1 - y0) + 3) / k) };
  }

  function inkKey(id, lvl, rot) { return id + ':' + (lvl || 1) + ':' + (rot || 0); }

  /* Measure a whole list at once. Anything already known is skipped, so
     calling this before a screen that draws forty previews costs one
     readback the first time and nothing at all afterwards. */
  function primeInk(items) {
    var todo = [];
    for (var i = 0; i < items.length; i++) {
      if (!inkCache[items[i].key]) todo.push(items[i]);
    }
    if (!todo.length) return;
    var cols = Math.min(8, todo.length), rows = Math.ceil(todo.length / cols);
    var grid = Z.canvas(cols * INK_N, rows * INK_N);
    var c = grid.getContext('2d', { willReadFrequently: true });
    var metas = [];
    todo.forEach(function (it, n) {
      var src = Z.art.building(it.id, it.lvl || 1, it.rot || 0);
      var k = INK_N / Math.max(src.width, src.height);
      var sw = Math.max(1, Math.round(src.width * k));
      var sh = Math.max(1, Math.round(src.height * k));
      var gx = (n % cols) * INK_N, gy = ((n / cols) | 0) * INK_N;
      c.drawImage(src, 0, 0, src.width, src.height, gx, gy, sw, sh);
      metas.push({ key: it.key, gx: gx, gy: gy, sw: sw, sh: sh,
                   k: k, w: src.width, h: src.height });
    });
    var d;
    try { d = c.getImageData(0, 0, grid.width, grid.height).data; }
    catch (e) {
      metas.forEach(function (m) { inkCache[m.key] = { x0: 0, y0: 0, w: m.w, h: m.h }; });
      return;
    }
    metas.forEach(function (m) {
      inkCache[m.key] = scanCell(d, grid.width, m.gx, m.gy, m.sw, m.sh, m.k, m.w, m.h);
    });
  }
  U.primeInk = primeInk;

  function inkBox(defId, lvl, rot) {
    var key = inkKey(defId, lvl, rot);
    if (!inkCache[key]) primeInk([{ id: defId, lvl: lvl, rot: rot, key: key }]);
    return inkCache[key];
  }

  /* A preview of a structure.

     Backed at twice the CSS size on a retina screen, because these are
     the only place a player sees a building close up and a 70px canvas
     stretched over 70px of a 2x display is a mush of soft edges.

     `cy` is where in the box the art's middle goes, as a fraction of the
     height, and `fit` is how much of the height it may use. The dock
     card puts its caption over the bottom third of the tile, so it asks
     for two thirds of the height, centred at a third of the way down. */
  function bldThumb(defId, lvl, rot, W, H, zoom, pad, cy, fit) {
    var cv = Z.art.building(defId, lvl || 1, rot || 0);
    var ink = inkBox(defId, lvl, rot);
    var img = Z.canvas(W * THUMB_DPR, H * THUMB_DPR);
    img.style.width = W + 'px';
    img.style.height = H + 'px';
    var c = img.getContext('2d');
    c.scale(THUMB_DPR, THUMB_DPR);

    var m = pad == null ? 8 : pad;
    var room = H * (fit == null ? 1 : fit);
    var s = Math.min((W - m * 2) / ink.w, (room - m * 2) / ink.h) * (zoom || 1);
    /* put the middle of the ink where it was asked for */
    var ox = W / 2 - (ink.x0 + ink.w / 2) * s;
    var oy = H * (cy == null ? 0.5 : cy) - (ink.y0 + ink.h / 2) * s;
    c.save();
    c.translate(ox, oy);
    c.scale(s, s);
    c.drawImage(cv, 0, 0);
    c.restore();
    return img;
  }

  function buildCard(def) {
    var why = Z.build.locked(def.id);
    var card = Z.el('div', 'card' + (why ? ' lock' : ''));

    var art = Z.el('div', 'cart');
    art.appendChild(bldThumb(def.id, 1, 0, 118, 94, 1, 9, 0.47, 0.98));
    card.appendChild(art);

    var info = Z.el('div', 'cinfo');
    info.appendChild(Z.el('b', null, def.name));
    info.appendChild(Z.el('p', null, def.blurb));
    var cost = Z.el('div', 'ccost');
    cost.innerHTML = costHtml(Z.build.costOf(def)) +
      (def.draw ? '<s>' + Z.icon('power', 11) + def.draw + '</s>' : '');
    info.appendChild(cost);
    card.appendChild(info);

    var act = Z.el('div', 'cact');
    if (why === 'Blueprint') {
      var price = Z.build.bpCost(def);
      var buy = btn('', 'go', function () {
        if (Z.build.unlock(def.id)) U.openBuildMenu();
        else U.hint('Not enough scrip');
      });
      buy.innerHTML = '<em>Unlock</em><span class="bcost">' + Z.icon('coin', 11) +
                      Z.fmt(price) + '</span>';
      if (Z.sim.res('coin') < price) buy.classList.add('off');
      act.appendChild(buy);
    } else if (why) {
      act.appendChild(Z.el('span', 'lockmsg', 'Reach ' + why));
    } else {
      act.appendChild(btn('Build it', 'go', function () {
        U.closeSheet();
        if (!Z.base.isBase()) Z.base.enter();
        Z.base.setTool('build');
        Z.build.select(def.id);
        U.renderBasePanel();
      }));
    }
    card.appendChild(act);
    return card;
  }

  /* A compact strip of every resource, shown inside menus that spend
     them rather than permanently on the world screen. */
  U.renderStorageStrip = function (parent) {
    section(parent, 'Stores  \u00B7  cap ' + Z.fmt(Z.sim.cap));
    var g = Z.el('div', 'resgrid');
    Z.RES_ORDER.forEach(function (id) {
      var r = Z.RES[id];
      var d = Z.el('div', 'rcell');
      d.innerHTML = Z.icon(id, 14) + '<b>' + Z.fmt(Z.sim.res(id)) + '</b><s>' + r.name + '</s>';
      if (id !== 'coin' && Z.sim.res(id) >= Z.sim.cap) d.classList.add('full');
      g.appendChild(d);
    });
    parent.appendChild(g);
  };

  U.openStorage = function () {
    var body = U.openSheet('storage', 'Storage', 'What the compound is holding');
    U.renderStorageStrip(body);
    section(body, 'Power');
    var P = Z.sim.power;
    var p = Z.el('div', 'powerbox');
    p.innerHTML =
      '<div class="prow"><span>Supply</span><b>' + Math.round(P.supply) + '</b></div>' +
      '<div class="prow"><span>Draw</span><b>' + Math.round(P.draw) + '</b></div>' +
      '<div class="prow"><span>Battery</span><b>' + Math.round(P.stored) + ' / ' + Math.round(P.cap) + '</b></div>' +
      '<div class="ptrack"><div style="transform:scaleX(' + Z.clamp01(P.ratio) + ')"></div></div>' +
      '<p>' + (P.ratio < 0.999
        ? 'Brownout. Lowest-priority structures shut down first.'
        : 'Everything is running.') + '</p>';
    body.appendChild(p);
  };

  /* ------------------------------------------------------------------ *
   * A structure you tapped in the world
   * ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ *
   * The structure panel
   *
   * Everything you own ends up inside a building, and deciding whether
   * to put another two hundred scrap into one used to be done from a
   * caption: a name, a level, one bar. So this is the screen for that
   * decision, and it is sized like one - the thing drawn large, what it
   * does now against what it would do next, exactly what that costs and
   * whether you have it, and the three other things you might do with it.
   *
   * It is not the console and it does not borrow the console's section
   * rail. The rail is for moving between parts of the game; this is one
   * object, opened by clicking that object. It floats over the compound
   * because the compound is the context for the decision.
   * ------------------------------------------------------------------ */

  /* What a structure does, at a level. One table, asked twice - once for
     where it is and once for where it would be - so "current vs next"
     cannot drift out of step with what the game actually computes. */
  function statsAt(def, lvl, live) {
    var sc = Z.bScale(lvl);
    var rows = [];
    if (def.gun) {
      rows.push(['Damage', def.gun.dmg * sc * Z.curStats().turretMult, 0]);
      rows.push(['Rate', def.gun.rps * Z.upMul('trate'), 2, '/s']);
      rows.push(['Range', def.gun.range * (0.6 + sc * 0.4) * Z.upMul('trange'), 1, ' m']);
    }
    if (def.makes) {
      for (var k in def.makes) {
        rows.push([Z.RES[k].name, def.makes[k] * sc * Z.upMul('prod'), 2, ' /s']);
      }
    }
    if (def.eats) {
      for (var e in def.eats) rows.push([Z.RES[e].name + ' used', def.eats[e] * sc, 2, ' /s']);
    }
    if (def.gen) rows.push(['Power', def.gen * sc * Z.upMul('power'), 0]);
    if (def.store) rows.push(['Battery', def.store * sc, 0]);
    if (def.cap) rows.push(['Storage', def.cap * sc * Z.upMul('store'), 0]);
    if (def.light) rows.push(['Light', def.light * Z.upMul('night'), 1, ' m']);
    if (def.heal) rows.push(['Healing', def.heal * sc, 1, ' hp/s']);
    if (def.thorns) rows.push(['Thorns', def.thorns * sc * Z.upMul('thorns'), 0]);
    if (def.trap) rows.push(['Trap damage', def.trap * sc * Z.upMul('traps'), 0, ' /s']);
    if (def.radius) rows.push(['Reach', def.radius * Z.upMul('radius'), 1, ' m']);
    if (def.vision) rows.push(['Vision', def.vision, 1, ' m']);
    if (def.crew) rows.push(['Beds', def.crew, 0]);
    rows.push(['Integrity', def.hp * Z.bHpScale(lvl) * Z.upMul('bhp'), 0]);
    if (def.draw) rows.push(['Power draw', def.draw, 0, live && !live.powered ? '  offline' : '']);
    return rows;
  }
  function fmtStat(v, dp, suffix) {
    var t = dp ? v.toFixed(dp) : Z.fmt(Math.round(v));
    return t + (suffix || '');
  }

  var ICON_REPAIR = '<path d="M16.8 2.2 19 4.4l-3 3 1.6 1.6 3-3 2.2 2.2a6.4 6.4 0 0 1-8 8L6.6 22 2 17.4l7.8-8.2a6.4 6.4 0 0 1 7-7z"/>';
  var ICON_MOVE = '<path d="M12 1.6 15.4 5h-2.2v5.8H19V8.6L22.4 12 19 15.4v-2.2h-5.8V19h2.2L12 22.4 8.6 19h2.2v-5.8H5v2.2L1.6 12 5 8.6v2.2h5.8V5H8.6z"/>';
  var ICON_SCRAP = '<path d="M7 3.4h10l-.8 2.4H7.8zM5.6 7.2h12.8l-1.2 13a1.8 1.8 0 0 1-1.8 1.6H8.6a1.8 1.8 0 0 1-1.8-1.6zM9.6 10h1.8v8.4H9.6zm3 0h1.8v8.4h-1.8z"/>';

  U.showStructPop = function (b) {
    var p = el.bpop;
    if (!b || b.dead) { U.hideStructPop(); return; }
    Z.sim.sel = b;
    Z.clear(p);
    var def = b.def, lvl = b.lvl, maxed = lvl >= Z.BMAXLVL;

    /* ---- header: the render, the name, the level track ---- */
    var head = Z.el('div', 'ph');
    var shot = Z.el('div', 'pshot');
    shot.appendChild(bldThumb(b.defId, lvl, b.rot, 118, 94, 1, 9, 0.47, 0.98));
    head.appendChild(shot);

    var t = Z.el('div', 'pt');
    var cat = Z.BCATS.filter(function (c) { return c.id === def.cat; })[0];
    t.innerHTML = '<div class="pcat"></div><h4></h4>' +
                  '<div class="plv"><span></span><span class="pips"></span></div>';
    t.querySelector('.pcat').textContent = cat ? cat.name : 'Structure';
    t.querySelector('h4').textContent = def.name;
    t.querySelector('.plv span').innerHTML =
      'LV ' + lvl + ' <s>/ ' + Z.BMAXLVL + '</s>';
    var pips = t.querySelector('.pips');
    for (var i = 1; i <= Z.BMAXLVL; i++) {
      pips.appendChild(Z.el('i', i <= lvl ? 'on' : null));
    }
    head.appendChild(t);
    p.appendChild(head);

    var x = Z.el('button', 'px', '\u00D7');
    x.title = 'Close';
    x.addEventListener('click', function () {
      Z.base.sel = null;
      U.hideStructPop();
    });
    p.appendChild(x);

    var body = Z.el('div', 'pbody');
    p.appendChild(body);
    var foot = Z.el('div', 'pfoot');

    /* ---- what it is for ---- */
    body.appendChild(Z.el('div', 'pblurb', def.blurb || ''));

    /* ---- condition ---- */
    var bar = Z.el('div', 'pbar');
    bar.innerHTML = '<i style="transform:scaleX(' +
                    Z.clamp01(b.hp / b.maxHp).toFixed(3) + ')"></i>';
    var hurt = b.hp < b.maxHp;
    bar.querySelector('i').style.background =
      b.hp / b.maxHp < 0.35 ? 'var(--rust)' : 'var(--moss)';
    body.appendChild(bar);

    /* ---- the table: now, and next ---- */
    body.appendChild(Z.el('div', 'slab',
      maxed ? 'Performance' : 'This level \u2192 next'));
    var now = statsAt(def, lvl, b);
    var next = maxed ? null : statsAt(def, lvl + 1, b);
    var tbl = Z.el('div', 'stats');
    now.forEach(function (r, i) {
      var row = Z.el('div', 'strow');
      var nv = next ? next[i][1] : r[1];
      var same = !next || Math.abs(nv - r[1]) < 1e-6;
      if (same) row.classList.add('flat');
      row.innerHTML = '<span></span><b></b><em>\u2192</em><u></u>';
      row.querySelector('span').textContent = r[0];
      row.querySelector('b').textContent = fmtStat(r[1], r[2], r[3]);
      row.querySelector('em').textContent = same ? '' : '\u2192';
      row.querySelector('u').textContent = same ? '' : fmtStat(nv, r[2], r[3]);
      tbl.appendChild(row);
    });
    body.appendChild(tbl);

    /* ---- what it is holding ---- */
    var held = Z.sim.stockOf(b);
    if (held) {
      var hold = Z.el('div', 'phold');
      var parts = ['<span>Ready to collect</span>'];
      for (var hk in held) parts.push('<s>' + Z.icon(hk, 12) + Z.fmt(held[hk]) + '</s>');
      hold.innerHTML = parts.join('');
      body.appendChild(hold);
      var col = Z.el('button', 'pmain');
      col.innerHTML = '<em>Collect</em><span></span>';
      col.querySelector('span').textContent = 'from the ' + def.name.toLowerCase();
      col.addEventListener('click', function () {
        var got = Z.sim.collect(b);
        if (!got) return;
        var said = [];
        for (var gk in got) said.push(Z.fmt(got[gk]) + ' ' + Z.RES[gk].name.toLowerCase());
        U.toast('Collected', said.join(', ') + ' from the ' + def.name.toLowerCase());
        U.showStructPop(b);
      });
      foot.appendChild(col);
    }

    /* ---- the upgrade ---- */
    if (!maxed) {
      var uc = Z.bUpCost(def, lvl);
      body.appendChild(Z.el('div', 'slab', 'Upgrade to level ' + (lvl + 1)));
      var costs = Z.el('div', 'costs');
      var afford = true;
      for (var ck in uc) {
        var have = Z.sim.res(ck), need = uc[ck];
        if (have < need) afford = false;
        var chip = Z.el('s', have < need ? 'no' : null);
        chip.innerHTML = Z.icon(ck, 13) + '<b>' + Z.fmt(need) + '</b>' +
                         (have < need ? '<i>/ ' + Z.fmt(Math.floor(have)) + '</i>' : '');
        costs.appendChild(chip);
      }
      body.appendChild(costs);
      var up = Z.el('button', 'pmain' + (afford ? '' : ' off'));
      up.innerHTML = '<em>Upgrade</em><span></span>';
      up.querySelector('span').textContent =
        afford ? 'LV ' + lvl + ' \u2192 ' + (lvl + 1) : 'Not enough materials';
      up.addEventListener('click', function () {
        if (Z.sim.upgradeBuilding(b)) {
          U.toast(def.name, 'Upgraded to level ' + b.lvl);
          U.showStructPop(b);
        } else U.hint('Not enough materials');
      });
      foot.appendChild(up);
    } else {
      var done = Z.el('button', 'pmain done');
      done.innerHTML = '<em>Fully upgraded</em><span>Level ' + Z.BMAXLVL + '</span>';
      foot.appendChild(done);
    }

    /* ---- repair, move, dismantle ---- */
    var row3 = Z.el('div', 'prow3');
    function small(cls, label, art, fn, off) {
      var e = Z.el('button', 'pb ' + (cls || '') + (off ? ' off' : ''));
      e.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + art + '</svg><span></span>';
      e.querySelector('span').textContent = label;
      if (!off) e.addEventListener('click', fn);
      row3.appendChild(e);
      return e;
    }
    small('', 'Repair', ICON_REPAIR, function () {
      if (Z.sim.repair(b)) { U.toast(def.name, 'Repaired'); U.showStructPop(b); }
      else U.hint('Not enough materials');
    }, !hurt);
    small('', 'Move', ICON_MOVE, function () {
      if (b.defId === 'core') { U.hint('The command post stays'); return; }
      if (!Z.base.isBase()) Z.base.enter();
      U.hideStructPop();
      Z.base.startMove(b);
    }, b.defId === 'core');
    small('danger', 'Dismantle', ICON_SCRAP, function () {
      U.confirm('Dismantle ' + def.name + '?',
        'You get back ' + Math.round(Math.min(95, 60 * Z.upMul('breclaim'))) +
        '% of what it cost. The ground it stood on stays clear.',
        function () {
          Z.sim.removeBuilding(b, true);
          Z.base.sel = null;
          U.hideStructPop();
          U.toast('Dismantled', 'Materials recovered');
        });
    }, b.defId === 'core');
    foot.appendChild(row3);
    p.appendChild(foot);

    p.classList.remove('gone');
  };

  U.hideStructPop = function () {
    el.bpop.classList.add('gone');
    if (Z.sim.sel && !Z.base.sel) Z.sim.sel = null;
  };

  /* the old name, kept because the Structures list and the world click
     both call it */
  U.openStructure = function (b) {
    if (U.sheet) U.closeSheet();
    Z.sim.sel = b;
    U.showStructPop(b);
  };

  /* ------------------------------------------------------------------ *
   * Weapon bay
   * ------------------------------------------------------------------ */
  var gunCv = null;
  var wCat = null;
  var wSel = null;

  U.openWeapons = function (pick) {
    if (pick && Z.WEAPON[pick]) wSel = pick;
    wSel = wSel && Z.WEAPON[wSel] ? wSel : Z.S.weapon;
    var body = U.openSheet('weapons', 'Weapons',
                           'Pick one, fit it, upgrade it');
    body.className = 'wbay';

    var main = Z.el('div', 'wmain');
    var side = Z.el('div', 'wside');
    body.appendChild(main);
    body.appendChild(side);

    /* The bay shows the gun flat, at size.

       It used to be a turntable: the real mesh, draggable, with a reset
       button and a hint telling you it could be spun. The meshes are
       authored dark and dense and a spun one tells you nothing a still
       side view does not - you cannot read a magazine, a barrel length
       or a stock from a grey three-quarter lozenge, which is precisely
       why the rack cards were drawn flat in the first place. So the bay
       now shows the same drawing the rest of the game uses, large. */
    /* Turnable where there is something to turn.

       The mesh pack ships geometry for the seven original weapons only.
       The six added since have no mesh, so those fall back to the flat
       drawing rather than to an empty stage - the bay says which it is
       showing instead of pretending. */
    var stage = Z.el('div', 'stage');
    gunCv = Z.el('canvas', 'gunstage');
    stage.appendChild(gunCv);
    main.appendChild(stage);
    /* Flat, and short.

       The turntable was 314px of stage plus its toolbar, which pushed
       the stats down and the attachment slots clean off the bottom of
       the sheet - measured at y=759 in a 600px viewport, where
       `elementFromPoint` returns nothing at all. The slots were being
       rendered, were the right size, and could not be touched. A
       weapon page you cannot reach the attachments on is broken
       whatever the picture at the top is doing. */
    stage.classList.add('flat');
    paintBayGun();

    renderWeaponPanel(main);
    renderArsenal(side);
  };

  /* The arsenal column: the same rack, every weapon in it, selecting for
     inspection rather than equipping. */
  function renderArsenal(side) {
    section(side, 'Arsenal');
    var list = Z.el('div', 'grl');
    Z.WEAPONS.forEach(function (ww) {
      var c = U.gunCard(ww.id, { w: 250, h: 92, full: true, sel: wSel });
      c.addEventListener('click', function () {
        if (wSel === ww.id) return;
        wSel = ww.id;
        if (Z.gunView && Z.gunView.reset) Z.gunView.reset();
        U.openWeapons();
      });
      list.appendChild(c);
    });
    side.appendChild(list);
  }

  function renderWeaponPanel(body) {
    var w = Z.WEAPON[wSel];
    var owned = !!Z.S.owned.weapons[wSel];
    var st = Z.stats(wSel, Z.equipOf(wSel));
    var lvl = Z.wlvlOf(wSel);

    var head = Z.el('div', 'whead');
    head.innerHTML =
      '<div class="wtop"><h4></h4><s class="rar"></s></div>' +
      '<p class="wblurb"></p>';
    head.querySelector('h4').textContent = w.name;
    var rar = head.querySelector('.rar');
    rar.textContent = Z.RARITY[w.rarity].name;
    rar.style.background = Z.RARITY[w.rarity].color;
    head.querySelector('.wblurb').textContent = w.blurb;
    body.appendChild(head);

    var stats = Z.el('div', 'wstats');
    [['Damage', Z.fmt(st.dmg) + (st.pellets > 1 ? ' \u00D7' + st.pellets : '')],
     ['Fire rate', (st.rpm / 60).toFixed(1) + '/s'],
     ['Magazine', st.mag],
     ['Reload', st.reload.toFixed(2) + 's'],
     ['Range', st.range.toFixed(1) + ' m'],
     ['Crit', Math.round(st.crit * 100) + '%  \u00D7' + st.critMult.toFixed(1)],
     ['Pierce', st.pierce],
     ['DPS', Z.fmt(st.dps)]
    ].forEach(function (s) {
      var r = Z.el('div', 'wstat');
      r.innerHTML = '<span></span><b></b>';
      r.querySelector('span').textContent = s[0];
      r.querySelector('b').textContent = s[1];
      stats.appendChild(r);
    });
    body.appendChild(stats);

    var perks = [];
    for (var sp in st.specials) if (Z.SPECIAL_TEXT[sp]) perks.push(Z.SPECIAL_TEXT[sp]);
    if (perks.length) {
      var pr = Z.el('div', 'perks');
      perks.forEach(function (t) { pr.appendChild(Z.el('span', 'perk', t)); });
      body.appendChild(pr);
    }

    var acts = Z.el('div', 'stacts');
    if (!owned) {
      var buy = btn('', 'go', function () {
        if (Z.S.level < w.unlock) { U.hint('Reach level ' + w.unlock); return; }
        if (!Z.sim.spend({ coin: w.cost })) { U.hint('Not enough scrip'); return; }
        Z.S.owned.weapons[wSel] = 1;
        Z.S.weapon = wSel;
        Z.invalidate();
        Z.sfx.play('unlock');
        U.renderWeaponRail();
        U.openWeapons();
      });
      buy.innerHTML = '<em>Buy</em><span class="bcost">' + Z.icon('coin', 11) + Z.fmt(w.cost) + '</span>';
      if (Z.sim.res('coin') < w.cost || Z.S.level < w.unlock) buy.classList.add('off');
      acts.appendChild(buy);
    } else if (Z.S.weapon !== wSel) {
      acts.appendChild(btn('Equip', 'go', function () {
        Z.S.weapon = wSel;
        Z.invalidate();
        Z.sim.p.ammo = Z.curStats().mag;
        Z.sfx.play('tick');
        U.renderWeaponRail();
        U.openWeapons();
      }));
    }
    if (owned && lvl < Z.WMAXLVL) {
      var uc = Z.wUpCost(w, lvl);
      var up = btn('', owned && Z.S.weapon === wSel ? 'go' : 'ghost', function () {
        if (!Z.sim.spend({ coin: uc })) { U.hint('Not enough scrip'); return; }
        Z.S.wlvl[wSel] = lvl + 1;
        Z.invalidate();
        Z.sfx.play('build');
        U.openWeapons();
      });
      up.innerHTML = '<em>Upgrade to Lv ' + (lvl + 1) + '</em><span class="bcost">' +
                     Z.icon('coin', 11) + Z.fmt(uc) + '</span>';
      if (Z.sim.res('coin') < uc) up.classList.add('off');
      acts.appendChild(up);
    }
    body.appendChild(acts);

    /* --- attachments --- */
    if (owned) {
      section(body, 'Attachments');
      var slots = Z.el('div', 'slots');
      w.slots.forEach(function (slotId) {
        var cur = Z.equipOf(wSel)[slotId];
        var a = cur && Z.ATTACH[cur];
        var s = Z.el('button', 'slot' + (a ? ' has' : ''));
        s.innerHTML = '<i>' + Z.SLOT[slotId].name + '</i><b>' + (a ? a.name : 'Empty') + '</b>';
        s.addEventListener('click', function () { openAttach(slotId); });
        slots.appendChild(s);
      });
      body.appendChild(slots);
    }

  }

  function openAttach(slotId) {
    var w = Z.WEAPON[wSel];
    var body = U.openSheet('attach', Z.SLOT[slotId].name, w.name);
    var back = btn('\u2190 Back to ' + w.name, 'ghost', function () { U.openWeapons(); });
    back.classList.add('wide');
    body.appendChild(back);

    var list = Z.el('div', 'cards attach');
    Z.ATTACHMENTS.filter(function (a) { return a.slot === slotId; }).forEach(function (a) {
      var have = !!Z.S.owned.attach[a.id];
      var eq = Z.equipOf(wSel)[slotId] === a.id;
      var card = Z.el('div', 'card' + (eq ? ' on' : '') + (have ? '' : ' lock'));
      var info = Z.el('div', 'cinfo');
      info.appendChild(Z.el('b', null, a.name));
      info.appendChild(Z.el('p', null, a.blurb));
      var mods = Z.el('div', 'mods');
      for (var k in a.mods) {
        var v = a.mods[k];
        var label = k.replace('Flat', '');
        var txt = (k.indexOf('Flat') >= 0)
          ? (v > 0 ? '+' : '') + (label === 'crit' ? Math.round(v * 100) + '%' : v)
          : (v > 0 ? '+' : '') + Math.round(v * 100) + '%';
        mods.appendChild(Z.el('s', v > 0 ? 'up' : 'dn', label + ' ' + txt));
      }
      if (a.special && Z.SPECIAL_TEXT[a.special]) {
        mods.appendChild(Z.el('s', 'sp', Z.SPECIAL_TEXT[a.special]));
      }
      info.appendChild(mods);
      card.appendChild(info);

      var act = Z.el('div', 'cact');
      if (!have) {
        var buy = btn('', 'go', function () {
          if (Z.S.level < a.unlock) { U.hint('Reach level ' + a.unlock); return; }
          if (!Z.sim.spend({ coin: a.cost })) { U.hint('Not enough scrip'); return; }
          Z.S.owned.attach[a.id] = 1;
          if (!Z.setAttach(wSel, slotId, a.id)) {
            U.hint('Will not fit this weapon'); return;
          }
          Z.sfx.play('unlock');
          openAttach(slotId);
        });
        buy.innerHTML = '<span class="bcost">' + Z.icon('coin', 11) + Z.fmt(a.cost) + '</span>';
        if (Z.sim.res('coin') < a.cost || Z.S.level < a.unlock) buy.classList.add('off');
        act.appendChild(buy);
      } else if (eq) {
        act.appendChild(btn('Remove', 'ghost', function () {
          Z.setAttach(wSel, slotId, null);
          openAttach(slotId);
        }));
      } else {
        act.appendChild(btn('Fit', 'go', function () {
          if (!Z.setAttach(wSel, slotId, a.id)) {
            U.hint('Will not fit this weapon'); return;
          }
          Z.sfx.play('tick');
          openAttach(slotId);
        }));
      }
      card.appendChild(act);
      list.appendChild(card);
    });
    body.appendChild(list);
  }

  function drawGunStage() {
    if (!gunCv || !gunCv.isConnected) return;
    paintBayGun();
  }

  /* ------------------------------------------------------------------ *
   * Menu
   * ------------------------------------------------------------------ */
  U.openMenu = function () {
    var body = U.openSheet('menu', 'Menu', 'Day ' + Z.world.day + '  \u00B7  Level ' + Z.S.level);
    var groups = [
      ['Survivor', [
        ['Weapons', U.openWeapons],
        ['Skills', U.openSkills],
        ['Record', U.openStats]
      ]],
      ['Base', [
        ['Build', function () { U.closeSheet(); Z.base.enter(); }],
        ['Blueprints', function () { U.openBuildMenu(); }],
        ['Structures', U.openStructures],
        ['Storage', U.openStorage]
      ]],
      ['World', [
        ['Map', U.openMap],
        ['Locations', U.openLocations]
      ]],
      ['Other', [
        ['Codex', U.openCodex],
        ['Settings', U.openSettings]
      ]]
    ];
    groups.forEach(function (g) {
      section(body, g[0]);
      var list = Z.el('div', 'menulist');
      g[1].forEach(function (item) {
        var b = Z.el('button', 'menuitem', item[0]);
        b.addEventListener('click', item[1]);
        list.appendChild(b);
      });
      body.appendChild(list);
    });
  };

/* ------------------------------------------------------------------ *
   * The skill tree
   *
   * A flat-top honeycomb. Every skill is a neighbour of the one it grew
   * out of, so the shape of the board IS the dependency graph and there
   * is nothing to read to work out what leads where.
   *
   * Geometry, once: a flat-top hexagon of width W is W*sin(60) tall, its
   * columns step W*3/4 across, and each column sits half a hex lower
   * than the last - which is the +q/2 in the row term.
   * ------------------------------------------------------------------ */
  /* Wide enough for a link to live in. At 6px the tiles all but touched
     and a centre-to-centre line could only show as a nub sticking out of
     a card's edge, which reads as a mark ON the card rather than as a
     join between two of them. */
  var HEXGAP = 14;

  /* The board is measured in grid units first and turned into pixels
     second, so the tiles are BUILT at the size that fits rather than
     drawn at a fixed size and then scaled down - which is the difference
     between crisp type and a blurry screenshot of some type. */
  /* Which branch is on screen. Kept outside openSkills so reopening the
     screen puts you back on the board you were reading. */
  var skillCat = 'player';

  function groupOf(id) {
    for (var i = 0; i < Z.UPG_GROUPS.length; i++) {
      if (Z.UPG_GROUPS[i].id === id) return Z.UPG_GROUPS[i];
    }
    return Z.UPG_GROUPS[0];
  }
  function skillsIn(grp) {
    return Z.UPGRADES.filter(function (u) { return u.grp === grp; });
  }

  /* The board is measured in grid units first and turned into pixels
     second, so the tiles are BUILT at the size that fits rather than
     drawn at a fixed size and then scaled down - which is the difference
     between crisp type and a blurry screenshot of some type. */
  function treeExtent(list) {
    var q0 = 1e9, q1 = -1e9, y0 = 1e9, y1 = -1e9;
    list.forEach(function (u) {
      var nd = Z.UPG_NODE[u.id];
      if (!nd) return;
      if (nd.q < q0) q0 = nd.q;
      if (nd.q > q1) q1 = nd.q;
      if (nd.y < y0) y0 = nd.y;
      if (nd.y > y1) y1 = nd.y;
    });
    return { q0: q0, y0: y0, cols: q1 - q0, rows: y1 - y0 };
  }

  /* the widest tile that fits both ways, within reason */
  function hexFit(list, availW, availH) {
    var e = treeExtent(list);
    var byW = (availW - HEXGAP * e.cols) / (0.75 * e.cols + 1);
    var byH = (availH - HEXGAP * e.rows) / (0.86603 * (e.rows + 1));
    /* never below the size the type stops being readable at - a board
       that has to be dragged beats one that cannot be read */
    return Z.clamp(Math.min(byW, byH), 78, 172);
  }

  /* A skill is shut until its parent has been taken far enough - but one
     that already has levels in it never closes, so a save from before
     the tree existed keeps everything it bought. */
  function upgState(u) {
    var lvl = Z.S.upg[u.id] || 0;
    var nd = Z.UPG_NODE[u.id] || { q: 0, y: 0 };
    var st = { lvl: lvl, node: nd, cost: Z.upgCost(u, lvl),
               max: !!(u.max && lvl >= u.max), locked: false, need: 0 };
    if (nd.pre && !lvl) {
      var pl = Z.S.upg[nd.pre] || 0;
      if (pl < nd.req) { st.locked = true; st.need = nd.req - pl; }
    }
    return st;
  }

  /* The board is built once per branch and repainted in place.

     Rebuilding it on every purchase meant every tile thrown away and
     made again for one number changing, which loses the scroll position,
     loses whichever tile the pointer was on, and flickers - and none of
     that is survivable once a tile can be held down to buy repeatedly. */
  var tiles = [], links = [], treeFoot = null, holdT = 0, treeTabs = [];

  function paintTile(t) {
    var u = t.u, st = upgState(u);
    t.st = st;
    var poor = !st.max && !st.locked && Z.sim.res('coin') < st.cost;
    t.hex.className = 'hex ' + u.grp +
      (st.max ? ' max' : '') + (st.locked ? ' shut' : '') +
      (poor ? ' poor' : '') + (!st.lvl && !st.locked ? ' fresh' : '');
    /* "LV 0" reads as "LV 8" in a mono face at tile size, which is the
       worst possible confusion on a screen about levels. A skill you
       have not started says so in words instead. */
    setTxt(t.lv, st.locked ? '\uD83D\uDD12'
               : st.max ? 'MAX'
               : !st.lvl ? 'NEW'
               : (u.max ? st.lvl + '/' + u.max : 'LV ' + st.lvl));
    t.bt.innerHTML = st.locked
      ? Z.UPGRADE[Z.UPG_NODE[u.id].pre].name + ' ' + Z.UPG_NODE[u.id].req
      : (st.max ? '\u2014' : Z.icon('coin', 10) + Z.fmt(st.cost));
    if (t.bar) {
      t.bar.style.transform = 'scaleX(' +
        Z.clamp01(st.lvl / (u.max || 1)).toFixed(3) + ')';
    }
    t.hex.title = st.locked
      ? u.name + ' \u2014 locked until ' + Z.UPGRADE[Z.UPG_NODE[u.id].pre].name +
        ' reaches level ' + Z.UPG_NODE[u.id].req
      : u.name + ' \u2014 +' + fmtStep(u) + ' ' + u.effect + ' per level';
  }

  /* how many levels are in a branch, for the tab */
  function branchLevels(grp) {
    var n = 0;
    skillsIn(grp).forEach(function (u) { n += Z.S.upg[u.id] || 0; });
    return n;
  }

  function syncTree() {
    tiles.forEach(paintTile);
    links.forEach(function (L) {
      var st = upgState(L.u);
      /* three states, not two: shut, open, and open with something
         already taken on the far side of it - which is the one that
         shows the route you actually walked */
      L.el.setAttribute('class', st.locked ? 'shut'
                                : (st.lvl ? 'open live' : 'open'));
    });
    treeTabs.forEach(function (tb) {
      var got = branchLevels(tb.g.id);
      tb.n.textContent = got ? String(got) : '\u2013';
      tb.el.className = 'treetab' + (skillCat === tb.g.id ? ' on' : '');
    });
    setTxt(el.sheetSub, Z.fmt(Z.sim.res('coin')) + ' scrip to spend');
  }

  /* Hold a tile down and it keeps buying, faster the longer you hold.
     A skill that runs to level 45 is forty-five clicks otherwise. */
  function buyTile(t) {
    var st = t.st;
    if (st.locked) {
      U.hint('Take ' + Z.UPGRADE[Z.UPG_NODE[t.u.id].pre].name +
             ' to level ' + Z.UPG_NODE[t.u.id].req + ' first');
      return false;
    }
    if (st.max) return false;
    if (!Z.sim.spend({ coin: st.cost })) { U.hint('Not enough scrip'); return false; }
    Z.S.upg[t.u.id] = st.lvl + 1;
    Z.invalidate();
    Z.sfx.play('build');
    syncTree();
    if (treeFoot) treeFoot.show(t.u, t.st);
    return true;
  }

  function stopHold() { clearTimeout(holdT); holdT = 0; }

  function startHold(t) {
    stopHold();
    if (!buyTile(t)) return;
    var wait = 380;
    (function again() {
      holdT = setTimeout(function () {
        if (!buyTile(t)) { stopHold(); return; }
        wait = Math.max(70, wait * 0.74);
        again();
      }, wait);
    })();
  }
  window.addEventListener('pointerup', stopHold);
  window.addEventListener('pointercancel', stopHold);

  U.openSkills = function () {
    var body = U.openSheet('skills', 'Skills',
                           Z.fmt(Z.sim.res('coin')) + ' scrip to spend');
    body.className = 'treescreen';
    stopHold();

    var view = Z.el('div', 'treeview');
    body.appendChild(view);

    /* Seven branches, one on screen at a time.

       All forty-three tiles on one honeycomb is a wall: at a size that
       fits a phone the type is unreadable, and at a size you can read it
       has to be dragged in two directions to find anything. A branch at
       a time is six or eight tiles, which fits, and the tabs say at a
       glance where your levels have gone. */
    var tabs = Z.el('div', 'treetabs');
    treeTabs = [];
    Z.UPG_GROUPS.forEach(function (g) {
      var tb = Z.el('button', 'treetab');
      tb.style.setProperty('--gc', g.col);
      tb.innerHTML = '<span></span><i></i>';
      tb.querySelector('span').textContent = g.name;
      tb.title = g.name + ' skills';
      tb.addEventListener('click', function () {
        if (skillCat === g.id) return;
        skillCat = g.id;
        buildBoard(view);
      });
      tabs.appendChild(tb);
      treeTabs.push({ g: g, el: tb, n: tb.querySelector('i') });
    });
    view.appendChild(tabs);

    /* What a skill actually does will not fit on the tile, and a tooltip
       is no use to a thumb. One line under the board, filled in by
       whichever tile you are on. */
    var foot = Z.el('div', 'treefoot');
    foot.innerHTML = '<b></b><span></span><s></s>';
    view.appendChild(foot);

    function rest() {
      var g = groupOf(skillCat);
      var taken = 0, all = 0;
      Z.UPGRADES.forEach(function (u) { all += Z.S.upg[u.id] || 0; });
      taken = branchLevels(skillCat);
      foot.querySelector('b').textContent = g.name;
      foot.querySelector('span').textContent =
        'Tap a tile for a level, hold it for several.';
      foot.querySelector('s').textContent =
        taken + ' here \u00B7 ' + all + ' in all';
    }
    function show(u, st) {
      foot.querySelector('b').textContent = u.name;
      foot.querySelector('span').textContent = st.locked
        ? 'Locked \u2014 needs ' + Z.UPGRADE[Z.UPG_NODE[u.id].pre].name +
          ' at level ' + Z.UPG_NODE[u.id].req
        : '+' + fmtStep(u) + ' ' + u.effect + ' per level';
      foot.querySelector('s').textContent = st.max ? 'Maxed'
        : 'Lv ' + st.lvl + (u.max ? ' / ' + u.max : '') +
          '  \u00B7  next ' + Z.fmt(st.cost);
    }
    treeFoot = { rest: rest, show: show };

    function buildBoard(view2) {
      var old = view2.querySelector('.tree');
      if (old) old.parentNode.removeChild(old);
      tiles = []; links = [];
      stopHold();

      var g = groupOf(skillCat);
      var list = skillsIn(skillCat);
      var stage = Z.el('div', 'tree');
      stage.style.setProperty('--gc', g.col);
      stage.style.setProperty('--gdim', g.dim);
      view2.appendChild(stage);

      /* measure the room, then pick a tile size to suit it */
      var HEXW = hexFit(list, view2.clientWidth - 26,
                        view2.clientHeight - foot.offsetHeight - tabs.offsetHeight - 26);
      var HEXH = HEXW * 0.86603;
      var pos = {}, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      list.forEach(function (u) {
        var nd = Z.UPG_NODE[u.id];
        if (!nd) return;
        var pt = { x: (HEXW * 0.75 + HEXGAP) * nd.q,
                   y: (HEXH + HEXGAP) * nd.y };
        pos[u.id] = pt;
        if (pt.x < x0) x0 = pt.x;
        if (pt.y < y0) y0 = pt.y;
        if (pt.x > x1) x1 = pt.x;
        if (pt.y > y1) y1 = pt.y;
      });
      var W = (x1 - x0) + HEXW, H = (y1 - y0) + HEXH;
      stage.style.width = W + 'px';
      stage.style.height = H + 'px';
      /* the type inside a tile follows the tile */
      stage.style.setProperty('--hxs', (HEXW / 118).toFixed(3));

      /* the joints, behind the tiles: adjacent hexes already touch, so
         all this has to do is bridge the gap between them and colour it
         by whether that path is open yet */
      var NS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'treelink');
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      list.forEach(function (u) {
        var nd = Z.UPG_NODE[u.id];
        if (!nd || !nd.pre || !pos[nd.pre]) return;
        var a = pos[nd.pre], b = pos[u.id];
        /* Trimmed to the join. A full centre-to-centre line is almost
           entirely underneath the two tiles; only the piece crossing the
           gap is ever seen, so only that piece is drawn - centred on the
           midpoint and run a few pixels under each tile so it reads as
           one link between two of them rather than as two stubs. */
        var ax = a.x - x0 + HEXW / 2, ay = a.y - y0 + HEXH / 2;
        var bx = b.x - x0 + HEXW / 2, by = b.y - y0 + HEXH / 2;
        var len = Math.hypot(bx - ax, by - ay) || 1;
        var ux = (bx - ax) / len, uy = (by - ay) / len;
        var mx = (ax + bx) / 2, my = (ay + by) / 2;
        var reach = HEXGAP / 2 + 5;
        var ln = document.createElementNS(NS, 'line');
        ln.setAttribute('x1', mx - ux * reach);
        ln.setAttribute('y1', my - uy * reach);
        ln.setAttribute('x2', mx + ux * reach);
        ln.setAttribute('y2', my + uy * reach);
        svg.appendChild(ln);
        links.push({ u: u, el: ln });
      });
      stage.appendChild(svg);

      list.forEach(function (u) {
        var pt = pos[u.id];
        if (!pt) return;
        var hex = Z.el('button', 'hex');
        hex.style.left = (pt.x - x0) + 'px';
        hex.style.top = (pt.y - y0) + 'px';
        hex.style.width = HEXW + 'px';
        hex.style.height = HEXH + 'px';
        hex.innerHTML =
          '<span class="hxf"></span>' +
          '<span class="hxc">' +
            '<i class="hxlv"></i>' +
            '<svg class="hxi" viewBox="0 0 24 24" fill-rule="evenodd" aria-hidden="true">' +
              (Z.UPG_ICON[u.id] || '') + '</svg>' +
            '<b class="hxn"></b>' +
            (u.max ? '<span class="hxpg"><em></em></span>' : '') +
            '<s class="hxb"></s>' +
          '</span>';
        hex.querySelector('.hxn').textContent = u.name;

        var t = { u: u, hex: hex,
                  lv: hex.querySelector('.hxlv'),
                  bt: hex.querySelector('.hxb'),
                  bar: hex.querySelector('.hxpg em') };
        tiles.push(t);

        /* pointerdown rather than click, so a hold can run; the click
           that follows is ignored, but a keyboard one (detail 0) is not */
        hex.addEventListener('pointerdown', function () { startHold(t); });
        hex.addEventListener('pointerup', stopHold);
        hex.addEventListener('pointerleave', function () { stopHold(); rest(); });
        hex.addEventListener('click', function (ev) { if (!ev.detail) buyTile(t); });
        hex.addEventListener('pointerenter', function () {
          show(u, t.st); skillTip(hex, u, t.st);
        });
        hex.addEventListener('pointerleave', hideSkillTip);
        hex.addEventListener('focus', function () {
          show(u, t.st); skillTip(hex, u, t.st);
        });
        hex.addEventListener('blur', function () { rest(); hideSkillTip(); });
        stage.appendChild(hex);
      });

      syncTree();
      rest();

      /* Room for the readout comes off the scroll box, not off the
         board: an explicit margin on a margin:auto element kills the
         auto on that side, which parked the whole tree against the
         bottom edge. */
      view2.style.paddingBottom = foot.offsetHeight + 'px';
      view2.style.paddingTop = tabs.offsetHeight + 'px';
    }

    buildBoard(view);
  };

  /* A window resize changes how much room the board has, and the tiles
     were sized to the old figure. Rebuild, once things have settled. */
  var treeT = 0;
  window.addEventListener('resize', function () {
    if (U.sheet !== 'skills') return;
    clearTimeout(treeT);
    treeT = setTimeout(function () {
      if (U.sheet === 'skills') U.openSkills();
    }, 180);
  });

  function fmtStep(u) {
    switch (u.fmt) {
      case 'pct': return Math.round(u.step * 100) + '%';
      case 'ptt': return (u.step * 100).toFixed(0) + '%';
      case 'mult': return '\u00D7' + u.step.toFixed(2);
      case 'flat': return u.step;
      case 'flat1': return u.step.toFixed(2);
      case 'hours': return u.step + 'h';
      case 'pctbase35': return Math.round(u.step * 100) + '%';
      default: return u.step;
    }
  }

  U.openStructures = function () {
    var body = U.openSheet('structures', 'Structures', Z.sim.buildings.length + ' standing');
    var byCat = {};
    Z.sim.buildings.forEach(function (b) {
      (byCat[b.def.cat] = byCat[b.def.cat] || []).push(b);
    });
    Z.BCATS.forEach(function (c) {
      var list = byCat[c.id];
      if (!list || !list.length) return;
      section(body, c.name);
      var wrap = Z.el('div', 'stlist');
      list.forEach(function (b) {
        var r = Z.el('button', 'strow' + (b.dead ? ' dead' : ''));
        r.innerHTML = '<b></b><s></s><em></em>';
        r.querySelector('b').textContent = b.def.name;
        r.querySelector('s').textContent = 'Lv ' + b.lvl;
        r.querySelector('em').textContent = b.dead ? 'destroyed'
          : (!b.powered && b.def.draw ? 'no power' : Math.round(b.hp / b.maxHp * 100) + '%');
        if (!b.powered && b.def.draw && !b.dead) r.classList.add('warn');
        r.addEventListener('click', function () {
          U.closeSheet();
          Z.cam.follow = false;
          Z.cam.x = b.x; Z.cam.y = b.y;
          U.showRecenter(true);
          Z.sim.sel = b;
          setTimeout(function () { U.openStructure(b); }, 90);
        });
        wrap.appendChild(r);
      });
      body.appendChild(wrap);
    });
    if (!Z.sim.buildings.length) {
      body.appendChild(Z.el('p', 'empty', 'Nothing built yet. Open Build and put something down.'));
    }
  };

  /* ---- map ---- */
  U.openMap = function () {
    var body = U.openSheet('map', 'Map',
      Math.round(Z.world.explored() * 100) + '% explored');
    body.className = 'mapscreen';
    var wrap = Z.el('div', 'mapwrap');
    var size = 680;
    var cv = Z.canvas(size, size);
    cv.className = 'mapcv';
    wrap.appendChild(cv);
    body.appendChild(wrap);
    drawMap(cv);
    cv.addEventListener('click', function (e) {
      var r = cv.getBoundingClientRect();
      var wx = (e.clientX - r.left) / r.width * Z.world.SIZE;
      var wy = (e.clientY - r.top) / r.height * Z.world.SIZE;
      if (!Z.world.seen(wx, wy)) { U.hint('You have not been there'); return; }
      Z.cam.follow = false;
      Z.cam.x = wx; Z.cam.y = wy;
      U.showRecenter(true);
      U.closeSheet();
    });
    body.appendChild(Z.el('p', 'note', 'Tap anywhere you have explored to look at it.'));
  };

  function drawMap(cv) {
    var c = cv.getContext('2d');
    var N = Z.world.SIZE, S = cv.width / N;
    c.fillStyle = '#06080A';
    c.fillRect(0, 0, cv.width, cv.height);
    var step = 2;
    for (var y = 0; y < N; y += step) {
      for (var x = 0; x < N; x += step) {
        if (!Z.world.seen(x, y)) continue;
        var t = Z.world.terrain[Z.world.idx(x, y)];
        var col = Z.world.PAL[t].d;
        c.fillStyle = Z.rgb(Z.mix(col, [20, 24, 26], 0.42));
        c.fillRect(x * S, y * S, S * step, S * step);
      }
    }
    /* props read as texture, not as individual dots */
    c.fillStyle = 'rgba(40,58,34,.55)';
    for (var i = 0; i < Z.world.props.length; i += 3) {
      var p = Z.world.props[i];
      if (!Z.world.seen(p.x, p.y)) continue;
      if (p.def.art !== 'tree' && p.def.art !== 'pine') continue;
      c.fillRect(p.x * S - 1, p.y * S - 1, 2.5, 2.5);
    }
    /* big ruins are worth finding again */
    Z.world.props.forEach(function (p) {
      if (!p.def.big || !Z.world.seen(p.x, p.y)) return;
      c.fillStyle = 'rgba(190,180,160,.75)';
      c.fillRect(p.x * S - 2, p.y * S - 2, 4, 4);
    });
    /* structures */
    Z.sim.buildings.forEach(function (b) {
      c.fillStyle = b.def.gun ? '#D2562A' : b.defId === 'core' ? '#E4E0D6' : '#7FA45C';
      c.fillRect(b.x * S - 2, b.y * S - 2,
                 Math.max(3, Z.fpw(b.def, b.rot) * S),
                 Math.max(3, Z.fph(b.def, b.rot) * S));
    });
    /* zombies, if they are somewhere you can see */
    c.fillStyle = 'rgba(210,86,42,.85)';
    Z.sim.zombies.forEach(function (z) {
      if (z.dying) return;
      c.beginPath(); c.arc(z.x * S, z.y * S, 2, 0, Z.TAU); c.fill();
    });
    /* you */
    var p2 = Z.sim.p;
    if (p2) {
      c.strokeStyle = '#E4E0D6';
      c.lineWidth = 2;
      c.beginPath(); c.arc(p2.x * S, p2.y * S, 5, 0, Z.TAU); c.stroke();
      c.fillStyle = '#E4E0D6';
      c.beginPath(); c.arc(p2.x * S, p2.y * S, 2, 0, Z.TAU); c.fill();
    }
    /* viewport box */
    var b2 = Z.cam.bounds(0);
    c.strokeStyle = 'rgba(226,222,212,.25)';
    c.lineWidth = 1;
    c.strokeRect(b2.x0 * S, b2.y0 * S, (b2.x1 - b2.x0) * S, (b2.y1 - b2.y0) * S);
  }

  U.openLocations = function () {
    var body = U.openSheet('locations', 'Locations', 'Places worth the walk');
    var found = Z.world.props.filter(function (p) { return p.def.big && Z.world.seen(p.x, p.y); });
    if (!found.length) {
      body.appendChild(Z.el('p', 'empty', 'Nothing found yet. Head out and look around.'));
      return;
    }
    var p0 = Z.sim.p;
    found.sort(function (a, b) {
      return Z.dist2(p0.x, p0.y, a.x, a.y) - Z.dist2(p0.x, p0.y, b.x, b.y);
    });
    var list = Z.el('div', 'stlist');
    found.forEach(function (p) {
      var d = Math.round(Z.dist(p0.x, p0.y, p.x, p.y));
      var r = Z.el('button', 'strow');
      r.innerHTML = '<b></b><s></s><em>' + d + ' m</em>';
      r.querySelector('b').textContent = p.def.name;
      r.querySelector('s').textContent = 'Loot';
      r.addEventListener('click', function () {
        U.closeSheet();
        Z.sim.setTask(p, 'loot');
        Z.cam.follow = true;
        U.hint('Heading to the ' + p.def.name.toLowerCase());
      });
      list.appendChild(r);
    });
    body.appendChild(list);
  };

  U.openStats = function () {
    var body = U.openSheet('stats', 'Record', 'Since you arrived');
    var st = Z.curStats();
    var rows = [
      ['Day', Z.world.day],
      ['Level', Z.S.level],
      ['Nights survived', Math.max(0, Z.S.wave - 1)],
      ['Best night', Z.S.bestWave],
      ['Kills', Z.fmtInt(Z.S.kills)],
      ['Cleared', Z.fmtInt(Z.S.cleared || 0)],
      ['Structures', Z.sim.buildings.length],
      ['Explored', Math.round(Z.world.explored() * 100) + '%'],
      ['Damage per second', Z.fmt(st.dps)],
      ['Move speed', st.speed.toFixed(2) + ' m/s']
    ];
    var g = Z.el('div', 'facts');
    rows.forEach(function (r) {
      var d = Z.el('div', 'fact');
      d.innerHTML = '<span></span><b></b>';
      d.querySelector('span').textContent = r[0];
      d.querySelector('b').textContent = r[1];
      g.appendChild(d);
    });
    body.appendChild(g);

    if (Z.S.bestWave >= Z.PRESTIGE_WAVE) {
      section(body, 'Extraction');
      var cores = Z.coresFor(Z.S.bestWave);
      var p = Z.el('p', 'note', 'Leave this map behind for ' + cores +
        ' cores. Each core is +' + Math.round(Z.CORE_BONUS * 100) +
        '% damage and scrip, forever. The world regenerates.');
      body.appendChild(p);
      body.appendChild(btn('Extract', 'danger', function () {
        U.confirm('Extract?', 'You lose this map and everything on it, and keep ' +
          cores + ' cores.', function () {
            Z.S.cores += cores;
            Z.S.totalCores += cores;
            Z.doPrestige();
          });
      }));
    }
  };

  U.openCodex = function () {
    var body = U.openSheet('codex', 'Codex', 'What is out there');
    section(body, 'The dead');
    var list = Z.el('div', 'stlist');
    Object.keys(Z.ZTYPES).forEach(function (k) {
      var t = Z.ZTYPES[k];
      var seen = Z.S.wave >= t.from;
      var r = Z.el('div', 'strow' + (seen ? '' : ' dead'));
      r.innerHTML = '<b></b><s></s><em></em>';
      r.querySelector('b').textContent = seen ? t.name : '?????';
      r.querySelector('s').textContent = seen ? 'from night ' + t.from : 'not yet met';
      r.querySelector('em').textContent = seen
        ? (t.armor ? Math.round(t.armor * 100) + '% armour' : t.spd > 1.5 ? 'fast' : '')
        : '';
      list.appendChild(r);
    });
    body.appendChild(list);
    section(body, 'Salvage');
    var g = Z.el('div', 'stlist');
    Object.keys(Z.PROPS).forEach(function (k) {
      var p = Z.PROPS[k];
      var r = Z.el('div', 'strow');
      var bits = [];
      if (p.yield) for (var y in p.yield) bits.push(Z.RES[y].name + ' ' + p.yield[y]);
      if (p.loot) bits.push('loot');
      r.innerHTML = '<b></b><s></s><em>' + p.work.toFixed(1) + 's</em>';
      r.querySelector('b').textContent = p.name;
      r.querySelector('s').textContent = bits.join('  ');
      g.appendChild(r);
    });
    body.appendChild(g);
  };

  U.openSettings = function () {
    var body = U.openSheet('settings', 'Settings', 'Display, controls and the save');

    /* ---- view ---- */
    section(body, 'View');
    var fov = Z.el('div', 'setrow');
    fov.innerHTML =
      '<div class="setlab"><span>Field of view</span>' +
      '<b id="fovVal"></b></div>' +
      '<input id="fovRange" class="slider" type="range" min="1" max="100" step="1">' +
      '<p class="sethint">The camera holds this. Nothing zooms it mid-game.</p>';
    body.appendChild(fov);
    var fr = fov.querySelector('#fovRange'), fv = fov.querySelector('#fovVal');
    var cur = Z.S.fov == null ? Z.cam.FOV_DEF : Z.S.fov;
    function paintFov(v) {
      fv.textContent = v;
      /* the track is a gradient, so it needs telling where the grip is */
      fr.style.setProperty('--p', ((v - 1) / 99 * 100).toFixed(1) + '%');
    }
    fr.value = cur;
    paintFov(cur);
    fr.addEventListener('input', function () {
      var v = parseInt(fr.value, 10) || Z.cam.FOV_DEF;
      Z.S.fov = v;
      paintFov(v);
      Z.cam.applyFov(v);
      Z.invalidate();
    });

    /* ---- quality ---- */
    section(body, 'Quality');
    var qs = Z.el('div', 'qgrid');
    Z.QORDER.forEach(function (key) {
      var q = Z.QUALITY[key];
      var on = (Z.S.quality || 'high') === key;
      var b = Z.el('button', 'qbtn' + (on ? ' on' : ''));
      b.innerHTML = '<b></b><s></s>';
      b.querySelector('b').textContent = q.name;
      b.querySelector('s').textContent =
        key === 'low' ? 'Runs anywhere'
      : key === 'med' ? 'Balanced'
      : key === 'high' ? 'Recommended' : 'Everything on';
      b.addEventListener('click', function () {
        Z.S.quality = key;
        Z.render.invalidateAll();
        Z.invalidate();
        U.openSettings();
        U.toast(q.name + ' quality', 'The ground is being repainted');
      });
      qs.appendChild(b);
    });
    body.appendChild(qs);

    body.appendChild(toggle('Frame counter', !!Z.S.showFps, function (v) {
      Z.S.showFps = v;
      U.toast(v ? 'Frame counter on' : 'Frame counter off',
              v ? 'Average and worst frame, top right' : 'Hidden again');
    }));

    body.appendChild(toggle('Visual effects', Z.S.post !== false, function (v) {
      Z.S.post = v;
      Z.invalidate();
      U.toast(v ? 'Effects on' : 'Effects off',
              v ? 'Vignette, haze and the light bloom' : 'The plain picture');
    }));
    var qn = Z.el('p', 'sethint',
      'Quality sets how finely the ground is painted and how much is ' +
      'scattered on it. Effects are the pass over the top.');
    body.appendChild(qn);

    section(body, 'Game');
    body.appendChild(toggle('Sound', Z.sfx.on, function (v) {
      Z.sfx.on = v; Z.S.sound = v;
      if (v) Z.sfx.unlock();
    }));
    body.appendChild(toggle('Auto-fire', Z.S.autoCombat !== false, function (v) {
      Z.S.autoCombat = v;
      U.toast(v ? 'Auto-fire on' : 'Auto-fire off',
              v ? 'The survivor shoots what comes close' : 'Right-click or use the thumb pad');
    }));
    section(body, 'Controls');
    var help = Z.el('div', 'facts');
    [['Move', 'WASD or arrows, or the left thumb pad'],
     ['Camera', 'Drag or scroll to pan  \u00B7  view is set above'],
     ['Aim', 'Right-click and hold, or the right thumb pad'],
     ['Build', 'B for base mode, 1-7 to pick a structure'],
     ['Turn a piece', 'R while placing, shift-R the other way'],
     ['Weapon', 'Z and X to step through, F for the bay'],
     ['Reload', 'R'],
     ['Recentre', 'Space'],
     ['Map', 'M'],
     ['Menu', 'Q']
    ].forEach(function (r) {
      var d = Z.el('div', 'fact');
      d.innerHTML = '<span></span><b></b>';
      d.querySelector('span').textContent = r[0];
      d.querySelector('b').textContent = r[1];
      help.appendChild(d);
    });
    body.appendChild(help);

    /* CC-BY asks for the credit to travel with the work, so it lives in
       the game rather than in a file nobody ships. */
    section(body, 'Credits');
    var cr = Z.el('div', 'facts');
    [['Art', 'Drawn by the game at runtime, every frame'],
     ['Code', 'No engine, no libraries, one canvas']
    ].forEach(function (r) {
      var d = Z.el('div', 'fact');
      d.innerHTML = '<span></span><b></b>';
      d.querySelector('span').textContent = r[0];
      d.querySelector('b').textContent = r[1];
      cr.appendChild(d);
    });
    body.appendChild(cr);

    section(body, 'Danger');
    body.appendChild(btn('Wipe save and restart', 'danger', function () {
      U.confirm('Wipe everything?', 'The map, the compound and every upgrade. This cannot be undone.',
        function () { Z.save.wipe(); });
    }));
  };

  function toggle(label, on, fn) {
    var t = Z.el('button', 'toggle' + (on ? ' on' : ''));
    t.innerHTML = '<span></span><i class="sw"></i>';
    t.querySelector('span').textContent = label;
    t.addEventListener('click', function () {
      on = !on;
      t.classList.toggle('on', on);
      fn(on);
      Z.S.dirty = true;
    });
    return t;
  }

  /* ------------------------------------------------------------------ *
   * Modal
   * ------------------------------------------------------------------ */
  U.confirm = function (title, text, onYes) {
    U.modal = true;
    el.modal.classList.add('on');
    el.modalBox.innerHTML = '<h3></h3><p></p><div class="mrow"></div>';
    el.modalBox.querySelector('h3').textContent = title;
    el.modalBox.querySelector('p').textContent = text;
    var row = el.modalBox.querySelector('.mrow');
    row.appendChild(btn('Cancel', 'ghost', closeModal));
    row.appendChild(btn('Confirm', 'danger', function () { closeModal(); onYes(); }));
  };
  function closeModal() {
    U.modal = false;
    el.modal.classList.remove('on');
  }
  U.closeModal = closeModal;

  /* ------------------------------------------------------------------ *
   * Offline report
   * ------------------------------------------------------------------ */
  U.showOffline = function (rep) {
    U.offline = rep;
    U.modal = true;
    el.modal.classList.add('on');
    var bits = [];
    for (var k in rep.res) {
      bits.push('<s>' + Z.icon(k, 14) + Z.fmt(rep.res[k]) + '</s>');
    }
    el.modalBox.innerHTML =
      '<h3>While you were away</h3>' +
      '<p>' + Z.dur(rep.real) + ' gone' + (rep.capped ? ', capped at ' + Z.dur(rep.seconds) : '') +
      '. The compound kept working.</p>' +
      '<div class="offres">' + bits.join('') + '</div>' +
      (rep.kills ? '<p class="note">The turrets put down ' + Z.fmtInt(rep.kills) + '.</p>' : '') +
      '<div class="mrow"></div>';
    el.modalBox.querySelector('.mrow').appendChild(btn('Collect', 'go', function () {
      Z.sim.claimOffline(rep);
      Z.sfx.play('loot');
      closeModal();
    }));
  };


  /* ------------------------------------------------------------------ *
   * Base mode
   *
   * The dense half of the interface. It only exists while you are
   * planning the compound; step back out to Explore and the screen is
   * the thin HUD again.
   * ------------------------------------------------------------------ */
  var TOOLS = [
    { id: 'build', name: 'Build',
      path: 'M3 21h18M5 21V10l7-5 7 5v11M9.5 21v-5h5v5' },
    { id: 'upgrade', name: 'Upgrade',
      path: 'M12 20V5M6 11l6-6 6 6' },
    { id: 'demolish', name: 'Demolish',
      path: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6' },
    { id: 'move', name: 'Move',
      path: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3' }
  ];

  var bdCat = 'all';

  U.enterBase = function () {
    U.closeWeaponRail();
    document.body.classList.add('basemode');
    el.baseui.classList.remove('gone');
    U.renderBaseTools();
    U.renderBasePanel();
    U.syncNav();
  };

  U.leaveBase = function () {
    document.body.classList.remove('basemode');
    U.hideStructPop();
    el.baseui.classList.add('gone');
    U.renderWeaponRail();
    U.syncNav();
  };

  /* 1-7 pick out of whatever the catalogue is currently showing. */
  U.pickCatalog = function (i) {
    if (!Z.base.isBase()) return;
    var cards = el.bdList.children;
    if (i >= 0 && i < cards.length) cards[i].click();
  };

  /* The dock's own thumbnails.

     They were drawn into a 52px shelf from the sprite's ground anchor,
     which is the same mistake the blueprint cards had: the piece sat on
     the floor of the tile with most of the box empty above it, so at a
     glance every card was a dark rectangle with a speck in it. Same fix,
     bigger box. */
  U.dockThumb = function (defId, lvl) {
    return bldThumb(defId, lvl || 1, 0, 92, 68, 1, 7);
  };

  U.renderBaseTools = function () {
    Z.clear(el.toolrail);
    TOOLS.forEach(function (t) {
      var b = Z.el('button', 'tool-btn' + (Z.base.tool === t.id ? ' on' : ''));
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + t.path +
                    '"/></svg><span></span>';
      b.querySelector('span').textContent = t.name;
      b.title = t.name;
      b.addEventListener('click', function () { Z.base.setTool(t.id); });
      el.toolrail.appendChild(b);
    });
  };

  /* A small rendered preview of a structure, used on the catalogue cards. */
  function bThumb(id, lvl, w, h) {
    var cv = Z.art.building(id, lvl || 1);
    var img = Z.canvas(w, h);
    var c = img.getContext('2d');
    var sc = Math.min((w - 8) / cv.width, (h - 6) / cv.height) * 1.3;
    c.save();
    c.translate(w / 2, h - 3);
    c.scale(sc, sc);
    c.drawImage(cv, -cv._ox, -cv._oy);
    c.restore();
    return img;
  }

  U.renderBasePanel = function () {
    if (!Z.base.isBase()) return;
    var S = Z.sim;

    /* --- tabs --- */
    Z.clear(el.bdTabs);
    var cats = [{ id: 'all', name: 'All' }].concat(Z.BCATS);
    cats.forEach(function (c) {
      var t = Z.el('button', 'bdtab' + (bdCat === c.id ? ' on' : ''));
      t.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
                    (Z.BCAT_GLYPH[c.id] || Z.BCAT_GLYPH.all) + '"/></svg><span></span>';
      t.querySelector('span').textContent = c.name;
      t.title = c.name;
      t.addEventListener('click', function () { bdCat = c.id; U.renderBasePanel(); });
      el.bdTabs.appendChild(t);
    });

    /* --- compound readout --- */
    var sum = Z.base.summary();
    el.bdSum.innerHTML =
      '<span>Structures <b>' + sum.total + '</b></span>' +
      '<span>Power <b>' + Math.round(sum.power.supply) + '/' + Math.round(sum.power.draw) + '</b></span>' +
      (sum.damaged ? '<span><s>' + sum.damaged + ' damaged</s></span>' : '');

    /* --- catalogue --- */
    Z.clear(el.bdList);
    var list = Z.BUILDINGS.filter(function (b) {
      return bdCat === 'all' ? true : b.cat === bdCat;
    });
    /* one readback for the whole catalogue, rather than one per card */
    primeInk(list.map(function (d2) {
      return { id: d2.id, lvl: 1, rot: 0, key: inkKey(d2.id, 1, 0) };
    }));
    list.forEach(function (def) {
      var why = Z.build.locked(def.id);
      var cost = Z.build.costOf(def);
      var afford = !why && Z.sim.canAfford(cost);
      var ghost = Z.build.ghost;
      var card = Z.el('button', 'bcard' + (why ? ' lock' : (afford ? '' : ' no')) +
                      (ghost && !Z.base.moving && ghost.def.id === def.id ? ' on' : ''));
      card.dataset.id = def.id;
      /* The render is the card. It used to be a 70x42 letterbox above
         two lines of type, which is a third of the tile spent on a
         picture of the thing you are choosing between forty of. */
      var art = Z.el('div', 'ba');
      art.appendChild(bldThumb(def.id, 1, 0, 86, 86, 1, 5, 0.33, 0.66));
      card.appendChild(art);
      var meta = Z.el('div', 'bmeta');
      meta.appendChild(Z.el('div', 'bn', def.name));
      if (why) {
        meta.appendChild(Z.el('div', 'bl', why === 'Blueprint' ? 'Locked' : why));
      } else {
        var cc = Z.el('div', 'bc');
        cc.innerHTML = costHtml(cost);
        meta.appendChild(cc);
      }
      card.appendChild(meta);
      card.title = def.name + ' - ' + def.blurb;
      card.addEventListener('pointerenter', function () { showFoot(def, why, cost); });
      card.addEventListener('focus', function () { showFoot(def, why, cost); });
      card.addEventListener('pointerleave', renderBaseDetail);
      card.addEventListener('blur', renderBaseDetail);
      card.addEventListener('click', function () {
        if (why) {
          if (why === 'Blueprint') { U.openBuildMenu(); return; }
          U.hint(def.name + ' needs ' + why);
          Z.sfx.play('deny');
          return;
        }
        Z.base.setTool('build');
        Z.build.select(def.id);
        Z.base.sel = null;
        Z.sim.sel = null;
        U.renderBasePanel();
      });
      el.bdList.appendChild(card);
    });

    /* --- the selected structure, and the line under the strip --- */
    if (Z.base.sel && !Z.base.sel.dead && !Z.base.moving) U.showStructPop(Z.base.sel);
    else U.hideStructPop();
    renderBaseDetail();
  };

  /* The cheap per-tick pass.

     renderBasePanel throws away every card and builds new ones. Running
     that five times a second - which the tick used to - meant a press that
     landed on a card was very often followed by the card being destroyed
     before the release, and the click never happened. That is the "you
     cannot select the item" bug: nothing was disabled, the button simply
     was not there any more by the time you let go.

     So the tick only writes to the nodes that already exist. */
  U.syncBasePanel = function () {
    if (!Z.base.isBase() || !el.bdList) return;
    var sum = Z.base.summary();
    el.bdSum.innerHTML =
      '<span>Structures <b>' + sum.total + '</b></span>' +
      '<span>Power <b>' + Math.round(sum.power.supply) + '/' +
      Math.round(sum.power.draw) + '</b></span>' +
      (sum.damaged ? '<span><s>' + sum.damaged + ' damaged</s></span>' : '');

    var ghost = Z.build.ghost;
    var kids = el.bdList.children;
    for (var i = 0; i < kids.length; i++) {
      var card = kids[i], id = card.dataset.id;
      var def = Z.BUILDING[id];
      if (!def) continue;
      var why = Z.build.locked(id);
      if (!why) {
        var cost = Z.build.costOf(def);
        card.classList.toggle('no', !Z.sim.canAfford(cost));
        var cc = card.querySelector('.bc');
        if (cc) {
          var html = costHtml(cost);
          if (cc._h !== html) { cc._h = html; cc.innerHTML = html; }
        }
      }
      card.classList.toggle('on',
        !!ghost && !Z.base.moving && ghost.def.id === id);
    }
  };

  /* The line under the card strip.

     One row: what the thing is called, what it is for, what it costs.
     That is the whole of what the 250px detail column ever said that you
     could not already see on the card you were pointing at. */
  function footLine(name, what, cost, tone) {
    var d = el.bdDetail;
    Z.clear(d);
    d.appendChild(Z.el('b', null, name || ''));
    var i = Z.el('i', tone || null, what || '');
    d.appendChild(i);
    if (cost) {
      var c = Z.el('span', 'fcost');
      c.innerHTML = costHtml(cost);
      d.appendChild(c);
    }
  }

  function showFoot(def, why, cost) {
    if (why) {
      footLine(def.name, why === 'Blueprint' ? 'Locked - find the blueprint'
                                             : 'Needs ' + why, null, 'stop');
      return;
    }
    footLine(def.name, def.blurb, cost);
  }

  function renderBaseDetail() {
    var ghost = Z.build.ghost;
    if (ghost && !Z.base.moving) {
      footLine(ghost.def.name,
               ghost.ok ? 'Click the ground to place it.'
                        : (ghost.reason || 'Pick a spot.'),
               Z.build.costOf(ghost.def),
               ghost.ok ? 'go' : 'stop');
      return;
    }
    footLine('Blueprints',
      Z.base.tool === 'build' ? 'Pick a structure, then click the ground.'
      : Z.base.tool === 'upgrade' ? 'Click a structure to upgrade it.'
      : Z.base.tool === 'demolish' ? 'Click a structure to tear it down.'
      : 'Click a structure to pick it up, then click where it goes.');
  }

  /* What a structure actually does, at the level it is (or would be). */
  function defRows(parent, def, lvl, live, cls) {
    var sc = Z.bScale(lvl);
    var rows = [];
    if (def.gun) {
      rows.push(['Damage', Z.fmt(def.gun.dmg * sc * Z.curStats().turretMult) + ' x ' + def.gun.rps + '/s']);
      rows.push(['Range', (def.gun.range * (0.6 + sc * 0.4)).toFixed(1) + ' m']);
    }
    if (def.makes) {
      for (var k in def.makes) rows.push([Z.RES[k].name, '+' + (def.makes[k] * sc).toFixed(2) + '/s']);
    }
    if (def.gen) rows.push(['Power', '+' + Math.round(def.gen * sc) + (def.solar ? ' (day)' : '')]);
    if (def.store) rows.push(['Battery', Math.round(def.store * sc)]);
    if (def.cap) rows.push(['Storage', '+' + Z.fmt(def.cap * sc)]);
    if (def.light) rows.push(['Light', def.light.toFixed(1) + ' m']);
    if (def.heal) rows.push(['Healing', '+' + (def.heal * sc).toFixed(1) + '/s']);
    if (def.draw) rows.push(['Draw', def.draw + (live && !live.powered ? '  offline' : '')]);
    rows.forEach(function (r) {
      var e = Z.el('div', cls || 'drow');
      e.innerHTML = '<span></span><b></b>';
      e.querySelector('span').textContent = r[0];
      e.querySelector('b').textContent = r[1];
      parent.appendChild(e);
    });
  }


  /* ------------------------------------------------------------------ *
   * Command rail - the menus, down the right edge
   * ------------------------------------------------------------------ */
  /* Five, not the whole menu tree. Build is first because it is a mode
     rather than a screen, and everything with no claim on the world screen
     sits behind the last one.

     The glyphs are solid low-poly shapes rather than outlines - a house
     with a lit roof and a shaded gable, a pack with its straps - because
     that is what the reference set looks like. Every facet is drawn in
     currentColor at a different opacity instead of a fixed colour, so one
     icon still turns amber when its button is on and dims when it is not.
     A flat photograph of a rucksack would be mud at 23 pixels; this is the
     same idea at a size a button can actually show. */
  /* ------------------------------------------------------------------ *
   * The bar along the bottom
   *
   * Eight destinations, in the order you need them: the compound, then
   * what you put in it, then what you carry, then who you are, then the
   * settings nobody opens twice. A column down the right edge held five
   * comfortably and eight badly, and the bottom of a screen is where a
   * thumb already rests.
   * ------------------------------------------------------------------ */
  var NAV = [
    { k: 'base',    name: 'Base',    ic: 'base' },
    { k: 'build',   name: 'Build',   ic: 'build' },
    { k: 'weapons', name: 'Weapons', ic: 'weapons' },
    { k: 'skills',  name: 'Skills',  ic: 'upgrade' },
    { k: 'map',     name: 'Map',     ic: 'map' },
    { k: 'stats',   name: 'Survivor', ic: 'crew' },
    { k: 'storage', name: 'Inventory', ic: 'bag' },
    { k: 'menu',    name: 'Settings', ic: 'gear' }
  ];

  var NAV_ACTION = {
    base: function () { Z.base.toggle(); },
    build: function () { U.openBuildMenu(); },
    weapons: function () { U.openWeapons(); },
    skills: function () { U.openSkills(); },
    map: function () { U.openMap(); },
    stats: function () { U.openStats(); },
    storage: function () { U.openStorage(); },
    menu: function () { U.openMenu(); }
  };

  U.renderNav = function () {
    if (!el.navbar) return;
    Z.clear(el.navbar);
    NAV.forEach(function (nv) {
      var b = Z.el('button', 'nbtn');
      /* the icon sits in its own box so the active pill has something to
         sit behind, and so the badge can hang off the icon rather than be
         positioned against the middle of the whole button */
      b.innerHTML = '<span class="nico">' + ico(nv.ic) + '<i class="nbadge"></i></span>' +
                    '<u></u>';
      b.querySelector('u').textContent = nv.name;
      b.title = nv.name;
      b.dataset.k = nv.k;
      b.addEventListener('click', function () {
        /* tapping the tab you are already on closes it again */
        if (nv.k !== 'base' && U.sheet && U.sheetKey === nv.k) { U.closeSheet(); return; }
        NAV_ACTION[nv.k]();
        U.sheetKey = nv.k;      /* openSheet clears it, so claim it after */
        U.syncNav();
      });
      el.navbar.appendChild(b);
    });
    U.syncNav();
  };

  U.syncNav = function () {
    if (!el.navbar) return;
    var kids = el.navbar.children;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i].dataset.k;
      var on = k === 'base' ? Z.base.isBase() : (!!U.sheet && U.sheetKey === k);
      kids[i].classList.toggle('on', on);
    }
    U.syncBadges();
  };

  /* A red pip on a tab means there is something behind it worth a look:
     a skill you can afford, a blueprint you have unlocked but not built,
     a weapon you could be carrying instead. */
  U.syncBadges = function () {
    if (!el.navbar) return;
    var kids = el.navbar.children;
    var coin = Z.sim.res('coin');
    var canSkill = 0;
    Z.UPGRADES.forEach(function (u) {
      var lvl = Z.S.upg[u.id] || 0;
      if (u.max && lvl >= u.max) return;
      var nd = Z.UPG_NODE[u.id];
      if (nd && nd.pre && !lvl && (Z.S.upg[nd.pre] || 0) < nd.req) return;
      if (coin >= Z.upgCost(u, lvl)) canSkill++;
    });
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i].dataset.k, cnt = 0;
      if (k === 'skills') cnt = canSkill;
      kids[i].classList.toggle('alert', cnt > 0);
      if (cnt > 0) setTxt(kids[i].querySelector('.nbadge'), cnt > 9 ? '9+' : cnt);
    }
  };

  /* ------------------------------------------------------------------ *
   * The rack
   *
   * One card for a weapon, built here and used in two places: standing
   * down the left of the world so a weapon can be changed mid-fight, and
   * again as the arsenal column of the weapon bay. Same card, same art,
   * same states - so what you learn to read in one place reads the same
   * in the other.
   * ------------------------------------------------------------------ */
  var LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
             '<path d="M7.4 10.2V7.4a4.6 4.6 0 0 1 9.2 0v2.8H18v10.4H6V10.2zm2.2 0h4.8V7.4' +
             'a2.4 2.4 0 0 0-4.8 0z"/></svg>';

  /* `key` puts the keyboard shortcut in the corner; `full` uses the
     weapon's real name instead of its three-letter tag. */
  /* `full` uses the weapon's real name instead of its three-letter tag.

     `simple` is the world rack, and it is the gun and nothing else: no
     name, no level, no padlock, no shortcut number. The seven silhouettes
     are not alike - a walnut pump gun is not a scoped bolt gun is not a
     pistol - so the picture already says which is which, and the survivor
     plate in the corner has been naming the one in your hands the whole
     time. The only text left is the round count, tucked into the corner
     of the card you are actually holding. */
  /* Draw the selected weapon into the bay's canvas at whatever size the
     layout gave it, backed for retina. */
  function paintBayGun() {
    if (!gunCv) return;
    var r = gunCv.getBoundingClientRect();
    var w = Math.max(80, Math.round(r.width || 420));
    var h = Math.max(50, Math.round(r.height || 190));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    gunCv.width = Math.round(w * dpr);
    gunCv.height = Math.round(h * dpr);
    var c = gunCv.getContext('2d');
    c.clearRect(0, 0, gunCv.width, gunCv.height);
    var shape = (Z.WEAPON[wSel] || Z.WEAPON.pistol).shape;
    /* `gunIcon.get` hands back a canvas whose backing store is twice the
       size it was asked for, so it stays sharp on a retina panel. Blitting
       it at its natural size therefore draws it at double scale - the
       requested size is the one to draw at. */
    var tw = Math.round(w * dpr * 0.92), th = Math.round(h * dpr * 0.82);
    var art = Z.gunIcon.get(shape, tw, th);
    c.drawImage(art, 0, 0, art.width, art.height,
                Math.round((gunCv.width - tw) / 2),
                Math.round((gunCv.height - th) / 2), tw, th);
  }

  U.gunCard = function (id, opt) {
    opt = opt || {};
    var w = Z.WEAPON[id];
    var have = !!Z.S.owned.weapons[id];
    var sel = opt.sel != null ? opt.sel === id : Z.S.weapon === id;
    var b = Z.el('button', 'gcard' + (sel ? ' on' : '') + (have ? '' : ' lock'));

    var art = Z.el('span', 'gcw');
    art.appendChild(Z.gunIcon.get(w.shape, opt.w || 146, opt.h || 56));
    b.appendChild(art);

    if (opt.simple) {
      b.appendChild(Z.el('s', 'gcammo', Z.S.weapon === id ? 'Equipped' : ''));
    } else {
      var meta = Z.el('span', 'gcm');
      meta.innerHTML = '<b></b><s></s>';
      meta.querySelector('b').textContent = opt.full ? w.name : w.short;
      meta.querySelector('s').textContent = have
        ? (Z.S.weapon === id ? 'Equipped' : 'Lv ' + Z.wlvlOf(id))
        : (Z.S.level < w.unlock ? 'Lv ' + w.unlock : Z.fmt(w.cost));
      b.appendChild(meta);
    }

    if (opt.key) b.appendChild(Z.el('i', 'gck', String(opt.key)));
    if (!have && !opt.simple) {
      var lk = Z.el('i', 'gclk');
      lk.innerHTML = LOCK;
      b.appendChild(lk);
    }
    b.title = have ? w.name : w.name + '  \u2013  locked';
    return b;
  };

  /* What stands in the rack: what you own, and nothing else. A rack is
     what you can reach for. Anything you cannot is a shopping list, and
     the shopping list lives in the weapon bay. */
  /* The selector shows a window, not an inventory.

     Own thirteen weapons and a row-per-weapon list is taller than the
     screen: it ran up the left edge and straight through the survivor
     card, the weapon card and the objectives. A HUD element that grows
     without limit is not a HUD element.

     So at most RACK_MAX rows, centred on what you are carrying - the
     ones either side of it are the ones a shoulder-button cycle reaches
     next, which makes the window the useful six rather than an arbitrary
     first six. Everything you own is still in the weapon bay. */
  var RACK_MAX = 6;

  function rackList() {
    var own = Z.WEAPONS.filter(function (w) { return !!Z.S.owned.weapons[w.id]; });
    if (own.length <= RACK_MAX) return own;
    var at = 0;
    for (var i = 0; i < own.length; i++) if (own[i].id === Z.S.weapon) at = i;
    var from = Z.clamp(at - (RACK_MAX >> 1), 0, own.length - RACK_MAX);
    return own.slice(from, from + RACK_MAX);
  }

  function weaponList() {
    return Z.WEAPONS.filter(function (w) { return !!Z.S.owned.weapons[w.id]; });
  }

  /* Picking one you already own equips it; picking the locked one, or the
     one already in your hands, opens the bay on it. */
  /* Tapping a weapon puts that weapon in your hands. Nothing else.

     It used to open the weapon bay when you tapped the one you were
     already holding, which is a whole screen arriving in front of you in
     answer to a tap that meant nothing - the bay has its own button, its
     own key and the survivor plate. One you do not own is the exception,
     because there is no switching to it: that opens the bay on it, which
     is where it is bought. */
  U.pickWeapon = function (id) {
    if (!Z.WEAPON[id]) return;
    if (!Z.S.owned.weapons[id]) { U.openWeapons(id); return; }
    if (Z.S.weapon === id) return;
    Z.S.weapon = id;
    /* Invalidate BEFORE reading the magazine, not after.

       `curStats` is cached, so reading it here returned the stats of the
       gun just put away - the new weapon was handed the OLD one's
       magazine. Swap an SMG for the M9 and the card read "32 / 12":
       thirty-two rounds in a twelve-round pistol. Clamped as well as
       refilled, so nothing downstream can inherit a count its magazine
       cannot hold. */
    Z.invalidate();
    if (Z.sim.p) Z.sim.p.ammo = Z.curStats().mag;
    Z.sfx.play('tick');
    U.renderWeaponRail();
  };

  /* The nth weapon in the rack, for the number keys. */
  U.pickRack = function (i) {
    var list = rackList();
    if (i >= 0 && i < list.length) U.pickWeapon(list[i].id);
  };

  U.cycleWeapon = function (d) {
    var list = weaponList();
    if (list.length < 2) { U.openWeapons(); return; }
    var i = 0;
    for (var k = 0; k < list.length; k++) if (list[k].id === Z.S.weapon) i = k;
    i = (i + d + list.length) % list.length;
    U.pickWeapon(list[i].id);
  };

  /* kept under the old name so input.js and the sheets do not have to care */
  U.closeWeaponRail = function () {};

  /* ------------------------------------------------------------------ *
   * The weapon selector
   *
   * A list, not an inventory. Each row is the two numbers you actually
   * read mid-fight - what is in the gun, and what the gun holds - and the
   * shape of the weapon they belong to. No card, no panel, no border: it
   * sits over the world and the world shows through it, which is the
   * only way a permanent HUD element earns the bottom-left corner.
   *
   * The rows are built once and then only their numbers change. Rebuilding
   * the list every frame would re-rasterise a gun sprite per weapon per
   * frame, and the sprite is the expensive part.
   * ------------------------------------------------------------------ */
  var wselRows = {}, wselKey = '';

  U.renderWeaponRail = function () {
    if (!el.grackList) return;
    var list = rackList();
    var key = list.map(function (w) { return w.id; }).join(',');
    if (key === wselKey) { U.syncWeaponRail(); return; }
    wselKey = key;
    Z.clear(el.grackList);
    wselRows = {};
    el.grAmmo = null;

    list.forEach(function (w, i) {
      var row = Z.el('button', 'wsel');
      row.dataset.id = w.id;
      row.innerHTML =
        '<span class="wnum"><b></b><s></s></span>' +
        '<span class="wpic"></span>' +
        '<i class="wkey"></i>';
      row.querySelector('.wpic').appendChild(Z.gunIcon.get(w.shape, 104, 34));
      setTxt(row.querySelector('.wkey'), String(i + 1));
      row.title = w.name;
      row.addEventListener('click', function () { U.pickWeapon(w.id); });
      wselRows[w.id] = { row: row, mag: row.querySelector('b'),
                         cap: row.querySelector('s') };
      el.grackList.appendChild(row);
    });
    U.syncWeaponRail();
  };

  /* Numbers and selection only - called every frame, so it must not
     touch the DOM unless something actually changed. */
  U.syncWeaponRail = function () {
    var p = Z.sim.p;
    if (!p) return;
    var cur = Z.S.weapon;
    for (var id in wselRows) {
      var r = wselRows[id], on = id === cur;
      var w = Z.WEAPON[id];
      /* the carried gun's real magazine includes its attachments; the
         others show what they hold as configured, via the same stats
         path rather than the raw base, so the numbers are comparable */
      var capN = on ? Z.curStats().mag
                    : ((Z.stats(id, Z.equipOf(id)) || w.base || {}).mag || 0);
      var magN = on ? Math.max(0, Math.round(p.ammo)) : capN;
      setTxt(r.mag, magN);
      setTxt(r.cap, capN);
      if (r.row.classList.contains('on') !== on) {
        r.row.classList.toggle('on', on);
        if (on) {
          r.row.classList.remove('swap');
          void r.row.offsetWidth;
          r.row.classList.add('swap');
        }
      }
      r.row.classList.toggle('lo', on && capN > 0 && magN / capN <= 0.25);
      r.row.classList.toggle('rel', on && p.reloadT > 0);
    }
  };

  /* ------------------------------------------------------------------ *
   * Objectives - what the compound wants next
   *
   * Derived from live state every second rather than stored, so a save
   * never carries a stale to-do list and the cards cannot disagree with
   * the world they describe.
   * ------------------------------------------------------------------ */
  var Q_ICON = {
    build: 'M3 21h18M5 21V10l7-5 7 5v11',
    power: 'M13 2L4 14h7l-1 8 9-12h-7z',
    kill: 'M12 3l7 4v6c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7z',
    wood: 'M12 3v18M12 8l5-4M12 13l-5-4',
    night: 'M20 14a8 8 0 1 1-9.5-9.8A6.5 6.5 0 0 0 20 14z'
  };

  function quests() {
    var out = [], S = Z.S, sim = Z.sim;
    var count = {};
    sim.buildings.forEach(function (b) { count[b.defId] = (count[b.defId] || 0) + 1; });

    /* the night is the clock everything else runs against */
    if (sim.inWave) {
      out.push({ icon: 'night', title: 'Hold night ' + sim.wave,
                 have: Math.max(0, (sim.waveTotal || 0) - Math.max(0, sim.waveLeft)),
                 need: Math.max(1, sim.waveTotal || 1),
                 go: null });
    } else if (Z.world.l < 0.34) {
      out.push({ icon: 'night', title: 'Night ' + sim.wave + ' is coming',
                 have: 0, need: 0, note: Z.clockStr(Z.world.t), go: null });
    }

    if (!count.core) {
      out.push({ icon: 'build', title: 'Raise a command post', have: 0, need: 1, go: 'build' });
    } else if ((count.wall || 0) + (count.fence || 0) + (count.barricade || 0) < 12) {
      out.push({ icon: 'build', title: 'Ring the compound',
                 have: (count.wall || 0) + (count.fence || 0) + (count.barricade || 0),
                 need: 12, go: 'build' });
    } else if (!count.turret) {
      out.push({ icon: 'build', title: 'Post a turret', have: 0, need: 1, go: 'build' });
    }

    if (sim.power.draw > sim.power.supply + 0.01) {
      out.push({ icon: 'power', title: 'Keep the lights on',
                 have: Math.round(sim.power.supply), need: Math.round(sim.power.draw),
                 go: 'build' });
    }

    if (out.length < 3) {
      var woodNeed = 120;
      if (sim.res('wood') < woodNeed) {
        out.push({ icon: 'wood', title: 'Stock ' + woodNeed + ' timber',
                   have: Math.floor(sim.res('wood')), need: woodNeed, go: null });
      } else if (S.kills < 25) {
        out.push({ icon: 'kill', title: 'Put down 25 walkers',
                   have: S.kills, need: 25, go: null });
      }
    }
    return out.slice(0, 3);
  }

  var qSig = '';
  U.renderQuests = function (force) {
    if (!el.quests) return;
    var list = quests();
    var sig = list.map(function (q) {
      return q.title + '|' + q.have + '|' + q.need + '|' + (q.note || '');
    }).join(';');
    if (sig === qSig && !force) return;
    qSig = sig;

    Z.clear(el.quests);
    list.forEach(function (q) {
      var k = q.need > 0 ? Z.clamp01(q.have / q.need) : 0;
      /* Title, one line of what to do about it, a count and a bar - and
         a chevron, because the card goes somewhere when you press it. */
      var c = Z.el('button', 'quest' + (k >= 1 ? ' done' : ''));
      c.innerHTML =
        '<span class="qmk"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
        (Q_ICON[q.icon] || Q_ICON.build) + '"/></svg></span>' +
        '<span class="qtx"><span class="qn"></span><span class="qd"></span>' +
        (q.need > 0 ? '<span class="qrow"><i class="qnum"></i>' +
                      '<span class="qbar"><i></i></span></span>' : '') +
        '</span>' + ico('chev', 'qgo');
      c.querySelector('.qn').textContent = q.title;
      c.querySelector('.qd').textContent = q.sub || q.note || '';
      if (q.need > 0) {
        c.querySelector('.qnum').textContent = q.have + '/' + q.need;
        c.querySelector('.qbar i').style.transform = 'scaleX(' + k + ')';
      }
      if (q.go === 'build') {
        c.addEventListener('click', function () { if (!Z.base.isBase()) Z.base.enter(); });
      } else {
        c.addEventListener('click', function () { U.openStats(); });
      }
      el.quests.appendChild(c);
    });
  };

  /* ------------------------------------------------------------------ *
   * Minimap - the corner one, always on. The full map is still a sheet.
   * ------------------------------------------------------------------ */
  var mmT = 0;
  U.tickMap = function (dt) {
    if (!el.mmCv || Z.base.isBase()) return;
    mmT -= dt;
    if (mmT > 0) return;
    mmT = 0.25;
    drawMini(el.mmCv);
    var seen = 0, disc = Z.world.disc;
    for (var i = 0; i < disc.length; i++) if (disc[i]) seen++;
    setTxt(el.mmExp, Math.round((seen / disc.length) * 100) + '%');
  };

  /* A window on the world around you, not the whole map squeezed into a
     thumbnail - at 224m across the latter is a grey square. */
  function drawMini(cv) {
    var c = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    var p = Z.sim.p;
    if (!p) return;
    var span = 62;                    /* metres across the little window */
    var sc = W / span;
    c.save();
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#06080A';
    c.fillRect(0, 0, W, H);
    c.translate(W / 2, H / 2);
    c.scale(sc, sc);
    c.translate(-p.x, -p.y);

    var x0 = Math.floor(p.x - span / 2), x1 = Math.ceil(p.x + span / 2);
    var y0 = Math.floor(p.y - span / 2), y1 = Math.ceil(p.y + span / 2);
    var N = Z.world.SIZE, step = 2;
    for (var y = Math.max(0, y0); y < Math.min(N, y1); y += step) {
      for (var x = Math.max(0, x0); x < Math.min(N, x1); x += step) {
        if (!Z.world.seen(x, y)) continue;
        var t = Z.world.terrain[Z.world.idx(x, y)];
        c.fillStyle = Z.rgb(Z.mix(Z.world.PAL[t].d, [20, 24, 26], 0.38));
        c.fillRect(x, y, step, step);
      }
    }
    /* trees as texture so the woods read as woods */
    c.fillStyle = 'rgba(52,74,42,.75)';
    for (var i = 0; i < Z.world.props.length; i++) {
      var pr = Z.world.props[i];
      if (pr.x < x0 || pr.x > x1 || pr.y < y0 || pr.y > y1) continue;
      if (pr.def.art !== 'tree' && pr.def.art !== 'pine') continue;
      c.fillRect(pr.x - 0.6, pr.y - 0.6, 1.2, 1.2);
    }
    Z.sim.buildings.forEach(function (b) {
      if (b.x < x0 - 4 || b.x > x1 + 4 || b.y < y0 - 4 || b.y > y1 + 4) return;
      c.fillStyle = b.def.gun ? '#D2562A' : b.defId === 'core' ? '#E4E0D6' : '#7FA45C';
      c.fillRect(b.x - Z.fpw(b.def, b.rot) / 2, b.y - Z.fph(b.def, b.rot) / 2,
                 Z.fpw(b.def, b.rot), Z.fph(b.def, b.rot));
    });
    c.fillStyle = '#E0603A';
    Z.sim.zombies.forEach(function (z) {
      if (z.dying) return;
      if (z.x < x0 || z.x > x1 || z.y < y0 || z.y > y1) return;
      c.beginPath(); c.arc(z.x, z.y, 0.9, 0, Z.TAU); c.fill();
    });
    c.restore();

    /* you, always dead centre, pointing where you face */
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(p.face);
    c.fillStyle = '#E4E0D6';
    c.beginPath();
    c.moveTo(9, 0); c.lineTo(-6, 6); c.lineTo(-3, 0); c.lineTo(-6, -6);
    c.closePath(); c.fill();
    c.restore();
  }

  U.refreshAll = function () {
    U.renderRes();
    U.renderNav();
    U.renderWeaponRail();
    U.renderQuests(true);
    if (U.sheet) U.closeSheet();
  };

})(window.Z);
