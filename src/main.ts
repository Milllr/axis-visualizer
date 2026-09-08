import * as THREE from 'three';
import { createFigure, applyPose, SEG } from './figure';
import type { Figure } from './figure';
import { createPanelScene } from './scene';
import type { PanelScene } from './scene';
import { computeViewports, renderPanels } from './multiView';
import { createPanelUI, createPlaybackUI } from './ui';
import type { PanelUI, PanelConfig } from './ui';
import { bake, createBakedFrame } from './bake';
import type { Baked, BakedFrame } from './bake';
import { createOverlays, DEFAULT_FLAGS } from './overlays';
import type { Overlays, OverlayFlags } from './overlays';

interface Panel {
  panelScene: PanelScene;
  figure: Figure;
  overlays: Overlays;
  baked: Baked;
  frame: BakedFrame;
  ui: PanelUI;
}

const MAX_PANELS = 4;
const panels: Panel[] = [];
let globalPlaying = false;
let globalSpeed = 0.5;
let globalT = 0; // 0 to 1 over each panel's timeline
let follow = true;
const flags: OverlayFlags = { ...DEFAULT_FLAGS };

const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
const panelsUiContainer = document.getElementById('panels-ui') as HTMLDivElement;
const playbackBarContainer = document.getElementById('playback-bar') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x111111);

function resizeCanvas(): void {
  const parent = canvas.parentElement!;
  renderer.setSize(parent.clientWidth, parent.clientHeight);
}

// scope orbit controls to the viewport under the pointer
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const vps = computeViewports(panels.length, canvas.clientWidth, canvas.clientHeight);
  panels.forEach((p) => { p.panelScene.controls.enabled = false; });
  for (let i = 0; i < panels.length; i++) {
    const vp = vps[i];
    if (!vp) continue;
    const scale = canvas.width / canvas.clientWidth;
    const domLeft = vp.x / scale;
    const domTop = (canvas.height - vp.y - vp.height) / scale;
    const domW = vp.width / scale;
    const domH = vp.height / scale;
    if (mx >= domLeft && mx <= domLeft + domW && my >= domTop && my <= domTop + domH) {
      panels[i].panelScene.controls.enabled = true;
      break;
    }
  }
});

function configToBake(config: PanelConfig) {
  return {
    trickKey: config.trickKey,
    rotationDeg: config.rotationDeg,
    inversions: config.inversions,
    spinDir: config.side,
    isSwitch: config.isSwitch,
    model: config.model,
    mode: config.mode,
    grab: config.grab,
  };
}

function rebuildPanel(panel: Panel, config: PanelConfig): void {
  panel.baked = bake(configToBake(config));
  panel.figure.setSkis(config.mode === 'skis');
  panel.panelScene.setMode(config.mode);
  panel.overlays.rebuild(panel.baked);
  panel.ui.setSummary(panel.baked.summary);
  panel.baked.sampleAt(globalT * panel.baked.duration, panel.frame);
  panel.panelScene.follow(panel.frame.pivotPos, true);
}

function addPanel(): void {
  if (panels.length >= MAX_PANELS) return;

  const panelScene = createPanelScene(canvas);
  const figure = createFigure(true);
  panelScene.scene.add(figure.group);
  const overlays = createOverlays();
  panelScene.scene.add(overlays.group);

  const panelRef: Panel = {
    panelScene,
    figure,
    overlays,
    baked: null!,
    frame: createBakedFrame(),
    ui: null!,
  };

  const ui = createPanelUI(
    panels.length,
    (config: PanelConfig) => rebuildPanel(panelRef, config),
    () => {
      const idx = panels.indexOf(panelRef);
      if (idx >= 0) removePanel(idx);
    },
  );
  panelRef.ui = ui;
  panelsUiContainer.appendChild(ui.container);
  panels.push(panelRef);

  rebuildPanel(panelRef, ui.config);
  // start the view a little behind and to the side of the skier
  panelScene.camera.position.copy(panelRef.frame.pivotPos).add(new THREE.Vector3(6.5, 2.5, -3.5));
  panelScene.controls.target.copy(panelRef.frame.pivotPos);
  panelScene.controls.update();
  updateViewports();
}

function removePanel(index: number): void {
  if (panels.length <= 1) return;
  const panel = panels[index];
  panel.ui.container.remove();
  panel.overlays.dispose();
  panel.panelScene.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
  panel.panelScene.controls.dispose();
  panels.splice(index, 1);
  panels.forEach((p, i) => p.ui.setLabel(`#${i + 1}`));
  updateViewports();
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

// ── playback ──

const playbackUI = createPlaybackUI(
  () => {
    globalPlaying = !globalPlaying;
    playbackUI.playBtn.textContent = globalPlaying ? '⏸ pause' : '▶ play';
    playbackUI.playBtn.classList.toggle('playing', globalPlaying);
  },
  (t: number) => { globalT = t; },
  (speed: number) => { globalSpeed = speed; },
  () => addPanel(),
  (flag, on) => { flags[flag] = on; },
  (on) => { follow = on; },
  flags,
);
playbackBarContainer.innerHTML = '';
while (playbackUI.container.firstChild) playbackBarContainer.appendChild(playbackUI.container.firstChild);

// ── render loop ──

let prevTime = performance.now();
const _offset = new THREE.Vector3();

function animate(): void {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - prevTime) / 1000, 0.1);
  prevTime = now;

  if (globalPlaying && panels.length > 0) {
    const duration = panels[0].baked.duration;
    globalT += (dt * globalSpeed) / duration;
    if (globalT >= 1) globalT = 0;
  }

  for (const panel of panels) {
    const { baked, frame, figure } = panel;
    baked.sampleAt(globalT * baked.duration, frame);

    applyPose(figure, frame.joints);
    figure.joints.hip.position.y = SEG.hipHeight - frame.hipDrop;
    _offset.copy(frame.comLocal).multiplyScalar(-1).applyQuaternion(frame.quat);
    figure.group.position.copy(frame.pivotPos).add(_offset);
    figure.group.quaternion.copy(frame.quat);

    panel.overlays.update(baked, frame, flags);
    panel.panelScene.setBedDepth(baked.config.mode === 'trampoline' ? frame.bedDepth : 0);
    if (follow) panel.panelScene.follow(frame.pivotPos);
    panel.ui.updateReadout(frame);
  }

  if (panels.length > 0) {
    playbackUI.scrubber.value = String(Math.round(globalT * 1000));
    playbackUI.timeLabel.textContent = `${(globalT * panels[0].baked.duration).toFixed(2)}s`;
  }

  const vps = computeViewports(panels.length, canvas.width, canvas.height);
  renderPanels(renderer, panels.map((p) => p.panelScene), vps);
}

window.addEventListener('resize', updateViewports);

addPanel();
animate();
