import { CELL, COLS, HEIGHT, ROWS, WIDTH, depositField, sampleField } from './field';
import { Random } from './random';
import { Terrain } from './terrain';
import { RouteMemory } from './route';
import { ENERGY_RECOVERY_PER_SECOND, MAX_ENERGY, energySpeed, movementEnergy } from './energy';
export { Random } from './random';
export { CELL, COLS, HEIGHT, ROWS, WIDTH } from './field';

export const STEP = 1 / 30;
export const MAX_POPULATION = 350;
export const FOOD_PER_CLICK = 80;
export const MAX_FOOD_PER_CLICK = 10000;
const DIRECTIONS = 24;
/** Shared implementation tuning, not colony-specific advantages. */
export const RIVALRY = { retreatChance: 0.3, recruitment: 0.25, broodCost: 4, broodInterval: 8, maturation: 40, maturationFoodScale: 100, alarmHalfLife: 3, encounterRadius: 7, fightDuration: 1 };


export interface Ant {
  x: number;
  y: number;
  angle: number;
  carrying: boolean;
  fighting: boolean;
  cargoAmount?: number;
  decisionIn: number;
  scout: boolean;
  returning: boolean;
  searchTime: number;
  searchLimit: number;
  outboundAngle: number;
  homeTarget: { x: number; y: number } | null;
  route: RouteMemory;
  returnIndex: number;
  trailExtended: boolean;
  energy: number;
  resting: boolean;
  tripDistance: number;
  alarmTarget: { x: number; y: number } | null;
  recruitmentRank: number;
}

export interface Food { x: number; y: number; amount: number }

export class World {
  /** Remaining developmental seconds at the unfed maturation rate. */
  readonly brood: number[] = [];
  readonly alarm = new Float32Array(COLS * ROWS);
  readonly alarms: { x: number; y: number; until: number }[] = [];
  rivals: World[] = [];
  recruitmentFraction = RIVALRY.recruitment;
  retreatChance = RIVALRY.retreatChance;
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
  energyEnabled = true;
  energyUsed = 0;
  distanceTravelled = 0;
  deliveryDistance = 0;
  restSeconds = 0;
  private birthClock = 0;
  private deathClock = 0;
  private spawned = 0;
  private readonly failedDirections = new Float32Array(DIRECTIONS);

  constructor(readonly seed = 1847, readonly initialPopulation = 48, readonly terrain = new Terrain(seed),
    readonly nest = { x: WIDTH / 2, y: HEIGHT / 2 }, sharedFood?: Food[]) {
    if (sharedFood) this.food = sharedFood;
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
      angle, carrying: false, fighting: false, decisionIn: this.random.next() * 0.18,
      scout, returning: false, searchTime: 0,
      searchLimit: this.searchBudget(scout), outboundAngle: angle,
      homeTarget: null,
      route, returnIndex: -1,
      trailExtended: false,
      energy: MAX_ENERGY, resting: false, tripDistance: 0,
      alarmTarget: null, recruitmentRank: (this.spawned * 0.61803398875) % 1,
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
    ant.alarmTarget = null;
    ant.returning = false;
    ant.homeTarget = null;
    ant.route = new RouteMemory(this.nest.x, this.nest.y);
    ant.route.record(ant.x, ant.y, this.terrain, true);
    ant.returnIndex = -1;
    ant.resting = false;
    ant.tripDistance = 0;
    ant.trailExtended = false;
    ant.searchTime = 0;
    ant.searchLimit = this.searchBudget(ant.scout);
    ant.angle = this.departureAngle(ant.scout);
    ant.outboundAngle = ant.angle;
    ant.decisionIn = 0;
  }

  addFood(x: number, y: number, amount = FOOD_PER_CLICK): boolean {
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_FOOD_PER_CLICK) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    x = Math.max(18, Math.min(WIDTH - 18, x));
    y = Math.max(18, Math.min(HEIGHT - 18, y));
    // Keep food outside the nest, where workers can visibly collect it.
    if (Math.hypot(x - this.nest.x, y - this.nest.y) < 38) return false;
    if (!this.terrain.canStand(x, y, 18)) return false;
    const existing = this.food.find(p => Math.hypot(p.x - x, p.y - y) < 24);
    if (existing) existing.amount += amount;
    else if (this.food.length < 128) this.food.push({ x, y, amount });
    else return false;
    this.supplied += amount;
    return true;
  }

  private turn(ant: Ant): void {
    // Ants smell food only nearby; distant patches are discovered by exploration.
    if (ant.alarmTarget) {
      const target = ant.alarmTarget;
      if (Math.hypot(target.x - ant.x, target.y - ant.y) < 14) {
        const enemy = this.rivals.flatMap(r => r.ants).find(a => Math.hypot(a.x - ant.x, a.y - ant.y) < 24
          && this.terrain.lineClear(ant.x, ant.y, a.x, a.y));
        if (enemy) { ant.angle = Math.atan2(enemy.y - ant.y, enemy.x - ant.x); return; }
        ant.alarmTarget = null;
      } else if (this.terrain.lineClear(ant.x, ant.y, target.x, target.y)) {
        ant.angle = Math.atan2(target.y - ant.y, target.x - ant.x); return;
      } else ant.alarmTarget = null;
    }
    const sources = [...this.food, ...this.rivals.filter(r => r.reserve > 0 || r.brood.length).map(r => ({ ...r.nest, amount: 1 }))];
    const nearby = sources.find(p => p.amount > 0 && Math.hypot(p.x - ant.x, p.y - ant.y) < 65
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
    const alarmFade = Math.pow(0.5, STEP / Math.min(RIVALRY.alarmHalfLife, this.halfLife / 2));
    for (let i = 0; i < this.pheromone.length; i++) {
      this.pheromone[i] *= fade;
      this.alarm[i] *= alarmFade;
    }
    const failureFade = Math.pow(0.5, STEP / 40);
    for (let i = 0; i < this.failedDirections.length; i++) this.failedDirections[i] *= failureFade;
    for (let i = this.alarms.length - 1; i >= 0; i--) if (this.alarms[i].until < this.elapsed) this.alarms.splice(i, 1);
    if (this.extinct) return;

    for (const ant of this.ants) {
      if (!this.energyEnabled) ant.energy = MAX_ENERGY;
      if (ant.fighting) continue;
      if (ant.resting) {
        this.restSeconds += STEP;
        ant.energy = Math.min(MAX_ENERGY, ant.energy + ENERGY_RECOVERY_PER_SECOND * STEP);
        if (ant.energy >= MAX_ENERGY) this.beginTrip(ant);
        continue;
      }
      if (!ant.carrying && !ant.resting && ant.recruitmentRank < this.recruitmentFraction && !ant.alarmTarget) {
        const signal = this.alarms.find(p => Math.hypot(p.x - ant.x, p.y - ant.y) < 65
          && sampleField(this.alarm, p.x, p.y) > 0.15 && this.terrain.lineClear(ant.x, ant.y, p.x, p.y)
          && this.rivals.some(r => r.ants.some(a => Math.hypot(a.x - p.x, a.y - p.y) < 24)));
        if (signal) {
          this.resumeForaging(ant);
          ant.alarmTarget = { x: signal.x, y: signal.y };
          ant.decisionIn = 0;
        }
      }
      if (!ant.carrying && !ant.returning && !ant.alarmTarget) {
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
      const baseSpeed = ant.carrying ? 45 : ant.returning ? 55 : 40;
      const speed = baseSpeed * (this.energyEnabled ? energySpeed(ant.energy) : 1);
      const distance = ant.homeTarget ? Math.min(speed * STEP, Math.hypot(ant.x - ant.homeTarget.x, ant.y - ant.homeTarget.y)) : speed * STEP;
      const x = ant.x + Math.cos(ant.angle) * distance;
      const y = ant.y + Math.sin(ant.angle) * distance;
      if (this.terrain.canStand(x, y)) {
        const travelled = Math.hypot(x - ant.x, y - ant.y);
        ant.tripDistance += travelled;
        this.distanceTravelled += travelled;
        if (this.energyEnabled) {
          const cost = Math.min(ant.energy, movementEnergy(travelled, ant.carrying));
          ant.energy -= cost;
          this.energyUsed += cost;
        }
        if (ant.carrying) {
          // Every carrier lays the same signal per unit actually walked. No route score.
          depositField(this.pheromone, ant.x, ant.y, travelled * 0.6, this.terrain.blocked);
        }
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
            this.reserve += ant.cargoAmount ?? 1;
            ant.cargoAmount = undefined;
            this.delivered++;
            this.deliveryDistance += ant.tripDistance;
            const sector = this.directionIndex(ant.outboundAngle);
            this.failedDirections[sector] *= 0.5;
          }
          if (this.energyEnabled && ant.energy < MAX_ENERGY) {
            ant.returning = false;
            ant.homeTarget = null;
            ant.resting = true;
          } else this.beginTrip(ant);
        }
      } else if (!ant.alarmTarget) {
        const patch = this.food.find(p => p.amount > 0 && Math.hypot(p.x - ant.x, p.y - ant.y) < 14
          && this.terrain.lineClear(ant.x, ant.y, p.x, p.y));
        if (patch) {
          patch.amount--;
          this.takeCargo(ant);
        } else {
          const rival = this.rivals.find(r => (r.reserve > 0 || r.brood.length > 0)
            && Math.hypot(r.nest.x - ant.x, r.nest.y - ant.y) < 20
            && this.terrain.lineClear(ant.x, ant.y, r.nest.x, r.nest.y));
          if (rival) {
            // One carried unit; any remaining stored food protects brood from raiding.
            if (rival.reserve > 0) {
              const amount = Math.min(1, rival.reserve);
              rival.reserve -= amount;
              ant.cargoAmount = amount;
            } else { rival.brood.pop(); ant.cargoAmount = 1; }
            this.takeCargo(ant);
          }
        }
      }
    }
    for (let i = this.food.length - 1; i >= 0; i--) {
      if (this.food[i].amount <= 0) this.food.splice(i, 1);
    }
    this.updatePopulation();
  }

  private updatePopulation(): void {
    // More stored food speeds existing brood smoothly, up to (but never beyond) 2×.
    // No food still gives the baseline rate; progress is never reset by reserve changes.
    const food = Math.max(0, this.reserve);
    const maturationRate = 1 + food / (food + RIVALRY.maturationFoodScale);
    for (let i = this.brood.length - 1; i >= 0; i--) {
      this.brood[i] -= STEP * maturationRate;
      if (this.brood[i] <= 0) {
        if (!this.ants.length) { this.starvationTime = 0; this.deathClock = 0; }
        this.brood.splice(i, 1); this.spawn(); this.births++;
      }
    }
    if (!this.ants.length && !this.brood.length) { this.extinct = true; return; }
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
          this.lostCarried += removed.reduce((sum, a) => sum + (a.carrying ? a.cargoAmount ?? 1 : 0), 0);
          this.deaths += removed.length;

        }
      }
    } else {
      this.starvationTime = 0;
      this.deathClock = 0;
      if (this.reserve > this.ants.length * 0.9 + 8 && this.ants.length + this.brood.length < MAX_POPULATION) {
        this.birthClock += STEP;
        if (this.birthClock >= RIVALRY.broodInterval) {
          this.birthClock -= RIVALRY.broodInterval;
          this.reserve -= RIVALRY.broodCost;
          this.growthSpent += RIVALRY.broodCost;
          this.brood.push(RIVALRY.maturation);
        }
      } else this.birthClock = 0;
    }
  }

  /** Preserve the physically explored return route when an empty returner changes tasks. */
  resumeForaging(ant: Ant): void {
    if ((ant.returning || ant.carrying) && ant.returnIndex >= 0) {
      const points = ant.route.points.slice(0, Math.max(1, ant.returnIndex + 1));
      ant.route = new RouteMemory(this.nest.x, this.nest.y);
      for (const p of points.slice(1)) ant.route.record(p.x, p.y, this.terrain, true);
    }
    ant.route.record(ant.x, ant.y, this.terrain, true);
    ant.returning = false;
    ant.carrying = false;
    ant.cargoAmount = undefined;
    ant.resting = false;
    ant.homeTarget = null;
    ant.alarmTarget = null;
    ant.searchTime = 0;
  }

  takeCargo(ant: Ant): void {
    const amount = ant.cargoAmount;
    if (ant.returning) this.resumeForaging(ant);
    ant.cargoAmount = amount;
    ant.carrying = true;
    ant.resting = false;
    ant.alarmTarget = null;
    ant.homeTarget = null;
    ant.route.record(ant.x, ant.y, this.terrain, true);
    ant.returnIndex = ant.route.points.length - 1;
  }

  get status(): 'exploring' | 'foraging' | 'growing' | 'low food' | 'starving' | 'extinct' {
    if (this.extinct) return 'extinct';
    if (this.reserve <= 0) return 'starving';
    if (this.reserve < this.ants.length * 0.15) return 'low food';
    if (this.reserve > this.ants.length * 0.9 + 8 && this.ants.length + this.brood.length < MAX_POPULATION) return 'growing';
    return this.delivered ? 'foraging' : 'exploring';
  }
}
