---
description: Where the orbits, the map, and the place search come from.
---

# Data

*Upstairs* stores no locations. Moving the map requests map tiles from the providers below, and typing in the search box sends that text to Photon.

## Orbits

The orbital elements come from [CelesTrak](https://celestrak.org/), which redistributes data from the US Space Force through [Space-Track](https://www.space-track.org/). The list covers active satellites only, leaving out debris, spent rockets, and anything outside the public catalog.

## The Map

The map combines terrain from the [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) dataset and its sources with map data from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) served through [OpenFreeMap](https://openfreemap.org/), drawn by [MapLibre](https://maplibre.org/).

## Place Search

The search box finds places through [Photon](https://photon.komoot.io/).
