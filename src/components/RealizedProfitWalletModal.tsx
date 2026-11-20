import React, { useState } from 'react';
import { ProfitWallet, ProfitWithdrawal } from '../types';
import { 
  Coins, 
  PiggyBank, 
  ArrowUpRight, 
  ArrowDownLeft, 
  X, 
  Check, 
  History, 
  AlertCircle,
  Percent,
  Wallet
} from 'lucide-react';

interface RealizedProfitWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency: string;
  totalRealizedProfit: number;
  totalReinvest70: number;
  totalPayout30: number;
  wallet: ProfitWallet;
  onRecordWithdrawal: (
    withdrawal: Omit<ProfitWithdrawal, 'id'>,
    autoRecordAmmaLedger: boolean
  ) => void;
  onDeleteWithdrawal?: (id: string) => void;
}

export const RealizedProfitWalletModal: React.FC<RealizedProfitWalletModalProps> = ({
  isOpen,
  onClose,
  currency,
  totalRealizedProfit,
  totalReinvest70,
  totalPayout30,
  wallet,
  onRecordWithdrawal,
  onDeleteWithdrawal,
}) => {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [purpose, setPurpose] = useState('Payout to Amma');
  const [referenceSlip, setReferenceSlip] = useState('');
  const [autoRecordAmmaLedger, setAutoRecordAmmaLedger] = useState(true);

  if (!isOpen) return null;

  const totalWithdrawn = wallet.totalWithdrawn || 0;
  const availablePayout = Math.max(0, totalPayout30 - totalWithdrawn);

  const formatLKR = (num: number): string => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: currency || 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const handleWithdrawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const withdrawAmt = parseFloat(amount);
    if (isNaN(withdrawAmt) || withdrawAmt <= 0) {
      alert('Please enter a valid positive withdrawal amount.');
      return;
    }
    if (withdrawAmt > availablePayout) {
      alert(`Withdrawal amount cannot exceed available payout pool of ${formatLKR(availablePayout)}.`);
      return;
    }

    onRecordWithdrawal(
      {
        date,
        amount: withdrawAmt,
        purpose: purpose.trim() || 'Profit Payout',
        referenceSlip: referenceSlip.trim() || undefined,
      },
      autoRecordAmmaLedger
    );

    setAmount('');
    setReferenceSlip('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Realized Profit Wallet & 70/30 Split
              </h3>
              <p className="text-xs text-slate-500">
                Manage capital re-investment pool and withdrawable profit share.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Pools Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Total Realized Profit */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-3xs uppercase font-semibold text-slate-400 block mb-0.5">
                Total Realized Profit
              </span>
              <span className={`text-base font-bold ${totalRealizedProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatLKR(totalRealizedProfit)}
              </span>
            </div>

            {/* 70% Re-Investment Pool */}
            <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200">
              <span className="text-3xs uppercase font-semibold text-emerald-700 block mb-0.5">
                70% Re-Invest Pool
              </span>
              <span className="text-base font-bold text-emerald-900">
                {formatLKR(totalReinvest70)}
              </span>
              <span className="text-3xs text-emerald-700 block mt-0.5">For buying new stocks</span>
            </div>

            {/* 30% Available Payout Pool */}
            <div className="p-3 bg-sky-50/60 rounded-xl border border-sky-200">
              <span className="text-3xs uppercase font-semibold text-sky-700 block mb-0.5">
                Available Payout
              </span>
              <span className="text-base font-bold text-sky-900">
                {formatLKR(availablePayout)}
              </span>
              <span className="text-3xs text-sky-700 block mt-0.5">
                Total 30%: {formatLKR(totalPayout30)}
              </span>
            </div>
          </div>

          {/* Withdraw From Profit Form */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-900 flex items-center justify-between">
              <span>Withdraw from Profit Pool</span>
              <span className="text-2xs font-normal text-slate-500">
                Max Withdrawable: <span className="font-semibold text-slate-800">{formatLKR(availablePayout)}</span>
              </span>
            </h4>

            {availablePayout <= 0 ? (
              <p className="text-xs text-slate-500 italic bg-white p-3 rounded-lg border border-slate-200">
                0 withdrawable profit available right now. Close profitable trades in the portfolio to populate the 30% payout pool.
              </p>
            ) : (
              <form onSubmit={handleWithdrawSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-2xs font-semibold text-slate-700 mb-1">
                      Withdrawal Amount (LKR)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        Rs.
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={availablePayout}
                        placeholder={availablePayout.toFixed(2)}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                        className="w-full text-xs pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-2xs font-semibold text-slate-700 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                      className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-2xs font-semibold text-slate-700 mb-1">
                      Purpose / Recipient
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Paid to Amma (Dividend), Personal Cash"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-2xs font-semibold text-slate-700 mb-1">
                      Bank Ref / Cheque # (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Slip #58921"
                      value={referenceSlip}
                      onChange={(e) => setReferenceSlip(e.target.value)}
                      className="w-full text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                <label className="flex items-center space-x-2 text-xs cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={autoRecordAmmaLedger}
                    onChange={(e) => setAutoRecordAmmaLedger(e.target.checked)}
                    className="rounded text-slate-900"
                  />
                  <span className="text-slate-700">
                    Auto-record this withdrawal in Amma's Capital Ledger as 30% Profit Payout
                  </span>
                </label>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition-colors shadow-2xs"
                  >
                    Withdraw from Profit Pool
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Past Profit Withdrawals History */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
              <History className="w-3.5 h-3.5 text-slate-500" />
              <span>Withdrawal History ({wallet.withdrawals?.length || 0})</span>
            </h4>

            {(!wallet.withdrawals || wallet.withdrawals.length === 0) ? (
              <p className="text-2xs text-slate-400 italic">
                No profit withdrawals recorded yet.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 text-2xs uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Purpose</th>
                      <th className="py-2 px-3">Ref Slip</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {wallet.withdrawals.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{w.date}</td>
                        <td className="py-2 px-3 text-slate-800 font-medium">{w.purpose}</td>
                        <td className="py-2 px-3 text-slate-500 font-mono text-2xs">{w.referenceSlip || '—'}</td>
                        <td className="py-2 px-3 text-right font-bold text-rose-700">
                          -{formatLKR(w.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-end bg-slate-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
