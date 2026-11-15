//! Holds the crate to the positions, the grid, and the passes `satellite.js`
//! computed for the records under `docs/.vitepress/tests/fixtures/`, within 10
//! meters and a thousandth of a degree, which a position's azimuth divides by
//! the cosine of its elevation. Those answers take each epoch cut to the
//! millisecond, which moves a low satellite by up to 8 meters, so the tolerance
//! sits above that shift. The answers place each pass's highest point at a
//! sample, so a traced peak falls within one sample of theirs, stands no lower,
//! and lies within a hundredth of a degree of a dense search.

use std::sync::LazyLock;

use orbit::{ELEMENTS, Grid, Moment, Orbits, Point, Propagator, Site, Trace, Traced, Tracer};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Map, Value};
use sgp4::chrono::DateTime;

#[derive(Deserialize)]
struct Answers {
    decayed: Decayed,
    fields: Vec<String>,
    grid: Window,
    passes: Vec<Option<Pass>>,
    positions: Vec<Position>,
    spot: Spot,
    start: String,
    track: Window,
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
    azimuth: f64,
    elevation: f64,
    height: f64,
    id: u64,
    latitude: f64,
    longitude: f64,
    minutes: f64,
    range: f64,
    teme: [f64; 3],
}

#[derive(Deserialize)]
struct Spot {
    latitude: f64,
    longitude: f64,
}

#[derive(Deserialize)]
struct Window {
    #[serde(default)]
    counts: Vec<u16>,
    minutes: f64,
    #[serde(default)]
    risen: Vec<u64>,
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

    fn tracer(&self) -> Tracer {
        Tracer::new(
            ANSWERS.spot.latitude,
            ANSWERS.spot.longitude,
            start(),
            self.samples(),
            self.step,
        )
    }
}

static ANSWERS: LazyLock<Answers> = LazyLock::new(|| read("answers.json"));
static RECORDS: LazyLock<Vec<Map<String, Value>>> = LazyLock::new(|| read("records.json"));
static TRACE: LazyLock<Trace> = LazyLock::new(|| {
    let orbits = orbits(&RECORDS);
    let rows: Vec<u32> = (0..orbits.size() as u32).collect();
    ANSWERS.track.tracer().trace(&orbits, &rows)
});

const ANGLE: f64 = 1e-3;
const DISTANCE: f64 = 1e-2;
/// The equatorial radius of the WGS84 ellipsoid, in kilometers, turning a
/// difference in latitude or longitude into a distance on the ground.
const EARTH: f64 = 6378.137;

fn read<T: DeserializeOwned>(name: &str) -> T {
    let path = format!(
        "{}/../docs/.vitepress/tests/fixtures/{name}",
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
    let epochs: Vec<&str> = records.iter().map(epoch).collect();
    let elements: Vec<f64> = records.iter().flat_map(elements).collect();
    let mut orbits = Orbits::new();
    orbits.append(&epochs, &elements).unwrap();
    orbits
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

#[test]
fn places_each_record_where_the_answers_do() {
    let site = Site::new(ANSWERS.spot.latitude, ANSWERS.spot.longitude);
    for answer in &ANSWERS.positions {
        let record = RECORDS
            .iter()
            .find(|record| record["NORAD_CAT_ID"] == answer.id);
        let time = start() + answer.minutes * 60_000.0;
        let teme = propagator(record.unwrap()).unwrap().at(time).unwrap();
        let fixed = Moment::at(time).fixed(teme);
        let (point, look) = (Point::below(fixed), site.look(fixed));
        let what = |field: &str| format!("{} at {} minutes, {field}", answer.id, answer.minutes);
        for (axis, (actual, expected)) in teme.into_iter().zip(answer.teme).enumerate() {
            close(&what(&format!("axis {axis}")), actual, expected, DISTANCE);
        }
        let near = ANGLE / answer.elevation.to_radians().cos();
        let azimuth = turned(look.azimuth, answer.azimuth);
        let longitude = turned(point.longitude, answer.longitude);
        let north = (point.latitude - answer.latitude).to_radians();
        let east = (longitude - answer.longitude).to_radians() * answer.latitude.to_radians().cos();
        close(&what("ground"), EARTH * north.hypot(east), 0.0, DISTANCE);
        close(&what("height"), point.height, answer.height, DISTANCE);
        close(&what("azimuth"), azimuth, answer.azimuth, near);
        close(&what("elevation"), look.elevation, answer.elevation, ANGLE);
        close(&what("range"), look.range, answer.range, DISTANCE);
    }
}

#[test]
fn looks_at_each_satellite_as_its_traced_passes_do() {
    let window = &ANSWERS.track;
    let orbits = orbits(&RECORDS);
    let tracer = window.tracer();
    for (index, pass) in TRACE.passes.iter().enumerate() {
        let looks = tracer.looks(&orbits, pass.row);
        let rise = (pass.rise_at / window.step) as usize;
        let set = (pass.set_at / window.step) as usize;
        let tracked = TRACE.offsets[index] as usize + rise * window.width + 2;
        let what = |field: &str| format!("{}, {field}", id(pass.row));
        assert_eq!(
            looks.elevations.len(),
            window.samples(),
            "{}",
            what("samples")
        );
        close(
            &what("rise azimuth"),
            looks.azimuths[rise],
            pass.rise_az,
            0.0,
        );
        close(&what("set azimuth"), looks.azimuths[set], pass.set_az, 0.0);
        close(
            &what("elevation"),
            looks.elevations[rise],
            f64::from(TRACE.track[tracked]),
            ANGLE,
        );
    }
}

#[test]
fn counts_the_satellites_above_the_spot() {
    let orbits = orbits(&RECORDS);
    let window = &ANSWERS.grid;
    let grid = window.grid(&orbits);
    let sighting = grid.sight(ANSWERS.spot.latitude, ANSWERS.spot.longitude);
    let risen: Vec<u64> = sighting.risen.into_iter().map(id).collect();
    assert_eq!(sighting.counts, window.counts);
    assert_eq!(risen, window.risen);
}

#[test]
fn traces_the_highest_pass_of_each_satellite_where_the_answers_do() {
    let window = &ANSWERS.track;
    let trace = &*TRACE;
    let mut traced: Vec<u64> = trace.passes.iter().map(|pass| id(pass.row)).collect();
    traced.dedup();
    let expected: Vec<&Pass> = ANSWERS.passes.iter().flatten().collect();
    assert_eq!(
        traced,
        expected.iter().map(|pass| pass.id).collect::<Vec<_>>()
    );
    for answer in expected {
        let what = |field: &str| format!("{}, {field}", answer.id);
        let traced = trace
            .passes
            .iter()
            .filter(|pass| id(pass.row) == answer.id)
            .max_by(|a, b| a.peak.total_cmp(&b.peak))
            .unwrap();
        let Traced {
            earlier,
            later,
            rise_at,
            set_at,
            ..
        } = *traced;
        assert_eq!(
            (earlier, later),
            (answer.earlier, answer.later),
            "{}",
            what("ends")
        );
        assert_eq!((rise_at, set_at), (answer.rise_at, answer.set_at));
        assert_eq!(
            traced.heading.is_some(),
            answer.heading.is_some(),
            "{}",
            what("heading")
        );
        if let (Some(heading), Some(expected)) = (traced.heading, answer.heading) {
            close(&what("heading"), turned(heading, expected), expected, ANGLE);
        }
        close(
            &what("highest moment"),
            traced.peak_at,
            answer.peak_at,
            window.step,
        );
        assert!(traced.peak >= answer.peak - ANGLE, "{}", what("peak"));
        close(
            &what("rise azimuth"),
            turned(traced.rise_az, answer.rise_az),
            answer.rise_az,
            ANGLE,
        );
        close(
            &what("set azimuth"),
            turned(traced.set_az, answer.set_az),
            answer.set_az,
            ANGLE,
        );
    }
}

#[test]
fn keeps_one_track_per_satellite_however_many_passes_it_makes() {
    let window = &ANSWERS.track;
    let trace = &*TRACE;
    let mut offsets = trace.offsets.clone();
    offsets.dedup();
    let width = window.samples() * window.width;
    assert_eq!(trace.offsets.len(), trace.passes.len());
    assert_eq!(trace.track.len(), offsets.len() * width);
    assert!(
        offsets
            .iter()
            .enumerate()
            .all(|(slot, &offset)| offset as usize == slot * width)
    );
}

#[test]
fn gives_each_rising_of_a_satellite_a_pass_of_its_own() {
    let window = &ANSWERS.track;
    let trace = &*TRACE;
    let elevation =
        |offset: u32, sample: usize| trace.track[offset as usize + sample * window.width + 2];
    let mut twice = 0;
    for (index, pass) in trace.passes.iter().enumerate() {
        let offset = trace.offsets[index];
        let (rise, set) = (
            (pass.rise_at / window.step) as usize,
            (pass.set_at / window.step) as usize,
        );
        assert!((rise..=set).all(|sample| elevation(offset, sample) > 0.0));
        if !pass.earlier {
            assert!(elevation(offset, rise - 1) <= 0.0);
        }
        if !pass.later {
            assert!(elevation(offset, set + 1) <= 0.0);
        }
        if let Some(next) = trace
            .passes
            .get(index + 1)
            .filter(|next| next.row == pass.row)
        {
            assert!(next.rise_at > pass.set_at + window.step);
            assert_eq!(trace.offsets[index + 1], offset);
            twice += 1;
        }
    }
    assert!(twice > 0, "no satellite in the answers rises twice");
}

#[test]
fn finds_each_highest_point_within_a_hundredth_of_a_degree() {
    let window = &ANSWERS.track;
    let trace = &*TRACE;
    let site = Site::new(ANSWERS.spot.latitude, ANSWERS.spot.longitude);
    let end = window.minutes * 60.0;
    for pass in &trace.passes {
        let propagator = propagator(&RECORDS[pass.row as usize]).unwrap();
        let elevation = |seconds: f64| {
            let time = start() + seconds * 1000.0;
            site.look(Moment::at(time).fixed(propagator.at(time).unwrap()))
                .elevation
        };
        let highest = |from: f64, to: f64, step: f64| {
            let samples = ((to - from) / step).round() as usize;
            (0..=samples)
                .map(|sample| (from + sample as f64 * step).min(to))
                .max_by(|&a, &b| elevation(a).total_cmp(&elevation(b)))
                .unwrap()
        };
        let reach = 2.0 * window.step;
        let rough = highest(
            (pass.peak_at - reach).max(0.0),
            (pass.peak_at + reach).min(end),
            0.1,
        );
        let fine = highest((rough - 0.1).max(0.0), (rough + 0.1).min(end), 0.001);
        close(
            &format!("{}, peak", id(pass.row)),
            pass.peak,
            elevation(fine),
            0.01,
        );
    }
}

#[test]
fn finds_a_zenith_between_samples_within_a_hundredth_of_a_degree() {
    let window = &ANSWERS.track;
    let row = RECORDS
        .iter()
        .position(|record| record["NORAD_CAT_ID"] == 63848)
        .unwrap();
    let orbits = orbits(&RECORDS);
    let time = start() + 1.37 * window.step * 1000.0;
    let teme = propagator(&RECORDS[row]).unwrap().at(time).unwrap();
    let below = Point::below(Moment::at(time).fixed(teme));
    let tracer = Tracer::new(
        below.latitude,
        below.longitude,
        start(),
        window.samples(),
        window.step,
    );
    let trace = tracer.trace(&orbits, &[row as u32]);
    let pass = trace
        .passes
        .iter()
        .max_by(|a, b| a.peak.total_cmp(&b.peak))
        .unwrap();
    close("zenith", pass.peak, 90.0, 0.01);
}

#[test]
fn reads_each_height_and_range_at_the_highest_point() {
    let site = Site::new(ANSWERS.spot.latitude, ANSWERS.spot.longitude);
    for pass in &TRACE.passes {
        let what = |field: &str| format!("{}, {field}", id(pass.row));
        let time = start() + pass.peak_at * 1000.0;
        let propagator = propagator(&RECORDS[pass.row as usize]).unwrap();
        let fixed = Moment::at(time).fixed(propagator.at(time).unwrap());
        close(
            &what("height"),
            pass.height,
            Point::below(fixed).height,
            DISTANCE,
        );
        close(&what("range"), pass.range, site.look(fixed).range, DISTANCE);
    }
}

#[test]
fn fails_a_record_once_its_orbit_decays() {
    let propagator = propagator(&ANSWERS.decayed.record).unwrap();
    let epoch = ANSWERS.decayed.record["EPOCH"].as_str().unwrap();
    let epoch = DateTime::parse_from_rfc3339(&format!("{epoch}Z"))
        .unwrap()
        .timestamp_millis();
    for answer in &ANSWERS.decayed.placed {
        let placed = propagator
            .at(epoch as f64 + answer.minutes * 60_000.0)
            .is_some();
        assert_eq!(
            placed, answer.placed,
            "{} minutes past the epoch",
            answer.minutes
        );
    }
}

fn leaves_out(field: &str, value: Value) {
    let mut records = RECORDS.clone();
    records[1].insert(field.into(), value);
    let orbits = orbits(&records);
    let window = &ANSWERS.grid;
    let grid = window.grid(&orbits);
    let risen = grid
        .sight(ANSWERS.spot.latitude, ANSWERS.spot.longitude)
        .risen;
    let trace = ANSWERS.track.tracer().trace(&orbits, &[1]);
    let others: Vec<u64> = window
        .risen
        .iter()
        .copied()
        .filter(|&risen| risen != id(1))
        .collect();
    assert_eq!(orbits.size(), RECORDS.len());
    assert_eq!(risen.into_iter().map(id).collect::<Vec<_>>(), others);
    assert!(trace.passes.is_empty() && trace.track.is_empty());
}

#[test]
fn leaves_a_record_missing_a_field_out_without_moving_the_rest() {
    leaves_out("INCLINATION", Value::Null);
}

#[test]
fn leaves_a_record_sgp4_rejects_out_without_moving_the_rest() {
    leaves_out("ECCENTRICITY", 1.5.into());
}

#[test]
fn leaves_a_record_with_an_unreadable_epoch_out_without_moving_the_rest() {
    leaves_out("EPOCH", "soon".into());
}

#[test]
fn places_the_same_satellites_when_filled_in_chunks_past_the_last_row() {
    let orbits = orbits(&RECORDS);
    let window = &ANSWERS.grid;
    let mut grid = Grid::new(&orbits, start(), window.samples(), window.step);
    for row in (0..orbits.size()).step_by(5) {
        grid.fill(&orbits, row, row + 5);
    }
    let sighting = grid.sight(ANSWERS.spot.latitude, ANSWERS.spot.longitude);
    assert_eq!(sighting.counts, window.counts);
}

#[test]
fn reads_the_elements_in_the_order_the_answers_name_them() {
    assert_eq!(ANSWERS.fields[3..], ELEMENTS);
}

#[test]
fn appends_each_segment_after_the_records_before_it() {
    let (first, rest) = RECORDS.split_at(RECORDS.len() / 2);
    let mut orbits = orbits(first);
    let epochs: Vec<&str> = rest.iter().map(epoch).collect();
    let elements: Vec<f64> = rest.iter().flat_map(elements).collect();
    orbits.append(&epochs, &elements).unwrap();
    let window = &ANSWERS.grid;
    let sighting = window
        .grid(&orbits)
        .sight(ANSWERS.spot.latitude, ANSWERS.spot.longitude);
    assert_eq!(sighting.counts, window.counts);
}

#[test]
fn places_only_the_rows_a_grid_was_built_for_once_the_orbits_grow() {
    let (first, rest) = RECORDS.split_at(RECORDS.len() / 2);
    let mut orbits = orbits(first);
    let window = &ANSWERS.grid;
    let mut grid = Grid::new(&orbits, start(), window.samples(), window.step);
    let epochs: Vec<&str> = rest.iter().map(epoch).collect();
    let elements: Vec<f64> = rest.iter().flat_map(elements).collect();
    orbits.append(&epochs, &elements).unwrap();
    grid.fill(&orbits, 0, orbits.size());
    let sighting = grid.sight(ANSWERS.spot.latitude, ANSWERS.spot.longitude);
    assert_eq!(sighting.counts.len(), window.samples());
}

#[test]
fn refuses_a_segment_whose_epochs_and_elements_differ() {
    let epochs: Vec<&str> = RECORDS.iter().map(epoch).collect();
    let elements: Vec<f64> = RECORDS.iter().flat_map(elements).collect();
    let mut orbits = Orbits::new();
    for (epochs, elements) in [(&epochs[1..], &elements[..]), (&epochs[..], &elements[1..])] {
        assert!(orbits.append(epochs, elements).is_err());
    }
    assert_eq!(orbits.size(), 0);
}
