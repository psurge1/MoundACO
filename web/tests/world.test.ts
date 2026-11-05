import assert from 'node:assert/strict';
import test from 'node:test';
import { FOOD_PER_CLICK, MAX_POPULATION, STEP, World } from '../src/simulation/world.ts';

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
    const world = new World(seed);
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
  const world = new World(42);
  for (let i = 0; i < 10; i++) world.addFood(560, 320);
  advance(world, 90);
  assert.ok(world.births > 0);
  assert.ok(world.ants.length > world.initialPopulation);
  assert.equal(world.growthSpent, world.births * 4);
  assert.ok(world.ants.length <= MAX_POPULATION);
  checkFoodBalance(world);
  const capped = new World(1, MAX_POPULATION);
  capped.reserve = 10000;
  advance(capped, 5);
  assert.equal(capped.ants.length, MAX_POPULATION);
  assert.equal(capped.births, 0);
});

test('starvation reduces population, and feeding can restore a surviving colony', () => {
  const world = new World();
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
  const world = new World();
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
  const fresh = new World(world.seed);
  assert.ok(!fresh.extinct);
  assert.equal(fresh.ants.length, 48);
});

test('seeded runs with identical timed input produce identical states', () => {
  const first = new World(123);
  const second = new World(123);
  for (const world of [first, second]) {
    world.addFood(620, 300);
    advance(world, 8);
    world.addFood(400, 250);
    advance(world, 25);
  }
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.ants, new World(124).ants);
});

test('pheromone half-life controls evaporation in simulated seconds', () => {
  const fast = new World();
  const slow = new World();
  fast.pheromone[0] = slow.pheromone[0] = 10;
  fast.halfLife = 5;
  slow.halfLife = 30;
  advance(fast, 5); advance(slow, 5);
  assert.ok(Math.abs(fast.pheromone[0] - 5) < 0.001);
  assert.ok(slow.pheromone[0] > fast.pheromone[0]);
});

test('food placement rejects the nest and non-finite input, merges close patches, and bounds storage', () => {
  const world = new World();
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
