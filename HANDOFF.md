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

## 2026-10-28 — v0.60 complete orbit geometry

- Replaced the fixed 5,600-second overview trail with the active orbital ellipse, sampled geometrically at 360 eccentric-anomaly angles and rendered as a LineLoop. This follows the user's request to draw one full orbit without a time window.
- Historical orbit uses the existing historical ellipse; sampled ephemerides use the instantaneous osculating ellipse; propagation uses its endpoint ellipse. The year-2000 transition replaces the whole loop. Time-based ground tracks and physics are unchanged.
- Numerical regressions and six browser scenarios cover both missions, historical/current boundary, closure, marker alignment, long-period and eccentric imports. Full tests, offline/web builds and web asset checks passed. See docs/v0.60-details.md and docs/v0.60-validation.json.
- Local-only batch; published web remains v0.59 and portable Release v0.38.
- Synced 16 source/build/document files to the installed runtime with SHA-256 checks, updated app metadata to 0.60, verified the app signature and launcher on port 8771. Previous runtime files are retained under output/runtime-backup-v0.59-to-v0.60.

## 2026-10-28 — v0.61 night-side clouds

- Added `cloudNightVisible`, default false, for ordinary and 8K volumetric clouds. Checkbox under cloud/aurora settings; saved in preferences, presets and scene shares. Older saved inputs default off.
- Full unit suite, web/offline builds and 22 actual Chromium/WebGL checks passed, including pixel equality under reversed sunlight and original lighting when off. See docs/v0.61-details.md and docs/v0.61-validation.json.
- Existing v0.60 orbit changes retained; local runtime synchronized. No commit, push or deployment.

## 2026-10-28 — v0.62 physically constrained night clouds and publication

- User cancelled the separate v0.60 publication and authorized publishing the latest version after the night-cloud fixes and subagent review. v0.60 orbit geometry and v0.61 preference/preset/scene plumbing are included.
- Removed the illumination-independent white overrides. Solar lighting, self-shadowing and cloud aerial transport are retained. Optional weak night-only moonlight follows ephemeris direction, Lambert phase, inverse-square dilution, lunar eclipse and local Earth occultation. The visibility gain is bounded and not a photometric calibration.
- Day-side on/off pixels match exactly across six production rendering configurations. 48 browser checks cover HDR/fallback, Moon setting, no-light cases, visibility, persistence and saved scenes. Full unit suite and offline/web builds passed. Independent subagent code and visual review found no blocking issues.
- The user identified the missing NASA controls as the existing web-edition difference and asked to ignore it. No NASA or cache behavior was changed in v0.62.
- See docs/v0.62-details.md, v0.62-validation.json and v0.62-performance.json. Portable release remains v0.38.
- Local runtime synchronized with SHA-256 verification for 36 files; application metadata is 0.62, signature verification and launcher check passed on port 8771. Previous runtime files retained in output/runtime-backup-v0.61-to-v0.62.

## 2026-10-28 — v0.63 dark night clouds

- User clarified that night clouds should be nearly invisible/black, rather than visibly gray. Removed the 800× lunar display gain and faded the ordinary/volume ambient floor to zero in deep night.
- Corrected standard-quality browser test configuration and added final display pixel checks at maximum exposure, including the real HDR finish pass. All 54 browser checks, full unit suite and builds passed. See docs/v0.63-details.md.
- Latest-version publication remains authorized; NASA features remain outside this batch.
- Independent subagent code and screenshot review passed. Local runtime files were SHA-256 verified, app metadata/signature updated to 0.63, and launcher check passed on port 8771.
