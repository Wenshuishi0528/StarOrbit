# 2025 native 15-arcsecond night lights

StarOrbit v1.36 uses the 2025 annual NASA Black Marble **VJ146A4.002**
`AllAngle_Composite_Snow_Free` radiance layer as its default night-light source.
The [project material notes](../../../素材与迁移说明.md) describe the historical
2016 and 2024 options, which remain selectable.

## Source and attribution

- [NASA VJ146A4 annual-product documentation](https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VJ146A4).
- [Jurij Stare / lightpollutionmap.info documentation, FAQ 30](https://www.lightpollutionmap.info/help.html).
- [Public 2025 raw GeoTIFF ZIP](https://www2.lightpollutionmap.info/data/v2/viirs_2025_raw.zip): 973,526,576 bytes; extracted GeoTIFF 1,034,233,344 bytes.

Attribution: **NASA's Black Marble nighttime lights product; Jurij Stare,
www.lightpollutionmap.info**. The distributor identifies the original NASA raw
data as CC0. The project's noncommercial software license does not replace the
source-data terms. This is radiance data, not the distributor's rendered sky
brightness/light-pollution map.

## Coverage and processing

The source has 86400 × 33600 float32 samples in **EPSG:4326**, 15 arcseconds per
pixel, from 180°W to 180°E and **75°N to 65°S**. The nominal 500 m label means
approximately 464 m north–south at the equator; east–west distances vary with
latitude. Native source samples are retained inside that coverage.

The polar caps use **NASA Black Marble 2016, approximately 1 km** observations.
Those pixels are bilinearly resampled to the display grid; they are neither
2025 observations nor native 500 m detail. Missing observations inside the
2025 footprint display black.

The display grid is 86400 × 43200, divided into **48 × 24** tiles. Each tile has
1800 × 1800 core pixels plus an 8-pixel gutter on every side (1816 × 1816 stored).
Longitude gutters wrap at the date line and latitude gutters clamp at the poles.
The same fixed logarithmic radiance curve as the 2024 atlas is used; warm light
colour is added by the renderer, without artificial light points or sharpening.

All 1152 detail tiles and four base maps use **AVIF, quality 92, speed 8, 4:4:4,
8-bit**, totalling **132,360,045 bytes**. Base sizes are 1024 × 512, 2048 × 1024,
4096 × 2048 and 8192 × 4096. Four detail slots are retained on the GPU; the full
native global raster is never decoded as one runtime texture.

[manifest.json](manifest.json) records the source hash, geographic coverage,
projection, display curve, encoding settings and SHA-256 of every AVIF file.
The preparation script `scripts/prepare-night-2025.py` reads bounded
GeoTIFF windows and encodes tiles through a temporary byte mosaic. Raw source
archives, the TIFF and the temporary mosaic are not runtime assets.

The default migrates once to 2025; a later explicit choice of either old source
survives reload. The two historical atlases are unchanged.
