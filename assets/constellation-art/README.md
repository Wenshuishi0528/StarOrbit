# Constellation illustrations / 星座示意绘图

85 illustrations cover all 88 IAU constellation IDs. The complete Argo Navis
drawing is shared by Carina/Puppis/Vela; Ophiuchus and Serpens share the serpent
bearer drawing. Shared illustrations must be drawn only once. These are artistic
figures aligned to HIP stars, not photographs or official IAU boundary polygons.

Original art: **Johan Meuris / Stellarium Project**, **Free Art License 1.3**.
Source culture: [Stellarium modern at daace2add6a1bf886e8ee1934f51e9c69f818d18](https://github.com/Stellarium/stellarium/tree/daace2add6a1bf886e8ee1934f51e9c69f818d18/skycultures/modern).
The [official Web culture's author credits](https://github.com/Stellarium/stellarium-skycultures/blob/master/western/description.md)
identify Johan Meuris. Upstream modern data and anchor positions: **CC BY-SA 4.0**.
The existing StarOrbit HIP coordinates keep their existing catalogue attribution.

Conversions by **Wenshuishi**: original 128/256/512 dimensions retained; grayscale
intensity becomes continuous straight alpha over white RGB; AVIF quality
95, 4:4:4. No thresholding, upscaling, positional adjustment or
repainting. Source and derivative SHA-256 hashes are in manifest.json.

**These assets are excluded from the enclosing application's CC BY-NC license.**
The modified images remain under Free Art License 1.3; this derived placement
manifest remains under CC BY-SA 4.0. Keep this directory, its originals' links
and the complete LICENSE-FAL-1.3.html / LICENSE-CC-BY-SA-4.0.txt accessible and
separable when distributing the application, including an embedded/offline HTML.
Do not restrict reuse of these individual assets to noncommercial use.

The bundled FAL HTML is the unmodified official license page; upstream-description.md
preserves the source culture's license declaration. Rebuild with:

```sh
python3 scripts/prepare-constellation-art.py
python3 scripts/prepare-constellation-art.py --offline
```

The script downloads only the pinned metadata and 85 tiny originals into ignored
output/constellation-art-work/upstream. It joins all 255 anchors to assets/stars.json
and measures alpha error, including faint 1–12/255 strokes, after encoding.

图案是与真实恒星对应的艺术示意，不是星座的物理外形或官方天区边界。全部
88 个星座均有映射；南船三座及巨蛇/蛇夫共用原作，不能重复叠加。图片与定位
数据保留以上各自的自由许可证，不受本软件非商业许可的额外限制。
