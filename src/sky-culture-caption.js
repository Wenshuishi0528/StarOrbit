// The data and the modern illustrations have independent provenance. Keep the
// data credit when annotations are exported with artwork switched off as well.
export function skyCulturePhotoCredit(status, settings, annotations, epoch) {
  let credit = status;
  if (settings?.skyCulture === 'chinese' && (annotations || status?.ready)) {
    const data = 'Chinese asterisms · Qing compilation · Stellarium, CC BY-SA 4.0';
    credit = {
      ...status,
      ready: Math.max(1, status?.ready || 0),
      caption: data + (status?.ready ? ' | ' + status.caption : ''),
    };
  }
  const references = [
    settings?.equatorialGrid && 'Equatorial grid',
    settings?.eclipticLine && 'Ecliptic',
  ].filter(Boolean);
  if (annotations && references.length && Number.isFinite(epoch)) {
    const date = new Date(epoch);
    if (Number.isFinite(date.getTime())) {
      const stamp = date
          .toISOString()
          .replace('T', ' ')
          .replace(/\.\d{3}Z$/, ' UTC'),
        caption = references.join(' + ') + ' · true of date ' + stamp + ' (simulation epoch)';
      credit = {
        ...credit,
        ready: Math.max(1, credit?.ready || 0),
        ...(credit?.ready ? { referenceCaption: caption } : { caption }),
      };
    }
  }
  return credit;
}
