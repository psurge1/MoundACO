import assert from 'node:assert/strict';
import test from 'node:test';
import { COLS, ROWS } from '../src/simulation/field.ts';
import { ENERGY_PER_UNIT, LOADED_ENERGY_MULTIPLIER, MAX_ENERGY } from '../src/simulation/energy.ts';
import { RouteMemory } from '../src/simulation/route.ts';
import { Terrain } from '../src/simulation/terrain.ts';
import { STEP, World } from '../src/simulation/world.ts';

function isolated(): World {
  const world = new World(42, 1, Terrain.empty());
  world.reserve = 8; // No births: tests follow one ant and its recovery.
  return world;
}

function carrier(x = 650): World {
  const world = isolated();
  const ant = world.ants[0];
  ant.x = x; ant.y = 320; ant.carrying = true;
  ant.route = new RouteMemory(500, 320);
  ant.route.record(x, 320, world.terrain, true);
  ant.returnIndex = ant.route.points.length - 1;
  return world;
}

test('actual distance spends energy, with a small additional cost for carrying food', () => {
  for (const loaded of [false, true]) {
    const world = loaded ? carrier() : isolated();
    const ant = world.ants[0];
    if (!loaded) { ant.angle = 0; ant.decisionIn = 999; }
    const x = ant.x, y = ant.y;
    world.step();
    const distance = Math.hypot(ant.x - x, ant.y - y);
    const expected = distance * ENERGY_PER_UNIT * (loaded ? LOADED_ENERGY_MULTIPLIER : 1);
    assert.ok(Math.abs(MAX_ENERGY - ant.energy - expected) < 1e-10);
    assert.ok(Math.abs(world.energyUsed - expected) < 1e-10);
    assert.ok(Math.abs(world.distanceTravelled - distance) < 1e-10);
  }
});

test('blocked movement does not spend energy or create fake travelled distance', () => {
  const blocked = new Uint8Array(COLS * ROWS);
  blocked[40 * COLS + 80] = 1;
  const world = new World(42, 1, new Terrain(0, blocked));
  world.reserve = 8;
  const ant = world.ants[0];
  ant.x = 637.49; ant.y = 324; ant.angle = 0; ant.decisionIn = 999;
  world.step();
  assert.equal(ant.energy, MAX_ENERGY);
  assert.equal(world.energyUsed, 0);
  assert.equal(world.distanceTravelled, 0);
});

test('longer trips lose more energy and require more recovery, without overwhelming travel time', () => {
  const measure = (distance: number) => {
    const world = carrier(500 + distance);
    const ant = world.ants[0];
    // Model the already-completed outbound leg as part of this fixture.
    ant.energy -= distance * ENERGY_PER_UNIT;
    ant.tripDistance = distance;
    let travel = 0;
    while (ant.carrying && travel++ < 1000) world.step();
    const arrivalEnergy = ant.energy;
    let rest = 0;
    while (ant.resting && rest++ < 500) world.step();
    assert.equal(ant.energy, MAX_ENERGY);
    assert.ok(!ant.resting);
    return { arrivalEnergy, rest: rest * STEP, travel: travel * STEP + distance / 40 };
  };
  const short = measure(100), long = measure(300);
  assert.ok(long.arrivalEnergy < short.arrivalEnergy);
  assert.ok(long.rest > short.rest + 0.5);
  assert.ok(long.rest / long.travel < 0.1, 'recovery should remain a small addition to a normal trip');
});

test('zero energy still permits a safe return, followed by recovery at the nest', () => {
  const world = carrier();
  const ant = world.ants[0];
  ant.energy = 0;
  world.step();
  assert.ok(Math.abs(ant.x - (650 - 45 * 0.9 * STEP)) < 1e-8, 'maximum slowdown is 10%');
  for (let i = 0; i < 10 / STEP && ant.carrying; i++) world.step();
  assert.equal(world.delivered, 1);
  assert.ok(ant.resting);
  const position = [ant.x, ant.y];
  world.step();
  assert.deepEqual([ant.x, ant.y], position, 'resting ants stay at the nest');
  assert.ok(ant.energy > 0);
  for (let i = 0; i < 13 / STEP && ant.resting; i++) world.step();
  assert.equal(ant.energy, MAX_ENERGY);
  assert.ok(!ant.resting);
});

test('pheromone deposition has no direct route-length or energy multiplier', () => {
  const direct = carrier(), detour = carrier();
  const second = detour.ants[0];
  second.route = new RouteMemory(500, 320);
  for (const [x, y] of [[500, 200], [650, 200], [650, 320]]) second.route.record(x, y, detour.terrain, true);
  second.returnIndex = second.route.points.length - 1;
  for (const world of [direct, detour]) { world.energyEnabled = false; world.step(); }
  const sum = (world: World) => world.pheromone.reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum(direct) - sum(detour)) < 1e-7);
  assert.ok(Math.abs(sum(direct) - direct.distanceTravelled * 0.6) < 1e-7);
  const tired = carrier();
  tired.ants[0].energy = 40;
  tired.step();
  assert.ok(Math.abs(sum(tired) / tired.distanceTravelled - 0.6) < 1e-7,
    'fatigue changes movement, not pheromone strength per distance');
});

test('energy can be disabled for comparison, and recovery never needs extra food or revives an extinct colony', () => {
  const world = isolated();
  world.energyEnabled = false;
  for (let i = 0; i < 30 / STEP; i++) world.step();
  assert.equal(world.energyUsed, 0);
  assert.equal(world.restSeconds, 0);
  assert.ok(world.ants.every(ant => ant.energy === MAX_ENERGY));
  const ant = world.ants[0];
  ant.energy = 1; ant.resting = true;
  world.step();
  assert.equal(ant.energy, MAX_ENERGY);
  assert.ok(!ant.resting);
  world.energyEnabled = true;
  world.reserve = 0;
  ant.energy = 95; ant.resting = true;
  for (let i = 0; i < 1 / STEP; i++) world.step();
  assert.ok(!ant.resting, 'an empty reserve must not trap every ant in recovery');
  assert.equal(world.reserve, 0);
  world.ants.length = 0; world.extinct = true;
  world.step();
  assert.equal(world.ants.length, 0);
  assert.ok(world.extinct);
});

test('erasing a remembered loop never refunds the energy already spent walking it', () => {
  const world = isolated();
  const ant = world.ants[0];
  ant.x = 500; ant.y = 320; ant.route = new RouteMemory(500, 320); ant.searchLimit = 100;
  for (const [x, y] of [[600, 320], [600, 420], [500, 420], [500, 320]]) {
    let steps = 0;
    while (Math.hypot(ant.x - x, ant.y - y) > 1.4 && steps++ < 200) {
      ant.angle = Math.atan2(y - ant.y, x - ant.x); ant.decisionIn = 999;
      world.step();
    }
  }
  assert.ok(world.distanceTravelled > 390);
  assert.ok(ant.route.length < 24);
  assert.ok(ant.energy < 96);
  assert.ok(Math.abs(MAX_ENERGY - ant.energy - world.distanceTravelled * ENERGY_PER_UNIT) < 1e-7);
});
