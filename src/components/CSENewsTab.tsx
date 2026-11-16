import React, { useState, useEffect } from 'react';
import { CSENewsItem, Holding } from '../types';
import {
  Plus,
  Coins,
  Search,
  Sparkles,
  CheckCircle2,
  Trash2,
  Calendar,
  Clock,
  Banknote,
  Calculator,
  RefreshCw,
  BookOpen,
  Radar
} from 'lucide-react';

interface CSENewsTabProps {
  holdings: Holding[];
  newsItems: CSENewsItem[];
  lastSync: string | null;
  isSyncing: boolean;
  syncError: string | null;
  onSyncNews: () => void;
  onAddDividendItem?: (item: Omit<CSENewsItem, 'id'>) => void;
  onDeleteDividendItem?: (id: string) => void;
}

export interface DividendBookEntry {
  key: string; // e.g. "ACL.N0000_2026-11-25"
  symbol: string;
  companyName: string;
  year: number;
  monthIndex: number; // 0 = Jan ... 11 = Dec
  monthName: string;
  xdDate: string;
  paymentDate: string | null;
  dividendAmount: number | null;
  recordedPrice: number | null;
}

const BOOK_STORAGE_KEY = 'cse_dividend_seasonality_book_v1';
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function isValidDividendItem(item: CSENewsItem): boolean {
  // Strictly ensure it is an actual Dividend / XD / Scrip announcement (ignore general corporate notices)
  const isDividendCategory =
    item.category === 'DIVIDEND' ||
    Boolean(item.dividendAmount && item.dividendAmount > 0) ||
    Boolean(item.xdDate);

  if (!isDividendCategory) return false;

  const targetDate = item.xdDate || item.date;
  if (!targetDate) return false;
  const year = parseInt(String(targetDate).slice(0, 4), 10);
  return !isNaN(year) && year >= 2026;
}

/**
 * Check if Payment Date has passed (or if Payment Date is TBA, check if XD Date + 14 days has passed)
 */
function isPaymentCompleted(item: CSENewsItem): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (item.paymentDate) {
    const pay = new Date(item.paymentDate);
    pay.setHours(0, 0, 0, 0);
    return !isNaN(pay.getTime()) && today.getTime() > pay.getTime();
  }

  if (item.xdDate) {
    const xd = new Date(item.xdDate);
    xd.setHours(0, 0, 0, 0);
    if (!isNaN(xd.getTime())) {
      const fallbackExpiry = new Date(xd);
      fallbackExpiry.setDate(fallbackExpiry.getDate() + 14);
      return today.getTime() > fallbackExpiry.getTime();
    }
  }

  return false;
}

function loadDividendBook(): DividendBookEntry[] {
  try {
    const raw = localStorage.getItem(BOOK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDividendBook(entries: DividendBookEntry[]) {
  try {
    localStorage.setItem(BOOK_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage quota errors
  }
}

export const CSENewsTab: React.FC<CSENewsTabProps> = ({
  holdings,
  newsItems,
  lastSync,
  isSyncing,
  syncError,
  onSyncNews,
  onAddDividendItem,
  onDeleteDividendItem,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'RADAR' | 'BOOK'>('RADAR');
  const [ownershipFilter, setOwnershipFilter] = useState<'ALL' | 'OWNED' | 'NEW_OPPORTUNITY'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Permanent Seasonality Book State
  const [dividendBook, setDividendBook] = useState<DividendBookEntry[]>(() => loadDividendBook());

  // Quick Add Form State
  const [symbol, setSymbol] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [dividendAmount, setDividendAmount] = useState('');
  const [xdDate, setXdDate] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [sharePrice, setSharePrice] = useState('');
  const [notes, setNotes] = useState('');

  // What-If Simulator quantities
  const [simQuantities, setSimQuantities] = useState<Record<string, string>>({});
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);

  // Map owned holdings for instant lookup
  const ownedMap = new Map<string, Holding>();
  holdings.forEach((h) => {
    ownedMap.set(h.symbol.toUpperCase(), h);
    ownedMap.set(h.symbol.toUpperCase().split('.')[0], h);
  });

  // 1. Archive every 2026+ item into the Permanent Seasonality Book BEFORE removing completed ones
  // 2. Auto-purge pre-2026 clutter AND items whose Payment Date has already passed
  useEffect(() => {
    const valid2026 = newsItems.filter(isValidDividendItem);

    if (valid2026.length > 0) {
      setDividendBook((prevBook) => {
        const bookMap = new Map<string, DividendBookEntry>();
        prevBook.forEach((entry) => bookMap.set(entry.key, entry));

        let changed = false;
        for (const item of valid2026) {
          const refDateStr = item.xdDate || item.date;
          if (!refDateStr) continue;
          const d = new Date(`${refDateStr}T00:00:00`);
          if (isNaN(d.getTime())) continue;

          const year = d.getFullYear();
          if (year < 2026) continue;

          const monthIndex = d.getMonth();
          const symUpper = item.symbol.trim().toUpperCase();
          const key = `${symUpper}_${refDateStr}`;
          const matched = ownedMap.get(symUpper) || ownedMap.get(symUpper.split('.')[0]);

          const existing = bookMap.get(key);
          const updatedEntry: DividendBookEntry = {
            key,
            symbol: symUpper,
            companyName: item.companyName || existing?.companyName || matched?.companyName || symUpper,
            year,
            monthIndex,
            monthName: MONTHS[monthIndex],
            xdDate: refDateStr,
            paymentDate: item.paymentDate || existing?.paymentDate || null,
            dividendAmount: item.dividendAmount ?? existing?.dividendAmount ?? null,
            recordedPrice: item.currentPrice ?? matched?.marketPrice ?? existing?.recordedPrice ?? null,
          };

          if (
            !existing ||
            existing.dividendAmount !== updatedEntry.dividendAmount ||
            existing.paymentDate !== updatedEntry.paymentDate
          ) {
            bookMap.set(key, updatedEntry);
            changed = true;
          }
        }

        if (!changed) return prevBook;
        const nextList = Array.from(bookMap.values()).sort((a, b) =>
          b.xdDate.localeCompare(a.xdDate)
        );
        saveDividendBook(nextList);
        return nextList;
      });
    }

    if (onDeleteDividendItem) {
      const itemsToRemove = newsItems.filter(
        (item) => !isValidDividendItem(item) || isPaymentCompleted(item)
      );
      if (itemsToRemove.length > 0) {
        itemsToRemove.forEach((stale) => onDeleteDividendItem(stale.id));
      }
    }
  }, [newsItems, onDeleteDividendItem]);

  // Active Radar items: 2026+ AND Payment Date not yet passed
  const activeRadarItems = newsItems.filter(
    (item) => isValidDividendItem(item) && !isPaymentCompleted(item)
  );

  // Fetch live share prices for active radar items
  const syncLiveSharePrices = async () => {
    if (activeRadarItems.length === 0) return;
    setIsFetchingPrices(true);

    const uniqueSymbols = Array.from(
      new Set(activeRadarItems.map((item) => item.symbol.trim().toUpperCase()))
    );

    const updatedPrices: Record<string, number> = {};

    await Promise.allSettled(
      uniqueSymbols.map(async (sym) => {
        try {
          const res = await fetch('/api/cse/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: sym }),
          });
          const data = await res.json();
          if (data?.verified && typeof data.price === 'number' && data.price > 0) {
            updatedPrices[sym] = data.price;
          }
        } catch {
          // Ignore offline errors
        }
      })
    );

    if (Object.keys(updatedPrices).length > 0) {
      setLivePrices((prev) => ({ ...prev, ...updatedPrices }));
    }
    setIsFetchingPrices(false);
  };

  useEffect(() => {
    syncLiveSharePrices();
  }, [activeRadarItems.length]);

  const handleSymbolChange = (val: string) => {
    const upper = val.toUpperCase();
    setSymbol(upper);
    const matched = ownedMap.get(upper) || ownedMap.get(upper.split('.')[0]);
    if (matched) {
      if (!companyName) setCompanyName(matched.companyName);
      if (!sharePrice && matched.marketPrice) setSharePrice(matched.marketPrice.toString());
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim() || !xdDate) return;

    const cleanSym = symbol.trim().includes('.')
      ? symbol.trim().toUpperCase()
      : `${symbol.trim().toUpperCase()}.N0000`;

    const matchedHolding = ownedMap.get(cleanSym) || ownedMap.get(cleanSym.split('.')[0]);
    const divNum = dividendAmount ? parseFloat(dividendAmount) : null;
    const priceNum = sharePrice
      ? parseFloat(sharePrice)
      : matchedHolding?.marketPrice ?? null;

    if (onAddDividendItem) {
      onAddDividendItem({
        symbol: cleanSym,
        companyName: companyName.trim() || matchedHolding?.companyName || cleanSym,
        headline: divNum
          ? `Cash Dividend: Rs. ${divNum.toFixed(2)} per share`
          : 'Dividend & XD Date Scheduled',
        date: new Date().toISOString().slice(0, 10),
        category: 'DIVIDEND',
        dividendAmount: divNum,
        xdDate,
        paymentDate: paymentDate || null,
        currentPrice: priceNum,
        inPortfolio: Boolean(matchedHolding),
        details: notes.trim() || (paymentDate ? `XD: ${xdDate} • Payment: ${paymentDate}` : `XD Date: ${xdDate}`),
      });
    }

    setSymbol('');
    setCompanyName('');
    setDividendAmount('');
    setXdDate('');
    setPaymentDate('');
    setSharePrice('');
    setNotes('');
  };

  const handleDeleteBookEntry = (key: string) => {
    setDividendBook((prev) => {
      const next = prev.filter((item) => item.key !== key);
      saveDividendBook(next);
      return next;
    });
  };

  const getXdBadge = (xdStr?: string | null) => {
    if (!xdStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const xd = new Date(xdStr);
    xd.setHours(0, 0, 0, 0);
    const diffDays = Math.round((xd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: `XD Passed (${Math.abs(diffDays)}d ago • Awaiting Pay)`,
        cls: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      };
    }
    if (diffDays === 0) {
      return {
        label: 'XD TODAY! (Last chance)',
        cls: 'bg-rose-50 text-rose-800 border-rose-300 font-bold animate-pulse',
      };
    }
    if (diffDays <= 5) {
      return {
        label: `XD in ${diffDays} Day${diffDays === 1 ? '' : 's'}!`,
        cls: 'bg-amber-50 text-amber-900 border-amber-300 font-bold',
      };
    }
    return {
      label: `In ${diffDays} Days`,
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  };

  // Enrich active radar items
  const enrichedDividends = activeRadarItems
    .map((item) => {
      const matched = ownedMap.get(item.symbol.toUpperCase()) || ownedMap.get(item.symbol.toUpperCase().split('.')[0]);
      const isOwned = Boolean(matched) || Boolean(item.inPortfolio);
      const symUpper = item.symbol.toUpperCase();
      const livePrice = livePrices[symUpper];

      let resolvedPrice: number | null = null;
      let priceSource: 'CSE_LIVE' | 'PORTFOLIO' | 'MANUAL' | null = null;

      if (typeof livePrice === 'number' && livePrice > 0) {
        resolvedPrice = livePrice;
        priceSource = 'CSE_LIVE';
      } else if (matched?.marketPrice !== null && matched?.marketPrice !== undefined) {
        resolvedPrice = matched.marketPrice;
        priceSource = 'PORTFOLIO';
      } else if (item.currentPrice !== null && item.currentPrice !== undefined) {
        resolvedPrice = item.currentPrice;
        priceSource = 'MANUAL';
      }
      const ownedQty = matched?.quantity ?? 0;
      const expectedTotalPayout =
        isOwned && ownedQty > 0 && item.dividendAmount
          ? ownedQty * item.dividendAmount
          : null;

      return {
        ...item,
        isOwned,
        resolvedPrice,
        priceSource,
        ownedQty,
        expectedTotalPayout,
      };
    })
    .sort((a, b) => (a.xdDate || '9999').localeCompare(b.xdDate || '9999'));

  const filteredList = enrichedDividends.filter((item) => {
    const matchesOwnership =
      ownershipFilter === 'ALL' ||
      (ownershipFilter === 'OWNED' && item.isOwned) ||
      (ownershipFilter === 'NEW_OPPORTUNITY' && !item.isOwned);
    const matchesSearch =
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.details.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesOwnership && matchesSearch;
  });

  // Filter Seasonality Book by Month & Search
  const filteredBook = dividendBook.filter((entry) => {
    const matchesMonth = selectedMonth === 'ALL' || entry.monthIndex === selectedMonth;
    const matchesSearch =
      entry.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.companyName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesMonth && matchesSearch;
  });

  const totalExpectedPortfolioDividend = enrichedDividends.reduce(
    (sum, item) => sum + (item.expectedTotalPayout || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Header + Quick Add Dividend Form */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                CSE Dividend Radar & Seasonality Book
              </h2>
              <span className="text-2xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                ● Auto-Archives on Payment
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Active announcements stay until Payment Date passes, then auto-save into your Seasonality Book by Month & Year.
              {lastSync && (
                <span className="ml-2 text-slate-400 font-mono">
                  • Synced: {new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onSyncNews}
              disabled={isSyncing}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Fetching All CSE...' : 'Sync All CSE Dividends'}</span>
            </button>

            <button
              type="button"
              onClick={syncLiveSharePrices}
              disabled={isFetchingPrices}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingPrices ? 'animate-spin' : ''}`} />
              <span>{isFetchingPrices ? 'Updating Prices...' : 'Sync Prices'}</span>
            </button>

            {totalExpectedPortfolioDividend > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-1.5 text-right">
                <span className="text-3xs uppercase font-semibold text-emerald-700 block">
                  Upcoming Portfolio Payout
                </span>
                <span className="text-sm font-bold text-emerald-900 tabular-nums">
                  LKR {totalExpectedPortfolioDividend.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        </div>

        {syncError && (
          <div className="mt-3 px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-2xs text-amber-900">
            {syncError}
          </div>
        )}

        {/* Fast 1-Row Input Form */}
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">
              Stock Symbol *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. COMB.N0000"
              value={symbol}
              onChange={(e) => handleSymbolChange(e.target.value)}
              list="portfolio-symbols"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 uppercase font-semibold"
            />
            <datalist id="portfolio-symbols">
              {holdings.map((h) => (
                <option key={h.id} value={h.symbol}>
                  {h.companyName}
                </option>
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">
              Dividend / Share (Rs.)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 4.50"
              value={dividendAmount}
              onChange={(e) => setDividendAmount(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 tabular-nums"
            />
          </div>

          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">
              XD Date *
            </label>
            <input
              type="date"
              required
              value={xdDate}
              onChange={(e) => setXdDate(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-mono"
            />
          </div>

          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">
              Payment Date
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-mono"
            />
          </div>

          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">
              Share Price (Rs.)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="Auto if owned"
              value={sharePrice}
              onChange={(e) => setSharePrice(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 tabular-nums"
            />
          </div>

          <div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add Dividend / XD</span>
            </button>
          </div>
        </form>
      </div>

      {/* Mode Switcher: Live Active Radar vs Permanent Seasonality Book */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveSubTab('RADAR')}
            className={`inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              activeSubTab === 'RADAR'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Radar className="w-3.5 h-3.5 text-emerald-600" />
            <span>Live Upcoming Radar ({enrichedDividends.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('BOOK')}
            className={`inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              activeSubTab === 'BOOK'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
            <span>Dividend Seasonality Book ({dividendBook.length})</span>
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 w-44 sm:w-56"
          />
        </div>
      </div>

      {activeSubTab === 'RADAR' ? (
        /* TAB 1: LIVE ACTIVE RADAR (Auto-clears once Payment Date passes) */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'ALL', label: `All Active (${enrichedDividends.length})` },
                { id: 'OWNED', label: 'In My Portfolio' },
                { id: 'NEW_OPPORTUNITY', label: 'Not In Portfolio (Watchlist)' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setOwnershipFilter(opt.id as any)}
                  className={`px-3 py-1 text-2xs font-semibold rounded-lg transition-colors ${
                    ownershipFilter === opt.id
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="text-3xs text-slate-400">
              Completed payouts automatically move to Seasonality Book
            </span>
          </div>

          {filteredList.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              No active upcoming Dividend / XD entries right now. Completed payouts are saved in your "Dividend Seasonality Book" tab!
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredList.map((item) => {
                const xdBadge = getXdBadge(item.xdDate);
                const divYield =
                  item.dividendAmount && item.resolvedPrice && item.resolvedPrice > 0
                    ? (item.dividendAmount / item.resolvedPrice) * 100
                    : null;

                const rawSimQty = simQuantities[item.id] ?? '100';
                const simQtyNum = Math.max(0, parseFloat(rawSimQty) || 0);
                const simulatedDividend =
                  !item.isOwned && item.dividendAmount && simQtyNum > 0
                    ? simQtyNum * item.dividendAmount
                    : null;
                const simulatedBuyCost =
                  !item.isOwned && item.resolvedPrice && simQtyNum > 0
                    ? simQtyNum * item.resolvedPrice * 1.0112
                    : null;

                return (
                  <div
                    key={item.id}
                    className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{item.symbol}</span>
                        <span className="text-slate-500 text-2xs">{item.companyName}</span>

                        {item.isOwned ? (
                          <span className="inline-flex items-center space-x-1 text-3xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>In Portfolio ({item.ownedQty.toLocaleString()} sh)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-3xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                            <Sparkles className="w-3 h-3" />
                            <span>Not In Portfolio</span>
                          </span>
                        )}

                        {xdBadge && (
                          <span className={`inline-flex items-center space-x-1 text-3xs px-2.5 py-0.5 rounded-full border ${xdBadge.cls}`}>
                            <Clock className="w-3 h-3" />
                            <span>{xdBadge.label}</span>
                          </span>
                        )}
                      </div>

                      {item.expectedTotalPayout !== null && (
                        <div className="text-2xs font-semibold text-emerald-800 flex items-center space-x-1.5">
                          <Coins className="w-3.5 h-3.5 text-emerald-600" />
                          <span>
                            Your Total Dividend Payout: LKR{' '}
                            {item.expectedTotalPayout.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                      {!item.isOwned && item.dividendAmount && (
                        <div className="inline-flex flex-wrap items-center gap-2 bg-amber-50/70 border border-amber-200/80 rounded-xl px-3 py-1.5 text-2xs">
                          <span className="inline-flex items-center space-x-1 font-semibold text-amber-900">
                            <Calculator className="w-3.5 h-3.5 text-amber-700" />
                            <span>If I buy</span>
                          </span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={rawSimQty}
                            onChange={(e) =>
                              setSimQuantities((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            className="w-20 px-2 py-0.5 text-xs font-bold text-slate-900 bg-white border border-amber-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-600 tabular-nums text-right"
                          />
                          <span className="text-amber-900 font-medium">shares →</span>
                          {simulatedDividend !== null && (
                            <span className="font-bold text-emerald-800 tabular-nums">
                              Dividend: LKR {simulatedDividend.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                          {simulatedBuyCost !== null && (
                            <span className="text-slate-500 font-mono text-3xs">
                              (Est. Cost w/ 1.12%: LKR {simulatedBuyCost.toLocaleString('en-LK', { maximumFractionDigits: 0 })})
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <div className="text-right bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 flex flex-col items-end">
                        <span className="text-3xs text-slate-400">Share Price</span>
                        <span className="font-bold text-slate-900 tabular-nums my-0.5">
                          {item.resolvedPrice !== null ? `Rs. ${item.resolvedPrice.toFixed(2)}` : '—'}
                        </span>
                        {item.priceSource === 'CSE_LIVE' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ● CSE Live
                          </span>
                        )}
                        {item.priceSource === 'PORTFOLIO' && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 border border-sky-200">
                            Portfolio
                          </span>
                        )}
                        {item.priceSource === 'MANUAL' && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                            Manual Entry
                          </span>
                        )}
                      </div>

                      {item.dividendAmount && (
                        <div className="text-right bg-emerald-50/70 px-3 py-1.5 rounded-xl border border-emerald-200">
                          <span className="text-3xs text-emerald-700 block">Dividend (Yield)</span>
                          <span className="font-bold text-emerald-900 tabular-nums">
                            Rs. {item.dividendAmount.toFixed(2)}
                            {divYield !== null && ` (${divYield.toFixed(1)}%)`}
                          </span>
                        </div>
                      )}

                      {item.xdDate && (
                        <div className="text-right bg-sky-50 px-3 py-1.5 rounded-xl border border-sky-200">
                          <span className="text-3xs text-sky-700 font-semibold flex items-center justify-end space-x-1">
                            <Calendar className="w-3 h-3" />
                            <span>XD Date</span>
                          </span>
                          <span className="font-bold text-sky-950 font-mono">{item.xdDate}</span>
                        </div>
                      )}

                      <div className="text-right bg-indigo-50/70 px-3 py-1.5 rounded-xl border border-indigo-200">
                        <span className="text-3xs text-indigo-700 font-semibold flex items-center justify-end space-x-1">
                          <Banknote className="w-3 h-3" />
                          <span>Payment Date</span>
                        </span>
                        <span className="font-bold text-indigo-950 font-mono">
                          {item.paymentDate || 'TBA'}
                        </span>
                      </div>

                      {onDeleteDividendItem && (
                        <button
                          onClick={() => onDeleteDividendItem(item.id)}
                          title="Remove from active radar"
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* TAB 2: BROKER-STYLE DIVIDEND SEASONALITY BOOK (Jan - Dec Logbook) */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/50 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Broker Dividend Seasonality Book (By XD Month & Year)
                </h3>
                <p className="text-2xs text-slate-500">
                  Click any month below to see which CSE stocks go XD in that month so you can accumulate them early next year.
                </p>
              </div>
              <span className="text-2xs font-semibold px-3 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200">
                {dividendBook.length} Recorded Payouts
              </span>
            </div>

            {/* 12-Month Selector Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedMonth('ALL')}
                className={`px-3 py-1 text-2xs font-semibold rounded-lg transition-colors ${
                  selectedMonth === 'ALL'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                All Months ({dividendBook.length})
              </button>
              {MONTHS.map((mName, idx) => {
                const count = dividendBook.filter((b) => b.monthIndex === idx).length;
                return (
                  <button
                    key={mName}
                    type="button"
                    onClick={() => setSelectedMonth(idx)}
                    className={`px-2.5 py-1 text-2xs font-semibold rounded-lg transition-colors ${
                      selectedMonth === idx
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : count > 0
                        ? 'bg-indigo-50/70 text-indigo-900 border border-indigo-200 hover:bg-indigo-100'
                        : 'bg-white text-slate-400 border border-slate-200 hover:text-slate-700'
                    }`}
                  >
                    {mName.slice(0, 3)} {count > 0 ? `(${count})` : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {filteredBook.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              No dividend entries recorded for this month yet. Every 2026+ dividend synced or added above is automatically logged here!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-500 font-semibold uppercase tracking-wider text-2xs">
                    <th className="py-3 px-4">XD Month</th>
                    <th className="py-3 px-4">Year</th>
                    <th className="py-3 px-4">Symbol / Company</th>
                    <th className="py-3 px-4 text-right">Dividend / Share</th>
                    <th className="py-3 px-4">Exact XD Date</th>
                    <th className="py-3 px-4">Payment Date</th>
                    <th className="py-3 px-4 text-right">Ref. Price</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBook.map((entry) => {
                    const isOwned = ownedMap.has(entry.symbol) || ownedMap.has(entry.symbol.split('.')[0]);
                    return (
                      <tr key={entry.key} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-2xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                            {entry.monthName}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                          {entry.year}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-slate-900">{entry.symbol}</span>
                            {isOwned && (
                              <span className="text-3xs px-1.5 py-0.2 rounded bg-teal-50 text-teal-800 border border-teal-200 font-semibold">
                                Owned
                              </span>
                            )}
                          </div>
                          <div className="text-2xs text-slate-400 truncate max-w-[180px]">
                            {entry.companyName}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-bold text-emerald-800 tabular-nums whitespace-nowrap">
                          {entry.dividendAmount !== null
                            ? `Rs. ${entry.dividendAmount.toFixed(2)}`
                            : 'Declared'}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                          {entry.xdDate}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                          {entry.paymentDate || 'TBA'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-600 tabular-nums whitespace-nowrap">
                          {entry.recordedPrice !== null ? `Rs. ${entry.recordedPrice.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteBookEntry(entry.key)}
                            title="Delete from Seasonality Book"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};