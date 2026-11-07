import { CELL, COLS, HEIGHT, WIDTH, World } from '../simulation/world';
import { Sandbox } from '../simulation/sandbox';
import { Terrain } from '../simulation/terrain';
import { TrailRaster } from './trails';
import { colonyPalette, defaultColonyPalette, palette, type ColonyPalette } from './palette';

interface TrailLayer {
  world: World;
  raster: TrailRaster;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  image: ImageData;
}

export class Renderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly trailLayers = new Map<number, TrailLayer>();
  placingNest = false;
  private readonly observer: ResizeObserver;
  private readonly terrainCanvas = document.createElement('canvas');
  private cachedTerrain: Terrain | null = null;
  pointer: { x: number; y: number } | null = null;

  constructor(readonly canvas: HTMLCanvasElement, private readonly colors: ColonyPalette = defaultColonyPalette) {
    this.context = canvas.getContext('2d')!;
    this.terrainCanvas.width = WIDTH;
    this.terrainCanvas.height = HEIGHT;
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

  draw(world: World | Sandbox, showTrails: boolean): void {
    const ctx = this.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = palette.outside;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const scale = Math.min(this.canvas.width / WIDTH, this.canvas.height / HEIGHT);
    const offsetX = (this.canvas.width - WIDTH * scale) / 2;
    const offsetY = (this.canvas.height - HEIGHT * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const colonies = world instanceof Sandbox ? world.colonies : [{ id: 0, colorId: 0, world }];
    const ids = new Set(colonies.map(c => c.id));
    for (const id of this.trailLayers.keys()) if (!ids.has(id)) this.trailLayers.delete(id);
    if (showTrails) for (const colony of colonies) {
      let layer = this.trailLayers.get(colony.id);
      if (!layer || layer.world !== colony.world) {
        const raster = new TrailRaster(colony.id ? colonyPalette(colony.colorId) : this.colors);
        const canvas = document.createElement('canvas');
        canvas.width = raster.width; canvas.height = raster.height;
        layer = { world: colony.world, raster, canvas, context: canvas.getContext('2d')!,
          image: new ImageData(raster.pixels, raster.width, raster.height) };
        this.trailLayers.set(colony.id, layer);
      }
      layer.raster.update(colony.world.pheromone);
      layer.context.putImageData(layer.image, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // Keep each draw source independent: reusing one mutable canvas can alias queued draws.
      ctx.drawImage(layer.canvas, 0, 0, WIDTH, HEIGHT);
    }

    if (this.cachedTerrain !== world.terrain) {
      const terrainContext = this.terrainCanvas.getContext('2d')!;
      terrainContext.clearRect(0, 0, WIDTH, HEIGHT);
      terrainContext.fillStyle = palette.obstacle;
      for (let i = 0; i < world.terrain.blocked.length; i++) {
        if (world.terrain.blocked[i]) terrainContext.fillRect(i % COLS * CELL, Math.floor(i / COLS) * CELL, CELL, CELL);
      }
      this.cachedTerrain = world.terrain;
    }
    // Solid terrain masks the trail overlay as well as blocking physical movement.
    ctx.drawImage(this.terrainCanvas, 0, 0);

    for (const patch of world.food) {
      const radius = 9 + Math.min(8, Math.sqrt(patch.amount) * 0.65);
      ctx.fillStyle = palette.food;
      ctx.beginPath(); ctx.arc(patch.x, patch.y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = palette.text; ctx.textAlign = 'center'; ctx.font = '11px monospace';
      ctx.fillText(String(patch.amount), patch.x, patch.y + radius + 15);
    }

    for (const colony of colonies) {
      const state = colony.world;
      const colors = colony.id ? colonyPalette(colony.colorId) : this.colors;
      const nest = state.nest;
      ctx.fillStyle = state.extinct ? colors.emptyNest : colors.nest;
      ctx.beginPath(); ctx.arc(nest.x, nest.y, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = palette.text; ctx.textAlign = 'center'; ctx.font = '11px monospace';
      const name = colony.id ? `Colony ${colony.id}` : 'Colony';
      const labelY = nest.y > HEIGHT - 44 ? nest.y - 28 : nest.y + 34;
      ctx.fillStyle = colors.worker;
      ctx.fillText(`${name}: ${state.ants.length} ants${state.extinct ? ' (extinct)' : ''}`,
        Math.max(100, Math.min(WIDTH - 100, nest.x)), labelY);

      for (const ant of state.ants) {
        ctx.fillStyle = colors.worker;
        ctx.beginPath(); ctx.arc(ant.x, ant.y, ant.fighting ? 3 : ant.carrying ? 2.3 : 1.8, 0, Math.PI * 2); ctx.fill();
        if (ant.carrying) {
          ctx.fillStyle = palette.food;
          ctx.beginPath(); ctx.arc(ant.x, ant.y, 1, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    if (this.pointer) {
      const p = this.pointer;
      const valid = this.placingNest && world instanceof Sandbox ? world.canPlaceNest(p.x, p.y) : world.terrain.canStand(p.x, p.y, 18) && colonies.every(c => Math.hypot(p.x - c.world.nest.x, p.y - c.world.nest.y) >= 38);
      ctx.strokeStyle = valid ? palette.cursor : palette.invalid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
