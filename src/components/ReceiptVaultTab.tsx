import React, { useState, useRef } from 'react';
import { ReceiptDocument } from '../types';
import { 
  FileText, 
  UploadCloud, 
  Download, 
  Eye, 
  Trash2, 
  Search, 
  Filter, 
  Calendar, 
  Building2, 
  Coins, 
  ArrowUpRight, 
  ArrowDownLeft, 
  X,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  FileCheck
} from 'lucide-react';

interface ReceiptVaultTabProps {
  receipts: ReceiptDocument[];
  currency: string;
  onAddReceipt: (doc: Omit<ReceiptDocument, 'id' | 'uploadDate'>) => void;
  onDeleteReceipt: (id: string) => void;
}

export const ReceiptVaultTab: React.FC<ReceiptVaultTabProps> = ({
  receipts,
  currency,
  onAddReceipt,
  onDeleteReceipt,
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeViewerDoc, setActiveViewerDoc] = useState<ReceiptDocument | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Manual upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadNoteType, setUploadNoteType] = useState<'BUY' | 'SELL' | 'BANK_SLIP' | 'MIXED'>('SELL');
  const [uploadBroker, setUploadBroker] = useState('Asia Securities (Pvt) Ltd');
  const [uploadContractNo, setUploadContractNo] = useState('');
  const [uploadTradeDate, setUploadTradeDate] = useState(new Date().toISOString().split('T')[0]);
  const [uploadNetAmount, setUploadNetAmount] = useState('');
  const [uploadSymbols, setUploadSymbols] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickUploadInputRef = useRef<HTMLInputElement>(null);

  const formatLKR = (num: number): string => {
    return new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: currency || 'LKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const filteredReceipts = receipts.filter((r) => {
    const matchesFilter = filterType === 'ALL' || r.noteType === filterType;
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      r.fileName.toLowerCase().includes(query) ||
      (r.brokerName && r.brokerName.toLowerCase().includes(query)) ||
      (r.contractNoteNumber && r.contractNoteNumber.toLowerCase().includes(query)) ||
      r.symbols.some((s) => s.toLowerCase().includes(query));
    return matchesFilter && matchesSearch;
  });

  const handleDownloadReceipt = (doc: ReceiptDocument) => {
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', doc.fileData);
    downloadAnchor.setAttribute('download', doc.fileName);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleQuickUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const isBank = file.name.toLowerCase().includes('slip') || file.name.toLowerCase().includes('bank');
      onAddReceipt({
        fileName: file.name,
        fileType: file.type || 'application/pdf',
        fileData: dataUrl,
        fileSize: `${(file.size / 1024).toFixed(1)} KB`,
        tradeDate: new Date().toISOString().split('T')[0],
        brokerName: isBank ? 'Commercial Bank / CDS Deposit' : 'Asia Securities (Pvt) Ltd',
        noteType: isBank ? 'BANK_SLIP' : 'SELL',
        netAmount: 0,
        symbols: [],
        notes: 'Directly uploaded to Receipt Vault',
      });
    };
    reader.readAsDataURL(file);
    if (quickUploadInputRef.current) quickUploadInputRef.current.value = '';
  };

  const handleModalUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      alert('Please select a PDF or image document.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const parsedSymbols = uploadSymbols
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      onAddReceipt({
        fileName: uploadFile.name,
        fileType: uploadFile.type || 'application/pdf',
        fileData: dataUrl,
        fileSize: `${(uploadFile.size / 1024).toFixed(1)} KB`,
        tradeDate: uploadTradeDate,
        brokerName: uploadBroker.trim() || 'Asia Securities (Pvt) Ltd',
        contractNoteNumber: uploadContractNo.trim() || undefined,
        noteType: uploadNoteType,
        netAmount: parseFloat(uploadNetAmount) || 0,
        symbols: parsedSymbols,
        notes: uploadNotes.trim() || undefined,
      });

      setIsUploadModalOpen(false);
      setUploadFile(null);
      setUploadContractNo('');
      setUploadNetAmount('');
      setUploadSymbols('');
      setUploadNotes('');
    };
    reader.readAsDataURL(uploadFile);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">
              Receipt Vault & Saved Contract Notes
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium border border-slate-200">
              {receipts.length} Documents
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Permanent archive of all original Asia Securities PDFs, trade contract notes, and Amma's bank slips stored directly in IndexedDB.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Quick upload */}
          <button
            onClick={() => quickUploadInputRef.current?.click()}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <UploadCloud className="w-4 h-4 text-teal-600" />
            <span>Quick Upload</span>
          </button>
          <input
            type="file"
            ref={quickUploadInputRef}
            onChange={handleQuickUpload}
            accept=".pdf,image/*"
            className="hidden"
          />

          {/* Add with details */}
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors shadow-2xs"
          >
            <span>+ Archive Document</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ALL', label: 'All Receipts' },
            { id: 'SELL', label: 'Sold Contract Notes' },
            { id: 'BUY', label: 'Bought Notes' },
            { id: 'BANK_SLIP', label: "Amma's Bank Slips" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                filterType === tab.id
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search broker, contract #, symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-slate-900 w-full sm:w-64 font-normal"
          />
        </div>
      </div>

      {/* Receipts List */}
      {filteredReceipts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center max-w-lg mx-auto">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mb-4 border border-slate-200">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            {receipts.length === 0 ? 'Receipt Vault is Empty' : 'No matching documents found'}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed mb-6">
            Whenever you parse an Asia Securities contract note PDF or upload Amma's bank slip, the complete original document is safely preserved here for instant viewing and downloading.
          </p>
          <button
            onClick={() => quickUploadInputRef.current?.click()}
            className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors shadow-xs"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload Contract Note / Bank Slip</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReceipts.map((doc) => {
            const isSell = doc.noteType === 'SELL';
            const isBuy = doc.noteType === 'BUY';
            const isBank = doc.noteType === 'BANK_SLIP';
            const isPdf = doc.fileName.toLowerCase().endsWith('.pdf') || doc.fileType === 'application/pdf';

            return (
              <div
                key={doc.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all p-5 flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar with Type and Date */}
                  <div className="flex items-center justify-between text-2xs mb-2.5">
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                        isSell
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : isBuy
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-sky-50 text-sky-800 border border-sky-200'
                      }`}
                    >
                      {isBank ? 'Bank Slip' : isSell ? 'Sold Note' : 'Bought Note'}
                    </span>
                    <span className="text-slate-400 font-mono">
                      {doc.tradeDate || doc.uploadDate}
                    </span>
                  </div>

                  {/* Broker & Contract Number */}
                  <h4 className="text-sm font-semibold text-slate-900 truncate" title={doc.fileName}>
                    {doc.fileName}
                  </h4>
                  <div className="text-2xs text-slate-500 mt-0.5 flex items-center space-x-1">
                    <span>{doc.brokerName || 'Asia Securities'}</span>
                    {doc.contractNoteNumber && (
                      <>
                        <span>•</span>
                        <span className="font-mono">#{doc.contractNoteNumber}</span>
                      </>
                    )}
                  </div>

                  {/* Symbols Traded Chips */}
                  {doc.symbols.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {doc.symbols.map((sym, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded text-3xs font-semibold bg-slate-100 text-slate-700 font-mono"
                        >
                          {sym}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Financial Stats */}
                  <div className="mt-3.5 pt-3 border-t border-slate-100 text-xs space-y-1">
                    {doc.netAmount > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-2xs">Net Consideration:</span>
                        <span className="font-bold text-slate-900">{formatLKR(doc.netAmount)}</span>
                      </div>
                    )}
                    {doc.realizedProfit !== undefined && doc.realizedProfit !== null && doc.realizedProfit !== 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 text-2xs">Realized Profit:</span>
                        <span
                          className={`font-bold ${
                            doc.realizedProfit > 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {doc.realizedProfit >= 0 ? '+' : ''}
                          {formatLKR(doc.realizedProfit)}
                        </span>
                      </div>
                    )}
                    {doc.payout30 && doc.payout30 > 0 ? (
                      <div className="flex items-center justify-between text-2xs text-emerald-800 bg-emerald-50/70 p-1.5 rounded-lg border border-emerald-100">
                        <span>70/30 Split:</span>
                        <span className="font-semibold">
                          +{formatLKR(doc.payout30)} Payout / +{formatLKR(doc.reinvest70 || 0)} Reinvest
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-3xs text-slate-400 font-mono">
                    {doc.fileSize || (isPdf ? 'PDF' : 'IMAGE')}
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => setActiveViewerDoc(doc)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 text-2xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                      title="View Document"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-600" />
                      <span>View</span>
                    </button>
                    <button
                      onClick={() => handleDownloadReceipt(doc)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Download Original"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete receipt "${doc.fileName}" from vault?`)) {
                          onDeleteReceipt(doc.id);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Delete from Vault"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Clean Document Viewer Modal */}
      {activeViewerDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Viewer Header */}
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
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDownloadReceipt(activeViewerDoc)}
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

            {/* Viewer Body */}
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

      {/* Upload with Metadata Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-base font-semibold text-slate-900">
                Archive Document to Vault
              </h3>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleModalUploadSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select PDF or Image Document
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-xl p-4 text-center cursor-pointer bg-slate-50"
                >
                  <FileText className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                  <span className="text-xs font-semibold text-slate-800 block">
                    {uploadFile ? uploadFile.name : 'Click to select PDF / Image'}
                  </span>
                  <span className="text-3xs text-slate-400">PDF, JPG, PNG up to 10MB</span>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setUploadFile(f);
                  }}
                  accept=".pdf,image/*"
                  className="hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Document Type
                  </label>
                  <select
                    value={uploadNoteType}
                    onChange={(e) => setUploadNoteType(e.target.value as any)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 bg-white"
                  >
                    <option value="SELL">Sold Contract Note</option>
                    <option value="BUY">Bought Contract Note</option>
                    <option value="BANK_SLIP">Amma's Bank Deposit Slip</option>
                    <option value="MIXED">Mixed Note</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Trade / Deposit Date
                  </label>
                  <input
                    type="date"
                    value={uploadTradeDate}
                    onChange={(e) => setUploadTradeDate(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Broker / Bank Name
                  </label>
                  <input
                    type="text"
                    value={uploadBroker}
                    onChange={(e) => setUploadBroker(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Contract / Ref #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 748921"
                    value={uploadContractNo}
                    onChange={(e) => setUploadContractNo(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Net Amount (LKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={uploadNetAmount}
                    onChange={(e) => setUploadNetAmount(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Stock Symbols (CSV)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. COMB, JKH"
                    value={uploadSymbols}
                    onChange={(e) => setUploadSymbols(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-xs"
                >
                  Save to Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
