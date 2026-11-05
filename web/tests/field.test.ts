import assert from 'node:assert/strict';
import test from 'node:test';
import { CELL, COLS, ROWS, depositField, sampleField } from '../src/simulation/field.ts';
import { TrailRaster } from '../src/rendering/trails.ts';
import { defaultColonyPalette, palette, type ColonyPalette } from '../src/rendering/palette.ts';

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

function visibleColor(raster: TrailRaster, x: number, y: number): number[] {
  const base = (y * raster.width + x) * 4;
  const alpha = raster.pixels[base + 3] / 255;
  return [0, 1, 2].map(channel => {
    const background = Number.parseInt(palette.ground.slice(1 + channel * 2, 3 + channel * 2), 16);
    return raster.pixels[base + channel] * alpha + background * (1 - alpha);
  });
}

test('stronger trails keep darkening and preserve contrast near the top of the density range', () => {
  const field = new Float32Array(COLS * ROWS);
  const raster = new TrailRaster();
  const colors = [0, 1, 2, 4, 6, 8, 10, 12].map(density => {
    field.fill(density); raster.update(field);
    return visibleColor(raster, 240, 160);
  });
  for (let i = 1; i < colors.length; i++) {
    assert.ok(colors[i].every((value, channel) => value < colors[i - 1][channel]), 'overlaps should progressively darken');
  }
  const strong = colors[5], strongest = colors[7];
  const difference = Math.hypot(...strong.map((value, channel) => value - strongest[channel]));
  assert.ok(difference > 35, 'high-density paths should remain distinguishable before reaching the field cap');
});

test('nearby parallel trails retain a visible valley instead of blending into one band early', () => {
  const field = new Float32Array(COLS * ROWS);
  for (let row = 0; row < ROWS; row++) {
    field[row * COLS + 50] = 12;
    field[row * COLS + 52] = 12;
  }
  const raster = new TrailRaster();
  raster.update(field);
  const brightness = (column: number) => visibleColor(raster, column * 4 + 2, 160)
    .reduce((sum, value) => sum + value, 0) / 3;
  assert.ok(brightness(51) > brightness(50) + 20);
  assert.ok(brightness(51) > brightness(52) + 20);
});

test('colony trail palettes remain independent while preserving the same strength scale', () => {
  const otherColony: ColonyPalette = {
    worker: '#4e2540', nest: '#844566', emptyNest: '#bba6b0',
    trailLight: [184, 118, 154], trailDark: [100, 35, 72],
  };
  const field = new Float32Array(COLS * ROWS).fill(4);
  const teal = new TrailRaster(defaultColonyPalette), plum = new TrailRaster(otherColony);
  teal.update(field); plum.update(field);
  const tealColor = visibleColor(teal, 240, 160), plumColor = visibleColor(plum, 240, 160);
  assert.ok(Math.hypot(...tealColor.map((value, channel) => value - plumColor[channel])) > 30);
  assert.equal(teal.pixels[3], plum.pixels[3], 'colony identity must not distort displayed trail strength');
  const unchanged = teal.pixels.slice();
  plum.update(new Float32Array(COLS * ROWS).fill(8));
  assert.deepEqual(teal.pixels, unchanged, 'updating another colony must not recolor this one');
  assert.ok(field.every(value => value === 4));
});
