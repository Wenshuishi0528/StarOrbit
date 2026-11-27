import { DAY } from './mission.js';

// Preserve each pixel column's extrema when reducing a day of 5 s records for display.
export function makePlot(host, key, onSeek) {
  const box = document.createElement('div');
  box.className = 'chart';
  const title = document.createElement('h4'),
    canvas = document.createElement('canvas');
  box.append(title, canvas);
  host.append(box);
  const ctx = canvas.getContext('2d');
  let series = [],
    dataMin = Infinity,
    dataMax = -Infinity,
    selected = 0,
    limits = [],
    axes = null;
  function paint() {
    if (!series.length || !ctx) return;
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);
    const left = 35,
      right = w - 13,
      top = 12,
      bottom = h - 23,
      cols = Math.max(10, Math.floor(right - left));
    const min = Math.min(...limits, dataMin),
      max = Math.max(...limits, dataMax);
    const pad = Math.max(1, (max - min) * 0.12),
      lo = min - pad,
      hi = max + pad;
    const y = (n) => bottom - ((n - lo) / (hi - lo)) * (bottom - top),
      x = (t) => left + (t / DAY) * (right - left);
    ctx.font = '10px Consolas, monospace';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#a4b5c3';
    for (let i = 0; i <= 2; i++) {
      const v = lo + ((hi - lo) * i) / 2,
        yy = y(v);
      ctx.beginPath();
      ctx.strokeStyle = '#293745';
      ctx.moveTo(left, yy);
      ctx.lineTo(right, yy);
      ctx.stroke();
      ctx.fillText(v.toFixed(0), left - 5, yy + 3);
    }
    ctx.textAlign = 'center';
    for (const hour of [0, 6, 12, 18, 24]) ctx.fillText(hour + 'h', x(hour * 3600), h - 5);
    ctx.strokeStyle = '#c9919a';
    ctx.setLineDash([4, 4]);
    for (const limit of limits) {
      ctx.beginPath();
      ctx.moveTo(left, y(limit));
      ctx.lineTo(right, y(limit));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const colors = ['#6ad6c3', '#f2b76d'];
    series.forEach((values, plan) => {
      ctx.strokeStyle = colors[plan];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(left, y(values[0][1]));
      let index = 0;
      for (let c = 0; c < cols; c++) {
        const until = (DAY * (c + 1)) / cols;
        if (index >= values.length || values[index][0] > until) continue;
        let low = index,
          high = index;
        while (index < values.length && values[index][0] <= until) {
          if (values[index][1] < values[low][1]) low = index;
          if (values[index][1] > values[high][1]) high = index;
          index++;
        }
        for (const i of [Math.min(low, high), Math.max(low, high)])
          ctx.lineTo(x(values[i][0]), y(values[i][1]));
      }
      ctx.stroke();
    });
    const xx = x(selected);
    ctx.strokeStyle = '#d3e0e6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xx, top);
    ctx.lineTo(xx, bottom);
    ctx.stroke();
    axes = { left, right };
  }
  canvas.addEventListener('click', (e) => {
    if (axes)
      onSeek(DAY * Math.max(0, Math.min(1, (e.offsetX - axes.left) / (axes.right - axes.left))));
  });
  new ResizeObserver(paint).observe(canvas);
  return {
    set(data, caption, thresholds) {
      dataMin = Infinity;
      dataMax = -Infinity;
      series = data.plans.map((p) => {
        const knots = key === 'batteryWh' ? (p.batteryKnots ?? []) : [];
        const points = [];
        let k = 0;
        for (let i = 0; i < p[key].length; i++) {
          const sec = i * data.stepSeconds;
          while (k < knots.length && knots[k][0] < sec) points.push(knots[k++]);
          points.push([sec, p[key][i]]);
        }
        for (const [, value] of points) {
          dataMin = Math.min(dataMin, value);
          dataMax = Math.max(dataMax, value);
        }
        return points;
      });
      title.textContent = caption;
      canvas.setAttribute('aria-label', caption);
      limits = thresholds;
      paint();
    },
    seek(sec) {
      selected = sec;
      paint();
    },
  };
}
