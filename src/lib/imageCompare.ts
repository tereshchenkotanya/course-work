export type CompareMode = 'highlight' | 'heatmap' | 'diffRGB';

export interface Metrics {
  width: number;
  height: number;
  diffPixelsCount: number;  // NEW
  totalPixels: number;      // NEW (можна прибрати, якщо не потрібно)
  diffPixelsPct: number;
  mse: number;
  psnr: number; // Infinity, якщо mse=0
}

export interface CompareResult {
  imageData: ImageData;
  metrics: Metrics;
}

export function compareCanvases(
  ctxA: CanvasRenderingContext2D,
  ctxB: CanvasRenderingContext2D,
  ctxOut: CanvasRenderingContext2D,
  mode: CompareMode,
  tolerance: number
): CompareResult {
  const W = ctxA.canvas.width;
  const H = ctxA.canvas.height;
  const imgDataA = ctxA.getImageData(0, 0, W, H);
  const imgDataB = ctxB.getImageData(0, 0, W, H);
  const out = ctxOut.createImageData(W, H);

// ПІДСТРАХУВАННЯ: вихідний canvas має такий самий розмір
  if (ctxOut.canvas.width  !== W) ctxOut.canvas.width  = W;
  if (ctxOut.canvas.height !== H) ctxOut.canvas.height = H;

  const dataA = imgDataA.data;
  const dataB = imgDataB.data;
  const outD = out.data;

  let diffCount = 0;
  let mseAcc = 0;

  for (let i = 0; i < dataA.length; i += 4) {
    const rA = dataA[i],   gA = dataA[i+1], bA = dataA[i+2];
    const rB = dataB[i],   gB = dataB[i+1], bB = dataB[i+2];

    const dr = Math.abs(rA - rB);
    const dg = Math.abs(gA - gB);
    const db = Math.abs(bA - bB);
    const avgDiff = (dr + dg + db) / 3;

    mseAcc += (avgDiff * avgDiff);
    const isDiff = (dr > tolerance || dg > tolerance || db > tolerance);
    if (isDiff) diffCount++;

    switch (mode) {
      case 'highlight':
        if (isDiff) {
          outD[i]   = 239; // red
          outD[i+1] = 68;
          outD[i+2] = 68;
          outD[i+3] = 255;
        } else {
          outD[i]   = Math.round(dataA[i] * 0.6);
          outD[i+1] = Math.round(dataA[i+1] * 0.6);
          outD[i+2] = Math.round(dataA[i+2] * 0.6);
          outD[i+3] = 255;
        }
        break;
      case 'heatmap': {
        const strength = Math.min(255, Math.max(0, Math.floor(avgDiff)));
        outD[i]   = strength;
        outD[i+1] = Math.min(80, Math.floor(strength * 0.3));
        outD[i+2] = 255 - strength;
        outD[i+3] = 255;
        break;
      }
      case 'diffRGB':
        outD[i]   = dr;
        outD[i+1] = dg;
        outD[i+2] = db;
        outD[i+3] = 255;
        break;
    }
  }

  ctxOut.putImageData(out, 0, 0);

  const total = W * H;
  const pct = total ? (diffCount / total * 100) : 0;
  const mse = total ? (mseAcc / total) : 0;
  const psnr = mse === 0 ? Infinity : (20 * Math.log10(255) - 10 * Math.log10(mse));

  return {
    imageData: out,
    metrics: {
      width: W,
      height: H,
      diffPixelsCount: diffCount,   // NEW: кількість “інших” пікселів
      totalPixels: total,           // NEW: (опційно) загальна к-сть пікселів
      diffPixelsPct: pct,
      mse,
      psnr,
    }
  };
}

export async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
  URL.revokeObjectURL(url);
  return img;
}

export function drawImageToCanvas(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w?: number, h?: number) {
  const width = w ?? img.naturalWidth;
  const height = h ?? img.naturalHeight;
  ctx.canvas.width = width;
  ctx.canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
}
