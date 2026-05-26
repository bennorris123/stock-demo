const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'TSLA', 'AMZN'];
const REFRESH_MS = 10_000;
const STORAGE_KEY = 'stocks-dashboard.symbols';

const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');
const input = document.getElementById('symbol-input');
const addBtn = document.getElementById('add-btn');

const cards = new Map(); // symbol -> { el, chart, lastPrice }

function loadSymbols() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  return DEFAULT_SYMBOLS;
}

function saveSymbols() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...cards.keys()]));
}

function fmtPrice(n, currency = 'USD') {
  if (n == null || Number.isNaN(n)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

function fmtVolume(v) {
  if (v == null) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

function makeCard(symbol) {
  const el = document.createElement('div');
  el.className = 'card loading';
  el.dataset.symbol = symbol;
  el.innerHTML = `
    <div class="top">
      <div>
        <div class="symbol">${symbol}</div>
        <div class="name">Loading…</div>
      </div>
      <button class="remove" title="Remove">×</button>
    </div>
    <div class="price">—</div>
    <div class="change">—</div>
    <div class="chart-wrap"><canvas></canvas></div>
    <div class="meta">
      <div><span class="label">High</span><span class="high">—</span></div>
      <div><span class="label">Low</span><span class="low">—</span></div>
      <div><span class="label">Volume</span><span class="vol">—</span></div>
    </div>
  `;
  el.querySelector('.remove').addEventListener('click', () => removeCard(symbol));

  const ctx = el.querySelector('canvas').getContext('2d');
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          data: [],
          borderColor: '#6366f1',
          borderWidth: 2,
          fill: true,
          backgroundColor: 'rgba(99, 102, 241, 0.15)',
          tension: 0.25,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false },
      },
      elements: { line: { borderJoinStyle: 'round' } },
    },
  });

  grid.appendChild(el);
  cards.set(symbol, { el, chart, lastPrice: null });
}

function removeCard(symbol) {
  const c = cards.get(symbol);
  if (!c) return;
  c.chart.destroy();
  c.el.remove();
  cards.delete(symbol);
  saveSymbols();
}

function setCardError(symbol, message) {
  const c = cards.get(symbol);
  if (!c) return;
  c.el.classList.remove('loading');
  c.el.classList.add('error');
  c.el.querySelector('.price').textContent = message || 'Error';
  c.el.querySelector('.change').textContent = '';
}

function updateCard(symbol, data) {
  const c = cards.get(symbol);
  if (!c) return;

  c.el.classList.remove('loading', 'error');

  const isUp = data.change >= 0;
  const color = isUp ? 'up' : 'down';
  const arrow = isUp ? '▲' : '▼';

  c.el.querySelector('.name').textContent = data.name;
  c.el.querySelector('.price').textContent = fmtPrice(data.price, data.currency);
  const changeEl = c.el.querySelector('.change');
  changeEl.className = `change ${color}`;
  changeEl.textContent = `${arrow} ${fmtPrice(
    Math.abs(data.change),
    data.currency
  )} (${data.changePct.toFixed(2)}%)`;

  c.el.querySelector('.high').textContent = fmtPrice(data.dayHigh, data.currency);
  c.el.querySelector('.low').textContent = fmtPrice(data.dayLow, data.currency);
  c.el.querySelector('.vol').textContent = fmtVolume(data.volume);

  // sparkline
  const series = data.series.slice(-120);
  c.chart.data.labels = series.map((p) => p.t);
  c.chart.data.datasets[0].data = series.map((p) => p.c);
  c.chart.data.datasets[0].borderColor = isUp ? '#22c55e' : '#ef4444';
  c.chart.data.datasets[0].backgroundColor = isUp
    ? 'rgba(34, 197, 94, 0.15)'
    : 'rgba(239, 68, 68, 0.15)';
  c.chart.update('none');

  // flash on price change
  if (c.lastPrice != null && c.lastPrice !== data.price) {
    const cls = data.price > c.lastPrice ? 'flash-up' : 'flash-down';
    c.el.classList.remove('flash-up', 'flash-down');
    void c.el.offsetWidth; // restart animation
    c.el.classList.add(cls);
  }
  c.lastPrice = data.price;
}

async function fetchSymbol(symbol) {
  try {
    const res = await fetch(`/api/quote/${encodeURIComponent(symbol)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    updateCard(symbol, data);
  } catch (err) {
    console.error(symbol, err);
    setCardError(symbol, err.message);
  }
}

async function refreshAll() {
  statusEl.textContent = 'Refreshing…';
  await Promise.all([...cards.keys()].map(fetchSymbol));
  const now = new Date().toLocaleTimeString();
  statusEl.textContent = `Updated ${now}`;
}

function addSymbol(symbol) {
  symbol = symbol.trim().toUpperCase();
  if (!symbol || cards.has(symbol)) return;
  makeCard(symbol);
  saveSymbols();
  fetchSymbol(symbol);
}

addBtn.addEventListener('click', () => {
  addSymbol(input.value);
  input.value = '';
  input.focus();
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    addSymbol(input.value);
    input.value = '';
  }
});

// boot
for (const s of loadSymbols()) makeCard(s);
refreshAll();
setInterval(refreshAll, REFRESH_MS);
