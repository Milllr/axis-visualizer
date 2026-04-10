import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export interface PanelScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

export function createPanelScene(canvas: HTMLCanvasElement): PanelScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(4, 3, 4);
  camera.lookAt(0, 1.5, 0);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.update();

  // lighting - soft ambient + directional for depth
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 8, 5);
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
  fillLight.position.set(-3, 2, -3);
  scene.add(fillLight);

  // ground grid for orientation reference
  const grid = new THREE.GridHelper(12, 24, 0x333333, 0x222222);
  scene.add(grid);

  // subtle ground plane (semi-transparent)
  const groundGeom = new THREE.PlaneGeometry(12, 12);
  const groundMat = new THREE.MeshPhongMaterial({
    color: 0x111111,
    transparent: true,
    opacity: 0.3,
  });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);

  // jump arc trajectory line for reference
  const arcPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const z = THREE.MathUtils.lerp(-2, 2, t);
    const y = 4 * 2.5 * t * (1 - t);
    arcPoints.push(new THREE.Vector3(0, y, z));
  }
  const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPoints);
  const arcLine = new THREE.Line(
    arcGeom,
    new THREE.LineDashedMaterial({
      color: 0x444444,
      dashSize: 0.1,
      gapSize: 0.05,
    }),
  );
  arcLine.computeLineDistances();
  scene.add(arcLine);

  return { scene, camera, controls };
}
