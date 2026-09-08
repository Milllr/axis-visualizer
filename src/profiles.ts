// per family pose channel curves, body multipliers and com targets
// spin, flip, cork, misty, rodeo and bio are ported from snowbox trickProfiles.js
// dspin, flatspin and lincoln are authored here in the same style

import { trapezoid, sineHump, bellCurve, smoothstep, clamp } from './curves';

export type Family =
  | 'spin' | 'flip' | 'cork' | 'misty' | 'rodeo' | 'bio'
  | 'dspin' | 'flatspin' | 'lincoln';

export const FAMILIES: Family[] = [
  'spin', 'flip', 'cork', 'misty', 'rodeo', 'bio', 'dspin', 'flatspin', 'lincoln',
];

export interface PoseChannels {
  tuck: number;          // 0 extended, 1 tucked
  shoulderDrop: number;  // asymmetric shoulder offset, signed by spin
  hipSet: number;        // hip rotation bias, signed by flip
  headSpot: number;      // head tracking toward the landing, 0 to 1
  armSet: number;        // arm asymmetry, signed by spin
  skiCross: number;      // ski crossing amount
  spineCounter: number;  // torso counter rotation
}

export interface ComConfig {
  yExtended: number;
  yTucked: number;
  tuckZ: number;
  shoulderX: number;
  hipZ: number;
  skiCrossX: number;
  maxX: number;
  maxZ: number;
  response: number;
}

export interface FamilyProfile {
  name: string;
  // snowbox angular velocity direction weights, body frame
  yaw(t: number): number;
  pitch(t: number): number;
  roll(t: number): number;
  // body pose curves of normalized airtime
  tuck(t: number): number;
  shoulderDrop(t: number): number;
  hipSet(t: number): number;
  headSpot(t: number): number;
  armSet(t: number): number;
  skiCross(t: number): number;
  spineCounter(t: number): number;
  // per family multipliers of the curves above
  bodyMul: Partial<PoseChannels>;
  com: ComConfig;
}

const BASE_COM: ComConfig = {
  yExtended: 0.76,
  yTucked: 0.43,
  tuckZ: -0.045,
  shoulderX: 0.018,
  hipZ: -0.025,
  skiCrossX: 0.014,
  maxX: 0.16,
  maxZ: 0.18,
  response: 10,
};

function com(overrides: Partial<ComConfig>): ComConfig {
  return { ...BASE_COM, ...overrides };
}

export const PROFILES: Record<Family, FamilyProfile> = {
  spin: {
    name: 'Straight Spin',
    yaw: (t) => trapezoid(t, 0.12, 0.85),
    pitch: () => 0,
    roll: (t) => bellCurve(t, 0.15, 0.25) * 0.03,
    tuck: (t) => trapezoid(t, 0.15, 0.75) * 0.4,
    shoulderDrop: (t) => sineHump(t, 0, 0.25) * 0.3,
    hipSet: (t) => sineHump(t, 0.05, 0.3) * 0.2,
    headSpot: (t) => smoothstep((t - 0.65) / 0.3),
    armSet: (t) => trapezoid(t, 0.1, 0.8) * 0.4,
    skiCross: () => 0,
    spineCounter: (t) => trapezoid(t, 0.1, 0.85) * 0.55,
    bodyMul: { tuck: 0.90, armSet: 1.05, spineCounter: 1.15 },
    com: com({ yTucked: 0.58, tuckZ: -0.012, shoulderX: 0.010 }),
  },
  flip: {
    name: 'Flip',
    yaw: () => 0,
    pitch: (t) => trapezoid(t, 0.10, 0.88),
    roll: () => 0,
    tuck: (t) => trapezoid(t, 0.12, 0.72) * 0.85,
    shoulderDrop: () => 0,
    hipSet: (t) => sineHump(t, 0.05, 0.25) * 0.4,
    headSpot: (t) => smoothstep((t - 0.6) / 0.35),
    armSet: () => 0,
    skiCross: () => 0,
    spineCounter: (t) => trapezoid(t, 0.08, 0.85) * 0.3,
    bodyMul: { tuck: 1.08, hipSet: 1.05, spineCounter: 0.9 },
    com: com({ tuckZ: -0.035, hipZ: -0.018 }),
  },
  cork: {
    name: 'Cork',
    yaw: (t) => trapezoid(t, 0.14, 0.82) * 0.70,
    pitch: (t) => trapezoid(t, 0.08, 0.78) * 0.55,
    roll: (t) => trapezoid(t, 0.10, 0.80) * 0.42,
    tuck: (t) => trapezoid(t, 0.10, 0.76) * 1.02,
    shoulderDrop: (t) => sineHump(t, 0.02, 0.34) * 0.9 + trapezoid(t, 0.18, 0.7) * 0.48,
    hipSet: (t) => sineHump(t, 0.04, 0.32) * 0.62,
    headSpot: (t) => smoothstep((t - 0.62) / 0.3),
    armSet: (t) => trapezoid(t, 0.07, 0.75) * 0.92,
    skiCross: (t) => trapezoid(t, 0.18, 0.72) * 0.48,
    spineCounter: (t) => trapezoid(t, 0.10, 0.80) * 0.56,
    bodyMul: { tuck: 1.34, shoulderDrop: 1.30, hipSet: 1.22, armSet: 1.28, skiCross: 1.12, spineCounter: 1.08 },
    com: com({ yExtended: 0.74, yTucked: 0.36, tuckZ: -0.078, shoulderX: 0.034, hipZ: -0.052, skiCrossX: 0.022, response: 17 }),
  },
  misty: {
    name: 'Misty',
    yaw: (t) => trapezoid(t, 0.08, 0.92) * 0.50,
    pitch: (t) => trapezoid(t, 0.08, 0.92) * 0.85,
    roll: (t) => trapezoid(t, 0.08, 0.92) * 0.53,
    tuck: (t) => trapezoid(t, 0.08, 0.76) * 0.98,
    shoulderDrop: (t) => sineHump(t, 0.0, 0.34) * 1.10 + trapezoid(t, 0.16, 0.62) * 0.36,
    hipSet: (t) => sineHump(t, 0.02, 0.28) * 0.68,
    headSpot: (t) => smoothstep((t - 0.60) / 0.30),
    armSet: (t) => trapezoid(t, 0.06, 0.72) * 0.68,
    skiCross: (t) => trapezoid(t, 0.24, 0.66) * 0.12,
    spineCounter: (t) => trapezoid(t, 0.08, 0.84) * 0.14,
    bodyMul: { tuck: 1.30, shoulderDrop: 1.42, hipSet: 1.30, headSpot: 1.12, armSet: 1.24, skiCross: 0.42, spineCounter: 1.10 },
    com: com({ yExtended: 0.74, yTucked: 0.38, tuckZ: -0.088, shoulderX: 0.040, hipZ: -0.072, skiCrossX: 0.008, response: 17 }),
  },
  rodeo: {
    name: 'Rodeo',
    yaw: (t) => trapezoid(t, 0.16, 0.80) * 0.55,
    pitch: (t) => trapezoid(t, 0.08, 0.82) * 0.75,
    roll: (t) => trapezoid(t, 0.10, 0.80) * 0.45,
    tuck: (t) => trapezoid(t, 0.12, 0.76) * 0.82,
    shoulderDrop: (t) => sineHump(t, 0.0, 0.3) * 0.85 + trapezoid(t, 0.22, 0.68) * 0.35,
    hipSet: (t) => sineHump(t, 0.04, 0.28) * 0.55,
    headSpot: (t) => smoothstep((t - 0.60) / 0.32),
    armSet: (t) => trapezoid(t, 0.10, 0.72) * 0.6,
    skiCross: (t) => trapezoid(t, 0.20, 0.68) * 0.25,
    spineCounter: (t) => trapezoid(t, 0.10, 0.80) * 0.4,
    bodyMul: { tuck: 1.18, shoulderDrop: 1.30, hipSet: 1.18, armSet: 1.18, skiCross: 1.00, spineCounter: 1.00 },
    com: com({ yExtended: 0.75, yTucked: 0.40, tuckZ: -0.050, shoulderX: 0.036, hipZ: 0.042, skiCrossX: 0.016, response: 14 }),
  },
  bio: {
    name: 'Bio',
    yaw: (t) => trapezoid(t, 0.16, 0.82) * 0.58,
    pitch: (t) => trapezoid(t, 0.08, 0.80) * 0.82,
    roll: (t) => trapezoid(t, 0.12, 0.78) * 0.35,
    tuck: (t) => trapezoid(t, 0.10, 0.75) * 0.92,
    shoulderDrop: (t) => sineHump(t, 0.0, 0.28) * 0.95 + trapezoid(t, 0.2, 0.65) * 0.35,
    hipSet: (t) => sineHump(t, 0.03, 0.22) * 0.65,
    headSpot: (t) => smoothstep((t - 0.58) / 0.35),
    armSet: (t) => trapezoid(t, 0.08, 0.72) * 0.8,
    skiCross: (t) => trapezoid(t, 0.20, 0.68) * 0.3,
    spineCounter: (t) => trapezoid(t, 0.10, 0.80) * 0.5,
    bodyMul: { tuck: 1.30, shoulderDrop: 1.30, hipSet: 1.28, armSet: 1.22, skiCross: 1.08, spineCounter: 1.18 },
    com: com({ yExtended: 0.74, yTucked: 0.37, tuckZ: -0.080, shoulderX: 0.034, hipZ: -0.064, skiCrossX: 0.018, response: 15 }),
  },
  // inverted cork, thrown back and over the shoulder. authored here
  dspin: {
    name: 'D-Spin',
    yaw: (t) => trapezoid(t, 0.16, 0.80) * 0.30,
    pitch: (t) => trapezoid(t, 0.08, 0.82) * 0.90,
    roll: (t) => trapezoid(t, 0.10, 0.80) * 0.30,
    tuck: (t) => trapezoid(t, 0.10, 0.76) * 0.95,
    shoulderDrop: (t) => sineHump(t, 0.0, 0.30) * 0.8 + trapezoid(t, 0.22, 0.68) * 0.3,
    hipSet: (t) => sineHump(t, 0.04, 0.28) * 0.6,
    headSpot: (t) => smoothstep((t - 0.60) / 0.32),
    armSet: (t) => trapezoid(t, 0.10, 0.72) * 0.6,
    skiCross: (t) => trapezoid(t, 0.20, 0.68) * 0.2,
    spineCounter: (t) => trapezoid(t, 0.10, 0.80) * 0.4,
    bodyMul: { tuck: 1.20, shoulderDrop: 1.20, hipSet: 1.18, armSet: 1.10, skiCross: 0.9, spineCounter: 1.0 },
    com: com({ yExtended: 0.75, yTucked: 0.40, tuckZ: -0.050, shoulderX: 0.030, hipZ: 0.040, skiCrossX: 0.014, response: 14 }),
  },
  // laid out spin on a nearly horizontal axis. authored here
  flatspin: {
    name: 'Flatspin',
    yaw: (t) => trapezoid(t, 0.14, 0.82) * 0.26,
    pitch: (t) => trapezoid(t, 0.08, 0.80) * 0.80,
    roll: (t) => trapezoid(t, 0.10, 0.80) * 0.54,
    tuck: (t) => trapezoid(t, 0.12, 0.72) * 0.55,
    shoulderDrop: (t) => sineHump(t, 0.0, 0.30) * 1.0 + trapezoid(t, 0.2, 0.66) * 0.5,
    hipSet: (t) => sineHump(t, 0.03, 0.24) * 0.5,
    headSpot: (t) => smoothstep((t - 0.60) / 0.32),
    armSet: (t) => trapezoid(t, 0.08, 0.74) * 0.9,
    skiCross: (t) => trapezoid(t, 0.20, 0.68) * 0.4,
    spineCounter: (t) => trapezoid(t, 0.10, 0.80) * 0.3,
    bodyMul: { tuck: 1.0, shoulderDrop: 1.3, hipSet: 1.1, armSet: 1.2, skiCross: 1.0, spineCounter: 1.0 },
    com: com({ yExtended: 0.75, yTucked: 0.46, tuckZ: -0.040, shoulderX: 0.036, hipZ: -0.030, skiCrossX: 0.018, response: 14 }),
  },
  // cartwheel about the direction of travel. authored here
  lincoln: {
    name: 'Lincoln Loop',
    yaw: () => 0,
    pitch: () => 0,
    roll: (t) => trapezoid(t, 0.10, 0.86),
    tuck: (t) => trapezoid(t, 0.14, 0.72) * 0.5,
    shoulderDrop: (t) => sineHump(t, 0.0, 0.28) * 0.6,
    hipSet: (t) => sineHump(t, 0.05, 0.25) * 0.3,
    headSpot: (t) => smoothstep((t - 0.62) / 0.32),
    armSet: (t) => trapezoid(t, 0.08, 0.76) * 0.9,
    skiCross: () => 0,
    spineCounter: (t) => trapezoid(t, 0.10, 0.80) * 0.2,
    bodyMul: { tuck: 1.0, armSet: 1.1 },
    com: com({ yExtended: 0.76, yTucked: 0.50, tuckZ: -0.030, shoulderX: 0.030 }),
  },
};

function mul(profile: FamilyProfile, key: keyof PoseChannels): number {
  const v = profile.bodyMul[key];
  return v == null ? 1 : v;
}

// sampleBodyPose from snowbox, signs applied
export function sampleChannels(
  profile: FamilyProfile,
  t: number,
  spinDir: number,
  flipDir: number,
): PoseChannels {
  const tc = clamp(t, 0, 1);
  return {
    tuck: profile.tuck(tc) * mul(profile, 'tuck'),
    shoulderDrop: profile.shoulderDrop(tc) * mul(profile, 'shoulderDrop') * spinDir,
    hipSet: profile.hipSet(tc) * mul(profile, 'hipSet') * flipDir,
    headSpot: profile.headSpot(tc) * mul(profile, 'headSpot'),
    armSet: profile.armSet(tc) * mul(profile, 'armSet') * spinDir,
    skiCross: profile.skiCross(tc) * mul(profile, 'skiCross'),
    spineCounter: profile.spineCounter(tc) * mul(profile, 'spineCounter'),
  };
}

export const ZERO_CHANNELS: PoseChannels = {
  tuck: 0, shoulderDrop: 0, hipSet: 0, headSpot: 0, armSet: 0, skiCross: 0, spineCounter: 0,
};

// sampleTrickComOffset from snowbox, the pivot the body orbits
export function sampleComOffset(
  profile: FamilyProfile,
  ch: PoseChannels,
  tuckBlend: number,
  spinDir: number,
  flipDir: number,
): { x: number; y: number; z: number } {
  const c = profile.com;
  const tuck = clamp(tuckBlend, 0, 1);
  return {
    x: clamp(ch.shoulderDrop * c.shoulderX + ch.skiCross * spinDir * c.skiCrossX, -c.maxX, c.maxX),
    y: clamp(c.yExtended + (c.yTucked - c.yExtended) * tuck, 0.2, 1.2),
    z: clamp(tuck * c.tuckZ + ch.hipSet * flipDir * c.hipZ, -c.maxZ, c.maxZ),
  };
}

// snowbox effective tuck for off axis families: profile tuck capped and released late
export function effectiveTuck(profileTuck: number, normalizedT: number, offAxis: boolean): number {
  if (!offAxis) return clamp(profileTuck, 0, 1);
  const poseTuck = clamp(profileTuck / 1.15, 0, 1);
  const phaseHold = clamp(1 - Math.max(0, normalizedT - 0.80) / 0.16, 0, 1);
  return Math.min(0.92, poseTuck * 0.88 * phaseHold);
}
