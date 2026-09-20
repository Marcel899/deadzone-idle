/* Deadzone - audio.

   Everything is synthesised. No files to load, nothing to fail on a slow
   connection, and the whole kit is a few hundred bytes of oscillator
   settings. Gunfire is filtered noise with a pitched transient; the rest
   is short envelopes on simple waves. */
(function (Z) {
  'use strict';

  var A = Z.sfx = { on: true, ctx: null, master: null, noise: null };
  var last = {};

  function ready() {
    if (A.ctx) return A.ctx.state !== 'closed';
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return false;
      A.ctx = new C();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.32;
      A.master.connect(A.ctx.destination);
      /* one second of noise, reused by every impact */
      var sr = A.ctx.sampleRate;
      var buf = A.ctx.createBuffer(1, sr, sr);
      var d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      A.noise = buf;
      return true;
    } catch (e) { return false; }
  }

  A.unlock = function () {
    if (!ready()) return;
    if (A.ctx.state === 'suspended') A.ctx.resume();
  };

  function env(node, t, a, d, peak) {
    var g = A.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g);
    g.connect(A.master);
    return g;
  }

  function noiseBurst(t, dur, f0, f1, q, peak, type) {
    var s = A.ctx.createBufferSource();
    s.buffer = A.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    var bp = A.ctx.createBiquadFilter();
    bp.type = type || 'bandpass';
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    bp.Q.value = q || 1;
    s.connect(bp);
    env(bp, t, 0.004, dur, peak);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  function tone(t, f0, f1, dur, peak, type) {
    var o = A.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(o, t, 0.006, dur, peak);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /* Rate-limit the noisiest cues so a full-auto burst does not turn into
     a wall of clipping. */
  var MIN_GAP = { shot: 0.03, smg: 0.02, shotgun: 0.06, kill: 0.05, tick: 0.04,
                  pickup: 0.018, boom: 0.05, thud: 0.05,
                  stomp: 0.09, slam: 0.08 };
  /* how far up the scale the next pickup lands; the caller sets it */
  A.pitch = 0;

  A.play = function (name) {
    if (!A.on || !ready()) return;
    if (A.ctx.state === 'suspended') return;
    var t = A.ctx.currentTime;
    var gap = MIN_GAP[name];
    if (gap && last[name] && t - last[name] < gap) return;
    last[name] = t;

    switch (name) {
      case 'shot':
        noiseBurst(t, 0.13, 1800, 200, 0.9, 0.55);
        tone(t, 180, 60, 0.10, 0.30, 'square');
        break;
      case 'smg':
        noiseBurst(t, 0.07, 2600, 400, 1.1, 0.34);
        tone(t, 240, 90, 0.05, 0.16, 'square');
        break;
      case 'shotgun':
        noiseBurst(t, 0.26, 1100, 90, 0.6, 0.72);
        tone(t, 120, 40, 0.20, 0.36, 'square');
        break;
      case 'reload':
        noiseBurst(t, 0.05, 3200, 1600, 3, 0.20);
        noiseBurst(t + 0.16, 0.06, 2200, 900, 3, 0.24);
        tone(t + 0.16, 420, 240, 0.07, 0.10, 'square');
        break;
      case 'kill':
        noiseBurst(t, 0.16, 700, 120, 0.7, 0.34);
        tone(t, 150, 55, 0.16, 0.16, 'sawtooth');
        break;
      case 'hurt':
        noiseBurst(t, 0.20, 500, 90, 0.5, 0.40);
        tone(t, 110, 48, 0.24, 0.24, 'sawtooth');
        break;
      case 'death':
        tone(t, 180, 40, 1.1, 0.34, 'sawtooth');
        noiseBurst(t, 0.8, 600, 60, 0.4, 0.30);
        break;
      case 'chop':
        noiseBurst(t, 0.14, 900, 160, 1.4, 0.34);
        tone(t, 140, 70, 0.10, 0.14, 'triangle');
        break;
      case 'loot':
        tone(t, 620, 620, 0.07, 0.16, 'triangle');
        tone(t + 0.07, 880, 880, 0.10, 0.18, 'triangle');
        tone(t + 0.15, 1170, 1170, 0.14, 0.14, 'triangle');
        break;
      /* One mark landing in the counter. Pitched by how far through the
         haul it is, so a handful rises and a big haul climbs - which is
         the whole trick to a pickup sounding satisfying rather than
         repetitive. */
      case 'pickup': {
        var st = A.pitch == null ? 0 : A.pitch;
        var f = 620 * Math.pow(1.0595, st * 2);
        tone(t, f, f * 1.5, 0.055, 0.10, 'triangle');
        tone(t + 0.012, f * 2, f * 2.2, 0.04, 0.045, 'sine');
        break;
      }
      /* the one at the end of a large haul - a box going down */
      case 'haul':
        noiseBurst(t, 0.13, 1500, 260, 1.1, 0.24);
        tone(t, 300, 150, 0.16, 0.22, 'triangle');
        tone(t + 0.05, 600, 900, 0.18, 0.13, 'triangle');
        tone(t + 0.12, 900, 1200, 0.2, 0.1, 'sine');
        break;
      /* the pin, the arc, the handle */
      case 'throw':
        noiseBurst(t, 0.05, 3400, 1800, 3, 0.16);
        tone(t + 0.02, 520, 860, 0.09, 0.08, 'triangle');
        break;
      /* it hits the ground somewhere you can no longer do anything about */
      case 'clink':
        tone(t, 1400, 900, 0.05, 0.09, 'square');
        tone(t + 0.05, 1050, 700, 0.05, 0.06, 'square');
        break;
      case 'boom':
        noiseBurst(t, 0.06, 6000, 2200, 0.8, 0.5);
        noiseBurst(t + 0.01, 0.75, 900, 40, 0.35, 0.85);
        tone(t, 130, 34, 0.55, 0.62, 'sawtooth');
        tone(t + 0.02, 68, 26, 0.9, 0.42, 'sine');
        break;
      /* a hard shove of air and a boot pushing off */
      case 'dash':
        noiseBurst(t, 0.20, 2600, 380, 0.7, 0.30);
        tone(t, 340, 900, 0.13, 0.12, 'triangle');
        break;
      /* a round into something with mass behind it */
      case 'thud':
        noiseBurst(t, 0.09, 520, 90, 0.9, 0.30);
        tone(t, 96, 52, 0.12, 0.22, 'sine');
        break;
      /* it puts a foot down */
      case 'stomp':
        noiseBurst(t, 0.12, 380, 60, 0.6, 0.26);
        tone(t, 62, 34, 0.18, 0.30, 'sine');
        break;
      /* it puts a fist down */
      case 'slam':
        noiseBurst(t, 0.26, 900, 70, 0.5, 0.52);
        tone(t, 88, 30, 0.34, 0.42, 'sawtooth');
        tone(t + 0.03, 150, 60, 0.2, 0.2, 'square');
        break;
      case 'build':
        noiseBurst(t, 0.10, 1400, 300, 1.2, 0.26);
        tone(t, 300, 420, 0.12, 0.16, 'triangle');
        break;
      case 'break':
        noiseBurst(t, 0.45, 900, 70, 0.5, 0.52);
        tone(t, 90, 36, 0.4, 0.26, 'sawtooth');
        break;
      case 'deny':
        tone(t, 220, 150, 0.11, 0.18, 'square');
        break;
      case 'tick':
        tone(t, 900, 900, 0.03, 0.09, 'square');
        break;
      case 'unlock':
        tone(t, 520, 520, 0.09, 0.14, 'triangle');
        tone(t + 0.09, 780, 780, 0.16, 0.16, 'triangle');
        break;
      case 'level':
        [523, 659, 784, 1047].forEach(function (f, i) {
          tone(t + i * 0.09, f, f, 0.22, 0.15, 'triangle');
        });
        break;
      case 'wave':
        tone(t, 88, 58, 1.3, 0.34, 'sawtooth');
        tone(t + 0.1, 132, 88, 1.1, 0.22, 'sawtooth');
        break;
      case 'clear':
        [392, 523, 659].forEach(function (f, i) {
          tone(t + i * 0.13, f, f, 0.32, 0.16, 'triangle');
        });
        break;
    }
  };

  A.toggle = function (on) {
    A.on = on;
    if (on) A.unlock();
  };

})(window.Z);
