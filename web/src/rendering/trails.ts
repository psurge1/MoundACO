import { COLS, ROWS } from '../simulation/field';
import { defaultColonyPalette, type ColonyPalette } from './palette';

const UPSCALE = 4;

/** A display-only blur and continuous density-to-opacity map; never changes the simulation. */
export class TrailRaster {
  readonly width = COLS * UPSCALE;
  readonly height = ROWS * UPSCALE;
  readonly pixels = new Uint8ClampedArray(this.width * this.height * 4);
  private readonly horizontal = new Float32Array(COLS * ROWS);
  private readonly blurred = new Float32Array(COLS * ROWS);
  private readonly left = new Uint16Array(this.width);
  private readonly right = new Uint16Array(this.width);
  private readonly fraction = new Float32Array(this.width);

  constructor(private readonly colors: ColonyPalette = defaultColonyPalette) {
    for (let x = 0; x < this.width; x++) {
      const col = Math.max(0, Math.min(COLS - 1, (x + 0.5) / UPSCALE - 0.5));
      this.left[x] = Math.floor(col);
      this.right[x] = Math.min(this.left[x] + 1, COLS - 1);
      this.fraction[x] = col - this.left[x];
    }
  }

  update(field: Float32Array): void {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        this.horizontal[i] = (field[y * COLS + Math.max(0, x - 1)] + field[i] * 6
          + field[y * COLS + Math.min(COLS - 1, x + 1)]) / 8;
      }
    }
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        this.blurred[i] = (this.horizontal[Math.max(0, y - 1) * COLS + x] + this.horizontal[i] * 6
          + this.horizontal[Math.min(ROWS - 1, y + 1) * COLS + x]) / 8;
      }
    }
    for (let y = 0; y < this.height; y++) {
      const row = Math.max(0, Math.min(ROWS - 1, (y + 0.5) / UPSCALE - 0.5));
      const topRow = Math.floor(row) * COLS;
      const bottomRow = Math.min(Math.floor(row) + 1, ROWS - 1) * COLS;
      const fy = row - Math.floor(row);
      for (let x = 0; x < this.width; x++) {
        const left = this.left[x], right = this.right[x], fx = this.fraction[x];
        const top = this.blurred[topRow + left] * (1 - fx) + this.blurred[topRow + right] * fx;
        const bottom = this.blurred[bottomRow + left] * (1 - fx) + this.blurred[bottomRow + right] * fx;
        const density = top * (1 - fy) + bottom * fy;
        const base = (y * this.width + x) * 4;
        // Spread color changes across the entire field range instead of going flat early.
        const strength = Math.max(0, Math.min(1, density / 12));
        for (let channel = 0; channel < 3; channel++) {
          this.pixels[base + channel] = this.colors.trailLight[channel]
            + (this.colors.trailDark[channel] - this.colors.trailLight[channel]) * strength;
        }
        this.pixels[base + 3] = 245 * density / (density + 4);
      }
    }
  }
}
