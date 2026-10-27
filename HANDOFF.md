# StarOrbit implementation handoff

## 2026-10-27 — v0.55 DFH-1 live telemetry

- Added deterministic reference Sun/IR probes, 10-second experimental commutator and 880–1320 Hz FM audio.
- Kept historical recording as an independent backend; complete music+telemetry cycle is future work.
- Integrated simulation attitude/time gating and waveform panel; all four languages supplied.
- Numerical and lifecycle tests are included in npm test. See docs/v0.55-details.md for scientific assumptions and source links.
- Local build/runtime synchronization and browser checks are recorded in docs/v0.55-validation.md.
- No push or release authorized in this batch.


## 2026-10-27 — v0.56 city labels

- Added cumulative city tiers with tier 1 selected by default, using the pinned Natural Earth populated-places source.
- Shared capital/city anchors retain the Beijing star and avoid duplicate names; boundaries and regions are unchanged.
- Reuses existing glyph atlas, batch, layout throttling and label cap. Settings and scene imports include city preferences.
- Builds and local runtime updated to v0.56; v0.55 telemetry changes retained. No GitHub push requested in this batch.

## 2026-10-27 — v0.57 soft layered aurora

- 4K retains the original nine shells. 8K uses three bounded polar height surfaces, broad diffuse emission, narrow bright arcs and faint upper red glow.
- Shared 8 KiB base noise, one draw batch, 24,576 triangles; adaptive path uses 16,384 triangles. Source changes rebuild geometry; off/4K releases high-only resources.
- Numerical, lifecycle and browser checks cover local/NOAA/empty data, pause/seek, effective speed, HDR fallback and repeated quality changes. Code and visual subagent reviews completed.
- See docs/v0.57-details.md and docs/v0.57-performance.json for methods, sources and measurements.
- Source/web/local app use v0.57. GitHub remains at the previously published version; no push requested in this batch.
- Final validation: npm test, targeted aurora tests, offline/web builds, web-build asset validation and git diff --check passed. Final browser run passed all 21 checks with no GL errors.
- Synced 43 changed/new files and generated HTML to the installed runtime with SHA-256 equality checks. Updated application metadata to 0.57; ad-hoc signature verification and launcher --check passed at port 8771.

## 2026-10-27 — v0.58 volumetric aurora

- Replaced the experimental horizontal/curtain meshes with a bounded emissive-volume pass, controlled by a cached two-hemisphere footprint and altitude profile. Removed the superseded mesh source/tests.
- Green veils curl and spread with height; faint upper red and localized lower pink-violet emission share the volume. Original 4K shells remain intact.
- 1024×512 RGBA8 footprint with mipmaps; volume buffer capped at 960×640, at most 24 samples per visible shell segment (16 under adaptive protection). Static camera/time reuses integrated light; footprint updates at most 4 Hz during playback.
- Research and five orbital image/video references: docs/aurora-research.md. Current tests and measurements: docs/v0.58-details.md.
- Code/performance and visual subagent reviews applied: hemisphere mip seam guard, fixed shell-top fade, local secondary arcs and height-dependent spreading.
- No GitHub push or Release requested in this batch; published web remains v0.54.
- Final validation: npm test, offline/web builds, web asset validation and git diff --check passed; 26 browser checks passed, including midnight continuity. Local GPU measurements are saved in docs/v0.58-performance.json.
- Synced 49 changed/new files and generated HTML to the installed runtime with SHA-256 verification. Application metadata is 0.58; codesign verification and launcher --check passed on port 8771.

## 2026-10-28 — GitHub and Pages publication

- User authorized publishing the complete v0.58 source, including the v0.55 telemetry and v0.56 city-label work. Main-branch publication uses the existing Pages workflow. The portable release remains v0.38.

## 2026-10-28 — v0.59 music isolation

- Music initialization waits for the restored mission before autoplay. DFH-1 never starts the randomly selected library track during boot.
- Media end events require the current resource to have ended; repeat callbacks validate their playback generation. The original audio element is retained for Safari autoplay authorization.
- Added actual-player lifecycle tests and a browser playback trace covering DFH-1 repeats, the five-second gap, pause, library resume and stale end events.
