import { AppState, Holding, LedgerEntry, Trade, CSENewsItem, ProfitWallet, ReceiptDocument } from '../types';

const STORAGE_KEY = 'colombo_cse_portfolio_state_v1';
const DB_NAME = 'ColomboCsePortfolioDB';
const DB_STORE = 'app_state';

export const INITIAL_STATE: AppState = {
  holdings: [],
  ledger: [],
  trades: [],
  wallet: {
    totalWithdrawn: 0,
    withdrawals: [],
  },
  news: [],
  receipts: [],
  lastNewsSync: null,
  settings: {
    brokerageRatePercent: 1.12, // Standard CSE broker fee
    reinvestRatioPercent: 70,
    payoutRatioPercent: 30,
    cdsAccountNumber: '',
    currency: 'LKR',
  },
};

function normalizeState(parsed: any): AppState {
  if (!parsed || typeof parsed !== 'object') return INITIAL_STATE;
  return {
    holdings: Array.isArray(parsed.holdings) ? parsed.holdings : [],
    ledger: Array.isArray(parsed.ledger) ? parsed.ledger : [],
    trades: Array.isArray(parsed.trades) ? parsed.trades : [],
    wallet:
      parsed.wallet && typeof parsed.wallet === 'object'
        ? {
            totalWithdrawn: Number(parsed.wallet.totalWithdrawn || 0),
            withdrawals: Array.isArray(parsed.wallet.withdrawals) ? parsed.wallet.withdrawals : [],
          }
        : { totalWithdrawn: 0, withdrawals: [] },
    news: Array.isArray(parsed.news) ? parsed.news : [],
    receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
    lastNewsSync: parsed.lastNewsSync || null,
    settings: {
      ...INITIAL_STATE.settings,
      ...(parsed.settings || {}),
    },
  };
}

/**
 * Open IndexedDB for persistent browser backup
 */
function openIDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function saveToIDB(state: AppState) {
  try {
    const db = await openIDB();
    if (!db) return;
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.put(state, 'current');
  } catch (err) {
    console.warn('IDB save error:', err);
  }
}

/**
 * Sync state to PC Hard Disk JSON Database (data/portfolio-db.json via /api/storage)
 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveToLocalJsonFile(state: AppState) {
  if (typeof window === 'undefined') return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
    } catch (err) {
      console.warn('Local JSON file sync skipped (offline):', err);
    }
  }, 300);
}

/**
 * Hydrate state from PC Hard Disk JSON file (if browser cache was cleared or new browser opened)
 */
export async function hydrateFromLocalJsonFile(): Promise<AppState | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/storage');
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.success && json?.data?.state) {
      return normalizeState(json.data.state);
    }
  } catch {
    // Ignore if server not reachable
  }
  return null;
}

/**
 * Load initial state synchronously from localStorage
 */
export function loadSavedState(): AppState {
  if (typeof window === 'undefined') return INITIAL_STATE;
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      return normalizeState(JSON.parse(local));
    }
  } catch (err) {
    console.error('Error loading state from localStorage:', err);
  }
  return INITIAL_STATE;
}

/**
 * Save current state to PC Hard Disk JSON file (Unlimited) + IndexedDB + localStorage
 */
export function persistState(state: AppState) {
  if (typeof window === 'undefined') return;

  // 1. Primary Unlimited Storage: PC Hard Disk (data/portfolio-db.json)
  saveToLocalJsonFile(state);

  // 2. Secondary Browser Storage: IndexedDB (500MB+)
  saveToIDB(state);

  // 3. Fast Cache: localStorage (gracefully skips if 5MB limit is exceeded by large PDFs)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Expected if receipts exceed 5MB; full state is safely stored in data/portfolio-db.json & IndexedDB
  }
}

/**
 * Export 1-Click JSON backup file (includes all receipts!)
 */
export function exportBackup(state: AppState) {
  const dateStr = new Date().toISOString().split('T')[0];
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `cse_portfolio_ledger_backup_${dateStr}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

/**
 * Parse and validate JSON backup file
 */
export async function parseBackupFile(file: File): Promise<AppState> {
  const text = await file.text();
  const json = JSON.parse(text);

  if (typeof json !== 'object' || json === null) {
    throw new Error('Invalid JSON backup format.');
  }

  return normalizeState(json);
}

/**
 * Reset all data to genuine 0.00 across Browser & PC JSON file
 */
export function clearAllData(): AppState {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
    saveToIDB(INITIAL_STATE);
    fetch('/api/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: INITIAL_STATE, dividendBook: [] }),
    }).catch(() => {});
  }
  return { ...INITIAL_STATE };
}