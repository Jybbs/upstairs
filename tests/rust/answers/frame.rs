//! Holds the frames each position is read in, the ground point below a
//! satellite and the look from the spot, to the answers.

use orbit::{Moment, Point};

use crate::{ANGLE, ANSWERS, DISTANCE, EARTH, RECORDS, close, propagator, start, turned};

#[test]
fn places_each_record_where_the_answers_do() {
    let site = ANSWERS.spot.site();
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
