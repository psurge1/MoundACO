import { CELL, COLS, HEIGHT, WIDTH, depositField } from './field';
import { Terrain } from './terrain';
import { FOOD_PER_CLICK, MAX_FOOD_PER_CLICK, Random, RIVALRY, STEP, World, type Ant, type Food } from './world';

export interface Colony { id: number; colorId: number; world: World }
interface Fighter { world: World; ant: Ant }
interface Fight { a: Fighter; b: Fighter; endsAt: number }
export const COLONY_LIMIT = 8;

/** One physical world; colonies share food and terrain, never their scent fields. */
export class Sandbox {
  readonly colonies: Colony[] = [];
  readonly food: Food[] = [];
  readonly random: Random;
  readonly placementRandom: Random;
  elapsed = 0;
  halfLife = 22;
  energyEnabled = true;
  recruitmentFraction = RIVALRY.recruitment;
  private nextId = 1;
  private fights: Fight[] = [];

  constructor(readonly seed = 1847, readonly initialPopulation = 48, count = 2,
    readonly terrain = new Terrain(seed)) {
    this.random = new Random(seed ^ 0x636f6d62);
    this.placementRandom = new Random(seed ^ 0x6e657374);
    for (let i = 0; i < Math.min(COLONY_LIMIT, count); i++) this.addColony();
  }

  canPlaceNest(x: number, y: number): boolean {
    return this.terrain.canStand(x, y, 32)
      && this.colonies.every(c => Math.hypot(c.world.nest.x - x, c.world.nest.y - y) >= 100)
      && this.food.every(p => Math.hypot(p.x - x, p.y - y) >= 56);
  }

  addColony(point?: { x: number; y: number }): Colony | null {
    if (this.colonies.length >= COLONY_LIMIT) return null;
    if (!point) {
      for (let attempt = 0; attempt < 2000; attempt++) {
        const candidate = { x: 48 + this.placementRandom.next() * (WIDTH - 96), y: 48 + this.placementRandom.next() * (HEIGHT - 96) };
        if (this.canPlaceNest(candidate.x, candidate.y)) { point = candidate; break; }
      }
    }
    if (!point || !this.canPlaceNest(point.x, point.y)) return null;
    const id = this.nextId++;
    const world = new World(this.seed + id * 997, this.initialPopulation, this.terrain, { ...point }, this.food);
    world.halfLife = this.halfLife;
    world.energyEnabled = this.energyEnabled;
    world.recruitmentFraction = this.recruitmentFraction;
    const colorId = Array.from({ length: COLONY_LIMIT }, (_, i) => i + 1).find(color => !this.colonies.some(c => c.colorId === color))!;
    const colony = { id, colorId, world };
    this.colonies.push(colony);
    this.connect();
    return colony;
  }

  removeColony(id: number): void {
    const index = this.colonies.findIndex(c => c.id === id);
    if (index < 0) return;
    const removed = this.colonies.splice(index, 1)[0].world;
    removed.ants.length = removed.brood.length = removed.alarms.length = 0;
    removed.reserve = 0; removed.extinct = true;
    removed.pheromone.fill(0); removed.alarm.fill(0);
    removed.rivals = [];
    this.refreshFights();
    this.connect();
  }

  private connect(): void {
    for (const c of this.colonies) c.world.rivals = this.colonies.filter(r => r !== c).map(r => r.world);
  }

  addFood(x: number, y: number, amount = FOOD_PER_CLICK): boolean {
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_FOOD_PER_CLICK) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !this.terrain.canStand(x, y, 18)
      || this.colonies.some(c => Math.hypot(c.world.nest.x - x, c.world.nest.y - y) < 38)) return false;
    const patch = this.food.find(p => Math.hypot(p.x - x, p.y - y) < 24);
    if (patch) patch.amount += amount;
    else if (this.food.length < 128) this.food.push({ x, y, amount });
    else return false;
    return true;
  }

  private emit(world: World, ant: Ant): void {
    depositField(world.alarm, ant.x, ant.y, 8, this.terrain.blocked);
    const prior = world.alarms.find(p => Math.hypot(p.x - ant.x, p.y - ant.y) < 16);
    if (prior) { prior.x = ant.x; prior.y = ant.y; prior.until = world.elapsed + 9; }
    else world.alarms.push({ x: ant.x, y: ant.y, until: world.elapsed + 9 });
  }

  private refreshFights(): void {
    const alive = new Set(this.colonies.flatMap(c => c.world.ants));
    this.fights = this.fights.filter(f => alive.has(f.a.ant) && alive.has(f.b.ant));
    for (const ant of alive) ant.fighting = false;
    for (const f of this.fights) f.a.ant.fighting = f.b.ant.fighting = true;
  }

  private encounters(): void {
    this.refreshFights();
    const disengaged = new Set<Ant>();
    const remaining: Fight[] = [];
    for (const fight of this.fights) {
      const { a, b } = fight;
      if (disengaged.has(a.ant) || disengaged.has(b.ant)) continue;
      this.emit(a.world, a.ant); this.emit(b.world, b.ant);
      if (this.elapsed < fight.endsAt) { remaining.push(fight); continue; }
      // A different encounter may have left both participants carrying food.
      if (a.ant.carrying && b.ant.carrying) continue;
      a.ant.alarmTarget = b.ant.alarmTarget = null;
      const loser = this.random.next() < 0.5 ? a : b;
      const winner = loser === a ? b : a;
      if (loser.ant.carrying) {
        winner.ant.cargoAmount = loser.ant.cargoAmount ?? 1;
        winner.world.takeCargo(winner.ant);
      }
      if (this.random.next() < loser.world.retreatChance) {
        loser.world.resumeForaging(loser.ant);
        loser.ant.angle = Math.atan2(loser.ant.y - winner.ant.y, loser.ant.x - winner.ant.x);
        loser.ant.decisionIn = 0.4; // heading persistence, never immunity
      } else {
        loser.world.ants.splice(loser.world.ants.indexOf(loser.ant), 1);
        loser.world.deaths++;
      }
      disengaged.add(loser.ant);
    }
    this.fights = remaining.filter(f => !disengaged.has(f.a.ant) && !disengaged.has(f.b.ant));
    this.refreshFights();
    const entries = this.colonies.flatMap(c => c.world.ants.map(ant => ({ world: c.world, ant })));
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(this.random.next() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    const buckets = new Map<number, Fighter[]>();
    const pairs = new Map<Ant, Set<Ant>>();
    const remember = (a: Ant, b: Ant) => {
      const seen = pairs.get(a) ?? new Set<Ant>(); seen.add(b); pairs.set(a, seen);
    };
    for (const f of this.fights) remember(f.a.ant, f.b.ant);
    for (const entry of entries) {
      const key = Math.floor(entry.ant.y / CELL) * COLS + Math.floor(entry.ant.x / CELL);
      const bucket = buckets.get(key) ?? [];
      bucket.push(entry); buckets.set(key, bucket);
    }
    for (const a of entries) {
      const col = Math.floor(a.ant.x / CELL), row = Math.floor(a.ant.y / CELL);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        for (const b of buckets.get((row + dy) * COLS + col + dx) ?? []) {
          if (a.world === b.world || (a.ant.carrying && b.ant.carrying)
            || pairs.get(a.ant)?.has(b.ant) || pairs.get(b.ant)?.has(a.ant)
            || Math.hypot(a.ant.x - b.ant.x, a.ant.y - b.ant.y) >= RIVALRY.encounterRadius
            || !this.terrain.lineClear(a.ant.x, a.ant.y, b.ant.x, b.ant.y)) continue;
          remember(a.ant, b.ant);
          this.fights.push({ a, b, endsAt: this.elapsed + RIVALRY.fightDuration });
          a.ant.fighting = b.ant.fighting = true;
          this.emit(a.world, a.ant); this.emit(b.world, b.ant);
        }
      }
    }
    for (const { world } of this.colonies) {
      if (!world.ants.length && !world.brood.length) world.extinct = true;
    }
  }

  step(): void {
    this.elapsed += STEP;
    this.refreshFights();
    // Alternate stepping order to avoid persistent pickup preference by colony index.
    const ordered = Math.round(this.elapsed / STEP) % 2 ? this.colonies : [...this.colonies].reverse();
    for (const { world } of ordered) {
      world.halfLife = this.halfLife; world.energyEnabled = this.energyEnabled;
      world.recruitmentFraction = this.recruitmentFraction;
      world.step();
    }
    this.encounters();
  }
}
