import React, { useState, useEffect } from 'react';
import { CSENewsItem, Holding, Trade } from '../types';
import {
  Plus,
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
  Radar,
  LineChart,
  AlertTriangle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

interface CSENewsTabProps {
  holdings: Holding[];
  trades?: Trade[];
  newsItems: CSENewsItem[];
  lastSync: string | null;
  isSyncing: boolean;
  syncError: string | null;
  onSyncNews: () => void;
  onAddDividendItem?: (item: Omit<CSENewsItem, 'id'>) => void;
  onDeleteDividendItem?: (id: string) => void;
}

export interface DividendBookEntry {
  key: string;
  symbol: string;
  companyName: string;
  year: number;
  monthIndex: number;
  monthName: string;
  xdDate: string;
  paymentDate: string | null;
  dividendAmount: number | null;
  recordedPrice: number | null;
}

interface TechnicalSnapshot {
  rsi14: number | null;
  sma50: number | null;
}

const ROUND_TRIP_FEE_RATE = 0.0224; // 1.12% Buy + 1.12% Sell = 2.24%
const BOOK_STORAGE_KEY = 'cse_dividend_seasonality_book_v1';
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function isValidDividendItem(item: CSENewsItem): boolean {
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


function hasXdPassed(xdDateStr?: string | null): boolean {
  if (!xdDateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const xd = new Date(`${xdDateStr.slice(0, 10)}T00:00:00`);
  return !isNaN(xd.getTime()) && today.getTime() > xd.getTime();
}


/**
 * Calculate exact eligible shares held BEFORE the Ex-Dividend (XD) Date.
 * Under CSE rules, shares bought ON or AFTER the XD Date do NOT receive the dividend.
 */
function computeEligibleSharesBeforeXd(
  symbol: string,
  currentHolding: Holding | undefined,
  trades: Trade[],
  xdDateStr?: string | null
): { eligibleQty: number; boughtAfterXdQty: number } {
  const currentQty = currentHolding?.quantity ?? 0;
  if (currentQty <= 0 || !xdDateStr) {
    return { eligibleQty: currentQty, boughtAfterXdQty: 0 };
  }

  const cleanTarget = symbol.toUpperCase().split('.')[0];
  const matchingTrades = trades.filter(
    (t) => t.symbol.toUpperCase().split('.')[0] === cleanTarget
  );

  if (matchingTrades.length === 0) {
    return { eligibleQty: currentQty, boughtAfterXdQty: 0 };
  }

  let postXdNetBought = 0;
  for (const t of matchingTrades) {
    if (!t.date) continue;
    const tradeDay = t.date.slice(0, 10);
    if (tradeDay >= xdDateStr.slice(0, 10)) {
      if (t.type === 'BUY') postXdNetBought += t.quantity;
      if (t.type === 'SELL') postXdNetBought -= t.quantity;
    }
  }

  const boughtAfterXdQty = Math.max(0, postXdNetBought);
  const eligibleQty = Math.max(0, currentQty - boughtAfterXdQty);

  return { eligibleQty, boughtAfterXdQty };
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

function getDividendEntryVerdict(
  price: number | null,
  dividendAmount: number | null,
  rsi14: number | null,
  sma50: number | null
) {
  const divYieldPct =
    typeof price === 'number' && price > 0 && typeof dividendAmount === 'number' && dividendAmount > 0
      ? (dividendAmount / price) * 100
      : null;

  if (divYieldPct !== null && divYieldPct < 2.24) {
    return {
      type: 'FEE_LOSS',
      label: `FEE LOSS • YIELD ${divYieldPct.toFixed(2)}% (<2.24% FEES)`,
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-300 font-bold',
      hint: `Dividend yield (${divYieldPct.toFixed(2)}%) is less than 2.24% buy+sell CSE fees — buying just for dividend causes net loss!`,
    };
  }

  if (typeof rsi14 !== 'number') return null;

  if (rsi14 >= 70) {
    return {
      type: 'TRAP',
      label: 'OVERBOUGHT • DIVIDEND TRAP',
      badgeClass: 'bg-rose-50 text-rose-800 border-rose-300 font-bold',
      hint: `RSI ${rsi14.toFixed(1)} (>=70) — High risk of post-XD drop`,
    };
  }

  if (rsi14 <= 30) {
    return {
      type: 'OVERSOLD',
      label: 'OVERSOLD • VALUE BUY',
      badgeClass: 'bg-sky-50 text-sky-900 border-sky-300 font-bold',
      hint: `RSI ${rsi14.toFixed(1)} (<=30) — Discounted entry before XD`,
    };
  }

  if (rsi14 < 60) {
    const aboveSma = typeof price === 'number' && typeof sma50 === 'number' && price >= sma50;
    const netYieldNote = divYieldPct !== null ? ` • Net +${(divYieldPct - 2.24).toFixed(1)}%` : '';
    return {
      type: 'GOOD',
      label: aboveSma ? `WORTH BUYING • UPTREND${netYieldNote}` : `GOOD ENTRY • RSI OK${netYieldNote}`,
      badgeClass: 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold',
      hint: `RSI ${rsi14.toFixed(1)} (<60)${typeof sma50 === 'number' ? ` • SMA50 Rs.${sma50.toFixed(1)}` : ''}`,
    };
  }

  return {
    type: 'NEUTRAL',
    label: 'MODERATE • WATCH PRICE',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 font-semibold',
    hint: `RSI ${rsi14.toFixed(1)} (60–70) — Approaching overbought`,
  };
}

export const CSENewsTab: React.FC<CSENewsTabProps> = ({
  holdings,
  trades = [],
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

  const [dividendBook, setDividendBook] = useState<DividendBookEntry[]>(() => loadDividendBook());

  const [symbol, setSymbol] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [dividendAmount, setDividendAmount] = useState('');
  const [xdDate, setXdDate] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [sharePrice, setSharePrice] = useState('');
  const [notes, setNotes] = useState('');

  const [simQuantities, setSimQuantities] = useState<Record<string, string>>({});
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [liveTechnicals, setLiveTechnicals] = useState<Record<string, TechnicalSnapshot>>({});
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);

  const ownedMap = new Map<string, Holding>();
  holdings.forEach((h) => {
    ownedMap.set(h.symbol.toUpperCase(), h);
    ownedMap.set(h.symbol.toUpperCase().split('.')[0], h);
  });

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

  const activeRadarItems = newsItems.filter((item) => {
    if (!isValidDividendItem(item) || isPaymentCompleted(item)) return false;

    const matched =
      ownedMap.get(item.symbol.toUpperCase()) ||
      ownedMap.get(item.symbol.toUpperCase().split('.')[0]);
    const isOwned = Boolean(matched) || Boolean(item.inPortfolio);

    // Not owned -> hide immediately once XD Date passes
    if (!isOwned && hasXdPassed(item.xdDate)) {
      return false;
    }

    // Owned -> keep showing until Payment Date passes (already handled by isPaymentCompleted above)
    return true;
  });

  const syncLivePricesAndTechnicals = async () => {
    if (activeRadarItems.length === 0) return;
    setIsFetchingPrices(true);

    const uniqueSymbols = Array.from(
      new Set(activeRadarItems.map((item) => item.symbol.trim().toUpperCase()))
    );

    const updatedPrices: Record<string, number> = {};
    const updatedTechs: Record<string, TechnicalSnapshot> = {};

    await Promise.allSettled(
      uniqueSymbols.map(async (sym) => {
        try {
          const [quoteRes, techRes] = await Promise.all([
            fetch('/api/cse/quote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbol: sym }),
            }),
            fetch('/api/cse/technicals', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ symbol: sym }),
            }),
          ]);

          if (quoteRes.ok) {
            const qData = await quoteRes.json();
            if (qData?.verified && typeof qData.price === 'number' && qData.price > 0) {
              updatedPrices[sym] = qData.price;
            }
          }

          if (techRes.ok) {
            const tData = await techRes.json();
            if (tData?.success) {
              if (!updatedPrices[sym] && typeof tData.price === 'number' && tData.price > 0) {
                updatedPrices[sym] = tData.price;
              }
              updatedTechs[sym] = {
                rsi14: typeof tData.rsi14 === 'number' ? tData.rsi14 : null,
                sma50: typeof tData.sma50 === 'number' ? tData.sma50 : null,
              };
            }
          }
        } catch {
          // Ignore offline errors
        }
      })
    );

    if (Object.keys(updatedPrices).length > 0) {
      setLivePrices((prev) => ({ ...prev, ...updatedPrices }));
    }
    if (Object.keys(updatedTechs).length > 0) {
      setLiveTechnicals((prev) => ({ ...prev, ...updatedTechs }));
    }
    setIsFetchingPrices(false);
  };

  useEffect(() => {
    syncLivePricesAndTechnicals();
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

  const enrichedDividends = activeRadarItems
    .map((item) => {
      const matched = ownedMap.get(item.symbol.toUpperCase()) || ownedMap.get(item.symbol.toUpperCase().split('.')[0]);
      const isOwned = Boolean(matched) || Boolean(item.inPortfolio);
      const symUpper = item.symbol.toUpperCase();
      const livePrice = livePrices[symUpper];
      const liveTech = liveTechnicals[symUpper];

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

      const resolvedRsi14 =
        typeof liveTech?.rsi14 === 'number'
          ? liveTech.rsi14
          : typeof matched?.rsi14 === 'number'
          ? matched.rsi14
          : null;

      const resolvedSma50 =
        typeof liveTech?.sma50 === 'number'
          ? liveTech.sma50
          : typeof matched?.sma50 === 'number'
          ? matched.sma50
          : null;

      const ownedQty = matched?.quantity ?? 0;
      const { eligibleQty, boughtAfterXdQty } = computeEligibleSharesBeforeXd(
        item.symbol,
        matched,
        trades,
        item.xdDate
      );

      const expectedTotalPayout =
        isOwned && eligibleQty > 0 && item.dividendAmount
          ? eligibleQty * item.dividendAmount
          : null;

      return {
        ...item,
        isOwned,
        resolvedPrice,
        priceSource,
        resolvedRsi14,
        resolvedSma50,
        ownedQty,
        eligibleQty,
        boughtAfterXdQty,
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
                CSE Dividend Radar &amp; Seasonality Book
              </h2>
              <span className="text-2xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                ● Live RSI, SMA-50 &amp; Net Fee Check (2.24%)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Counts dividends ONLY for shares held before XD Date, and warns if yield is below 2.24% Buy+Sell CSE fees.
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
              onClick={syncLivePricesAndTechnicals}
              disabled={isFetchingPrices}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingPrices ? 'animate-spin' : ''}`} />
              <span>{isFetchingPrices ? 'Syncing RSI & Prices...' : 'Sync Prices & RSI'}</span>
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
        /* TAB 1: ORIGINAL CLEAN CARD RADAR WITH RIGHT-ALIGNED METRIC BOXES */
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

                const entryVerdict = getDividendEntryVerdict(
                  item.resolvedPrice,
                  item.dividendAmount ?? null,
                  item.resolvedRsi14,
                  item.resolvedSma50
                );

                const tradingViewUrl = `https://www.tradingview.com/chart/?symbol=CSELK%3A${encodeURIComponent(item.symbol)}`;

                const rawSimQty = simQuantities[item.id] ?? '1000';
                const simQtyNum = Math.max(0, parseFloat(rawSimQty) || 0);
                const grossInvest =
                  item.resolvedPrice && simQtyNum > 0 ? simQtyNum * item.resolvedPrice : null;
                const roundTripFees =
                  grossInvest !== null ? grossInvest * ROUND_TRIP_FEE_RATE : null;
                const simulatedDividend =
                  item.dividendAmount && simQtyNum > 0 ? simQtyNum * item.dividendAmount : null;
                const netAfterFees =
                  simulatedDividend !== null && roundTripFees !== null
                    ? simulatedDividend - roundTripFees
                    : null;

                return (
                  <div
                    key={item.id}
                    className="p-4 sm:p-5 hover:bg-slate-50/70 transition-colors flex flex-col xl:flex-row xl:items-center justify-between gap-4 text-xs"
                  >
                    {/* Left Side: Symbol + Badges + Clean Calculator Row */}
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{item.symbol}</span>

                        <a
                          href={tradingViewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open ${item.symbol} Live Chart & RSI on TradingView`}
                          className="inline-flex items-center justify-center p-1 rounded-md text-sky-600 bg-sky-50 hover:bg-sky-100 hover:text-sky-800 border border-sky-200/80 transition-colors"
                        >
                          <LineChart className="w-3.5 h-3.5" />
                        </a>

                        <span className="text-slate-400 text-2xs">{item.companyName}</span>

                        {item.isOwned ? (
                          item.eligibleQty > 0 ? (
                            <span className="inline-flex items-center space-x-1 text-3xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>
                                Eligible ({item.eligibleQty.toLocaleString()} sh)
                                {item.boughtAfterXdQty > 0 ? ` • ${item.boughtAfterXdQty} after XD` : ''}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 text-3xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Bought On/After XD (Not Eligible)</span>
                            </span>
                          )
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

                        {entryVerdict && (
                          <span
                            title={entryVerdict.hint}
                            className={`inline-flex items-center space-x-1 text-3xs px-2.5 py-0.5 rounded-full border ${entryVerdict.badgeClass}`}
                          >
                            {(entryVerdict.type === 'TRAP' || entryVerdict.type === 'FEE_LOSS') && (
                              <AlertTriangle className="w-3 h-3 text-rose-600" />
                            )}
                            {entryVerdict.type === 'GOOD' && <TrendingUp className="w-3 h-3 text-emerald-700" />}
                            {entryVerdict.type === 'OVERSOLD' && <TrendingDown className="w-3 h-3 text-sky-700" />}
                            <span>{entryVerdict.label}</span>
                          </span>
                        )}
                      </div>

                      {/* Subtle Simulator Bar */}
                      {item.dividendAmount && item.dividendAmount > 0 && (
                        <div className="inline-flex flex-wrap items-center gap-2 text-2xs bg-slate-50/90 px-3 py-1.5 rounded-xl border border-slate-200/80">
                          <span className="inline-flex items-center space-x-1 text-slate-500 font-medium">
                            <Calculator className="w-3.5 h-3.5 text-slate-400" />
                            <span>If I buy</span>
                          </span>
                          <input
                            type="number"
                            min="1"
                            step="100"
                            value={rawSimQty}
                            onChange={(e) =>
                              setSimQuantities((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            className="w-16 px-2 py-0.5 text-2xs font-mono font-bold bg-white border border-slate-300 rounded-md focus:outline-hidden focus:ring-1 focus:ring-slate-900 tabular-nums text-center"
                          />
                          <span className="text-slate-500">shares</span>

                          {grossInvest !== null && (
                            <span className="text-slate-500 font-mono">
                              (Capital: <strong className="text-slate-800">LKR {grossInvest.toLocaleString('en-LK', { maximumFractionDigits: 0 })}</strong>)
                            </span>
                          )}

                          {simulatedDividend !== null && (
                            <span className="font-bold text-emerald-800 font-mono tabular-nums">
                              • Div: LKR {simulatedDividend.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}

                          {roundTripFees !== null && (
                            <span className="text-slate-500 font-mono">
                              • Buy+Sell Fees (2.24%): LKR {roundTripFees.toLocaleString('en-LK', { maximumFractionDigits: 0 })}
                            </span>
                          )}

                          {netAfterFees !== null && (
                            <span
                              className={`font-bold px-2 py-0.5 rounded-md font-mono tabular-nums ${
                                netAfterFees >= 0
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-rose-50 text-rose-800'
                              }`}
                            >
                              {netAfterFees >= 0
                                ? `Net Profit: +LKR ${netAfterFees.toLocaleString('en-LK', { maximumFractionDigits: 0 })}`
                                : `Fee Loss: -LKR ${Math.abs(netAfterFees).toLocaleString('en-LK', { maximumFractionDigits: 0 })}`}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right Side: Clean Structured Metric Boxes */}
                    <div className="flex flex-wrap items-center justify-start xl:justify-end gap-2.5 shrink-0">
                      {item.expectedTotalPayout !== null && (
                        <div className="bg-teal-50 border border-teal-200 rounded-xl px-3.5 py-2 text-right">
                          <span className="text-3xs font-semibold text-teal-700 uppercase block">
                            Eligible Payout
                          </span>
                          <span className="text-xs font-bold text-teal-900 tabular-nums">
                            LKR {item.expectedTotalPayout.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                      {/* Box 1: 14D RSI / SMA-50 */}
                      <div className="bg-slate-50 border border-slate-200/90 rounded-xl px-3.5 py-2 text-right min-w-[105px]">
                        <span className="text-3xs font-medium text-slate-400 block">
                          14D RSI / SMA-50
                        </span>
                        <span
                          className={`text-xs font-bold font-mono tabular-nums block ${
                            typeof item.resolvedRsi14 === 'number' && item.resolvedRsi14 >= 70
                              ? 'text-rose-700'
                              : typeof item.resolvedRsi14 === 'number' && item.resolvedRsi14 <= 30
                              ? 'text-sky-700'
                              : 'text-slate-800'
                          }`}
                        >
                          {typeof item.resolvedRsi14 === 'number' ? `RSI ${item.resolvedRsi14.toFixed(1)}` : 'RSI —'}
                        </span>
                        <span className="text-3xs text-slate-400 font-mono block">
                          {typeof item.resolvedSma50 === 'number' ? `SMA50: Rs.${item.resolvedSma50.toFixed(1)}` : 'SMA50: —'}
                        </span>
                      </div>

                      {/* Box 2: Share Price */}
                      <div className="bg-slate-50 border border-slate-200/90 rounded-xl px-3.5 py-2 text-right min-w-[95px]">
                        <span className="text-3xs font-medium text-slate-400 block">
                          Share Price
                        </span>
                        <span className="text-xs font-bold text-slate-900 font-mono tabular-nums block">
                          {item.resolvedPrice !== null ? `Rs. ${item.resolvedPrice.toFixed(2)}` : '—'}
                        </span>
                        {item.priceSource === 'CSE_LIVE' && (
                          <span className="inline-block text-3xs font-semibold text-emerald-700 bg-emerald-50 px-1.5 rounded border border-emerald-200 mt-0.5">
                            ● CSE Live
                          </span>
                        )}
                      </div>

                      {/* Box 3: Dividend (Yield) */}
                      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl px-3.5 py-2 text-right min-w-[115px]">
                        <span className="text-3xs font-medium text-emerald-700 block">
                          Dividend (Yield)
                        </span>
                        <span className="text-xs font-bold text-emerald-900 font-mono tabular-nums block">
                          {item.dividendAmount !== null && item.dividendAmount !== undefined
                            ? `Rs. ${item.dividendAmount.toFixed(2)}${divYield !== null ? ` (${divYield.toFixed(1)}%)` : ''}`
                            : '—'}
                        </span>
                      </div>

                      {/* Box 4: XD Date */}
                      <div className="bg-slate-50 border border-slate-200/90 rounded-xl px-3.5 py-2 text-center min-w-[100px]">
                        <span className="text-3xs font-medium text-slate-500 inline-flex items-center space-x-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>XD Date</span>
                        </span>
                        <span className="text-xs font-bold text-slate-900 font-mono block mt-0.5">
                          {item.xdDate || '—'}
                        </span>
                      </div>

                      {/* Box 5: Payment Date */}
                      <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl px-3.5 py-2 text-center min-w-[105px]">
                        <span className="text-3xs font-medium text-indigo-700 inline-flex items-center space-x-1">
                          <Banknote className="w-3 h-3 text-indigo-500" />
                          <span>Payment Date</span>
                        </span>
                        <span className="text-xs font-bold text-indigo-950 font-mono block mt-0.5">
                          {item.paymentDate || '—'}
                        </span>
                      </div>

                      {onDeleteDividendItem && (
                        <button
                          onClick={() => onDeleteDividendItem(item.id)}
                          title="Delete Entry"
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
        /* TAB 2: PERMANENT MONTH-BY-MONTH DIVIDEND SEASONALITY BOOK */
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 bg-indigo-50/40">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Month-by-Month CSE Dividend Seasonality Archive (2026+)
                </h3>
                <p className="text-2xs text-slate-500 mt-0.5">
                  Permanent reference book showing which months companies historically declare dividends — plan your entries 2–3 weeks before XD!
                </p>
              </div>
              <span className="text-2xs font-semibold text-indigo-800 bg-indigo-100 px-2.5 py-1 rounded-lg">
                {filteredBook.length} Recorded Payouts
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedMonth('ALL')}
                className={`px-2.5 py-1 text-2xs font-semibold rounded-lg transition-colors ${
                  selectedMonth === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                All Months ({dividendBook.length})
              </button>
              {MONTHS.map((mName, idx) => {
                const count = dividendBook.filter((e) => e.monthIndex === idx).length;
                return (
                  <button
                    key={mName}
                    type="button"
                    onClick={() => setSelectedMonth(idx)}
                    className={`px-2.5 py-1 text-2xs font-semibold rounded-lg transition-colors ${
                      selectedMonth === idx
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : count > 0
                        ? 'bg-white text-slate-800 hover:bg-indigo-50 border border-indigo-200'
                        : 'bg-slate-50 text-slate-400 border border-slate-200/70'
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
              No dividend records stored for this month yet. Click "Sync All CSE Dividends" to build your 2026 seasonality archive!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-semibold uppercase tracking-wider text-2xs">
                    <th className="py-3 px-4">Month / Year</th>
                    <th className="py-3 px-4">Symbol &amp; Company</th>
                    <th className="py-3 px-4 text-right">Dividend / Share</th>
                    <th className="py-3 px-4 text-right">Price at XD</th>
                    <th className="py-3 px-4 text-right">Est. Yield</th>
                    <th className="py-3 px-4">XD Date</th>
                    <th className="py-3 px-4">Payment Date</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBook.map((entry) => {
                    const estYield =
                      entry.dividendAmount && entry.recordedPrice && entry.recordedPrice > 0
                        ? (entry.dividendAmount / entry.recordedPrice) * 100
                        : null;

                    return (
                      <tr key={entry.key} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-2xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                            {entry.monthName} {entry.year}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{entry.symbol}</div>
                          <div className="text-2xs text-slate-400 truncate max-w-[200px]">
                            {entry.companyName}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-800 tabular-nums whitespace-nowrap">
                          {entry.dividendAmount !== null ? `Rs. ${entry.dividendAmount.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums whitespace-nowrap">
                          {entry.recordedPrice !== null ? `Rs. ${entry.recordedPrice.toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-sky-700 tabular-nums whitespace-nowrap">
                          {estYield !== null ? `${estYield.toFixed(2)}%` : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                          {entry.xdDate}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                          {entry.paymentDate || '—'}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleDeleteBookEntry(entry.key)}
                            title="Remove from Seasonality Book"
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