export const palette = {
  ground: '#dfcfb8',
  outside: '#cebaa0',
  obstacle: '#a58d72',
  food: '#839642',
  text: '#626e65',
  cursor: '#6d7e71',
  invalid: '#a34f42',
} as const;

/** One family per colony; food and terrain retain shared world colors. */
export interface ColonyPalette {
  readonly worker: string;
  readonly nest: string;
  readonly emptyNest: string;
  readonly trailLight: readonly [number, number, number];
  readonly trailDark: readonly [number, number, number];
}

export const defaultColonyPalette: ColonyPalette = {
  worker: '#153e3a',
  nest: '#2d685e',
  emptyNest: '#9aada3',
  trailLight: [78, 160, 147],
  trailDark: [18, 70, 67],
};
