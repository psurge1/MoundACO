import assert from 'node:assert/strict';
import test from 'node:test';
import { CELL, COLS, ROWS } from '../src/simulation/field.ts';
import { RouteMemory } from '../src/simulation/route.ts';
import { Terrain } from '../src/simulation/terrain.ts';
import { STEP, World } from '../src/simulation/world.ts';

function forkTerrain(): Terrain {
  const blocked = new Uint8Array(COLS * ROWS);
  for (let row = 17; row < 54; row++) {
    for (let col = 73; col < 78; col++) blocked[row * COLS + col] = 1;
  }
  return new Terrain(0, blocked);
}

function branchSignal(world: World, firstRow: number, endRow: number): number {
  let sum = 0;
  for (let row = firstRow; row < endRow; row++) {
    for (let col = 73; col < 78; col++) sum += world.pheromone[row * COLS + col];
  }
  return sum;
}

test('food carriers advertise the discovered detour without consulting the shortest-route field', () => {
  const terrain = forkTerrain();
  const world = new World(5, 1, terrain);
  world.reserve = 8; // Keep this isolated carrier alive without spawning new workers.
  const ant = world.ants[0];
  ant.route = new RouteMemory(500, 320);
  for (const [x, y] of [[540, 320], [564, 112], [660, 112], [780, 320]]) {
    const previous = ant.route.points[ant.route.points.length - 1];
    assert.ok(terrain.lineClear(previous.x, previous.y, x, y));
    ant.route.record(x, y, terrain, true);
  }
  ant.x = 780; ant.y = 320; ant.carrying = true;
  ant.returnIndex = ant.route.points.length - 1;
  terrain.homeWaypoint = () => { throw new Error('A food carrier must not ask for an optimal return'); };
  let crossedLongBranch = false;
  for (let i = 0; i < 40 / STEP && ant.carrying; i++) {
    world.step();
    crossedLongBranch ||= ant.x >= 73 * CELL && ant.x <= 78 * CELL && ant.y < 17 * CELL;
    assert.ok(terrain.canStand(ant.x, ant.y));
  }
  assert.ok(crossedLongBranch);
  assert.ok(!ant.carrying);
  assert.equal(world.delivered, 1);
  assert.ok(branchSignal(world, 8, 17) > 0);
  assert.equal(branchSignal(world, 54, 63), 0, 'an undiscovered shorter branch must not be reinforced');
});

test('remembered routes erase revisited loops but preserve obstacle detours', () => {
  const terrain = forkTerrain();
  const route = new RouteMemory(500, 320);
  for (const [x, y] of [[524, 320], [548, 320], [548, 344], [524, 344], [500, 344], [500, 320]]) {
    route.record(x, y, terrain, true);
  }
  assert.ok(route.length < 1, 'a loop ending at the original cell should be erased');
  for (const [x, y] of [[540, 320], [564, 112], [660, 112], [780, 320]]) route.record(x, y, terrain, true);
  assert.ok(route.points.some(point => point.y < 136));
  assert.ok(route.length > Math.hypot(280, 0));
  for (let i = 1; i < route.points.length; i++) {
    assert.ok(terrain.lineClear(route.points[i - 1].x, route.points[i - 1].y, route.points[i].x, route.points[i].y));
  }
});

test('empty returners also retrace their own detour without advertising food', () => {
  const terrain = forkTerrain();
  const world = new World(5, 1, terrain);
  world.reserve = 8;
  const ant = world.ants[0];
  ant.route = new RouteMemory(500, 320);
  for (const [x, y] of [[540, 320], [564, 112], [660, 112], [780, 320]]) ant.route.record(x, y, terrain, true);
  ant.x = 780; ant.y = 320; ant.returning = true;
  ant.returnIndex = ant.route.points.length - 1;
  terrain.homeWaypoint = () => { throw new Error('An empty returner must use its own route too'); };
  let tookDetour = false;
  for (let i = 0; i < 40 / STEP && ant.returning; i++) {
    world.step();
    tookDetour ||= ant.x >= 73 * CELL && ant.x <= 78 * CELL && ant.y < 17 * CELL;
    assert.ok(terrain.canStand(ant.x, ant.y));
  }
  assert.ok(tookDetour);
  assert.ok(!ant.returning);
  assert.equal(world.delivered, 0);
  assert.ok(world.pheromone.every(value => value === 0));
});

test('competing routes develop without assigned quality scores and an efficient branch can become stronger', () => {
  const world = new World(5, 80, forkTerrain());
  world.reserve += 164;
  world.supplied += 164;
  for (let i = 0; i < 100; i++) world.addFood(780, 320);
  // Neither branch starts with pheromone; both must be discovered through movement.
  assert.equal(branchSignal(world, 8, 17) + branchSignal(world, 54, 63), 0);
  for (let i = 0; i < 120 / STEP; i++) world.step();
  assert.ok(branchSignal(world, 8, 17) > 0);
  assert.ok(branchSignal(world, 54, 63) > 0, 'both independently discovered branches should be visible');
  for (let i = 0; i < 300 / STEP; i++) world.step();
  let longer = 0, shorter = 0;
  // Average a window so this checks sustained reinforcement rather than one passing ant.
  for (let i = 0; i < 60 / STEP; i++) {
    world.step();
    longer += branchSignal(world, 8, 17);
    shorter += branchSignal(world, 54, 63);
  }
  assert.ok(shorter > longer * 1.2, 'the shorter branch should gain sustained trail strength over time');
  assert.ok(longer > 0, 'the other route remains possible');
  assert.ok(world.delivered > 100);
  const accounted = world.food.reduce((sum, patch) => sum + patch.amount, 0)
    + world.ants.filter(ant => ant.carrying).length + world.reserve + world.consumed + world.growthSpent + world.lostCarried;
  assert.ok(Math.abs(world.initialReserve + world.supplied - accounted) < 1e-6);
});
