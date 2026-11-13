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
  RefreshCw
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

export const CSENewsTab: React.FC<CSENewsTabProps> = ({
  holdings,
  newsItems,
  onAddDividendItem,
  onDeleteDividendItem,
}) => {
  const [ownershipFilter, setOwnershipFilter] = useState<'ALL' | 'OWNED' | 'NEW_OPPORTUNITY'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Quick Add Form State
  const [symbol, setSymbol] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [dividendAmount, setDividendAmount] = useState('');
  const [xdDate, setXdDate] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [sharePrice, setSharePrice] = useState('');
  const [notes, setNotes] = useState('');

  // What-If Simulator quantities for non-portfolio stocks (keyed by item id)
  const [simQuantities, setSimQuantities] = useState<Record<string, string>>({});
  // CSE Live Prices State for Watchlist / Dividend stocks
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);

  // Fetch live share prices from /api/cse/quote for all dividend items
  const syncLiveSharePrices = async () => {
    if (newsItems.length === 0) return;
    setIsFetchingPrices(true);

    const uniqueSymbols = Array.from(
      new Set(newsItems.map((item) => item.symbol.trim().toUpperCase()))
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
          // Keep existing price if CSE is offline
        }
      })
    );

    if (Object.keys(updatedPrices).length > 0) {
      setLivePrices((prev) => ({ ...prev, ...updatedPrices }));
    }
    setIsFetchingPrices(false);
  };

  // Automatically sync prices whenever dividend items load or change
  useEffect(() => {
    syncLiveSharePrices();
  }, [newsItems.length]);
  // Map owned holdings for instant lookup
  const ownedMap = new Map<string, Holding>();
  holdings.forEach((h) => {
    ownedMap.set(h.symbol.toUpperCase(), h);
    ownedMap.set(h.symbol.toUpperCase().split('.')[0], h);
  });

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

  const getXdBadge = (xdStr?: string | null) => {
    if (!xdStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const xd = new Date(xdStr);
    xd.setHours(0, 0, 0, 0);
    const diffDays = Math.round((xd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: `XD Passed (${Math.abs(diffDays)}d ago)`,
        cls: 'bg-slate-100 text-slate-500 border-slate-200',
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

  // Enrich items with live portfolio quantity & price
  const enrichedDividends = newsItems
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

  // Total expected dividend income across portfolio
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
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                CSE Dividend, XD & Payment Date Tracker
              </h2>
              <span className="text-2xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                100% Offline & Instant
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Record any CSE dividend announcement (for your 50 stocks or new watchlist stocks) to track XD Dates, Payment Dates & simulate payouts.
            </p>
          </div>

          {totalExpectedPortfolioDividend > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-right">
              
                  <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={syncLiveSharePrices}
              disabled={isFetchingPrices}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingPrices ? 'animate-spin' : ''}`} />
              <span>{isFetchingPrices ? 'Syncing CSE...' : 'Sync CSE Prices'}</span>
            </button>

            {totalExpectedPortfolioDividend > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-right">
                <span className="text-3xs uppercase font-semibold text-emerald-700 block">
                  Expected Portfolio Dividends
                </span>
                <span className="text-sm font-bold text-emerald-900 tabular-nums">
                  LKR {totalExpectedPortfolioDividend.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>  
              <span className="text-3xs uppercase font-semibold text-emerald-700 block">
                Expected Portfolio Dividends
              </span>
              <span className="text-sm font-bold text-emerald-900 tabular-nums">
                LKR {totalExpectedPortfolioDividend.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>

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

      {/* Saved Dividends, XD Dates & Payment Dates List */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: `All Dividends (${enrichedDividends.length})` },
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

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search symbol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 w-44 sm:w-52"
            />
          </div>
        </div>

        {filteredList.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            No Dividend / XD entries recorded yet. Enter a Stock Symbol, Dividend Rs., XD Date & Payment Date above to start tracking!
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredList.map((item) => {
              const xdBadge = getXdBadge(item.xdDate);
              const divYield =
                item.dividendAmount && item.resolvedPrice && item.resolvedPrice > 0
                  ? (item.dividendAmount / item.resolvedPrice) * 100
                  : null;

              // What-If Simulator calculations for Not In Portfolio stocks
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
                  {/* Left: Stock Info, Ownership Badge & What-If Simulator */}
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

                    {/* Owned Stock: Actual Expected Payout */}
                    {item.expectedTotalPayout !== null && (
                      <div className="text-2xs font-semibold text-emerald-800 flex items-center space-x-1.5">
                        <Coins className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          Your Total Dividend Payout: LKR{' '}
                          {item.expectedTotalPayout.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    {/* Not In Portfolio: Interactive "If I Buy X Shares" Dividend Simulator */}
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

                  {/* Right: Price, Dividend, XD Date, Payment Date & Delete */}
                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    
                    {/* Share Price + Verified Source Badge (Stacked Vertically) */}
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
                    {/* Dividend & Yield % */}
                    {item.dividendAmount && (
                      <div className="text-right bg-emerald-50/70 px-3 py-1.5 rounded-xl border border-emerald-200">
                        <span className="text-3xs text-emerald-700 block">Dividend (Yield)</span>
                        <span className="font-bold text-emerald-900 tabular-nums">
                          Rs. {item.dividendAmount.toFixed(2)}
                          {divYield !== null && ` (${divYield.toFixed(1)}%)`}
                        </span>
                      </div>
                    )}

                    {/* XD Date */}
                    {item.xdDate && (
                      <div className="text-right bg-sky-50 px-3 py-1.5 rounded-xl border border-sky-200">
                        <span className="text-3xs text-sky-700 font-semibold flex items-center justify-end space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>XD Date</span>
                        </span>
                        <span className="font-bold text-sky-950 font-mono">{item.xdDate}</span>
                      </div>
                    )}

                    {/* Payment Date */}
                    <div className="text-right bg-indigo-50/70 px-3 py-1.5 rounded-xl border border-indigo-200">
                      <span className="text-3xs text-indigo-700 font-semibold flex items-center justify-end space-x-1">
                        <Banknote className="w-3 h-3" />
                        <span>Payment Date</span>
                      </span>
                      <span className="font-bold text-indigo-950 font-mono">
                        {item.paymentDate || 'TBA'}
                      </span>
                    </div>

                    {/* Delete */}
                    {onDeleteDividendItem && (
                      <button
                        onClick={() => onDeleteDividendItem(item.id)}
                        title="Remove entry"
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
    </div>
  );
};