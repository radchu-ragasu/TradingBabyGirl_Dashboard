import * as XLSX from 'xlsx';
import { Holding } from '../types';

export interface RowReviewNote {
  rawSymbol: string;
  notes: string[];
}

export interface ExcelImportResult {
  fileName: string;
  validHoldings: Holding[];
  rowsNeedingReview: RowReviewNote[];
}

function cleanNumber(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const str = String(val).replace(/,/g, '').replace(/Rs\.?/gi, '').replace(/LKR/gi, '').trim();
  if (!str || str === '-' || str === 'N/A') return null;
  // Handle negative values in parentheses like (12,345.00)
  const isParenNeg = str.startsWith('(') && str.endsWith(')');
  const numStr = isParenNeg ? `-${str.slice(1, -1)}` : str;
  const parsed = parseFloat(numStr);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function parseATradExcel(file: File): Promise<ExcelImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  let headerRowIdx = -1;
  let colMap: Record<string, number> = {};

  // Find the header row containing "Security" or "Symbol"
  for (let r = 0; r < Math.min(15, rawRows.length); r++) {
    const row = rawRows[r];
    if (!row) continue;
    const normalized = row.map((c) => (c ? String(c).trim().toLowerCase() : ''));
    const secIdx = normalized.findIndex(
      (h) => h === 'security' || h === 'symbol' || h === 'stock' || h === 'code'
    );
    if (secIdx !== -1) {
      headerRowIdx = r;
      normalized.forEach((h, idx) => {
        if (h) colMap[h] = idx;
      });
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error('Could not find header row ("Security" or "Symbol") in the Excel sheet.');
  }

  const getCol = (candidates: string[]): number => {
    for (const c of candidates) {
      if (colMap[c] !== undefined) return colMap[c];
    }
    return -1;
  };

  const symbolCol = getCol(['security', 'symbol', 'stock', 'code']);
  const nameCol = getCol(['company name', 'company', 'description', 'security name']);
  const qtyCol = getCol(['quantity', 'qty', 'cleared balance', 'available balance', 'balance']);
  const avgCostCol = getCol(['avg price', 'average price', 'avg cost', 'cost price', 'unit cost']);
  const totalCostCol = getCol(['total cost', 'cost value', 'book value']);
  // ATrad specifically names current market price "Traded Price"
  const mktPriceCol = getCol([
    'traded price',
    'last traded price',
    'market price',
    'ltp',
    'close price',
    'current price',
    'price',
  ]);
  const mktValueCol = getCol(['market value', 'current value', 'valuation']);

  const validHoldings: Holding[] = [];
  const rowsNeedingReview: RowReviewNote[] = [];
  const todayStr = new Date().toISOString().slice(0, 10);

  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || symbolCol === -1) continue;

    const rawSym = row[symbolCol] ? String(row[symbolCol]).trim().toUpperCase() : '';
    if (!rawSym || rawSym.startsWith('TOTAL') || rawSym.startsWith('SUBTOTAL') || rawSym.startsWith('PORTFOLIO')) {
      continue;
    }

    // Must look like a CSE ticker (e.g. ACL.N0000, CIC.X0000)
    if (!/^[A-Z]{2,6}\.[NX]\d{4}$/.test(rawSym) && !/^[A-Z]{2,6}$/.test(rawSym)) {
      continue;
    }

    const quantity = qtyCol !== -1 ? cleanNumber(row[qtyCol]) : null;
    let avgCostPrice = avgCostCol !== -1 ? cleanNumber(row[avgCostCol]) : null;
    const totalCost = totalCostCol !== -1 ? cleanNumber(row[totalCostCol]) : null;
    let marketPrice = mktPriceCol !== -1 ? cleanNumber(row[mktPriceCol]) : null;
    const marketValue = mktValueCol !== -1 ? cleanNumber(row[mktValueCol]) : null;

    if (avgCostPrice === null && totalCost !== null && quantity && quantity > 0) {
      avgCostPrice = totalCost / quantity;
    }

    if (marketPrice === null && marketValue !== null && quantity && quantity > 0) {
      marketPrice = marketValue / quantity;
    }

    const notes: string[] = [];
    if (!quantity || quantity <= 0) notes.push('Missing or zero quantity');
    if (avgCostPrice === null || avgCostPrice < 0) notes.push('Missing average cost');

    if (notes.length > 0) {
      rowsNeedingReview.push({ rawSymbol: rawSym, notes });
      continue;
    }

    const companyName =
      nameCol !== -1 && row[nameCol] ? String(row[nameCol]).trim() : rawSym;

    const hasValidMarketPrice = marketPrice !== null && marketPrice > 0;

    validHoldings.push({
      id: `holding_${rawSym}_${Date.now()}_${r}`,
      symbol: rawSym,
      companyName,
      quantity: quantity!,
      avgCostPrice: avgCostPrice!,
      marketPrice: hasValidMarketPrice ? marketPrice : null,
      priceSource: hasValidMarketPrice ? 'ATRAD_EXCEL' : 'PENDING',
      priceAsOf: hasValidMarketPrice ? todayStr : null,
      priceError: null,
      tag: 'ACTIVE',
    });
  }

  return {
    fileName: file.name,
    validHoldings,
    rowsNeedingReview,
  };
  
}
export function normalizeCseSymbol(input: string): string {
  const cleaned = String(input || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!cleaned) return '';
  if (cleaned.includes('.')) return cleaned;
  return `${cleaned}.N0000`;
}