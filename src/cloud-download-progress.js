// Fetch streams report decoded bytes. Chunked responses can omit their total.
export function cloudTransfer(onProgress, message) {
  let previous;
  return ({ received, total }) => {
    const percent = total > 0 && received <= total ? Math.floor((100 * received) / total) : null;
    const text = percent === null ? message + ' · ' + (received / 1e6).toFixed(1) + ' MB' : message;
    const update = percent ?? text;
    if (update === previous) return;
    previous = update;
    onProgress(text, percent);
  };
}
