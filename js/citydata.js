/* Deadzone - what the city is made of.

   The old map had six kinds of building and put them wherever a road had
   a free verge, so every street was the same street. This file is the
   catalogue that replaced that: thirty-odd building types, each one a
   recipe rather than a picture, each one with a zone it belongs to, a
   sign over the door, a loot table that matches what it sold, and a room
   programme for when you go inside.

   Nothing here draws or places anything. `artcity.js` reads the `face`
   block to bake a facade; `city.js` reads `zones` to decide where the
   thing goes; `interior.js` reads `rooms` to lay out the inside. Keeping
   those three readings of the same entry in one place is what stops a
   supermarket from having a bedroom in it. */
(function (Z) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Zones
   *
   * A zone is a property of a tile, not of a building: the ground knows
   * what part of town it is, so paving, street furniture, zombie density
   * and the loot multiplier can all ask it without a building nearby.
   * ------------------------------------------------------------------ */
  var ZONE = Z.ZONE = {
    WILD: 0, SUBURB: 1, RESIDENTIAL: 2, DOWNTOWN: 3, COMMERCIAL: 4,
    SHOPPING: 5, INDUSTRIAL: 6, HOSPITAL: 7, PARK: 8, CONSTRUCTION: 9,
    RAIL: 10, PARKING: 11, HIGHWAY: 12, ALLEY: 13
  };

  /* Display name, the danger multiplier the sim reads, and how much the
     ground is paved. `risk` is the whole risk/reward dial: it scales both
     how many zombies stand around and how good the loot rolls. */
  Z.ZONE_DEF = {};
  Z.ZONE_DEF[ZONE.WILD]        = { name: 'Open Country',   risk: 0.45, paved: 0 };
  Z.ZONE_DEF[ZONE.SUBURB]      = { name: 'Suburbs',        risk: 0.7,  paved: 0.1 };
  Z.ZONE_DEF[ZONE.RESIDENTIAL] = { name: 'Residential',    risk: 1.0,  paved: 0.3 };
  Z.ZONE_DEF[ZONE.DOWNTOWN]    = { name: 'Downtown',       risk: 1.9,  paved: 0.9 };
  Z.ZONE_DEF[ZONE.COMMERCIAL]  = { name: 'Commercial',     risk: 1.3,  paved: 0.7 };
  Z.ZONE_DEF[ZONE.SHOPPING]    = { name: 'Shopping',       risk: 1.5,  paved: 0.8 };
  Z.ZONE_DEF[ZONE.INDUSTRIAL]  = { name: 'Industrial',     risk: 1.4,  paved: 0.75 };
  Z.ZONE_DEF[ZONE.HOSPITAL]    = { name: 'Hospital',       risk: 2.1,  paved: 0.8 };
  Z.ZONE_DEF[ZONE.PARK]        = { name: 'Park',           risk: 0.6,  paved: 0.1 };
  Z.ZONE_DEF[ZONE.CONSTRUCTION]= { name: 'Building Site',  risk: 1.2,  paved: 0.4 };
  Z.ZONE_DEF[ZONE.RAIL]        = { name: 'Rail Yard',      risk: 1.5,  paved: 0.5 };
  Z.ZONE_DEF[ZONE.PARKING]     = { name: 'Parking',        risk: 1.1,  paved: 1 };
  Z.ZONE_DEF[ZONE.HIGHWAY]     = { name: 'Highway',        risk: 1.2,  paved: 1 };
  Z.ZONE_DEF[ZONE.ALLEY]       = { name: 'Back Alley',     risk: 1.6,  paved: 0.9 };

  /* ------------------------------------------------------------------ *
   * Loot
   *
   * What a place gives up is what it sold. This is the whole of the
   * "supermarket means food, hardware means timber" mapping, and it is
   * also the reason to cross town rather than search the nearest house.
   * ------------------------------------------------------------------ */
  var L = Z.LOOT;

  L.food     = { n: 5, rolls: [['food', 18, 46, 8], ['cloth', 4, 12, 3], ['coin', 120, 300, 4], ['fuel', 2, 6, 2]] };
  L.grocery  = { n: 4, rolls: [['food', 12, 32, 8], ['coin', 90, 220, 4], ['cloth', 3, 9, 3]] };
  L.meds     = { n: 4, rolls: [['meds', 3, 9, 8], ['cloth', 6, 16, 5], ['coin', 160, 380, 4], ['parts', 1, 3, 2]] };
  L.medsAdv  = { n: 6, rolls: [['meds', 8, 22, 9], ['cloth', 10, 26, 5], ['parts', 2, 6, 4], ['coin', 300, 720, 4], ['metal', 6, 18, 3]] };
  L.kitchen  = { n: 4, rolls: [['food', 10, 26, 7], ['metal', 4, 12, 4], ['fuel', 2, 7, 3], ['coin', 80, 200, 3]] };
  L.clothes  = { n: 4, rolls: [['cloth', 18, 44, 9], ['coin', 110, 260, 4], ['food', 2, 6, 2]] };
  L.build    = { n: 5, rolls: [['wood', 30, 80, 8], ['stone', 14, 40, 6], ['metal', 8, 24, 5], ['parts', 1, 4, 3], ['coin', 90, 240, 3]] };
  L.elec     = { n: 4, rolls: [['parts', 3, 9, 9], ['metal', 8, 22, 5], ['power', 6, 18, 4], ['coin', 200, 520, 4]] };
  L.mil      = { n: 5, rolls: [['coin', 420, 1100, 7], ['metal', 14, 40, 5], ['parts', 3, 8, 5], ['meds', 2, 6, 3], ['fuel', 4, 12, 3]] };
  L.fuelT    = { n: 4, rolls: [['fuel', 16, 44, 9], ['scrap', 12, 30, 4], ['metal', 4, 14, 3], ['coin', 70, 180, 3]] };
  L.garage   = { n: 5, rolls: [['parts', 2, 6, 7], ['metal', 14, 38, 6], ['scrap', 20, 52, 5], ['fuel', 4, 14, 4], ['coin', 90, 240, 3]] };
  L.office   = { n: 4, rolls: [['coin', 260, 640, 7], ['parts', 1, 4, 4], ['cloth', 4, 12, 3], ['power', 3, 10, 3]] };
  L.bank     = { n: 5, rolls: [['coin', 900, 2400, 9], ['metal', 8, 22, 3], ['parts', 1, 3, 2]] };
  L.school   = { n: 4, rolls: [['cloth', 8, 20, 5], ['food', 6, 16, 4], ['parts', 1, 3, 3], ['coin', 120, 300, 4], ['wood', 10, 26, 3]] };
  L.rail     = { n: 5, rolls: [['metal', 20, 54, 7], ['scrap', 30, 76, 6], ['fuel', 6, 18, 4], ['coin', 180, 460, 4], ['parts', 1, 4, 2]] };
  L.mall     = { n: 6, rolls: [['coin', 300, 760, 6], ['cloth', 12, 30, 5], ['food', 10, 26, 5], ['parts', 2, 5, 4], ['meds', 2, 5, 3]] };
  L.church   = { n: 3, rolls: [['coin', 180, 460, 6], ['cloth', 8, 20, 4], ['wood', 10, 26, 3]] };
  L.hotel    = { n: 4, rolls: [['cloth', 12, 30, 6], ['food', 6, 16, 4], ['coin', 200, 480, 5], ['meds', 1, 3, 2]] };
  L.factory  = { n: 6, rolls: [['metal', 26, 66, 7], ['scrap', 40, 100, 6], ['parts', 3, 8, 5], ['fuel', 6, 18, 4], ['power', 4, 14, 3]] };
  L.parkade  = { n: 4, rolls: [['scrap', 24, 60, 6], ['metal', 10, 28, 5], ['fuel', 5, 15, 4], ['parts', 1, 4, 3]] };
  L.fire     = { n: 5, rolls: [['metal', 14, 36, 6], ['parts', 2, 6, 5], ['meds', 3, 8, 4], ['fuel', 6, 16, 4], ['coin', 180, 440, 3]] };

  /* ------------------------------------------------------------------ *
   * The catalogue
   *
   * `face` is the genome the facade baker reads. Every field in it is a
   * hint rather than a measurement - the baker varies all of them per
   * building, and the variation is what stops a street of shops from
   * being one shop drawn eight times.
   *
   *   mat      wall material family
   *   storeys  nominal floors; the baker jitters it
   *   win      window style: punched, ribbon, curtain, storefront
   *   front    what the ground floor is: glazing, dock, shutter, porch,
   *            colonnade, forecourt
   *   roof     kit of parts scattered on the roof
   *   sign     the thing over the door
   *   extras   anything hung on the walls
   * ------------------------------------------------------------------ */
  /* `Z.PLACES`, not `Z.BUILDINGS`.

     `Z.BUILDINGS` was already taken: data.js has used it since long before
     the city existed for the array of structures the player can put up in
     the compound, and ui.js calls `.filter` on it to build the catalogue
     dock. Naming this object the same thing replaced that array and the
     whole build interface stopped working, with no error anywhere the
     player could see. A place you go into and a structure you put up are
     different things and now have different names. */
  var CAT = Z.PLACES = {};

  /* How tall a building of n storeys actually stands.

     Not n times the storey height. A real eleven-storey office is 33
     metres, and at this camera a 33-metre sprite is four hundred pixels
     of wall that hides the entire street behind it - the first build of
     the city was unreadable for exactly that reason. The curve below
     keeps a bungalow at about three metres and tops an office tower out
     near fourteen, so the skyline still has a shape and you can still see
     past it. Storeys are not lost: the window grid still divides the wall
     into n rows, so the building reads as eleven floors regardless. */
  Z.wallHeight = function (storeys, storeyH) {
    return (storeyH || 3) * 1.02 * Math.pow(Math.max(1, storeys), 0.62);
  };

  function B(id, o) {
    o.id = id;
    o.fw = o.fw || 5; o.fh = o.fh || 5;
    o.face = o.face || {};
    o.face.storeys = o.face.storeys || 1;
    o.face.storeyH = o.face.storeyH || 3;
    o.h = o.h || (Z.wallHeight(o.face.storeys, o.face.storeyH) + 1.2);
    o.hp = o.hp || Math.round(240 + o.fw * o.fh * 22 + o.face.storeys * 260);
    o.zones = o.zones || {};
    o.rooms = o.rooms || ['generic'];
    CAT[id] = o;
    return o;
  }

  /* ---- houses and flats ------------------------------------------- */
  B('house', {
    name: 'House', loot: 'house', fw: 5, fh: 5,
    face: { mat: 'siding', storeys: 2, storeyH: 2.7, win: 'punched', front: 'porch',
            roof: 'hip', kit: ['chimney', 'aerial'], extras: ['gutter', 'washing'] },
    zones: { SUBURB: 14, RESIDENTIAL: 8 },
    rooms: ['living', 'kitchen', 'bed', 'bed', 'bath', 'hall']
  });
  B('bungalow', {
    name: 'Bungalow', loot: 'house', fw: 6, fh: 4,
    face: { mat: 'brick', storeys: 1, storeyH: 3.0, win: 'punched', front: 'porch',
            roof: 'hip', kit: ['chimney'], extras: ['gutter', 'carport'] },
    zones: { SUBURB: 11, RESIDENTIAL: 5 },
    rooms: ['living', 'kitchen', 'bed', 'bath', 'garage']
  });
  B('rowhouse', {
    name: 'Terrace', loot: 'house', fw: 4, fh: 5,
    face: { mat: 'brick', storeys: 3, storeyH: 2.6, win: 'punched', front: 'stoop',
            roof: 'flat', kit: ['chimney', 'dish', 'tank'], extras: ['fireEscape', 'gutter'] },
    zones: { RESIDENTIAL: 12, DOWNTOWN: 4, COMMERCIAL: 3 },
    rooms: ['living', 'kitchen', 'bed', 'bed', 'bath', 'hall', 'stair']
  });
  B('apartment', {
    name: 'Apartments', loot: 'house', fw: 7, fh: 6,
    face: { mat: 'concrete', storeys: 5, storeyH: 2.7, win: 'punched', front: 'lobby',
            roof: 'flat', kit: ['tank', 'hvac', 'dish', 'stair'], extras: ['balcony', 'fireEscape'] },
    zones: { RESIDENTIAL: 9, DOWNTOWN: 6 },
    rooms: ['hall', 'living', 'kitchen', 'bed', 'bed', 'bath', 'living', 'stair']
  });
  B('towerBlock', {
    name: 'Tower Block', loot: 'house', fw: 7, fh: 7,
    face: { mat: 'panel', storeys: 9, storeyH: 2.7, win: 'punched', front: 'lobby',
            roof: 'flat', kit: ['tank', 'hvac', 'hvac', 'mast', 'stair'], extras: ['balcony'] },
    zones: { DOWNTOWN: 7, RESIDENTIAL: 4 },
    rooms: ['hall', 'living', 'kitchen', 'bed', 'bed', 'bath', 'stair', 'storage']
  });
  B('motel', {
    name: 'Motel', loot: 'hotel', fw: 10, fh: 5,
    face: { mat: 'stucco', storeys: 2, storeyH: 2.7, win: 'punched', front: 'walkway',
            roof: 'flat', kit: ['hvac', 'hvac'], extras: ['walkway', 'poleSign'],
            sign: { text: 'MOTEL', style: 'pole', col: [214, 84, 62] } },
    zones: { HIGHWAY: 8, COMMERCIAL: 4, SUBURB: 2 },
    rooms: ['hall', 'bed', 'bed', 'bath', 'bed', 'office', 'bath']
  });
  B('hotel', {
    name: 'Hotel', loot: 'hotel', fw: 8, fh: 7,
    face: { mat: 'brick', storeys: 6, storeyH: 2.8, win: 'punched', front: 'canopy',
            roof: 'flat', kit: ['tank', 'hvac', 'dish', 'stair'], extras: ['balcony'],
            sign: { text: 'HOTEL', style: 'vertical', col: [206, 66, 52] } },
    zones: { DOWNTOWN: 6, COMMERCIAL: 3 },
    rooms: ['lobby', 'hall', 'bed', 'bed', 'bath', 'kitchen', 'office', 'stair']
  });

  /* ---- shops and services ----------------------------------------- */
  B('supermarket', {
    name: 'Supermarket', loot: 'food', fw: 10, fh: 7,
    face: { mat: 'panel', storeys: 1, storeyH: 5.0, win: 'storefront', front: 'glazing',
            roof: 'flat', kit: ['hvac', 'hvac', 'hvac', 'vent', 'dish'],
            extras: ['carts', 'dock', 'awning'],
            sign: { text: 'SUPERMARKET', style: 'band', col: [198, 62, 48] } },
    zones: { SHOPPING: 10, COMMERCIAL: 4 },
    rooms: ['sales', 'sales', 'checkout', 'storage', 'coldroom', 'office', 'staff', 'loading']
  });
  B('grocery', {
    name: 'Grocery', loot: 'grocery', fw: 6, fh: 5,
    face: { mat: 'brick', storeys: 2, storeyH: 3.0, win: 'storefront', front: 'glazing',
            roof: 'flat', kit: ['vent', 'dish'], extras: ['awning', 'crates'],
            sign: { text: 'GROCERY', style: 'band', col: [86, 148, 78] } },
    zones: { COMMERCIAL: 9, SHOPPING: 5, RESIDENTIAL: 3 },
    rooms: ['sales', 'checkout', 'storage', 'staff']
  });
  B('convenience', {
    name: 'Corner Store', loot: 'grocery', fw: 4, fh: 4,
    face: { mat: 'block', storeys: 1, storeyH: 3.4, win: 'storefront', front: 'glazing',
            roof: 'flat', kit: ['vent'], extras: ['awning', 'iceBox', 'newsBox'],
            sign: { text: 'OPEN 24H', style: 'band', col: [222, 150, 46] } },
    zones: { COMMERCIAL: 4, RESIDENTIAL: 2, SUBURB: 1 },
    rooms: ['sales', 'checkout', 'storage']
  });
  B('drugstore', {
    name: 'Drugstore', loot: 'meds', fw: 6, fh: 5,
    face: { mat: 'panel', storeys: 1, storeyH: 4.2, win: 'storefront', front: 'glazing',
            roof: 'flat', kit: ['hvac', 'vent'], extras: ['awning', 'crossSign'],
            sign: { text: 'PHARMACY', style: 'band', col: [70, 142, 190] } },
    zones: { COMMERCIAL: 8, SHOPPING: 5, HOSPITAL: 6 },
    rooms: ['sales', 'pharmacy', 'checkout', 'coldroom', 'storage', 'staff']
  });
  B('restaurant', {
    name: 'Restaurant', loot: 'kitchen', fw: 6, fh: 5,
    face: { mat: 'brick', storeys: 2, storeyH: 3.0, win: 'storefront', front: 'glazing',
            roof: 'flat', kit: ['vent', 'vent', 'hvac'], extras: ['awning', 'patio'],
            sign: { text: 'DINER', style: 'box', col: [208, 92, 54] } },
    zones: { COMMERCIAL: 8, DOWNTOWN: 5, SHOPPING: 4 },
    rooms: ['dining', 'dining', 'kitchen', 'coldroom', 'storage', 'bath']
  });
  B('cafe', {
    name: 'Cafe', loot: 'kitchen', fw: 4, fh: 4,
    face: { mat: 'stucco', storeys: 1, storeyH: 3.4, win: 'storefront', front: 'glazing',
            roof: 'flat', kit: ['vent'], extras: ['awning', 'patio'],
            sign: { text: 'CAFE', style: 'band', col: [148, 106, 62] } },
    zones: { COMMERCIAL: 7, DOWNTOWN: 5, SHOPPING: 3 },
    rooms: ['dining', 'kitchen', 'storage']
  });
  B('clothing', {
    name: 'Clothing Store', loot: 'clothes', fw: 6, fh: 5,
    face: { mat: 'stucco', storeys: 2, storeyH: 3.2, win: 'storefront', front: 'glazing',
            roof: 'flat', kit: ['hvac'], extras: ['awning', 'mannequin'],
            sign: { text: 'APPAREL', style: 'band', col: [150, 84, 150] } },
    zones: { SHOPPING: 9, COMMERCIAL: 5 },
    rooms: ['sales', 'sales', 'fitting', 'checkout', 'storage', 'staff']
  });
  B('hardware', {
    name: 'Hardware Store', loot: 'build', fw: 7, fh: 6,
    face: { mat: 'block', storeys: 1, storeyH: 4.6, win: 'storefront', front: 'glazing',
            roof: 'flat', kit: ['hvac', 'vent'], extras: ['dock', 'timberRack', 'awning'],
            sign: { text: 'HARDWARE', style: 'band', col: [206, 128, 40] } },
    zones: { COMMERCIAL: 8, INDUSTRIAL: 5, SHOPPING: 3 },
    rooms: ['sales', 'sales', 'timberYard', 'checkout', 'storage', 'office']
  });
  B('electronics', {
    name: 'Electronics', loot: 'elec', fw: 6, fh: 5,
    face: { mat: 'panel', storeys: 2, storeyH: 3.2, win: 'storefront', front: 'glazing',
            roof: 'flat', kit: ['hvac', 'dish', 'dish'], extras: ['awning', 'screens'],
            sign: { text: 'ELECTRONICS', style: 'band', col: [64, 146, 200] } },
    zones: { SHOPPING: 8, COMMERCIAL: 5, DOWNTOWN: 3 },
    rooms: ['sales', 'sales', 'checkout', 'storage', 'repair', 'staff']
  });
  B('gunstore', {
    name: 'Gun & Gear', loot: 'mil', fw: 5, fh: 4,
    face: { mat: 'block', storeys: 1, storeyH: 3.6, win: 'storefront', front: 'shutter',
            roof: 'flat', kit: ['vent'], extras: ['bars', 'awning'],
            sign: { text: 'GUNS & AMMO', style: 'band', col: [176, 58, 44] } },
    zones: { COMMERCIAL: 5, INDUSTRIAL: 3, HIGHWAY: 3 },
    rooms: ['sales', 'counter', 'vault', 'storage']
  });
  B('bank', {
    name: 'Bank', loot: 'bank', fw: 6, fh: 5,
    face: { mat: 'stone', storeys: 3, storeyH: 3.4, win: 'punched', front: 'colonnade',
            roof: 'flat', kit: ['hvac', 'stair'], extras: ['bars', 'clock'],
            sign: { text: 'BANK', style: 'carved', col: [186, 178, 152] } },
    zones: { DOWNTOWN: 8, COMMERCIAL: 4 },
    rooms: ['lobby', 'counter', 'office', 'vault', 'staff', 'bath']
  });
  B('mall', {
    name: 'Shopping Centre', loot: 'mall', fw: 14, fh: 10,
    face: { mat: 'panel', storeys: 2, storeyH: 4.4, win: 'ribbon', front: 'glazing',
            roof: 'flat', kit: ['hvac', 'hvac', 'hvac', 'hvac', 'vent', 'dish', 'stair'],
            extras: ['carts', 'dock', 'awning', 'atrium'],
            sign: { text: 'GALLERIA', style: 'band', col: [120, 96, 176] } },
    zones: { SHOPPING: 10 },
    rooms: ['atrium', 'sales', 'sales', 'sales', 'checkout', 'food', 'storage', 'office', 'loading', 'bath']
  });
  B('gasStation', {
    name: 'Gas Station', loot: 'fuelT', fw: 8, fh: 6,
    face: { mat: 'panel', storeys: 1, storeyH: 3.4, win: 'storefront', front: 'forecourt',
            roof: 'flat', kit: ['vent'], extras: ['pumps', 'canopy', 'poleSign', 'iceBox'],
            sign: { text: 'FUEL', style: 'pole', col: [214, 128, 40] } },
    zones: { HIGHWAY: 10, COMMERCIAL: 6, INDUSTRIAL: 4, SUBURB: 2 },
    rooms: ['sales', 'checkout', 'storage', 'bath']
  });
  B('autoshop', {
    name: 'Auto Repair', loot: 'garage', fw: 7, fh: 6,
    face: { mat: 'block', storeys: 1, storeyH: 4.2, win: 'storefront', front: 'shutter',
            roof: 'flat', kit: ['vent', 'hvac'], extras: ['tyres', 'liftBay', 'dock'],
            sign: { text: 'AUTO REPAIR', style: 'band', col: [70, 108, 168] } },
    zones: { INDUSTRIAL: 8, COMMERCIAL: 5, HIGHWAY: 4 },
    rooms: ['workshop', 'workshop', 'counter', 'parts', 'office']
  });

  /* ---- medical ----------------------------------------------------- */
  B('hospital', {
    name: 'General Hospital', loot: 'medsAdv', fw: 12, fh: 9,
    face: { mat: 'concrete', storeys: 5, storeyH: 3.2, win: 'ribbon', front: 'emergency',
            roof: 'flat', kit: ['helipad', 'hvac', 'hvac', 'tank', 'mast', 'stair'],
            extras: ['ambulanceBay', 'crossSign', 'canopy'],
            sign: { text: 'HOSPITAL', style: 'band', col: [78, 150, 198] } },
    zones: { HOSPITAL: 12 },
    rooms: ['reception', 'waiting', 'corridor', 'ward', 'ward', 'exam', 'theatre',
            'pharmacy', 'medstore', 'office', 'stair', 'morgue']
  });
  B('clinic', {
    name: 'Clinic', loot: 'meds', fw: 6, fh: 5,
    face: { mat: 'stucco', storeys: 2, storeyH: 3.2, win: 'punched', front: 'canopy',
            roof: 'flat', kit: ['hvac', 'vent'], extras: ['crossSign'],
            sign: { text: 'CLINIC', style: 'band', col: [78, 150, 198] } },
    zones: { HOSPITAL: 8, RESIDENTIAL: 3, COMMERCIAL: 3 },
    rooms: ['reception', 'waiting', 'exam', 'exam', 'pharmacy', 'office']
  });

  /* ---- civic ------------------------------------------------------- */
  B('office', {
    name: 'Office Tower', loot: 'office', fw: 7, fh: 7,
    face: { mat: 'glass', storeys: 11, storeyH: 3.0, win: 'curtain', front: 'lobby',
            roof: 'flat', kit: ['mast', 'hvac', 'hvac', 'dish', 'stair'], extras: [] },
    zones: { DOWNTOWN: 10 },
    rooms: ['lobby', 'corridor', 'office', 'office', 'meeting', 'kitchen', 'stair', 'bath']
  });
  B('officeLow', {
    name: 'Office Block', loot: 'office', fw: 6, fh: 5,
    face: { mat: 'concrete', storeys: 4, storeyH: 3.0, win: 'ribbon', front: 'lobby',
            roof: 'flat', kit: ['hvac', 'dish', 'stair'], extras: [] },
    zones: { DOWNTOWN: 7, COMMERCIAL: 5 },
    rooms: ['lobby', 'corridor', 'office', 'office', 'meeting', 'bath']
  });
  B('school', {
    name: 'School', loot: 'school', fw: 10, fh: 7,
    face: { mat: 'brick', storeys: 2, storeyH: 3.6, win: 'ribbon', front: 'porch',
            roof: 'flat', kit: ['vent', 'hvac', 'tank'], extras: ['flagpole', 'fence'],
            sign: { text: 'SCHOOL', style: 'carved', col: [176, 168, 148] } },
    zones: { RESIDENTIAL: 3, SUBURB: 2 },
    rooms: ['corridor', 'classroom', 'classroom', 'classroom', 'hall', 'office', 'bath', 'storage']
  });
  B('church', {
    name: 'Church', loot: 'church', fw: 6, fh: 7,
    face: { mat: 'stone', storeys: 1, storeyH: 6.4, win: 'arched', front: 'porch',
            roof: 'gable', kit: ['steeple'], extras: ['vines'],
            sign: { text: '', style: 'none' } },
    zones: { RESIDENTIAL: 2, SUBURB: 2 },
    rooms: ['nave', 'nave', 'vestry', 'office']
  });
  B('police', {
    name: 'Police Station', loot: 'mil', fw: 8, fh: 6,
    face: { mat: 'concrete', storeys: 2, storeyH: 3.4, win: 'punched', front: 'canopy',
            roof: 'flat', kit: ['mast', 'hvac', 'dish'], extras: ['bars', 'barrier', 'flagpole'],
            sign: { text: 'POLICE', style: 'band', col: [58, 92, 166] } },
    zones: { DOWNTOWN: 6, COMMERCIAL: 3 },
    rooms: ['reception', 'office', 'cells', 'armoury', 'lockers', 'corridor']
  });
  B('fireStation', {
    name: 'Fire Station', loot: 'fire', fw: 8, fh: 6,
    face: { mat: 'brick', storeys: 2, storeyH: 4.0, win: 'punched', front: 'shutter',
            roof: 'flat', kit: ['mast', 'vent'], extras: ['tower', 'flagpole'],
            sign: { text: 'FIRE & RESCUE', style: 'band', col: [186, 56, 44] } },
    zones: { COMMERCIAL: 5, RESIDENTIAL: 3, DOWNTOWN: 3 },
    rooms: ['bay', 'bay', 'lockers', 'office', 'staff', 'stair']
  });
  B('trainStation', {
    name: 'Train Station', loot: 'rail', fw: 12, fh: 8,
    face: { mat: 'stone', storeys: 2, storeyH: 4.6, win: 'arched', front: 'colonnade',
            roof: 'vault', kit: ['clockTower', 'vent'], extras: ['canopy', 'clock'],
            sign: { text: 'CENTRAL STATION', style: 'carved', col: [180, 172, 150] } },
    zones: { RAIL: 12 },
    rooms: ['concourse', 'concourse', 'ticket', 'waiting', 'office', 'storage', 'bath']
  });

  /* ---- industry ---------------------------------------------------- */
  B('warehouse', {
    name: 'Warehouse', loot: 'depot', fw: 10, fh: 7,
    face: { mat: 'steel', storeys: 1, storeyH: 6.0, win: 'ribbon', front: 'dock',
            roof: 'sawtooth', kit: ['vent', 'vent', 'hvac'], extras: ['dock', 'containers'],
            sign: { text: 'UNIT 4', style: 'stencil', col: [150, 146, 134] } },
    zones: { INDUSTRIAL: 10, RAIL: 5 },
    rooms: ['floor', 'floor', 'racking', 'loading', 'office', 'staff']
  });
  B('factory', {
    name: 'Factory', loot: 'factory', fw: 12, fh: 8,
    face: { mat: 'brick', storeys: 2, storeyH: 4.6, win: 'ribbon', front: 'dock',
            roof: 'sawtooth', kit: ['stack', 'stack', 'vent', 'tank'], extras: ['dock', 'pipes', 'containers'],
            sign: { text: 'WORKS', style: 'stencil', col: [148, 142, 128] } },
    zones: { INDUSTRIAL: 9 },
    rooms: ['floor', 'floor', 'machine', 'racking', 'loading', 'office', 'lockers']
  });
  B('depot', {
    name: 'Loading Depot', loot: 'depot', fw: 8, fh: 5,
    face: { mat: 'block', storeys: 1, storeyH: 4.4, win: 'ribbon', front: 'dock',
            roof: 'flat', kit: ['vent', 'hvac'], extras: ['dock', 'containers'] },
    zones: { INDUSTRIAL: 8, RAIL: 4, HIGHWAY: 3 },
    rooms: ['floor', 'racking', 'loading', 'office']
  });
  B('parkade', {
    name: 'Parking Garage', loot: 'parkade', fw: 9, fh: 8,
    face: { mat: 'concrete', storeys: 4, storeyH: 2.8, win: 'openDeck', front: 'ramp',
            roof: 'deck', kit: ['stair'], extras: ['ramp'],
            sign: { text: 'P', style: 'box', col: [72, 118, 176] } },
    zones: { DOWNTOWN: 7, PARKING: 8, SHOPPING: 4 },
    rooms: ['deck', 'deck', 'stair', 'booth']
  });

  /* ---- ruins ------------------------------------------------------- */
  B('ruin', {
    name: 'Ruined House', loot: 'house', fw: 5, fh: 4,
    face: { mat: 'brick', storeys: 2, storeyH: 2.7, win: 'punched', front: 'porch',
            roof: 'collapsed', kit: ['chimney'], extras: ['vines', 'gutter'], damage: 3 },
    zones: { SUBURB: 3, RESIDENTIAL: 2, WILD: 2 },
    rooms: ['living', 'kitchen', 'bed', 'hall']
  });
  B('burntOut', {
    name: 'Burnt-Out Shell', loot: 'house', fw: 5, fh: 5,
    face: { mat: 'brick', storeys: 2, storeyH: 2.7, win: 'punched', front: 'porch',
            roof: 'collapsed', kit: [], extras: ['scorch', 'vines'], damage: 4 },
    zones: { RESIDENTIAL: 1, SUBURB: 1, DOWNTOWN: 1, INDUSTRIAL: 1 },
    rooms: ['living', 'bed', 'hall']
  });

  /* ------------------------------------------------------------------ *
   * Room programme
   *
   * A role says what a room is for, and everything else follows from it:
   * which furniture goes in, how it is arranged, what a container in it
   * drops, and how dangerous the room is. `fill` is the arrangement rule -
   * `aisles` runs parallel racks down the long axis, `perimeter` lines the
   * walls, `scatter` drops things in the middle, `beds` pairs them off.
   * ------------------------------------------------------------------ */
  var R = Z.ROOMS = {};
  function RM(role, o) { o.role = role; R[role] = o; return o; }

  /* --- domestic --- */
  RM('living',   { name: 'Living Room', fill: 'perimeter', min: 9,
                   furn: ['sofa', 'tv', 'table', 'bookcase', 'lamp', 'rug'], loot: 'house', cont: ['cabinet', 'bookcase'] });
  RM('kitchen',  { name: 'Kitchen', fill: 'counterRun', min: 6,
                   furn: ['counter', 'stove', 'fridge', 'sink', 'table'], loot: 'kitchen', cont: ['fridge', 'cabinet'] });
  RM('bed',      { name: 'Bedroom', fill: 'beds', min: 6,
                   furn: ['bed', 'wardrobe', 'dresser', 'lamp'], loot: 'house', cont: ['wardrobe', 'dresser'] });
  RM('bath',     { name: 'Bathroom', fill: 'perimeter', min: 4,
                   furn: ['toilet', 'bath', 'sink'], loot: 'meds', cont: ['cabinet'] });
  RM('hall',     { name: 'Hallway', fill: 'corridor', min: 4,
                   furn: ['rack', 'lamp'], loot: 'house', cont: ['cabinet'] });
  RM('stair',    { name: 'Stairwell', fill: 'stair', min: 4,
                   furn: ['stairs'], loot: 'house', cont: [] });
  RM('garage',   { name: 'Garage', fill: 'scatter', min: 9,
                   furn: ['car', 'bench', 'rack', 'toolbox'], loot: 'garage', cont: ['toolbox', 'rack'] });
  RM('lobby',    { name: 'Lobby', fill: 'perimeter', min: 9,
                   furn: ['desk', 'sofa', 'plant', 'lamp'], loot: 'office', cont: ['desk'] });

  /* --- retail --- */
  RM('sales',    { name: 'Shop Floor', fill: 'aisles', min: 12,
                   furn: ['shelf'], loot: 'grocery', cont: ['shelf'] });
  RM('checkout', { name: 'Checkouts', fill: 'checkouts', min: 6,
                   furn: ['till', 'cart'], loot: 'grocery', cont: ['till'] });
  RM('counter',  { name: 'Counter', fill: 'counterRun', min: 5,
                   furn: ['counter', 'cabinet'], loot: 'mil', cont: ['cabinet', 'counter'] });
  RM('storage',  { name: 'Stock Room', fill: 'racking', min: 6,
                   furn: ['rack', 'pallet', 'crate'], loot: 'depot', cont: ['crate', 'rack'] });
  RM('coldroom', { name: 'Cold Store', fill: 'perimeter', min: 4,
                   furn: ['fridge', 'freezer'], loot: 'food', cont: ['fridge', 'freezer'] });
  RM('staff',    { name: 'Staff Room', fill: 'scatter', min: 4,
                   furn: ['table', 'chair', 'locker', 'fridge'], loot: 'house', cont: ['locker'] });
  RM('office',   { name: 'Office', fill: 'desks', min: 6,
                   furn: ['desk', 'chair', 'cabinet', 'plant'], loot: 'office', cont: ['cabinet', 'desk'] });
  RM('fitting',  { name: 'Fitting Rooms', fill: 'stalls', min: 4,
                   furn: ['mirror', 'bench'], loot: 'clothes', cont: ['bench'] });
  RM('repair',   { name: 'Repair Bench', fill: 'counterRun', min: 4,
                   furn: ['bench', 'toolbox', 'rack'], loot: 'elec', cont: ['toolbox'] });
  RM('vault',    { name: 'Strong Room', fill: 'perimeter', min: 4,
                   furn: ['safe', 'rack'], loot: 'mil', cont: ['safe'] });
  RM('timberYard',{ name: 'Timber Yard', fill: 'racking', min: 8,
                   furn: ['timber', 'rack', 'pallet'], loot: 'build', cont: ['rack'] });

  /* --- hospitality --- */
  RM('dining',   { name: 'Dining Room', fill: 'tables', min: 9,
                   furn: ['table', 'chair'], loot: 'kitchen', cont: ['cabinet'] });
  RM('food',     { name: 'Food Court', fill: 'tables', min: 12,
                   furn: ['table', 'chair', 'counter'], loot: 'kitchen', cont: ['counter'] });
  RM('atrium',   { name: 'Atrium', fill: 'scatter', min: 20,
                   furn: ['plant', 'bench', 'fountain', 'sign'], loot: 'mall', cont: ['bench'] });

  /* --- medical --- */
  RM('reception',{ name: 'Reception', fill: 'perimeter', min: 6,
                   furn: ['desk', 'chair', 'plant', 'sign'], loot: 'meds', cont: ['desk'] });
  RM('waiting',  { name: 'Waiting Room', fill: 'benchRows', min: 8,
                   furn: ['bench', 'plant', 'table'], loot: 'meds', cont: ['cabinet'] });
  RM('ward',     { name: 'Ward', fill: 'beds', min: 10,
                   furn: ['hospBed', 'curtain', 'monitor'], loot: 'medsAdv', cont: ['medCab'] });
  RM('exam',     { name: 'Examination', fill: 'perimeter', min: 5,
                   furn: ['hospBed', 'medCab', 'sink', 'monitor'], loot: 'medsAdv', cont: ['medCab'] });
  RM('theatre',  { name: 'Operating Theatre', fill: 'centre', min: 8,
                   furn: ['opTable', 'lightRig', 'monitor', 'medCab'], loot: 'medsAdv', cont: ['medCab'] });
  RM('pharmacy', { name: 'Pharmacy', fill: 'aisles', min: 5,
                   furn: ['medShelf', 'counter'], loot: 'medsAdv', cont: ['medShelf'] });
  RM('medstore', { name: 'Medical Store', fill: 'racking', min: 5,
                   furn: ['medShelf', 'crate', 'rack'], loot: 'medsAdv', cont: ['medShelf', 'crate'] });
  RM('morgue',   { name: 'Morgue', fill: 'perimeter', min: 5,
                   furn: ['slab', 'freezer'], loot: 'medsAdv', cont: ['freezer'] });
  RM('corridor', { name: 'Corridor', fill: 'corridor', min: 6,
                   furn: ['gurney', 'lamp'], loot: 'meds', cont: [] });

  /* --- civic / industrial --- */
  RM('classroom',{ name: 'Classroom', fill: 'desks', min: 9,
                   furn: ['desk', 'chair', 'board', 'bookcase'], loot: 'school', cont: ['bookcase'] });
  RM('cells',    { name: 'Holding Cells', fill: 'stalls', min: 5,
                   furn: ['bunk', 'bars'], loot: 'mil', cont: ['locker'] });
  RM('armoury',  { name: 'Armoury', fill: 'perimeter', min: 4,
                   furn: ['gunRack', 'locker', 'safe'], loot: 'mil', cont: ['gunRack', 'safe'] });
  RM('lockers',  { name: 'Locker Room', fill: 'perimeter', min: 5,
                   furn: ['locker', 'bench'], loot: 'mil', cont: ['locker'] });
  RM('bay',      { name: 'Appliance Bay', fill: 'centre', min: 12,
                   furn: ['engine', 'rack', 'toolbox'], loot: 'fire', cont: ['toolbox', 'rack'] });
  RM('floor',    { name: 'Warehouse Floor', fill: 'racking', min: 16,
                   furn: ['rack', 'pallet', 'crate', 'forklift'], loot: 'depot', cont: ['crate', 'rack'] });
  RM('racking',  { name: 'Racking', fill: 'aisles', min: 10,
                   furn: ['rack', 'pallet'], loot: 'depot', cont: ['rack'] });
  RM('machine',  { name: 'Machine Shop', fill: 'scatter', min: 10,
                   furn: ['machine', 'bench', 'toolbox', 'drum'], loot: 'factory', cont: ['toolbox'] });
  RM('loading',  { name: 'Loading Bay', fill: 'scatter', min: 8,
                   furn: ['pallet', 'crate', 'forklift', 'drum'], loot: 'depot', cont: ['crate'] });
  RM('workshop', { name: 'Workshop', fill: 'scatter', min: 9,
                   furn: ['car', 'lift', 'bench', 'toolbox', 'tyres'], loot: 'garage', cont: ['toolbox'] });
  RM('parts',    { name: 'Parts Store', fill: 'racking', min: 5,
                   furn: ['rack', 'crate', 'tyres'], loot: 'garage', cont: ['rack', 'crate'] });
  RM('deck',     { name: 'Parking Deck', fill: 'parking', min: 16,
                   furn: ['car'], loot: 'parkade', cont: ['car'] });
  RM('booth',    { name: 'Attendant Booth', fill: 'perimeter', min: 3,
                   furn: ['desk', 'chair'], loot: 'parkade', cont: ['desk'] });
  RM('concourse',{ name: 'Concourse', fill: 'scatter', min: 16,
                   furn: ['bench', 'board', 'plant', 'sign'], loot: 'rail', cont: ['bench'] });
  RM('ticket',   { name: 'Ticket Hall', fill: 'counterRun', min: 6,
                   furn: ['counter', 'board'], loot: 'rail', cont: ['counter'] });
  RM('nave',     { name: 'Nave', fill: 'pews', min: 12,
                   furn: ['pew', 'altar'], loot: 'church', cont: ['cabinet'] });
  RM('vestry',   { name: 'Vestry', fill: 'perimeter', min: 4,
                   furn: ['cabinet', 'table'], loot: 'church', cont: ['cabinet'] });
  RM('meeting',  { name: 'Meeting Room', fill: 'centre', min: 6,
                   furn: ['table', 'chair', 'board'], loot: 'office', cont: ['cabinet'] });
  RM('hall',     R.hall);
  RM('generic',  { name: 'Room', fill: 'scatter', min: 4,
                   furn: ['crate', 'table', 'cabinet'], loot: 'house', cont: ['crate', 'cabinet'] });

  /* Every room role the catalogue mentions must exist, or the interior
     generator silently falls back to a box of crates. Cheap to check, and
     it has caught three typos already. */
  Z.checkRooms = function () {
    var missing = [];
    for (var k in CAT) {
      var list = CAT[k].rooms || [];
      for (var i = 0; i < list.length; i++) {
        if (!R[list[i]] && missing.indexOf(list[i]) < 0) missing.push(list[i]);
      }
    }
    return missing;
  };

  /* ------------------------------------------------------------------ *
   * Registration
   *
   * The rest of the game knows about `Z.PROPS`, not about this catalogue,
   * so every building becomes an ordinary prop here. They are all solid,
   * all enterable and none of them can be chopped up for timber: a
   * building is a place you go into, not a resource node.
   * ------------------------------------------------------------------ */
  for (var bid in CAT) {
    var d = CAT[bid];
    Z.PROPS[bid] = {
      id: bid, name: d.name, art: bid,
      r: Math.max(d.fw, d.fh) * 0.42,
      hp: d.hp, h: d.h,
      fw: d.fw, fh: d.fh,
      loot: d.loot, work: 0,
      blocks: true, big: true, enter: true,
      building: d
    };
  }

  /* ------------------------------------------------------------------ *
   * Street furniture and wreckage
   *
   * None of this is a building and none of it is scenery either: every
   * one of them blocks a line of fire, gives back something when it is
   * cleared, or both. A city whose props are decoration is a city you
   * walk through in a straight line.
   * ------------------------------------------------------------------ */
  var SP = function (id, o) {
    o.id = id;
    o.art = id;
    o.r = o.r || 0.42; o.hp = o.hp || 60; o.h = o.h || 1.4;
    o.fw = o.fw || 1; o.fh = o.fh || o.fw;
    o.work = o.work == null ? 2.0 : o.work;
    Z.PROPS[id] = o;
    return o;
  };

  /* --- kerbside --- */
  SP('powerPole',  { name: 'Power Pole',     r: 0.24, hp: 90,  h: 6.2, yield: { wood: 10, metal: 3 }, work: 3.4, blocks: true });
  SP('fallenPole', { name: 'Fallen Pole',    r: 0.7,  hp: 70,  h: 0.7, yield: { wood: 8, metal: 4 },  work: 2.8, fw: 3, fh: 1, blocks: true });
  SP('trafficLight',{ name: 'Traffic Light', r: 0.22, hp: 70,  h: 4.0, yield: { metal: 6, parts: 1 }, work: 2.6, blocks: true });
  SP('roadSign',   { name: 'Road Sign',      r: 0.20, hp: 40,  h: 2.6, yield: { metal: 4 },  work: 1.6 });
  SP('hydrant',    { name: 'Hydrant',        r: 0.22, hp: 80,  h: 0.9, yield: { metal: 6 },  work: 2.2, blocks: true });
  SP('bench',      { name: 'Bench',          r: 0.6,  hp: 30,  h: 0.8, yield: { wood: 6, metal: 2 }, work: 1.4, fw: 2, fh: 1 });
  SP('bin',        { name: 'Litter Bin',     r: 0.3,  hp: 26,  h: 1.0, yield: { scrap: 5, cloth: 2 }, work: 1.2 });
  SP('busShelter', { name: 'Bus Shelter',    r: 1.1,  hp: 90,  h: 2.6, yield: { metal: 10, parts: 1 }, work: 3.0, fw: 3, fh: 1, blocks: true });
  SP('vending',    { name: 'Vending Machine',r: 0.36, hp: 60,  h: 1.9, loot: 'grocery', work: 2.4, blocks: true });
  SP('planter',    { name: 'Planter',        r: 0.5,  hp: 70,  h: 0.9, yield: { stone: 6, wood: 2 }, work: 2.0, blocks: true });
  SP('streetTree', { name: 'Street Tree',    r: 0.5,  hp: 80,  h: 4.4, yield: { wood: 11 }, work: 3.0, blocks: true });
  SP('bollard',    { name: 'Bollard',        r: 0.18, hp: 50,  h: 0.9, yield: { metal: 3 }, work: 1.4 });

  /* --- wrecks --- */
  SP('burntCar',   { name: 'Burnt-Out Car',  r: 0.95, hp: 180, h: 1.4, yield: { scrap: 16, metal: 8 }, work: 5.0, fw: 2, fh: 1, blocks: true });
  SP('policeCar',  { name: 'Police Cruiser', r: 0.95, hp: 230, h: 1.6, loot: 'mil',  work: 5.4, fw: 2, fh: 1, blocks: true });
  SP('ambulance',  { name: 'Ambulance',      r: 1.2,  hp: 280, h: 2.4, loot: 'meds', work: 6.0, fw: 3, fh: 2, blocks: true });
  SP('truckWreck', { name: 'Truck',          r: 1.5,  hp: 340, h: 2.8, yield: { scrap: 40, metal: 16, fuel: 6 }, work: 7.0, fw: 4, fh: 2, blocks: true });
  SP('busWreck',   { name: 'Bus',            r: 1.9,  hp: 420, h: 2.9, yield: { scrap: 54, metal: 22 }, work: 8.0, fw: 5, fh: 2, blocks: true });
  SP('railCar',    { name: 'Freight Car',    r: 2.2,  hp: 520, h: 3.4, loot: 'rail', work: 8.5, fw: 6, fh: 2, blocks: true });

  /* --- yards and industry --- */
  SP('container',  { name: 'Container',      r: 1.4,  hp: 400, h: 2.6, loot: 'depot', work: 6.5, fw: 4, fh: 2, blocks: true });
  SP('palletStack',{ name: 'Pallets',        r: 0.6,  hp: 50,  h: 1.0, yield: { wood: 16 }, work: 2.2, fw: 2, fh: 2, blocks: true });
  SP('drum',       { name: 'Chemical Drum',  r: 0.34, hp: 44,  h: 1.1, yield: { fuel: 8, metal: 2 }, work: 1.8, blocks: true });
  SP('dumpster',   { name: 'Skip',           r: 0.9,  hp: 140, h: 1.4, loot: 'crate', work: 3.6, fw: 3, fh: 2, blocks: true });
  SP('shed',       { name: 'Garden Shed',    r: 1.0,  hp: 120, h: 2.2, loot: 'house', work: 3.4, fw: 2, fh: 2, blocks: true });
  SP('washingLine',{ name: 'Washing Line',   r: 0.8,  hp: 20,  h: 1.9, yield: { cloth: 8, wood: 3 }, work: 1.6, fw: 3, fh: 1 });
  SP('shoppingCart',{ name: 'Trolley',       r: 0.34, hp: 20,  h: 1.0, yield: { metal: 4 }, work: 1.0 });

  /* --- building site --- */
  SP('scaffold',   { name: 'Scaffold',       r: 1.3,  hp: 200, h: 5.0, yield: { metal: 24, wood: 8 }, work: 5.5, fw: 3, fh: 2, blocks: true });
  SP('sandPile',   { name: 'Aggregate',      r: 1.0,  hp: 60,  h: 1.0, yield: { stone: 24 }, work: 3.0, fw: 2, fh: 2 });
  SP('pipeStack',  { name: 'Pipe Stack',     r: 1.1,  hp: 180, h: 1.4, yield: { stone: 16, metal: 6 }, work: 3.6, fw: 3, fh: 2, blocks: true });
  SP('digger',     { name: 'Excavator',      r: 1.4,  hp: 320, h: 2.8, yield: { metal: 30, fuel: 8, parts: 2 }, work: 7.0, fw: 3, fh: 2, blocks: true });
  SP('portaloo',   { name: 'Site Toilet',    r: 0.42, hp: 40,  h: 2.2, yield: { cloth: 3, scrap: 5 }, work: 1.8, blocks: true });

  /* --- the cordon --- */
  SP('barricade',  { name: 'Barricade',      r: 0.7,  hp: 160, h: 1.2, yield: { metal: 10, wood: 6 }, work: 3.2, fw: 2, fh: 1, blocks: true });
  SP('sandbagWall',{ name: 'Sandbag Wall',   r: 1.0,  hp: 260, h: 1.1, yield: { cloth: 10, stone: 14 }, work: 4.2, fw: 3, fh: 1, blocks: true });
  SP('checkpoint', { name: 'Checkpoint',     r: 1.2,  hp: 300, h: 2.8, loot: 'mil', work: 5.0, fw: 3, fh: 2, blocks: true });

  /* --- survivors, and what found them --- */
  SP('tent',       { name: 'Tent',           r: 0.9,  hp: 40,  h: 1.4, loot: 'house', work: 2.2, fw: 2, fh: 2, blocks: true });
  SP('campfire',   { name: 'Camp Fire',      r: 0.6,  hp: 20,  h: 0.5, yield: { wood: 4 }, work: 1.0, glow: true });
  SP('nest',       { name: 'Nest',           r: 1.2,  hp: 200, h: 1.6, loot: 'locker', work: 4.4, fw: 3, fh: 3, nest: true, blocks: true });

  /* --- the ground taking it back --- */
  SP('weeds',      { name: 'Weeds',          r: 0.36, hp: 14,  h: 0.5, yield: { wood: 1, cloth: 1 }, work: 0.7 });
  SP('sapling',    { name: 'Sapling',        r: 0.34, hp: 30,  h: 2.0, yield: { wood: 6 }, work: 1.6 });
  SP('trash',      { name: 'Refuse',         r: 0.42, hp: 12,  h: 0.35, yield: { scrap: 3, cloth: 2 }, work: 0.8 });

})(window.Z);
