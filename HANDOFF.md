# StarOrbit implementation handoff

## 2026-10-29 — v0.79 unified date/time input

- During the authorized GitHub/web synchronization, the user requested a small date/time editing change. Merged the date and clock into one ordered field with continuous arrow-key navigation; preserved 12/24-hour preferences and UTC+8.
- v0.78 was deployed at commit 7ea544e; its public script hash matched the local web build. Continue the same synchronization request with v0.79 after validation.

## 2026-10-29 — v0.78 GitHub and web synchronization

- After local validation, the user authorized synchronizing v0.78 to GitHub and Pages. Publish the existing batch without another version increment.
- Use the main branch and its existing Pages workflow; verify the deployed version and hashed bundle against the local web build.
- The v0.78 local-validation record below and docs/v0.78-validation.json describe the pre-publication stage.

## 2026-10-29 — v0.78 DFH-1 historical reconstruction (local)

- Replaced the old three-angle historical solution with a Jiuquan launch-plane prior, newspaper pass-time reconstruction and secular plane/perigee drift. Geometry remains 439 × 2384 km / 68.5°, with the reported 114-minute period distinguished from the empirical phase period. See docs/v0.78-details.md.
- 33 pass times on Apr 25/26/29 calibrate the model; 14 other times on Apr 27/30 and May 1/2 check it. This is an empirical reconstruction, not measured ephemerides, a blind test, or an ascent simulation.
- Full tests/builds, hashed assets, modern-branch invariance, numerical derivatives and independent subagent review passed. Installed runtime and launcher are v0.78; localhost serves the matching bundle. Safari refresh was not forced while the user was actively switching pages.
- No GitHub push, Pages deployment, or Release in this batch. Retain local modifications for the next authorized publication. Backup: output/dfh1-orbit-audit/runtime-backup-v0.77.


## 2026-10-28 — v0.68 publication

- User explicitly authorized GitHub synchronization, web deployment and the latest Release after local v0.68 validation. Publish the existing batch without another version increment.
- Use the existing main/Pages workflow and package-portable script, including the macOS launcher, and update the Latest release from v0.38 to v0.68.
- Existing full tests, six SATCORPS tests, builds, browser validation and independent reviews passed; retain the previous local-validation record below.

## 2026-10-28 — v0.68 unified data resources (local)

- Reworked NASA/GitHub cloud, NOAA aurora and mission-specific orbit updates into a single Data & resources dialog, with explicit download/use actions and persistent per-source outcomes. NASA remains visible on web with the local-service requirement explained.
- Added default-on, optional FIFO cache eviction across browser resource types; protect active, pending, favorite, all-mission selected and preset-referenced records. NASA shared disk derivatives remain separately measured and retain their existing two-image policy.
- Reuse duplicate requests, HTTP validators, content hashes, unchanged GP/OEM data and NASA preflight data blocks. Throttle progress/history work and suspend hidden 3D rendering while the modal is open.
- Independent subagent reviews found and resolved NASA recovery/cleanup races, misleading partial-check states, pending texture eviction, manual-delete resurrection and history invalidation on language/mission changes. Regression tests cover these cases.
- Full npm tests, six SATCORPS tests, offline/web builds, web asset validation and diff checks passed. Browser tests used an isolated synthetic NASA helper; a real NOAA web download succeeded, while a blocked direct CSS source retained the bundled orbit and provided a fallback path. No claim that live NASA's newest product was downloaded in this batch.
- Synced sources and HTML to the installed runtime; metadata is 0.68, codesign and launcher checks passed. Reloaded the local service on port 8771 while preserving the existing NASA image. Backup: output/runtime-backup-v0.67-to-v0.68. See docs/v0.68-details.md and docs/v0.68-resources.png.
- No commit, GitHub push or deployment in this batch. Published main/Pages remains v0.67 at 301642152be6212393a791a65cbe96f657cdb7cf; portable Release remains v0.38.

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

## 2026-10-28 — v0.64 cloud occlusion

- User clarified that dark night clouds must visibly obscure city lights. The option previously changed only moonlight, with identical occlusion in both states.
- Option now controls night extinction. Thick clouds suppress city emission, thin clouds transmit partially, off/zero-density restores clear night lights. Removed duplicate ground-level attenuation; retained daytime shading.
- Volume clouds use actual cloud sample depth to avoid covering foreground spacecraft. Tests cover both foreground and far-side markers.
- Full unit suite, offline/web builds, web asset checks and 109 browser checks passed; six output paths include brightest-city extinction at maximum exposure. Actual cloud-map on/off screenshots saved in output/playwright/cloud064-*.png. See docs/v0.64-details.md and validation JSON.
- User's latest-version publication authorization remains in effect; NASA features remain unchanged.
- Local runtime synced with SHA-256 checks; app version/signature and launcher verified at 0.64 on port 8771.

## 2026-10-28 — v0.65 revised DFH-1 asset

- Replaced the active v0.03 satellite asset with the confirmed v0.10 complete metre-scale model: revised waist fittings, single horizon sensor, lower L roots, two Sun sensors and planar-relief plaque.
- Preserved the existing Y-up conversion, 5 viewer units/metre, mission orbits, attitude, spin and telemetry.
- Updated real-asset geometry/axes checks and bundled-resource byte-equality verification. Full tests and offline/web builds passed. See docs/v0.65-details.md and v0.65-validation.json.
- Local source/runtime update only; no commit, push or public release requested.

## 2026-10-28 — v0.65 publication

- User explicitly authorized uploading the latest version if it was not yet on GitHub. Remote main and Pages were verified at v0.64; the local v0.65 asset update had not been committed.
- Full npm test, fresh web build, exact bundled-resource checks and git diff --check passed. Independent subagent review verified the new GLB against the confirmed metre-scale source and found no blocking issues.
- Publishing the existing v0.65 batch through main and the existing Pages workflow. Portable Release remains v0.38. The initial local validation record now labels its publication state as historical.
- Next requested development direction: pass predictions and rendezvous/docking with an onboard camera view; implementation has not started in this publication task.

## 2026-10-28 — v0.66 plaque enamel perimeter

- Replaced the v0.10 GLB with its enamel r1 material repair: a separate red-base material removes painted highlights and border duplication all around the oval; original relief artwork and all geometry remain unchanged.
- Scene triangle count remains65,472. Full-perimeter sampling and model preview inspection completed; source GLB SHA is recorded in docs/v0.66-details.md.
- Local update only; no public deployment requested.

- Plaque frame r2 supersedes enamel-only r1: connected gold frame, outer low / inner high, same outer footprint and inner opening, same triangle counts. Only model resources in the existing v0.66 builds were repackaged, preserving the concurrently completed Mission Lab build.

## 2026-10-28 — v0.66 mission lab

- Implemented site-based pass prediction (WGS84, bounded OEM or age-limited SGP4), sky tracks, optical-condition candidates, update/import controls and UTC calendar export. New GP imports retain validated source elements.
- Added isolated 400 km HCW docking training with cloned station/Shenzhou models, 50/200/500 m scenarios, body-frame thrust, ideal attitude controls, fixed centreline onboard camera, capture and approach-corridor rules. Main clock freezes while the modal is open; hide/close/blur clears held controls.
- Independent subagent review and real browser tests corrected contact-plane geometry, close-range camera parallax, stale SVG handling, multi-peak pass maxima and terminal-state wording. Full npm test, offline/web builds and resource checks passed; independent Skyfield maximum event difference 0.137 s (implementation agreement, not real-world accuracy).
- Preserved the concurrent DFH-1 plaque repair in this existing v0.66 batch. Synced the local runtime and signed application. Source, tests and documentation are uncommitted; no new publication was requested. See docs/v0.66-flight-lab.md and docs/v0.66-flight-lab-validation.json.

## 2026-10-28 — v0.67 orbit, rendering and forecast release

- User authorized GitHub and online deployment, including previously local v0.66 work. NASA cloud-source UI investigation was explicitly dropped.
- Audited the active user CSS ephemeris against all 2521 official OEM rows and independent SGP4/frame checks; bundled the verified Oct28–Nov4 snapshot.
- Fixed far-overview cloud depth quantization, repeated Previous-event navigation, and replaced the polar pass chart with direction/time stages, elevation curve and an interactive time readout.
- Full tests, offline/web builds and resource checks passed; real-browser depth A/B, 55 cloud occlusion checks, timeline, translations and 390 px layout passed. See docs/v0.67-details.md and docs/v0.67-validation.json.
- Preserve the concurrent v0.66 DFH-1 plaque frame repair (asset hash in v0.66 details). Portable Release remains v0.38.
