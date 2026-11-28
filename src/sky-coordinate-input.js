import { equatorial } from './environment-math.js';

// A bare pair is in degrees. An hour marker or a colon explicitly makes the
// RA sexagesimal. Dec stays angular, including a minus on zero degrees.
export function parseSkyCoordinates(input) {
  const clean = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/−/gu, '-')
    .replace(/(?:j2000|icrs|赤经|赤纬|\bra\b|\bdec\b)\s*[=:]?\s*/gu, ' ')
    .replace(/[ʰ时]/gu, 'h')
    .replace(/[ᵐ分]/gu, 'm')
    .replace(/[ˢ秒]/gu, 's')
    .replace(/[度º]/gu, '°')
    .trim();
  let parts = clean.replace(/^·\s*/, '').split(/\s*[,，;；·]\s*/u);
  if (parts.length === 1) {
    const signed = /^(.*?)\s+([+-].+)$/.exec(clean);
    parts = signed ? signed.slice(1) : clean.split(/\s+/);
  }
  if (parts.length !== 2 || parts.some((p) => !p.trim())) return null;
  function angle(text, rightAscension) {
    const spaced = /^([+-]?\d{1,3})\s+(\d{1,2}(?:\.\d+)?)(?:\s+(\d{1,2}(?:\.\d+)?))?$/.exec(
      text.trim()
    );
    const token = spaced ? spaced.slice(1).filter(Boolean).join(':') : text.replace(/\s+/g, '');
    const plain = /^([+-]?\d+(?:\.\d+)?)([°dh]?)$/.exec(token);
    let value;
    if (plain) {
      if (plain[2] === 'h' && !rightAscension) return null;
      value = +plain[1] * (plain[2] === 'h' ? 15 : 1);
    } else {
      const sex =
        /^([+-]?\d+)([:h°d])(\d{1,2}(?:\.\d+)?)(?:[m'′:](\d{1,2}(?:\.\d+)?)[s"″]?)?[m'′]?$/.exec(
          token
        );
      if (!sex || +sex[3] >= 60 || +(sex[4] || 0) >= 60 || (sex[2] === 'h' && !rightAscension))
        return null;
      const unit = rightAscension && [':', 'h'].includes(sex[2]) ? 15 : 1;
      value =
        (Math.abs(+sex[1]) + +sex[3] / 60 + +(sex[4] || 0) / 3600) *
        unit *
        (sex[1].startsWith('-') ? -1 : 1);
    }
    return Number.isFinite(value) &&
      (rightAscension ? value >= 0 && value <= 360 : Math.abs(value) <= 90)
      ? value
      : null;
  }
  const ra = angle(parts[0], true),
    dec = angle(parts[1], false);
  if (ra === null || dec === null) return null;
  const degrees = ra % 360,
    name = `RA ${degrees.toFixed(4)}° · Dec ${dec.toFixed(4)}°`;
  return {
    id: `coord:${degrees},${dec}`,
    type: 'coordinate',
    category: '天球坐标',
    identifier: 'J2000',
    name,
    ra: degrees,
    dec,
    direction: equatorial(degrees, dec),
    fov: 6,
  };
}
