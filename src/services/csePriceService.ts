import { CSEQuoteResult, Holding } from '../types';

export interface ExtendedCSEQuoteResult extends CSEQuoteResult {
  dividendInfo?: string | null;
  xdDate?: string | null;
}

/**
 * Fetch verified live share price from CSE
 */
export async function fetchLiveCsePrice(symbol: string): Promise<ExtendedCSEQuoteResult> {
  try {
    const res = await fetch('/api/cse/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        symbol,
        verified: false,
        price: null,
        currency: 'LKR',
        asOfDate: null,
        errorDetails: errData.error || `CSE live server returned status ${res.status}. Price unverified.`,
      };
    }

    const data: ExtendedCSEQuoteResult = await res.json();
    return data;
  } catch (err: any) {
    return {
      symbol,
      verified: false,
      price: null,
      currency: 'LKR',
      asOfDate: null,
      errorDetails: `Network error reaching CSE verification endpoint: ${err?.message || 'Check connection'}.`,
    };
  }
}

/**
 * Only retain saved dividend info if it belongs to current/upcoming year (>= 2026);
 * automatically clears any old 2016-2025 clutter.
 */
function isCurrentOrUpcomingXd(xdDate?: string | null): boolean {
  if (!xdDate) return false;
  const year = parseInt(xdDate.slice(0, 4), 10);
  return !isNaN(year) && year >= 2026;
}

/**
 * Update holding with verified live CSE quote + ONLY fresh CSE Announcements
 */
export function applyQuoteToHolding(holding: Holding, quote: ExtendedCSEQuoteResult): Holding {
  const hasFreshAnnouncement = Boolean(quote.dividendInfo || quote.xdDate);
  const keepExisting = isCurrentOrUpcomingXd(holding.xdDate);

  const nextDividendInfo = hasFreshAnnouncement
    ? quote.dividendInfo || null
    : keepExisting
    ? holding.dividendInfo
    : null;

  const nextXdDate = hasFreshAnnouncement
    ? quote.xdDate || null
    : keepExisting
    ? holding.xdDate
    : null;

  if (quote.verified && typeof quote.price === 'number' && quote.price > 0) {
    return {
      ...holding,
      companyName: quote.companyName || holding.companyName,
      marketPrice: quote.price,
      priceSource: 'LIVE_CSE',
      priceAsOf: quote.asOfDate || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      priceError: null,
      dividendInfo: nextDividendInfo,
      xdDate: nextXdDate,
      lastVerifiedUrl: quote.sourceUrls?.[0] || holding.lastVerifiedUrl || null,
    };
  }

  const retainedPrice = holding.marketPrice;
  const isAtrad = holding.priceSource === 'ATRAD_EXCEL' && retainedPrice !== null;

  return {
    ...holding,
    marketPrice: retainedPrice,
    priceSource: isAtrad ? 'ATRAD_EXCEL' : 'UNABLE_TO_FETCH',
    dividendInfo: nextDividendInfo,
    xdDate: nextXdDate,
    priceError: quote.errorDetails || 'Unable to Fetch Live Price (CSE live source unreachable or unverified).',
  };
}