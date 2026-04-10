import { TRICK_DEFINITIONS, TRICK_KEYS, type TrickDefinition } from './tricks';

export interface PanelConfig {
  trickKey: string;
  rotationDeg: number;
  isSwitch: boolean;
  side: number; // 1 = left, -1 = right
}

export interface PanelUI {
  container: HTMLDivElement;
  trickSelect: HTMLSelectElement;
  rotationSelect: HTMLSelectElement;
  switchCheckbox: HTMLInputElement;
  sideRow: HTMLDivElement;
  sideLeftRadio: HTMLInputElement;
  sideRightRadio: HTMLInputElement;
  removeBtn: HTMLButtonElement;
  config: PanelConfig;
  onChange: () => void;
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

function populateRotationSelect(select: HTMLSelectElement, trick: TrickDefinition): void {
  const prev = select.value;
  select.innerHTML = '';
  for (const deg of trick.rotations) {
    const label = trick.useMultiples
      ? `${deg / 360}x`
      : `${deg}°`;
    const opt = el('option', { value: String(deg) }, label);
    select.appendChild(opt);
  }
  if (trick.rotations.includes(Number(prev))) {
    select.value = prev;
  }
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

  // trick selector
  const trickRow = el('div', { class: 'control-row' });
  const trickLabel = el('label', {}, 'trick');
  const trickSelect = el('select', { class: 'trick-select' });
  for (const key of TRICK_KEYS) {
    const trick = TRICK_DEFINITIONS[key];
    const opt = el('option', { value: key }, trick.name);
    trickSelect.appendChild(opt);
  }
  trickRow.appendChild(trickLabel);
  trickRow.appendChild(trickSelect);
  container.appendChild(trickRow);

  // rotation selector
  const rotRow = el('div', { class: 'control-row' });
  const rotLabel = el('label', {}, 'rotation');
  const rotationSelect = el('select', { class: 'rotation-select' });
  populateRotationSelect(rotationSelect, TRICK_DEFINITIONS[TRICK_KEYS[0]]);
  rotRow.appendChild(rotLabel);
  rotRow.appendChild(rotationSelect);
  container.appendChild(rotRow);

  // switch checkbox
  const switchRow = el('div', { class: 'control-row' });
  const switchLabel = el('label', {}, 'switch');
  const switchCheckbox = document.createElement('input');
  switchCheckbox.type = 'checkbox';
  switchCheckbox.className = 'switch-check';
  switchRow.appendChild(switchLabel);
  switchRow.appendChild(switchCheckbox);
  container.appendChild(switchRow);

  // left/right side toggle
  const radioName = `side-${panelIndex}-${Date.now()}`;
  const sideRow = el('div', { class: 'control-row side-row' });
  const sideLabel = el('label', {}, 'side');

  const sideLeftRadio = document.createElement('input');
  sideLeftRadio.type = 'radio';
  sideLeftRadio.name = radioName;
  sideLeftRadio.value = 'left';
  sideLeftRadio.checked = true;
  sideLeftRadio.className = 'side-radio';
  const leftLabel = el('label', { class: 'side-label' }, 'L');

  const sideRightRadio = document.createElement('input');
  sideRightRadio.type = 'radio';
  sideRightRadio.name = radioName;
  sideRightRadio.value = 'right';
  sideRightRadio.className = 'side-radio';
  const rightLabel = el('label', { class: 'side-label' }, 'R');

  sideRow.appendChild(sideLabel);
  sideRow.appendChild(sideLeftRadio);
  sideRow.appendChild(leftLabel);
  sideRow.appendChild(sideRightRadio);
  sideRow.appendChild(rightLabel);
  container.appendChild(sideRow);

  // show/hide side row based on trick
  const updateSideVisibility = () => {
    const trick = TRICK_DEFINITIONS[trickSelect.value];
    sideRow.style.display = trick.hasSide ? 'flex' : 'none';
  };
  updateSideVisibility();

  // trick description
  const descEl = el('div', { class: 'trick-desc' });
  descEl.textContent = TRICK_DEFINITIONS[TRICK_KEYS[0]].description;
  container.appendChild(descEl);

  const config: PanelConfig = {
    trickKey: TRICK_KEYS[0],
    rotationDeg: TRICK_DEFINITIONS[TRICK_KEYS[0]].rotations[0],
    isSwitch: false,
    side: 1,
  };

  const fireChange = () => {
    config.trickKey = trickSelect.value;
    config.rotationDeg = Number(rotationSelect.value);
    config.isSwitch = switchCheckbox.checked;
    config.side = sideLeftRadio.checked ? 1 : -1;
    descEl.textContent = TRICK_DEFINITIONS[config.trickKey].description;
    onChange(config);
  };

  trickSelect.addEventListener('change', () => {
    populateRotationSelect(rotationSelect, TRICK_DEFINITIONS[trickSelect.value]);
    updateSideVisibility();
    fireChange();
  });
  rotationSelect.addEventListener('change', fireChange);
  switchCheckbox.addEventListener('change', fireChange);
  sideLeftRadio.addEventListener('change', fireChange);
  sideRightRadio.addEventListener('change', fireChange);

  return {
    container,
    trickSelect,
    rotationSelect,
    switchCheckbox,
    sideRow,
    sideLeftRadio,
    sideRightRadio,
    removeBtn,
    config,
    onChange: fireChange,
  };
}

export interface PlaybackUI {
  container: HTMLDivElement;
  playBtn: HTMLButtonElement;
  scrubber: HTMLInputElement;
  speedSelect: HTMLSelectElement;
  addPanelBtn: HTMLButtonElement;
  ghostToggle: HTMLInputElement;
}

export function createPlaybackUI(
  onPlay: () => void,
  onScrub: (t: number) => void,
  onSpeedChange: (speed: number) => void,
  onAddPanel: () => void,
  onGhostToggle: (on: boolean) => void,
): PlaybackUI {
  const container = el('div', { id: 'playback-bar' });

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
  scrubber.addEventListener('input', () => {
    onScrub(Number(scrubber.value) / 1000);
  });
  container.appendChild(scrubber);

  const speedLabel = el('label', { class: 'speed-label' }, 'speed');
  const speedSelect = el('select', { class: 'speed-select' });
  for (const s of [0.25, 0.5, 1, 1.5, 2]) {
    const opt = el('option', { value: String(s) }, `${s}x`);
    if (s === 1) opt.selected = true;
    speedSelect.appendChild(opt);
  }
  speedSelect.addEventListener('change', () => onSpeedChange(Number(speedSelect.value)));
  container.appendChild(speedLabel);
  container.appendChild(speedSelect);

  const ghostLabel = el('label', { class: 'ghost-label' }, 'ghosts');
  const ghostToggle = document.createElement('input');
  ghostToggle.type = 'checkbox';
  ghostToggle.checked = true;
  ghostToggle.className = 'ghost-check';
  ghostToggle.addEventListener('change', () => onGhostToggle(ghostToggle.checked));
  container.appendChild(ghostLabel);
  container.appendChild(ghostToggle);

  return { container, playBtn, scrubber, speedSelect, addPanelBtn, ghostToggle };
}
