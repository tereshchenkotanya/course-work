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

const enableRegionSelect = document.getElementById('enableRegionSelect') as HTMLInputElement;
const btnClearRegion = document.getElementById('btnClearRegion') as HTMLButtonElement;
const canvasSelection = document.getElementById('canvasSelection') as HTMLCanvasElement;
const ctxSelection = canvasSelection.getContext('2d')!;
const regionMetrics = document.getElementById('regionMetrics') as HTMLElement;
const rmDims = document.getElementById('rmDims') as HTMLElement;
const rmPct = document.getElementById('rmPct') as HTMLElement;
const rmMSE = document.getElementById('rmMSE') as HTMLElement;
const rmPSNR = document.getElementById('rmPSNR') as HTMLElement;
const rmDiffCount = document.getElementById('rmDiffCount') as HTMLElement;

let imgObjA: HTMLImageElement | null = null;
let imgObjB: HTMLImageElement | null = null;
let blinkTimer: number | null = null;
let selectedRegion: { x: number; y: number; w: number; h: number } | null = null;
let isSelecting = false;
let selectionStart = { x: 0, y: 0 };
let currentImageDataA: ImageData | null = null;
let currentImageDataB: ImageData | null = null;
let currentTolerance = 16;
let currentMode: CompareMode = 'highlight';

tolVal.textContent = tolerance.value;
tolerance.addEventListener('input', () => {
  tolVal.textContent = tolerance.value;
  currentTolerance = parseInt(tolerance.value, 10);
  // Recalculate region metrics if a region is selected
  if (selectedRegion && selectedRegion.w > 0 && selectedRegion.h > 0) {
    calculateRegionMetrics(selectedRegion);
  }
});

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

  // Set canvas internal dimensions
  ctxD.canvas.width = W;
  ctxD.canvas.height = H;
  canvasSelection.width = W;
  canvasSelection.height = H;
  
  // Ensure canvasDiff is visible with proper CSS
  canvasDiff.style.display = 'block';
  canvasDiff.style.width = '100%';
  canvasDiff.style.maxHeight = '480px';
  canvasDiff.style.position = 'relative';
  canvasDiff.style.zIndex = '1';
  
  // Ensure canvasSelection is transparent and properly positioned
  canvasSelection.style.background = 'transparent';
  canvasSelection.style.pointerEvents = 'none';
  canvasSelection.style.zIndex = '2';
  canvasSelection.style.opacity = '0';
  canvasSelection.style.visibility = 'hidden';
  
  // Clear selection canvas initially
  ctxSelection.clearRect(0, 0, canvasSelection.width, canvasSelection.height);
  
  syncSelectionCanvasSize();

  currentTolerance = parseInt(tolerance.value, 10);
  currentMode = mode.value as CompareMode;

  const result = compareCanvases(ctxA, ctxB, ctxD, currentMode, currentTolerance);

  // Verify that the canvas has content and is visible
  const imageData = ctxD.getImageData(0, 0, Math.min(10, W), Math.min(10, H));
  const hasData = imageData.data.some((val, idx) => idx % 4 !== 3 && val !== 0);
  console.log('Canvas diff check:', { 
    internal: { width: ctxD.canvas.width, height: ctxD.canvas.height },
    display: { width: canvasDiff.style.width, height: canvasDiff.style.height },
    computed: { width: window.getComputedStyle(canvasDiff).width, height: window.getComputedStyle(canvasDiff).height },
    hasData: hasData,
    zIndex: window.getComputedStyle(canvasDiff).zIndex
  });
  
  if (ctxD.canvas.width === 0 || ctxD.canvas.height === 0) {
    console.error('Canvas dimensions are zero!', { W, H, canvasWidth: ctxD.canvas.width, canvasHeight: ctxD.canvas.height });
  }
  
  // Force canvas to be visible
  canvasDiff.style.visibility = 'visible';
  canvasDiff.style.opacity = '1';

  // Store image data for region calculations
  currentImageDataA = ctxA.getImageData(0, 0, W, H);
  currentImageDataB = ctxB.getImageData(0, 0, W, H);

  // metrics UI
  mDims.textContent = `${result.metrics.width} × ${result.metrics.height}`;
  mPct.textContent = `${result.metrics.diffPixelsPct.toFixed(2)}%`;
  mMSE.textContent = result.metrics.mse.toFixed(2);
  mPSNR.textContent = Number.isFinite(result.metrics.psnr) ? result.metrics.psnr.toFixed(2) : '∞';
  mDiffCount.textContent = `${result.metrics.diffPixelsCount.toLocaleString()} px`;

  btnDownload.disabled = false;
  
  // Clear region selection when new comparison is done
  clearRegionSelection();
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

// Region selection functionality
function syncSelectionCanvasSize() {
  // Sync canvas selection size and position with diff canvas
  // Get the actual rendered position and size of canvasDiff
  const diffRect = canvasDiff.getBoundingClientRect();
  const panel = canvasDiff.parentElement!;
  const panelRect = panel.getBoundingClientRect();
  
  // Calculate position relative to panel (accounting for padding)
  const panelStyle = window.getComputedStyle(panel);
  const paddingTop = parseInt(panelStyle.paddingTop) || 12;
  const paddingLeft = parseInt(panelStyle.paddingLeft) || 12;
  
  // Set canvasSelection to match canvasDiff exactly
  const computedStyle = window.getComputedStyle(canvasDiff);
  canvasSelection.style.width = computedStyle.width;
  canvasSelection.style.height = computedStyle.height;
  canvasSelection.style.maxHeight = computedStyle.maxHeight || '480px';
  
  // Position to match canvasDiff (accounting for panel padding)
  canvasSelection.style.top = `${paddingTop}px`;
  canvasSelection.style.left = `${paddingLeft}px`;
}

function getCanvasCoordinates(e: MouseEvent): { x: number; y: number } {
  const rect = canvasDiff.getBoundingClientRect();
  const scaleX = canvasDiff.width / rect.width;
  const scaleY = canvasDiff.height / rect.height;
  return {
    x: Math.round((e.clientX - rect.left) * scaleX),
    y: Math.round((e.clientY - rect.top) * scaleY)
  };
}

function drawSelectionRect(x: number, y: number, w: number, h: number) {
  // Clear the entire canvas first
  ctxSelection.clearRect(0, 0, canvasSelection.width, canvasSelection.height);
  if (w > 0 && h > 0) {
    // Show selection canvas when drawing
    canvasSelection.style.opacity = '1';
    canvasSelection.style.visibility = 'visible';
    // Draw at the same pixel coordinates as the image (canvas handles CSS scaling)
    ctxSelection.strokeStyle = '#22d3ee';
    ctxSelection.lineWidth = 2;
    ctxSelection.setLineDash([5, 5]);
    ctxSelection.strokeRect(x, y, w, h);
    ctxSelection.fillStyle = 'rgba(34, 211, 238, 0.1)';
    ctxSelection.fillRect(x, y, w, h);
  } else {
    // Hide when no selection
    canvasSelection.style.opacity = '0';
    canvasSelection.style.visibility = 'hidden';
  }
}

function clearRegionSelection() {
  selectedRegion = null;
  ctxSelection.clearRect(0, 0, canvasSelection.width, canvasSelection.height);
  // Hide selection canvas when no selection
  canvasSelection.style.opacity = '0';
  canvasSelection.style.visibility = 'hidden';
  btnClearRegion.disabled = true;
  regionMetrics.style.opacity = '0.5';
  rmDims.textContent = '–';
  rmPct.textContent = '–';
  rmMSE.textContent = '–';
  rmPSNR.textContent = '–';
  rmDiffCount.textContent = '–';
}

function calculateRegionMetrics(region: { x: number; y: number; w: number; h: number }) {
  if (!currentImageDataA || !currentImageDataB) return;

  const dataA = currentImageDataA.data;
  const dataB = currentImageDataB.data;
  const W = currentImageDataA.width;
  const H = currentImageDataA.height;

  // Clamp region to image bounds
  const x1 = Math.max(0, Math.min(region.x, W));
  const y1 = Math.max(0, Math.min(region.y, H));
  const x2 = Math.max(0, Math.min(region.x + region.w, W));
  const y2 = Math.max(0, Math.min(region.y + region.h, H));
  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - y1);

  let diffCount = 0;
  let mseAcc = 0;

  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      const idx = (y * W + x) * 4;
      const rA = dataA[idx];
      const gA = dataA[idx + 1];
      const bA = dataA[idx + 2];
      const rB = dataB[idx];
      const gB = dataB[idx + 1];
      const bB = dataB[idx + 2];

      const dr = Math.abs(rA - rB);
      const dg = Math.abs(gA - gB);
      const db = Math.abs(bA - bB);
      const avgDiff = (dr + dg + db) / 3;

      mseAcc += (avgDiff * avgDiff);
      const isDiff = (dr > currentTolerance || dg > currentTolerance || db > currentTolerance);
      if (isDiff) diffCount++;
    }
  }

  const total = w * h;
  const pct = total ? (diffCount / total * 100) : 0;
  const mse = total ? (mseAcc / total) : 0;
  const psnr = mse === 0 ? Infinity : (20 * Math.log10(255) - 10 * Math.log10(mse));

  // Update UI
  rmDims.textContent = `${w} × ${h}`;
  rmPct.textContent = `${pct.toFixed(2)}%`;
  rmMSE.textContent = mse.toFixed(2);
  rmPSNR.textContent = Number.isFinite(psnr) ? psnr.toFixed(2) : '∞';
  rmDiffCount.textContent = `${diffCount.toLocaleString()} px`;
  regionMetrics.style.opacity = '1';
}

enableRegionSelect.addEventListener('change', () => {
  if (!enableRegionSelect.checked) {
    clearRegionSelection();
    canvasDiff.style.cursor = 'default';
  } else {
    canvasDiff.style.cursor = 'crosshair';
    if (ctxD.canvas.width > 0 && ctxD.canvas.height > 0) {
      syncSelectionCanvasSize();
    }
  }
});

// Sync canvas sizes on window resize
window.addEventListener('resize', () => {
  if (enableRegionSelect.checked) {
    syncSelectionCanvasSize();
  }
});

btnClearRegion.addEventListener('click', () => {
  clearRegionSelection();
});

canvasDiff.addEventListener('mousedown', (e) => {
  if (!enableRegionSelect.checked || !currentImageDataA) return;
  isSelecting = true;
  const coords = getCanvasCoordinates(e);
  selectionStart = coords;
  selectedRegion = { x: coords.x, y: coords.y, w: 0, h: 0 };
});

canvasDiff.addEventListener('mousemove', (e) => {
  if (!isSelecting || !enableRegionSelect.checked) return;
  const coords = getCanvasCoordinates(e);
  selectedRegion = {
    x: Math.min(selectionStart.x, coords.x),
    y: Math.min(selectionStart.y, coords.y),
    w: Math.abs(coords.x - selectionStart.x),
    h: Math.abs(coords.y - selectionStart.y)
  };
  drawSelectionRect(selectedRegion.x, selectedRegion.y, selectedRegion.w, selectedRegion.h);
});

canvasDiff.addEventListener('mouseup', () => {
  if (!isSelecting) return;
  isSelecting = false;
  if (selectedRegion && selectedRegion.w > 0 && selectedRegion.h > 0) {
    btnClearRegion.disabled = false;
    calculateRegionMetrics(selectedRegion);
  } else {
    clearRegionSelection();
  }
});

canvasDiff.addEventListener('mouseleave', () => {
  if (isSelecting) {
    isSelecting = false;
  }
});
