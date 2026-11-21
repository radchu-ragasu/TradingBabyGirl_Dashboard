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
  Search
} from 'lucide-react';
import { fetchLiveCsePrice } from '../services/csePriceService';

interface WatchlistTabProps {
  ownedSymbols: string[];
}

const WATCHLIST_STORAGE_KEY = 'cse_trading_watchlist_v1';

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

function getWatchlistBuySignal(item: WatchlistItem) {
  const hasPrice = typeof item.marketPrice === 'number' && item.marketPrice > 0;
  const hasRsi = typeof item.rsi14 === 'number';
  const hasPrevRsi = typeof item.prevRsi14 === 'number';
  const hasSma = typeof item.sma50 === 'number';

  if (!hasPrice && !hasRsi) {
    return {
      type: 'PENDING',
      label: 'AWAITING SYNC',
      badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200',
      subtext: 'Click Sync to check RSI & Price',
    };
  }

  const currentRsi = hasRsi ? (item.rsi14 as number) : null;
  const prevRsi = hasPrevRsi ? (item.prevRsi14 as number) : null;

  // 1. RSI crossed back above 30 from <= 30 (Confirmed Buy Zone)
  if (currentRsi !== null && currentRsi > 30 && currentRsi <= 42 && prevRsi !== null && prevRsi <= 30) {
    return {
      type: 'BUY_ZONE',
      label: 'BUY ZONE • RSI >30 BOUNCE',
      badgeClass: 'bg-sky-600 text-white border border-sky-700 font-bold shadow-2xs',
      subtext: `RSI ${prevRsi.toFixed(1)} → ${currentRsi.toFixed(1)} (Reversal Confirmed)`,
    };
  }

  // 2. Currently Oversold (<= 30) -> Wait for >30 bounce
  if (currentRsi !== null && currentRsi <= 30) {
    return {
      type: 'WAIT_BOUNCE',
      label: 'OVERSOLD • WAIT FOR >30 BOUNCE',
      badgeClass: 'bg-amber-50 text-amber-900 border border-amber-300 font-semibold',
      subtext: `RSI ${currentRsi.toFixed(1)} (<=30) • Do not catch falling knife`,
    };
  }

  // 3. Target Price Reached
  if (
    hasPrice &&
    typeof item.targetPrice === 'number' &&
    item.targetPrice > 0 &&
    (item.marketPrice as number) <= item.targetPrice
  ) {
    return {
      type: 'TARGET_HIT',
      label: 'TARGET PRICE HIT • CHECK RSI',
      badgeClass: 'bg-emerald-50 text-emerald-900 border border-emerald-300 font-bold',
      subtext: `Price Rs.${item.marketPrice?.toFixed(2)} <= Target Rs.${item.targetPrice.toFixed(2)}`,
    };
  }

  // 4. Overbought Warning
  if (currentRsi !== null && currentRsi >= 70) {
    return {
      type: 'OVERBOUGHT',
      label: 'OVERBOUGHT • AVOID ENTRY',
      badgeClass: 'bg-rose-50 text-rose-800 border border-rose-200',
      subtext: `RSI ${currentRsi.toFixed(1)} (>=70) • Too expensive right now`,
    };
  }

  return {
    type: 'NEUTRAL',
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

    // Auto-sync live price & RSI immediately after adding
    await syncSingleItem(newItem);
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const enrichedItems = items.map((item) => ({
    item,
    signal: getWatchlistBuySignal(item),
  }));

  const buyZoneCount = enrichedItems.filter(
    (x) => x.signal.type === 'BUY_ZONE' || x.signal.type === 'TARGET_HIT'
  ).length;
  const oversoldCount = enrichedItems.filter((x) => x.signal.type === 'WAIT_BOUNCE').length;

  const filteredItems = enrichedItems.filter(({ item, signal }) => {
    const matchesSearch =
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.companyName.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filterMode === 'BUY_ZONE') {
      return signal.type === 'BUY_ZONE' || signal.type === 'TARGET_HIT';
    }
    if (filterMode === 'OVERSOLD') {
      return signal.type === 'WAIT_BOUNCE';
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header + Add Watchlist Stock Form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                CSE Watchlist & Buy Zone Radar
              </h2>
              <span className="text-2xs px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 font-semibold border border-sky-200">
                RSI &gt;30 Reversal Detector
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Track stocks you plan to buy. Alerts <span className="font-semibold text-sky-800">BUY ZONE</span> when RSI drops ≤30 and bounces back above 30.
            </p>
          </div>

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
              Target Buy Price (Rs.)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="Optional target"
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
              <span>Buy Zone</span>
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
                  <th className="py-3.5 px-4 text-right">Target Price</th>
                  <th className="py-3.5 px-4 text-left">Entry Signal</th>
                  <th className="py-3.5 px-4 text-center">14D RSI (Prev → Now)</th>
                  <th className="py-3.5 px-4 text-right">SMA-50</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map(({ item, signal }) => {
                  const isSyncing = !!syncingSymbols[item.symbol];
                  const isAlreadyOwned = ownedSymbols.includes(item.symbol.toUpperCase());
                  const tradingViewUrl = `https://www.tradingview.com/chart/?symbol=CSELK%3A${encodeURIComponent(item.symbol)}`;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
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

                      <td className="py-3.5 px-4 text-right font-mono text-slate-600 tabular-nums">
                        {typeof item.targetPrice === 'number' ? `Rs. ${item.targetPrice.toFixed(2)}` : '—'}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="inline-flex flex-col items-start">
                          <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-2xs font-semibold ${signal.badgeClass}`}>
                            {signal.type === 'BUY_ZONE' && <TrendingDown className="w-3 h-3 text-white shrink-0" />}
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