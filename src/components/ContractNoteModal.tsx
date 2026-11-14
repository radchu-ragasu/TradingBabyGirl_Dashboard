import React, { useState, useRef } from 'react';
import { 
  FileText, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  ArrowRight, 
  ShieldAlert, 
  Coins, 
  Building2, 
  Calendar, 
  Layers 
} from 'lucide-react';
import { Holding, Trade, ReceiptDocument } from '../types';
import { parseContractNoteApi, calculateGainLossAndSplit } from '../services/contractNoteService';

interface ContractNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  holdings: Holding[];
  onCommitParsedTrades: (
    trades: Trade[],
    autoUpdateHoldings: boolean,
    autoRecordAmmaLedger: boolean,
    receiptDoc?: ReceiptDocument
  ) => void;
}

export const ContractNoteModal: React.FC<ContractNoteModalProps> = ({
  isOpen,
  onClose,
  holdings,
  onCommitParsedTrades,
}) => {
  const [activeInputTab, setActiveInputTab] = useState<'upload' | 'paste'>('upload');
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadedFileDoc, setUploadedFileDoc] = useState<{
    fileData: string;
    fileName: string;
    fileType: string;
    fileSize: string;
  } | null>(null);

  // Options
  const [autoUpdateHoldings, setAutoUpdateHoldings] = useState(true);
  const [autoRecordAmmaLedger, setAutoRecordAmmaLedger] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleProcessFile = async (file: File) => {
    setIsProcessing(true);
    setErrorMessage(null);

    // Read file as Base64 for the Receipt Vault
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        setUploadedFileDoc({
          fileData: e.target.result,
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          fileSize: `${(file.size / 1024).toFixed(1)} KB`,
        });
      }
    };
    reader.readAsDataURL(file);

    try {
      const res = await parseContractNoteApi(file);
      if (res.success && res.data) {
        setParsedData(res.data);
      } else {
        setErrorMessage(res.error || 'Unable to parse contract note.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error communicating with parser.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessText = async () => {
    if (!rawText.trim()) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setUploadedFileDoc(null);
    try {
      const res = await parseContractNoteApi(undefined, rawText.trim());
      if (res.success && res.data) {
        setParsedData(res.data);
      } else {
        setErrorMessage(res.error || 'Unable to parse contract note text.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error parsing text.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmCommit = () => {
    if (!parsedData || !Array.isArray(parsedData.trades)) return;

    let receiptId: string | undefined;
    let receiptDoc: ReceiptDocument | undefined;

    let totalRealizedGain = 0;
    let totalReinvest = 0;
    let totalPayout = 0;
    const tradedSymbols: string[] = [];

    const tradesToCommit: Trade[] = parsedData.trades.map((t: any) => {
      const isBuy = t.type === 'BUY';
      tradedSymbols.push(t.symbol);
      const matchedHolding = holdings.find((h) => h.symbol === t.symbol);
      const costBasisPrice = !isBuy && matchedHolding ? matchedHolding.avgCostPrice : (t.grossPrice || 0);

      const split = !isBuy
        ? calculateGainLossAndSplit(t.quantity, t.grossPrice, costBasisPrice, t.netConsideration)
        : null;

      if (split && split.isProfit) {
        totalRealizedGain += split.realizedPnL;
        totalReinvest += split.reinvest70;
        totalPayout += split.payout30;
      }

      return {
        id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        date: parsedData.tradeDate || new Date().toISOString().split('T')[0],
        type: isBuy ? 'BUY' : 'SELL',
        symbol: t.symbol,
        companyName: t.companyName || t.symbol,
        quantity: t.quantity,
        price: t.grossPrice,
        costBasisPrice,
        grossConsideration: t.grossConsideration || (t.quantity * t.grossPrice),
        brokerageFee: t.brokerageFee || 0,
        secCess: t.secCess || 0,
        cdsFee: t.cdsFee || 0,
        shareTransactionLevy: t.shareTransactionLevy || 0,
        totalExpenses: t.totalExpenses || 0,
        netConsideration: t.netConsideration || 0,
        realizedPnL: split ? split.realizedPnL : 0,
        reinvest70: split ? split.reinvest70 : 0,
        payout30: split ? split.payout30 : 0,
        contractNoteNumber: parsedData.contractNoteNumber || undefined,
        confidence: t.confidence || 'HIGH',
        unreadableFlags: t.unreadableFlags || [],
      };
    });

    // Package Receipt Document if a file was uploaded
    if (uploadedFileDoc) {
      receiptId = `receipt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      receiptDoc = {
        id: receiptId,
        fileName: uploadedFileDoc.fileName,
        fileType: uploadedFileDoc.fileType,
        fileData: uploadedFileDoc.fileData,
        fileSize: uploadedFileDoc.fileSize,
        uploadDate: new Date().toISOString().replace('T', ' ').substring(0, 16),
        tradeDate: parsedData.tradeDate || new Date().toISOString().split('T')[0],
        brokerName: parsedData.brokerName || 'Asia Securities (Pvt) Ltd',
        contractNoteNumber: parsedData.contractNoteNumber || undefined,
        noteType: parsedData.trades.some((t: any) => t.type === 'SELL') ? 'SELL' : 'BUY',
        netAmount: parsedData.totalNetConsideration || tradesToCommit.reduce((sum, t) => sum + t.netConsideration, 0),
        realizedProfit: totalRealizedGain > 0 ? totalRealizedGain : null,
        reinvest70: totalReinvest > 0 ? totalReinvest : null,
        payout30: totalPayout > 0 ? totalPayout : null,
        symbols: Array.from(new Set(tradedSymbols)),
        notes: `Parsed note with ${tradesToCommit.length} stocks`,
      };

      // Link receiptId to trades
      tradesToCommit.forEach((t) => {
        t.receiptId = receiptId;
      });
    }

    onCommitParsedTrades(tradesToCommit, autoUpdateHoldings, autoRecordAmmaLedger, receiptDoc);
    onClose();
    setParsedData(null);
    setUploadedFileDoc(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-sky-50 text-sky-700 rounded-lg border border-sky-200">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Asia Securities & CSE Contract Note Parser
              </h3>
              <p className="text-xs text-slate-500">
                Consolidated extraction, automatic Receipt Vault archive, and instant 70/30 split preview.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Honest Parser Notification:</span>
                <p className="text-2xs text-rose-800 mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {!parsedData ? (
            <div>
              {/* Tab Selector */}
              <div className="flex border-b border-slate-200 mb-4">
                <button
                  onClick={() => setActiveInputTab('upload')}
                  className={`pb-2.5 px-4 text-xs font-semibold border-b-2 transition-colors ${
                    activeInputTab === 'upload'
                      ? 'border-sky-600 text-sky-900'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Upload Contract PDF / Image (Auto-saved to Vault)
                </button>
                <button
                  onClick={() => setActiveInputTab('paste')}
                  className={`pb-2.5 px-4 text-xs font-semibold border-b-2 transition-colors ${
                    activeInputTab === 'paste'
                      ? 'border-sky-600 text-sky-900'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Paste Contract Note Text / Email
                </button>
              </div>

              {activeInputTab === 'upload' ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-xl p-8 text-center cursor-pointer bg-slate-50/50 transition-colors"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleProcessFile(f);
                    }}
                    accept=".pdf,image/*"
                    className="hidden"
                  />
                  <div className="w-12 h-12 mx-auto rounded-full bg-sky-50 text-sky-600 flex items-center justify-center mb-3">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 mb-1">
                    {isProcessing ? 'Analyzing broker contract note...' : 'Select Asia Securities Contract Note (PDF / Photo)'}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mb-2">
                    Accepts official Asia Securities (Pvt) Ltd Bought & Sold notes. Document is automatically archived in your Receipt Vault.
                  </p>
                  <span className="text-2xs text-slate-400">
                    Fail-Safe Rule: Blurry or unreadable lines will be flagged as "Needs Manual Check" rather than guessed.
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    rows={8}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Paste the text from your Asia Securities Contract Note email or PDF here... (e.g. Contract No, Trade Date, Stock Symbol, Quantity, Gross Rate, Brokerage, Net Consideration)"
                    className="w-full text-xs p-3 font-mono border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-sky-600"
                  />
                  <button
                    onClick={handleProcessText}
                    disabled={isProcessing || !rawText.trim()}
                    className="w-full py-2.5 text-xs font-semibold bg-sky-700 text-white rounded-lg hover:bg-sky-800 transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? 'Parsing with Gemini 3.8 Flash...' : 'Parse Contract Text'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Parsed Multi-Stock Review */
            <div className="space-y-4">
              {/* Note Metadata Banner */}
              <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-sky-950">
                <div className="flex items-center space-x-3">
                  <Building2 className="w-4 h-4 text-sky-700" />
                  <div>
                    <span className="font-bold">{parsedData.brokerName || 'Asia Securities (Pvt) Ltd'}</span>
                    <span className="text-slate-500 ml-2">Note #{parsedData.contractNoteNumber || 'N/A'}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-4 text-2xs font-medium">
                  <span>Trade Date: {parsedData.tradeDate || 'N/A'}</span>
                  <span>CDS: {parsedData.clientCdsNumber || 'N/A'}</span>
                  <button
                    onClick={() => setParsedData(null)}
                    className="text-sky-700 hover:text-sky-900 underline font-semibold"
                  >
                    Reset / New File
                  </button>
                </div>
              </div>

              {/* Multi-Stock Trade Rows */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 text-2xs uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Symbol / Company</th>
                      <th className="py-2.5 px-3 text-right">Qty</th>
                      <th className="py-2.5 px-3 text-right">Gross Price</th>
                      <th className="py-2.5 px-3 text-right">CSE Fees (1.12%)</th>
                      <th className="py-2.5 px-3 text-right">Net Consideration</th>
                      <th className="py-2.5 px-3 text-right">Status / Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedData.trades?.map((t: any, i: number) => {
                      const isBuy = t.type === 'BUY';
                      const needsCheck = t.confidence === 'NEEDS_MANUAL_CHECK';
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3">
                            <span
                              className={`text-2xs font-bold px-2 py-0.5 rounded ${
                                isBuy ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {t.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">{t.symbol}</div>
                            <div className="text-2xs text-slate-500 truncate max-w-xs">{t.companyName}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium">
                            {Number(t.quantity).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-700">
                            Rs. {Number(t.grossPrice).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-500 text-2xs">
                            Rs. {Number(t.totalExpenses || 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            Rs. {Number(t.netConsideration || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {needsCheck ? (
                              <span className="inline-flex items-center space-x-1 text-2xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>Needs Manual Check</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 text-2xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Verified High</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Instant 70/30 Split Preview for SOLD stocks */}
              {parsedData.trades?.some((t: any) => t.type === 'SELL') && (
                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-emerald-900 flex items-center space-x-1.5">
                      <Coins className="w-4 h-4 text-emerald-700" />
                      <span>Instant 70/30 Re-invest vs Payout Split Preview</span>
                    </span>
                    <span className="text-2xs text-emerald-700 font-medium">
                      Exact formula: Net Sale Amount - (Sold Qty * Portfolio Avg Cost)
                    </span>
                  </div>

                  <div className="space-y-2 pt-1">
                    {parsedData.trades
                      .filter((t: any) => t.type === 'SELL')
                      .map((t: any, idx: number) => {
                        const matched = holdings.find((h) => h.symbol === t.symbol);
                        const costBasis = matched ? matched.avgCostPrice : t.grossPrice;
                        const split = calculateGainLossAndSplit(t.quantity, t.grossPrice, costBasis, t.netConsideration);

                        return (
                          <div
                            key={idx}
                            className="bg-white p-3 rounded-lg border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <span className="font-semibold text-slate-900 mr-2">{t.symbol}</span>
                              <span className="text-slate-500 text-2xs">
                                Sold @ Rs. {t.grossPrice.toFixed(2)} | Cost Basis: Rs. {costBasis.toFixed(2)}
                              </span>
                              <div
                                className={`text-2xs font-bold mt-0.5 ${
                                  split.isProfit ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                Realized Net Profit: {split.realizedPnL >= 0 ? '+' : ''}Rs. {split.realizedPnL.toFixed(2)}
                              </div>
                            </div>

                            {split.isProfit ? (
                              <div className="flex items-center space-x-4 text-xs font-semibold">
                                <div className="text-emerald-800">
                                  <span className="text-3xs block text-slate-400 font-normal">70% Re-investment:</span>
                                  +Rs. {split.reinvest70.toFixed(2)}
                                </div>
                                <div className="text-sky-800">
                                  <span className="text-3xs block text-slate-400 font-normal">30% Amma Payout:</span>
                                  +Rs. {split.payout30.toFixed(2)}
                                </div>
                              </div>
                            ) : (
                              <div className="text-2xs text-slate-500 italic">
                                Loss position: 100% net proceeds retained to preserve capital.
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Commit Checkboxes */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoUpdateHoldings}
                    onChange={(e) => setAutoUpdateHoldings(e.target.checked)}
                    className="rounded text-slate-900"
                  />
                  <span className="text-slate-800 font-medium">
                    Automatically adjust Portfolio Holdings (deduct sold shares or add bought shares)
                  </span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRecordAmmaLedger}
                    onChange={(e) => setAutoRecordAmmaLedger(e.target.checked)}
                    className="rounded text-slate-900"
                  />
                  <span className="text-slate-800 font-medium">
                    Automatically allocate 70% to Re-Investment Pool and 30% to Withdrawable Payout Pool
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          {parsedData && (
            <button
              onClick={handleConfirmCommit}
              disabled={!parsedData.trades || parsedData.trades.length === 0}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-xs"
            >
              <span>Post {parsedData.trades?.length || 0} Trade(s) & Archive PDF to Vault</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
