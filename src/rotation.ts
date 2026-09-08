import * as THREE from 'three';
import type { TrickDefinition } from './tricks';
import { rigidAxisVector, snowboxAxisVector } from './tricks';
import { DEG, PI, TWO_PI, HALF_PI, clamp, smoothstep } from './curves';

// two ways to turn a trick name into an orientation path
//
// rigid: the body is a free rigid body. angular momentum L is fixed in the world once
//   airborne. the spine precesses around L (one cone per inversion, that is the dip)
//   while the body twists about its own long axis for the rest of the heading. this is
//   the yeadon twisting somersault model and it reproduces the rotational degrees
//   shortcut google measured on corks.
//
// snowbox: the body rotates about one fixed tilted axis for the full nominal degrees,
//   as the game does, plus the closed form misty path from mistyPhysics.js.

export type AxisModel = 'rigid' | 'snowbox';

export interface RotationConfig {
  trick: TrickDefinition;
  rotationDeg: number;
  inversions: number;
  spinDir: number;
  isSwitch: boolean;
  model: AxisModel;
}

export interface RotationPath {
  // orientation in the heading frame for rotation progress F (0 to 1 of the total) and
  // set blend u (0 in the in run, 1 when the set is complete)
  orientation(F: number, u: number, target: THREE.Quaternion): THREE.Quaternion;
  // unit angular momentum in the heading frame, fixed in flight
  Lhat: THREE.Vector3;
  // body frame direction of the spin axis at the set, for the inertia readout
  axisBodyAtSet: THREE.Vector3;
  // nominal total rotation in radians
  totalRad: number;
  precessionRad: number;
  twistRad: number;
  // tilt of L from vertical in degrees
  tiltDeg: number;
  label: string;
}

const UP = new THREE.Vector3(0, 1, 0);
const SWITCH_QUAT = new THREE.Quaternion().setFromAxisAngle(UP, PI);

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _v = new THREE.Vector3();

function leanQuat(Lhat: THREE.Vector3, leanDeg: number): THREE.Quaternion {
  const q = new THREE.Quaternion();
  if (leanDeg <= 0) return q;
  _v.crossVectors(UP, Lhat);
  if (_v.lengthSq() < 1e-8) return q;
  _v.normalize();
  return q.setFromAxisAngle(_v, leanDeg * DEG);
}

function applySwitch(q: THREE.Quaternion, isSwitch: boolean): THREE.Quaternion {
  // the trick is defined relative to the body, so a switch skier is turned around first
  if (isSwitch) q.premultiply(SWITCH_QUAT);
  return q;
}

export function buildRigidPath(cfg: RotationConfig): RotationPath {
  const { trick } = cfg;
  const s = cfg.spinDir;
  const Lhat = rigidAxisVector(trick, s);
  const totalRev = cfg.rotationDeg / 360;

  let precRev = 0;
  let twistRev = 0;
  if (trick.family === 'spin') {
    precRev = 0;
    twistRev = totalRev;
  } else if (trick.family === 'flip' || trick.family === 'lincoln') {
    precRev = totalRev;
    twistRev = 0;
  } else {
    precRev = clamp(cfg.inversions, 1, Math.max(1, Math.floor(totalRev)));
    twistRev = totalRev - precRev;
  }

  const Q0 = leanQuat(Lhat, trick.rigid.leanDeg);
  const identity = new THREE.Quaternion();
  const precRad = precRev * TWO_PI;
  const twistRad = twistRev * TWO_PI;
  const axisBodyAtSet = Lhat.clone().applyQuaternion(Q0.clone().invert());

  return {
    orientation(F, u, target) {
      // set lean blends in during the set, precession and twist advance with F
      _qa.copy(identity).slerp(Q0, smoothstep(u));
      _qb.setFromAxisAngle(Lhat, precRad * F);
      _qc.setFromAxisAngle(UP, twistRad * F * s);
      target.copy(_qb).multiply(_qa).multiply(_qc);
      return applySwitch(target, cfg.isSwitch);
    },
    Lhat,
    axisBodyAtSet,
    totalRad: cfg.rotationDeg * DEG,
    precessionRad: precRad,
    twistRad,
    tiltDeg: Math.acos(clamp(Math.abs(Lhat.y), 0, 1)) / DEG,
    label: 'rigid body',
  };
}

// snowbox misty constants
const MISTY_AXIS_TILT = 32 * DEG;
const MISTY_CARRY_SWEEP = -20 * DEG;
const MISTY_CARRY_BLEND = 4 * DEG;
const MISTY_MIN_TWIST_RATIO = 0.35;
const MISTY_MAX_TWIST_RATIO = 1.5;

// composeMistyOrientation from snowbox mistyPhysics.js
function mistyOrientation(
  totalRotation: number,
  twistRatio: number,
  flipDir: number,
  spinDir: number,
  target: THREE.Quaternion,
): THREE.Quaternion {
  const total = Math.max(0, totalRotation);
  const ratio = clamp(twistRatio, MISTY_MIN_TWIST_RATIO, MISTY_MAX_TWIST_RATIO);
  const flip = total / (1 + ratio);
  const phase = flip / TWO_PI;
  // repeat the backdrop each inversion so double mistys do not backdrop the other way
  const cycle = phase - Math.floor(phase);
  const backdropPhase = phase >= 1 && cycle < 1e-9 ? 1 : cycle;

  _v.set(Math.cos(MISTY_AXIS_TILT), 0, Math.sin(MISTY_AXIS_TILT) * spinDir).normalize();

  const heading = TWO_PI * ratio * phase * spinDir;
  const backdrop = HALF_PI * Math.sin(PI * backdropPhase) * flipDir;
  const carry = spinDir * flipDir * (
    MISTY_CARRY_SWEEP * Math.sin(TWO_PI * backdropPhase)
    + MISTY_CARRY_BLEND * Math.sin(2 * TWO_PI * backdropPhase)
  );

  _qa.setFromAxisAngle(UP, heading);
  _qb.setFromAxisAngle(_v, backdrop);
  _qc.setFromAxisAngle(UP, carry);
  return target.copy(_qa).multiply(_qb).multiply(_qc).normalize();
}

export function buildSnowboxPath(cfg: RotationConfig): RotationPath {
  const { trick } = cfg;
  const s = cfg.spinDir;
  const f = trick.flipDir === 0 ? 1 : trick.flipDir;
  const Lhat = snowboxAxisVector(trick, s);
  const totalRad = cfg.rotationDeg * DEG;
  const totalRev = cfg.rotationDeg / 360;

  if (trick.family === 'misty') {
    const inv = clamp(cfg.inversions, 1, Math.max(1, Math.floor(totalRev)));
    const ratio = clamp(totalRev / inv - 1, MISTY_MIN_TWIST_RATIO, MISTY_MAX_TWIST_RATIO);
    // world tangent at the set is mostly the tilted flip axis plus heading
    const tangent = new THREE.Vector3(0, ratio * s, 0)
      .add(new THREE.Vector3(Math.cos(MISTY_AXIS_TILT), 0, Math.sin(MISTY_AXIS_TILT) * s).multiplyScalar(HALF_PI * f))
      .normalize();
    return {
      orientation(F, _u, target) {
        mistyOrientation(totalRad * F, ratio, f, s, target);
        return applySwitch(target, cfg.isSwitch);
      },
      Lhat: tangent,
      axisBodyAtSet: tangent.clone(),
      totalRad,
      precessionRad: inv * TWO_PI,
      twistRad: totalRad - inv * TWO_PI,
      tiltDeg: Math.acos(clamp(Math.abs(tangent.y), 0, 1)) / DEG,
      label: 'snowbox misty path',
    };
  }

  return {
    orientation(F, _u, target) {
      target.setFromAxisAngle(Lhat, totalRad * F);
      return applySwitch(target, cfg.isSwitch);
    },
    Lhat,
    axisBodyAtSet: Lhat.clone(),
    totalRad,
    precessionRad: trick.category === 'off-axis' ? totalRad : (trick.family === 'spin' ? 0 : totalRad),
    twistRad: trick.family === 'spin' ? totalRad : 0,
    tiltDeg: Math.acos(clamp(Math.abs(Lhat.y), 0, 1)) / DEG,
    label: 'snowbox fixed axis',
  };
}

export function buildRotationPath(cfg: RotationConfig): RotationPath {
  return cfg.model === 'rigid' ? buildRigidPath(cfg) : buildSnowboxPath(cfg);
}

// angular velocity between two orientations, world frame, radians per unit time
export function angularVelocityBetween(
  qPrev: THREE.Quaternion,
  qNext: THREE.Quaternion,
  dt: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  _qa.copy(qNext).multiply(_qb.copy(qPrev).invert());
  if (_qa.w < 0) { _qa.x = -_qa.x; _qa.y = -_qa.y; _qa.z = -_qa.z; _qa.w = -_qa.w; }
  const w = clamp(_qa.w, -1, 1);
  const angle = 2 * Math.acos(w);
  const sinHalf = Math.sqrt(Math.max(0, 1 - w * w));
  if (sinHalf < 1e-8 || dt <= 0) return target.set(0, 0, 0);
  return target.set(_qa.x, _qa.y, _qa.z).divideScalar(sinHalf).multiplyScalar(angle / dt);
}

// google's rotational degrees step: the angle of the relative rotation between frames
export function relativeAngle(qPrev: THREE.Quaternion, qNext: THREE.Quaternion): number {
  _qa.copy(qNext).multiply(_qb.copy(qPrev).invert());
  return 2 * Math.acos(clamp(Math.abs(_qa.w), 0, 1));
}
