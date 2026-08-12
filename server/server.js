import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

// --- Data sources: no account, no token, no signup required anywhere below. ---
const NSE_EQUITY_LIST_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";
const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "*/*"
};

// A curated fallback list (large, liquid NSE names) used ONLY if the live NSE
// symbol list can't be fetched (NSE's site sometimes blocks server-side requests).
// This keeps the app working in degraded mode rather than failing outright.
const FALLBACK_SYMBOLS = [
  "RELIANCE","TCS","HDFCBANK","ICICIBANK","BHARTIARTL","INFY","SBIN","LICI","ITC","HINDUNILVR",
  "LT","BAJFINANCE","HCLTECH","MARUTI","SUNPHARMA","KOTAKBANK","AXISBANK","TITAN","ONGC","NTPC",
  "ULTRACEMCO","ADANIENT","ADANIPORTS","ASIANPAINT","BAJAJFINSV","WIPRO","M&M","POWERGRID","JSWSTEEL","TATAMOTORS",
  "TATASTEEL","COALINDIA","NESTLEIND","GRASIM","INDUSINDBK","TECHM","HDFCLIFE","SBILIFE","BRITANNIA","CIPLA",
  "DRREDDY","EICHERMOT","APOLLOHOSP","DIVISLAB","BAJAJ-AUTO","HEROMOTOCO","BPCL","UPL","TATACONSUM","HINDALCO",
  "SHRIRAMFIN","VEDL","GAIL","PIDILITIND","DLF","AMBUJACEM","SIEMENS","DABUR","GODREJCP","BANKBARODA",
  "PNB","CANBK","IOC","HAL","BEL","IRCTC","ZOMATO","PAYTM","NYKAA","POLICYBZR",
  "TVSMOTOR","BOSCHLTD","HAVELLS","MARICO","COLPAL","MUTHOOTFIN","CHOLAFIN","LTIM","PERSISTENT","MPHASIS",
  "NAUKRI","TRENT","ABB","CGPOWER","SRF","PIIND","BALKRISNIND","MOTHERSON","BHARATFORG","ASHOKLEY",
  "IDFCFIRSTB","FEDERALBNK","AUBANK","BANDHANBNK","YESBANK","RBLBANK","JUBLFOOD","VOLTAS","INDIGO","IRFC",
  "RVNL","PFC","RECLTD","IRCON","NBCC","NHPC","SJVN","JINDALSTEL","SAIL","NMDC"
];

let universeCache = { at: 0, instruments: [], source: "" };

function json(res, data, status = 200) {
  res.status(status).json(data);
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map(h => h.trim().toUpperCase());
  const symbolIdx = header.findIndex(h => h === "SYMBOL");
  const nameIdx = header.findIndex(h => h.startsWith("NAME"));
  const seriesIdx = header.findIndex(h => h === "SERIES");
  if (symbolIdx < 0) throw new Error("Unexpected CSV format from NSE");

  return lines.slice(1)
    .map(line => line.split(","))
    .filter(cols => cols.length > symbolIdx && (seriesIdx < 0 || ["EQ", "BE"].includes((cols[seriesIdx] || "").trim())))
    .map(cols => ({
      symbol: (cols[symbolIdx] || "").trim(),
      name: (nameIdx >= 0 ? cols[nameIdx] : cols[symbolIdx] || "").trim() || cols[symbolIdx].trim()
    }))
    .filter(x => x.symbol);
}

async function loadUniverse() {
  if (universeCache.instruments.length && Date.now() - universeCache.at < 6 * 60 * 60 * 1000) {
    return universeCache.instruments;
  }

  try {
    const r = await fetch(NSE_EQUITY_LIST_URL, { headers: BROWSER_HEADERS });
    if (!r.ok) throw new Error(`NSE equity list returned HTTP ${r.status}`);
    const text = await r.text();
    const instruments = parseCsv(text).sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (!instruments.length) throw new Error("NSE equity list parsed to zero rows");

    universeCache = { at: Date.now(), instruments, source: "NSE live equity list (EQUITY_L.csv)" };
    return instruments;
  } catch (err) {
    console.warn("Live NSE universe fetch failed, using fallback list:", err.message);
    const instruments = FALLBACK_SYMBOLS.map(s => ({ symbol: s, name: s }));
    universeCache = { at: Date.now(), instruments, source: "Fallback curated list (NSE fetch failed)" };
    return instruments;
  }
}

async function fetchYahooChart(symbol, range, interval) {
  const yahooSymbol = symbol.startsWith("^") ? symbol : `${symbol}.NS`;
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=${interval}`;
      const r = await fetch(url, { headers: BROWSER_HEADERS });
      if (!r.ok) { lastErr = new Error(`Yahoo HTTP ${r.status}`); continue; }
      const data = await r.json();
      const result = data?.chart?.result?.[0];
      if (!result) { lastErr = new Error(data?.chart?.error?.description || "No chart data"); continue; }
      return result;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Yahoo chart fetch failed");
}

function normalizeQuoteFromChart(symbol, result) {
  const meta = result?.meta || {};
  const price = Number(meta.regularMarketPrice ?? 0);
  const prevClose = Number(meta.previousClose ?? meta.chartPreviousClose ?? 0);
  return {
    symbol,
    price,
    prevClose,
    changePct: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
    volume: Number(meta.regularMarketVolume ?? 0),
    timestamp: Date.now()
  };
}

function historyFeaturesFromChart(result) {
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter(Number.isFinite);
  const vols = (result?.indicators?.quote?.[0]?.volume || []).filter(Number.isFinite);

  if (closes.length < 5) return { m1: 0, m3: 0, m6: 0, y1: 0, avgVol: 0, volRatio: 1 };

  const latest = closes.at(-1) || 0;
  const at = n => closes.length > n ? closes[closes.length - 1 - n] : closes[0];
  const p21 = at(21), p63 = at(63), p126 = at(126), p252 = at(252);
  const avgVol20 = vols.slice(-20).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(20, vols.length));

  return {
    m1: p21 ? ((latest - p21) / p21) * 100 : 0,
    m3: p63 ? ((latest - p63) / p63) * 100 : 0,
    m6: p126 ? ((latest - p126) / p126) * 100 : 0,
    y1: p252 ? ((latest - p252) / p252) * 100 : 0,
    avgVol: avgVol20,
    volRatio: avgVol20 && vols.at(-1) ? vols.at(-1) / avgVol20 : 1
  };
}

// Fetch quote-only (cheap, short range) for every stock in the universe, concurrency-limited
// and with retries, since Yahoo has no bulk endpoint that works without auth anymore.
async function fetchFullQuotes(instruments) {
  const result = {};
  const failed = [];
  const CONCURRENCY = 20;
  const MAX_RETRIES = 1;

  for (let i = 0; i < instruments.length; i += CONCURRENCY) {
    const batch = instruments.slice(i, i + CONCURRENCY);
    const rows = await Promise.all(batch.map(async inst => {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const chart = await fetchYahooChart(inst.symbol, "5d", "1d");
          return [inst.symbol, normalizeQuoteFromChart(inst.symbol, chart)];
        } catch (err) {
          if (attempt === MAX_RETRIES) { failed.push(inst.symbol); return [inst.symbol, null]; }
          await new Promise(r => setTimeout(r, 250));
        }
      }
    }));
    for (const [symbol, quote] of rows) if (quote && quote.price > 0) result[symbol] = quote;
  }

  if (failed.length) console.warn(`fetchFullQuotes: ${failed.length}/${instruments.length} symbols failed`);
  return result;
}

async function fetchNews() {
  const queries = [
    "India stock market RBI inflation interest rates",
    "Indian stocks company results sectors",
    "global markets crude oil Fed China India"
  ];
  const all = [];

  for (const query of queries) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
      const r = await fetch(url, { headers: { "User-Agent": "PulsePick/1.0" } });
      if (!r.ok) continue;
      const xml = await r.text();

      for (const match of [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8)) {
        const block = match[1];
        const title =
          (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
           block.match(/<title>(.*?)<\/title>/))?.[1] || "";
        const source = (block.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || "Google News";
        if (title) all.push({ title, source, description: "" });
      }
    } catch {}
  }

  const seen = new Set();
  return all.filter(x => {
    if (seen.has(x.title)) return false;
    seen.add(x.title);
    return true;
  }).slice(0, 24);
}

async function enrichCandidates(quotes, instruments) {
  const candidates = instruments
    .map(i => ({ ...i, ...(quotes[i.symbol] || {}) }))
    .filter(x => x.price > 0)
    .sort((a, b) => Number(b.changePct || 0) - Number(a.changePct || 0))
    .slice(0, 120);

  const enriched = {};
  const CONCURRENCY = 8;

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const rows = await Promise.all(batch.map(async c => {
      try {
        const chart = await fetchYahooChart(c.symbol, "1y", "1d");
        return [c.symbol, { history: historyFeaturesFromChart(chart), candlesCount: chart?.timestamp?.length || 0 }];
      } catch {
        return [c.symbol, { history: historyFeaturesFromChart(null), candlesCount: 0 }];
      }
    }));
    for (const [symbol, value] of rows) enriched[symbol] = value;
  }

  return enriched;
}

app.get("/", (_req, res) => res.json({
  ok: true,
  service: "PulsePick backend",
  provider: "Yahoo Finance (chart API) + NSE public equity list — no account/token required"
}));

app.get("/health", (_req, res) => {
  json(res, {
    ok: true,
    dataSource: "Yahoo Finance + NSE public list",
    tokenRequired: false
  });
});

app.get("/api/universe", async (_req, res) => {
  try {
    const instruments = await loadUniverse();
    json(res, {
      ok: true,
      count: instruments.length,
      symbols: instruments.map(x => x.symbol),
      instruments: instruments.map(x => ({ symbol: x.symbol, name: x.name })),
      source: universeCache.source
    });
  } catch (error) {
    json(res, { ok: false, error: error?.message || "Universe unavailable" }, 503);
  }
});

app.get("/api/symbol-check", async (_req, res) => {
  try {
    const instruments = await loadUniverse();
    const sample = instruments.slice(0, 12);
    const quotes = await fetchFullQuotes(sample);
    const missing = sample.map(x => x.symbol).filter(sym => !quotes[sym]);

    json(res, {
      ok: Object.keys(quotes).length > 0,
      universeCount: instruments.length,
      universeSource: universeCache.source,
      sampleChecked: sample.length,
      samplePrices: Object.keys(quotes).length,
      missingSymbols: missing
    });
  } catch (error) {
    json(res, { ok: false, error: error?.message || "Data source connection failed" }, 503);
  }
});

app.post("/api/quotes", async (req, res) => {
  try {
    const { instruments } = req.body || {};
    if (!Array.isArray(instruments) || !instruments.length) {
      return json(res, { ok: false, error: "instruments array required: [{symbol}]" }, 400);
    }
    const clean = instruments
      .filter(x => x && typeof x.symbol === "string")
      .slice(0, 500);
    if (!clean.length) {
      return json(res, { ok: false, error: "no valid {symbol} entries provided" }, 400);
    }
    const quotes = await fetchFullQuotes(clean);
    json(res, { ok: true, requested: clean.length, received: Object.keys(quotes).length, quotes });
  } catch (error) {
    json(res, { ok: false, error: error?.message || "Quote lookup failed" }, 503);
  }
});

app.post("/api/snapshot", async (req, res) => {
  try {
    const instruments = await loadUniverse();
    const quotes = await fetchFullQuotes(instruments);
    const quoteCoverage = {
      universeCount: instruments.length,
      universeSource: universeCache.source,
      quotesReceived: Object.keys(quotes).length,
      coveragePct: instruments.length
        ? Number(((Object.keys(quotes).length / instruments.length) * 100).toFixed(1))
        : 0
    };
    if (quoteCoverage.coveragePct < 90) {
      console.warn("Low quote coverage:", quoteCoverage);
    }
    const history = await enrichCandidates(quotes, instruments);
    const news = await fetchNews();

    let indexQuotes = {};
    try {
      const [nifty, banknifty] = await Promise.all([
        fetchYahooChart("^NSEI", "5d", "1d").catch(() => null),
        fetchYahooChart("^NSEBANK", "5d", "1d").catch(() => null)
      ]);
      if (nifty) indexQuotes.NIFTY = normalizeQuoteFromChart("NIFTY", nifty);
      if (banknifty) indexQuotes.BANKNIFTY = normalizeQuoteFromChart("BANKNIFTY", banknifty);
    } catch {}

    json(res, {
      ok: true,
      universeCount: instruments.length,
      quoteCoverage,
      quotes,
      history,
      indexes: indexQuotes,
      news,
      updatedAt: new Date().toISOString(),
      source: "Yahoo Finance chart API + NSE public equity list + Google News RSS"
    });
  } catch (error) {
    json(res, { ok: false, error: error?.message || "Market scan failed" }, 503);
  }
});

app.listen(PORT, () => console.log(`PulsePick backend listening on ${PORT}`));
