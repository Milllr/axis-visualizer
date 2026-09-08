import * as THREE from 'three';

// articulated skier built from segment lengths and masses of a 1.80 m, 75 kg athlete
// (de leva 1996 segment parameters), so the center of mass and the moment of inertia
// come from the posed body rather than a fixed pivot
//
// figure faces +z, +x is the skier's left, y up. joint names match snowbox's rig so the
// pose code ports across. every joint is a THREE.Group whose rotation is set per frame
// with euler xyz angles. the root joint is the hip at pelvis height.

export const JOINT_NAMES = [
  'hip', 'spine', 'neck',
  'shoulderL', 'elbowL', 'wristL',
  'shoulderR', 'elbowR', 'wristR',
  'hipL', 'kneeL', 'ankleL',
  'hipR', 'kneeR', 'ankleR',
] as const;

export type JointName = typeof JOINT_NAMES[number];

// segment lengths in meters
export const SEG = {
  hipHeight: 0.95,     // pelvis center above the sole when standing
  pelvis: 0.13,        // hip root to lumbar joint
  chest: 0.35,         // lumbar joint to base of neck
  neck: 0.10,          // base of neck to head center minus radius
  headRadius: 0.11,
  shoulderHalf: 0.20,
  shoulderDrop: 0.30,  // shoulders sit this far above the lumbar joint
  upperArm: 0.30,
  forearm: 0.27,
  hand: 0.09,
  hipHalf: 0.10,
  thigh: 0.44,
  shank: 0.43,
  footHeight: 0.08,
  footLength: 0.27,
  skiLength: 1.72,
  skiWidth: 0.09,
};

// masses in kg, de leva fractions of 75 kg, skis and boots added on the feet
export const MASS = {
  head: 5.2,
  neckSeg: 1.0,
  chest: 26.3,
  pelvis: 11.0,
  upperArm: 2.1,
  forearm: 1.2,
  hand: 0.45,
  thigh: 7.5,
  shank: 3.5,
  foot: 1.1,
  boot: 1.6,
  ski: 1.9,
};

const LEFT_COLOR = 0x4488ff;
const RIGHT_COLOR = 0xff4444;
const CENTER_COLOR = 0xcccccc;
const SKIN_COLOR = 0xffcc88;
const SKI_COLOR = 0x222222;
const BOOT_COLOR = 0x333333;

export interface SegmentMass {
  // joint the segment hangs from
  joint: JointName;
  // segment end in that joint's local frame
  end: THREE.Vector3;
  mass: number;
  // fraction along the segment where its mass sits
  comFrac: number;
  // true for the long skis, adds a rod inertia term along the segment
  rodLength: number;
  onlyWithSkis?: boolean;
}

export interface Figure {
  group: THREE.Group;
  joints: Record<JointName, THREE.Group>;
  segments: SegmentMass[];
  meshes: THREE.Mesh[];
  setSkis(on: boolean): void;
  hasSkis(): boolean;
  // mass weighted center in figure local space, call after updateMatrixWorld
  computeCom(target: THREE.Vector3): THREE.Vector3;
  // scalar moment of inertia about a unit axis through the com, figure local space
  computeInertia(axisLocal: THREE.Vector3, com: THREE.Vector3): number;
  // full inertia tensor about the com, figure local space
  computeInertiaTensor(com: THREE.Vector3, target: THREE.Matrix3): THREE.Matrix3;
  totalMass(): number;
}

function makeMaterial(color: number): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({ color, shininess: 30 });
}

// capsule from the joint origin to a point in the joint's local frame
function addSegmentMesh(
  parent: THREE.Object3D,
  end: THREE.Vector3,
  radius: number,
  color: number,
  meshes: THREE.Mesh[],
): THREE.Mesh {
  const len = end.length();
  const geom = new THREE.CapsuleGeometry(radius, Math.max(0.001, len - radius * 0.6), 4, 10);
  const mesh = new THREE.Mesh(geom, makeMaterial(color));
  mesh.position.copy(end).multiplyScalar(0.5);
  const up = new THREE.Vector3(0, 1, 0);
  mesh.quaternion.setFromUnitVectors(up, end.clone().normalize());
  parent.add(mesh);
  meshes.push(mesh);
  return mesh;
}

function addJointSphere(parent: THREE.Object3D, radius: number, color: number, meshes: THREE.Mesh[]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), makeMaterial(color));
  parent.add(mesh);
  meshes.push(mesh);
  return mesh;
}

function addBox(
  parent: THREE.Object3D,
  size: THREE.Vector3,
  pos: THREE.Vector3,
  color: number,
  meshes: THREE.Mesh[],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), makeMaterial(color));
  mesh.position.copy(pos);
  parent.add(mesh);
  meshes.push(mesh);
  return mesh;
}

function addHead(neck: THREE.Group, meshes: THREE.Mesh[]): void {
  const headCenter = new THREE.Vector3(0, SEG.neck + SEG.headRadius, 0);
  const head = addJointSphere(neck, SEG.headRadius, SKIN_COLOR, meshes);
  head.position.copy(headCenter);

  const faceMat = makeMaterial(0x222222);
  const eyeGeom = new THREE.SphereGeometry(0.018, 6, 6);
  for (const sx of [-0.04, 0.04]) {
    const eye = new THREE.Mesh(eyeGeom, faceMat);
    eye.position.set(headCenter.x + sx, headCenter.y + 0.02, headCenter.z + SEG.headRadius * 0.85);
    neck.add(eye);
    meshes.push(eye);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 6), makeMaterial(0xddaa77));
  nose.position.set(headCenter.x, headCenter.y - 0.01, headCenter.z + SEG.headRadius + 0.018);
  nose.rotation.x = -Math.PI / 2;
  neck.add(nose);
  meshes.push(nose);

  // helmet band so the top of the head reads at a glance
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(SEG.headRadius * 0.98, 0.012, 6, 20),
    makeMaterial(0x555555),
  );
  band.position.copy(headCenter);
  band.rotation.x = Math.PI / 2;
  neck.add(band);
  meshes.push(band);
}

export function createFigure(withSkis = true): Figure {
  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const joints = {} as Record<JointName, THREE.Group>;
  const segments: SegmentMass[] = [];

  const mk = (name: JointName, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
    const j = new THREE.Group();
    j.name = name;
    j.position.set(x, y, z);
    parent.add(j);
    joints[name] = j;
    return j;
  };

  // torso chain
  const hip = mk('hip', group, 0, SEG.hipHeight, 0);
  const spine = mk('spine', hip, 0, SEG.pelvis, 0);
  const neck = mk('neck', spine, 0, SEG.chest, 0);

  addJointSphere(hip, 0.05, CENTER_COLOR, meshes);
  addSegmentMesh(hip, new THREE.Vector3(0, SEG.pelvis, 0), 0.085, CENTER_COLOR, meshes);
  segments.push({ joint: 'hip', end: new THREE.Vector3(0, SEG.pelvis, 0), mass: MASS.pelvis, comFrac: 0.5, rodLength: 0.2 });

  addJointSphere(spine, 0.045, CENTER_COLOR, meshes);
  addSegmentMesh(spine, new THREE.Vector3(0, SEG.chest, 0), 0.10, CENTER_COLOR, meshes);
  segments.push({ joint: 'spine', end: new THREE.Vector3(0, SEG.chest, 0), mass: MASS.chest, comFrac: 0.55, rodLength: SEG.chest });

  // shoulder bar
  addSegmentMesh(spine, new THREE.Vector3(SEG.shoulderHalf, SEG.shoulderDrop, 0), 0.035, CENTER_COLOR, meshes)
    .position.set(SEG.shoulderHalf * 0.5, SEG.shoulderDrop, 0);
  addSegmentMesh(spine, new THREE.Vector3(-SEG.shoulderHalf, SEG.shoulderDrop, 0), 0.035, CENTER_COLOR, meshes)
    .position.set(-SEG.shoulderHalf * 0.5, SEG.shoulderDrop, 0);

  addJointSphere(neck, 0.035, CENTER_COLOR, meshes);
  addSegmentMesh(neck, new THREE.Vector3(0, SEG.neck, 0), 0.04, SKIN_COLOR, meshes);
  segments.push({ joint: 'neck', end: new THREE.Vector3(0, SEG.neck, 0), mass: MASS.neckSeg, comFrac: 0.5, rodLength: SEG.neck });
  segments.push({ joint: 'neck', end: new THREE.Vector3(0, SEG.neck + SEG.headRadius, 0), mass: MASS.head, comFrac: 1.0, rodLength: 0.15 });
  addHead(neck, meshes);

  // arms hang down from the shoulders at rest, the pose lifts them
  const buildArm = (side: 'L' | 'R') => {
    const s = side === 'L' ? 1 : -1;
    const color = side === 'L' ? LEFT_COLOR : RIGHT_COLOR;
    const shoulder = mk(`shoulder${side}`, spine, s * SEG.shoulderHalf, SEG.shoulderDrop, 0);
    const elbow = mk(`elbow${side}`, shoulder, 0, -SEG.upperArm, 0);
    const wrist = mk(`wrist${side}`, elbow, 0, -SEG.forearm, 0);

    addJointSphere(shoulder, 0.045, color, meshes);
    addSegmentMesh(shoulder, new THREE.Vector3(0, -SEG.upperArm, 0), 0.042, color, meshes);
    segments.push({ joint: `shoulder${side}`, end: new THREE.Vector3(0, -SEG.upperArm, 0), mass: MASS.upperArm, comFrac: 0.58, rodLength: SEG.upperArm });

    addJointSphere(elbow, 0.035, color, meshes);
    addSegmentMesh(elbow, new THREE.Vector3(0, -SEG.forearm, 0), 0.035, color, meshes);
    segments.push({ joint: `elbow${side}`, end: new THREE.Vector3(0, -SEG.forearm, 0), mass: MASS.forearm, comFrac: 0.45, rodLength: SEG.forearm });

    addJointSphere(wrist, 0.028, color, meshes);
    addSegmentMesh(wrist, new THREE.Vector3(0, -SEG.hand, 0), 0.025, SKIN_COLOR, meshes);
    segments.push({ joint: `wrist${side}`, end: new THREE.Vector3(0, -SEG.hand, 0), mass: MASS.hand, comFrac: 0.6, rodLength: SEG.hand });
  };
  buildArm('L');
  buildArm('R');

  const skiParts: THREE.Mesh[] = [];
  const footParts: THREE.Mesh[] = [];

  const buildLeg = (side: 'L' | 'R') => {
    const s = side === 'L' ? 1 : -1;
    const color = side === 'L' ? LEFT_COLOR : RIGHT_COLOR;
    const hipJ = mk(`hip${side}`, hip, s * SEG.hipHalf, 0, 0);
    const knee = mk(`knee${side}`, hipJ, 0, -SEG.thigh, 0);
    const ankle = mk(`ankle${side}`, knee, 0, -SEG.shank, 0);

    addJointSphere(hipJ, 0.05, color, meshes);
    addSegmentMesh(hipJ, new THREE.Vector3(0, -SEG.thigh, 0), 0.065, color, meshes);
    segments.push({ joint: `hip${side}`, end: new THREE.Vector3(0, -SEG.thigh, 0), mass: MASS.thigh, comFrac: 0.41, rodLength: SEG.thigh });

    addJointSphere(knee, 0.045, color, meshes);
    addSegmentMesh(knee, new THREE.Vector3(0, -SEG.shank, 0), 0.05, color, meshes);
    segments.push({ joint: `knee${side}`, end: new THREE.Vector3(0, -SEG.shank, 0), mass: MASS.shank, comFrac: 0.44, rodLength: SEG.shank });

    addJointSphere(ankle, 0.035, color, meshes);
    // foot: heel a little behind the ankle, toes forward
    const foot = addBox(
      ankle,
      new THREE.Vector3(0.09, SEG.footHeight * 0.6, SEG.footLength),
      new THREE.Vector3(0, -SEG.footHeight * 0.6, SEG.footLength * 0.5 - 0.07),
      SKIN_COLOR,
      meshes,
    );
    footParts.push(foot);
    segments.push({ joint: `ankle${side}`, end: new THREE.Vector3(0, -SEG.footHeight * 0.6, SEG.footLength * 0.5 - 0.07), mass: MASS.foot, comFrac: 1.0, rodLength: SEG.footLength });

    // boot and ski, mounted slightly behind ski center
    const boot = addBox(
      ankle,
      new THREE.Vector3(0.11, SEG.footHeight, 0.32),
      new THREE.Vector3(0, -SEG.footHeight * 0.5, 0.06),
      BOOT_COLOR,
      meshes,
    );
    const ski = addBox(
      ankle,
      new THREE.Vector3(SEG.skiWidth, 0.018, SEG.skiLength),
      new THREE.Vector3(0, -SEG.footHeight - 0.009, 0.10),
      SKI_COLOR,
      meshes,
    );
    skiParts.push(boot, ski);
    segments.push({ joint: `ankle${side}`, end: new THREE.Vector3(0, -SEG.footHeight * 0.5, 0.06), mass: MASS.boot, comFrac: 1.0, rodLength: 0.3, onlyWithSkis: true });
    segments.push({ joint: `ankle${side}`, end: new THREE.Vector3(0, -SEG.footHeight, 0.10), mass: MASS.ski, comFrac: 1.0, rodLength: SEG.skiLength, onlyWithSkis: true });
  };
  buildLeg('L');
  buildLeg('R');

  let skisOn = withSkis;
  const applySkis = () => {
    for (const m of skiParts) m.visible = skisOn;
  };
  applySkis();

  const _p = new THREE.Vector3();
  const _q = new THREE.Vector3();
  const _r = new THREE.Vector3();
  const _inv = new THREE.Matrix4();
  const _dir = new THREE.Vector3();

  // returns segment com and the unit direction of the segment in figure local space
  const segmentWorld = (seg: SegmentMass, com: THREE.Vector3, dir: THREE.Vector3): void => {
    const j = joints[seg.joint];
    _p.set(0, 0, 0).applyMatrix4(j.matrixWorld);
    _q.copy(seg.end).applyMatrix4(j.matrixWorld);
    _p.applyMatrix4(_inv);
    _q.applyMatrix4(_inv);
    dir.subVectors(_q, _p);
    const len = dir.length();
    if (len > 1e-6) dir.divideScalar(len); else dir.set(0, 1, 0);
    com.copy(_p).lerp(_q, seg.comFrac);
  };

  const active = (seg: SegmentMass) => !(seg.onlyWithSkis && !skisOn);

  const totalMass = (): number => {
    let m = 0;
    for (const seg of segments) if (active(seg)) m += seg.mass;
    return m;
  };

  const computeCom = (target: THREE.Vector3): THREE.Vector3 => {
    _inv.copy(group.matrixWorld).invert();
    target.set(0, 0, 0);
    let m = 0;
    for (const seg of segments) {
      if (!active(seg)) continue;
      segmentWorld(seg, _r, _dir);
      target.addScaledVector(_r, seg.mass);
      m += seg.mass;
    }
    return target.divideScalar(Math.max(1e-6, m));
  };

  // point mass term plus a thin rod term for each segment
  const computeInertia = (axisLocal: THREE.Vector3, com: THREE.Vector3): number => {
    _inv.copy(group.matrixWorld).invert();
    const a = axisLocal;
    let I = 0;
    for (const seg of segments) {
      if (!active(seg)) continue;
      segmentWorld(seg, _r, _dir);
      _r.sub(com);
      const along = _r.dot(a);
      const perp2 = Math.max(0, _r.lengthSq() - along * along);
      I += seg.mass * perp2;
      const cosang = _dir.dot(a);
      const sin2 = Math.max(0, 1 - cosang * cosang);
      I += seg.mass * seg.rodLength * seg.rodLength / 12 * sin2;
    }
    return I;
  };

  const computeInertiaTensor = (com: THREE.Vector3, target: THREE.Matrix3): THREE.Matrix3 => {
    _inv.copy(group.matrixWorld).invert();
    let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
    for (const seg of segments) {
      if (!active(seg)) continue;
      segmentWorld(seg, _r, _dir);
      _r.sub(com);
      const m = seg.mass;
      const x = _r.x, y = _r.y, z = _r.z;
      xx += m * (y * y + z * z);
      yy += m * (x * x + z * z);
      zz += m * (x * x + y * y);
      xy -= m * x * y;
      xz -= m * x * z;
      yz -= m * y * z;
      // rod about its center: (m L^2 / 12) (I - d d^T)
      const k = m * seg.rodLength * seg.rodLength / 12;
      const dx = _dir.x, dy = _dir.y, dz = _dir.z;
      xx += k * (1 - dx * dx);
      yy += k * (1 - dy * dy);
      zz += k * (1 - dz * dz);
      xy -= k * dx * dy;
      xz -= k * dx * dz;
      yz -= k * dy * dz;
    }
    target.set(xx, xy, xz, xy, yy, yz, xz, yz, zz);
    return target;
  };

  return {
    group,
    joints,
    segments,
    meshes,
    setSkis(on: boolean) { skisOn = on; applySkis(); },
    hasSkis() { return skisOn; },
    computeCom,
    computeInertia,
    computeInertiaTensor,
    totalMass,
  };
}

// rest pose in radians, matches the snowbox rig so the ported pose math lands on the same shape
export const REST_POSE: Record<JointName, [number, number, number]> = {
  hip: [0.08, 0, 0],
  spine: [0.14, 0, 0],
  neck: [-0.08, 0, 0],
  shoulderL: [0.22, 0, 0.28],
  shoulderR: [0.22, 0, -0.28],
  elbowL: [-0.80, 0.05, 0],
  elbowR: [-0.80, 0, 0],
  wristL: [0, 0, 0],
  wristR: [0, 0, 0],
  hipL: [0.30, 0, 0.08],
  hipR: [0.30, 0, -0.08],
  kneeL: [-0.55, 0, 0],
  kneeR: [-0.55, 0, 0],
  ankleL: [0.16, 0, 0],
  ankleR: [0.16, 0, 0],
};

export function applyPose(figure: Figure, pose: Record<JointName, [number, number, number]>): void {
  for (const name of JOINT_NAMES) {
    const r = pose[name];
    figure.joints[name].rotation.set(r[0], r[1], r[2], 'XYZ');
  }
}
