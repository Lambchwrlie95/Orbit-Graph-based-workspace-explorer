//! Services module
//! 
//! Contains background services and utilities for the Orbit application.

pub mod thumbnail_generator;

// Re-export commonly used items
pub use thumbnail_generator::ThumbnailGenerator;
