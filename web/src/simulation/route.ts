import { CELL, COLS } from './field';
import { Terrain } from './terrain';

export interface Point { x: number; y: number }

/** An ant's own breadcrumbs. Only revisited cells can erase a loop. */
export class RouteMemory {
  readonly points: Point[];
  private readonly visits = new Map<number, number>();

  constructor(x: number, y: number) {
    this.points = [{ x, y }];
    this.visits.set(this.cell(x, y), 0);
  }

  private cell(x: number, y: number): number {
    return Math.floor(y / CELL) * COLS + Math.floor(x / CELL);
  }

  record(x: number, y: number, terrain: Terrain, force = false): void {
    const last = this.points[this.points.length - 1];
    if (Math.hypot(x - last.x, y - last.y) < 0.0001) return;
    const cell = this.cell(x, y);
    const previous = this.visits.get(cell);
    if (previous !== undefined && previous < this.points.length - 2
      && terrain.lineClear(this.points[previous].x, this.points[previous].y, x, y)) {
      this.points.length = previous + 1;
      this.visits.clear();
      this.points.forEach((point, index) => this.visits.set(this.cell(point.x, point.y), index));
    } else if (!force && Math.hypot(x - last.x, y - last.y) < 4) return;
    // Straighten only nearby, visible bends. This cannot pick another side of an obstacle.
    let trimmed = false;
    while (this.points.length > 1) {
      const before = this.points[this.points.length - 2];
      if (Math.hypot(x - before.x, y - before.y) > 24 || !terrain.lineClear(before.x, before.y, x, y)) break;
      this.points.pop();
      trimmed = true;
    }
    if (trimmed) {
      this.visits.clear();
      this.points.forEach((point, index) => this.visits.set(this.cell(point.x, point.y), index));
    }
    this.points.push({ x, y });
    this.visits.set(cell, this.points.length - 1);
  }

  get length(): number {
    let length = 0;
    for (let i = 1; i < this.points.length; i++) {
      length += Math.hypot(this.points[i].x - this.points[i - 1].x, this.points[i].y - this.points[i - 1].y);
    }
    return length;
  }
}
