# 2026 Q2 MODIS native 500 m daytime atlas

Original source: NASA Terra+Aqua MCD43A4 Collection 6.1 NBAR, RGB bands 1/4/3, via [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/dataset/modis-43A4-061). [MODIS product guide](https://www.umb.edu/spectralmass/modis-user-guide-v006-and-v0061/mcd43a4-nbar-product/).

The same ten fixed observation centers as the 1 km atlas are used. Each source's complete 16-day acquisition window must remain inside April–June 2026. Source COGs are read at native 2400×2400 sinusoidal samples (~463 m), with band validity and mandatory QA filtering. Temporal medians prefer full BRDF inversions; magnitude inversion is used where full inversions are absent. There is no 2×2 spatial reduction, sharpening, synthetic detail or regional recolouring.

Output is EPSG:4326 at 15 arcseconds (~464 m north–south at the equator), 86400×43200 globally, split into 48×24 tiles with 1800-pixel cores and 8-pixel gutters. Linear reflectance is reprojected before sRGB display encoding. AVIF uses quality 90, speed 6 and 4:4:4 chroma; base maps use quality 92.

Coasts use [Natural Earth 1:10 million land](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/) and lake reference polygons (public domain), rasterized with 2x fractional coverage on the actual 500 m display grid. This is a cartographic coastline reference, not 10-metre imagery or a measured 2026 water boundary. Original archive hashes and full polygons are preserved in `coastline.geojson.gz`. Native 500 m land and mixed coastal detail remain; oceans, lakes and missing observations use the existing complete 1 km atlas, including its NASA Blue Marble fallback. Actual image inspection found coloured noise in Bohai water retrievals, so the land BRDF reflectance is not treated as an ocean-colour product. [NASA explains the uniform-blue deep-ocean representation in Blue Marble](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/). Water fallback is not claimed as new 500 m observations. Clouds, illumination and reflections are rendered separately by the application.

Data tooling: Python, numpy, rasterio, Pillow with AVIF, requests; pyshp is only needed to recreate the reference coastline with `scripts/prepare-day-coastline.py`.

Rebuild with `scripts/prepare-day-modis-2026.py --fetch --cadence 8day --resolution 500` into a separate temporary cache, then `scripts/assemble-day-500m.py --cache CACHE --work WORK`. Keep compressed provenance and final manifest; large native caches and disk-backed global work buffers can be removed after final checksum and visual checks.

Processing records: [display manifest](manifest.json), [original COG metadata and hashes](provenance.json.gz), [reference coastline polygons](coastline.geojson.gz), and [new-land coverage](coverage.png).

Final AVIF imagery: 276,680,665 bytes across 1,152 detail tiles and four base maps. The compressed source records and reference coast geometry are separate from runtime textures.
