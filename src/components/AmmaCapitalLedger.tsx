import React, { useState, useRef } from 'react';
import { LedgerEntry, LedgerEntryType } from '../types';
import { 
  PiggyBank, 
  Plus, 
  Minus, 
  ArrowUpRight, 
  ArrowDownLeft, 
  FileSpreadsheet, 
  Trash2, 
  Calendar,
  DollarSign,
  Receipt,
  FileCheck,
  Percent,
  UploadCloud,
  FileText,
  Eye,
  X
} from 'lucide-react';

interface AmmaCapitalLedgerProps {
  ledger: LedgerEntry[];
  currency: string;
  onAddEntry: (entry: Omit<LedgerEntry, 'id' | 'runningBalance'>) => void;
  onDeleteEntry: (id: string) => void;
}

export const AmmaCapitalLedger: React.FC<AmmaCapitalLedgerProps> = ({
  ledger,
  currency,
  onAddEntry,
  onDeleteEntry,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [viewingSlip, setViewingSlip] = useState<{ url: string; name: string } | null>(null);

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<LedgerEntryType>('CAPITAL_INJECTION');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [referenceSlip, setReferenceSlip] = useState('');
  const [slipFileData, setSlipFileData] = useState<string | undefined>(undefined);
  const [slipFileName, setSlipFileName] = useState<string | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatLKR = (num: number): string => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: currency || 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  // Sort chronologically and compute running balances
  const sortedLedger = [...ledger].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let currentRunning = 0;
  let totalInjected = 0;
  let totalReturned = 0;
  let totalProfitPaid = 0;
  let totalReinvested = 0;

  const computedRows = sortedLedger.map((item) => {
    if (item.type === 'CAPITAL_INJECTION') {
      currentRunning += item.amount;
      totalInjected += item.amount;
    } else if (item.type === 'CAPITAL_RETURN') {
      currentRunning -= Math.abs(item.amount);
      totalReturned += Math.abs(item.amount);
    } else if (item.type === 'PROFIT_SHARE_30') {
      totalProfitPaid += item.amount;
    } else if (item.type === 'REINVESTMENT_70') {
      currentRunning += item.amount;
      totalReinvested += item.amount;
    } else if (item.type === 'EXPENSE_ADJUSTMENT') {
      currentRunning -= Math.abs(item.amount);
    } else {
      currentRunning += item.amount;
    }

    return {
      ...item,
      runningBalance: currentRunning,
    };
  });

  const netActiveCapital = totalInjected - totalReturned;

  const filteredRows = computedRows.filter((r) => {
    if (filterType === 'ALL') return true;
    return r.type === filterType;
  });

  const handleOpenAddCapital = () => {
    setType('CAPITAL_INJECTION');
    setDescription('Capital deposit to CDS account');
    setSlipFileData(undefined);
    setSlipFileName(undefined);
    setIsModalOpen(true);
  };

  const handleOpenRecordPayout = () => {
    setType('PROFIT_SHARE_30');
    setDescription('30% Profit share payout to Amma');
    setSlipFileData(undefined);
    setSlipFileName(undefined);
    setIsModalOpen(true);
  };

  const handleSlipFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSlipFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setSlipFileData(event.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }

    onAddEntry({
      date,
      type,
      amount: parsedAmount,
      description: description.trim() || getDefaultDescription(type),
      referenceSlip: referenceSlip.trim() || undefined,
      slipFileData,
      slipFileName,
    });

    setIsModalOpen(false);
    setAmount('');
    setDescription('');
    setReferenceSlip('');
    setSlipFileData(undefined);
    setSlipFileName(undefined);
  };

  const getDefaultDescription = (entryType: LedgerEntryType): string => {
    switch (entryType) {
      case 'CAPITAL_INJECTION':
        return 'Capital deposit to CDS account';
      case 'CAPITAL_RETURN':
        return 'Capital withdrawal to bank account';
      case 'PROFIT_SHARE_30':
        return '30% Profit share payout to Amma';
      case 'REINVESTMENT_70':
        return '70% Profit retained for reinvestment';
      case 'EXPENSE_ADJUSTMENT':
        return 'Brokerage or statutory fee adjustment';
      default:
        return 'Capital adjustment';
    }
  };

  const exportLedgerCsv = () => {
    if (computedRows.length === 0) return;
    const headers = ['Date', 'Type', 'Amount (LKR)', 'Running Active Capital (LKR)', 'Reference Slip', 'Description'];
    const lines = computedRows.map((r) => [
      r.date,
      r.type,
      r.amount.toFixed(2),
      (r.runningBalance ?? 0).toFixed(2),
      r.referenceSlip || '',
      `"${r.description.replace(/"/g, '""')}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...lines.map((l) => l.join(','))].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', `amma_capital_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-6">
      {/* Metric Cards Starting at Genuine Rs. 0.00 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Active Capital */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wider">Amma's Active Capital</span>
            <div className="p-1 bg-amber-50 text-amber-700 rounded-md border border-amber-100">
              <PiggyBank className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {formatLKR(netActiveCapital)}
          </div>
          <p className="text-2xs text-slate-500 mt-1">
            Current principal deployed in CDS account
          </p>
        </div>

        {/* Capital Injected */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wider">Total Injected</span>
            <div className="p-1 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {formatLKR(totalInjected)}
          </div>
          <p className="text-2xs text-slate-500 mt-1">
            Cumulative principal provided by Amma
          </p>
        </div>

        {/* Capital Returned */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wider">Capital Returned</span>
            <div className="p-1 bg-slate-50 text-slate-700 rounded-md border border-slate-200">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {formatLKR(totalReturned)}
          </div>
          <p className="text-2xs text-slate-500 mt-1">
            Principal withdrawn back to bank account
          </p>
        </div>

        {/* 30% Profit Payouts Distributed */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wider">30% Profit Payouts</span>
            <div className="p-1 bg-sky-50 text-sky-700 rounded-md border border-sky-100">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-sky-900 tracking-tight">
            {formatLKR(totalProfitPaid)}
          </div>
          <p className="text-2xs text-slate-500 mt-1">
            Profits paid out to Amma from winning trades
          </p>
        </div>
      </div>

      {/* Ledger Table Container */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Table Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              Amma's Capital Transactions
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Auditable records of capital injections, bank slips, and 30% profit payouts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-slate-900 text-slate-700"
            >
              <option value="ALL">All Transaction Types</option>
              <option value="CAPITAL_INJECTION">Capital Injections</option>
              <option value="CAPITAL_RETURN">Capital Returns</option>
              <option value="PROFIT_SHARE_30">30% Profit Payouts</option>
              <option value="REINVESTMENT_70">70% Re-investments</option>
            </select>

            {/* Export CSV */}
            {computedRows.length > 0 && (
              <button
                onClick={exportLedgerCsv}
                className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                <span>Export CSV</span>
              </button>
            )}

            {/* Record Payout to Amma Button */}
            <button
              onClick={handleOpenRecordPayout}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors shadow-2xs"
            >
              <Minus className="w-3.5 h-3.5 text-sky-600" />
              <span>Record Payout to Amma</span>
            </button>

            {/* Add Capital Button */}
            <button
              onClick={handleOpenAddCapital}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Capital</span>
            </button>
          </div>
        </div>

        {/* Empty State */}
        {computedRows.length === 0 ? (
          <div className="py-16 px-4 text-center max-w-md mx-auto">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4 border border-amber-200">
              <PiggyBank className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              Ledger Balance: Rs. 0.00
            </h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              No capital entries exist yet. Record Amma's initial capital injection (e.g., bank transfer or cheque with bank slip upload) to begin tracking active capital and profit distributions.
            </p>
            <div className="flex items-center justify-center space-x-2">
              <button
                onClick={handleOpenAddCapital}
                className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Capital (Deposit)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold uppercase tracking-wider text-2xs">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Ref Slip #</th>
                  <th className="py-3 px-4 text-center">Bank Slip</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-right">Running Active Capital</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => {
                  const isInflow =
                    row.type === 'CAPITAL_INJECTION' || row.type === 'REINVESTMENT_70';
                  const isReturn = row.type === 'CAPITAL_RETURN';
                  const isProfit = row.type === 'PROFIT_SHARE_30';

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                        {row.date}
                      </td>
                      <td className="py-3 px-4">
                        {row.type === 'CAPITAL_INJECTION' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Capital Injection
                          </span>
                        )}
                        {row.type === 'CAPITAL_RETURN' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            Capital Return
                          </span>
                        )}
                        {row.type === 'PROFIT_SHARE_30' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium bg-sky-50 text-sky-700 border border-sky-200">
                            30% Profit Payout
                          </span>
                        )}
                        {row.type === 'REINVESTMENT_70' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                            70% Re-investment
                          </span>
                        )}
                        {row.type === 'EXPENSE_ADJUSTMENT' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            Expense Adjustment
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700 max-w-sm truncate" title={row.description}>
                        {row.description}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-2xs">
                        {row.referenceSlip || '—'}
                      </td>
                      {/* Bank Slip Attachment */}
                      <td className="py-3 px-4 text-center">
                        {row.slipFileData ? (
                          <button
                            onClick={() => setViewingSlip({ url: row.slipFileData!, name: row.slipFileName || 'Bank Slip' })}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-3xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            title="View Attached Bank Slip"
                          >
                            <Eye className="w-3 h-3 text-slate-500" />
                            <span>View Slip</span>
                          </button>
                        ) : (
                          <span className="text-3xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold">
                        <span
                          className={
                            isInflow
                              ? 'text-emerald-700'
                              : isReturn
                              ? 'text-rose-700'
                              : isProfit
                              ? 'text-sky-700'
                              : 'text-slate-800'
                          }
                        >
                          {isInflow ? '+' : isReturn ? '-' : ''}
                          {formatLKR(row.amount)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-900">
                        {formatLKR(row.runningBalance ?? 0)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            if (window.confirm('Delete this ledger entry?')) {
                              onDeleteEntry(row.id);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          title="Delete Entry"
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

      {/* Add / Payout Capital Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-amber-50 text-amber-700 rounded-lg border border-amber-200">
                  <PiggyBank className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {type === 'PROFIT_SHARE_30' ? 'Record Payout to Amma' : 'Record Capital Entry'}
                  </h3>
                  <p className="text-xs text-slate-500">Amma's Capital Ledger</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Transaction Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Transaction Type
                </label>
                <select
                  value={type}
                  onChange={(e) => {
                    const newType = e.target.value as LedgerEntryType;
                    setType(newType);
                    setDescription(getDefaultDescription(newType));
                  }}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  <option value="CAPITAL_INJECTION">Capital Injection (+ Add Capital to CDS)</option>
                  <option value="PROFIT_SHARE_30">Profit Share (- Payout to Amma)</option>
                  <option value="CAPITAL_RETURN">Capital Return (Principal Withdrawn)</option>
                  <option value="REINVESTMENT_70">Re-investment Addition (70% Retained)</option>
                  <option value="EXPENSE_ADJUSTMENT">Expense / Fee Adjustment</option>
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Amount in Sri Lankan Rupees (LKR)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    Rs.
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full text-xs pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold"
                  />
                </div>
              </div>

              {/* Reference Slip / Bank Cheque */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reference Slip / Cheque # (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bank Ref #48921 or Asia Sec Receipt #772"
                  value={referenceSlip}
                  onChange={(e) => setReferenceSlip(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {/* Bank Slip Upload */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bank Deposit Slip / Receipt (Image or PDF)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border border-dashed border-slate-300 hover:border-slate-400 rounded-lg p-2.5 text-center cursor-pointer bg-slate-50 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2 text-xs text-slate-600">
                    <UploadCloud className="w-4 h-4 text-slate-400" />
                    <span className="truncate max-w-[200px]">
                      {slipFileName || 'Upload bank transfer slip...'}
                    </span>
                  </div>
                  <span className="text-2xs font-semibold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                    Browse
                  </span>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleSlipFileUpload}
                  accept="image/*,.pdf"
                  className="hidden"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description / Notes
                </label>
                <input
                  type="text"
                  placeholder={getDefaultDescription(type)}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-xs"
                >
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slip Viewer Modal */}
      {viewingSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">{viewingSlip.name}</h3>
              <button
                onClick={() => setViewingSlip(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex items-center justify-center bg-slate-100/50 flex-1">
              {viewingSlip.url.startsWith('data:application/pdf') ? (
                <iframe
                  src={viewingSlip.url}
                  className="w-full h-[60vh] border-0 rounded-lg"
                  title="Bank Slip PDF"
                />
              ) : (
                <img
                  src={viewingSlip.url}
                  alt={viewingSlip.name}
                  className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-xs"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
