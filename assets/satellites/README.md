# Major planetary satellites / 主要行星卫星

The solar-system view contains 20 satellites including Earth's Moon: Phobos,
Deimos, the four Galilean moons, seven Saturnian moons (Mimas, Enceladus, Tethys,
Dione, Rhea, Titan, Iapetus), the five major Uranian moons, and Triton.
Basic spheres use mean radii; their colors identify the bodies and do not
represent resolved surface imagery. Satellite surface observation is a later feature.

## Positions and source attribution

- Moon: existing Astronomy Engine lunar model.
- Io, Europa, Ganymede, Callisto: Astronomy Engine 2.1.19 `JupiterMoons`, using
  the IMCCE L1.2 model; returned coordinates are Jupiter-centered EQJ/J2000 AU.
- Other 15 satellites: an extracted subset of NASA/JPL Solar System Dynamics
  SPK type-2 records, with original polynomial intervals and degrees retained:
  [MAR099](https://ssd.jpl.nasa.gov/ftp/eph/satellites/bsp/mar099.bsp),
  [SAT441L](https://ssd.jpl.nasa.gov/ftp/eph/satellites/bsp/sat441l.bsp),
  [URA182](https://ssd.jpl.nasa.gov/ftp/eph/satellites/bsp/ura182.bsp),
  [NEP098](https://ssd.jpl.nasa.gov/ftp/eph/satellites/bsp/nep098.bsp).
- Mean radii: [JPL physical parameters](https://ssd.jpl.nasa.gov/sats/phys_par/).
  Approximate orbit periods and extents: [JPL mean elements](https://ssd.jpl.nasa.gov/sats/elem/),
  used for drawing a one-orbit track and framing the camera, never for propagation.
- Format: [NAIF SPK type 2](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/spk.html).
- Time conversion: [NAIF naif0012.tls](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls).

The bundled SPK window is **2026-01-01 00:00 UTC through 2031-01-01 00:00 UTC
(exclusive)**. Beyond this window those 15 positions and orbit tracks are
omitted and the system view identifies the available years. No endpoint freezing
or extrapolated substitute orbit is displayed. The Moon and Galilean library
models remain available separately; they are not claimed to have identical
accuracy to the SPK subset or unlimited historical precision.

SPK satellite vectors are relative to the planetary-system barycenter. The
matching parent-body segment is subtracted before adding the existing
Astronomy Engine planet position. All positions are geometric, at a shared
instant, in equatorial J2000 axes; this view does not apply apparent light-time
or aberration corrections. Parent heliocentric accuracy remains that of the
planetary model, independently of relative satellite accuracy.

UTC → TDB uses the NAIF DELTET expression with TAI−UTC = 37 seconds. The
2026–2030 subset assumes no subsequent leap second; update that conversion when
an additional leap second is officially introduced. This avoids using the
planetary library's long-term delta-T approximation for the fast satellite phase.

## Compact package and error checks

`major-2026-2030.bin.gz` is 2,699,512 bytes; decoded coefficients occupy
6,277,620 bytes. It is loaded and decompressed only when a covered parent system
is opened. The decoded immutable pack is reused across visits.

Coefficients are signed little-endian int32, scaled by 0.01 km. Clenshaw
recurrence evaluates them directly. For each source record, the extraction
script sums absolute coefficient quantization errors per axis, then takes the
Euclidean norm; the manifest stores the maximum over all records in each
segment. Because |Tₙ(x)| ≤ 1 on [−1,1], these are conservative **quantization
bounds relative to the supplied SPK**, not the SPK's absolute observational
uncertainty. Parent-relative bounds add the parent and satellite bounds
(less than 0.16 km for this package). The source interval byte hashes and
unquantized test vectors are retained in `manifest.json`.

`node tests/major-satellites.mjs` checks those independent double-precision
polynomial reference vectors, record transitions, parent-center subtraction,
independent Horizons vectors, retrograde Triton motion, date boundaries, and
loading behavior. `tests/fixtures/satellite-horizons.json` records the exact
geometric-vector queries. A complete sampled orbit close to a coverage endpoint
uses the nearest one-orbit interval within the data window.

Rebuild from repository root:

```sh
python3 scripts/prepare-satellites.py
```

Requires `requests` and `numpy`. HTTP Range reads fetch only headers and selected
records. Source caches under `output/satellite-source/` are not shipped. NASA/JPL
source attribution is retained independently of StarOrbit's application license.
