// Draw the three signed reference-frame components. The cached image is reused
// during scrubbing; only the time cursor needs to move on each playback tick.
export function makeResidualPlot(canvas, onSeek) {
  const graph = document.createElement('canvas');
  const colors = ['#6ad6c3', '#f2b76d', '#c1a3ec'];
  const dashes = [[], [5, 3], [2, 2]];
  const left = 52,
    right = 15,
    top = 19,
    bottom = 24;
  let series = null,
    segmentStarts = new Set(),
    step = 5,
    time = 0,
    width = 0,
    height = 0,
    scale = 1;

  function cursor() {
    if (!series?.length || !width) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(graph, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const x = left + ((width - left - right) * time) / ((series.length - 1) * step || 1);
    ctx.strokeStyle = '#d2dfe2';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, height - bottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function plot() {
    if (!series?.length || !canvas.clientWidth) return;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = graph.width = Math.round(width * scale);
    canvas.height = graph.height = Math.round(height * scale);
    const ctx = graph.getContext('2d');
    ctx.scale(scale, scale);
    let peak = 0;
    for (const point of series)
      if (point) for (const v of point) peak = Math.max(peak, Math.abs(v));
    const factor = peak >= 1000 ? 1000 : peak > 0 && peak < 1 ? 0.001 : 1,
      unit = factor === 1000 ? 'km' : factor === 1 ? 'm' : 'mm';
    const value = peak / factor || 1,
      power = 10 ** Math.floor(Math.log10(value));
    const bound = ([1, 2, 5, 10].find((v) => v * power >= value) || 10) * power;
    const chartWidth = width - left - right,
      chartHeight = height - top - bottom;
    const x = (i) => left + (chartWidth * i) / (series.length - 1 || 1);
    const y = (v) => top + chartHeight * (0.5 - v / factor / (2 * bound));
    ctx.font = '11px Consolas, monospace';
    ctx.fillStyle = '#a4b5c3';
    ctx.textAlign = 'right';
    ctx.fillText(unit, left - 6, top - 7);
    for (const tick of [-bound, 0, bound]) {
      const py = y(tick * factor);
      ctx.strokeStyle = tick === 0 ? '#4b5b68' : '#2a3846';
      ctx.beginPath();
      ctx.moveTo(left, py);
      ctx.lineTo(width - right, py);
      ctx.stroke();
      ctx.fillText(String(Number(tick.toPrecision(2))), left - 6, py + 3);
    }
    ctx.textAlign = 'center';
    for (let part = 0; part <= 4; part++) {
      const i = ((series.length - 1) * part) / 4;
      ctx.fillText(Number(((i * step) / 3600).toFixed(1)) + 'h', x(i), height - 6);
    }
    for (let axis = 0; axis < 3; axis++) {
      ctx.strokeStyle = ctx.fillStyle = colors[axis];
      ctx.lineWidth = 1.4;
      ctx.setLineDash(dashes[axis]);
      ctx.beginPath();
      let column = -1,
        first = 0,
        last = 0,
        low = 0,
        high = 0,
        connected = false;
      function flush() {
        if (column < 0) return;
        const indices = [first, Math.min(low, high), Math.max(low, high), last];
        for (const i of indices) {
          if (connected) ctx.lineTo(x(i), y(series[i][axis]));
          else {
            ctx.moveTo(x(i), y(series[i][axis]));
            ctx.fillRect(x(i) - 0.7, y(series[i][axis]) - 0.7, 1.4, 1.4);
            connected = true;
          }
        }
      }
      for (let i = 0; i < series.length; i++) {
        const point = series[i];
        if (!point || segmentStarts.has(i)) {
          flush();
          column = -1;
          connected = false;
          if (!point) continue;
        }
        const next = Math.floor(x(i));
        if (next !== column) {
          flush();
          column = next;
          first = last = low = high = i;
        } else {
          last = i;
          if (point[axis] < series[low][axis]) low = i;
          if (point[axis] > series[high][axis]) high = i;
        }
      }
      flush();
      ctx.stroke();
    }
    cursor();
  }
  canvas.addEventListener('click', (event) => {
    if (!series?.length) return;
    const px = event.clientX - canvas.getBoundingClientRect().left;
    const part = (px - left) / (width - left - right);
    if (part < 0 || part > 1) return;
    const index = Math.round(part * (series.length - 1));
    if (series[index]) onSeek(index * step);
  });
  new ResizeObserver(plot).observe(canvas);
  return {
    set(values, interval, selectedTime, coverage) {
      series = values;
      step = interval;
      // Even a gap shorter than a solver step separates two interpolation arcs.
      segmentStarts = new Set(coverage.slice(1).map(([start]) => Math.ceil(start / step)));
      time = selectedTime;
      plot();
    },
    seek(selectedTime) {
      time = selectedTime;
      cursor();
    },
  };
}
