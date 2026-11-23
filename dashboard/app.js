// Breakout Radar — the dashboard page. Static, no network: it reads the
// dataset main.ts wrote into ../data.js and the plan generator in farm.js.
// Row fields (short keys keep data.js inside the dossier's text cap):
//   r rank, s slug, n name, c category, h chains, t tvl_usd, g change_7d,
//   v implied_value_usd, b breakout x1000, m market multiple x1000,
//   u runway x1000, a age_days, k breakout tier.
// State lives in the URL hash, so a view can be linked: #detail=<slug> opens
// a protocol, #hot=1&cat=Dexs shows the filtered board.
(function () {
  'use strict';

  var D = window.RADAR;
  var app = document.getElementById('app');
  var detailEl = document.getElementById('detail');
  var countEl = document.getElementById('count');
  var qEl = document.getElementById('q');
  var catEl = document.getElementById('cat');
  var chainEl = document.getElementById('chain');
  var sortEl = document.getElementById('sort');
  var hotEl = document.getElementById('hot');

  /** Escape text for HTML. */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /** $1.23B / $45.6M / $789K / $42. */
  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }

  function pct(n) {
    if (n == null || !isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }

  function mult(n) {
    return '×' + (n / 1000).toFixed(2);
  }

  /** Read the state out of location.hash. */
  function readHash() {
    var out = { view: 'board', sort: 'implied', cat: '', chain: '', q: '', hot: false, detail: '' };
    var raw = (location.hash || '').replace(/^#/, '');
    raw.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv.length !== 2) return;
      var k = decodeURIComponent(kv[0]);
      var v = decodeURIComponent(kv[1]);
      if (k === 'view' && (v === 'board' || v === 'live')) out.view = v;
      else if (k === 'sort') out.sort = v;
      else if (k === 'cat') out.cat = v;
      else if (k === 'chain') out.chain = v;
      else if (k === 'q') out.q = v;
      else if (k === 'hot') out.hot = v === '1';
      else if (k === 'detail') out.detail = v;
    });
    return out;
  }

  /** Write the state back into location.hash. */
  function writeHash(state) {
    var parts = [];
    if (state.view !== 'board') parts.push('view=' + state.view);
    if (state.sort !== 'implied') parts.push('sort=' + encodeURIComponent(state.sort));
    if (state.cat) parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.chain) parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.hot) parts.push('hot=1');
    if (state.detail) parts.push('detail=' + encodeURIComponent(state.detail));
    var next = parts.length ? '#' + parts.join('&') : '#';
    if (location.hash !== next) history.replaceState(null, '', next);
  }

  var state = readHash();

  /** The board rows after the filters, in the chosen order. */
  function filteredRows() {
    var rows = D.rows.slice();
    var q = state.q.trim().toLowerCase();
    if (q) rows = rows.filter(function (r) { return r.n.toLowerCase().indexOf(q) !== -1 || r.s.toLowerCase().indexOf(q) !== -1; });
    if (state.cat) rows = rows.filter(function (r) { return r.c === state.cat; });
    if (state.chain) rows = rows.filter(function (r) { return r.h.indexOf(state.chain) !== -1; });
    if (state.hot) rows = rows.filter(function (r) { return r.k === 'breakout' || r.k === 'surging'; });
    if (state.sort === 'breakout') rows.sort(function (a, b) { return b.b - a.b || b.v - a.v; });
    else if (state.sort === 'tvl') rows.sort(function (a, b) { return b.t - a.t; });
    else if (state.sort === 'growth') rows.sort(function (a, b) { return (b.g == null ? -1e9 : b.g) - (a.g == null ? -1e9 : a.g); });
    else if (state.sort === 'age') rows.sort(function (a, b) { return (b.a == null ? -1 : b.a) - (a.a == null ? -1 : a.a); });
    else rows.sort(function (a, b) { return a.r - b.r; });
    return rows;
  }

  function tierLabel(k) {
    return { breakout: 'Breakout', surging: 'Surging', heating: 'Heating', cooling: 'Cooling', steady: 'Steady', unverified: 'Unverified' }[k] || k;
  }

  /** A 0..100 width for a breakout bar, from the multiplier. */
  function breakoutWidth(b) {
    return Math.max(4, Math.min(100, Math.round(((b / 1000 - 0.6) / 1.1) * 100)));
  }

  function boardTable(rows) {
    if (!rows.length) return '<p class="empty">No protocols match these filters.</p>';
    var html = '<table><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th>Chains</th>' +
      '<th class="num">TVL</th><th class="num">7-day</th><th class="num">Breakout</th><th class="num">Implied value</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var g = r.g;
      var gCls = g == null ? '' : g >= 0 ? 'up' : 'down';
      var barCls = g == null ? '' : g >= 0 ? 'g' : 'r';
      html += '<tr data-slug="' + esc(r.s) + '"' + (state.detail === r.s ? ' class="sel"' : '') + '>' +
        '<td class="num">' + r.r + '</td>' +
        '<td class="name">' + esc(r.n) + '<small>' + esc(r.s) + '</small></td>' +
        '<td><span class="chip">' + esc(r.c || 'Uncategorised') + '</span></td>' +
        '<td>' + esc(r.h.slice(0, 2).join(', ')) + (r.h.length > 2 ? ' +' + (r.h.length - 2) : '') + '</td>' +
        '<td class="num">' + money(r.t) + '</td>' +
        '<td class="num ' + gCls + '">' + pct(g) + '</td>' +
        '<td class="num"><span class="tier ' + esc(r.k) + '">' + tierLabel(r.k) + '</span>' +
        '<span class="bar ' + barCls + '"><i style="width:' + breakoutWidth(r.b) + '%"></i></span> ' + mult(r.b) + '</td>' +
        '<td class="num"><strong>' + money(r.v) + '</strong></td></tr>';
    });
    return html + '</tbody></table>';
  }

  function liveTable() {
    var rows = D.live.slice().sort(function (a, b) { return (b.m || 0) - (a.m || 0); });
    var html = '<table><thead><tr><th>Protocol</th><th>Category</th><th>Chains</th>' +
      '<th class="num">TVL</th><th class="num">Market cap</th><th class="num">Mcap / TVL</th><th class="num">7-day</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var ratio = r.m != null && r.t > 0 ? (r.m / r.t).toFixed(2) + '×' : '—';
      var gCls = r.g == null ? '' : r.g >= 0 ? 'up' : 'down';
      html += '<tr><td class="name">' + esc(r.n) + '<small>' + esc(r.s) + '</small></td>' +
        '<td><span class="chip">' + esc(r.c || 'Uncategorised') + '</span></td>' +
        '<td>' + esc(r.h.slice(0, 2).join(', ')) + (r.h.length > 2 ? ' +' + (r.h.length - 2) : '') + '</td>' +
        '<td class="num">' + money(r.t) + '</td><td class="num">' + money(r.m) + '</td>' +
        '<td class="num">' + ratio + '</td><td class="num ' + gCls + '">' + pct(r.g) + '</td></tr>';
    });
    return html + '</tbody></table>';
  }

  /** The detail panel for one protocol: model maths, then the farm plan. */
  function renderDetail() {
    var row = null;
    D.rows.forEach(function (r) { if (r.s === state.detail) row = r; });
    if (!row) { detailEl.hidden = true; detailEl.innerHTML = ''; return; }
    var steps = window.FarmPlan.farmSteps({ name: row.n, category: row.c, chains: row.h, tvl_usd: row.t, change_7d: row.g, age_days: row.a });
    var age = row.a == null ? 'unknown age' : row.a >= 365 ? (row.a / 365).toFixed(1) + ' years' : row.a + ' days';
    var plan = steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    detailEl.innerHTML =
      '<h2>' + esc(row.n) + ' <span class="tier ' + esc(row.k) + '">' + tierLabel(row.k) + '</span></h2>' +
      '<p class="meta">Rank #' + row.r + ' · ' + esc(row.c || 'Uncategorised') + ' · ' + esc(row.h.join(', ') || 'no chain listed') +
      ' · tracked ' + age + ' · records no token</p>' +
      '<h3>Why it is worth ' + money(row.v) + '</h3>' +
      '<div class="math">' +
      '<div class="f"><b>' + money(row.t) + '</b><span>TVL</span></div><span class="op">×</span>' +
      '<div class="f"><b>' + (row.m / 1000).toFixed(2) + '×</b><span>market multiple (' + esc(row.c || 'all') + ' median)</span></div><span class="op">×</span>' +
      '<div class="f"><b>' + mult(row.b) + '</b><span>breakout (' + pct(row.g) + ' in 7 days)</span></div><span class="op">×</span>' +
      '<div class="f"><b>' + (row.u / 1000).toFixed(2) + '×</b><span>runway (' + age + ' with no token)</span></div><span class="op">=</span>' +
      '<div class="f total"><b>' + money(row.v) + '</b><span>implied value</span></div></div>' +
      '<h3>Farm plan — five steps</h3><ol class="plan">' + plan + '</ol>';
    detailEl.hidden = false;
  }

  function render() {
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-view') === state.view);
    });
    document.getElementById('controls').style.display = state.view === 'board' ? '' : 'none';
    if (state.view === 'live') {
      app.innerHTML = liveTable();
      countEl.textContent = D.live_size + ' live-token protocols, by market cap — the market these multiples come from.';
      detailEl.hidden = true;
      detailEl.innerHTML = '';
      return;
    }
    var rows = filteredRows();
    app.innerHTML = boardTable(rows);
    countEl.textContent = 'Showing ' + rows.length + ' of ' + D.board_size + ' ranked protocols (' +
      D.watchlist_size + ' watchlist, ' + D.early_size + ' early). Click a row for its model and farm plan.';
    renderDetail();
  }

  function fillControls() {
    var cats = {};
    var chains = {};
    D.rows.forEach(function (r) {
      if (r.c) cats[r.c] = true;
      r.h.forEach(function (h) { chains[h] = true; });
    });
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c; catEl.appendChild(o);
    });
    Object.keys(chains).sort().forEach(function (c) {
      var o = document.createElement('option');
      o.value = c; o.textContent = c; chainEl.appendChild(o);
    });
    qEl.value = state.q; catEl.value = state.cat; chainEl.value = state.chain;
    sortEl.value = state.sort; hotEl.checked = state.hot;
  }

  // Header stats and methodology, from the dataset itself.
  var hotCount = D.rows.filter(function (r) { return r.k === 'breakout' || r.k === 'surging'; }).length;
  document.getElementById('stats').innerHTML =
    '<div class="stat"><b>' + D.board_size + '</b><span>ranked</span></div>' +
    '<div class="stat"><b>' + D.watchlist_size + '</b><span>watchlist</span></div>' +
    '<div class="stat"><b>' + hotCount + '</b><span>breaking out</span></div>' +
    '<div class="stat"><b>' + esc(D.as_of) + '</b><span>snapshot</span></div>';
  document.getElementById('method').textContent =
    'Implied value = TVL × the category\u2019s market multiple (the median market-cap-per-TVL of the live-token protocols ' +
    'in that category) × a breakout multiplier (the protocol\u2019s 7-day TVL growth against its category\u2019s median, ' +
    'with a bonus at +20% on $50M+ of TVL and at +50%) × a runway multiplier (up to +25% for up to three years ' +
    'tracked with no token). The board covers all ' + D.watchlist_size + ' watchlist protocols plus the ' +
    D.early_size + ' early ones whose volume breaks out hardest. Model breakout-1, snapshot ' + D.as_of + '.';

  fillControls();
  render();
  app.setAttribute('aria-busy', 'false');

  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.view = b.getAttribute('data-view');
      if (state.view === 'live') { state.detail = ''; }
      writeHash(state); render();
    });
  });
  qEl.addEventListener('input', function () { state.q = qEl.value; state.detail = ''; writeHash(state); render(); });
  catEl.addEventListener('change', function () { state.cat = catEl.value; writeHash(state); render(); });
  chainEl.addEventListener('change', function () { state.chain = chainEl.value; writeHash(state); render(); });
  sortEl.addEventListener('change', function () { state.sort = sortEl.value; writeHash(state); render(); });
  hotEl.addEventListener('change', function () { state.hot = hotEl.checked; writeHash(state); render(); });
  app.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    state.detail = state.detail === tr.getAttribute('data-slug') ? '' : tr.getAttribute('data-slug');
    writeHash(state); render();
    if (state.detail) detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  window.addEventListener('hashchange', function () { state = readHash(); render(); });
})();
