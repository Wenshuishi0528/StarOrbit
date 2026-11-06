# Built-in city terrain

These are small, geographically registered Sentinel-2 L2A surface-reflectance
patches for StarOrbit. They are **2025 low-cloud scenes selected by StarOrbit**,
with same-year scenes used only to fill cloud or missing-data gaps. They are not
an official annual mosaic and are not live imagery.

| City | Centre (longitude, latitude) | Ground extent | Working raster | Native source |
| --- | --- | --- | --- | --- |
| Beijing | 116.3974, 39.9093 | 40 × 40 km | 4000 × 4000 | Sentinel-2, 10 m |
| Seattle | −122.3321, 47.6062 | 20 × 20 km | 2000 × 2000 | Sentinel-2, 10 m |

The distributed pack contains 106 AVIF tiles, 6,027,707 bytes in total
(5.7485 MiB), at quality 80 with 4:4:4 colour. Beijing has 16,000,000 valid
working pixels; Seattle has 3,999,999 of 4,000,000. The one remaining source
no-data pixel stays transparent instead of being invented. Seattle's January
fallback contributes only 2,255 pixels (0.0564%); the primary July observation
supplies 99.9276% of the image.

The north-up WGS84 rectangles have the requested geodesic width and height
through their centre. Ground sampling changes slightly across each rectangle.
The exact bounds, contributing acquisition dates, pixel counts, original STAC
records, asset URLs, publisher checksums and tile SHA-256 hashes are in
[`manifest.json`](manifest.json). Original data and intermediate crops are not
distributed in this directory.

## Sources and permission

Original imagery is the [Element 84 / Earth Search Sentinel-2 C1 L2A COG
collection](https://registry.opendata.aws/sentinel-2-l2a-cogs/). Its registry
explicitly links the [Copernicus Sentinel Data Legal
Notice](https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice),
which permits reproduction, distribution, adaptation and combination with other
data. The required modified-data attribution is preserved in the manifest:

> Contains modified Copernicus Sentinel data (2025).

COG conversion and hosting: Element 84 / Earth Search. Cloud-mask selection,
geographic crop and display conversion: StarOrbit. The source data are not
relicensed as software, and these images do not imply ESA or EU endorsement.

Candidate scenes, in priority order:

- Beijing: [2025-07-30](https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a/items/S2B_T50TMK_20250730T031615_L2A),
  followed by [2025-11-04](https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a/items/S2A_T50TMK_20251104T031151_L2A).
- Seattle: [2025-07-08](https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a/items/S2B_T10TET_20250708T191951_L2A),
  followed by [2025-09-23](https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a/items/S2B_T10TET_20250923T190651_L2A)
  and [2025-01-19](https://earth-search.aws.element84.com/v1/collections/sentinel-2-c1-l2a/items/S2B_T10TET_20250119T191626_L2A).

Only contributing scenes are included in the shipped manifest. A fallback scene
never overwrites a valid primary-scene pixel. All three colour bands at a pixel
come from the same observation.

## Radiometry and coverage

The source bands are B04/B03/B02 (red/green/blue), native 10 m. Their STAC
metadata states `reflectance = DN × 0.0001 − 0.1`, with raw DN 0 as no-data.
We retain this scale and offset, clamp reflectance to [0, 1], then apply the
standard sRGB transfer function. There is no exposure gain, local histogram
stretch, sharpening, generated detail, or use of an already-brightened TCI image
as terrain albedo. This matches StarOrbit's linear-reflectance terrain convention.

Scene classification is read at its native 20 m resolution. Classes 2, 4, 5, 6
and 7 are usable; classes 0, 1, 3, 8, 9, 10 and 11 are excluded. A 5 × 5 maximum
filter adds a conservative 40 m margin around excluded classifications. RGB is
bilinearly reprojected to the WGS84 working raster; the classification mask uses
nearest-neighbour sampling. Missing coverage remains transparent. Dark water
remains valid even when its displayed reflectance clamps to zero.

## Tiling and reproducibility

Each AVIF is 512 × 512 pixels: a 504 × 504 core and a 4-pixel gutter on every
side. For level `z`, there are `2^z` tiles across each axis; `x` runs west to east,
`y` runs north to south. Beijing includes levels 0–3, Seattle levels 0–2.
All levels use the same observations and radiometric conversion. Downsampling
averages linear reflectance weighted by valid coverage, before sRGB encoding.
Outer gutters repeat the nearest edge samples; internal gutters share source
samples with their neighbours. Alpha describes valid image coverage.
Transparent holes retain zero alpha; only their otherwise invisible RGB is
extended from nearby valid samples to avoid black fringes in GPU mipmaps.

Rebuild from the repository root:

```sh
python3 scripts/prepare-city-terrain.py --quality 80
```

Dependencies: NumPy, Rasterio, pyproj, requests and Pillow with AVIF support.
`--fetch-only` prepares the original working crops without writing any tiles.
The script reads only the relevant COG windows, not entire satellite scenes.
Source SCL files are a few MB each and are cached with their published SHA-256
verified. RGB requests may use the standard AWS global endpoint for the same
public bucket and object key; both it and the publisher's canonical regional
URL are retained in the manifest.
Downloads and source records are cached under
`output/earth-city-source-work/native-scenes/`, which is outside the distributed
assets. After an intentional scene order or masking recipe change, remove that
city's intermediate crops, composite and source record to fetch the new recipe.
Encoder settings and checksums are recorded in
the manifest; byte-for-byte AVIF output also depends on the Pillow/libavif version.

The separate on-demand city downloader may use Earth Genome's publicly licensed
2025 annual mirror. That mirror is a different product and can have a different
effective pixel size; its timestamps and quality claims must not be inferred
from these built-in packs or from the newer Earth Genome v4 STAC assets.
