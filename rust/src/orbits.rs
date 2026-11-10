//! Reads a catalog file into one SGP4 propagator per record, built from the
//! WGS72 constants the catalog's orbits are fitted with.

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

/// One record's SGP4 constants beside its epoch as a Unix time in milliseconds.
pub struct Propagator {
    constants: Constants,
    epoch: f64,
}

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
        let orbit = Orbit::from_kozai_elements(
            &WGS72,
            angle("INCLINATION")?,
            angle("RA_OF_ASC_NODE")?,
            number("ECCENTRICITY")?,
            angle("ARG_OF_PERICENTER")?,
            angle("MEAN_ANOMALY")?,
            number("MEAN_MOTION")? * PI / 720.0,
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
            epoch: epoch.and_utc().timestamp_micros() as f64 / 1000.0,
        })
    }

    /// Returns the satellite's position at a Unix time in milliseconds, in
    /// kilometers in the frame SGP4 returns, or `None` where SGP4 fails or the
    /// orbit has decayed below the Earth's surface.
    pub fn at(&self, time: f64) -> Option<[f64; 3]> {
        let minutes = MinutesSinceEpoch((time - self.epoch) / 60_000.0);
        let position = self.constants.propagate(minutes).ok()?.position;
        let square = position.iter().map(|axis| axis * axis).sum::<f64>();
        (square >= WGS72.ae * WGS72.ae).then_some(position)
    }
}
