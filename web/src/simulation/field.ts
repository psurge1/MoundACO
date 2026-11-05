export const WIDTH = 1000;
export const HEIGHT = 640;
export const CELL = 8;
export const COLS = WIDTH / CELL;
export const ROWS = HEIGHT / CELL;

/** Sample between cell centers rather than snapping a sensor to a grid cell. */
export function sampleField(field: Float32Array, x: number, y: number): number {
  const gx = Math.max(0, Math.min(COLS - 1, x / CELL - 0.5));
  const gy = Math.max(0, Math.min(ROWS - 1, y / CELL - 0.5));
  const col = Math.floor(gx), row = Math.floor(gy);
  const right = Math.min(col + 1, COLS - 1), below = Math.min(row + 1, ROWS - 1);
  const fx = gx - col, fy = gy - row;
  const top = field[row * COLS + col] * (1 - fx) + field[row * COLS + right] * fx;
  const bottom = field[below * COLS + col] * (1 - fx) + field[below * COLS + right] * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Distribute a deposit continuously across neighboring cells. */
export function depositField(field: Float32Array, x: number, y: number, amount: number, blocked?: Uint8Array): void {
  const gx = Math.max(0, Math.min(COLS - 1, x / CELL - 0.5));
  const gy = Math.max(0, Math.min(ROWS - 1, y / CELL - 0.5));
  const col = Math.floor(gx), row = Math.floor(gy);
  const fx = gx - col, fy = gy - row;
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      const index = Math.min(row + dy, ROWS - 1) * COLS + Math.min(col + dx, COLS - 1);
      if (blocked?.[index]) continue;
      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      field[index] = Math.min(12, field[index] + amount * weight);
    }
  }
}
