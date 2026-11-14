import React, { useState } from 'react';
import { Holding } from '../types';
import { Plus, X, Building2 } from 'lucide-react';
import { normalizeCseSymbol } from '../services/excelImporter';

interface AddHoldingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddHolding: (holding: Holding) => void;
}

export const AddHoldingModal: React.FC<AddHoldingModalProps> = ({
  isOpen,
  onClose,
  onAddHolding,
}) => {
  const [symbol, setSymbol] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgCostPrice, setAvgCostPrice] = useState('');
  const [marketPrice, setMarketPrice] = useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSym = normalizeCseSymbol(symbol);
    const qty = parseInt(quantity, 10);
    const cost = parseFloat(avgCostPrice);
    const mkt = marketPrice ? parseFloat(marketPrice) : null;

    if (!cleanSym || isNaN(qty) || qty <= 0 || isNaN(cost) || cost <= 0) {
      alert('Please enter valid symbol, positive quantity, and cost price.');
      return;
    }

    const newHolding: Holding = {
      id: `holding_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      symbol: cleanSym,
      companyName: companyName.trim() || cleanSym,
      quantity: qty,
      avgCostPrice: cost,
      marketPrice: mkt !== null && !isNaN(mkt) && mkt > 0 ? mkt : null,
      priceSource: mkt !== null && !isNaN(mkt) && mkt > 0 ? 'MANUAL' : 'PENDING',
      priceAsOf: mkt !== null ? 'Manual Entry' : null,
      priceError: mkt === null ? 'Price pending live CSE verification' : null,
      notes: notes.trim() || undefined,
    };

    onAddHolding(newHolding);
    onClose();
    setSymbol('');
    setCompanyName('');
    setQuantity('');
    setAvgCostPrice('');
    setMarketPrice('');
    setNotes('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-slate-100 text-slate-800 rounded-lg">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Add Stock Position
              </h3>
              <p className="text-xs text-slate-500">Colombo Stock Exchange (CSE)</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Symbol */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Stock Symbol
            </label>
            <input
              type="text"
              placeholder="e.g. COMB.N0000, JKH.N0000, SAMP.N0000"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              required
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-mono"
            />
          </div>

          {/* Company Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Company Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Commercial Bank of Ceylon PLC"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Quantity & Buy Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Quantity
              </label>
              <input
                type="number"
                min="1"
                placeholder="1000"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Avg Cost (Rs. / share)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="115.50"
                value={avgCostPrice}
                onChange={(e) => setAvgCostPrice(e.target.value)}
                required
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* Initial Market Price */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Current Market Price (Rs. / share, Optional)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Leave blank to fetch live from site:cse.lk"
              value={marketPrice}
              onChange={(e) => setMarketPrice(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
            <span className="text-3xs text-slate-400 mt-1 block">
              If left blank, price will be verified via live search grounding on site:cse.lk
            </span>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Notes / Strategy (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Dividend yield play or bought via Asia Sec"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
          </div>

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
              className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-xs"
            >
              Add to Portfolio
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
