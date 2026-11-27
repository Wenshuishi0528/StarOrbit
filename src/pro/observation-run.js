// Same opportunity id and seed give both plans the same synthetic truth and
// classifier draw, even if one plan misses an exposure or overflows its store.
function randomFraction(seed, id, stream) {
  let x = (seed ^ Math.imul(id, 0x9e3779b1) ^ stream) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function imageRecord(opportunity, settings) {
  const { id, windowIndex, startSec, endSec } = opportunity;
  const useful = randomFraction(settings.seed, id, 0x243f6a88) < settings.usefulFraction;
  const filterKeep =
    randomFraction(settings.seed, id, 0xb7e15162) <
    (useful ? settings.usefulKeep : settings.otherKeep);
  return {
    id,
    windowIndex,
    startSec,
    endSec,
    useful,
    filterKeep,
    captureStartSec: null,
    captureStopSec: null,
    captureEndSec: null,
    processStartSec: null,
    processEndSec: null,
    processSegments: [],
    readySec: null,
    transferSegments: [],
    deliveredSec: null,
    latencySec: null,
    sentMB: 0,
    remainingMB: 0,
    status: 'notReached',
    reason: null,
  };
}

function recordWork(segments, startSec, endSec, quantity, amount, stationWindowIndex) {
  let last = segments.at(-1);
  if (!last || last.endSec !== startSec || last.stationWindowIndex !== stationWindowIndex) {
    last = { startSec, endSec, [quantity]: 0 };
    if (stationWindowIndex !== undefined) last.stationWindowIndex = stationWindowIndex;
    segments.push(last);
  }
  last.endSec = endSec;
  last[quantity] += amount;
}

// Is there a positive-duration contact between becoming eligible and cutoff?
function contactAfter(windows, ready, cutoff) {
  let lo = 0,
    hi = windows.length;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (windows[m].endSec <= ready) lo = m + 1;
    else hi = m;
  }
  return (
    !!windows[lo] && Math.max(ready, windows[lo].startSec) < Math.min(cutoff, windows[lo].endSec)
  );
}

function checkWindows(windows) {
  let previousEnd = 0;
  for (const { startSec, endSec } of windows) {
    // Geometry constructs starts as first + n*cadence. If exposure equals
    // cadence, the equivalent previousStart+exposure can differ by one ulp.
    const roundoff = 8 * Number.EPSILON * Math.max(1, previousEnd);
    if (
      !Number.isFinite(startSec) ||
      !Number.isFinite(endSec) ||
      startSec < 0 ||
      startSec < previousEnd - roundoff ||
      endSec <= startSec
    )
      throw new RangeError('observationAccess');
    previousEnd = endSec;
  }
}

function completedBy(finishSec, endSec) {
  return (
    Number.isFinite(finishSec) &&
    finishSec - endSec <= 8 * Number.EPSILON * Math.max(1, Math.abs(finishSec), Math.abs(endSec))
  );
}

// next() quotes a constant activity/duty interval. The power/thermal solver
// may shorten it at a battery-empty event before it calls advance().
export function createObservationRun(settings, access, strategy) {
  const { opportunities, stationWindows } = access;
  checkWindows(opportunities);
  checkWindows(stationWindows);
  const images = opportunities.map((opportunity) => imageRecord(opportunity, settings));
  const waiting = [],
    processing = [],
    downlink = [];
  const remainingWork = new Float64Array(images.length).fill(settings.processingSec);
  const processorLimited = new Uint8Array(images.length),
    radioLimited = new Uint8Array(images.length);
  const rate = settings.downlinkMbps / 8; // decimal MB/s, nominal on-air rate
  const metrics = {
    opportunityCount: images.length,
    capturedCount: 0,
    usefulCapturedCount: 0,
    deliveredCount: 0,
    usefulDeliveredCount: 0,
    discardedCount: 0,
    overflowCount: 0,
    powerMissedCount: 0,
    pendingCount: 0,
    generatedMB: 0,
    overflowMB: 0,
    filterFreedMB: 0,
    sentMB: 0,
    peakStoredMB: 0,
    finalStoredMB: 0,
    balanceErrorMB: 0,
    meanLatencySec: null,
    meanUsefulLatencySec: null,
    maxLatencySec: null,
    cameraWh: 0,
    processorWh: 0,
    radioWh: 0,
    unservedDeviceWh: 0,
    cameraActiveSec: 0,
    processorWorkSec: 0,
    radioActiveSec: 0,
    processorLimitedSec: 0,
    radioLimitedSec: 0,
  };
  let clock = 0,
    cameraIndex = -1,
    nextCapture = 0,
    station = 0;
  let waitHead = 0,
    processHead = 0,
    txHead = 0,
    stored = 0,
    compensation = 0,
    onboard = 0;
  let latencySum = 0,
    usefulLatencySum = 0;
  const volumeCompensation = { filterFreedMB: 0, sentMB: 0 };
  let transmittedCompensation = 0;
  let currentQuote, service, finished;
  const storageKnots = [[0, 0, 0]];

  // Each knot gives the occupancy after all simultaneous events and the
  // subsequent change in MB/s. Writes and processing completions are jumps.
  function recordStorage(sec, slope) {
    const point = [sec, stored, slope];
    if (storageKnots.at(-1)[0] === sec) storageKnots[storageKnots.length - 1] = point;
    else storageKnots.push(point);
  }

  function addVolume(key, delta) {
    const value = delta - volumeCompensation[key];
    const total = metrics[key] + value;
    volumeCompensation[key] = total - metrics[key] - value;
    metrics[key] = total;
  }

  function changeStorage(delta) {
    // Compensated addition keeps small acknowledged chunks visible next to a
    // large recorder occupancy, including runs with fractional power duty.
    const value = delta - compensation,
      next = stored + value;
    compensation = next - stored - value;
    stored = next;
    if (!onboard) {
      stored = 0;
      compensation = 0;
    } else if (
      stored > settings.storeMB &&
      stored - settings.storeMB <= 16 * Number.EPSILON * Math.max(1, settings.storeMB)
    ) {
      stored = settings.storeMB;
      compensation = 0;
    }
    metrics.peakStoredMB = Math.max(metrics.peakStoredMB, stored);
  }

  function ready(index, sec) {
    images[index].readySec = sec;
    images[index].status = 'pendingDownlink';
    downlink.push(index);
  }

  function eventsAt(sec) {
    while (station < stationWindows.length && stationWindows[station].endSec <= sec) station++;
    while (waitHead < waiting.length) {
      const index = waiting[waitHead],
        release = images[index].captureEndSec + strategy.delaySec;
      if (release > sec) break;
      waitHead++;
      if (strategy.mode === 'raw') ready(index, release);
      else {
        images[index].status = 'pendingProcessing';
        processing.push(index);
      }
    }
    if (cameraIndex < 0 && nextCapture < images.length && images[nextCapture].startSec <= sec) {
      cameraIndex = nextCapture++;
    }
  }

  function next(sec, upperSec, budgetW = Infinity, platformPowered = true) {
    if (
      finished ||
      sec !== clock ||
      !(upperSec > sec) ||
      !Number.isFinite(upperSec) ||
      !(budgetW >= 0)
    )
      throw new RangeError('observationTime');
    eventsAt(sec);
    const camera = images[cameraIndex];
    const contact = stationWindows[station];
    const tx = contact && contact.startSec <= sec ? downlink[txHead] : undefined;
    const cpu = processing[processHead];
    let budget = platformPowered ? budgetW : 0;
    // A failed exposure stays in the command ledger until its scheduled end.
    // It draws no further energy, and cannot resume part way into the image.
    const wantsCamera = camera ? settings.cameraW : 0;
    const cameraOn =
      !!camera && camera.status !== 'capturePower' && platformPowered && budget >= wantsCamera;
    const cameraW = cameraOn ? wantsCamera : 0;
    budget -= cameraW;
    const wantsRadio = tx === undefined ? 0 : settings.radioW;
    const radioW = Math.min(wantsRadio, budget);
    budget -= radioW;
    const wantsProcessor = cpu === undefined ? 0 : settings.processorW;
    const processorW = Math.min(wantsProcessor, budget);
    const radioDuty =
      platformPowered && tx !== undefined ? (wantsRadio ? radioW / wantsRadio : 1) : 0;
    const cpuDuty =
      platformPowered && cpu !== undefined ? (wantsProcessor ? processorW / wantsProcessor : 1) : 0;
    const txFinish = radioDuty > 0 ? sec + images[tx].remainingMB / (rate * radioDuty) : Infinity;
    const cpuFinish = cpuDuty > 0 ? sec + remainingWork[cpu] / cpuDuty : Infinity;
    const delayEnd =
      waitHead < waiting.length
        ? images[waiting[waitHead]].captureEndSec + strategy.delaySec
        : Infinity;
    const boundary = Math.min(
      upperSec,
      camera?.endSec ?? Infinity,
      camera ? Infinity : (images[nextCapture]?.startSec ?? Infinity),
      contact ? (sec < contact.startSec ? contact.startSec : contact.endSec) : Infinity,
      delayEnd,
      txFinish,
      cpuFinish
    );
    // A sub-ulp remaining byte or CPU interval completes on the next
    // representable positive time increment. Never cross the caller's cutoff.
    const endSec =
      boundary > sec ? boundary : Math.min(upperSec, sec + Number.EPSILON * Math.max(1, sec));
    service = { cameraOn, tx, cpu, radioDuty, cpuDuty, txFinish, cpuFinish };
    currentQuote = {
      startSec: sec,
      endSec,
      cameraW,
      processorW,
      radioW,
      requestedW: wantsCamera + wantsProcessor + wantsRadio,
      activeW: cameraW + processorW + radioW,
    };
    return currentQuote;
  }

  function transfer(index, duty, endSec, complete) {
    const image = images[index];
    if (duty < 1) {
      radioLimited[index] = 1;
      metrics.radioLimitedSec += endSec - clock;
    }
    if (duty <= 0) return;
    const productMB =
      strategy.mode === 'raw' ? settings.rawMB : settings.rawMB * settings.outputFraction;
    const value = rate * duty * (endSec - clock) - transmittedCompensation;
    const newSent = complete
      ? productMB
      : Math.min(productMB, Math.max(image.sentMB, image.sentMB + value));
    const amount = newSent - image.sentMB;
    transmittedCompensation = complete ? 0 : amount - value;
    recordWork(image.transferSegments, clock, endSec, 'sentMB', amount, station);
    image.sentMB = newSent;
    image.remainingMB = productMB - newSent;
    addVolume('sentMB', amount);
    metrics.radioActiveSec += amount / rate;
    if (complete) onboard--;
    changeStorage(-amount);
    if (!complete) {
      image.status = 'partialDownlink';
      return;
    }
    image.status = 'delivered';
    image.deliveredSec = endSec;
    image.latencySec = endSec - image.captureEndSec;
    latencySum += image.latencySec;
    metrics.maxLatencySec = Math.max(metrics.maxLatencySec ?? 0, image.latencySec);
    metrics.deliveredCount++;
    if (image.useful) {
      metrics.usefulDeliveredCount++;
      usefulLatencySum += image.latencySec;
    }
    txHead++;
  }

  function process(index, duty, endSec, complete) {
    const image = images[index];
    if (duty < 1) {
      processorLimited[index] = 1;
      metrics.processorLimitedSec += endSec - clock;
    }
    if (duty <= 0) return;
    image.processStartSec ??= clock;
    const work = complete
      ? remainingWork[index]
      : Math.min(remainingWork[index], duty * (endSec - clock));
    recordWork(image.processSegments, clock, endSec, 'workSec', work);
    remainingWork[index] -= work;
    metrics.processorWorkSec += work;
    if (!complete) return;
    image.processEndSec = endSec;
    processHead++;
    const after = image.filterKeep ? settings.rawMB * settings.outputFraction : 0;
    const freed = image.remainingMB - after;
    addVolume('filterFreedMB', freed);
    image.remainingMB = after;
    if (!image.filterKeep) {
      onboard--;
      metrics.discardedCount++;
      image.status = 'filteredOut';
      image.reason = 'filterRejected';
    } else ready(index, endSec);
    changeStorage(-freed);
  }

  function capture(image, powered, endSec) {
    if (image.status !== 'capturePower') {
      if (powered) {
        image.captureStartSec ??= clock;
        metrics.cameraActiveSec += endSec - clock;
      } else {
        image.captureStopSec = clock;
        image.status = 'capturePower';
        image.reason = 'cameraUnpowered';
        metrics.powerMissedCount++;
      }
    }
    if (endSec < image.endSec) return;
    const index = cameraIndex;
    cameraIndex = -1;
    if (image.status === 'capturePower') return;
    image.captureEndSec = image.captureStopSec = image.endSec;
    metrics.capturedCount++;
    if (image.useful) metrics.usefulCapturedCount++;
    metrics.generatedMB = metrics.capturedCount * settings.rawMB;
    const rounding = 16 * Number.EPSILON * Math.max(1, settings.storeMB);
    if (settings.rawMB > settings.storeMB - stored + rounding) {
      image.status = 'storageOverflow';
      image.reason = 'storeFull';
      metrics.overflowCount++;
      metrics.overflowMB = metrics.overflowCount * settings.rawMB;
      return;
    }
    onboard++;
    image.remainingMB = settings.rawMB;
    changeStorage(settings.rawMB);
    image.status = 'pendingDelay';
    waiting.push(index);
  }

  function advance(quote, endSec = quote.endSec) {
    if (
      finished ||
      quote !== currentQuote ||
      !quote ||
      !Number.isFinite(endSec) ||
      endSec <= clock ||
      endSec > quote.endSec
    )
      throw new RangeError('observationTime');
    const hours = (endSec - clock) / 3600;
    metrics.cameraWh += quote.cameraW * hours;
    metrics.radioWh += quote.radioW * hours;
    metrics.processorWh += quote.processorW * hours;
    metrics.unservedDeviceWh += (quote.requestedW - quote.activeW) * hours;
    // Acknowledged bytes and completed processing free capacity before a
    // simultaneous new full exposure is atomically admitted to the recorder.
    const { tx, cpu, txFinish, cpuFinish, radioDuty, cpuDuty, cameraOn } = service;
    const slope = radioDuty > 0 ? -rate * radioDuty : 0;
    if (slope !== storageKnots.at(-1)[2]) recordStorage(clock, slope);
    const completesTransfer = tx !== undefined && completedBy(txFinish, endSec);
    if (tx !== undefined) transfer(tx, radioDuty, endSec, completesTransfer);
    const beforeDiscreteEvents = stored;
    if (cpu !== undefined) process(cpu, cpuDuty, endSec, completedBy(cpuFinish, endSec));
    if (cameraIndex >= 0) capture(images[cameraIndex], cameraOn, endSec);
    if (completesTransfer || stored !== beforeDiscreteEvents) recordStorage(endSec, 0);
    clock = endSec;
    currentQuote = service = undefined;
    eventsAt(clock);
  }

  function finish(cutoff = clock) {
    if (cutoff !== clock) throw new RangeError('observationTime');
    if (finished) return finished;
    for (const [index, image] of images.entries()) {
      switch (image.status) {
        case 'notReached':
          if (image.captureStartSec !== null) {
            image.captureStopSec = cutoff;
            image.status = 'captureIncomplete';
            image.reason = 'exposureAtCutoff';
          } else image.reason = 'afterCutoff';
          break;
        case 'pendingDelay':
          image.reason = 'delayAtCutoff';
          break;
        case 'pendingProcessing':
          image.reason = processorLimited[index] ? 'processorPowerLimited' : 'processingAtCutoff';
          break;
        case 'pendingDownlink':
        case 'partialDownlink':
          if (!contactAfter(stationWindows, image.readySec, cutoff))
            image.reason = 'noStationAfterReady';
          else image.reason = radioLimited[index] ? 'radioPowerLimited' : 'contactCapacityAtCutoff';
          break;
      }
    }
    metrics.pendingCount =
      images.length -
      metrics.deliveredCount -
      metrics.discardedCount -
      metrics.overflowCount -
      metrics.powerMissedCount;
    if (metrics.deliveredCount) metrics.meanLatencySec = latencySum / metrics.deliveredCount;
    if (metrics.usefulDeliveredCount)
      metrics.meanUsefulLatencySec = usefulLatencySum / metrics.usefulDeliveredCount;
    metrics.finalStoredMB = stored;
    metrics.balanceErrorMB =
      metrics.generatedMB - metrics.overflowMB - metrics.filterFreedMB - metrics.sentMB - stored;
    recordStorage(cutoff, 0);
    finished = { strategy: { ...strategy }, images, metrics, storageKnots };
    return finished;
  }

  return {
    next,
    advance,
    finish,
    get storedMB() {
      return stored;
    },
  };
}
