import * as THREE from 'three';
import { DEG, clamp01, smoothstep } from './curves';

// the trick timeline: approach, set on the lip, flight, landing, ride out
// skis mode moves the skier along an in run, transition, kicker, table and landing
// trampoline mode keeps the same timing with vertical motion only

export type SceneMode = 'skis' | 'trampoline';
export type SegmentName = 'approach' | 'set' | 'flight' | 'landing' | 'rideout';

export const GRAVITY = 9.81;

// jump geometry in meters and degrees, travel is +z, lip at the origin
export const KICKER = {
  inrunAngle: 24,
  inrunLength: 2.5,
  transitionRadius: 5.0,
  lipAngle: 30,
  lipLength: 2.5,
  speed: 8.6,
  deckDrop: 0.8,
  knuckleZ: 5.0,
  landingAngle: 34,
  landingLength: 16,
};

export const TIMING = {
  set: 0.25,
  landing: 0.30,
  rideout: 0.60,
  // trampoline only
  preBounceContact: 0.24,
  preBounceApex: 0.5,
};

export interface TimelineSegment {
  name: SegmentName;
  start: number;
  end: number;
}

export interface TimelineSample {
  time: number;
  segment: SegmentName;
  segProgress: number;
  // normalized airtime, 0 before takeoff, 1 after landing
  airT: number;
  // 0 in the approach, ramps to 1 through the set, stays 1
  setBlend: number;
  onGround: boolean;
  // world point under the feet for ground segments, com for flight
  point: THREE.Vector3;
  normal: THREE.Vector3;
  tangent: THREE.Vector3;
  velocity: THREE.Vector3;
  // trampoline bed depression in meters
  bedDepth: number;
}

export interface TimelineOptions {
  mode: SceneMode;
  // com offset from the feet along the surface normal at the end of the set
  takeoffComUp: number;
  // com offset forward of the feet at the end of the set
  takeoffComAlong: number;
  // com height above the landing surface at touchdown
  landingComHeight: number;
}

interface PathPoint {
  z: number;
  y: number;
  angle: number; // tangent angle from horizontal, positive is uphill
  s: number;     // arc length from the start
}

// build the 2d ground path of the ski approach as a dense polyline ending at the lip
function buildApproachPath(): PathPoint[] {
  const pts: PathPoint[] = [];
  const lipA = KICKER.lipAngle * DEG;
  const inA = -KICKER.inrunAngle * DEG;
  const R = KICKER.transitionRadius;

  // walk backward from the lip so the lip lands on the origin
  const kickStart = { z: -KICKER.lipLength * Math.cos(lipA), y: -KICKER.lipLength * Math.sin(lipA) };
  const center = { z: kickStart.z - R * Math.sin(lipA), y: kickStart.y + R * Math.cos(lipA) };
  const arcStart = { z: center.z + R * Math.sin(inA), y: center.y - R * Math.cos(inA) };
  const inStart = { z: arcStart.z - KICKER.inrunLength * Math.cos(inA), y: arcStart.y - KICKER.inrunLength * Math.sin(inA) };

  let s = 0;
  const N1 = 12, N2 = 40, N3 = 12;
  for (let i = 0; i <= N1; i++) {
    const f = i / N1;
    pts.push({ z: inStart.z + (arcStart.z - inStart.z) * f, y: inStart.y + (arcStart.y - inStart.y) * f, angle: inA, s: s + KICKER.inrunLength * f });
  }
  s += KICKER.inrunLength;
  const arcLen = R * (lipA - inA);
  for (let i = 1; i <= N2; i++) {
    const f = i / N2;
    const a = inA + (lipA - inA) * f;
    pts.push({ z: center.z + R * Math.sin(a), y: center.y - R * Math.cos(a), angle: a, s: s + arcLen * f });
  }
  s += arcLen;
  for (let i = 1; i <= N3; i++) {
    const f = i / N3;
    pts.push({ z: kickStart.z + (0 - kickStart.z) * f, y: kickStart.y + (0 - kickStart.y) * f, angle: lipA, s: s + KICKER.lipLength * f });
  }
  return pts;
}

function samplePath(path: PathPoint[], s: number): PathPoint {
  if (s <= path[0].s) return path[0];
  const last = path[path.length - 1];
  if (s >= last.s) return last;
  let lo = 0, hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid].s <= s) lo = mid; else hi = mid;
  }
  const a = path[lo], b = path[hi];
  const f = (s - a.s) / Math.max(1e-9, b.s - a.s);
  return { z: a.z + (b.z - a.z) * f, y: a.y + (b.y - a.y) * f, angle: a.angle + (b.angle - a.angle) * f, s };
}

// landing surface height and slope at a given z past the lip
export function landingSurface(z: number): { y: number; angle: number } {
  if (z < KICKER.knuckleZ) return { y: -KICKER.deckDrop, angle: 0 };
  const a = -KICKER.landingAngle * DEG;
  return { y: -KICKER.deckDrop + (z - KICKER.knuckleZ) * Math.tan(a), angle: a };
}

export class Timeline {
  readonly mode: SceneMode;
  readonly segments: TimelineSegment[] = [];
  readonly duration: number;
  readonly flightTime: number;
  readonly approachPath: PathPoint[];
  readonly takeoffCom = new THREE.Vector3();
  readonly takeoffVel = new THREE.Vector3();
  readonly landingPoint = new THREE.Vector3();
  readonly landingAngle: number;
  private readonly opts: TimelineOptions;
  private readonly landSpeed: number;
  private readonly trampVy: number;

  constructor(opts: TimelineOptions, flightTimeOverride?: number) {
    this.opts = opts;
    this.mode = opts.mode;
    this.approachPath = buildApproachPath();
    const pathLen = this.approachPath[this.approachPath.length - 1].s;
    const groundTime = pathLen / KICKER.speed;
    const approachDur = Math.max(0.3, groundTime - TIMING.set);

    // takeoff state from the lip
    const lipA = KICKER.lipAngle * DEG;
    const tangent = new THREE.Vector3(0, Math.sin(lipA), Math.cos(lipA));
    const normal = new THREE.Vector3(0, Math.cos(lipA), -Math.sin(lipA));
    this.takeoffCom.copy(normal).multiplyScalar(opts.takeoffComUp).addScaledVector(tangent, opts.takeoffComAlong);
    this.takeoffVel.copy(tangent).multiplyScalar(KICKER.speed);

    // flight time from the ballistic arc meeting the landing slope
    let flight = this.solveLanding();
    if (flightTimeOverride != null && flightTimeOverride > 0) flight = flightTimeOverride;
    this.flightTime = flight;

    const landZ = this.takeoffCom.z + this.takeoffVel.z * flight;
    const surf = landingSurface(landZ);
    this.landingAngle = surf.angle;
    this.landingPoint.set(0, surf.y, landZ);
    const vyLand = this.takeoffVel.y - GRAVITY * flight;
    this.landSpeed = Math.hypot(this.takeoffVel.z, vyLand) * 0.92;
    this.trampVy = GRAVITY * flight / 2;

    let t = 0;
    const push = (name: SegmentName, dur: number) => {
      this.segments.push({ name, start: t, end: t + dur });
      t += dur;
    };
    push('approach', approachDur);
    push('set', TIMING.set);
    push('flight', flight);
    push('landing', TIMING.landing);
    push('rideout', TIMING.rideout);
    this.duration = t;
  }

  private solveLanding(): number {
    const h = this.opts.landingComHeight;
    const c = this.takeoffCom, v = this.takeoffVel;
    const heightAbove = (t: number) => {
      const z = c.z + v.z * t;
      const y = c.y + v.y * t - 0.5 * GRAVITY * t * t;
      const surf = landingSurface(z);
      return (y - surf.y) * Math.cos(surf.angle) - h;
    };
    // march past the apex and the knuckle, then bisect the first crossing beyond the knuckle
    let t0 = Math.max(2 * v.y / GRAVITY * 0.5, (KICKER.knuckleZ - c.z) / v.z);
    let t1 = t0;
    for (let i = 0; i < 400; i++) {
      t1 = t0 + 0.02;
      if (heightAbove(t1) <= 0) break;
      t0 = t1;
    }
    for (let i = 0; i < 40; i++) {
      const mid = (t0 + t1) / 2;
      if (heightAbove(mid) > 0) t0 = mid; else t1 = mid;
    }
    return (t0 + t1) / 2;
  }

  segmentAt(time: number): TimelineSegment {
    for (const seg of this.segments) if (time < seg.end) return seg;
    return this.segments[this.segments.length - 1];
  }

  get flightStart(): number { return this.segments[2].start; }
  get flightEnd(): number { return this.segments[2].end; }
  get setStart(): number { return this.segments[1].start; }

  sample(time: number, out: TimelineSample): TimelineSample {
    const t = clamp01(time / this.duration) * this.duration;
    const seg = this.segmentAt(t);
    const p = clamp01((t - seg.start) / Math.max(1e-9, seg.end - seg.start));
    out.time = t;
    out.segment = seg.name;
    out.segProgress = p;
    out.airT = seg.name === 'flight' ? p : (t < seg.start && seg.name === 'approach' ? 0 : (t >= this.flightEnd ? 1 : 0));
    out.setBlend = seg.name === 'approach' ? 0 : seg.name === 'set' ? p : 1;
    out.bedDepth = 0;
    if (this.mode === 'skis') this.sampleSkis(t, seg, p, out);
    else this.sampleTrampoline(t, seg, p, out);
    return out;
  }

  private sampleSkis(t: number, seg: TimelineSegment, p: number, out: TimelineSample): void {
    const v = KICKER.speed;
    if (seg.name === 'approach' || seg.name === 'set') {
      const s = t * v;
      const pp = samplePath(this.approachPath, s);
      out.onGround = true;
      out.point.set(0, pp.y, pp.z);
      out.tangent.set(0, Math.sin(pp.angle), Math.cos(pp.angle));
      out.normal.set(0, Math.cos(pp.angle), -Math.sin(pp.angle));
      out.velocity.copy(out.tangent).multiplyScalar(v);
      return;
    }
    if (seg.name === 'flight') {
      const ft = t - seg.start;
      out.onGround = false;
      out.point.set(
        0,
        this.takeoffCom.y + this.takeoffVel.y * ft - 0.5 * GRAVITY * ft * ft,
        this.takeoffCom.z + this.takeoffVel.z * ft,
      );
      out.velocity.set(0, this.takeoffVel.y - GRAVITY * ft, this.takeoffVel.z);
      out.normal.set(0, 1, 0);
      out.tangent.set(0, 0, 1);
      return;
    }
    // landing and ride out slide down the landing slope
    const since = t - this.flightEnd;
    const a = this.landingAngle;
    const dz = Math.cos(a) * this.landSpeed * since;
    const z = this.landingPoint.z + dz;
    const surf = landingSurface(z);
    out.onGround = true;
    out.point.set(0, surf.y, z);
    out.tangent.set(0, Math.sin(surf.angle), Math.cos(surf.angle));
    out.normal.set(0, Math.cos(surf.angle), -Math.sin(surf.angle));
    out.velocity.copy(out.tangent).multiplyScalar(this.landSpeed);
    void p;
  }

  private sampleTrampoline(t: number, seg: TimelineSegment, p: number, out: TimelineSample): void {
    out.normal.set(0, 1, 0);
    out.tangent.set(0, 0, 1);
    out.velocity.set(0, 0, 0);
    const comUp = this.opts.takeoffComUp;
    if (seg.name === 'approach') {
      // a small previous bounce: contact, then a low hop that ends at the start of the set
      const dur = seg.end - seg.start;
      const contact = Math.min(TIMING.preBounceContact, dur * 0.4);
      const hop = dur - contact;
      const vy = GRAVITY * hop / 2;
      if (t - seg.start < contact) {
        const c = (t - seg.start) / contact;
        out.onGround = true;
        out.bedDepth = Math.sin(c * Math.PI) * 0.22;
        out.point.set(0, -out.bedDepth, 0);
        out.velocity.set(0, 0, 0);
        return;
      }
      const ft = t - seg.start - contact;
      out.onGround = false;
      out.point.set(0, comUp + vy * ft - 0.5 * GRAVITY * ft * ft, 0);
      out.velocity.set(0, vy - GRAVITY * ft, 0);
      return;
    }
    if (seg.name === 'set') {
      // sink into the bed and drive out, the pop
      out.onGround = true;
      out.bedDepth = Math.sin(p * Math.PI) * 0.34;
      out.point.set(0, -out.bedDepth, 0);
      out.velocity.set(0, p > 0.5 ? this.trampVy * smoothstep((p - 0.5) / 0.5) : 0, 0);
      return;
    }
    if (seg.name === 'flight') {
      const ft = t - seg.start;
      out.onGround = false;
      out.point.set(0, comUp + this.trampVy * ft - 0.5 * GRAVITY * ft * ft, 0);
      out.velocity.set(0, this.trampVy - GRAVITY * ft, 0);
      return;
    }
    if (seg.name === 'landing') {
      out.onGround = true;
      out.bedDepth = Math.sin(p * Math.PI) * 0.36;
      out.point.set(0, -out.bedDepth, 0);
      return;
    }
    // ride out: a small settle bounce
    out.onGround = true;
    out.bedDepth = Math.max(0, Math.sin(p * Math.PI * 2) * 0.10) * (1 - p);
    out.point.set(0, -out.bedDepth, 0);
  }
}

export function createTimelineSample(): TimelineSample {
  return {
    time: 0,
    segment: 'approach',
    segProgress: 0,
    airT: 0,
    setBlend: 0,
    onGround: true,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 1, 0),
    tangent: new THREE.Vector3(0, 0, 1),
    velocity: new THREE.Vector3(),
    bedDepth: 0,
  };
}
