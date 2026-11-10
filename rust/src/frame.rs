//! Moves a position between the frames an orbit and a spot are read in, through
//! the Earth's rotation at each moment and the WGS84 ellipsoid a spot stands on.

use std::f64::consts::PI;

use sgp4::chrono::DateTime;
use sgp4::{iau_epoch_to_sidereal_time, julian_years_since_j2000};

/// The equatorial radius of the WGS84 ellipsoid, in kilometers.
const AXIS: f64 = 6378.137;
/// The polar radius of the WGS84 ellipsoid, in kilometers.
const POLAR: f64 = 6356.7523142;
/// The square of the ellipsoid's eccentricity.
const ECCENTRICITY: f64 = 1.0 - POLAR * POLAR / (AXIS * AXIS);
/// The change in latitude, in radians, below which a latitude round stops.
const SETTLED: f64 = 1e-12;
/// The most latitude rounds a point takes.
const ROUNDS: usize = 8;

/// The direction and distance of a satellite from a spot, in degrees and kilometers.
#[derive(Clone, Copy, Debug)]
pub struct Look {
    pub azimuth: f64,
    pub elevation: f64,
    pub range: f64,
}

/// One sample's time and the Earth's rotation at that time, read by every
/// satellite placed at it.
#[derive(Clone, Copy, Debug)]
pub struct Moment {
    pub(crate) time: f64,
    cos: f64,
    sin: f64,
}

/// The place below a satellite on the WGS84 ellipsoid, in degrees and kilometers.
#[derive(Clone, Copy, Debug)]
pub struct Point {
    pub height: f64,
    pub latitude: f64,
    pub longitude: f64,
}

/// A spot on the ellipsoid, holding its Earth-fixed position and the sines and
/// cosines its look angles read.
#[derive(Clone, Copy, Debug)]
pub struct Site {
    position: [f64; 3],
    cos_latitude: f64,
    cos_longitude: f64,
    sin_latitude: f64,
    sin_longitude: f64,
}

impl Moment {
    /// Reads the Greenwich sidereal time at a Unix time in milliseconds.
    pub fn at(time: f64) -> Self {
        let moment = DateTime::from_timestamp_millis(time as i64).expect("a time chrono can hold");
        let years = julian_years_since_j2000(&moment.naive_utc());
        let (sin, cos) = iau_epoch_to_sidereal_time(years).sin_cos();
        Self { time, cos, sin }
    }

    /// Builds the table of moments a window samples, starting at `start` and
    /// spaced `step` seconds apart.
    pub(crate) fn table(start: f64, samples: usize, step: f64) -> Vec<Self> {
        (0..samples)
            .map(|sample| Self::at(start + sample as f64 * step * 1000.0))
            .collect()
    }

    /// Turns a position in the true equator, mean equinox frame SGP4 returns into
    /// Earth-fixed kilometers.
    pub fn fixed(&self, [x, y, z]: [f64; 3]) -> [f64; 3] {
        [x * self.cos + y * self.sin, y * self.cos - x * self.sin, z]
    }
}

impl Point {
    /// Reads the point below an Earth-fixed position, repeating the latitude round
    /// until the latitude changes by less than `SETTLED`.
    pub fn below([x, y, z]: [f64; 3]) -> Self {
        let across = x.hypot(y);
        let mut latitude = z.atan2(across);
        let mut normal = AXIS;
        for _ in 0..ROUNDS {
            let sin = latitude.sin();
            normal = radius(sin);
            let next = (z + normal * ECCENTRICITY * sin).atan2(across);
            let settled = (next - latitude).abs() < SETTLED;
            latitude = next;
            if settled {
                break;
            }
        }
        Self {
            height: across / latitude.cos() - normal,
            latitude: latitude.to_degrees(),
            longitude: y.atan2(x).to_degrees(),
        }
    }
}

impl Site {
    /// Places a spot given in degrees on the surface of the ellipsoid.
    pub fn new(latitude: f64, longitude: f64) -> Self {
        let (sin_latitude, cos_latitude) = latitude.to_radians().sin_cos();
        let (sin_longitude, cos_longitude) = longitude.to_radians().sin_cos();
        let normal = radius(sin_latitude);
        Self {
            position: [
                normal * cos_latitude * cos_longitude,
                normal * cos_latitude * sin_longitude,
                normal * (1.0 - ECCENTRICITY) * sin_latitude,
            ],
            cos_latitude,
            cos_longitude,
            sin_latitude,
            sin_longitude,
        }
    }

    /// Returns how far an Earth-fixed position sits above the spot's horizon
    /// plane, in kilometers, which is positive exactly where its elevation is.
    pub(crate) fn above(&self, fixed: [f64; 3]) -> f64 {
        self.toward(fixed)[2]
    }

    /// Returns the look angles from the spot to an Earth-fixed position.
    pub fn look(&self, fixed: [f64; 3]) -> Look {
        let [east, south, up] = self.toward(fixed);
        let range = (east * east + south * south + up * up).sqrt();
        Look {
            azimuth: ((-east).atan2(south) + PI).to_degrees(),
            elevation: (up / range).asin().to_degrees(),
            range,
        }
    }

    /// Returns the offset from the spot to an Earth-fixed position along its east,
    /// south, and up directions.
    fn toward(&self, fixed: [f64; 3]) -> [f64; 3] {
        let [x, y, z]: [f64; 3] = std::array::from_fn(|axis| fixed[axis] - self.position[axis]);
        let flat = self.cos_longitude * x + self.sin_longitude * y;
        [
            self.cos_longitude * y - self.sin_longitude * x,
            self.sin_latitude * flat - self.cos_latitude * z,
            self.cos_latitude * flat + self.sin_latitude * z,
        ]
    }
}

/// Returns the ellipsoid's radius of curvature in the prime vertical at a
/// latitude given by its sine, in kilometers.
fn radius(sin_latitude: f64) -> f64 {
    AXIS / (1.0 - ECCENTRICITY * sin_latitude * sin_latitude).sqrt()
}
