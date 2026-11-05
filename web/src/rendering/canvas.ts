import { CELL, COLS, HEIGHT, ROWS, WIDTH, World } from '../simulation/world';

export class Renderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly trailCanvas = document.createElement('canvas');
  private readonly trailContext: CanvasRenderingContext2D;
  private readonly trailImage: ImageData;
  private readonly observer: ResizeObserver;
  pointer: { x: number; y: number } | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d')!;
    this.trailCanvas.width = COLS;
    this.trailCanvas.height = ROWS;
    this.trailContext = this.trailCanvas.getContext('2d')!;
    this.trailImage = this.trailContext.createImageData(COLS, ROWS);
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
      const data = this.trailImage.data;
      for (let i = 0; i < world.pheromone.length; i++) {
        const base = i * 4;
        data[base] = 126; data[base + 1] = 152; data[base + 2] = 76;
        data[base + 3] = Math.min(150, world.pheromone[i] * 58);
      }
      this.trailContext.putImageData(this.trailImage, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.trailCanvas, 0, 0, COLS * CELL, ROWS * CELL);
    }

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
      ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.stroke();
    }
  }
}
