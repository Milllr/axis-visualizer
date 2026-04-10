import * as THREE from 'three';
import { TRICK_DEFINITIONS } from './tricks';
import { createStickFigure } from './stickFigure';
import {
  createAnimationState,
  getArcPosition,
  getRotationQuaternion,
  stepAnimation,
} from './animation';
import { createAxisArrow, updateAxisArrow, createGhostTrail, updateGhostTrail, type GhostTrail } from './axisVisualizer';
import { createPanelScene, type PanelScene } from './scene';
import { computeViewports, renderPanels } from './multiView';
import { createPanelUI, createPlaybackUI, type PanelUI, type PanelConfig } from './ui';

interface Panel {
  panelScene: PanelScene;
  figure: THREE.Group;
  axisArrow: THREE.ArrowHelper;
  ghostTrail: GhostTrail;
  animState: ReturnType<typeof createAnimationState>;
  ui: PanelUI;
}

const MAX_PANELS = 4;
const panels: Panel[] = [];
let globalPlaying = false;
let globalSpeed = 1;
let showGhosts = true;

const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
const panelsUiContainer = document.getElementById('panels-ui') as HTMLDivElement;
const playbackBarContainer = document.getElementById('playback-bar') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x111111);

function resizeCanvas(): void {
  const parent = canvas.parentElement!;
  const w = parent.clientWidth;
  const h = parent.clientHeight;
  renderer.setSize(w, h);
}

// scope orbit controls to the viewport region the mouse is hovering over
let activeControlsPanel: Panel | null = null;

canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const vps = computeViewports(panels.length, canvas.clientWidth, canvas.clientHeight);

  panels.forEach(p => { p.panelScene.controls.enabled = false; });

  for (let i = 0; i < panels.length; i++) {
    const vp = vps[i];
    if (!vp) continue;
    const domLeft = vp.x / (canvas.width / canvas.clientWidth);
    const domTop = (canvas.height - vp.y - vp.height) / (canvas.height / canvas.clientHeight);
    const domW = vp.width / (canvas.width / canvas.clientWidth);
    const domH = vp.height / (canvas.height / canvas.clientHeight);

    if (mx >= domLeft && mx <= domLeft + domW && my >= domTop && my <= domTop + domH) {
      panels[i].panelScene.controls.enabled = true;
      activeControlsPanel = panels[i];
      break;
    }
  }
});

canvas.addEventListener('pointerup', () => {
  activeControlsPanel = null;
});

// --- panel management ---

function findPanelIndex(panel: Panel): number {
  return panels.indexOf(panel);
}

function addPanel(): void {
  if (panels.length >= MAX_PANELS) return;

  const defaultTrick = 'spin';
  const trick = TRICK_DEFINITIONS[defaultTrick];
  const defaultRot = trick.rotations[0];

  const panelScene = createPanelScene(canvas);
  const figure = createStickFigure();
  panelScene.scene.add(figure);

  const axisArrow = createAxisArrow(defaultTrick);
  panelScene.scene.add(axisArrow);

  const ghostTrail = createGhostTrail(createStickFigure);
  for (const g of ghostTrail.ghosts) {
    panelScene.scene.add(g);
  }

  const animState = createAnimationState(defaultTrick, trick, defaultRot, false, 1);

  const panelIndex = panels.length;
  const panelRef: Panel = { panelScene, figure, axisArrow, ghostTrail, animState, ui: null! };

  const ui = createPanelUI(
    panelIndex,
    (config: PanelConfig) => {
      const idx = findPanelIndex(panelRef);
      if (idx >= 0) onPanelConfigChange(idx, config);
    },
    () => {
      const idx = findPanelIndex(panelRef);
      if (idx >= 0) removePanel(idx);
    },
  );

  panelRef.ui = ui;
  panelsUiContainer.appendChild(ui.container);

  panels.push(panelRef);
  if (globalPlaying) panelRef.animState.playing = true;
  panelRef.animState.speed = globalSpeed;
  updateViewports();
}

function removePanel(index: number): void {
  if (panels.length <= 1) return;
  const panel = panels[index];
  panel.ui.container.remove();

  panel.panelScene.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  });
  panel.panelScene.controls.dispose();

  panels.splice(index, 1);

  panels.forEach((p, i) => {
    const label = p.ui.container.querySelector('.panel-label');
    if (label) label.textContent = `#${i + 1}`;
  });

  updateViewports();
}

function onPanelConfigChange(index: number, config: PanelConfig): void {
  const panel = panels[index];
  if (!panel) return;

  const trick = TRICK_DEFINITIONS[config.trickKey];
  panel.animState.trickKey = config.trickKey;
  panel.animState.trick = trick;
  panel.animState.rotationDeg = config.rotationDeg;
  panel.animState.isSwitch = config.isSwitch;
  panel.animState.side = config.side;
  panel.animState.t = 0;

  updateAxisArrow(panel.axisArrow, config.trickKey);
}

function updateViewports(): void {
  resizeCanvas();
  const vps = computeViewports(panels.length, canvas.width, canvas.height);

  panels.forEach((p, i) => {
    const vp = vps[i];
    if (!vp) return;
    p.panelScene.camera.aspect = vp.width / vp.height;
    p.panelScene.camera.updateProjectionMatrix();
  });
}

// --- playback ---

const playbackUI = createPlaybackUI(
  () => {
    globalPlaying = !globalPlaying;
    playbackUI.playBtn.textContent = globalPlaying ? '⏸ pause' : '▶ play';
    playbackUI.playBtn.classList.toggle('playing', globalPlaying);
    panels.forEach(p => { p.animState.playing = globalPlaying; });
  },
  (t: number) => {
    panels.forEach(p => { p.animState.t = t; });
  },
  (speed: number) => {
    globalSpeed = speed;
    panels.forEach(p => { p.animState.speed = speed; });
  },
  () => addPanel(),
  (on: boolean) => { showGhosts = on; },
);

playbackBarContainer.innerHTML = '';
playbackBarContainer.appendChild(playbackUI.container);
while (playbackUI.container.firstChild) {
  playbackBarContainer.appendChild(playbackUI.container.firstChild);
}
playbackUI.container.remove();

// --- render loop ---

let prevTime = performance.now();

function animate(): void {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - prevTime) / 1000, 0.1);
  prevTime = now;

  for (const panel of panels) {
    stepAnimation(panel.animState, dt);

    const { t, trickKey, rotationDeg, isSwitch, trick, side } = panel.animState;

    panel.figure.position.copy(getArcPosition(t));

    const quat = getRotationQuaternion(trickKey, rotationDeg, isSwitch, t, trick.direction, side);
    panel.figure.quaternion.copy(quat);

    panel.axisArrow.position.copy(panel.figure.position);

    updateGhostTrail(
      panel.ghostTrail,
      t,
      (gt) => getArcPosition(gt),
      (gt) => getRotationQuaternion(trickKey, rotationDeg, isSwitch, gt, trick.direction, side),
      showGhosts,
    );
  }

  if (panels.length > 0) {
    playbackUI.scrubber.value = String(Math.round(panels[0].animState.t * 1000));
  }

  const vps = computeViewports(panels.length, canvas.width, canvas.height);
  const panelScenes = panels.map(p => p.panelScene);
  renderPanels(renderer, panelScenes, vps);
}

// --- init ---

window.addEventListener('resize', updateViewports);

addPanel();
animate();
