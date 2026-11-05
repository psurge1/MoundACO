import { CELL, COLS, HEIGHT, ROWS, WIDTH, depositField, sampleField } from './field';
import { Random } from './random';
import { Terrain } from './terrain';
import { RouteMemory, routeReward } from './route';
export { Random } from './random';
export { CELL, COLS, HEIGHT, ROWS, WIDTH } from './field';

export const STEP = 1 / 30;
export const MAX_POPULATION = 350;
export const FOOD_PER_CLICK = 80;
const DIRECTIONS = 24;

export interface Ant {
  x: number;
  y: number;
  angle: number;
  carrying: boolean;
  decisionIn: number;
  returnTime: number;
  scout: boolean;
  returning: boolean;
  searchTime: number;
  searchLimit: number;
  outboundAngle: number;
  homeTarget: { x: number; y: number } | null;
  route: RouteMemory;
  returnIndex: number;
  routeQuality: number;
  trailExtended: boolean;
}

export interface Food { x: number; y: number; amount: number }

export class World {
  readonly nest = { x: WIDTH / 2, y: HEIGHT / 2 };
  readonly random: Random;
  readonly ants: Ant[] = [];
  readonly food: Food[] = [];
  readonly pheromone = new Float32Array(COLS * ROWS);
  readonly initialReserve = 36;
  reserve = this.initialReserve;
  elapsed = 0;
  delivered = 0;
  supplied = 0;
  consumed = 0;
  growthSpent = 0;
  lostCarried = 0;
  births = 0;
  deaths = 0;
  extinct = false;
  starvationTime = 0;
  halfLife = 22;
  private birthClock = 0;
  private deathClock = 0;
  private spawned = 0;
  private readonly failedDirections = new Float32Array(DIRECTIONS);

  constructor(readonly seed = 1847, readonly initialPopulation = 48, readonly terrain = new Terrain(seed)) {
    this.random = new Random(seed);
    for (let i = 0; i < Math.max(1, Math.min(MAX_POPULATION, Math.floor(initialPopulation))); i++) {
      this.spawn();
    }
  }

  private spawn(): void {
    const scout = this.spawned++ % 8 === 0;
    const angle = this.departureAngle(scout);
    const radius = this.random.next() * 14;
    const x = this.nest.x + Math.cos(angle) * radius;
    const y = this.nest.y + Math.sin(angle) * radius;
    const route = new RouteMemory(this.nest.x, this.nest.y);
    route.record(x, y, this.terrain, true);
    this.ants.push({
      x, y,
      angle, carrying: false, decisionIn: this.random.next() * 0.18, returnTime: 0,
      scout, returning: false, searchTime: 0,
      searchLimit: this.searchBudget(scout), outboundAngle: angle,
      homeTarget: null,
      route, returnIndex: -1, routeQuality: 0,
      trailExtended: false,
    });
  }

  private searchBudget(scout: boolean): number {
    return scout ? 45 + this.random.next() * 20 : 14 + this.random.next() * 6;
  }

  private directionIndex(angle: number): number {
    const turn = Math.PI * 2;
    return Math.floor(((angle % turn + turn) % turn) / turn * DIRECTIONS) % DIRECTIONS;
  }

  private departureAngle(scout: boolean): number {
    const weights = Array.from({ length: DIRECTIONS }, (_, sector) => {
      const angle = (sector + 0.5) / DIRECTIONS * Math.PI * 2;
      let trail = 0;
      for (const distance of [40, 70, 100]) {
        const x = this.nest.x + Math.cos(angle) * distance;
        const y = this.nest.y + Math.sin(angle) * distance;
        if (this.terrain.lineClear(this.nest.x, this.nest.y, x, y)) {
          trail += sampleField(this.pheromone, x, y);
        }
      }
      // Scouts keep exploring; workers strongly favor locally advertised routes.
      return scout ? 1 : (0.6 + Math.pow(trail, 1.1) * 6) / (1 + this.failedDirections[sector] * 3);
    });
    let choice = this.random.next() * weights.reduce((a, b) => a + b, 0);
    let sector = DIRECTIONS - 1;
    for (let i = 0; i < weights.length; i++) {
      choice -= weights[i];
      if (choice <= 0) { sector = i; break; }
    }
    return (sector + this.random.next()) / DIRECTIONS * Math.PI * 2;
  }

  private beginTrip(ant: Ant): void {
    ant.returning = false;
    ant.homeTarget = null;
    ant.route = new RouteMemory(this.nest.x, this.nest.y);
    ant.route.record(ant.x, ant.y, this.terrain, true);
    ant.returnIndex = -1;
    ant.routeQuality = 0;
    ant.trailExtended = false;
    ant.searchTime = 0;
    ant.searchLimit = this.searchBudget(ant.scout);
    ant.angle = this.departureAngle(ant.scout);
    ant.outboundAngle = ant.angle;
    ant.decisionIn = 0;
  }

  addFood(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    x = Math.max(18, Math.min(WIDTH - 18, x));
    y = Math.max(18, Math.min(HEIGHT - 18, y));
    // Keep food outside the nest, where workers can visibly collect it.
    if (Math.hypot(x - this.nest.x, y - this.nest.y) < 38) return false;
    if (!this.terrain.canStand(x, y, 18)) return false;
    const existing = this.food.find(p => Math.hypot(p.x - x, p.y - y) < 24);
    if (existing) existing.amount += FOOD_PER_CLICK;
    else if (this.food.length < 128) this.food.push({ x, y, amount: FOOD_PER_CLICK });
    else return false;
    this.supplied += FOOD_PER_CLICK;
    return true;
  }

  private turn(ant: Ant): void {
    // Ants smell food only nearby; distant patches are discovered by exploration.
    const nearby = this.food.find(p => p.amount > 0 && Math.hypot(p.x - ant.x, p.y - ant.y) < 65
      && this.terrain.lineClear(ant.x, ant.y, p.x, p.y));
    if (nearby) {
      ant.angle = Math.atan2(nearby.y - ant.y, nearby.x - ant.x);
      return;
    }
    const offsets = ant.scout ? [-0.4, -0.2, 0, 0.2, 0.4] : [-0.8, -0.4, 0, 0.4, 0.8];
    const weights = offsets.map(offset => {
      const direction = ant.angle + offset;
      const x = ant.x + Math.cos(direction) * 24;
      const y = ant.y + Math.sin(direction) * 24;
      if (!this.terrain.lineClear(ant.x, ant.y, x, y)) return 0;
      const trail = Math.hypot(x - this.nest.x, y - this.nest.y) > 28
        ? sampleField(this.pheromone, x, y) : 0;
      return 0.35 + (offset === 0 ? 0.65 : 0)
        + (ant.scout ? Math.sqrt(trail) * 0.4 : Math.pow(trail, 1.1) * 2.2);
    });
    // Occasional independent exploration prevents a strong trail locking every ant in.
    if (this.random.next() < (ant.scout ? 0.1 : 0.025)) {
      const direction = ant.angle + (this.random.next() - 0.5) * (ant.scout ? 0.8 : 1.8);
      if (this.terrain.lineClear(ant.x, ant.y, ant.x + Math.cos(direction) * 12, ant.y + Math.sin(direction) * 12)) {
        ant.angle = direction;
        return;
      }
    }
    const total = weights.reduce((a, b) => a + b, 0);
    if (total === 0) { this.avoidWall(ant); return; }
    let choice = this.random.next() * total;
    for (let i = 0; i < offsets.length; i++) {
      choice -= weights[i];
      if (weights[i] > 0 && choice <= 0) { ant.angle += offsets[i]; break; }
    }
    ant.angle += (this.random.next() - 0.5) * 0.12;
  }

  private avoidWall(ant: Ant): void {
    const side = this.random.next() < 0.5 ? -1 : 1;
    for (const offset of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI]) {
      const direction = ant.angle + offset * side;
      if (this.terrain.lineClear(ant.x, ant.y, ant.x + Math.cos(direction) * 8, ant.y + Math.sin(direction) * 8)) {
        ant.angle = direction;
        return;
      }
    }
    // Even in a tight corner, the center of the current open cell is a safe fallback.
    const col = Math.floor(ant.x / CELL), row = Math.floor(ant.y / CELL);
    ant.angle = Math.atan2((row + 0.5) * CELL - ant.y, (col + 0.5) * CELL - ant.x);
  }

  step(): void {
    this.elapsed += STEP;
    const fade = Math.pow(0.5, STEP / this.halfLife);
    for (let i = 0; i < this.pheromone.length; i++) {
      this.pheromone[i] *= fade;
    }
    const failureFade = Math.pow(0.5, STEP / 40);
    for (let i = 0; i < this.failedDirections.length; i++) this.failedDirections[i] *= failureFade;
    if (this.extinct) return;

    for (const ant of this.ants) {
      if (!ant.carrying && !ant.returning) {
        ant.searchTime += STEP;
        if (!ant.scout && !ant.trailExtended && Math.hypot(ant.x - this.nest.x, ant.y - this.nest.y) > 60
          && sampleField(this.pheromone, ant.x, ant.y) > 0.2) {
          // A real trail earns one bounded extension; aimless trips keep their short budget.
          ant.searchLimit += 10;
          ant.trailExtended = true;
        }
        if (ant.searchTime >= ant.searchLimit) {
          ant.returning = true;
          ant.homeTarget = null;
          ant.route.record(ant.x, ant.y, this.terrain, true);
          ant.returnIndex = ant.route.points.length - 1;
          const sector = this.directionIndex(ant.outboundAngle);
          this.failedDirections[sector] = Math.min(8, this.failedDirections[sector] + 1);
        }
      }
      if (ant.carrying) {
        ant.returnTime += STEP;
        // Reward the route this ant actually discovered, rather than an oracle's route.
        depositField(this.pheromone, ant.x, ant.y,
          STEP * 40 * ant.routeQuality * Math.exp(-ant.returnTime / 45), this.terrain.blocked);
      }
      if (ant.carrying || ant.returning) {
        while (ant.returnIndex > 0 && Math.hypot(ant.x - ant.route.points[ant.returnIndex].x,
          ant.y - ant.route.points[ant.returnIndex].y) < 0.001) ant.returnIndex--;
        ant.homeTarget = ant.route.points[Math.max(0, ant.returnIndex)];
        ant.angle = Math.atan2(ant.homeTarget.y - ant.y, ant.homeTarget.x - ant.x);
      } else {
        ant.decisionIn -= STEP;
        if (ant.decisionIn <= 0) {
          this.turn(ant);
          ant.decisionIn = 0.18;
        }
      }
      const speed = ant.carrying ? 45 : ant.returning ? 55 : 40;
      const distance = ant.homeTarget ? Math.min(speed * STEP, Math.hypot(ant.x - ant.homeTarget.x, ant.y - ant.homeTarget.y)) : speed * STEP;
      const x = ant.x + Math.cos(ant.angle) * distance;
      const y = ant.y + Math.sin(ant.angle) * distance;
      if (this.terrain.canStand(x, y)) {
        if (!ant.carrying && !ant.returning) {
          const last = ant.route.points[ant.route.points.length - 1];
          // Preserve a bend before a sampled breadcrumb would cut across a wall.
          if (!this.terrain.lineClear(last.x, last.y, x, y)) ant.route.record(ant.x, ant.y, this.terrain, true);
          ant.route.record(x, y, this.terrain);
        }
        ant.x = x; ant.y = y;
      }
      else {
        ant.homeTarget = null;
        ant.decisionIn = 0;
        if (!ant.carrying && !ant.returning) this.avoidWall(ant);
      }
      if (ant.carrying || ant.returning) {
        if (Math.hypot(ant.x - this.nest.x, ant.y - this.nest.y) < 17) {
          if (ant.carrying) {
            ant.carrying = false;
            this.reserve++;
            this.delivered++;
            const sector = this.directionIndex(ant.outboundAngle);
            this.failedDirections[sector] *= 0.5;
          }
          this.beginTrip(ant);
        }
      } else {
        const patch = this.food.find(p => p.amount > 0 && Math.hypot(p.x - ant.x, p.y - ant.y) < 14
          && this.terrain.lineClear(ant.x, ant.y, p.x, p.y));
        if (patch) {
          patch.amount--;
          ant.carrying = true;
          ant.homeTarget = null;
          ant.returnTime = 0;
          ant.route.record(ant.x, ant.y, this.terrain, true);
          ant.returnIndex = ant.route.points.length - 1;
          ant.routeQuality = routeReward(ant.route.length);
        }
      }
    }
    for (let i = this.food.length - 1; i >= 0; i--) {
      if (this.food[i].amount <= 0) this.food.splice(i, 1);
    }
    this.updatePopulation();
  }

  private updatePopulation(): void {
    const meal = Math.min(this.reserve, this.ants.length * 0.006 * STEP);
    this.reserve -= meal;
    this.consumed += meal;
    if (this.reserve <= 0) {
      this.starvationTime += STEP;
      this.birthClock = 0;
      if (this.starvationTime > 15) {
        this.deathClock += STEP;
        if (this.deathClock >= 1.5) {
          this.deathClock -= 1.5;
          const count = Math.max(1, Math.ceil(this.ants.length * 0.03));
          const removed = this.ants.splice(-count);
          this.lostCarried += removed.filter(a => a.carrying).length;
          this.deaths += removed.length;
          if (!this.ants.length) this.extinct = true;
        }
      }
    } else {
      this.starvationTime = 0;
      this.deathClock = 0;
      if (this.reserve > this.ants.length * 0.9 + 8 && this.ants.length < MAX_POPULATION) {
        this.birthClock += STEP;
        if (this.birthClock >= 3) {
          this.birthClock -= 3;
          this.reserve -= 4;
          this.growthSpent += 4;
          this.spawn();
          this.births++;
        }
      } else this.birthClock = 0;
    }
  }

  get status(): 'exploring' | 'foraging' | 'growing' | 'low food' | 'starving' | 'extinct' {
    if (this.extinct) return 'extinct';
    if (this.reserve <= 0) return 'starving';
    if (this.reserve < this.ants.length * 0.15) return 'low food';
    if (this.reserve > this.ants.length * 0.9 + 8 && this.ants.length < MAX_POPULATION) return 'growing';
    return this.delivered ? 'foraging' : 'exploring';
  }
}
