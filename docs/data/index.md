---
description: Where the orbits, the map, and the place search come from, and what each request sends.
---

# Data

*Upstairs* draws on the sources below for its orbits, its map, and its place search, each named beside its refresh and the license it carries, and [Requests](#requests) lists what the reader's browser sends to each service.

## Orbits

The orbital elements come from [Space-Track](https://www.space-track.org/), where the US Space Force publishes them, and the operational status of each satellite comes from the satellite catalog [CelesTrak](https://celestrak.org/) keeps, known as SATCAT. The list covers active payloads only, meaning those SATCAT marks operational, partially operational, on backup or standby, spare, or on an extended mission, per its [status codes](https://celestrak.org/satcat/status.php), and leaves out debris, spent rockets, and any payload SATCAT holds no row for. The site's catalog service queries Space-Track once an hour for every payload with no decay date and elements fitted within the age limit [Accuracy](/method/#accuracy) sets out, logging in before the query and out after it. Space-Track asks, in its [API guidelines](https://www.space-track.org/documentation#api-use-guidelines), for this query at most once an hour, at a minute chosen at random away from the top and the bottom of the hour, and limits each account to fewer than 30 requests a minute and 300 an hour. SATCAT updates once or twice a day, so the service reads CelesTrak's [SATCAT directory](https://celestrak.org/satcat/jsonDir.php) once an hour and downloads the file only where the directory lists one newer than the copy it keeps, since CelesTrak asks each client to query a directory at most once an hour and to download data only once per update[^kelso2026]. CelesTrak publishes no license for SATCAT and makes its data freely available to all users. Every reader's browser then reads the catalog the service stores from `upstairs.fyi`.

## Space-Track Account

[Space-Track](https://www.space-track.org/) serves its elements to an account rather than an address, and approves their redistribution on the condition of a citation, per its [documentation](https://www.space-track.org/documentation). The catalog service queries Space-Track with a login it holds as a secret, and [The Catalog Service](https://github.com/Jybbs/upstairs?tab=contributing-ov-file#the-catalog-service) in the contributor guide sets out how a person running the service registers an account and sets that login.

## The Map

The map combines terrain from the Terrain Tiles dataset, set out under Terrain below, with map data from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) in the [OpenMapTiles](https://openmaptiles.org/) schema, served through [OpenFreeMap](https://openfreemap.org/) and drawn by [MapLibre](https://maplibre.org/). OpenFreeMap builds its tiles from a full run over the planet each week, and [Credits](#credits) below sets out the notice and the license of each source the map draws. The map's credit opens as a band over the time strip, growing from a ring at the strip's right end, or on a phone from the head of the sheet, with the sources the map draws under one tab and the tiles it serves under another. It stays folded into the ring until the reader presses the ring, and folds back at a second press or as the map is dragged.

## Terrain

The elevations come from the [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) dataset, which [Mapzen](https://github.com/tilezen/joerd) built from sources that each carry a license of their own. The dataset takes in new data as its users ask for it, and [Credits](#credits-tt) below lists the statement each license requires.

## Credits

The map and the orbits come from the sources below, whose terms require a credit, and each seal opens the source's notice and the license that sets it.

<Credits />

## Place Search

The search box finds places through [Photon](https://photon.komoot.io/), run by komoot, which searches OpenStreetMap's data under the [Open Database License](https://opendatacommons.org/licenses/odbl/) and keeps it up to date by the minute.

## Requests

*Upstairs* keeps a spot set on the map or found through the search in the fragment of the page's address, each coordinate rounded to {{ decimals }} decimals, so a link copied from it carries the spot. A spot found through Near me stays out of the address, so a link copied while it shows carries no spot until the reader sets one on the map or through the search.

Each service below receives requests from the reader's browser. The browser sends the fragment holding the spot to none of them, and every service other than Cloudflare receives the page's address only as far as its origin.

| **Service** | **Receives** |
|---|---|
| [Amazon Web Services](https://aws.amazon.com/), hosting the Terrain Tiles | *A request for each elevation tile the map draws, naming the stretch of the map in view* |
| [Cloudflare](https://www.cloudflare.com/), hosting the site and the catalog | *A request for each page and file of the site, the catalog included* |
| [OpenFreeMap](https://openfreemap.org/) | *A request for each tile of map data the map draws, naming the stretch of the map in view* |
| [Photon](https://photon.komoot.io/) | *The text typed in the search box* |

## Licenses

The license notice of each package the site bundles ships with it in [licenses.txt](/licenses.txt).
