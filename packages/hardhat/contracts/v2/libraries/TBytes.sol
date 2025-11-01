// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Minimal transient bytes encoder/decoder.
/// Layout at `base`:
///   base:    uint256 length in bytes
///   base+1 … base+N: data words (ceil(len/32) words)
library TBytes {
    /// @dev Store `src` at `base` (overwrites previous content). Tail bytes are zero-masked.
    function set(bytes32 base, bytes memory src) internal {
        assembly {
            let len := mload(src)
            tstore(base, len)

            let ptr := add(src, 0x20)
            let full := div(len, 32)
            let rem := mod(len, 32)

            // store full words
            for { let i := 0 } lt(i, full) { i := add(i, 1) } {
                tstore(add(base, add(1, i)), mload(add(ptr, mul(i, 32))))
            }

            // store last partial (masked) word
            if rem {
                let last := mload(add(ptr, mul(full, 32)))
                // keep top `rem` bytes, zero the low (32 - rem) bytes
                let mask := not(sub(exp(256, sub(32, rem)), 1))
                last := and(last, mask)
                tstore(add(base, add(1, full)), last)
            }
            // Note: we do not need to clear old extra words; reads use the exact byte length.
        }
    }

    /// @dev Load bytes previously written at `base`.
    function get(bytes32 base) internal view returns (bytes memory out) {
        assembly {
            let len := tload(base)
            out := mload(0x40)
            mstore(out, len)

            let dst := add(out, 0x20)
            let full := div(len, 32)
            let rem := mod(len, 32)

            for { let i := 0 } lt(i, full) { i := add(i, 1) } {
                mstore(add(dst, mul(i, 32)), tload(add(base, add(1, i))))
            }
            if rem {
                mstore(add(dst, mul(full, 32)), tload(add(base, add(1, full))))
            }

            // bump free memory pointer to ceil32(len)
            mstore(0x40, add(dst, and(add(len, 31), not(31))))
        }
    }

    /// @dev Number of data words currently stored (ceil(len/32)).
    function wordCount(bytes32 base) internal view returns (uint256 words) {
        uint256 len;
        assembly { len := tload(base) }
        unchecked { words = (len + 31) >> 5; }
    }

    /// @dev Clear the region (length and words).
    function clear(bytes32 base) internal {
        assembly {
            let len := tload(base)
            let words := add(div(len, 32), iszero(iszero(mod(len, 32))))
            tstore(base, 0)
            for { let i := 0 } lt(i, words) { i := add(i, 1) } {
                tstore(add(base, add(1, i)), 0)
            }
        }
    }
}


