//! Holds the reading of the catalog's records into orbits, and the records
//! it leaves out, to the answers.

use orbit::{ELEMENTS, Orbits};
use serde_json::Value;
use sgp4::chrono::DateTime;

use crate::{ANSWERS, RECORDS, append, elements, epoch, id, orbits, propagator};

#[test]
fn fails_a_record_once_its_orbit_decays() {
    let propagator = propagator(&ANSWERS.decayed.record).unwrap();
    let epoch = DateTime::parse_from_rfc3339(&format!("{}Z", epoch(&ANSWERS.decayed.record)))
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
    let trace = ANSWERS.track.tracer(&ANSWERS.spot).trace(&orbits, &[1]);
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
fn reads_the_elements_in_the_order_the_answers_name_them() {
    assert_eq!(ANSWERS.fields[3..], ELEMENTS);
}

#[test]
fn appends_each_segment_after_the_records_before_it() {
    let (first, rest) = RECORDS.split_at(RECORDS.len() / 2);
    let mut orbits = orbits(first);
    append(&mut orbits, rest);
    let window = &ANSWERS.grid;
    let sighting = window
        .grid(&orbits)
        .sight(ANSWERS.spot.latitude, ANSWERS.spot.longitude);
    assert_eq!(sighting.counts, window.counts);
}

#[test]
fn refuses_a_segment_whose_epochs_and_elements_differ() {
    let epochs: Vec<&str> = RECORDS.iter().map(epoch).collect();
    let elements: Vec<f64> = RECORDS.iter().flat_map(elements).collect();
    let mut orbits = Orbits::new();
    for (case, epochs, elements) in [
        ("one epoch short", &epochs[1..], &elements[..]),
        ("one element short", &epochs[..], &elements[1..]),
    ] {
        assert!(orbits.append(epochs, elements).is_err(), "{case}");
    }
    assert_eq!(orbits.size(), 0);
}
