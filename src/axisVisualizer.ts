import * as THREE from 'three';
import { getTrickAxis } from './tricks';

const AXIS_LENGTH = 2.0;
const GHOST_COUNT = 8;
const GHOST_OPACITY_BASE = 0.12;

// colors per trick category
const AXIS_COLORS: Record<string, number> = {
  spin: 0x00ff88,
  frontflip: 0xff6644,
  backflip: 0xff6644,
  lincolnLoop: 0xffaa00,
  cork: 0x44aaff,
  rodeo: 0xff44aa,
  dSpin: 0xaa44ff,
  bio: 0x44ffaa,
  misty: 0xff8844,
  flatspin: 0xffff44,
};

export function createAxisArrow(trickKey: string): THREE.ArrowHelper {
  const axis = getTrickAxis(trickKey);
  const color = AXIS_COLORS[trickKey] ?? 0xffffff;
  const arrow = new THREE.ArrowHelper(
    axis, new THREE.Vector3(0, 0, 0), AXIS_LENGTH, color, 0.15, 0.08,
  );
  const negGeom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    axis.clone().multiplyScalar(-AXIS_LENGTH * 0.6),
  ]);
  const negLine = new THREE.Line(
    negGeom,
    new THREE.LineBasicMaterial({ color, opacity: 0.4, transparent: true }),
  );
  arrow.add(negLine);
  return arrow;
}

export function updateAxisArrow(
  arrow: THREE.ArrowHelper,
  trickKey: string,
): void {
  const axis = getTrickAxis(trickKey);
  arrow.setDirection(axis);
  const color = AXIS_COLORS[trickKey] ?? 0xffffff;
  arrow.setColor(new THREE.Color(color));
}

// ghost trail: faint copies of the figure at interval positions through the rotation
export interface GhostTrail {
  ghosts: THREE.Group[];
}

export function createGhostTrail(figureMeshFactory: () => THREE.Group): GhostTrail {
  const ghosts: THREE.Group[] = [];
  for (let i = 0; i < GHOST_COUNT; i++) {
    const ghost = figureMeshFactory();
    ghost.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = (child.material as THREE.MeshPhongMaterial).clone();
        (child.material as THREE.MeshPhongMaterial).transparent = true;
        (child.material as THREE.MeshPhongMaterial).opacity = GHOST_OPACITY_BASE;
        (child.material as THREE.MeshPhongMaterial).depthWrite = false;
      }
    });
    ghost.visible = false;
    ghosts.push(ghost);
  }
  return { ghosts };
}

export function updateGhostTrail(
  trail: GhostTrail,
  currentT: number,
  getPosition: (t: number) => THREE.Vector3,
  getRotation: (t: number) => THREE.Quaternion,
  visible: boolean,
): void {
  for (let i = 0; i < trail.ghosts.length; i++) {
    const ghost = trail.ghosts[i];
    if (!visible || currentT <= 0) {
      ghost.visible = false;
      continue;
    }
    // spread ghosts evenly from 0 to current time
    const ghostT = (currentT * (i + 1)) / (trail.ghosts.length + 1);
    ghost.position.copy(getPosition(ghostT));
    ghost.quaternion.copy(getRotation(ghostT));
    ghost.visible = true;

    const fadeProgress = (i + 1) / (trail.ghosts.length + 1);
    ghost.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        (child.material as THREE.MeshPhongMaterial).opacity =
          GHOST_OPACITY_BASE + fadeProgress * 0.08;
      }
    });
  }
}
