//! Holds the grid's count of the satellites above the spot to the answers.

use orbit::Grid;

use crate::{ANSWERS, RECORDS, append, id, orbits, start};

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
fn places_only_the_rows_a_grid_was_built_for_once_the_orbits_grow() {
    let (first, rest) = RECORDS.split_at(RECORDS.len() / 2);
    let mut orbits = orbits(first);
    let window = &ANSWERS.grid;
    let mut grid = Grid::new(&orbits, start(), window.samples(), window.step);
    append(&mut orbits, rest);
    grid.fill(&orbits, 0, orbits.size());
    let sighting = grid.sight(ANSWERS.spot.latitude, ANSWERS.spot.longitude);
    assert_eq!(sighting.counts.len(), window.samples());
}
