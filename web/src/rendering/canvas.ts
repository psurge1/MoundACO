import { CELL, COLS, HEIGHT, WIDTH, World } from '../simulation/world';
import { Terrain } from '../simulation/terrain';
import { TrailRaster } from './trails';

export class Renderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly trailCanvas = document.createElement('canvas');
  private readonly trailContext: CanvasRenderingContext2D;
  private readonly trailImage: ImageData;
  private readonly trailRaster = new TrailRaster();
  private readonly observer: ResizeObserver;
  private readonly terrainCanvas = document.createElement('canvas');
  private cachedTerrain: Terrain | null = null;
  pointer: { x: number; y: number } | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d')!;
    this.terrainCanvas.width = WIDTH;
    this.terrainCanvas.height = HEIGHT;
    this.trailCanvas.width = this.trailRaster.width;
    this.trailCanvas.height = this.trailRaster.height;
    this.trailContext = this.trailCanvas.getContext('2d')!;
    this.trailImage = new ImageData(this.trailRaster.pixels, this.trailRaster.width, this.trailRaster.height);
    this.observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
    });
    this.observer.observe(canvas);
  }

  coordinates(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / WIDTH, rect.height / HEIGHT);
    const x = (clientX - rect.left - (rect.width - WIDTH * scale) / 2) / scale;
    const y = (clientY - rect.top - (rect.height - HEIGHT * scale) / 2) / scale;
    return x >= 0 && x <= WIDTH && y >= 0 && y <= HEIGHT ? { x, y } : null;
  }

  draw(world: World, showTrails: boolean): void {
    const ctx = this.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const scale = Math.min(this.canvas.width / WIDTH, this.canvas.height / HEIGHT);
    const offsetX = (this.canvas.width - WIDTH * scale) / 2;
    const offsetY = (this.canvas.height - HEIGHT * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (showTrails) {
      this.trailRaster.update(world.pheromone);
      this.trailContext.putImageData(this.trailImage, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.trailCanvas, 0, 0, WIDTH, HEIGHT);
    }

    if (this.cachedTerrain !== world.terrain) {
      const terrainContext = this.terrainCanvas.getContext('2d')!;
      terrainContext.clearRect(0, 0, WIDTH, HEIGHT);
      terrainContext.fillStyle = '#b9b9b9';
      for (let i = 0; i < world.terrain.blocked.length; i++) {
        if (world.terrain.blocked[i]) terrainContext.fillRect(i % COLS * CELL, Math.floor(i / COLS) * CELL, CELL, CELL);
      }
      this.cachedTerrain = world.terrain;
    }
    // Solid terrain masks the trail overlay as well as blocking physical movement.
    ctx.drawImage(this.terrainCanvas, 0, 0);

    for (const patch of world.food) {
      const radius = 9 + Math.min(8, Math.sqrt(patch.amount) * 0.65);
      ctx.fillStyle = '#4e8b42';
      ctx.beginPath(); ctx.arc(patch.x, patch.y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#555'; ctx.textAlign = 'center'; ctx.font = '11px monospace';
      ctx.fillText(String(patch.amount), patch.x, patch.y + radius + 15);
    }

    const nest = world.nest;
    ctx.fillStyle = world.extinct ? '#ccc' : '#888';
    ctx.beginPath(); ctx.arc(nest.x, nest.y, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#666'; ctx.textAlign = 'center'; ctx.font = '11px monospace';
    ctx.fillText(world.extinct ? 'empty nest' : 'nest', nest.x, nest.y + 34);

    for (const ant of world.ants) {
      ctx.fillStyle = ant.carrying ? '#c47720' : '#222';
      ctx.beginPath(); ctx.arc(ant.x, ant.y, ant.carrying ? 2.3 : 1.8, 0, Math.PI * 2); ctx.fill();
    }
    if (this.pointer) {
      const p = this.pointer;
      ctx.strokeStyle = world.terrain.canStand(p.x, p.y, 18) && Math.hypot(p.x - nest.x, p.y - nest.y) >= 38 ? '#888' : '#a32d1c';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
