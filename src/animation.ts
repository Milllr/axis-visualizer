import * as THREE from 'three';
import type { TrickDefinition } from './tricks';
import { getTrickAxis } from './tricks';

export interface AnimationState {
  trickKey: string;
  trick: TrickDefinition;
  rotationDeg: number;
  isSwitch: boolean;
  side: number; // 1 = left, -1 = right
  t: number;
  playing: boolean;
  speed: number;
}

const JUMP_HEIGHT = 2.5;
const JUMP_HORIZONTAL = 4.0;

export function getArcPosition(t: number): THREE.Vector3 {
  const x = 0;
  const z = THREE.MathUtils.lerp(-JUMP_HORIZONTAL / 2, JUMP_HORIZONTAL / 2, t);
  const y = 4 * JUMP_HEIGHT * t * (1 - t);
  return new THREE.Vector3(x, y, z);
}

function rotationEasing(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const t2 = t * t;
  const t3 = t2 * t;
  return 3 * t2 - 2 * t3;
}

// switch = start facing backward (180 Y), then trick rotation on top
// side = left(1) or right(-1) flips the spin direction
const SWITCH_QUAT = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0), Math.PI,
);

export function getRotationQuaternion(
  trickKey: string,
  rotationDeg: number,
  isSwitch: boolean,
  t: number,
  direction: number,
  side: number,
): THREE.Quaternion {
  const axis = getTrickAxis(trickKey);
  const totalRad = THREE.MathUtils.degToRad(rotationDeg) * direction * side;
  const easedT = rotationEasing(t);
  const currentAngle = totalRad * easedT;

  const trickQuat = new THREE.Quaternion().setFromAxisAngle(axis, currentAngle);

  if (isSwitch) {
    // face backward first, then apply trick rotation
    return trickQuat.multiply(SWITCH_QUAT);
  }

  return trickQuat;
}

export function createAnimationState(
  trickKey: string,
  trick: TrickDefinition,
  rotationDeg: number,
  isSwitch: boolean,
  side: number,
): AnimationState {
  return {
    trickKey,
    trick,
    rotationDeg,
    isSwitch,
    side,
    t: 0,
    playing: false,
    speed: 1,
  };
}

export function stepAnimation(state: AnimationState, dt: number): boolean {
  if (!state.playing) return false;
  const duration = 2.0 / state.speed;
  state.t += dt / duration;
  if (state.t >= 1) {
    state.t = 0;
    return true;
  }
  return false;
}
