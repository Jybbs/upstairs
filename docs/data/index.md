---
description: Where the orbits, the map, and the place search come from, and what each request sends.
---

# Data

*Upstairs* keeps a spot set on the map or found through the search in the page's address, each coordinate rounded to {{ decimals }} decimals, so a link copied from it carries the spot. A spot found through Near me stays out of the address, so a link copied while it shows carries no spot until the reader sets one on the map or through the search.

## Orbits

The orbital elements come from [CelesTrak](https://celestrak.org/), which redistributes data from the US Space Force through [Space-Track](https://www.space-track.org/). The list covers active satellites only, leaving out debris, spent rockets, and anything outside the public catalog. CelesTrak publishes no license for the elements and makes them freely available to all users, updating them every two hours and asking each client to download them only once per update[^kelso2026], so the site's catalog service downloads the list from CelesTrak at most once every two hours and every reader's browser reads that copy from `upstairs.fyi`.

## The Map

The map combines terrain from the Terrain Tiles dataset, set out under Terrain below, with map data from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) in the [OpenMapTiles](https://openmaptiles.org/) schema, served through [OpenFreeMap](https://openfreemap.org/) and drawn by [MapLibre](https://maplibre.org/). OpenFreeMap builds its tiles from a full run over the planet each week, and [Credits](#credits) below sets out the notice and the license of each source the map draws. The map's credit opens as a band over the time strip, growing from a ring at the strip's right end, or on a phone from the head of the sheet, with the sources the map draws under one tab and the tiles it serves under another. It stays open until the reader presses, scrolls, or types on the map, or until {{ holdSeconds }} seconds after the OpenStreetMap line shows, and then folds into the ring, which opens it again.

## Terrain

The elevations come from the [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) dataset, which [Mapzen](https://github.com/tilezen/joerd) built from sources that each carry a license of their own. The dataset takes in new data as its users ask for it, and [Credits](#credits-tt) below lists the statement each license requires.

## Credits

The map draws on the sources below, whose terms require a credit, and each seal opens the source's notice and the license that sets it.

<Credits />

## Place Search

The search box finds places through [Photon](https://photon.komoot.io/), run by komoot, which searches OpenStreetMap's data under the [Open Database License](https://opendatacommons.org/licenses/odbl/) and keeps it up to date by the minute.

## Requests

Each service below receives requests from the reader's browser. The spot stays in the fragment of the page's address, which the browser sends to none of them, and every service other than Cloudflare receives the page's address only as far as its origin.

| **Service** | **Receives** |
|---|---|
| [Amazon Web Services](https://aws.amazon.com/), hosting the Terrain Tiles | *A request for each elevation tile the map draws, naming the stretch of the map in view* |
| [Cloudflare](https://www.cloudflare.com/), hosting the site and the catalog | *A request for each page and file of the site, the catalog included* |
| [OpenFreeMap](https://openfreemap.org/) | *A request for each tile of map data the map draws, naming the stretch of the map in view* |
| [Photon](https://photon.komoot.io/) | *The text typed in the search box* |

## Licenses

The license notice of each package the site bundles ships with it in [licenses.txt](/licenses.txt).
