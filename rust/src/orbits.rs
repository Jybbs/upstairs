//! Reads the records of a catalog into one SGP4 propagator each, built from the
//! WGS72 constants the catalog's orbits are fitted with.

use std::cell::Cell;
use std::error::Error;
use std::f64::consts::PI;
use std::fmt;

use sgp4::chrono::NaiveDateTime;
use sgp4::{
    Constants, MinutesSinceEpoch, Orbit, WGS72, iau_epoch_to_sidereal_time,
    julian_years_since_j2000,
};
use wasm_bindgen::prelude::*;

/// The propagator of every record in a catalog, in its order, holding `None`
/// for a record SGP4 cannot start from.
#[wasm_bindgen]
#[derive(Default)]
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

/// A segment whose epochs and elements hold different numbers of records.
#[derive(Debug)]
pub struct Uneven {
    elements: usize,
    epochs: usize,
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

/// The elements of a record in the order a segment holds them, after its epoch.
pub const ELEMENTS: [&str; 7] = [
    "MEAN_MOTION",
    "ECCENTRICITY",
    "INCLINATION",
    "RA_OF_ASC_NODE",
    "ARG_OF_PERICENTER",
    "MEAN_ANOMALY",
    "BSTAR",
];
/// The height in kilometers above the surface below which a perigee is
/// followed through each revolution, and the most the perigee is taken to fall
/// in one revolution above it.
const MARGIN: f64 = 100.0;
/// The minutes a decay is found to.
const PRECISION: f64 = 1e-4;
/// The samples a revolution is followed at where its perigee lies within
/// `MARGIN` of the surface.
const SAMPLES: f64 = 100.0;

#[wasm_bindgen]
impl Orbits {
    /// Starts with no records.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Orbits {
        Self::default()
    }

    /// Appends the records of one segment, given as each record's epoch beside
    /// the values of every record's `ELEMENTS` in turn, throwing where the two
    /// hold different numbers of records.
    pub fn extend(&mut self, epochs: Vec<String>, elements: &[f64]) -> Result<(), JsError> {
        Ok(self.append(&epochs, elements)?)
    }

    /// The number of records, a failed one included.
    #[wasm_bindgen(getter)]
    pub fn size(&self) -> usize {
        self.propagators.len()
    }
}

impl Orbits {
    /// Appends the records of one segment, as `extend` does, returning the
    /// mismatch where the epochs and the elements hold different numbers of
    /// records.
    pub fn append(&mut self, epochs: &[impl AsRef<str>], elements: &[f64]) -> Result<(), Uneven> {
        let (rows, rest) = elements.as_chunks();
        if !rest.is_empty() || rows.len() != epochs.len() {
            return Err(Uneven {
                elements: elements.len(),
                epochs: epochs.len(),
            });
        }
        let read = epochs.iter().zip(rows);
        self.propagators
            .extend(read.map(|(epoch, row)| Propagator::read(epoch.as_ref(), *row)));
        Ok(())
    }

    /// Returns the propagator of the record at `row`, or `None` where SGP4 cannot
    /// start from it.
    pub(crate) fn get(&self, row: usize) -> Option<&Propagator> {
        self.propagators.get(row)?.as_ref()
    }
}

impl Propagator {
    /// Builds a propagator from a record's epoch and its `ELEMENTS`, returning
    /// `None` where the epoch does not parse, an element is not finite, or SGP4
    /// rejects the elements.
    pub fn read(epoch: &str, elements: [f64; ELEMENTS.len()]) -> Option<Self> {
        if !elements.iter().all(|element| element.is_finite()) {
            return None;
        }
        let [
            motion,
            eccentricity,
            inclination,
            node,
            pericenter,
            anomaly,
            bstar,
        ] = elements;
        let epoch: NaiveDateTime = epoch.parse().ok()?;
        let orbit = Orbit::from_kozai_elements(
            &WGS72,
            inclination.to_radians(),
            node.to_radians(),
            eccentricity,
            pericenter.to_radians(),
            anomaly.to_radians(),
            motion * PI / 720.0,
        )
        .ok()?;
        let constants = Constants::new(
            WGS72,
            iau_epoch_to_sidereal_time,
            julian_years_since_j2000(&epoch),
            bstar,
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

impl fmt::Display for Uneven {
    fn fmt(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        write!(
            formatter,
            "The segment holds {} epochs beside {} elements",
            self.epochs, self.elements
        )
    }
}

impl Error for Uneven {}
