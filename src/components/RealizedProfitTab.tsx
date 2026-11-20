import React, { useState } from 'react';
import { AppState, ProfitWithdrawal, Trade } from '../types';
import { 
  Coins, 
  PiggyBank, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  History, 
  Percent, 
  FileCheck, 
  Layers, 
  ArrowRight,
  ShieldCheck,
  Check
} from 'lucide-react';

interface RealizedProfitTabProps {
  state: AppState;
  onRecordWithdrawal: (
    withdrawal: Omit<ProfitWithdrawal, 'id'>,
    autoRecordAmmaLedger: boolean
  ) => void;
  onOpenReceiptVault?: () => void;
}

export const RealizedProfitTab: React.FC<RealizedProfitTabProps> = ({
  state,
  onRecordWithdrawal,
  onOpenReceiptVault,
}) => {
  const { trades, wallet, settings } = state;

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDate, setWithdrawDate] = useState(new Date().toISOString().split('T')[0]);
  const [withdrawPurpose, setWithdrawPurpose] = useState('Payout to Amma');
  const [withdrawRef, setWithdrawRef] = useState('');
  const [autoRecordAmma, setAutoRecordAmma] = useState(true);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Profit & Split Calculations
  let totalRealizedProfit = 0;
  let totalReinvest70 = 0;
  let totalPayout30 = 0;
  let totalWinningTrades = 0;
  let totalLosingTrades = 0;

  trades.forEach((t) => {
    totalRealizedProfit += t.realizedPnL || 0;
    if (t.realizedPnL > 0) {
      totalWinningTrades++;
      totalReinvest70 += t.reinvest70 || (t.realizedPnL * 0.7);
      totalPayout30 += t.payout30 || (t.realizedPnL * 0.3);
    } else if (t.realizedPnL < 0) {
      totalLosingTrades++;
    }
  });

  const totalWithdrawn = wallet?.totalWithdrawn || 0;
  const availablePayout = Math.max(0, totalPayout30 - totalWithdrawn);

  const formatLKR = (num: number): string => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: settings.currency || 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const handleWithdrawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(withdrawAmount);
    if (isNaN(parsed) || parsed <= 0) {
      alert('Please enter a valid positive withdrawal amount.');
      return;
    }
    if (parsed > availablePayout) {
      alert(`Withdrawal amount cannot exceed available payout pool of ${formatLKR(availablePayout)}.`);
      return;
    }

    onRecordWithdrawal(
      {
        date: withdrawDate,
        amount: parsed,
        purpose: withdrawPurpose.trim() || 'Profit Payout',
        referenceSlip: withdrawRef.trim() || undefined,
      },
      autoRecordAmma
    );

    setSuccessNotice(`Withdrew ${formatLKR(parsed)} successfully.`);
    setWithdrawAmount('');
    setWithdrawRef('');
    setTimeout(() => setSuccessNotice(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
              Realized Profit & 70/30 Distribution Engine
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-medium border border-emerald-200">
              Active Strategy
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Profits from sold shares are automatically divided: 70% stays in buying power to compound capital, while 30% enters the liquid payout pool.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right">
            <span className="text-3xs text-slate-400 uppercase tracking-wider block">Available Cash Payout</span>
            <span className="text-xl font-bold text-sky-900 tabular-nums">
              {formatLKR(availablePayout)}
            </span>
          </div>
        </div>
      </div>

      {/* 3 Main KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Total Realized Net Profit */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">All-Time Realized Profit</span>
            <div className="p-2 bg-slate-50 text-slate-700 rounded-xl border border-slate-100">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-bold tracking-tight tabular-nums ${totalRealizedProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {formatLKR(totalRealizedProfit)}
          </div>
          <p className="text-2xs text-slate-500 mt-2">
            Across {trades.length} closed trade{trades.length === 1 ? '' : 's'} ({totalWinningTrades} profitable / {totalLosingTrades} loss)
          </p>
        </div>

        {/* 70% Re-Investment Pool */}
        <div className="bg-white rounded-2xl border border-emerald-200/80 p-6 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-emerald-800 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">70% Re-Investment Pool</span>
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-950 tracking-tight tabular-nums">
            {formatLKR(totalReinvest70)}
          </div>
          <p className="text-2xs text-emerald-700 mt-2">
            100% retained inside your CDS account for compounding stock purchases
          </p>
        </div>

        {/* 30% Liquid Payout Pool */}
        <div className="bg-white rounded-2xl border border-sky-200/80 p-6 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-sky-800 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">30% Withdrawable Payout</span>
            <div className="p-2 bg-sky-50 text-sky-700 rounded-xl border border-sky-200">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-sky-950 tracking-tight tabular-nums">
            {formatLKR(availablePayout)}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-sky-100 text-2xs text-sky-800">
            <span>Generated: {formatLKR(totalPayout30)}</span>
            <span>Withdrawn: {formatLKR(totalWithdrawn)}</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Withdrawal Form & History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Withdraw from Profit Engine (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Withdraw from Profit Pool
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Deduct available profit cash for Amma or bank withdrawal.
            </p>
          </div>

          {successNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center space-x-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{successNotice}</span>
            </div>
          )}

          {availablePayout <= 0 ? (
            <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
              Current available payout is <strong>Rs. 0.00</strong>. When you close winning positions, 30% of realized profits will accumulate here automatically.
            </div>
          ) : (
            <form onSubmit={handleWithdrawSubmit} className="space-y-4">
              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">
                  Amount to Withdraw (Max: {formatLKR(availablePayout)})
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
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    required
                    className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-semibold text-slate-700 mb-1">
                    Withdrawal Date
                  </label>
                  <input
                    type="date"
                    value={withdrawDate}
                    onChange={(e) => setWithdrawDate(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-semibold text-slate-700 mb-1">
                    Purpose / Recipient
                  </label>
                  <input
                    type="text"
                    value={withdrawPurpose}
                    onChange={(e) => setWithdrawPurpose(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-700 mb-1">
                  Bank Reference / Slip # (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bank Ref #59821 or Cheque #102"
                  value={withdrawRef}
                  onChange={(e) => setWithdrawRef(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <label className="flex items-center space-x-2 text-xs cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={autoRecordAmma}
                  onChange={(e) => setAutoRecordAmma(e.target.checked)}
                  className="rounded text-slate-900"
                />
                <span className="text-slate-700 text-2xs">
                  Auto-record in Amma's Capital Ledger as 30% Profit Payout
                </span>
              </label>

              <button
                type="submit"
                className="w-full py-2.5 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors shadow-2xs"
              >
                Execute Profit Withdrawal
              </button>
            </form>
          )}

          {/* Past Withdrawals List */}
          <div className="pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-900 mb-2">
              Withdrawal Log ({wallet?.withdrawals?.length || 0})
            </h4>
            {(!wallet?.withdrawals || wallet.withdrawals.length === 0) ? (
              <p className="text-2xs text-slate-400 italic">No withdrawals recorded yet.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {wallet.withdrawals.map((w) => (
                  <div key={w.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-slate-900 block">{w.purpose}</span>
                      <span className="text-3xs text-slate-400">{w.date} {w.referenceSlip ? `• Ref: ${w.referenceSlip}` : ''}</span>
                    </div>
                    <span className="font-bold text-rose-700 tabular-nums">-{formatLKR(w.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Closed Trades & 70/30 Allocation Table (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Closed Trades Breakdown
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Calculated directly from Sold contract notes: Net Sale Amount vs Cost Basis.
              </p>
            </div>
            {onOpenReceiptVault && (
              <button
                onClick={onOpenReceiptVault}
                className="text-2xs font-semibold text-teal-800 hover:text-teal-950 underline"
              >
                View in Receipt Vault
              </button>
            )}
          </div>

          {trades.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
              No closed trades recorded yet. Upload a Sold Contract Note or execute a stock sale to view the 70/30 split.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[460px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 text-2xs uppercase border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Stock</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Net Profit</th>
                    <th className="py-2.5 px-3 text-right">70% Re-Invest</th>
                    <th className="py-2.5 px-3 text-right">30% Payout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trades.map((t) => {
                    const isProfit = t.realizedPnL > 0;
                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{t.date}</td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-slate-900">{t.symbol}</span>
                          <span className="block text-3xs text-slate-400">{t.companyName}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">{t.quantity.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                          <span className={isProfit ? 'text-emerald-700' : 'text-rose-700'}>
                            {t.realizedPnL >= 0 ? '+' : ''}{formatLKR(t.realizedPnL)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-emerald-800 font-semibold tabular-nums">
                          {isProfit ? `+${formatLKR(t.reinvest70)}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-sky-800 font-semibold tabular-nums">
                          {isProfit ? `+${formatLKR(t.payout30)}` : '—'}
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
    </div>
  );
};
