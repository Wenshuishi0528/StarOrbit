# Atmospheric spectral reference

Run `python3 tests/reference/atmosphere-spectrum/diagnostic.py` from any directory. Requires Python with NumPy and Node.js. No browser, network, or temporary-file cache is used. The script calls the repository optical-depth table generator in memory, computes the current direction-averaged multiple-scattering closure at 48 and 6 wavelengths, and checks four low tangent heights in daylight and twilight. It prints the fixed CIE projection and measured results; no production files are changed.

The 6-node projection is the integral of piecewise-linear basis functions against CIE 1931 and extraterrestrial solar irradiance. Each RGB column sums to one; a spectrally flat transport preserves white. Solar irradiance is included in these weights and must not be applied twice. Negative conversion weights are valid; do not clip individual spectral contributions. This is a compact spectral quadrature comparison, not a full multiple-scattering radiative-transfer validation.

Prior expanded tests covered 76 full chords (normalized RMS 1.50%, maximum 11.24%) plus 18 ground/8 km cloud finite paths and 4 aligned-Sun paths (RMS 3.20%, maximum 14.67%). The normalized error divides RGB error by the largest reference RGB component, floored at 0.002. Sparse quadrature has its largest error in very low orange-red twilight. The checked-in script retains a small representative subset rather than every development diagnostic.

## Source and license

`bruneton-reference-data.json` extracts numerical tables from Eric Bruneton's reference implementation:

- https://raw.githubusercontent.com/ebruneton/precomputed_atmospheric_scattering/master/atmosphere/demo/demo.cc
- https://raw.githubusercontent.com/ebruneton/precomputed_atmospheric_scattering/master/atmosphere/constants.h
- API explanation distinguishing spectral radiance from RGB luminance: https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/model.h.html

The author's BSD 3-clause notice is preserved in `LICENSE-Bruneton.txt`. Tables include ASTM G173 extraterrestrial solar irradiance, ozone cross sections at 233 K, and CIE 1931 2-degree XYZ color matching functions. Solar/O3 use 360–830 nm by 10 nm; CIE uses 5 nm. Rayleigh coefficients and Earth density profiles follow the same reference. Current-source URLs are recorded for attribution; the extracted values are retained locally for reproducibility.
