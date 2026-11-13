import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const CSE_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'Accept': 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Origin': 'https://www.cse.lk',
  'Referer': 'https://www.cse.lk/',
};

/**
 * Helper: Fetch direct official data (Price + Dividend/Corporate Info) from cse.lk API
 */
async function fetchDirectCSECompanyInfo(symbol: string) {
  try {
    const formBody = new URLSearchParams({ symbol: symbol.trim().toUpperCase() });
    const response = await fetch('https://www.cse.lk/api/companyInfoSummery', {
      method: 'POST',
      headers: CSE_HEADERS,
      body: formBody.toString(),
    });

    if (!response.ok) return null;
    const data: any = await response.json();
    const info = data?.reqSymbolInfo;
    if (!info) return null;

    const price =
      typeof info.lastTradedPrice === 'number' && info.lastTradedPrice > 0
        ? info.lastTradedPrice
        : typeof info.closingPrice === 'number' && info.closingPrice > 0
        ? info.closingPrice
        : null;

    return {
      symbol: symbol.toUpperCase(),
      companyName: info.name || info.symbol || symbol,
      price,
      asOfDate: new Date().toISOString(),
      rawData: data,
    };
  } catch {
    return null;
  }
}

/**
 * Endpoint to fetch verified Colombo Stock Exchange (CSE) share price
 */
app.post('/api/cse/quote', async (req: Request, res: Response): Promise<void> => {
  const { symbol } = req.body;
  if (!symbol || typeof symbol !== 'string') {
    res.status(400).json({ error: 'Stock symbol is required', verified: false });
    return;
  }

  const cleanSymbol = symbol.trim().toUpperCase();
  const directData = await fetchDirectCSECompanyInfo(cleanSymbol);
  if (directData && directData.price !== null) {
    res.json({
      symbol: cleanSymbol,
      companyName: directData.companyName,
      verified: true,
      price: Number(directData.price),
      currency: 'LKR',
      asOfDate: directData.asOfDate,
      errorDetails: null,
      sourceUrls: [`https://www.cse.lk/pages/company-profile/company-profile.component.html?symbol=${cleanSymbol}`],
    });
    return;
  }

  res.json({
    symbol: cleanSymbol,
    verified: false,
    price: null,
    currency: 'LKR',
    asOfDate: null,
    errorDetails: 'CSE live feed currently unverified — retaining ATrad Excel price.',
  });
});

/**
 * Endpoint to parse Asia Securities or CSE Broker Contract Notes
 */
app.post('/api/parse-contract-note', async (req: Request, res: Response): Promise<void> => {
  const { fileData, mimeType, rawText } = req.body;

  if (!fileData && !rawText) {
    res.status(400).json({ error: 'Please provide either document fileData or rawText' });
    return;
  }

  if (!ai) {
    res.status(400).json({
      success: false,
      error: 'GEMINI_API_KEY is missing in .env.',
    });
    return;
  }

  try {
    const prompt = `You are a financial document parser specializing in Colombo Stock Exchange (CSE) broker contract notes, especially Asia Securities (Pvt) Ltd Bought & Sold Notes. Extract ONLY the summarized "Total" row per stock symbol. Return strict JSON.`;

    const parts: any[] = [];
    if (fileData && mimeType) {
      parts.push({ inlineData: { mimeType, data: fileData } });
    }
    parts.push({ text: `${prompt}\n\n${rawText ? `Contract Note Text Content:\n${rawText}` : ''}` });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            brokerName: { type: Type.STRING },
            contractNoteNumber: { type: Type.STRING },
            tradeDate: { type: Type.STRING },
            settlementDate: { type: Type.STRING },
            clientCdsNumber: { type: Type.STRING },
            noteType: { type: Type.STRING },
            trades: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  symbol: { type: Type.STRING },
                  companyName: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  grossPrice: { type: Type.NUMBER },
                  grossConsideration: { type: Type.NUMBER },
                  brokerageFee: { type: Type.NUMBER },
                  secCess: { type: Type.NUMBER },
                  cdsFee: { type: Type.NUMBER },
                  shareTransactionLevy: { type: Type.NUMBER },
                  totalExpenses: { type: Type.NUMBER },
                  netConsideration: { type: Type.NUMBER },
                  confidence: { type: Type.STRING },
                  unreadableFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['type', 'symbol', 'quantity', 'grossPrice', 'netConsideration'],
              },
            },
            totalNetConsideration: { type: Type.NUMBER },
            summaryStatus: { type: Type.STRING },
          },
          required: ['trades'],
        },
      },
    });

    res.json({ success: true, data: JSON.parse(response.text || '{}') });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: `Failed to parse contract note: ${err?.message || 'Unknown error'}`,
    });
  }
});

/**
 * Endpoint to fetch CSE News & ALL Dividend Announcements (100% Direct from cse.lk — Zero Gemini Token Needed!)
 */
app.post('/api/cse/news-dividends', async (req: Request, res: Response): Promise<void> => {
  const { symbols } = req.body;
  const cleanSymbols = Array.isArray(symbols)
    ? symbols.map((s: string) => String(s).trim().toUpperCase()).filter(Boolean)
    : [];

  const symbolSet = new Set(cleanSymbols);
  const baseSymbolMap: Record<string, string> = {};
  cleanSymbols.forEach((s) => {
    baseSymbolMap[s.split('.')[0]] = s;
  });

  try {
    // 1. Fetch official CSE market-wide announcements & dividend endpoints using form-urlencoded headers
    const endpoints = [
      'https://www.cse.lk/api/approvedAnnouncement',
      'https://www.cse.lk/api/corporateAnnouncements',
      'https://www.cse.lk/api/dividendAnnouncements',
      'https://www.cse.lk/api/financialAnnouncements',
    ];

    const responses = await Promise.allSettled(
      endpoints.map((url) =>
        fetch(url, {
          method: 'POST',
          headers: CSE_HEADERS,
          body: '',
        })
      )
    );

    const rawItems: any[] = [];
    for (const r of responses) {
      if (r.status === 'fulfilled' && r.value.ok) {
        try {
          const json: any = await r.value.json();
          if (Array.isArray(json)) {
            rawItems.push(...json);
          } else if (json && typeof json === 'object') {
            Object.values(json).forEach((val) => {
              if (Array.isArray(val)) rawItems.push(...val);
            });
          }
        } catch {
          // Ignore non-JSON response
        }
      }
    }

    // 2. Also inspect companyInfoSummery for user's portfolio symbols (contains company-specific announcements & dividends)
    const portfolioSample = cleanSymbols.slice(0, 50);
    const companyResults = await Promise.allSettled(
      portfolioSample.map((sym) => fetchDirectCSECompanyInfo(sym))
    );

    companyResults.forEach((r) => {
      if (r.status === 'fulfilled' && r.value?.rawData) {
        const rd = r.value.rawData;
        Object.values(rd).forEach((val) => {
          if (Array.isArray(val)) {
            val.forEach((entry: any) => {
              if (entry && typeof entry === 'object') {
                rawItems.push({
                  ...entry,
                  symbol: entry.symbol || r.value?.symbol,
                  companyName: entry.companyName || r.value?.companyName,
                });
              }
            });
          }
        });
      }
    });

    const allAnnouncements: any[] = [];
    const technicalsMap: Record<string, any> = {};
    const seenKeys = new Set<string>();

    rawItems.forEach((item: any, idx: number) => {
      const rawSym = String(
        item.symbol || item.companySymbol || item.security || item.stockSymbol || ''
      ).trim().toUpperCase();
      if (!rawSym) return;

      const base = rawSym.split('.')[0];
      const normalizedSym = rawSym.includes('.') ? rawSym : baseSymbolMap[base] || `${rawSym}.N0000`;
      const isOwned = symbolSet.has(rawSym) || symbolSet.has(normalizedSym) || Boolean(baseSymbolMap[base]);
      const finalSym = isOwned
        ? symbolSet.has(rawSym)
          ? rawSym
          : baseSymbolMap[base] || normalizedSym
        : normalizedSym;

      const headline = String(
        item.announcementCategory ||
          item.title ||
          item.subject ||
          item.dividendType ||
          item.description ||
          ''
      ).trim();
      const details = String(
        item.remarks || item.announcement || item.details || item.description || headline
      ).trim();

      if (!headline && !details) return;

      const combinedText = `${headline} ${details}`;
      const isDiv =
        /dividend|xd|interim|final\s+div|cash\s+div/i.test(combinedText) ||
        Boolean(item.xdDate || item.xd || item.dividendPerShare || item.dividendAmount);

      // Keep ALL updates for user's owned stocks + ALL market-wide Dividend declarations (including non-owned!)
      if (!isOwned && !isDiv) return;

      const dateStr = String(
        item.uploadedDate || item.announcementDate || item.date || item.createdDate || new Date().toISOString().slice(0, 10)
      ).slice(0, 10);

      const dedupeKey = `${finalSym}_${headline.slice(0, 40)}_${dateStr}`;
      if (seenKeys.has(dedupeKey)) return;
      seenKeys.add(dedupeKey);

      const xdMatch = combinedText.match(/XD\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
      const divAmtMatch = combinedText.match(/(?:Rs\.?|LKR)\s*(\d+(?:\.\d+)?)/i);

      const parsedDivAmt =
        typeof item.dividendPerShare === 'number'
          ? item.dividendPerShare
          : typeof item.dividendAmount === 'number'
          ? item.dividendAmount
          : divAmtMatch
          ? parseFloat(divAmtMatch[1])
          : null;

      const parsedXd = item.xdDate || item.xd || (xdMatch ? xdMatch[1] : null);

      allAnnouncements.push({
        id: `cse_direct_${Date.now()}_${idx}`,
        symbol: finalSym,
        companyName: item.companyName || item.company || finalSym,
        headline: headline || (isDiv ? 'Dividend Announcement' : 'Corporate Disclosure'),
        date: dateStr,
        category: isDiv ? 'DIVIDEND' : 'ANNOUNCEMENT',
        dividendAmount: parsedDivAmt,
        xdDate: parsedXd,
        currentPrice: null,
        inPortfolio: isOwned,
        details: details || headline,
        sourceUrl: item.filePath
          ? `https://cdn.cse.lk/${String(item.filePath).replace(/^\/+/, '')}`
          : `https://www.cse.lk/pages/company-profile/company-profile.component.html?symbol=${finalSym}`,
      });

      if (isDiv && isOwned && !technicalsMap[finalSym]) {
        technicalsMap[finalSym] = {
          symbol: finalSym,
          rsi14: null,
          sma50: null,
          dividendInfo: parsedDivAmt ? `Rs. ${parsedDivAmt.toFixed(2)}/sh` : 'Dividend Declared',
          xdDate: parsedXd,
          sourceUrl: `https://www.cse.lk/pages/company-profile/company-profile.component.html?symbol=${finalSym}`,
        };
      }
    });

    // Fetch live share prices directly from cse.lk for ALL dividend stocks (owned + non-owned)
    const priceCache: Record<string, number | null> = {};
    const divSymbolsToPrice = Array.from(
      new Set(allAnnouncements.filter((a) => a.category === 'DIVIDEND').map((a) => a.symbol))
    ).slice(0, 30);

    await Promise.allSettled(
      divSymbolsToPrice.map(async (sym) => {
        const info = await fetchDirectCSECompanyInfo(sym);
        priceCache[sym] = info?.price ?? null;
      })
    );

    const enrichedAnnouncements = allAnnouncements.map((a) => ({
      ...a,
      currentPrice: priceCache[a.symbol] ?? null,
    }));

    res.json({
      success: true,
      announcements: enrichedAnnouncements,
      technicals: Object.values(technicalsMap),
    });
  } catch (err: any) {
    res.json({
      success: false,
      error: `Direct cse.lk sync error: ${err?.message || 'Connection failed'}.`,
      announcements: [],
      technicals: [],
    });
  }
});

// Production vs Development server setup
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});