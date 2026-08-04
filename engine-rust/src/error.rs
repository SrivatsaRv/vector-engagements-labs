use std::fmt::{Display, Formatter};

/// A stable error returned by the engine admission and serialization boundary.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EngineError {
    /// The JSON request could not be decoded into the versioned scenario schema.
    InvalidJson(String),
    /// The decoded scenario violated an engine invariant or resource boundary.
    InvalidScenario(String),
    /// The WASM caller requested an input buffer larger than the public ABI limit.
    InputTooLarge { requested: usize, maximum: usize },
    /// The WASM input buffer did not contain UTF-8 JSON.
    InvalidUtf8,
    /// A valid engine result could not be encoded for the caller.
    Serialization(String),
}

impl Display for EngineError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidJson(message) => write!(formatter, "invalid scenario JSON: {message}"),
            Self::InvalidScenario(message) => write!(formatter, "invalid scenario: {message}"),
            Self::InputTooLarge { requested, maximum } => write!(
                formatter,
                "scenario input is {requested} bytes; the maximum is {maximum} bytes"
            ),
            Self::InvalidUtf8 => formatter.write_str("scenario input is not valid UTF-8"),
            Self::Serialization(message) => {
                write!(formatter, "could not serialize engine result: {message}")
            }
        }
    }
}

impl std::error::Error for EngineError {}
