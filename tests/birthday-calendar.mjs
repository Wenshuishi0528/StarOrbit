import assert from 'node:assert/strict';
import { birthdayCalendar, birthdayMansionIndex } from '../src/birthday-calendar.js';

const example = birthdayCalendar({ date: '2004-11-09' });
assert.equal(example.zodiacIndex, 7);
assert.deepEqual(example.zodiacCandidates, [7]);
assert.equal(example.mansionIndex, 26);
assert.equal(example.needsTime, false);
assert.equal(example.mansionBasis, '壬辰日 · 星期二');
assert.equal(example.lunarLabel, '农历甲申年九月廿七');
assert(example.longitudeRange.every(value => value > 226 && value < 228));

// Independent fixtures from the pinned reference library, including endpoints,
// two leap years, lunar New Year and a non-leap century. Index 0 = Jiao.
for (const [date, expected] of [
  ['1901-01-01',5], ['1970-01-01',7], ['2000-01-01',16], ['2000-02-29',19],
  ['2004-11-09',26], ['2024-02-10',2], ['2024-02-29',21], ['2025-01-29',20],
  ['2026-01-01',21], ['2026-11-08',24], ['2100-12-31',1],
]) assert.equal(birthdayMansionIndex(date), expected, date);
const sequence = Array.from({length:28},(_,i)=>birthdayMansionIndex(new Date(Date.UTC(2024,1,1+i)).toISOString().slice(0,10)));
assert.equal(new Set(sequence).size,28);
sequence.forEach((value,i)=>i && assert.equal(value,(sequence[i-1]+1)%28));
assert.equal(birthdayMansionIndex('2024-02-01'),birthdayMansionIndex('2024-02-29'));

// Each of the twelve interior dates has one unambiguous zodiac result.
for(let month=1;month<=12;month++) {
  const result=birthdayCalendar({date:`2024-${String(month).padStart(2,'0')}-15`});
  assert.equal(result.zodiacIndex,(month+8)%12);
  assert.equal(result.needsTime,false);
}
// March equinox crosses the 360°/0° wrap. October crosses an ordinary 30° edge.
for(const date of ['2024-03-20','2024-10-23']) {
  const result=birthdayCalendar({date});
  assert.equal(result.zodiacIndex,null);
  assert.equal(result.needsTime,true);
  assert.equal(result.zodiacCandidates.length,2);
  assert.match(result.boundaryTime,/^\d\d:\d\d:\d\d$/);
  assert.equal(birthdayCalendar({date,time:'00:00'}).zodiacIndex,result.zodiacCandidates[0]);
  assert.equal(birthdayCalendar({date,time:'23:59'}).zodiacIndex,result.zodiacCandidates[1]);
}
const midnight=birthdayCalendar({date:'2024-03-20',time:'00:00',utcOffset:-4});
assert.equal(midnight.zodiacIndex,0,'UTC offset resolves an actual instant, not host-local Date parsing');
assert.equal(midnight.mansionIndex,birthdayMansionIndex('2024-03-20'),'civil date is the explicitly declared mansion input');

for(const date of ['2004-2-09','2004-02-30','2100-02-29','1900-01-01','2101-01-01','2024-13-01','bad',''])
  assert.throws(()=>birthdayCalendar({date}),undefined,date);
for(const time of ['24:00','12:60','1:30','12:00:00',null])
  assert.throws(()=>birthdayCalendar({date:'2004-11-09',time}));
for(const utcOffset of [15,-13,NaN,Infinity,'8',8.1])
  assert.throws(()=>birthdayCalendar({date:'2004-11-09',utcOffset}));
console.log('Birthday calendar: pinned 28-mansion fixtures, all 12 zodiac signs, leap/century dates, civil-time boundaries and strict inputs passed.');
