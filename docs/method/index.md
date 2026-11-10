---
description: How the site calculates where each satellite stands.
---

# Method

Your browser calculates each position with the SGP4 orbit model through [`satellite.js`](https://github.com/shashwatak/satellite-js), reading the orbital elements [Data](/data/) names and scanning each one over the window the time strip shows.

## Accuracy

Each position comes from an orbit fitted hours or days earlier, so it can be off by kilometers and shifts once a satellite maneuvers. The positions serve curiosity rather than safety or navigation.
