import * as THREE from 'three';
import type { TrickDefinition } from './tricks';
import { rigidAxisVector } from './tricks';
import { DEG, PI, TWO_PI, clamp, smoothstep } from './curves';

// the rigid body model: angular momentum L is fixed in the world once airborne. the
// spine precesses around L, one cone per cork (that is the dip), while the body twists
// about its own long axis for the rest of the heading. this is the yeadon twisting
// somersault model and it reproduces the rotational degrees shortcut google measured
// on real corks.
//
// a double or triple is a chain of corks. each cork is one precession plus its own
// share of the twist, so a double cork 1080 can be a cork 7 into a cork 3 or a cork 3
// into a cork 7. the twist rate changes between corks, which is the arm adjustment a
// skier makes to speed up or kill the twist for the next one.

export interface RotationConfig {
  trick: TrickDefinition;
  rotationDeg: number;
  inversions: number;
  // degrees of each cork, sums to rotationDeg, optional
  split?: number[];
  spinDir: number;
  isSwitch: boolean;
}

export interface RotationSegment {
  // nominal degrees of this cork
  deg: number;
  precessionRad: number;
  twistRad: number;
  // start and end of the segment as a fraction of the whole rotation
  start: number;
  end: number;
}

export interface RotationPath {
  // orientation in the heading frame for rotation progress F (0 to 1 of the total) and
  // set blend u (0 in the in run, 1 when the set is complete)
  orientation(F: number, u: number, target: THREE.Quaternion): THREE.Quaternion;
  // unit angular momentum in the heading frame, fixed in flight
  Lhat: THREE.Vector3;
  // body frame direction of the spin axis at the set
  axisBodyAtSet: THREE.Vector3;
  // nominal total rotation in radians
  totalRad: number;
  precessionRad: number;
  twistRad: number;
  segments: RotationSegment[];
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

const MIN_CORK_DEG = 360;
const STEP_DEG = 180;

// every way to share rotationDeg across k corks in steps of 180 with at least a 360 each
export function splitOptions(rotationDeg: number, inversions: number): number[][] {
  const k = Math.max(1, Math.floor(inversions));
  const total = Math.round(rotationDeg / STEP_DEG);
  const min = MIN_CORK_DEG / STEP_DEG;
  const out: number[][] = [];
  if (k === 1) return [[rotationDeg]];
  if (total < k * min) return [evenSplit(rotationDeg, k)];
  const walk = (remaining: number, partsLeft: number, acc: number[]) => {
    if (partsLeft === 1) {
      if (remaining >= min) out.push([...acc, remaining * STEP_DEG]);
      return;
    }
    for (let part = min; part <= remaining - min * (partsLeft - 1); part++) {
      walk(remaining - part, partsLeft - 1, [...acc, part * STEP_DEG]);
    }
  };
  walk(total, k, []);
  return out;
}

// the default share: as even as 180 steps allow, the extra going to the first corks
export function evenSplit(rotationDeg: number, inversions: number): number[] {
  const k = Math.max(1, Math.floor(inversions));
  const total = Math.round(rotationDeg / STEP_DEG);
  const base = Math.floor(total / k);
  let extra = total - base * k;
  const parts: number[] = [];
  for (let i = 0; i < k; i++) {
    let p = base;
    if (extra > 0) { p += 1; extra -= 1; }
    parts.push(p * STEP_DEG);
  }
  return parts;
}

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

function buildSegments(cfg: RotationConfig): RotationSegment[] {
  const { trick } = cfg;
  const totalRad = cfg.rotationDeg * DEG;
  const segs: RotationSegment[] = [];
  if (trick.family === 'spin') {
    segs.push({ deg: cfg.rotationDeg, precessionRad: 0, twistRad: totalRad, start: 0, end: 1 });
    return segs;
  }
  if (trick.family === 'flip' || trick.family === 'lincoln') {
    segs.push({ deg: cfg.rotationDeg, precessionRad: totalRad, twistRad: 0, start: 0, end: 1 });
    return segs;
  }
  const k = clamp(Math.floor(cfg.inversions), 1, Math.max(1, Math.floor(cfg.rotationDeg / 360)));
  let parts = cfg.split && cfg.split.length === k && cfg.split.reduce((a, b) => a + b, 0) === cfg.rotationDeg
    ? cfg.split
    : evenSplit(cfg.rotationDeg, k);
  parts = parts.map((d) => Math.max(0, d));
  let acc = 0;
  for (const d of parts) {
    const prec = TWO_PI;
    const twist = Math.max(0, d - 360) * DEG;
    segs.push({ deg: d, precessionRad: prec, twistRad: twist, start: acc / cfg.rotationDeg, end: (acc + d) / cfg.rotationDeg });
    acc += d;
  }
  return segs;
}

export function buildRotationPath(cfg: RotationConfig): RotationPath {
  const { trick } = cfg;
  const s = cfg.spinDir;
  const Lhat = rigidAxisVector(trick, s);
  const segments = buildSegments(cfg);
  const precRadTotal = segments.reduce((a, b) => a + b.precessionRad, 0);
  const twistRadTotal = segments.reduce((a, b) => a + b.twistRad, 0);

  const Q0 = leanQuat(Lhat, trick.rigid.leanDeg);
  const identity = new THREE.Quaternion();
  const axisBodyAtSet = Lhat.clone().applyQuaternion(Q0.clone().invert());

  // precession and twist angles at rotation progress F, piecewise across the corks
  const anglesAt = (F: number): { prec: number; twist: number } => {
    const f = clamp(F, 0, 1);
    let prec = 0, twist = 0;
    for (const seg of segments) {
      if (f >= seg.end) { prec += seg.precessionRad; twist += seg.twistRad; continue; }
      if (f <= seg.start) break;
      const local = (f - seg.start) / Math.max(1e-9, seg.end - seg.start);
      prec += seg.precessionRad * local;
      twist += seg.twistRad * local;
      break;
    }
    return { prec, twist };
  };

  return {
    orientation(F, u, target) {
      // set lean blends in during the set, precession and twist advance with F
      const { prec, twist } = anglesAt(F);
      _qa.copy(identity).slerp(Q0, smoothstep(u));
      _qb.setFromAxisAngle(Lhat, prec);
      _qc.setFromAxisAngle(UP, twist * s);
      target.copy(_qb).multiply(_qa).multiply(_qc);
      return applySwitch(target, cfg.isSwitch);
    },
    Lhat,
    axisBodyAtSet,
    totalRad: cfg.rotationDeg * DEG,
    precessionRad: precRadTotal,
    twistRad: twistRadTotal,
    segments,
    tiltDeg: Math.acos(clamp(Math.abs(Lhat.y), 0, 1)) / DEG,
    label: 'rigid body',
  };
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
