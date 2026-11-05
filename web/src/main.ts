import './style.css';
import { FOOD_PER_CLICK, HEIGHT, MAX_POPULATION, STEP, WIDTH, World } from './simulation/world';
import { Renderer } from './rendering/canvas';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main>
    <div class="controls" aria-label="Simulation controls">
      <button id="pause" aria-label="Pause simulation">Pause</button>
      <button id="reset">New colony</button>
      <button id="new-map">New map</button>
      <label>Speed <select id="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
      <label><input id="trails" type="checkbox" checked /> Trails</label>
      <label title="Toggle energy use, fatigue, and recovery time."><input id="energy-cost" type="checkbox" checked /> Energy</label>
      <div class="stats" aria-label="Colony statistics">
        <span>Ants: <output id="population">48</output></span>
        <span>Food: <output id="reserve">36.0</output></span>
        <span>Delivered: <output id="delivered">0</output></span>
        <span title="Average ant energy. Longer trips require more rest at the nest.">Energy: <output id="energy">100%</output></span>
        <span id="session-status" role="status">Exploring</span>
        <span id="clock">00:00</span>
      </div>
    </div>
    <details class="settings">
      <summary>Settings</summary>
      <div class="settings-inputs">
        <label>Trail half-life <input id="evaporation" type="range" min="5" max="60" value="22" /> <output id="evaporation-label">22 s</output></label>
        <label>Starting ants <input id="initial-population" type="range" min="12" max="120" step="4" value="48" /> <output id="initial-label">48</output></label>
        <label>Map seed <input id="seed" type="number" min="0" max="4294967295" step="1" value="1847" required /></label>
        <span>Starting ants and seed apply to a new colony. Limit: ${MAX_POPULATION} ants.</span>
      </div>
    </details>
    <div class="canvas-wrap">
      <canvas id="world" tabindex="0" role="img" aria-label="Ant simulation. Click or tap to add food. Use arrow keys to move the food cursor, then Enter or Space to add food."></canvas>
    </div>
    <div class="status-line">
      <span id="world-message" aria-live="polite">Click to add food (+${FOOD_PER_CLICK}).</span>
      <span>Teal: colony (nest, ants, trails) · Green: food / carried food · Brown: obstacle · Darker trails = stronger</span>
    </div>
  </main>
  <dialog id="reset-dialog"><form method="dialog">
    <p id="reset-message">Start a new colony? This clears all ants, food, and trails.</p>
    <div class="dialog-actions"><button value="cancel">Cancel</button><button id="confirm-reset" value="reset">New colony</button></div>
  </form></dialog>
`;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>('world');
const renderer = new Renderer(canvas);
let world = new World();
let paused = false;
let speed = 1;
let accumulator = 0;
let previousTime = 0;
let previousUI = 0;
let messageUntil = 0;
let pausedBeforeReset = false;
let generateNewMap = false;
const trails = element<HTMLInputElement>('trails');
const pauseButton = element<HTMLButtonElement>('pause');
const resetDialog = element<HTMLDialogElement>('reset-dialog');
const seedInput = element<HTMLInputElement>('seed');
const initialInput = element<HTMLInputElement>('initial-population');
const evaporation = element<HTMLInputElement>('evaporation');
const energyCost = element<HTMLInputElement>('energy-cost');
const cursor = { x: WIDTH * 0.7, y: HEIGHT * 0.5 };

function setPause(value: boolean): void {
  paused = value;
  accumulator = 0;
  pauseButton.textContent = paused ? 'Resume' : 'Pause';
  pauseButton.setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation');
}
pauseButton.addEventListener('click', () => setPause(!paused));
element<HTMLSelectElement>('speed').addEventListener('change', event => {
  speed = Number((event.target as HTMLSelectElement).value);
});
evaporation.addEventListener('input', () => {
  world.halfLife = Number(evaporation.value);
  element('evaporation-label').textContent = `${evaporation.value} s`;
});
initialInput.addEventListener('input', () => { element('initial-label').textContent = initialInput.value; });
energyCost.addEventListener('change', () => { world.energyEnabled = energyCost.checked; updateUI(); });

function startNewColony(): void {
  if (!seedInput.reportValidity()) return;
  world = new World(Number(seedInput.value), Number(initialInput.value));
  world.halfLife = Number(evaporation.value);
  world.energyEnabled = energyCost.checked;
  setPause(false);
  accumulator = 0;
  element('world-message').textContent = `Click to add food (+${FOOD_PER_CLICK}).`;
  messageUntil = 0;
  updateUI();
}
function requestReset(newMap: boolean): void {
  pausedBeforeReset = paused;
  generateNewMap = newMap;
  setPause(true);
  element('reset-message').textContent = newMap
    ? 'Generate a new map? This starts a new colony and clears all ants, food, and trails.'
    : 'Start a new colony on this seed? This clears all ants, food, and trails.';
  element('confirm-reset').textContent = newMap ? 'New map' : 'New colony';
  resetDialog.returnValue = '';
  resetDialog.showModal();
}
element('reset').addEventListener('click', () => requestReset(false));
element('new-map').addEventListener('click', () => requestReset(true));
resetDialog.addEventListener('close', () => {
  if (resetDialog.returnValue === 'reset') {
    if (generateNewMap) {
      let seed = crypto.getRandomValues(new Uint32Array(1))[0];
      if (seed === world.seed) seed = (seed + 1) >>> 0;
      seedInput.value = String(seed);
    }
    startNewColony();
  }
  else setPause(pausedBeforeReset);
});

function announce(message: string): void {
  element('world-message').textContent = message;
  messageUntil = performance.now() + 4500;
}
function placeFood(x: number, y: number): void {
  if (x < 0 || x > WIDTH || y < 0 || y > HEIGHT) return;
  if (world.addFood(x, y)) {
    announce(world.extinct ? 'Colony extinct. Food cannot revive it.' : `Added ${FOOD_PER_CLICK} food.`);
  } else announce('Place food in open space, away from obstacles and the nest. Maximum 128 patches.');
}
canvas.addEventListener('pointermove', event => {
  if (event.pointerType !== 'touch') renderer.pointer = renderer.coordinates(event.clientX, event.clientY);
});
canvas.addEventListener('pointerleave', () => { renderer.pointer = null; });
canvas.addEventListener('click', event => {
  const point = renderer.coordinates(event.clientX, event.clientY);
  if (!point) return;
  Object.assign(cursor, point);
  placeFood(point.x, point.y);
});
canvas.addEventListener('keydown', event => {
  const moves: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
  if (moves[event.key]) {
    event.preventDefault();
    const [dx, dy] = moves[event.key];
    cursor.x = Math.max(20, Math.min(WIDTH - 20, cursor.x + dx));
    cursor.y = Math.max(20, Math.min(HEIGHT - 20, cursor.y + dy));
    renderer.pointer = { ...cursor };
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault(); placeFood(cursor.x, cursor.y);
  }
});
canvas.addEventListener('focus', () => { renderer.pointer = { ...cursor }; });
canvas.addEventListener('blur', () => { renderer.pointer = null; });

function updateUI(): void {
  element('population').textContent = String(world.ants.length);
  element('reserve').textContent = world.reserve.toFixed(1);
  element('delivered').textContent = String(world.delivered);
  const meanEnergy = world.ants.length ? world.ants.reduce((sum, ant) => sum + ant.energy, 0) / world.ants.length : 0;
  element('energy').textContent = world.energyEnabled ? `${Math.round(meanEnergy)}%` : 'off';
  element('session-status').textContent = world.status[0].toUpperCase() + world.status.slice(1);
  element('session-status').dataset.status = world.status;
  if (world.extinct) element('world-message').textContent = 'Colony extinct. Use New colony to start again.';
  const seconds = Math.floor(world.elapsed);
  element('clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function frame(time: number): void {
  const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.12) : 0;
  previousTime = time;
  // No catch-up on hidden tabs; a colony only progresses while being watched.
  if (!paused && !document.hidden) {
    accumulator += delta * speed;
    let steps = 0;
    while (accumulator >= STEP && steps < 16) {
      world.step(); accumulator -= STEP; steps++;
    }
  }
  renderer.draw(world, trails.checked);
  if (time - previousUI > 150) { updateUI(); previousUI = time; }
  if (messageUntil && time > messageUntil) {
    element('world-message').textContent = `Click to add food (+${FOOD_PER_CLICK}).`;
    messageUntil = 0;
  }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { previousTime = 0; accumulator = 0; });
updateUI();
requestAnimationFrame(frame);
