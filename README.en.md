# StarOrbit · 星轨

**Space & Orbit Simulator · Observe, assemble and fly spacecraft above Earth**

[中文](README.md) | English

[**Launch in your browser**](https://wenshuishi0528.github.io/StarOrbit/) · [Download a portable release](https://github.com/Wenshuishi0528/StarOrbit/releases/latest) · [User manual (Chinese)](使用说明.md) · [Technical references](docs/README.md) · [Changelog](CHANGELOG.md)

StarOrbit brings spacecraft models, orbital motion, Earth's environment and interactive controls into a shared 3D scene. Assemble the China Space Station, watch its solar arrays track the Sun, and follow its orbit through day and night. Switch to Dong Fang Hong 1 to explore historical orbit reconstruction, spin and simulated telemetry, or import your own spacecraft. The Mission Lab adds site-based pass forecasts and a rendezvous and docking workbench.

The application supports space exploration, educational demonstrations and scene photography. Public orbital records, astronomical calculations and historical sources provide the basis for the simulation; interactive models make the resulting motion and geometry visible.

![China Space Station, independent Xuntian, orbital readings and ground track in StarOrbit](docs/hero.jpg)

*China Space Station scene with configurable modules, solar arrays, clouds, sky labels, orbital readings and an event timeline.*

**Author: wenshuishi0528 · Current source: v0.80 · Original content: [CC BY-NC 4.0](LICENSING.md)**

> This page describes the current source. The online edition deploys from `main`; its header identifies the deployed version. Check the portable release's tag and release notes for the features included in that download.

## Contents

- [Get started](#get-started)
- [Interface and basic controls](#interface-and-basic-controls)
- [Spacecraft and missions](#spacecraft-and-missions)
- [Station assembly and solar arrays](#station-assembly-and-solar-arrays)
- [Orbits, time and attitude](#orbits-time-and-attitude)
- [Earth, sky and environment](#earth-sky-and-environment)
- [Mission Lab](#mission-lab)
- [Data and resources](#data-and-resources)
- [Photography, scenes and preferences](#photography-scenes-and-preferences)
- [Data and simulation models](#data-and-simulation-models)
- [Local use and development](#local-use-and-development)
- [Documentation, credits and licensing](#documentation-credits-and-licensing)

## Get started

1. Open the [online simulator](https://wenshuishi0528.github.io/StarOrbit/) and wait for its models and environment to load.
2. Choose the introductory tour, or use **Help** at the upper right to find controls and replay the tour later.
3. Select the China Space Station or Dong Fang Hong 1 in the mission selector. Drag to rotate and use the wheel to zoom.
4. Open the orbit and time panel. Try spacecraft follow or Earth orbit overview, pause the simulation, change the date or accelerate playback.
5. Open **Mission Lab** for pass forecasts and docking practice, or explore the Earth and sky settings.

First use defaults to standard 4K overall quality and the enhanced 16K Milky Way. For lower rendering load, choose 2K overall quality and the ordinary sky mode. Detailed textures and effects load on demand, so the first switch may take a moment.

| Edition | How to open it | Resources and updates |
| --- | --- | --- |
| Online | Visit the launch link | Initial loading needs a connection. Includes orbital and cloud snapshots and supports file import; some processing requires the local service |
| Portable | Extract a release archive and open `StarOrbit.html` | Embedded assets support offline use. Features follow the release version |
| Local service | Use a bundled launcher or start the service from source | Supplies endpoints for NASA cloud processing and official orbit updates; downloading needs a connection |
| Source | Install dependencies, build and run | Uses the current code and allows changes to the application or assets |

## Interface and basic controls

| Area | Purpose |
| --- | --- |
| Left sidebar | Mission, time, environment, assembly, solar arrays, attitude and scene files; sections collapse independently |
| 3D viewport | Left-drag rotates, right-drag pans, wheel zooms. Touch supports one-finger rotation and two-finger zoom/pan |
| Orbital readout | Simulation time, spherical altitude, orbital speed, illumination, effective solar exposure and coordinates |
| Ground-track map | Current position, past and future tracks, and the region below the spacecraft |
| Event timeline | Sunlight, penumbra, umbra, apsides and equator crossings; select events or move through time |
| Upper-right tools | Mission Lab, Data & resources, Help and preset views; some entries move into Tools on narrow screens |
| Lower-left player | Background music, or DFH-1 recordings and simulated telemetry |

The interface supports Chinese, English, Russian and French. Date/time input uses **UTC+8**; UTC epochs from orbital files are identified separately.

## Spacecraft and missions

### China Space Station

Explore Tianhe, Wentian, Mengtian, Shenzhou, Tianzhou and Xuntian models. Select a complete assembly, the three-module station or Tianhe alone, then configure docking ports and solar arrays individually.

The station uses published OEM position and velocity records. Spacecraft follow is useful for close observation; Earth orbit overview shows the orbit, spacecraft position and ground track together.

### Dong Fang Hong 1

DFH-1 has its own model, orbit, attitude and audio experience:

- **Historical and modern orbits:** Before 2000, the scene uses a reconstruction constrained by reported orbital parameters and historical pass times. From 2000-01-01 00:00 UTC+8, it uses the selected modern orbital data.
- **Spin and orientation:** Choose prograde-follow or inertially fixed orientation, enable the historical nominal 120 rpm spin, and add manual three-axis attitude offsets.
- **Broadcast and telemetry:** Play the bundled historical recording, or listen to modeled Sun-sensor, infrared horizon-sensor and experimental sequence signals while watching their response to illumination and attitude.

The historical orbit is a source-constrained reconstruction. Live telemetry is generated by reference sensor models. See the [historical orbit notes](docs/v0.78-details.md) and [telemetry model](docs/v0.55-details.md) for their sources and assumptions.

### Custom spacecraft

Download the configuration template, prepare a JSON configuration, a GLB with embedded geometry/textures and its configured orbit file, then select them together with **Import spacecraft**. A model-only mission is also supported.

Each mission retains its own orbit, attitude, spin and camera. Earth, clouds, aurora, sky and simulation time are shared. See the [import instructions](使用说明.md#导入航天器) and [configuration format](docs/v0.30-details.md).

## Station assembly and solar arrays

### Configurable assemblies

Choose a preset or assign modules to individual ports. Multiple instances of a spacecraft type are allowed. Added Tianhe cores attach through their aft ports and expose their own node ports for further expansion; the sidebar groups controls by core.

Focus the selected module for inspection. Independent Xuntian is a companion model for a co-orbital scene. Replacing a parent core removes its attached branch, so export a scene first if you want to keep that assembly.

### Automatic and manual array control

Automatic tracking uses each array's mounting orientation and rotational constraints. Optional body/array occlusion allows the exposure calculation to account for shadows cast by the assembly.

Manual controls provide module selection, assembly and panel angles, linked or independent left/right panels, and Wentian/Mengtian linking. A manual adjustment exits global automatic tracking; enable tracking again to resume it.

**Total effective solar exposure is an area-weighted geometric fraction** for the blue front faces of the panels, combining incidence angle, occlusion and the visible fraction of the Sun. Arrays continue tracking through eclipse while direct exposure falls to zero. See the [solar-array model](使用说明.md#太阳翼与受光).

## Orbits, time and attitude

### Time

Use real time, a custom date, pause, or playback up to 1000×. The combined input follows year, month, day, hour, minute and second order: left/right arrows select a field; up/down arrows adjust it. Both 12-hour and 24-hour display are supported. Step by one second, one minute, ten minutes or one hour across dates.

### Tracks and events

Orbit overview shows the path around Earth, while the minimap shows its ground track. Click the displayed track or drag its current position to seek a valid time along it, preserving the existing play/pause state.

The event timeline offers 3-, 12- and 24-hour windows with sunlight, penumbra and umbra bands, apsides and equator crossings. Filter event types, move to previous/next events, preview shortly before an event, or pause when reaching it.

### Attitude

Roll, pitch and yaw controls provide ±180° manual offsets with synchronized numeric inputs and sliders. Offsets apply relative to the active mission reference: ground-track orientation for the station, or prograde/inertial orientation for satellites. Resetting attitude clears the offsets while retaining the orbit and time.

## Earth, sky and environment

Environment settings persist across spacecraft switches.

| Component | Features |
| --- | --- |
| Earth and Moon | Four Earth quality levels; day/night, twilight, atmosphere, ocean reflections and city lights; time-dependent Moon position and phase with a look-at/return view |
| Surface detail | In 8K mode, view-dependent NASA surface and night-light tiles add detail for close observation |
| Clouds | Bundled imagery, Live Cloud Maps, NASA SATCORPS, historical snapshots or local generation; optional 8K volumetric and evolving clouds |
| Night-side clouds | Cloud coverage can obscure city lights, with stronger occlusion under thicker clouds |
| Aurora | NOAA OVATION snapshots or local distribution; volumetric curtains in 8K and the classic effect in 4K |
| Stars and constellations | 41,411 catalogue stars and native 16K NASA Milky Way source imagery; star labels and names, lines and boundaries for 88 constellations |
| Geography | Countries, capitals, cities, borders, seas, mountains, rivers and lakes, with density and hierarchy controls |
| Atmospheric phenomena | Simulated cloud lightning, high-altitude flashes, airglow and meteors; natural or enhanced presentation |

Overall quality and sky quality are independent. Automatic performance protection adjusts sampling for some effects. Cloud shapes, atmospheric events and enhanced exposure are visual representations; see the [environment guide](使用说明.md#地球星空与环境) for source dates and resolution details.

## Mission Lab

Open **Mission Lab** at the upper right. The main scene stops advancing while the lab is open and resumes on return. Docking has an independent training clock.

### Pass forecasts

Calculate when and where to look for the selected spacecraft from a specified location.

1. Select a spacecraft in the main scene, then open the pass forecast tab.
2. Enter location, coordinates, altitude, start time, duration and minimum elevation.
3. Select a pass to see when it enters the elevation threshold, reaches its maximum elevation and leaves the threshold, with directions for each stage.
4. Inspect the elevation-over-time curve and slider. Export an ICS calendar, or jump to the main scene when the orbit coverage supports it.

Candidate viewing windows combine spacecraft sunlight and ground twilight conditions. Forecasting requires valid OEM coverage or SGP4 elements within the allowed epoch interval. Weather, terrain obstruction and apparent brightness require separate assessment. Refresh expired orbital data or choose a covered time interval.

### Rendezvous and docking

Practice relative motion, thrust and attitude control while approaching a station port.

| Scenario | Starting conditions |
| --- | --- |
| Final alignment | About 12 m from the port, for final alignment and capture |
| Standard approach | 200 m, for staged approach and hold-point clearance |
| Offset recovery | 50 m with lateral and attitude offsets |
| Random position | Random position and attitude 50–500 m in front of the port; restarting draws a new setup |

**First exercise:** Choose final alignment, leave beginner assistance enabled, select assisted approach and start. When applicable hold checks remain stable, use GO to continue.

With assistance enabled, use manual control, assisted approach, position hold or retreat, with teaching hold points. Disabling assistance enables manual thrust and rotation while removing automatic control, damping, relative braking, hold points and teaching range restrictions. Motion continues after releasing the controls.

Use the external camera for an overall view or the port-aligned docking camera for alignment. Instruments show distance, closing speed, lateral offsets, attitude and angular rate. Large view and Fill window provide more space for the viewport. Review the recorded flight and export JSON or CSV after training.

The contact-speed limit defaults to **0.15 m/s**, is adjustable, and applies to total relative speed at contact. The workbench uses an educational relative-motion and port-contact model. See the [docking manual](使用说明.md#交会对接训练) for keyboard controls, mode differences and capture criteria.

## Data and resources

**Data & resources** manages clouds, aurora and the current mission's orbit. It distinguishes downloaded data, active data, check time and check outcome. Check resources separately or together.

| Data | Main source | Use |
| --- | --- | --- |
| Station orbit | China Manned Space Engineering Office / BACC OEM | Interpolation within records; Kepler continuation outside coverage |
| Modern DFH-1 orbit | CelesTrak, NORAD 4382 | SGP4 propagation from GP/OMM elements |
| Global clouds | Live Cloud Maps / EUMETSAT; NASA Langley SATCORPS | Download and apply a snapshot, retain history or import files |
| Aurora distribution | NOAA SWPC OVATION | Forecast distribution controls geographical activity and intensity |

Online NASA cloud processing needs the local service; web users can import processed snapshots. Connection or source failures preserve existing data and appear as failed checks.

History supports favorites, export, import and cleanup by type. Automatic cache cleanup protects active data, favorites and settings references. Orbits are stored per mission; environment resources are reused. See the [resource guide](使用说明.md#数据更新与缓存).

## Photography, scenes and preferences

### Capture and share

Photography mode hides the interface for framing a scene. Save a screen capture or a 4K-wide PNG, use fixed exposure, or store an environment/camera favorite with its time and view.

Export a `.starorbit.json` scene to preserve the mission, assembly, arrays, attitude, time, cameras and environment. Orbital data is embedded; downloaded weather is referenced by snapshot identifier. Transfer matching weather snapshots separately when reproducing an exact scene.

### Music and languages

Ordinary missions have six bundled tracks, with import, ordering, removal, volume and seeking controls. Playback starts with a random track and repeats the playlist. Hover over the lower-left note to open the player; click Play if the browser blocks autoplay.

DFH-1 uses its dedicated recording or modeled telemetry. Returning to another mission restores the ordinary playlist position. Chinese, English, Russian and French are available, with the language preference saved independently.

### Saved settings

Assembly, attitude, time mode, cameras, environment and panel state are stored for the current browser and address. Use scene files to transfer settings between browsers or online/local addresses.

Factory reset clears preferences and the assembly while retaining downloaded snapshots and favorites. The public visit counter reports visits to the official web edition; the local edition reads the same number. See the [counter notes](docs/v0.53-details.md).

## Data and simulation models

| Component | Basis | Interpretation |
| --- | --- | --- |
| Station orbit | OEM positions/velocities and interpolation | Kepler continuation outside coverage; pass forecasts enforce their own validity checks |
| Modern satellite orbit | Public elements and SGP4 | Accuracy depends on epoch and propagation interval; source and time are shown in the interface |
| Historical DFH-1 orbit | Reported geometry, approximate launch-plane prior and multiple historical pass times | A historical reconstruction with illustrative extrapolation outside its fitted period |
| Sun, Earth rotation and eclipse | Astronomy calculations, frame transformations and apparent-disc overlap | Earth is a 6371 km sphere; altitude and coordinates use spherical/geocentric conventions |
| Attitude and arrays | Mission reference directions, manual offsets, axis constraints and sampled occlusion | Exposure is a geometric fraction; electrical power also depends on cell efficiency, temperature and other factors |
| Docking | HCW motion around a 400 km circular reference orbit, quaternion attitude and finite thrust | An educational model with finite port contact and optional assistance rules |
| Clouds, aurora and phenomena | Source maps or forecast distributions combined with procedural rendering | Volume and evolution are visual approximations; atmospheric events are simulated |
| Surface, night lights and sky | NASA historical composites, a stellar catalogue and Milky Way imagery | Source dates remain relevant; sky brightness uses a display mapping |

Source documents, assumptions and validation records are linked from the [technical reference index](docs/README.md).

## Local use and development

Build with **Node.js 18+**. **Python 3** is used by the local service and some tests. CI uses Node.js 22.

```sh
git clone https://github.com/Wenshuishi0528/StarOrbit.git
cd StarOrbit
npm ci
npm run build
python3 scripts/serve.py --open
```

The build generates portable `StarOrbit.html` and a lightweight local entry with resources. The service supplies local resource and update endpoints. macOS users can also use `启动星轨.command`. For optional NASA cloud processing, install:

```sh
python3 -m pip install -r scripts/cloud-requirements.txt
```

| Command | Purpose |
| --- | --- |
| `npm test` | Orbital, environmental, assembly, attitude, data and Mission Lab checks |
| `npm run build` | Portable and local builds |
| `npm run build:local` | Lightweight local entry and resources |
| `npm run build:web` | Static web build in `dist/` |

Application code is in `src/`, runtime assets in `assets/`, the build entry in `build.mjs`, and service/update scripts in `scripts/`. Raw asset preparation is needed when replacing the corresponding resources. Repository ZIPs contain source; portable HTML is distributed through release assets.

## Documentation, credits and licensing

- [User manual (Chinese)](使用说明.md): procedures, shortcuts, settings and troubleshooting.
- [Technical reference index](docs/README.md): orbit, assembly, environment, telemetry, training and resource processing.
- [Changelog](CHANGELOG.md): version changes and validation references.
- [Asset notes](素材与迁移说明.md): sources, processing and third-party notices.

### Credits

| Content | Source and attribution |
| --- | --- |
| Base Earth textures | [Solar System Scope / INOVE](https://www.solarsystemscope.com/textures/), CC BY 4.0 |
| Detailed surface and night lights | [NASA Blue Marble Next Generation](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/) and [Black Marble 2016](https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/), NASA Earth Observatory; Suomi NPP / VIIRS for night lights |
| Milky Way | [NASA SVS Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851/), NASA/Goddard Space Flight Center Scientific Visualization Studio, Ernie Wright; Gaia DR2: ESA/Gaia/DPAC |
| Moon | [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), NASA SVS / Ernie Wright; LRO / LROC |
| Catalogue and sky styling | [d3-celestial / XHIP](https://github.com/ofrohn/d3-celestial), BSD 3-Clause; styling adapted from [StarSky Studio](https://github.com/Wenshuishi0528/StarSkyStudio), CC BY 4.0 |
| Clouds | [Live Cloud Maps](https://github.com/matteason/live-cloud-maps), Contains modified EUMETSAT data; [NASA Langley Cloud and Radiation Research Group](https://satcorps.larc.nasa.gov/) |
| Aurora | [NOAA SWPC OVATION](https://www.swpc.noaa.gov/products/aurora-30-minute-forecast) |
| Orbits | [CMSEO / BACC](https://en.cmse.gov.cn/news/202107/t20210722_48418.html), [CelesTrak](https://celestrak.org/NORAD/elements/gp.php?CATNR=4382&FORMAT=JSON) |
| Geography and music | Dataset and recording sources in the [asset notes](素材与迁移说明.md); China outlines use public Tianditu vector data |
| Libraries | Three.js, Astronomy Engine, satellite.js, three-mesh-bvh and other dependencies retain their notices |

Original code, models, interface and documentation that the author has rights to license use **[CC BY-NC 4.0](LICENSE)**. Commercial use requires separate prior written permission. Third-party libraries, data, music and textures retain their respective terms. See the [licensing scope](LICENSING.md).
