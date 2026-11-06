(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const num = (v) => { const p = Number.parseFloat(v); return Number.isFinite(p) && p > 0 ? p : 0; };
  const setMoney = (id, v) => { $(id).textContent = money.format(v); };

  // ---- Tool 1: Tip Pool Split ----
  const poolRows = $('#poolRows');
  function addPoolRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'dynamic-row pool-row';
    row.innerHTML = `<label>Name<input type="text" class="p-name" value="${data.name || ''}"></label><label>Hours<input type="number" class="p-hours" min="0" step="0.25" value="${data.hours ?? 0}"></label><label>Points<input type="number" class="p-points" min="0" step="0.1" value="${data.points ?? 1}"></label><div class="row-total p-share">$0.00</div><button type="button" class="row-remove" aria-label="Remove staff member">×</button>`;
    poolRows.appendChild(row);
  }
  addPoolRow({ name: 'Alex — Server', hours: 8, points: 1 });
  addPoolRow({ name: 'Jordan — Server', hours: 4, points: 1 });
  addPoolRow({ name: 'Sam — Barback', hours: 6, points: 0.5 });
  $('#addPoolRow').addEventListener('click', () => { addPoolRow(); calcPool(); });

  let latestPool = [];
  function calcPool() {
    const pool = num($('#poolTotal').value);
    const rows = $$('.pool-row');
    let totalUnits = 0;
    const data = rows.map(r => {
      const units = num($('.p-hours', r).value) * num($('.p-points', r).value);
      totalUnits += units;
      return { name: $('.p-name', r).value || 'Staff', units, row: r };
    });
    let allocated = 0;
    data.forEach(d => {
      const share = totalUnits ? pool * d.units / totalUnits : 0;
      d.share = share; d.pct = pool ? (share / pool) * 100 : 0;
      allocated += share;
      $('.p-share', d.row).textContent = money.format(share);
    });
    latestPool = data;
    setMoney('#poolTotalOut', pool);
    $('#poolUnits').textContent = totalUnits.toFixed(2);
    setMoney('#poolPerUnit', totalUnits ? pool / totalUnits : 0);
    $('#poolCount').textContent = rows.length;
    setMoney('#poolAllocated', allocated);
    setMoney('#poolRemainder', pool - allocated);
    $('#poolBreakdown').innerHTML = data.map(d => `<div><span>${d.name} — ${d.pct.toFixed(1)}%</span><strong>${money.format(d.share)}</strong></div>`).join('');
  }

  // ---- Tool 2: Tip-Out ----
  const tipoutRows = $('#tipoutRows');
  function addTipoutRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'dynamic-row tipout-row';
    row.innerHTML = `<label>Role<input type="text" class="t-role" value="${data.role || ''}"></label><label>%<input type="number" class="t-pct" min="0" step="0.1" value="${data.pct ?? 0}"></label><div class="row-total t-owed">$0.00</div><button type="button" class="row-remove" aria-label="Remove role">×</button>`;
    tipoutRows.appendChild(row);
  }
  addTipoutRow({ role: 'Barback', pct: 5 });
  addTipoutRow({ role: 'Busser', pct: 5 });
  addTipoutRow({ role: 'Food runner', pct: 5 });
  addTipoutRow({ role: 'Host', pct: 5 });
  $('#addTipoutRow').addEventListener('click', () => { addTipoutRow(); calcTipout(); });

  function calcTipout() {
    const base = num($('#tipoutBaseAmount').value);
    const type = $('#tipoutBaseType').value;
    let total = 0, totalPct = 0;
    const parts = [];
    $$('.tipout-row').forEach(r => {
      const pct = num($('.t-pct', r).value);
      const owed = base * pct / 100;
      total += owed; totalPct += pct;
      $('.t-owed', r).textContent = money.format(owed);
      parts.push({ role: $('.t-role', r).value || 'Role', pct, owed });
    });
    // What server keeps: if base is tips, keep = base - total. If base is sales, tips aren't entered separately, so keep shown as negative tip-out reference; note explains.
    const keep = type === 'tips' ? base - total : 0;
    setMoney('#tipoutTotal', total);
    $('#tipoutRate').textContent = totalPct.toFixed(1) + '%';
    setMoney('#tipoutBaseOut', base);
    if (type === 'tips') {
      setMoney('#tipoutKeep', keep);
      $('#tipoutNote').textContent = `Tip-out is ${money.format(total)} on ${money.format(base)} in tips. You keep ${money.format(keep)} before any other deductions.`;
    } else {
      $('#tipoutKeep').textContent = '—';
      $('#tipoutNote').textContent = `Tip-out is ${money.format(total)} calculated on ${money.format(base)} in sales. Subtract it from your actual tips for the shift to get what you keep.`;
    }
    $('#tipoutBreakdown').innerHTML = parts.map(p => `<div><span>${p.role} — ${p.pct}%</span><strong>${money.format(p.owed)}</strong></div>`).join('');
  }

  // ---- Tool 3: Cash vs Card Tracker ----
  const trackerRows = $('#trackerRows');
  function addTrackerRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'dynamic-row tracker-row';
    row.innerHTML = `<label>Shift<input type="text" class="k-label" value="${data.label || ''}"></label><label>Cash<input type="number" class="k-cash" min="0" step="0.01" value="${data.cash ?? 0}"></label><label>Card<input type="number" class="k-card" min="0" step="0.01" value="${data.card ?? 0}"></label><div class="row-total k-net">$0.00</div><button type="button" class="row-remove" aria-label="Remove shift">×</button>`;
    trackerRows.appendChild(row);
  }
  addTrackerRow({ label: 'Mon — Dinner', cash: 45, card: 120 });
  addTrackerRow({ label: 'Tue — Dinner', cash: 38, card: 100 });
  addTrackerRow({ label: 'Fri — Bar', cash: 72, card: 210 });
  $('#addTrackerRow').addEventListener('click', () => { addTrackerRow(); calcTracker(); });

  let latestTracker = {};
  function calcTracker() {
    const feePct = num($('#feePct').value) / 100;
    let cash = 0, cardGross = 0, fees = 0, takeHome = 0;
    const rowsData = [];
    $$('.tracker-row').forEach(r => {
      const c = num($('.k-cash', r).value);
      const card = num($('.k-card', r).value);
      const fee = card * feePct;
      const netCard = card - fee;
      const net = c + netCard;
      cash += c; cardGross += card; fees += fee; takeHome += net;
      $('.k-net', r).textContent = money.format(net);
      rowsData.push({ label: $('.k-label', r).value || 'Shift', cash: c, card, fee, net });
    });
    latestTracker = { cash, cardGross, fees, takeHome, rowsData };
    setMoney('#trackCash', cash);
    setMoney('#trackCardGross', cardGross);
    setMoney('#trackFees', fees);
    setMoney('#trackTakeHome', takeHome);
  }

  // ---- Tool 4: Shift Earnings ----
  function calcEarnings() {
    const wage = num($('#earnWage').value);
    const hours = num($('#earnHours').value);
    const tips = num($('#earnTips').value);
    const mode = $('#earnTipoutMode').value;
    const tv = num($('#earnTipoutValue').value);
    const tipout = mode === 'pct' ? tips * tv / 100 : tv;
    const grossWages = wage * hours;
    const netTips = Math.max(tips - tipout, 0);
    const total = grossWages + netTips;
    const effective = hours ? total / hours : 0;
    const weekly = total * num($('#earnShifts').value);
    setMoney('#earnTotal', total);
    setMoney('#earnGrossWages', grossWages);
    setMoney('#earnTipoutOut', tipout);
    setMoney('#earnNetTips', netTips);
    $('#earnEffective').textContent = money.format(effective) + '/hr';
    setMoney('#earnWeekly', weekly);
    $('#earnNote').textContent = `${money.format(grossWages)} wages + ${money.format(netTips)} net tips across ${hours} hours.`;
  }

  // Remove-row delegation
  document.addEventListener('click', (e) => {
    if (!e.target.classList.contains('row-remove')) return;
    const row = e.target.closest('.dynamic-row');
    if (row.parentElement.querySelectorAll('.dynamic-row').length > 1) row.remove();
    calcPool(); calcTipout(); calcTracker();
  });

  // Print / copy for tracker
  function populatePrint() {
    $('#printMeta').textContent = `${$('#trackerLabel').value || 'Shift sheet'} · Card fee ${$('#feePct').value}%`;
    $('#printRows').innerHTML = latestTracker.rowsData.map(r => `<tr><td>${r.label}</td><td>${money.format(r.cash)}</td><td>${money.format(r.card)}</td><td>${money.format(r.fee)}</td><td>${money.format(r.net)}</td></tr>`).join('');
    $('#printTotal').textContent = money.format(latestTracker.takeHome);
  }
  $('#printSheetBtn').addEventListener('click', () => { populatePrint(); window.print(); });
  $('#copyTracker').addEventListener('click', async () => {
    const text = [`TipPool — ${$('#trackerLabel').value || 'Tips'}`, `Cash: ${money.format(latestTracker.cash)}`, `Card gross: ${money.format(latestTracker.cardGross)}`, `Fees: ${money.format(latestTracker.fees)}`, `Take-home: ${money.format(latestTracker.takeHome)}`].join('\n');
    try { await navigator.clipboard.writeText(text); $('#copyTrackerStatus').textContent = 'Totals copied.'; } catch { $('#copyTrackerStatus').textContent = 'Copy unavailable; use Print instead.'; }
  });

  $('#poolForm').addEventListener('input', calcPool);
  $('#tipoutForm').addEventListener('input', calcTipout);
  $('#tipoutForm').addEventListener('change', calcTipout);
  $('#trackerForm').addEventListener('input', calcTracker);
  $('#earningsForm').addEventListener('input', calcEarnings);
  $('#earningsForm').addEventListener('change', calcEarnings);

  calcPool(); calcTipout(); calcTracker(); calcEarnings();
})();
