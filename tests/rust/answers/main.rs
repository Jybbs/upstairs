//! Holds the crate to the positions, the grid, and the passes `satellite.js`
//! computed for the records under `tests/site/fixtures/` over each spot of the
//! answers, within 10 meters and a thousandth of a degree, which a position's
//! azimuth divides by the cosine of its elevation. Those answers take each
//! epoch cut to the millisecond, which moves a low satellite by up to 8 meters,
//! so the tolerance sits above that shift. The answers place each pass's highest
//! point at a sample, so a traced peak falls within one sample of theirs, stands
//! no lower, and lies within a hundredth of a degree of a dense search.

mod frame;
mod grid;
mod orbits;
mod tracer;

use std::iter;
use std::sync::LazyLock;

use orbit::{ELEMENTS, Grid, Orbits, Propagator, Sighting, Site, Trace, Tracer};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Map, Value};
use sgp4::chrono::DateTime;

#[derive(Deserialize)]
struct Answers {
    decayed: Decayed,
    fields: Vec<String>,
    grid: Window,
    positions: Vec<Position>,
    spot: Spot,
    start: String,
    track: Window,
}

/// How many satellites stand above a spot at each sample of the grid, and the
/// catalog number of each one that rises at any sample.
#[derive(Deserialize)]
struct Count {
    counts: Vec<u16>,
    risen: Vec<u64>,
}

#[derive(Deserialize)]
struct Decayed {
    placed: Vec<Placed>,
    record: Map<String, Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Pass {
    earlier: bool,
    heading: Option<f64>,
    id: u64,
    later: bool,
    peak: f64,
    peak_at: f64,
    rise_at: f64,
    rise_az: f64,
    set_at: f64,
    set_az: f64,
}

#[derive(Deserialize)]
struct Placed {
    minutes: f64,
    placed: bool,
}

#[derive(Deserialize)]
struct Position {
    height: f64,
    id: u64,
    latitude: f64,
    longitude: f64,
    minutes: f64,
    teme: [f64; 3],
}

/// The look from a spot to a satellite at the moment of the `Position` sharing
/// its index.
#[derive(Deserialize)]
struct Seen {
    azimuth: f64,
    elevation: f64,
    range: f64,
}

#[derive(Deserialize)]
struct Skies {
    elsewhere: Vec<Sky>,
    #[serde(flatten)]
    home: Sky,
}

/// What the answers hold above one spot.
#[derive(Deserialize)]
struct Sky {
    grid: Count,
    passes: Vec<Option<Pass>>,
    positions: Vec<Seen>,
    spot: Spot,
}

#[derive(Debug, Deserialize)]
struct Spot {
    latitude: f64,
    longitude: f64,
}

impl Spot {
    fn sight(&self, grid: &Grid) -> Sighting {
        grid.sight(self.latitude, self.longitude)
    }

    fn site(&self) -> Site {
        Site::new(self.latitude, self.longitude)
    }
}

#[derive(Deserialize)]
struct Window {
    minutes: f64,
    step: f64,
    #[serde(default)]
    width: usize,
}

impl Window {
    fn samples(&self) -> usize {
        (self.minutes * 60.0 / self.step) as usize + 1
    }

    fn grid(&self, orbits: &Orbits) -> Grid {
        let mut grid = Grid::new(orbits, start(), self.samples(), self.step);
        grid.fill(orbits, 0, orbits.size());
        grid
    }

    fn tracer(&self, spot: &Spot) -> Tracer {
        Tracer::new(
            spot.latitude,
            spot.longitude,
            start(),
            self.samples(),
            self.step,
        )
    }
}

static ANSWERS: LazyLock<Answers> = LazyLock::new(|| read("answers.json"));
static RECORDS: LazyLock<Vec<Map<String, Value>>> = LazyLock::new(|| read("records.json"));
/// The sky above each spot of the answers, the first standing at `ANSWERS.spot`.
static SKIES: LazyLock<Vec<Sky>> = LazyLock::new(|| {
    let Skies { elsewhere, home } = read("answers.json");
    iter::once(home).chain(elsewhere).collect()
});
/// Every record traced over each spot of `SKIES`, in its order.
static TRACES: LazyLock<Vec<Trace>> = LazyLock::new(|| {
    let orbits = orbits(&RECORDS);
    let rows: Vec<u32> = (0..orbits.size() as u32).collect();
    let trace = |sky: &Sky| ANSWERS.track.tracer(&sky.spot).trace(&orbits, &rows);
    SKIES.iter().map(trace).collect()
});

const ANGLE: f64 = 1e-3;
const DISTANCE: f64 = 1e-2;
/// The equatorial radius of the WGS84 ellipsoid, in kilometers, turning a
/// difference in latitude or longitude into a distance on the ground.
const EARTH: f64 = 6378.137;

fn read<T: DeserializeOwned>(name: &str) -> T {
    let path = format!(
        "{}/../tests/site/fixtures/{name}",
        env!("CARGO_MANIFEST_DIR")
    );
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn start() -> f64 {
    DateTime::parse_from_rfc3339(&ANSWERS.start)
        .unwrap()
        .timestamp_millis() as f64
}

fn orbits(records: &[Map<String, Value>]) -> Orbits {
    let mut orbits = Orbits::new();
    append(&mut orbits, records);
    orbits
}

fn append(orbits: &mut Orbits, records: &[Map<String, Value>]) {
    let epochs: Vec<&str> = records.iter().map(epoch).collect();
    let elements: Vec<f64> = records.iter().flat_map(elements).collect();
    orbits.append(&epochs, &elements).unwrap();
}

fn epoch(record: &Map<String, Value>) -> &str {
    record["EPOCH"].as_str().unwrap_or_default()
}

fn elements(record: &Map<String, Value>) -> [f64; ELEMENTS.len()] {
    ELEMENTS.map(|field| record[field].as_f64().unwrap_or(f64::NAN))
}

fn id(row: u32) -> u64 {
    RECORDS[row as usize]["NORAD_CAT_ID"].as_u64().unwrap()
}

fn propagator(record: &Map<String, Value>) -> Option<Propagator> {
    Propagator::read(epoch(record), elements(record))
}

fn close(what: &str, actual: f64, expected: f64, tolerance: f64) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "{what}: {actual} is not within {tolerance} of {expected}"
    );
}

fn turned(actual: f64, expected: f64) -> f64 {
    expected + (actual - expected + 540.0).rem_euclid(360.0) - 180.0
}
