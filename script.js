/**
 * GALERÍA CORAZÓN — script.js
 * Almacenamiento compartido: Cloudinary (imágenes) + Supabase (base de datos)
 * Las fotos que sube cualquier usuario son visibles para todos.
 *
 * ── CONFIGURACIÓN ──────────────────────────────────────────────────────────
 * Completá las 4 variables de abajo con tus credenciales.
 * Seguí el archivo SETUP.md para obtenerlas paso a paso.
 */

const CONFIG = {
  // Cloudinary ─ conseguilo en: https://cloudinary.com → Dashboard
  CLOUDINARY_CLOUD_NAME: 'dx3musvxg',       // ej: 'mi-galeria'
  CLOUDINARY_UPLOAD_PRESET: 'galeria_corazon', // ej: 'galeria_corazon'

  // Supabase ─ conseguilo en: https://supabase.com → Project → Settings → API
  SUPABASE_URL: 'https://wpfemhwiwpwmhblexjnv.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwZmVtaHdpd3B3bWhibGV4am52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MTU4NjMsImV4cCI6MjA5MjA5MTg2M30.YiyQs_8M5SymnjkRhuI4-EcowzeOvyKdwJIZsJRKjl8', // clave anon/public

  THUMB_SIZE:   400,   // px para previsualización en el corazón
  ORIG_QUALITY: 0.92,
  BATCH_SIZE:   5,
};

// ─────────────────────────────────────────────
// HELPERS — Supabase (fetch directo, sin SDK)
// ─────────────────────────────────────────────
const SB_HEADERS = {
  'apikey': CONFIG.SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function sbInsert(row) {
  const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/photos`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`Supabase insert: ${r.status} ${await r.text()}`);
  return r.json();
}

async function sbSelect(opts = {}) {
  const params = new URLSearchParams({
    select: 'id,thumb_url,orig_url,name,created_at',
    order:  'created_at.asc',
    ...(opts.limit  ? { limit:  opts.limit  } : {}),
    ...(opts.offset ? { offset: opts.offset } : {}),
  });
  const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/photos?${params}`, {
    headers: { ...SB_HEADERS, 'Prefer': 'count=exact' },
  });
  if (!r.ok) throw new Error(`Supabase select: ${r.status}`);
  const total = parseInt(r.headers.get('content-range')?.split('/')[1] ?? '0', 10);
  const data  = await r.json();
  return { data, total };
}

async function sbDelete(id) {
  const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/photos?id=eq.${id}`, {
    method: 'DELETE',
    headers: SB_HEADERS,
  });
  if (!r.ok) throw new Error(`Supabase delete: ${r.status}`);
}

async function sbDeleteAll() {
  // Borra todas las filas (filtro siempre verdadero: id > 0)
  const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/photos?id=gt.0`, {
    method: 'DELETE',
    headers: SB_HEADERS,
  });
  if (!r.ok) throw new Error(`Supabase deleteAll: ${r.status}`);
}

// ─────────────────────────────────────────────
// HELPERS — Cloudinary (unsigned upload)
// ─────────────────────────────────────────────
async function uploadToCloudinary(dataURL, filename) {
  const blob = dataURLToBlob(dataURL);
  const fd   = new FormData();
  fd.append('file',         blob, filename);
  fd.append('upload_preset', CONFIG.CLOUDINARY_UPLOAD_PRESET);
  fd.append('folder',       'galeria-corazon');

  const r = await fetch(
    `https://api.cloudinary.com/v1_1/${CONFIG.CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: fd }
  );
  if (!r.ok) throw new Error(`Cloudinary upload: ${r.status}`);
  const j = await r.json();
  return j.secure_url; // URL permanente
}

function dataURLToBlob(dataURL) {
  const [header, data] = dataURL.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(data);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Genera thumbnail local antes de subir
function resizeTo(img, maxPx, quality) {
  let w = img.naturalWidth, h = img.naturalHeight;
  if (w > maxPx || h > maxPx) {
    const r = Math.min(maxPx / w, maxPx / h);
    w = Math.round(w * r); h = Math.round(h * r);
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/jpeg', quality);
}

function fileToImg(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload  = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload  = () => resolve(img);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────
let totalPhotos  = 0;
let currentPage  = 0;
let tilesLayout  = [];
let pageRecords  = [];   // [{ id, thumb_url, orig_url, name }]
let hoveredTile  = -1;
let currentModalId = null;
let isProcessing   = false;
let canvasSize     = 600;
let layout         = null;

// ─────────────────────────────────────────────
// DOM
// ─────────────────────────────────────────────
const dropZone      = document.getElementById('dropZone');
const fileInput     = document.getElementById('fileInput');
const btnSelect     = document.getElementById('btnSelect');
const btnClear      = document.getElementById('btnClear');
const heartWrapper  = document.getElementById('heartWrapper');
const heartCanvas   = document.getElementById('heartCanvas');
const heartOverlay  = document.getElementById('heartOverlay');
const emptyState    = document.getElementById('emptyState');
const modal         = document.getElementById('modal');
const modalOverlay  = document.getElementById('modalOverlay');
const modalClose    = document.getElementById('modalClose');
const modalImg      = document.getElementById('modalImg');
const modalDel      = document.getElementById('modalDel');
const paginationWrap= document.getElementById('paginationWrap');
const btnPrev       = document.getElementById('btnPrev');
const btnNext       = document.getElementById('btnNext');
const pageLabel     = document.getElementById('pageLabel');

let progressWrap, progressBar, progressLabel;
const ctx = heartCanvas.getContext('2d');

// ─────────────────────────────────────────────
// GEOMETRÍA DEL CORAZÓN
// ─────────────────────────────────────────────
function heartPath(ctx, cx, cy, r) {
  ctx.beginPath();
  const steps = 300;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const x = cx + r * (16 * Math.pow(Math.sin(t), 3)) / 17;
    const y = cy - r * (13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t)) / 17;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const _htCanvas = document.createElement('canvas');
_htCanvas.width = _htCanvas.height = 2;
const _htCtx = _htCanvas.getContext('2d');
let _heartPath2D = new Path2D();

function rebuildHeartPath(cx, cy, r) {
  _heartPath2D = new Path2D();
  const steps = 300;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const x = cx + r * (16 * Math.pow(Math.sin(t), 3)) / 17;
    const y = cy - r * (13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t)) / 17;
    if (i === 0) _heartPath2D.moveTo(x, y); else _heartPath2D.lineTo(x, y);
  }
  _heartPath2D.closePath();
}

// ─────────────────────────────────────────────
// LAYOUT DE TESELAS
// ─────────────────────────────────────────────
function computeLayout(canvasW) {
  const r  = canvasW * 0.44;
  const cx = canvasW / 2;
  const cy = canvasW * 0.50;
  rebuildHeartPath(cx, cy, r);

  const tileSize = Math.max(8, Math.round(canvasW / 30));
  const gap      = 1;
  const step     = tileSize + gap;
  const tiles    = [];
  const cols     = Math.ceil(canvasW / step) + 1;
  const rows     = Math.ceil(canvasW / step) + 1;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tx  = col * step, ty = row * step;
      const tcx = tx + tileSize / 2, tcy = ty + tileSize / 2;
      if (_htCtx.isPointInPath(_heartPath2D, tcx, tcy)) {
        tiles.push({ col, row, x: tx, y: ty, size: tileSize });
      }
    }
  }
  return { tiles, tileSize, cx, cy, r };
}

// ─────────────────────────────────────────────
// CACHÉ DE IMÁGENES
// ─────────────────────────────────────────────
const imgCache = new Map();
function loadImg(url) {
  if (imgCache.has(url)) return Promise.resolve(imgCache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => { imgCache.set(url, img); resolve(img); };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ─────────────────────────────────────────────
// RENDERIZADO EN CANVAS
// ─────────────────────────────────────────────
async function renderHeart() {
  const W = canvasSize;
  heartCanvas.width = W; heartCanvas.height = W;
  ctx.clearRect(0, 0, W, W);

  layout = computeLayout(W);
  const { tiles, cx, cy, r } = layout;
  tilesLayout = tiles;

  if (!tiles.length) return;

  // Fondo suave
  ctx.save();
  heartPath(ctx, cx, cy, r);
  ctx.fillStyle = 'rgba(220,30,80,0.10)';
  ctx.fill();
  ctx.restore();

  // Clip + teselas
  ctx.save();
  heartPath(ctx, cx, cy, r);
  ctx.clip();

  for (let i = 0; i < tiles.length; i++) {
    const tile   = tiles[i];
    const record = pageRecords[i % pageRecords.length];
    if (!record) {
      ctx.fillStyle = '#ffd6e7';
      ctx.fillRect(tile.x, tile.y, tile.size, tile.size);
      continue;
    }
    const img = await loadImg(record.thumb_url);
    if (img) {
      const aspectImg = img.naturalWidth / img.naturalHeight;
      let sw, sh, sx, sy;
      if (aspectImg > 1) {
        sh = img.naturalHeight; sw = sh;
        sx = (img.naturalWidth - sw) / 2; sy = 0;
      } else {
        sw = img.naturalWidth; sh = sw;
        sx = 0; sy = (img.naturalHeight - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, tile.x, tile.y, tile.size, tile.size);
    } else {
      ctx.fillStyle = '#ffd6e7';
      ctx.fillRect(tile.x, tile.y, tile.size, tile.size);
    }
  }

  ctx.restore();

  // Borde
  ctx.save();
  heartPath(ctx, cx, cy, r);
  ctx.strokeStyle = 'rgba(201,23,74,0.55)';
  ctx.lineWidth   = 3;
  ctx.stroke();
  ctx.restore();

  // Hover highlight
  if (hoveredTile >= 0 && hoveredTile < tiles.length) {
    const t = tiles[hoveredTile];
    ctx.save();
    heartPath(ctx, cx, cy, r);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(t.x, t.y, t.size, t.size);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(t.x+0.75, t.y+0.75, t.size-1.5, t.size-1.5);
    ctx.restore();
  }
}

// ─────────────────────────────────────────────
// PÁGINA
// ─────────────────────────────────────────────
function updateCanvasSize() {
  const section = document.querySelector('.gallery-section');
  const maxW    = Math.min(section.clientWidth - 32, 700);
  canvasSize    = Math.max(300, maxW);
}

async function renderPageFull() {
  if (!totalPhotos) {
    heartWrapper.style.display  = 'none';
    emptyState.classList.add('visible');
    paginationWrap.style.display = 'none';
    return;
  }

  emptyState.classList.remove('visible');
  heartWrapper.style.display = 'block';
  updateCanvasSize();

  const tmpLayout    = computeLayout(canvasSize);
  const tilesPerPage = tmpLayout.tiles.length;
  const totalPages   = Math.max(1, Math.ceil(totalPhotos / tilesPerPage));
  if (currentPage >= totalPages) currentPage = totalPages - 1;

  const offset = currentPage * tilesPerPage;
  const { data } = await sbSelect({ limit: tilesPerPage, offset });
  pageRecords = data;

  hoveredTile = -1;
  await renderHeart();

  if (totalPages > 1) {
    paginationWrap.style.display = 'flex';
    pageLabel.textContent = `Corazón ${currentPage+1} / ${totalPages}  (${totalPhotos} fotos)`;
    btnPrev.disabled = currentPage === 0;
    btnNext.disabled = currentPage >= totalPages - 1;
  } else {
    paginationWrap.style.display = 'none';
  }
}

async function refreshGallery(keepPage = false) {
  imgCache.clear();
  const { total } = await sbSelect({ limit: 1 });
  totalPhotos = total;
  if (!keepPage) currentPage = 0;
  await renderPageFull();
}

// ─────────────────────────────────────────────
// HOVER + CLICK EN CANVAS
// ─────────────────────────────────────────────
heartOverlay.addEventListener('mousemove', (e) => {
  if (!tilesLayout.length) return;
  const rect  = heartCanvas.getBoundingClientRect();
  const scale = canvasSize / rect.width;
  const mx    = (e.clientX - rect.left) * scale;
  const my    = (e.clientY - rect.top)  * scale;

  let found = -1;
  for (let i = 0; i < tilesLayout.length; i++) {
    const t = tilesLayout[i];
    if (mx >= t.x && mx <= t.x + t.size && my >= t.y && my <= t.y + t.size) {
      found = i; break;
    }
  }
  if (found !== hoveredTile) {
    hoveredTile = found;
    heartOverlay.style.cursor = found >= 0 ? 'pointer' : 'default';
    renderHeart();
  }
});

heartOverlay.addEventListener('mouseleave', () => {
  hoveredTile = -1;
  renderHeart();
  heartOverlay.style.cursor = 'default';
});

heartOverlay.addEventListener('click', (e) => {
  if (hoveredTile < 0 || !pageRecords.length) return;
  const record = pageRecords[hoveredTile % pageRecords.length];
  if (record) openModal(record);
});

// ─────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────
function openModal(record) {
  currentModalId = record.id;
  modalImg.src   = '';
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  modalImg.style.opacity = '0.3';
  modalImg.src = record.orig_url;
  modalImg.onload = () => { modalImg.style.opacity = '1'; };
}

function closeModal() {
  modal.classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => { modalImg.src = ''; currentModalId = null; }, 300);
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

modalDel.addEventListener('click', async () => {
  if (!currentModalId) return;
  if (!confirm('¿Eliminar esta foto?')) return;
  const id = currentModalId;
  closeModal();
  await sbDelete(id);
  await refreshGallery(true);
  showToast('Foto eliminada');
});

// ─────────────────────────────────────────────
// SUBIDA DE FOTOS
// ─────────────────────────────────────────────
btnSelect.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { handleFiles(Array.from(e.target.files)); fileInput.value = ''; });

dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  handleFiles(files);
});

async function handleFiles(files) {
  if (!files.length || isProcessing) return;
  isProcessing = true;
  ensureProgress();
  showProgress(0, files.length);

  let done = 0, errors = 0;

  for (let i = 0; i < files.length; i += CONFIG.BATCH_SIZE) {
    const batch = files.slice(i, i + CONFIG.BATCH_SIZE);
    await Promise.all(batch.map(async (file) => {
      try {
        // 1. Generar thumb local
        const img      = await fileToImg(file);
        const thumbURL = resizeTo(img, CONFIG.THUMB_SIZE, 0.80);
        const origURL  = resizeTo(img, 1400, CONFIG.ORIG_QUALITY);

        // 2. Subir ambas versiones a Cloudinary
        const [thumbCloud, origCloud] = await Promise.all([
          uploadToCloudinary(thumbURL, `thumb_${file.name}`),
          uploadToCloudinary(origURL,  file.name),
        ]);

        // 3. Guardar URLs en Supabase
        await sbInsert({
          name:      file.name,
          thumb_url: thumbCloud,
          orig_url:  origCloud,
        });
      } catch (err) {
        console.error('Error procesando', file.name, err);
        errors++;
      }
      showProgress(++done, files.length);
    }));
    await new Promise(r => setTimeout(r, 10));
  }

  hideProgress();
  await refreshGallery(false);
  const ok = done - errors;
  showToast(`✓ ${ok} foto${ok !== 1 ? 's' : ''} agregada${ok !== 1 ? 's' : ''}` +
            (errors ? ` (${errors} errores)` : ''));
  isProcessing = false;
}

// ─────────────────────────────────────────────
// BORRAR TODO
// ─────────────────────────────────────────────
btnClear.addEventListener('click', async () => {
  if (!totalPhotos) { showToast('La galería ya está vacía'); return; }
  if (!confirm(`¿Eliminar TODAS las ${totalPhotos} fotos? Esto no se puede deshacer.`)) return;
  await sbDeleteAll();
  totalPhotos = 0; currentPage = 0; imgCache.clear();
  await renderPageFull();
  showToast('Galería limpiada');
});

// ─────────────────────────────────────────────
// PAGINACIÓN
// ─────────────────────────────────────────────
btnPrev.addEventListener('click', () => { if (currentPage > 0) { currentPage--; renderPageFull(); } });
btnNext.addEventListener('click', () => { currentPage++; renderPageFull(); });

// ─────────────────────────────────────────────
// PROGRESO
// ─────────────────────────────────────────────
function ensureProgress() {
  if (progressWrap) return;
  progressWrap = document.createElement('div');
  progressWrap.className = 'progress-wrap';
  progressWrap.innerHTML =
    '<div class="progress-label" id="progressLabel"></div>' +
    '<div class="progress-track"><div class="progress-fill" id="progressBar"></div></div>';
  progressWrap.style.display = 'none';
  document.querySelector('.upload-section').appendChild(progressWrap);
  progressBar   = document.getElementById('progressBar');
  progressLabel = document.getElementById('progressLabel');
}

function showProgress(done, total) {
  progressWrap.style.display = 'block';
  const p = Math.round((done / total) * 100);
  progressBar.style.width = p + '%';
  progressLabel.textContent = `Subiendo ${done} / ${total} fotos (${p}%)`;
}

function hideProgress() { if (progressWrap) progressWrap.style.display = 'none'; }

// ─────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────
let _toastTimer;
function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ─────────────────────────────────────────────
// RESIZE
// ─────────────────────────────────────────────
let _resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => { if (totalPhotos) renderPageFull(); }, 250);
});

// ─────────────────────────────────────────────
// INICIO
// ─────────────────────────────────────────────
(async () => {
  // Verificar configuración
  if (CONFIG.CLOUDINARY_CLOUD_NAME === 'dx3musvxg') {
    showToast('⚠ Completá las credenciales en script.js — seguí SETUP.md');
  }
  await refreshGallery(false);
})();
