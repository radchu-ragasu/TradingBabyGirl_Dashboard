import React, { useState, useEffect } from 'react';
import { WatchlistItem } from '../types';
import {
  Plus,
  RefreshCw,
  Trash2,
  LineChart,
  TrendingDown,
  AlertTriangle,
  Clock,
  Eye,
  Search,
  Sparkles,
  Check,
  Target
} from 'lucide-react';
import { fetchLiveCsePrice } from '../services/csePriceService';

interface WatchlistTabProps {
  ownedSymbols: string[];
}

const WATCHLIST_STORAGE_KEY = 'cse_trading_watchlist_v1';
const NEAR_TARGET_BUFFER_PCT = 0.03; // 3% buffer zone near Target Price

function loadWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWatchlist(items: WatchlistItem[]) {
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors
  }
}

function computeAiSuggestedBuyPrice(item: WatchlistItem): {
  suggestedPrice: number | null;
  discountPct: number | null;
  rationale: string;
} {
  const price = typeof item.marketPrice === 'number' && item.marketPrice > 0 ? item.marketPrice : null;
  const rsi = typeof item.rsi14 === 'number' ? item.rsi14 : null;
  const sma = typeof item.sma50 === 'number' && item.sma50 > 0 ? item.sma50 : null;

  if (!price) {
    return { suggestedPrice: null, discountPct: null, rationale: 'Sync price first' };
  }

  if (rsi !== null && rsi <= 30) {
    const bounceTrigger = Number((price * 1.015).toFixed(2));
    return {
      suggestedPrice: bounceTrigger,
      discountPct: 1.5,
      rationale: 'Buy on >30 RSI bounce',
    };
  }

  if (rsi !== null && sma !== null) {
    const rsiExcess = Math.max(0, rsi - 32);
    const rsiPullbackFactor = Math.min(0.22, rsiExcess * 0.0032);
    const rsiTarget = price * (1 - rsiPullbackFactor);
    const smaSupport = sma * 0.96;

    const rawTarget = Math.min(rsiTarget, smaSupport);
    const minFloor = price * 0.80;
    const maxCeiling = price * 0.97;
    const finalTarget = Number(Math.max(minFloor, Math.min(maxCeiling, rawTarget)).toFixed(2));
    const discountPct = ((price - finalTarget) / price) * 100;

    return {
      suggestedPrice: finalTarget,
      discountPct,
      rationale: `Est. RSI ~32 & SMA50 support`,
    };
  }

  if (sma !== null) {
    const rawTarget = sma * 0.96;
    const finalTarget = Number(Math.min(price * 0.97, rawTarget).toFixed(2));
    const discountPct = ((price - finalTarget) / price) * 100;
    return {
      suggestedPrice: finalTarget,
      discountPct,
      rationale: '4% below SMA-50 support',
    };
  }

  const fallbackTarget = Number((price * 0.94).toFixed(2));
  return {
    suggestedPrice: fallbackTarget,
    discountPct: 6.0,
    rationale: '6% pullback entry zone',
  };
}

function getWatchlistBuySignal(item: WatchlistItem) {
  const hasPrice = typeof item.marketPrice === 'number' && item.marketPrice > 0;
  const hasRsi = typeof item.rsi14 === 'number';
  const hasPrevRsi = typeof item.prevRsi14 === 'number';
  const hasSma = typeof item.sma50 === 'number';

  if (!hasPrice && !hasRsi) {
    return {
      type: 'PENDING',
      priority: 5,
      label: 'AWAITING SYNC',
      badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200',
      subtext: 'Click Sync to check RSI & Price',
    };
  }

  const currentRsi = hasRsi ? (item.rsi14 as number) : null;
  const prevRsi = hasPrevRsi ? (item.prevRsi14 as number) : null;
  const livePrice = hasPrice ? (item.marketPrice as number) : 0;
  const target = typeof item.targetPrice === 'number' && item.targetPrice > 0 ? item.targetPrice : null;

  const isTargetReached = hasPrice && target !== null && livePrice <= target;
  const nearTargetCeiling = target !== null ? target * (1 + NEAR_TARGET_BUFFER_PCT) : 0;
  const isNearTarget =
    hasPrice &&
    target !== null &&
    livePrice > target &&
    livePrice <= nearTargetCeiling;
  const gapPctFromTarget =
    hasPrice && target !== null && target > 0
      ? ((livePrice - target) / target) * 100
      : 0;

  // 1. Confirmed RSI >30 Reversal Bounce (Highest Priority)
  if (currentRsi !== null && currentRsi > 30 && currentRsi <= 42 && prevRsi !== null && prevRsi <= 30) {
    return {
      type: 'BUY_ZONE',
      priority: 1,
      label: 'BUY ZONE • RSI >30 BOUNCE',
      badgeClass: 'bg-sky-600 text-white border border-sky-700 font-bold shadow-2xs',
      subtext: `RSI ${prevRsi.toFixed(1)} → ${currentRsi.toFixed(1)} (Reversal Confirmed)`,
    };
  }

  // 2. Exact Target Price Hit!
  if (isTargetReached && target !== null) {
    return {
      type: 'TARGET_HIT',
      priority: 1,
      label: 'TARGET HIT • READY TO BUY',
      badgeClass: 'bg-emerald-600 text-white border border-emerald-700 font-bold shadow-2xs',
      subtext: `Live Rs.${livePrice.toFixed(2)} <= Target Rs.${target.toFixed(2)}`,
    };
  }

  // 3. Near Target Price (Within +3% of Target!)
  if (isNearTarget && target !== null) {
    return {
      type: 'NEAR_TARGET',
      priority: 2,
      label: `NEAR TARGET (+${gapPctFromTarget.toFixed(1)}%) • GET READY`,
      badgeClass: 'bg-orange-500 text-white border border-orange-600 font-bold shadow-2xs',
      subtext: `Only Rs.${(livePrice - target).toFixed(2)} above Target Rs.${target.toFixed(2)}`,
    };
  }

  // 4. Currently Oversold (<= 30) -> Wait for >30 bounce
  if (currentRsi !== null && currentRsi <= 30) {
    return {
      type: 'WAIT_BOUNCE',
      priority: 3,
      label: 'OVERSOLD • WAIT FOR >30 BOUNCE',
      badgeClass: 'bg-amber-50 text-amber-900 border border-amber-300 font-semibold',
      subtext: `RSI ${currentRsi.toFixed(1)} (<=30) • Do not catch falling knife`,
    };
  }

  // 5. Overbought Warning
  if (currentRsi !== null && currentRsi >= 70) {
    return {
      type: 'OVERBOUGHT',
      priority: 6,
      label: 'OVERBOUGHT • AVOID ENTRY',
      badgeClass: 'bg-rose-50 text-rose-800 border border-rose-200',
      subtext: `RSI ${currentRsi.toFixed(1)} (>=70) • Too expensive right now`,
    };
  }

  return {
    type: 'NEUTRAL',
    priority: 4,
    label: 'WATCHING • NEUTRAL',
    badgeClass: 'bg-slate-50 text-slate-700 border border-slate-200',
    subtext: currentRsi !== null
      ? `RSI ${currentRsi.toFixed(1)}${hasSma ? ` • SMA50 Rs.${item.sma50?.toFixed(1)}` : ''}`
      : 'Monitoring price action',
  };
}

export const WatchlistTab: React.FC<WatchlistTabProps> = ({ ownedSymbols }) => {
  const [items, setItems] = useState<WatchlistItem[]>(() => loadWatchlist());
  const [symbolInput, setSymbolInput] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [targetPriceInput, setTargetPriceInput] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'BUY_ZONE' | 'OVERSOLD'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncingSymbols, setSyncingSymbols] = useState<Record<string, boolean>>({});
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  useEffect(() => {
    saveWatchlist(items);
  }, [items]);

  const fetchTechnicalsForSymbol = async (symbol: string) => {
    try {
      const res = await fetch('/api/cse/technicals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  const syncSingleItem = async (item: WatchlistItem) => {
    setSyncingSymbols((prev) => ({ ...prev, [item.symbol]: true }));
    try {
      const [quote, tech] = await Promise.all([
        fetchLiveCsePrice(item.symbol),
        fetchTechnicalsForSymbol(item.symbol),
      ]);

      const nextPrice =
        quote?.verified && typeof quote.price === 'number' && quote.price > 0
          ? quote.price
          : typeof tech?.price === 'number' && tech.price > 0
          ? tech.price
          : item.marketPrice ?? null;

      const nextRsi = typeof tech?.rsi14 === 'number' ? tech.rsi14 : item.rsi14 ?? null;
      const previousRsi =
        typeof item.rsi14 === 'number' && nextRsi !== null && item.rsi14 !== nextRsi
          ? item.rsi14
          : item.prevRsi14 ?? null;

      setItems((prev) =>
        prev.map((w) =>
          w.id === item.id
            ? {
                ...w,
                marketPrice: nextPrice,
                prevRsi14: previousRsi,
                rsi14: nextRsi,
                sma50: typeof tech?.sma50 === 'number' ? tech.sma50 : w.sma50 ?? null,
                lastSynced: new Date().toISOString(),
              }
            : w
        )
      );
    } finally {
      setSyncingSymbols((prev) => ({ ...prev, [item.symbol]: false }));
    }
  };

  const handleSyncAll = async () => {
    if (items.length === 0 || isSyncingAll) return;
    setIsSyncingAll(true);
    for (let i = 0; i < items.length; i++) {
      await syncSingleItem(items[i]);
      if (i < items.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    setIsSyncingAll(false);
  };

  const handleApplyAiTarget = (id: string, price: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, targetPrice: price } : item))
    );
  };

  const handleApplyAllAiTargets = () => {
    setItems((prev) =>
      prev.map((item) => {
        if (typeof item.targetPrice === 'number' && item.targetPrice > 0) return item;
        const ai = computeAiSuggestedBuyPrice(item);
        return ai.suggestedPrice ? { ...item, targetPrice: ai.suggestedPrice } : item;
      })
    );
  };

  const handleAddWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbolInput.trim()) return;

    const cleanSym = symbolInput.trim().includes('.')
      ? symbolInput.trim().toUpperCase()
      : `${symbolInput.trim().toUpperCase()}.N0000`;

    if (items.some((w) => w.symbol === cleanSym)) {
      setSymbolInput('');
      return;
    }

    const newItem: WatchlistItem = {
      id: `wl_${Date.now()}`,
      symbol: cleanSym,
      companyName: companyInput.trim() || cleanSym,
      targetPrice: targetPriceInput ? parseFloat(targetPriceInput) : null,
      marketPrice: null,
      rsi14: null,
      prevRsi14: null,
      sma50: null,
      lastSynced: null,
    };

    setItems((prev) => [newItem, ...prev]);
    setSymbolInput('');
    setCompanyInput('');
    setTargetPriceInput('');

    await syncSingleItem(newItem);
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Enrich & automatically sort so Buy Zone / Target Hit / Near Target stocks always appear at the top!
  const enrichedItems = items
    .map((item) => ({
      item,
      signal: getWatchlistBuySignal(item),
      aiSuggestion: computeAiSuggestedBuyPrice(item),
    }))
    .sort((a, b) => a.signal.priority - b.signal.priority);

  const actionableStocks = enrichedItems.filter(
    (x) =>
      x.signal.type === 'BUY_ZONE' ||
      x.signal.type === 'TARGET_HIT' ||
      x.signal.type === 'NEAR_TARGET'
  );
  const buyZoneCount = actionableStocks.length;
  const oversoldCount = enrichedItems.filter((x) => x.signal.type === 'WAIT_BOUNCE').length;

  const filteredItems = enrichedItems.filter(({ item, signal }) => {
    const matchesSearch =
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.companyName.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filterMode === 'BUY_ZONE') {
      return (
        signal.type === 'BUY_ZONE' ||
        signal.type === 'TARGET_HIT' ||
        signal.type === 'NEAR_TARGET'
      );
    }
    if (filterMode === 'OVERSOLD') {
      return signal.type === 'WAIT_BOUNCE';
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Alert Banner when any stock hits Target, comes within 3% Near Target, or RSI >30 Buy Zone */}
      {actionableStocks.length > 0 && (
        <div className="p-4 bg-amber-50/90 border-2 border-amber-400 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-amber-600 text-white rounded-xl shrink-0">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                Entry Zone Alert: {actionableStocks.length} Stock{actionableStocks.length > 1 ? 's' : ''} At or Near Buy Target!
              </h3>
              <p className="text-xs text-amber-900 mt-0.5 font-medium">
                {actionableStocks
                  .map(
                    ({ item, signal }) =>
                      `${item.symbol} (Rs.${item.marketPrice?.toFixed(2)}${
                        item.targetPrice ? ` vs Target Rs.${item.targetPrice.toFixed(2)}` : ''
                      } • ${signal.type === 'NEAR_TARGET' ? 'Near Target' : 'Ready'})`
                  )
                  .join('  |  ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFilterMode(filterMode === 'BUY_ZONE' ? 'ALL' : 'BUY_ZONE')}
            className="px-3.5 py-1.5 text-xs font-bold bg-amber-700 text-white rounded-xl hover:bg-amber-800 transition-colors shrink-0"
          >
            {filterMode === 'BUY_ZONE' ? 'Show All' : 'Show Only Near/Hit'}
          </button>
        </div>
      )}

      {/* Header + Add Watchlist Stock Form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                CSE Watchlist &amp; AI Buy Zone Radar
              </h2>
              <span className="text-2xs px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 font-semibold border border-sky-200">
                +3% Near-Target Alert
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Highlights in <span className="font-semibold text-orange-700">Orange</span> when within 3% of your Target Price, and <span className="font-semibold text-emerald-800">Green/Blue</span> on Target Hit or RSI &gt;30 Bounce.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleApplyAllAiTargets}
              disabled={items.length === 0}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors shadow-2xs disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Set All AI Targets</span>
            </button>

            <button
              type="button"
              onClick={handleSyncAll}
              disabled={isSyncingAll || items.length === 0}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
              <span>{isSyncingAll ? 'Syncing Watchlist...' : 'Sync Watchlist RSI'}</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleAddWatchlist} className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">
              CSE Symbol *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. JKH.N0000"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 uppercase font-semibold"
            />
          </div>

          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">
              Company / Note (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. John Keells"
              value={companyInput}
              onChange={(e) => setCompanyInput(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-2xs font-semibold text-slate-600 mb-1">
              Custom Target Price (Rs.)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="Or leave blank for AI target"
              value={targetPriceInput}
              onChange={(e) => setTargetPriceInput(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 tabular-nums"
            />
          </div>

          <div>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-sky-600 text-white rounded-xl hover:bg-sky-700 transition-colors shadow-2xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add to Watchlist</span>
            </button>
          </div>
        </form>
      </div>

      {/* Watchlist Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`px-3 py-1 rounded-lg text-2xs font-semibold transition-colors ${
                filterMode === 'ALL'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              All ({items.length})
            </button>
            <button
              onClick={() => setFilterMode('BUY_ZONE')}
              className={`px-3 py-1 rounded-lg text-2xs font-semibold transition-colors flex items-center space-x-1 ${
                filterMode === 'BUY_ZONE'
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'bg-white text-sky-800 hover:bg-sky-50 border border-sky-200'
              }`}
            >
              <span>Buy / Near Target</span>
              {buyZoneCount > 0 && (
                <span className={`px-1 rounded-full text-3xs ${filterMode === 'BUY_ZONE' ? 'bg-white text-sky-800' : 'bg-sky-100 text-sky-900'}`}>
                  {buyZoneCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilterMode('OVERSOLD')}
              className={`px-3 py-1 rounded-lg text-2xs font-semibold transition-colors flex items-center space-x-1 ${
                filterMode === 'OVERSOLD'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-white text-amber-800 hover:bg-amber-50 border border-amber-200'
              }`}
            >
              <span>Oversold (≤30)</span>
              {oversoldCount > 0 && (
                <span className={`px-1 rounded-full text-3xs ${filterMode === 'OVERSOLD' ? 'bg-white text-amber-800' : 'bg-amber-100 text-amber-900'}`}>
                  {oversoldCount}
                </span>
              )}
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search watchlist..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 w-44"
            />
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="py-16 px-4 text-center text-xs text-slate-500">
            No watchlist stocks match this filter. Add any CSE stock symbol above to track its RSI Buy Zone!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-500 font-semibold uppercase tracking-wider text-2xs">
                  <th className="py-3.5 px-4">Symbol / Chart</th>
                  <th className="py-3.5 px-4 text-right">Live Price</th>
                  <th className="py-3.5 px-4 text-right">AI Suggested Buy</th>
                  <th className="py-3.5 px-4 text-right">Your Target</th>
                  <th className="py-3.5 px-4 text-left">Entry Signal</th>
                  <th className="py-3.5 px-4 text-center">14D RSI (Prev → Now)</th>
                  <th className="py-3.5 px-4 text-right">SMA-50</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map(({ item, signal, aiSuggestion }) => {
                  const isSyncing = !!syncingSymbols[item.symbol];
                  const isAlreadyOwned = ownedSymbols.includes(item.symbol.toUpperCase());
                  const tradingViewUrl = `https://www.tradingview.com/chart/?symbol=CSELK%3A${encodeURIComponent(item.symbol)}`;
                  const isTargetApplied =
                    typeof item.targetPrice === 'number' &&
                    aiSuggestion.suggestedPrice !== null &&
                    Math.abs(item.targetPrice - aiSuggestion.suggestedPrice) < 0.01;

                  const isTargetHitRow = signal.type === 'TARGET_HIT';
                  const isBuyZoneRow = signal.type === 'BUY_ZONE';
                  const isNearTargetRow = signal.type === 'NEAR_TARGET';

                  const rowHighlightClass = isTargetHitRow
                    ? 'bg-emerald-50/90 hover:bg-emerald-100/80 border-l-4 border-l-emerald-600'
                    : isBuyZoneRow
                    ? 'bg-sky-50/90 hover:bg-sky-100/80 border-l-4 border-l-sky-600'
                    : isNearTargetRow
                    ? 'bg-orange-50/90 hover:bg-orange-100/80 border-l-4 border-l-orange-500'
                    : 'hover:bg-slate-50/80';

                  return (
                    <tr key={item.id} className={`transition-colors ${rowHighlightClass}`}>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-slate-900">{item.symbol}</span>
                          <a
                            href={tradingViewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Open ${item.symbol} on TradingView`}
                            className="inline-flex items-center justify-center p-1 rounded-md text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-200/80"
                          >
                            <LineChart className="w-3 h-3" />
                          </a>
                          {isAlreadyOwned && (
                            <span className="text-3xs px-1.5 py-0.2 rounded bg-teal-50 text-teal-800 border border-teal-200 font-semibold">
                              Owned
                            </span>
                          )}
                        </div>
                        {item.companyName !== item.symbol && (
                          <div className="text-2xs text-slate-400 truncate max-w-[160px]">
                            {item.companyName}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 tabular-nums">
                        {typeof item.marketPrice === 'number' ? `Rs. ${item.marketPrice.toFixed(2)}` : '—'}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {aiSuggestion.suggestedPrice !== null ? (
                          <div className="inline-flex flex-col items-end">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-mono font-bold text-indigo-700 tabular-nums">
                                Rs. {aiSuggestion.suggestedPrice.toFixed(2)}
                              </span>
                              {!isTargetApplied ? (
                                <button
                                  type="button"
                                  onClick={() => handleApplyAiTarget(item.id, aiSuggestion.suggestedPrice!)}
                                  title="Lock AI suggested price as your Target Price"
                                  className="px-1.5 py-0.5 text-3xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors"
                                >
                                  Apply
                                </button>
                              ) : (
                                <span className="inline-flex items-center text-3xs text-emerald-700 font-semibold">
                                  <Check className="w-3 h-3" />
                                </span>
                              )}
                            </div>
                            <span className="text-3xs text-slate-400 font-mono">
                              {aiSuggestion.discountPct !== null ? `-${aiSuggestion.discountPct.toFixed(1)}% • ` : ''}
                              {aiSuggestion.rationale}
                            </span>
                          </div>
                        ) : (
                          <span className="text-3xs text-slate-400 font-mono">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {typeof item.targetPrice === 'number' ? (
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold ${
                              isTargetHitRow
                                ? 'bg-emerald-600 text-white'
                                : isNearTargetRow
                                ? 'bg-orange-500 text-white'
                                : 'text-slate-800 bg-slate-100'
                            }`}
                          >
                            Rs. {item.targetPrice.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="inline-flex flex-col items-start">
                          <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-2xs font-semibold ${signal.badgeClass}`}>
                            {(signal.type === 'BUY_ZONE' || signal.type === 'TARGET_HIT' || signal.type === 'NEAR_TARGET') && (
                              <TrendingDown className="w-3 h-3 text-white shrink-0" />
                            )}
                            {signal.type === 'WAIT_BOUNCE' && <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />}
                            {signal.type === 'PENDING' && <Clock className="w-3 h-3 text-slate-400 shrink-0" />}
                            {signal.type === 'NEUTRAL' && <Eye className="w-3 h-3 text-slate-500 shrink-0" />}
                            <span>{signal.label}</span>
                          </span>
                          <span className="text-3xs text-slate-500 font-mono mt-0.5 pl-0.5">
                            {signal.subtext}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {typeof item.rsi14 === 'number' ? (
                          <span
                            className={`font-mono text-2xs font-bold px-2.5 py-0.5 rounded-full tabular-nums ${
                              item.rsi14 >= 70
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : item.rsi14 <= 30
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {typeof item.prevRsi14 === 'number' ? `${item.prevRsi14.toFixed(1)} → ` : ''}
                            {item.rsi14.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-3xs text-slate-400 font-mono">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-2xs text-slate-700 tabular-nums">
                        {typeof item.sma50 === 'number' ? `Rs. ${item.sma50.toFixed(2)}` : '—'}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => syncSingleItem(item)}
                            disabled={isSyncing}
                            title="Sync Live Price & RSI"
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-600' : ''}`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id)}
                            title="Remove from Watchlist"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};