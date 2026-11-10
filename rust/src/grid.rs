//! Places every satellite at each sample of a coarse window once, so a scan for
//! any spot reads which satellites rise from the stored positions.

use wasm_bindgen::prelude::*;

use crate::frame::{Moment, Site};
use crate::orbits::Orbits;

/// The Earth-fixed position of every satellite at every sample of a window, in
/// kilometers, NaN where its propagator fails.
#[wasm_bindgen]
pub struct Grid {
    moments: Vec<Moment>,
    positions: Vec<f32>,
}

/// What a grid shows above one spot, meaning how many satellites stand above
/// the horizon at each sample and the rows of those that rise at any sample.
#[wasm_bindgen(getter_with_clone)]
pub struct Sighting {
    pub counts: Vec<u16>,
    pub risen: Vec<u32>,
}

#[wasm_bindgen]
impl Grid {
    /// Builds an empty grid for every record of `orbits` over the window starting
    /// at `start`, a Unix time in milliseconds, with samples `step` seconds apart.
    #[wasm_bindgen(constructor)]
    pub fn new(orbits: &Orbits, start: f64, samples: usize, step: f64) -> Grid {
        Grid {
            moments: Moment::table(start, samples, step),
            positions: vec![f32::NAN; orbits.size() * samples * 3],
        }
    }

    /// Places the satellites in rows `from` up to `to` at every sample, stopping
    /// at the last row the grid was built for even where `orbits` has grown since.
    pub fn fill(&mut self, orbits: &Orbits, from: usize, to: usize) {
        let width = self.moments.len() * 3;
        let rows = from..to.min(self.positions.len() / width);
        let slots = self.positions[rows.start * width..rows.end * width].chunks_exact_mut(width);
        for (row, slot) in rows.zip(slots) {
            let Some(propagator) = orbits.get(row) else {
                continue;
            };
            for (moment, at) in self.moments.iter().zip(slot.as_chunks_mut::<3>().0) {
                if let Some(position) = propagator.at(moment.time) {
                    *at = moment.fixed(position).map(|axis| axis as f32);
                }
            }
        }
    }

    /// Reads the grid against a spot given in degrees.
    pub fn sight(&self, latitude: f64, longitude: f64) -> Sighting {
        let site = Site::new(latitude, longitude);
        let samples = self.moments.len();
        let mut counts = vec![0u16; samples];
        let mut risen = Vec::new();
        for (row, positions) in self.positions.chunks_exact(samples * 3).enumerate() {
            let mut rises = false;
            for (count, at) in counts.iter_mut().zip(positions.as_chunks::<3>().0) {
                if site.above(at.map(f64::from)) > 0.0 {
                    *count += 1;
                    rises = true;
                }
            }
            if rises {
                risen.push(row as u32);
            }
        }
        Sighting { counts, risen }
    }
}
