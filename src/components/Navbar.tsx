import React, { useRef } from 'react';
import { 
  Building2, 
  FileSpreadsheet, 
  FileText, 
  Download, 
  Upload, 
  RotateCcw, 
  TrendingUp, 
  BookOpen, 
  Calendar, 
  Settings, 
  ShieldCheck, 
  Newspaper, 
  Wallet,
  Archive,
  Coins
} from 'lucide-react';
import { AppState } from '../types';
import { exportBackup, parseBackupFile } from '../services/storage';

export type NavTab = 
  | 'portfolio' 
  | 'watchlist'
  | 'profit' 
  | 'ledger' 
  | 'news' 
  | 'calendar' 
  | 'vault' 
  | 'settings';

interface NavbarProps {
  state: AppState;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  onOpenExcelModal: () => void;
  onOpenContractNoteModal: () => void;
  onResetAllData: () => void;
  onRestoreState: (newState: AppState) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  state,
  activeTab,
  setActiveTab,
  onOpenExcelModal,
  onOpenContractNoteModal,
  onResetAllData,
  onRestoreState,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackupExport = () => {
    exportBackup(state);
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const restored = await parseBackupFile(file);
      const confirmMsg = `Restore backup with ${restored.holdings.length} stocks, ${restored.ledger.length} ledger entries, ${restored.trades.length} trades, and ${restored.receipts?.length || 0} receipts? Current data will be replaced.`;
      if (window.confirm(confirmMsg)) {
        onRestoreState(restored);
      }
    } catch (err: any) {
      alert(`Failed to restore backup: ${err?.message || 'Invalid format'}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-xs">
              <Building2 className="w-4 h-4 text-teal-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold text-slate-900 tracking-tight">
                  Colombo CSE
                </span>
                <span className="text-3xs px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold border border-slate-200">
                  LKR
                </span>
              </div>
              <div className="flex items-center space-x-1.5 text-3xs text-slate-400">
                <ShieldCheck className="w-3 h-3 text-teal-600" />
                <span>Zero-Mock Architecture</span>
              </div>
            </div>
          </div>

          {/* Clean Navigation Tabs (Zerodha Kite & Stripe Inspired) */}
          <nav className="hidden xl:flex items-center space-x-1">
            <button
              onClick={() => setActiveTab('portfolio')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'portfolio'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Portfolio ({state.holdings.length})</span>
            </button>


            <button
              onClick={() => setActiveTab('watchlist')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'watchlist'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span>Watchlist</span>
            </button>

            <button
              onClick={() => setActiveTab('profit')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'profit'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Coins className="w-3.5 h-3.5 text-teal-600" />
              <span>Realized Profit (70/30)</span>
            </button>

            <button
              onClick={() => setActiveTab('ledger')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'ledger'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Amma's Ledger</span>
            </button>

            <button
              onClick={() => setActiveTab('news')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'news'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Newspaper className="w-3.5 h-3.5" />
              <span>CSE News & XD</span>
            </button>

            <button
              onClick={() => setActiveTab('calendar')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'calendar'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>P&L Calendar</span>
            </button>

            <button
              onClick={() => setActiveTab('vault')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'vault'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Archive className="w-3.5 h-3.5 text-sky-600" />
              <span>Receipt Vault ({state.receipts?.length || 0})</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'settings'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onOpenExcelModal}
              title="Import ATrad Portfolio Excel / CSV"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-teal-700" />
              <span className="hidden sm:inline">ATrad Excel</span>
            </button>

            <button
              onClick={onOpenContractNoteModal}
              title="Parse Asia Securities / CSE Contract Note"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5 text-sky-700" />
              <span className="hidden sm:inline">Contract Note</span>
            </button>

            <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

            {/* Backup & Restore */}
            <button
              onClick={handleBackupExport}
              title="Export 1-Click JSON Backup"
              className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              title="Restore from JSON Backup"
              className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleRestoreFile}
              accept=".json"
              className="hidden"
            />

            <button
              onClick={onResetAllData}
              title="Reset All Data to Genuine 0.00"
              className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile / Horizontal Scroll Tabs */}
        <div className="flex xl:hidden border-t border-slate-100 py-2 space-x-1.5 overflow-x-auto">
          {[
            { id: 'portfolio', label: `Portfolio (${state.holdings.length})` },
            { id: 'profit', label: 'Realized Profit (70/30)' },
            { id: 'ledger', label: "Amma's Ledger" },
            { id: 'news', label: 'CSE News & XD' },
            { id: 'calendar', label: 'P&L Calendar' },
            
            { id: 'settings', label: 'Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as NavTab)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                activeTab === tab.id ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 bg-slate-50 border border-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};
