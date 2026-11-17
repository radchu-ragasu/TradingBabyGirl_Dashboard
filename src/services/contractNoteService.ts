import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface TradeFeeBreakdown {
  grossConsideration: number;
  brokerageFee: number;
  secCess: number;
  cdsFee: number;
  shareTransactionLevy: number;
  totalExpenses: number;
  netConsideration: number;
}

export interface SplitPreview {
  grossProceeds: number;
  totalFees: number;
  netProceeds: number;
  costBasis: number;
  realizedPnL: number;
  isProfit: boolean;
  reinvest70: number;
  payout30: number;
}

export function calculateCseTradeFees(quantity: number, price: number, isBuy: boolean): TradeFeeBreakdown {
  const grossConsideration = Math.round(quantity * price * 100) / 100;
  const brokerageFee = Math.round(grossConsideration * 0.0064 * 100) / 100;
  const secCess = Math.round(grossConsideration * 0.00156 * 100) / 100;
  const cdsFee = Math.round(grossConsideration * 0.00024 * 100) / 100;
  const shareTransactionLevy = Math.round(grossConsideration * 0.003 * 100) / 100;
  const totalExpenses = Math.round(grossConsideration * 0.0112 * 100) / 100;

  const netConsideration = isBuy
    ? Math.round((grossConsideration + totalExpenses) * 100) / 100
    : Math.round((grossConsideration - totalExpenses) * 100) / 100;

  return {
    grossConsideration,
    brokerageFee,
    secCess,
    cdsFee,
    shareTransactionLevy,
    totalExpenses,
    netConsideration,
  };
}

export function calculateGainLossAndSplit(
  quantity: number,
  sellPrice: number,
  buyAvgCost: number,
  exactNetSaleAmount?: number,
  reinvestPercent = 70,
  payoutPercent = 30
): SplitPreview {
  const sellFees = calculateCseTradeFees(quantity, sellPrice, false);
  const netProceeds =
    typeof exactNetSaleAmount === 'number' && exactNetSaleAmount > 0
      ? exactNetSaleAmount
      : sellFees.netConsideration;

  const buyFees = calculateCseTradeFees(quantity, buyAvgCost, true);
  const costBasis = buyFees.netConsideration;

  const realizedPnL = Math.round((netProceeds - costBasis) * 100) / 100;
  const isProfit = realizedPnL > 0;

  const reinvest70 = isProfit ? Math.round(realizedPnL * (reinvestPercent / 100) * 100) / 100 : 0;
  const payout30 = isProfit ? Math.round(realizedPnL * (payoutPercent / 100) * 100) / 100 : 0;

  return {
    grossProceeds: sellFees.grossConsideration,
    totalFees: sellFees.totalExpenses,
    netProceeds,
    costBasis,
    realizedPnL,
    isProfit,
    reinvest70,
    payout30,
  };
}

/**
 * Normalize OCR/PDF extracted numbers (handles "1,324.99" as well as "1.324.99" thousands dot artifacts)
 */
function parseAsiaNumber(raw: string): number {
  const cleaned = raw.replace(/,/g, '').trim();
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    const decimalPart = parts.pop()!;
    return parseFloat(`${parts.join('')}.${decimalPart}`) || 0;
  }
  return parseFloat(cleaned) || 0;
}

/**
 * Extract structured text lines sorted by page & vertical Y coordinate from PDF
 */
async function extractTextFromPdfFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Group items by approximate Y position (within 3pt tolerance)
    const rows: { y: number; items: { x: number; str: string }[] }[] = [];

    for (const item of textContent.items as any[]) {
      const str = (item.str || '').trim();
      if (!str) continue;
      const x = item.transform[4];
      const y = item.transform[5];

      let targetRow = rows.find((r) => Math.abs(r.y - y) <= 3);
      if (!targetRow) {
        targetRow = { y, items: [] };
        rows.push(targetRow);
      }
      targetRow.items.push({ x, str });
    }

    // Sort top-to-bottom (descending Y in PDF coords) and left-to-right (ascending X)
    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      allLines.push(row.items.map((i) => i.str).join(' '));
    }
  }

  return allLines.join('\n');
}

/**
 * 100% Offline Parser for Asia Securities (Pvt) Ltd Trade Confirmation PDFs & Pasted Text
 */
/**
 * 100% Offline Parser for Asia Securities (Pvt) Ltd Trade Confirmation PDFs & Pasted Text
 */
export async function parseContractNoteApi(
  file?: File,
  rawText?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    let text = rawText || '';

    if (file) {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        text = await extractTextFromPdfFile(file);
      } else {
        return {
          success: false,
          error: 'Please upload the official Asia Securities PDF file.',
        };
      }
    }

    if (!text.trim()) {
      return {
        success: false,
        error: 'This PDF has no selectable text.',
      };
    }

    const dateMatch =
      text.match(/Trade Date\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i) ||
      text.match(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/);
    const tradeDate = dateMatch
      ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
      : new Date().toISOString().split('T')[0];

    const cdsMatch = text.match(/(?:Client A\/C No\.|CDS Account Number)\s*:?\s*([A-Z0-9\-\/]+)/i);
    const clientCdsNumber = cdsMatch ? cdsMatch[1].trim() : 'N/A';

    const flatText = text.replace(/\s+/g, ' ');

    // Split text at every "Sale of " or "Purchase of "
    const chunks = flatText.split(/(?=\b(?:Sale|Purchase)\s+of\s+)/i);
    const trades: any[] = [];
    const contractNumbers: string[] = [];

    for (const chunk of chunks) {
      const headerMatch = chunk.match(/^(Sale|Purchase)\s+of\s+([^(]+)\(([^)]+)\)/i);
      if (!headerMatch) continue;

      const type = headerMatch[1].toUpperCase() === 'PURCHASE' ? 'BUY' : 'SELL';
      const companyName = headerMatch[2].trim();
      const insideParens = headerMatch[3].trim();

      // Extract CSE ticker like CARE.N0000 or COMB.X0000
      const symbolMatch = insideParens.match(/([A-Z0-9]{2,10}\.[A-Z0-9]{4,5})/i);
      const symbol = symbolMatch
        ? symbolMatch[1].toUpperCase()
        : insideParens.split('/')[0].trim().toUpperCase();

      // Trim anything after "Purchase Total" / "Sales Total" in the last chunk
      const bodyOnly = chunk
        .slice(headerMatch[0].length)
        .split(/\b(?:Purchase Total|Sales Total|Net Settlement Value)\b/i)[0];

      const cNos = bodyOnly.match(/\b20\d{9}\b/g);
      if (cNos) {
        cNos.forEach((cn) => {
          if (!contractNumbers.includes(cn)) contractNumbers.push(cn);
        });
      }

      // Find the "Total" row (or fallback to individual trade rows if Total isn't present)
      const totalIdx = bodyOnly.search(/\bTotal\b/i);
      if (totalIdx !== -1) {
        // Grab numbers around "Total" (handles both "Total 100 14.00..." and "90 Total 8.70...")
        const windowStart = Math.max(0, totalIdx - 15);
        const totalWindow = bodyOnly.slice(windowStart, totalIdx + 180);
        const numTokens = totalWindow.match(/\b\d[\d,.]*\b/g) || [];
        const nums = numTokens.map(parseAsiaNumber);

        if (nums.length >= 10) {
          const quantity = Math.round(nums[0]);
          const grossPrice = nums[1];
          const grossConsideration = nums[2];
          const brokerageFee = nums[3];
          const secFee = nums[4];
          const exchangeFee = nums[5];
          const cdsFee = nums[6];
          const govCess = nums[7];
          const clearingFee = nums[8];
          const netConsideration = nums[9];

          const totalExpenses =
            Math.round((brokerageFee + secFee + exchangeFee + cdsFee + govCess + clearingFee) * 100) / 100;

          const expectedNet =
            type === 'SELL' ? grossConsideration - totalExpenses : grossConsideration + totalExpenses;
          const diff = Math.abs(expectedNet - netConsideration);

          trades.push({
            type,
            symbol,
            companyName,
            quantity,
            grossPrice,
            grossConsideration,
            brokerageFee,
            secCess: Math.round((secFee + govCess) * 100) / 100,
            cdsFee,
            shareTransactionLevy: Math.round((exchangeFee + clearingFee) * 100) / 100,
            totalExpenses,
            netConsideration,
            confidence: diff <= 0.05 ? 'HIGH' : 'NEEDS_MANUAL_CHECK',
            unreadableFlags: diff > 0.05 ? [`Net check diff: ${diff.toFixed(2)}`] : [],
          });
        }
      }
    }

    if (trades.length === 0) {
      const salePos = flatText.search(/(?:Sale|Purchase)\s+of/i);
      const debugPart = salePos !== -1 ? flatText.slice(salePos, salePos + 260) : flatText.slice(0, 260);
      return {
        success: false,
        error: `Could not parse trade rows. Debug: "${debugPart}"`,
      };
    }

    const totalNetConsideration =
      Math.round(trades.reduce((sum, t) => sum + t.netConsideration, 0) * 100) / 100;

    return {
      success: true,
      data: {
        brokerName: 'Asia Securities (Pvt) Ltd',
        tradeDate,
        clientCdsNumber,
        contractNoteNumber: contractNumbers.length > 0 ? contractNumbers[0] : undefined,
        totalNetConsideration,
        trades,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `PDF Parser Error: ${err?.message || 'Unable to read PDF file.'}`,
    };
  }
}