#![deny(unsafe_code)]
#![deny(clippy::expect_used, clippy::panic, clippy::unwrap_used)]

mod generated_schema;
mod model;

use std::cell::RefCell;
use std::fmt::{Display, Formatter};

pub use model::{evaluate_batch, evaluate_batch_json, EvaluatorBatch, EvaluatorBatchResult};

const ABI_VERSION: u32 = 1;
const MAX_INPUT_BYTES: usize = 2_097_152;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EvaluatorError {
    InvalidJson(String),
    InvalidInput(String),
    InputTooLarge { requested: usize, maximum: usize },
    InvalidUtf8,
    Serialization(String),
}

impl Display for EvaluatorError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidJson(message) => write!(formatter, "invalid TP-1538 JSON: {message}"),
            Self::InvalidInput(message) => {
                write!(formatter, "invalid TP-1538 evaluator input: {message}")
            }
            Self::InputTooLarge { requested, maximum } => write!(
                formatter,
                "TP-1538 input is {requested} bytes; maximum is {maximum}"
            ),
            Self::InvalidUtf8 => formatter.write_str("TP-1538 input is not valid UTF-8"),
            Self::Serialization(message) => {
                write!(formatter, "could not serialize TP-1538 result: {message}")
            }
        }
    }
}

impl std::error::Error for EvaluatorError {}

thread_local! {
    static INPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    static OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

fn set_output(value: impl AsRef<[u8]>) {
    OUTPUT.with(|cell| {
        let mut output = cell.borrow_mut();
        output.clear();
        output.extend_from_slice(value.as_ref());
    });
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vector_tp1538_aero_abi_version() -> u32 {
    ABI_VERSION
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vector_tp1538_aero_max_input_len() -> usize {
    MAX_INPUT_BYTES
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vector_tp1538_aero_input_reserve(length: usize) -> *mut u8 {
    if length > MAX_INPUT_BYTES {
        set_output(
            EvaluatorError::InputTooLarge {
                requested: length,
                maximum: MAX_INPUT_BYTES,
            }
            .to_string(),
        );
        return std::ptr::null_mut();
    }
    INPUT.with(|cell| {
        let mut input = cell.borrow_mut();
        input.clear();
        input.resize(length, 0);
        input.as_mut_ptr()
    })
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vector_tp1538_aero_run_json() -> u32 {
    let result = INPUT.with(|input| {
        let input = input.borrow();
        std::str::from_utf8(&input)
            .map_err(|_| EvaluatorError::InvalidUtf8)
            .and_then(evaluate_batch_json)
    });
    match result {
        Ok(value) => {
            set_output(value);
            1
        }
        Err(error) => {
            set_output(error.to_string());
            0
        }
    }
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vector_tp1538_aero_output_ptr() -> *const u8 {
    OUTPUT.with(|cell| cell.borrow().as_ptr())
}

#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vector_tp1538_aero_output_len() -> usize {
    OUTPUT.with(|cell| cell.borrow().len())
}
