//! Holds each traced pass and the track beside it to the answers.

use orbit::{Moment, Point, Traced, Tracer};
use serde_json::{Map, Value};

use crate::{
    ANGLE, ANSWERS, DISTANCE, Pass, RECORDS, SKIES, TRACES, close, id, orbits, propagator, read,
    start, turned,
};

/// The seconds after the answers' start, a whole number of the track's steps,
/// nearest the moment the satellite in `antimeridian.json` crosses the
/// antimeridian, which it does about 13 seconds earlier.
const CROSSING: f64 = 22_440.0;

#[test]
fn looks_at_each_satellite_as_its_traced_passes_do() {
    let window = &ANSWERS.track;
    let orbits = orbits(&RECORDS);
    let tracer = window.tracer(&ANSWERS.spot);
    for (index, pass) in TRACES[0].passes.iter().enumerate() {
        let looks = tracer.looks(&orbits, pass.row);
        let rise = (pass.rise_at / window.step) as usize;
        let set = (pass.set_at / window.step) as usize;
        let tracked = TRACES[0].offsets[index] as usize + rise * window.width + 2;
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
            f64::from(TRACES[0].track[tracked]),
            ANGLE,
        );
    }
}

#[test]
fn traces_the_highest_pass_of_each_satellite_where_the_answers_do() {
    let window = &ANSWERS.track;
    for (sky, trace) in SKIES.iter().zip(&*TRACES) {
        let mut traced: Vec<u64> = trace.passes.iter().map(|pass| id(pass.row)).collect();
        traced.dedup();
        let expected: Vec<&Pass> = sky.passes.iter().flatten().collect();
        assert_eq!(
            traced,
            expected.iter().map(|pass| pass.id).collect::<Vec<_>>(),
            "{:?}",
            sky.spot
        );
        for answer in expected {
            let what = |field: &str| format!("{} from {:?}, {field}", answer.id, sky.spot);
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
            assert_eq!(
                (rise_at, set_at),
                (answer.rise_at, answer.set_at),
                "{}",
                what("rise and set")
            );
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
}

#[test]
fn keeps_one_track_per_satellite_however_many_passes_it_makes() {
    let window = &ANSWERS.track;
    let trace = &TRACES[0];
    let mut offsets = trace.offsets.clone();
    offsets.dedup();
    let width = window.samples() * window.width;
    assert_eq!(trace.offsets.len(), trace.passes.len(), "offsets");
    assert_eq!(trace.track.len(), offsets.len() * width, "track");
    let misplaced: Vec<(usize, u32)> = offsets
        .into_iter()
        .enumerate()
        .filter(|&(slot, offset)| offset as usize != slot * width)
        .collect();
    assert!(
        misplaced.is_empty(),
        "slots whose offset is not the start of a track: {misplaced:?}"
    );
}

#[test]
fn gives_each_rising_of_a_satellite_a_pass_of_its_own() {
    let window = &ANSWERS.track;
    let trace = &TRACES[0];
    let elevation =
        |offset: u32, sample: usize| trace.track[offset as usize + sample * window.width + 2];
    let mut twice = 0;
    for (index, pass) in trace.passes.iter().enumerate() {
        let offset = trace.offsets[index];
        let (rise, set) = (
            (pass.rise_at / window.step) as usize,
            (pass.set_at / window.step) as usize,
        );
        let case = format!("{} rising at {} s", id(pass.row), pass.rise_at);
        let below: Vec<usize> = (rise..=set)
            .filter(|&sample| elevation(offset, sample) <= 0.0)
            .collect();
        assert!(
            below.is_empty(),
            "{case}, samples below the horizon: {below:?}"
        );
        if !pass.earlier {
            assert!(
                elevation(offset, rise - 1) <= 0.0,
                "{case}, before the rise"
            );
        }
        if !pass.later {
            assert!(elevation(offset, set + 1) <= 0.0, "{case}, after the set");
        }
        if let Some(next) = trace
            .passes
            .get(index + 1)
            .filter(|next| next.row == pass.row)
        {
            assert!(
                next.rise_at > pass.set_at + window.step,
                "{case}, gap to the next rising"
            );
            assert_eq!(trace.offsets[index + 1], offset, "{case}, track");
            twice += 1;
        }
    }
    assert!(twice > 0, "no satellite in the answers rises twice");
}

#[test]
fn finds_each_highest_point_within_a_hundredth_of_a_degree() {
    let window = &ANSWERS.track;
    let end = window.minutes * 60.0;
    for (sky, trace) in SKIES.iter().zip(&*TRACES) {
        let site = sky.spot.site();
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
                &format!("{} from {:?}, peak", id(pass.row), sky.spot),
                pass.peak,
                elevation(fine),
                0.01,
            );
        }
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
fn gives_no_heading_to_a_satellite_holding_its_place_across_the_antimeridian() {
    let window = &ANSWERS.track;
    let records: Vec<Map<String, Value>> = read("antimeridian.json");
    let propagator = propagator(&records[0]).unwrap();
    let below = |seconds: f64| {
        let time = start() + seconds * 1000.0;
        Point::below(Moment::at(time).fixed(propagator.at(time).unwrap()))
    };
    let (west, east) = (below(CROSSING - window.step), below(CROSSING + window.step));
    assert!(
        west.longitude > 0.0 && east.longitude < 0.0,
        "samples beside the crossing: {} and {}",
        west.longitude,
        east.longitude
    );
    let spot = below(CROSSING);
    let middle = (window.samples() / 2) as f64 * window.step;
    let tracer = Tracer::new(
        spot.latitude,
        spot.longitude,
        start() + (CROSSING - middle) * 1000.0,
        window.samples(),
        window.step,
    );
    let trace = tracer.trace(&orbits(&records), &[0]);
    let [pass] = trace.passes.as_slice() else {
        panic!("{} passes", trace.passes.len());
    };
    close("highest moment", pass.peak_at, middle, window.step / 2.0);
    assert_eq!(pass.heading, None, "heading");
}

#[test]
fn reads_each_height_and_range_at_the_highest_point() {
    for (sky, trace) in SKIES.iter().zip(&*TRACES) {
        let site = sky.spot.site();
        for pass in &trace.passes {
            let what = |field: &str| format!("{} from {:?}, {field}", id(pass.row), sky.spot);
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
}
