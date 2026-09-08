import * as THREE from 'three';
import { createFigure, applyPose, SEG } from './figure';
import type { Figure } from './figure';
import type { Baked, BakedFrame } from './bake';
import { createBakedFrame } from './bake';
import { clamp01 } from './curves';

// on body overlays copied from snowbox motionDebug.js plus google's cork ribbon
//   L arrow        angular momentum, fixed in the air
//   omega line     instantaneous spin axis through the com, green vertical, cyan diagonal, red flat
//   tilt disk      plane of rotation perpendicular to omega, more visible the more off axis
//   body frame     body up and body forward arrows
//   com dot        the pivot the body orbits
//   head trail     the path of the head, shows every dip
//   ribbon         the spin axis traced through the trick
//   ghosts         faint copies of the figure through the rotation so far

export interface OverlayFlags {
  ghosts: boolean;
  momentum: boolean;
  omega: boolean;
  disk: boolean;
  bodyFrame: boolean;
  com: boolean;
  headTrail: boolean;
  ribbon: boolean;
  path: boolean;
}

export const DEFAULT_FLAGS: OverlayFlags = {
  ghosts: true,
  momentum: true,
  omega: true,
  disk: true,
  bodyFrame: false,
  com: true,
  headTrail: true,
  ribbon: true,
  path: true,
};

export interface Overlays {
  group: THREE.Group;
  ghosts: Figure[];
  rebuild(baked: Baked): void;
  update(baked: Baked, frame: BakedFrame, flags: OverlayFlags): void;
  dispose(): void;
}

const GHOST_COUNT = 8;
const GHOST_OPACITY = 0.05;
const RIBBON_HALF = 0.6;

function axisColor(tilt01: number, target: THREE.Color): THREE.Color {
  // snowbox: green for vertical, cyan around 45 degrees, red for horizontal
  const normY = 1 - tilt01;
  return target.setRGB(1 - normY, 0.5 + normY * 0.5, normY * 0.7);
}

function makeGhost(): Figure {
  const fig = createFigure(true);
  fig.group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const m = (child.material as THREE.MeshPhongMaterial).clone();
      m.transparent = true;
      m.opacity = GHOST_OPACITY;
      m.depthWrite = false;
      child.material = m;
    }
  });
  fig.group.visible = false;
  return fig;
}

export function createOverlays(): Overlays {
  const group = new THREE.Group();

  const comDot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffff00, depthTest: false }));
  comDot.renderOrder = 999;
  group.add(comDot);

  const comRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 8, 40), new THREE.MeshBasicMaterial({ color: 0xff44ff, transparent: true, opacity: 0.7, depthTest: false }));
  comRing.rotation.x = Math.PI / 2;
  comRing.renderOrder = 999;
  group.add(comRing);

  const lArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1.6, 0xff8833, 0.16, 0.08);
  group.add(lArrow);
  const lNeg = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]),
    new THREE.LineBasicMaterial({ color: 0xff8833, transparent: true, opacity: 0.35 }),
  );
  group.add(lNeg);

  const omegaGeom = new THREE.BufferGeometry();
  omegaGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const omegaMat = new THREE.LineBasicMaterial({ color: 0x44ffaa, depthTest: false, transparent: true, opacity: 0.9 });
  const omegaLine = new THREE.Line(omegaGeom, omegaMat);
  omegaLine.renderOrder = 998;
  omegaLine.frustumCulled = false;
  group.add(omegaLine);

  const diskMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.15, depthTest: false, side: THREE.DoubleSide });
  const disk = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.7, 40), diskMat);
  disk.renderOrder = 997;
  group.add(disk);

  const bodyUp = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.9, 0xffffff, 0.12, 0.06);
  const bodyFwd = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 0.9, 0x70e0ff, 0.12, 0.06);
  group.add(bodyUp, bodyFwd);

  const headTrailGeom = new THREE.BufferGeometry();
  const headTrail = new THREE.Line(headTrailGeom, new THREE.LineBasicMaterial({ color: 0xffcc88, transparent: true, opacity: 0.6 }));
  headTrail.frustumCulled = false;
  group.add(headTrail);
  const headTrailFull = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffcc88, transparent: true, opacity: 0.15 }));
  headTrailFull.frustumCulled = false;
  group.add(headTrailFull);

  const pathLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({ color: 0x555555, dashSize: 0.15, gapSize: 0.08 }),
  );
  pathLine.frustumCulled = false;
  group.add(pathLine);

  const ribbonMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const ribbon = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMat);
  ribbon.frustumCulled = false;
  group.add(ribbon);
  const ribbonFaintMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
  const ribbonFaint = new THREE.Mesh(new THREE.BufferGeometry(), ribbonFaintMat);
  ribbonFaint.frustumCulled = false;
  group.add(ribbonFaint);

  const ghosts: Figure[] = [];
  for (let i = 0; i < GHOST_COUNT; i++) {
    const g = makeGhost();
    ghosts.push(g);
    group.add(g.group);
  }

  // ribbon bookkeeping: one pair of vertices per sampled frame
  let ribbonTimes: number[] = [];
  let headTimes: number[] = [];
  const scratch = createBakedFrame();
  const _c = new THREE.Color();
  const _v = new THREE.Vector3();
  const _n = new THREE.Vector3();

  function rebuild(baked: Baked): void {
    const stride = 3;
    const verts: number[] = [];
    const cols: number[] = [];
    const idx: number[] = [];
    ribbonTimes = [];
    let k = 0;
    for (let i = 0; i < baked.frames.length; i += stride) {
      const f = baked.frames[i];
      if (f.segment !== 'flight' && f.segment !== 'set') continue;
      const w = f.omega.length();
      if (w < 0.3) continue;
      _n.copy(f.omega).normalize();
      const a = _v.copy(f.pivotPos).addScaledVector(_n, RIBBON_HALF);
      verts.push(a.x, a.y, a.z);
      const b = _v.copy(f.pivotPos).addScaledVector(_n, -RIBBON_HALF);
      verts.push(b.x, b.y, b.z);
      axisColor(clamp01(f.tiltDeg / 90), _c);
      cols.push(_c.r, _c.g, _c.b, _c.r, _c.g, _c.b);
      if (k > 0) {
        const p = (k - 1) * 2, q = k * 2;
        idx.push(p, q, p + 1, p + 1, q, q + 1);
      }
      ribbonTimes.push(f.time);
      k++;
    }
    const build = (geom: THREE.BufferGeometry) => {
      geom.dispose();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setIndex(idx);
      return g;
    };
    ribbon.geometry = build(ribbon.geometry);
    ribbonFaint.geometry = build(ribbonFaint.geometry);

    // head trail and com path over the whole timeline
    const headPts: THREE.Vector3[] = [];
    const pathPts: THREE.Vector3[] = [];
    headTimes = [];
    for (let i = 0; i < baked.frames.length; i += 2) {
      const f = baked.frames[i];
      headPts.push(f.headPos.clone());
      headTimes.push(f.time);
      pathPts.push(f.pivotPos.clone());
    }
    headTrail.geometry.dispose();
    headTrail.geometry = new THREE.BufferGeometry().setFromPoints(headPts);
    headTrailFull.geometry.dispose();
    headTrailFull.geometry = new THREE.BufferGeometry().setFromPoints(headPts);
    pathLine.geometry.dispose();
    pathLine.geometry = new THREE.BufferGeometry().setFromPoints(pathPts);
    pathLine.computeLineDistances();

    for (const g of ghosts) g.setSkis(baked.config.mode === 'skis');
  }

  function poseGhost(g: Figure, f: BakedFrame): void {
    applyPose(g, f.joints);
    g.joints.hip.position.y = SEG.hipHeight - f.hipDrop;
    g.group.position.copy(f.comLocal).multiplyScalar(-1).applyQuaternion(f.quat).add(f.pivotPos);
    g.group.quaternion.copy(f.quat);
    g.group.visible = true;
  }

  function update(baked: Baked, frame: BakedFrame, flags: OverlayFlags): void {
    const p = frame.pivotPos;
    const inAir = frame.segment === 'flight' || frame.segment === 'set';
    const w = frame.omega.length();

    comDot.visible = flags.com;
    comRing.visible = flags.com;
    comDot.position.copy(p);
    comRing.position.copy(p);

    // L is fixed once airborne, drawn from the com
    lArrow.visible = flags.momentum && inAir;
    lNeg.visible = lArrow.visible;
    lArrow.position.copy(p);
    lArrow.setDirection(baked.Lhat);
    lNeg.position.copy(p);
    lNeg.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), _v.copy(baked.Lhat).multiplyScalar(-1).normalize());

    omegaLine.visible = flags.omega && inAir && w > 0.2;
    if (omegaLine.visible) {
      _n.copy(frame.omega).normalize();
      const len = Math.min(2.2, 0.8 + w * 0.12);
      const pos = omegaGeom.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, p.x - _n.x * len, p.y - _n.y * len, p.z - _n.z * len);
      pos.setXYZ(1, p.x + _n.x * len, p.y + _n.y * len, p.z + _n.z * len);
      pos.needsUpdate = true;
      axisColor(clamp01(frame.tiltDeg / 90), omegaMat.color);
    }

    disk.visible = flags.disk && inAir && w > 0.5;
    if (disk.visible) {
      _n.copy(frame.omega).normalize();
      disk.position.copy(p);
      disk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _n);
      const s = 0.6 + Math.min(1.2, w * 0.08);
      disk.scale.setScalar(s);
      const tiltAmount = 1 - Math.abs(_n.y);
      diskMat.opacity = 0.08 + tiltAmount * 0.25;
      diskMat.color.setHex(tiltAmount > 0.3 ? 0xff6600 : 0xffaa00);
    }

    bodyUp.visible = bodyFwd.visible = flags.bodyFrame;
    if (flags.bodyFrame) {
      bodyUp.position.copy(p);
      bodyFwd.position.copy(p);
      bodyUp.setDirection(_v.set(0, 1, 0).applyQuaternion(frame.quat));
      bodyFwd.setDirection(_v.set(0, 0, 1).applyQuaternion(frame.quat));
    }

    headTrail.visible = flags.headTrail;
    headTrailFull.visible = flags.headTrail;
    if (flags.headTrail) {
      let count = 0;
      while (count < headTimes.length && headTimes[count] <= frame.time) count++;
      headTrail.geometry.setDrawRange(0, Math.max(0, count));
    }

    pathLine.visible = flags.path;

    ribbon.visible = flags.ribbon;
    ribbonFaint.visible = flags.ribbon;
    if (flags.ribbon) {
      let count = 0;
      while (count < ribbonTimes.length && ribbonTimes[count] <= frame.time) count++;
      ribbon.geometry.setDrawRange(0, Math.max(0, (count - 1) * 6));
    }

    // ghosts spread from the start of the set to now
    const start = baked.timeline.setStart;
    const showGhosts = flags.ghosts && frame.time > start + 0.05;
    for (let i = 0; i < ghosts.length; i++) {
      const g = ghosts[i];
      if (!showGhosts) { g.group.visible = false; continue; }
      const gt = start + (frame.time - start) * ((i + 1) / (ghosts.length + 1));
      baked.sampleAt(gt, scratch);
      poseGhost(g, scratch);
      const fade = (i + 1) / (ghosts.length + 1);
      g.group.traverse((child) => {
        if (child instanceof THREE.Mesh) (child.material as THREE.MeshPhongMaterial).opacity = GHOST_OPACITY + fade * 0.07;
      });
    }
  }

  function dispose(): void {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m.dispose();
      }
    });
  }

  return { group, ghosts, rebuild, update, dispose };
}
