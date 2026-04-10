import * as THREE from 'three';

// axis vectors based on real biomechanics of freestyle skiing
// coordinate system: X = lateral (left-right), Y = vertical (up), Z = forward (direction of travel)
// tilt angles measured from vertical for off-axis tricks

export interface TrickDefinition {
  name: string;
  category: 'on-axis' | 'off-axis';
  axis: THREE.Vector3;
  rotations: number[];
  // direction: 1 = forward, -1 = backward
  direction: number;
  description: string;
  tiltDeg: number;
  // show 1x/2x/3x instead of degrees
  useMultiples: boolean;
  // can be thrown over left or right shoulder
  hasSide: boolean;
}

function axisFromTilt(tiltDeg: number, forward: boolean): THREE.Vector3 {
  const tiltRad = THREE.MathUtils.degToRad(tiltDeg);
  const y = Math.cos(tiltRad);
  const z = Math.sin(tiltRad) * (forward ? 1 : -1);
  return new THREE.Vector3(0, y, z).normalize();
}

export const TRICK_DEFINITIONS: Record<string, TrickDefinition> = {
  // on-axis tricks
  spin: {
    name: 'Spin',
    category: 'on-axis',
    axis: new THREE.Vector3(0, 1, 0),
    rotations: [180, 360, 540, 720, 900, 1080, 1260, 1440],
    direction: 1,
    description: 'Pure horizontal rotation around vertical axis',
    tiltDeg: 0,
    useMultiples: false,
    hasSide: true,
  },
  frontflip: {
    name: 'Frontflip',
    category: 'on-axis',
    // positive X rotation = head pitches forward = frontflip
    axis: new THREE.Vector3(1, 0, 0),
    rotations: [360, 720, 1080],
    direction: 1,
    description: 'Forward rotation around lateral axis',
    tiltDeg: 90,
    useMultiples: true,
    hasSide: false,
  },
  backflip: {
    name: 'Backflip',
    category: 'on-axis',
    // negative rotation around X = head pitches backward = backflip
    axis: new THREE.Vector3(1, 0, 0),
    rotations: [360, 720, 1080],
    direction: -1,
    description: 'Backward rotation around lateral axis',
    tiltDeg: 90,
    useMultiples: true,
    hasSide: false,
  },
  lincolnLoop: {
    name: 'Lincoln Loop',
    category: 'on-axis',
    axis: new THREE.Vector3(0, 0, 1),
    rotations: [360, 720, 1080],
    direction: 1,
    description: 'Sideways cartwheel around forward axis',
    tiltDeg: 90,
    useMultiples: true,
    hasSide: true,
  },

  // off-axis tricks - backward tilt family
  cork: {
    name: 'Cork',
    category: 'off-axis',
    axis: axisFromTilt(22, false),
    rotations: [360, 540, 720, 900, 1080],
    direction: 1,
    description: 'Off-axis spin, ~20-25° backward tilt, non-inverted',
    tiltDeg: 22,
    useMultiples: false,
    hasSide: true,
  },
  rodeo: {
    name: 'Rodeo',
    category: 'off-axis',
    axis: axisFromTilt(55, false),
    rotations: [360, 540, 720],
    direction: -1,
    description: 'Backflip + spin, ~50-60° backward tilt, inverted',
    tiltDeg: 55,
    useMultiples: false,
    hasSide: true,
  },
  dSpin: {
    name: 'D-Spin',
    category: 'off-axis',
    axis: axisFromTilt(75, false),
    rotations: [720, 900],
    direction: -1,
    description: 'Inverted cork, ~75° backward tilt, fully inverted',
    tiltDeg: 75,
    useMultiples: false,
    hasSide: true,
  },

  // off-axis tricks - forward tilt family
  bio: {
    name: 'Bio',
    category: 'off-axis',
    axis: axisFromTilt(22, true),
    rotations: [360, 540, 720, 900, 1080, 1260],
    direction: 1,
    description: 'Forward cork, ~20-25° forward tilt, non-inverted',
    tiltDeg: 22,
    useMultiples: false,
    hasSide: true,
  },
  misty: {
    name: 'Misty',
    category: 'off-axis',
    axis: axisFromTilt(55, true),
    rotations: [540, 720, 900],
    direction: 1,
    description: 'Frontflip + spin, ~50-60° forward tilt, inverted',
    tiltDeg: 55,
    useMultiples: false,
    hasSide: true,
  },
  flatspin: {
    name: 'Flatspin',
    category: 'off-axis',
    axis: axisFromTilt(75, true),
    rotations: [360, 540, 720],
    direction: 1,
    description: 'Near-horizontal axis, ~75° tilt, body stays flat',
    tiltDeg: 75,
    useMultiples: false,
    hasSide: true,
  },
};

export const TRICK_KEYS = Object.keys(TRICK_DEFINITIONS);

export function getTrickAxis(trickKey: string): THREE.Vector3 {
  const trick = TRICK_DEFINITIONS[trickKey];
  if (!trick) return new THREE.Vector3(0, 1, 0);
  return trick.axis.clone();
}
