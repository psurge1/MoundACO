export const STEP = 1 / 30;
export const WIDTH = 1000;
export const HEIGHT = 640;
export const CELL = 8;
export const COLS = WIDTH / CELL;
export const ROWS = HEIGHT / CELL;
export const MAX_POPULATION = 350;
export const FOOD_PER_CLICK = 80;

export interface Ant {
  x: number;
  y: number;
  angle: number;
  carrying: boolean;
  decisionIn: number;
  returnTime: number;
}

export interface Food { x: number; y: number; amount: number }

export class Random {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

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

  constructor(readonly seed = 1847, readonly initialPopulation = 48) {
    this.random = new Random(seed);
    for (let i = 0; i < Math.max(1, Math.min(MAX_POPULATION, Math.floor(initialPopulation))); i++) {
      this.spawn();
    }
  }

  private spawn(): void {
    const angle = this.random.next() * Math.PI * 2;
    const radius = this.random.next() * 14;
    this.ants.push({
      x: this.nest.x + Math.cos(angle) * radius,
      y: this.nest.y + Math.sin(angle) * radius,
      angle, carrying: false, decisionIn: this.random.next() * 0.18, returnTime: 0,
    });
  }

  addFood(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    x = Math.max(18, Math.min(WIDTH - 18, x));
    y = Math.max(18, Math.min(HEIGHT - 18, y));
    // Keep food outside the nest, where workers can visibly collect it.
    if (Math.hypot(x - this.nest.x, y - this.nest.y) < 38) return false;
    const existing = this.food.find(p => Math.hypot(p.x - x, p.y - y) < 24);
    if (existing) existing.amount += FOOD_PER_CLICK;
    else if (this.food.length < 128) this.food.push({ x, y, amount: FOOD_PER_CLICK });
    else return false;
    this.supplied += FOOD_PER_CLICK;
    return true;
  }

  private index(x: number, y: number): number {
    const col = Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL)));
    const row = Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL)));
    return row * COLS + col;
  }

  private turn(ant: Ant): void {
    // Ants smell food only nearby; distant patches are discovered by exploration.
    const nearby = this.food.find(p => Math.hypot(p.x - ant.x, p.y - ant.y) < 65);
    if (nearby) {
      ant.angle = Math.atan2(nearby.y - ant.y, nearby.x - ant.x);
      return;
    }
    const offsets = [-0.8, -0.4, 0, 0.4, 0.8];
    const weights = offsets.map(offset => {
      const direction = ant.angle + offset;
      const x = ant.x + Math.cos(direction) * 24;
      const y = ant.y + Math.sin(direction) * 24;
      const trail = Math.hypot(x - this.nest.x, y - this.nest.y) > 28
        ? this.pheromone[this.index(x, y)] : 0;
      return 0.35 + (offset === 0 ? 0.65 : 0) + Math.pow(trail, 1.4) * 3;
    });
    // Occasional independent exploration prevents a strong trail locking every ant in.
    if (this.random.next() < 0.1) {
      ant.angle += (this.random.next() - 0.5) * 1.8;
      return;
    }
    let choice = this.random.next() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < offsets.length; i++) {
      choice -= weights[i];
      if (choice <= 0) { ant.angle += offsets[i]; break; }
    }
    ant.angle += (this.random.next() - 0.5) * 0.12;
  }

  step(): void {
    this.elapsed += STEP;
    const fade = Math.pow(0.5, STEP / this.halfLife);
    for (let i = 0; i < this.pheromone.length; i++) {
      this.pheromone[i] *= fade;
    }
    if (this.extinct) return;

    for (const ant of this.ants) {
      if (ant.carrying) {
        ant.returnTime += STEP;
        ant.angle = Math.atan2(this.nest.y - ant.y, this.nest.x - ant.x);
        const index = this.index(ant.x, ant.y);
        // The signal is strongest near the discovered food and fades on the way home.
        this.pheromone[index] = Math.min(12,
          this.pheromone[index] + STEP * 18 * Math.exp(-ant.returnTime / 18));
      } else {
        ant.decisionIn -= STEP;
        if (ant.decisionIn <= 0) {
          this.turn(ant);
          ant.decisionIn = 0.18;
        }
      }
      const speed = ant.carrying ? 45 : 40;
      ant.x += Math.cos(ant.angle) * speed * STEP;
      ant.y += Math.sin(ant.angle) * speed * STEP;
      if (ant.x < 4 || ant.x > WIDTH - 4) {
        ant.angle = Math.PI - ant.angle;
        ant.x = Math.max(4, Math.min(WIDTH - 4, ant.x));
      }
      if (ant.y < 4 || ant.y > HEIGHT - 4) {
        ant.angle = -ant.angle;
        ant.y = Math.max(4, Math.min(HEIGHT - 4, ant.y));
      }
      if (ant.carrying) {
        if (Math.hypot(ant.x - this.nest.x, ant.y - this.nest.y) < 17) {
          ant.carrying = false;
          this.reserve++;
          this.delivered++;
          ant.angle += Math.PI + (this.random.next() - 0.5) * 0.5;
        }
      } else {
        const patch = this.food.find(p => p.amount > 0 && Math.hypot(p.x - ant.x, p.y - ant.y) < 14);
        if (patch) {
          patch.amount--;
          ant.carrying = true;
          ant.returnTime = 0;
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
