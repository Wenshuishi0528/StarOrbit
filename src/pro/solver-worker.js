import { runMission } from './mission.js';

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ result: runMission(data) });
  } catch (error) {
    self.postMessage({ error: { message: error.message, detail: error.detail, line: error.line } });
  }
};
