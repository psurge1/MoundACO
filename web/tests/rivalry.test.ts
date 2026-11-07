import assert from 'node:assert/strict';
import test from 'node:test';
import { Sandbox } from '../src/simulation/sandbox.ts';
import { Terrain } from '../src/simulation/terrain.ts';
import { RouteMemory } from '../src/simulation/route.ts';
import { depositField } from '../src/simulation/field.ts';
import { RIVALRY, STEP, World } from '../src/simulation/world.ts';

function arena(seed = 42, population = 1): Sandbox {
  const sandbox = new Sandbox(seed, population, 0, Terrain.empty());
  sandbox.addColony({ x: 300, y: 320 }); sandbox.addColony({ x: 700, y: 320 });
  sandbox.energyEnabled = false;
  return sandbox;
}
function position(world: World, x: number, y = 320): void {
  const ant = world.ants[0];
  Object.assign(ant, { x, y, angle: 0, decisionIn: 100, recruitmentRank: 1, searchLimit: 1000 });
  ant.route = new RouteMemory(world.nest.x, world.nest.y);
  ant.route.record(x, y, world.terrain, true);
}
function advance(world: { step(): void }, seconds: number): void {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) world.step();
}

test('live colonies share terrain/food but isolate stores and fields; removal erases only that colony', () => {
  const s = arena(); const [a, b] = s.colonies;
  assert.equal(a.world.food, b.world.food); assert.equal(a.world.terrain, b.world.terrain);
  assert.notEqual(a.world.pheromone, b.world.pheromone); assert.notEqual(a.world.alarm, b.world.alarm);
  assert.equal(a.world.brood.length, 0);
  assert.equal(s.addFood(500, 320), true);
  a.world.pheromone[0] = 5; a.world.alarm[0] = 3; a.world.brood.push(80);
  s.removeColony(a.id);
  assert.equal(a.world.ants.length + a.world.brood.length + a.world.reserve, 0);
  assert.equal(a.world.pheromone[0] + a.world.alarm[0], 0);
  assert.equal(b.world.rivals.length, 0); assert.equal(s.food[0].amount, 80);
  assert.equal(s.addColony({ x: 300, y: 320 })!.world.ants.length, 1);
});

test('seeded automatic nests fit on unchanged connected terrain and live runs replay', () => {
  for (const seed of [1, 42, 1847, 77]) {
    const a = new Sandbox(seed, 12, 4), b = new Sandbox(seed, 12, 4);
    assert.equal(a.colonies.length, 4);
    for (const { world } of a.colonies) assert.ok(a.terrain.canStand(world.nest.x, world.nest.y, 32));
    a.addFood(500, 450); b.addFood(500, 450);
    advance(a, 3); advance(b, 3);
    a.removeColony(2); b.removeColony(2); a.addColony(); b.addColony();
    advance(a, 3); advance(b, 3);
    assert.deepEqual(a, b);
  }
});

test('brood is paid for slowly, matures without food or adults, and extinction remains terminal', () => {
  const w = new World(42, 1, Terrain.empty()); w.reserve = 100;
  advance(w, RIVALRY.broodInterval + STEP);
  assert.equal(w.brood.length, 1); assert.equal(w.ants.length, 1); assert.equal(w.growthSpent, RIVALRY.broodCost);
  w.ants.length = 0; w.reserve = 0;
  advance(w, RIVALRY.maturation - 1);
  assert.equal(w.extinct, false); assert.equal(w.ants.length, 0);
  advance(w, 2); assert.equal(w.ants.length, 1); assert.equal(w.births, 1);
  w.ants.length = w.brood.length = 0; w.step(); assert.equal(w.extinct, true);
  w.reserve = 100; advance(w, 60); assert.equal(w.ants.length + w.brood.length, 0);
});

test('raiders take fractional stored food before brood, and stolen brood becomes cargo', () => {
  const s = arena(); const [a, b] = s.colonies.map(c => c.world);
  b.ants.length = 0; b.brood.push(100); b.reserve = 0.25;
  position(a, 700); a.step();
  assert.equal(b.reserve, 0); assert.equal(b.brood.length, 1);
  assert.equal(a.ants[0].cargoAmount, 0.25); assert.ok(a.ants[0].carrying);
  a.resumeForaging(a.ants[0]); position(a, 700); a.step();
  assert.equal(b.brood.length, 0); assert.ok(a.ants[0].carrying); assert.equal(a.ants[0].cargoAmount, 1);
  s.step(); assert.equal(b.extinct, true);
});

test('two carriers pass peacefully without cargo transfer or alarm', () => {
  const s = arena(); const [a, b] = s.colonies.map(c => c.world);
  position(a, 500); position(b, 503);
  a.takeCargo(a.ants[0]); b.takeCargo(b.ants[0]); s.step();
  assert.equal(a.ants.length + b.ants.length, 2);
  assert.ok(a.ants[0].carrying && b.ants[0].carrying);
  assert.ok(a.alarm.every(v => v === 0) && b.alarm.every(v => v === 0));
});

test('one-second fatal encounters conserve existing cargo, emit own alarms, and create no food', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = arena(seed); const [a, b] = s.colonies.map(c => c.world);
    a.retreatChance = b.retreatChance = 0; position(a, 500); position(b, 503);
    a.takeCargo(a.ants[0]); s.step();
    const engagedAt = s.elapsed;
    assert.equal(a.ants.length + b.ants.length, 2);
    assert.ok(a.ants[0].fighting && b.ants[0].fighting);
    const start = [a.ants[0].x, b.ants[0].x];
    advance(s, 0.9);
    assert.ok(s.elapsed - engagedAt < 1);
    assert.equal(a.ants.length + b.ants.length, 2);
    assert.deepEqual([a.ants[0].x, b.ants[0].x], start);
    advance(s, 0.2);
    assert.equal(a.ants.length + b.ants.length, 1);
    assert.equal([...a.ants, ...b.ants].filter(ant => ant.carrying).length, 1);
    assert.ok(a.alarm.some(v => v > 0) && b.alarm.some(v => v > 0));
    assert.equal(s.food.length, 0); assert.equal(a.deaths + b.deaths, 1);
  }
});

test('retreat does not kill or impose immunity: another immediate encounter is allowed', () => {
  const s = arena(); const [a, b] = s.colonies.map(c => c.world);
  a.retreatChance = b.retreatChance = 1; position(a, 500); position(b, 503);
  s.step(); advance(s, 1 + STEP); assert.equal(a.ants.length + b.ants.length, 2);
  assert.ok(a.ants.every(ant => !ant.returning) && b.ants.every(ant => !ant.returning));
  a.retreatChance = b.retreatChance = 0;
  position(a, 500); position(b, 503); s.step(); advance(s, 1 + STEP);
  assert.equal(a.ants.length + b.ants.length, 1);
});

test('alarms recruit only eligible own-colony ants and fade faster than food trails', () => {
  const s = arena(); const [a, b] = s.colonies.map(c => c.world);
  position(a, 500); position(b, 550);
  a.recruitmentFraction = 1; a.ants[0].recruitmentRank = 0;
  depositField(b.alarm, 540, 320, 8); b.alarms.push({ x: 540, y: 320, until: 9 });
  a.step(); assert.equal(a.ants[0].alarmTarget, null, 'rival alarms cannot recruit');
  depositField(a.alarm, 540, 320, 8); a.alarms.push({ x: 540, y: 320, until: 9 });
  a.step(); assert.ok(a.ants[0].alarmTarget);
  a.takeCargo(a.ants[0]); a.step(); assert.equal(a.ants[0].alarmTarget, null);
  const w = new World(9, 1, Terrain.empty()); w.alarm[0] = w.pheromone[0] = 8;
  advance(w, 3); assert.ok(w.alarm[0] < w.pheromone[0]);
});

test('stale alarms release responders immediately rather than keeping them at the frontline', () => {
  const s = arena(); const a = s.colonies[0].world;
  position(a, 500); a.ants[0].alarmTarget = { x: 500, y: 320 }; a.ants[0].decisionIn = 0;
  a.step(); assert.equal(a.ants[0].alarmTarget, null);
});


test('removing a colony during a fight releases its surviving opponent', () => {
  const s = arena(); const [a, b] = s.colonies;
  position(a.world, 500); position(b.world, 503); s.step();
  assert.equal(a.world.ants[0].fighting, true);
  s.removeColony(b.id);
  assert.equal(a.world.ants[0].fighting, false);
  advance(s, 2); assert.equal(a.world.deaths, 0);
});

test('additional attackers cannot resolve a new fight before its full second', () => {
  const s = arena(8, 2); const [a, b] = s.colonies.map(c => c.world);
  a.retreatChance = b.retreatChance = 0;
  b.ants.splice(1);
  position(a, 500); position(b, 503);
  Object.assign(a.ants[1], { x: 501, y: 322, angle: 0, decisionIn: 100 });
  s.step(); advance(s, 0.9);
  assert.equal(a.ants.length + b.ants.length, 3);
  assert.equal(a.deaths + b.deaths, 0);
  advance(s, 0.2); assert.ok(a.deaths + b.deaths > 0);
});


test('more stored food makes identical brood mature earlier, with a bounded growth advantage', () => {
  const firstBirth = (reserve: number) => {
    const w = new World(42, 1, Terrain.empty());
    w.reserve = reserve; w.brood.push(RIVALRY.maturation);
    while (!w.births && w.elapsed < 42) w.step();
    assert.equal(w.births, 1);
    return w.elapsed;
  };
  const times = [0, 40, 200, 10000].map(firstBirth);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] < times[i - 1], 'more reserves must mature the same brood sooner');
  assert.ok(times[0] >= 40 && times[0] < 40 + STEP * 2, 'unfed brood still matures at the baseline rate');
  assert.ok(times[3] >= 20 && times[3] < 21, 'even very rich colonies need about twenty seconds');
});

test('food changes accelerate existing brood without resetting progress or stopping unfed maturation', () => {
  const w = new World(42, 1, Terrain.empty());
  w.reserve = 0; w.brood.push(40);
  advance(w, 10);
  assert.ok(Math.abs(w.brood[0] - 30) < 1e-8);
  w.reserve = 10000; advance(w, 5);
  assert.ok(w.brood[0] > 20 && w.brood[0] < 21, 'new food accelerates brood already in development');
  const remaining = w.brood[0];
  w.reserve = 0; advance(w, 5);
  assert.ok(Math.abs(w.brood[0] - (remaining - 5)) < 1e-8, 'food removal preserves progress and the baseline development rate');
});

test('food placement uses the chosen quantity for new patches and top-ups, rejecting invalid amounts', () => {
  for (const world of [arena(), new World(42, 1, Terrain.empty())]) {
    assert.equal(world.addFood(500, 450, 1), true);
    assert.equal(world.food[0].amount, 1);
    assert.equal(world.addFood(502, 450, 500), true);
    assert.equal(world.food.length, 1);
    assert.equal(world.food[0].amount, 501);
    assert.equal(world.addFood(600, 450, 10000), true);
    assert.equal(world.food[1].amount, 10000);
    for (const invalid of [0, -1, 2.5, NaN, Infinity, 10001]) {
      assert.equal(world.addFood(500, 450, invalid), false);
      assert.equal(world.food[0].amount, 501);
    }
    assert.equal(world.addFood(800, 450), true);
    assert.equal(world.food[2].amount, 80, 'old callers retain the default quantity');
    if (world instanceof World) assert.equal(world.supplied, 10581);
  }
});
