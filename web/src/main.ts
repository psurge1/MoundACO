import './style.css';
import { FOOD_PER_CLICK, HEIGHT, MAX_POPULATION, STEP, WIDTH, World } from './simulation/world';
import { Renderer } from './rendering/canvas';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shell">
    <header class="masthead">
      <a class="brand" href="./" aria-label="Ant Colonies home"><span class="brand-mark" aria-hidden="true">∴</span> ant colonies<span class="version">SANDBOX / 01</span></a>
      <span class="header-note"><span class="live-dot"></span> a little world, unfolding</span>
    </header>
    <section class="intro">
      <div><p class="eyebrow">A STUDY IN SMALL THINGS</p><h1>Let them find their way.</h1>
      <p class="subtitle">Leave a little food. Follow a trail. Watch a colony take shape.</p></div>
      <div class="session"><span class="eyebrow">YOUR LITTLE COLONY</span><span id="session-status" role="status">Exploring</span></div>
    </section>
    <section class="workspace" aria-label="Ant colony sandbox">
      <div class="world-panel">
        <div class="world-toolbar"><span class="world-title"><span class="live-dot"></span> THE CLEARING</span>
          <span id="clock" class="mono">00:00</span><button id="pause" class="small-button" aria-label="Pause simulation">Ⅱ <span>Pause</span></button>
        </div>
        <div class="canvas-wrap">
          <canvas id="world" tabindex="0" role="img" aria-label="Ant colony clearing. Click or tap to place food. With keyboard focus, use arrow keys to move the food cursor, then Enter or Space to place food."></canvas>
          <div id="world-message" class="world-message" aria-live="polite">Click anywhere in the clearing to leave food.</div>
          <div id="extinction" class="extinction" hidden><span class="eyebrow">A QUIET CLEARING</span><h2>This colony has come to an end.</h2><p>Food cannot bring it back. Start a new colony when you’re ready.</p><button id="restart-extinct" class="primary-button">Start a new colony ↗</button></div>
        </div>
        <div class="world-footer"><div class="legend"><span><i class="key ant-key"></i> worker</span><span><i class="key carrying-key"></i> carrying food</span><span><i class="key trail-key"></i> pheromone</span></div><span class="mono">ONE NEST · MANY PATHS</span></div>
      </div>
      <aside class="sidebar" aria-label="Colony controls">
        <section class="side-section"><p class="eyebrow">LIFE IN THE COLONY</p>
          <div class="population"><span id="population">48</span><span>ants <small id="population-change">making their way</small></span></div>
          <div class="stat-row"><span>Food in the nest</span><strong><span id="reserve">36.0</span> <small>units</small></strong></div>
          <div class="reserve-track"><div id="reserve-bar"></div></div>
          <p id="food-note" class="muted small">A little reserve for the journey ahead.</p>
          <div class="stat-row secondary"><span>Food brought home</span><strong id="delivered">0</strong></div>
        </section>
        <section class="side-section"><p class="eyebrow">LEND A LITTLE HAND</p>
          <button id="food-tool" class="food-tool" aria-pressed="true"><span class="food-icon" aria-hidden="true">⁙</span><span>Place food<small>Click the clearing · +${FOOD_PER_CLICK} units</small></span><span class="tool-check">✓</span></button>
          <p class="muted small">Food keeps them going. A surplus helps the colony grow; an empty nest slowly takes its toll.</p>
        </section>
        <section class="side-section controls"><p class="eyebrow">AT YOUR OWN PACE</p>
          <div class="control-label"><span>Simulation speed</span><span id="speed-label" class="mono">1×</span></div>
          <div class="speed-group" role="group" aria-label="Simulation speed"><button data-speed="0.5" aria-pressed="false">½×</button><button data-speed="1" aria-pressed="true">1×</button><button data-speed="2" aria-pressed="false">2×</button><button data-speed="4" aria-pressed="false">4×</button></div>
          <label class="toggle-row" for="trails"><span>Show pheromone trails</span><input id="trails" type="checkbox" checked /><span class="switch" aria-hidden="true"></span></label>
          <details><summary>Fine-tune the clearing <span>+</span></summary><div class="settings">
            <label for="evaporation">Trail half-life <output id="evaporation-label">22 s</output></label><input id="evaporation" type="range" min="5" max="60" value="22" />
            <label for="initial-population">Starting ants <output id="initial-label">48</output></label><input id="initial-population" type="range" min="12" max="120" step="4" value="48" />
            <label for="seed">World seed</label><input id="seed" type="number" min="0" max="4294967295" step="1" value="1847" />
            <p class="muted small">Starting ants and seed apply to the next colony. Up to ${MAX_POPULATION} ants can live here.</p>
          </div></details>
        </section>
        <button id="reset" class="reset-button">↻ <span>New colony</span></button>
        <p class="reset-note">A fresh start, with the same settings.</p>
      </aside>
    </section>
    <footer class="page-footer"><p><span class="footer-mark" aria-hidden="true">↳</span> Small signals. Shared paths. Something bigger.</p><p>No scores. No hurry. Just a colony.</p></footer>
  </main>
  <dialog id="reset-dialog"><form method="dialog"><p class="eyebrow">A FRESH CLEARING</p><h2>Start a new colony?</h2><p>This clears the current ants, food, and trails. The new colony uses your starting settings.</p><div class="dialog-actions"><button value="cancel" class="small-button">Keep watching</button><button value="reset" class="primary-button">New colony</button></div></form></dialog>
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
let foodSelected = true;
let pausedBeforeReset = false;
const trails = element<HTMLInputElement>('trails');
const pauseButton = element<HTMLButtonElement>('pause');
const resetDialog = element<HTMLDialogElement>('reset-dialog');
const seedInput = element<HTMLInputElement>('seed');
const initialInput = element<HTMLInputElement>('initial-population');
const evaporation = element<HTMLInputElement>('evaporation');
const cursor = { x: WIDTH * 0.7, y: HEIGHT * 0.5 };

function setPause(value: boolean): void {
  paused = value;
  accumulator = 0;
  pauseButton.innerHTML = paused ? '▷ <span>Resume</span>' : 'Ⅱ <span>Pause</span>';
  pauseButton.setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation');
}
pauseButton.addEventListener('click', () => setPause(!paused));
document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(button => {
  button.addEventListener('click', () => {
    speed = Number(button.dataset.speed);
    element('speed-label').textContent = `${speed}×`;
    document.querySelectorAll('[data-speed]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  });
});
evaporation.addEventListener('input', () => {
  world.halfLife = Number(evaporation.value);
  element('evaporation-label').textContent = `${evaporation.value} s`;
});
initialInput.addEventListener('input', () => { element('initial-label').textContent = initialInput.value; });

function startNewColony(): void {
  if (!seedInput.reportValidity()) return;
  world = new World(Number(seedInput.value), Number(initialInput.value));
  world.halfLife = Number(evaporation.value);
  setPause(false);
  accumulator = 0;
  element('extinction').hidden = true;
  element('world-message').textContent = 'Click anywhere in the clearing to leave food.';
  messageUntil = 0;
  updateUI();
}
element('reset').addEventListener('click', () => {
  pausedBeforeReset = paused;
  setPause(true);
  resetDialog.returnValue = '';
  resetDialog.showModal();
});
resetDialog.addEventListener('close', () => {
  if (resetDialog.returnValue === 'reset') startNewColony();
  else setPause(pausedBeforeReset);
});
element('restart-extinct').addEventListener('click', startNewColony);
element('food-tool').addEventListener('click', () => {
  foodSelected = !foodSelected;
  element('food-tool').setAttribute('aria-pressed', String(foodSelected));
  canvas.classList.toggle('observe', !foodSelected);
  renderer.pointer = null;
  announce(foodSelected ? 'Click the clearing to place food.' : 'Just watching. Select Place food to add more.');
});

function announce(message: string): void {
  element('world-message').textContent = message;
  messageUntil = performance.now() + 4500;
}
function placeFood(x: number, y: number): void {
  if (!foodSelected) return;
  if (world.addFood(x, y)) {
    announce(world.extinct ? 'Food added, but this colony cannot be revived.' : `A little food left for the colony. +${FOOD_PER_CLICK} units`);
  } else announce('Choose an open spot away from the nest. Up to 128 food patches.');
}
canvas.addEventListener('pointermove', event => {
  if (foodSelected && event.pointerType !== 'touch') renderer.pointer = renderer.coordinates(event.clientX, event.clientY);
});
canvas.addEventListener('pointerleave', () => { renderer.pointer = null; });
canvas.addEventListener('click', event => {
  const point = renderer.coordinates(event.clientX, event.clientY);
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
canvas.addEventListener('focus', () => { if (foodSelected) renderer.pointer = { ...cursor }; });
canvas.addEventListener('blur', () => { renderer.pointer = null; });

function updateUI(): void {
  element('population').textContent = String(world.ants.length);
  element('reserve').textContent = world.reserve.toFixed(1);
  element('delivered').textContent = String(world.delivered);
  element('reserve-bar').style.width = `${Math.min(100, world.reserve / Math.max(1, world.ants.length * 1.5) * 100)}%`;
  element('reserve-bar').classList.toggle('low', world.status === 'low food' || world.status === 'starving');
  element('session-status').textContent = world.status[0].toUpperCase() + world.status.slice(1);
  element('session-status').dataset.status = world.status;
  element('population-change').textContent = world.extinct ? 'a quiet nest' : world.births || world.deaths ? `+${world.births} born · ${world.deaths} lost` : 'making their way';
  const notes: Record<typeof world.status, string> = {
    exploring: 'A little reserve for the journey ahead.',
    foraging: 'Every delivery keeps the colony going.',
    growing: 'A surplus of food. Room for new life.',
    'low food': 'Reserves are low. Leave food near a trail.',
    starving: 'The nest is empty. Workers need food soon.',
    extinct: 'This colony has died out permanently.',
  };
  element('food-note').textContent = notes[world.status];
  const seconds = Math.floor(world.elapsed);
  element('clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  element('extinction').hidden = !world.extinct;
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
    element('world-message').textContent = world.supplied ? 'Click to leave a little more food.' : 'Click anywhere in the clearing to leave food.';
    messageUntil = 0;
  }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { previousTime = 0; accumulator = 0; });
updateUI();
requestAnimationFrame(frame);
