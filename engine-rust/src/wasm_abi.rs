use std::cell::RefCell;

use crate::{
    run_generic_aam_verification_json, run_json, run_public_aircraft_reference_json, EngineError,
    MAX_INPUT_BYTES,
};

const ABI_VERSION: u32 = 1;

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

/// Return the version of the exported VECTOR WebAssembly ABI.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vector_abi_version() -> u32 {
    ABI_VERSION
}

/// Return the maximum number of JSON bytes accepted by [`vector_input_reserve`].
// Exporting a stable C symbol is classified by rustc's `unsafe_code` lint even
// though this function contains no unsafe block.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vector_max_input_len() -> usize {
    MAX_INPUT_BYTES
}

/// Reserve a thread-local input buffer and return its stable pointer.
///
/// A zero pointer indicates that `length` exceeded [`MAX_INPUT_BYTES`]. The
/// pointer remains valid until the next call to this function on the same
/// thread. The JavaScript adapter must copy exactly `length` bytes before
/// invoking [`vector_run_json`].
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vector_input_reserve(length: usize) -> *mut u8 {
    if length > MAX_INPUT_BYTES {
        set_output(
            EngineError::InputTooLarge {
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

/// Execute the admitted JSON scenario currently stored in the input buffer.
///
/// Returns `1` on success and `0` on rejection. The output buffer contains a
/// serialized run on success or a stable human-readable error on rejection.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vector_run_json() -> u32 {
    let result = INPUT.with(|input| {
        let input = input.borrow();
        std::str::from_utf8(&input)
            .map_err(|_| EngineError::InvalidUtf8)
            .and_then(run_json)
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

/// Execute the versioned public-aircraft reference case in the input buffer.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vector_reference_run_json() -> u32 {
    let result = INPUT.with(|input| {
        let input = input.borrow();
        std::str::from_utf8(&input)
            .map_err(|_| EngineError::InvalidUtf8)
            .and_then(run_public_aircraft_reference_json)
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

/// Execute the standalone NASA TM-109057 generic AAM verification case.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vector_generic_aam_run_json() -> u32 {
    let result = INPUT.with(|input| {
        let input = input.borrow();
        std::str::from_utf8(&input)
            .map_err(|_| EngineError::InvalidUtf8)
            .and_then(run_generic_aam_verification_json)
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

/// Return the output buffer pointer for the most recent ABI operation.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vector_output_ptr() -> *const u8 {
    OUTPUT.with(|cell| cell.borrow().as_ptr())
}

/// Return the output buffer length for the most recent ABI operation.
#[allow(unsafe_code)]
#[no_mangle]
pub extern "C" fn vector_output_len() -> usize {
    OUTPUT.with(|cell| cell.borrow().len())
}
