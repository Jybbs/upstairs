---
description: Where the orbits, the map, and the place search come from, and what each request sends.
---

# Data

*Upstairs* keeps a spot set on the map or found through the search in the page's address, each coordinate rounded to {{ decimals }} decimals, so a link copied from it carries the spot. A spot found through Near me stays out of the address, so a link copied while it shows carries no spot until the reader sets one on the map or through the search.

## Orbits

The orbital elements come from [CelesTrak](https://celestrak.org/), which redistributes data from the US Space Force through [Space-Track](https://www.space-track.org/). The list covers active satellites only, leaving out debris, spent rockets, and anything outside the public catalog. CelesTrak publishes no license for the elements and makes them freely available to all users, updating them every two hours and asking each client to download them only once per update[^kelso2026], so the site's catalog service downloads the list from CelesTrak at most once every two hours and every reader's browser reads that copy from `upstairs.fyi`.

## Space-Track Account

[Space-Track](https://www.space-track.org/) serves the same elements to an account rather than an address, and approves their redistribution on the condition of a citation, per its [documentation](https://www.space-track.org/documentation). The catalog service downloads from CelesTrak and holds a Space-Track login as a secret, which the tasks below save, check, and set. The account is free, and each person or entity running the catalog service registers their own at <https://www.space-track.org/auth/createAccount>, since the User Agreement gives each user or entity an account of their own and forbids sharing a username or password. Space-Track approves a new account before it can log in, and asks an approved account to renew its access from time to time.

- `mise run catalog:login` prompts for the account's username, offering the one already saved, and for its password, hidden as it is typed, then logs in to Space-Track once and out again, saving the login in the `www.space-track.org` entry of `~/.netrc` once Space-Track accepts it
- `mise run catalog:login --check` logs in once with the saved login, writing nothing, and fails where no login is saved or Space-Track rejects it
- `mise run catalog:login --worker` sets the saved login as the deployed catalog service's secrets through Wrangler, under the Cloudflare login Wrangler holds, so no file, workflow, or log in the repository carries it

## The Map

The map combines terrain from the Terrain Tiles dataset, set out under Terrain below, with map data from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) in the [OpenMapTiles](https://openmaptiles.org/) schema, served through [OpenFreeMap](https://openfreemap.org/) and drawn by [MapLibre](https://maplibre.org/). OpenFreeMap builds its tiles from a full run over the planet each week, and [Credits](#credits) below sets out the notice and the license of each source the map draws. The map's credit opens in its lower-right corner, listing each source on its own line, and stays open until the reader presses, scrolls, or types on the map, or until {{ holdSeconds }} seconds after the OpenStreetMap line shows. It then folds into the button marked i, which opens it again.

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
