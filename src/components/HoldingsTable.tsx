import React, { useState } from 'react';
import { 
  Holding, 
  TradeTag 
} from '../types';
import { 
  Search, 
  Plus, 
  RefreshCw, 
  ExternalLink, 
  AlertTriangle, 
  CheckCircle2, 
  FileSpreadsheet, 
  TrendingUp, 
  TrendingDown,
  LineChart,
  MinusCircle, 
  FileText, 
  Lock,
  ShieldAlert,
  Clock,
  Flame
} from 'lucide-react';
import { fetchLiveCsePrice, applyQuoteToHolding } from '../services/csePriceService';

export type DecisionSignalType = 
  | 'LEGACY_DO_NOT_SELL'
  | 'AWAITING_PRICE_SYNC'
  | 'STRONG_BUY_ZONE'
  | 'FALLING_KNIFE_WAIT'
  | 'HOLD_BELOW_BREAKEVEN'
  | 'STRONG_SELL_PEAK'
  | 'READY_TO_SELL'
  | 'RIDE_UPTREND_HOLD';

export interface DecisionSignal {
  type: DecisionSignalType;
  label: string;
  badgeClass: string;
  subtext: string;
  breakevenPrice?: number;
  netPnlPercent?: number;
}

export function computeDecisionSignal(h: Holding): DecisionSignal {
  if (h.tag === 'LEGACY') {
    return {
      type: 'LEGACY_DO_NOT_SELL',
      label: 'LEGACY • DO NOT SELL',
      badgeClass: 'bg-amber-50 text-amber-900 border border-amber-200',
      subtext: 'Core Long-Term Holding',
    };
  }

  const hasValidPrice = h.marketPrice !== null && h.marketPrice !== undefined && h.marketPrice > 0;
  if (!hasValidPrice || h.priceSource === 'UNABLE_TO_FETCH' || h.priceSource === 'PENDING') {
    return {
      type: 'AWAITING_PRICE_SYNC',
      label: 'AWAITING PRICE SYNC',
      badgeClass: 'bg-slate-100 text-slate-600 border border-slate-200',
      subtext: 'Pending live CSE quote',
    };
  }

  const mktPrice = h.marketPrice as number;
  const breakevenPrice = h.avgCostPrice > 0 ? h.avgCostPrice / 0.9888 : 0;
  const netProceedsPerShare = mktPrice * 0.9888;
  const netPnlPerShare = netProceedsPerShare - h.avgCostPrice;
  const netPnlPercent = h.avgCostPrice > 0 ? (netPnlPerShare / h.avgCostPrice) * 100 : 0;

  const hasRsi = typeof h.rsi14 === 'number';
  const hasSma = typeof h.sma50 === 'number';
  const isRsiOversold = hasRsi && (h.rsi14 as number) <= 30;
  const isRsiOverbought = hasRsi && (h.rsi14 as number) >= 70;
  const isAboveSma50 = hasSma && mktPrice >= (h.sma50 as number);
  const smaGapPercent = hasSma && (h.sma50 as number) > 0
    ? ((mktPrice - (h.sma50 as number)) / (h.sma50 as number)) * 100
    : 0;

  // 1. BELOW BREAKEVEN (Loss Zone -> Check Buy / Average Down vs Wait)
  if (netPnlPercent < 0) {
    const feeDiff = breakevenPrice - mktPrice;
    const neededPercent = mktPrice > 0 ? (feeDiff / mktPrice) * 100 : 0;

    if (isRsiOversold) {
      // If price crashed > 12% below SMA-50, warn against catching a falling knife
      if (hasSma && smaGapPercent < -12) {
        return {
          type: 'FALLING_KNIFE_WAIT',
          label: 'OVERSOLD • WAIT FOR BOUNCE',
          badgeClass: 'bg-amber-50 text-amber-900 border border-amber-300 font-semibold',
          subtext: `RSI ${h.rsi14?.toFixed(1)} • ${Math.abs(smaGapPercent).toFixed(0)}% below SMA50`,
          breakevenPrice,
          netPnlPercent,
        };
      }
      return {
        type: 'STRONG_BUY_ZONE',
        label: 'BUY / AVG DOWN • OVERSOLD',
        badgeClass: 'bg-sky-50 text-sky-900 border border-sky-300 font-bold',
        subtext: `RSI ${h.rsi14?.toFixed(1)}${hasSma ? ` • SMA50 Rs.${h.sma50?.toFixed(1)}` : ''}`,
        breakevenPrice,
        netPnlPercent,
      };
    }

    return {
      type: 'HOLD_BELOW_BREAKEVEN',
      label: 'HOLD • BELOW BREAKEVEN',
      badgeClass: 'bg-rose-50 text-rose-800 border border-rose-200',
      subtext: `Target: Rs. ${breakevenPrice.toFixed(2)} (+${neededPercent.toFixed(1)}%)`,
      breakevenPrice,
      netPnlPercent,
    };
  }

  // 2. IN PROFIT ZONE -> Combine RSI + SMA-50 to decide Sell Now vs Ride Uptrend
  if (isRsiOverbought && netPnlPercent >= 5) {
    return {
      type: 'STRONG_SELL_PEAK',
      label: 'STRONG SELL • RSI PEAK',
      badgeClass: 'bg-emerald-600 text-white border border-emerald-700 shadow-2xs font-bold',
      subtext: `+${netPnlPercent.toFixed(1)}% net • RSI ${h.rsi14?.toFixed(1)} (Overbought)`,
      breakevenPrice,
      netPnlPercent,
    };
  }

  if (netPnlPercent >= 8 || isRsiOverbought) {
    return {
      type: 'READY_TO_SELL',
      label: 'READY TO SELL • PROFIT ZONE',
      badgeClass: 'bg-emerald-50 text-emerald-900 border border-emerald-300 font-bold',
      subtext: `+${netPnlPercent.toFixed(1)}% net${hasRsi ? ` • RSI ${h.rsi14?.toFixed(1)}` : ''}${isAboveSma50 ? ' • >SMA50' : ''}`,
      breakevenPrice,
      netPnlPercent,
    };
  }

  return {
    type: 'RIDE_UPTREND_HOLD',
    label: isAboveSma50 ? 'HOLD • UPTREND (>SMA50)' : 'HOLD • IN PROFIT',
    badgeClass: 'bg-teal-50 text-teal-800 border border-teal-200',
    subtext: `+${netPnlPercent.toFixed(1)}% net${hasRsi ? ` • RSI ${h.rsi14?.toFixed(1)}` : ''}`,
    breakevenPrice,
    netPnlPercent,
  };
}

interface HoldingsTableProps {
  holdings: Holding[];
  currency: string;
  onUpdateHolding: (updated: Holding) => void;
  onDeleteHolding: (id: string) => void;
  onOpenAddModal: () => void;
  onOpenSellModal: (holding: Holding) => void;
  onOpenExcelModal: () => void;
  onOpenContractNoteModal: () => void;
  onOpenNewsTab?: () => void;
}

export const HoldingsTable: React.FC<HoldingsTableProps> = ({
  holdings,
  currency,
  onUpdateHolding,
  onDeleteHolding,
  onOpenAddModal,
  onOpenSellModal,
  onOpenExcelModal,
  onOpenContractNoteModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'ACTIVE' | 'LEGACY' | 'READY_TO_SELL' | 'BELOW_BREAKEVEN'>('ALL');
  const [refreshingSymbols, setRefreshingSymbols] = useState<Record<string, boolean>>({});
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number } | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const formatLKR = (num: number): string => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: currency || 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const holdingsWithSignals = holdings.map((h) => ({
    holding: h,
    signal: computeDecisionSignal(h),
  }));

  const isSellSignal = (type: DecisionSignalType) =>
    type === 'READY_TO_SELL' || type === 'STRONG_SELL_PEAK';

  const isBelowBreakevenSignal = (type: DecisionSignalType) =>
    type === 'HOLD_BELOW_BREAKEVEN' || type === 'STRONG_BUY_ZONE' || type === 'FALLING_KNIFE_WAIT';

  const filteredHoldings = holdingsWithSignals.filter(({ holding: h, signal }) => {
    const matchesSearch =
      h.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.companyName.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterMode === 'ALL') return true;
    if (filterMode === 'ACTIVE') return (h.tag || 'ACTIVE') === 'ACTIVE';
    if (filterMode === 'LEGACY') return (h.tag || 'ACTIVE') === 'LEGACY';
    if (filterMode === 'READY_TO_SELL') return isSellSignal(signal.type);
    if (filterMode === 'BELOW_BREAKEVEN') return isBelowBreakevenSignal(signal.type);
    return true;
  });

  const readyToSellCount = holdingsWithSignals.filter((item) => isSellSignal(item.signal.type)).length;
  const belowBreakevenCount = holdingsWithSignals.filter((item) => isBelowBreakevenSignal(item.signal.type)).length;
  const legacyCount = holdingsWithSignals.filter((item) => item.signal.type === 'LEGACY_DO_NOT_SELL').length;

  const handleToggleTag = (holding: Holding) => {
    const currentTag = holding.tag || 'ACTIVE';
    const newTag: TradeTag = currentTag === 'ACTIVE' ? 'LEGACY' : 'ACTIVE';
    onUpdateHolding({
      ...holding,
      tag: newTag,
    });
  };

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

  const handleRefreshSingle = async (holding: Holding) => {
    setRefreshingSymbols((prev) => ({ ...prev, [holding.symbol]: true }));
    try {
      const [quote, tech] = await Promise.all([
        fetchLiveCsePrice(holding.symbol),
        fetchTechnicalsForSymbol(holding.symbol),
      ]);
      const updated = applyQuoteToHolding(holding, quote);
      onUpdateHolding({
        ...updated,
        rsi14: typeof tech?.rsi14 === 'number' ? tech.rsi14 : updated.rsi14 ?? null,
        sma50: typeof tech?.sma50 === 'number' ? tech.sma50 : updated.sma50 ?? null,
      });
    } catch (err) {
      console.error('Error refreshing quote & technicals:', err);
    } finally {
      setRefreshingSymbols((prev) => ({ ...prev, [holding.symbol]: false }));
    }
  };

  const handleRefreshAll = async () => {
    if (holdings.length === 0 || isRefreshingAll) return;
    setIsRefreshingAll(true);
    setRefreshProgress({ current: 0, total: holdings.length });

    // Step 1: Check live CSE Announcements for any fresh Dividend / XD declarations
    const liveDivMap: Record<string, { dividendInfo?: string; xdDate?: string }> = {};
    try {
      const newsRes = await fetch('/api/cse/news-dividends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: holdings.map((h) => h.symbol) }),
      });
      if (newsRes.ok) {
        const newsData = await newsRes.json();
        if (Array.isArray(newsData?.technicals)) {
          for (const t of newsData.technicals) {
            if (t?.symbol) {
              liveDivMap[t.symbol.toUpperCase()] = {
                dividendInfo: t.dividendInfo || undefined,
                xdDate: t.xdDate || undefined,
              };
            }
          }
        }
      }
    } catch (e) {
      console.error('Live dividend sync error:', e);
    }

    // Step 2: Sync Live Prices + Historical 14D RSI & SMA-50 for each stock
    for (let i = 0; i < holdings.length; i++) {
      const h = holdings[i];
      setRefreshProgress({ current: i + 1, total: holdings.length });
      setRefreshingSymbols((prev) => ({ ...prev, [h.symbol]: true }));
      try {
        const [quote, tech] = await Promise.all([
          fetchLiveCsePrice(h.symbol),
          fetchTechnicalsForSymbol(h.symbol),
        ]);
        const liveDiv = liveDivMap[h.symbol.toUpperCase()];
        const mergedQuote = {
          ...quote,
          dividendInfo: liveDiv?.dividendInfo || null,
          xdDate: liveDiv?.xdDate || null,
        };
        const updated = applyQuoteToHolding(h, mergedQuote);
        onUpdateHolding({
          ...updated,
          rsi14: typeof tech?.rsi14 === 'number' ? tech.rsi14 : updated.rsi14 ?? null,
          sma50: typeof tech?.sma50 === 'number' ? tech.sma50 : updated.sma50 ?? null,
        });
      } catch (err) {
        console.error(`Error refreshing ${h.symbol}:`, err);
      } finally {
        setRefreshingSymbols((prev) => ({ ...prev, [h.symbol]: false }));
      }
      if (i < holdings.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    setIsRefreshingAll(false);
    setRefreshProgress(null);
  };

  const renderPriceBadge = (holding: Holding) => {
    const { priceSource, lastVerifiedUrl } = holding;

    if (priceSource === 'LIVE_CSE') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-3xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
          <span>Live CSE</span>
          {lastVerifiedUrl && (
            <a
              href={lastVerifiedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-700 hover:text-emerald-900 ml-0.5"
            >
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </span>
      );
    }

    if (priceSource === 'ATRAD_EXCEL') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-3xs font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
          <span>ATrad Excel</span>
        </span>
      );
    }

    if (priceSource === 'UNABLE_TO_FETCH') {
      return (
        <button
          onClick={() => setActiveTooltip(activeTooltip === holding.id ? null : holding.id)}
          className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-3xs font-medium bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors whitespace-nowrap"
        >
          <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
          <span>ATrad Saved</span>
        </button>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-medium bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
        {priceSource === 'MANUAL' ? 'Manual' : 'Pending'}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Table Header / Action Bar */}
      <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              Portfolio Holdings & Decision Signals
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200">
              {holdings.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Click <span className="font-semibold text-slate-700">Refresh CSE</span> for live 14D RSI & SMA-50 signals, or open any stock directly on TradingView.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/60 p-0.5 text-xs">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`px-3 py-1 rounded-lg text-2xs font-semibold transition-colors ${
                filterMode === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterMode('READY_TO_SELL')}
              className={`px-3 py-1 rounded-lg text-2xs font-semibold transition-colors flex items-center space-x-1 ${
                filterMode === 'READY_TO_SELL' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-emerald-800 hover:text-emerald-950'
              }`}
            >
              <span>Ready to Sell</span>
              {readyToSellCount > 0 && (
                <span className={`px-1 rounded-full text-3xs ${filterMode === 'READY_TO_SELL' ? 'bg-white text-emerald-800' : 'bg-emerald-100 text-emerald-900'}`}>
                  {readyToSellCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilterMode('BELOW_BREAKEVEN')}
              className={`px-3 py-1 rounded-lg text-2xs font-semibold transition-colors flex items-center space-x-1 ${
                filterMode === 'BELOW_BREAKEVEN' ? 'bg-rose-600 text-white shadow-2xs' : 'text-rose-800 hover:text-rose-950'
              }`}
            >
              <span>Below Breakeven</span>
              {belowBreakevenCount > 0 && (
                <span className={`px-1 rounded-full text-3xs ${filterMode === 'BELOW_BREAKEVEN' ? 'bg-white text-rose-800' : 'bg-rose-100 text-rose-900'}`}>
                  {belowBreakevenCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilterMode('LEGACY')}
              className={`px-3 py-1 rounded-lg text-2xs font-semibold transition-colors ${
                filterMode === 'LEGACY' ? 'bg-amber-600 text-white shadow-2xs' : 'text-amber-800 hover:text-amber-950'
              }`}
            >
              Legacy ({legacyCount})
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search symbol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 w-36 sm:w-44 font-normal"
            />
          </div>

          <button
            onClick={handleRefreshAll}
            disabled={isRefreshingAll || holdings.length === 0}
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${
              isRefreshingAll
                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                : 'bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 border-slate-200 shadow-2xs'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAll ? 'animate-spin text-slate-400' : 'text-slate-600'}`} />
            <span>
              {isRefreshingAll
                ? `Syncing (${refreshProgress?.current}/${refreshProgress?.total})...`
                : 'Refresh CSE'}
            </span>
          </button>

          <button
            onClick={onOpenAddModal}
            className="inline-flex items-center space-x-1 px-3.5 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Stock</span>
          </button>
        </div>
      </div>

      {holdings.length === 0 ? (
        <div className="py-20 px-4 text-center max-w-md mx-auto">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 mb-4 border border-slate-200">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            0 Stocks in Portfolio
          </h3>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Strict Zero-Mock Architecture: Import your genuine ATrad Portfolio Excel file or record an Asia Securities contract note to begin.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            <button
              onClick={onOpenExcelModal}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-4 py-2 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-colors shadow-2xs"
            >
              <FileSpreadsheet className="w-4 h-4 text-teal-700" />
              <span>Import ATrad Excel</span>
            </button>
            <button
              onClick={onOpenContractNoteModal}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-4 py-2 text-xs font-semibold text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors shadow-2xs"
            >
              <FileText className="w-4 h-4 text-sky-700" />
              <span>Parse Contract Note</span>
            </button>
            <button
              onClick={onOpenAddModal}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Manual Entry</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-500 font-semibold uppercase tracking-wider text-2xs">
                <th className="py-3.5 px-4">Tag</th>
                <th className="py-3.5 px-4">Symbol / Chart</th>
                <th className="py-3.5 px-4 text-right">Qty</th>
                <th className="py-3.5 px-4 text-right">Avg Cost</th>
                <th className="py-3.5 px-4 text-right">Market Price</th>
                <th className="py-3.5 px-4 text-left">Decision Signal</th>
                <th className="py-3.5 px-4 text-center whitespace-nowrap">14D RSI</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">SMA-50</th>
                <th className="py-3.5 px-4 text-left whitespace-nowrap">Dividend / XD</th>
                <th className="py-3.5 px-4 text-right">Market Value</th>
                <th className="py-3.5 px-4 text-right">Net P&L (1.12%)</th>
                <th className="py-3.5 px-4 text-right sticky right-0 z-20 bg-slate-50 shadow-[-6px_0_12px_-6px_rgba(15,23,42,0.12)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHoldings.map(({ holding: h, signal }) => {
                const effectivePrice = h.marketPrice ?? h.avgCostPrice;
                const costVal = h.quantity * h.avgCostPrice;
                const mktVal = h.quantity * effectivePrice;
                const netProceeds = h.marketPrice !== null ? mktVal * 0.9888 : mktVal;
                const pnl = netProceeds - costVal;
                const pnlPercent = costVal > 0 ? (pnl / costVal) * 100 : 0;
                const isRefreshing = !!refreshingSymbols[h.symbol];
                const tag = h.tag || 'ACTIVE';
                const daysLogged = h.priceHistory?.length || (h.marketPrice ? 1 : 0);
                const tradingViewUrl = `https://www.tradingview.com/chart/?symbol=CSELK%3A${encodeURIComponent(h.symbol)}`;

                return (
                  <tr key={h.id} className="group hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleTag(h)}
                        title="Click to toggle Active Trade vs Legacy Holding"
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-semibold transition-colors ${
                          tag === 'ACTIVE'
                            ? 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100'
                            : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        {tag === 'ACTIVE' ? 'Active' : 'Legacy'}
                      </button>
                    </td>

                    <td className="py-4 px-4">
                      <div className="font-semibold text-slate-900 tracking-tight text-xs flex items-center space-x-1.5">
                        <span>{h.symbol}</span>
                        <a
                          href={tradingViewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open ${h.symbol} Live Chart & RSI on TradingView`}
                          className="inline-flex items-center justify-center p-1 rounded-md text-sky-600 bg-sky-50 hover:bg-sky-100 hover:text-sky-800 border border-sky-200/80 transition-colors"
                        >
                          <LineChart className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="text-2xs text-slate-400 truncate max-w-[140px]" title={h.companyName}>
                        {h.companyName}
                      </div>
                    </td>

                    <td className="py-4 px-4 text-right font-medium text-slate-800 tabular-nums">
                      {h.quantity.toLocaleString()}
                    </td>

                    <td className="py-4 px-4 text-right text-slate-600 tabular-nums whitespace-nowrap">
                      Rs. {h.avgCostPrice.toFixed(2)}
                    </td>

                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      <div className="font-semibold text-slate-900 tabular-nums">
                        {h.marketPrice !== null ? `Rs. ${h.marketPrice.toFixed(2)}` : 'Pending'}
                      </div>
                      <div className="mt-1 flex justify-end">
                        {renderPriceBadge(h)}
                      </div>
                    </td>

                    <td className="py-4 px-4 whitespace-nowrap">
                      <div className="inline-flex flex-col items-start">
                        <span
                          className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-2xs font-semibold ${signal.badgeClass}`}
                        >
                          {signal.type === 'LEGACY_DO_NOT_SELL' && (
                            <Lock className="w-3 h-3 text-amber-700 shrink-0" />
                          )}
                          {signal.type === 'STRONG_SELL_PEAK' && (
                            <Flame className="w-3 h-3 text-white shrink-0" />
                          )}
                          {signal.type === 'READY_TO_SELL' && (
                            <TrendingUp className="w-3 h-3 text-emerald-700 shrink-0" />
                          )}
                          {signal.type === 'STRONG_BUY_ZONE' && (
                            <TrendingDown className="w-3 h-3 text-sky-700 shrink-0" />
                          )}
                          {signal.type === 'FALLING_KNIFE_WAIT' && (
                            <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />
                          )}
                          {signal.type === 'HOLD_BELOW_BREAKEVEN' && (
                            <ShieldAlert className="w-3 h-3 text-rose-600 shrink-0" />
                          )}
                          {signal.type === 'RIDE_UPTREND_HOLD' && (
                            <CheckCircle2 className="w-3 h-3 text-teal-700 shrink-0" />
                          )}
                          {signal.type === 'AWAITING_PRICE_SYNC' && (
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                          <span>{signal.label}</span>
                        </span>
                        <span className="text-3xs text-slate-500 font-mono mt-0.5 pl-0.5">
                          {signal.subtext}
                        </span>
                      </div>
                    </td>

                    {/* 14-Day RSI (Live CSE Historical + Daily Uploads) */}
                    <td className="py-4 px-4 text-center whitespace-nowrap">
                      {typeof h.rsi14 === 'number' ? (
                        <span
                          title={
                            h.rsi14 >= 70
                              ? 'Overbought (>=70) — Consider taking profit'
                              : h.rsi14 <= 30
                              ? 'Oversold (<=30) — Potential buy/average-down zone'
                              : 'Neutral Momentum (30–70)'
                          }
                          className={`font-mono text-2xs font-bold px-2.5 py-0.5 rounded-full tabular-nums ${
                            h.rsi14 >= 70
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : h.rsi14 <= 30
                              ? 'bg-sky-50 text-sky-700 border border-sky-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {h.rsi14.toFixed(1)}
                        </span>
                      ) : (
                        <span
                          title="Click Refresh CSE to fetch live 14D RSI from CSE historical chart"
                          className="inline-block text-3xs font-mono text-slate-500 bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-200 whitespace-nowrap"
                        >
                          Sync RSI ({daysLogged}/15)
                        </span>
                      )}
                    </td>

                    {/* SMA-50 (Live CSE Historical + Daily Uploads) */}
                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      {typeof h.sma50 === 'number' ? (
                        <span
                          title={
                            h.marketPrice !== null
                              ? h.marketPrice >= h.sma50
                                ? 'Bullish: Price above 50-day moving average'
                                : 'Bearish: Price below 50-day moving average'
                              : '50-Day Simple Moving Average'
                          }
                          className={`font-mono text-2xs font-medium tabular-nums ${
                            h.marketPrice !== null && h.marketPrice >= h.sma50
                              ? 'text-emerald-700'
                              : 'text-slate-700'
                          }`}
                        >
                          Rs. {h.sma50.toFixed(2)}
                        </span>
                      ) : (
                        <span
                          title="Click Refresh CSE to fetch live SMA-50 from CSE historical chart"
                          className="inline-block text-3xs font-mono text-slate-500 bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-200 whitespace-nowrap"
                        >
                          Sync SMA ({daysLogged}/50)
                        </span>
                      )}
                    </td>

                    {/* Dividend & XD Date */}
                    <td className="py-4 px-4 text-left whitespace-nowrap">
                      {h.dividendInfo || h.xdDate ? (
                        <div>
                          <div className="font-semibold text-emerald-800 text-2xs">
                            {h.dividendInfo || 'Dividend Declared'}
                          </div>
                          {h.xdDate && (
                            <div className="text-3xs text-slate-400 font-mono">
                              XD: {h.xdDate}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-block text-3xs text-slate-400 bg-slate-50 px-2.5 py-0.5 rounded-full border border-slate-200 whitespace-nowrap">
                          No XD
                        </span>
                      )}
                    </td>

                    <td className="py-4 px-4 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatLKR(mktVal)}
                    </td>

                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      <div
                        className={`font-semibold tabular-nums ${
                          pnl > 0
                            ? 'text-[#15803D]'
                            : pnl < 0
                            ? 'text-[#B91C1C]'
                            : 'text-slate-600'
                        }`}
                      >
                        {pnl >= 0 ? '+' : ''}
                        {formatLKR(pnl)}
                      </div>
                      <div
                        className={`text-2xs font-medium tabular-nums ${
                          pnlPercent > 0
                            ? 'text-[#15803D]'
                            : pnlPercent < 0
                            ? 'text-[#B91C1C]'
                            : 'text-slate-400'
                        }`}
                      >
                        {pnlPercent >= 0 ? '+' : ''}
                        {pnlPercent.toFixed(2)}%
                      </div>
                    </td>

                    <td className="py-4 px-4 text-right whitespace-nowrap sticky right-0 z-10 bg-white group-hover:bg-slate-50 transition-colors shadow-[-6px_0_12px_-6px_rgba(15,23,42,0.12)]">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => onOpenSellModal(h)}
                          title="Sell Shares & Preview 70/30 Split"
                          className={`px-2.5 py-1 text-2xs font-semibold rounded-lg transition-colors ${
                            isSellSignal(signal.type)
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs font-bold'
                              : 'text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                          }`}
                        >
                          Sell (70/30)
                        </button>

                        <button
                          onClick={() => handleRefreshSingle(h)}
                          disabled={isRefreshing}
                          title="Sync Live Price, 14D RSI & SMA-50 from cse.lk"
                          className="p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-slate-400' : ''}`} />
                        </button>

                        <button
                          onClick={() => {
                            if (window.confirm(`Remove ${h.symbol} from portfolio?`)) {
                              onDeleteHolding(h.id);
                            }
                          }}
                          title="Remove Holding"
                          className="p-1 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <MinusCircle className="w-3.5 h-3.5" />
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
  );
};