import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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
 * Helper: Normalize company name for fuzzy matching (e.g. "SRI LANKA TELECOM PLC" -> "SRI LANKA TELECOM")
 */
function normalizeCompanyName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\b(PLC|LTD|LIMITED|\(PVT\)|PVT|THE|COMPANY|CO\.?)\b/g, '')
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Helper: Convert CSE date string like "25 Nov 2026" to ISO "2026-11-25"
 */
function parseCseDateToIso(dateInput: any): string | null {
  if (!dateInput) return null;
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const str = String(dateInput).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);

  const parsed = new Date(`${str} UTC`);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return str;
}

/**
 * Helper: Fetch full announcement details (symbol, votingDivPerShare, xd, payment, PDF) by announcementId
 */
async function fetchCSEAnnouncementDetail(announcementId: number | string) {
  try {
    const formBody = new URLSearchParams({ announcementId: String(announcementId) });
    const res = await fetch('https://www.cse.lk/api/getAnnouncementById', {
      method: 'POST',
      headers: CSE_HEADERS,
      body: formBody.toString(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Endpoint to fetch ALL Live CSE Dividend & Corporate Announcements (Owned + Non-Owned)
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
    const annRes = await fetch('https://www.cse.lk/api/approvedAnnouncement', {
      method: 'POST',
      headers: CSE_HEADERS,
      body: '',
    });

    if (!annRes.ok) {
      res.json({
        success: false,
        error: `cse.lk returned HTTP ${annRes.status}`,
        announcements: [],
        technicals: [],
      });
      return;
    }

    const annJson: any = await annRes.json();
    const announcementsRaw: any[] = Array.isArray(annJson?.approvedAnnouncements)
      ? annJson.approvedAnnouncements
      : [];

    const allAnnouncements: any[] = [];
    const technicalsMap: Record<string, any> = {};
    const seenKeys = new Set<string>();

    // Filter relevant announcements (all Dividend/XD items + announcements for owned companies)
    const candidateItems = announcementsRaw.filter((item) => {
      const cat = String(item.announcementCategory || '').toUpperCase();
      return /DIVIDEND|XD|SCRIP|BONUS|SUB-DIVISION|RIGHTS/i.test(cat) || Boolean(item.announcementId);
    }).slice(0, 35);

    // Fetch exact details via getAnnouncementById in parallel (fast!)
    const detailResults = await Promise.allSettled(
      candidateItems.map((item) =>
        item.announcementId ? fetchCSEAnnouncementDetail(item.announcementId) : Promise.resolve(null)
      )
    );

    for (let idx = 0; idx < candidateItems.length; idx++) {
      const item = candidateItems[idx];
      const detailRes = detailResults[idx];
      const detailJson: any = detailRes.status === 'fulfilled' ? detailRes.value : null;
      const det = detailJson?.reqBaseAnnouncement || detailJson?.announcement || {};

      const category = String(item.announcementCategory || det.dType || '').trim().toUpperCase();
      const baseSym = String(det.symbol || item.symbol || '').trim().toUpperCase();
      const companyName = String(det.companyName || item.company || baseSym).trim();

      if (!baseSym && !companyName) continue;

      const cleanBase = baseSym.split('.')[0];
      const normalizedVotingSym = baseSym
        ? baseSym.includes('.')
          ? baseSym
          : baseSymbolMap[cleanBase] || `${cleanBase}.N0000`
        : companyName.slice(0, 12).toUpperCase();

      const isOwned =
        symbolSet.has(normalizedVotingSym) ||
        symbolSet.has(baseSym) ||
        Boolean(baseSymbolMap[cleanBase]);

      const finalSym = isOwned
        ? symbolSet.has(normalizedVotingSym)
          ? normalizedVotingSym
          : baseSymbolMap[cleanBase] || normalizedVotingSym
        : normalizedVotingSym;

      const isDiv =
        /DIVIDEND|XD|SCRIP|BONUS/i.test(category) ||
        Boolean(det.xd || det.payment || det.votingDivPerShare || det.divPerShare);

      // Keep ALL updates for owned portfolio stocks + ALL market-wide Dividend declarations!
      if (!isOwned && !isDiv) continue;

      // Extract exact Dividend Per Share (votingDivPerShare, nonVotingDivPerShare, or divPerShare)
      const isNonVoting = finalSym.includes('.X');
      let dividendAmount: number | null = null;
      if (isNonVoting && typeof det.nonVotingDivPerShare === 'number' && det.nonVotingDivPerShare > 0) {
        dividendAmount = det.nonVotingDivPerShare;
      } else if (typeof det.votingDivPerShare === 'number' && det.votingDivPerShare > 0) {
        dividendAmount = det.votingDivPerShare;
      } else if (typeof det.divPerShare === 'number' && det.divPerShare > 0) {
        dividendAmount = det.divPerShare;
      } else if (typeof det.nonVotingDivPerShare === 'number' && det.nonVotingDivPerShare > 0) {
        dividendAmount = det.nonVotingDivPerShare;
      }

      const xdDate = parseCseDateToIso(det.xd || item.xd);
      const paymentDate = parseCseDateToIso(det.payment || det.paymentDate || item.paymentDate);
      const isoDate = parseCseDateToIso(det.dateOfAnnouncement || item.dateOfAnnouncement) || new Date().toISOString().slice(0, 10);

      const dedupeKey = `${finalSym}_${category}_${xdDate || isoDate}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const fileArr = Array.isArray(detailJson?.reqAnnouncementDocuments) ? detailJson.reqAnnouncementDocuments : [];
      const sourceUrl = fileArr[0]?.filePath
        ? `https://cdn.cse.lk/${String(fileArr[0].filePath).replace(/^\/+/, '')}`
        : `https://www.cse.lk/pages/company-profile/company-profile.component.html?symbol=${encodeURIComponent(finalSym)}`;

      const detailText = String(det.remarks || item.remarks || `${category} (${item.dateOfAnnouncement || isoDate})`).trim();

      allAnnouncements.push({
        id: `cse_live_${item.id || idx}_${Date.now()}`,
        symbol: finalSym,
        companyName: companyName || finalSym,
        headline: dividendAmount
          ? `Cash Dividend: Rs. ${dividendAmount.toFixed(2)} per share`
          : `${category} (${item.dateOfAnnouncement || isoDate})`,
        date: isoDate,
        category: isDiv ? 'DIVIDEND' : 'ANNOUNCEMENT',
        dividendAmount,
        xdDate,
        paymentDate,
        currentPrice: null,
        inPortfolio: isOwned,
        details: detailText,
        sourceUrl,
      });

      if (isDiv && isOwned && !technicalsMap[finalSym]) {
        technicalsMap[finalSym] = {
          symbol: finalSym,
          rsi14: null,
          sma50: null,
          dividendInfo: dividendAmount ? `Rs. ${dividendAmount.toFixed(2)}/sh` : category,
          xdDate,
          sourceUrl,
        };
      }
    }

    // Fetch live share prices for all discovered Dividend stocks
    const divSymbols = Array.from(
      new Set(allAnnouncements.filter((a) => a.category === 'DIVIDEND').map((a) => a.symbol))
    ).slice(0, 25);

    const priceMap: Record<string, number | null> = {};
    await Promise.allSettled(
      divSymbols.map(async (sym) => {
        const info = await fetchDirectCSECompanyInfo(sym);
        priceMap[sym] = info?.price ?? null;
      })
    );

    const enriched = allAnnouncements.map((a) => ({
      ...a,
      currentPrice: priceMap[a.symbol] ?? null,
    }));

    res.json({
      success: true,
      announcements: enriched,
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
/**
 * 100% Free, Offline-Capable CSE & Asia Securities Contract Note Parser (Zero API Key Needed!)
 */
function extractContractNoteLocally(text: string) {
  const cleanText = text.replace(/\r/g, '\n');
  const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);

  const isSold = /SOLD\s+NOTE|SALE\s+CONTRACT|SELL/i.test(cleanText);
  const noteType = isSold ? 'SOLD' : 'BOUGHT';

  const brokerMatch = cleanText.match(/(ASIA\s+SECURITIES[^\n]*|CAL[^\n]*|FIRST\s+CAPITAL[^\n]*|NDB\s+SECURITIES[^\n]*|CT\s+CLSA[^\n]*)/i);
  const contractNoMatch = cleanText.match(/(?:Contract\s*(?:Note)?\s*No\.?|Note\s*No\.?|Ref\s*No\.?)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i);
  const tradeDateMatch = cleanText.match(/(?:Trade\s*Date|Date)\s*[:\-]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
  const settlementDateMatch = cleanText.match(/(?:Settlement\s*Date|Due\s*Date)\s*[:\-]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
  const cdsMatch = cleanText.match(/(?:CDS\s*(?:Account|No\.?|A\/C)?)\s*[:\-]?\s*([A-Z0-9\-]{6,20})/i);

  const trades: any[] = [];
  const symbolRegex = /\b([A-Z]{2,6}\.(?:N|X|Y|R|W|P)\d{4})\b/g;
  const foundSymbols = Array.from(new Set(Array.from(cleanText.matchAll(symbolRegex), (m) => m[1])));

  for (const symbol of foundSymbols) {
    const matchingLines = lines.filter((l) => l.includes(symbol));
    const totalLine =
      matchingLines.find((l) => /total/i.test(l)) ||
      matchingLines[matchingLines.length - 1] ||
      '';

    const lineIdx = lines.indexOf(totalLine);
    const contextBlock = lines.slice(Math.max(0, lineIdx - 1), Math.min(lines.length, lineIdx + 4)).join(' ');

    const numMatches = Array.from(contextBlock.matchAll(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g))
      .map((m) => parseFloat(m[0].replace(/,/g, '')))
      .filter((n) => !isNaN(n) && n > 0);

    const quantity = numMatches.find((n) => Number.isInteger(n) && n >= 1) || 0;
    const priceCandidates = numMatches.filter((n) => n !== quantity && n < 100000);
    const grossPrice = priceCandidates[0] || 0;
    const grossConsideration =
      quantity > 0 && grossPrice > 0
        ? Math.round(quantity * grossPrice * 100) / 100
        : priceCandidates[1] || 0;

    const brokerageFee = Math.round(grossConsideration * 0.0064 * 100) / 100;
    const secCess = Math.round(grossConsideration * 0.00156 * 100) / 100;
    const cdsFee = Math.round(grossConsideration * 0.00024 * 100) / 100;
    const shareTransactionLevy = Math.round(grossConsideration * 0.003 * 100) / 100;
    const totalExpenses = Math.round(grossConsideration * 0.0112 * 100) / 100;

    const calculatedNet =
      noteType === 'BOUGHT'
        ? Math.round((grossConsideration + totalExpenses) * 100) / 100
        : Math.round((grossConsideration - totalExpenses) * 100) / 100;

    const explicitNet = numMatches.find(
      (n) => Math.abs(n - calculatedNet) <= 5 && Math.abs(n - grossConsideration) > 0.01
    );
    const netConsideration = explicitNet ?? calculatedNet;

    trades.push({
      type: noteType === 'SOLD' ? 'SELL' : 'BUY',
      symbol,
      companyName: symbol,
      quantity,
      grossPrice,
      grossConsideration,
      brokerageFee,
      secCess,
      cdsFee,
      shareTransactionLevy,
      totalExpenses,
      netConsideration,
      confidence: quantity > 0 && grossPrice > 0 ? 'HIGH' : 'MEDIUM',
      unreadableFlags: quantity > 0 && grossPrice > 0 ? [] : ['Verify quantity/price from PDF'],
    });
  }

  const totalNetConsideration = trades.reduce((acc, t) => acc + (t.netConsideration || 0), 0);

  return {
    brokerName: brokerMatch ? brokerMatch[1].trim() : 'Asia Securities (Pvt) Ltd',
    contractNoteNumber: contractNoMatch ? contractNoMatch[1].trim() : `CN-${Date.now().toString().slice(-6)}`,
    tradeDate: tradeDateMatch ? tradeDateMatch[1] : new Date().toISOString().slice(0, 10),
    settlementDate: settlementDateMatch ? settlementDateMatch[1] : '',
    clientCdsNumber: cdsMatch ? cdsMatch[1] : '',
    noteType,
    trades,
    totalNetConsideration: Math.round(totalNetConsideration * 100) / 100,
    summaryStatus: trades.length > 0 ? 'PARSED_SUCCESSFULLY' : 'NO_SYMBOLS_FOUND',
  };
}

/**
 * Endpoint to parse Asia Securities or CSE Broker Contract Notes (100% Free Local Engine)
 */
app.post('/api/parse-contract-note', async (req: Request, res: Response): Promise<void> => {
  const { fileData, mimeType, rawText } = req.body;

  if (!fileData && !rawText) {
    res.status(400).json({ success: false, error: 'Please provide either a PDF/Text file or pasted rawText' });
    return;
  }

  try {
    let extractedText = rawText ? String(rawText) : '';

    if (fileData) {
      const buffer = Buffer.from(fileData, 'base64');
      if (mimeType && mimeType.includes('pdf')) {
        const pdfData = await pdfParse(buffer);
        extractedText = `${extractedText}\n${pdfData.text || ''}`.trim();
      } else {
        extractedText = `${extractedText}\n${buffer.toString('utf-8')}`.trim();
      }
    }

    if (!extractedText) {
      res.status(400).json({
        success: false,
        error: 'Could not extract readable text from this file. If it is a scanned image, please paste the text directly.',
      });
      return;
    }

    const parsedData = extractContractNoteLocally(extractedText);

    if (parsedData.trades.length === 0) {
      res.status(422).json({
        success: false,
        error: 'No CSE stock symbols (e.g. ACL.N0000) found in the contract note text.',
      });
      return;
    }

    res.json({ success: true, data: parsedData });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: `Failed to parse contract note locally: ${err?.message || 'Unknown error'}`,
    });
  }
});

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

