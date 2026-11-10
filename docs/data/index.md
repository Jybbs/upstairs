---
description: Where the orbits, the map, and the place search come from, and what each request sends.
---

<script setup lang="ts">
import { HOLD }     from '../.vitepress/lib/map/credit.ts'
import { DECIMALS } from '../.vitepress/lib/state/address.ts'
</script>

# Data

*Upstairs* keeps a spot set on the map or found through the search in the page's address, each coordinate rounded to {{ DECIMALS }} decimals, so a link copied from it carries the spot. A spot found through Near me stays out of the address, so a link copied while it shows carries no spot until the reader sets one on the map or through the search.

## Orbits

The orbital elements come from [CelesTrak](https://celestrak.org/), which redistributes data from the US Space Force through [Space-Track](https://www.space-track.org/). The list covers active satellites only, leaving out debris, spent rockets, and anything outside the public catalog.

## The Map

The map combines terrain from the sources under Terrain below with map data from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) in the [OpenMapTiles](https://openmaptiles.org/) schema, served through [OpenFreeMap](https://openfreemap.org/) and drawn by [MapLibre](https://maplibre.org/). The map's credit stays open until the reader presses, scrolls, or types on the map, or until {{ HOLD.wait / 1000 }} seconds pass.

## Terrain

The elevations come from the [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) dataset, which [Mapzen](https://github.com/tilezen/joerd) built from these sources:

- ArcticDEM terrain data DEM(s) were created from DigitalGlobe, Inc., imagery and funded under National Science Foundation awards 1043681, 1559691, and 1542736
- Australia terrain data © Commonwealth of Australia (Geoscience Australia) 2017
- Austria terrain data © offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich
- Canada terrain data contains information licensed under the Open Government Licence – Canada
- Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers
- Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration
- Mexico terrain data source: INEGI, Continental relief, 2016
- New Zealand terrain data Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government (All rights reserved)
- Norway terrain data © Kartverket
- United Kingdom terrain data © Environment Agency copyright and/or database right 2015. All rights reserved
- United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey

## Place Search

The search box finds places through [Photon](https://photon.komoot.io/), run by komoot.

## Requests

Each service below receives requests from the reader's browser, and none of them receives the page's address beyond its origin.

| **Service** | **Receives** |
|---|---|
| [Amazon Web Services](https://aws.amazon.com/), hosting the Terrain Tiles | *A request for each elevation tile the map draws, naming the stretch of the map in view* |
| [OpenFreeMap](https://openfreemap.org/) | *A request for each tile of map data the map draws, naming the stretch of the map in view* |
| [Photon](https://photon.komoot.io/) | *The text typed in the search box* |

## Licenses

The license notice of each package the site bundles ships with it in [licenses.txt](/licenses.txt).
