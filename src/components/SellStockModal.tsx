import React, { useState } from 'react';
import { Holding, Trade } from '../types';
import { 
  DollarSign, 
  Coins, 
  TrendingUp, 
  TrendingDown, 
  X, 
  ArrowRight,
  ShieldCheck 
} from 'lucide-react';
import { calculateGainLossAndSplit, calculateCseTradeFees } from '../services/contractNoteService';

interface SellStockModalProps {
  holding: Holding;
  isOpen: boolean;
  onClose: () => void;
  currency: string;
  onConfirmSale: (
    trade: Trade,
    remainingQty: number,
    autoRecordAmmaLedger: boolean
  ) => void;
}

export const SellStockModal: React.FC<SellStockModalProps> = ({
  holding,
  isOpen,
  onClose,
  currency,
  onConfirmSale,
}) => {
  const [sellQty, setSellQty] = useState(holding.quantity);
  const [sellPrice, setSellPrice] = useState(
    holding.marketPrice !== null && holding.marketPrice > 0
      ? holding.marketPrice
      : holding.avgCostPrice
  );
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [autoRecordAmmaLedger, setAutoRecordAmmaLedger] = useState(true);

  if (!isOpen) return null;

  const validQty = Math.max(1, Math.min(sellQty, holding.quantity));
  const validPrice = Math.max(0.01, sellPrice);

  const fees = calculateCseTradeFees(validQty, validPrice, false);
  const split = calculateGainLossAndSplit(validQty, validPrice, holding.avgCostPrice);
  const remainingQty = holding.quantity - validQty;

  const formatLKR = (num: number): string => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: currency || 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const handleSellSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trade: Trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      date,
      type: 'SELL',
      symbol: holding.symbol,
      companyName: holding.companyName,
      quantity: validQty,
      price: validPrice,
      costBasisPrice: holding.avgCostPrice,
      grossConsideration: fees.grossConsideration,
      brokerageFee: fees.brokerageFee,
      secCess: fees.secCess,
      cdsFee: fees.cdsFee,
      shareTransactionLevy: fees.shareTransactionLevy,
      totalExpenses: fees.totalExpenses,
      netConsideration: fees.netConsideration,
      realizedPnL: split.realizedPnL,
      reinvest70: split.reinvest70,
      payout30: split.payout30,
      confidence: 'HIGH',
    };

    onConfirmSale(trade, remainingQty, autoRecordAmmaLedger);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-base font-semibold text-slate-900 flex items-center space-x-2">
              <span>Sell {holding.symbol}</span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold">
                CSE Sell Order
              </span>
            </h3>
            <p className="text-xs text-slate-500">{holding.companyName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSellSubmit} className="p-5 space-y-4">
          {/* Holding details & Breakeven target reminder */}
          <div className="grid grid-cols-3 gap-2.5 p-3.5 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-200/80">
            <div>
              <span className="text-slate-400 block text-2xs">Available Qty:</span>
              <span className="font-bold text-slate-900">{holding.quantity.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-2xs">Avg Buy Cost:</span>
              <span className="font-bold text-slate-900">Rs. {holding.avgCostPrice.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-2xs">Breakeven Target:</span>
              <span className="font-bold text-teal-800 font-mono">
                Rs. {(holding.avgCostPrice / 0.9888).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Quantity & Sell All */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">Quantity to Sell</label>
              <button
                type="button"
                onClick={() => setSellQty(holding.quantity)}
                className="text-2xs font-semibold text-slate-900 hover:underline"
              >
                Sell All ({holding.quantity.toLocaleString()})
              </button>
            </div>
            <input
              type="number"
              min="1"
              max={holding.quantity}
              value={sellQty}
              onChange={(e) => setSellQty(parseInt(e.target.value) || 0)}
              required
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold"
            />
          </div>

          {/* Execution Sell Price */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Sell Execution Price (Rs. / share)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={sellPrice}
              onChange={(e) => setSellPrice(parseFloat(e.target.value) || 0)}
              required
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold"
            />
          </div>

          {/* Trade Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Execution Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Real-time CSE 1.12% Fee Breakdown */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
            <div className="flex justify-between text-slate-600">
              <span>Gross Proceeds:</span>
              <span className="font-semibold text-slate-800">{formatLKR(fees.grossConsideration)}</span>
            </div>
            <div className="flex justify-between text-slate-500 text-2xs">
              <span>CSE Broker & Levies (1.12%):</span>
              <span>-Rs. {fees.totalExpenses.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200/80 pt-1">
              <span>Net Trade Proceeds:</span>
              <span>{formatLKR(fees.netConsideration)}</span>
            </div>
          </div>

          {/* Realized Gain/Loss & 70/30 Split Preview */}
          <div
            className={`p-3.5 rounded-xl border ${
              split.isProfit
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-rose-50 border-rose-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold flex items-center space-x-1.5">
                {split.isProfit ? (
                  <TrendingUp className="w-4 h-4 text-emerald-700" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-rose-700" />
                )}
                <span className={split.isProfit ? 'text-emerald-900' : 'text-rose-900'}>
                  Realized Net P&L: {split.realizedPnL >= 0 ? '+' : ''}{formatLKR(split.realizedPnL)}
                </span>
              </span>
            </div>

            {split.isProfit ? (
              <div className="mt-2.5 pt-2 border-t border-emerald-200 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white p-2 rounded-lg border border-emerald-100">
                  <span className="text-3xs text-emerald-700 font-semibold block">70% Re-investment:</span>
                  <span className="text-emerald-900 font-bold text-sm">+{formatLKR(split.reinvest70)}</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-emerald-100">
                  <span className="text-3xs text-sky-700 font-semibold block">30% Amma Payout:</span>
                  <span className="text-sky-900 font-bold text-sm">+{formatLKR(split.payout30)}</span>
                </div>
              </div>
            ) : (
              <p className="text-2xs text-rose-700 mt-1">
                Net capital loss after 1.12% CSE fees — 0 profit distribution. Breakeven target price is Rs. {(holding.avgCostPrice / 0.9888).toFixed(2)}.
              </p>
            )}
          </div>

          {/* Checkbox for Ledger Auto-post */}
          {split.isProfit && (
            <label className="flex items-center space-x-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={autoRecordAmmaLedger}
                onChange={(e) => setAutoRecordAmmaLedger(e.target.checked)}
                className="rounded text-slate-900"
              />
              <span className="text-slate-800 font-medium">
                Automatically record 30% payout (+{formatLKR(split.payout30)}) in Amma's Capital Ledger
              </span>
            </label>
          )}

          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition-colors shadow-xs"
            >
              Execute Sale & Log Trade
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
