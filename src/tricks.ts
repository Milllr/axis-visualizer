import * as THREE from 'three';
import type { Family } from './profiles';
import { DEG } from './curves';

// coordinate system: y up, +z forward (direction of travel), +x is the skier's left
// flip is rotation about x, +x pitches the head forward so frontflip is +, backflip is -
// spin is rotation about y, + is a left spin
// roll is rotation about z

export interface RigidAxisParams {
  // tilt of the angular momentum vector from vertical
  tiltDeg: number;
  // how the tilt splits between a sideways lean (pitch, 0) and a fore aft lean (roll, 1)
  rollShare: number;
  // how far the body leans toward the axis by the end of the set
  leanDeg: number;
}

export interface TrickDefinition {
  name: string;
  family: Family;
  category: 'on-axis' | 'off-axis';
  // +1 front, -1 back, 0 for pure spins and lincolns
  flipDir: number;
  rotations: number[];
  // show 1x/2x/3x instead of degrees
  useMultiples: boolean;
  // can be thrown over left or right shoulder
  hasSide: boolean;
  // off axis families take a corks count (single, double, triple)
  hasInversions: boolean;
  description: string;
  rigid: RigidAxisParams;
  // fixed axis unit weights (pitch, yaw, roll) used by the snowbox model
  snowboxAxis: { pitch: number; yaw: number; roll: number };
  color: number;
}

function unit(pitch: number, yaw: number, roll: number) {
  const n = Math.hypot(pitch, yaw, roll) || 1;
  return { pitch: pitch / n, yaw: yaw / n, roll: roll / n };
}

export const TRICK_DEFINITIONS: Record<string, TrickDefinition> = {
  spin: {
    name: 'Spin',
    family: 'spin',
    category: 'on-axis',
    flipDir: 0,
    rotations: [180, 360, 540, 720, 900, 1080, 1260, 1440],
    useMultiples: false,
    hasSide: true,
    hasInversions: false,
    description: 'Pure horizontal rotation around the vertical axis',
    rigid: { tiltDeg: 0, rollShare: 0, leanDeg: 0 },
    snowboxAxis: unit(0, 1, 0),
    color: 0x00ff88,
  },
  frontflip: {
    name: 'Frontflip',
    family: 'flip',
    category: 'on-axis',
    flipDir: 1,
    rotations: [360, 720, 1080],
    useMultiples: true,
    hasSide: false,
    hasInversions: false,
    description: 'Forward somersault around the lateral axis',
    rigid: { tiltDeg: 90, rollShare: 0, leanDeg: 0 },
    snowboxAxis: unit(1, 0, 0),
    color: 0xff6644,
  },
  backflip: {
    name: 'Backflip',
    family: 'flip',
    category: 'on-axis',
    flipDir: -1,
    rotations: [360, 720, 1080],
    useMultiples: true,
    hasSide: false,
    hasInversions: false,
    description: 'Backward somersault around the lateral axis',
    rigid: { tiltDeg: 90, rollShare: 0, leanDeg: 0 },
    snowboxAxis: unit(1, 0, 0),
    color: 0xff6644,
  },
  lincolnLoop: {
    name: 'Lincoln Loop',
    family: 'lincoln',
    category: 'on-axis',
    flipDir: 0,
    rotations: [360, 720, 1080],
    useMultiples: true,
    hasSide: true,
    hasInversions: false,
    description: 'Sideways cartwheel around the direction of travel',
    rigid: { tiltDeg: 90, rollShare: 1, leanDeg: 0 },
    snowboxAxis: unit(0, 0, 1),
    color: 0xffaa00,
  },

  // backward tilt family
  cork: {
    name: 'Cork',
    family: 'cork',
    category: 'off-axis',
    flipDir: -1,
    rotations: [360, 540, 720, 900, 1080, 1260, 1440, 1620, 1800],
    useMultiples: false,
    hasSide: true,
    hasInversions: true,
    description: 'Off axis spin leaning back over the tails, never fully inverted',
    rigid: { tiltDeg: 36, rollShare: 0.4, leanDeg: 8 },
    snowboxAxis: unit(0.568, 0.669, 0.479),
    color: 0x44aaff,
  },
  rodeo: {
    name: 'Rodeo',
    family: 'rodeo',
    category: 'off-axis',
    flipDir: -1,
    rotations: [360, 540, 720, 900, 1080],
    useMultiples: false,
    hasSide: true,
    hasInversions: true,
    description: 'Backflip thrown over one shoulder with spin, inverted',
    rigid: { tiltDeg: 58, rollShare: 0.3, leanDeg: 18 },
    snowboxAxis: unit(0.747, 0.472, 0.468),
    color: 0xff44aa,
  },
  dSpin: {
    name: 'D-Spin',
    family: 'dspin',
    category: 'off-axis',
    flipDir: -1,
    rotations: [540, 720, 900, 1080],
    useMultiples: false,
    hasSide: true,
    hasInversions: true,
    description: 'Inverted cork thrown back and sideways, head well below the feet',
    rigid: { tiltDeg: 72, rollShare: 0.25, leanDeg: 20 },
    snowboxAxis: unit(0.90, 0.26, 0.35),
    color: 0xaa44ff,
  },

  // forward tilt family
  bio: {
    name: 'Bio',
    family: 'bio',
    category: 'off-axis',
    flipDir: 1,
    rotations: [360, 540, 720, 900, 1080, 1260, 1440, 1620],
    useMultiples: false,
    hasSide: true,
    hasInversions: true,
    description: 'Forward cork, the lead shoulder dips toward the landing',
    rigid: { tiltDeg: 36, rollShare: 0.4, leanDeg: 8 },
    snowboxAxis: unit(0.808, 0.491, 0.326),
    color: 0x44ffaa,
  },
  misty: {
    name: 'Misty',
    family: 'misty',
    category: 'off-axis',
    flipDir: 1,
    rotations: [540, 720, 900, 1080],
    useMultiples: false,
    hasSide: true,
    hasInversions: true,
    description: 'Frontflip thrown over a dropped shoulder with spin, lands switch at 540',
    rigid: { tiltDeg: 55, rollShare: 0.35, leanDeg: 15 },
    snowboxAxis: unit(0.759, 0.447, 0.473),
    color: 0xff8844,
  },
  flatspin: {
    name: 'Flatspin',
    family: 'flatspin',
    category: 'off-axis',
    flipDir: 1,
    rotations: [360, 540, 720, 900],
    useMultiples: false,
    hasSide: true,
    hasInversions: true,
    description: 'Laid out spin on a nearly horizontal axis, chest to the sky at the apex',
    rigid: { tiltDeg: 75, rollShare: 0.6, leanDeg: 15 },
    snowboxAxis: unit(0.80, 0.26, 0.54),
    color: 0xffff44,
  },
};

export const TRICK_KEYS = Object.keys(TRICK_DEFINITIONS);

export function isOffAxis(trick: TrickDefinition): boolean {
  return trick.category === 'off-axis';
}

// unit angular momentum direction in the heading frame for the snowbox fixed axis model
// signs follow snowbox distributeMomentum: x = pitch * flip, y = yaw * spin, z = roll * spin * flip
export function snowboxAxisVector(trick: TrickDefinition, spinDir: number): THREE.Vector3 {
  const f = trick.flipDir === 0 ? 1 : trick.flipDir;
  const s = spinDir;
  const a = trick.snowboxAxis;
  const v = new THREE.Vector3(a.pitch * f, a.yaw * s, a.roll * s * f);
  if (trick.family === 'lincoln') v.set(0, 0, s);
  if (trick.family === 'flip') v.set(f, 0, 0);
  return v.normalize();
}

// unit angular momentum direction for the rigid body model, tilt split into pitch and roll parts
export function rigidAxisVector(trick: TrickDefinition, spinDir: number): THREE.Vector3 {
  const r = trick.rigid;
  const f = trick.flipDir === 0 ? 1 : trick.flipDir;
  const s = spinDir;
  const beta = r.tiltDeg * DEG;
  const ra = r.rollShare * 90 * DEG;
  const h = Math.sin(beta);
  const v = new THREE.Vector3(f * h * Math.cos(ra), s * Math.cos(beta), s * f * h * Math.sin(ra));
  if (trick.family === 'lincoln') v.set(0, 0, s);
  if (trick.family === 'flip') v.set(f, 0, 0);
  return v.normalize();
}
