import assert from 'node:assert/strict';
import test from 'node:test';
import { CELL, COLS, HEIGHT, ROWS, WIDTH } from '../src/simulation/field.ts';
import { Terrain } from '../src/simulation/terrain.ts';
import { STEP, World } from '../src/simulation/world.ts';
import { RouteMemory } from '../src/simulation/route.ts';

/** Independent flood fill: don't use the navigation field to verify the generator. */
function reachableCount(terrain: Terrain): number {
  const start = Math.floor(HEIGHT / 2 / CELL) * COLS + Math.floor(WIDTH / 2 / CELL);
  const seen = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head], col = current % COLS, row = Math.floor(current / COLS);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = col + dx, y = row + dy;
      const next = y * COLS + x;
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS || terrain.blocked[next] || seen.has(next)) continue;
      seen.add(next); queue.push(next);
    }
  }
  return seen.size;
}

test('procedural maps are deterministic, varied, and have no unreachable open cells across 100 seeds', () => {
  for (let seed = 0; seed < 100; seed++) {
    const terrain = new Terrain(seed);
    const open = terrain.blocked.reduce((sum, value) => sum + (value === 0 ? 1 : 0), 0);
    assert.ok(open > COLS * ROWS * 0.4 && open < COLS * ROWS * 0.95, `seed ${seed}: useful terrain coverage`);
    assert.equal(reachableCount(terrain), open, `seed ${seed}: all open cells must connect to the nest`);
    assert.ok(terrain.canStand(WIDTH / 2, HEIGHT / 2, 20));
    assert.deepEqual(terrain.blocked, new Terrain(seed).blocked);
  }
  assert.notDeepEqual(new Terrain(42).blocked, new Terrain(43).blocked);
  assert.deepEqual(new World(42, 12).terrain.blocked, new World(42, 120).terrain.blocked);
});

test('enclosed pockets become solid instead of leaving inaccessible floor', () => {
  const layout = new Uint8Array(COLS * ROWS);
  for (let row = 15; row <= 30; row++) {
    for (let col = 15; col <= 30; col++) {
      if (row === 15 || row === 30 || col === 15 || col === 30) layout[row * COLS + col] = 1;
    }
  }
  const terrain = new Terrain(0, layout);
  assert.equal(terrain.blocked[22 * COLS + 22], 1);
  assert.equal(reachableCount(terrain), terrain.blocked.reduce((sum, value) => sum + (value === 0 ? 1 : 0), 0));
});

test('returners escape a concave obstacle and deliver food without crossing walls', () => {
  const layout = new Uint8Array(COLS * ROWS);
  for (let row = 25; row <= 55; row++) layout[row * COLS + 50] = 1;
  for (let col = 25; col <= 50; col++) {
    layout[25 * COLS + col] = 1;
    layout[55 * COLS + col] = 1;
  }
  const terrain = new Terrain(0, layout);
  const world = new World(42, 12, terrain);
  const ant = world.ants[0];
  ant.x = 300; ant.y = 320; ant.carrying = true;
  ant.route = new RouteMemory(world.nest.x, world.nest.y);
  for (const [x, y] of [[420, 180], [180, 180], [180, 320], [300, 320]]) {
    ant.route.record(x, y, terrain, true);
  }
  ant.returnIndex = ant.route.points.length - 1;
  assert.ok(!terrain.lineClear(ant.x, ant.y, world.nest.x, world.nest.y));
  let escapedLeft = false;
  for (let i = 0; i < 40 / STEP && ant.carrying; i++) {
    world.step();
    escapedLeft ||= ant.x < 200;
    assert.ok(terrain.canStand(ant.x, ant.y), 'returning ant must retain physical clearance');
  }
  assert.ok(escapedLeft, 'the ant must leave through the opening rather than cross the U-shaped wall');
  assert.ok(!ant.carrying, 'the ant must finish its return');
  assert.ok(world.delivered > 0);
  assert.ok(world.pheromone.every((value, index) => !terrain.blocked[index] || value === 0));
});

test('food placement respects obstacles and leaves population accounting unchanged on rejection', () => {
  const world = new World();
  const blocked = world.terrain.blocked.findIndex(value => value === 1);
  const x = (blocked % COLS + 0.5) * CELL, y = (Math.floor(blocked / COLS) + 0.5) * CELL;
  assert.equal(world.addFood(x, y), false);
  assert.equal(world.supplied, 0);
  assert.equal(world.food.length, 0);
  assert.ok(world.addFood(550, 320));
});

test('ants remain outside obstacles and can forage on generated maps', () => {
  for (const seed of [1847, 42, 17, 0, 99]) {
    const world = new World(seed);
    world.addFood(550, 320); // Protected nest clearing supplies an accessible first patch.
    for (let i = 0; i < 60 / STEP; i++) {
      world.step();
      assert.ok(world.ants.every(ant => world.terrain.canStand(ant.x, ant.y)), `seed ${seed}: collision clearance`);
    }
    assert.ok(world.delivered > 0, `seed ${seed}: workers should forage around terrain`);
    assert.ok(world.pheromone.every((value, index) => !world.terrain.blocked[index] || value === 0));
  }
});

test('every sampled part of generated terrain has a usable homeward route', () => {
  for (const seed of [1847, 42, 17, 0, 99]) {
    const terrain = new Terrain(seed);
    for (let cell = 0; cell < COLS * ROWS; cell += 137) {
      if (terrain.blocked[cell]) continue;
      let x = (cell % COLS + 0.5) * CELL, y = (Math.floor(cell / COLS) + 0.5) * CELL;
      let target: { x: number; y: number } | null = null;
      let steps = 0;
      while (Math.hypot(x - WIDTH / 2, y - HEIGHT / 2) >= 17 && steps++ < 3000) {
        if (!target || Math.hypot(target.x - x, target.y - y) < 2) target = terrain.homeWaypoint(x, y);
        const distance = Math.hypot(target.x - x, target.y - y);
        const stride = Math.min(45 * STEP, distance);
        if (distance === 0) break;
        x += (target.x - x) / distance * stride;
        y += (target.y - y) / distance * stride;
        assert.ok(terrain.canStand(x, y), `seed ${seed}, cell ${cell}: safe waypoint route`);
      }
      assert.ok(Math.hypot(x - WIDTH / 2, y - HEIGHT / 2) < 17, `seed ${seed}, cell ${cell}: route must reach nest`);
    }
  }
});
