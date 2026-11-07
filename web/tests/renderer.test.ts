import assert from 'node:assert/strict';
import test from 'node:test';
import { Renderer } from '../src/rendering/canvas.ts';
import { Sandbox } from '../src/simulation/sandbox.ts';
import { Terrain } from '../src/simulation/terrain.ts';
import { COLS } from '../src/simulation/field.ts';

// Retain draw sources until inspection, like a browser queueing canvas operations.
class Context {
  image: { data: Uint8ClampedArray } | null = null;
  sources: Canvas[] = [];
  setTransform() {} fillRect() {} clearRect() {} beginPath() {} arc() {} fill() {} fillText() {} stroke() {}
  drawImage(source: Canvas) { this.sources.push(source); }
  putImageData(image: { data: Uint8ClampedArray }) { this.image = { data: image.data.slice() }; }
}
class Canvas {
  width = 1000; height = 640;
  context = new Context();
  getContext() { return this.context; }
  getBoundingClientRect() { return { width: 1000, height: 640 }; }
}

test('a rendered frame retains every colony trail in its own color, including after reset/removal', t => {
  const originals = new Map(['document', 'window', 'ImageData', 'ResizeObserver'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  Object.assign(globalThis, {
    document: { createElement: () => new Canvas() }, window: { devicePixelRatio: 1 },
    ImageData: class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} },
    ResizeObserver: class { observe() {} },
  });
  const canvas = new Canvas();
  const renderer = new Renderer(canvas as unknown as HTMLCanvasElement);
  const makeWorld = () => {
    const s = new Sandbox(42, 1, 0, Terrain.empty());
    s.addColony({ x: 300, y: 320 }); s.addColony({ x: 700, y: 320 });
    s.colonies[0].world.pheromone[40 * COLS + 40] = 10;
    s.colonies[1].world.pheromone[40 * COLS + 80] = 10;
    return s;
  };
  const frame = (s: Sandbox, visible = true) => {
    canvas.context.sources.length = 0;
    renderer.draw(s, visible);
    return canvas.context.sources.filter(source => source.context.image);
  };
  const strongestRGB = (source: Canvas) => {
    const pixels = source.context.image!.data;
    let strongest = 3;
    for (let i = 7; i < pixels.length; i += 4) if (pixels[i] > pixels[strongest]) strongest = i;
    assert.ok(pixels[strongest] > 0);
    return [...pixels.slice(strongest - 3, strongest)];
  };
  const s = makeWorld(); const sources = frame(s);
  assert.equal(sources.length, 2);
  assert.notEqual(sources[0], sources[1], 'queued draws must not share a mutable source canvas');
  const teal = strongestRGB(sources[0]), red = strongestRGB(sources[1]);
  assert.ok(teal[1] > teal[0]); assert.ok(red[0] > red[1]);
  assert.equal(frame(s, false).length, 0);
  s.removeColony(1); assert.equal(frame(s).length, 1);
  const resetSources = frame(makeWorld());
  assert.equal(resetSources.length, 2);
  assert.notEqual(resetSources[1], sources[1], 'reset must not reuse a previous colony surface');
  assert.ok(strongestRGB(resetSources[0])[1] > strongestRGB(resetSources[0])[0]);
});
