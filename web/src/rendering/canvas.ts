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

  coordinates(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width * WIDTH, y: (clientY - rect.top) / rect.height * HEIGHT };
  }

  draw(world: World, showTrails: boolean): void {
    const ctx = this.context;
    ctx.setTransform(this.canvas.width / WIDTH, 0, 0, this.canvas.height / HEIGHT, 0, 0);
    ctx.fillStyle = '#eaece1';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // A quiet reference grid, rather than illustrated scenery.
    ctx.fillStyle = '#cbd0bc';
    for (let x = 20; x < WIDTH; x += 28) {
      for (let y = 12; y < HEIGHT; y += 28) {
        ctx.beginPath(); ctx.arc(x, y, 0.7, 0, Math.PI * 2); ctx.fill();
      }
    }

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
      ctx.strokeStyle = '#a1ae83'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(patch.x, patch.y, radius + 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#769448';
      ctx.beginPath(); ctx.arc(patch.x, patch.y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eff2df';
      for (const [dx, dy] of [[-4, -3], [4, -2], [0, 4]]) {
        ctx.beginPath(); ctx.arc(patch.x + dx, patch.y + dy, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#526240'; ctx.textAlign = 'center'; ctx.font = '11px monospace';
      ctx.fillText(String(patch.amount), patch.x, patch.y + radius + 21);
    }

    const nest = world.nest;
    ctx.strokeStyle = world.extinct ? '#aaa99c' : '#b6ac96';
    ctx.lineWidth = 1;
    for (const radius of [25, 32]) {
      ctx.beginPath(); ctx.arc(nest.x, nest.y, radius, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = world.extinct ? '#a09d91' : '#827158';
    ctx.beginPath(); ctx.arc(nest.x, nest.y, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = world.extinct ? '#77766c' : '#4e4436';
    ctx.beginPath(); ctx.arc(nest.x, nest.y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#797564'; ctx.textAlign = 'center'; ctx.font = '10px monospace';
    ctx.fillText(world.extinct ? 'EMPTY NEST' : 'THE NEST', nest.x, nest.y + 49);

    for (const ant of world.ants) {
      ctx.fillStyle = ant.carrying ? '#a77835' : '#374234';
      ctx.beginPath(); ctx.arc(ant.x, ant.y, ant.carrying ? 2.3 : 1.8, 0, Math.PI * 2); ctx.fill();
    }
    if (this.pointer) {
      const p = this.pointer;
      ctx.strokeStyle = '#758463'; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(p.x, p.y, 21, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#586a43'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
      ctx.fillText('+ food', p.x, p.y - 30);
    }
  }
}
