use image::imageops::FilterType;
use std::path::Path;

/// Compute a 64-bit difference hash (dHash) for an image.
/// Returns 8 bytes — bit i is 1 iff pixel[i] > pixel[i+1] in a 9x8 grayscale resize.
/// Hamming distance ≤ 10 between two such hashes is a strong similarity signal.
pub fn compute_dhash(path: &Path) -> Result<[u8; 8], String> {
    let img = image::open(path).map_err(|e| format!("open image: {e}"))?;
    let small = img.resize_exact(9, 8, FilterType::Lanczos3).to_luma8();

    let mut bits: u64 = 0;
    for y in 0..8u32 {
        for x in 0..8u32 {
            let left = small.get_pixel(x, y).0[0];
            let right = small.get_pixel(x + 1, y).0[0];
            if left < right {
                bits |= 1u64 << ((y * 8) + x);
            }
        }
    }

    Ok(bits.to_be_bytes())
}

/// Hamming distance between two 8-byte hashes (number of differing bits).
pub fn hamming_distance(a: &[u8], b: &[u8]) -> u32 {
    if a.len() != b.len() {
        return u32::MAX;
    }
    a.iter()
        .zip(b.iter())
        .map(|(x, y)| (x ^ y).count_ones())
        .sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hamming_zero_for_identical() {
        let a: [u8; 8] = [0xAB; 8];
        assert_eq!(hamming_distance(&a, &a), 0);
    }

    #[test]
    fn hamming_counts_differing_bits() {
        let a: [u8; 8] = [0; 8];
        let b: [u8; 8] = [0xFF, 0, 0, 0, 0, 0, 0, 0];
        assert_eq!(hamming_distance(&a, &b), 8);
    }

    #[test]
    fn hamming_mismatched_lengths() {
        assert_eq!(hamming_distance(&[0u8; 4], &[0u8; 8]), u32::MAX);
    }
}
