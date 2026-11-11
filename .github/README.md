# <picture><source media="(prefers-color-scheme: dark)" srcset="../docs/public/wordmark-night.svg"><img src="../docs/public/wordmark-day.svg" alt="Upstairs" width="292" height="72"></picture>

Pick a spot on the map and watch every satellite passing over it.

The site lists the active satellites above the horizon at that spot, plays their passes through a window of time, and shows where each one is headed. Everything is calculated in the browser from published orbital data, which the Cloudflare service under `docs/.vitepress/catalog/`, once deployed, downloads from CelesTrak at most once every two hours.

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

`mise run catalog` downloads the catalog into `docs/public/catalog.bin`, or encodes a CelesTrak file given as its argument. CelesTrak publishes new orbital data every two hours and asks for one download per update, so run it sparingly. `mise tasks` lists every task, and [the contributor guide](CONTRIBUTING.md) lists the checks a pull request runs.

## How it fits together

- `docs/` holds the pages of the site, which [VitePress](https://vitepress.dev/) builds, with the map as its home page, beside the manifest and the lockfile.
- `docs/.vitepress/catalog/` holds the Cloudflare Worker and its Durable Object, which download CelesTrak's active catalog once a cycle, encode the fields the orbit model reads as compressed binary columns, and serve the file from Workers KV through the edge cache.
- `docs/.vitepress/tools/` holds the scripts that audit and sync the repository's declarations.
- `rust/` holds the orbit crate, which places each satellite with SGP4 and finds its passes, compiled to WebAssembly.
- `docs/.vitepress/lib/orbit/` holds the catalog reader, the satellite kinds, and the web worker that runs the crate's scan.
- `docs/.vitepress/lib/map/` holds the terrain style, the canvases drawn above it, and the map's credit.
- `docs/.vitepress/lib/state/` holds the map's shared state, the spot the page's address carries, and the traced passes.
- `docs/.vitepress/lib/site/` holds the palette, the mark, the link-preview cards drawn at build time and the head tags pointing at them, the sections the navigation bar links, the preload of the map's chunk, the plugin adding the crates' license notices to the site's build, the Markdown extension that sets math, cites `docs/references.bib`, and draws the footnotes, the script marking the footnote a reader lands on, and the stylesheets a page links on its own.
- `docs/.vitepress/theme/` holds the components, the map's layout, and the stylesheet.
- `docs/.vitepress/tests/` holds the suite, one folder per folder it covers.
- `.mise/` pins the tools and holds the tasks, one folder per domain.
- `.github/` holds the workflows, the label registry, the rulesets, and the repository's settings.

## Data

- Orbital data: [CelesTrak](https://celestrak.org/), from the US Space Force through [Space-Track](https://www.space-track.org/)
- Terrain: the [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) dataset and its sources
- Map data: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) in the [OpenMapTiles](https://openmaptiles.org/) schema through [OpenFreeMap](https://openfreemap.org/)
- Place search: [Photon](https://photon.komoot.io/)
