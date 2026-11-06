(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const num = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const clampPct = (value) => Math.min(Math.max(num(value), 0), 95);

  const materialRows = $('#materialRows');
  const laborRows = $('#laborRows');

  function addMaterialRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'dynamic-row material-row';
    row.innerHTML = `
      <label>Item<input type="text" class="m-name" value="${data.name || ''}" aria-label="Material item name"></label>
      <label>Qty<input type="number" class="m-qty" min="0" step="0.01" value="${data.qty ?? 1}" aria-label="Material quantity"></label>
      <label>Unit cost<input type="number" class="m-unit" min="0" step="0.01" value="${data.unit ?? 0}" aria-label="Material unit cost"></label>
      <label>Line total<input type="text" class="m-total" readonly value="$0.00" aria-label="Material line total"></label>
      <button type="button" class="row-remove" aria-label="Remove material item">×</button>`;
    materialRows.appendChild(row);
  }

  function addLaborRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'dynamic-row labor labor-row';
    row.innerHTML = `
      <label>Role<input type="text" class="l-name" value="${data.name || ''}" aria-label="Labor role"></label>
      <label>Hours<input type="number" class="l-hours" min="0" step="0.25" value="${data.hours ?? 0}" aria-label="Labor hours"></label>
      <label>Burdened cost / hr<input type="number" class="l-rate" min="0" step="0.01" value="${data.rate ?? 0}" aria-label="Burdened labor cost per hour"></label>
      <button type="button" class="row-remove" aria-label="Remove labor role">×</button>`;
    laborRows.appendChild(row);
  }

  addMaterialRow({ name: 'Cabinets', qty: 1, unit: 4200 });
  addMaterialRow({ name: 'Countertops', qty: 1, unit: 1850 });
  addMaterialRow({ name: 'Fixtures & hardware', qty: 1, unit: 675 });
  addLaborRow({ name: 'Lead carpenter', hours: 26, rate: 68 });
  addLaborRow({ name: 'Installer / helper', hours: 18, rate: 42 });

  $('#addMaterial').addEventListener('click', () => { addMaterialRow(); calculateQuote(); });
  $('#addLabor').addEventListener('click', () => { addLaborRow(); calculateQuote(); });

  document.addEventListener('click', (event) => {
    if (!event.target.classList.contains('row-remove')) return;
    const row = event.target.closest('.dynamic-row');
    const siblings = row.parentElement.querySelectorAll('.dynamic-row');
    if (siblings.length > 1) row.remove();
    calculateQuote();
  });

  function setMoney(id, value) { $(id).textContent = money.format(value); }

  let latestQuote = {};

  function calculateQuote() {
    let materials = 0;
    $$('.material-row').forEach((row) => {
      const total = num($('.m-qty', row).value) * num($('.m-unit', row).value);
      $('.m-total', row).value = money.format(total);
      materials += total;
    });

    let labor = 0;
    let laborHours = 0;
    $$('.labor-row').forEach((row) => {
      const hours = num($('.l-hours', row).value);
      laborHours += hours;
      labor += hours * num($('.l-rate', row).value);
    });

    const other = ['subCost', 'equipmentCost', 'permitCost', 'travelCost', 'otherCost']
      .reduce((sum, id) => sum + num(document.getElementById(id).value), 0);
    const direct = materials + labor + other;
    const overhead = direct * clampPct($('#overheadPct').value) / 100;
    const contingency = direct * clampPct($('#contingencyPct').value) / 100;
    const loadedCost = direct + overhead + contingency;
    const margin = clampPct($('#marginPct').value) / 100;
    const pretax = margin >= 1 ? loadedCost : loadedCost / (1 - margin);
    const taxPct = num($('#taxPct').value) / 100;
    const taxBaseMode = $('#taxBase').value;
    const taxBase = taxBaseMode === 'materials' ? materials : taxBaseMode === 'pretax' ? pretax : 0;
    const tax = taxBase * taxPct;
    const total = pretax + tax;
    const grossProfit = pretax - loadedCost;
    const deposit = total * Math.min(num($('#depositPct').value), 100) / 100;

    latestQuote = { materials, labor, laborHours, other, direct, overhead, contingency, loadedCost, pretax, tax, total, grossProfit, deposit, balance: total - deposit };

    setMoney('#materialsTotal', materials);
    setMoney('#laborTotal', labor);
    setMoney('#otherTotal', other);
    setMoney('#directTotal', direct);
    setMoney('#overheadTotal', overhead);
    setMoney('#contingencyTotal', contingency);
    setMoney('#pretaxTotal', pretax);
    setMoney('#taxTotal', tax);
    setMoney('#quoteTotal', total);
    setMoney('#grossProfit', grossProfit);
    setMoney('#revenuePerHour', laborHours ? pretax / laborHours : 0);
    setMoney('#depositDue', deposit);
    setMoney('#balanceDue', total - deposit);
  }

  function calculateRate() {
    const costs = num($('#annualLabor').value) + num($('#annualOverhead').value);
    const hours = Math.max(num($('#billableHours').value), 1);
    const profit = clampPct($('#rateProfitPct').value) / 100;
    const rate = (costs / hours) / (1 - profit);
    setMoney('#requiredRate', rate);
    $('#requiredRate').textContent = `${money.format(rate)}/hr`;
    $('#rateNote').textContent = `Covers ${money.format(costs)} across ${hours.toLocaleString()} billable hours, then applies the target profit margin.`;
  }

  function calculateMargin() {
    const cost = num($('#marginCost').value);
    const target = clampPct($('#marginTarget').value) / 100;
    const mode = $('#marginMode').value;
    let price;
    let profit;
    let equivalent;
    if (mode === 'margin') {
      price = target >= 1 ? cost : cost / (1 - target);
      profit = price - cost;
      equivalent = cost ? (profit / cost) * 100 : 0;
      $('#marginNote').textContent = `${money.format(profit)} gross profit. Equivalent markup: ${equivalent.toFixed(1)}%.`;
    } else {
      price = cost * (1 + target);
      profit = price - cost;
      equivalent = price ? (profit / price) * 100 : 0;
      $('#marginNote').textContent = `${money.format(profit)} gross profit. Equivalent gross margin: ${equivalent.toFixed(1)}%.`;
    }
    setMoney('#marginPrice', price);
  }

  function calculateBreakeven() {
    const fixed = num($('#monthlyFixed').value);
    const ticket = num($('#averageTicket').value);
    const margin = num($('#averageMargin').value) / 100;
    const grossPerJob = ticket * margin;
    const exactJobs = grossPerJob ? fixed / grossPerJob : 0;
    const jobs = grossPerJob ? Math.ceil(exactJobs) : 0;
    $('#jobsNeeded').textContent = jobs.toLocaleString();
    $('#breakevenNote').textContent = grossPerJob
      ? `${money.format(grossPerJob)} gross profit per average job. Exact break-even is ${exactJobs.toFixed(2)} jobs, or about ${money.format(fixed / margin)} in monthly revenue before rounding up.`
      : 'Enter an average ticket and gross margin to calculate break-even.';
  }

  function calculateMaterials() {
    const area = num($('#projectArea').value);
    const coverage = Math.max(num($('#packageCoverage').value), 0.01);
    const waste = num($('#wastePct').value) / 100;
    const adjusted = area * (1 + waste);
    const packages = Math.ceil(adjusted / coverage);
    const cost = packages * num($('#packagePrice').value);
    $('#packagesNeeded').textContent = packages.toLocaleString();
    $('#materialsNote').textContent = `${adjusted.toFixed(1)} sq. ft. including waste. Estimated material cost: ${money.format(cost)}; purchased coverage: ${(packages * coverage).toFixed(1)} sq. ft.`;
  }

  function populatePrint() {
    const business = $('#businessName').value || 'Contractor';
    const client = $('#clientName').value || 'Client';
    const project = $('#projectName').value || 'Project';
    const dateValue = $('#quoteDate').value;
    $('#printTitle').textContent = `${business} — Quote Summary`;
    $('#printMeta').textContent = `Prepared for ${client} · Project: ${project}${dateValue ? ` · Date: ${dateValue}` : ''}`;
    const rows = [
      ['Materials', latestQuote.materials],
      ['Labor', latestQuote.labor],
      ['Other direct costs', latestQuote.other],
      ['Overhead recovery', latestQuote.overhead],
      ['Contingency allowance', latestQuote.contingency],
      ['Pre-tax price', latestQuote.pretax],
      ['Tax (per selected treatment)', latestQuote.tax],
      ['Deposit due', latestQuote.deposit],
      ['Balance after deposit', latestQuote.balance]
    ];
    $('#printRows').innerHTML = rows.map(([label, value]) => `<tr><td>${label}</td><td>${money.format(value)}</td></tr>`).join('');
    $('#printTotal').textContent = money.format(latestQuote.total);
  }

  $('#printQuote').addEventListener('click', () => { populatePrint(); window.print(); });
  $('#copyQuote').addEventListener('click', async () => {
    const text = [
      `${$('#businessName').value || 'Contractor'} — ${$('#projectName').value || 'Project'}`,
      `Client: ${$('#clientName').value || 'Client'}`,
      `Materials: ${money.format(latestQuote.materials)}`,
      `Labor: ${money.format(latestQuote.labor)}`,
      `Pre-tax price: ${money.format(latestQuote.pretax)}`,
      `Tax: ${money.format(latestQuote.tax)}`,
      `Total quote: ${money.format(latestQuote.total)}`,
      `Deposit due: ${money.format(latestQuote.deposit)}`
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      $('#copyStatus').textContent = 'Quote summary copied.';
    } catch {
      $('#copyStatus').textContent = 'Copy is unavailable in this browser; use Print instead.';
    }
  });

  const today = new Date();
  $('#quoteDate').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  $('#quoteForm').addEventListener('input', calculateQuote);
  $('#rateForm').addEventListener('input', calculateRate);
  $('#marginForm').addEventListener('input', calculateMargin);
  $('#breakevenForm').addEventListener('input', calculateBreakeven);
  $('#materialsForm').addEventListener('input', calculateMaterials);

  calculateQuote();
  calculateRate();
  calculateMargin();
  calculateBreakeven();
  calculateMaterials();
})();
