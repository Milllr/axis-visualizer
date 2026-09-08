import * as THREE from 'three';
import { TRICK_DEFINITIONS } from './tricks';
import type { TrickDefinition } from './tricks';
import { PROFILES, sampleChannels, effectiveTuck, ZERO_CHANNELS } from './profiles';
import type { PoseChannels } from './profiles';
import { buildRotationPath, angularVelocityBetween, relativeAngle } from './rotation';
import type { RotationPath } from './rotation';
import { Timeline, createTimelineSample, GRAVITY, kickerFor } from './timeline';
import type { SceneMode, SegmentName, TimelineSample, KickerParams } from './timeline';
import { PoseSolver, poseToJoints, createJointAngles } from './pose';
import type { GrabType, JointAngles, PoseInput } from './pose';
import { createFigure, applyPose, SEG } from './figure';
import type { Figure } from './figure';
import { getPhase, smoothstep, clamp, clamp01, DEG } from './curves';
import type { AirPhase } from './curves';

// bakes one trick into a table of frames so playback and scrubbing are lookups
//
// passes:
//   0  pose only, to measure where the com sits over the feet at the end of the set
//   a  rotation with a provisional rate profile, gives angular velocity for the pose
//   b  pose with that velocity, measures the real inertia of the posed body about the
//      momentum axis, integrates the rate profile omega = L / I
//   c  final rotation, pose, com, metrics

export interface BakeConfig {
  trickKey: string;
  rotationDeg: number;
  inversions: number;
  spinDir: number;
  isSwitch: boolean;
  mode: SceneMode;
  grab: GrabType;
  split?: number[];
}

export interface BakedFrame {
  time: number;
  segment: SegmentName;
  airT: number;
  phase: AirPhase | 'ground';
  pivotPos: THREE.Vector3;
  quat: THREE.Quaternion;
  comLocal: THREE.Vector3;
  joints: JointAngles;
  omega: THREE.Vector3;
  omegaBody: THREE.Vector3;
  omegaDeg: number;
  inertia: number;
  momentum: number;
  tuck: number;
  rotDegSoFar: number;
  tiltDeg: number;
  headPos: THREE.Vector3;
  feetPos: THREE.Vector3;
  bedDepth: number;
  hipDrop: number;
}

export interface BakeSummary {
  nominalDeg: number;
  rotationalDeg: number;
  shortcutDeg: number;
  weightedTiltDeg: number;
  axisTiltDeg: number;
  peakOmegaDeg: number;
  meanOmegaDeg: number;
  touchdownOmegaDeg: number;
  airtime: number;
  landingCorrectionDeg: number;
  precessionDeg: number;
  twistDeg: number;
  inertiaExtended: number;
  inertiaTucked: number;
  modelLabel: string;
  mass: number;
}

export interface Baked {
  config: BakeConfig;
  trick: TrickDefinition;
  timeline: Timeline;
  path: RotationPath;
  frames: BakedFrame[];
  dt: number;
  duration: number;
  summary: BakeSummary;
  Lhat: THREE.Vector3;
  kicker: KickerParams;
  sampleAt(time: number, out: BakedFrame): BakedFrame;
}

export function createBakedFrame(): BakedFrame {
  return {
    time: 0,
    segment: 'approach',
    airT: 0,
    phase: 'ground',
    pivotPos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    comLocal: new THREE.Vector3(),
    joints: createJointAngles(),
    omega: new THREE.Vector3(),
    omegaBody: new THREE.Vector3(),
    omegaDeg: 0,
    inertia: 1,
    momentum: 0,
    tuck: 0,
    rotDegSoFar: 0,
    tiltDeg: 0,
    headPos: new THREE.Vector3(),
    feetPos: new THREE.Vector3(),
    bedDepth: 0,
    hipDrop: 0,
  };
}

const BAKE_DT = 1 / 120;
// the pop: the last moments on the lip where the legs extend, the throw releases and the
// momentum is created. fixed length whatever the trick, a bigger trick winds up longer
const POP_DURATION = 0.12;
const THROW_LEAD = 0.10;
const UP = new THREE.Vector3(0, 1, 0);
const ZAXIS = new THREE.Vector3(0, 0, 1);

let scratchFigure: Figure | null = null;
function getScratchFigure(): Figure {
  if (!scratchFigure) {
    scratchFigure = createFigure(true);
    scratchFigure.group.updateMatrixWorld(true);
  }
  return scratchFigure;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

function slopeQuat(angle: number, target: THREE.Quaternion): THREE.Quaternion {
  // stand perpendicular to a surface whose tangent makes angle with the horizontal
  return target.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -angle);
}

// heading of a body orientation from its forward vector, falling back to the up vector
function headingYaw(q: THREE.Quaternion): number {
  _v.copy(ZAXIS).applyQuaternion(q);
  if (Math.hypot(_v.x, _v.z) < 0.2) {
    _v2.copy(UP).applyQuaternion(q);
    // when the body points straight up or down the chest normal carries the heading
    if (Math.hypot(_v2.x, _v2.z) > 0.2) return Math.atan2(_v2.x, _v2.z) + (_v.y > 0 ? Math.PI : 0);
  }
  return Math.atan2(_v.x, _v.z);
}

export function bake(config: BakeConfig): Baked {
  const trick = TRICK_DEFINITIONS[config.trickKey];
  const profile = PROFILES[trick.family];
  const offAxis = trick.category === 'off-axis';
  const spinDir = trick.hasSide ? config.spinDir : 1;
  const flipDir = trick.flipDir === 0 ? 1 : trick.flipDir;
  const skis = config.mode === 'skis';

  const path = buildRotationPath({
    trick,
    rotationDeg: config.rotationDeg,
    inversions: config.inversions,
    split: config.split,
    spinDir,
    isSwitch: config.isSwitch,
  });

  const figure = getScratchFigure();
  figure.setSkis(skis);
  const solver = new PoseSolver();
  const joints = createJointAngles();
  const tsample = createTimelineSample();
  // bigger tricks wind up longer, set longer and throw harder
  const bigness = config.rotationDeg / 720;
  const setDuration = clamp(0.2 + 0.12 * bigness, 0.25, 0.5);
  const throwIntensity = clamp(0.55 + 0.5 * bigness, 0.75, 1.6);
  const windupPeak = clamp(0.55 + 0.45 * bigness, 0.7, 1.4);
  const windupRamp = 0.3 + 0.2 * bigness;
  const setup: SetupParams = { setDuration, throwIntensity, windupPeak, windupRamp, throwDuration: 0.5 };
  const kicker = kickerFor(config.rotationDeg);

  // ── pass 0: pose through the approach and set to find the com over the feet ──
  let timeline = new Timeline({ mode: config.mode, takeoffComUp: 0.92, takeoffComAlong: 0.05, landingComHeight: 0.88, setDuration, kicker });
  const measureOffsets = (tl: Timeline) => {
    solver.reset();
    const input = makeInput(config.mode, trick, spinDir, flipDir, offAxis);
    let comLocal = new THREE.Vector3(), feetLocal = new THREE.Vector3();
    for (let t = 0; t <= tl.flightStart + 1e-6; t += BAKE_DT) {
      tl.sample(t, tsample);
      fillGroundInput(input, t, BAKE_DT, tsample, tl, config, setup);
      input.popBlend = clamp01((t - (tl.flightStart - POP_DURATION)) / POP_DURATION);
      const pose = solver.solve(input);
      poseToJoints(pose, joints);
      applyPose(figure, joints);
      figure.joints.hip.position.y = SEG.hipHeight - pose.hipDrop;
      figure.group.updateMatrixWorld(true);
      figure.computeCom(comLocal);
      feetLocal = feetPoint(figure, feetLocal);
    }
    // body up is along the surface normal at the lip, so offsets are just local deltas
    const d = comLocal.clone().sub(feetLocal);
    return { up: d.y, along: d.z };
  };
  const off = measureOffsets(timeline);
  timeline = new Timeline({ mode: config.mode, takeoffComUp: off.up, takeoffComAlong: off.along, landingComHeight: 0.88, setDuration, kicker });

  const duration = timeline.duration;
  const n = Math.ceil(duration / BAKE_DT) + 1;
  const times: number[] = new Array(n);
  for (let i = 0; i < n; i++) times[i] = Math.min(duration, i * BAKE_DT);

  const flightStart = timeline.flightStart;
  const flightEnd = timeline.flightEnd;
  const popStart = flightStart - POP_DURATION;
  const rotEnd = flightEnd;
  const popBlendAt = (t: number): number => clamp01((t - popStart) / POP_DURATION);

  // rate profile: L is created in the pop at the end of the lip and is constant in the air
  const momentumShape = (t: number): number => {
    if (t < popStart) return 0;
    // momentum arrives at the very end of the pop, so little rotation happens on the lip
    if (t < flightStart) { const u = popBlendAt(t); return u * u * u; }
    if (t <= rotEnd) return 1;
    return 0;
  };

  // integrate F from a per frame inertia table
  const integrateF = (inertia: number[]): { F: number[]; Lmag: number } => {
    const acc: number[] = new Array(n);
    let s = 0;
    acc[0] = 0;
    for (let i = 1; i < n; i++) {
      const t = times[i];
      const w = momentumShape(t) / Math.max(0.2, inertia[i]);
      s += w * (times[i] - times[i - 1]);
      acc[i] = s;
    }
    const total = Math.max(1e-9, s);
    const F = acc.map((a) => clamp01(a / total));
    // L such that the integral of L / I over the trick equals the nominal rotation
    const Lmag = path.totalRad / total;
    return { F, Lmag };
  };

  // provisional inertia from the snowbox tuck blend, then the real body inertia
  const provisional: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    timeline.sample(times[i], tsample);
    const ch = tsample.segment === 'flight' ? sampleChannels(profile, tsample.airT, spinDir, flipDir) : ZERO_CHANNELS;
    const tuck = effectiveTuck(ch.tuck, tsample.airT, offAxis);
    provisional[i] = 2.8 + (1.4 - 2.8) * tuck;
  }

  const frames: BakedFrame[] = new Array(n);
  for (let i = 0; i < n; i++) frames[i] = createBakedFrame();

  // landing correction: the residual that brings the final path orientation upright
  path.orientation(1, 1, _q);
  const yawFinal = headingYaw(_q);
  const qClean = new THREE.Quaternion().setFromAxisAngle(UP, yawFinal);
  const correction = qClean.clone().multiply(_q.clone().invert());
  const landingCorrectionDeg = 2 * Math.acos(clamp(Math.abs(correction.w), 0, 1)) / DEG;
  const identity = new THREE.Quaternion();

  // trick rotation alone, before the body is aligned to the ground
  const trickOrientationAt = (i: number, F: number[], out: THREE.Quaternion): THREE.Quaternion => {
    const t = times[i];
    timeline.sample(t, tsample);
    const seg = tsample.segment;
    const u = popBlendAt(t);
    path.orientation(F[i], u, out);
    // pull the cork out while spotting and opening up
    const airT = tsample.airT;
    if (seg === 'flight' || t >= flightEnd) {
      const w = t >= flightEnd ? 1 : smoothstep((airT - 0.70) / 0.27);
      if (w > 0) {
        _q2.copy(identity).slerp(correction, w);
        out.premultiply(_q2);
      }
    }
    return out;
  };

  const orientationAt = (i: number, F: number[], out: THREE.Quaternion): THREE.Quaternion => {
    const t = times[i];
    trickOrientationAt(i, F, out);
    timeline.sample(t, tsample);
    const seg = tsample.segment;
    const airT = tsample.airT;
    // stand perpendicular to the ground, fade that out through the axis set and back in for the landing
    let slope = 0;
    if (config.mode === 'skis') {
      const lipAngle = Math.atan2(timeline.takeoffVel.y, timeline.takeoffVel.z);
      const landAngle = timeline.landingAngle;
      if (tsample.onGround && t < flightStart) slope = Math.atan2(tsample.tangent.y, tsample.tangent.z);
      else if (seg === 'flight') {
        const fadeOut = 1 - smoothstep(airT / 0.18);
        const fadeIn = smoothstep((airT - 0.82) / 0.18);
        slope = lipAngle * fadeOut + landAngle * fadeIn;
      } else slope = landAngle;
    }
    if (slope !== 0) {
      slopeQuat(slope, _q2);
      out.premultiply(_q2);
    }
    return out;
  };

  const runPass = (F: number[], Lmag: number, inertiaOut: number[] | null, final: boolean): void => {
    solver.reset();
    const input = makeInput(config.mode, trick, spinDir, flipDir, offAxis);
    let grabBlend = 0;
    let spinAngle = 0, flipAngle = 0, comboAngle = 0;
    let rotDeg = 0;
    const qPrev = new THREE.Quaternion();
    const qCur = new THREE.Quaternion();
    const qTrickPrev = new THREE.Quaternion();
    const qTrick = new THREE.Quaternion();
    const comLocal = new THREE.Vector3();
    const feetLocal = new THREE.Vector3();
    const headLocal = new THREE.Vector3();
    const omega = new THREE.Vector3();
    const omegaBody = new THREE.Vector3();
    const spineAxis = new THREE.Vector3(0, 1, 0);
    const transverseAxis = new THREE.Vector3();
    // precession runs on the transverse inertia, twist on the longitudinal one, so the
    // rate blends the two by how much of the trick is each
    const precShare = path.precessionRad + path.twistRad > 1e-6
      ? path.precessionRad / (path.precessionRad + path.twistRad) : 0;
    const cosA = 1 - precShare;
    transverseAxis.copy(path.axisBodyAtSet).addScaledVector(spineAxis, -path.axisBodyAtSet.y);
    if (transverseAxis.lengthSq() < 1e-6) transverseAxis.set(1, 0, 0); else transverseAxis.normalize();

    for (let i = 0; i < n; i++) {
      const t = times[i];
      const dt = i === 0 ? BAKE_DT : times[i] - times[i - 1];
      timeline.sample(t, tsample);
      const fr = frames[i];
      const seg = tsample.segment;
      const airT = tsample.airT;
      const inAir = seg === 'flight';

      orientationAt(i, F, qCur);
      trickOrientationAt(i, F, qTrick);
      if (i === 0) { qPrev.copy(qCur); qTrickPrev.copy(qTrick); }
      // angular velocity of the trick rotation, carried into the world frame by the ground alignment
      angularVelocityBetween(qTrickPrev, qTrick, dt, omega);
      _q2.copy(qCur).multiply(_q.copy(qTrick).invert());
      omega.applyQuaternion(_q2);
      if (i === 0) omega.set(0, 0, 0);
      // google's rotational degrees, measured on the trick rotation only
      const step = i === 0 ? 0 : relativeAngle(qTrickPrev, qTrick);
      if (seg === 'set' || inAir) rotDeg += step / DEG;
      qPrev.copy(qCur);
      qTrickPrev.copy(qTrick);

      omegaBody.copy(omega).applyQuaternion(_q.copy(qCur).invert());
      spinAngle += omegaBody.y * dt;
      flipAngle += omegaBody.x * dt;
      comboAngle += omega.length() * dt;

      // grab window
      const wantGrab = config.grab !== 'none' && inAir && airT > 0.20 && airT < 0.66;
      grabBlend += ((wantGrab ? 1 : 0) - grabBlend) * (1 - Math.exp(-(wantGrab ? 14 : 6) * dt));

      const ch = inAir ? sampleChannels(profile, airT, spinDir, flipDir) : ZERO_CHANNELS;
      const tuck = inAir ? effectiveTuck(ch.tuck, airT, offAxis) : 0;

      fillGroundInput(input, t, dt, tsample, timeline, config, setup);
      input.popBlend = popBlendAt(t);
      input.channels = ch;
      input.tuck = tuck;
      input.omegaX = omegaBody.x; input.omegaY = omegaBody.y; input.omegaZ = omegaBody.z;
      input.spinAngle = spinAngle; input.flipAngle = flipAngle; input.comboAngle = comboAngle;
      input.grabBlend = grabBlend;

      const pose = solver.solve(input);
      poseToJoints(pose, joints);
      applyPose(figure, joints);
      figure.joints.hip.position.y = SEG.hipHeight - pose.hipDrop;
      figure.group.updateMatrixWorld(true);
      figure.computeCom(comLocal);
      feetPoint(figure, feetLocal);
      headPoint(figure, headLocal);

      // effective inertia of the posed body: 1 / I = (1 - cos a) / It + cos a / Il
      const Il = figure.computeInertia(spineAxis, comLocal);
      const It = figure.computeInertia(transverseAxis, comLocal);
      const I = 1 / ((1 - cosA) / Math.max(0.2, It) + cosA / Math.max(0.2, Il));
      if (inertiaOut) inertiaOut[i] = I;

      if (!final) continue;

      fr.time = t;
      fr.segment = seg;
      fr.airT = airT;
      fr.phase = inAir ? getPhase(airT) : 'ground';
      fr.quat.copy(qCur);
      fr.comLocal.copy(comLocal);
      for (const k of Object.keys(joints) as (keyof JointAngles)[]) {
        const src = joints[k];
        fr.joints[k][0] = src[0]; fr.joints[k][1] = src[1]; fr.joints[k][2] = src[2];
      }
      fr.omega.copy(omega);
      fr.omegaBody.copy(omegaBody);
      fr.omegaDeg = omega.length() / DEG;
      fr.inertia = I;
      fr.momentum = momentumShape(t) * Lmag;
      fr.tuck = Math.max(tuck, ch.tuck);
      fr.rotDegSoFar = rotDeg;
      fr.tiltDeg = omega.length() > 0.05 ? Math.acos(clamp(Math.abs(omega.y / omega.length()), 0, 1)) / DEG : 0;
      fr.bedDepth = tsample.bedDepth;
      fr.hipDrop = pose.hipDrop;

      // pivot placement: feet on the ground or com on the arc
      if (tsample.onGround) {
        _v.copy(feetLocal).sub(comLocal).applyQuaternion(qCur);
        fr.pivotPos.copy(tsample.point).sub(_v);
      } else {
        fr.pivotPos.copy(tsample.point);
      }
      fr.headPos.copy(headLocal).sub(comLocal).applyQuaternion(qCur).add(fr.pivotPos);
      fr.feetPos.copy(feetLocal).sub(comLocal).applyQuaternion(qCur).add(fr.pivotPos);
    }
  };

  // pass a: provisional rate, gives angular velocity and the measured inertia
  let { F, Lmag } = integrateF(provisional);
  const measured: number[] = new Array(n).fill(2.5);
  runPass(F, Lmag, measured, false);
  // pass b: real inertia, rerun to converge the velocity dependent pose
  ({ F, Lmag } = integrateF(measured));
  runPass(F, Lmag, measured, false);
  ({ F, Lmag } = integrateF(measured));
  // pass c: final
  runPass(F, Lmag, null, true);

  // summary
  let rotationalDeg = 0, tiltAcc = 0, wAcc = 0, peak = 0, meanAcc = 0, meanN = 0;
  let iExt = 0, iTuck = Infinity;
  for (let i = 0; i < n; i++) {
    const fr = frames[i];
    if (fr.segment !== 'flight') continue;
    const w = fr.omega.length();
    tiltAcc += fr.tiltDeg * w;
    wAcc += w;
    peak = Math.max(peak, fr.omegaDeg);
    meanAcc += fr.omegaDeg; meanN++;
    if (fr.airT < 0.05) iExt = Math.max(iExt, fr.inertia);
    iTuck = Math.min(iTuck, fr.inertia);
  }
  const last = frames[n - 1];
  rotationalDeg = last.rotDegSoFar;
  let touchdownOmega = 0;
  for (let i = n - 1; i >= 0; i--) {
    if (frames[i].segment === 'flight') { touchdownOmega = frames[i].omegaDeg; break; }
  }
  const summary: BakeSummary = {
    nominalDeg: config.rotationDeg,
    rotationalDeg,
    shortcutDeg: config.rotationDeg - rotationalDeg,
    weightedTiltDeg: wAcc > 0 ? tiltAcc / wAcc : 0,
    axisTiltDeg: path.tiltDeg,
    peakOmegaDeg: peak,
    meanOmegaDeg: meanN > 0 ? meanAcc / meanN : 0,
    touchdownOmegaDeg: touchdownOmega,
    airtime: timeline.flightTime,
    landingCorrectionDeg,
    precessionDeg: path.precessionRad / DEG,
    twistDeg: path.twistRad / DEG,
    inertiaExtended: iExt,
    inertiaTucked: Number.isFinite(iTuck) ? iTuck : iExt,
    modelLabel: path.label,
    mass: figure.totalMass(),
  };

  const baked: Baked = {
    config,
    trick,
    timeline,
    path,
    frames,
    dt: BAKE_DT,
    duration,
    summary,
    Lhat: path.Lhat.clone(),
    kicker,
    sampleAt(time: number, out: BakedFrame): BakedFrame {
      const tt = clamp(time, 0, duration);
      const fi = tt / BAKE_DT;
      const i0 = Math.min(n - 1, Math.floor(fi));
      const i1 = Math.min(n - 1, i0 + 1);
      const f = clamp01(fi - i0);
      const a = frames[i0], b = frames[i1];
      out.time = tt;
      out.segment = f < 0.5 ? a.segment : b.segment;
      out.airT = a.airT + (b.airT - a.airT) * f;
      out.phase = f < 0.5 ? a.phase : b.phase;
      out.pivotPos.copy(a.pivotPos).lerp(b.pivotPos, f);
      out.quat.copy(a.quat).slerp(b.quat, f);
      out.comLocal.copy(a.comLocal).lerp(b.comLocal, f);
      for (const k of Object.keys(a.joints) as (keyof JointAngles)[]) {
        const ja = a.joints[k], jb = b.joints[k], jo = out.joints[k];
        jo[0] = ja[0] + (jb[0] - ja[0]) * f;
        jo[1] = ja[1] + (jb[1] - ja[1]) * f;
        jo[2] = ja[2] + (jb[2] - ja[2]) * f;
      }
      out.omega.copy(a.omega).lerp(b.omega, f);
      out.omegaBody.copy(a.omegaBody).lerp(b.omegaBody, f);
      out.omegaDeg = a.omegaDeg + (b.omegaDeg - a.omegaDeg) * f;
      out.inertia = a.inertia + (b.inertia - a.inertia) * f;
      out.momentum = a.momentum + (b.momentum - a.momentum) * f;
      out.tuck = a.tuck + (b.tuck - a.tuck) * f;
      out.rotDegSoFar = a.rotDegSoFar + (b.rotDegSoFar - a.rotDegSoFar) * f;
      out.tiltDeg = a.tiltDeg + (b.tiltDeg - a.tiltDeg) * f;
      out.headPos.copy(a.headPos).lerp(b.headPos, f);
      out.feetPos.copy(a.feetPos).lerp(b.feetPos, f);
      out.bedDepth = a.bedDepth + (b.bedDepth - a.bedDepth) * f;
      out.hipDrop = a.hipDrop + (b.hipDrop - a.hipDrop) * f;
      return out;
    },
  };
  return baked;
}

function makeInput(
  mode: SceneMode,
  trick: TrickDefinition,
  spinDir: number,
  flipDir: number,
  offAxis: boolean,
): PoseInput {
  return {
    dt: BAKE_DT,
    time: 0,
    mode,
    segment: 'approach',
    segProgress: 0,
    airT: 0,
    family: trick.family,
    offAxis,
    spinDir,
    flipDir,
    channels: ZERO_CHANNELS,
    tuck: 0,
    tuckDepth: trick.tuckDepth,
    omegaX: 0, omegaY: 0, omegaZ: 0,
    spinAngle: 0, flipAngle: 0, comboAngle: 0,
    grab: 'none',
    grabBlend: 0,
    throwTime: -1,
    throwIntensity: 1,
    throwDuration: 0.5,
    windup: 0,
    popBlend: 0,
    landTime: -1,
    landingImpact: 0,
    groundPitch: 0,
  };
}

interface SetupParams {
  setDuration: number;
  throwIntensity: number;
  throwDuration: number;
  windupPeak: number;
  windupRamp: number;
}

function fillGroundInput(
  input: PoseInput,
  t: number,
  dt: number,
  ts: TimelineSample,
  tl: Timeline,
  config: BakeConfig,
  setup: SetupParams,
): void {
  input.dt = dt;
  input.time = t;
  input.segment = ts.segment;
  input.segProgress = ts.segProgress;
  input.airT = ts.airT;
  input.grab = config.grab;
  // the throw releases just before the skis leave the lip
  input.throwTime = t - (tl.flightStart - THROW_LEAD);
  input.throwIntensity = setup.throwIntensity;
  input.throwDuration = setup.throwDuration;
  // wind up builds through the approach and holds coiled through the set until the pop
  input.windup = setup.windupPeak * clamp01((t - (tl.setStart - setup.windupRamp)) / setup.windupRamp);
  if (t >= tl.setStart) input.windup = setup.windupPeak;
  input.landTime = t - tl.flightEnd;
  const vyLand = tl.takeoffVel.y - GRAVITY * tl.flightTime;
  input.landingImpact = clamp(Math.abs(vyLand) / 8, 0.4, 1.5);
  input.groundPitch = Math.atan2(ts.tangent.y, ts.tangent.z);
}

// lowest point under the boots, figure local space
function feetPoint(figure: Figure, target: THREE.Vector3): THREE.Vector3 {
  const invMat = new THREE.Matrix4().copy(figure.group.matrixWorld).invert();
  const a = new THREE.Vector3(0, -SEG.footHeight, 0.05).applyMatrix4(figure.joints.ankleL.matrixWorld).applyMatrix4(invMat);
  const b = new THREE.Vector3(0, -SEG.footHeight, 0.05).applyMatrix4(figure.joints.ankleR.matrixWorld).applyMatrix4(invMat);
  return target.copy(a).add(b).multiplyScalar(0.5);
}

function headPoint(figure: Figure, target: THREE.Vector3): THREE.Vector3 {
  const invMat = new THREE.Matrix4().copy(figure.group.matrixWorld).invert();
  return target.set(0, SEG.neck + SEG.headRadius, 0).applyMatrix4(figure.joints.neck.matrixWorld).applyMatrix4(invMat);
}

export type { PoseChannels };
