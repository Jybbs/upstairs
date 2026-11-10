//! Reads a catalog file into one SGP4 propagator per record, built from the
//! WGS72 constants the catalog's orbits are fitted with.

use std::cell::Cell;
use std::collections::HashMap;
use std::f64::consts::PI;

use serde::Deserialize;
use serde_json::Value;
use sgp4::chrono::NaiveDateTime;
use sgp4::{
    Constants, MinutesSinceEpoch, Orbit, WGS72, iau_epoch_to_sidereal_time,
    julian_years_since_j2000,
};
use wasm_bindgen::prelude::*;

/// The shape of a catalog file, one row per record holding its values in the
/// order `fields` names them.
#[derive(Deserialize)]
struct Catalog {
    fields: Vec<String>,
    rows: Vec<Vec<Value>>,
}

/// The propagator of every record in a catalog, in its order, holding `None`
/// for a record SGP4 cannot start from.
#[wasm_bindgen]
pub struct Orbits {
    propagators: Vec<Option<Propagator>>,
}

/// One record's SGP4 constants beside its epoch as a Unix time in milliseconds,
/// its period in minutes, and how far past its epoch it has been followed for
/// decay.
pub struct Propagator {
    constants: Constants,
    decay: Cell<Decay>,
    epoch: f64,
    period: f64,
}

/// How far past its epoch a record's orbit has been followed, in minutes.
#[derive(Clone, Copy)]
enum Decay {
    /// SGP4 first reports the record decayed at this many minutes.
    At(f64),
    /// SGP4 places the record above the surface through this many minutes, at
    /// the end of which its perigee lies this many kilometers from the center.
    Clear(f64, f64),
}

/// The height in kilometers above the surface below which a perigee is
/// followed through each revolution, and the most the perigee is taken to fall
/// in one revolution above it.
const MARGIN: f64 = 100.0;
/// The minutes a decay is found to.
const PRECISION: f64 = 1e-4;
/// The samples a revolution is followed at where its perigee lies within
/// `MARGIN` of the surface.
const SAMPLES: f64 = 100.0;

impl Catalog {
    /// Builds the propagator of each row, reading every field by its name.
    fn propagators(&self) -> Vec<Option<Propagator>> {
        let columns: HashMap<&str, usize> = self
            .fields
            .iter()
            .enumerate()
            .map(|(column, field)| (field.as_str(), column))
            .collect();
        self.rows
            .iter()
            .map(|row| Propagator::read(|field| row.get(*columns.get(field)?)))
            .collect()
    }
}

#[wasm_bindgen]
impl Orbits {
    /// Reads the catalog file's text, throwing where it is not a catalog.
    #[wasm_bindgen(constructor)]
    pub fn new(text: &str) -> Result<Orbits, JsError> {
        Ok(Self::read(text)?)
    }

    /// The number of records, a failed one included.
    #[wasm_bindgen(getter)]
    pub fn size(&self) -> usize {
        self.propagators.len()
    }
}

impl Orbits {
    /// Reads the catalog file's text, returning the parse error where it is not
    /// a catalog.
    pub fn read(text: &str) -> serde_json::Result<Self> {
        let catalog: Catalog = serde_json::from_str(text)?;
        Ok(Self {
            propagators: catalog.propagators(),
        })
    }

    /// Returns the propagator of the record at `row`, or `None` where SGP4 cannot
    /// start from it.
    pub(crate) fn get(&self, row: usize) -> Option<&Propagator> {
        self.propagators.get(row)?.as_ref()
    }
}

impl Propagator {
    /// Builds a propagator from the fields of one record, returning `None` where
    /// a field is missing or SGP4 rejects the elements.
    pub fn read<'a>(field: impl Fn(&str) -> Option<&'a Value>) -> Option<Self> {
        let number = |name: &str| field(name)?.as_f64();
        let angle = |name: &str| number(name).map(f64::to_radians);
        let epoch: NaiveDateTime = field("EPOCH")?.as_str()?.parse().ok()?;
        let motion = number("MEAN_MOTION")?;
        let orbit = Orbit::from_kozai_elements(
            &WGS72,
            angle("INCLINATION")?,
            angle("RA_OF_ASC_NODE")?,
            number("ECCENTRICITY")?,
            angle("ARG_OF_PERICENTER")?,
            angle("MEAN_ANOMALY")?,
            motion * PI / 720.0,
        )
        .ok()?;
        let constants = Constants::new(
            WGS72,
            iau_epoch_to_sidereal_time,
            julian_years_since_j2000(&epoch),
            number("BSTAR")?,
            orbit,
        )
        .ok()?;
        Some(Self {
            constants,
            decay: Cell::new(Decay::Clear(0.0, 0.0)),
            epoch: epoch.and_utc().timestamp_micros() as f64 / 1000.0,
            period: 1440.0 / motion,
        })
    }

    /// Returns the satellite's position at a Unix time in milliseconds, in
    /// kilometers in the frame SGP4 returns, or `None` where SGP4 fails, the
    /// orbit is below the Earth's surface, or SGP4 reported its decay earlier.
    pub fn at(&self, time: f64) -> Option<[f64; 3]> {
        let minutes = (time - self.epoch) / 60_000.0;
        if self.decays_by(minutes) {
            return None;
        }
        self.position(minutes)
    }

    /// Finds the first minute within `(from, to]` where SGP4 fails or places the
    /// satellite below the surface, sampling the span `SAMPLES` times a
    /// revolution and then halving the gap around the first such sample down to
    /// `PRECISION`.
    fn crossing(&self, from: f64, to: f64) -> Option<f64> {
        let step = self.period / SAMPLES;
        let at = |sample: u32| (from + sample as f64 * step).min(to);
        let first = (1..=((to - from) / step).ceil() as u32)
            .find(|&sample| self.position(at(sample)).is_none())?;
        let (mut before, mut after) = (at(first - 1), at(first));
        while after - before > PRECISION {
            let middle = (before + after) / 2.0;
            match self.position(middle) {
                Some(_) => before = middle,
                None => after = middle,
            }
        }
        Some(after)
    }

    /// Reports whether SGP4 has reported the record decayed by `minutes` past
    /// its epoch, following the orbit forward from where the last call stopped.
    fn decays_by(&self, minutes: f64) -> bool {
        loop {
            match self.decay.get() {
                Decay::At(onset) => return minutes >= onset,
                Decay::Clear(through, _) if through >= minutes => return false,
                Decay::Clear(through, perigee) => self.decay.set(self.follow(through, perigee)),
            }
        }
    }

    /// Follows the orbit past `through` by one revolution for each `MARGIN` its
    /// `perigee` there lies above the surface past the first, sampling the span
    /// for a decay where the perigee at its end lies within `MARGIN` of the
    /// surface or SGP4 fails there.
    fn follow(&self, through: f64, perigee: f64) -> Decay {
        let revolutions = ((perigee - WGS72.ae) / MARGIN - 1.0).max(1.0);
        let next = through + revolutions * self.period;
        match self.perigee(next) {
            Some(perigee) if perigee >= WGS72.ae + MARGIN => Decay::Clear(next, perigee),
            low => self
                .crossing(through, next)
                .map_or(Decay::Clear(next, low.unwrap_or(0.0)), Decay::At),
        }
    }

    /// Returns the perigee radius in kilometers of the orbit through the
    /// position and velocity SGP4 gives `minutes` past the epoch, read from that
    /// orbit's energy and squared angular momentum, or `None` where SGP4 fails
    /// or the orbit is not bound to the Earth.
    fn perigee(&self, minutes: f64) -> Option<f64> {
        let prediction = self.constants.propagate(MinutesSinceEpoch(minutes)).ok()?;
        let ([x, y, z], [u, v, w]) = (prediction.position, prediction.velocity);
        let gravity = WGS72.ke.powi(2) * WGS72.ae.powi(3) / 3600.0;
        let momentum = (y * w - z * v).powi(2) + (z * u - x * w).powi(2) + (x * v - y * u).powi(2);
        let energy = (u * u + v * v + w * w) / 2.0 - gravity / (x * x + y * y + z * z).sqrt();
        let eccentricity = (1.0 + 2.0 * energy * momentum / gravity.powi(2))
            .max(0.0)
            .sqrt();
        (energy < 0.0).then_some(momentum / gravity / (1.0 + eccentricity))
    }

    /// Returns the position SGP4 gives `minutes` past the epoch, or `None` where
    /// SGP4 fails or the position is below the Earth's surface.
    fn position(&self, minutes: f64) -> Option<[f64; 3]> {
        let position = self
            .constants
            .propagate(MinutesSinceEpoch(minutes))
            .ok()?
            .position;
        let square = position.iter().map(|axis| axis * axis).sum::<f64>();
        (square >= WGS72.ae * WGS72.ae).then_some(position)
    }
}
