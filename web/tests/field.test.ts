import assert from 'node:assert/strict';
import test from 'node:test';
import { CELL, COLS, ROWS, depositField, sampleField } from '../src/simulation/field.ts';
import { TrailRaster } from '../src/rendering/trails.ts';

test('deposits and sensor samples change continuously between cell centers', () => {
  const field = new Float32Array(COLS * ROWS);
  depositField(field, CELL, CELL, 4);
  assert.equal(field[0], 1);
  assert.equal(field[1], 1);
  assert.equal(field[COLS], 1);
  assert.equal(field[COLS + 1], 1);
  assert.equal(field.reduce((sum, value) => sum + value, 0), 4);
  field[0] = 0; field[1] = 8;
  assert.equal(sampleField(field, CELL, CELL / 2), 4);
  assert.ok(Math.abs(sampleField(field, CELL + 0.001, CELL / 2) - sampleField(field, CELL - 0.001, CELL / 2)) < 0.003);
});

test('edge deposits remain finite, bounded, and preserve unsaturated signal', () => {
  const field = new Float32Array(COLS * ROWS);
  depositField(field, 0, 0, 4);
  depositField(field, COLS * CELL, ROWS * CELL, 4);
  assert.equal(field.reduce((sum, value) => sum + value, 0), 8);
  depositField(field, 0, 0, 100);
  assert.ok(field.every(value => Number.isFinite(value) && value >= 0 && value <= 12));
  assert.equal(sampleField(field, -10, -10), 12);
});

test('trail display softens a cell impulse, leaves the engine untouched, and clears as the field fades', () => {
  const field = new Float32Array(COLS * ROWS);
  field[40 * COLS + 60] = 4;
  const original = field.slice();
  const raster = new TrailRaster();
  raster.update(field);
  assert.deepEqual(field, original);
  const y = 40 * 4 + 2;
  const alpha = (x: number) => raster.pixels[(y * raster.width + x) * 4 + 3];
  assert.ok(alpha(60 * 4 + 2) > alpha(59 * 4 + 2));
  assert.ok(alpha(59 * 4 + 2) > 0, 'the displayed signal should blend beyond one cell');
  assert.ok(new Set(Array.from({ length: 16 }, (_, i) => alpha(60 * 4 + 2 + i))).size > 6,
    'the trail edge should have a smooth opacity ramp rather than flat cell blocks');
  field.fill(0);
  raster.update(field);
  assert.ok(raster.pixels.every((value, index) => index % 4 !== 3 || value === 0));
});
