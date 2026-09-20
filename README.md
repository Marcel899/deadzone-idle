# Deadzone Idle

A zombie survival / idle game. Vanilla JavaScript, no build step, no
dependencies: open `index.html` and it runs.

## Running it

Anything that serves static files will do. The one thing to get right is
caching - the browser will happily hold on to a stale `js/*.js` for a
long time while you are editing, so serve with no-store:

```
python -m http.server 8765
```

...or any equivalent. Opening `index.html` as a `file://` URL works too.

## Layout

| file | what is in it |
| --- | --- |
| `index.html` | every piece of HUD markup and all the CSS |
| `js/boot.js` | the frame loop and the fixed-step driver |
| `js/sim.js` | the simulation: player, zombies, waves, economy |
| `js/render.js` | the 2.5D renderer, terrain baking, particles, lighting |
| `js/ui.js` | HUD, console, weapon rail, skill tree |
| `js/data.js` | weapons, attachments, zombie types, buildings |
| `js/art.js` | the character rig that bakes people and zombies |
| `js/artcity.js` `js/artprops.js` `js/artstreet.js` `js/artint.js` | building, prop, street and interior art |
| `js/city.js` `js/citydata.js` `js/interior.js` | city generation and interior layout |
| `js/flow.js` | flow-field pathfinding and line of sight |
| `js/world.js` `js/camera.js` `js/base.js` `js/build.js` | world state, camera, the compound, placement |
| `js/input.js` `js/audio.js` `js/save.js` `js/util.js` | input, sound, persistence, helpers |
| `js/weapon.js` `js/gunicon.js` | weapon behaviour and the flat weapon art |
| `guns.js` | ~277KB of weapon mesh data |

## How it is put together

Everything hangs off one flat `window.Z` namespace - `Z.sim`, `Z.ui`,
`Z.fx`, `Z.flow` and so on. There are no modules and no bundler, so
script order in `index.html` is load order, and a name taken twice is a
name lost.

The world is 2.5D: metres convert to pixels through `cam.z`, depth is
foreshortened by `Z.PITCH`, and things are drawn back to front by their
world `y`. Characters and props are baked into canvas atlases once and
then blitted, rather than drawn from scratch each frame; terrain is
baked per chunk behind an LRU cache.
