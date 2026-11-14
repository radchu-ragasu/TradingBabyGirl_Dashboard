/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  AppState, 
  Holding, 
  LedgerEntry, 
  Trade, 
  AppSettings, 
  ProfitWithdrawal, 
  CSENewsItem,
  ReceiptDocument,
  PriceHistoryPoint
} from './types';
import { loadSavedState, persistState, clearAllData } from './services/storage';
import { Navbar, NavTab } from './components/Navbar';
import { SummaryMetrics } from './components/SummaryMetrics';
import { HoldingsTable } from './components/HoldingsTable';
import { RealizedProfitTab } from './components/RealizedProfitTab';
import { AmmaCapitalLedger } from './components/AmmaCapitalLedger';
import { TradingPnLCalendar } from './components/TradingPnLCalendar';
import { ReceiptVaultTab } from './components/ReceiptVaultTab';
import { CSENewsTab } from './components/CSENewsTab';
import { SettingsTab } from './components/SettingsTab';
import { ATradExcelModal } from './components/ATradExcelModal';
import { ContractNoteModal } from './components/ContractNoteModal';
import { SellStockModal } from './components/SellStockModal';
import { AddHoldingModal } from './components/AddHoldingModal';
import { RealizedProfitWalletModal } from './components/RealizedProfitWalletModal';
import { AlertTriangle, FileText, Download, X } from 'lucide-react';


// Sri Lanka CSE Public & Poya Holidays (YYYY-MM-DD) — Add any special CSE closures here
const CSE_HOLIDAYS = new Set<string>([
  // 2026 Sri Lanka Poya & Public Holidays
  '2026-01-03', '2026-01-14', '2026-02-01', '2026-02-04', '2026-03-02',
  '2026-04-01', '2026-04-03', '2026-04-13', '2026-04-14', '2026-05-01',
  '2026-05-30', '2026-06-29', '2026-07-29', '2026-08-27', '2026-09-26',
  '2026-10-25', '2026-11-24', '2026-12-23', '2026-12-25',
  // 2027 Sri Lanka Poya & Public Holidays
  '2027-01-14', '2027-01-22', '2027-02-04', '2027-02-20', '2027-03-22',
  '2027-04-13', '2027-04-14', '2027-04-20', '2027-05-01', '2027-05-20',
]);

function isCseTradingDay(dateStr: string): boolean {
  const cleanDate = dateStr.slice(0, 10);
  if (CSE_HOLIDAYS.has(cleanDate)) return false;

  const [year, month, day] = cleanDate.split('-').map(Number);
  if (!year || !month || !day) return false;

  // Use UTC day-of-week so timezone shifts never misclassify Friday/Monday
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  // 0 = Sunday, 6 = Saturday
  return dayOfWeek !== 0 && dayOfWeek !== 6;
}

function calculateTechnicalsFromHistory(history: PriceHistoryPoint[]): {
  rsi14: number | null;
  sma50: number | null;
  tradingHistory: PriceHistoryPoint[];
} {
  if (!Array.isArray(history) || history.length === 0) {
    return { rsi14: null, sma50: null, tradingHistory: [] };
  }

  // Strictly filter out Saturdays, Sundays, and Poya/CSE holidays
  const tradingHistory = [...history]
    .filter((p) => typeof p.price === 'number' && p.price > 0 && isCseTradingDay(p.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  const prices = tradingHistory.map((p) => p.price);

  let rsi14: number | null = null;
  if (prices.length >= 15) {
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= 14; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    let avgGain = gains / 14;
    let avgLoss = losses / 14;

    for (let i = 15; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? Math.abs(diff) : 0;
      avgGain = (avgGain * 13 + gain) / 14;
      avgLoss = (avgLoss * 13 + loss) / 14;
    }

    if (avgLoss === 0) {
      rsi14 = avgGain === 0 ? 50 : 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi14 = 100 - 100 / (1 + rs);
    }
  }

  let sma50: number | null = null;
  if (prices.length >= 50) {
    const last50 = prices.slice(-50);
    const sum = last50.reduce((acc, v) => acc + v, 0);
    sma50 = sum / 50;
  }

  return { rsi14, sma50, tradingHistory };
}

function recordPriceAndComputeTechnicals(
  holding: Holding,
  existingHistory?: PriceHistoryPoint[]
): Holding {
  // Clean out any previously saved weekend/holiday entries immediately
  const baseHistory = (
    Array.isArray(existingHistory)
      ? existingHistory
      : Array.isArray(holding.priceHistory)
      ? holding.priceHistory
      : []
  ).filter((p) => isCseTradingDay(p.date));

  if (holding.marketPrice !== null && holding.marketPrice > 0) {
    const dateKey = (holding.priceAsOf || new Date().toISOString()).slice(0, 10);

    // Only record if today/priceAsOf is an actual CSE trading day (Mon-Fri & non-Poya)
    if (isCseTradingDay(dateKey)) {
      const idx = baseHistory.findIndex((p) => p.date === dateKey);
      if (idx !== -1) {
        baseHistory[idx] = { date: dateKey, price: holding.marketPrice };
      } else {
        baseHistory.push({ date: dateKey, price: holding.marketPrice });
      }
    }
  }

  const trimmedHistory = baseHistory
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-90);

  const { rsi14, sma50 } = calculateTechnicalsFromHistory(trimmedHistory);

  return {
    ...holding,
    priceHistory: trimmedHistory,
    rsi14: rsi14 !== null ? rsi14 : holding.rsi14 ?? null,
    sma50: sma50 !== null ? sma50 : holding.sma50 ?? null,
  };
}


export default function App() {
  const [state, setState] = useState<AppState>(() => {
    const loaded = loadSavedState();
    return {
      ...loaded,
      holdings: loaded.holdings.map((h) => recordPriceAndComputeTechnicals(h)),
    };
  });
  const [activeTab, setActiveTab] = useState<NavTab>('portfolio');

  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isContractNoteModalOpen, setIsContractNoteModalOpen] = useState(false);
  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [sellingHolding, setSellingHolding] = useState<Holding | null>(null);
  const [activeViewerDoc, setActiveViewerDoc] = useState<ReceiptDocument | null>(null);

  const [isSyncingNews, setIsSyncingNews] = useState(false);
  const [syncNewsError, setSyncNewsError] = useState<string | null>(null);

  useEffect(() => {
    persistState(state);
  }, [state]);

  const handleUpdateHolding = (updated: Holding) => {
    setState((prev) => {
      const existing = prev.holdings.find((h) => h.id === updated.id);
      const enriched = recordPriceAndComputeTechnicals(updated, existing?.priceHistory);
      return {
        ...prev,
        holdings: prev.holdings.map((h) => (h.id === updated.id ? enriched : h)),
      };
    });
  };

  const handleDeleteHolding = (id: string) => {
    setState((prev) => ({
      ...prev,
      holdings: prev.holdings.filter((h) => h.id !== id),
    }));
  };

  const handleAddHolding = (newHolding: Holding) => {
    setState((prev) => {
      const existingIdx = prev.holdings.findIndex((h) => h.symbol === newHolding.symbol);
      if (existingIdx !== -1) {
        const existing = prev.holdings[existingIdx];
        const combinedQty = existing.quantity + newHolding.quantity;
        const totalCost = existing.quantity * existing.avgCostPrice + newHolding.quantity * newHolding.avgCostPrice;
        const combinedAvg = combinedQty > 0 ? totalCost / combinedQty : 0;
        const updatedHolding = recordPriceAndComputeTechnicals(
          {
            ...existing,
            quantity: combinedQty,
            avgCostPrice: combinedAvg,
            marketPrice: newHolding.marketPrice ?? existing.marketPrice,
            priceSource: newHolding.priceSource !== 'PENDING' ? newHolding.priceSource : existing.priceSource,
            tag: newHolding.tag || existing.tag || 'ACTIVE',
          },
          existing.priceHistory
        );
        const updatedList = [...prev.holdings];
        updatedList[existingIdx] = updatedHolding;
        return { ...prev, holdings: updatedList };
      }
      return {
        ...prev,
        holdings: [recordPriceAndComputeTechnicals(newHolding), ...prev.holdings],
      };
    });
  };

  const handleImportExcelHoldings = (imported: Holding[], mode: 'replace' | 'merge') => {
    setState((prev) => {
      const existingMap = new Map<string, Holding>();
      prev.holdings.forEach((h) => existingMap.set(h.symbol, h));

      const enrichImported = (item: Holding): Holding => {
        const prevItem = existingMap.get(item.symbol);
        const preservedTag = prevItem?.tag === 'LEGACY' ? 'LEGACY' : item.tag || prevItem?.tag || 'ACTIVE';
        return recordPriceAndComputeTechnicals(
          {
            ...item,
            tag: preservedTag,
            dividendInfo: item.dividendInfo || prevItem?.dividendInfo || null,
            xdDate: item.xdDate || prevItem?.xdDate || null,
            paymentDate: item.paymentDate || prevItem?.paymentDate || null,
          },
          prevItem?.priceHistory
        );
      };

      if (mode === 'replace') {
        return {
          ...prev,
          holdings: imported.map(enrichImported),
        };
      }

      const merged = [...prev.holdings];
      imported.forEach((item) => {
        const enriched = enrichImported(item);
        const idx = merged.findIndex((h) => h.symbol === item.symbol);
        if (idx !== -1) {
          merged[idx] = enriched;
        } else {
          merged.push(enriched);
        }
      });
      return { ...prev, holdings: merged };
    });
  };

  // Manual Dividend / XD / Payment Date Tracker Handlers
  const handleAddDividendItem = (item: Omit<CSENewsItem, 'id'>) => {
    const newItem: CSENewsItem = {
      ...item,
      id: `div_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };

    setState((prev) => {
      const updatedHoldings = prev.holdings.map((h) => {
        const matches =
          h.symbol.toUpperCase() === item.symbol.toUpperCase() ||
          h.symbol.toUpperCase().split('.')[0] === item.symbol.toUpperCase().split('.')[0];
        if (!matches) return h;
        return {
          ...h,
          dividendInfo: item.dividendAmount ? `Rs. ${item.dividendAmount.toFixed(2)}/sh` : 'Dividend Declared',
          xdDate: item.xdDate || h.xdDate,
          paymentDate: item.paymentDate || h.paymentDate,
        };
      });

      return {
        ...prev,
        holdings: updatedHoldings,
        news: [newItem, ...prev.news],
      };
    });
  };

  const handleDeleteDividendItem = (id: string) => {
    setState((prev) => ({
      ...prev,
      news: prev.news.filter((n) => n.id !== id),
    }));
  };

  const handleAddLedgerEntry = (entry: Omit<LedgerEntry, 'id' | 'runningBalance'>) => {
    const entryId = `ledger_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newEntry: LedgerEntry = {
      ...entry,
      id: entryId,
    };

    let newReceipt: ReceiptDocument | null = null;
    if (entry.slipFileData) {
      const receiptId = `receipt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      newEntry.receiptId = receiptId;
      newReceipt = {
        id: receiptId,
        fileName: entry.slipFileName || `Bank_Deposit_Slip_${entry.date}.pdf`,
        fileType: entry.slipFileData.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg',
        fileData: entry.slipFileData,
        fileSize: 'Deposit slip',
        uploadDate: new Date().toISOString().replace('T', ' ').substring(0, 16),
        tradeDate: entry.date,
        brokerName: 'Bank Deposit / CDS Transfer',
        contractNoteNumber: entry.referenceSlip,
        noteType: 'BANK_SLIP',
        netAmount: entry.amount,
        symbols: [],
        notes: entry.description,
      };
    }

    setState((prev) => ({
      ...prev,
      ledger: [...prev.ledger, newEntry],
      receipts: newReceipt ? [newReceipt, ...(prev.receipts || [])] : (prev.receipts || []),
    }));
  };

  const handleDeleteLedgerEntry = (id: string) => {
    setState((prev) => ({
      ...prev,
      ledger: prev.ledger.filter((l) => l.id !== id),
    }));
  };

  const handleAddReceipt = (doc: Omit<ReceiptDocument, 'id' | 'uploadDate'>) => {
    const newDoc: ReceiptDocument = {
      ...doc,
      id: `receipt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      uploadDate: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };
    setState((prev) => ({
      ...prev,
      receipts: [newDoc, ...(prev.receipts || [])],
    }));
  };

  const handleDeleteReceipt = (id: string) => {
    setState((prev) => ({
      ...prev,
      receipts: (prev.receipts || []).filter((r) => r.id !== id),
    }));
  };

  const handleRecordWithdrawal = (
    withdrawal: Omit<ProfitWithdrawal, 'id'>,
    autoRecordAmmaLedger: boolean
  ) => {
    const newWithdrawal: ProfitWithdrawal = {
      ...withdrawal,
      id: `withdraw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };

    setState((prev) => {
      const currentWallet = prev.wallet || { totalWithdrawn: 0, withdrawals: [] };
      const updatedWallet = {
        totalWithdrawn: currentWallet.totalWithdrawn + withdrawal.amount,
        withdrawals: [newWithdrawal, ...currentWallet.withdrawals],
      };

      let updatedLedger = prev.ledger;
      if (autoRecordAmmaLedger) {
        const ledgerEntry: LedgerEntry = {
          id: `ledger_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          date: withdrawal.date,
          type: 'PROFIT_SHARE_30',
          amount: withdrawal.amount,
          description: `30% Profit payout: ${withdrawal.purpose}`,
          referenceSlip: withdrawal.referenceSlip,
        };
        updatedLedger = [...prev.ledger, ledgerEntry];
      }

      return {
        ...prev,
        wallet: updatedWallet,
        ledger: updatedLedger,
      };
    });
  };

  const handleConfirmSale = (
    trade: Trade,
    remainingQty: number,
    autoRecordAmmaLedger: boolean
  ) => {
    setState((prev) => {
      let updatedHoldings = prev.holdings;
      if (remainingQty <= 0) {
        updatedHoldings = prev.holdings.filter((h) => h.symbol !== trade.symbol);
      } else {
        updatedHoldings = prev.holdings.map((h) =>
          h.symbol === trade.symbol ? { ...h, quantity: remainingQty } : h
        );
      }

      const updatedTrades = [trade, ...prev.trades];

      let updatedLedger = prev.ledger;
      if (autoRecordAmmaLedger && trade.realizedPnL > 0 && trade.payout30 > 0) {
        const ledgerEntry: LedgerEntry = {
          id: `ledger_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          date: trade.date,
          type: 'PROFIT_SHARE_30',
          amount: trade.payout30,
          description: `30% Profit share payout from selling ${trade.quantity} ${trade.symbol}`,
          referenceSlip: `Trade #${trade.id.substring(6, 12)}`,
        };
        updatedLedger = [...prev.ledger, ledgerEntry];
      }

      return {
        ...prev,
        holdings: updatedHoldings,
        trades: updatedTrades,
        ledger: updatedLedger,
      };
    });
  };

  const handleCommitParsedTrades = (
    tradesToCommit: Trade[],
    autoUpdateHoldings: boolean,
    autoRecordAmmaLedger: boolean,
    receiptDoc?: ReceiptDocument
  ) => {
    setState((prev) => {
      let currentHoldings = [...prev.holdings];
      let newLedgerEntries: LedgerEntry[] = [];

      if (autoUpdateHoldings) {
        tradesToCommit.forEach((trade) => {
          const idx = currentHoldings.findIndex((h) => h.symbol === trade.symbol);
          if (trade.type === 'BUY') {
            if (idx !== -1) {
              const existing = currentHoldings[idx];
              const totalQty = existing.quantity + trade.quantity;
              const totalCost = existing.quantity * existing.avgCostPrice + trade.netConsideration;
              const newAvg = totalQty > 0 ? totalCost / totalQty : 0;
              currentHoldings[idx] = {
                ...existing,
                quantity: totalQty,
                avgCostPrice: newAvg,
              };
            } else {
              currentHoldings.push(
                recordPriceAndComputeTechnicals({
                  id: `holding_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                  symbol: trade.symbol,
                  companyName: trade.companyName,
                  quantity: trade.quantity,
                  avgCostPrice: trade.quantity > 0 ? trade.netConsideration / trade.quantity : trade.price,
                  marketPrice: trade.price,
                  priceSource: 'MANUAL',
                  priceAsOf: trade.date,
                  priceError: null,
                  tag: 'ACTIVE',
                  notes: `Bought via Note #${trade.contractNoteNumber || ''}`,
                })
              );
            }
          } else if (trade.type === 'SELL') {
            if (idx !== -1) {
              const remaining = currentHoldings[idx].quantity - trade.quantity;
              if (remaining <= 0) {
                currentHoldings.splice(idx, 1);
              } else {
                currentHoldings[idx] = {
                  ...currentHoldings[idx],
                  quantity: remaining,
                };
              }
            }

            if (autoRecordAmmaLedger && trade.realizedPnL > 0 && trade.payout30 > 0) {
              newLedgerEntries.push({
                id: `ledger_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                date: trade.date,
                type: 'PROFIT_SHARE_30',
                amount: trade.payout30,
                description: `30% Profit share payout from ${trade.symbol} (Note #${trade.contractNoteNumber || 'N/A'})`,
                referenceSlip: trade.contractNoteNumber,
                receiptId: receiptDoc?.id,
              });
            }
          }
        });
      }

      const updatedReceipts = receiptDoc
        ? [receiptDoc, ...(prev.receipts || [])]
        : (prev.receipts || []);

      return {
        ...prev,
        holdings: currentHoldings,
        trades: [...tradesToCommit, ...prev.trades],
        ledger: [...prev.ledger, ...newLedgerEntries],
        receipts: updatedReceipts,
      };
    });
  };

  const handleSyncNews = async () => {
    setIsSyncingNews(false);
  };

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setState((prev) => ({
      ...prev,
      settings: newSettings,
    }));
  };

  const handleResetAllData = () => {
    const confirmation = window.prompt(
      'Type "RESET" to wipe all portfolio holdings, ledger entries, trades, and receipt archives to genuine 0.00:'
    );
    if (confirmation === 'RESET') {
      const resetState = clearAllData();
      setState(resetState);
    }
  };

  const handleRestoreState = (newState: AppState) => {
    setState(newState);
  };

  const handleDownloadViewerReceipt = (doc: ReceiptDocument) => {
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', doc.fileData);
    downloadAnchor.setAttribute('download', doc.fileName);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const holdingsWithErrors = state.holdings.filter(
    (h) => h.priceSource === 'UNABLE_TO_FETCH' || h.priceError
  );

  const totalRealizedProfit = state.trades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
  const totalReinvest70 = state.trades.reduce((sum, t) => sum + (t.reinvest70 || 0), 0);
  const totalPayout30 = state.trades.reduce((sum, t) => sum + (t.payout30 || 0), 0);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans antialiased selection:bg-slate-900 selection:text-white pb-14">
      <Navbar
        state={state}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenExcelModal={() => setIsExcelModalOpen(true)}
        onOpenContractNoteModal={() => setIsContractNoteModalOpen(true)}
        onResetAllData={handleResetAllData}
        onRestoreState={handleRestoreState}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-7">
        {holdingsWithErrors.length > 0 && activeTab === 'portfolio' && (
          <div className="mb-6 p-4 bg-amber-50/90 border border-amber-200/90 rounded-2xl text-xs text-amber-900 flex items-start space-x-3 shadow-2xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold block">
                Honest CSE Status Notice ({holdingsWithErrors.length} stock{holdingsWithErrors.length === 1 ? '' : 's'}):
              </span>
              <p className="text-2xs text-amber-800 mt-0.5 leading-relaxed">
                Exact imported ATrad Excel prices or cost bases are faithfully preserved for:{' '}
                <span className="font-semibold font-mono">
                  {holdingsWithErrors.map((h) => h.symbol).join(', ')}
                </span>
                .
              </p>
            </div>
          </div>
        )}

        <SummaryMetrics
          state={state}
          onOpenProfitTab={() => setActiveTab('profit')}
        />

        {activeTab === 'portfolio' && (
          <HoldingsTable
            holdings={state.holdings}
            currency={state.settings.currency}
            onUpdateHolding={handleUpdateHolding}
            onDeleteHolding={handleDeleteHolding}
            onOpenAddModal={() => setIsAddStockModalOpen(true)}
            onOpenSellModal={(holding) => setSellingHolding(holding)}
            onOpenExcelModal={() => setIsExcelModalOpen(true)}
            onOpenContractNoteModal={() => setIsContractNoteModalOpen(true)}
            onOpenNewsTab={() => setActiveTab('news')}
          />
        )}

        {activeTab === 'profit' && (
          <RealizedProfitTab
            state={state}
            onRecordWithdrawal={handleRecordWithdrawal}
            onOpenReceiptVault={() => setActiveTab('vault')}
          />
        )}

        {activeTab === 'ledger' && (
          <AmmaCapitalLedger
            ledger={state.ledger}
            currency={state.settings.currency}
            onAddEntry={handleAddLedgerEntry}
            onDeleteEntry={handleDeleteLedgerEntry}
          />
        )}

        {activeTab === 'news' && (
          <CSENewsTab
            holdings={state.holdings}
            newsItems={state.news}
            lastSync={state.lastNewsSync}
            isSyncing={isSyncingNews}
            syncError={syncNewsError}
            onSyncNews={handleSyncNews}
            onAddDividendItem={handleAddDividendItem}
            onDeleteDividendItem={handleDeleteDividendItem}
          />
        )}

        {activeTab === 'calendar' && (
          <TradingPnLCalendar
            trades={state.trades}
            currency={state.settings.currency}
            receipts={state.receipts || []}
            onViewReceipt={(r) => setActiveViewerDoc(r)}
          />
        )}

        {activeTab === 'vault' && (
          <ReceiptVaultTab
            receipts={state.receipts || []}
            currency={state.settings.currency}
            onAddReceipt={handleAddReceipt}
            onDeleteReceipt={handleDeleteReceipt}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            state={state}
            onUpdateSettings={handleUpdateSettings}
            onResetAllData={handleResetAllData}
            onRestoreState={handleRestoreState}
          />
        )}
      </main>

      <ATradExcelModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        onImportHoldings={handleImportExcelHoldings}
      />

      <ContractNoteModal
        isOpen={isContractNoteModalOpen}
        onClose={() => setIsContractNoteModalOpen(false)}
        holdings={state.holdings}
        onCommitParsedTrades={handleCommitParsedTrades}
      />

      <RealizedProfitWalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        currency={state.settings.currency}
        totalRealizedProfit={totalRealizedProfit}
        totalReinvest70={totalReinvest70}
        totalPayout30={totalPayout30}
        wallet={state.wallet}
        onRecordWithdrawal={handleRecordWithdrawal}
      />

      {sellingHolding && (
        <SellStockModal
          holding={sellingHolding}
          isOpen={!!sellingHolding}
          onClose={() => setSellingHolding(null)}
          currency={state.settings.currency}
          onConfirmSale={handleConfirmSale}
        />
      )}

      <AddHoldingModal
        isOpen={isAddStockModalOpen}
        onClose={() => setIsAddStockModalOpen(false)}
        onAddHolding={handleAddHolding}
      />

      {activeViewerDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-slate-100 text-slate-700 rounded-xl">
                  <FileText className="w-5 h-5 text-teal-700" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    {activeViewerDoc.fileName}
                  </h3>
                  <div className="text-2xs text-slate-500 flex items-center space-x-2">
                    <span>{activeViewerDoc.brokerName || 'Asia Securities'}</span>
                    <span>•</span>
                    <span>Date: {activeViewerDoc.tradeDate || activeViewerDoc.uploadDate}</span>
                    {activeViewerDoc.contractNoteNumber && (
                      <>
                        <span>•</span>
                        <span className="font-mono">#{activeViewerDoc.contractNoteNumber}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDownloadViewerReceipt(activeViewerDoc)}
                  className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => setActiveViewerDoc(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-100/50 flex items-center justify-center overflow-auto flex-1 min-h-[450px]">
              {activeViewerDoc.fileType.includes('pdf') || activeViewerDoc.fileName.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={activeViewerDoc.fileData}
                  className="w-full h-[70vh] border-0 rounded-xl shadow-xs bg-white"
                  title="PDF Preview"
                />
              ) : (
                <img
                  src={activeViewerDoc.fileData}
                  alt={activeViewerDoc.fileName}
                  className="max-h-[70vh] max-w-full object-contain rounded-xl shadow-xs"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}