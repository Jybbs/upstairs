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

`mise run catalog` downloads the catalog into `docs/public/`. CelesTrak publishes new orbital data every two hours and asks for one download per update, so run it sparingly. `mise tasks` lists every task, and [the contributor guide](CONTRIBUTING.md) lists the checks a pull request runs.

## How it fits together

- `docs/` holds the pages of the site, which [VitePress](https://vitepress.dev/) builds, with the map as its home page, beside the manifest and the lockfile.
- `docs/.vitepress/tools/catalog.ts` trims CelesTrak's active catalog to the fields the site reads, and the other scripts beside it audit and sync the repository's declarations.
- `docs/.vitepress/lib/orbit/` holds the orbit scan and the web worker that runs it.
- `docs/.vitepress/lib/map/` holds the terrain style and the canvases drawn above it.
- `docs/.vitepress/lib/state/` holds the map's shared state and the traced passes.
- `docs/.vitepress/lib/site/` holds the sections the navigation bar links and the preload of the map's chunk.
- `docs/.vitepress/theme/` holds the components, the map's layout, and the stylesheet.
- `docs/.vitepress/tests/` holds the suite, one folder per folder it covers.
- `.mise/` pins the tools and holds the tasks, one folder per domain.
- `.github/` holds the workflows, the label registry, the rulesets, and the repository's settings.

## Data

- Orbital data: [CelesTrak](https://celestrak.org/), from the US Space Force through [Space-Track](https://www.space-track.org/)
- Terrain: the [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) dataset and its sources
- Map data: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) through [OpenFreeMap](https://openfreemap.org/)
- Place search: [Photon](https://photon.komoot.io/)
