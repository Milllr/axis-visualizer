import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildApproachPath, landingSurface, KICKER } from './timeline';
import type { SceneMode } from './timeline';

export interface PanelScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  setMode(mode: SceneMode): void;
  setBedDepth(depth: number): void;
  // keep the orbit target on the skier while preserving the camera offset
  follow(target: THREE.Vector3, snap?: boolean): void;
  mode: SceneMode;
}

const SNOW = 0x2a2f36;
const SNOW_EDGE = 0x3c434c;
const TRAMP_BED = 0x1d2430;
const TRAMP_FRAME = 0x556070;

function buildSkiTerrain(): THREE.Group {
  const g = new THREE.Group();
  const width = 3.2;
  const half = width / 2;

  // profile of the whole hill in the yz plane
  const profile: { z: number; y: number }[] = [];
  const path = buildApproachPath();
  for (const p of path) profile.push({ z: p.z, y: p.y });
  // vertical back of the kicker down to the deck, then the table and the landing
  profile.push({ z: 0.001, y: -KICKER.deckDrop });
  const endZ = KICKER.knuckleZ + KICKER.landingLength * Math.cos(KICKER.landingAngle * Math.PI / 180);
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const z = KICKER.knuckleZ * (1 - i / steps) * 0 + (0.001 + (endZ - 0.001) * (i / steps));
    profile.push({ z, y: landingSurface(z).y });
  }
  // runout
  const runY = landingSurface(endZ).y;
  profile.push({ z: endZ + 6, y: runY - 0.4 });

  const verts: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i];
    verts.push(-half, p.y, p.z, half, p.y, p.z);
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  const mat = new THREE.MeshPhongMaterial({ color: SNOW, side: THREE.DoubleSide, flatShading: true });
  g.add(new THREE.Mesh(geom, mat));

  // edge lines so the profile reads from any angle
  for (const x of [-half, half]) {
    const pts = profile.map((p) => new THREE.Vector3(x, p.y + 0.005, p.z));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: SNOW_EDGE })));
  }
  // center line down the hill
  const center = profile.map((p) => new THREE.Vector3(0, p.y + 0.005, p.z));
  const centerLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(center),
    new THREE.LineDashedMaterial({ color: 0x4a5260, dashSize: 0.3, gapSize: 0.2 }),
  );
  centerLine.computeLineDistances();
  g.add(centerLine);

  // lip marker
  const lip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, 0.06), new THREE.MeshBasicMaterial({ color: 0xff6644 }));
  lip.position.set(0, 0.01, 0);
  g.add(lip);
  // knuckle marker
  const knuckle = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, 0.06), new THREE.MeshBasicMaterial({ color: 0x556070 }));
  knuckle.position.set(0, -KICKER.deckDrop + 0.01, KICKER.knuckleZ);
  g.add(knuckle);

  return g;
}

interface Trampoline {
  group: THREE.Group;
  bed: THREE.Mesh;
  setDepth(d: number): void;
}

function buildTrampoline(): Trampoline {
  const g = new THREE.Group();
  const R = 2.1;
  const bedGeom = new THREE.CircleGeometry(R, 48);
  const bedMat = new THREE.MeshPhongMaterial({ color: TRAMP_BED, side: THREE.DoubleSide });
  const bed = new THREE.Mesh(bedGeom, bedMat);
  bed.rotation.x = -Math.PI / 2;
  g.add(bed);

  // radial rings drawn on the bed help the eye read the dent
  for (const r of [0.7, 1.4]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.01, r + 0.01, 48), new THREE.MeshBasicMaterial({ color: 0x2f3a4a, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    g.add(ring);
  }

  const frame = new THREE.Mesh(new THREE.TorusGeometry(R + 0.22, 0.05, 8, 48), new THREE.MeshPhongMaterial({ color: TRAMP_FRAME }));
  frame.rotation.x = Math.PI / 2;
  g.add(frame);
  // springs as a ring of thin lines
  const springPts: THREE.Vector3[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    springPts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R), new THREE.Vector3(Math.cos(a) * (R + 0.2), 0, Math.sin(a) * (R + 0.2)));
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(springPts), new THREE.LineBasicMaterial({ color: 0x8a94a3 })));
  // legs
  const legGeom = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6);
  const legMat = new THREE.MeshPhongMaterial({ color: TRAMP_FRAME });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.position.set(Math.cos(a) * (R + 0.22), -0.5, Math.sin(a) * (R + 0.22));
    g.add(leg);
  }
  // the whole trampoline sits with the bed at y = 0, the floor a meter below
  const floor = new THREE.GridHelper(10, 20, 0x2a2a2a, 0x1e1e1e);
  floor.position.y = -1.0;
  g.add(floor);

  const pos = bedGeom.attributes.position as THREE.BufferAttribute;
  const base = new Float32Array(pos.array as Float32Array);
  const setDepth = (d: number) => {
    // circle geometry lies in its own xy plane before the mesh rotation, z is up after rotation
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      const r = Math.hypot(x, y) / R;
      const dent = d * Math.pow(Math.max(0, 1 - r * r), 1.4);
      pos.setZ(i, -dent);
    }
    pos.needsUpdate = true;
    bedGeom.computeVertexNormals();
  };
  return { group: g, bed, setDepth };
}

export function createPanelScene(canvas: HTMLCanvasElement): PanelScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);
  scene.fog = new THREE.Fog(0x111111, 30, 70);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(6, 3, -4);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(5, 10, -3);
  scene.add(dirLight);
  const fill = new THREE.DirectionalLight(0x8899ff, 0.3);
  fill.position.set(-4, 3, 6);
  scene.add(fill);

  const skiTerrain = buildSkiTerrain();
  const tramp = buildTrampoline();
  scene.add(skiTerrain);
  scene.add(tramp.group);

  let mode: SceneMode = 'skis';
  const applyMode = () => {
    skiTerrain.visible = mode === 'skis';
    tramp.group.visible = mode === 'trampoline';
  };
  applyMode();

  const _delta = new THREE.Vector3();
  const _goal = new THREE.Vector3();

  const panel: PanelScene = {
    scene,
    camera,
    controls,
    get mode() { return mode; },
    setMode(m: SceneMode) {
      if (m === mode) return;
      mode = m;
      applyMode();
    },
    setBedDepth(d: number) {
      tramp.setDepth(d);
    },
    follow(target: THREE.Vector3, snap = false) {
      _goal.copy(target);
      _delta.subVectors(_goal, controls.target);
      // ease toward the skier, but jump straight there after a big scrub
      if (!snap && _delta.length() < 2.5) _delta.multiplyScalar(0.25);
      controls.target.add(_delta);
      camera.position.add(_delta);
    },
  };
  return panel;
}
