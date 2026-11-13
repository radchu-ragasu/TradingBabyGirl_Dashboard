export type PriceSource = 'LIVE_CSE' | 'ATRAD_EXCEL' | 'MANUAL' | 'UNABLE_TO_FETCH' | 'PENDING';

export type TradeTag = 'ACTIVE' | 'LEGACY';

export interface PriceHistoryPoint {
  date: string; // YYYY-MM-DD
  price: number;
}

export interface Holding {
  id: string;
  symbol: string;
  companyName: string;
  quantity: number;
  avgCostPrice: number;
  marketPrice: number | null;
  priceSource: PriceSource;
  priceAsOf: string | null;
  priceError: string | null;
  lastVerifiedUrl?: string | null;
  tag?: TradeTag;
  priceHistory?: PriceHistoryPoint[];
  rsi14?: number | null;
  sma50?: number | null;
  dividendInfo?: string | null;
  xdDate?: string | null;
  paymentDate?: string | null;
  technicalsStatus?: 'SYNCED' | 'UNAVAILABLE';
  notes?: string;
}

export type LedgerEntryType =
  | 'CAPITAL_INJECTION'
  | 'CAPITAL_RETURN'
  | 'PROFIT_SHARE_30'
  | 'REINVESTMENT_70'
  | 'EXPENSE_ADJUSTMENT'
  | 'CUSTOM';

export interface LedgerEntry {
  id: string;
  date: string;
  type: LedgerEntryType;
  amount: number;
  description: string;
  referenceSlip?: string;
  runningBalance?: number;
  slipFileData?: string;
  slipFileName?: string;
  receiptId?: string;
}

export interface Trade {
  id: string;
  date: string;
  type: 'BUY' | 'SELL';
  symbol: string;
  companyName: string;
  quantity: number;
  price: number;
  costBasisPrice: number;
  grossConsideration: number;
  brokerageFee: number;
  secCess: number;
  cdsFee: number;
  shareTransactionLevy: number;
  totalExpenses: number;
  netConsideration: number;
  realizedPnL: number;
  reinvest70: number;
  payout30: number;
  contractNoteNumber?: string;
  confidence?: 'HIGH' | 'NEEDS_MANUAL_CHECK';
  unreadableFlags?: string[];
  receiptId?: string;
  notes?: string;
}

export interface ProfitWithdrawal {
  id: string;
  date: string;
  amount: number;
  purpose: string;
  referenceSlip?: string;
}

export interface ProfitWallet {
  totalWithdrawn: number;
  withdrawals: ProfitWithdrawal[];
}

export interface CSENewsItem {
  id: string;
  symbol: string;
  companyName: string;
  headline: string;
  date: string;
  category: 'DIVIDEND' | 'FINANCIAL_RESULTS' | 'ANNOUNCEMENT' | 'MARKET_NEWS';
  dividendAmount?: number | null;
  xdDate?: string | null;
  paymentDate?: string | null;
  currentPrice?: number | null;
  inPortfolio?: boolean;
  details: string;
  sourceUrl?: string;
}

export interface ReceiptDocument {
  id: string;
  fileName: string;
  fileType: string;
  fileData: string;
  fileSize?: string;
  uploadDate: string;
  tradeDate?: string;
  brokerName?: string;
  contractNoteNumber?: string;
  noteType: 'BUY' | 'SELL' | 'BANK_SLIP' | 'MIXED';
  netAmount: number;
  realizedProfit?: number | null;
  reinvest70?: number | null;
  payout30?: number | null;
  symbols: string[];
  notes?: string;
}

export interface AppSettings {
  brokerageRatePercent: number;
  reinvestRatioPercent: number;
  payoutRatioPercent: number;
  cdsAccountNumber: string;
  currency: string;
}

export interface AppState {
  holdings: Holding[];
  ledger: LedgerEntry[];
  trades: Trade[];
  wallet: ProfitWallet;
  news: CSENewsItem[];
  receipts: ReceiptDocument[];
  lastNewsSync: string | null;
  settings: AppSettings;
}

export interface CSEQuoteResult {
  symbol: string;
  companyName?: string;
  verified: boolean;
  price: number | null;
  currency: string;
  asOfDate: string | null;
  errorDetails?: string | null;
  sourceUrls?: string[];
}