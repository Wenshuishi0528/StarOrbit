// A Blob-backed worker keeps the self-contained file usable offline under file:
// and allows an in-progress integration to be interrupted without a partial result.
export function runInWorker(mission) {
  let worker = null,
    url = null,
    rejectRun;
  function release() {
    worker?.terminate();
    worker = null;
    if (url) URL.revokeObjectURL(url);
    url = null;
    rejectRun = null;
  }
  const promise = new Promise((resolve, reject) => {
    rejectRun = reject;
    try {
      const source = document.getElementById('proSolverWorker')?.textContent;
      if (!source || !globalThis.Worker) throw new Error('workerUnavailable');
      url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = ({ data }) => {
        release();
        if (data.error) reject(Object.assign(new Error(data.error.message), data.error));
        else resolve(data.result);
      };
      worker.onerror = (event) => {
        release();
        reject(Object.assign(new Error('workerFailure'), { detail: event.message }));
      };
      worker.onmessageerror = () => {
        release();
        reject(new Error('workerFailure'));
      };
      worker.postMessage(mission);
    } catch (error) {
      release();
      reject(Object.assign(new Error('workerUnavailable'), { detail: error.message }));
    }
  });
  return {
    promise,
    cancel() {
      if (!rejectRun) return;
      const reject = rejectRun;
      release();
      reject(new DOMException('Cancelled', 'AbortError'));
    },
  };
}
