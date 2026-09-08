import { TRICK_DEFINITIONS, TRICK_KEYS } from './tricks';
import type { TrickDefinition } from './tricks';
import { GRAB_TYPES, GRAB_NAMES } from './pose';
import type { GrabType } from './pose';
import type { AxisModel } from './rotation';
import type { SceneMode } from './timeline';
import type { BakedFrame, BakeSummary } from './bake';
import type { OverlayFlags } from './overlays';

export interface PanelConfig {
  trickKey: string;
  rotationDeg: number;
  inversions: number;
  isSwitch: boolean;
  side: number; // 1 = left, -1 = right
  grab: GrabType;
  model: AxisModel;
  mode: SceneMode;
}

export interface PanelUI {
  container: HTMLDivElement;
  config: PanelConfig;
  setSummary(summary: BakeSummary): void;
  updateReadout(frame: BakedFrame): void;
  setLabel(text: string): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  if (text) e.textContent = text;
  return e;
}

function row(labelText: string, control: HTMLElement, cls = ''): HTMLDivElement {
  const r = el('div', { class: `control-row ${cls}`.trim() });
  r.appendChild(el('label', {}, labelText));
  r.appendChild(control);
  return r;
}

function populateRotation(select: HTMLSelectElement, trick: TrickDefinition): void {
  const prev = select.value;
  select.innerHTML = '';
  for (const deg of trick.rotations) {
    const label = trick.useMultiples ? `${deg / 360}x` : `${deg}°`;
    select.appendChild(el('option', { value: String(deg) }, label));
  }
  if (trick.rotations.includes(Number(prev))) select.value = prev;
}

const INVERSION_NAMES = ['single', 'double', 'triple'];

function populateInversions(select: HTMLSelectElement, trick: TrickDefinition, rotationDeg: number): void {
  const prev = Number(select.value) || 1;
  select.innerHTML = '';
  const max = trick.hasInversions ? Math.max(1, Math.min(3, Math.floor(rotationDeg / 360))) : 1;
  for (let k = 1; k <= max; k++) {
    select.appendChild(el('option', { value: String(k) }, `${INVERSION_NAMES[k - 1]} (${k} dip${k > 1 ? 's' : ''})`));
  }
  select.value = String(Math.min(prev, max));
}

function fmt(v: number, digits = 0): string {
  return v.toFixed(digits);
}

export function createPanelUI(
  panelIndex: number,
  onChange: (config: PanelConfig) => void,
  onRemove: () => void,
): PanelUI {
  const container = el('div', { class: 'panel-controls' });

  const header = el('div', { class: 'panel-header' });
  const label = el('span', { class: 'panel-label' }, `#${panelIndex + 1}`);
  const removeBtn = el('button', { class: 'btn-remove' }, '×');
  removeBtn.addEventListener('click', onRemove);
  header.appendChild(label);
  header.appendChild(removeBtn);
  container.appendChild(header);

  const trickSelect = el('select', { class: 'trick-select' });
  for (const key of TRICK_KEYS) trickSelect.appendChild(el('option', { value: key }, TRICK_DEFINITIONS[key].name));
  container.appendChild(row('trick', trickSelect));

  const rotationSelect = el('select', { class: 'rotation-select' });
  populateRotation(rotationSelect, TRICK_DEFINITIONS[TRICK_KEYS[0]]);
  container.appendChild(row('rotation', rotationSelect));

  const inversionSelect = el('select', { class: 'inversion-select' });
  const inversionRow = row('corks', inversionSelect);
  container.appendChild(inversionRow);

  const switchCheckbox = document.createElement('input');
  switchCheckbox.type = 'checkbox';
  container.appendChild(row('switch', switchCheckbox));

  const radioName = `side-${panelIndex}-${Date.now()}`;
  const sideWrap = el('span', { class: 'side-wrap' });
  const sideLeftRadio = document.createElement('input');
  sideLeftRadio.type = 'radio'; sideLeftRadio.name = radioName; sideLeftRadio.value = 'left'; sideLeftRadio.checked = true; sideLeftRadio.className = 'side-radio';
  const sideRightRadio = document.createElement('input');
  sideRightRadio.type = 'radio'; sideRightRadio.name = radioName; sideRightRadio.value = 'right'; sideRightRadio.className = 'side-radio';
  sideWrap.appendChild(sideLeftRadio);
  sideWrap.appendChild(el('label', { class: 'side-label' }, 'L'));
  sideWrap.appendChild(sideRightRadio);
  sideWrap.appendChild(el('label', { class: 'side-label' }, 'R'));
  const sideRow = row('side', sideWrap, 'side-row');
  container.appendChild(sideRow);

  const grabSelect = el('select', { class: 'grab-select' });
  for (const g of GRAB_TYPES) grabSelect.appendChild(el('option', { value: g }, GRAB_NAMES[g]));
  container.appendChild(row('grab', grabSelect));

  const modelSelect = el('select', { class: 'model-select' });
  modelSelect.appendChild(el('option', { value: 'rigid' }, 'rigid body'));
  modelSelect.appendChild(el('option', { value: 'snowbox' }, 'snowbox'));
  container.appendChild(row('axis', modelSelect));

  const modeSelect = el('select', { class: 'mode-select' });
  modeSelect.appendChild(el('option', { value: 'skis' }, 'skis'));
  modeSelect.appendChild(el('option', { value: 'trampoline' }, 'trampoline'));
  container.appendChild(row('scene', modeSelect));

  const descEl = el('div', { class: 'trick-desc' });
  container.appendChild(descEl);

  const summaryEl = el('div', { class: 'summary' });
  container.appendChild(summaryEl);

  const readoutEl = el('div', { class: 'readout' });
  container.appendChild(readoutEl);

  const config: PanelConfig = {
    trickKey: TRICK_KEYS[0],
    rotationDeg: TRICK_DEFINITIONS[TRICK_KEYS[0]].rotations[0],
    inversions: 1,
    isSwitch: false,
    side: 1,
    grab: 'none',
    model: 'rigid',
    mode: 'skis',
  };

  const refreshVisibility = () => {
    const trick = TRICK_DEFINITIONS[trickSelect.value];
    sideRow.style.display = trick.hasSide ? 'flex' : 'none';
    inversionRow.style.display = trick.hasInversions ? 'flex' : 'none';
    descEl.textContent = trick.description;
  };

  const fireChange = () => {
    config.trickKey = trickSelect.value;
    config.rotationDeg = Number(rotationSelect.value);
    config.inversions = Number(inversionSelect.value) || 1;
    config.isSwitch = switchCheckbox.checked;
    config.side = sideLeftRadio.checked ? 1 : -1;
    config.grab = grabSelect.value as GrabType;
    config.model = modelSelect.value as AxisModel;
    config.mode = modeSelect.value as SceneMode;
    refreshVisibility();
    onChange(config);
  };

  trickSelect.addEventListener('change', () => {
    const trick = TRICK_DEFINITIONS[trickSelect.value];
    populateRotation(rotationSelect, trick);
    populateInversions(inversionSelect, trick, Number(rotationSelect.value));
    fireChange();
  });
  rotationSelect.addEventListener('change', () => {
    populateInversions(inversionSelect, TRICK_DEFINITIONS[trickSelect.value], Number(rotationSelect.value));
    fireChange();
  });
  inversionSelect.addEventListener('change', fireChange);
  switchCheckbox.addEventListener('change', fireChange);
  sideLeftRadio.addEventListener('change', fireChange);
  sideRightRadio.addEventListener('change', fireChange);
  grabSelect.addEventListener('change', fireChange);
  modelSelect.addEventListener('change', fireChange);
  modeSelect.addEventListener('change', fireChange);

  populateInversions(inversionSelect, TRICK_DEFINITIONS[TRICK_KEYS[0]], config.rotationDeg);
  refreshVisibility();

  let lastPhase = '';
  return {
    container,
    config,
    setSummary(s: BakeSummary) {
      const split = s.precessionDeg > 0 && s.twistDeg > 0
        ? `${fmt(s.precessionDeg)}° precession + ${fmt(s.twistDeg)}° twist`
        : s.precessionDeg > 0 ? `${fmt(s.precessionDeg)}° precession` : `${fmt(s.twistDeg)}° twist`;
      summaryEl.innerHTML = '';
      const lines = [
        `${s.modelLabel}, L tilt ${fmt(s.axisTiltDeg)}°`,
        `rotational degrees ${fmt(s.rotationalDeg)} vs ${fmt(s.nominalDeg)} nominal (${s.shortcutDeg >= 0 ? 'shortcut' : 'detour'} ${fmt(Math.abs(s.shortcutDeg))}°)`,
        split,
        `speed weighted tilt ${fmt(s.weightedTiltDeg)}°, peak ${fmt(s.peakOmegaDeg)}°/s`,
        `air ${s.airtime.toFixed(2)}s, inertia ${s.inertiaExtended.toFixed(1)} → ${s.inertiaTucked.toFixed(1)} kg·m², landing pull ${fmt(s.landingCorrectionDeg)}°`,
      ];
      for (const l of lines) summaryEl.appendChild(el('div', {}, l));
    },
    updateReadout(f: BakedFrame) {
      const phase = f.segment === 'flight' ? f.phase : f.segment;
      const line1 = `${phase}  t ${f.airT.toFixed(2)}`;
      const line2 = `rot ${fmt(f.rotDegSoFar)}°  ω ${fmt(f.omegaDeg)}°/s  tilt ${fmt(f.tiltDeg)}°`;
      const line3 = `I ${f.inertia.toFixed(1)}  L ${f.momentum.toFixed(0)}  tuck ${f.tuck.toFixed(2)}`;
      const text = `${line1}\n${line2}\n${line3}`;
      if (text !== lastPhase) {
        readoutEl.textContent = text;
        lastPhase = text;
      }
    },
    setLabel(text: string) { label.textContent = text; },
  };
}

export interface PlaybackUI {
  container: HTMLDivElement;
  playBtn: HTMLButtonElement;
  scrubber: HTMLInputElement;
  speedSelect: HTMLSelectElement;
  addPanelBtn: HTMLButtonElement;
  followToggle: HTMLInputElement;
  flagToggles: Record<keyof OverlayFlags, HTMLInputElement>;
  timeLabel: HTMLSpanElement;
}

const FLAG_LABELS: Record<keyof OverlayFlags, string> = {
  ghosts: 'ghosts',
  momentum: 'L',
  omega: 'ω axis',
  disk: 'disk',
  bodyFrame: 'body',
  com: 'com',
  headTrail: 'head',
  ribbon: 'ribbon',
  path: 'path',
};

export function createPlaybackUI(
  onPlay: () => void,
  onScrub: (t: number) => void,
  onSpeedChange: (speed: number) => void,
  onAddPanel: () => void,
  onFlag: (flag: keyof OverlayFlags, on: boolean) => void,
  onFollow: (on: boolean) => void,
  flags: OverlayFlags,
): PlaybackUI {
  const container = el('div', { class: 'playback' });

  const addPanelBtn = el('button', { class: 'btn-add' }, '+ panel');
  addPanelBtn.addEventListener('click', onAddPanel);
  container.appendChild(addPanelBtn);

  const playBtn = el('button', { class: 'btn-play' }, '▶ play');
  playBtn.addEventListener('click', onPlay);
  container.appendChild(playBtn);

  const scrubber = document.createElement('input');
  scrubber.type = 'range';
  scrubber.min = '0';
  scrubber.max = '1000';
  scrubber.value = '0';
  scrubber.className = 'scrubber';
  scrubber.addEventListener('input', () => onScrub(Number(scrubber.value) / 1000));
  container.appendChild(scrubber);

  const timeLabel = el('span', { class: 'time-label' }, '0.00s');
  container.appendChild(timeLabel);

  container.appendChild(el('label', {}, 'speed'));
  const speedSelect = el('select', { class: 'speed-select' });
  for (const s of [0.1, 0.25, 0.5, 1, 1.5, 2]) {
    const opt = el('option', { value: String(s) }, `${s}x`);
    if (s === 0.5) opt.selected = true;
    speedSelect.appendChild(opt);
  }
  speedSelect.addEventListener('change', () => onSpeedChange(Number(speedSelect.value)));
  container.appendChild(speedSelect);

  const followToggle = document.createElement('input');
  followToggle.type = 'checkbox';
  followToggle.checked = true;
  followToggle.addEventListener('change', () => onFollow(followToggle.checked));
  container.appendChild(el('label', {}, 'follow'));
  container.appendChild(followToggle);

  const flagToggles = {} as Record<keyof OverlayFlags, HTMLInputElement>;
  const flagWrap = el('span', { class: 'flag-wrap' });
  for (const key of Object.keys(FLAG_LABELS) as (keyof OverlayFlags)[]) {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = flags[key];
    cb.addEventListener('change', () => onFlag(key, cb.checked));
    flagWrap.appendChild(el('label', {}, FLAG_LABELS[key]));
    flagWrap.appendChild(cb);
    flagToggles[key] = cb;
  }
  container.appendChild(flagWrap);

  return { container, playBtn, scrubber, speedSelect, addPanelBtn, followToggle, flagToggles, timeLabel };
}
