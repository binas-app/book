// ---------------------------------------------------------------------------
// Align tool – verzamel Y-posities van tabellen op de pagina
//
// Dit is een standalone test-pagina (zie align.html) bedoeld om handmatig
// per tabel vast te leggen waar op de pagina de tabel begint, zodat clicks
// in het overzicht niet alleen naar het juiste paginanummer springen, maar
// ook naar de juiste verticale positie binnen die pagina.
//
// Datamodel per tabel:
//   {
//     id:           "section/label[/childlabel]"  – stabiele key
//     page:         <int>      – paginanummer (zoals in PDF.js #page=N)
//     yFraction:    <0..1>     – fractie vanaf de bovenkant van de pagina
//     yPdfTop:      <number>   – PDF user-space Y (origin = linksonder)
//                                = pageHeight * (1 - yFraction)
//     pageHeight:   <number>   – PDF user-space hoogte van de pagina
//   }
//
// Voor de embedded Mozilla PDF.js viewer gebruiken we het URL-fragment
//   #page=N&zoom=auto,0,<yPdfTop>
// PDF.js scrolt dan zo dat de horizontale lijn op user-space Y=yPdfTop
// bovenaan het venster komt.
//
// Belangrijk: het op het eerste oog logischer ogende `view=FitH,Y` wordt
// door de gehoste mozilla.github.io PDF.js viewer in de praktijk NIET
// toegepast (de scroll blijft op page-top staan). `zoom=ZOOM,X,Y` met
// zoom=`auto` werkt wel betrouwbaar – getest met meerdere Y-waarden.
// ---------------------------------------------------------------------------

import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs';

// ---------- Config ---------------------------------------------------------

const PDF_FILENAME = 'Binas.pdf';
// Self-hosted viewer + relative PDF path (same origin) to avoid CORS.
const VIEWER_BASE_URL = 'pdfjs/web/viewer.html';
const PDF_VIEWER_FILE = '../../Binas.pdf';
const STORAGE_KEY = 'binas-align-data-v1';

// ---------- DOM refs -------------------------------------------------------

const $ = (id) => document.getElementById(id);

const navList = $('nav-list');
const navSearch = $('nav-search');
const status = $('status');
const countInfo = $('count-info');

const stage = $('viewer-stage');
const pageFrame = $('page-frame');
const pageCanvas = $('page-canvas');
const markerPreview = $('marker-preview');
const markerSaved = $('marker-saved');

const pageInfo = $('page-info');
const zoomInfo = $('zoom-info');
const btnPrev = $('btn-prev-page');
const btnNext = $('btn-next-page');
const btnZoomIn = $('btn-zoom-in');
const btnZoomOut = $('btn-zoom-out');
const btnZoomFit = $('btn-zoom-fit');

const embedIframe = $('embed-iframe');
const btnEmbedOriginal = $('btn-embed-original');
const btnEmbedAligned = $('btn-embed-aligned');
const btnEmbedReload = $('btn-embed-reload');

const btnSave = $('btn-save');
const btnClearCurrent = $('btn-clear-current');
const btnExport = $('btn-export');
const btnImport = $('btn-import');
const importFile = $('import-file');
const btnResetAll = $('btn-reset-all');

const inputPage = $('input-page');
const inputFraction = $('input-fraction');
const inputYPdf = $('input-y-pdf');
const inputPageHeight = $('input-page-height');
const selectedIdLabel = $('selected-id');

// ---------- State ----------------------------------------------------------

const state = {
  flatItems: [],
  itemById: new Map(),
  selectedId: null,
  currentPdfPage: 1,
  pageCount: 0,
  scale: 1.0,
  pdfDoc: null,
  pdfPageCache: new Map(),
  currentPageHeight: null,
  currentPageWidth: null,
  draftFraction: null,
  alignments: loadAlignments(),
  searchTerm: '',
  filteredIds: null,
};

// ---------- Persistence ----------------------------------------------------

function loadAlignments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveAlignments() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.alignments));
}

// ---------- Navigation data ------------------------------------------------

async function loadNavigationData() {
  const res = await fetch('navigation-data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('navigation-data.json niet gevonden');
  const sections = await res.json();

  const flat = [];
  for (const section of sections) {
    flat.push({ kind: 'section', label: section.section });
    for (const item of section.items || []) {
      const baseId = `${section.section}/${item.label ?? item.title}`;
      flat.push({
        kind: 'item',
        id: baseId,
        section: section.section,
        label: item.label ?? '',
        title: item.title,
        page: item.page,
        isSub: false,
      });
      for (const child of item.children || []) {
        flat.push({
          kind: 'item',
          id: `${baseId}/${child.label ?? child.title}`,
          section: section.section,
          label: `${item.label ?? ''}${child.label ? '.' + child.label : ''}`,
          title: child.title,
          page: child.page,
          isSub: true,
        });
      }
    }
  }
  state.flatItems = flat;
  state.itemById = new Map(
    flat.filter((x) => x.kind === 'item').map((x) => [x.id, x])
  );
}

// ---------- Sidebar render -------------------------------------------------

function renderNavList() {
  const term = state.searchTerm.trim().toLowerCase();
  const frag = document.createDocumentFragment();

  let renderedItems = 0;
  let lastSection = null;
  for (const node of state.flatItems) {
    if (node.kind === 'section') {
      lastSection = node;
      continue;
    }

    if (term) {
      const haystack =
        `${node.label} ${node.title} ${node.section}`.toLowerCase();
      if (!haystack.includes(term)) continue;
    }

    if (lastSection) {
      const li = document.createElement('li');
      li.className = 'nav-section';
      li.textContent = lastSection.label;
      frag.appendChild(li);
      lastSection = null;
    }

    const li = document.createElement('li');
    li.className = 'nav-item' + (node.isSub ? ' is-sub' : '');
    if (state.selectedId === node.id) li.classList.add('active');

    const align = state.alignments[node.id];
    if (align && typeof align.yFraction === 'number') {
      if (align.page === node.page) {
        li.classList.add('aligned');
      } else {
        li.classList.add('has-marker-only');
      }
    }

    li.dataset.id = node.id;
    li.innerHTML = `
      <span class="status-dot" title="alignment-status"></span>
      <span class="label-badge">${escapeHtml(node.label || '·')}</span>
      <span class="item-title" title="${escapeHtml(node.title)}">${escapeHtml(node.title)}</span>
    `;
    li.addEventListener('click', () => selectItem(node.id));
    frag.appendChild(li);
    renderedItems += 1;
  }

  navList.replaceChildren(frag);

  const total = state.flatItems.filter((n) => n.kind === 'item').length;
  const aligned = Object.values(state.alignments).filter(
    (a) => a && typeof a.yFraction === 'number'
  ).length;
  countInfo.textContent = `${aligned}/${total} opgeslagen` +
    (term ? ` (${renderedItems} match)` : '');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

// ---------- PDF rendering --------------------------------------------------

async function loadPdf() {
  const loadingTask = pdfjsLib.getDocument({
    url: PDF_FILENAME,
    rangeChunkSize: 65536,
  });
  state.pdfDoc = await loadingTask.promise;
  state.pageCount = state.pdfDoc.numPages;
}

async function getPdfPage(pageNum) {
  if (state.pdfPageCache.has(pageNum)) {
    return state.pdfPageCache.get(pageNum);
  }
  const page = await state.pdfDoc.getPage(pageNum);
  state.pdfPageCache.set(pageNum, page);
  return page;
}

let renderTask = null;

async function renderPage(pageNum) {
  if (!state.pdfDoc) return;
  if (pageNum < 1 || pageNum > state.pageCount) return;

  state.currentPdfPage = pageNum;
  pageInfo.textContent = `pagina ${pageNum} / ${state.pageCount}`;
  inputPage.value = pageNum;

  if (renderTask) {
    try { renderTask.cancel(); } catch (_) {}
  }

  const page = await getPdfPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1.0 });
  state.currentPageHeight = baseViewport.height;
  state.currentPageWidth = baseViewport.width;
  inputPageHeight.value = baseViewport.height.toFixed(2);

  if (state.scale === 'fit') {
    const stageWidth = stage.clientWidth - 32 - 16; // padding + scrollbar room
    state.scale = Math.max(0.4, stageWidth / baseViewport.width);
  }

  const viewport = page.getViewport({ scale: state.scale });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  pageCanvas.width = Math.floor(viewport.width * dpr);
  pageCanvas.height = Math.floor(viewport.height * dpr);
  pageCanvas.style.width = `${Math.floor(viewport.width)}px`;
  pageCanvas.style.height = `${Math.floor(viewport.height)}px`;
  pageFrame.style.width = `${Math.floor(viewport.width)}px`;
  pageFrame.style.height = `${Math.floor(viewport.height)}px`;
  pageFrame.style.display = 'block';

  // Reserve scroll room below the page so any Y on the page can actually be
  // scrolled to the top of the viewport, not just whatever fits in view.
  // Mimic the embedded viewer's behaviour where the next page acts as buffer.
  const reserve = Math.max(0, stage.clientHeight - 80);
  pageFrame.style.marginBottom = `${reserve}px`;

  const ctx = pageCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  zoomInfo.textContent = `${Math.round(state.scale * 100)}%`;

  renderTask = page.render({ canvasContext: ctx, viewport });
  try {
    await renderTask.promise;
  } catch (err) {
    if (err && err.name === 'RenderingCancelledException') return;
    console.error('render error', err);
  }
  stage.dataset.loading = 'false';

  redrawMarkers();
}

// ---------- Markers --------------------------------------------------------

function redrawMarkers() {
  const item = currentItem();
  if (!item) {
    markerSaved.style.display = 'none';
    markerPreview.style.display = 'none';
    return;
  }
  const align = state.alignments[item.id];
  const pageHeightPx = pageCanvas.style.height
    ? parseFloat(pageCanvas.style.height)
    : 0;

  if (
    align &&
    typeof align.yFraction === 'number' &&
    align.page === state.currentPdfPage
  ) {
    markerSaved.style.top = `${align.yFraction * pageHeightPx}px`;
    markerSaved.dataset.tag = `opgeslagen · y=${(align.yFraction * 100).toFixed(1)}%`;
    markerSaved.style.display = 'block';
  } else {
    markerSaved.style.display = 'none';
  }

  if (
    state.draftFraction !== null &&
    inputPage.valueAsNumber === state.currentPdfPage
  ) {
    markerPreview.style.top = `${state.draftFraction * pageHeightPx}px`;
    markerPreview.dataset.tag = `concept · y=${(state.draftFraction * 100).toFixed(1)}%`;
    markerPreview.style.display = 'block';
  } else {
    markerPreview.style.display = 'none';
  }
}

function currentItem() {
  if (!state.selectedId) return null;
  return state.itemById.get(state.selectedId) || null;
}

// Scroll the custom viewer's stage so the given page-fraction is at the top
// of the visible area (with a small breathing-room offset).
function scrollStageToFraction(fraction) {
  const pageHeightPx = parseFloat(pageCanvas.style.height) || 0;
  if (!pageHeightPx) return;
  // .viewer-stage has padding: 16px in CSS – the page-frame starts at that offset
  const STAGE_TOP_PADDING = 16;
  const BREATHING_ROOM = 8;
  const targetWithinPage = fraction * pageHeightPx;
  const scrollTarget = STAGE_TOP_PADDING + targetWithinPage - BREATHING_ROOM;
  stage.scrollTop = Math.max(0, scrollTarget);
}

// ---------- Selection logic ------------------------------------------------

async function selectItem(id) {
  const item = state.itemById.get(id);
  if (!item) return;
  state.selectedId = id;

  const existing = state.alignments[id];
  state.draftFraction = existing ? existing.yFraction : null;

  inputPage.value = (existing && existing.page) || item.page;
  inputFraction.value = existing ? existing.yFraction.toFixed(4) : '';
  inputYPdf.value = existing ? existing.yPdfTop.toFixed(2) : '';
  selectedIdLabel.textContent = id;

  updateStatus();
  renderNavList();
  btnSave.disabled = false;
  btnClearCurrent.disabled = !existing;

  await renderPage((existing && existing.page) || item.page);
  if (existing && typeof existing.yFraction === 'number') {
    scrollStageToFraction(existing.yFraction);
  } else {
    stage.scrollTop = 0;
  }
  loadEmbeddedViewer({ aligned: !!existing });
}

function updateStatus() {
  const item = currentItem();
  if (!item) {
    status.innerHTML = 'Geen tabel geselecteerd. Kies een tabel uit de lijst om te beginnen.';
    return;
  }
  const align = state.alignments[item.id];
  const pill = align
    ? `<span class="pill good">opgeslagen</span>`
    : `<span class="pill warn">nog niet</span>`;
  status.innerHTML = `
    ${pill}
    <strong>${escapeHtml(item.section)}</strong> ·
    tabel <strong>${escapeHtml(item.label)}</strong> ·
    ${escapeHtml(item.title)} ·
    origineel: pagina <strong>${item.page}</strong>
    ${align ? `· y=${(align.yFraction * 100).toFixed(1)}% (PDF y=${align.yPdfTop.toFixed(1)})` : ''}
  `;
}

// ---------- Click on PDF ---------------------------------------------------

stage.addEventListener('click', (e) => {
  if (!state.selectedId) return;
  if (!pageCanvas || pageCanvas.style.display === 'none') return;
  const rect = pageCanvas.getBoundingClientRect();
  if (
    e.clientX < rect.left || e.clientX > rect.right ||
    e.clientY < rect.top || e.clientY > rect.bottom
  ) {
    return;
  }
  const yWithin = e.clientY - rect.top;
  const fraction = Math.max(0, Math.min(1, yWithin / rect.height));
  setDraftFraction(fraction, state.currentPdfPage);
});

stage.addEventListener('mousemove', (e) => {
  if (!state.selectedId) {
    markerPreview.style.display = 'none';
    return;
  }
  const rect = pageCanvas.getBoundingClientRect();
  if (
    e.clientX < rect.left || e.clientX > rect.right ||
    e.clientY < rect.top || e.clientY > rect.bottom
  ) {
    markerPreview.style.display = 'none';
    return;
  }
  const yWithin = e.clientY - rect.top;
  const fraction = Math.max(0, Math.min(1, yWithin / rect.height));
  const pageHeightPx = parseFloat(pageCanvas.style.height);
  markerPreview.style.top = `${fraction * pageHeightPx}px`;
  markerPreview.dataset.tag = `hover · y=${(fraction * 100).toFixed(1)}%`;
  markerPreview.style.display = 'block';
});

function setDraftFraction(fraction, pageNum) {
  state.draftFraction = fraction;
  inputFraction.value = fraction.toFixed(4);
  inputPage.value = pageNum;
  if (state.currentPageHeight) {
    const yPdf = state.currentPageHeight * (1 - fraction);
    inputYPdf.value = yPdf.toFixed(2);
  }
  redrawMarkers();
}

// ---------- Manual input fields --------------------------------------------

inputFraction.addEventListener('input', () => {
  const v = parseFloat(inputFraction.value);
  if (!isFinite(v)) return;
  const f = Math.max(0, Math.min(1, v));
  state.draftFraction = f;
  if (state.currentPageHeight) {
    inputYPdf.value = (state.currentPageHeight * (1 - f)).toFixed(2);
  }
  redrawMarkers();
});

inputYPdf.addEventListener('input', () => {
  const v = parseFloat(inputYPdf.value);
  if (!isFinite(v) || !state.currentPageHeight) return;
  const f = Math.max(0, Math.min(1, 1 - v / state.currentPageHeight));
  state.draftFraction = f;
  inputFraction.value = f.toFixed(4);
  redrawMarkers();
});

inputPage.addEventListener('change', () => {
  const v = parseInt(inputPage.value, 10);
  if (!isFinite(v) || v < 1 || v > state.pageCount) return;
  renderPage(v);
});

// ---------- Save / Clear ---------------------------------------------------

function saveCurrent() {
  const item = currentItem();
  if (!item) return;
  if (state.draftFraction === null) return;
  const page = parseInt(inputPage.value, 10) || item.page;
  const f = state.draftFraction;
  const pageHeight = state.currentPageHeight || 0;
  const yPdfTop = pageHeight * (1 - f);
  state.alignments[item.id] = {
    id: item.id,
    label: item.label,
    title: item.title,
    section: item.section,
    page,
    yFraction: Number(f.toFixed(5)),
    yPdfTop: Number(yPdfTop.toFixed(3)),
    pageHeight: Number(pageHeight.toFixed(3)),
    updatedAt: new Date().toISOString(),
  };
  saveAlignments();
  btnClearCurrent.disabled = false;
  updateStatus();
  renderNavList();
  redrawMarkers();
  loadEmbeddedViewer({ aligned: true });
}

function clearCurrent() {
  const item = currentItem();
  if (!item) return;
  delete state.alignments[item.id];
  saveAlignments();
  state.draftFraction = null;
  inputFraction.value = '';
  inputYPdf.value = '';
  btnClearCurrent.disabled = true;
  updateStatus();
  renderNavList();
  redrawMarkers();
  loadEmbeddedViewer({ aligned: false });
}

btnSave.addEventListener('click', saveCurrent);
btnClearCurrent.addEventListener('click', clearCurrent);

// ---------- Embedded viewer ------------------------------------------------

function getViewerUrl() {
  return `${VIEWER_BASE_URL}?file=${encodeURIComponent(PDF_VIEWER_FILE)}`;
}

function loadEmbeddedViewer({ aligned }) {
  const item = currentItem();
  if (!item) {
    embedIframe.src = '';
    return;
  }
  const align = state.alignments[item.id];
  const cacheBuster = Date.now();
  let hash;
  if (aligned && align && typeof align.yPdfTop === 'number') {
    hash = `#page=${align.page}&zoom=auto,0,${align.yPdfTop.toFixed(2)}&v=${cacheBuster}`;
  } else {
    const page = (align && align.page) || item.page;
    hash = `#page=${page}&v=${cacheBuster}`;
  }
  embedIframe.src = `${getViewerUrl()}${hash}`;
}

btnEmbedOriginal.addEventListener('click', () => loadEmbeddedViewer({ aligned: false }));
btnEmbedAligned.addEventListener('click', () => loadEmbeddedViewer({ aligned: true }));
btnEmbedReload.addEventListener('click', () => {
  if (embedIframe.src) {
    embedIframe.src = embedIframe.src;
  }
});

// ---------- Toolbar buttons ------------------------------------------------

btnPrev.addEventListener('click', () => renderPage(state.currentPdfPage - 1));
btnNext.addEventListener('click', () => renderPage(state.currentPdfPage + 1));
btnZoomIn.addEventListener('click', () => {
  state.scale = Math.min(3, (typeof state.scale === 'number' ? state.scale : 1) + 0.15);
  renderPage(state.currentPdfPage);
});
btnZoomOut.addEventListener('click', () => {
  state.scale = Math.max(0.3, (typeof state.scale === 'number' ? state.scale : 1) - 0.15);
  renderPage(state.currentPdfPage);
});
btnZoomFit.addEventListener('click', () => {
  state.scale = 'fit';
  renderPage(state.currentPdfPage);
});

navSearch.addEventListener('input', () => {
  state.searchTerm = navSearch.value;
  renderNavList();
});

// ---------- Export / Import ------------------------------------------------

btnExport.addEventListener('click', () => {
  const data = {
    generatedAt: new Date().toISOString(),
    pdf: PDF_FILENAME,
    note: 'Binas align tool – yFraction is fractie vanaf bovenkant van de pagina (0..1). yPdfTop is in PDF user-space (origin linksonder), bruikbaar in #page=N&view=FitH,Y van pdf.js.',
    items: state.alignments,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `binas-align-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

btnImport.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const items = parsed.items || parsed;
    if (!items || typeof items !== 'object') throw new Error('Geen items');
    state.alignments = items;
    saveAlignments();
    renderNavList();
    if (state.selectedId) selectItem(state.selectedId);
    alert(`Geïmporteerd: ${Object.keys(items).length} alignments.`);
  } catch (err) {
    alert('Import mislukt: ' + err.message);
  } finally {
    importFile.value = '';
  }
});

btnResetAll.addEventListener('click', () => {
  if (!confirm('Alle opgeslagen alignment-data wissen?')) return;
  state.alignments = {};
  saveAlignments();
  renderNavList();
  if (state.selectedId) selectItem(state.selectedId);
});

// ---------- Keyboard shortcuts ---------------------------------------------

window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
    return;
  }
  if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    saveCurrent();
  } else if (e.key === 'ArrowLeft') {
    cycleSelection(-1);
  } else if (e.key === 'ArrowRight') {
    cycleSelection(1);
  } else if (e.key === 'PageUp') {
    renderPage(state.currentPdfPage - 1);
  } else if (e.key === 'PageDown') {
    renderPage(state.currentPdfPage + 1);
  }
});

function cycleSelection(delta) {
  const items = state.flatItems.filter((x) => x.kind === 'item');
  const idx = items.findIndex((x) => x.id === state.selectedId);
  if (idx < 0) {
    if (items.length) selectItem(items[0].id);
    return;
  }
  const nextIdx = (idx + delta + items.length) % items.length;
  selectItem(items[nextIdx].id);
}

// ---------- Bootstrap ------------------------------------------------------

(async function init() {
  try {
    await loadNavigationData();
    renderNavList();
    state.scale = 'fit';
    await loadPdf();
    await renderPage(1);
  } catch (err) {
    console.error(err);
    stage.dataset.loading = 'false';
    stage.innerHTML = `<div style="padding:24px;color:#fca5a5;">Laden mislukt: ${escapeHtml(err.message)}</div>`;
  }
})();
