// curve primitives and the airtime phase table, ported from snowbox trickProfiles.js

export const PI = Math.PI;
export const TWO_PI = Math.PI * 2;
export const HALF_PI = Math.PI / 2;
export const DEG = Math.PI / 180;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function rampUp(t: number, riseEnd: number): number {
  if (t <= 0) return 0;
  if (t >= riseEnd) return 1;
  const s = t / riseEnd;
  return s * s * (3 - 2 * s);
}

export function rampDown(t: number, fallStart: number): number {
  if (t <= fallStart) return 1;
  if (t >= 1) return 0;
  const s = (t - fallStart) / (1 - fallStart);
  return 1 - s * s * (3 - 2 * s);
}

export function bellCurve(t: number, center: number, width: number): number {
  const d = (t - center) / width;
  return Math.exp(-d * d * 2);
}

export function trapezoid(t: number, riseEnd: number, fallStart: number): number {
  return Math.min(rampUp(t, riseEnd), rampDown(t, fallStart));
}

export function sineHump(t: number, start: number, end: number): number {
  if (t <= start || t >= end) return 0;
  const s = (t - start) / (end - start);
  return Math.sin(s * Math.PI);
}

// exponential approach helper, rate in 1/s
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

// phases of normalized airtime, straight from snowbox
export const PHASES = {
  takeoff:   { s: 0.00, e: 0.08 },  // pop and extension
  axis_set:  { s: 0.08, e: 0.18 },  // body sets the trick axis
  main:      { s: 0.18, e: 0.68 },  // full rotation
  spot:      { s: 0.68, e: 0.82 },  // head spots the landing
  land_prep: { s: 0.82, e: 0.94 },  // skis square, body extends
  absorb:    { s: 0.94, e: 1.00 },  // final commit
} as const;

export type AirPhase = keyof typeof PHASES;

export function getPhase(t: number): AirPhase {
  if (t < PHASES.takeoff.e) return 'takeoff';
  if (t < PHASES.axis_set.e) return 'axis_set';
  if (t < PHASES.main.e) return 'main';
  if (t < PHASES.spot.e) return 'spot';
  if (t < PHASES.land_prep.e) return 'land_prep';
  return 'absorb';
}

export function getPhaseProgress(t: number): number {
  const p = PHASES[getPhase(t)];
  return clamp01((t - p.s) / (p.e - p.s));
}
