# Fixed minimap display

`display.avif` preserves the v0.91 bright display palette from `../simple/day.jpg` (NASA Blue Marble; existing Earth asset credits apply). The Natural Earth public-domain coastline already retained in `../day-2026-q2-500m/coastline.geojson.gz` removes the old north-polar ocean white band while preserving land. Blue Arctic water is a navigation-map convention, not seasonal sea-ice data.

Reproduce with `python3 scripts/prepare-minimap-display.py`. The build embeds this explicit file. Earth source, year and quality do not select it. The independent solar night mask is unchanged: 0° to −6° twilight and 72% deep-night opacity. No terminator outline.
