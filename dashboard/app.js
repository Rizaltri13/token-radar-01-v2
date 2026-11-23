// Launch Radar's page. It reads window.RADAR (written beside dashboard/ by main.ts from the same
// board board.json carries) and renders the ranked board with filters and sortable columns, a
// detail view per protocol with the whole valuation chain and the farm plan, the calibration
// table the multiples came from, and the live-token set the calibration read. No network: every
// byte it shows is in data.js. The detail view recomputes a row's FDV from its printed terms, so
// the page's arithmetic and the board's numbers are visibly the same.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var bySlug = {};
  DATA.rows.forEach(function (r) { bySlug[r.slug] = r; });

  /* ---------- formatting ---------- */
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtFull(n) {
    return n === null || n === undefined ? 'n/a' : '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var FLAG_TEXT = {
    DECLINING_TVL: 'TVL fell 15% or more in the snapshot\u2019s seven days',
    YOUNG: 'DefiLlama has tracked it for under 90 days',
    THIN_TVL: 'TVL under $15M: a launch this small is cheap to fake and quick to leave',
    SINGLE_CHAIN: 'present on one chain only',
    THIN_PEERS: 'valued on the market-wide tier, or on under 6 peers (a tier is trusted from 4, but 4\u20135 is still thin)',
    NO_GROWTH_DATA: 'the snapshot reports no seven-day change for it',
    NO_AGE_DATA: 'the snapshot reports no tracking start date for it'
  };

  /* ---------- header ---------- */
  var stats = document.getElementById('stats');
  function stat(value, label) { return '<div class="stat"><b>' + value + '</b><span>' + label + '</span></div>'; }
  stats.innerHTML =
    stat(DATA.protocol_size, 'protocols scanned') +
    stat(DATA.board_size, 'pre-token ranked') +
    stat(DATA.watchlist_size, 'watchlist ranked') +
    stat(fmtUsd(DATA.total_implied_fdv_usd), 'total implied FDV') +
    stat(fmtUsd(DATA.total_implied_pool_usd), 'implied pools') +
    stat(DATA.global_multiple.toFixed(3) + '&times;', 'market median mcap/TVL');
  document.getElementById('source-line').textContent =
    DATA.source + ' (as of ' + DATA.as_of + '); the board below is that snapshot, valued.';
  document.getElementById('foot-model').textContent =
    'Model ' + DATA.model_version + ' \u00b7 snapshot as of ' + DATA.as_of + ' \u00b7 floor $' + (DATA.floor_usd / 1e6) + 'M watchlist';
  var constantsLine = document.getElementById('constants-line');
  if (constantsLine) {
    var M = DATA.model;
    constantsLine.textContent =
      'Every model constant, from the model itself: a peer tier needs \u2265 ' + M.min_peers + ' traded peers \u00b7 multiples clamp to ' +
      M.multiple_min.toFixed(2) + '\u2013' + M.multiple_max.toFixed(2) + '\u00d7 \u00b7 empty-market fallback ' + M.global_fallback.toFixed(2) + '\u00d7 \u00b7 growth weight ' +
      M.growth_weight + ' on a ' + M.growth_floor_pct + '%\u2026+' + M.growth_cap_pct + '% band \u00b7 maturity ' + M.maturity_floor +
      ' rising to 1.00 over ' + M.maturity_days.toLocaleString('en-US') + ' days, unreported age counted as ' + M.unknown_age_days +
      ' days \u00b7 reach +' + M.reach_step + ' per extra chain, at most ' + M.reach_max_extra + ' extra.';
  }

  /* ---------- state, from the hash so a view can be linked (and screenshotted) ---------- */
  function parseHash() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('?');
    var st = { view: 'board', slug: null, q: '', cat: 'all', chain: 'all', watch: false, grade: 'all', sort: 'rank', dir: 1 };
    if (parts[0].indexOf('p/') === 0) { st.view = 'detail'; st.slug = decodeURIComponent(parts[0].slice(2)); }
    if (parts[1]) {
      parts[1].split('&').forEach(function (kv) {
        var pair = kv.split('=');
        var k = pair[0], v = decodeURIComponent(pair[1] || '');
        if (k === 'q') st.q = v;
        if (k === 'cat') st.cat = v;
        if (k === 'chain') st.chain = v;
        if (k === 'watch') st.watch = v === '1';
        if (k === 'grade') st.grade = v;
        if (k === 'sort') st.sort = v;
        if (k === 'dir') st.dir = v === '-1' ? -1 : 1;
      });
    }
    return st;
  }
  function boardHash(st) {
    var params = [];
    if (st.q) params.push('q=' + encodeURIComponent(st.q));
    if (st.cat !== 'all') params.push('cat=' + encodeURIComponent(st.cat));
    if (st.chain !== 'all') params.push('chain=' + encodeURIComponent(st.chain));
    if (st.watch) params.push('watch=1');
    if (st.grade !== 'all') params.push('grade=' + encodeURIComponent(st.grade));
    if (st.sort !== 'rank') params.push('sort=' + st.sort + '&dir=' + st.dir);
    return '#/board' + (params.length ? '?' + params.join('&') : '');
  }

  /* ---------- the board ---------- */
  var SORTS = {
    rank: function (r) { return r.rank; },
    tvl: function (r) { return r.tvl_usd; },
    growth: function (r) { return r.change_7d === null ? -1e9 : r.change_7d; },
    age: function (r) { return r.terms.age_days === null ? -1 : r.terms.age_days; },
    multiple: function (r) { return r.terms.peer_multiple; },
    fdv: function (r) { return r.implied_value_usd; },
    pool: function (r) { return r.terms.implied_pool_usd; },
    eff: function (r) { return r.pool_per_cost; }
  };
  function filtered(st) {
    var q = st.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (st.watch && !r.on_watchlist) return false;
      if (st.cat !== 'all' && (r.category || '(none)') !== st.cat) return false;
      if (st.chain !== 'all' && r.chains.indexOf(st.chain) === -1) return false;
      if (st.grade !== 'all' && r.grade !== st.grade) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var key = SORTS[st.sort] || SORTS.rank;
    rows.sort(function (a, b) { return (key(a) - key(b)) * st.dir || a.rank - b.rank; });
    return rows;
  }
  function options(values, current, allLabel) {
    var out = '<option value="all">' + allLabel + '</option>';
    values.forEach(function (v) {
      out += '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>';
    });
    return out;
  }
  function renderBoard(st) {
    var cats = [], chains = [], seenC = {}, seenCh = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || '(none)';
      if (!seenC[c]) { seenC[c] = 1; cats.push(c); }
      r.chains.forEach(function (ch) { if (!seenCh[ch]) { seenCh[ch] = 1; chains.push(ch); } });
    });
    cats.sort(); chains.sort();
    var rows = filtered(st);
    var head =
      '<div class="controls">' +
      '<input type="search" id="f-q" placeholder="Search name, slug, category\u2026" value="' + esc(st.q) + '">' +
      '<select id="f-cat">' + options(cats, st.cat, 'All categories') + '</select>' +
      '<select id="f-chain">' + options(chains, st.chain, 'All chains') + '</select>' +
      '<select id="f-grade">' + options(['A', 'B', 'C', 'D'], st.grade, 'All grades') + '</select>' +
      '<label><input type="checkbox" id="f-watch"' + (st.watch ? ' checked' : '') + '> watchlist only</label>' +
      '<span class="count"><b>' + rows.length + '</b> of ' + DATA.board_size + ' rows</span>' +
      '</div>';
    var cols = [
      ['rank', '#', 1], ['name', 'Protocol', 0], ['cat', 'Category', 0], ['chains', 'Chains', 1],
      ['tvl', 'TVL', 1], ['growth', '7d', 1], ['age', 'Age', 1], ['multiple', 'Multiple', 1],
      ['fdv', 'Implied FDV', 1], ['pool', 'Pool', 1], ['eff', 'Pool/$ cost', 1], ['grade', 'Gr', 0], ['flags', 'Flags', 0]
    ];
    var thead = '<tr>' + cols.map(function (c) {
      var sorted = st.sort === c[0] ? ' class="sorted' + (c[2] ? '' : ' l') + '"' : (c[2] ? '' : ' class="l"');
      return '<th data-sort="' + c[0] + '"' + sorted + '>' + c[1] + (st.sort === c[0] ? (st.dir === 1 ? ' \u25b2' : ' \u25bc') : '') + '</th>';
    }).join('') + '</tr>';
    var body = rows.map(function (r) {
      var t = r.terms;
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td>' + r.rank + '</td>' +
        '<td class="l"><span class="name">' + esc(r.name) + '</span>' + (r.on_watchlist ? ' <span class="watch" title="On the snapshot watchlist">WL</span>' : '') + '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td class="l cat">' + esc(r.category || '\u2014') + '</td>' +
        '<td>' + r.chains.length + '</td>' +
        '<td>' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td>' + fmtAge(t.age_days) + '</td>' +
        '<td>' + t.peer_multiple.toFixed(3) + '&times; <span class="tier ' + t.multiple_tier + '">' + t.multiple_tier + ' \u00b7 ' + t.live_peers + '</span></td>' +
        '<td class="fdv">' + fmtUsd(r.implied_value_usd) + '</td>' +
        '<td>' + fmtUsd(t.implied_pool_usd) + '</td>' +
        '<td>' + (r.pool_per_cost ? Math.round(r.pool_per_cost).toLocaleString('en-US') + '&times;' : 'n/a') + '</td>' +
        '<td><span class="grade ' + r.grade + '">' + r.grade + '</span></td>' +
        '<td class="l flags">' + r.flags.map(function (f) { return f.replace(/_/g, ' '); }).join(' \u00b7 ') + '</td>' +
        '</tr>';
    }).join('');
    app.innerHTML = head +
      '<div class="boardwrap"><table class="board"><thead>' + thead + '</thead><tbody>' +
      (body || '<tr><td colspan="13" class="l">No protocol matches these filters.</td></tr>') +
      '</tbody></table></div>' + renderCalibration() + renderLive();
    app.setAttribute('aria-busy', 'false');
    wireBoard(st);
  }
  function wireBoard(st) {
    function go(patch) {
      var next = Object.assign({}, st, patch);
      location.hash = boardHash(next);
    }
    var q = document.getElementById('f-q');
    q.addEventListener('change', function () { go({ q: q.value }); });
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') go({ q: q.value }); });
    document.getElementById('f-cat').addEventListener('change', function (e) { go({ cat: e.target.value }); });
    document.getElementById('f-chain').addEventListener('change', function (e) { go({ chain: e.target.value }); });
    document.getElementById('f-grade').addEventListener('change', function (e) { go({ grade: e.target.value }); });
    document.getElementById('f-watch').addEventListener('change', function (e) { go({ watch: e.target.checked }); });
    app.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var s = th.getAttribute('data-sort');
        if (s === 'name' || s === 'cat' || s === 'grade' || s === 'flags') return;
        if (st.sort === s) go({ dir: st.dir * -1 });
        else go({ sort: s, dir: s === 'rank' ? 1 : -1 });
      });
    });
    app.querySelectorAll('tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/p/' + encodeURIComponent(tr.getAttribute('data-slug')); });
    });
  }

  /* ---------- calibration + live sections ---------- */
  function renderCalibration() {
    var rows = DATA.calibration.map(function (c) {
      return '<tr><td class="l">' + esc(c.category) + '</td><td>' + c.multiple.toFixed(4) + '&times;</td><td>' + c.raw_multiple.toFixed(4) + '&times;</td><td>' + c.peers + '</td>' +
        '<td class="l"><span class="tier ' + c.tier + '">' + c.tier + '</span>' + (c.family ? ' ' + esc(c.family) : '') + '</td></tr>';
    }).join('');
    return '<section class="section"><h2>The calibration \u2014 every multiple on the board, and where it came from</h2>' +
      '<p class="note">Each multiple is the median market-cap&divide;TVL of the traded protocols in that tier of this snapshot, clamped to 0.05&ndash;2.50&times;. The raw median is printed beside the multiple in use: where the two differ, the clamp did the moving. A row valued on the family or global tier says so on its face; the detail view lists the peers behind the figure.</p>' +
      '<table class="mini"><thead><tr><th class="l">Category</th><th>Multiple</th><th>Raw median</th><th>Peers</th><th class="l">Tier</th></tr></thead><tbody>' + rows + '</tbody></table></section>';
  }
  function renderLive() {
    var rows = DATA.live.map(function (r) {
      return '<tr><td class="l">' + esc(r.name) + '</td><td class="l">' + esc(r.category || '\u2014') + '</td><td>' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td>' + fmtFull(r.mcap_usd) + '</td><td>' + (r.mcap_tvl === null ? 'n/a' : r.mcap_tvl.toFixed(3) + '&times;') + '</td>' +
        '<td class="' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td></tr>';
    }).join('');
    return '<section class="section"><h2>Already trading \u2014 set apart, at the market\u2019s own values</h2>' +
      '<p class="note">These protocols record a token in the snapshot, so the radar never ranks them: they are the calibration\u2019s evidence, shown at their market caps. The board above holds only protocols that record no token.</p>' +
      '<table class="mini"><thead><tr><th class="l">Protocol</th><th class="l">Category</th><th>TVL</th><th>Market cap</th><th>Mcap/TVL</th><th>7d</th></tr></thead><tbody>' + rows + '</tbody></table></section>';
  }

  /* ---------- detail view ---------- */
  function kv(label, value, how) {
    return '<tr><th>' + label + '</th><td>' + value + '</td>' + (how ? '<td class="how">' + how + '</td>' : '') + '</tr>';
  }
  function renderDetail(st) {
    var r = bySlug[st.slug];
    if (!r) { renderBoard(parseHash()); return; }
    var t = r.terms;
    var recomputed = Math.max(1, Math.round(r.tvl_usd * t.peer_multiple * t.growth_factor * t.maturity_factor * t.reach_factor));
    var multHow = t.multiple_tier + ' tier \u00b7 median of ' + t.live_peers + ' traded peers: raw median ' + t.multiple_raw.toFixed(4) + '\u00d7' +
      (t.multiple_raw !== t.peer_multiple
        ? ' \u2192 clamped to ' + t.peer_multiple.toFixed(4) + '\u00d7 (band ' + DATA.model.multiple_min.toFixed(2) + '\u2013' + DATA.model.multiple_max.toFixed(2) + ')'
        : ', inside the ' + DATA.model.multiple_min.toFixed(2) + '\u2013' + DATA.model.multiple_max.toFixed(2) + ' band, used as-is');
    var chain =
      kv('TVL (snapshot)', fmtFull(r.tvl_usd), 'the protocol\u2019s own figure') +
      kv('Peer multiple', t.peer_multiple.toFixed(4) + '&times;', multHow) +
      kv('Growth factor', t.growth_factor.toFixed(4) + '&times;', '7d change ' + fmtPct(t.growth_pct) + ', clamped, weight 0.4') +
      kv('Maturity factor', t.maturity_factor.toFixed(4) + '&times;', 'tracked ' + fmtAge(t.age_days) + (t.age_days === null ? ' (date unreported: aged as 300d)' : '')) +
      kv('Reach factor', t.reach_factor.toFixed(4) + '&times;', r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ': ' + esc(r.chains.join(', '))) +
      '<tr class="total"><th>Implied FDV</th><td>' + fmtFull(r.implied_value_usd) + '</td><td class="how">recomputed here from the terms above: ' + fmtFull(recomputed) + '</td></tr>' +
      kv('Float share (prior)', (t.float_share * 100).toFixed(0) + '%', 'share of FDV circulating at launch, by family \u2014 an assumption, not a snapshot reading') +
      kv('Implied launch market cap', fmtFull(t.implied_launch_mcap_usd), 'FDV \u00d7 float share') +
      kv('Community allocation (prior)', (t.allocation_share * 100).toFixed(0) + '%', 'share of supply to users, by family \u2014 an assumption, not a snapshot reading') +
      kv('Implied airdrop pool', fmtFull(t.implied_pool_usd), 'FDV \u00d7 allocation share') +
      kv('Plan cash cost', '$' + r.plan_cost_usd.toFixed(2), 'the plan below, gas and fees; capital is held, not spent') +
      kv('Pool per $1 of plan cost', r.pool_per_cost ? Math.round(r.pool_per_cost).toLocaleString('en-US') + '&times;' : 'n/a', 'the board\u2019s second lens: pool \u00f7 plan cash cost');
    var sens =
      kv('FDV at multiple \u00d70.75', fmtFull(t.fdv_at_multiple_low), 'multiple ' + t.multiple_low.toFixed(4) + '\u00d7 \u2014 a quarter lower, re-clamped to the band') +
      kv('FDV at the multiple', fmtFull(r.implied_value_usd), 'the board\u2019s figure, at ' + t.peer_multiple.toFixed(4) + '\u00d7') +
      kv('FDV at multiple \u00d71.25', fmtFull(t.fdv_at_multiple_high), 'multiple ' + t.multiple_high.toFixed(4) + '\u00d7 \u2014 a quarter higher, re-clamped to the band') +
      kv('Pool at multiple \u00d70.75', fmtFull(Math.round(t.fdv_at_multiple_low * t.allocation_share)), 'same allocation share') +
      kv('Pool at multiple \u00d71.25', fmtFull(Math.round(t.fdv_at_multiple_high * t.allocation_share)), 'same allocation share') +
      kv('Pool at launch priors \u00d70.75', fmtFull(t.pool_at_terms_low), 'float and allocation scaled down together; the pool reads the allocation') +
      kv('Pool at launch priors \u00d71.25', fmtFull(t.pool_at_terms_high), 'float and allocation scaled up together; the pool reads the allocation');
    var peers = r.peers.length
      ? '<table class="kv"><tr><th>Traded peer</th><td>Market cap</td><td>TVL</td><td>Ratio</td></tr>' +
        r.peers.map(function (p) {
          return '<tr><th>' + esc(p.name) + '</th><td>' + fmtUsd(p.mcap_usd) + '</td><td>' + fmtUsd(p.tvl_usd) + '</td><td>' + p.ratio.toFixed(3) + '&times;</td></tr>';
        }).join('') + '</table>' +
        '<p class="note">Top ' + r.peers.length + ' of ' + t.live_peers + ' traded peers by market cap \u2014 the multiple is the median computed over all ' + t.live_peers + ' peers, not over these shown alone.</p>'
      : '<p class="note">No peer sample is carried for this row\u2019s tier.</p>';
    var plan = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var flags = r.flags.length
      ? '<ul class="flaglist">' + r.flags.map(function (f) { return '<li><b>' + f.replace(/_/g, ' ') + '</b> \u2014 ' + FLAG_TEXT[f] + '</li>'; }).join('') + '</ul>'
      : '<p class="note">No flags: the record is complete, the peers are its own category\u2019s, and nothing in it is shrinking fast.</p>';
    app.innerHTML =
      '<div class="detail"><a class="back" href="#/board">\u2190 back to the board</a>' +
      '<h2>' + esc(r.name) + ' <span class="grade ' + r.grade + '">' + r.grade + '</span></h2>' +
      '<p class="sub">Rank #' + r.rank + ' of ' + DATA.board_size + ' \u00b7 ' + esc(r.category || 'uncategorised') + ' \u00b7 ' +
      (r.on_watchlist ? 'on the snapshot watchlist \u00b7 ' : '') + 'records no token in the snapshot \u00b7 tracked since ' + (r.listed_at || 'unreported') + '</p>' +
      '<div class="panels">' +
      '<div class="panel"><h3>The valuation chain \u2014 every term</h3><table class="kv">' + chain + '</table></div>' +
      '<div class="panel"><h3>Farm plan \u2014 ' + r.farm_steps.length + ' steps, $' + r.plan_cost_usd.toFixed(2) + ' cash, ' + r.plan_hours + ' hours over the hold</h3><ol class="plan">' + plan + '</ol></div>' +
      '<div class="panel"><h3>Sensitivity \u2014 the multiple, and the launch priors</h3><table class="kv">' + sens + '</table><p class="note">Sensitivity, not a confidence interval: each line re-runs the same printed chain with one term moved, and every moved multiple is re-clamped to the model\u2019s own band.</p></div>' +
      '<div class="panel"><h3>The peers behind the multiple</h3>' + peers + '</div>' +
      '<div class="panel"><h3>Risk flags</h3>' + flags + '</div>' +
      '</div></div>';
    app.setAttribute('aria-busy', 'false');
    window.scrollTo(0, 0);
  }

  /* ---------- router ---------- */
  function render() {
    var st = parseHash();
    if (st.view === 'detail') renderDetail(st);
    else renderBoard(st);
  }
  window.addEventListener('hashchange', render);
  render();
})();
