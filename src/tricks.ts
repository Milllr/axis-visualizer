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
  // how deep the body folds in the air, 1 is a full somersault tuck, corks stay laid out
  tuckDepth: number;
  rigid: RigidAxisParams;
  color: number;
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
    tuckDepth: 0.5,
    rigid: { tiltDeg: 0, rollShare: 0, leanDeg: 0 },
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
    tuckDepth: 1.0,
    rigid: { tiltDeg: 90, rollShare: 0, leanDeg: 0 },
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
    tuckDepth: 1.0,
    rigid: { tiltDeg: 90, rollShare: 0, leanDeg: 0 },
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
    tuckDepth: 0.5,
    rigid: { tiltDeg: 90, rollShare: 1, leanDeg: 0 },
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
    tuckDepth: 0.4,
    rigid: { tiltDeg: 36, rollShare: 0.4, leanDeg: 8 },
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
    tuckDepth: 0.85,
    rigid: { tiltDeg: 58, rollShare: 0.3, leanDeg: 18 },
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
    tuckDepth: 0.6,
    rigid: { tiltDeg: 72, rollShare: 0.25, leanDeg: 20 },
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
    tuckDepth: 0.4,
    rigid: { tiltDeg: 36, rollShare: 0.4, leanDeg: 8 },
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
    tuckDepth: 0.8,
    rigid: { tiltDeg: 55, rollShare: 0.35, leanDeg: 15 },
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
    tuckDepth: 0.35,
    rigid: { tiltDeg: 75, rollShare: 0.6, leanDeg: 15 },
    color: 0xffff44,
  },
};

export const TRICK_KEYS = Object.keys(TRICK_DEFINITIONS);

export function isOffAxis(trick: TrickDefinition): boolean {
  return trick.category === 'off-axis';
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
