import React, { useState } from 'react';
import { AppState, AppSettings } from '../types';
import { 
  Settings, 
  ShieldCheck, 
  Download, 
  Upload, 
  RotateCcw, 
  Check, 
  Building2, 
  Percent, 
  FileJson,
  Info
} from 'lucide-react';
import { exportBackup, parseBackupFile } from '../services/storage';

interface SettingsTabProps {
  state: AppState;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onResetAllData: () => void;
  onRestoreState: (newState: AppState) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  state,
  onUpdateSettings,
  onResetAllData,
  onRestoreState,
}) => {
  const [cdsAccountNumber, setCdsAccountNumber] = useState(state.settings.cdsAccountNumber || '');
  const [brokerageRate, setBrokerageRate] = useState(state.settings.brokerageRatePercent || 1.12);
  const [reinvestRatio, setReinvestRatio] = useState(state.settings.reinvestRatioPercent || 70);
  const [payoutRatio, setPayoutRatio] = useState(state.settings.payoutRatioPercent || 30);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      ...state.settings,
      cdsAccountNumber: cdsAccountNumber.trim(),
      brokerageRatePercent: Number(brokerageRate),
      reinvestRatioPercent: Number(reinvestRatio),
      payoutRatioPercent: Number(payoutRatio),
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const restored = await parseBackupFile(file);
      if (
        window.confirm(
          `Restore backup file (${restored.holdings.length} stocks, ${restored.ledger.length} ledger entries)? Current data will be replaced.`
        )
      ) {
        onRestoreState(restored);
      }
    } catch (err: any) {
      alert(`Invalid backup file: ${err?.message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Settings Form */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Trading & Split Preferences
            </h2>
            <p className="text-xs text-slate-500">
              Configure CDS account details, brokerage rate, and Amma's profit allocation.
            </p>
          </div>
          <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
            <Settings className="w-5 h-5" />
          </div>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-5">
          {/* CDS Account Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              CDS Account Number
            </label>
            <input
              type="text"
              placeholder="e.g. ASIA-00984-IS/00"
              value={cdsAccountNumber}
              onChange={(e) => setCdsAccountNumber(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-mono"
            />
            <span className="text-3xs text-slate-400 mt-1 block">
              Central Depository System account identifier for contract note reconciliation.
            </span>
          </div>

          {/* Brokerage & Statutory Levies Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                CSE Total Levies (%)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={brokerageRate}
                onChange={(e) => setBrokerageRate(parseFloat(e.target.value) || 0)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold"
              />
              <span className="text-3xs text-slate-400 mt-1 block">
                Standard CSE rate is 1.12% (Brokerage + SEC + CDS + STL).
              </span>
            </div>

            {/* Reinvestment Ratio */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Re-investment Ratio (%)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={reinvestRatio}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setReinvestRatio(val);
                  setPayoutRatio(100 - val);
                }}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold text-emerald-800"
              />
              <span className="text-3xs text-slate-400 mt-1 block">
                Default: 70% retained for capital growth.
              </span>
            </div>

            {/* Amma Payout Ratio */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Amma's Payout (%)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={payoutRatio}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setPayoutRatio(val);
                  setReinvestRatio(100 - val);
                }}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 font-semibold text-sky-800"
              />
              <span className="text-3xs text-slate-400 mt-1 block">
                Default: 30% distributed to Amma.
              </span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            {savedSuccess ? (
              <span className="inline-flex items-center space-x-1 text-xs text-emerald-700 font-semibold">
                <Check className="w-4 h-4" />
                <span>Settings saved successfully</span>
              </span>
            ) : (
              <span />
            )}
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-xs"
            >
              Save Preferences
            </button>
          </div>
        </form>
      </div>

      {/* Backup & Persistence Panel */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/50">
          <h2 className="text-base font-semibold text-slate-900">
            Data Safety & 1-Click Backups
          </h2>
          <p className="text-xs text-slate-500">
            All data is persisted in your local browser storage (IndexedDB + LocalStorage). Export full JSON backups for safekeeping.
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-400 block text-2xs">Active Holdings:</span>
              <span className="font-bold text-slate-900 text-sm">{state.holdings.length} stocks</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-400 block text-2xs">Ledger Records:</span>
              <span className="font-bold text-slate-900 text-sm">{state.ledger.length} entries</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-400 block text-2xs">Realized Trades:</span>
              <span className="font-bold text-slate-900 text-sm">{state.trades.length} trades</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => exportBackup(state)}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-800 shadow-2xs"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Download Full JSON Backup</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-800 shadow-2xs"
            >
              <Upload className="w-4 h-4 text-sky-600" />
              <span>Restore from Backup File</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleRestoreFile}
              accept=".json"
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Zero Hardcoding Policy & Danger Zone */}
      <div className="bg-white rounded-xl border border-rose-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-rose-100 bg-rose-50/40 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-rose-900">
              Strict Zero-Hardcoding Architecture
            </h2>
            <p className="text-xs text-rose-700">
              Delete all data and reset every table, counter, and ledger to genuine 0.00.
            </p>
          </div>
        </div>

        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-600 max-w-md">
            This purges all portfolio holdings, Amma's Capital Ledger transactions, and trading history. No fake placeholder rows will be created. Everything will start at genuine 0.00.
          </div>
          <button
            onClick={onResetAllData}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors whitespace-nowrap shadow-2xs"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset All Data to Genuine 0.00</span>
          </button>
        </div>
      </div>
    </div>
  );
};
