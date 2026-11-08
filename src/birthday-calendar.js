import { SearchSunLongitude, SunPosition } from 'astronomy-engine';

const DAY = 86400000;
export const BIRTHDAY_YEAR_RANGE = Object.freeze([1901, 2100]);
export const BIRTHDAY_RULES = Object.freeze({
  western: '回归黄道十二宫：按太阳视黄经每 30° 一宫，白羊宫从春分点起算。',
  chinese:
    '传统值日二十八宿：采用日支与七曜配日规则，按所填公历日期零点换日；不是出生时月亮所在的星宿。',
  source:
    'https://github.com/6tail/lunar-javascript/blob/5c92e62c904ba5cc0b62f032796aeef433702268/lunar.js',
});

function civilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw Error('请输入完整公历生日（年、月、日）。');
  const [year, month, day] = value.split('-').map(Number);
  if (year < BIRTHDAY_YEAR_RANGE[0] || year > BIRTHDAY_YEAR_RANGE[1])
    throw Error('生日支持 1901–2100 年。');
  const stamp = Date.UTC(year, month - 1, day);
  if (new Date(stamp).toISOString().slice(0, 10) !== value) throw Error('生日日期无效。');
  return stamp;
}

// Congruent with the published day-branch + weekday mapping of lunar-javascript
// 1.7.8 (commit pinned in BIRTHDAY_RULES). Its 1970-01-01 is Dou, index 7 when
// ordered Jiao..Zhen. This is a declared modern almanac convention, not a claim
// to recover the original ancient epoch. No lunar-month or 27-mansion table.
export function birthdayMansionIndex(date) {
  const days = civilDate(date) / DAY;
  return (((days + 7) % 28) + 28) % 28;
}

function sunLongitude(stamp) {
  return SunPosition(new Date(stamp)).elon;
}
function zodiacIndex(stamp) {
  return Math.floor(sunLongitude(stamp) / 30) % 12;
}
function lunarDateLabel(stamp) {
  // The label describes the entered civil date, independent of the computer's
  // timezone. It is informational and is not an input to the mansion rule.
  try {
    const formatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (formatter.resolvedOptions().calendar !== 'chinese') return '';
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(stamp + DAY / 2)).map((part) => [part.type, part.value])
    );
    const day = Number(parts.day),
      digits = '一二三四五六七八九',
      dayName =
        day === 10
          ? '初十'
          : day === 20
            ? '二十'
            : day === 30
              ? '三十'
              : day < 10
                ? '初' + digits[day - 1]
                : day < 20
                  ? '十' + digits[day - 11]
                  : '廿' + digits[day - 21];
    if (!parts.month || !Number.isInteger(day) || day < 1 || day > 30) return '';
    return '农历' + (parts.yearName ? parts.yearName + '年' : '') + parts.month + dayName;
  } catch {
    return '';
  }
}

export function birthdayCalendar({ date, time = '', utcOffset = 8 } = {}) {
  const stamp = civilDate(date);
  if (
    !Number.isFinite(utcOffset) ||
    utcOffset < -12 ||
    utcOffset > 14 ||
    !Number.isInteger(utcOffset * 4)
  )
    throw Error('请选择有效 UTC 时差（−12 至 +14 小时）。');
  if (typeof time !== 'string' || (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)))
    throw Error('出生时间应为 00:00–23:59；不清楚可留空。');
  const start = stamp - utcOffset * 3600000,
    end = start + DAY - 1,
    first = zodiacIndex(start),
    last = zodiacIndex(end),
    candidates = first === last ? [first] : [first, last];
  let instant = null,
    selected = first === last ? first : null;
  if (time) {
    const [hours, minutes] = time.split(':').map(Number);
    instant = start + (hours * 60 + minutes) * 60000;
    selected = zodiacIndex(instant);
  }
  let boundaryTime = '',
    boundaryUTC = null;
  if (candidates.length > 1) {
    const boundary = SearchSunLongitude(last * 30, new Date(start), 1);
    if (boundary) {
      boundaryUTC = boundary.date.toISOString();
      boundaryTime = new Date(boundary.date.getTime() + utcOffset * 3600000)
        .toISOString()
        .slice(11, 19);
    }
  }
  const dayCycle = (((stamp / DAY + 17) % 60) + 60) % 60,
    dayGanzhi = '甲乙丙丁戊己庚辛壬癸'[dayCycle % 10] + '子丑寅卯辰巳午未申酉戌亥'[dayCycle % 12],
    weekday = new Date(stamp).getUTCDay();
  return {
    date,
    time,
    utcOffset,
    zodiacIndex: selected,
    zodiacCandidates: candidates,
    needsTime: !time && candidates.length > 1,
    boundaryTime,
    boundaryUTC,
    sunLongitude: instant === null ? null : sunLongitude(instant),
    longitudeRange: [sunLongitude(start), sunLongitude(end)],
    mansionIndex: birthdayMansionIndex(date),
    dayGanzhi,
    weekday,
    mansionBasis: dayGanzhi + '日 · 星期' + '日一二三四五六'[weekday],
    lunarLabel: lunarDateLabel(stamp),
    ruleLabel: '传统值日星宿 · 日支与七曜配日',
    westernRuleLabel: '生日星座 · 回归黄道十二宫',
  };
}
