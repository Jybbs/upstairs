# Upstairs

Pick a spot on the map and watch every satellite passing over it.

The site lists the active satellites above the horizon at that spot, plays their passes through a window of time, and shows where each one is headed. Everything is calculated in the browser from published orbital data, so the site runs without a server of its own.

## Run it

[mise](https://mise.jdx.dev/) installs the tools.

```sh
mise install
mise run site:install
mise run catalog
mise serve
mise test
mise press
```

`mise run catalog` downloads the catalog into `public/`. CelesTrak publishes new orbital data every two hours and asks for one download per update, so run it sparingly. `mise tasks` lists every task, and [the contributor guide](CONTRIBUTING.md) lists the checks a pull request runs.

## How it fits together

- `tools/catalog.ts` trims CelesTrak's active catalog to the fields the site reads, and the other scripts under `tools/` audit and sync the repository's declarations.
- `src/orbit/` holds the orbit scan and the web worker that runs it.
- `src/map/` holds the terrain style and the canvases drawn above it.
- `src/state/` holds the page's shared state and the traced passes.
- `src/ui/` holds the components.
- `.mise/` pins the tools and holds the tasks, one folder per domain.
- `.github/` holds the workflows, the label registry, the rulesets, and the repository's settings.

## Data

- Orbital data: [CelesTrak](https://celestrak.org/), from the US Space Force through [Space-Track](https://www.space-track.org/)
- Terrain: [Mapzen terrain tiles](https://github.com/tilezen/joerd/blob/master/docs/attribution.md)
- Map data: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) through [OpenFreeMap](https://openfreemap.org/)
- Place search: [Photon](https://photon.komoot.io/)
