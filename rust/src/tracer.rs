//! Traces satellites through a window over one spot, writing each one's track
//! and reading every pass it makes from that track, each pass's highest point
//! found between the samples beside it.

use wasm_bindgen::prelude::*;

use crate::frame::{Look, Moment, Point, Site};
use crate::orbits::{Orbits, Propagator};

/// The values a track stores per sample, meaning latitude, longitude, and
/// elevation, in degrees.
pub const TRACK_WIDTH: usize = 3;
/// The share of a bracket each golden-section round keeps.
const GOLDEN: f64 = 0.618_033_988_749_895;
/// The milliseconds a bracket around a pass's highest point closes to, whose
/// middle then lies within 5 milliseconds of the peak, over which a satellite
/// 225 kilometers up or higher climbs less than a hundredth of a degree even
/// at the zenith.
const SETTLED: f64 = 10.0;
/// The degrees a satellite moves across the samples beside its peak, below which
/// it reads as holding its place and takes no heading.
const STATIONARY: f64 = 0.05;

/// The look from the spot and the point below a satellite at one sample, or
/// `None` where its propagator fails there.
type Seen = Option<(Look, Point)>;

/// The elevation and azimuth the spot sees of one satellite at every sample of
/// a window, in degrees, NaN where its propagator fails.
#[wasm_bindgen(getter_with_clone)]
pub struct Looks {
    pub azimuths: Vec<f64>,
    pub elevations: Vec<f64>,
}

/// The tracks of the satellites in a batch that rise over the spot, one after
/// another, beside every pass they make and, for each pass, the index in
/// `track` where its satellite's samples begin.
#[wasm_bindgen(getter_with_clone)]
pub struct Trace {
    pub offsets: Vec<u32>,
    pub passes: Vec<Traced>,
    pub track: Vec<f32>,
}

/// One pass of a satellite over the spot within the window, with its times in
/// seconds from the start of the window and its angles in degrees.
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

    /// Returns what the spot sees of the satellite in `row` at every sample,
    /// NaN throughout where the row holds no propagator.
    pub fn looks(&self, orbits: &Orbits, row: u32) -> Looks {
        let propagator = orbits.get(row as usize);
        let (elevations, azimuths) = self
            .moments
            .iter()
            .map(|moment| {
                propagator
                    .and_then(|propagator| self.look(propagator, moment))
                    .map_or((f64::NAN, f64::NAN), |(look, _)| {
                        (look.elevation, look.azimuth)
                    })
            })
            .unzip();
        Looks {
            azimuths,
            elevations,
        }
    }

    /// Traces the satellites in `rows`, keeping the track of each one that
    /// rises at a traced sample beside every pass it makes.
    pub fn trace(&self, orbits: &Orbits, rows: &[u32]) -> Trace {
        let mut seen = vec![None; self.moments.len()];
        let mut trace = Trace {
            offsets: Vec::new(),
            passes: Vec::new(),
            track: Vec::with_capacity(rows.len() * self.moments.len() * TRACK_WIDTH),
        };
        for &row in rows {
            let Some(propagator) = orbits.get(row as usize) else {
                continue;
            };
            let first = trace.track.len();
            self.sample(propagator, &mut seen, &mut trace.track);
            trace.passes.extend(self.passes(row, propagator, &seen));
            if trace.passes.len() == trace.offsets.len() {
                trace.track.truncate(first);
            } else {
                trace.offsets.resize(trace.passes.len(), first as u32);
            }
        }
        trace
    }
}

impl Tracer {
    /// Returns the samples on either side of `at`, each held inside the window.
    fn beside(&self, at: usize) -> (usize, usize) {
        (at.saturating_sub(1), (at + 1).min(self.moments.len() - 1))
    }

    /// Returns the look from the spot and the point below a satellite at
    /// `moment`, or `None` where its propagator fails there.
    fn look(&self, propagator: &Propagator, moment: &Moment) -> Seen {
        let fixed = moment.fixed(propagator.at(moment.time)?);
        Some((self.site.look(fixed), Point::below(fixed)))
    }

    /// Builds one pass from the samples `rise` through `set`, every one of
    /// which stands above the horizon.
    fn pass(
        &self,
        row: u32,
        propagator: &Propagator,
        seen: &[Seen],
        rise: usize,
        set: usize,
    ) -> Traced {
        let at = (rise..=set)
            .max_by(|&a, &b| elevation(seen[a]).total_cmp(&elevation(seen[b])))
            .unwrap_or(rise);
        let point = |sample: usize| seen[sample].map(|(_, point)| point);
        let (before, after) = self.beside(at);
        let (from, to) = (point(before), point(after));
        let heading = from.zip(to).and_then(|(from, to)| {
            let moved = (to.latitude - from.latitude)
                .hypot((to.longitude - from.longitude + 540.0).rem_euclid(360.0) - 180.0);
            (moved >= STATIONARY).then(|| bearing(from, to))
        });
        let (time, summit) = self.summit(propagator, at, seen[at]);
        let (look, below) = summit.expect("a pass's highest sample places the satellite");
        let azimuth = |sample: usize| seen[sample].map_or(f64::NAN, |(look, _)| look.azimuth);
        Traced {
            row,
            earlier: rise == 0,
            heading,
            height: below.height,
            later: set == self.moments.len() - 1,
            peak: look.elevation,
            peak_at: (time - self.moments[0].time) / 1000.0,
            range: look.range,
            rise_at: rise as f64 * self.step,
            rise_az: azimuth(rise),
            set_at: set as f64 * self.step,
            set_az: azimuth(set),
        }
    }

    /// Returns every pass of one satellite, meaning each run of consecutive
    /// samples standing above the horizon.
    fn passes<'a>(
        &'a self,
        row: u32,
        propagator: &'a Propagator,
        seen: &'a [Seen],
    ) -> impl Iterator<Item = Traced> + 'a {
        let mut start = 0;
        seen.chunk_by(|a, b| up(*a) == up(*b))
            .filter_map(move |run| {
                let rise = start;
                start += run.len();
                up(run[0]).then(|| self.pass(row, propagator, seen, rise, start - 1))
            })
    }

    /// Appends one satellite's samples to `track`, writing what each one sees
    /// into `seen`.
    fn sample(&self, propagator: &Propagator, seen: &mut [Seen], track: &mut Vec<f32>) {
        for (moment, slot) in self.moments.iter().zip(seen.iter_mut()) {
            *slot = self.look(propagator, moment);
            track.extend(slot.map_or([f32::NAN; TRACK_WIDTH], |(look, point)| {
                [point.latitude, point.longitude, look.elevation].map(|value| value as f32)
            }));
        }
    }

    /// Finds the highest point between the samples beside `at` by golden-section
    /// search on elevation, closing the bracket to `SETTLED`, and returns its
    /// time in milliseconds beside what the spot sees there, keeping the sample
    /// `at` itself where the search lands lower.
    fn summit(&self, propagator: &Propagator, at: usize, seen: Seen) -> (f64, Seen) {
        let height = |time: f64| elevation(self.look(propagator, &Moment::at(time)));
        let (before, after) = self.beside(at);
        let mut low = self.moments[before].time;
        let mut high = self.moments[after].time;
        let mut left = high - GOLDEN * (high - low);
        let mut right = low + GOLDEN * (high - low);
        let (mut below, mut above) = (height(left), height(right));
        while high - low > SETTLED {
            if below < above {
                (low, left, below) = (left, right, above);
                right = low + GOLDEN * (high - low);
                above = height(right);
            } else {
                (high, right, above) = (right, left, below);
                left = high - GOLDEN * (high - low);
                below = height(left);
            }
        }
        let time = (low + high) / 2.0;
        let found = self.look(propagator, &Moment::at(time));
        if elevation(found) > elevation(seen) {
            (time, found)
        } else {
            (self.moments[at].time, seen)
        }
    }
}

/// Returns the initial bearing from one point to another on a sphere, in degrees
/// clockwise from north.
fn bearing(from: Point, to: Point) -> f64 {
    let (phi1, phi2) = (from.latitude.to_radians(), to.latitude.to_radians());
    let delta = (to.longitude - from.longitude).to_radians();
    let angle = (delta.sin() * phi2.cos())
        .atan2(phi1.cos() * phi2.sin() - phi1.sin() * phi2.cos() * delta.cos());
    angle.to_degrees().rem_euclid(360.0)
}

/// Returns the elevation a sample sees, or negative infinity where its
/// propagator fails.
fn elevation(seen: Seen) -> f64 {
    seen.map_or(f64::NEG_INFINITY, |(look, _)| look.elevation)
}

/// Reports whether a sample stands above the horizon.
fn up(seen: Seen) -> bool {
    elevation(seen) > 0.0
}
