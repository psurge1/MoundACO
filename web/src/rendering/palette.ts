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

const families: ColonyPalette[] = [
  defaultColonyPalette,
  { worker: '#65302d', nest: '#a25348', emptyNest: '#bba29a', trailLight: [205, 133, 113], trailDark: [105, 42, 36] },
  { worker: '#343e68', nest: '#59699c', emptyNest: '#a4a8ba', trailLight: [137, 155, 204], trailDark: [49, 62, 112] },
  { worker: '#60416b', nest: '#90619b', emptyNest: '#b3a2b7', trailLight: [180, 137, 192], trailDark: [91, 53, 107] },
  { worker: '#6d501e', nest: '#a67b30', emptyNest: '#b9ad94', trailLight: [205, 169, 86], trailDark: [108, 77, 25] },
  { worker: '#3f5526', nest: '#688242', emptyNest: '#a5af98', trailLight: [153, 177, 111], trailDark: [64, 91, 37] },
  { worker: '#713c53', nest: '#a35f7b', emptyNest: '#bba1ac', trailLight: [202, 143, 166], trailDark: [115, 54, 80] },
  { worker: '#344e60', nest: '#547e94', emptyNest: '#9eafb8', trailLight: [127, 172, 193], trailDark: [45, 80, 102] },
];
export function colonyPalette(id: number): ColonyPalette { return families[(id - 1) % families.length]; }
