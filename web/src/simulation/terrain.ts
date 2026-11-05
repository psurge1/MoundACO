import { CELL, COLS, HEIGHT, ROWS, WIDTH } from './field';
import { Random } from './random';

export const ANT_RADIUS = 2.5;
const NEST_X = WIDTH / 2;
const NEST_Y = HEIGHT / 2;

export class Terrain {
  /** One means solid terrain. All zero cells form one cardinally connected region. */
  readonly blocked: Uint8Array;
  readonly homeDistance = new Int32Array(COLS * ROWS);

  constructor(seed: number, layout?: Uint8Array) {
    if (layout && layout.length !== COLS * ROWS) throw new Error('Invalid terrain dimensions');
    this.blocked = layout ? layout.slice() : this.generate(seed);
    // Leave enough room for spawning and foraging around the nest.
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (Math.hypot((col + 0.5) * CELL - NEST_X, (row + 0.5) * CELL - NEST_Y) < 80) {
          this.blocked[row * COLS + col] = 0;
        }
      }
    }
    this.buildHomeDistances();
    // Turn disconnected cavities into solid terrain; never leave unreachable open pockets.
    for (let i = 0; i < this.blocked.length; i++) {
      if (this.homeDistance[i] < 0) this.blocked[i] = 1;
    }
  }

  static empty(): Terrain { return new Terrain(0, new Uint8Array(COLS * ROWS)); }

  private generate(seed: number): Uint8Array {
    // A separate stream keeps geography independent of population and ant decisions.
    const random = new Random(seed ^ 0x74657272);
    const blocked = new Uint8Array(COLS * ROWS);
    for (let patch = 0; patch < 27; patch++) {
      const x = 70 + random.next() * (WIDTH - 140);
      const y = 65 + random.next() * (HEIGHT - 130);
      const rx = 26 + random.next() * 52;
      const ry = 24 + random.next() * 42;
      for (let row = Math.max(0, Math.floor((y - ry) / CELL)); row < Math.min(ROWS, Math.ceil((y + ry) / CELL)); row++) {
        for (let col = Math.max(0, Math.floor((x - rx) / CELL)); col < Math.min(COLS, Math.ceil((x + rx) / CELL)); col++) {
          if (((col + 0.5) * CELL - x) ** 2 / rx ** 2 + ((row + 0.5) * CELL - y) ** 2 / ry ** 2 < 1) {
            blocked[row * COLS + col] = 1;
          }
        }
      }
    }
    return blocked;
  }

  private neighbors(index: number): number[] {
    const col = index % COLS, row = Math.floor(index / COLS);
    const neighbors: number[] = [];
    if (col > 0) neighbors.push(index - 1);
    if (col < COLS - 1) neighbors.push(index + 1);
    if (row > 0) neighbors.push(index - COLS);
    if (row < ROWS - 1) neighbors.push(index + COLS);
    return neighbors;
  }

  private buildHomeDistances(): void {
    this.homeDistance.fill(-1);
    const start = Math.floor(NEST_Y / CELL) * COLS + Math.floor(NEST_X / CELL);
    const queue = new Int32Array(COLS * ROWS);
    let head = 0, tail = 1;
    queue[0] = start;
    this.homeDistance[start] = 0;
    while (head < tail) {
      const current = queue[head++];
      for (const next of this.neighbors(current)) {
        if (!this.blocked[next] && this.homeDistance[next] < 0) {
          this.homeDistance[next] = this.homeDistance[current] + 1;
          queue[tail++] = next;
        }
      }
    }
  }

  canStand(x: number, y: number, radius = ANT_RADIUS): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)
      || x < radius || y < radius || x > WIDTH - radius || y > HEIGHT - radius) return false;
    const minCol = Math.max(0, Math.floor((x - radius) / CELL));
    const maxCol = Math.min(COLS - 1, Math.floor((x + radius) / CELL));
    const minRow = Math.max(0, Math.floor((y - radius) / CELL));
    const maxRow = Math.min(ROWS - 1, Math.floor((y + radius) / CELL));
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (!this.blocked[row * COLS + col]) continue;
        const closestX = Math.max(col * CELL, Math.min((col + 1) * CELL, x));
        const closestY = Math.max(row * CELL, Math.min((row + 1) * CELL, y));
        if ((x - closestX) ** 2 + (y - closestY) ** 2 <= radius ** 2) return false;
      }
    }
    return true;
  }

  lineClear(x: number, y: number, targetX: number, targetY: number, radius = ANT_RADIUS): boolean {
    if (!this.canStand(x, y, radius) || !this.canStand(targetX, targetY, radius)) return false;
    // Exact segment / expanded-cell intersections prevent sampling from missing a corner.
    const minCol = Math.max(0, Math.floor((Math.min(x, targetX) - radius) / CELL));
    const maxCol = Math.min(COLS - 1, Math.floor((Math.max(x, targetX) + radius) / CELL));
    const minRow = Math.max(0, Math.floor((Math.min(y, targetY) - radius) / CELL));
    const maxRow = Math.min(ROWS - 1, Math.floor((Math.max(y, targetY) + radius) / CELL));
    const dx = targetX - x, dy = targetY - y;
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (!this.blocked[row * COLS + col]) continue;
        let enter = 0, exit = 1;
        const bounds = [[x, dx, col * CELL - radius, (col + 1) * CELL + radius],
          [y, dy, row * CELL - radius, (row + 1) * CELL + radius]];
        for (const [origin, delta, min, max] of bounds) {
          if (Math.abs(delta) < 1e-10) {
            if (origin < min || origin > max) { enter = 1; exit = 0; break; }
          } else {
            const a = (min - origin) / delta, b = (max - origin) / delta;
            enter = Math.max(enter, Math.min(a, b));
            exit = Math.min(exit, Math.max(a, b));
          }
        }
        if (enter <= exit) return false;
      }
    }
    return true;
  }

  /** Diagnostic topology utility. Ants retrace RouteMemory and must not call this. */
  homeWaypoint(x: number, y: number): { x: number; y: number } {
    if (this.lineClear(x, y, NEST_X, NEST_Y)) return { x: NEST_X, y: NEST_Y };
    let cell = Math.floor(y / CELL) * COLS + Math.floor(x / CELL);
    let target = { x: (cell % COLS + 0.5) * CELL, y: (Math.floor(cell / COLS) + 0.5) * CELL };
    // Follow the shared distance field and skip intermediate centers only when visible.
    for (let step = 0; step < 18 && this.homeDistance[cell] > 0; step++) {
      const next = this.neighbors(cell).find(index => this.homeDistance[index] >= 0
        && this.homeDistance[index] < this.homeDistance[cell]);
      if (next === undefined) break;
      const candidate = { x: (next % COLS + 0.5) * CELL, y: (Math.floor(next / COLS) + 0.5) * CELL };
      if (!this.lineClear(x, y, candidate.x, candidate.y)) break;
      target = candidate;
      cell = next;
    }
    return target;
  }
}
