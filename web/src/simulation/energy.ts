export const MAX_ENERGY = 100;
export const ENERGY_PER_UNIT = 0.012;
export const LOADED_ENERGY_MULTIPLIER = 1.15;
export const ENERGY_RECOVERY_PER_SECOND = 8;

export function movementEnergy(distance: number, carrying: boolean): number {
  return distance * ENERGY_PER_UNIT * (carrying ? LOADED_ENERGY_MULTIPLIER : 1);
}

/** Exhaustion is a soft slowdown, never an immobilizing cutoff. */
export function energySpeed(energy: number): number {
  return 0.9 + 0.1 * Math.max(0, Math.min(1, energy / MAX_ENERGY));
}
