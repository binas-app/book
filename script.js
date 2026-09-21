import {
  initializeApp,
  getApps,
  getApp,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-analytics.js";
import {
  getAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  signOut,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import BINAS_CONFIG_DEFAULT from './config.js';

// Merge default config with local admin overrides
const LOCAL_CONFIG_KEY = 'binas:admin-config-override';
let BINAS_CONFIG = { ...BINAS_CONFIG_DEFAULT };
try {
  const localOverride = localStorage.getItem(LOCAL_CONFIG_KEY);
  if (localOverride) {
    BINAS_CONFIG = { ...BINAS_CONFIG, ...JSON.parse(localOverride) };
  }
} catch (e) {
  console.warn('Could not load local config override:', e);
}
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// --- Elements ---
const navList = document.getElementById('nav-list');
const favoritesList = document.getElementById('favorites-body');
const favoritesView = document.getElementById('favorites-view');
const tocMain = document.getElementById('toc-main');
const tocJumpbar = document.getElementById('toc-jumpbar');
const navSearch = document.getElementById('nav-search');
const navDialogSearch = document.getElementById('nav-dialog-search');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const layout = document.querySelector('.layout');
const sidebarToggleFloating = document.getElementById('sidebar-toggle-floating');
const navDialogOpenBtn = document.getElementById('nav-dialog-open');
const navDialogCloseBtn = document.getElementById('nav-dialog-close');
const navDialog = document.getElementById('nav-dialog');
const viewerFrame = document.getElementById('pdf-viewer-frame');

// Sidebar Icons & Bottom Menu
const btnMenuToc = document.getElementById('btn-menu-toc');
const btnMenuFavorites = document.getElementById('btn-menu-favorites');
const btnMenuRecent = document.getElementById('btn-menu-recent');
const recentView = document.getElementById('recent-view');
const recentBody = document.getElementById('recent-body');
const btnMenuAccount = document.getElementById('btn-menu-account');
const btnMenuSettings = document.getElementById('btn-menu-settings');
const iconSidebar = document.querySelector('.icon-sidebar');

// Overlays
const settingsOverlay = document.getElementById('settings-overlay');
const settingsClose = document.getElementById('settings-close');

const accountOverlay = document.getElementById('account-overlay');
const accountClose = document.getElementById('account-close');
const overlayAuthName = document.getElementById('overlay-auth-name');
const overlayAuthEmail = document.getElementById('overlay-auth-email');
const overlayLogout = document.getElementById('overlay-logout');
const overlayLoginInput = document.getElementById('overlay-login-input');
const overlayLoginBtn = document.getElementById('overlay-login-btn');
const overlayLoginMsg = document.getElementById('overlay-login-msg');
const btnLoginGoogle = document.getElementById('btn-login-google');
const overlayLoginSection = document.getElementById('overlay-login-section');

// Context Menu (rebuilt dynamically per item)
const contextMenu = document.getElementById('context-menu');

// --- Toast Notification System ---
function showToast(message, variant = 'info') {
  // Remove existing toast if present
  const existingToast = document.getElementById('binas-toast');
  if (existingToast) {
    existingToast.remove();
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.id = 'binas-toast';
  toast.className = `binas-toast binas-toast--${variant}`;
  toast.innerHTML = `
    <div class="binas-toast__content">
      <span class="binas-toast__icon">${variant === 'success' ? '✓' : variant === 'error' ? '⚠' : 'ℹ'}</span>
      <span class="binas-toast__message">${message}</span>
    </div>
    <button class="binas-toast__close" aria-label="Sluiten">×</button>
  `;

  // Add to body
  document.body.appendChild(toast);

  // Close button functionality
  toast.querySelector('.binas-toast__close').addEventListener('click', () => {
    toast.classList.add('binas-toast--hiding');
    setTimeout(() => toast.remove(), 300);
  });

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.add('binas-toast--visible');
  });

  // Auto-hide after 5 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add('binas-toast--hiding');
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}

// --- State Keys ---
const sidebarCollapsedKey = 'binas:sidebar-collapsed';
const favoritesKey = 'binas:favorites-local';

// --- State Variables ---
let navigationData = [];
let favorites = []; // Array of objects { page, title, label, theme }
let currentSearchQuery = '';
let initialSearchQuery = '';
let firebaseApp;
let auth;
let firestore;
let currentUser = null;
let currentPage = 1;
let isProcessingAuth = false; // Prevent race conditions

const firebaseAuthDomain = BINAS_CONFIG?.authDomain || 'account.binas.app';
const firebaseConfig = {
  apiKey: "AIzaSyBgXo3zllXtFJZDn4elpY8DemEQG_ltMk0",
  authDomain: firebaseAuthDomain,
  projectId: "binas-91a32",
  storageBucket: "binas-91a32.firebasestorage.app",
  messagingSenderId: "971498903694",
  appId: "1:971498903694:web:5ab8b630b183f5204ed1df",
  measurementId: "G-1LLBGZNRNC",
};
// Self-hosted PDF.js viewer so the PDF can be loaded via a relative path.
// The mozilla.github.io demo viewer is a different origin; browsers then
// block fetching Binas.pdf (CORS). Same-origin relative loading avoids that.
const viewerBaseUrl = 'pdfjs/web/viewer.html';
const pdfRelativePath = '../../Binas.pdf';
const sectionCollapseState = {};
let alignMap = {};
let activeVakCategory = null; // null = alle

// --- Initialization ---

function getViewerUrl() {
  return `${viewerBaseUrl}?file=${encodeURIComponent(pdfRelativePath)}`;
}

function initFirebase() {
  if (!firebaseApp) {
    firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
    try {
      getAnalytics(firebaseApp);
    } catch (error) {
      console.warn('Analytics niet beschikbaar:', error);
    }
  }
  if (!auth) {
    auth = getAuth(firebaseApp);
    auth.languageCode = 'nl';
  }
  if (!firestore) {
    firestore = getFirestore(firebaseApp);
  }
}


// Show confirmation dialog
function showConfirmDialog(title, message) {
  return new Promise((resolve) => {
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'binas-confirm-overlay';
    dialogOverlay.innerHTML = `
      <div class="binas-confirm-dialog">
        <h3 class="binas-confirm-title">${escapeHtml(title)}</h3>
        <p class="binas-confirm-text">${escapeHtml(message)}</p>
        <div class="binas-confirm-buttons">
          <button class="binas-confirm-btn binas-confirm-btn--cancel">Annuleren</button>
          <button class="binas-confirm-btn binas-confirm-btn--confirm" style="background: #ef4444; border-color: #ef4444;">Verwijderen</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialogOverlay);
    
    requestAnimationFrame(() => {
      dialogOverlay.classList.add('binas-confirm-overlay--visible');
    });
    
    const cleanup = () => {
      dialogOverlay.classList.remove('binas-confirm-overlay--visible');
      setTimeout(() => dialogOverlay.remove(), 300);
    };
    
    dialogOverlay.querySelector('.binas-confirm-btn--confirm').addEventListener('click', () => {
      cleanup();
      resolve(true);
    });
    
    dialogOverlay.querySelector('.binas-confirm-btn--cancel').addEventListener('click', () => {
      cleanup();
      resolve(false);
    });
  });
}

// Escape HTML helper
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


// --- Navigation Rendering ---

function openPage(page, yPdfTop) {
  currentPage = page;
  const viewToken = Date.now();
  let hash;
  if (typeof yPdfTop === 'number') {
    hash = `#page=${page}&zoom=auto,0,${yPdfTop.toFixed(2)}&v=${viewToken}`;
  } else {
    hash = `#page=${page}&view=${viewToken}`;
  }
  const nextSrc = `${getViewerUrl()}${hash}`;
  viewerFrame.src = nextSrc;
}

function buildNavigationItem(item, onSelect) {
  const li = document.createElement('li');
  li.className = 'nav-item';

  // Wrap the link + star in a row so they sit side-by-side
  const row = document.createElement('div');
  row.className = 'nav-item-row';

  const button = document.createElement('button');
  button.className = 'nav-link';
  button.type = 'button';

  if (item.isSubtable) {
    button.classList.add('is-subtable');
  }

  if (item._searchLabelNorm) {
    button.dataset.searchLabel = item._searchLabelNorm;
  }

  const hl = currentSearchQuery;
  button.innerHTML = `
    <span class="nav-label">${item.label ?? ''}</span>
    <div class="nav-text">
      <span class="nav-title">${hl ? highlightHtml(item.title, hl) : escapeHtml(item.title)}</span>
    </div>
  `;

  button.addEventListener('click', () => {
    const alignData = alignMap[item.alignKey];
    openPage(item.page, alignData?.yPdfTop);
    trackRecentFromNavItem(item);
    onSelect?.();
  });

  // Context Menu for Favorites
  button.addEventListener('contextmenu', (e) => {
    handleContextMenu(e, item);
  });

  row.appendChild(button);

  // Inline favorite star — always visible on items that can be opened
  if (typeof item.page === 'number') {
    const starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.className = 'nav-fav-star';
    const favKey = getFavoriteKey(item);
    starBtn.dataset.favKey = favKey;
    const isFav = isItemFavorited(item);
    starBtn.classList.toggle('is-active', isFav);
    starBtn.setAttribute('aria-pressed', String(isFav));
    starBtn.setAttribute('aria-label', isFav ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten');
    starBtn.title = isFav ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten';
    starBtn.innerHTML = STAR_ICON_SVG;
    starBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleStarClick(item, starBtn);
    });
    row.appendChild(starBtn);
  }

  li.appendChild(row);

  if (Array.isArray(item.children) && item.children.length) {
    const sublist = document.createElement('ul');
    sublist.className = 'nav-sublist';
    item.children.forEach((child) =>
      sublist.appendChild(buildNavigationItem(child, onSelect)) // theme and fullLabel are already enriched
    );
    li.appendChild(sublist);
  }

  return li;
}

function renderNavigation(data, targetList, onSelect) {
  if (!targetList) return;
  targetList.innerHTML = '';
  // After this function returns, refreshNavStars() will sync star states (we
  // schedule it asynchronously to ensure both nav lists exist if both are
  // rendered together).
  setTimeout(refreshNavStars, 0);
  data.forEach((section) => {
    const sectionLi = document.createElement('li');
    sectionLi.className = 'nav-section';
    sectionLi.dataset.theme = section.theme;

    const sectionKey = section.section ?? section.theme;
    const isCollapsed = sectionCollapseState[sectionKey] ?? false;

    const heading = document.createElement('button');
    heading.className = 'nav-section-heading';
    heading.type = 'button';
    heading.setAttribute('aria-expanded', String(!isCollapsed));
    heading.innerHTML = `
      <span class="nav-section-title">${section.section}</span>
      <span class="nav-section-arrow" aria-hidden="true">›</span>
    `;
    heading.addEventListener('click', () => {
      const nextState = !(sectionCollapseState[sectionKey] ?? false);
      sectionCollapseState[sectionKey] = nextState;
      applySectionCollapse(sectionLi, list, heading, nextState);
    });
    sectionLi.appendChild(heading);

    const list = document.createElement('ul');
    list.className = 'nav-section-list';
    section.items.forEach((item) =>
      list.appendChild(buildNavigationItem({ ...item, theme: section.theme }, onSelect))
    );
    sectionLi.appendChild(list);

    applySectionCollapse(sectionLi, list, heading, isCollapsed);

    targetList.appendChild(sectionLi);
  });
}

// --- Fullscreen table of contents (⤢) ---
//
// Renders the same navigation data as a book-style index: one column block per
// subject, tables numbered in the subject colour, sub-tables lettered beneath
// their parent. Separate from renderNavigation() because the sidebar needs the
// collapsible nested list and this needs a flat, print-like layout.

const TOC_SECTION_COLORS = {
  algemeen: '#cc2f8f',
  natuurkunde: '#0a6cb8',
  wiskunde: '#6b4bb5',
  scheikunde: '#c2571a',
  biologie: '#157f4c',
};

// Everything past Biologie — Veiligheid & milieu, Register, tabel 98-100 —
// shares one neutral tone so the coloured subjects stand out.
const TOC_APPENDIX_COLOR = '#55606d';

function tocSectionNumbers(section) {
  return (section.items || [])
    .map((item) => parseInt(item.label, 10))
    .filter(Number.isInteger);
}

function tocSectionColor(section) {
  const numbers = tocSectionNumbers(section);
  const first = numbers.length ? Math.min(...numbers) : null;
  if (section.theme === 'register' || (first !== null && first >= 96)) {
    return TOC_APPENDIX_COLOR;
  }
  return TOC_SECTION_COLORS[section.theme] || TOC_APPENDIX_COLOR;
}

function tocSectionRange(section) {
  const numbers = tocSectionNumbers(section);
  if (!numbers.length) return '';
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return min === max ? `tabel ${min}` : `tabel ${min}–${max}`;
}

function renderTocOverview(sections) {
  if (!tocMain) return;
  tocMain.innerHTML = '';
  if (tocJumpbar) tocJumpbar.innerHTML = '';

  if (!sections.length) {
    const empty = document.createElement('div');
    empty.className = 'toc-empty';
    const q = currentSearchQuery;
    empty.innerHTML = q
      ? `<span class="toc-empty-title">Geen tabellen gevonden</span>
         <span class="toc-empty-sub">voor &ldquo;${escapeHtml(q)}&rdquo;</span>`
      : '<span class="toc-empty-title">Geen tabellen beschikbaar</span>';
    tocMain.appendChild(empty);
    return;
  }

  sections.forEach((section, index) => {
    const color = tocSectionColor(section);
    const sectionId = `toc-sec-${index}`;

    if (tocJumpbar) {
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'toc-jump';
      jump.innerHTML = `
        <span class="toc-jump-dot" style="background:${color}"></span>
        <span>${escapeHtml(section.section || '')}</span>
        <span class="toc-jump-count">${(section.items || []).length}</span>
      `;
      jump.addEventListener('click', () => scrollTocToSection(sectionId));
      tocJumpbar.appendChild(jump);
    }

    const sectionEl = document.createElement('section');
    sectionEl.className = 'toc-section';
    sectionEl.id = sectionId;
    sectionEl.style.setProperty('--toc-color', color);
    // The Register block has no numbered tables, so it gets no range label.
    const range = tocSectionRange(section);
    sectionEl.innerHTML = `
      <div class="toc-section-head">
        <h2 class="toc-section-title">${escapeHtml(section.section || '')}</h2>
        ${range ? `<span class="toc-section-range">${escapeHtml(range)}</span>` : ''}
      </div>
    `;

    const columns = document.createElement('div');
    columns.className = 'toc-columns';
    (section.items || []).forEach((item) =>
      columns.appendChild(buildTocEntry({ ...item, theme: section.theme }))
    );
    sectionEl.appendChild(columns);

    tocMain.appendChild(sectionEl);
  });
}

// A plain anchor jump would land the section underneath the sticky bar, so
// position it by hand: content offsets are measured from the top of the
// scroller, which already accounts for the bar's height.
function scrollTocToSection(sectionId) {
  const target = document.getElementById(sectionId);
  const scroller = tocMain?.closest('.toc-scroll');
  if (!target || !scroller) return;
  const barHeight = scroller.querySelector('.toc-topbar')?.offsetHeight || 0;
  scroller.scrollTop = Math.max(target.offsetTop - barHeight - 8, 0);
}

// A table plus its sub-tables, kept together in one column.
function buildTocEntry(item) {
  const entry = document.createElement('div');
  entry.className = 'toc-entry';
  entry.appendChild(buildTocRow(item, false));
  (item.children || []).forEach((child) => entry.appendChild(buildTocRow(child, true)));
  return entry;
}

function buildTocRow(item, isSub) {
  const link = document.createElement('a');
  link.className = isSub ? 'toc-sub' : 'toc-row';
  link.href = '#';

  const hl = currentSearchQuery;
  const title = hl ? highlightHtml(item.title || '', hl) : escapeHtml(item.title || '');
  link.innerHTML = isSub
    ? `<span class="toc-sub-letter">${escapeHtml(item.label ?? '')}</span>
       <span class="toc-sub-title">${title}</span>`
    : `<span class="toc-row-nr">${escapeHtml(item.label ?? '')}</span>
       <span class="toc-row-title">${title}</span>
       <span class="toc-row-page">${item.page ?? ''}</span>`;

  link.addEventListener('click', (e) => {
    e.preventDefault();
    const alignData = alignMap[item.alignKey];
    openPage(item.page, alignData?.yPdfTop);
    trackRecentFromNavItem(item);
    hideNavDialog();
  });
  link.addEventListener('contextmenu', (e) => handleContextMenu(e, item));

  return link;
}

function applySectionCollapse(sectionElement, listElement, headingElement, collapsed) {
  sectionElement.classList.toggle('is-collapsed', collapsed);
  if (listElement) listElement.hidden = collapsed;
  headingElement?.setAttribute('aria-expanded', String(!collapsed));
}

// --- Search ---

function normalizeSearch(value) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');
}

// Annotate every navigation item with a pre-computed search index so the
// filter step doesn't need to re-normalize text on every keystroke. The
// indexed text includes every ancestor's label + title, so a query like
// "molmassa" still matches a leaf row that lives under a parent named
// "Molmassa". This is called once after the navigation data is loaded.
function indexNavigationSearchText(sections) {
  const visit = (item, ancestorRaw, ancestorNorm) => {
    const ownRaw = `${item.label ?? ''} ${item.title ?? ''}`.toLowerCase().trim();
    const ownNorm = normalizeSearch(`${item.label ?? ''}${item.title ?? ''}`);
    const combinedRaw = ancestorRaw ? `${ancestorRaw} ${ownRaw}`.trim() : ownRaw;
    const combinedNorm = ancestorNorm + ownNorm;

    item._searchRaw = combinedRaw;
    item._searchNorm = combinedNorm;
    item._searchLabelNorm = normalizeSearch(item.fullLabel || item.label || '');

    if (Array.isArray(item.children)) {
      item.children.forEach((child) => visit(child, combinedRaw, combinedNorm));
    }
  };

  sections.forEach((section) => {
    if (!Array.isArray(section.items)) return;
    section.items.forEach((item) => visit(item, '', ''));
  });
}

let lastFilterQuery = null;

function pickBestNavMatch(targetList, query) {
  if (!targetList) return null;
  const links = Array.from(targetList.querySelectorAll('.nav-link'));
  if (links.length === 0) return null;
  const normalizedQuery = normalizeSearch(query || '');
  if (!normalizedQuery) return links[0];
  const exact = links.find((l) => l.dataset.searchLabel === normalizedQuery);
  if (exact) return exact;
  const subStarts = links.find((l) =>
    l.classList.contains('is-subtable') && l.dataset.searchLabel?.startsWith(normalizedQuery)
  );
  if (subStarts) return subStarts;
  const anyStarts = links.find((l) => l.dataset.searchLabel?.startsWith(normalizedQuery));
  if (anyStarts) return anyStarts;
  return links[0];
}

function filterNavigation(query, { force = false } = {}) {
  const rawQuery = (query || '').trim().toLowerCase();
  currentSearchQuery = rawQuery;

  if (!force && rawQuery === lastFilterQuery) return;
  lastFilterQuery = rawQuery;

  const normalizedQuery = normalizeSearch(query);
  const tokenizedQuery = (query || '').split(/\s+/).map(normalizeSearch).filter(Boolean);
  const isEmpty = !rawQuery && !normalizedQuery && tokenizedQuery.length === 0;

  const matches = (item) => {
    if (isEmpty) return true;
    const raw = item._searchRaw || '';
    const norm = item._searchNorm || '';
    if (rawQuery && raw.includes(rawQuery)) return true;
    if (normalizedQuery && norm.includes(normalizedQuery)) return true;
    if (tokenizedQuery.length && tokenizedQuery.every((t) => norm.includes(t))) return true;
    if (normalizedQuery && item._searchLabelNorm && item._searchLabelNorm.startsWith(normalizedQuery)) return true;
    return false;
  };

  const filterItems = (items) => {
    if (!Array.isArray(items)) return [];
    const out = [];
    for (const item of items) {
      const filteredChildren = item.children ? filterItems(item.children) : [];
      if (matches(item) || filteredChildren.length > 0) {
        out.push(filteredChildren.length > 0 ? { ...item, children: filteredChildren } : item);
      }
    }
    return out;
  };

  let filtered = navigationData
    .map((section) => ({ ...section, items: filterItems(section.items) }))
    .filter((section) => section.items.length > 0);

  // Apply category ordering: selected theme first, others after
  if (activeVakCategory && filtered.length > 1) {
    filtered = [...filtered].sort((a, b) =>
      (a.theme === activeVakCategory ? 0 : 1) - (b.theme === activeVakCategory ? 0 : 1)
    );
  }

  renderNavigationWithEmptyState(filtered, navList);
  // Only re-render the fullscreen overview when it is actually visible — saves
  // a full DOM rebuild on every keystroke when the dialog is closed.
  if (navDialog?.classList.contains('visible')) {
    renderTocOverview(filtered);
  } else if (tocMain) {
    // Mark stale so the dialog re-renders fresh next time it opens.
    tocMain.dataset.searchStale = 'true';
  }
}

function renderNavigationWithEmptyState(sections, targetList, onSelect) {
  if (!targetList) return;
  if (sections.length === 0) {
    targetList.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'nav-empty-state';
    const q = currentSearchQuery;
    li.innerHTML = q
      ? `<span class="nav-empty-icon" aria-hidden="true">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
             <circle cx="11" cy="11" r="7.5"></circle>
             <line x1="17" y1="17" x2="21" y2="21"></line>
           </svg>
         </span>
         <span class="nav-empty-title">Geen tabellen gevonden</span>
         <span class="nav-empty-sub">voor &ldquo;${escapeHtml(q)}&rdquo;</span>`
      : '<span class="nav-empty-title">Geen tabellen beschikbaar</span>';
    targetList.appendChild(li);
    return;
  }
  renderNavigation(sections, targetList, onSelect);
}

function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

// --- Favorites (Local Storage + Context Menu) ---

const STAR_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
const FOLDER_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
const MORE_ICON_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>';

// Stable key used to match a navigation item against the favorites list
function getFavoriteKey(item) {
  const label = item.fullLabel || item.label || '';
  return `${label}::${item.title || ''}`;
}

// Check if a navigation item is currently saved as a favorite (anywhere in the tree)
function isItemFavorited(item) {
  const key = getFavoriteKey(item);
  return findFavoriteByKey(key, favorites) !== null;
}

function findFavoriteByKey(key, list) {
  for (const fav of list) {
    if (fav.type === 'folder') {
      if (fav.items) {
        const found = findFavoriteByKey(key, fav.items);
        if (found) return found;
      }
    } else {
      if (`${fav.label || ''}::${fav.title || ''}` === key) return fav;
    }
  }
  return null;
}

// Update visual state of all star buttons in the navigation tree
function refreshNavStars() {
  document.querySelectorAll('.nav-fav-star').forEach((btn) => {
    const key = btn.dataset.favKey;
    if (!key) return;
    const isFav = findFavoriteByKey(key, favorites) !== null;
    btn.classList.toggle('is-active', isFav);
    btn.setAttribute('aria-pressed', String(isFav));
    const label = isFav ? 'Verwijder uit favorieten' : 'Voeg toe aan favorieten';
    btn.setAttribute('aria-label', label);
    btn.title = label;
  });
}

// Recursively collect all folders, with their depth, so the picker can render them properly
function getAllFolders(list = favorites, depth = 0, out = []) {
  for (const item of list) {
    if (item.type === 'folder') {
      out.push({ id: item.id, name: item.name, color: item.color, depth, count: countFolderItems(item) });
      if (item.items) getAllFolders(item.items, depth + 1, out);
    }
  }
  return out;
}

function countFolderItems(folder) {
  if (!folder.items) return 0;
  let total = 0;
  for (const it of folder.items) {
    total += 1;
    if (it.type === 'folder') total += countFolderItems(it);
  }
  return total;
}

// Public entry point: clicking a star toggles favorite status with the right UX
async function handleStarClick(item, starBtn) {
  // Favorites work both offline (localStorage) and online (Firestore). Login
  // is no longer required — when the user signs in, local favorites are
  // merged into their cloud account.
  const key = getFavoriteKey(item);
  const existing = findFavoriteByKey(key, favorites);

  if (existing) {
    // Remove favorite immediately
    removeFavoriteById(existing.id);
    showToast('Verwijderd uit favorieten', 'info');
    return;
  }

  const folders = getAllFolders();
  let targetFolderId = null;

  if (folders.length > 0) {
    // Ask user where to put it
    const choice = await showFolderPickerDialog({
      mode: 'add',
      itemContext: item,
      currentFolderId: null,
      allowCancel: true
    });
    if (choice === undefined) return; // user cancelled
    targetFolderId = choice; // null means root, string means folder id
  }

  addFavoriteToFolder(item, targetFolderId);
  const folderName = targetFolderId ? findItemAndParent(targetFolderId, favorites)?.item?.name : null;
  showToast(folderName ? `Toegevoegd aan "${folderName}"` : 'Toegevoegd aan favorieten', 'success');
}

function addFavoriteToFolder(item, folderId) {
  const targetLabel = item.fullLabel || item.label;
  const newFav = {
    id: generateUUID(),
    type: 'item',
    title: item.title,
    label: targetLabel,
    page: item.page,
    theme: item.theme,
    ...(item.alignKey ? { alignKey: item.alignKey } : {}),
  };

  if (folderId) {
    const folderRes = findItemAndParent(folderId, favorites);
    if (folderRes && folderRes.item.type === 'folder') {
      folderRes.item.items = folderRes.item.items || [];
      folderRes.item.items.push(newFav);
      folderRes.item.collapsed = false;
    } else {
      favorites.push(newFav);
    }
  } else {
    favorites.push(newFav);
  }

  saveFavorites();
  renderFavoritesList();
  refreshNavStars();
}

function removeFavoriteById(id) {
  const res = findItemAndParent(id, favorites);
  if (!res) return;
  res.parentList.splice(res.index, 1);
  saveFavorites();
  renderFavoritesList();
  refreshNavStars();
}

// Move an item (favorite or folder) to a target folder (null = root)
function moveItemToFolder(itemId, targetFolderId) {
  const sourceRes = findItemAndParent(itemId, favorites);
  if (!sourceRes) return;

  // Prevent moving a folder into itself or its descendants
  if (sourceRes.item.type === 'folder' && targetFolderId) {
    if (targetFolderId === itemId) return;
    if (isAncestor(itemId, targetFolderId, favorites)) return;
  }

  const itemToMove = sourceRes.item;
  sourceRes.parentList.splice(sourceRes.index, 1);

  if (targetFolderId) {
    const folderRes = findItemAndParent(targetFolderId, favorites);
    if (folderRes && folderRes.item.type === 'folder') {
      folderRes.item.items = folderRes.item.items || [];
      folderRes.item.items.push(itemToMove);
      folderRes.item.collapsed = false;
    } else {
      favorites.push(itemToMove);
    }
  } else {
    favorites.push(itemToMove);
  }

  saveFavorites();
  renderFavoritesList();
}

function handleContextMenu(e, item) {
  e.preventDefault();
  closeFavMenu();

  // Build menu options dynamically
  contextMenu.innerHTML = '';
  const key = getFavoriteKey(item);
  const existing = findFavoriteByKey(key, favorites);
  const folders = getAllFolders();

  if (existing) {
    appendCtxItem(contextMenu, 'Verplaats naar map…', async () => {
      contextMenu.hidden = true;
      const parent = findItemAndParent(existing.id, favorites);
      const currentFolder = parent?.parentItem?.id || null;
      const choice = await showFolderPickerDialog({
        mode: 'move',
        itemContext: existing,
        currentFolderId: currentFolder
      });
      if (choice === undefined) return;
      moveItemToFolder(existing.id, choice);
    });
    appendCtxItem(contextMenu, 'Notitie bewerken', () => {
      contextMenu.hidden = true;
      editNote(existing.id);
    });
    appendCtxItem(contextMenu, 'Verwijder uit favorieten', () => {
      contextMenu.hidden = true;
      removeFavoriteById(existing.id);
      showToast('Verwijderd uit favorieten', 'info');
    }, true);
  } else {
    appendCtxItem(contextMenu, 'Voeg toe aan favorieten', () => {
      contextMenu.hidden = true;
      handleStarClick(item, null);
    });
    if (folders.length > 0) {
      appendCtxItem(contextMenu, 'Toevoegen in map…', async () => {
        contextMenu.hidden = true;
        const choice = await showFolderPickerDialog({
          mode: 'add',
          itemContext: item,
          currentFolderId: null
        });
        if (choice === undefined) return;
        addFavoriteToFolder(item, choice);
        const folderName = choice ? findItemAndParent(choice, favorites)?.item?.name : null;
        showToast(folderName ? `Toegevoegd aan "${folderName}"` : 'Toegevoegd aan favorieten', 'success');
      });
    }
  }

  // Position menu (clamped to viewport). Menu is position:fixed.
  contextMenu.hidden = false;
  const rect = contextMenu.getBoundingClientRect();
  let left = e.clientX;
  let top = e.clientY;
  if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
  if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  contextMenu.style.left = `${left}px`;
  contextMenu.style.top = `${top}px`;
}

function appendCtxItem(parent, label, onClick, danger = false) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'context-menu-item' + (danger ? ' is-danger' : '');
  btn.textContent = label;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  parent.appendChild(btn);
}

function initContextMenu() {
  window.addEventListener('click', () => {
    contextMenu.hidden = true;
  });
  window.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.nav-link')) {
      contextMenu.hidden = true;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') contextMenu.hidden = true;
  });
}

// Helper: Generate UUID
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Helper: Migrate favorites to new structure
function migrateFavorites(favs) {
  if (!Array.isArray(favs)) return [];
  return favs.map(item => {
    if (item && item.type === 'folder' && !item.icon) {
      item.icon = '★';
    }
    // If it already has a type, assume it's migrated
    if (item.type) return item;

    // Otherwise convert to item
    return {
      id: generateUUID(),
      type: 'item',
      ...item
    };
  });
}

function isSignedInRealUser() {
  return !!(currentUser && !currentUser.isAnonymous);
}

async function saveFavorites() {
  // Real signed-in users -> Firestore. Anonymous and logged-out users ->
  // localStorage. This keeps offline favs safe and prevents orphaning data
  // on throwaway anonymous UIDs.
  if (isSignedInRealUser()) {
    try {
        await setDoc(doc(firestore, 'users', currentUser.uid), {
            favorites: favorites
        }, { merge: true });
    } catch(e) { console.error('Error syncing favorites', e); }
  } else {
    try {
      localStorage.setItem(favoritesKey, JSON.stringify(favorites));
    } catch (e) { /* storage full or unavailable */ }
  }
}

function loadFavorites() {
  // Initial load (auth state hasn't resolved yet): fall back to localStorage.
  // The auth handler will refine this once it knows if the user is signed in.
  if (!isSignedInRealUser()) {
    favorites = readLocalFavoritesRaw();
  }
}

// Load favorites from cloud for logged-in user
async function loadCloudFavorites(user) {
  try {
    const docSnap = await getDoc(doc(firestore, 'users', user.uid));
    if (docSnap.exists()) {
      const data = docSnap.data();
      favorites = migrateFavorites(data.favorites || []);
    } else {
      // User doc doesn't exist yet, create empty
      favorites = [];
      await setDoc(doc(firestore, 'users', user.uid), { favorites: [] }, { merge: true });
    }
  } catch (e) {
    console.error('Error loading cloud favorites:', e);
    favorites = [];
  }
  renderFavoritesList();
  refreshNavStars();
}

// Read raw cloud favorites without touching the in-memory `favorites` state.
// Used by the merge-on-login flow so we can combine before assigning.
async function fetchCloudFavorites(user) {
  try {
    const docSnap = await getDoc(doc(firestore, 'users', user.uid));
    if (docSnap.exists()) {
      const data = docSnap.data();
      return migrateFavorites(data.favorites || []);
    }
  } catch (e) {
    console.error('Error reading cloud favorites:', e);
  }
  return [];
}

// Read the locally-stored favorites (used while logged out). Returns [] on
// any error / missing data so the caller can safely treat it as a normal list.
function readLocalFavoritesRaw() {
  try {
    const stored = localStorage.getItem(favoritesKey);
    if (!stored) return [];
    return migrateFavorites(JSON.parse(stored) || []);
  } catch (e) {
    return [];
  }
}

// Merge a list of locally-stored favorites into the cloud list, in place.
//
// Rules:
//  - Items are deduplicated by their stable favorite key (`label::title`),
//    so a table that is already favourited online won't be added twice.
//  - Folders are matched by name (trimmed). When a local folder has the same
//    name as a cloud folder, their items are merged into the existing cloud
//    folder instead of creating a duplicate folder. New folders are added.
//  - Order: existing cloud entries keep their position; new local entries
//    are appended at the end of the relevant list.
//
// Returns { merged, addedItemCount } where addedItemCount counts new leaf
// favorites that were brought in from local storage.
function mergeFavoritesLists(cloudList, localList) {
  if (!Array.isArray(cloudList)) cloudList = [];
  if (!Array.isArray(localList) || localList.length === 0) {
    return { merged: cloudList, addedItemCount: 0 };
  }

  const cloudItemKeys = new Set();
  const collectKeys = (list) => {
    for (const it of list) {
      if (!it) continue;
      if (it.type === 'folder') {
        if (Array.isArray(it.items)) collectKeys(it.items);
      } else {
        cloudItemKeys.add(`${it.label || ''}::${it.title || ''}`);
      }
    }
  };
  collectKeys(cloudList);

  let addedItemCount = 0;

  const visit = (localItems, cloudParentList) => {
    for (const local of localItems) {
      if (!local) continue;
      if (local.type === 'folder') {
        const localName = (local.name || '').trim();
        let cloudFolder = cloudParentList.find(
          (it) => it && it.type === 'folder' && (it.name || '').trim() === localName
        );
        if (!cloudFolder) {
          cloudFolder = {
            id: local.id || generateUUID(),
            type: 'folder',
            name: local.name,
            color: local.color,
            collapsed: !!local.collapsed,
            items: []
          };
          cloudParentList.push(cloudFolder);
        }
        if (!Array.isArray(cloudFolder.items)) cloudFolder.items = [];
        if (Array.isArray(local.items)) visit(local.items, cloudFolder.items);
      } else {
        const key = `${local.label || ''}::${local.title || ''}`;
        if (cloudItemKeys.has(key)) continue;
        cloudItemKeys.add(key);
        cloudParentList.push({ ...local, id: local.id || generateUUID() });
        addedItemCount += 1;
      }
    }
  };

  visit(localList, cloudList);
  return { merged: cloudList, addedItemCount };
}

// Called when a real user signs in. Combines any locally-stored favorites
// with the user's cloud favorites and persists the result. Local storage is
// cleared on success so we don't keep a stale offline copy lying around.
async function syncFavoritesOnLogin(user) {
  const localFavs = readLocalFavoritesRaw();
  const cloudFavs = await fetchCloudFavorites(user);

  if (localFavs.length === 0) {
    favorites = cloudFavs;
    // Make sure the user doc exists for fresh accounts.
    try {
      await setDoc(doc(firestore, 'users', user.uid), { favorites: cloudFavs }, { merge: true });
    } catch (e) { /* non-fatal */ }
    renderFavoritesList();
    refreshNavStars();
    return;
  }

  const { merged, addedItemCount } = mergeFavoritesLists(cloudFavs, localFavs);
  favorites = merged;

  try {
    await setDoc(doc(firestore, 'users', user.uid), { favorites: merged }, { merge: true });
    // Only clear local AFTER the cloud write succeeds — otherwise we'd lose
    // the offline favorites if the network call fails.
    localStorage.removeItem(favoritesKey);
    if (addedItemCount > 0) {
      const word = addedItemCount === 1 ? 'favoriet' : 'favorieten';
      showToast(`${addedItemCount} lokale ${word} samengevoegd met je account`, 'success');
    }
  } catch (e) {
    console.error('Error syncing local favorites to cloud:', e);
    // Cloud write failed — keep local copy intact and show what we have.
    showToast('Kon favorieten niet synchroniseren. Probeer later opnieuw.', 'error');
  }

  renderFavoritesList();
  refreshNavStars();
}

// Clear favorites display when logged out and fall back to whatever the user
// has stored locally. Right after a successful login-merge this will be an
// empty array (we cleared localStorage on success), which is exactly what
// we want — the cloud favs disappear and nothing is left to show. If the
// user later adds new favs while signed out, they live in localStorage and
// show up here.
function clearFavoritesDisplay() {
  favorites = readLocalFavoritesRaw();
  renderFavoritesList();
  refreshNavStars();
}

function renderFavoritesNode(item, container, parentList, index) {
  const li = document.createElement('li');
  li.className = 'nav-item fav-node';
  li.dataset.id = item.id;
  li.draggable = true;

  // Drag Events
  li.addEventListener('dragstart', (e) => handleDragStart(e, item.id));
  li.addEventListener('dragover', handleDragOver);
  li.addEventListener('drop', (e) => handleDrop(e, item.id));
  li.addEventListener('dragend', handleDragEnd);
  li.addEventListener('dragenter', handleDragEnter);
  li.addEventListener('dragleave', handleDragLeave);

  if (item.type === 'folder') {
    li.classList.add('fav-folder');
    const folderContainer = document.createElement('div');
    folderContainer.className = `folder-container ${item.collapsed ? 'collapsed' : ''}`;
    if (item.color) folderContainer.style.setProperty('--folder-color', item.color);

    const header = document.createElement('div');
    header.className = 'folder-header';
    header.addEventListener('click', (e) => {
      if (e.target.closest('.action-btn')) return;
      toggleFolder(item.id);
    });

    const arrow = document.createElement('div');
    arrow.className = 'folder-arrow';
    arrow.textContent = '›';
    header.appendChild(arrow);

    const colorInd = document.createElement('button');
    colorInd.type = 'button';
    colorInd.className = 'folder-color-indicator';
    colorInd.title = 'Kleur wijzigen';
    colorInd.setAttribute('aria-label', 'Kleur wijzigen');
    if (item.color) colorInd.style.backgroundColor = item.color;
    colorInd.addEventListener('click', (e) => {
      e.stopPropagation();
      setFolderColor(item.id);
    });
    header.appendChild(colorInd);

    const nameWrap = document.createElement('div');
    nameWrap.className = 'folder-name-wrap';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'folder-name';
    nameSpan.textContent = item.name;
    nameWrap.appendChild(nameSpan);
    const count = countFolderItems(item);
    const countBadge = document.createElement('span');
    countBadge.className = 'folder-count';
    countBadge.textContent = count === 0 ? 'Leeg' : `${count}`;
    nameWrap.appendChild(countBadge);
    header.appendChild(nameWrap);

    // Overflow menu
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'action-btn fav-more-btn';
    moreBtn.innerHTML = MORE_ICON_SVG;
    moreBtn.title = 'Opties';
    moreBtn.setAttribute('aria-label', 'Opties');
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showFolderActionsMenu(moreBtn, item.id);
    });
    header.appendChild(moreBtn);

    folderContainer.appendChild(header);

    // Children container
    const itemsUl = document.createElement('ul');
    itemsUl.className = 'folder-items';
    itemsUl.dataset.folderId = item.id;

    // Drop INTO this folder when hovering over its items area or the empty
    // placeholder. We use the same .drag-into class as the folder LI so the
    // visual feedback is one consistent treatment.
    itemsUl.addEventListener('dragover', (e) => {
      if (!currentDraggedItemId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (e.target === itemsUl || e.target.classList.contains('folder-empty-placeholder')) {
        e.stopPropagation();
        clearDropIndicators();
        li.classList.add('drag-into');
      }
    });
    itemsUl.addEventListener('dragleave', (e) => {
      if (!itemsUl.contains(e.relatedTarget)) {
        li.classList.remove('drag-into');
      }
    });
    itemsUl.addEventListener('drop', (e) => {
      li.classList.remove('drag-into');
      if (e.target === itemsUl || e.target.classList.contains('folder-empty-placeholder')) {
        e.preventDefault();
        e.stopPropagation();
        handleDropOnFolderList(e, item.id);
      }
    });

    if (item.items && item.items.length > 0) {
      item.items.forEach((child, idx) => {
        renderFavoritesNode(child, itemsUl, item.items, idx);
      });
    } else {
      const empty = document.createElement('li');
      empty.className = 'folder-empty-placeholder';
      empty.textContent = 'Map is leeg';
      itemsUl.appendChild(empty);
    }

    folderContainer.appendChild(itemsUl);
    li.appendChild(folderContainer);

  } else {
    li.dataset.theme = item.theme;

    const row = document.createElement('div');
    row.className = 'nav-item-content';

    // Subtle drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '⋮⋮';
    dragHandle.title = 'Sleep om te verplaatsen';
    row.appendChild(dragHandle);

    const button = document.createElement('button');
    button.className = 'nav-link';
    button.type = 'button';
    button.style.flex = '1';

    let labelHtml = '';
    if (item.label) {
      const match = item.label.match(/^(\d+)([A-Za-z].*)$/);
      if (match) {
        labelHtml = `<span class="label-part-num">${match[1]}</span> <span class="label-part-suffix">${match[2]}</span>`;
      } else {
        labelHtml = `<span class="label-part-num">${item.label}</span>`;
      }
    } else {
      labelHtml = '<span class="nav-label">…</span>';
    }

    let noteHtml = '';
    if (item.note) {
      noteHtml = `<span class="note-indicator" title="${escapeHtml(item.note)}" aria-label="Notitie">📝</span>`;
    }

    button.innerHTML = `
       <span class="nav-label" style="justify-content: flex-end; gap: 2px;">${labelHtml}</span>
       <div class="nav-text"><span class="nav-title">${item.title}</span>${noteHtml}</div>
    `;
    button.addEventListener('click', () => {
      const alignData = alignMap[item.alignKey];
      openPage(item.page, alignData?.yPdfTop);
    });
    row.appendChild(button);

    // Single overflow menu
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'action-btn fav-more-btn';
    moreBtn.innerHTML = MORE_ICON_SVG;
    moreBtn.title = 'Opties';
    moreBtn.setAttribute('aria-label', 'Opties');
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showItemActionsMenu(moreBtn, item.id);
    });
    row.appendChild(moreBtn);

    li.appendChild(row);
  }

  container.appendChild(li);
}

// Flag to track if root drop zone listeners are attached
let rootDropZoneInitialized = false;
let rootDropZoneEl = null;
let sidebarDropFallbackInstalled = false;

// Sidebar-level safety net: while ANY favourite is being dragged
// (currentDraggedItemId is set), accept dragover and treat unhandled drops
// as "drop at root". Specific item / folder-items / drop-zone handlers call
// stopPropagation() when they take care of a drop, so this only fires for
// drops that fell through every more specific handler. Without this the
// drop event is silently lost when the user releases over an empty area
// or any element without its own dragover/drop listeners — that's the
// classic "I dragged it out and nothing happened" scenario.
function installSidebarDropFallback() {
  if (sidebarDropFallbackInstalled) return;
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  sidebarDropFallbackInstalled = true;

  sidebar.addEventListener('dragover', (e) => {
    if (!currentDraggedItemId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });

  sidebar.addEventListener('drop', (e) => {
    if (!currentDraggedItemId) return;
    e.preventDefault();
    handleDropOnFolderList(e, null);
  });
}

// Lazily create the "Laat hier los om uit de map te halen" drop zone and
// place it as a SIBLING of the favorites list (inside #favorites-view), so
// it never interferes with the flex layout of the list itself. The element
// stays in the DOM forever; CSS toggles its visibility via
// body.is-dragging-from-folder so we don't pay per-render cost.
function ensureRootDropZone() {
  const favoritesView = document.getElementById('favorites-view');
  if (!favoritesView || !favoritesList) return null;
  if (rootDropZoneEl && rootDropZoneEl.isConnected) return rootDropZoneEl;

  rootDropZoneEl = document.createElement('div');
  rootDropZoneEl.className = 'root-drop-zone';
  rootDropZoneEl.setAttribute('role', 'button');
  rootDropZoneEl.setAttribute('aria-label', 'Laat een favoriet hier los om hem uit zijn huidige map te halen');
  rootDropZoneEl.innerHTML = '<span class="root-drop-zone-text">Laat hier los om uit de map te halen</span>';

  rootDropZoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    rootDropZoneEl.classList.add('drag-over');
  });
  rootDropZoneEl.addEventListener('dragenter', (e) => {
    e.preventDefault();
    rootDropZoneEl.classList.add('drag-over');
  });
  rootDropZoneEl.addEventListener('dragleave', (e) => {
    if (!rootDropZoneEl.contains(e.relatedTarget)) {
      rootDropZoneEl.classList.remove('drag-over');
    }
  });
  rootDropZoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    rootDropZoneEl.classList.remove('drag-over');
    handleDropOnFolderList(e, null);
  });

  favoritesView.insertBefore(rootDropZoneEl, favoritesList);
  return rootDropZoneEl;
}

let openFolderId = null;

function renderFavoritesList() {
  if (!favoritesList) return;
  favoritesList.innerHTML = '';
  closeFavMenu();
  favoritesView?.classList.remove('is-in-folder');

  // Detail view of an opened folder
  if (openFolderId) {
    const res = findItemAndParent(openFolderId, favorites);
    if (!res || res.item.type !== 'folder') {
      openFolderId = null;
    } else {
      favoritesView?.classList.add('is-in-folder');
      renderFolderDetailView(res.item);
      return;
    }
  }

  const folders = favorites.filter(it => it.type === 'folder');
  const loose = favorites.filter(it => it.type !== 'folder');

  if (folders.length === 0 && loose.length === 0) {
    const isLoggedOut = !currentUser || currentUser.isAnonymous;
    const syncHint = isLoggedOut
      ? `<p class="fav-empty-hint">Tip: log in om je favorieten te synchroniseren tussen apparaten.</p>`
      : '';
    const empty = document.createElement('div');
    empty.className = 'fav-empty-state';
    empty.innerHTML = `
      <div class="fav-empty-icon">${STAR_ICON_SVG}</div>
      <h4 class="fav-empty-title">Nog geen favorieten</h4>
      <p class="fav-empty-text">Klik op het sterretje bij een tabel om deze op te slaan. Maak desgewenst eerst een map aan om je favorieten te organiseren.</p>
      <div class="fav-empty-actions">
        <button type="button" class="primary-button fav-empty-btn-folder">Nieuwe map</button>
        <button type="button" class="secondary-button fav-empty-btn-toc">Naar inhoud</button>
      </div>
      ${syncHint}
    `;
    favoritesList.appendChild(empty);
    empty.querySelector('.fav-empty-btn-folder')?.addEventListener('click', createNewFolder);
    empty.querySelector('.fav-empty-btn-toc')?.addEventListener('click', () => btnMenuToc?.click());
    return;
  }

  // MAPPEN section
  const mappenLabel = document.createElement('div');
  mappenLabel.className = 'fav-section-label';
  mappenLabel.textContent = 'MAPPEN';
  favoritesList.appendChild(mappenLabel);

  const grid = document.createElement('div');
  grid.className = 'fav-folder-grid';
  folders.forEach(folder => {
    grid.appendChild(buildFolderCard(folder));
  });

  // "Nieuwe map" tile (always present in the grid)
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'fav-folder-card fav-folder-card--new';
  newBtn.innerHTML = `<span class="fav-folder-card-plus">+</span><span class="fav-folder-card-newlabel">Nieuwe map</span>`;
  newBtn.addEventListener('click', createNewFolder);
  grid.appendChild(newBtn);
  favoritesList.appendChild(grid);

  // LOSSE FAVORIETEN section
  if (loose.length > 0) {
    const looseLabel = document.createElement('div');
    looseLabel.className = 'fav-section-label';
    looseLabel.textContent = 'LOSSE FAVORIETEN';
    favoritesList.appendChild(looseLabel);

    const looseList = document.createElement('div');
    looseList.className = 'fav-loose-list';
    loose.forEach(item => {
      looseList.appendChild(buildLooseFavoriteRow(item));
    });
    favoritesList.appendChild(looseList);
  }
}

function buildFolderCard(folder) {
  const card = document.createElement('div');
  card.className = 'fav-folder-card';
  card.style.setProperty('--folder-color', folder.color || '#1F5FAE');
  const items = folder.items || [];
  const count = countFolderItems(folder);
  const previewLabels = items
    .filter(it => it.type !== 'folder')
    .slice(0, 4)
    .map(it => `<span class="fav-folder-card-chip">${escapeHtml(it.label || '·')}</span>`)
    .join('');
  const overflow = count > 4 ? `<span class="fav-folder-card-overflow">+${count - 4}</span>` : '';
  const icon = folder.icon || '★';
  card.innerHTML = `
    <button type="button" class="fav-folder-card-open" aria-label="Open map ${escapeHtml(folder.name || '')}">
      <span class="fav-folder-card-top">
        <span class="fav-folder-card-icon">${escapeHtml(icon)}</span>
        <span class="fav-folder-card-count">${count}</span>
      </span>
      <span class="fav-folder-card-chips">${previewLabels}${overflow}</span>
      <span class="fav-folder-card-name">${escapeHtml(folder.name || 'Naamloos')}</span>
    </button>
    <button type="button" class="fav-folder-card-more" aria-label="Map-opties">${MORE_ICON_SVG}</button>
  `;
  card.querySelector('.fav-folder-card-open').addEventListener('click', () => {
    openFolderId = folder.id;
    renderFavoritesList();
  });
  const moreBtn = card.querySelector('.fav-folder-card-more');
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showFolderActionsMenu(moreBtn, folder.id);
  });
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showFolderActionsMenu(card, folder.id);
  });
  return card;
}

function buildLooseFavoriteRow(item) {
  const row = document.createElement('div');
  row.className = 'fav-loose-row';
  row.dataset.theme = item.theme || '';
  const labelHtml = (() => {
    if (!item.label) return '<span class="fav-loose-num">…</span>';
    const m = item.label.match(/^(\d+)([A-Za-z].*)$/);
    if (m) {
      return `<span class="fav-loose-num"><span class="label-part-num">${escapeHtml(m[1])}</span><span class="label-part-suffix">${escapeHtml(m[2])}</span></span>`;
    }
    return `<span class="fav-loose-num">${escapeHtml(item.label)}</span>`;
  })();
  row.innerHTML = `
    <button type="button" class="fav-loose-open">
      ${labelHtml}
      <span class="fav-loose-title">${escapeHtml(item.title || '')}</span>
    </button>
    <button type="button" class="fav-loose-move action-btn" title="Verplaats naar map" aria-label="Verplaats naar map">${FOLDER_ICON_SVG}</button>
    <button type="button" class="fav-loose-more action-btn" title="Opties" aria-label="Opties">${MORE_ICON_SVG}</button>
  `;
  row.querySelector('.fav-loose-open').addEventListener('click', () => {
    const alignData = alignMap[item.alignKey];
    openPage(item.page, alignData?.yPdfTop);
  });
  row.querySelector('.fav-loose-move').addEventListener('click', async (e) => {
    e.stopPropagation();
    const choice = await showFolderPickerDialog({
      mode: 'move',
      itemContext: item,
      currentFolderId: null
    });
    if (choice === undefined) return;
    moveItemToFolder(item.id, choice);
  });
  row.querySelector('.fav-loose-more').addEventListener('click', (e) => {
    e.stopPropagation();
    showItemActionsMenu(e.currentTarget, item.id);
  });
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showItemActionsMenu(row, item.id);
  });
  return row;
}

function renderFolderDetailView(folder) {
  const wrap = document.createElement('div');
  wrap.className = 'fav-folder-detail';
  const accent = folder.color || '#1F5FAE';
  wrap.style.setProperty('--folder-color', accent);
  const itemsCount = countFolderItems(folder);
  const items = folder.items || [];

  wrap.innerHTML = `
    <div class="fav-folder-detail-header">
      <button type="button" class="fav-folder-back">‹ Terug</button>
      <button type="button" class="fav-folder-more" aria-label="Map opties">${MORE_ICON_SVG}</button>
      <div class="fav-folder-detail-meta">
        <span class="fav-folder-detail-icon">${escapeHtml(folder.icon || '★')}</span>
        <div>
          <div class="fav-folder-detail-name">${escapeHtml(folder.name || 'Naamloos')}</div>
          <div class="fav-folder-detail-count">${itemsCount} tabel${itemsCount === 1 ? '' : 'len'}</div>
        </div>
      </div>
    </div>
    <div class="fav-folder-detail-list"></div>
  `;

  const list = wrap.querySelector('.fav-folder-detail-list');
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'fav-folder-detail-empty';
    empty.innerHTML = `<span class="fav-folder-detail-empty-icon">${STAR_ICON_SVG}</span><p>Deze map is nog leeg. Klik op een ster in de inhoudsopgave en kies deze map om hem te vullen.</p>`;
    list.appendChild(empty);
  } else {
    items.forEach(it => {
      if (it.type === 'folder') return; // nested folders not shown in detail view; flatten later if needed
      list.appendChild(buildFolderItemRow(it));
    });
  }

  wrap.querySelector('.fav-folder-back').addEventListener('click', () => {
    openFolderId = null;
    renderFavoritesList();
  });
  wrap.querySelector('.fav-folder-more').addEventListener('click', (e) => {
    e.stopPropagation();
    showFolderActionsMenu(e.currentTarget, folder.id);
  });

  favoritesList.appendChild(wrap);
}

function buildFolderItemRow(item) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'fav-folder-item';
  row.dataset.theme = item.theme || '';
  const labelHtml = (() => {
    if (!item.label) return '…';
    const m = item.label.match(/^(\d+)([A-Za-z].*)$/);
    if (m) return `<span class="label-part-num">${escapeHtml(m[1])}</span><span class="label-part-suffix">${escapeHtml(m[2])}</span>`;
    return escapeHtml(item.label);
  })();
  row.innerHTML = `
    <span class="fav-folder-item-badge">${labelHtml}</span>
    <span class="fav-folder-item-text">
      <span class="fav-folder-item-section">${escapeHtml((item.theme || '').toUpperCase())}</span>
      <span class="fav-folder-item-title">${escapeHtml(item.title || '')}</span>
    </span>
    <button type="button" class="fav-folder-item-more action-btn" aria-label="Opties">${MORE_ICON_SVG}</button>
  `;
  row.addEventListener('click', (e) => {
    if (e.target.closest('.fav-folder-item-more')) return;
    const alignData = alignMap[item.alignKey];
    openPage(item.page, alignData?.yPdfTop);
  });
  const moreBtn = row.querySelector('.fav-folder-item-more');
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showItemActionsMenu(moreBtn, item.id);
  });
  return row;
}

// --- Overlays ---

function toggleOverlay(overlay, show) {
  if (show) {
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
  } else {
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

function initOverlays() {
  // Settings
  btnMenuSettings?.addEventListener('click', () => toggleOverlay(settingsOverlay, true));
  settingsClose?.addEventListener('click', () => toggleOverlay(settingsOverlay, false));

  // Account
  btnMenuAccount?.addEventListener('click', () => toggleOverlay(accountOverlay, true));
  accountClose?.addEventListener('click', () => toggleOverlay(accountOverlay, false));

  // Close overlays when clicking on background
  [settingsOverlay, accountOverlay].forEach(overlay => {
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        // Only close if clicking directly on the overlay background, not its children
        if (e.target === overlay) {
          toggleOverlay(overlay, false);
        }
      });
    }
  });
}

// --- Auth Logic ---

function initAuth() {
  initFirebase();

  btnLoginGoogle?.addEventListener('click', async () => {
     const provider = new GoogleAuthProvider();
     try {
         await signInWithPopup(auth, provider);
         toggleOverlay(accountOverlay, false);
     } catch(e) {
         console.error(e);
         overlayLoginMsg.textContent = e.message;
         overlayLoginMsg.dataset.variant = 'error';
     }
  });

  overlayLoginBtn?.addEventListener('click', async () => {
    const email = overlayLoginInput.value.trim();
    if (!email) return;
    overlayLoginMsg.textContent = 'Link versturen...';
    try {
        await sendSignInLinkToEmail(auth, email, {
            url: window.location.href,
            handleCodeInApp: true
        });
        window.localStorage.setItem('binas:login-email', email);
        overlayLoginMsg.textContent = 'Check je e-mail!';
        overlayLoginMsg.dataset.variant = 'success';
    } catch (e) {
        overlayLoginMsg.textContent = e.message;
        overlayLoginMsg.dataset.variant = 'error';
    }
  });

  overlayLogout?.addEventListener('click', () => {
     signOut(auth);
  });

  onAuthStateChanged(auth, async (user) => {
    if (isProcessingAuth) return;
    isProcessingAuth = true;
    
    const previousUser = currentUser;
    currentUser = user;
    const accountCircle = document.querySelector('.account-circle');

    if (user && !user.isAnonymous) {
        const displayName = user.displayName?.trim();
        if (overlayAuthName) {
          if (displayName) {
            overlayAuthName.textContent = displayName;
            overlayAuthName.hidden = false;
          } else {
            overlayAuthName.textContent = '';
            overlayAuthName.hidden = true;
          }
        }
        overlayAuthEmail.textContent = user.email || 'Anoniem';
        overlayLogout.hidden = false;
        
        // Hide login options when logged in
        if (overlayLoginSection) overlayLoginSection.hidden = true;
// Show Google profile photo if available, otherwise first letter of email
        if (accountCircle) {
            if (user.photoURL) {
                // User has a profile photo (e.g., Google login)
                accountCircle.innerHTML = `<img src="${user.photoURL}" alt="Profielfoto" class="account-photo" referrerpolicy="no-referrer" />`;
            } else {
                // Fallback to first letter of email
                const letter = (user.email || 'A').charAt(0).toUpperCase();
                accountCircle.innerHTML = `<span style="font-weight:700; font-size:14px; color:var(--text-main);">${letter}</span>`;
            }
            accountCircle.style.display = 'flex';
            accountCircle.style.alignItems = 'center';
            accountCircle.style.justifyContent = 'center';
        }

        // Merge any locally-stored favorites into the cloud account, then
        // load the combined set. Local-only items kept by name-matched
        // folders, deduplicated by table identity, no duplicates.
        await syncFavoritesOnLogin(user);

        // Show admin link if admin email
        updateAdminButtonVisibility(user.email);
    } else {
        if (overlayAuthName) {
          overlayAuthName.textContent = '';
          overlayAuthName.hidden = true;
        }
        overlayAuthEmail.textContent = 'Niet ingelogd';
        overlayLogout.hidden = true;
        
        // Show login options when not logged in
        if (overlayLoginSection) overlayLoginSection.hidden = false;

        // Show generic vector icon
        if (accountCircle) {
            accountCircle.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px; height:16px;">
               <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
               <circle cx="12" cy="7" r="4"></circle>
            </svg>`;
            accountCircle.style.display = 'flex';
            accountCircle.style.alignItems = 'center';
            accountCircle.style.justifyContent = 'center';
        }

        // Logged out / anonymous: drop any cloud favs from view and fall
        // back to whatever is in localStorage (empty after a recent merge).
        clearFavoritesDisplay();

        // Hide admin link
        updateAdminButtonVisibility(null);
}
    
    isProcessingAuth = false;
  });

  // Finish Magic Link Sign In
  if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem('binas:login-email');
      if (!email) {
        // Show email confirmation dialog
        showEmailConfirmDialog().then(confirmedEmail => {
          if (confirmedEmail) {
            completeEmailSignIn(confirmedEmail);
          }
        });
      } else {
        completeEmailSignIn(email);
      }
  }

  function completeEmailSignIn(email) {
    signInWithEmailLink(auth, email, window.location.href)
      .then(() => {
          window.history.replaceState({}, '', window.location.pathname);
          showToast('Succesvol ingelogd!', 'success');
      })
      .catch(e => showToast(e.message, 'error'));
  }

  function showEmailConfirmDialog() {
    return new Promise((resolve) => {
      const dialogOverlay = document.createElement('div');
      dialogOverlay.className = 'binas-confirm-overlay';
      dialogOverlay.innerHTML = `
        <div class="binas-confirm-dialog">
          <h3 class="binas-confirm-title">E-mailadres bevestigen</h3>
          <p class="binas-confirm-text">Vul je e-mailadres in om in te loggen:</p>
          <input type="email" class="binas-confirm-input" id="email-confirm-input" placeholder="jij@example.com" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:6px; font-size:14px; margin-bottom:16px;">
          <div class="binas-confirm-buttons">
            <button class="binas-confirm-btn binas-confirm-btn--cancel">Annuleren</button>
            <button class="binas-confirm-btn binas-confirm-btn--confirm">Bevestigen</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(dialogOverlay);
      const input = dialogOverlay.querySelector('#email-confirm-input');
      
      requestAnimationFrame(() => {
        dialogOverlay.classList.add('binas-confirm-overlay--visible');
        input.focus();
      });
      
      const cleanup = () => {
        dialogOverlay.classList.remove('binas-confirm-overlay--visible');
        setTimeout(() => dialogOverlay.remove(), 300);
      };
      
      dialogOverlay.querySelector('.binas-confirm-btn--confirm').addEventListener('click', () => {
        const email = input.value.trim();
        cleanup();
        resolve(email || null);
      });
      
      dialogOverlay.querySelector('.binas-confirm-btn--cancel').addEventListener('click', () => {
        cleanup();
        resolve(null);
      });
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const email = input.value.trim();
          cleanup();
          resolve(email || null);
        }
      });
    });
  }
}

// Update admin button visibility based on email
async function updateAdminButtonVisibility(email) {
  const adminBtn = document.getElementById('btn-admin-link');
  if (adminBtn) {
    if (!email) {
      adminBtn.hidden = true;
      return;
    }
    
    // Check if primary admin
    const primaryAdmin = BINAS_CONFIG?.primaryAdmin || 'vandersanderoy@hotmail.com';
    if (email === primaryAdmin) {
      adminBtn.hidden = false;
      return;
    }
    
    // Check Firestore for other admins
    try {
      const adminDoc = await getDoc(doc(firestore, 'admins', email));
      adminBtn.hidden = !adminDoc.exists();
    } catch (e) {
      console.error('Error checking admin status:', e);
      adminBtn.hidden = true;
    }
  }
}

// --- General Sidebar Logic ---

function toggleSidebar() {
    const collapsed = layout.classList.contains('sidebar-collapsed');
    layout.classList.toggle('sidebar-collapsed', !collapsed);
    localStorage.setItem(sidebarCollapsedKey, String(!collapsed));
}


// --- Main Init ---

document.addEventListener('DOMContentLoaded', () => {
  // Viewers & Navigation
  initFirebase();

  fetch('binas-align.json').then(r => r.json()).then(data => {
    alignMap = data.items || {};
  }).catch(() => {});

  fetch('navigation-data.json').then(r => r.json()).then(data => {
    // Enrich with fullLabel and alignKey
    const enrichItems = (items, parentLabel = '', parentTheme = '', sectionName = '') => {
        items.forEach(item => {
            const effectiveTheme = item.theme || parentTheme;
            const effectiveSection = item.section || sectionName;
            item.theme = effectiveTheme; // Propagate theme

            // Only set label if it's an actual item, not a section container
            if (item.label || item.title) {
                 if (parentLabel && item.isSubtable) {
                    item.fullLabel = parentLabel + item.label;
                    item.alignKey = `${effectiveSection}/${parentLabel}/${item.label}`;
                } else {
                    item.fullLabel = item.label;
                    if (item.label && effectiveSection) {
                        item.alignKey = `${effectiveSection}/${item.label}`;
                    }
                }
            }

            // Recurse
            if (item.children) enrichItems(item.children, item.label || parentLabel, effectiveTheme, effectiveSection);
            if (item.items) enrichItems(item.items, item.label || parentLabel, effectiveTheme, effectiveSection);
        });
    };
    enrichItems(data);
    indexNavigationSearchText(data);

    navigationData = data;
    tabelByNr = null; // bust cache so views pick up fresh data
    renderNavigation(data, navList);
    renderTocOverview(data);
    renderVakSelector();

    // Restore search
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) {
      if (navSearch) navSearch.value = q;
      if (navDialogSearch) navDialogSearch.value = q;
      filterNavigation(q);
    }
  });

  // Search — debounce 150ms is snappy on a fully in-memory dataset while
  // still coalescing fast typing into a single render.
  const debouncedFilter = debounce(filterNavigation, 150);
  const syncSearch = (val) => {
      if (navSearch && navSearch.value !== val) navSearch.value = val;
      if (navDialogSearch && navDialogSearch.value !== val) navDialogSearch.value = val;
      debouncedFilter(val);
  };
  navSearch?.addEventListener('input', e => syncSearch(e.target.value));
  navDialogSearch?.addEventListener('input', e => syncSearch(e.target.value));

  // Clear-on-Escape inside either search input. Without this the user has to
  // manually delete the query to get the full nav back.
  const clearSearch = (focusEl) => {
      if (!currentSearchQuery && (!navSearch || !navSearch.value) && (!navDialogSearch || !navDialogSearch.value)) {
          return false;
      }
      if (navSearch) navSearch.value = '';
      if (navDialogSearch) navDialogSearch.value = '';
      filterNavigation('');
      focusEl?.focus();
      return true;
  };
  navSearch?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
          const target = pickBestNavMatch(navList, navSearch.value);
          if (target) {
              target.click();
              e.preventDefault();
          }
          return;
      }
      if (e.key === 'Escape' && clearSearch(navSearch)) {
          e.stopPropagation();
          e.preventDefault();
      }
  });
  navDialogSearch?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && clearSearch(navDialogSearch)) {
          e.stopPropagation();
          e.preventDefault();
      }
  });

  // Sidebar Toggles
  // Note: sidebar-toggle button removed from header, but floating one exists?
  // User removed sidebar-toggle from header in prompt.
  // Floating toggle logic:
  sidebarToggleFloating?.addEventListener('click', toggleSidebar);
  sidebarOverlay?.addEventListener('click', () => layout.classList.add('sidebar-collapsed'));

  // Icon Sidebar Tabs
  const handleIconClick = (btn, targetView, callback) => {
      if (btn.classList.contains('active')) {
          // Toggle collapse if already active
          const collapsed = layout.classList.contains('sidebar-collapsed');
          layout.classList.toggle('sidebar-collapsed', !collapsed);
          localStorage.setItem(sidebarCollapsedKey, String(!collapsed));
          if (!collapsed) {
            // We just collapsed — deactivate the button so it shows the muted color
            btn.classList.remove('active');
          }
          return;
      }

      // Switch active button
      [btnMenuToc, btnMenuFavorites, btnMenuRecent].forEach(b => b?.classList.remove('active'));
      btn.classList.add('active');

      // Switch view
      navList.hidden = true;
      if (favoritesView) favoritesView.hidden = true;
      if (recentView) recentView.hidden = true;

      targetView.hidden = false;

      // Ensure sidebar is open
      layout.classList.remove('sidebar-collapsed');
      localStorage.setItem(sidebarCollapsedKey, 'false');

      // Toggle Search Bar Visibility
      // Only show search if TOC is active
      const sidebarTop = document.querySelector('.sidebar-top');
      if (sidebarTop) {
          if (targetView === navList) {
              sidebarTop.style.display = 'flex';
          } else {
              sidebarTop.style.display = 'none';
          }
      }

      if (callback) callback();
  };

  btnMenuToc?.addEventListener('click', () => {
    handleIconClick(btnMenuToc, navList);
    setTimeout(() => navSearch?.focus(), 50);
  });
  btnMenuFavorites?.addEventListener('click', () => handleIconClick(btnMenuFavorites, favoritesView, renderFavoritesList));
  btnMenuRecent?.addEventListener('click', () => handleIconClick(btnMenuRecent, recentView, renderRecentView));

  document.getElementById('btn-clear-recent')?.addEventListener('click', () => {
    try { localStorage.removeItem(RECENT_KEY); } catch {}
    renderRecentView();
  });

  // Dialog & Visibility Toggle
  navDialogOpenBtn?.addEventListener('click', () => {
      navDialog.classList.add('visible');
      navDialog.setAttribute('aria-hidden', 'false');
      // Sync the dialog's search field with the sidebar's, then make sure the
      // dialog reflects the current search filter — it may be stale because
      // we skip re-rendering it while it's hidden.
      const currentVal = navSearch?.value || '';
      if (navDialogSearch) navDialogSearch.value = currentVal;
      if (tocMain?.dataset.searchStale === 'true') {
          delete tocMain.dataset.searchStale;
          // Re-run whichever pass produced the sidebar's current state so the
          // overview matches the active subject filter as well as the query.
          if (activeVakCategory) {
            applyNavCategoryFilter();
          } else {
            filterNavigation(currentVal, { force: true });
          }
      }
      navDialogSearch?.focus();
  });
  navDialogCloseBtn?.addEventListener('click', hideNavDialog);
  
  // Close nav dialog when clicking on background
  navDialog?.addEventListener('click', (e) => {
      if (e.target === navDialog) {
          hideNavDialog();
      }
  });

  // Features
  loadFavorites();
  initContextMenu();
  initOverlays();
  initAuth();

  // Hook up Add Folder Button
  document.getElementById('btn-add-folder')?.addEventListener('click', createNewFolder);

  openPage(1); // Default

  // Apply config settings
  applyConfig();

  // Autofocus the TOC search box on page load (only when sidebar is visible)
  if (!layout?.classList.contains('sidebar-collapsed')) {
    setTimeout(() => navSearch?.focus(), 100);
  }
});

// --- Config Application ---
function applyConfig() {
  if (!BINAS_CONFIG) return;
  
  // Update version and copyright in settings overlay
  const versionElement = document.getElementById('settings-version-info');
  if (versionElement) {
    versionElement.innerHTML = `
      ${BINAS_CONFIG.version}<br>
      <small>${BINAS_CONFIG.copyright}</small>
    `;
  }

  // Handle credit visibility
  const footerNote = document.querySelector('.footer-note');
  if (footerNote) {
    footerNote.style.display = BINAS_CONFIG.showCredit ? 'block' : 'none';
  }
}

function hideNavDialog() {
    navDialog.classList.remove('visible');
    navDialog.setAttribute('aria-hidden', 'true');
  }

// Keyboard
document.addEventListener('keydown', (e) => {
   if (e.key === 'Escape') {
       hideNavDialog();
       // Also close any open overlays
       if (settingsOverlay?.classList.contains('visible')) toggleOverlay(settingsOverlay, false);
       if (accountOverlay?.classList.contains('visible')) toggleOverlay(accountOverlay, false);
   }
});

// --- Helper: Find Item in Tree ---
function findItemAndParent(id, list, parentItem = null) {
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (item.id === id) {
      return { item, parentList: list, index: i, parentItem };
    }
    if (item.type === 'folder' && item.items) {
      const result = findItemAndParent(id, item.items, item);
      if (result) return result;
    }
  }
  return null;
}

// --- Folder Logic ---

const FOLDER_COLORS = ['#C8156B', '#1F5FAE', '#8B2D14', '#E8341E', '#2E8B3E', '#9C8B6E', '#3b82f6', '#ef4444', '#8b5cf6'];
const FOLDER_ICONS = ['★', '✿', '⚗︎', 'ƒ', 'α', '✦', '☆', '♥', '✎'];

function showFolderEditorDialog({ title = 'Nieuwe map', name = '', color = '#1F5FAE', icon = '★', confirmLabel = 'Maak map' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'binas-confirm-overlay folder-editor-overlay';
    const colorChips = FOLDER_COLORS.map(c =>
      `<button type="button" class="folder-editor-color" data-color="${c}" style="background:${c}" aria-label="Kleur ${c}"></button>`
    ).join('');
    const iconChips = FOLDER_ICONS.map(i =>
      `<button type="button" class="folder-editor-icon" data-icon="${i}">${escapeHtml(i)}</button>`
    ).join('');
    overlay.innerHTML = `
      <div class="binas-confirm-dialog folder-editor">
        <h3 class="binas-confirm-title">${escapeHtml(title)}</h3>
        <input type="text" class="folder-editor-name" placeholder="Bijv. Toets H5" value="${escapeHtml(name)}" />
        <div class="folder-editor-label">KLEUR</div>
        <div class="folder-editor-colors">${colorChips}</div>
        <div class="folder-editor-label">ICOON</div>
        <div class="folder-editor-icons">${iconChips}</div>
        <div class="binas-confirm-buttons">
          <button class="binas-confirm-btn binas-confirm-btn--cancel">Annuleer</button>
          <button class="binas-confirm-btn binas-confirm-btn--confirm folder-editor-save">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('binas-confirm-overlay--visible'));

    let curColor = color;
    let curIcon = icon;
    const nameInput = overlay.querySelector('.folder-editor-name');
    const saveBtn = overlay.querySelector('.folder-editor-save');
    saveBtn.style.background = curColor;
    saveBtn.style.borderColor = curColor;

    const syncColors = () => {
      overlay.querySelectorAll('.folder-editor-color').forEach(b => {
        b.classList.toggle('is-active', b.dataset.color === curColor);
      });
      saveBtn.style.background = curColor;
      saveBtn.style.borderColor = curColor;
    };
    const syncIcons = () => {
      overlay.querySelectorAll('.folder-editor-icon').forEach(b => {
        b.classList.toggle('is-active', b.dataset.icon === curIcon);
      });
    };
    syncColors();
    syncIcons();

    overlay.querySelectorAll('.folder-editor-color').forEach(b => {
      b.addEventListener('click', () => { curColor = b.dataset.color; syncColors(); });
    });
    overlay.querySelectorAll('.folder-editor-icon').forEach(b => {
      b.addEventListener('click', () => { curIcon = b.dataset.icon; syncIcons(); });
    });

    const cleanup = () => {
      overlay.classList.remove('binas-confirm-overlay--visible');
      setTimeout(() => overlay.remove(), 300);
    };
    overlay.querySelector('.binas-confirm-btn--cancel').addEventListener('click', () => { cleanup(); resolve(null); });
    saveBtn.addEventListener('click', () => {
      const n = nameInput.value.trim();
      if (!n) { nameInput.focus(); return; }
      cleanup();
      resolve({ name: n, color: curColor, icon: curIcon });
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveBtn.click();
      if (e.key === 'Escape') { cleanup(); resolve(null); }
    });
    setTimeout(() => nameInput.focus(), 50);
  });
}

async function createNewFolder() {
  const result = await showFolderEditorDialog({ title: 'Nieuwe map', confirmLabel: 'Maak map' });
  if (!result) return;

  const newFolder = {
    id: generateUUID(),
    type: 'folder',
    name: result.name,
    color: result.color,
    icon: result.icon,
    collapsed: false,
    items: []
  };

  favorites.push(newFolder);
  saveFavorites();
  renderFavoritesList();
  showToast(`Map "${result.name}" aangemaakt`, 'success');
}

async function editFolder(id) {
  const res = findItemAndParent(id, favorites);
  if (!res || res.item.type !== 'folder') return;
  const result = await showFolderEditorDialog({
    title: 'Map bewerken',
    name: res.item.name,
    color: res.item.color || '#1F5FAE',
    icon: res.item.icon || '★',
    confirmLabel: 'Opslaan',
  });
  if (!result) return;
  res.item.name = result.name;
  res.item.color = result.color;
  res.item.icon = result.icon;
  saveFavorites();
  renderFavoritesList();
}

function toggleFolder(id) {
  const result = findItemAndParent(id, favorites);
  if (result && result.item.type === 'folder') {
    result.item.collapsed = !result.item.collapsed;
    saveFavorites();
    renderFavoritesList();
  }
}

async function deleteFolder(id) {
  const result = findItemAndParent(id, favorites);
  if (!result) return;

  const count = countFolderItems(result.item);
  const msg = count > 0
    ? `Weet je zeker dat je de map "${result.item.name}" wilt verwijderen? De ${count} favoriet${count === 1 ? '' : 'en'} in deze map worden ook verwijderd.`
    : `Weet je zeker dat je de map "${result.item.name}" wilt verwijderen?`;
  const confirmed = await showConfirmDialog('Map verwijderen', msg);
  if (!confirmed) return;

  result.parentList.splice(result.index, 1);
  if (openFolderId === id) openFolderId = null;
  saveFavorites();
  renderFavoritesList();
  refreshNavStars();
  showToast('Map verwijderd', 'info');
}

async function renameFolder(id) {
  const result = findItemAndParent(id, favorites);
  if (!result || result.item.type !== 'folder') return;

  const newName = await showPromptDialog('Map hernoemen', 'Geef de map een nieuwe naam:', result.item.name);

  if (newName && newName !== result.item.name) {
    result.item.name = newName;
    saveFavorites();
    renderFavoritesList();
    showToast('Map hernoemd', 'success');
  }
}

async function setFolderColor(id) {
  const result = findItemAndParent(id, favorites);
  if (!result || result.item.type !== 'folder') return;

  // Extended color palette with theme-matching colors
  const colors = [
    '#ef4444', // Red (Scheikunde)
    '#f97316', // Orange
    '#f59e0b', // Amber
    '#10b981', // Green (Biologie)
    '#3b82f6', // Blue (Natuurkunde)
    '#8b5cf6', // Purple
    '#ec4899', // Pink (Algemeen)
    '#0163ac', // Natuurkunde blue
    '#c94195', // Algemeen pink
    '#a0341a', // Wiskunde
    '#2c9a44', // Biologie green
    '#6b7280'  // Gray
  ];
  const color = await showColorPickerDialog(colors, result.item.color);

  if (color) {
    result.item.color = color;
    saveFavorites();
    renderFavoritesList();
  }
}

// --- Tabel index & vak-metadata ---

const VAK_META = {
  algemeen:    { naam: 'Algemeen',     short: 'Alg', color: '#c94195', tint: '#f8e5ef', ink: '#7a0c42' },
  natuurkunde: { naam: 'Natuurkunde',  short: 'Nat', color: '#0163ac', tint: '#e3edf7', ink: '#0a3a66' },
  wiskunde:    { naam: 'Wiskunde',     short: 'Wis', color: '#a0341a', tint: '#f5e3dd', ink: '#5e1d0e' },
  scheikunde:  { naam: 'Scheikunde',   short: 'Sch', color: '#e8341e', tint: '#fde5e0', ink: '#7a160a' },
  biologie:    { naam: 'Biologie',     short: 'Bio', color: '#2c9a44', tint: '#dff1e3', ink: '#1c5e2a' },
  register:    { naam: 'Register',     short: 'Reg', color: '#aa9b88', tint: '#f0ece6', ink: '#5e564a' },
};

// Vector icons for the sidebar vak selector. Stroke-based so they inherit
// `currentColor` and pick up the active/inactive states.
const VAK_ICONS = {
  alles:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  algemeen:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.6" fill="currentColor" stroke="none"/></svg>',
  natuurkunde: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/></svg>',
  scheikunde:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6"/><path d="M10 3v6.2L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 9.2V3"/><path d="M7.5 14h9"/></svg>',
  biologie:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 4c-7 0-13 4-13 11 0 3 1 5 3 6 6-2 10-7 10-15z" fill="currentColor" fill-opacity="0.18"/><path d="M20 4c-7 0-13 4-13 11 0 3 1 5 3 6"/><path d="M20 4c0 8-4 13-10 15"/><path d="M5 21c2-5 6-9 11-12"/></svg>',
};

const RECENT_KEY = 'binas:recent-tables';
const MAX_RECENT = 40;

let tabelByNr = null;

function getTabelByNr() {
  if (tabelByNr) return tabelByNr;
  tabelByNr = {};
  for (const section of navigationData || []) {
    const theme = section.theme;
    for (const item of section.items || []) {
      const nr = parseInt(item.label, 10);
      if (!Number.isInteger(nr) || nr < 1 || nr > 100) continue;
      if (tabelByNr[nr]) continue; // first occurrence wins
      tabelByNr[nr] = {
        nr,
        titel: item.title || '',
        pagina: item.page,
        theme,
        section: section.section || '',
        alignKey: item.alignKey,
        subs: Array.isArray(item.children)
          ? item.children.map(c => ({ letter: c.label, body: c.title, pagina: c.page, alignKey: c.alignKey }))
          : []
      };
    }
  }
  return tabelByNr;
}

function getRecentItems() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(it => {
      if (typeof it === 'number' && Number.isInteger(it)) return { nr: it, sub: null };
      if (it && typeof it === 'object' && Number.isInteger(it.nr)) return { nr: it.nr, sub: it.sub || null };
      return null;
    }).filter(Boolean);
  } catch { return []; }
}

function trackRecentFromNavItem(item) {
  if (!item) return;
  const raw = item.fullLabel || item.label || '';
  const m = String(raw).match(/^(\d+)([A-Za-z].*)?$/);
  if (!m) return;
  const nr = parseInt(m[1], 10);
  if (!Number.isInteger(nr)) return;
  const subLetter = m[2] || null;
  pushRecentItem(nr, subLetter);
}

function pushRecentItem(nr, subLetter) {
  if (!Number.isInteger(nr)) return;
  const sub = subLetter || null;
  try {
    const list = getRecentItems().filter(it => !(it.nr === nr && (it.sub || null) === sub));
    list.unshift({ nr, sub });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {}
  if (recentView && !recentView.hidden) renderRecentView();
}

function highlightHtml(text, q) {
  if (!q) return escapeHtml(text);
  const lower = text.toLowerCase();
  const i = lower.indexOf(q.toLowerCase());
  if (i < 0) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, i))}<mark>${escapeHtml(text.slice(i, i + q.length))}</mark>${escapeHtml(text.slice(i + q.length))}`;
}

// ───────── Category Selector (left sidebar) ─────────

function renderVakSelector() {
  const host = document.getElementById('vak-selector');
  if (!host) return;
  host.innerHTML = '';
  const cats = [
    { id: 'alles',       naam: 'Alle vakken', color: '#475569', tint: '#e2e8f0', isAll: true },
    { id: 'algemeen' },
    { id: 'natuurkunde' },
    { id: 'scheikunde' },
    { id: 'biologie' },
  ];
  cats.forEach(cat => {
    const meta = cat.isAll ? cat : VAK_META[cat.id];
    if (!meta) return;
    const isActive = cat.isAll
      ? activeVakCategory === null
      : activeVakCategory === cat.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vak-selector-btn' + (isActive ? ' is-active' : '') + (cat.isAll ? ' vak-selector-btn--all' : '');
    btn.style.setProperty('--cat-color', meta.color);
    btn.style.setProperty('--cat-tint', meta.tint);
    btn.title = meta.naam;
    btn.setAttribute('aria-label', meta.naam);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btn.innerHTML = VAK_ICONS[cat.id] || '';
    btn.addEventListener('click', () => {
      if (cat.isAll) {
        setActiveVakCategory(null);
      } else {
        setActiveVakCategory(activeVakCategory === cat.id ? null : cat.id);
      }
    });
    host.appendChild(btn);
  });
}

function setActiveVakCategory(id) {
  activeVakCategory = id;

  // Reorder + collapse nav-list sections
  applyNavCategoryFilter();

  // Tint sidebar icon accent colour to the selected category
  const sidebar = document.querySelector('.icon-sidebar');
  if (sidebar) {
    if (id) {
      const meta = VAK_META[id];
      sidebar.style.setProperty('--primary', meta?.color || '');
      sidebar.style.setProperty('--primary-hover', meta?.color || '');
    } else {
      sidebar.style.removeProperty('--primary');
      sidebar.style.removeProperty('--primary-hover');
    }
  }

  renderVakSelector();
}

function applyNavCategoryFilter() {
  if (!navigationData.length) return;
  if (!activeVakCategory) {
    // Restore original order and clear category-imposed collapse states
    Object.keys(sectionCollapseState).forEach(k => delete sectionCollapseState[k]);
    filterNavigation(navSearch?.value || '', { force: true });
    return;
  }

  // Put selected category first, collapse all others
  const sorted = [...navigationData].sort((a, b) =>
    (a.theme === activeVakCategory ? 0 : 1) - (b.theme === activeVakCategory ? 0 : 1)
  );
  sorted.forEach(s => {
    sectionCollapseState[s.section ?? s.theme] = s.theme !== activeVakCategory;
  });

  // Re-render applying the current search query over the sorted sections
  const q = navSearch?.value || '';
  const rawQ = q.trim().toLowerCase();
  const normQ = normalizeSearch(q);
  const tokQ = q.split(/\s+/).map(normalizeSearch).filter(Boolean);
  const isEmpty = !rawQ;
  const hits = (item) => {
    if (isEmpty) return true;
    const raw = item._searchRaw || '', norm = item._searchNorm || '';
    if (rawQ && raw.includes(rawQ)) return true;
    if (normQ && norm.includes(normQ)) return true;
    if (tokQ.length && tokQ.every(t => norm.includes(t))) return true;
    if (normQ && item._searchLabelNorm && item._searchLabelNorm.startsWith(normQ)) return true;
    return false;
  };
  const filterItems = items => {
    if (!Array.isArray(items)) return [];
    const out = [];
    for (const item of items) {
      const fc = item.children ? filterItems(item.children) : [];
      if (hits(item) || fc.length) out.push(fc.length ? { ...item, children: fc } : item);
    }
    return out;
  };
  const result = sorted
    .map(s => ({ ...s, items: filterItems(s.items) }))
    .filter(s => s.items.length > 0);
  renderNavigationWithEmptyState(result, navList);
  if (navDialog?.classList.contains('visible')) {
    renderTocOverview(result);
  } else if (tocMain) {
    tocMain.dataset.searchStale = 'true';
  }
}

// ───────── Recent view ─────────

function renderRecentView() {
  if (!recentBody) return;
  recentBody.innerHTML = '';
  const recents = getRecentItems();
  if (recents.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'recent-empty';
    empty.textContent = 'Nog geen tabellen bekeken.';
    recentBody.appendChild(empty);
    return;
  }
  recents.forEach(it => {
    const t = getTabelByNr()[it.nr];
    if (!t) return;
    const meta = VAK_META[t.theme] || { color: '#666', tint: '#f5f5f5', ink: '#222', naam: t.theme || '' };
    const sub = it.sub ? (t.subs || []).find(s => s.letter === it.sub) : null;
    const displayLabel = it.sub ? `${it.nr}${it.sub}` : `${it.nr}`;
    const displayTitle = sub ? (sub.body || sub.label || t.titel) : t.titel;
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'recent-row';
    row.innerHTML = `
      <span class="recent-row-num" style="background:${meta.tint};color:${meta.color}">${escapeHtml(displayLabel)}</span>
      <span class="recent-row-body">
        <span class="recent-row-title">${escapeHtml(displayTitle)}</span>
        <span class="recent-row-vak" style="color:${meta.color}">${escapeHtml(meta.naam.toUpperCase())}${sub ? ` · ${escapeHtml(t.titel)}` : ''}</span>
      </span>
    `;
    row.addEventListener('click', () => {
      const targetPage = sub?.pagina || t.pagina;
      const alignKey = sub?.alignKey || t.alignKey;
      const alignData = alignKey ? alignMap[alignKey] : null;
      openPage(targetPage, alignData?.yPdfTop);
      pushRecentItem(it.nr, it.sub);
    });
    recentBody.appendChild(row);
  });
}

// --- UI Dialogs ---

function showPromptDialog(title, message, defaultValue = '') {
  return new Promise((resolve) => {
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'binas-confirm-overlay';
    dialogOverlay.innerHTML = `
      <div class="binas-confirm-dialog">
        <h3 class="binas-confirm-title">${escapeHtml(title)}</h3>
        <p class="binas-confirm-text">${escapeHtml(message)}</p>
        <input type="text" class="binas-confirm-input" value="${escapeHtml(defaultValue)}" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:6px; font-size:14px; margin-bottom:16px;">
        <div class="binas-confirm-buttons">
          <button class="binas-confirm-btn binas-confirm-btn--cancel">Annuleren</button>
          <button class="binas-confirm-btn binas-confirm-btn--confirm">Opslaan</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialogOverlay);
    const input = dialogOverlay.querySelector('input');

    requestAnimationFrame(() => {
      dialogOverlay.classList.add('binas-confirm-overlay--visible');
      input.focus();
      input.select();
    });

    const cleanup = () => {
      dialogOverlay.classList.remove('binas-confirm-overlay--visible');
      setTimeout(() => dialogOverlay.remove(), 300);
    };

    dialogOverlay.querySelector('.binas-confirm-btn--confirm').addEventListener('click', () => {
      const val = input.value.trim();
      cleanup();
      resolve(val || null);
    });

    dialogOverlay.querySelector('.binas-confirm-btn--cancel').addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        cleanup();
        resolve(val || null);
      }
    });
  });
}

function showColorPickerDialog(colors, currentColor) {
  return new Promise((resolve) => {
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'binas-confirm-overlay';

    let colorHtml = '<div class="color-picker-grid">';
    colors.forEach(c => {
      const selected = c === currentColor ? 'selected' : '';
      colorHtml += `<div class="color-option ${selected}" style="background-color: ${c}" data-color="${c}"></div>`;
    });
    colorHtml += '</div>';

    dialogOverlay.innerHTML = `
      <div class="binas-confirm-dialog">
        <h3 class="binas-confirm-title">Kies een kleur</h3>
        ${colorHtml}
        <div class="binas-confirm-buttons" style="margin-top: 16px;">
          <button class="binas-confirm-btn binas-confirm-btn--cancel">Annuleren</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialogOverlay);

    requestAnimationFrame(() => {
      dialogOverlay.classList.add('binas-confirm-overlay--visible');
    });

    const cleanup = () => {
      dialogOverlay.classList.remove('binas-confirm-overlay--visible');
      setTimeout(() => dialogOverlay.remove(), 300);
    };

    dialogOverlay.querySelectorAll('.color-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const color = opt.dataset.color;
        cleanup();
        resolve(color);
      });
    });

    dialogOverlay.querySelector('.binas-confirm-btn--cancel').addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
  });
}

// Note: Add Folder Button is hooked up in DOMContentLoaded

// --- Note Logic ---

function showNoteDialog(title, currentNote = '') {
  return new Promise((resolve) => {
    const dialogOverlay = document.createElement('div');
    dialogOverlay.className = 'binas-confirm-overlay';
    dialogOverlay.innerHTML = `
      <div class="binas-confirm-dialog" style="max-width: 440px;">
        <h3 class="binas-confirm-title">${escapeHtml(title)}</h3>
        <p class="binas-confirm-text" style="margin-bottom: 12px;">Voeg een persoonlijke notitie toe aan deze favoriet:</p>
        <textarea class="binas-note-textarea" placeholder="Bijv. 'Belangrijk voor H3 toets' of 'Formule voor zwaartekracht'">${escapeHtml(currentNote)}</textarea>
        <div class="binas-confirm-buttons">
          <button class="binas-confirm-btn binas-confirm-btn--cancel">Annuleren</button>
          <button class="binas-confirm-btn binas-confirm-btn--delete" style="background: #ef4444; border-color: #ef4444; color: white;">Verwijderen</button>
          <button class="binas-confirm-btn binas-confirm-btn--confirm">Opslaan</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialogOverlay);
    const textarea = dialogOverlay.querySelector('textarea');
    const deleteBtn = dialogOverlay.querySelector('.binas-confirm-btn--delete');

    // Hide delete button if no current note
    if (!currentNote) {
      deleteBtn.hidden = true;
    }

    requestAnimationFrame(() => {
      dialogOverlay.classList.add('binas-confirm-overlay--visible');
      textarea.focus();
      // Move cursor to end
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });

    const cleanup = () => {
      dialogOverlay.classList.remove('binas-confirm-overlay--visible');
      setTimeout(() => dialogOverlay.remove(), 300);
    };

    dialogOverlay.querySelector('.binas-confirm-btn--confirm').addEventListener('click', () => {
      const val = textarea.value.trim();
      cleanup();
      resolve(val);
    });

    dialogOverlay.querySelector('.binas-confirm-btn--cancel').addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    deleteBtn.addEventListener('click', () => {
      cleanup();
      resolve(''); // Empty string to delete
    });

    // Ctrl/Cmd + Enter to save
    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const val = textarea.value.trim();
        cleanup();
        resolve(val);
      }
      if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    });
  });
}

async function editNote(id) {
  const result = findItemAndParent(id, favorites);
  if (!result || result.item.type === 'folder') return;

  const currentNote = result.item.note || '';
  const newNote = await showNoteDialog('Notitie bewerken', currentNote);

  if (newNote !== null) {
    result.item.note = newNote;
    saveFavorites();
    renderFavoritesList();

    if (newNote) {
      showToast('Notitie opgeslagen', 'success');
    } else if (currentNote && !newNote) {
      showToast('Notitie verwijderd', 'info');
    }
  }
}

// --- Floating action menus & folder picker ---

let activeFavMenu = null;
let favMenuOutsideHandler = null;

function closeFavMenu() {
  if (activeFavMenu) {
    activeFavMenu.remove();
    activeFavMenu = null;
  }
  if (favMenuOutsideHandler) {
    document.removeEventListener('mousedown', favMenuOutsideHandler, true);
    document.removeEventListener('keydown', favMenuOutsideHandler, true);
    favMenuOutsideHandler = null;
  }
}

function buildFavMenu(triggerEl, options) {
  closeFavMenu();
  const menu = document.createElement('div');
  menu.className = 'fav-action-menu';
  menu.setAttribute('role', 'menu');

  options.forEach((opt) => {
    if (opt.divider) {
      const div = document.createElement('div');
      div.className = 'fav-action-divider';
      menu.appendChild(div);
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fav-action-item' + (opt.danger ? ' is-danger' : '');
    btn.setAttribute('role', 'menuitem');
    if (opt.icon) {
      const ic = document.createElement('span');
      ic.className = 'fav-action-icon';
      ic.innerHTML = opt.icon;
      btn.appendChild(ic);
    }
    const lab = document.createElement('span');
    lab.className = 'fav-action-label';
    lab.textContent = opt.label;
    btn.appendChild(lab);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFavMenu();
      opt.onClick?.();
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);

  // Position relative to the trigger
  const rect = triggerEl.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let left = rect.right - menuRect.width;
  let top = rect.bottom + 6;
  if (left < 8) left = 8;
  if (left + menuRect.width > window.innerWidth - 8) left = window.innerWidth - menuRect.width - 8;
  if (top + menuRect.height > window.innerHeight - 8) {
    top = rect.top - menuRect.height - 6;
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  activeFavMenu = menu;

  favMenuOutsideHandler = (e) => {
    if (e.type === 'keydown') {
      if (e.key === 'Escape') closeFavMenu();
      return;
    }
    if (!menu.contains(e.target) && e.target !== triggerEl) {
      closeFavMenu();
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', favMenuOutsideHandler, true);
    document.addEventListener('keydown', favMenuOutsideHandler, true);
  }, 0);

  return menu;
}

function showItemActionsMenu(triggerEl, favoriteId) {
  const fav = findItemAndParent(favoriteId, favorites);
  if (!fav || fav.item.type === 'folder') return;
  const hasNote = !!fav.item.note;
  const noteIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  const moveIcon = FOLDER_ICON_SVG;
  const trashIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>';

  buildFavMenu(triggerEl, [
    {
      label: hasNote ? 'Notitie bewerken' : 'Notitie toevoegen',
      icon: noteIcon,
      onClick: () => editNote(favoriteId)
    },
    {
      label: 'Verplaats naar map…',
      icon: moveIcon,
      onClick: async () => {
        const parent = fav.parentItem?.id || null;
        const choice = await showFolderPickerDialog({
          mode: 'move',
          itemContext: fav.item,
          currentFolderId: parent,
          excludeFolderId: null
        });
        if (choice === undefined) return;
        moveItemToFolder(favoriteId, choice);
      }
    },
    { divider: true },
    {
      label: 'Verwijder uit favorieten',
      icon: trashIcon,
      danger: true,
      onClick: () => {
        removeFavoriteById(favoriteId);
        showToast('Verwijderd uit favorieten', 'info');
      }
    }
  ]);
}

function showFolderActionsMenu(triggerEl, folderId) {
  const folder = findItemAndParent(folderId, favorites);
  if (!folder || folder.item.type !== 'folder') return;

  const renameIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
  const colorIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="1.5"></circle><circle cx="17.5" cy="10.5" r="1.5"></circle><circle cx="8.5" cy="7.5" r="1.5"></circle><circle cx="6.5" cy="12.5" r="1.5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.7 1.5-1.5 0-.4-.18-.8-.5-1.05-.3-.25-.5-.65-.5-1.05 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.5-4.5-9.5-10-9.5z"></path></svg>';
  const moveIcon = FOLDER_ICON_SVG;
  const trashIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>';

  const opts = [
    { label: 'Map bewerken…', icon: renameIcon, onClick: () => editFolder(folderId) },
    { label: 'Kleur kiezen', icon: colorIcon, onClick: () => setFolderColor(folderId) },
  ];

  // Allow moving folder into a parent folder (rare but useful for nested folders)
  const otherFolders = getAllFolders().filter(f => f.id !== folderId && !isAncestor(folderId, f.id, favorites));
  if (otherFolders.length > 0 || folder.parentItem) {
    opts.push({
      label: 'Verplaats map…',
      icon: moveIcon,
      onClick: async () => {
        const choice = await showFolderPickerDialog({
          title: 'Waar wil je deze map plaatsen?',
          message: 'Kies een bovenliggende map of plaats hem op het hoofdniveau.',
          currentFolderId: folder.parentItem?.id || null,
          excludeFolderId: folderId
        });
        if (choice === undefined) return;
        moveItemToFolder(folderId, choice);
      }
    });
  }

  opts.push({ divider: true });
  opts.push({
    label: 'Verwijder map',
    icon: trashIcon,
    danger: true,
    onClick: () => deleteFolder(folderId)
  });

  buildFavMenu(triggerEl, opts);
}

// Dialog for picking a destination folder. Returns null (root), a folder id, or undefined (cancelled).
// Inline SVGs used in the folder picker so the icons stay consistent with
// the rest of the sidebar.
const FAV_PICKER_STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const FAV_PICKER_FOLDER_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
const FAV_PICKER_PLUS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const FAV_PICKER_CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

function showFolderPickerDialog({
  mode = 'move',
  itemContext = null,
  title,
  message,
  currentFolderId = null,
  excludeFolderId = null
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'binas-confirm-overlay fav-folder-picker-overlay';

    const allFolders = getAllFolders().filter((f) => {
      if (!excludeFolderId) return true;
      if (f.id === excludeFolderId) return false;
      return !isAncestor(excludeFolderId, f.id, favorites);
    });

    const itemWord = (n) => (n === 1 ? 'favoriet' : 'favorieten');

    const defaultTitle = mode === 'add' ? 'Bewaar als favoriet' : 'Verplaats favoriet';
    const dialogTitle = title || defaultTitle;
    const dialogMessage = message || '';

    // Build the "what is being added" preview chip if we have an itemContext.
    // The chip uses the subject (theme) colour so the user instantly sees
    // which vak the item belongs to.
    let contextChipHtml = '';
    if (itemContext) {
      const ctxLabel = itemContext.fullLabel || itemContext.label || '';
      const ctxTitle = itemContext.title || '';
      const theme = itemContext.theme;
      const themeMeta = theme && VAK_META[theme];
      const chipColor = themeMeta?.color || '#475569';
      const labelMatch = ctxLabel.match(/^(\d+)([A-Za-z].*)$/);
      const numText = labelMatch ? labelMatch[1] : (ctxLabel || '•');
      const suffix = labelMatch ? labelMatch[2] : '';
      contextChipHtml = `
        <div class="fav-picker-chip" aria-label="Te bewaren item">
          <span class="fav-picker-chip-badge" style="background:${chipColor}">
            <span class="fav-picker-chip-num">${escapeHtml(numText)}</span>${suffix ? `<span class="fav-picker-chip-suffix">${escapeHtml(suffix)}</span>` : ''}
          </span>
          <span class="fav-picker-chip-title">${escapeHtml(ctxTitle)}</span>
        </div>
      `;
    }

    // Primary "no folder" option, separated visually so it reads as a
    // distinct quick-action, not just another folder.
    const renderRootOption = (selected) => `
      <button type="button" class="fav-folder-option fav-folder-option--root ${selected ? 'is-selected' : ''}" data-folder-id="" data-pickable="1">
        <span class="fav-folder-icon fav-folder-icon--root">${FAV_PICKER_STAR_SVG}</span>
        <span class="fav-folder-text">
          <span class="fav-folder-label">Mijn favorieten</span>
          <span class="fav-folder-sub">Op het hoofdniveau, zonder map</span>
        </span>
        <span class="fav-folder-check">${FAV_PICKER_CHECK_SVG}</span>
      </button>
    `;

    const renderFolderOption = (id, name, color, count, depth, selected) => {
      const tint = color || '#3b82f6';
      const indent = 12 + depth * 16;
      const subText = count > 0 ? `${count} ${itemWord(count)}` : 'Leeg';
      return `
        <button type="button" class="fav-folder-option ${selected ? 'is-selected' : ''}" data-folder-id="${id}" data-pickable="1" style="padding-left: ${indent}px;">
          <span class="fav-folder-icon fav-folder-icon--filled" style="background:${tint};">${FAV_PICKER_FOLDER_SVG}</span>
          <span class="fav-folder-text">
            <span class="fav-folder-label">${escapeHtml(name)}</span>
            <span class="fav-folder-sub">${escapeHtml(subText)}</span>
          </span>
          <span class="fav-folder-check">${FAV_PICKER_CHECK_SVG}</span>
        </button>
      `;
    };

    const folderListHtml = allFolders.length > 0
      ? `<div class="fav-folder-section-label">Of in een map</div>
         <div class="fav-folder-list" role="listbox" aria-label="Kies een map">
           ${allFolders.map((f) => renderFolderOption(f.id, f.name, f.color, f.count, f.depth, currentFolderId === f.id)).join('')}
         </div>`
      : '';

    const messageHtml = dialogMessage
      ? `<p class="binas-confirm-text">${escapeHtml(dialogMessage)}</p>`
      : '';

    overlay.innerHTML = `
      <div class="binas-confirm-dialog fav-folder-dialog">
        <div class="fav-folder-header">
          <h3 class="binas-confirm-title">${escapeHtml(dialogTitle)}</h3>
          ${messageHtml}
          ${contextChipHtml}
        </div>
        <div class="fav-folder-body">
          <div class="fav-folder-primary">
            ${renderRootOption(currentFolderId === null)}
          </div>
          ${folderListHtml}
        </div>
        <div class="fav-folder-footer">
          <div class="fav-folder-new-wrap">
            <button type="button" class="fav-folder-new">
              <span class="fav-folder-new-icon">${FAV_PICKER_PLUS_SVG}</span>
              <span>Nieuwe map</span>
            </button>
            <form class="fav-folder-new-form" hidden>
              <input type="text" class="fav-folder-new-input" placeholder="Naam van de map" maxlength="40" autocomplete="off" />
              <button type="submit" class="fav-folder-new-confirm">Maken</button>
              <button type="button" class="fav-folder-new-cancel" aria-label="Annuleren">×</button>
            </form>
          </div>
          <button class="binas-confirm-btn binas-confirm-btn--cancel">Annuleer</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('binas-confirm-overlay--visible'));

    let resolved = false;
    const cleanup = () => {
      overlay.classList.remove('binas-confirm-overlay--visible');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => overlay.remove(), 200);
    };
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(value);
    };

    const pickables = () => Array.from(overlay.querySelectorAll('[data-pickable="1"]'));

    overlay.querySelectorAll('.fav-folder-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.folderId;
        finish(id ? id : null);
      });
    });

    // --- Inline "Nieuwe map" form (no nested prompt dialog) ---
    const newWrap = overlay.querySelector('.fav-folder-new-wrap');
    const newBtn = overlay.querySelector('.fav-folder-new');
    const newForm = overlay.querySelector('.fav-folder-new-form');
    const newInput = overlay.querySelector('.fav-folder-new-input');
    const newCancel = overlay.querySelector('.fav-folder-new-cancel');

    const showNewForm = () => {
      newBtn.hidden = true;
      newForm.hidden = false;
      newWrap.classList.add('is-creating');
      newInput.value = '';
      requestAnimationFrame(() => newInput.focus());
    };
    const hideNewForm = () => {
      newForm.hidden = true;
      newBtn.hidden = false;
      newWrap.classList.remove('is-creating');
    };

    newBtn.addEventListener('click', showNewForm);
    newCancel.addEventListener('click', hideNewForm);
    newForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = newInput.value.trim();
      if (!name) {
        newInput.focus();
        return;
      }
      const newFolder = {
        id: generateUUID(),
        type: 'folder',
        name,
        color: '#3b82f6',
        collapsed: false,
        items: []
      };
      favorites.push(newFolder);
      saveFavorites();
      renderFavoritesList();
      finish(newFolder.id);
    });

    overlay.querySelector('.binas-confirm-btn--cancel').addEventListener('click', () => finish(undefined));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(undefined);
    });

    // --- Keyboard navigation ---
    const moveFocus = (delta) => {
      const items = pickables();
      if (items.length === 0) return;
      const active = document.activeElement;
      const currentIdx = items.indexOf(active);
      const nextIdx = currentIdx === -1
        ? (delta > 0 ? 0 : items.length - 1)
        : (currentIdx + delta + items.length) % items.length;
      items[nextIdx].focus();
    };

    const onKey = (e) => {
      // While typing in the new-folder input, only Esc does anything global.
      if (e.target === newInput) {
        if (e.key === 'Escape') {
          e.preventDefault();
          hideNewForm();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(undefined);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(-1);
      }
    };
    document.addEventListener('keydown', onKey, true);

    // Auto-focus: the currently-selected option, or the primary "geen map"
    // button if nothing is selected — so Enter immediately confirms.
    requestAnimationFrame(() => {
      const selected = overlay.querySelector('.fav-folder-option.is-selected');
      const fallback = overlay.querySelector('.fav-folder-option--root');
      (selected || fallback)?.focus();
    });
  });
}

// --- Drag and Drop Logic ---

// Store the currently dragged item ID (backup for dataTransfer issues)
let currentDraggedItemId = null;

function handleDragStart(e, id) {
  // Stop propagation to prevent parent folders from handling this drag
  e.stopPropagation();

  // Store in both dataTransfer AND a variable (as backup)
  currentDraggedItemId = id;

  // Set data with multiple formats for better compatibility
  try {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.setData('application/x-binas-favorite', id);
  } catch (err) {
    console.warn('Could not set dataTransfer:', err);
  }

  e.dataTransfer.effectAllowed = 'move';

  // Set drag image to the nav-item element for better visual
  const navItem = e.target.closest('.nav-item');
  if (navItem) {
    navItem.classList.add('dragging');
    try {
      e.dataTransfer.setDragImage(navItem, 10, 10);
    } catch (err) { /* not supported on some browsers */ }
  }

  document.body.classList.add('is-dragging-favorite');

  // If this item is currently inside a folder, advertise that fact via a
  // body-level class. The CSS uses it to reveal the "Sleep hier om uit map
  // te halen" drop zone — the visual hint that an item can be dragged out.
  const sourceRes = findItemAndParent(id, favorites);
  if (sourceRes && sourceRes.parentItem && sourceRes.parentItem.type === 'folder') {
    document.body.classList.add('is-dragging-from-folder');
  }
}

// Track which kind of drop indicator the user is seeing so we can update it
// from the dragover handler without restyling on every event.
function clearDropIndicators() {
  document.querySelectorAll('.drag-over, .drag-into, .drop-before, .drop-after')
    .forEach((el) => el.classList.remove('drag-over', 'drag-into', 'drop-before', 'drop-after'));
}

function handleDragOver(e) {
  if (!currentDraggedItemId) return;
  e.preventDefault();
  // Stop here so a parent folder LI doesn't immediately re-run and
  // overwrite the indicator we set on this LI.
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';

  const li = e.currentTarget; // the .fav-node LI we attached the listener to
  if (!li || !li.dataset.id) return;
  if (li.dataset.id === currentDraggedItemId) return; // no self-drops

  // Folder LI: drop INTO the folder (highlight folder header). Item LI:
  // insert before/after based on vertical hover position.
  clearDropIndicators();
  if (li.classList.contains('fav-folder')) {
    // When hovering the folder header itself, "drop-into". When hovering
    // the top/bottom edge, allow before/after sibling reordering instead.
    const rect = li.getBoundingClientRect();
    const edgeZone = Math.min(8, rect.height * 0.18);
    const offsetY = e.clientY - rect.top;
    if (offsetY < edgeZone) {
      li.classList.add('drop-before');
    } else if (offsetY > rect.height - edgeZone) {
      li.classList.add('drop-after');
    } else {
      li.classList.add('drag-into');
    }
  } else {
    const rect = li.getBoundingClientRect();
    const isAfter = (e.clientY - rect.top) > rect.height / 2;
    li.classList.add(isAfter ? 'drop-after' : 'drop-before');
  }
}

function handleDragEnter(e) {
  if (!currentDraggedItemId) return;
  e.preventDefault();
}

function handleDragLeave(e) {
  const li = e.currentTarget;
  if (!li) return;
  // Only clear when the pointer truly leaves the LI (not just moves to a child).
  if (!li.contains(e.relatedTarget)) {
    li.classList.remove('drag-over', 'drag-into', 'drop-before', 'drop-after');
  }
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  clearDropIndicators();

  document.body.classList.remove('is-dragging-favorite');
  document.body.classList.remove('is-dragging-from-folder');

  currentDraggedItemId = null;
}

async function handleDrop(e, targetId) {
  e.preventDefault();
  e.stopPropagation();

  // Compute drop position from current indicator BEFORE we clear styles.
  const li = e.currentTarget;
  const isInto = li?.classList.contains('drag-into');
  const isAfter = li?.classList.contains('drop-after');

  // Clean up drag state
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  clearDropIndicators();
  document.body.classList.remove('is-dragging-favorite');
  document.body.classList.remove('is-dragging-from-folder');

  // Try to get source ID from dataTransfer, fall back to stored variable
  let sourceId = e.dataTransfer.getData('text/plain');
  if (!sourceId && currentDraggedItemId) {
    sourceId = currentDraggedItemId;
  }
  currentDraggedItemId = null;

  if (!sourceId || sourceId === targetId) return;

  const sourceRes = findItemAndParent(sourceId, favorites);
  if (!sourceRes) return;

  const targetRes = findItemAndParent(targetId, favorites);
  if (!targetRes) return;

  // Prevent moving folder into itself or a descendant
  if (sourceRes.item.type === 'folder') {
    if (targetId === sourceId) return;
    if (isAncestor(sourceId, targetId, favorites)) return;
  }

  const itemToMove = sourceRes.item;

  // Drop INTO a folder: append to the folder's items.
  if (targetRes.item.type === 'folder' && isInto) {
    sourceRes.parentList.splice(sourceRes.index, 1);
    if (!targetRes.item.items) targetRes.item.items = [];
    targetRes.item.items.push(itemToMove);
    targetRes.item.collapsed = false;
    saveFavorites();
    renderFavoritesList();
    return;
  }

  // Drop BEFORE/AFTER an item or folder: insert as sibling in target's list.
  const sameList = sourceRes.parentList === targetRes.parentList;
  const sourceBeforeTarget = sameList && sourceRes.index < targetRes.index;

  sourceRes.parentList.splice(sourceRes.index, 1);

  let insertIndex = isAfter ? targetRes.index + 1 : targetRes.index;
  if (sameList && sourceBeforeTarget) insertIndex -= 1;
  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > targetRes.parentList.length) insertIndex = targetRes.parentList.length;

  targetRes.parentList.splice(insertIndex, 0, itemToMove);

  saveFavorites();
  renderFavoritesList();
}

function handleDropOnFolderList(e, folderId) {
  e.preventDefault();
  e.stopPropagation();

  // Clean up drag state (don't use handleDragEnd as e.target is the drop zone, not the dragged element)
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  clearDropIndicators();
  document.body.classList.remove('is-dragging-favorite');
  document.body.classList.remove('is-dragging-from-folder');

  // Try multiple dataTransfer formats, fall back to stored variable.
  let sourceId = e.dataTransfer.getData('text/plain') ||
                 e.dataTransfer.getData('application/x-binas-favorite') ||
                 e.dataTransfer.getData('text') ||
                 currentDraggedItemId;
  currentDraggedItemId = null;

  if (!sourceId) return;

  const sourceRes = findItemAndParent(sourceId, favorites);
  if (!sourceRes) return;

  // Prevent moving folder into itself
  if (sourceRes.item.type === 'folder' && folderId === sourceId) return;
  if (sourceRes.item.type === 'folder' && folderId) {
     // Check recursion
     // Simplified check: Is sourceId an ancestor of folderId?
     if (isAncestor(sourceId, folderId, favorites)) return;
  }

  // Store item before removing
  const itemToMove = sourceRes.item;
  // Remember whether the source was inside a folder, so we can give meaningful feedback.
  const sourceParentItem = sourceRes.parentItem;
  const wasInFolder = !!(sourceParentItem && sourceParentItem.type === 'folder');
  const sourceFolderName = wasInFolder ? sourceParentItem.name : null;

  // Remove source from its current location
  sourceRes.parentList.splice(sourceRes.index, 1);

  let placedInFolderName = null;
  if (folderId) {
    // Find target folder
    const folderRes = findItemAndParent(folderId, favorites);
    if (folderRes && folderRes.item.type === 'folder') {
        if (!folderRes.item.items) folderRes.item.items = [];
        folderRes.item.items.push(itemToMove);
        folderRes.item.collapsed = false;
        placedInFolderName = folderRes.item.name;
    } else {
        // Fallback to root if folder not found (shouldn't happen)
        favorites.push(itemToMove);
    }
  } else {
    // Dropped on root list
    favorites.push(itemToMove);
  }

  saveFavorites();
  renderFavoritesList();

  // User feedback: only when there's an actual change in container.
  if (wasInFolder && !placedInFolderName) {
    showToast(sourceFolderName ? `Verplaatst uit "${sourceFolderName}"` : 'Verplaatst uit map', 'success');
  } else if (!wasInFolder && placedInFolderName) {
    showToast(`Verplaatst naar "${placedInFolderName}"`, 'success');
  } else if (wasInFolder && placedInFolderName && sourceFolderName !== placedInFolderName) {
    showToast(`Verplaatst naar "${placedInFolderName}"`, 'success');
  }
}

function isAncestor(potentialAncestorId, targetId, list) {
    // Check if targetId is inside potentialAncestorId
    const ancestor = findItemAndParent(potentialAncestorId, list)?.item;
    if (!ancestor || ancestor.type !== 'folder' || !ancestor.items) return false;

    // Check deep
    const found = findItemAndParent(targetId, ancestor.items);
    return !!found;
}
