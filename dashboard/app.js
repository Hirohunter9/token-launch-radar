// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, a filterable table, a top-10
// spotlight, the comparables table the model is built on, and a per-protocol
// detail drawer with the model's own factors, its live peers and its farm
// plan. No network: every byte it shows is in data.js.
//
// The page recomputes each row's implied value from the snapshot figures
// (TVL, seven-day growth, age, chain count, category multiple) and checks
// the number board.json carries, so the page's code and the board's data
// are visibly the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var state = {
    q: '', category: 'all', chain: 'all', watchOnly: false,
    tab: 'pre-token', sort: 'implied', dir: -1, selected: null, shown: 100
  };
  var PAGE = 100;

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
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
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return 'x' + n.toFixed(2);
  }

  // The model, recomputed in the page from the row's own figures.
  // Must match lib/model.ts exactly: the detail view checks the recompute
  // against board.json within half a percent.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * (growth >= 0 ? model.growth_weight_up : model.growth_weight_down);
    var age = row.age_days === null ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + model.maturity_range * (1 - Math.exp(-Math.max(age, 0) / model.maturity_tau_days));
    var extra = Math.max(0, Math.min((row.chains || []).length - 1, model.breadth_cap_chains));
    var breadth = 1 + model.breadth_step * extra;
    var raw = row.tvl_usd * row.multiple * growthMult * maturity * breadth;
    return Math.max(1, Math.round(Math.min(raw, row.tvl_usd * model.implied_cap_multiple)));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan, derived in the page from the same record main.ts used:
  // category, chains, TVL and age decide the action, the capital, the hold
  // and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 2e9) return 300;
    if (p.tvl_usd >= 5e8) return 200;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 60;
    if (age < 90) return 90;
    if (age < 365) return 60;
    return 45;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and leave the loan market open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and keep the position in range.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Deposit $' + capital + " into " + name + "'s main yield vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then put the bridged funds to work in its app.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and hold the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and take one position in an open market on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " into " + name + "'s basis vault on " + chain + ' and keep the position open.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var steps = [
      { text: 'Set up a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: gas + ' for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: weeklyFor(p, chain), cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: claimFor(p), cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Log the wallet, the dates and every transaction, and set a reminder to review the position before any announced snapshot.', cost: 'nothing but the log', time: '5 minutes' }
    ];
    return steps.map(function (s) {
      var out = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
      if (out.length > 600) out = out.slice(0, 596) + '...';
      if (out.length < 20) out = out + " Hold the position and check the protocol's own page.";
      return out;
    });
  }

  // Typical gas for one transaction on a chain: mainnet costs real money,
  // L2s and fast chains do not. Must match lib/model.ts.
  function gasFor(chain) {
    if (chain === 'Ethereum') return 'about $8 of gas';
    if (chain === 'Solana' || chain === 'Stellar' || chain === 'Provenance') return 'under $0.10 of gas';
    return 'about $0.50 of gas';
  }
  // The weekly action, by category: it repeats the protocol's own activity.
  function weeklyFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Adjust the supply or the borrow on ' + name + ' once a week so the position stays active.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0) return 'Swap a small amount through ' + name + "'s pools once a week and keep the liquidity in range.";
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Claim or restake the vault yield on ' + name + ' once a week and keep the shares.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge a small amount through ' + name + ' once a week so the route stays warm.';
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Restake the staking rewards on ' + name + ' once a week and hold the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Close and reopen one small hedged position on ' + name + ' once a week.';
    if (c.indexOf('prediction') >= 0) return 'Settle one market a week on ' + name + ' and take a fresh position.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Rebalance into ' + name + "'s newest allocation once a week.";
    if (c.indexOf('stable') >= 0) return 'Top up or rotate the stable position on ' + name + ' once a week.';
    if (c.indexOf('rwa') >= 0) return 'Check the asset\'s yield accrual on ' + name + ' once a week and hold.';
    if (c.indexOf('insurance') >= 0) return 'Renew or extend the cover on ' + name + ' once a week so the policy never lapses.';
    if (c.indexOf('basis') >= 0) return 'Roll the basis position on ' + name + ' once a week.';
    return 'Do one qualifying action every week, such as a deposit, a borrow, a swap or a governance vote.';
  }
  // Where the rewards are claimed, by category: the protocol's own page.
  function claimFor(p) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0) return 'Before you withdraw, open ' + name + "'s pool rewards page from its official site and claim the trading fees only from the link it publishes.";
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Before you withdraw, open ' + name + "'s vault rewards page from its official site and claim the yield only from the link it publishes.";
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Before you withdraw, open ' + name + "'s bridge rewards page from its official site and claim only from the link it publishes.";
    if (c.indexOf('liquid staking') >= 0 || c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Before you withdraw, open ' + name + "'s staking rewards page from its official site and claim the staking rewards only from the link it publishes.";
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Before you withdraw, open ' + name + "'s trading rewards page from its official site and settle the funding only from the link it publishes.";
    if (c.indexOf('prediction') >= 0) return 'Before you withdraw, open ' + name + "'s market settlement page from its official site and claim winnings only from the link it publishes.";
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Before you withdraw, open ' + name + "'s lending rewards page from its official site and claim only from the link it publishes.";
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Before you withdraw, open ' + name + "'s vault rewards page from its official site and claim only from the link it publishes.";
    return "Before you withdraw, open the protocol's own rewards page from its official site and claim only from the link it publishes.";
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watch') === '1') state.watchOnly = true;
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchOnly) params.set('watch', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchOnly && !r.on_watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version })),
        el('span', null, 'Sealed DefiLlama data')
      )
    );
  }

  function hero() {
    var top = DATA.rows[0];
    return el('section', { class: 'hero' },
      el('div', null,
        el('h1', { text: 'Which token launch would be worth the most?' }),
        el('p', null,
          'Every protocol on the watchlist records no token and holds at least $50M of TVL. ',
          el('b', { text: 'The early radar adds ' + DATA.early_size + ' more pre-token protocols the watchlist leaves out' }),
          ' — ranked by what their token would be worth if the record stayed as it is. Implied value is a model, not a promise, and never a price.'
        )
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('span', { text: 'Watchlist TVL' }), el('b', { text: fmtUsd(DATA.watchlist_tvl_usd) })),
        el('div', { class: 'stat' }, el('span', { text: 'Protocols ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'stat' }, el('span', { text: 'Global multiple' }), el('b', { text: fmtMult(DATA.global_multiple) + ' of TVL' })),
        el('div', { class: 'stat' }, el('span', { text: 'Top implied value' }), el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }))
      )
    );
  }

  function spotlight() {
    var cards = DATA.rows.slice(0, 10).map(function (r) {
      return el('button', { type: 'button', class: 'card', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'rk', text: '#' + r.rank }),
        el('b', { text: r.name }),
        el('span', { class: 'val', text: fmtUsd(r.implied_value_usd) }),
        el('span', { class: 'sub2', text: 'TVL ' + fmtUsd(r.tvl_usd) + ' · ' + fmtPct(r.change_7d) + ' 7d' })
      );
    });
    return el('div', { class: 'spot' }, cards);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; state.shown = PAGE; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; state.shown = PAGE; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; state.shown = PAGE; writeHash(); render(); });
    var watch = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watchOnly ? 'checked' : null, onchange: function (e) { state.watchOnly = e.target.checked; state.shown = PAGE; writeHash(); render(); } }),
      'Watchlist only'
    );
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { text: 'Scope' }), watch),
      el('div', { class: 'field' }, el('span', { text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; writeHash(); render(); } })
      ));
    }
    var max = (sortedRows(DATA.rows)[0] || { implied_value_usd: 1 }).implied_value_usd;
    var shown = list.slice(0, state.shown);
    var tbody = el('tbody');
    shown.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.chains && r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'badge' + (r.on_watchlist ? ' watch' : ''), text: r.on_watchlist ? 'watchlist' : 'early' }))
      );
      tbody.appendChild(tr);
    });
    var panel = el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, its live peers and its farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Scope' })
          )),
          tbody
        )
      )
    );
    if (list.length > state.shown) {
      panel.appendChild(el('button', { class: 'button more', type: 'button', text: 'Show all ' + list.length + ' rows', onclick: function () { state.shown = list.length; render(); } }));
    }
    return panel;
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_per_tvl === null ? 'n/a' : fmtMult(r.mcap_per_tvl) }),
        el('td', null, el('span', { class: 'badge live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their market-cap-per-TVL is the comparables table the pre-token board is priced from. They are set aside from the ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var compRows = DATA.comps
      .filter(function (c) { return c.n >= 1; })
      .sort(function (a, b) { return b.n - a.n; })
      .slice(0, 14)
      .map(function (c) {
        return el('tr', null,
          el('td', { text: c.category }),
          el('td', { class: 'num', text: String(c.n) }),
          el('td', { class: 'num', text: c.median === null ? 'n/a' : fmtMult(c.median) }),
          el('td', { class: 'num', text: fmtMult(c.used) }),
          el('td', { text: c.source === 'global' ? 'global median' : 'shrunk · ' + Math.round((c.weight || 0) * 100) + '% cat' })
        );
      });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. The multiple comes from live tokens in the same category — never from a hand-written list of names, never from a fixed constant.' }),
      el('div', { class: 'formula' },
        el('b', { text: 'implied = round( min( tvl x multiple x growth x maturity x breadth, 5 x tvl ) )' }),
        el('div', { text: 'multiple  = shrunk blend: (n x category median + ' + m.shrinkage_prior + ' x global median) / (n + ' + m.shrinkage_prior + '), the category median clipped to [' + m.multiple_floor + ', ' + m.multiple_cap + '] first; no live comps: the global median ' + fmtMult(DATA.global_multiple) }),
        el('div', { text: 'growth    = 1 + clamp(7d change, ' + m.growth_floor + '%, ' + m.growth_cap + '%) / 100 x ' + m.growth_weight_up + ' up, x ' + m.growth_weight_down + ' down — flight weighs more than inflow' }),
        el('div', { text: 'maturity  = ' + m.maturity_floor + ' + ' + m.maturity_range + ' x (1 - e^(-age / ' + m.maturity_tau_days + 'd))  (unknown age: ' + m.unknown_age_days + 'd)' }),
        el('div', { text: 'breadth   = 1 + ' + m.breadth_step + ' x min(chains - 1, ' + m.breadth_cap_chains + ')' })
      ),
      el('div', { class: 'two-col' },
        el('div', null,
          el('h3', { text: 'Comparables: what the market pays per TVL' }),
          el('table', { class: 'comps' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live' }), el('th', { scope: 'col', text: 'Median' }), el('th', { scope: 'col', text: 'Used' }), el('th', { scope: 'col', text: 'Source' }))),
            el('tbody', null, compRows)
          )
        ),
        el('div', null,
          el('h3', { text: 'Read this before farming' }),
          el('p', { class: 'note' }, el('b', { text: 'Records no token is not has no token. ' }), 'DefiLlama\'s record is not proof: a protocol on this board may still have a token its record does not carry.'),
          el('p', { class: 'note' }, el('b', { text: 'Implied value is this entry\'s claim. ' }), 'It is not a price, not a prediction that a token launches, and not make.fun\'s. Launch prices are set by low-float dynamics — Blast opened at a $2B fully diluted value, zkSync near $700M, Magic Eden\'s token fell from $15B to $4.2B in a day — which is why this board prices from multiples, not from launch hype.'),
          el('p', { class: 'note' }, el('b', { text: 'The snapshot is sealed. ' }), 'Every run reads the same DefiLlama fetch from 2026-11-14. Nothing here updates, and no row is hand-picked.')
        )
      )
    );
  }

  function footer() {
    return el('footer', { class: 'footer' },
      el('span', { text: 'Source: ' + DATA.source }),
      el('span', { text: 'Watchlist floor $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL · ' + DATA.watchlist_size + ' watchlist protocols · ' + DATA.board_size + ' rows ranked · model ' + DATA.model_version }),
      el('span', { text: 'Not financial advice. A farm plan costs real gas and locks real capital, and a token may never come.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, DATA.model);
    // The multiple is carried to four decimals; the board was scored from
    // the unrounded one, so the page's recompute agrees within half a
    // percent rather than to the dollar.
    var recomputeMatches = Math.abs(recomputed - row.implied_value_usd) <= Math.max(1, row.implied_value_usd * 0.005);
    var peers = (DATA.peers && DATA.peers[row.category || 'Other']) || [];
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' · watchlist' : ' · early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: fmtMult(row.multiple) + ' (' + row.multiple_n + (row.multiple_n === 1 ? ' live comp, ' : ' live comps, ') + (row.multiple_source === 'global' ? 'global median' : 'shrunk · ' + Math.round((row.multiple_weight || 0) * 100) + '% category') + ')' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + ' → x' + row.growth_multiplier.toFixed(2) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) + ' → x' + row.maturity_multiplier.toFixed(2) })),
        el('div', null, el('span', { text: 'Chain breadth' }), el('b', { class: 'num', text: (row.chains || []).length + ' chains → x' + row.breadth_multiplier.toFixed(2) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputeMatches ? ', the same number board.json carries (within the rounding of the multiple).' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    if (peers.length > 0) {
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Live peers in ' + (row.category || 'Other') }),
        el('p', { class: 'sub', text: 'Tokens already trading in this category — the comparables behind the multiple.' }),
        el('table', { class: 'peers' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
          el('tbody', null, peers.map(function (p) {
            return el('tr', null,
              el('td', { text: p.name }),
              el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
              el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
              el('td', { class: 'num', text: fmtMult(p.ratio) })
            );
          }))
        )
      ));
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    var app = document.getElementById('board');
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    if (state.tab === 'pre-token') shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
