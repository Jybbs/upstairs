---
description: How the site calculates where each satellite stands.
---

<script setup lang="ts">
import { AGES }                  from '../.vitepress/lib/orbit/catalog.ts'
import { STEEP }                 from '../.vitepress/lib/orbit/looks.ts'
import { GRID_STEP, TRACK_STEP } from '../.vitepress/lib/orbit/scan.ts'
import { HOME }                  from '../.vitepress/lib/state/address.ts'
</script>

# Method

Your browser calculates each position with the SGP4 orbit model[^vallado2006] through the [`sgp4`](https://docs.rs/sgp4) crate compiled to WebAssembly, reading the orbital elements [Data](/data/#orbits) names and scanning each satellite over the window the time strip shows.

## The Orbit Model

SGP4 turns a satellite's orbital elements into its position at any moment, in a frame fixed to the stars rather than to the ground. The site turns that position into one fixed to the Earth by rotating it through the Greenwich sidereal time $\theta$ at that moment, which the `sgp4` crate reads from the IAU expression:

$$
\begin{pmatrix} x' \\ y' \\ z' \end{pmatrix} =
\begin{pmatrix} \cos\theta & \sin\theta & 0 \\ -\sin\theta & \cos\theta & 0 \\ 0 & 0 & 1 \end{pmatrix}
\begin{pmatrix} x \\ y \\ z \end{pmatrix}
$$

The spot stands on the WGS 84 ellipsoid, and the offset from the spot to the satellite splits into its east, north, and up parts $(e, n, u)$, which give the satellite's distance $\rho$, its elevation $\varepsilon$ above the horizon, and its azimuth $A$ clockwise from north:

$$
\rho = \sqrt{e^2 + n^2 + u^2}, \qquad \varepsilon = \arcsin \frac{u}{\rho}, \qquad A = \operatorname{atan2}(e, n)
$$

The drawing follows the space station through its highest pass over {{ HOME.place }} in the day after the catalog was fetched, the sky disc sweeping its azimuth from north and the upright plane beside it raising its elevation from the horizon. Pointing at either plane moves the station along the pass.

<LookAngles />

## Passes

The scan first places every satellite every {{ GRID_STEP / 60 }} minutes through the window, once for the whole window rather than once per spot, and keeps each satellite standing above the horizon at one of those moments, so a satellite whose every pass rises and sets between two of them goes unlisted. It then samples each satellite it kept every {{ TRACK_STEP }} seconds, and a pass runs across each stretch of samples where $\varepsilon > 0$, so a satellite rising twice in the window makes two passes.

The highest point of a pass lies between the samples on either side of the highest sample, and a golden-section search narrows that bracket of width $w_0$ by the golden ratio $\varphi$ each round:

$$
w_k = w_0 \, \varphi^{-k}, \qquad \varphi = \frac{1 + \sqrt 5}{2}
$$

The search stops once the bracket is at most 10 milliseconds wide, which puts the peak's elevation within a hundredth of a degree of the highest elevation the orbit model gives for a satellite 225 kilometers up or higher.

The drawing samples the space station's pass over {{ HOME.place }} that climbs past {{ STEEP }}° and whose highest sample falls farthest below its peak. Dragging the knob along the scale spreads the samples, and the band between the highest sample and the peak widens with them, which is the gap the search closes.

<PeakSearch />

## Accuracy

Each position comes from an orbit fitted hours or days earlier and shifts once a satellite maneuvers. Kelso (2007)[^kelso2007] compared SGP4 against the precise orbits of the GPS satellites and found each one kilometers from where it was, mostly along its track. The error differed from one satellite to the next, was not smallest at the time the orbit was fitted, and grew as the prediction ran on from that time. The map marks that error with a dotted ring around the chosen satellite, as [The Map](/guide/#the-map) in the Guide sets out, and draws no satellite once the catalog was fetched more than {{ AGES.limit }} days before the time the strip shows.

The drawing counts the element sets in the catalog at each age on an axis that stretches out the first day, shading each band of ages and topping it with the ring the map draws around a satellite of that age. Pointing at a column reads its ages and its share of the catalog.

<OrbitAges />

The positions serve curiosity rather than safety or navigation.
