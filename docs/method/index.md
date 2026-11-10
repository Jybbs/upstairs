---
description: How the site calculates where each satellite stands.
---

# Method

Your browser calculates each position with the SGP4 orbit model through the [`sgp4`](https://docs.rs/sgp4) crate compiled to WebAssembly, reading the orbital elements [Data](/data/) names and scanning each one over the window the time strip shows.

## Passes

The scan samples each satellite every 30 seconds through the window, and a pass runs across each stretch of samples standing above the horizon, so a satellite rising twice in the window makes two passes. The highest point of a pass is then found between the samples on either side of the highest sample, narrowing that minute to 10 milliseconds, which puts the peak's elevation within a hundredth of a degree of its true value.

## Accuracy

Each position comes from an orbit fitted hours or days earlier and shifts once a satellite maneuvers. Compared against precise GPS orbits, SGP4 places a satellite a few kilometers along its track from where it is near the time its orbit was fitted, and the gap grows with each day the prediction runs from that time, per [Kelso (2007)](https://celestrak.org/publications/AAS/07-127/). Once the map is zoomed in far enough for 5 kilometers to span 10 pixels, the readout says so. The positions serve curiosity rather than safety or navigation.
