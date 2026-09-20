const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const STOOQ_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'text/csv,text/plain,*/*',
};

// Upstream resilience: cap how long we wait on Stooq, and cache each parsed row
// briefly. The dashboard polls every ~10s, so without a cache a handful of open
// tabs translates into a burst of identical upstream requests; a slow upstream
// would also tie up a request per poll. The rolling history below is still
// updated on every request, so sparklines keep accumulating at the poll rate.
const UPSTREAM_TIMEOUT_MS = 5000;
const ROW_CACHE_TTL_MS = 5000;
const rowCache = new Map(); // stooq symbol -> { expires, row }

// In-memory rolling history per symbol so the sparkline accumulates
// as the dashboard polls. Resets on server restart.
const HISTORY_LIMIT = 240; // ~40min at 10s polling
const history = new Map(); // symbol -> [{ t, c }]

app.use(express.static(path.join(__dirname, 'public')));

// Stooq symbols are lower-case and US tickers need the ".us" suffix.
// We accept either "AAPL" or "AAPL.US" / "WSE:CDR" style. For simplicity:
// if no dot, assume .us.
function toStooqSymbol(input) {
  const s = input.toLowerCase().trim();
  return s.includes('.') ? s : `${s}.us`;
}

// Ticker characters only, so we never interpolate arbitrary input into the
// upstream URL or the history keys.
function isValidSymbol(s) {
  return /^[A-Z0-9][A-Z0-9.:_-]{0,15}$/.test(s);
}

function parseCsv(text) {
  const lines = text.replace(/\r/g, '').trim().split('\n');
  if (lines.length < 2) return null;
  const headers = lines[0].split(',');
  const values = lines[1].split(',');
  const row = {};
  headers.forEach((h, i) => (row[h] = values[i]));
  return row;
}

function pushHistory(symbol, t, c) {
  let arr = history.get(symbol);
  if (!arr) {
    arr = [];
    history.set(symbol, arr);
  }
  const last = arr[arr.length - 1];
  if (last && last.t === t) {
    last.c = c; // same timestamp, just refresh value
  } else {
    arr.push({ t, c });
    if (arr.length > HISTORY_LIMIT) arr.shift();
  }
  return arr;
}

async function fetchRow(stooqSym) {
  const cached = rowCache.get(stooqSym);
  if (cached && cached.expires > Date.now()) return cached.row;

  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(
    stooqSym
  )}&f=sd2t2ohlcvn&h&e=csv`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, {
      headers: STOOQ_HEADERS,
      signal: controller.signal,
    });
    if (!upstream.ok) {
      const err = new Error(`Stooq responded ${upstream.status}`);
      err.status = upstream.status;
      throw err;
    }
    const row = parseCsv(await upstream.text());
    rowCache.set(stooqSym, { expires: Date.now() + ROW_CACHE_TTL_MS, row });
    return row;
  } finally {
    clearTimeout(timer);
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    trackedSymbols: history.size,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get('/api/quote/:symbol', async (req, res) => {
  const requested = req.params.symbol.toUpperCase().trim();
  if (!isValidSymbol(requested)) {
    return res.status(400).json({ error: `Invalid symbol: ${requested}` });
  }

  const stooqSym = toStooqSymbol(requested);

  try {
    const row = await fetchRow(stooqSym);
    if (!row || row.Close === 'N/D' || !row.Close) {
      return res.status(404).json({ error: `No data for ${requested}` });
    }

    const open = parseFloat(row.Open);
    const high = parseFloat(row.High);
    const low = parseFloat(row.Low);
    const close = parseFloat(row.Close);
    const volume = parseInt(row.Volume, 10);
    const name = row.Name || requested;

    // Intraday change: today's close (latest) vs today's open
    const change = close - open;
    const changePct = open ? (change / open) * 100 : 0;

    // Stooq timestamp: e.g. "2026-05-26" + "16:47:43" UTC
    const ts = Date.parse(`${row.Date}T${row.Time}Z`) || Date.now();
    const series = pushHistory(requested, ts, close);

    res.json({
      symbol: requested,
      name,
      currency: 'USD',
      price: close,
      open,
      change,
      changePct,
      dayHigh: high,
      dayLow: low,
      volume,
      series,
      fetchedAt: Date.now(),
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Upstream timed out' });
    }
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Stocks dashboard running at http://localhost:${PORT}`);
});
