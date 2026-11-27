import { planTelemetry, replayAt } from './mission.js';

// Every CSV column is numerical or a fixed-format UTC timestamp. Mission names
// and user-provided notes remain in the versioned JSON product.
export function writeEngineeringCsv(result) {
  const columns = [
    'utc',
    'elapsed_s',
    'x_km',
    'y_km',
    'z_km',
    'vx_km_s',
    'vy_km_s',
    'vz_km_s',
    'sun_visible_fraction',
  ];
  for (const plan of ['a', 'b']) {
    for (const channel of [
      'battery_Wh',
      'board_degC',
      'outer_degC',
      'available_pv_W',
      'demand_W',
      'payload_on',
    ]) {
      columns.push(plan + '_' + channel);
    }
  }
  const observationChannels = {
    storedMB: 'stored_MB',
    cameraW: 'camera_active_W',
    processorW: 'processor_active_W',
    radioW: 'radio_active_W',
    requestedW: 'observation_requested_W',
    activeW: 'observation_active_W',
  };
  if (result.observationAccess) {
    for (const plan of ['a', 'b'])
      for (const heading of Object.values(observationChannels)) columns.push(plan + '_' + heading);
  }
  columns.push('pred_minus_ref_R_m', 'pred_minus_ref_T_m', 'pred_minus_ref_N_m');
  const lines = [columns.join(',')],
    comparison = result.orbitComparison;
  for (let i = 0; i < result.orbit.length; i++) {
    const a = replayAt(result, 0, i * result.stepSeconds),
      b = planTelemetry(result, 1, i, a.env);
    const row = [new Date(a.t).toISOString(), a.timeSec, ...result.orbit[i], a.env.illumination];
    for (const p of [a, b])
      row.push(p.batteryWh, p.boardC, p.outerC, p.availableW, p.demandW, Number(p.payloadOn));
    if (result.observationAccess) {
      for (const p of [a, b])
        for (const key of Object.keys(observationChannels)) row.push(p.observation[key]);
    }
    row.push(...(comparison?.series[i] ?? ['', '', '']));
    lines.push(row.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

// One row per event or actual service segment. Interval columns retain the
// solver's seconds, while human-readable UTC columns are rounded to a millisecond.
export function writeObservationCsv(result) {
  if (!result.observationAccess) throw new RangeError('observationRequired');
  const columns = [
    'plan',
    'strategy',
    'image_id',
    'target_window_index',
    'synthetic_useful',
    'stage',
    'start_s',
    'end_s',
    'start_utc',
    'end_utc',
    'station_window_index',
    'processed_s',
    'transferred_MB',
    'final_status',
    'final_reason',
    'total_sent_MB',
    'final_remaining_MB',
    'delivery_latency_s',
  ];
  const lines = [columns.join(',')],
    epoch = Date.parse(result.mission.epochUtc);
  const utc = (t) => new Date(Math.round(epoch + t * 1000)).toISOString();
  for (const [i, plan] of result.plans.entries()) {
    const { images, strategy } = plan.observation;
    for (const img of images) {
      const events = [];
      function add(stage, start, end, station = '', processed = '', sent = '') {
        if (!Number.isFinite(start) || !Number.isFinite(end)) return;
        events.push({ stage, start, end, station, processed, sent });
      }
      add('opportunity', img.startSec, img.endSec);
      add('exposure', img.captureStartSec, img.captureStopSec ?? img.captureEndSec);
      for (const seg of img.processSegments)
        add('processing', seg.startSec, seg.endSec, '', seg.workSec);
      add('ready', img.readySec, img.readySec);
      for (const seg of img.transferSegments)
        add('downlink', seg.startSec, seg.endSec, seg.stationWindowIndex, '', seg.sentMB);
      add('delivered', img.deliveredSec, img.deliveredSec);
      const finalSec =
        img.deliveredSec ??
        (img.status === 'filteredOut'
          ? img.processEndSec
          : img.status === 'storageOverflow'
            ? img.captureEndSec
            : img.status === 'capturePower'
              ? img.captureStopSec
              : null) ??
        result.durationSec;
      add('disposition', finalSec, finalSec);
      events.sort((a, b) => a.start - b.start);
      for (const e of events) {
        lines.push(
          [
            i ? 'B' : 'A',
            strategy.mode,
            img.id,
            img.windowIndex,
            Number(img.useful),
            e.stage,
            e.start,
            e.end,
            utc(e.start),
            utc(e.end),
            e.station,
            e.processed,
            e.sent,
            img.status,
            img.reason ?? '',
            img.sentMB,
            img.remainingMB,
            img.latencySec ?? '',
          ].join(',')
        );
      }
    }
  }
  return lines.join('\r\n') + '\r\n';
}
