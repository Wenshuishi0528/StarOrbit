// CelesTrak's SATCAT and Space-Track GP records supply different parts of the
// same description. Keep filters independent of the renderer and of orbit time.
export const SATELLITE_GROUPS = Object.freeze(['regular', 'internet']);
export const SATELLITE_OBJECT_TYPES = Object.freeze([
  'payload',
  'rocket-body',
  'debris',
  'unknown',
]);
export const SATELLITE_PURPOSES = Object.freeze([
  'communications',
  'navigation',
  'weather',
  'earth-observation',
  'science',
  'crewed',
  'technology',
  'other',
  'unknown',
]);
export const SATELLITE_FILTER_FIELDS = Object.freeze(['objectType', 'purpose', 'owner', 'decade']);

const normalized = (value) => value.normalize('NFKC').trim().toLowerCase();
const unknownValue =
  /^(?:unknown|unk|tba|tbd|n\/?a|unidentified(?: object)?|未知|待识别|[-–—?]+)$/i;
const typeAliases = Object.freeze({
  pay: 'payload',
  payload: 'payload',
  有效载荷: 'payload',
  'rocket-body': 'rocket-body',
  'rocket body': 'rocket-body',
  'r/b': 'rocket-body',
  rb: 'rocket-body',
  火箭体: 'rocket-body',
  箭体: 'rocket-body',
  deb: 'debris',
  debris: 'debris',
  碎片: 'debris',
});
const purposeAliases = Object.freeze({
  communication: 'communications',
  通信: 'communications',
  通信卫星: 'communications',
  导航: 'navigation',
  导航卫星: 'navigation',
  meteorology: 'weather',
  meteorological: 'weather',
  气象: 'weather',
  气象卫星: 'weather',
  'earth observation': 'earth-observation',
  'remote sensing': 'earth-observation',
  对地观测: 'earth-observation',
  遥感: 'earth-observation',
  scientific: 'science',
  科学研究: 'science',
  科学卫星: 'science',
  'human spaceflight': 'crewed',
  载人航天: 'crewed',
  'technology demonstration': 'technology',
  技术验证: 'technology',
  技术试验: 'technology',
  其他: 'other',
});
const broadbandConstellations = new Set([
  'starlink',
  '星链',
  'oneweb',
  'one web',
  '一网',
  '一网星座',
  'qianfan',
  '千帆',
  '千帆星座',
  'g60星链',
  '千帆极轨',
  'guowang',
  '国网',
  '国网星座',
  'hulianwang',
  'hulianwang digui',
  '卫星互联网低轨',
  '互联网低轨',
  'kuiper',
  'project kuiper',
  'amazon leo',
  '柯伊伯',
  '柯伊伯计划',
]);
const broadbandClasses = new Set([
  '低轨互联网卫星',
  '低轨卫星互联网',
  '低轨互联网星座',
  'leo internet',
  'leo broadband',
  'leo broadband satellite',
]);
const numberedPayload =
  /^(?:starlink|one\s?web|qianfan|guowang|hulianwang[ -]digui|kuiper(?:sat)?|amazon[ -]leo)[ _-]*[0-9]+(?:[a-z]|[- .][0-9]+)*(?:\s*\((?:dtc|direct[- ]to[- ]cell|visorsat|darksat)\))?$/;
const chinesePayload =
  /^(?:星链|一网|千帆(?:极轨)?|g60星链|国网(?:低轨)?|卫星互联网低轨|互联网低轨|柯伊伯)(?:星座)?(?:卫星)?[ _-]*(?:第)?[0-9零〇一二三四五六七八九十百千]+(?:组[ _-]*[0-9零〇一二三四五六七八九十百千]+)?(?:号星|号|星)?$/;
const debrisName =
  /\b(?:deb(?:ris)?|débris|fragment|dispenser|fairing|payload adapter)\b|残骸|碎片|整流罩|分配器|适配器|обломок|фрагмент/u;
const rocketName =
  /\b(?:r\s*[/.-]\s*b|rb|rocket[- ]body|upper stage|booster|corps de fusée)\b|火箭体|箭体|上面级|火箭末级/u;

function fields(records, ...keys) {
  const values = [];
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) values.push(value.trim());
    }
  }
  return values;
}

function launchDateYear(value) {
  const match =
    /^(\d{4})-(\d\d)-(\d\d)(?:[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)?)?$/i.exec(
      value
    );
  if (!match) return null;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  const midnight = new Date(Date.UTC(year, month - 1, day));
  if (year < 1957 || midnight.getUTCMonth() !== month - 1 || midnight.getUTCDate() !== day)
    return null;
  const hasTime = value.length > 10;
  const utc = hasTime && !/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value + 'Z' : value;
  const result = new Date(utc.replace(' ', 'T')).getUTCFullYear();
  return Number.isFinite(result) ? result : null;
}

function designatorYear(value) {
  const full = /^(\d{4})-\d{3}[A-HJ-NP-Z]{0,3}$/i.exec(value);
  if (full && Number(full[1]) >= 1957) return Number(full[1]);
  // Space-Track's compact INTLDES uses the TLE year convention (57–99 / 00–56).
  const compact = /^(\d{2})\d{3}[A-HJ-NP-Z]{1,3}$/i.exec(value);
  if (!compact) return null;
  const year = Number(compact[1]);
  return year + (year >= 57 ? 1900 : 2000);
}

function catalogObject(records, mission) {
  const declaredTypes = fields(records, 'objectType', 'OBJECT_TYPE').map(normalized);
  const literalTypes = declaredTypes.map((value) => typeAliases[value.replaceAll('_', ' ')]);
  const categories = fields(records, 'category').map(normalized);
  const catalogNames = fields(records, 'OBJECT_NAME');
  const names = (catalogNames.length ? catalogNames : fields([mission], 'name')).map(normalized);
  const markers = [...names, ...categories, ...declaredTypes];
  // Some GP feeds carry only a name. Source type and explicit debris/stage
  // suffixes always win over a launch-family name or a supplied network group.
  if (literalTypes.includes('debris') || markers.some((value) => debrisName.test(value)))
    return { group: 'regular', objectType: 'debris' };
  if (literalTypes.includes('rocket-body') || markers.some((value) => rocketName.test(value)))
    return { group: 'regular', objectType: 'rocket-body' };
  const explicitGroup = fields(records, 'satelliteGroup').find((value) =>
    SATELLITE_GROUPS.includes(value)
  );
  const catalogPayload =
    literalTypes.includes('payload') ||
    records.some((r) => r?.payload === true || r?.PAYLOAD_FLAG === '*');
  const pending =
    records.some((r) => r?.payload === false) ||
    (!catalogPayload && declaredTypes.some((v) => unknownValue.test(v)));
  const named = names.some((name) => numberedPayload.test(name) || chinesePayload.test(name));
  const branded =
    fields(records, 'constellation')
      .map(normalized)
      .some((v) => broadbandConstellations.has(v)) ||
    categories.some((v) => broadbandConstellations.has(v));
  const broadband =
    !pending &&
    (explicitGroup === 'internet' ||
      named ||
      (catalogPayload && branded) ||
      categories.some((v) => broadbandClasses.has(v)));
  return {
    objectType: catalogPayload || broadband ? 'payload' : 'unknown',
    group: broadband && explicitGroup !== 'regular' ? 'internet' : 'regular',
  };
}

function catalogPurpose(values) {
  for (const raw of values) {
    const code = normalized(raw).replaceAll('_', ' ');
    if (SATELLITE_PURPOSES.includes(code) && code !== 'unknown') return code;
    if (Object.hasOwn(purposeAliases, code)) return purposeAliases[code];
  }
  return null;
}

function sourceRecords(mission, orbit) {
  return [
    mission?.satelliteCatalog,
    orbit?.satelliteCatalog,
    orbit?.satcat,
    mission?.satcat,
    mission,
    orbit,
    orbit?.gp,
    mission?.gp,
    mission?.orbit,
  ];
}

export function satelliteMetadata(mission, orbit) {
  const records = sourceRecords(mission, orbit);
  const { group, objectType } = catalogObject(records, mission);
  const purpose =
    catalogPurpose(fields(records, 'purpose', 'PURPOSE')) ||
    (group === 'internet' ? 'communications' : null) ||
    (objectType !== 'debris' &&
      objectType !== 'rocket-body' &&
      catalogPurpose(fields(records, 'category'))) ||
    'unknown';
  const rawOwner = fields(records, 'owner', 'OWNER', 'COUNTRY', 'COUNTRY_CODE', 'countryCode').find(
    (value) => !unknownValue.test(value)
  );
  const owner = rawOwner ? ownerCode(rawOwner) : 'unknown';
  const dates = fields(records, 'launchDate', 'LAUNCH_DATE', 'LAUNCH');
  const ids = fields(records, 'objectId', 'OBJECT_ID', 'INTLDES');
  const launchYear =
    dates.map(launchDateYear).find(Number.isFinite) ??
    ids.map(designatorYear).find(Number.isFinite) ??
    null;
  return {
    group,
    objectType,
    purpose,
    owner,
    launchYear,
    decade: launchYear === null ? null : Math.floor(launchYear / 10) * 10,
  };
}

export function satelliteGroup(mission, orbit) {
  return catalogObject(sourceRecords(mission, orbit), mission).group;
}
export { satelliteGroup as groundSatelliteGroup };

function facetValue(metadata, field) {
  return metadata?.[field] ?? 'unknown';
}

// A select supplies strings, while a map's numeric decade selection can use
// numbers. Within one dimension multiple chosen values are alternatives.
export function matchesSatelliteFilters(metadata, filters = {}) {
  return SATELLITE_FILTER_FIELDS.every((field) => {
    const choice = filters?.[field];
    if (choice == null || choice === '') return true;
    const value = String(facetValue(metadata, field));
    if (!Array.isArray(choice)) return String(choice) === value;
    let restricted = false;
    for (const part of choice) {
      if (part == null || part === '') continue;
      restricted = true;
      if (String(part) === value) return true;
    }
    return !restricted;
  });
}

export function satelliteFacets(metadataList = []) {
  const counts = Object.fromEntries(SATELLITE_FILTER_FIELDS.map((field) => [field, new Map()]));
  for (const metadata of metadataList) {
    for (const field of SATELLITE_FILTER_FIELDS) {
      const value = facetValue(metadata, field);
      const bucket = counts[field];
      bucket.set(value, (bucket.get(value) || 0) + 1);
    }
  }
  const result = {};
  for (const field of SATELLITE_FILTER_FIELDS) {
    const order =
      field === 'objectType'
        ? SATELLITE_OBJECT_TYPES
        : field === 'purpose'
          ? SATELLITE_PURPOSES
          : null;
    result[field] = Array.from(counts[field], ([value, count]) => ({ value, count })).sort(
      (a, b) => {
        if (a.value === b.value) return 0;
        if (a.value === 'unknown') return 1;
        if (b.value === 'unknown') return -1;
        if (order) return order.indexOf(a.value) - order.indexOf(b.value);
        if (field === 'decade') return b.value - a.value;
        return a.value.localeCompare(b.value);
      }
    );
  }
  return result;
}

const facetLabels = Object.freeze({
  payload: '有效载荷',
  'rocket-body': '火箭体',
  debris: '碎片',
  communications: '通信',
  navigation: '导航',
  weather: '气象',
  'earth-observation': '对地观测',
  science: '科学研究',
  crewed: '载人航天',
  technology: '技术验证',
  other: '其他',
});

// The catalog's ownership codes are not ISO country codes. Joint ownership
// and historical/international organizations are distinct selectable values.
// https://celestrak.org/satcat/sources.php
const ownerRegions = Object.freeze({
  ALG: 'DZ',
  ANG: 'AO',
  ARGN: 'AR',
  ARM: 'AM',
  ASRA: 'AT',
  AUS: 'AU',
  AZER: 'AZ',
  BEL: 'BE',
  BELA: 'BY',
  BERM: 'BM',
  BGD: 'BD',
  BHR: 'BH',
  BHUT: 'BT',
  BOL: 'BO',
  BRAZ: 'BR',
  BUL: 'BG',
  BWA: 'BW',
  CA: 'CA',
  CHBZ: 'CN/BR',
  CHTU: 'CN/TR',
  CHLE: 'CL',
  COL: 'CO',
  CRI: 'CR',
  CZCH: 'CZ',
  DEN: 'DK',
  DJI: 'DJ',
  ECU: 'EC',
  EGYP: 'EG',
  EST: 'EE',
  ETH: 'ET',
  FGER: 'FR/DE',
  FIN: 'FI',
  FR: 'FR',
  FRIT: 'FR/IT',
  GER: 'DE',
  GHA: 'GH',
  GREC: 'GR',
  GRSA: 'GR/SA',
  GUAT: 'GT',
  HRV: 'HR',
  HUN: 'HU',
  IND: 'IN',
  INDO: 'ID',
  IRAN: 'IR',
  IRAQ: 'IQ',
  IRL: 'IE',
  ISRA: 'IL',
  IT: 'IT',
  JPN: 'JP',
  KAZ: 'KZ',
  KEN: 'KE',
  LAOS: 'LA',
  LKA: 'LK',
  LTU: 'LT',
  LUXE: 'LU',
  MA: 'MA',
  MALA: 'MY',
  MCO: 'MC',
  MDA: 'MD',
  MEX: 'MX',
  MMR: 'MM',
  MNE: 'ME',
  MNG: 'MN',
  MUS: 'MU',
  NETH: 'NL',
  NIG: 'NG',
  NKOR: 'KP',
  NOR: 'NO',
  NPL: 'NP',
  NZ: 'NZ',
  PAKI: 'PK',
  PERU: 'PE',
  POL: 'PL',
  POR: 'PT',
  PRC: 'CN',
  PRY: 'PY',
  PRES: 'CN/ESA',
  QAT: 'QA',
  ROC: 'TW',
  ROM: 'RO',
  RP: 'PH',
  RWA: 'RW',
  SAFR: 'ZA',
  SAUD: 'SA',
  SDN: 'SD',
  SEN: 'SN',
  SGJP: 'SG/JP',
  SING: 'SG',
  SKOR: 'KR',
  SLB: 'SB',
  SPN: 'ES',
  STCT: 'SG/TW',
  SVN: 'SI',
  SWED: 'SE',
  SWTZ: 'CH',
  THAI: 'TH',
  TMMC: 'TM/MC',
  TUN: 'TN',
  TURK: 'TR',
  UAE: 'AE',
  UK: 'GB',
  UKR: 'UA',
  URY: 'UY',
  US: 'US',
  USBZ: 'US/BR',
  VAT: 'VA',
  VENZ: 'VE',
  VTNM: 'VN',
  ZWE: 'ZW',
  // ISO codes also occur in authored mission packages.
  USA: 'US',
  CHN: 'CN',
  RUS: 'RU',
  GBR: 'GB',
  DEU: 'DE',
  FRA: 'FR',
});
const ownerOrganizations = Object.freeze({
  AB: '阿拉伯卫星通信组织',
  ABS: 'Asia Broadcast Satellite',
  AC: '亚洲卫星通信公司',
  CIS: '独联体（含前苏联）',
  ESA: '欧洲空间局',
  ESRO: '欧洲空间研究组织',
  EUME: '欧洲气象卫星组织',
  EUTE: '欧洲通信卫星组织',
  GLOB: '全球星',
  IM: '国际移动卫星组织',
  IRID: 'Iridium',
  ISRO: '印度空间研究组织',
  ISS: '国际空间站',
  ITSO: '国际通信卫星组织',
  NATO: '北大西洋公约组织',
  NICO: 'New ICO',
  O3B: 'O3b Networks',
  ORB: 'ORBCOMM',
  RASC: 'RascomStar-QAF',
  SEAL: '海上发射',
  SES: 'SES',
});
const knownRegions = new Set(Object.values(ownerRegions).flatMap((regions) => regions.split('/')));
const regionNames = new Map();
function ownerCode(raw) {
  const code = raw.toUpperCase();
  if (
    Object.hasOwn(ownerOrganizations, code) ||
    Object.hasOwn(ownerRegions, code) ||
    knownRegions.has(code)
  )
    return code;
  return raw;
}
function ownerLabel(code, language, translate) {
  if (Object.hasOwn(ownerOrganizations, code)) {
    const name = translate(ownerOrganizations[code]);
    return name === code ? code : name + ' (' + code + ')';
  }
  // Intl.DisplayNames accepts ISO alpha-2 regions only. Preserve an unfamiliar
  // catalogue identifier literally, including custom operating organizations.
  const regions = Object.hasOwn(ownerRegions, code) ? ownerRegions[code] : code;
  if (!Object.hasOwn(ownerRegions, code) && !knownRegions.has(code)) return code;
  try {
    if (!regionNames.has(language))
      regionNames.set(
        language,
        new Intl.DisplayNames([language], { type: 'region', fallback: 'none' })
      );
    const display = regionNames.get(language);
    const names = regions
      .split('/')
      .map((part) =>
        Object.hasOwn(ownerOrganizations, part)
          ? translate(ownerOrganizations[part])
          : display.of(part)
      );
    if (names.some((name) => !name)) return code;
    return names.join(' / ') + ' (' + code + ')';
  } catch {
    return code;
  }
}

const defaultTranslate = (key, values) => (values ? key.replace('{year}', values.year) : key);
export function satelliteFacetLabel(field, value, language = 'zh', translate = defaultTranslate) {
  if (value == null || value === 'unknown') return translate('未知');
  if (field === 'owner') return ownerLabel(String(value), language, translate);
  if (field === 'decade') return translate('{year} 年代', { year: value });
  return Object.hasOwn(facetLabels, value) ? translate(facetLabels[value]) : String(value);
}
