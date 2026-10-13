# Live Stocks Dashboard

A vibe-coded localhost dashboard for live stock prices. Uses Yahoo Finance's
unofficial chart endpoint — **no API key required**.

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

## How it works

- `server.js` proxies `query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>` so the
  browser doesn't hit CORS issues.
- `public/` is plain HTML/CSS/JS plus Chart.js from a CDN.

## API

- `GET /api/quote/:symbol` — one quote for a ticker, e.g. `/api/quote/NVDA`.
- `GET /api/health` — liveness check: `{ ok, trackedSymbols, uptimeSeconds }`.

## Notes

This uses an unofficial endpoint — Yahoo can rate-limit or change it at any
time. Fine for personal use on localhost; don't deploy it publicly.
