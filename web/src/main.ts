import './style.css';
import { FOOD_PER_CLICK, HEIGHT, MAX_FOOD_PER_CLICK, MAX_POPULATION, STEP, WIDTH } from './simulation/world';
import { Sandbox, COLONY_LIMIT } from './simulation/sandbox';
import { colonyPalette } from './rendering/palette';
import { Renderer } from './rendering/canvas';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<main>
  <div class="controls" aria-label="Simulation controls">
    <button id="pause">Pause</button><button id="reset">New simulation</button><button id="new-map">New map</button>
    <button id="add">Add colony</button>
    <label>Colony <select id="colony" aria-label="Colony to remove"></select></label><button id="remove">Remove</button>
    <label>Speed <select id="speed"><option value="0.5">0.5×</option><option selected value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option><option value="16">16×</option><option value="32">32×</option></select></label>
    <label>Food per click <input id="food-amount" type="number" min="1" max="${MAX_FOOD_PER_CLICK}" step="1" value="${FOOD_PER_CLICK}" required /></label>
    <label><input id="trails" type="checkbox" checked /> Trails</label>
    <label><input id="energy" type="checkbox" checked /> Energy</label>
    <span id="clock">00:00</span>
  </div>
  <div id="stats" class="colony-stats" aria-label="Colony statistics"></div>
  <details class="settings"><summary>Settings</summary><div class="settings-inputs">
    <label>Starting colonies <input id="count" type="number" min="1" max="${COLONY_LIMIT}" value="2" required /></label>
    <label>Nest placement <select id="placement"><option value="auto">Automatic</option><option value="manual">Manual</option></select></label>
    <label>Alarm response <input id="recruitment" type="range" min="0" max="100" step="5" value="25" /><output id="recruitment-label">25%</output></label>
    <label>Trail half-life <input id="evaporation" type="range" min="5" max="60" value="22" /><output id="evaporation-label">22 s</output></label>
    <label>Starting ants <input id="population" type="range" min="12" max="120" step="4" value="48" /><output id="population-label">48</output></label>
    <label>Map seed <input id="seed" type="number" min="0" max="4294967295" step="1" value="1847" required /></label>
    <span>Starting count, ants, and seed apply to a new simulation. Limit: ${MAX_POPULATION} ants per colony.</span>
  </div></details>
  <div class="canvas-wrap"><canvas id="world" tabindex="0" role="img" aria-label="Ant colonies. Click to place food or nests. Arrow keys move the cursor; Enter or Space places."></canvas></div>
  <div class="status-line"><span id="message" role="status">Click to add food (+${FOOD_PER_CLICK}).</span><span>Matching colors: colony nest, ants, trails · Olive: food · Brown: obstacles</span></div>
  <dialog id="reset-dialog"><form method="dialog"><p>Start a new simulation? This clears all colonies, food, and trails.</p><div class="dialog-actions"><button value="cancel">Cancel</button><button value="reset">Start new</button></div></form></dialog>
</main>`;
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('world');
const renderer = new Renderer(canvas);
const count = el<HTMLInputElement>('count');
const placement = el<HTMLSelectElement>('placement');
const selection = el<HTMLSelectElement>('colony');
const energy = el<HTMLInputElement>('energy');
const trails = el<HTMLInputElement>('trails');
const evaporation = el<HTMLInputElement>('evaporation');
const population = el<HTMLInputElement>('population');
const seed = el<HTMLInputElement>('seed');
const recruitment = el<HTMLInputElement>('recruitment');
const foodAmount = el<HTMLInputElement>('food-amount');
const dialog = el<HTMLDialogElement>('reset-dialog');
let world = new Sandbox();
let paused = false, speed = 1, accumulator = 0, previousTime = 0, previousUI = 0;
let pendingNests = 0, resetMap = false, wasPaused = false, placementWasPaused = false;
const cursor = { x: WIDTH * 0.7, y: HEIGHT * 0.5 };

function announce(message: string): void { el('message').textContent = message; }
function setPause(value: boolean): void {
  paused = pendingNests > 0 || value;
  accumulator = 0;
  el('pause').textContent = paused ? 'Resume' : 'Pause';
}
function refresh(): void {
  const selected = selection.value;
  selection.replaceChildren(...world.colonies.map(c => new Option(String(c.id), String(c.id))));
  if (world.colonies.some(c => String(c.id) === selected)) selection.value = selected;
  el<HTMLButtonElement>('remove').disabled = !world.colonies.length;
  el<HTMLButtonElement>('add').disabled = world.colonies.length >= COLONY_LIMIT || pendingNests > 0;
  renderer.placingNest = pendingNests > 0;
}
function updateUI(): void {
  el('stats').innerHTML = world.colonies.map(({ id, colorId, world: c }) => {
    const meanEnergy = c.ants.length ? c.ants.reduce((sum, a) => sum + a.energy, 0) / c.ants.length : 0;
    return `<span style="color:${colonyPalette(colorId).worker}">Colony ${id}: ${c.ants.length} ants · ${c.brood.length} brood · ${c.reserve.toFixed(1)} food · ${c.extinct ? 'extinct' : c.status}${world.energyEnabled ? ` · ${Math.round(meanEnergy)}% energy` : ''}</span>`;
  }).join('');
  const seconds = Math.floor(world.elapsed);
  el('clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function start(): void {
  if (!seed.reportValidity() || !count.reportValidity()) { setPause(wasPaused); return; }
  if (resetMap) seed.value = String(crypto.getRandomValues(new Uint32Array(1))[0]);
  placementWasPaused = false;
  pendingNests = placement.value === 'manual' ? Number(count.value) : 0;
  world = new Sandbox(Number(seed.value), Number(population.value), pendingNests ? 0 : Number(count.value));
  world.halfLife = Number(evaporation.value);
  world.energyEnabled = energy.checked;
  world.recruitmentFraction = Number(recruitment.value) / 100;
  setPause(false); refresh(); updateUI();
  announce(pendingNests ? `Click open space to place ${pendingNests} nests.` : `Click to add food (+${foodAmount.value}).`);
}
function place(x: number, y: number): void {
  if (pendingNests) {
    if (!world.addColony({ x, y })) { announce('Place nest in open space, away from other nests and food.'); return; }
    pendingNests--; refresh(); updateUI();
    if (pendingNests) announce(`Place ${pendingNests} more nests.`);
    else { setPause(placementWasPaused); announce('Nests placed. Click to add food.'); }
  } else {
    if (!foodAmount.reportValidity()) return;
    const amount = Number(foodAmount.value);
    announce(world.addFood(x, y, amount) ? `Added ${amount} food.` : 'Place food in open space, away from nests and obstacles. Limit: 128 patches.');
  }
}
el('pause').addEventListener('click', () => setPause(!paused));
el<HTMLSelectElement>('speed').addEventListener('change', e => { speed = Number((e.target as HTMLSelectElement).value); accumulator = 0; });
foodAmount.addEventListener('input', () => {
  if (!pendingNests && foodAmount.validity.valid) announce(`Click to add food (+${foodAmount.value}).`);
});
energy.addEventListener('change', () => { world.energyEnabled = energy.checked; updateUI(); });
evaporation.addEventListener('input', () => { world.halfLife = Number(evaporation.value); el('evaporation-label').textContent = `${evaporation.value} s`; });
population.addEventListener('input', () => { el('population-label').textContent = population.value; });
recruitment.addEventListener('input', () => { world.recruitmentFraction = Number(recruitment.value) / 100; el('recruitment-label').textContent = `${recruitment.value}%`; });
for (const id of ['reset', 'new-map']) el(id).addEventListener('click', () => {
  wasPaused = paused; resetMap = id === 'new-map'; setPause(true); dialog.returnValue = ''; dialog.showModal();
});
dialog.addEventListener('close', () => { if (dialog.returnValue === 'reset') start(); else setPause(wasPaused); });
el('add').addEventListener('click', () => {
  if (placement.value === 'manual') { placementWasPaused = paused; pendingNests = 1; setPause(true); announce('Click open space to place a new nest.'); }
  else announce(world.addColony() ? 'Added colony.' : 'No room for another nest.');
  refresh(); updateUI();
});
el('remove').addEventListener('click', () => { world.removeColony(Number(selection.value)); refresh(); updateUI(); announce('Colony removed.'); });
canvas.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') renderer.pointer = renderer.coordinates(e.clientX, e.clientY); });
canvas.addEventListener('pointerleave', () => { renderer.pointer = null; });
canvas.addEventListener('click', e => {
  const p = renderer.coordinates(e.clientX, e.clientY);
  if (p) { Object.assign(cursor, p); place(p.x, p.y); }
});
canvas.addEventListener('keydown', e => {
  const moves: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
  if (moves[e.key]) {
    e.preventDefault(); const [dx, dy] = moves[e.key];
    cursor.x = Math.max(20, Math.min(WIDTH - 20, cursor.x + dx));
    cursor.y = Math.max(20, Math.min(HEIGHT - 20, cursor.y + dy)); renderer.pointer = { ...cursor };
  } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); place(cursor.x, cursor.y); }
});
canvas.addEventListener('focus', () => { renderer.pointer = { ...cursor }; });
canvas.addEventListener('blur', () => { renderer.pointer = null; });
function frame(time: number): void {
  const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.12) : 0;
  previousTime = time;
  if (!paused && !document.hidden) {
    // Bound work and backlog so high speed cannot freeze controls on slower devices.
    accumulator = Math.min(accumulator + delta * speed, STEP * 64);
    const deadline = performance.now() + 12;
    let steps = 0;
    while (accumulator >= STEP && steps < 64 && performance.now() < deadline) { world.step(); accumulator -= STEP; steps++; }
  }
  renderer.draw(world, trails.checked);
  if (time - previousUI > 150) { updateUI(); previousUI = time; }
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { previousTime = 0; accumulator = 0; });
refresh(); updateUI(); requestAnimationFrame(frame);
