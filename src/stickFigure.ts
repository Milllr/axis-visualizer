import * as THREE from 'three';

// joint positions define a T-pose skier facing +Z
// all measurements roughly proportional to a 1.8m human scaled to ~2 units tall

const JOINTS = {
  head:          new THREE.Vector3(0, 1.85, 0),
  neck:          new THREE.Vector3(0, 1.65, 0),
  shoulderL:     new THREE.Vector3(-0.25, 1.55, 0),
  shoulderR:     new THREE.Vector3(0.25, 1.55, 0),
  elbowL:        new THREE.Vector3(-0.50, 1.35, 0),
  elbowR:        new THREE.Vector3(0.50, 1.35, 0),
  wristL:        new THREE.Vector3(-0.65, 1.15, 0),
  wristR:        new THREE.Vector3(0.65, 1.15, 0),
  spine:         new THREE.Vector3(0, 1.20, 0),
  hipL:          new THREE.Vector3(-0.15, 0.95, 0),
  hipR:          new THREE.Vector3(0.15, 0.95, 0),
  kneeL:         new THREE.Vector3(-0.15, 0.50, 0),
  kneeR:         new THREE.Vector3(0.15, 0.50, 0),
  ankleL:        new THREE.Vector3(-0.15, 0.08, 0),
  ankleR:        new THREE.Vector3(0.15, 0.08, 0),
};

// bones connect two joints, each has a color for left/right differentiation
interface BoneDef {
  from: keyof typeof JOINTS;
  to: keyof typeof JOINTS;
  color: number;
}

const LEFT_COLOR = 0x4488ff;
const RIGHT_COLOR = 0xff4444;
const CENTER_COLOR = 0xcccccc;
const SKI_COLOR = 0x222222;

const BONES: BoneDef[] = [
  // torso
  { from: 'head', to: 'neck', color: CENTER_COLOR },
  { from: 'neck', to: 'shoulderL', color: CENTER_COLOR },
  { from: 'neck', to: 'shoulderR', color: CENTER_COLOR },
  { from: 'neck', to: 'spine', color: CENTER_COLOR },
  { from: 'spine', to: 'hipL', color: CENTER_COLOR },
  { from: 'spine', to: 'hipR', color: CENTER_COLOR },
  // left arm
  { from: 'shoulderL', to: 'elbowL', color: LEFT_COLOR },
  { from: 'elbowL', to: 'wristL', color: LEFT_COLOR },
  // right arm
  { from: 'shoulderR', to: 'elbowR', color: RIGHT_COLOR },
  { from: 'elbowR', to: 'wristR', color: RIGHT_COLOR },
  // left leg
  { from: 'hipL', to: 'kneeL', color: LEFT_COLOR },
  { from: 'kneeL', to: 'ankleL', color: LEFT_COLOR },
  // right leg
  { from: 'hipR', to: 'kneeR', color: RIGHT_COLOR },
  { from: 'kneeR', to: 'ankleR', color: RIGHT_COLOR },
];

const LIMB_RADIUS = 0.02;
const JOINT_RADIUS = 0.035;
const HEAD_RADIUS = 0.10;
const EYE_RADIUS = 0.018;
const NOSE_LENGTH = 0.06;
const FACE_COLOR = 0x222222;

function createCylinder(from: THREE.Vector3, to: THREE.Vector3, color: number): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geom = new THREE.CylinderGeometry(LIMB_RADIUS, LIMB_RADIUS, len, 6);
  const mat = new THREE.MeshPhongMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);

  // cylinder is along Y by default, orient it along from->to
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  mesh.position.copy(mid);
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  mesh.quaternion.copy(quat);
  return mesh;
}

function createJointSphere(pos: THREE.Vector3, color: number, radius = JOINT_RADIUS): THREE.Mesh {
  const geom = new THREE.SphereGeometry(radius, 8, 8);
  const mat = new THREE.MeshPhongMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.copy(pos);
  return mesh;
}

// ski is a thin flat box extending forward/backward from the ankle
function createSki(anklePos: THREE.Vector3): THREE.Mesh {
  const geom = new THREE.BoxGeometry(0.06, 0.015, 0.7);
  const mat = new THREE.MeshPhongMaterial({ color: SKI_COLOR });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(anklePos.x, anklePos.y - 0.02, anklePos.z);
  return mesh;
}

// center of mass is roughly at the hips/spine area
const CENTER_OF_MASS = new THREE.Vector3(0, 1.05, 0);

// face features placed on +Z side of head so you can tell which way is forward
function createFace(headPos: THREE.Vector3): THREE.Group {
  const face = new THREE.Group();
  const faceMat = new THREE.MeshPhongMaterial({ color: FACE_COLOR });

  // eyes - two small dark spheres on the front of the head
  const eyeGeom = new THREE.SphereGeometry(EYE_RADIUS, 6, 6);
  const leftEye = new THREE.Mesh(eyeGeom, faceMat);
  leftEye.position.set(headPos.x - 0.04, headPos.y + 0.02, headPos.z + HEAD_RADIUS * 0.85);
  face.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeom.clone(), faceMat);
  rightEye.position.set(headPos.x + 0.04, headPos.y + 0.02, headPos.z + HEAD_RADIUS * 0.85);
  face.add(rightEye);

  // nose - small cone pointing forward from center of face
  const noseGeom = new THREE.ConeGeometry(0.02, NOSE_LENGTH, 6);
  const noseMat = new THREE.MeshPhongMaterial({ color: 0xddaa77 });
  const nose = new THREE.Mesh(noseGeom, noseMat);
  nose.position.set(headPos.x, headPos.y - 0.01, headPos.z + HEAD_RADIUS + NOSE_LENGTH * 0.3);
  nose.rotation.x = -Math.PI / 2;
  face.add(nose);

  return face;
}

export function createStickFigure(): THREE.Group {
  const group = new THREE.Group();

  // head sphere
  group.add(createJointSphere(JOINTS.head, 0xffcc88, HEAD_RADIUS));

  // face so forward direction (+Z) is obvious
  const face = createFace(JOINTS.head);
  for (const child of face.children) {
    group.add(child);
  }

  // joint spheres
  for (const [name, pos] of Object.entries(JOINTS)) {
    if (name === 'head') continue;
    let color = CENTER_COLOR;
    if (name.endsWith('L')) color = LEFT_COLOR;
    if (name.endsWith('R')) color = RIGHT_COLOR;
    group.add(createJointSphere(pos, color));
  }

  // bone cylinders
  for (const bone of BONES) {
    group.add(createCylinder(JOINTS[bone.from], JOINTS[bone.to], bone.color));
  }

  // skis
  group.add(createSki(JOINTS.ankleL));
  group.add(createSki(JOINTS.ankleR));

  // offset so center of mass is at group origin - makes rotation look natural
  for (const child of group.children) {
    child.position.sub(CENTER_OF_MASS);
  }

  return group;
}

export { CENTER_OF_MASS };
