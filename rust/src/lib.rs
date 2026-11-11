//! Finds the satellites that rise over a spot within a window, propagating each
//! orbit with SGP4 under the WGS72 constants the catalog's orbits are fitted
//! with and reading every position against one shared table of moments.

mod frame;
mod grid;
mod orbits;
mod tracer;

pub use frame::{Moment, Point, Site};
pub use grid::Grid;
pub use orbits::{ELEMENTS, Orbits, Propagator, Uneven};
pub use tracer::{Looks, TRACK_WIDTH, Trace, Traced, Tracer};
