<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../docs/public/wordmark-night.svg">
  <img src="../docs/public/wordmark-day.svg" alt="upstairs" width="292" height="72">
</picture>

*Every active satellite above a spot you choose.*

[![Rust](../docs/public/badges/rust.svg)![version](https://img.shields.io/badge/dynamic/toml?url=https%3A%2F%2Fraw.githubusercontent.com%2FJybbs%2Fupstairs%2Fmain%2F.mise%2Fconfig.toml&query=%24.tools.rust.version&style=for-the-badge&label=&color=0a4a47)](https://www.rust-lang.org/)
[![Coverage](../docs/public/badges/coverage.svg)![percent](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fupstairs.fyi%2Fcoverage.json&query=%24&suffix=%25&style=for-the-badge&label=&color=0a4a47)](https://github.com/Jybbs/upstairs/actions/workflows/deploy.yml?query=branch%3Amain)
[![Docs](../docs/public/badges/docs.svg)![Docs](https://img.shields.io/badge/Docs-0a4a47?style=for-the-badge)](https://upstairs.fyi/)

</div>

---

## 🛰️ About

***Upstairs*** counts every active satellite above a spot chosen on a terrain map, lists the passes crossing its sky, and plays them through a window of time. The reader's browser calculates each position from the orbital elements [CelesTrak](https://celestrak.org/) publishes, running the SGP4 orbit model through the [`sgp4`](https://docs.rs/sgp4) crate compiled to [WebAssembly](https://webassembly.org/), and [MapLibre](https://maplibre.org/) draws the terrain map beneath the satellites. A catalog service on [Cloudflare Workers](https://developers.cloudflare.com/workers/) downloads the elements from CelesTrak at most once every two hours, as CelesTrak asks, and every reader's browser reads that copy from `upstairs.fyi`.

---

## 🌌 The Site

Each page of the [site](https://upstairs.fyi/) answers the question beside it.

| **Page** | **What It Answers** |
|---|---|
| [Map](https://upstairs.fyi/) | *Which satellites stand above a spot at the time the strip shows, and where each one is headed* |
| [Guide](https://upstairs.fyi/guide/) | *How to read the map, the pass list, and the time strip* |
| [Method](https://upstairs.fyi/method/) | *How the site calculates where each satellite stands, how it finds each pass, and how far a position can be trusted* |
| [Data](https://upstairs.fyi/data/) | *Where the orbits, the map, and the place search come from, and what each request sends* |

[CONTRIBUTING.md](CONTRIBUTING.md) lists the tasks, the checks a pull request passes, how a push to `main` deploys, and the labels an issue carries.

---

## 🚀 Quickstart

[mise](https://mise.jdx.dev/) installs every tool `.mise/config.toml` pins, so once [mise itself is installed](https://mise.jdx.dev/getting-started.html), these commands clone the repository, install its tools and packages, download the catalog, and serve the site locally:

```bash
git clone https://github.com/Jybbs/upstairs.git
mise trust upstairs
mise -C upstairs install
cd upstairs
mise run catalog
mise serve
```

`mise run catalog` downloads the satellite catalog into `docs/public/catalog.bin`. CelesTrak publishes new orbital data every two hours and asks for one download per update, so the task runs only when the catalog itself has to move.

---

## 🌠 Attribution

*Upstairs* is released under the MIT License, which [`LICENSE`](../LICENSE) carries. The map draws the data below, and [Data](https://upstairs.fyi/data/) credits each source in full.

- The orbital elements come from [CelesTrak](https://celestrak.org/), which publishes no license for them and makes them freely available to all users
- The map data comes from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) under the [Open Database License](https://opendatacommons.org/licenses/odbl/) and reaches the map through [OpenFreeMap](https://openfreemap.org/) in the [OpenMapTiles](https://openmaptiles.org/) schema, whose design is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- The elevations come from the [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) dataset, whose sources each carry their own license, with 3DEP, GMTED2010, and ETOPO1 in the public domain, SRTM in the public domain within the United States, and ArcticDEM free to use without permission
