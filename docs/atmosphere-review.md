# 8K atmosphere update — 2026-10-23

## Model and cost

Solar optical-depth LUT: 256 × 128, RGBA16F, 256 KiB; generated once on first high-quality selection and reused. Radius 6371 km; 100 km model atmosphere; Rayleigh scale height 8 km, Mie 1.2 km; triangular ozone profile 10–40 km. Uses a single-scattering approximation, not measured weather-dependent aerosol or a multiple-scattering atmosphere.

Reference profiles: [Bruneton Earth atmosphere demo](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/demo/demo.cc.html).

View quadrature splits at tangent/shadow boundaries with fixed samples per interval. Maximum 48 samples, reduced to 32 by the existing adaptive-effects setting. Exact constant-segment extinction prevents dense lower-air quadrature from overbrightening. Ozone absorption and lower display gain retain blue/orange separation rather than a white rim. High Earth/cloud geometry is 384 × 192, disposed on quality changes; other tiers retain previous shaders and geometry.

## Validation

- Full `npm test` suite and standalone build pass, including a regression check that the minimap reuses parsed assets after removal of the large JSON node.
- Solar LUT checked against 8192 samples per integration leg: largest absolute RGB transmittance discrepancy 0.001191 over the test set. Vertical Rayleigh/Mie/ozone column checks pass.
- Independent Chrome, single 800 × 560 WebGL viewport, on-demand renders; no embedded Earth/star textures or station model loaded.
- Day, twilight, night and globe views checked; shader errors: 0.
- Continuous solar-angle sweep from −30° to 0°, 121 frames at 10 Hz completed. The final sweep with the denser sphere recorded maximum CPU render submission 0.7 ms; this is not a GPU frame-time or full-application FPS claim.
- Earlier dual-context/large-document validation was stopped after three host crashes. macOS reports identify ChatGPT/Codex Framework main-thread EXC_BREAKPOINT / SIGTRAP at the same offsets; they do not establish an out-of-memory kill or a shader fault. High memory pressure was observed separately. Validation moved to an isolated Chrome viewport rather than reopening the large app in the embedded browser.
- Full application with all 8K textures has not been stress-tested after this change. Orbit, station configuration and settings were not changed.
