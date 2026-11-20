import React from 'react';
import { AppState } from '../types';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  PiggyBank, 
  Coins 
} from 'lucide-react';

interface SummaryMetricsProps {
  state: AppState;
  onOpenProfitTab?: () => void;
}

export const SummaryMetrics: React.FC<SummaryMetricsProps> = ({ state, onOpenProfitTab }) => {
  const { holdings, ledger, trades, wallet, settings } = state;

  const feeRate = (settings.brokerageRatePercent ?? 1.12) / 100;

  // Portfolio calculations (Net of 1.12% Sales Commission, matching ATrad)
  let portfolioCost = 0;
  let portfolioMarketVal = 0;
  let netSalesProceedsVal = 0;
  let unpricedCount = 0;

  holdings.forEach((h) => {
    const cost = h.quantity * h.avgCostPrice;
    portfolioCost += cost;
    if (h.marketPrice !== null && h.marketPrice > 0) {
      const grossMktVal = h.quantity * h.marketPrice;
      const salesCommission = grossMktVal * feeRate;
      portfolioMarketVal += grossMktVal;
      netSalesProceedsVal += grossMktVal - salesCommission;
    } else {
      portfolioMarketVal += cost; // Retain cost basis if price unverified
      netSalesProceedsVal += cost;
      unpricedCount++;
    }
  });

  // Net Unrealized P&L after deducting 1.12% selling commission (matches ATrad)
  const unrealizedPnL = netSalesProceedsVal - portfolioCost;
  const unrealizedPnLPercent = portfolioCost > 0 ? (unrealizedPnL / portfolioCost) * 100 : 0;

  // Realized trading P&L
  let realizedPnL = 0;
  let totalReinvest = 0;
  let totalPayout = 0;

  trades.forEach((t) => {
    realizedPnL += t.realizedPnL || 0;
    totalReinvest += t.reinvest70 || 0;
    totalPayout += t.payout30 || 0;
  });

  const totalWithdrawn = wallet?.totalWithdrawn || 0;
  const availablePayout = Math.max(0, totalPayout - totalWithdrawn);

  // Amma's Capital Ledger metrics
  let capitalInjected = 0;
  let capitalReturned = 0;

  ledger.forEach((entry) => {
    if (entry.type === 'CAPITAL_INJECTION') {
      capitalInjected += entry.amount;
    } else if (entry.type === 'CAPITAL_RETURN') {
      capitalReturned += Math.abs(entry.amount);
    }
  });

  const netActiveCapital = capitalInjected - capitalReturned;

  const formatLKR = (num: number): string => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: settings.currency || 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-7">
      {/* 1. Portfolio Current Value */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              CSE Portfolio Value
            </span>
            <div className="p-2 bg-slate-50 text-teal-800 rounded-xl border border-slate-100">
              <Wallet className="w-4 h-4 text-teal-700" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums">
            {formatLKR(portfolioMarketVal)}
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-xs">
          <span className="text-slate-500">Cost: {formatLKR(portfolioCost)}</span>
          <span className="text-slate-400 font-medium">{holdings.length} stocks</span>
        </div>
      </div>

      {/* 2. Net Unrealized P&L (After 1.12% Sales Commission) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Unrealized P&L (Net)
            </span>
            <div
              className={`p-2 rounded-xl border ${
                unrealizedPnL > 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : unrealizedPnL < 0
                  ? 'bg-rose-50 text-rose-700 border-rose-100'
                  : 'bg-slate-50 text-slate-600 border-slate-100'
              }`}
            >
              {unrealizedPnL >= 0 ? (
                <ArrowUpRight className="w-4 h-4 text-[#15803D]" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-[#B91C1C]" />
              )}
            </div>
          </div>
          <div
            className={`text-2xl font-bold tracking-tight tabular-nums ${
              unrealizedPnL > 0
                ? 'text-[#15803D]'
                : unrealizedPnL < 0
                ? 'text-[#B91C1C]'
                : 'text-slate-900'
            }`}
          >
            {unrealizedPnL >= 0 ? '+' : ''}
            {formatLKR(unrealizedPnL)}
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-xs">
          <span
            className={`font-semibold tabular-nums ${
              unrealizedPnLPercent > 0
                ? 'text-[#15803D]'
                : unrealizedPnLPercent < 0
                ? 'text-[#B91C1C]'
                : 'text-slate-500'
            }`}
          >
            {unrealizedPnLPercent >= 0 ? '+' : ''}
            {unrealizedPnLPercent.toFixed(2)}%
          </span>
          {unpricedCount > 0 ? (
            <span className="text-amber-700 text-2xs bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 font-medium">
              {unpricedCount} unpriced
            </span>
          ) : (
            <span className="text-slate-400 text-2xs font-medium">
              After {settings.brokerageRatePercent || 1.12}% fee
            </span>
          )}
        </div>
      </div>

      {/* 3. Realized Profit & 70/30 Split */}
      <div 
        onClick={onOpenProfitTab}
        className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between cursor-pointer group"
      >
        <div>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-teal-700 transition-colors">
              Realized Profit (70/30)
            </span>
            <div className="p-2 bg-teal-50 text-teal-800 rounded-xl border border-teal-100">
              <Coins className="w-4 h-4 text-teal-700" />
            </div>
          </div>
          <div
            className={`text-2xl font-bold tracking-tight tabular-nums ${
              realizedPnL > 0
                ? 'text-[#15803D]'
                : realizedPnL < 0
                ? 'text-[#B91C1C]'
                : 'text-slate-900'
            }`}
          >
            {realizedPnL >= 0 ? '+' : ''}
            {formatLKR(realizedPnL)}
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-xs">
          <span className="text-slate-600 text-2xs">
            70% Reinvest: <span className="font-semibold text-teal-900">{formatLKR(totalReinvest)}</span>
          </span>
          <span className="text-sky-800 text-2xs font-semibold">
            Payout: {formatLKR(availablePayout)}
          </span>
        </div>
      </div>

      {/* 4. Amma's Active Capital */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Amma's Active Capital
            </span>
            <div className="p-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-100">
              <PiggyBank className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums">
            {formatLKR(netActiveCapital)}
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-xs">
          <span className="text-slate-500">Injected: {formatLKR(capitalInjected)}</span>
          <span className="text-slate-500">Returned: {formatLKR(capitalReturned)}</span>
        </div>
      </div>
    </div>
  );
};