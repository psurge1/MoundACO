import assert from 'node:assert/strict';
import test from 'node:test';
import { Terrain } from '../src/simulation/terrain.ts';
import { FOOD_PER_CLICK, MAX_POPULATION, STEP, World } from '../src/simulation/world.ts';

function flatWorld(seed = 1847, population = 48): World {
  return new World(seed, population, Terrain.empty());
}

function advance(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) world.step();
}

function checkFoodBalance(world: World): void {
  const remaining = world.food.reduce((sum, patch) => sum + patch.amount, 0);
  const carried = world.ants.filter(ant => ant.carrying).length;
  assert.ok(Math.abs(world.initialReserve + world.supplied - (
    remaining + carried + world.reserve + world.consumed + world.growthSpent + world.lostCarried
  )) < 1e-7, 'all supplied and initial food must be accounted for');
}

test('finite food is discovered, delivered, and reinforces a bounded trail across seeds', () => {
  for (const seed of [1847, 42, 17]) {
    const world = flatWorld(seed);
    world.addFood(620, 320);
    assert.equal(world.supplied, FOOD_PER_CLICK);
    advance(world, 60);
    assert.ok(world.delivered > 10, `seed ${seed} should find food and deliver it`);
    assert.ok(world.food.reduce((sum, p) => sum + p.amount, 0) < FOOD_PER_CLICK);
    assert.ok(world.pheromone.some(value => value > 0.1));
    assert.ok(world.pheromone.every(value => value >= 0 && value <= 12));
    checkFoodBalance(world);
  }
});

test('living colonies grow with surplus food, pay for births, and respect the population cap', () => {
  const world = flatWorld(42);
  for (let i = 0; i < 10; i++) world.addFood(560, 320);
  advance(world, 90);
  assert.ok(world.births > 0);
  assert.ok(world.ants.length > world.initialPopulation);
  assert.equal(world.growthSpent, world.births * 4);
  assert.ok(world.ants.length <= MAX_POPULATION);
  checkFoodBalance(world);
  const capped = flatWorld(1, MAX_POPULATION);
  capped.reserve = 10000;
  advance(capped, 5);
  assert.equal(capped.ants.length, MAX_POPULATION);
  assert.equal(capped.births, 0);
});

test('starvation reduces population, and feeding can restore a surviving colony', () => {
  const world = flatWorld();
  advance(world, 155);
  assert.ok(world.deaths > 0);
  assert.ok(world.ants.length > 0);
  const survivors = world.ants.length;
  for (let i = 0; i < 10; i++) world.addFood(550, 320);
  advance(world, 100);
  assert.ok(!world.extinct);
  assert.ok(world.ants.length > survivors);
  assert.ok(world.births > 0);
  checkFoodBalance(world);
});

test('extinction is permanent even after adding food and advancing time', () => {
  const world = flatWorld();
  advance(world, 300);
  assert.ok(world.extinct);
  assert.equal(world.ants.length, 0);
  const births = world.births;
  world.addFood(560, 320);
  advance(world, 60);
  assert.ok(world.extinct);
  assert.equal(world.ants.length, 0);
  assert.equal(world.births, births);
  assert.equal(world.food[0].amount, FOOD_PER_CLICK);
  checkFoodBalance(world);
  const fresh = flatWorld(world.seed);
  assert.ok(!fresh.extinct);
  assert.equal(fresh.ants.length, 48);
});

test('seeded runs with identical timed input produce identical states', () => {
  const first = flatWorld(123);
  const second = flatWorld(123);
  for (const world of [first, second]) {
    world.addFood(620, 300);
    advance(world, 8);
    world.addFood(400, 250);
    advance(world, 25);
  }
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.ants, flatWorld(124).ants);
});

test('pheromone half-life controls evaporation in simulated seconds', () => {
  const fast = flatWorld();
  const slow = flatWorld();
  fast.pheromone[0] = slow.pheromone[0] = 10;
  fast.halfLife = 5;
  slow.halfLife = 30;
  advance(fast, 5); advance(slow, 5);
  assert.ok(Math.abs(fast.pheromone[0] - 5) < 0.001);
  assert.ok(slow.pheromone[0] > fast.pheromone[0]);
});

test('food placement rejects the nest and non-finite input, merges close patches, and bounds storage', () => {
  const world = flatWorld();
  assert.equal(world.addFood(500, 320), false);
  assert.equal(world.addFood(NaN, 320), false);
  assert.equal(world.addFood(560, 320), true);
  assert.equal(world.addFood(562, 322), true);
  assert.equal(world.food.length, 1);
  assert.equal(world.food[0].amount, FOOD_PER_CLICK * 2);
  for (let x = 30; x < 1000; x += 30) {
    for (let y = 30; y < 640; y += 30) world.addFood(x, y);
  }
  assert.equal(world.food.length, 128);
  checkFoodBalance(world);
});

test('an unsuccessful worker returns home without depositing a false food trail', () => {
  const world = flatWorld();
  const worker = world.ants.find(ant => !ant.scout)!;
  worker.x = 80; worker.y = 320;
  worker.searchTime = worker.searchLimit;
  world.step();
  assert.ok(worker.returning);
  assert.ok(!worker.carrying);
  assert.ok(worker.x > 80, 'the worker should head back toward the nest');
  advance(world, 11);
  assert.ok(!worker.returning, 'the worker should start a new trip after reaching the nest');
  assert.ok(worker.searchTime < worker.searchLimit);
  assert.ok(world.pheromone.every(value => value === 0), 'empty returns must not advertise food');
  assert.equal(world.delivered, 0);
  checkFoodBalance(world);
});

test('a small scout group retains a longer exploration budget', () => {
  const world = flatWorld();
  const scouts = world.ants.filter(ant => ant.scout);
  assert.equal(scouts.length, 6);
  assert.ok(scouts.every(ant => ant.searchLimit >= 45 && ant.searchLimit <= 65));
  assert.ok(world.ants.filter(ant => !ant.scout).every(ant => ant.searchLimit >= 14 && ant.searchLimit <= 20));
});

test('workers recruit to discovered food rather than accumulating on the empty side', () => {
  for (const seed of [1847, 42, 17]) {
    const world = flatWorld(seed);
    for (let i = 0; i < 20; i++) world.addFood(720, 320);
    advance(world, 60);
    let emptySide = 0, samples = 0;
    for (let i = 0; i < 60 / STEP; i++) {
      world.step();
      emptySide += world.ants.filter(ant => ant.x < 400).length;
      samples += world.ants.length;
    }
    assert.ok(emptySide / samples < 0.2, `seed ${seed}: most ants should leave the empty side`);
    assert.ok(world.delivered > 100, `seed ${seed}: recruitment should sustain deliveries along discovered routes`);
    checkFoodBalance(world);
  }
});

test('with adequate reserves, scouting discovers distant food and adapts after a source is exhausted', () => {
  for (const seed of [1847, 42, 17]) {
    const world = flatWorld(seed);
    // Isolate discovery from starvation: remembered detours take longer than oracle returns.
    world.reserve += 164;
    world.supplied += 164;
    world.addFood(900, 100);
    advance(world, 120);
    assert.ok(world.delivered > 0, `seed ${seed}: distant food should still be discovered`);
    for (let i = 0; i < 240 / STEP && world.food.length; i++) world.step();
    assert.equal(world.food.length, 0, 'the original source should be exhausted');
    advance(world, 60); // Finish delivering food along remembered detours from the old source.
    checkFoodBalance(world);
    world.addFood(180, 500);
    const previous = world.delivered;
    advance(world, 240);
    assert.ok(world.delivered > previous + 5, `seed ${seed}: workers should discover the replacement source`);
    assert.ok(world.food.reduce((sum, patch) => sum + patch.amount, 0) < FOOD_PER_CLICK);
    checkFoodBalance(world);
  }
});
