import { COLS, ROWS } from '../src/simulation/field';
import { Terrain } from '../src/simulation/terrain';
import { STEP, World } from '../src/simulation/world';

const seeds = [0, 1, 2, 3, 4, 5, 17, 42];
const seconds = 480;

function simulate(seed: number, energy: boolean) {
  const blocked = new Uint8Array(COLS * ROWS);
  for (let row = 17; row < 54; row++) {
    for (let col = 73; col < 78; col++) blocked[row * COLS + col] = 1;
  }
  const world = new World(seed, 80, new Terrain(0, blocked));
  world.energyEnabled = energy;
  // Stock both runs equally so the experiment can observe route learning rather than starvation.
  world.reserve += 164;
  world.supplied += 164;
  for (let i = 0; i < 100; i++) world.addFood(780, 320);
  let antSeconds = 0;
  for (let i = 0; i < seconds / STEP; i++) {
    world.step();
    antSeconds += world.ants.length * STEP;
  }
  return {
    delivered: world.delivered,
    distancePerDelivery: world.delivered ? world.deliveryDistance / world.delivered : null,
    foodPer1000Distance: world.distanceTravelled ? world.delivered / world.distanceTravelled * 1000 : 0,
    restPercent: antSeconds ? world.restSeconds / antSeconds * 100 : 0,
  };
}

const rows = seeds.map(seed => {
  const off = simulate(seed, false), on = simulate(seed, true);
  const distanceChange = off.distancePerDelivery && on.distancePerDelivery
    ? (on.distancePerDelivery / off.distancePerDelivery - 1) * 100 : null;
  const row = {
    seed, offDelivered: off.delivered, onDelivered: on.delivered,
    offTripDistance: off.distancePerDelivery === null ? null : Math.round(off.distancePerDelivery),
    onTripDistance: on.distancePerDelivery === null ? null : Math.round(on.distancePerDelivery),
    tripDistanceChangePercent: distanceChange === null ? null : +distanceChange.toFixed(2),
    offFoodPer1000Distance: +off.foodPer1000Distance.toFixed(3),
    onFoodPer1000Distance: +on.foodPer1000Distance.toFixed(3),
    onRestPercent: +on.restPercent.toFixed(2),
  };
  console.log(JSON.stringify(row));
  return row;
});

const changes = rows.flatMap(row => row.tripDistanceChangePercent === null ? [] : [row.tripDistanceChangePercent]);
const offDelivered = rows.reduce((sum, row) => sum + row.offDelivered, 0);
const onDelivered = rows.reduce((sum, row) => sum + row.onDelivered, 0);
const offEfficiency = rows.reduce((sum, row) => sum + row.offFoodPer1000Distance, 0);
const onEfficiency = rows.reduce((sum, row) => sum + row.onFoodPer1000Distance, 0);
console.log(JSON.stringify({
  seeds: seeds.length, simulatedSecondsPerRun: seconds,
  meanTripDistanceChangePercent: changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null,
  seedsWithShorterTrips: changes.filter(value => value < 0).length,
  totalDeliveriesChangePercent: offDelivered ? (onDelivered / offDelivered - 1) * 100 : null,
  meanFoodPerDistanceChangePercent: offEfficiency ? (onEfficiency / offEfficiency - 1) * 100 : null,
  meanRestPercent: rows.reduce((sum, row) => sum + row.onRestPercent, 0) / rows.length,
  note: 'Descriptive paired runs, not proof of general optimization. Energy changes timing, exploration, and population feedback.',
}));
