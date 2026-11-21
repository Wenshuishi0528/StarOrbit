import { Euler, Quaternion } from 'three';
import { wrapGroundAzimuth } from './ground-world-math.js';
import { wrapRoll } from './xuntian-ground-target.js';

const DEG = Math.PI / 180;
export function groundCameraRotation(pose, target = new Quaternion()) {
  // ENU: azimuth turns about world up, pitch about camera right, roll about the optical axis.
  const a = pose.azimuth * DEG,
    e = pose.elevation * DEG;
  target.setFromEuler(new Euler(Math.PI / 2 + e, 0, -a, 'ZXY'));
  const roll = ((pose.rollDegrees || 0) * DEG) / 2;
  return target.multiply(new Quaternion(0, 0, Math.sin(roll), Math.cos(roll)));
}

export function nudgeGroundScope(pose, rightDegrees, upDegrees, fieldDegrees = 1) {
  const roll = pose.rollDegrees || 0;
  const cos = Math.cos(roll * DEG), sin = Math.sin(roll * DEG);
  const horizontal = rightDegrees * cos - upDegrees * sin;
  const vertical = rightDegrees * sin + upDegrees * cos;

  // A level pan follows a circle of constant elevation. As the zenith enters
  // the eyepiece, ease the azimuth gain back to zero to avoid spinning in place.
  const radius = pose.elevation === 90 ? 0 : Math.cos(pose.elevation * DEG);
  const fieldRadius = Math.sin(fieldDegrees * DEG / 2);
  const gain = radius / Math.max(radius * radius, fieldRadius * fieldRadius);
  const halfChord = Math.sin(horizontal * DEG / 2) * gain;
  const yaw = 2 * Math.asin(Math.max(-1, Math.min(1, halfChord))) / DEG;

  // Beyond the pole the same optical orientation has reversed azimuth and roll.
  const pitch = Math.max(0, Math.min(180, pose.elevation + vertical));
  const crossed = pitch > 90;
  return {
    azimuth: wrapGroundAzimuth(pose.azimuth + yaw + (crossed ? 180 : 0)),
    elevation: crossed ? 180 - pitch : pitch,
    rollDegrees: crossed ? wrapRoll(roll + 180) : roll,
  };
}
