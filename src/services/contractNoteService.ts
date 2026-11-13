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
  reinvest70: number; // 70%
  payout30: number; // 30%
}

/**
 * Calculate official CSE statutory fees (1.12% total for equity up to Rs. 100M)
 * Brokerage: 0.640%
 * SEC Cess: 0.084%
 * CDS Fee: 0.024%
 * Share Transaction Levy: 0.300%
 */
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

/**
 * Calculate instant Gain/Loss and 70/30 Re-invest vs Payout Split for a sold position
 * Supports exact Net Sale Amount from contract note or calculated 1.12% CSE fees
 */
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
 * Parse Asia Securities / CSE Broker Contract Note via backend Gemini API
 */
export async function parseContractNoteApi(
  file?: File,
  rawText?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    let fileData: string | undefined;
    let mimeType: string | undefined;

    if (file) {
      mimeType = file.type || 'application/pdf';
      const buffer = await file.arrayBuffer();
      // Convert buffer to base64
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      fileData = btoa(binary);
    }

    const res = await fetch('/api/parse-contract-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileData, mimeType, rawText }),
    });

    const json = await res.json();
    return json;
  } catch (err: any) {
    return {
      success: false,
      error: `Network error parsing contract note: ${err?.message || 'Check connection'}.`,
    };
  }
}
