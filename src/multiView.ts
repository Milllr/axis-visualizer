import * as THREE from 'three';
import type { PanelScene } from './scene';

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// each panel cell has a controls column on the left, the 3d view fills the rest
export const SIDEBAR_WIDTH = 224;

export function gridShape(panelCount: number): { cols: number; rows: number } {
  const cols = panelCount <= 1 ? 1 : 2;
  return { cols, rows: Math.max(1, Math.ceil(panelCount / cols)) };
}

// computes viewport rectangles for N panels in a grid layout, css pixels
export function computeViewports(
  panelCount: number,
  canvasWidth: number,
  canvasHeight: number,
  sidebar = SIDEBAR_WIDTH,
): ViewportRect[] {
  if (panelCount <= 0) return [];

  const { cols, rows } = gridShape(panelCount);
  const cellW = Math.floor(canvasWidth / cols);
  const cellH = Math.floor(canvasHeight / rows);

  const rects: ViewportRect[] = [];
  for (let i = 0; i < panelCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // webgl viewport origin is bottom-left, DOM is top-left
    rects.push({
      x: col * cellW + sidebar,
      y: canvasHeight - (row + 1) * cellH,
      width: Math.max(1, cellW - sidebar),
      height: cellH,
    });
  }
  return rects;
}

export function renderPanels(
  renderer: THREE.WebGLRenderer,
  panels: PanelScene[],
  viewports: ViewportRect[],
): void {
  renderer.setScissorTest(true);
  renderer.setClearColor(0x111111);
  renderer.clear();

  for (let i = 0; i < panels.length; i++) {
    const vp = viewports[i];
    if (!vp) continue;
    const { scene, camera, controls } = panels[i];

    camera.aspect = vp.width / vp.height;
    camera.updateProjectionMatrix();
    controls.update();

    renderer.setViewport(vp.x, vp.y, vp.width, vp.height);
    renderer.setScissor(vp.x, vp.y, vp.width, vp.height);
    renderer.render(scene, camera);
  }

  renderer.setScissorTest(false);
}
