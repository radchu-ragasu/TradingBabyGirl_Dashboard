import React, { useState, useRef } from 'react';
import { 
  FileSpreadsheet, 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  ArrowRight,
  ShieldAlert,
  Tag
} from 'lucide-react';
import { Holding, TradeTag } from '../types';
import { parseATradExcel, ExcelImportResult } from '../services/excelImporter';

interface ATradExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportHoldings: (holdings: Holding[], mode: 'replace' | 'merge') => void;
}

export const ATradExcelModal: React.FC<ATradExcelModalProps> = ({
  isOpen,
  onClose,
  onImportHoldings,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ExcelImportResult | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [defaultTag, setDefaultTag] = useState<TradeTag>('ACTIVE');
  const [rowTags, setRowTags] = useState<Record<number, TradeTag>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    try {
      const res = await parseATradExcel(file);
      setImportResult(res);
      // Initialize default tags
      const initialTags: Record<number, TradeTag> = {};
      res.validHoldings.forEach((_, idx) => {
        initialTags[idx] = defaultTag;
      });
      setRowTags(initialTags);
    } catch (err: any) {
      alert(`Error parsing Excel file: ${err?.message || 'Invalid format'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleToggleRowTag = (idx: number) => {
    setRowTags((prev) => ({
      ...prev,
      [idx]: prev[idx] === 'ACTIVE' ? 'LEGACY' : 'ACTIVE',
    }));
  };

  const handleSetAllTags = (tag: TradeTag) => {
    if (!importResult) return;
    const newTags: Record<number, TradeTag> = {};
    importResult.validHoldings.forEach((_, idx) => {
      newTags[idx] = tag;
    });
    setRowTags(newTags);
    setDefaultTag(tag);
  };

  const handleConfirmImport = () => {
    if (!importResult || importResult.validHoldings.length === 0) return;
    const taggedHoldings: Holding[] = importResult.validHoldings.map((h, idx) => ({
      ...h,
      tag: rowTags[idx] || 'ACTIVE',
    }));

    onImportHoldings(taggedHoldings, importMode);
    onClose();
    setImportResult(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Import ATrad Portfolio Excel / CSV
              </h3>
              <p className="text-xs text-slate-500">
                Direct extraction with true Excel Market Price support & Active vs Legacy Trade tagging.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {!importResult ? (
            /* Upload Zone */
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-50/50'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                accept=".xlsx,.xls,.csv"
                className="hidden"
              />
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <UploadCloud className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-slate-900 mb-1">
                {isProcessing ? 'Reading Excel file...' : 'Click to select or drag & drop ATrad export'}
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-3">
                Supports Colombo Stock Exchange ATrad portfolio valuations, holdings downloads, and transaction exports (.xlsx, .xls, .csv).
              </p>
              <span className="inline-block text-2xs px-2.5 py-1 rounded-md bg-slate-200 text-slate-700 font-medium">
                Strict Zero-Mock: Reads actual numbers directly from your file
              </span>
            </div>
          ) : (
            /* Parsed Preview */
            <div className="space-y-4">
              {/* Status Banner */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold">
                    {importResult.validHoldings.length} stocks recognized from {importResult.fileName}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-2xs text-slate-500">Batch Tag:</span>
                  <button
                    onClick={() => handleSetAllTags('ACTIVE')}
                    className="px-2 py-0.5 rounded text-2xs font-semibold bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                  >
                    All Active
                  </button>
                  <button
                    onClick={() => handleSetAllTags('LEGACY')}
                    className="px-2 py-0.5 rounded text-2xs font-semibold bg-white border border-amber-300 text-amber-800 hover:bg-amber-100"
                  >
                    All Legacy
                  </button>
                  <button
                    onClick={() => setImportResult(null)}
                    className="text-emerald-700 hover:text-emerald-900 font-medium underline ml-2"
                  >
                    Change file
                  </button>
                </div>
              </div>

              {/* Rows Needing Check Warning */}
              {importResult.rowsNeedingReview.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start space-x-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">
                      {importResult.rowsNeedingReview.length} row(s) flagged for manual check:
                    </span>
                    <p className="text-2xs text-amber-800 mt-0.5">
                      {importResult.rowsNeedingReview
                        .map((r) => `${r.rawSymbol || 'Row'}: ${r.notes.join(', ')}`)
                        .join('; ')}
                    </p>
                  </div>
                </div>
              )}

              {/* Preview Table with Tagging */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 text-2xs uppercase sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Trade Tag</th>
                        <th className="py-2.5 px-3">Symbol</th>
                        <th className="py-2.5 px-3">Company Name</th>
                        <th className="py-2.5 px-3 text-right">Quantity</th>
                        <th className="py-2.5 px-3 text-right">Avg Cost</th>
                        <th className="py-2.5 px-3 text-right">Excel Mkt Price</th>
                        <th className="py-2.5 px-3 text-right">Cost Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importResult.validHoldings.map((h, i) => {
                        const tag = rowTags[i] || 'ACTIVE';
                        return (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="py-2 px-3">
                              <button
                                onClick={() => handleToggleRowTag(i)}
                                title="Click to toggle Active vs Legacy"
                                className={`px-2 py-0.5 rounded text-3xs font-bold ${
                                  tag === 'ACTIVE'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}
                              >
                                {tag}
                              </button>
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-900">{h.symbol}</td>
                            <td className="py-2 px-3 text-slate-600 truncate max-w-xs">{h.companyName}</td>
                            <td className="py-2 px-3 text-right font-medium">{h.quantity.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-slate-600">Rs. {h.avgCostPrice.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right font-semibold text-emerald-800">
                              {h.marketPrice !== null ? `Rs. ${h.marketPrice.toFixed(2)}` : '—'}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-600">
                              Rs. {(h.quantity * h.avgCostPrice).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Import Options */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                <span className="font-semibold text-slate-800 block">Import Mode:</span>
                <div className="flex items-center space-x-6">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="replace"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="text-slate-900"
                    />
                    <span className="text-slate-700">Replace current portfolio holdings</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      value="merge"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                      className="text-slate-900"
                    />
                    <span className="text-slate-700">Merge with existing holdings</span>
                  </label>
                </div>
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
          {importResult && (
            <button
              onClick={handleConfirmImport}
              disabled={importResult.validHoldings.length === 0}
              className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition-colors shadow-xs"
            >
              <span>Import {importResult.validHoldings.length} Stocks</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
