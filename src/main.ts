import './styles.css';
import { compareCanvases, loadImage, drawImageToCanvas, type CompareMode } from './lib/imageCompare';

const fileA = document.getElementById('fileA') as HTMLInputElement;
const fileB = document.getElementById('fileB') as HTMLInputElement;
const resizeToA = document.getElementById('resizeToA') as HTMLInputElement;
const tolerance = document.getElementById('tolerance') as HTMLInputElement;
const tolVal = document.getElementById('tolVal') as HTMLElement;
const mode = document.getElementById('mode') as HTMLSelectElement;
const btnCompare = document.getElementById('btnCompare') as HTMLButtonElement;
const btnDownload = document.getElementById('btnDownload') as HTMLButtonElement;

const canvasA = document.getElementById('canvasA') as HTMLCanvasElement;
const canvasB = document.getElementById('canvasB') as HTMLCanvasElement;
const canvasDiff = document.getElementById('canvasDiff') as HTMLCanvasElement;

const ctxA = canvasA.getContext('2d')!;
const ctxB = canvasB.getContext('2d')!;
const ctxD = canvasDiff.getContext('2d')!;

const overlay = document.getElementById('overlay') as HTMLDivElement;
const overlayA = document.getElementById('imgA') as HTMLImageElement;
const overlayB = document.getElementById('imgB') as HTMLImageElement;
const slider = document.getElementById('slider') as HTMLInputElement;
const btnBlink = document.getElementById('btnBlink') as HTMLButtonElement;

const mDims = document.getElementById('mDims') as HTMLElement;
const mPct = document.getElementById('mPct') as HTMLElement;
const mMSE = document.getElementById('mMSE') as HTMLElement;
const mPSNR = document.getElementById('mPSNR') as HTMLElement;
const mDiffCount = document.getElementById('mDiffCount') as HTMLElement;

let imgObjA: HTMLImageElement | null = null;
let imgObjB: HTMLImageElement | null = null;
let blinkTimer: number | null = null;

tolVal.textContent = tolerance.value;
tolerance.addEventListener('input', () => (tolVal.textContent = tolerance.value));

async function onFilesChanged() {
  const a = fileA.files?.[0];
  const b = fileB.files?.[0];
  if (!a || !b) {
    btnCompare.disabled = true;
    btnBlink.disabled = true;
    overlay.setAttribute('data-state', 'empty');  // показуємо плейсхолдер
    overlayA.removeAttribute('src');
    overlayB.removeAttribute('src');
    return;
  }

  try {
    imgObjA = await loadImage(a);
    imgObjB = await loadImage(b);

    drawImageToCanvas(ctxA, imgObjA);
    drawImageToCanvas(ctxB, imgObjB);

    // for overlay
    overlayA.src = URL.createObjectURL(a);
    overlayB.src = URL.createObjectURL(b);
    overlay.setAttribute('data-state', 'ready');

    btnCompare.disabled = false;
    btnBlink.disabled = false;

  } catch (err) {
    alert('Помилка завантаження зображення: ' + err);
  }
}

fileA.addEventListener('change', onFilesChanged);
fileB.addEventListener('change', onFilesChanged);

btnCompare.addEventListener('click', async () => {
  if (!imgObjA || !imgObjB) return;
  const sameSize = imgObjA.naturalWidth === imgObjB.naturalWidth && imgObjA.naturalHeight === imgObjB.naturalHeight;

  let W = imgObjA.naturalWidth, H = imgObjA.naturalHeight;
  let bForCompare = imgObjB;

  if (!sameSize) {
    if (resizeToA.checked) {
      // draw B into a temp canvas resized to A
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = H;
      const tctx = tmp.getContext('2d')!;
      tctx.drawImage(imgObjB, 0, 0, W, H);
      const resized = new Image();
      resized.src = tmp.toDataURL();
      await resized.decode();
      bForCompare = resized;
    } else {
      alert('Різні розміри. Увімкніть підгонку B під A або підготуйте однакові зображення.');
      return;
    }
  }

  // redraw to canvases to make sure sizes match
  drawImageToCanvas(ctxA, imgObjA, W, H);
  drawImageToCanvas(ctxB, bForCompare, W, H);

  ctxD.canvas.width = W;
  ctxD.canvas.height = H;

  const result = compareCanvases(ctxA, ctxB, ctxD, mode.value as CompareMode, parseInt(tolerance.value, 10));

  // metrics UI
  mDims.textContent = `${result.metrics.width} × ${result.metrics.height}`;
  mPct.textContent = `${result.metrics.diffPixelsPct.toFixed(2)}%`;
  mMSE.textContent = result.metrics.mse.toFixed(2);
  mPSNR.textContent = Number.isFinite(result.metrics.psnr) ? result.metrics.psnr.toFixed(2) : '∞';
  mDiffCount.textContent = `${result.metrics.diffPixelsCount.toLocaleString()} px`;

  btnDownload.disabled = false;
});

btnDownload.addEventListener('click', () => {
  const url = canvasDiff.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = 'diff.png'; a.click();
});

slider.addEventListener('input', () => {
  const percent = parseInt(slider.value, 10);
  overlayB.style.clipPath = `inset(0 ${(100 - percent)}% 0 0)`;
});

btnBlink.addEventListener('click', () => {
  if (blinkTimer !== null) {
    window.clearInterval(blinkTimer);
    blinkTimer = null;
    btnBlink.textContent = 'Миготіти A/B';
    overlayB.style.opacity = '1';
    return;
  }
  btnBlink.textContent = 'Зупинити миготіння';
  let showB = true;
  blinkTimer = window.setInterval(() => {
    showB = !showB;
    overlayB.style.opacity = showB ? '1' : '0';
  }, 500);
});
