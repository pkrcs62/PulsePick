import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

const DEFAULT_SYMBOLS = [
  "RELIANCE","BHARTIARTL","HDFCBANK","ICICIBANK","SBIN","TCS",
  "BAJFINANCE","LT","INFY","SUNPHARMA","TITAN","M&M","HCLTECH",
  "AXISBANK","MARUTI","ITC"
];

function yahooSymbol(symbol) {
  return symbol === "M&M" ? "M&M.NS" : `${symbol}.NS`;
}

function decodeHtml(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchQuote(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}` +
    `?range=1y&interval=1d&events=div%2Csplits`;

  const response = await fetch(url, {
    headers: { "User-Agent": "PulsePick/1.0" }
  });

  if (!response.ok) throw new Error(`Quote ${symbol}: ${response.status}`);

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);

  const quote = result.indicators?.quote?.[0] || {};
  const closes = (quote.close || []).filter(Number.isFinite);
  const volumes = (quote.volume || []).filter(Number.isFinite);

  const price = Number(result.meta?.regularMarketPrice ?? closes.at(-1) ?? 0);

  const past = (n) => {
    if (!closes.length) return 0;
    const idx = Math.max(0, closes.length - 1 - n);
    return Number(closes[idx] ?? closes[0] ?? 0);
  };

  const p21 = past(21);
  const p63 = past(63);
  const p126 = past(126);
  const p252 = past(252);

  const avgVolume20 =
    volumes.slice(-20).reduce((a, b) => a + b, 0) /
    Math.max(1, Math.min(20, volumes.length));

  return {
    price,
    m1: p21 ? ((price - p21) / p21) * 100 : 0,
    m3: p63 ? ((price - p63) / p63) * 100 : 0,
    m6: p126 ? ((price - p126) / p126) * 100 : 0,
    y1: p252 ? ((price - p252) / p252) * 100 : 0,
    volume: avgVolume20 && volumes.at(-1) ? volumes.at(-1) / avgVolume20 : 1,
    timestamp: Date.now()
  };
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
      const url =
        `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
        `&hl=en-IN&gl=IN&ceid=IN:en`;

      const response = await fetch(url, {
        headers: { "User-Agent": "PulsePick/1.0" }
      });

      if (!response.ok) continue;

      const xml = await response.text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8);

      for (const match of items) {
        const block = match[1];

        const title =
          (
            block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
            block.match(/<title>(.*?)<\/title>/)
          )?.[1] || "";

        const source =
          (block.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] ||
          "Google News";

        if (title) {
          all.push({
            title: decodeHtml(title),
            source: decodeHtml(source),
            description: ""
          });
        }
      }
    } catch {
      // Continue with the other news queries.
    }
  }

  const seen = new Set();
  return all
    .filter(item => {
      if (seen.has(item.title)) return false;
      seen.add(item.title);
      return true;
    })
    .slice(0, 24);
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "PulsePick Render backend",
    message: "Backend is running."
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/snapshot", async (req, res) => {
  const symbols = Array.isArray(req.body?.symbols)
    ? req.body.symbols.slice(0, 30)
    : DEFAULT_SYMBOLS;

  try {
    const results = await Promise.all(
      symbols.map(async symbol => {
        try {
          return [symbol, await fetchQuote(symbol)];
        } catch {
          return [symbol, null];
        }
      })
    );

    const quotes = Object.fromEntries(results.filter(([, value]) => value));
    const news = await fetchNews();

    res.json({
      ok: true,
      quotes,
      news,
      updatedAt: new Date().toISOString(),
      source: "Render free prototype data bridge"
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error?.message || "Data fetch failed"
    });
  }
});

app.listen(PORT, () => {
  console.log(`PulsePick backend listening on port ${PORT}`);
});
