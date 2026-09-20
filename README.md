# Live Stocks Dashboard

A vibe-coded localhost dashboard for live stock prices. Uses Stooq's CSV quote
endpoint — **no API key required**.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000

## Features

- Live price + intraday sparkline for each ticker
- Add/remove tickers (persisted in `localStorage`)
- Auto-refresh every 10s, with green/red flash on price change
- Day high/low and volume per card
- Upstream quotes are cached for 5s and requests time out after 5s, so a slow
  Stooq or several open tabs don't turn into a burst of upstream calls

## API

- `GET /api/quote/:symbol` — one quote, e.g. `/api/quote/NVDA`. Invalid tickers
  return `400`, unknown ones `404`, upstream timeouts `504`.
- `GET /api/health` — `{ ok, trackedSymbols, uptimeSeconds }`.

## How it works

- `server.js` proxies `stooq.com/q/l/?s=<SYMBOL>&f=sd2t2ohlcvn&h&e=csv` so the
  browser doesn't hit CORS issues.
- `public/` is plain HTML/CSS/JS plus Chart.js from a CDN.

## Notes

Stooq is a third-party endpoint that can rate-limit or change at any time. Fine
for personal use on localhost; don't deploy it publicly.
