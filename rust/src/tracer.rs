//! Traces satellites through a window over one spot, writing each one's track
//! and reading its highest pass from that track.

use wasm_bindgen::prelude::*;

use crate::frame::{Look, Moment, Point, Site};
use crate::orbits::{Orbits, Propagator};

/// The values a track stores per sample, meaning latitude, longitude, and
/// elevation, in degrees.
pub const TRACK_WIDTH: usize = 3;
/// The degrees a satellite moves across the samples beside its peak, below which
/// it reads as holding its place and takes no heading.
const STATIONARY: f64 = 0.05;

/// The tracks of the satellites a batch traced that rise over the spot, one
/// after another in the order of `passes`.
#[wasm_bindgen(getter_with_clone)]
pub struct Trace {
    pub passes: Vec<Traced>,
    pub track: Vec<f32>,
}

/// One satellite's highest pass over the spot within the window, with its
/// times in seconds from the start of the window and its angles in degrees.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub struct Traced {
    pub row: u32,
    pub earlier: bool,
    pub heading: Option<f64>,
    pub height: f64,
    pub later: bool,
    pub peak: f64,
    #[wasm_bindgen(js_name = peakAt)]
    pub peak_at: f64,
    pub range: f64,
    #[wasm_bindgen(js_name = riseAt)]
    pub rise_at: f64,
    #[wasm_bindgen(js_name = riseAz)]
    pub rise_az: f64,
    #[wasm_bindgen(js_name = setAt)]
    pub set_at: f64,
    #[wasm_bindgen(js_name = setAz)]
    pub set_az: f64,
}

/// The moments of a window and the spot a scan traces satellites over, shared
/// by every batch of the scan.
#[wasm_bindgen]
pub struct Tracer {
    moments: Vec<Moment>,
    site: Site,
    step: f64,
}

#[wasm_bindgen]
impl Tracer {
    /// Starts tracing over a spot given in degrees, through the window starting
    /// at `start`, a Unix time in milliseconds, with samples `step` seconds apart.
    #[wasm_bindgen(constructor)]
    pub fn new(latitude: f64, longitude: f64, start: f64, samples: usize, step: f64) -> Tracer {
        Tracer {
            moments: Moment::table(start, samples, step),
            site: Site::new(latitude, longitude),
            step,
        }
    }

    /// Traces the satellites in `rows`, keeping the track and the pass of each
    /// one that rises at a traced sample.
    pub fn trace(&self, orbits: &Orbits, rows: &[u32]) -> Trace {
        let mut looks = vec![None; self.moments.len()];
        let mut passes = Vec::new();
        let mut track = Vec::with_capacity(rows.len() * self.moments.len() * TRACK_WIDTH);
        for &row in rows {
            let first = track.len();
            match self.pass(row, orbits.get(row as usize), &mut looks, &mut track) {
                Some(pass) => passes.push(pass),
                None => track.truncate(first),
            }
        }
        Trace { passes, track }
    }
}

impl Tracer {
    /// Appends one satellite's samples to `track`, writing the look and height of
    /// each into `looks`, and returns the highest elevation beside the sample it
    /// was reached at.
    fn sample(
        &self,
        propagator: Option<&Propagator>,
        looks: &mut [Option<(Look, f64)>],
        track: &mut Vec<f32>,
    ) -> (f64, usize) {
        let mut peak = (f64::NEG_INFINITY, 0);
        for (sample, (moment, seen)) in self.moments.iter().zip(looks.iter_mut()).enumerate() {
            *seen = propagator
                .and_then(|propagator| propagator.at(moment.time))
                .map(|position| {
                    let fixed = moment.fixed(position);
                    let (look, point) = (self.site.look(fixed), Point::below(fixed));
                    track.extend(
                        [point.latitude, point.longitude, look.elevation].map(|value| value as f32),
                    );
                    if look.elevation > peak.0 {
                        peak = (look.elevation, sample);
                    }
                    (look, point.height)
                });
            if seen.is_none() {
                track.extend([f32::NAN; TRACK_WIDTH]);
            }
        }
        peak
    }

    /// Appends one satellite's samples to `track` and returns its highest pass,
    /// or `None` where it never rises at a traced sample.
    fn pass(
        &self,
        row: u32,
        propagator: Option<&Propagator>,
        looks: &mut [Option<(Look, f64)>],
        track: &mut Vec<f32>,
    ) -> Option<Traced> {
        let first = track.len();
        let (elevation, at) = self.sample(propagator, looks, track);
        if elevation <= 0.0 {
            return None;
        }

        let samples = &track[first..];
        let value = |sample: usize, field: usize| f64::from(samples[sample * TRACK_WIDTH + field]);
        let up = |sample: usize| value(sample, 2) > 0.0;
        let last = self.moments.len() - 1;
        let edge =
            |side: &mut dyn Iterator<Item = usize>| side.take_while(|&sample| up(sample)).last();
        let rise = edge(&mut (0..at).rev()).unwrap_or(at);
        let set = edge(&mut (at + 1..=last)).unwrap_or(at);

        let (before, after) = (at.saturating_sub(1), (at + 1).min(last));
        let from = (value(before, 0), value(before, 1));
        let to = (value(after, 0), value(after, 1));
        let moved = (to.0 - from.0).hypot((to.1 - from.1 + 540.0).rem_euclid(360.0) - 180.0);
        let (look, height) = looks[at]?;

        Some(Traced {
            row,
            earlier: rise == 0,
            heading: (moved >= STATIONARY).then(|| bearing(from, to)),
            height,
            later: set == last,
            peak: elevation,
            peak_at: at as f64 * self.step,
            range: look.range,
            rise_at: rise as f64 * self.step,
            rise_az: looks[rise]?.0.azimuth,
            set_at: set as f64 * self.step,
            set_az: looks[set]?.0.azimuth,
        })
    }
}

/// Returns the initial bearing from one point to another on a sphere, in degrees
/// clockwise from north.
fn bearing(
    (from_latitude, from_longitude): (f64, f64),
    (to_latitude, to_longitude): (f64, f64),
) -> f64 {
    let (phi1, phi2) = (from_latitude.to_radians(), to_latitude.to_radians());
    let delta = (to_longitude - from_longitude).to_radians();
    let angle = (delta.sin() * phi2.cos())
        .atan2(phi1.cos() * phi2.sin() - phi1.sin() * phi2.cos() * delta.cos());
    angle.to_degrees().rem_euclid(360.0)
}
