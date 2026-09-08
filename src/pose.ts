import type { JointName } from './figure';
import type { PoseChannels, Family } from './profiles';
import type { SegmentName, SceneMode } from './timeline';
import { PI, HALF_PI, lerp, clamp, clamp01, smoothstep, approach } from './curves';

// procedural body pose, ported from snowbox bodyAnimation.js and modelSwap.js
// the solver is stepped with a fixed dt by the baker so every smoothing state is
// reproducible and the result can be scrubbed
//
// poses are authored in semantic terms (flex forward, abduct out, fold forward, twist
// left) and converted to joint euler angles at the end, so the left and right side share
// one set of numbers

export type GrabType = 'none' | 'safety' | 'mute' | 'tail' | 'japan' | 'truck';
export const GRAB_TYPES: GrabType[] = ['none', 'safety', 'mute', 'tail', 'japan', 'truck'];
export const GRAB_NAMES: Record<GrabType, string> = {
  none: 'none',
  safety: 'Safety',
  mute: 'Mute',
  tail: 'Tail',
  japan: 'Japan',
  truck: 'Truck Driver',
};

export interface ArmPose {
  flex: number;     // shoulder flexion, + swings the arm forward
  abduct: number;   // + lifts the arm out to the side
  elbow: number;    // + bends the elbow
  wristFlex: number;
  wristTwist: number;
}

export interface LegPose {
  hipFlex: number;   // + lifts the thigh forward
  hipAbduct: number; // + moves the leg out to the side
  knee: number;      // + bends the knee
  ankleFlex: number; // + points the toes down
  ankleYaw: number;  // + turns the ski tip toward the skier's left
  ankleRoll: number; // + rolls onto the left edge
}

export interface SemanticPose {
  hipPitch: number;  // pelvis pitch, + tips the pelvis forward
  hipRoll: number;   // + drops the left hip
  hipYaw: number;
  hipDrop: number;   // meters the root drops below standing height
  spineFold: number; // + folds the chest forward
  spineTwist: number;// + turns the chest to the left
  spineLean: number; // + leans the chest to the left
  neckPitch: number; // + chin down
  neckYaw: number;   // + looks left
  neckRoll: number;  // + tilts the head left
  armL: ArmPose;
  armR: ArmPose;
  legL: LegPose;
  legR: LegPose;
}

export type JointAngles = Record<JointName, [number, number, number]>;

export function createPose(): SemanticPose {
  return {
    hipPitch: 0, hipRoll: 0, hipYaw: 0, hipDrop: 0,
    spineFold: 0, spineTwist: 0, spineLean: 0,
    neckPitch: 0, neckYaw: 0, neckRoll: 0,
    armL: { flex: 0, abduct: 0, elbow: 0, wristFlex: 0, wristTwist: 0 },
    armR: { flex: 0, abduct: 0, elbow: 0, wristFlex: 0, wristTwist: 0 },
    legL: { hipFlex: 0, hipAbduct: 0, knee: 0, ankleFlex: 0, ankleYaw: 0, ankleRoll: 0 },
    legR: { hipFlex: 0, hipAbduct: 0, knee: 0, ankleFlex: 0, ankleYaw: 0, ankleRoll: 0 },
  };
}

export function copyPose(src: SemanticPose, dst: SemanticPose): SemanticPose {
  dst.hipPitch = src.hipPitch; dst.hipRoll = src.hipRoll; dst.hipYaw = src.hipYaw; dst.hipDrop = src.hipDrop;
  dst.spineFold = src.spineFold; dst.spineTwist = src.spineTwist; dst.spineLean = src.spineLean;
  dst.neckPitch = src.neckPitch; dst.neckYaw = src.neckYaw; dst.neckRoll = src.neckRoll;
  Object.assign(dst.armL, src.armL); Object.assign(dst.armR, src.armR);
  Object.assign(dst.legL, src.legL); Object.assign(dst.legR, src.legR);
  return dst;
}

export function lerpPose(a: SemanticPose, b: SemanticPose, t: number, out: SemanticPose): SemanticPose {
  const L = (x: number, y: number) => x + (y - x) * t;
  out.hipPitch = L(a.hipPitch, b.hipPitch); out.hipRoll = L(a.hipRoll, b.hipRoll);
  out.hipYaw = L(a.hipYaw, b.hipYaw); out.hipDrop = L(a.hipDrop, b.hipDrop);
  out.spineFold = L(a.spineFold, b.spineFold); out.spineTwist = L(a.spineTwist, b.spineTwist);
  out.spineLean = L(a.spineLean, b.spineLean);
  out.neckPitch = L(a.neckPitch, b.neckPitch); out.neckYaw = L(a.neckYaw, b.neckYaw); out.neckRoll = L(a.neckRoll, b.neckRoll);
  for (const k of ['armL', 'armR'] as const) {
    const A = a[k], B = b[k], O = out[k];
    O.flex = L(A.flex, B.flex); O.abduct = L(A.abduct, B.abduct); O.elbow = L(A.elbow, B.elbow);
    O.wristFlex = L(A.wristFlex, B.wristFlex); O.wristTwist = L(A.wristTwist, B.wristTwist);
  }
  for (const k of ['legL', 'legR'] as const) {
    const A = a[k], B = b[k], O = out[k];
    O.hipFlex = L(A.hipFlex, B.hipFlex); O.hipAbduct = L(A.hipAbduct, B.hipAbduct); O.knee = L(A.knee, B.knee);
    O.ankleFlex = L(A.ankleFlex, B.ankleFlex); O.ankleYaw = L(A.ankleYaw, B.ankleYaw); O.ankleRoll = L(A.ankleRoll, B.ankleRoll);
  }
  return out;
}

// rest stance, the snowbox J table read semantically
export const REST: SemanticPose = {
  hipPitch: 0.08, hipRoll: 0, hipYaw: 0, hipDrop: 0,
  spineFold: 0.14, spineTwist: 0, spineLean: 0,
  neckPitch: -0.08, neckYaw: 0, neckRoll: 0,
  armL: { flex: 0.22, abduct: 0.28, elbow: 0.80, wristFlex: 0, wristTwist: 0 },
  armR: { flex: 0.22, abduct: 0.28, elbow: 0.80, wristFlex: 0, wristTwist: 0 },
  legL: { hipFlex: 0.30, hipAbduct: 0.08, knee: 0.55, ankleFlex: -0.25, ankleYaw: 0, ankleRoll: 0 },
  legR: { hipFlex: 0.30, hipAbduct: 0.08, knee: 0.55, ankleFlex: -0.25, ankleYaw: 0, ankleRoll: 0 },
};

// semantic to joint euler xyz for a figure facing +z with the left side at +x
export function poseToJoints(p: SemanticPose, out: JointAngles): JointAngles {
  out.hip = [p.hipPitch, p.hipYaw, -p.hipRoll];
  out.spine = [p.spineFold, p.spineTwist, -p.spineLean];
  out.neck = [p.neckPitch, p.neckYaw, -p.neckRoll];
  const arm = (a: ArmPose, side: number): [[number, number, number], [number, number, number], [number, number, number]] => [
    [-a.flex, 0, side * a.abduct],
    [-a.elbow, 0, 0],
    [-a.wristFlex, 0, side * a.wristTwist],
  ];
  const [sL, eL, wL] = arm(p.armL, 1);
  const [sR, eR, wR] = arm(p.armR, -1);
  out.shoulderL = sL; out.elbowL = eL; out.wristL = wL;
  out.shoulderR = sR; out.elbowR = eR; out.wristR = wR;
  const leg = (l: LegPose, side: number): [[number, number, number], [number, number, number], [number, number, number]] => [
    [-l.hipFlex, 0, side * l.hipAbduct],
    [l.knee, 0, 0],
    [l.ankleFlex, l.ankleYaw, l.ankleRoll],
  ];
  const [hL, kL, aL] = leg(p.legL, 1);
  const [hR, kR, aR] = leg(p.legR, -1);
  out.hipL = hL; out.kneeL = kL; out.ankleL = aL;
  out.hipR = hR; out.kneeR = kR; out.ankleR = aR;
  return out;
}

export function createJointAngles(): JointAngles {
  const z: [number, number, number] = [0, 0, 0];
  const o = {} as JointAngles;
  for (const n of [
    'hip', 'spine', 'neck', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR',
    'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR',
  ] as JointName[]) o[n] = [...z] as [number, number, number];
  return o;
}

// snowbox BODY_CFG, the parts that matter in the air
const CFG = {
  throwDuration: 0.50,
  throwArmSweep: 2.2,
  throwSpineCoil: 0.70,
  throwKneeCompress: -1.3,
  throwHipCoil: 0.55,
  throwNeckWhip: 0.40,
  throwOvershoot: 0.45,
  throwDamping: 0.55,
  tuckKneeFlex: 1.15,
  tuckHipFlex: 1.95,
  tuckSpineFold: 0.46,
  extendKneeFlex: 0.25,
  extendHipFlex: 0.15,
  counterRotation: 0.55,
  armAsymmetry: 0.45,
  legSeparation: 0.20,
  secondaryMotion: 0.13,
  tuckInertiaLag: 0.18,
  absorptionKnee: 1.8,
  absorptionHip: 0.4,
  headSpotMaxYaw: PI * 0.36,
  headSpotSnapRate: 22,
  headSpotIdleRate: 8,
};

const SMOOTH = {
  hip: 7, spine: 7, neck: 5.5, hipL: 7, knee: 6, ankle: 5, shoulder: 6, elbow: 5, wrist: 4,
};

export interface PoseInput {
  dt: number;
  time: number;
  mode: SceneMode;
  segment: SegmentName;
  segProgress: number;
  airT: number;
  family: Family;
  offAxis: boolean;
  spinDir: number;
  flipDir: number;
  channels: PoseChannels;
  // tuck used by the inertia, 0 to 1
  tuck: number;
  // family tuck depth, 1 is a full somersault tuck
  tuckDepth: number;
  // body frame angular velocity, rad/s
  omegaX: number;
  omegaY: number;
  omegaZ: number;
  // accumulated angles in radians
  spinAngle: number;
  flipAngle: number;
  comboAngle: number;
  grab: GrabType;
  grabBlend: number;
  // seconds since the throw began, negative before the set
  throwTime: number;
  throwIntensity: number;
  throwDuration: number;
  // 0 to 1 wind up during the approach
  windup: number;
  // 0 until the pop at the end of the lip, 1 when the skis leave
  popBlend: number;
  // seconds since touchdown, negative while airborne
  landTime: number;
  landingImpact: number;
  // ground slope pitch under the skier, + is uphill
  groundPitch: number;
}

interface Spring { pos: number; vel: number; }

export class PoseSolver {
  private poseBlend = 0;
  private laggedTuck = 0;
  private spineInertiaY = 0;
  private spineInertiaX = 0;
  private headInertiaY = 0;
  private throwSpringL: Spring = { pos: 0, vel: 0 };
  private throwSpringR: Spring = { pos: 0, vel: 0 };
  private headSpot = { inSpin: false, anchor: 0, yaw: 0, snapTimer: 0 };
  private sm = new Map<string, number>();
  private springs = new Map<string, Spring>();
  private landSpringsSeeded = false;

  private ground = createPose();
  private air = createPose();
  private land = createPose();
  private mixed = createPose();
  private result = createPose();

  reset(): void {
    this.poseBlend = 0;
    this.laggedTuck = 0;
    this.spineInertiaY = this.spineInertiaX = this.headInertiaY = 0;
    this.throwSpringL = { pos: 0, vel: 0 };
    this.throwSpringR = { pos: 0, vel: 0 };
    this.headSpot = { inSpin: false, anchor: 0, yaw: 0, snapTimer: 0 };
    this.sm.clear();
    this.springs.clear();
    this.landSpringsSeeded = false;
  }

  private smooth(key: string, target: number, rate: number, dt: number): number {
    const cur = this.sm.get(key);
    if (cur == null) { this.sm.set(key, target); return target; }
    const next = approach(cur, target, rate, dt);
    this.sm.set(key, next);
    return next;
  }

  private spring(key: string, target: number, stiffness: number, damping: number, dt: number): number {
    let s = this.springs.get(key);
    if (!s) { s = { pos: target, vel: 0 }; this.springs.set(key, s); }
    const force = stiffness * (target - s.pos);
    const drag = 2 * damping * Math.sqrt(stiffness) * s.vel;
    s.vel += (force - drag) * dt;
    s.pos += s.vel * dt;
    return s.pos;
  }

  private impulse(key: string, v: number, at: number): void {
    let s = this.springs.get(key);
    if (!s) { s = { pos: at, vel: 0 }; this.springs.set(key, s); }
    s.vel += v;
  }

  solve(inp: PoseInput): SemanticPose {
    const dt = Math.min(Math.max(inp.dt, 0), 1 / 30);
    const airborne = inp.segment === 'flight';
    const tricking = airborne || inp.popBlend > 0;

    // trick pose blend rises fast from the start of the set and decays after landing
    const tgt = tricking ? 1 : 0;
    this.poseBlend = approach(this.poseBlend, tgt, tricking ? 12 : 6, dt);
    if (this.poseBlend < 0.005) this.poseBlend = 0;

    this.solveGround(inp, this.ground);
    this.solveAir(inp, airborne, this.air);

    if (inp.landTime >= 0) {
      this.solveLanding(inp, dt, this.land);
      // the landing pose takes over as the trick blend decays
      lerpPose(this.land, this.air, this.poseBlend, this.mixed);
      copyPose(this.mixed, this.result);
    } else {
      lerpPose(this.ground, this.air, this.poseBlend, this.result);
    }
    return this.result;
  }

  // approach stance: ski crouch with the wind up, or a trampoline bounce stance
  private solveGround(inp: PoseInput, out: SemanticPose): void {
    copyPose(REST, out);
    const wu = clamp(inp.windup, 0, 1.5);
    const s = inp.spinDir;
    const f = inp.flipDir;
    if (inp.mode === 'skis') {
      // low, forward, hands ahead
      out.hipPitch = 0.18;
      out.spineFold = 0.34;
      out.neckPitch = -0.22;
      out.hipDrop = 0.10 + wu * 0.06;
      for (const leg of [out.legL, out.legR]) {
        leg.hipFlex = 0.75 + wu * 0.15;
        leg.knee = 1.05 + wu * 0.2;
        leg.ankleFlex = -(leg.knee - leg.hipFlex) - out.hipPitch;
        leg.hipAbduct = 0.06;
      }
      for (const arm of [out.armL, out.armR]) {
        arm.flex = 0.55;
        arm.abduct = 0.35;
        arm.elbow = 0.65;
      }
    } else {
      out.hipDrop = 0.04 + wu * 0.05;
      for (const leg of [out.legL, out.legR]) {
        leg.hipFlex = 0.25 + wu * 0.2;
        leg.knee = 0.45 + wu * 0.3;
        leg.ankleFlex = -(leg.knee - leg.hipFlex) - out.hipPitch;
        leg.hipAbduct = 0.05;
      }
      // arms swing back in the pre load, ready to throw up
      for (const arm of [out.armL, out.armR]) {
        arm.flex = -0.5 * wu + 0.2 * (1 - wu);
        arm.abduct = 0.25;
        arm.elbow = 0.3;
      }
    }
    // wind up coils the torso against the spin and dips toward the flip
    out.spineTwist += -s * wu * 0.22;
    out.spineFold += f * wu * 0.18;
    out.neckYaw += s * wu * 0.35;
    if (s !== 0) {
      const lead = s > 0 ? out.armL : out.armR;
      const trail = s > 0 ? out.armR : out.armL;
      lead.flex -= wu * 0.25;
      lead.abduct += wu * 0.15;
      trail.flex += wu * 0.15;
      trail.abduct += wu * 0.2;
    }
  }

  private solveAir(inp: PoseInput, airborne: boolean, out: SemanticPose): void {
    const dt = Math.min(Math.max(inp.dt, 0), 1 / 30);
    const ch = inp.channels;
    const s = inp.spinDir;
    const f = inp.flipDir === 0 ? 1 : inp.flipDir;
    const isFront = f > 0;
    const fam = inp.family;
    const isCombo = inp.offAxis;
    const isMisty = fam === 'misty';
    const t = inp.airT;
    const phase = t < 0.08 ? 'takeoff' : t < 0.18 ? 'axis_set' : t < 0.68 ? 'main' : t < 0.82 ? 'spot' : t < 0.94 ? 'land_prep' : 'absorb';
    const phaseP = phase === 'land_prep' ? clamp01((t - 0.82) / 0.12) : phase === 'absorb' ? clamp01((t - 0.94) / 0.06) : 0;
    const landFade = phase === 'land_prep' ? phaseP : phase === 'absorb' ? 1 : 0;
    // the arms start to open as soon as the landing is spotted, snowbox spotOpen timing
    const openFade = smoothstep((t - 0.68) / 0.22);

    const omegaLen = Math.hypot(inp.omegaX, inp.omegaY, inp.omegaZ);
    const flipRate = Math.abs(inp.omegaX);
    const spinRate = Math.abs(inp.omegaY);
    const rollRate = Math.abs(inp.omegaZ);
    const fStr = Math.min(1, flipRate / 6.0);
    const sStr = Math.min(1, spinRate / 6.0);
    const rStr = Math.min(1, rollRate / 4.0);
    const totalStr = Math.min(1, omegaLen / 7.0);
    const rollDir = inp.omegaZ >= 0 ? 1 : -1;

    // tuck with inertial lag
    const tuckTarget = clamp01(Math.max(ch.tuck, inp.tuck)) * inp.tuckDepth;
    const inertiaDelay = CFG.tuckInertiaLag * Math.min(1, omegaLen / 8);
    const tuckRate = 1 - Math.exp(-(1 / Math.max(0.02, inertiaDelay + 0.04)) * dt);
    this.laggedTuck += (clamp01(tuckTarget) - this.laggedTuck) * tuckRate;
    const tuck = this.laggedTuck;

    // wobble and breathing, deterministic in time
    const wp = inp.time * 7.3;
    const wobbleScale = isMisty ? 0.32 : (isCombo ? 1.8 : 1.0);
    const wobble = Math.sin(wp + inp.flipAngle * 2) * CFG.secondaryMotion * wobbleScale;
    const wobble2 = Math.cos(wp * 0.7) * CFG.secondaryMotion * 0.7 * wobbleScale;
    const wobble3 = Math.sin(wp * 1.3 + inp.spinAngle) * CFG.secondaryMotion * 0.5 * wobbleScale;
    const gForceWobble = totalStr * Math.sin(wp * 2.3 + omegaLen) * (isMisty ? 0.012 : (isCombo ? 0.08 : 0.04));
    const breathAir = Math.sin(inp.time * 1.8) * 0.006;

    // spine and head lag behind the body rotation
    const spineDrag = 1 - Math.exp(-3.5 * dt);
    this.spineInertiaY += (-s * sStr * 0.12 - this.spineInertiaY) * spineDrag;
    this.spineInertiaX += (-f * fStr * 0.08 - this.spineInertiaX) * spineDrag;
    const headDrag = 1 - Math.exp(-2.5 * dt);
    this.headInertiaY += (-s * sStr * 0.18 - this.headInertiaY) * headDrag;

    // ── throw, the set ──
    let throwBlend = 0, throwProgress = 0;
    let throwSpineX = 0, throwSpineY = 0, throwSpineZ = 0;
    let throwHip = 0, throwNeckWhip = 0, throwNeckTilt = 0, throwShoulderDrop = 0;
    let throwKnee = 0;
    let osL = 0, osR = 0;
    const throwDuration = inp.throwDuration > 0 ? inp.throwDuration : CFG.throwDuration;
    const throwActive = inp.throwTime >= 0 && inp.throwTime < throwDuration;
    if (throwActive) {
      const tt = inp.throwTime / throwDuration;
      throwProgress = clamp01(tt);
      throwBlend = tt < 0.3 ? Math.sin(tt / 0.3 * HALF_PI) : Math.cos((tt - 0.3) / 0.7 * HALF_PI);
      throwBlend = clamp01(throwBlend);
      const intensity = inp.throwIntensity || 1;

      const springTarget = throwBlend * CFG.throwOvershoot * intensity;
      const stiffness = 90;
      const damping = CFG.throwDamping * 2 * Math.sqrt(stiffness);
      const sL = this.throwSpringL;
      sL.vel += ((springTarget - sL.pos) * stiffness - sL.vel * damping) * dt;
      sL.pos += sL.vel * dt;
      osL = sL.pos;
      const sR = this.throwSpringR;
      sR.vel += ((springTarget * 0.6 - sR.pos) * stiffness * 0.65 - sR.vel * damping) * dt;
      sR.pos += sR.vel * dt;
      osR = sR.pos;

      const coilEarly = tt < 0.25 ? -Math.sin(tt / 0.25 * HALF_PI) : Math.sin((tt - 0.25) / 0.75 * PI) * 0.6;
      const coilLate = tt < 0.2 ? -Math.sin(tt / 0.2 * HALF_PI) : Math.sin((tt - 0.2) / 0.8 * PI) * 0.7;
      const C = CFG;

      if (fam === 'cork' || fam === 'dspin') {
        throwSpineX = f * C.throwSpineCoil * coilEarly * intensity * 1.0;
        throwSpineY = s * C.throwSpineCoil * coilLate * intensity * 1.2;
        throwSpineZ = s * C.throwSpineCoil * throwBlend * intensity * 0.8;
        throwHip = f * C.throwHipCoil * coilEarly * intensity * 0.8;
        throwNeckWhip = -f * C.throwNeckWhip * throwBlend * intensity * 0.7;
        throwShoulderDrop = s * throwBlend * intensity * 0.7;
        throwNeckTilt = s * throwBlend * intensity * 0.35;
      } else if (isMisty) {
        throwSpineX = f * C.throwSpineCoil * throwBlend * intensity * 0.92;
        throwSpineY = s * C.throwSpineCoil * throwBlend * intensity * 0.62;
        throwSpineZ = s * C.throwSpineCoil * throwBlend * intensity * 0.70;
        throwHip = f * C.throwHipCoil * throwBlend * intensity * 0.86;
        throwNeckWhip = -f * C.throwNeckWhip * throwBlend * intensity * 1.18;
        throwNeckTilt = s * throwBlend * intensity * 0.42;
        throwShoulderDrop = s * throwBlend * intensity * 1.02;
      } else if (fam === 'rodeo') {
        throwSpineX = f * C.throwSpineCoil * coilEarly * intensity * -1.3;
        throwSpineY = s * C.throwSpineCoil * coilLate * intensity * 1.1;
        throwSpineZ = -s * C.throwSpineCoil * throwBlend * intensity * 0.5;
        throwHip = f * C.throwHipCoil * coilEarly * intensity * -0.9;
        throwNeckWhip = f * C.throwNeckWhip * throwBlend * intensity * 0.6;
        throwShoulderDrop = -s * throwBlend * intensity * 0.5;
        throwNeckTilt = -s * throwBlend * intensity * 0.2;
      } else if (fam === 'bio' || fam === 'flatspin') {
        throwSpineX = f * C.throwSpineCoil * coilEarly * intensity * 1.4;
        throwSpineY = s * C.throwSpineCoil * coilLate * intensity * 1.0;
        throwSpineZ = -s * C.throwSpineCoil * throwBlend * intensity * 0.6;
        throwHip = s * C.throwHipCoil * throwBlend * intensity * 0.7;
        throwNeckWhip = -f * C.throwNeckWhip * throwBlend * intensity * 0.9;
        throwShoulderDrop = -s * throwBlend * intensity * 0.6;
        throwNeckTilt = s * throwBlend * intensity * 0.3;
      } else if (fam === 'flip') {
        throwSpineX = f * C.throwSpineCoil * coilEarly * intensity * 1.5;
        throwHip = f * C.throwHipCoil * coilEarly * intensity;
        throwNeckWhip = -f * C.throwNeckWhip * throwBlend * intensity;
      } else if (fam === 'lincoln') {
        throwSpineZ = s * C.throwSpineCoil * coilLate * intensity * 1.2;
        throwHip = 0;
        throwNeckTilt = s * throwBlend * intensity * 0.5;
      } else {
        throwSpineY = s * C.throwSpineCoil * coilLate * intensity * 1.3;
        throwHip = s * C.throwHipCoil * coilLate * intensity * 0.7;
        throwNeckWhip = -s * C.throwNeckWhip * throwBlend * intensity * 0.8;
      }

      const kneePhase = tt < 0.15 ? -Math.sin(tt / 0.15 * HALF_PI) : Math.sin((tt - 0.15) / 0.85 * PI * 0.7) * 0.4;
      throwKnee = C.throwKneeCompress * kneePhase * intensity;
    }

    // ── legs ──
    const kneeTgt = lerp(CFG.extendKneeFlex, CFG.tuckKneeFlex, tuck);
    const hipTgt = lerp(CFG.extendHipFlex, CFG.tuckHipFlex, tuck);
    const mistyWideSet = isMisty ? 0.9 * (1 - smoothstep((t - 0.04) / 0.46)) : 0;
    const legSep = CFG.legSeparation * (0.5 + 0.5 * Math.sin(isCombo ? inp.comboAngle : inp.flipAngle) + mistyWideSet);
    const ankleFlex = tuck * 0.42;

    let kneeLExtra = 0, kneeRExtra = 0;
    if (sStr > 0.15) {
      const legAsym = sStr * 0.08;
      if (s > 0) { kneeLExtra = legAsym; kneeRExtra = -legAsym * 0.5; }
      else { kneeRExtra = legAsym; kneeLExtra = -legAsym * 0.5; }
    }

    // ── spine ──
    const offAxisAmount = isCombo ? (isMisty ? totalStr : Math.min(fStr, sStr) * 2) : 0;
    const counterAmount = ch.spineCounter * CFG.counterRotation;
    let spineX: number, spineY: number, spineZ: number;
    if (isFront) spineX = lerp(0.1, CFG.tuckSpineFold, tuck) + fStr * 0.2;
    else spineX = lerp(0.05, -0.35, tuck) - fStr * 0.2;
    spineX += throwSpineX + this.spineInertiaX + breathAir;
    spineX += ch.hipSet * 0.3;

    spineY = -s * sStr * counterAmount * 0.5 + wobble + throwSpineY + this.spineInertiaY;
    spineZ = s * sStr * counterAmount * 0.15 + wobble2 + gForceWobble + throwSpineZ;
    spineZ += Math.sin(wp * 0.9) * totalStr * (isMisty ? 0.012 : 0.06);
    spineZ += ch.shoulderDrop * 0.35;

    if (landFade > 0) {
      spineX = lerp(spineX, 0.12, landFade * 0.6);
      spineY = lerp(spineY, 0, landFade * 0.4);
      spineZ = lerp(spineZ, 0, landFade * 0.5);
    }

    if (isCombo && totalStr > 0.15) {
      const offAx = offAxisAmount * totalStr;
      if (fam === 'cork' || fam === 'dspin') {
        spineZ += s * offAx * 0.35;
        spineX += fStr * offAx * 0.15;
      } else if (isMisty) {
        spineX += offAx * 0.42;
        spineY += s * offAx * 0.08;
        spineZ += s * offAx * 0.18;
      } else if (fam === 'rodeo') {
        spineX -= offAx * 0.25;
        spineZ -= s * offAx * 0.20;
      } else if (fam === 'bio' || fam === 'flatspin') {
        spineY += s * offAx * 0.30;
        spineX += offAx * 0.15;
      } else {
        spineZ += s * offAx * 0.20;
      }
      spineZ += rollDir * rStr * 0.20 * totalStr;
    }

    // ── neck and head ──
    const flipDominant = fStr > sStr;
    let neckX = -f * fStr * counterAmount * 0.7 + (flipDominant ? throwNeckWhip : 0);
    let neckY = -s * sStr * counterAmount * 1.0 + this.headInertiaY + (flipDominant ? 0 : throwNeckWhip);
    let neckZ = s * sStr * 0.15 + wobble3 + throwNeckTilt;

    // head yaw spotting: counter rotate then snap, from snowbox headSpotting.js
    const spotYaw = this.updateHeadSpot(inp, dt, airborne && spinRate > 0.8, t);
    neckY += spotYaw;

    if (ch.headSpot > 0.05) {
      neckX = lerp(neckX, f * 0.35, ch.headSpot * 0.7);
      neckY = lerp(neckY, 0, ch.headSpot * 0.5);
      neckZ = lerp(neckZ, 0, ch.headSpot * 0.3);
    }
    if (landFade > 0) {
      neckX = lerp(neckX, -0.15, landFade * 0.6);
      neckY = lerp(neckY, 0, landFade * 0.6);
    }

    // ── arms ──
    const leftLeads = s > 0;
    const trailTuck = this.smooth('trailTuck', tuck, 6, dt);
    let sLx: number, sLz: number, eLx: number, wLx: number, wLz: number;
    let sRx: number, sRz: number, eRx: number, wRx: number, wRz: number;
    if (tuck > 0.5) {
      const tuckF = (tuck - 0.5) * 2;
      const tuckFTrail = Math.max(0, (trailTuck - 0.5) * 2);
      const leadF = leftLeads ? tuckF : tuckFTrail;
      const trailF = leftLeads ? tuckFTrail : tuckF;
      sLx = lerp(-0.2, 0.8, leadF); sLz = lerp(0.3, 0.08, leadF); eLx = lerp(0.5, 1.6, leadF); wLx = lerp(0, 0.3, leadF);
      sRx = lerp(-0.2, 0.8, trailF); sRz = lerp(0.3, 0.08, trailF); eRx = lerp(0.5, 1.6, trailF); wRx = lerp(0, 0.3, trailF);
      wLz = wRz = 0;
    } else {
      const extF = 1 - tuck * 2;
      const extFTrail = 1 - trailTuck * 2;
      const leadE = leftLeads ? extF : extFTrail;
      const trailE = leftLeads ? extFTrail : extF;
      sLx = lerp(-0.15, -0.08, leadE); sLz = lerp(0.2, 0.28, leadE); eLx = lerp(0.5, 0.35, leadE);
      sRx = lerp(-0.15, -0.08, trailE); sRz = lerp(0.2, 0.28, trailE); eRx = lerp(0.5, 0.35, trailE);
      wLx = wRx = 0; wLz = wRz = 0;
    }

    const armAsym = Math.max(CFG.armAsymmetry * sStr, Math.abs(ch.armSet));
    if (sStr > 0.15 || Math.abs(ch.armSet) > 0.1) {
      if (s > 0) { sLz -= armAsym * 0.35; sRz += armAsym * 0.12; eLx += armAsym * 0.45; }
      else { sRz -= armAsym * 0.35; sLz += armAsym * 0.12; eRx += armAsym * 0.45; }
    }

    if (openFade > 0) {
      // arms come wide as the landing is spotted, which is what slows the spin
      sLx = lerp(sLx, 0.25, openFade * 0.9); sLz = lerp(sLz, 1.35, openFade * 0.9);
      sRx = lerp(sRx, 0.25, openFade * 0.9); sRz = lerp(sRz, 1.35, openFade * 0.9);
      eLx = lerp(eLx, 0.15, openFade * 0.8); eRx = lerp(eRx, 0.15, openFade * 0.8);
    }

    // throw arm sweeps, family specific
    if (throwBlend > 0.01) {
      const throwSweep = CFG.throwArmSweep * throwBlend;
      if (isCombo) {
        if (fam === 'cork' || fam === 'dspin') {
          // lead arm reaches across and down, trailing arm sweeps up
          if (leftLeads) {
            sLx = lerp(sLx, sLx + f * throwSweep * 0.5 + osL * 0.8, throwBlend);
            sLz = lerp(sLz, sLz + throwSweep * 0.6 + throwShoulderDrop * 0.5, throwBlend);
            sRx = lerp(sRx, sRx - f * throwSweep * 0.3 + osR * 0.6, throwBlend);
            sRz = lerp(sRz, sRz + throwSweep * 0.8 + throwShoulderDrop * 0.3, throwBlend);
          } else {
            sRx = lerp(sRx, sRx + f * throwSweep * 0.5 + osR * 0.8, throwBlend);
            sRz = lerp(sRz, sRz + throwSweep * 0.6 + throwShoulderDrop * 0.5, throwBlend);
            sLx = lerp(sLx, sLx - f * throwSweep * 0.3 + osL * 0.6, throwBlend);
            sLz = lerp(sLz, sLz + throwSweep * 0.8 + throwShoulderDrop * 0.3, throwBlend);
          }
          eLx = lerp(eLx, eLx + osL * 1.6, throwBlend * 0.5);
          eRx = lerp(eRx, eRx + osR * 1.6, throwBlend * 0.5);
        } else if (isMisty) {
          // seatbelt: one arm starts high and outside, then sweeps across the chest to the opposite hip
          const raised = 1 - smoothstep((throwProgress - 0.12) / 0.24);
          const pull = smoothstep((throwProgress - 0.08) / 0.46);
          const setW = raised * throwBlend;
          const pullW = pull * throwBlend;
          const throwRight = s > 0;
          if (throwRight) {
            sRx = lerp(sRx, -0.58, setW); sRz = lerp(sRz, 0.96, setW); eRx = lerp(eRx, 0.28, setW);
            sRx = lerp(sRx, 1.08 + osR * 0.45, pullW); sRz = lerp(sRz, -0.38, pullW); eRx = lerp(eRx, 1.18, pullW);
            wRz = lerp(wRz, -0.42, pullW);
            sLx = lerp(sLx, 0.28 + osL * 0.25, pullW * 0.7); sLz = lerp(sLz, 0.52, pullW * 0.7);
          } else {
            sLx = lerp(sLx, -0.58, setW); sLz = lerp(sLz, 0.96, setW); eLx = lerp(eLx, 0.28, setW);
            sLx = lerp(sLx, 1.08 + osL * 0.45, pullW); sLz = lerp(sLz, -0.38, pullW); eLx = lerp(eLx, 1.18, pullW);
            wLz = lerp(wLz, 0.42, pullW);
            sRx = lerp(sRx, 0.28 + osR * 0.25, pullW * 0.7); sRz = lerp(sRz, 0.52, pullW * 0.7);
          }
        } else if (fam === 'rodeo') {
          // arms sweep wide and back, opening the chest
          sLx = lerp(sLx, sLx - f * throwSweep * 0.6 + osL * 0.7, throwBlend);
          sRx = lerp(sRx, sRx - f * throwSweep * 0.6 + osR * 0.7, throwBlend);
          sLz = lerp(sLz, sLz + throwSweep * 0.7 - throwShoulderDrop * 0.3, throwBlend);
          sRz = lerp(sRz, sRz + throwSweep * 0.7 + throwShoulderDrop * 0.3, throwBlend);
          eLx = lerp(eLx, eLx - osL * 0.8, throwBlend * 0.4);
          eRx = lerp(eRx, eRx - osR * 0.8, throwBlend * 0.4);
        } else {
          // bio and flatspin: cross body twist, lead arm across, trailing arm behind
          if (leftLeads) {
            sLx = lerp(sLx, sLx + f * throwSweep * 0.7, throwBlend);
            sLz = lerp(sLz, sLz - throwSweep * 0.5, throwBlend);
            sRx = lerp(sRx, sRx - f * throwSweep * 0.5 + osR, throwBlend);
            sRz = lerp(sRz, sRz - throwSweep * 0.4, throwBlend);
          } else {
            sRx = lerp(sRx, sRx + f * throwSweep * 0.7, throwBlend);
            sRz = lerp(sRz, sRz - throwSweep * 0.5, throwBlend);
            sLx = lerp(sLx, sLx - f * throwSweep * 0.5 + osL, throwBlend);
            sLz = lerp(sLz, sLz - throwSweep * 0.4, throwBlend);
          }
          eLx = lerp(eLx, eLx + osL * 1.4, throwBlend * 0.5);
          eRx = lerp(eRx, eRx + osR * 1.4, throwBlend * 0.5);
        }
        wLx = lerp(wLx, osL * 0.8, throwBlend * 0.3);
        wRx = lerp(wRx, osR * 0.8, throwBlend * 0.3);
        wLz = lerp(wLz, osL * 0.4, throwBlend * 0.25);
        wRz = lerp(wRz, osR * 0.4, throwBlend * 0.25);
      } else if (fam === 'spin' || fam === 'lincoln') {
        // horizontal arm sweep and body coil
        sLx = lerp(sLx, sLx + s * (throwSweep * 0.6 + osL * 1.5), throwBlend);
        sRx = lerp(sRx, sRx + s * (throwSweep * 0.6 + osR * 1.5), throwBlend);
        sLz = lerp(sLz, sLz + throwSweep * 0.5 + osL * 0.8, throwBlend);
        sRz = lerp(sRz, sRz + throwSweep * 0.5 + osR * 0.8, throwBlend);
        eLx = lerp(eLx, eLx + osL * 1.8, throwBlend * 0.5);
        eRx = lerp(eRx, eRx + osR * 1.8, throwBlend * 0.5);
        wLx = lerp(wLx, osL * 1.0, throwBlend * 0.3);
        wRx = lerp(wRx, osR * 1.0, throwBlend * 0.3);
      } else {
        // flip: arms reach overhead then down
        sLx = lerp(sLx, sLx + f * (throwSweep * 0.8 + osL * 1.3), throwBlend);
        sRx = lerp(sRx, sRx + f * (throwSweep * 0.8 + osR * 1.3), throwBlend);
        sLz = lerp(sLz, sLz - 0.3 * throwBlend, throwBlend);
        sRz = lerp(sRz, sRz - 0.3 * throwBlend, throwBlend);
        eLx = lerp(eLx, eLx + osL * 1.5, throwBlend * 0.45);
        eRx = lerp(eRx, eRx + osR * 1.5, throwBlend * 0.45);
        wLx = lerp(wLx, osL * 0.8, throwBlend * 0.3);
        wRx = lerp(wRx, osR * 0.8, throwBlend * 0.3);
      }
    }

    // sustained off axis shape once the rotation is going, released as the landing is spotted
    // for a left spin the right arm is the one that reaches forward and across
    if (isCombo && totalStr > 0.2 && openFade < 1) {
      const comboStr = totalStr * 0.6 * (1 - openFade);
      const rightReaches = s > 0;
      if (fam === 'cork' || fam === 'dspin') {
        if (rightReaches) {
          sRx = lerp(sRx, 0.7, comboStr); sRz = lerp(sRz, sRz * 0.2 + 0.3, comboStr); eRx = lerp(eRx, 1.4, comboStr);
          sLz = lerp(sLz, sLz + 0.5, comboStr); eLx = lerp(eLx, 0.3, comboStr);
        } else {
          sLx = lerp(sLx, 0.7, comboStr); sLz = lerp(sLz, sLz * 0.2 + 0.3, comboStr); eLx = lerp(eLx, 1.4, comboStr);
          sRz = lerp(sRz, sRz + 0.5, comboStr); eRx = lerp(eRx, 0.3, comboStr);
        }
        spineZ = lerp(spineZ, spineZ + s * 0.25 * totalStr, comboStr);
      } else if (isMisty) {
        if (rightReaches) {
          sRx = lerp(sRx, 0.92, comboStr); sRz = lerp(sRz, -0.24, comboStr); eRx = lerp(eRx, 1.28, comboStr);
          sLx = lerp(sLx, 0.42, comboStr * 0.85); sLz = lerp(sLz, 0.36, comboStr * 0.85); eLx = lerp(eLx, 0.72, comboStr * 0.85);
        } else {
          sLx = lerp(sLx, 0.92, comboStr); sLz = lerp(sLz, -0.24, comboStr); eLx = lerp(eLx, 1.28, comboStr);
          sRx = lerp(sRx, 0.42, comboStr * 0.85); sRz = lerp(sRz, 0.36, comboStr * 0.85); eRx = lerp(eRx, 0.72, comboStr * 0.85);
        }
        spineX = lerp(spineX, spineX + 0.28 * totalStr, comboStr * 0.55);
        spineZ = lerp(spineZ, spineZ + s * 0.11 * totalStr, comboStr * 0.5);
      } else if (fam === 'rodeo') {
        sLx = lerp(sLx, sLx - 0.3, comboStr); sRx = lerp(sRx, sRx - 0.3, comboStr);
        sLz = lerp(sLz, sLz + 0.4, comboStr); sRz = lerp(sRz, sRz + 0.4, comboStr);
        eLx = lerp(eLx, eLx - 0.3, comboStr * 0.5); eRx = lerp(eRx, eRx - 0.3, comboStr * 0.5);
        spineX = lerp(spineX, spineX - 0.2 * totalStr, comboStr * 0.5);
      } else if (fam === 'bio' || fam === 'flatspin') {
        if (rightReaches) {
          sRx = lerp(sRx, 1.0, comboStr); sRz = lerp(sRz, sRz - 0.2, comboStr); eRx = lerp(eRx, 1.5, comboStr);
          sLx = lerp(sLx, sLx - 0.3, comboStr); sLz = lerp(sLz, sLz + 0.6, comboStr); eLx = lerp(eLx, -0.1, comboStr);
        } else {
          sLx = lerp(sLx, 1.0, comboStr); sLz = lerp(sLz, sLz - 0.2, comboStr); eLx = lerp(eLx, 1.5, comboStr);
          sRx = lerp(sRx, sRx - 0.3, comboStr); sRz = lerp(sRz, sRz + 0.6, comboStr); eRx = lerp(eRx, -0.1, comboStr);
        }
        spineY = lerp(spineY, spineY + s * 0.2 * totalStr, comboStr * 0.5);
      }
    }
    // lincoln: arms overhead like a cartwheel
    if (fam === 'lincoln' && totalStr > 0.2) {
      const c = totalStr * 0.6 * (1 - openFade);
      sLz = lerp(sLz, 2.4, c); sRz = lerp(sRz, 2.4, c);
      sLx = lerp(sLx, 0.1, c); sRx = lerp(sRx, 0.1, c);
      eLx = lerp(eLx, 0.2, c); eRx = lerp(eRx, 0.2, c);
    }

    // ── grab overlay, shoulders reach first, elbows catch up, wrists arrive last ──
    const gb = clamp01(inp.grabBlend);
    let grabKneeL = 0, grabKneeR = 0, grabHipLX = 0, grabHipRX = 0, grabHipLZ = 0, grabHipRZ = 0;
    let grabAnkleLX = 0, grabAnkleRX = 0, grabAnkleLY = 0, grabAnkleRY = 0, grabAnkleLZ = 0, grabAnkleRZ = 0;
    if (gb > 0.02 && inp.grab !== 'none') {
      const g = grabPose(inp.grab, gb, inp.time);
      const shoulderGrab = Math.min(1, gb * 1.4);
      const elbowGrab = Math.min(1, gb * 1.0);
      const wristGrab = Math.min(1, gb * 0.7);
      sLx = lerp(sLx, g.sLx, shoulderGrab); sLz = lerp(sLz, g.sLz, shoulderGrab);
      sRx = lerp(sRx, g.sRx, shoulderGrab); sRz = lerp(sRz, g.sRz, shoulderGrab);
      eLx = lerp(eLx, g.eLx, elbowGrab); eRx = lerp(eRx, g.eRx, elbowGrab);
      wLx = lerp(wLx, g.wLx, wristGrab); wLz = lerp(wLz, g.wLz, wristGrab);
      wRx = lerp(wRx, g.wRx, wristGrab); wRz = lerp(wRz, g.wRz, wristGrab);
      if (g.kneeFlex != null) {
        const d = (g.kneeFlex - kneeTgt) * gb;
        grabKneeL = d + (g.kneeLExtra || 0) * gb;
        grabKneeR = d + (g.kneeRExtra || 0) * gb;
      }
      if (g.spineX != null) spineX = lerp(spineX, g.spineX, gb);
      if (g.spineY != null) spineY = lerp(spineY, spineY + g.spineY, gb);
      if (g.hipLZ != null) grabHipLZ = g.hipLZ * gb;
      if (g.hipRZ != null) grabHipRZ = g.hipRZ * gb;
      if (g.hipLX != null) grabHipLX = (g.hipLX - hipTgt) * gb;
      if (g.hipRX != null) grabHipRX = (g.hipRX - hipTgt) * gb;
      if (g.ankleLX != null) grabAnkleLX = g.ankleLX * gb;
      if (g.ankleRX != null) grabAnkleRX = g.ankleRX * gb;
      if (g.ankleLY != null) grabAnkleLY = g.ankleLY * gb;
      if (g.ankleRY != null) grabAnkleRY = g.ankleRY * gb;
      if (g.ankleLZ != null) grabAnkleLZ = g.ankleLZ * gb;
      if (g.ankleRZ != null) grabAnkleRZ = g.ankleRZ * gb;
    }

    // ── legs, hips, ankles ──
    let kneeLOff = 0, kneeROff = 0;
    if (isCombo && totalStr > 0.2) {
      const kneeAsym = offAxisAmount * totalStr * 0.10;
      if (s > 0) { kneeLOff = kneeAsym; kneeROff = -kneeAsym * 0.4; }
      else { kneeROff = kneeAsym; kneeLOff = -kneeAsym * 0.4; }
    }
    let kneeLTarget = kneeTgt + kneeLExtra + kneeLOff;
    let kneeRTarget = kneeTgt + kneeRExtra + kneeROff;
    if (landFade > 0) {
      kneeLTarget = lerp(kneeLTarget, 0.25, landFade * 0.7);
      kneeRTarget = lerp(kneeRTarget, 0.25, landFade * 0.7);
    }
    // knees compress then spring open during the throw
    if (throwBlend > 0.01) {
      kneeLTarget = lerp(kneeLTarget, kneeLTarget - throwKnee, throwBlend);
      kneeRTarget = lerp(kneeRTarget, kneeRTarget - throwKnee, throwBlend);
    }

    let hipLZ = legSep, hipRZ = legSep;
    let hipOffAxisX = 0;
    if (isCombo && totalStr > 0.2) {
      const hipTilt = offAxisAmount * totalStr * 0.15;
      hipLZ += s * hipTilt;
      hipRZ -= s * hipTilt * 0.5;
      if (isMisty || fam === 'bio' || fam === 'flatspin') hipOffAxisX = offAxisAmount * totalStr * 0.12;
      else if (fam === 'rodeo' || fam === 'dspin') hipOffAxisX = -offAxisAmount * totalStr * 0.10;
    }

    let ankleLY = 0, ankleRY = 0, ankleLZ = 0, ankleRZ = 0;
    if (ch.skiCross > 0.05) {
      const cross = ch.skiCross;
      ankleLY = cross * 0.25 * s;
      ankleRY = -cross * 0.15 * s;
      ankleLZ = cross * 0.15 * s;
      ankleRZ = -cross * 0.08 * s;
      hipLZ -= cross * 0.12 * s;
      hipRZ += cross * 0.06 * s;
    }

    let hipLTarget = hipTgt + hipOffAxisX;
    let hipRTarget = hipTgt + hipOffAxisX;
    if (landFade > 0) {
      hipLTarget = lerp(hipLTarget, REST.legL.hipFlex, landFade * 0.5);
      hipRTarget = lerp(hipRTarget, REST.legR.hipFlex, landFade * 0.5);
      hipLZ = lerp(hipLZ, 0, landFade * 0.6);
      hipRZ = lerp(hipRZ, 0, landFade * 0.6);
      ankleLY *= 1 - landFade * 0.8; ankleRY *= 1 - landFade * 0.8;
      ankleLZ *= 1 - landFade * 0.8; ankleRZ *= 1 - landFade * 0.8;
    }

    // hip root coil during the throw
    let hipPitch = REST.hipPitch;
    let hipRoll = 0;
    if (throwBlend > 0.01) {
      if (isCombo) {
        hipPitch = lerp(hipPitch, REST.hipPitch + throwHip, throwBlend * 0.6);
        hipRoll = lerp(hipRoll, throwShoulderDrop * 0.3, throwBlend * 0.5);
      } else if (flipDominant) {
        hipPitch = lerp(hipPitch, REST.hipPitch + throwHip, throwBlend * 0.6);
      } else {
        hipRoll = lerp(hipRoll, throwHip * 0.5, throwBlend * 0.5);
      }
    }

    // ── write with per joint smoothing ──
    out.hipPitch = this.smooth('hip_rx', hipPitch, SMOOTH.hip, dt);
    out.hipRoll = this.smooth('hip_rz', hipRoll, SMOOTH.hip, dt);
    out.hipYaw = 0;
    out.hipDrop = tuck * 0.10;
    out.spineFold = this.smooth('spine_rx', spineX, SMOOTH.spine, dt);
    out.spineTwist = this.smooth('spine_ry', spineY, SMOOTH.spine, dt);
    out.spineLean = this.smooth('spine_rz', spineZ, SMOOTH.spine, dt);
    out.neckPitch = this.smooth('neck_rx', neckX, SMOOTH.neck, dt);
    out.neckYaw = this.smooth('neck_ry', neckY, SMOOTH.neck, dt);
    out.neckRoll = this.smooth('neck_rz', neckZ, SMOOTH.neck, dt);

    out.armL.flex = this.smooth('sL_rx', sLx, SMOOTH.shoulder, dt);
    out.armL.abduct = this.smooth('sL_rz', sLz, SMOOTH.shoulder, dt);
    out.armR.flex = this.smooth('sR_rx', sRx, SMOOTH.shoulder, dt);
    out.armR.abduct = this.smooth('sR_rz', sRz, SMOOTH.shoulder, dt);
    out.armL.elbow = this.smooth('eL_rx', eLx, SMOOTH.elbow, dt);
    out.armR.elbow = this.smooth('eR_rx', eRx, SMOOTH.elbow, dt);
    out.armL.wristFlex = this.smooth('wL_rx', wLx, SMOOTH.wrist, dt);
    out.armL.wristTwist = this.smooth('wL_rz', wLz, SMOOTH.wrist, dt);
    out.armR.wristFlex = this.smooth('wR_rx', wRx, SMOOTH.wrist, dt);
    out.armR.wristTwist = this.smooth('wR_rz', wRz, SMOOTH.wrist, dt);

    out.legL.knee = this.smooth('kneeL_rx', kneeLTarget, SMOOTH.knee, dt) + grabKneeL;
    out.legR.knee = this.smooth('kneeR_rx', kneeRTarget, SMOOTH.knee, dt) + grabKneeR;
    out.legL.hipFlex = this.smooth('hipL_rx', hipLTarget, SMOOTH.hipL, dt) + grabHipLX;
    out.legR.hipFlex = this.smooth('hipR_rx', hipRTarget, SMOOTH.hipL, dt) + grabHipRX;
    out.legL.hipAbduct = this.smooth('hipL_rz', hipLZ, SMOOTH.hipL, dt) + grabHipLZ;
    out.legR.hipAbduct = this.smooth('hipR_rz', hipRZ, SMOOTH.hipL, dt) + grabHipRZ;
    out.legL.ankleFlex = REST.legL.ankleFlex + this.smooth('ankleL_rx', ankleFlex, SMOOTH.ankle, dt) + grabAnkleLX;
    out.legR.ankleFlex = REST.legR.ankleFlex + this.smooth('ankleR_rx', ankleFlex, SMOOTH.ankle, dt) + grabAnkleRX;
    out.legL.ankleYaw = this.smooth('ankleL_ry', ankleLY, SMOOTH.ankle, dt) + grabAnkleLY;
    out.legR.ankleYaw = this.smooth('ankleR_ry', ankleRY, SMOOTH.ankle, dt) + grabAnkleRY;
    out.legL.ankleRoll = this.smooth('ankleL_rz', ankleLZ, SMOOTH.ankle, dt) + grabAnkleLZ;
    out.legR.ankleRoll = this.smooth('ankleR_rz', ankleRZ, SMOOTH.ankle, dt) + grabAnkleRZ;
  }

  // advanceHeadSpotTarget from snowbox, plus the pursuit and fade from modelSwap.js
  private updateHeadSpot(inp: PoseInput, dt: number, active: boolean, t: number): number {
    const hs = this.headSpot;
    const limit = CFG.headSpotMaxYaw;
    let target = 0;
    if (active) {
      const angle = inp.spinAngle;
      if (!hs.inSpin) { hs.inSpin = true; hs.anchor = angle; }
      let yaw = -(angle - hs.anchor);
      let snapped = false;
      while (yaw < -limit) { yaw += limit * 2; hs.anchor += limit * 2; snapped = true; }
      while (yaw > limit) { yaw -= limit * 2; hs.anchor -= limit * 2; snapped = true; }
      if (snapped) hs.snapTimer = 0.18;
      target = yaw;
    } else {
      hs.inSpin = false;
    }
    const landFade = t > 0.72 ? Math.max(0, 1 - (t - 0.72) / 0.20) : 1;
    target *= landFade;
    const rate = hs.snapTimer > 0 ? CFG.headSpotSnapRate : CFG.headSpotIdleRate;
    hs.snapTimer = Math.max(0, hs.snapTimer - dt);
    hs.yaw = approach(hs.yaw, target, rate, dt);
    return hs.yaw;
  }

  // touchdown absorption with springs, then settle back to the ride out stance
  private solveLanding(inp: PoseInput, dt: number, out: SemanticPose): void {
    const impact = clamp(inp.landingImpact, 0.4, 1.5);
    if (!this.landSpringsSeeded) {
      this.landSpringsSeeded = true;
      const str = Math.min(1.5, impact * 0.8);
      this.impulse('land_hipDrop', str * 0.4, 0);
      this.impulse('land_spine', str * 0.3, this.air.spineFold);
      this.impulse('land_kneeL', str * 0.5, this.air.legL.knee);
      this.impulse('land_kneeR', str * 0.5, this.air.legR.knee);
      this.impulse('land_armL', str * 0.6, this.air.armL.abduct);
      this.impulse('land_armR', str * 0.6, this.air.armR.abduct);
      this.impulse('land_neck', str * 0.25, this.air.neckPitch);
    }
    const absorb = Math.exp(-1.6 * inp.landTime);
    const kneeDepth = CFG.absorptionKnee * absorb * Math.max(0.5, impact);
    const asym = Math.sin(inp.time * 2.1) * 0.08 * absorb;
    const base = inp.mode === 'skis' ? this.ground : REST;

    copyPose(base, out);
    out.legL.knee = this.spring('land_kneeL', base.legL.knee + kneeDepth + asym, 40, 0.55, dt);
    out.legR.knee = this.spring('land_kneeR', base.legR.knee + kneeDepth - asym, 40, 0.55, dt);
    out.legL.hipFlex = this.spring('land_hipL', base.legL.hipFlex + kneeDepth * 0.55, 30, 0.6, dt);
    out.legR.hipFlex = this.spring('land_hipR', base.legR.hipFlex + kneeDepth * 0.55, 30, 0.6, dt);
    out.legL.ankleFlex = -(out.legL.knee - out.legL.hipFlex) - out.hipPitch;
    out.legR.ankleFlex = -(out.legR.knee - out.legR.hipFlex) - out.hipPitch;
    out.hipDrop = this.spring('land_hipDrop', base.hipDrop + CFG.absorptionHip * absorb * impact * 0.5, 35, 0.5, dt);
    out.spineFold = this.spring('land_spine', base.spineFold + absorb * 0.25, 25, 0.5, dt);
    out.armL.abduct = this.spring('land_armL', base.armL.abduct + absorb * 0.5, 14, 0.35, dt);
    out.armR.abduct = this.spring('land_armR', base.armR.abduct + absorb * 0.5, 14, 0.35, dt);
    out.armL.flex = this.spring('land_armLx', base.armL.flex + absorb * 0.5, 16, 0.4, dt);
    out.armR.flex = this.spring('land_armRx', base.armR.flex + absorb * 0.5, 16, 0.4, dt);
    out.armL.elbow = this.spring('land_elbowL', base.armL.elbow + absorb * 0.1, 20, 0.45, dt);
    out.armR.elbow = this.spring('land_elbowR', base.armR.elbow + absorb * 0.1, 20, 0.45, dt);
    out.neckPitch = this.spring('land_neck', base.neckPitch, 18, 0.45, dt);
    out.spineTwist = this.spring('land_spineY', 0, 20, 0.5, dt);
    out.spineLean = this.spring('land_spineZ', 0, 20, 0.5, dt);
    out.neckYaw = this.spring('land_neckY', 0, 18, 0.45, dt);
    out.neckRoll = 0;
    out.hipRoll = this.spring('land_hipRoll', 0, 25, 0.55, dt);
  }
}

interface GrabTargets {
  sLx: number; sLz: number; eLx: number; wLx: number; wLz: number;
  sRx: number; sRz: number; eRx: number; wRx: number; wRz: number;
  kneeFlex?: number; kneeLExtra?: number; kneeRExtra?: number;
  spineX?: number; spineY?: number;
  hipLZ?: number; hipRZ?: number; hipLX?: number; hipRX?: number;
  ankleLX?: number; ankleRX?: number; ankleLY?: number; ankleRY?: number; ankleLZ?: number; ankleRZ?: number;
}

// _computeGrabPose from snowbox, semantic values: flex forward +, abduct out +, elbow bend +
function grabPose(gt: GrabType, gb: number, time: number): GrabTargets {
  const wp = time * 7.3;
  const t1 = Math.sin(wp * 1.6) * 0.5 + Math.sin(wp * 2.7) * 0.3 + Math.sin(wp * 4.1) * 0.2;
  const t2 = Math.cos(wp * 1.1) * 0.5 + Math.cos(wp * 3.3) * 0.3 + Math.sin(wp * 5.7) * 0.2;
  const sway = t1 * gb * 0.07;
  const sway2 = t2 * gb * 0.06;
  const sag = gb * 0.06;

  const p: GrabTargets = {
    sLx: -0.2, sLz: 0.25, eLx: 0.55, wLx: 0, wLz: 0,
    sRx: -0.2, sRz: 0.25, eRx: 0.55, wRx: 0, wRz: 0,
  };
  switch (gt) {
    case 'mute':
      // left hand crosses the body to the outside edge of the right ski
      p.sLx = 1.5 + sway; p.sLz = -0.50 - sag; p.eLx = 2.2; p.wLx = 0.55; p.wLz = 0.25;
      p.sRx = -0.4 + sway2; p.sRz = 0.85; p.eRx = 0.25; p.wRx = -0.1;
      p.kneeFlex = 1.05; p.spineX = 0.46 + sway;
      p.hipLZ = -0.16; p.hipRZ = 0.06; p.hipLX = 0.88; p.hipRX = 1.02;
      p.ankleLX = 0.34; p.ankleRX = 0.40; p.ankleLY = 0.20; p.ankleRY = -0.06; p.ankleLZ = 0.10; p.ankleRZ = -0.03;
      break;
    case 'safety':
      // right hand reaches down to the outside edge of the right ski
      p.sRx = 1.4 + sway; p.sRz = 0.10; p.eRx = 2.2; p.wRx = 0.5; p.wRz = -0.2;
      p.sLx = -0.5 + sway2; p.sLz = 1.0; p.eLx = 0.2; p.wLx = -0.1; p.wLz = -0.1;
      p.kneeFlex = 0.98; p.spineX = 0.42 + sway;
      p.hipLX = 0.78; p.hipRX = 0.96; p.ankleLX = 0.32; p.ankleRX = 0.40; p.ankleLY = 0.04; p.ankleRY = -0.04;
      break;
    case 'tail':
      // right hand reaches behind to the tail of the right ski
      p.sRx = -1.1 + sway; p.sRz = 0.10; p.eRx = 1.6; p.wRx = 0.4; p.wRz = 0.15;
      p.sLx = 0.8 + sway2; p.sLz = 0.65; p.eLx = 0.3; p.wLx = 0.1;
      p.kneeFlex = 0.4; p.spineX = -0.45 + sway;
      p.hipLX = 0.22; p.hipRX = -0.36; p.ankleLX = 0.04; p.ankleRX = -0.28;
      p.kneeRExtra = -0.18; p.kneeLExtra = 0.04;
      break;
    case 'japan':
      // left hand reaches behind the back to the left ski
      p.sLx = -0.15 + sway; p.sLz = 0.35; p.eLx = 2.3; p.wLx = 0.6; p.wLz = 0.3;
      p.sRx = -0.55 + sway2; p.sRz = 1.1; p.eRx = 0.15; p.wRx = -0.05;
      p.kneeFlex = 0.92; p.kneeLExtra = 0.34; p.kneeRExtra = -0.28;
      p.spineX = 0.50 + sway; p.spineY = 0.20;
      p.hipLZ = -0.14; p.hipRZ = 0.06; p.hipLX = 1.05; p.hipRX = 0.22;
      p.ankleLX = 0.34; p.ankleRX = 0.08; p.ankleLY = 0.20; p.ankleRY = -0.06; p.ankleLZ = 0.12; p.ankleRZ = -0.04;
      break;
    case 'truck':
      // both hands grab their own skis
      p.sLx = 1.4 + sway; p.sLz = 0.05 - sag; p.eLx = 2.2; p.wLx = 0.5; p.wLz = 0.15;
      p.sRx = 1.4 + sway2; p.sRz = 0.05 - sag; p.eRx = 2.2; p.wRx = 0.5; p.wRz = -0.15;
      p.kneeFlex = 1.05; p.spineX = 0.54 + sway;
      p.hipLX = 1.18; p.hipRX = 1.18; p.ankleLX = 0.46; p.ankleRX = 0.46; p.ankleLY = -0.03; p.ankleRY = 0.03;
      break;
    default:
      break;
  }
  return p;
}
