/* Deadzone - static content: resources, weapons, attachments, zombies,
   buildings, props, upgrades and the balance curves that tie them together. */
(function (Z) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Resources
   * The four in `PRIME` are the only ones the HUD shows all the time.
   * Everything else surfaces inside the menu that actually spends it.
   * ------------------------------------------------------------------ */
  Z.RES = {
    wood:  { id: 'wood',  name: 'Wood',       icon: '\uD83E\uDEB5', color: '#C67F33' },
    scrap: { id: 'scrap', name: 'Scrap',      icon: '\uD83D\uDD29', color: '#9AA6B0' },
    power: { id: 'power', name: 'Power',      icon: '\u26A1',       color: '#6FA8C4' },
    coin:  { id: 'coin',  name: 'Scrip',      icon: '\uD83E\uDE99', color: '#E3A63F' },
    stone: { id: 'stone', name: 'Stone',      icon: '\uD83E\uDEA8', color: '#8C8C8C' },
    metal: { id: 'metal', name: 'Metal',      icon: '\u2699',       color: '#C0C6CC' },
    cloth: { id: 'cloth', name: 'Cloth',      icon: '\uD83E\uDDF5', color: '#C99A9A' },
    food:  { id: 'food',  name: 'Rations',    icon: '\uD83E\uDD6B', color: '#8FBF6A' },
    fuel:  { id: 'fuel',  name: 'Fuel',       icon: '\uD83D\uDEE2', color: '#C4762A' },
    parts: { id: 'parts', name: 'Components', icon: '\uD83D\uDD0B', color: '#A88BD0' },
    meds:  { id: 'meds',  name: 'Medical',    icon: '+', color: '#7FC8B4' }
  };
  Z.PRIME = ['wood', 'scrap', 'power', 'coin'];
  Z.RES_ORDER = ['wood', 'scrap', 'stone', 'metal', 'cloth', 'food', 'meds', 'fuel', 'parts', 'coin'];

  Z.RARITY = {
    common:    { name: 'Common',    color: '#8D9AA4' },
    rare:      { name: 'Rare',      color: '#59C6E8' },
    epic:      { name: 'Epic',      color: '#B06CF0' },
    legendary: { name: 'Legendary', color: '#FF6B2C' }
  };

  /* ------------------------------------------------------------------ *
   * Weapons - carried over from the bench build, unchanged in balance.
   * `shape` keys the 3D mesh in guns.js; `range` is now metres on the map
   * rather than a fraction of a fixed lane.
   * ------------------------------------------------------------------ */
  Z.SLOTS = [
    { id: 'optic',  name: 'Optic',       tag: 'OP' },
    { id: 'muzzle', name: 'Muzzle',      tag: 'MZ' },
    { id: 'barrel', name: 'Barrel',      tag: 'BR' },
    { id: 'mag',    name: 'Magazine',    tag: 'MG' },
    { id: 'under',  name: 'Underbarrel', tag: 'UB' },
    { id: 'stock',  name: 'Stock',       tag: 'ST' },
    { id: 'ammo',   name: 'Ammo',        tag: 'AM' }
  ];
  Z.SLOT = {};
  Z.SLOTS.forEach(function (s) { Z.SLOT[s.id] = s; });

  Z.WEAPONS = [
    { id: 'pistol', name: 'M9 Sidearm', short: 'M9', cat: 'pistols', rarity: 'common',
      stars: 1, cost: 0, unlock: 1, shape: 'pistol', hold: 'one',
      blurb: 'Standard-issue. Weak, but it never jams.',
      slots: ['optic', 'muzzle', 'barrel', 'mag', 'ammo'],
      base: { dmg: 9, rpm: 165, mag: 12, reload: 1.3, range: 7.5, spread: 0.10, pierce: 0, crit: 0.05, critMult: 2.0, pellets: 1 } },
    { id: 'smg', name: 'Vector SMG', short: 'SMG', cat: 'smgs', rarity: 'rare',
      stars: 2, cost: 420, unlock: 4, shape: 'smg', hold: 'two',
      blurb: 'Spits lead. Reload discipline is your problem now.',
      slots: ['optic', 'muzzle', 'barrel', 'mag', 'under', 'stock', 'ammo'],
      base: { dmg: 7, rpm: 620, mag: 32, reload: 1.8, range: 6.6, spread: 0.17, pierce: 0, crit: 0.04, critMult: 1.9, pellets: 1 } },
    { id: 'shotgun', name: 'Breacher 12g', short: '12G', cat: 'shotguns', rarity: 'rare',
      stars: 2, cost: 1900, unlock: 8, shape: 'shotgun', hold: 'two',
      blurb: 'Eight pellets. Everything in the cone learns respect.',
      slots: ['optic', 'muzzle', 'barrel', 'mag', 'under', 'stock', 'ammo'],
      base: { dmg: 11, rpm: 78, mag: 7, reload: 2.6, range: 4.8, spread: 0.34, pierce: 1, crit: 0.05, critMult: 2.0, pellets: 8 } },
    { id: 'rifle', name: 'MK4 Carbine', short: 'MK4', cat: 'ar', rarity: 'epic',
      stars: 3, cost: 7400, unlock: 13, shape: 'rifle', hold: 'two',
      blurb: 'The all-rounder. Takes every attachment you own.',
      slots: ['optic', 'muzzle', 'barrel', 'mag', 'under', 'stock', 'ammo'],
      base: { dmg: 19, rpm: 420, mag: 30, reload: 2.0, range: 8.8, spread: 0.12, pierce: 1, crit: 0.07, critMult: 2.1, pellets: 1 } },
    { id: 'lmg', name: 'Grinder LMG', short: 'LMG', cat: 'heavy', rarity: 'epic',
      stars: 4, cost: 26000, unlock: 19, shape: 'lmg', hold: 'two',
      blurb: 'A belt of 120 and no reason to stop.',
      slots: ['optic', 'muzzle', 'barrel', 'mag', 'under', 'stock', 'ammo'],
      base: { dmg: 26, rpm: 640, mag: 120, reload: 4.6, range: 7.4, spread: 0.20, pierce: 2, crit: 0.05, critMult: 2.0, pellets: 1 } },
    { id: 'sniper', name: 'Longbow .338', short: '.338', cat: 'snipers', rarity: 'legendary',
      stars: 4, cost: 88000, unlock: 26, shape: 'sniper', hold: 'two',
      blurb: 'Reaches the horizon. Punches through the whole queue.',
      slots: ['optic', 'muzzle', 'barrel', 'mag', 'under', 'stock', 'ammo'],
      base: { dmg: 210, rpm: 52, mag: 6, reload: 3.0, range: 13.0, spread: 0.03, pierce: 4, crit: 0.20, critMult: 3.0, pellets: 1 } },
    { id: 'revolver', name: 'Ranger .44', short: '.44', cat: 'pistols', rarity: 'rare',
      stars: 2, cost: 380, unlock: 3, shape: 'revolver', hold: 'one',
      blurb: 'Six that matter. Then a long six seconds.',
      slots: ['optic', 'barrel', 'ammo'],
      base: { dmg: 34, rpm: 95, mag: 6, reload: 2.4, range: 8.4, spread: 0.06, pierce: 1, crit: 0.22, critMult: 2.6, pellets: 1 } },
    { id: 'pdw', name: 'Wasp PDW', short: 'PDW', cat: 'smgs', rarity: 'common',
      stars: 1, cost: 210, unlock: 2, shape: 'pdw', hold: 'two',
      blurb: 'Empties itself before you finish deciding.',
      slots: ['optic', 'muzzle', 'mag', 'ammo'],
      base: { dmg: 6, rpm: 1080, mag: 32, reload: 1.5, range: 5.6, spread: 0.19, pierce: 0, crit: 0.04, critMult: 1.9, pellets: 1 } },
    { id: 'autoshot', name: 'Saiga Auto-12', short: 'A12', cat: 'shotguns', rarity: 'epic',
      stars: 3, cost: 1450, unlock: 8, shape: 'autoshot', hold: 'two',
      blurb: 'A box magazine of buckshot, as fast as you can pull.',
      slots: ['optic', 'muzzle', 'barrel', 'mag', 'stock', 'ammo'],
      base: { dmg: 8, rpm: 210, mag: 10, reload: 2.6, range: 4.6, spread: 0.30, pierce: 0, crit: 0.05, critMult: 2.0, pellets: 7 } },
    { id: 'dmr', name: 'Sable DMR', short: 'DMR', cat: 'ar', rarity: 'epic',
      stars: 3, cost: 1680, unlock: 9, shape: 'dmr', hold: 'two',
      blurb: 'Reaches past the fence and takes the one giving orders.',
      slots: ['optic', 'muzzle', 'barrel', 'mag', 'stock', 'ammo'],
      base: { dmg: 30, rpm: 190, mag: 20, reload: 2.2, range: 12.5, spread: 0.035, pierce: 2, crit: 0.16, critMult: 2.3, pellets: 1 } },
    { id: 'crossbow', name: 'Widow Crossbow', short: 'XBOW', cat: 'special', rarity: 'rare',
      stars: 2, cost: 560, unlock: 5, shape: 'crossbow', hold: 'two',
      blurb: 'Silent, and it goes through two of them.',
      slots: ['optic', 'ammo'],
      base: { dmg: 62, rpm: 42, mag: 1, reload: 1.9, range: 11.0, spread: 0.02, pierce: 3, crit: 0.20, critMult: 2.8, pellets: 1 } },
    { id: 'minigun', name: 'Vulcan Rotary', short: 'VLC', cat: 'heavy', rarity: 'legendary',
      stars: 4, cost: 5200, unlock: 15, shape: 'minigun', hold: 'two',
      blurb: 'Two hundred rounds of answering the question.',
      slots: ['muzzle', 'barrel', 'ammo'],
      base: { dmg: 7, rpm: 1500, mag: 200, reload: 5.2, range: 7.0, spread: 0.24, pierce: 1, crit: 0.03, critMult: 1.8, pellets: 1 } },
    { id: 'rail', name: 'Arc Railgun', short: 'ARC', cat: 'special', rarity: 'legendary',
      stars: 5, cost: 420000, unlock: 34, shape: 'rail', hold: 'two',
      blurb: 'Prototype. Deletes a lane and everything standing in it.',
      slots: ['optic', 'muzzle', 'barrel', 'mag', 'under', 'stock', 'ammo'],
      base: { dmg: 620, rpm: 90, mag: 10, reload: 2.6, range: 13.0, spread: 0.05, pierce: 9, crit: 0.15, critMult: 2.6, pellets: 1 } }
  ];
  Z.WEAPON = {};
  Z.WEAPONS.forEach(function (w) { Z.WEAPON[w.id] = w; });

  Z.WCATS = [
    { id: 'ar',       name: 'Assault Rifles' },
    { id: 'smgs',     name: 'SMGs' },
    { id: 'shotguns', name: 'Shotguns' },
    { id: 'snipers',  name: 'Sniper Rifles' },
    { id: 'pistols',  name: 'Pistols' },
    { id: 'heavy',    name: 'Heavy' },
    { id: 'special',  name: 'Special' }
  ];

  Z.WMAXLVL = 20;
  Z.wlvlOf = function (id) { return (Z.S.wlvl && Z.S.wlvl[id]) || 0; };
  Z.wUpCost = function (w, lvl) {
    return Math.ceil((w.cost || 500) * 0.30 * Math.pow(1.34, lvl) + 180 * Math.pow(1.30, lvl));
  };
  Z.wlvlBonus = function (lvl) {
    return { dmg: 1 + lvl * 0.14, rpm: 1 + lvl * 0.03,
             crit: lvl * 0.005, mag: Math.floor(lvl * 0.6) };
  };

  /* ------------------------------------------------------------------ *
   * Attachments - multiplicative unless the key ends in Flat.
   * ------------------------------------------------------------------ */
  var A = function (id, slot, name, rarity, cost, unlock, mods, special, blurb) {
    return { id: id, slot: slot, name: name, rarity: rarity, cost: cost, unlock: unlock,
             mods: mods, special: special || null, blurb: blurb };
  };

  Z.ATTACHMENTS = [
    A('irons',   'optic', 'Iron Sights',    'common',        0,  1, {}, null, 'No glass. No cost. No help.'),
    A('reddot',  'optic', 'Red Dot',        'common',      220,  2, { critFlat: 0.04, spread: -0.15 }, null, 'Faster target pickup up close.'),
    A('acog',    'optic', 'ACOG 4x',        'rare',       1600,  7, { critFlat: 0.07, range: 0.18, rpm: -0.08 }, null, 'You see them coming sooner.'),
    A('thermal', 'optic', 'Thermal Scope',  'epic',      14000, 16, { critFlat: 0.10, dmg: 0.12, range: 0.22, rpm: -0.10 }, null, 'Heat blooms through the fog.'),
    A('bioscan', 'optic', 'Bio-Scanner',    'legendary', 180000, 30, { critFlat: 0.16, critMultFlat: 0.9, range: 0.25 }, null, 'Tags the soft tissue.'),

    A('comp',    'muzzle', 'Compensator',   'common',      260,  3, { spread: -0.30, rpm: 0.03 }, null, 'Muzzle climb, solved.'),
    A('supp',    'muzzle', 'Suppressor',    'rare',       1900,  9, { critFlat: 0.09, spread: -0.20, dmg: -0.08 }, 'quiet', 'Quiet work. Bleeds velocity.'),
    A('brake',   'muzzle', 'Muzzle Brake',  'rare',       2400, 11, { rpm: 0.16, spread: 0.22 }, null, 'Cycles faster, walks wider.'),
    A('cone',    'muzzle', 'Blast Cone',    'epic',      22000, 18, { dmg: 0.22, spread: 0.18, range: -0.10 }, null, 'All the blast, first thing it meets.'),

    A('shortb',  'barrel', 'Short Barrel',  'common',      300,  3, { rpm: 0.14, range: -0.16, spread: 0.10 }, null, 'Handles quick. Loses reach.'),
    A('heavyb',  'barrel', 'Heavy Barrel',  'rare',       2100,  8, { dmg: 0.20, rpm: -0.10 }, null, 'Harder hits, slower cycle.'),
    A('longb',   'barrel', 'Long Barrel',   'rare',       3400, 12, { dmg: 0.12, range: 0.30, rpm: -0.06 }, null, 'Every inch is another metre.'),
    A('chrome',  'barrel', 'Chromed Bore',  'epic',      31000, 20, { dmg: 0.18, rpm: 0.10 }, null, 'A tolerance nobody can maintain.'),
    A('coil',    'barrel', 'Coil Sleeve',   'legendary', 260000, 32, { dmg: 0.40, rpm: 0.14, range: 0.20 }, null, 'Accelerates the round after the case.'),

    A('extmag',  'mag', 'Extended Mag',     'common',      280,  2, { mag: 0.40, reload: 0.15 }, null, 'More rounds between silences.'),
    A('quick',   'mag', 'Quick Mag',        'common',      340,  4, { reload: -0.28, mag: -0.15 }, null, 'Drops clean, holds less.'),
    A('drum',    'mag', 'Drum Magazine',    'rare',       3100, 10, { mag: 1.10, reload: 0.45 }, null, 'Twice the belt, twice the fumbling.'),
    A('speedl',  'mag', 'Speed Loader',     'rare',       2600, 11, { reload: -0.42 }, null, 'The whole stack goes in at once.'),
    A('autoload','mag', 'Auto-Loader',      'epic',      46000, 22, { reload: -0.55, mag: 0.30 }, null, 'Servo-fed. You barely notice.'),

    A('grip',    'under', 'Vertical Grip',  'common',      310,  5, { spread: -0.28, rpm: 0.05 }, null, 'Steadier hold, tighter groups.'),
    A('bipod',   'under', 'Bipod',          'rare',       2800, 12, { dmg: 0.16, spread: -0.35, rpm: -0.08 }, null, 'Slow to swing, brutal to land.'),
    A('laser',   'under', 'Laser Module',   'rare',       4200, 14, { spread: -0.85, critFlat: 0.03 }, 'laser', 'Paints your reach on the ground. Nothing past the mark.'),
    A('torch',   'under', 'Weapon Light',   'common',      420,  4, { critFlat: 0.02 }, 'light', 'Throws a real beam. They can see it too.'),
    A('turretub','under', 'Clip-On Sentry', 'epic',      58000, 24, { rpm: -0.05 }, 'sentry', 'A second gun on its own schedule.'),
    A('gl',      'under', 'Grenade Launcher','epic',      72000, 25, { dmg: 0.10, rpm: -0.14 }, 'explosive', 'A small, unhappy surprise.'),

    A('tacs',    'stock', 'Tactical Stock', 'common',      330,  6, { reload: -0.16, spread: -0.14 }, null, 'Sits right in the shoulder pocket.'),
    A('light',   'stock', 'Skeleton Stock', 'rare',       2900, 13, { rpm: 0.14, spread: 0.10 }, null, 'Stripped to the frame.'),
    A('heavys',  'stock', 'Recoil Stock',   'rare',       3600, 15, { dmg: 0.15, spread: -0.25, rpm: -0.07 }, null, 'Eats the kick.'),
    A('exos',    'stock', 'Exo Brace',      'legendary', 240000, 31, { dmg: 0.25, rpm: 0.18, reload: -0.25 }, null, 'The gun does the holding.'),

    A('fmj',     'ammo', 'FMJ Ball',        'common',        0,  1, {}, null, 'What came in the crate.'),
    A('hp',      'ammo', 'Hollow Point',    'common',      390,  5, { dmg: 0.24, pierceFlat: -1 }, null, 'Everything into the first body.'),
    A('ap',      'ammo', 'AP Rounds',       'rare',       3900, 10, { dmg: -0.05, pierceFlat: 2 }, 'ap', 'Brutes stop being a wall.'),
    A('incend',  'ammo', 'Incendiary',      'rare',       5200, 15, { dmg: -0.10 }, 'burn', 'They keep walking, then they do not.'),
    A('hex',     'ammo', 'Hex Rounds',      'epic',      68000, 23, { dmg: 0.14 }, 'explosive', 'Splashes the whole cluster.'),
    A('biorounds','ammo','Bio-Rounds',      'legendary', 300000, 33, { dmg: 0.30, critFlat: 0.05 }, 'burn', 'Burns hotter, spreads wider.')
  ];
  Z.ATTACH = {};
  Z.ATTACHMENTS.forEach(function (a) { Z.ATTACH[a.id] = a; });

  Z.SPECIAL_TEXT = {
    laser:     'Laser: spread eliminated',
    ap:        'AP: ignores armour',
    burn:      'Incendiary: burn over time',
    explosive: 'Explosive: splash on hit',
    sentry:    'Sentry: +60% turret damage'
  };

  /* ------------------------------------------------------------------ *
   * Zombies.  spd is metres per second on the open map.
   * ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ *
   * The horde, in three weights
   *
   * A wave is only a decision if the things in it want different answers.
   * So there are three classes and they are balanced against each other
   * rather than against a curve:
   *
   *   light   swarm, runner   - fast, nearly no health, arrive first and
   *                             in numbers. Punish standing still.
   *                             Answer: spread, or a grenade.
   *   medium  shambler, spitter, screamer, stalker - the body of a wave.
   *                             Answer: the gun you are holding.
   *   heavy   brute, hulk, warden, boss - slow, enormous health, hit
   *                             hard enough to matter. They are a timer:
   *                             deal with them before they arrive, or
   *                             deal with them at arm's length.
   *                             Answer: position, traps, and cover.
   *
   * `heavy` is not cosmetic. It gives a body a real hitbox, a thud
   * instead of a slap when you hit it, a shake underfoot when it walks,
   * and a refusal to flinch - light things stagger when shot, heavy
   * things keep coming, which is the whole of why they are frightening.
   * ------------------------------------------------------------------ */
  Z.ZTYPES = {
    /* ---- light ---- */
    swarm:    { id: 'swarm',    name: 'Swarm',    hp: 0.26, spd: 2.05, dmg: 3,  cash: 0.55, armor: 0,    size: 0.72, from: 8,  tint: '#6C8A3E', pack: 4 },
    runner:   { id: 'runner',   name: 'Runner',   hp: 0.55, spd: 2.35, dmg: 6,  cash: 1.25, armor: 0,    size: 0.90, from: 3,  tint: '#7E8F3C' },
    /* ---- medium ---- */
    shambler: { id: 'shambler', name: 'Shambler', hp: 1.00, spd: 0.88, dmg: 7,  cash: 1.00, armor: 0,    size: 1.00, from: 1,  tint: '#5E7A4A' },
    spitter:  { id: 'spitter',  name: 'Spitter',  hp: 0.80, spd: 0.78, dmg: 4,  cash: 1.60, armor: 0,    size: 0.95, from: 6,  tint: '#4F7D5E', ranged: true, keepAway: 6.5 },
    screamer: { id: 'screamer', name: 'Screamer', hp: 1.20, spd: 1.02, dmg: 8,  cash: 2.00, armor: 0,    size: 1.05, from: 14, tint: '#8A4A6B', buffs: true },
    exploder: { id: 'exploder', name: 'Bloater',  hp: 0.75, spd: 1.25, dmg: 30, cash: 1.90, armor: 0,    size: 1.20, from: 16, tint: '#9AA83C', explodes: true },
    stalker:  { id: 'stalker',  name: 'Stalker',  hp: 0.95, spd: 1.60, dmg: 13, cash: 2.30, armor: 0.10, size: 0.98, from: 20, tint: '#3E4E62', stealth: true, night: true },
    /* Low and quick. Half the height of anything else out there, which
       is the point: it comes in under the eyeline and under a fence. */
    crawler:  { id: 'crawler',  name: 'Crawler',  hp: 0.58, spd: 1.92, dmg: 8,  cash: 1.40, armor: 0,    size: 0.80, from: 5,  tint: '#6E7A46', crawl: true },
    /* Gathers, then covers eight metres in one go - over a wall, over a
       barricade, onto whatever you thought you were safe behind. */
    leaper:   { id: 'leaper',   name: 'Leaper',   hp: 0.90, spd: 1.40, dmg: 15, cash: 2.40, armor: 0.05, size: 0.96, from: 11, tint: '#4A6B52', leap: true },
    /* Goes under the wall instead of through it. Untouchable while it is
       down there, and it always comes up close. */
    burrower: { id: 'burrower', name: 'Burrower', hp: 1.10, spd: 1.15, dmg: 12, cash: 2.60, armor: 0.08, size: 1.02, from: 15, tint: '#6A5A3E', burrow: true },
    /* Hangs back and keeps the pressure coming. Killing it is the only
       thing that stops the stream. */
    summoner: { id: 'summoner', name: 'Harbinger', hp: 2.40, spd: 0.72, dmg: 9, cash: 5.00, armor: 0.15, size: 1.14, from: 17, tint: '#6B4A82', summons: true, keepAway: 9.5 },
    /* ---- heavy ---- */
    brute:    { id: 'brute',    name: 'Brute',    hp: 4.60, spd: 0.60, dmg: 26, cash: 2.80, armor: 0.45, size: 1.50, from: 9,  tint: '#6B5340', heavy: 1 },
    hulk:     { id: 'hulk',     name: 'Hulk',     hp: 13.0, spd: 0.40, dmg: 46, cash: 6.50, armor: 0.42, size: 2.00, from: 13, tint: '#7C6A4A', heavy: 2 },
    warden:   { id: 'warden',   name: 'Warden',   hp: 8.00, spd: 0.56, dmg: 32, cash: 5.20, armor: 0.62, size: 1.68, from: 19, tint: '#5A6470', heavy: 2, plated: true },
    boss:     { id: 'boss',     name: 'Abomination', hp: 34.0, spd: 0.50, dmg: 46, cash: 14.0, armor: 0.32, size: 2.10, from: 10, tint: '#7A3A32', boss: true, heavy: 3, enrage: 0.34 }
  };

  /* Every fourth night the moon comes up red.

     A blood moon is not a harder night with the same shape - it is a
     different night: three times the bodies, arriving twice as fast,
     faster on their feet and hitting harder, and none of them wander.
     They come straight at the compound. The world goes red so you know
     before the first one is in sight. */
  Z.BLOODMOON_EVERY = 4;
  Z.isBloodMoon = function (w) {
    return w > 2 && w % Z.BLOODMOON_EVERY === 0;
  };

  /* ------------------------------------------------------------------ *
   * Abilities
   *
   * Two things you can do that are not pulling a trigger. Both are on a
   * cooldown rather than an ammunition count, because the interesting
   * decision with either is WHEN, and a stock of five turns that into
   * hoarding them for a night that never comes.
   * ------------------------------------------------------------------ */
  Z.GRENADE = {
    dmg: 150,          /* at the centre; falls off to a third at the rim */
    radius: 3.6,
    cook: 0.45,        /* how long it sits there after it lands */
    cool: 7.0,
    minRange: 2.2,
    maxRange: 13,
    charge: 0.55,      /* seconds of holding to reach maximum range */
    stun: 0.9          /* how long the survivors of it stagger */
  };

  Z.DASH = {
    dist: 4.6,
    time: 0.19,
    cool: 2.6,
    iframes: 0.16      /* briefly untouchable, so it can be an escape */
  };

  Z.curve = {
    zombieHp:   function (w) {
      return 16 * Math.pow(1.165, w - 1) * (Z.isBloodMoon(w) ? 1.22 : 1);
    },
    zombieCash: function (w) {
      return 4 * Math.pow(1.105, w - 1) * (Z.isBloodMoon(w) ? 1.9 : 1);
    },
    /* A night is a crowd, not a queue.

       The old counts were written when every one of them walked in a
       straight line at the nearest wall and stopped there, so a big
       number just meant a bigger pile in the same place. Now that they
       route around the compound and come through the gaps, the number
       is what makes a night feel like a night. */
    waveCount:  function (w) {
      var base = Math.min(420, 26 + Math.floor(w * 7.4));
      return Math.round(base * (Z.isBloodMoon(w) ? 3 : 1));
    },
    spawnGap:   function (w) {
      var g = Math.max(0.10, 0.52 - w * 0.012);
      return Z.isBloodMoon(w) ? g * 0.42 : g;
    },
    /* how many arrive together - they come in clumps off a few
       approaches rather than trickling evenly out of the dark */
    spawnPack:  function (w) {
      var k = 2 + Math.floor(w / 5);
      return Math.min(7, Z.isBloodMoon(w) ? k + 2 : k);
    },
    zombieSpeed: function (w) { return Z.isBloodMoon(w) ? 1.32 : 1; },
    isBoss:     function (w) { return w % 10 === 0; }
  };

  /* ------------------------------------------------------------------ *
   * Permanent upgrades - the Skills menu
   * ------------------------------------------------------------------ */
  var U = function (id, name, effect, base, growth, step, max, fmt, grp) {
    return { id: id, name: name, effect: effect, base: base, growth: growth,
             step: step, max: max || 0, fmt: fmt, grp: grp };
  };

  /* Seven branches, because a flat list of fourteen numbers is not a
     tree and does not read as choices. Each one is its own small board
     with its own colour and its own trunk, so you pick a direction and
     then work along it rather than scanning a honeycomb of forty tiles
     looking for the one you can afford.

     Existing ids are kept exactly as they were - `Z.S.upg` is keyed by
     id, and a save that bought Firepower before any of this existed
     still has its Firepower. */
  Z.UPGRADES = [
    /* ---- Player: the survivor's own body and handling ---- */
    U('hp',      'Constitution',       'max health',        40,   1.150, 14,   0,  'flat',   'player'),
    U('speed',   'Light Boots',        'move speed',        120,  1.175, 0.04, 40, 'pct',    'player'),
    U('carry',   'Steady Hands',       'gather speed',      85,   1.165, 0.09, 0,  'pct',    'player'),
    U('aimspd',  'Steady Aim',         'tighter spread',    130,  1.170, 0.05, 50, 'pct',    'player'),
    U('dodge',   'Evasion',            'chance to slip a hit', 260, 1.200, 0.02, 16, 'ptt',  'player'),
    U('xp',      'Field Craft',        'experience gained', 150,  1.185, 0.07, 0,  'pct',    'player'),

    /* ---- Weapons ---- */
    U('dmg',     'Firepower',          'weapon damage',     30,   1.155, 0.08, 0,  'pct',    'weapons'),
    U('rpm',     'Trigger Work',       'fire rate',         55,   1.170, 0.04, 0,  'pct',    'weapons'),
    U('magsz',   'Ammo Belt',          'magazine size',     160,  1.190, 0.05, 0,  'pct',    'weapons'),
    U('crit',    'Marksman',           'crit chance',       90,   1.185, 0.01, 45, 'ptt',    'weapons'),
    U('reload',  'Fast Hands',         'reload speed',      48,   1.160, 0.05, 40, 'pct',    'weapons'),
    U('pierce',  'Penetrator',         'rounds pierced',    340,  1.320, 0.34, 9,  'flat1',  'weapons'),
    U('critx',   'Lethality',          'crit damage',       140,  1.190, 0.14, 0,  'mult',   'weapons'),
    U('rangeup', 'Long Barrel',        'weapon range',      170,  1.180, 0.05, 45, 'pct',    'weapons'),

    /* ---- Defense: turrets, traps and the wire ---- */
    U('turret',  'Turret Calibration', 'turret damage',     130,  1.180, 0.10, 0,  'pct',    'defense'),
    U('trate',   'Autoloaders',        'turret fire rate',  180,  1.185, 0.05, 60, 'pct',    'defense'),
    U('trange',  'Target Acquisition', 'turret range',      160,  1.180, 0.04, 50, 'pct',    'defense'),
    U('tcrit',   'Fire Control',       'turret crit chance',320,  1.200, 0.02, 40, 'ptt',    'defense'),
    U('traps',   'Sharpened Stakes',   'trap damage',       140,  1.175, 0.12, 0,  'pct',    'defense'),
    U('thorns',  'Razor Wire',         'barricade thorns',  150,  1.180, 0.14, 0,  'pct',    'defense'),

    /* ---- Buildings: what the compound is made of ---- */
    U('bhp',     'Reinforcement',      'structure integrity',110, 1.170, 0.09, 0,  'pct',    'build'),
    U('bcost',   'Salvage Framing',    'cheaper to build',  190,  1.195, 0.03, 45, 'pct',    'build'),
    U('bupg',    'Modular Kit',        'cheaper to upgrade',230,  1.200, 0.03, 45, 'pct',    'build'),
    U('brepair', 'Field Repair',       'cheaper repairs',   160,  1.180, 0.04, 55, 'pct',    'build'),
    U('breclaim','Deconstruction',     'materials recovered',210, 1.190, 0.04, 45, 'pct',    'build'),

    /* ---- Resources ---- */
    U('yield',   'Rich Seams',         'harvest yield',     100,  1.170, 0.08, 0,  'pct',    'res'),
    U('prod',    'Overclock',          'production rate',   180,  1.185, 0.07, 0,  'pct',    'res'),
    U('store',   'Deep Stores',        'storage capacity',  150,  1.180, 0.10, 0,  'pct',    'res'),
    U('scav',    "Scavenger's Eye",    'loot found',        220,  1.190, 0.08, 0,  'pct',    'res'),
    U('bank',    'Holding Bins',       'stock before full', 190,  1.185, 0.12, 0,  'pct',    'res'),
    U('fuel',    'Fuel Economy',       'less fuel burned',  240,  1.195, 0.04, 55, 'pct',    'res'),

    /* ---- Survival: getting through the night ---- */
    U('regen',   'Field Medicine',     'health per sec',    70,   1.165, 0.24, 0,  'flat1',  'surv'),
    U('armor',   'Plating',            'damage taken',      140,  1.180, 0.03, 50, 'pct',    'surv'),
    U('night',   'Night Eyes',         'light reach',       120,  1.170, 0.06, 60, 'pct',    'surv'),
    U('lifest',  'Adrenaline',         'health per kill',   200,  1.190, 0.5,  0,  'flat1',  'surv'),
    U('blood',   'Moonproof',          'blood moon damage', 420,  1.220, 0.04, 50, 'pct',    'surv'),
    U('revive',  'Last Stand',         'survive a killing blow', 900, 1.400, 1, 3, 'flat',   'surv'),

    /* ---- Base: the compound as a whole ---- */
    U('cash',    'Scavenger',          'scrip per kill',    110,  1.175, 0.07, 0,  'pct',    'base'),
    U('power',   'Grid Tuning',        'power generated',   170,  1.180, 0.06, 0,  'pct',    'base'),
    U('battery', 'Charge Banks',       'power stored',      210,  1.190, 0.10, 0,  'pct',    'base'),
    U('radius',  'Command Radius',     'aura reach',        260,  1.200, 0.07, 60, 'pct',    'base'),
    U('offrate', 'Night Watch',        'offline rate',      300,  1.240, 0.04, 60, 'pctbase35', 'base'),
    U('offcap',  'Generator Bank',     'offline hours',     500,  1.300, 1,    22, 'hours',  'base')
  ];
  Z.UPGRADE = {};
  Z.UPGRADES.forEach(function (u) { Z.UPGRADE[u.id] = u; });

  /* Distinct enough to tell apart at a glance, and all of them earth,
     metal or uniform - no neon. Each group carries the three tones a
     tile needs: the line, the lit face and the text. */
  Z.UPG_GROUPS = [
    { id: 'player',  name: 'Player',    col: '#E0A33C', dim: '#8A6222' },
    { id: 'weapons', name: 'Weapons',   col: '#D2603A', dim: '#813621' },
    { id: 'defense', name: 'Defense',   col: '#6FA8C8', dim: '#3B6479' },
    { id: 'build',   name: 'Buildings', col: '#C89A5A', dim: '#7A5B2E' },
    { id: 'res',     name: 'Resources', col: '#8FBF5E', dim: '#4F7333' },
    { id: 'surv',    name: 'Survival',  col: '#7FC9A8', dim: '#3F7561' },
    { id: 'base',    name: 'Base',      col: '#B48FD0', dim: '#61457A' }
  ];
  Z.upgCost = function (u, lvl) { return Math.ceil(u.base * Math.pow(u.growth, lvl)); };

  /* ------------------------------------------------------------------ *
   * Reading a skill
   *
   * Every effect in the game goes through one of these three, so a new
   * skill is a row in the table above plus one call at the point it
   * matters - not a special case threaded through four files.
   * ------------------------------------------------------------------ */
  Z.upLv = function (id) { return (Z.S.upg && Z.S.upg[id]) || 0; };
  Z.upAdd = function (id) {
    var u = Z.UPGRADE[id];
    if (!u) return 0;
    var lv = Z.upLv(id);
    if (u.max) lv = Math.min(lv, u.max);
    return lv * u.step;
  };
  /* +x%, uncapped */
  Z.upMul = function (id) { return 1 + Z.upAdd(id); };
  /* -x%, with a floor, because nothing may ever reach free */
  Z.upCut = function (id, floor) {
    return Math.max(floor == null ? 0.3 : floor, 1 - Z.upAdd(id));
  };

  /* ------------------------------------------------------------------ *
   * The skill tree
   *
   * Where each skill sits on ITS OWN board, and what it grows out of.
   * `q` is the column and `y` the row, in rows, where a half means the
   * half-row a flat-top honeycomb offsets its neighbouring columns by.
   * Two tiles touch when they are in the same column one row apart, or
   * in neighbouring columns half a row apart - which every skill here is
   * from the one it grew out of, so the shape of a board IS its
   * dependency graph.
   *
   * `req` is how many levels the parent needs before a child opens. A
   * skill that already has levels in it is never closed again, so an old
   * save that bought things in the days before the tree keeps them.
   * ------------------------------------------------------------------ */
  Z.UPG_NODE = {
    /* player */
    hp:      { q: 0, y:  0 },
    speed:   { q: 1, y: -0.5, pre: 'hp',      req: 2 },
    carry:   { q: 1, y:  0.5, pre: 'hp',      req: 2 },
    aimspd:  { q: 2, y: -1,   pre: 'speed',   req: 3 },
    xp:      { q: 2, y:  0,   pre: 'speed',   req: 4 },
    dodge:   { q: 2, y:  1,   pre: 'carry',   req: 4 },

    /* weapons */
    dmg:     { q: 0, y:  0 },
    rpm:     { q: 1, y: -0.5, pre: 'dmg',     req: 2 },
    magsz:   { q: 1, y:  0.5, pre: 'dmg',     req: 2 },
    crit:    { q: 2, y: -1,   pre: 'rpm',     req: 3 },
    reload:  { q: 2, y:  0,   pre: 'rpm',     req: 3 },
    pierce:  { q: 2, y:  1,   pre: 'magsz',   req: 4 },
    critx:   { q: 3, y: -1.5, pre: 'crit',    req: 3 },
    rangeup: { q: 3, y:  0.5, pre: 'reload',  req: 3 },

    /* defense */
    turret:  { q: 0, y:  0 },
    trate:   { q: 1, y: -0.5, pre: 'turret',  req: 2 },
    trange:  { q: 1, y:  0.5, pre: 'turret',  req: 2 },
    tcrit:   { q: 2, y: -1,   pre: 'trate',   req: 3 },
    thorns:  { q: 2, y:  0,   pre: 'trate',   req: 4 },
    traps:   { q: 2, y:  1,   pre: 'trange',  req: 3 },

    /* buildings */
    bhp:     { q: 0, y:  0 },
    bcost:   { q: 1, y: -0.5, pre: 'bhp',     req: 2 },
    bupg:    { q: 1, y:  0.5, pre: 'bhp',     req: 2 },
    breclaim:{ q: 2, y: -1,   pre: 'bcost',   req: 3 },
    brepair: { q: 2, y:  1,   pre: 'bupg',    req: 3 },

    /* resources */
    yield:   { q: 0, y:  0 },
    prod:    { q: 1, y: -0.5, pre: 'yield',   req: 2 },
    store:   { q: 1, y:  0.5, pre: 'yield',   req: 2 },
    scav:    { q: 2, y: -1,   pre: 'prod',    req: 3 },
    fuel:    { q: 2, y:  0,   pre: 'prod',    req: 4 },
    bank:    { q: 2, y:  1,   pre: 'store',   req: 3 },

    /* survival */
    regen:   { q: 0, y:  0 },
    armor:   { q: 1, y: -0.5, pre: 'regen',   req: 2 },
    night:   { q: 1, y:  0.5, pre: 'regen',   req: 2 },
    blood:   { q: 2, y: -1,   pre: 'armor',   req: 3 },
    lifest:  { q: 2, y:  0,   pre: 'armor',   req: 4 },
    revive:  { q: 3, y: -1.5, pre: 'blood',   req: 3 },

    /* base */
    cash:    { q: 0, y:  0 },
    power:   { q: 1, y: -0.5, pre: 'cash',    req: 2 },
    offrate: { q: 1, y:  0.5, pre: 'cash',    req: 3 },
    battery: { q: 2, y: -1,   pre: 'power',   req: 3 },
    radius:  { q: 2, y:  0,   pre: 'power',   req: 4 },
    offcap:  { q: 2, y:  1,   pre: 'offrate', req: 3 }
  };

  Z.UPG_ICON = {
    cash: '<path d="M12 2.4A9.6 9.6 0 1 0 12 21.6 9.6 9.6 0 0 0 12 2.4zm0 3a6.6 6.6 0 1 1 0 13.2 6.6 6.6 0 0 1 0-13.2z"/>' +
          '<path d="M11 7.4h2v1.1h1.9v1.9H11.6a.5.5 0 0 0 0 1h1.2a2.4 2.4 0 0 1 .2 4.8v1.4h-2v-1.3H9.1v-1.9h3.3a.5.5 0 0 0 0-1h-1.2A2.4 2.4 0 0 1 11 8.7z"/>',
    dmg: '<path d="M12 1.8 8.6 9.2h6.8z" opacity=".95"/>' +
         '<path d="M8.4 10.2h7.2v3.4H8.4z"/>' +
         '<path d="M8.9 14.6h6.2v6.6H8.9z" opacity=".78"/>' +
         '<path d="M9.9 15.8h1.2v4.2H9.9zM12.9 15.8h1.2v4.2h-1.2z" opacity=".55"/>',
    rpm: '<path d="M9.6 1.8h4.8v2.4H9.6z"/>' +
         '<path d="M12 4A8.6 8.6 0 1 0 12 21.2 8.6 8.6 0 0 0 12 4zm0 2.6a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/>' +
         '<path d="M11.2 8.4h1.6v4.8h-1.6z"/><path d="M12 12.1h4.1v1.6H12z"/>',
    reload: '<path d="M12 3.4a9 9 0 0 1 8 4.9l-2.6 1.3A6.1 6.1 0 0 0 12 6.4z"/>' +
            '<path d="M12 20.6a9 9 0 0 1-8-4.9l2.6-1.3A6.1 6.1 0 0 0 12 17.6z" opacity=".72"/>' +
            '<path d="M10.2 1.6h3.2v4.4l-3.2-1.6z"/><path d="M13.8 22.4h-3.2V18l3.2 1.6z" opacity=".72"/>' +
            '<path d="M9.4 9.2h5.2v5.6H9.4z" opacity=".9"/>',
    crit: '<path d="M12 2.6A9.4 9.4 0 1 0 12 21.4 9.4 9.4 0 0 0 12 2.6zm0 2.6a6.8 6.8 0 1 1 0 13.6 6.8 6.8 0 0 1 0-13.6z"/>' +
          '<path d="M11.1 1.4h1.8v5.4h-1.8zM11.1 17.2h1.8v5.4h-1.8zM1.4 11.1h5.4v1.8H1.4zM17.2 11.1h5.4v1.8h-5.4z"/>' +
          '<path d="M12 9.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z"/>',
    critx: '<path d="M12 1.6 15 8.8l7.4.7-5.6 5 1.7 7.5L12 18l-6.5 4 1.7-7.5-5.6-5 7.4-.7z"/>' +
           '<path d="M12 6.6 13.5 10h3.7l-2.9 2.4.9 3.8L12 14.1l-3.2 2.1.9-3.8L6.8 10h3.7z" opacity=".45"/>',
    magsz: '<path d="M7.6 2.6h8.8v4H7.6z"/>' +
           '<path d="M7.6 7.8h8.8v4H7.6z" opacity=".82"/>' +
           '<path d="M7.6 13h8.8v4H7.6z" opacity=".64"/>' +
           '<path d="M7.6 18.2h8.8v3.2H7.6z" opacity=".46"/>' +
           '<path d="M9.2 3.6h1.4v18.2H9.2z" opacity=".35"/>',
    hp: '<path d="M12 21.2 4.2 13.5a5 5 0 0 1 7.1-7.1l.7.7.7-.7a5 5 0 0 1 7.1 7.1z"/>' +
        '<path d="M12 7.1l.7-.7a5 5 0 0 1 7.1 7.1L12 21.2z" opacity=".55"/>',
    regen: '<path d="M6.4 3.4h11.2A3 3 0 0 1 20.6 6.4v11.2a3 3 0 0 1-3 3H6.4a3 3 0 0 1-3-3V6.4a3 3 0 0 1 3-3z"/>' +
           '<path d="M10.4 6.8h3.2v3.6h3.6v3.2h-3.6v3.6h-3.2v-3.6H6.8v-3.2h3.6z" opacity=".35"/>',
    speed: '<path d="M8.4 3.4h3.8v8.2l5.6 3.2a3 3 0 0 1 1.5 2.6v3.2H8.4z"/>' +
           '<path d="M8.4 17.2h10.9v3.4H8.4z" opacity=".55"/>' +
           '<path d="M1.6 6.6h5.2v1.8H1.6zM0.6 10.6h6.2v1.8H0.6zM2.2 14.6h4.6v1.8H2.2z" opacity=".7"/>',
    carry: '<path d="M3.6 8.2h16.8v12.2H3.6z"/>' +
           '<path d="M3.6 8.2h16.8v3.4H3.6z" opacity=".45"/>' +
           '<path d="M12 1.4l4.4 4.6h-2.8v2.2h-3.2V6H7.6z" opacity=".85"/>' +
           '<path d="M9.8 13h4.4v1.8H9.8z" opacity=".4"/>',
    turret: '<path d="M4.2 16.6h15.6v4.2H4.2z"/>' +
            '<path d="M7.4 11.2h9.2v5.4H7.4z" opacity=".85"/>' +
            '<path d="M11 3.2h2.6v8.4H11z"/>' +
            '<path d="M9.6 2.2h5.4v2.2H9.6z" opacity=".7"/>' +
            '<path d="M6.2 18h11.6v1.4H6.2z" opacity=".35"/>',
    offrate: '<path d="M20.4 14.6A8.6 8.6 0 1 1 10 4.2a6.9 6.9 0 0 0 10.4 10.4z"/>' +
             '<path d="M17.6 2.2l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z" opacity=".7"/>',
    offcap: '<path d="M4.6 6.2h12.2A2.4 2.4 0 0 1 19.2 8.6v6.8a2.4 2.4 0 0 1-2.4 2.4H4.6A2.4 2.4 0 0 1 2.2 15.4V8.6A2.4 2.4 0 0 1 4.6 6.2z"/>' +
             '<path d="M20.2 9.8h1.8v4.4h-1.8z" opacity=".7"/>' +
             '<path d="M11.4 7.6h3.4l-2.2 3.6h2.4l-4.4 5.2 1-3.8H9.4z" opacity=".35"/>',

    /* ---- player ---- */
    aimspd: '<path d="M12 4.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6zm0 2.6a5.2 5.2 0 1 1 0 10.4 5.2 5.2 0 0 1 0-10.4z"/>' +
            '<path d="M11.2 1.2h1.6v3.6h-1.6zM11.2 19.2h1.6v3.6h-1.6zM1.2 11.2h3.6v1.6H1.2zM19.2 11.2h3.6v1.6h-3.6z" opacity=".7"/>' +
            '<path d="M12 10.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z"/>',
    dodge:  '<path d="M13.6 1.8a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2z"/>' +
            '<path d="M12.6 7.2 8 10.2l-1.6 4.2 2.3.9 1.2-3.2 2.1-1.3-.9 4.1 3.9 4.4 1.1 3.3 2.4-.8-1.4-4.2-2.9-3.3 1.1-5.1z"/>' +
            '<path d="m10 14.2-3.4 3.4-3.4.9.6 2.4 4.4-1.1 3.6-3.6z" opacity=".6"/>',
    xp:     '<path d="M12 1.8 14.6 8l6.8.5-5.2 4.4 1.6 6.6L12 16l-5.8 3.5 1.6-6.6L2.6 8.5 9.4 8z" opacity=".3"/>' +
            '<path d="M4.6 12.4h3.2l2.2 3.2 2.2-3.2h3.2l-3.8 5 3.9 5.2h-3.2L10 19.2l-2.3 3.4H4.5l3.9-5.2z" opacity="0"/>' +
            '<path d="M6.2 9.4h2.6l1.6 2.6 1.6-2.6h2.6l-2.9 4.2 3 4.4h-2.6L10.4 16l-1.7 2h-2.6l3-4.4z"/>' +
            '<path d="M15.4 9.4h2.4l1.2 4.4 1.2-4.4h2.4l-2.4 8.6h-2.4z"/>',

    /* ---- weapons ---- */
    pierce: '<path d="M1.6 11h13.6v2H1.6z"/>' +
            '<path d="M14.6 8.2 22.4 12l-7.8 3.8z"/>' +
            '<path d="M6.4 6.6h1.8v10.8H6.4zM10.4 5.2h1.8v13.6h-1.8z" opacity=".45"/>',
    rangeup:'<path d="M2.2 10.8h15.4v2.4H2.2z"/>' +
            '<path d="M17 7.6 23 12l-6 4.4z" opacity=".9"/>' +
            '<path d="M2.2 6.2h2.4v11.6H2.2z"/>' +
            '<path d="M8.2 8.8h1.6v6.4H8.2zM13 8.8h1.6v6.4H13z" opacity=".4"/>',

    /* ---- defense ---- */
    trate:  '<path d="M3.4 14.6h13.2v4.2H3.4z"/>' +
            '<path d="M6.2 9.6h7.6v5H6.2z" opacity=".8"/>' +
            '<path d="M9.2 2.6h1.8v7h-1.8z"/>' +
            '<path d="M14.8 3.4h1.7v6h-1.7zM18 5h1.7v4.4H18z" opacity=".62"/>' +
            '<path d="M5 19.8h10v1.4H5z" opacity=".35"/>',
    trange: '<path d="M12 9.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z"/>' +
            '<path d="M12 4.6a7.4 7.4 0 0 1 7.4 7.4h-2.6A4.8 4.8 0 0 0 12 7.2z" opacity=".78"/>' +
            '<path d="M12 .8A11.2 11.2 0 0 1 23.2 12h-2.6A8.6 8.6 0 0 0 12 3.4z" opacity=".45"/>' +
            '<path d="M3 18.6h18v2.6H3z" opacity=".6"/>',
    tcrit:  '<path d="M12 2.4A9.6 9.6 0 1 0 12 21.6 9.6 9.6 0 0 0 12 2.4zm0 2.8a6.8 6.8 0 1 1 0 13.6 6.8 6.8 0 0 1 0-13.6z"/>' +
            '<path d="M11.1 6.8h1.8v10.4h-1.8zM6.8 11.1h10.4v1.8H6.8z" opacity=".55"/>' +
            '<path d="m15.6 3.6 1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z"/>',
    traps:  '<path d="M2.6 17.4h18.8v3.2H2.6z"/>' +
            '<path d="M4.6 17.4 6.4 8l1.8 9.4zM10.2 17.4 12 5.6l1.8 11.8zM15.8 17.4 17.6 8l1.8 9.4z"/>' +
            '<path d="M6.4 8 5.5 12.6h1.8zM12 5.6l-.9 5.6h1.8zM17.6 8l-.9 4.6h1.8z" opacity=".4"/>',
    thorns: '<path d="M1.6 10.8h20.8v2.4H1.6z"/>' +
            '<path d="m8 6.2 1.5 4.6H6.5zM8 17.8l1.5-4.6H6.5zM16 6.2l1.5 4.6h-3zM16 17.8l1.5-4.6h-3z" opacity=".85"/>' +
            '<path d="M2.4 8.4h1.6v7.2H2.4zM20 8.4h1.6v7.2H20z" opacity=".55"/>',

    /* ---- buildings ---- */
    bhp:    '<path d="M12 1.8 21 5.6v6.2c0 4.6-3.6 8.6-9 10.4-5.4-1.8-9-5.8-9-10.4V5.6z"/>' +
            '<path d="M12 1.8 3 5.6v6.2c0 4.6 3.6 8.6 9 10.4z" opacity=".55"/>' +
            '<path d="M10.6 7.2h2.8v3.4h3.4v2.8h-3.4v3.4h-2.8v-3.4H7.2v-2.8h3.4z" opacity=".35"/>',
    bcost:  '<path d="M3 10.2 12 3.4l9 6.8V21h-5.6v-5.8H8.6V21H3z"/>' +
            '<path d="M3 10.2 12 3.4v17.6H3z" opacity=".5"/>' +
            '<path d="M16.6 13.4h4.8v2.2h-4.8z" opacity="0"/>' +
            '<path d="M14.6 17.6h7.8v2.4h-7.8z"/>',
    bupg:   '<path d="M3.4 12 12 4.2 20.6 12h-4.4v8H7.8v-8z"/>' +
            '<path d="M3.4 12 12 4.2V20H7.8v-8z" opacity=".5"/>' +
            '<path d="M6.6 1.4h10.8v2.4H6.6z" opacity=".8"/>',
    brepair:'<path d="m16.8 2.2 2.2 2.2-3 3 1.6 1.6 3-3 2.2 2.2a6.4 6.4 0 0 1-8 8L6.6 22 2 17.4l7.8-8.2a6.4 6.4 0 0 1 7-7z"/>' +
            '<path d="M6.6 22 2 17.4l7.8-8.2 4.6 4.6z" opacity=".5"/>' +
            '<path d="M4.2 17.6a1.7 1.7 0 1 1 2.4 2.4 1.7 1.7 0 0 1-2.4-2.4z" opacity=".55"/>',
    breclaim:'<path d="M3 4.6h18v3.6H3z"/>' +
             '<path d="M5.2 9.4h13.6v10.4a1.6 1.6 0 0 1-1.6 1.6H6.8a1.6 1.6 0 0 1-1.6-1.6z" opacity=".8"/>' +
             '<path d="M12 11.2l4.2 4.4h-2.6v4h-3.2v-4H7.8z" opacity=".4"/>',

    /* ---- resources ---- */
    yield:  '<path d="M11 13.2h2v9.2h-2z"/>' +
            '<path d="M12 1.6c3.4 2 5 4.6 5 7.2a5 5 0 0 1-10 0c0-2.6 1.6-5.2 5-7.2z"/>' +
            '<path d="M12 1.6C8.6 3.6 7 6.2 7 8.8a5 5 0 0 0 5 5z" opacity=".5"/>' +
            '<path d="M4.4 13.6c2.8-.4 4.8.4 6 2.4-2.6.8-4.6 0-6-2.4zM19.6 13.6c-2.8-.4-4.8.4-6 2.4 2.6.8 4.6 0 6-2.4z" opacity=".72"/>',
    prod:   '<path d="M2.4 20.8V9.4l5.4 3.4V9.4l5.4 3.4V9.4l5.4 3.4v7.9z"/>' +
            '<path d="M17.2 7.8h3.4l-.7-6h-2z" opacity=".8"/>' +
            '<path d="M5.4 15.6h2.4v3.2H5.4zM10.6 15.6H13v3.2h-2.4z" opacity=".35"/>' +
            '<path d="m21.4 2.6 1 2.4 2.4-.4-1.8 1.8h-3.2z" opacity="0"/>',
    store:  '<path d="M12 2.2 21.4 7v10L12 21.8 2.6 17V7z"/>' +
            '<path d="M12 2.2 2.6 7v10L12 21.8z" opacity=".55"/>' +
            '<path d="M12 7.6 17 10v4.6l-5 2.4-5-2.4V10z" opacity=".3"/>',
    scav:   '<path d="M10.4 2.4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 2.8a5.2 5.2 0 1 0 0 10.4 5.2 5.2 0 0 0 0-10.4z"/>' +
            '<path d="m16.4 15.4 2-2 5.2 5.2-2 2z" opacity=".8"/>' +
            '<path d="M9.4 7h2v2.4h2.4v2h-2.4v2.4h-2v-2.4H7v-2h2.4z" opacity=".45"/>',
    bank:   '<path d="M3.4 8.6h17.2v12.2H3.4z"/>' +
            '<path d="M3.4 8.6h17.2v3.4H3.4z" opacity=".45"/>' +
            '<path d="M12 1.4 19.6 7H4.4z" opacity=".85"/>' +
            '<path d="M6.6 14h4.2v4.4H6.6zM13.2 14h4.2v4.4h-4.2z" opacity=".3"/>',
    fuel:   '<path d="M4.4 3.4h9.2a2 2 0 0 1 2 2v15.2H2.4V5.4a2 2 0 0 1 2-2z"/>' +
            '<path d="M4.4 3.4h4.6v17.2H2.4V5.4a2 2 0 0 1 2-2z" opacity=".5"/>' +
            '<path d="M5.2 6.4h7.6v4.2H5.2z" opacity=".35"/>' +
            '<path d="M17 8.4h1.8v8.2a1.6 1.6 0 0 0 3.2 0V9.2l-2.4-3 1.4-1.2 3 3.6v8a3.6 3.6 0 0 1-7.2 0z" opacity=".75"/>',

    /* ---- survival ---- */
    armor:  '<path d="M12 1.6 21 5.2v6.4c0 4.6-3.6 8.8-9 10.8-5.4-2-9-6.2-9-10.8V5.2z"/>' +
            '<path d="M12 1.6 3 5.2v6.4c0 4.6 3.6 8.8 9 10.8z" opacity=".5"/>' +
            '<path d="M6.6 8.4h10.8v1.8H6.6zM6.6 11.8h10.8v1.8H6.6zM8 15.2h8V17H8z" opacity=".3"/>',
    night:  '<path d="M20.6 15.2A8.8 8.8 0 1 1 10 4.4a7 7 0 0 0 10.6 10.8z"/>' +
            '<path d="M6.2 2.2l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8zM18.6 2.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" opacity=".7"/>',
    lifest: '<path d="M12 21.2 4.4 13.6a5 5 0 0 1 7.1-7.1l.5.5.5-.5a5 5 0 0 1 7.1 7.1z"/>' +
            '<path d="M12 7l.5-.5a5 5 0 0 1 7.1 7.1L12 21.2z" opacity=".5"/>' +
            '<path d="M13.8 8.6h2.6l-1.8 3h2l-3.8 4.6.9-3.4h-1.9z" opacity=".55"/>',
    blood:  '<path d="M12 2.6A9.4 9.4 0 1 1 12 21.4 9.4 9.4 0 0 1 12 2.6z" opacity=".35"/>' +
            '<path d="M12 5.4a6.6 6.6 0 1 1 0 13.2 6.6 6.6 0 0 1 0-13.2z"/>' +
            '<path d="M12 5.4a6.6 6.6 0 0 0 0 13.2z" opacity=".45"/>' +
            '<path d="M3.2 3.6 20.8 21.2l-1.8 1.8L1.4 5.4z" opacity=".75"/>',
    revive: '<path d="M12 2.2c2 3.4 2 5.8 0 7.2-2.6 1.9-3.4 3.6-2.4 5.2.6-2 1.6-3.2 3-3.6-.6 2 0 3.4 1.8 4.2 2.6 1.2 3.6 3 3 5.4-.9 2.1-2.7 3.2-5.4 3.2-4.4 0-7-2.6-7-6.6 0-3.4 2.2-6.6 7-15z"/>' +
            '<path d="M12 2.2C7.2 10.6 5 13.8 5 17.2c0 4 2.6 6.6 7 6.6z" opacity=".4"/>',

    /* ---- base ---- */
    power:  '<path d="M13.8 1.6 5 13.6h5.2l-.8 8.8L18.8 10H13z"/>' +
            '<path d="M13.8 1.6 5 13.6h5.2z" opacity=".55"/>',
    battery:'<path d="M5.6 5.4h10.6A2.4 2.4 0 0 1 18.6 7.8v8.4a2.4 2.4 0 0 1-2.4 2.4H5.6a2.4 2.4 0 0 1-2.4-2.4V7.8a2.4 2.4 0 0 1 2.4-2.4z"/>' +
            '<path d="M19.8 9.2h2v5.6h-2" opacity=".7"/>' +
            '<path d="M5.6 8h3v8h-3zM9.8 8h3v8h-3z" opacity=".32"/>',
    radius: '<path d="M12 9.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z"/>' +
            '<path d="M12 5.4a6.6 6.6 0 0 1 6.6 6.6 6.6 6.6 0 0 1-2 4.7l-1.9-1.9A4 4 0 0 0 12 8z" opacity=".7"/>' +
            '<path d="M12 1.4A10.6 10.6 0 0 1 22.6 12c0 2.9-1.1 5.6-3 7.5l-1.9-1.9A7.9 7.9 0 0 0 12 4z" opacity=".38"/>' +
            '<path d="M3.4 19.6h7v2.6h-7z" opacity=".5"/>'
  };

  /* ------------------------------------------------------------------ *
   * Buildings
   *
   * Everything you can put down in the world, in one catalog. `cat` keys
   * the Build Menu's tabs; `w`/`h` are the footprint in tiles; `cost` is
   * paid once at placement. Turrets carry their own gun stats so they are
   * ordinary structures that happen to shoot - they can be walked around,
   * repaired, upgraded and destroyed like anything else.
   * ------------------------------------------------------------------ */
  /* Emoji render as whatever the platform feels like - full colour on
     one machine, a hollow outline on the next, and never in the game's
     own palette. Drawn paths do what they are told. */
  /* ------------------------------------------------------------------ *
   * HUD glyphs
   *
   * Drawn paths rather than emoji, for the same reason the build tabs
   * gave up on emoji: a platform renders those however it likes - full
   * colour here, a hollow outline there - and never in this game's
   * palette. These are solid shapes in `currentColor`, so one glyph
   * turns blue when its tab is active and grey when it is not, and looks
   * the same on a phone as on a desktop.
   * ------------------------------------------------------------------ */
  Z.HUD_ICON = {
    /* ---- the bottom bar ---- */
    base:    'M12 2.4 22 11h-3v10.6h-5.2v-6.2h-3.6v6.2H5V11H2z',
    build:   'M17.6 2.2a5 5 0 0 1 4.2 7.7l-2-2-2.2 2.2 2 2a5 5 0 0 1-6.6-5.6L4.4 14.4l-2-2L3 11l9.8-8.3a5 5 0 0 1 4.8-.5zM7.2 15.6l3.2 3.2-4.6 3.4-2-2z',
    weapons: 'M2.2 8.6h15.6l2.2 3.2H22v2.6h-4.4l-1.8 2.8h-3.6l-1-2.8H2.2zm4.2 8.6h3.2l-.8 4.6H5.8z',
    armor:   'M12 1.8 21 5v6.6c0 4.8-3.6 9-9 11.2-5.4-2.2-9-6.4-9-11.2V5zm0 3.2L6.2 7.2v4.4c0 3.2 2.3 6.1 5.8 7.8 3.5-1.7 5.8-4.6 5.8-7.8V7.2z',
    upgrade: 'M12 2.2 21 11h-5.2v3H8.2v-3H3zM3 15.6h18V19H3zM3 20.4h18v2.2H3z',
    crew:    'M12 2.6a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2zM3.4 21.4c0-4.3 3.9-7.4 8.6-7.4s8.6 3.1 8.6 7.4z',
    bag:     'M8.6 4.6a3.4 3.4 0 0 1 6.8 0v1.2h3.4L20 21.6H4L5.2 5.8h3.4zm2.2 1.2h2.4a1.2 1.2 0 0 0-2.4 0zM7.2 8.6l-.8 10.2h11.2L16.8 8.6z',
    gear:    'M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6zm-1.6-7h3.2l.5 2.9 2.2 1 2.5-1.6 2.2 2.2-1.6 2.5 1 2.2 2.9.5v3.2l-2.9.5-1 2.2 1.6 2.5-2.2 2.2-2.5-1.6-2.2 1-.5 2.9h-3.2l-.5-2.9-2.2-1-2.5 1.6-2.2-2.2 1.6-2.5-1-2.2-2.9-.5v-3.2l2.9-.5 1-2.2L2.1 5.7 4.3 3.5l2.5 1.6 2.2-1z',
    map:     'M8.8 2.4 15.2 5l6-2.4L22 3v17.4l-6.8 2.6-6.4-2.6L2 23V5.6zm-.4 3-3.6 1.4v11.6l3.6-1.4zm2.4.2v11.6l3.6 1.4V7z',
    /* ---- the readouts ---- */
    sun:     'M12 6.6a5.4 5.4 0 1 1 0 10.8 5.4 5.4 0 0 1 0-10.8zM11 .8h2v3.9h-2zm0 18.5h2v3.9h-2zM.8 11h3.9v2H.8zm18.5 0h3.9v2h-3.9zM3.7 5.1 5.1 3.7l2.8 2.8-1.4 1.4zm12.4 12.4 1.4-1.4 2.8 2.8-1.4 1.4zM5.1 20.3l-1.4-1.4 2.8-2.8 1.4 1.4zM18.9 3.7l1.4 1.4-2.8 2.8-1.4-1.4z',
    moon:    'M20.6 15.2A8.8 8.8 0 1 1 10 4.4a7 7 0 0 0 10.6 10.8z',
    skull:   'M12 1.8c5.4 0 9.2 3.7 9.2 8.8 0 3-1.3 5.2-3.3 6.6v3.4a1.6 1.6 0 0 1-1.6 1.6h-1.5v-3.1h-1.9v3.1h-1.8v-3.1H9.2v3.1H7.7a1.6 1.6 0 0 1-1.6-1.6v-3.4c-2-1.4-3.3-3.6-3.3-6.6 0-5.1 3.8-8.8 9.2-8.8zM8.4 8.6a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm7.2 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
    mag:     'M8 2.2h8v3.4H8zM6.8 6.8h10.4v13.4a1.8 1.8 0 0 1-1.8 1.8H8.6a1.8 1.8 0 0 1-1.8-1.8zm2 2.2v9.4h6.4V9z',
    medkit:  'M9.2 2.6h5.6v2.2h4.4a1.8 1.8 0 0 1 1.8 1.8v13a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 19.6v-13a1.8 1.8 0 0 1 1.8-1.8h4.4zm1.2 6.6v2.6H7.8v3.2h2.6v2.6h3.2v-2.6h2.6v-3.2h-2.6V9.2z',
    frag:    'M10.4 3.4h4.4v2.6h-4.4zM14.6 1.4h5.6v2.1h-5.6zM12.6 5.6a7.7 7.7 0 1 1 0 15.4 7.7 7.7 0 0 1 0-15.4z',
    run:     'M14.6 1.6a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6zM13.4 7.2 8.6 10l-1.8 4.6 2.5 1 1.3-3.4 2.3-1.4-1 4.5 4.2 4.8 1.2 3.6 2.6-.9-1.5-4.6-3.2-3.6 1.2-5.6zM10.8 15.2l-3.7 3.7-3.7 1 .7 2.6 4.8-1.2 3.9-3.9z',
    bullet:  'M12 1.6c2.6 2.6 4 5.4 4 8.4v5.6H8V10c0-3 1.4-5.8 4-8.4zM8 16.8h8v3.4a1.8 1.8 0 0 1-1.8 1.8H9.8A1.8 1.8 0 0 1 8 20.2z',
    aim:     'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-1-7h2v4.1h-2zm0 17.9h2V23h-2zM1 11h4.1v2H1zm17.9 0H23v2h-4.1zM12 3.2a8.8 8.8 0 1 1 0 17.6 8.8 8.8 0 0 1 0-17.6zm0 2.2a6.6 6.6 0 1 0 0 13.2 6.6 6.6 0 0 0 0-13.2z',
    bang:    'M12 2.2 23 21.8H1zm-1.2 6.4v6.6h2.4V8.6zm0 8.2v2.6h2.4v-2.6z',
    plus:    'M10.4 4h3.2v6.4H20v3.2h-6.4V20h-3.2v-6.4H4v-3.2h6.4z',
    chev:    'M8.6 3.4 17.2 12l-8.6 8.6-2.3-2.3L12.6 12 6.3 5.7z'
  };

  Z.BCAT_GLYPH = {
    all:     'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    defense: 'M12 2.2 20 5.4v6.2c0 4.4-3.2 8.3-8 10.2-4.8-1.9-8-5.8-8-10.2V5.4z',
    struct:  'M3 10.4 12 3.2l9 7.2V21h-6.4v-6.2H9.4V21H3z',
    power:   'M13.6 1.8 5 13.4h5.2L9.4 22.2 18.6 10H13z',
    storage: 'M3.4 7.2 12 3l8.6 4.2V17L12 21.2 3.4 17zM12 11.4l8.6-4.2M12 11.4V21',
    prod:    'M2.6 20.6V9.8l5.6 3.4V9.8l5.6 3.4V9.8l5.6 3.4v7.4zM17.4 8.4h3.4l-.7-6.2h-2z',
    utility: 'M12 2.4a6.4 6.4 0 0 1 3.7 11.6l-.5 3.2H8.8l-.5-3.2A6.4 6.4 0 0 1 12 2.4zM9 18.6h6v1.8H9zM10 21h4v1.4h-4z',
    special: 'M12 1.6 14.3 8l6.6.4-5.1 4.2 1.7 6.4L12 15.4 6.5 19l1.7-6.4L3.1 8.4 9.7 8z'
  };

  Z.BCATS = [
    { id: 'defense', name: 'Defense',    icon: '\uD83D\uDEE1' },
    { id: 'struct',  name: 'Structures', icon: '\uD83C\uDFDA' },
    { id: 'power',   name: 'Power',      icon: '\u26A1' },
    { id: 'storage', name: 'Storage',    icon: '\uD83D\uDCE6' },
    { id: 'prod',    name: 'Production', icon: '\uD83C\uDFED' },
    { id: 'utility', name: 'Utility',    icon: '\uD83D\uDD26' },
    { id: 'special', name: 'Special',    icon: '\u2726' }
  ];

  var B = function (o) {
    o.w = o.w || 1; o.h = o.h || o.w;
    o.cost = o.cost || {};
    o.hp = o.hp || 120;
    o.draw = o.draw || 0;
    return o;
  };

  Z.BUILDINGS = [
    /* ---- defense ---- */
    B({ id: 'wall', name: 'Wall', cat: 'defense', art: 'wall', w: 1, h: 1, hp: 420,
        cost: { wood: 12, scrap: 4 }, blurb: 'Blocks the way in.', unlock: 0, solid: true, chain: true }),
    B({ id: 'fence', name: 'Wire Fence', cat: 'defense', art: 'fence', w: 1, h: 1, hp: 140,
        cost: { scrap: 8 }, blurb: 'Cheap. Slows them down.', unlock: 0, solid: true, chain: true }),
    B({ id: 'barricade', name: 'Barricade', cat: 'defense', art: 'barricade', w: 1, h: 1, hp: 260,
        cost: { wood: 20, scrap: 6 }, blurb: 'Spiked. Bleeds what pushes it.', unlock: 0,
        solid: true, chain: true, thorns: 9 }),
    B({ id: 'gate', name: 'Gate', cat: 'defense', art: 'gate', w: 2, h: 1, hp: 520,
        chain: true, gateway: true,
        cost: { wood: 30, scrap: 24 }, blurb: 'You pass. They do not.', unlock: 2, solid: true, gate: true }),
    B({ id: 'turret', name: 'Auto Turret', cat: 'defense', art: 'turret', w: 1, h: 1, hp: 200,
        cost: { scrap: 80, coin: 900 }, draw: 5, blurb: 'Attacks nearby zombies.', unlock: 0,
        solid: true, gun: { dmg: 7, rps: 5.0, range: 7.2, color: '#8FD2E8' } }),
    B({ id: 'flamer', name: 'Flame Unit', cat: 'defense', art: 'flamer', w: 1, h: 1, hp: 220,
        cost: { scrap: 220, metal: 30, coin: 7500 }, draw: 8, blurb: 'Short reach. Keeps burning.', unlock: 6,
        solid: true, gun: { dmg: 5, rps: 11, range: 3.8, color: '#FF8A2B', special: 'burn' } }),
    B({ id: 'tesla', name: 'Tesla Coil', cat: 'defense', art: 'tesla', w: 1, h: 1, hp: 180,
        cost: { scrap: 400, parts: 20, coin: 34000 }, draw: 14, blurb: 'Arcs to three targets.', unlock: 12,
        solid: true, gun: { dmg: 34, rps: 1.7, range: 6.0, color: '#9FC4FF', special: 'chain' } }),
    B({ id: 'mortar', name: 'Mortar Pod', cat: 'defense', art: 'mortar', w: 2, h: 2, hp: 300,
        cost: { scrap: 900, metal: 120, coin: 130000 }, draw: 18, blurb: 'Lobs shells. Splashes wide.', unlock: 18,
        solid: true, gun: { dmg: 210, rps: 0.55, range: 13.5, color: '#D9B45A', special: 'splash' } }),
    B({ id: 'cryo', name: 'Cryo Emitter', cat: 'defense', art: 'cryo', w: 1, h: 1, hp: 200,
        cost: { scrap: 1400, parts: 60, coin: 380000 }, draw: 16, blurb: 'The horde crawls.', unlock: 24,
        solid: true, gun: { dmg: 14, rps: 3.2, range: 6.4, color: '#7FE6E0', special: 'slow' } }),
    B({ id: 'arclance', name: 'Arc Lance', cat: 'defense', art: 'arclance', w: 2, h: 2, hp: 420,
        cost: { scrap: 4000, parts: 240, coin: 1500000 }, draw: 40, blurb: 'Burns a line clean through.', unlock: 30,
        solid: true, gun: { dmg: 900, rps: 0.85, range: 14, color: '#F3E9FF', special: 'pierce' } }),
    B({ id: 'sandbag', name: 'Sandbag Line', cat: 'defense', art: 'sandbag', w: 1, h: 1, hp: 190,
        cost: { cloth: 9, scrap: 3 }, blurb: 'An hour of shovelling. Buys you a night.',
        unlock: 0, solid: true, chain: true }),
    B({ id: 'jersey', name: 'Concrete Barrier', cat: 'defense', art: 'jersey', w: 1, h: 1, hp: 1100,
        cost: { stone: 48, scrap: 12 }, blurb: 'Poured, not built. Nothing shoulders it aside.',
        unlock: 6, solid: true, chain: true }),
    B({ id: 'trap', name: 'Spike Trap', cat: 'defense', art: 'trap', w: 1, h: 1, hp: 90,
        cost: { wood: 18, scrap: 14 }, blurb: 'Hurts what walks over it.', unlock: 1, trap: 16 }),

    /* ---- structures ---- */
    B({ id: 'core', name: 'Command Post', cat: 'struct', art: 'core', w: 3, h: 3, hp: 1800,
        cost: { wood: 60, scrap: 40 }, blurb: 'The heart of the compound.', unlock: 0,
        solid: true, unique: true, radius: 16 }),
    B({ id: 'shelter', name: 'Shelter', cat: 'struct', art: 'shelter', w: 2, h: 2, hp: 500,
        cost: { wood: 55, cloth: 10 }, blurb: 'Houses two survivors.', unlock: 0, solid: true, crew: 2 }),
    B({ id: 'barracks', name: 'Barracks', cat: 'struct', art: 'barracks', w: 2, h: 2, hp: 620,
        cost: { wood: 150, cloth: 45, coin: 1200 }, blurb: 'Bunks for four, and a stove.',
        unlock: 6, solid: true, crew: 4 }),
    B({ id: 'watchtower', name: 'Watchtower', cat: 'struct', art: 'tower', w: 2, h: 2, hp: 600,
        cost: { wood: 120, scrap: 60 }, draw: 4, blurb: 'A marksman on the roof.', unlock: 4,
        solid: true, gun: { dmg: 16, rps: 1.2, range: 11.0, color: '#E0C98A' }, vision: 4 }),
    B({ id: 'infirmary', name: 'Infirmary', cat: 'struct', art: 'infirmary', w: 2, h: 2, hp: 420,
        cost: { wood: 90, cloth: 40, coin: 1200 }, draw: 6, blurb: 'Heals you while you stand near.', unlock: 7,
        solid: true, heal: 3.2, radius: 6 }),
    B({ id: 'workshop', name: 'Workshop', cat: 'struct', art: 'workshop', w: 3, h: 2, hp: 640,
        cost: { wood: 160, scrap: 120, coin: 2600 }, draw: 8, blurb: 'Every kill pays more.', unlock: 9,
        solid: true, scripMult: 0.18 }),

    /* ---- power ---- */
    B({ id: 'generator', name: 'Generator', cat: 'power', art: 'generator', w: 2, h: 1, hp: 300,
        cost: { scrap: 45, metal: 8 }, blurb: 'Burns fuel. Steady power.', unlock: 0,
        solid: true, gen: 18, burns: 0.006 }),
    B({ id: 'solar', name: 'Solar Panel', cat: 'power', art: 'solar', w: 2, h: 1, hp: 160,
        cost: { scrap: 120, parts: 6 }, blurb: 'Power, but only in daylight.', unlock: 2,
        solid: true, gen: 15, solar: true }),
    B({ id: 'battery', name: 'Battery Bank', cat: 'power', art: 'battery', w: 1, h: 2, hp: 240,
        cost: { scrap: 200, parts: 14, coin: 900 }, blurb: 'Carries daylight into the night.', unlock: 5,
        solid: true, store: 26 }),
    B({ id: 'windmill', name: 'Wind Turbine', cat: 'power', art: 'windmill', w: 2, h: 2, hp: 280,
        cost: { scrap: 480, metal: 90, parts: 30, coin: 14000 }, blurb: 'Turns whatever the weather brings.',
        unlock: 15, solid: true, gen: 34 }),

    /* ---- storage ---- */
    B({ id: 'stockpile', name: 'Stockpile', cat: 'storage', art: 'stockpile', w: 2, h: 2, hp: 320,
        cost: { wood: 40 }, blurb: 'Raises what you can hold.', unlock: 0, solid: true, cap: 400 }),
    B({ id: 'silo', name: 'Silo', cat: 'storage', art: 'silo', w: 2, h: 2, hp: 480,
        cost: { wood: 110, scrap: 90, coin: 1800 }, blurb: 'Much more of everything.', unlock: 8,
        solid: true, cap: 1600 }),
    B({ id: 'depot', name: 'Supply Depot', cat: 'storage', art: 'depot', w: 3, h: 2, hp: 700,
        cost: { scrap: 600, metal: 140, coin: 24000 }, draw: 4, blurb: 'Bulk storage and sorting.', unlock: 17,
        solid: true, cap: 8000 }),

    /* ---- production ---- *
       The two farms come first and need no power. Everything else in this
       category wants a generator running before it does anything, which
       left the first hour of a run with no way to make wood or food except
       by walking out and cutting it. */
    B({ id: 'grove', name: 'Timber Stand', cat: 'prod', art: 'grove', w: 2, h: 2, hp: 180,
        cost: { wood: 30, scrap: 10 }, draw: 0, blurb: 'Planted saplings. Cuts itself.',
        unlock: 0, solid: true, makes: { wood: 0.26 } }),
    B({ id: 'cropfield', name: 'Crop Field', cat: 'prod', art: 'cropfield', w: 3, h: 2, hp: 150,
        cost: { wood: 45, cloth: 8 }, draw: 0, blurb: 'Rows of greens. Feeds the crew.',
        unlock: 1, solid: true, makes: { food: 0.22 } }),
    B({ id: 'sawmill', name: 'Sawmill', cat: 'prod', art: 'sawmill', w: 2, h: 2, hp: 400,
        cost: { wood: 70, scrap: 30 }, draw: 5, blurb: 'Cuts wood on its own.', unlock: 1,
        solid: true, makes: { wood: 0.42 } }),
    B({ id: 'scrapyard', name: 'Scrap Press', cat: 'prod', art: 'scrapyard', w: 2, h: 2, hp: 440,
        cost: { wood: 60, scrap: 70 }, draw: 6, blurb: 'Strips wrecks for metal.', unlock: 1,
        solid: true, makes: { scrap: 0.36 } }),
    B({ id: 'farm', name: 'Hydroponics', cat: 'prod', art: 'farm', w: 3, h: 2, hp: 300,
        cost: { wood: 100, cloth: 20, coin: 700 }, draw: 7, blurb: 'Rations for the crew.', unlock: 3,
        solid: true, makes: { food: 0.30 } }),
    B({ id: 'compost', name: 'Compost Bay', cat: 'prod', art: 'compost', w: 1, h: 1, hp: 150,
        cost: { wood: 28, cloth: 8 }, blurb: 'Turns the scraps back into supper.',
        unlock: 1, solid: true, makes: { food: 0.12 } }),
    B({ id: 'fuelstill', name: 'Fuel Still', cat: 'prod', art: 'fuelstill', w: 2, h: 2, hp: 360,
        cost: { scrap: 130, metal: 34, coin: 900 }, draw: 6,
        blurb: 'Cracks anything that burns into something that burns better.',
        unlock: 5, solid: true, makes: { fuel: 0.20 } }),
    B({ id: 'medlab', name: 'Dispensary', cat: 'prod', art: 'medlab', w: 2, h: 2, hp: 300,
        cost: { wood: 90, cloth: 50, parts: 9, coin: 1600 }, draw: 4,
        blurb: 'Boils dressings and cooks antiseptic.',
        unlock: 7, solid: true, makes: { meds: 0.05 } }),
    B({ id: 'quarry', name: 'Stone Cutter', cat: 'prod', art: 'quarry', w: 2, h: 2, hp: 520,
        cost: { wood: 140, scrap: 120, coin: 2200 }, draw: 9, blurb: 'Breaks rubble into stone.', unlock: 6,
        solid: true, makes: { stone: 0.28 } }),
    B({ id: 'smelter', name: 'Smelter', cat: 'prod', art: 'smelter', w: 2, h: 2, hp: 560,
        cost: { stone: 120, scrap: 240, coin: 6400 }, draw: 14, blurb: 'Scrap in, clean metal out.', unlock: 11,
        solid: true, makes: { metal: 0.17 }, eats: { scrap: 0.30 } }),
    B({ id: 'refinery', name: 'Refinery', cat: 'prod', art: 'refinery', w: 3, h: 2, hp: 700,
        cost: { metal: 200, scrap: 700, coin: 30000 }, draw: 20, blurb: 'Makes fuel from anything.', unlock: 16,
        solid: true, makes: { fuel: 0.12 } }),
    B({ id: 'fabricator', name: 'Fabricator', cat: 'prod', art: 'fabricator', w: 3, h: 2, hp: 780,
        cost: { metal: 500, parts: 40, coin: 90000 }, draw: 28, blurb: 'Prints components.', unlock: 22,
        solid: true, makes: { parts: 0.06 } }),

    /* ---- utility ---- */
    B({ id: 'floodlight', name: 'Floodlight', cat: 'utility', art: 'floodlight', w: 1, h: 1, hp: 150,
        cost: { scrap: 60, parts: 3 }, draw: 6, blurb: 'Pushes the dark back.', unlock: 2,
        solid: true, light: 8.5 }),
    B({ id: 'campfire', name: 'Campfire', cat: 'utility', art: 'campfire', w: 1, h: 1, hp: 60,
        cost: { wood: 15 }, blurb: 'Warm light. Burns wood.', unlock: 0, light: 4.6, burns: 0.016 }),
    B({ id: 'beacon', name: 'Radio Beacon', cat: 'utility', art: 'beacon', w: 1, h: 2, hp: 260,
        cost: { scrap: 300, parts: 18, coin: 8000 }, draw: 10, blurb: 'Reveals the map around it.', unlock: 10,
        solid: true, vision: 14 }),
    B({ id: 'road', name: 'Paving', cat: 'utility', art: 'road', w: 1, h: 1, hp: 60,
        cost: { stone: 4 }, blurb: 'Walk faster over it.', unlock: 4, floor: true, speed: 1.35 }),
    B({ id: 'sensor', name: 'Motion Sensor', cat: 'utility', art: 'sensor', w: 1, h: 1, hp: 90,
        cost: { scrap: 180, parts: 10, coin: 5200 }, draw: 3, blurb: 'Marks what is coming.', unlock: 13,
        mark: 12 }),

    /* ---- special ---- */
    B({ id: 'shrine', name: 'Memorial', cat: 'special', art: 'shrine', w: 1, h: 1, hp: 200,
        cost: { stone: 60, cloth: 20 }, blurb: 'The ones who did not make it.', unlock: 5,
        solid: true, morale: 0.06 }),
    B({ id: 'armory', name: 'Armory', cat: 'special', art: 'armory', w: 2, h: 2, hp: 820,
        cost: { metal: 300, scrap: 900, coin: 46000 }, draw: 12, blurb: 'Reload faster near it.', unlock: 19,
        solid: true, radius: 8, reload: 0.30 }),
    B({ id: 'relay', name: 'Drone Relay', cat: 'special', art: 'relay', w: 2, h: 2, hp: 600,
        cost: { parts: 160, metal: 400, coin: 220000 }, draw: 30, blurb: 'Collects while you are away.',
        unlock: 26, solid: true, idle: 0.35 })
  ];
  Z.BUILDING = {};
  Z.BUILDINGS.forEach(function (b) { Z.BUILDING[b.id] = b; });

  /* Upgrading a placed structure. Level 1 is what you paid to put down. */
  Z.BMAXLVL = 10;
  Z.bUpCost = function (b, lvl) {
    var out = {};
    var k2 = 0.8 * Z.upCut('bupg', 0.5);
    for (var k in b.cost) out[k] = Math.max(1, Math.ceil(b.cost[k] * k2 * Math.pow(1.42, lvl)));
    return out;
  };
  /* Output scales faster than hit points, so upgrading is never a wash. */
  Z.bScale = function (lvl) { return Math.pow(1.34, (lvl || 1) - 1); };
  Z.bHpScale = function (lvl) { return 1 + ((lvl || 1) - 1) * 0.55; };

  /* ------------------------------------------------------------------ *
   * World props - what the map is littered with, and what clearing them
   * gives back. `work` is seconds of survivor labour at base gather speed.
   * ------------------------------------------------------------------ */
  var P = function (o) {
    o.r = o.r || 0.42; o.hp = o.hp || 60; o.h = o.h || 1.4;
    o.fw = o.fw || 1; o.fh = o.fh || o.fw;
    return o;
  };

  Z.PROPS = {
    tree:     P({ id: 'tree',     name: 'Tree',          art: 'tree',     r: 0.52, hp: 90,  h: 3.4,
                  yield: { wood: 14 }, work: 3.2, blocks: true }),
    pine:     P({ id: 'pine',     name: 'Pine',          art: 'pine',     r: 0.46, hp: 80,  h: 4.2,
                  yield: { wood: 12 }, work: 3.0, blocks: true }),
    deadtree: P({ id: 'deadtree', name: 'Dead Tree',     art: 'deadtree', r: 0.40, hp: 55,  h: 3.0,
                  yield: { wood: 8 },  work: 2.2, blocks: true }),
    bush:     P({ id: 'bush',     name: 'Scrub',         art: 'bush',     r: 0.38, hp: 24,  h: 0.9,
                  yield: { wood: 3, cloth: 1 }, work: 1.1 }),
    rock:     P({ id: 'rock',     name: 'Boulder',       art: 'rock',     r: 0.54, hp: 140, h: 1.1,
                  yield: { stone: 12 }, work: 4.0, blocks: true }),
    rubble:   P({ id: 'rubble',   name: 'Rubble',        art: 'rubble',   r: 0.60, hp: 100, h: 0.8,
                  yield: { stone: 8, scrap: 4 }, work: 2.8, blocks: true }),
    car:      P({ id: 'car',      name: 'Wrecked Car',   art: 'car',      r: 0.95, hp: 220, h: 1.5,
                  yield: { scrap: 22, metal: 6 }, work: 5.5, blocks: true, fw: 2, fh: 1 }),
    scrapPile:P({ id: 'scrapPile',name: 'Scrap Pile',    art: 'scrap',    r: 0.58, hp: 70,  h: 0.9,
                  yield: { scrap: 16 }, work: 2.4 }),
    barrel:   P({ id: 'barrel',   name: 'Fuel Drum',     art: 'barrel',   r: 0.34, hp: 40,  h: 1.1,
                  yield: { fuel: 6, metal: 2 }, work: 1.6, blocks: true }),
    crate:    P({ id: 'crate',    name: 'Supply Crate',  art: 'crate',    r: 0.40, hp: 30,  h: 0.9,
                  loot: 'crate', work: 2.6, blocks: true }),
    locker:   P({ id: 'locker',   name: 'Army Locker',   art: 'locker',   r: 0.42, hp: 50,  h: 1.5,
                  loot: 'locker', work: 3.4, blocks: true }),
    corpse:   P({ id: 'corpse',   name: 'Old Remains',   art: 'corpse',   r: 0.40, hp: 20,  h: 0.5,
                  loot: 'corpse', work: 1.8 }),
    /* `enter` means the footprint is a shell rather than a solid block:
       the walls stop you, the inside does not, and there is a door. */
    ruin:     P({ id: 'ruin',     name: 'Ruined House',  art: 'ruin',     r: 1.7,  hp: 600, h: 3.2,
                  loot: 'house', work: 0, blocks: true, big: true, enter: true,
                  fw: 4, fh: 4 }),
    store:    P({ id: 'store',    name: 'Corner Store',  art: 'store',    r: 2.1,  hp: 700, h: 3.4,
                  loot: 'store', work: 0, blocks: true, big: true, enter: true,
                  fw: 5, fh: 4 }),
    depotRu:  P({ id: 'depotRu',  name: 'Loading Depot', art: 'depotRu',  r: 2.6,  hp: 900, h: 3.8,
                  loot: 'depot', work: 0, blocks: true, big: true, enter: true,
                  fw: 6, fh: 5 }),
    lamp:     P({ id: 'lamp',     name: 'Street Light',  art: 'lamp',     r: 0.20, hp: 60,  h: 4.4,
                  yield: { metal: 4 }, work: 2.6, glow: true }),

    /* ---- downtown ----
       Taller and far heavier to clear than the suburb ruins. They are the
       reason to walk into the middle of the map: the loot is better and
       the buildings are big enough to read as a skyline from a long way
       off, which is what makes a horizon worth heading for. */
    block:    P({ id: 'block',    name: 'Apartments',    art: 'block',    r: 2.6,  hp: 1400, h: 6.4,
                  loot: 'house', work: 0, blocks: true, big: true, enter: true,
                  fw: 6, fh: 5 }),
    tower:    P({ id: 'tower',    name: 'Office Tower',  art: 'tower',    r: 3.0,  hp: 2200, h: 9.5,
                  loot: 'depot', work: 0, blocks: true, enter: true, big: true, fw: 6, fh: 6 }),
    warehouse: P({ id: 'warehouse', name: 'Warehouse',   art: 'warehouse', r: 3.4, hp: 1700, h: 4.8,
                  loot: 'depot', work: 0, blocks: true, big: true, enter: true,
                  fw: 8, fh: 5 })
  };

  /* Loot tables. `n` rolls, each entry [resource, min, max, weight]. */
  Z.LOOT = {
    crate:  { n: 2, rolls: [['scrap', 10, 22, 6], ['cloth', 4, 10, 4], ['coin', 40, 120, 5], ['food', 3, 8, 3]] },
    locker: { n: 3, rolls: [['metal', 4, 12, 5], ['parts', 1, 3, 2], ['coin', 120, 340, 5], ['scrap', 12, 30, 4]] },
    corpse: { n: 1, rolls: [['coin', 20, 70, 6], ['cloth', 1, 4, 4], ['food', 1, 3, 3]] },
    house:  { n: 4, rolls: [['wood', 14, 40, 6], ['cloth', 6, 18, 5], ['food', 3, 12, 4], ['coin', 90, 260, 5], ['parts', 1, 2, 1]] },
    store:  { n: 5, rolls: [['food', 10, 30, 6], ['coin', 180, 460, 5], ['cloth', 8, 20, 4], ['fuel', 3, 9, 3], ['parts', 1, 3, 2]] },
    depot:  { n: 6, rolls: [['scrap', 40, 110, 6], ['metal', 12, 40, 5], ['fuel', 6, 20, 4], ['parts', 2, 6, 3], ['coin', 300, 900, 5]] }
  };

  /* ------------------------------------------------------------------ *
   * Wave modifiers - from wave 5, every third wave rolls one.
   * ------------------------------------------------------------------ */
  Z.MODIFIERS = [
    { id: 'horde',   name: 'Horde',     desc: 'Twice as many, half as tough', count: 2.0, hp: 0.5 },
    { id: 'armored', name: 'Plated',    desc: 'Everything wears armour',      armorAdd: 0.32, cash: 1.3 },
    { id: 'swift',   name: 'Swift',     desc: 'They came in running',         spd: 1.55, cash: 1.25 },
    { id: 'fog',     name: 'Dense Fog', desc: 'Your range is cut short',      range: 0.62, cash: 1.5 },
    { id: 'bounty',  name: 'Bounty',    desc: 'Double scrip from every kill', cash: 2.0 },
    { id: 'feral',   name: 'Feral',     desc: 'Tougher, but they drop more',  hp: 1.6, cash: 1.8 }
  ];
  Z.MODIFIER = {};
  Z.MODIFIERS.forEach(function (m) { Z.MODIFIER[m.id] = m; });

  /* Prestige */
  Z.coresFor = function (bestWave) {
    if (bestWave < 50) return 0;
    return Math.floor(Math.pow(bestWave / 18, 1.35));
  };
  Z.PRESTIGE_WAVE = 50;
  Z.CORE_BONUS = 0.18;

  /* XP */
  Z.xpFor = function (lvl) { return Math.ceil(80 * Math.pow(1.19, lvl - 1)); };

})(window.Z);
