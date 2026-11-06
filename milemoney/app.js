(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const num = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const rawNum = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const setMoney = (id, value) => { $(id).textContent = money.format(value); };
  const setPerMile = (id, value) => { $(id).textContent = `$${value.toFixed(4)}/mi`; };

  /* ---------- Tool 1: Cost-Per-Mile Calculator ---------- */
  let latestCpm = {};

  function calculateCpm() {
    const fixedTotal = ['cpmTruck', 'cpmTrailer', 'cpmInsurance', 'cpmPermits', 'cpmOtherFixed']
      .reduce((sum, id) => sum + num(document.getElementById(id).value), 0);
    const miles = Math.max(num($('#cpmMiles').value), 1);
    const fuelPrice = num($('#cpmFuelPrice').value);
    const mpg = Math.max(num($('#cpmMpg').value), 0.1);
    const fuelPerMile = fuelPrice / mpg;
    const otherVariable = num($('#cpmMaintenance').value) + num($('#cpmTires').value) + num($('#cpmRepairs').value);
    const variablePerMile = fuelPerMile + otherVariable;
    const fixedPerMile = fixedTotal / miles;
    const totalPerMile = fixedPerMile + variablePerMile;
    const monthlyTotal = fixedTotal + variablePerMile * miles;

    latestCpm = { fixedTotal, miles, fixedPerMile, fuelPerMile, otherVariable, variablePerMile, totalPerMile, monthlyTotal };

    setMoney('#cpmFixedTotal', fixedTotal);
    setPerMile('#cpmFixedPerMile', fixedPerMile);
    setPerMile('#cpmFuelPerMile', fuelPerMile);
    setPerMile('#cpmOtherVarPerMile', otherVariable);
    setPerMile('#cpmVariablePerMile', variablePerMile);
    setPerMile('#cpmTotalPerMile', totalPerMile);
    $('#cpmTotalPerMile').textContent = `$${totalPerMile.toFixed(4)}`;
    setMoney('#cpmMonthlyTotal', monthlyTotal);
  }

  /* ---------- Tool 2: Load Profit Checker ---------- */
  function calculateLoad() {
    const gross = num($('#loadGross').value);
    const loadedMiles = num($('#loadLoadedMiles').value);
    const deadheadMiles = num($('#loadDeadheadMiles').value);
    const totalMiles = loadedMiles + deadheadMiles;
    const fuelPrice = num($('#loadFuelPrice').value);
    const mpg = Math.max(num($('#loadMpg').value), 0.1);
    const factoringPct = Math.min(num($('#loadFactoringPct').value), 100) / 100;
    const fees = num($('#loadFees').value);
    const target = num($('#loadTarget').value);

    const fuelCost = totalMiles * (fuelPrice / mpg);
    const factoringCost = gross * factoringPct;
    const netRevenue = gross - factoringCost;
    const profit = netRevenue - fuelCost - fees;
    const profitPerMile = totalMiles ? profit / totalMiles : 0;

    const verdict = $('#loadVerdict');
    if (!totalMiles) {
      verdict.textContent = 'Enter miles to grade this load';
      verdict.className = 'verdict thin';
    } else if (profit < 0) {
      verdict.textContent = 'Loses money';
      verdict.className = 'verdict loses';
    } else if (profitPerMile >= target) {
      verdict.textContent = 'Profitable';
      verdict.className = 'verdict';
    } else {
      verdict.textContent = 'Thin';
      verdict.className = 'verdict thin';
    }

    $('#loadTotalMiles').textContent = totalMiles.toLocaleString();
    setMoney('#loadFuelCost', fuelCost);
    setMoney('#loadFactoringCost', factoringCost);
    setMoney('#loadNetRevenue', netRevenue);
    setMoney('#loadProfit', profit);
    setPerMile('#loadProfitPerMile', profitPerMile);
    $('#loadNote').textContent = totalMiles
      ? `Verdict compares profit per total mile (${profitPerMile.toFixed(2)} dollars) with your target of ${money.format(target)} per mile. Profit below zero always grades as losing money, no matter the target.`
      : 'Add loaded and deadhead miles to see the profit picture.';
  }

  /* ---------- Tool 3: Fuel Surcharge Calculator ---------- */
  function calculateSurcharge() {
    const base = num($('#surBasePrice').value);
    const current = num($('#surCurrentPrice').value);
    const mpg = Math.max(num($('#surMpg').value), 0.1);
    const linehaul = num($('#surLinehaul').value);
    const tripMiles = num($('#surTripMiles').value);

    const perMile = Math.max(current - base, 0) / mpg;
    const totalSurcharge = perMile * tripMiles;
    const pctOfLinehaul = linehaul ? (totalSurcharge / linehaul) * 100 : 0;

    setPerMile('#surPerMile', perMile);
    const parts = [];
    if (tripMiles) parts.push(`Total surcharge for ${tripMiles.toLocaleString()} miles: ${money.format(totalSurcharge)}.`);
    if (linehaul && tripMiles) parts.push(`That is ${pctOfLinehaul.toFixed(2)}% of the ${money.format(linehaul)} linehaul rate.`);
    if (current <= base) parts.push('Current price is at or below the base price, so no surcharge is owed under this formula.');
    $('#surNote').textContent = parts.join(' ') || 'Add a linehaul rate and trip miles to see the surcharge as a share of the load.';
  }

  /* ---------- Tool 4: Break-Even Rate Finder ---------- */
  function calculateBreakeven() {
    const fixed = num($('#beFixed').value);
    const variable = rawNum($('#beVariable').value);
    const miles = Math.max(num($('#beMiles').value), 1);
    const targetProfit = num($('#beProfit').value);

    const requiredRevenue = fixed + variable * miles + targetProfit;
    const ratePerMile = requiredRevenue / miles;

    setPerMile('#beRatePerMile', ratePerMile);
    $('#beRatePerMile').textContent = `$${ratePerMile.toFixed(4)}/mi`;
    $('#beNote').textContent = `Requires ${money.format(requiredRevenue)} in monthly revenue across ${miles.toLocaleString()} miles: ${money.format(fixed)} fixed + ${money.format(variable * miles)} variable + ${money.format(targetProfit)} target profit.`;
  }

  /* ---------- Tool 5: IFTA Fuel-Tax Estimator ---------- */
  const iftaRows = $('#iftaRows');

  function addIftaRow(data = {}) {
    const row = document.createElement('tr');
    row.className = 'ifta-row';
    row.innerHTML = `
      <td><input type="text" class="i-state state-input" maxlength="2" value="${data.state || ''}" aria-label="State code" placeholder="TX"></td>
      <td><input type="number" class="i-miles" min="0" step="0.1" value="${data.miles ?? 0}" aria-label="Miles driven in state"></td>
      <td><input type="number" class="i-purchased" min="0" step="0.01" value="${data.purchased ?? 0}" aria-label="Gallons purchased in state"></td>
      <td><input type="number" class="i-rate" min="0" step="0.001" value="${data.rate ?? 0}" aria-label="State tax rate per gallon"></td>
      <td class="computed i-consumed">0.00</td>
      <td class="computed i-tax">$0.00</td>
      <td><button type="button" class="row-remove" aria-label="Remove state row">×</button></td>`;
    iftaRows.appendChild(row);
  }

  addIftaRow({ state: 'TX', miles: 650, purchased: 120, rate: 0.20 });
  addIftaRow({ state: 'OK', miles: 390, purchased: 40, rate: 0.20 });
  addIftaRow({ state: 'NM', miles: 260, purchased: 30, rate: 0.17 });
  addIftaRow({ state: 'KS', miles: 130, purchased: 20, rate: 0.26 });

  $('#addIftaRow').addEventListener('click', () => { addIftaRow(); calculateIfta(); });

  document.addEventListener('click', (event) => {
    if (!event.target.classList.contains('row-remove')) return;
    const row = event.target.closest('.ifta-row');
    if (!row) return;
    if (iftaRows.querySelectorAll('.ifta-row').length > 1) row.remove();
    calculateIfta();
  });

  function calculateIfta() {
    const rows = $$('.ifta-row');
    let totalMiles = 0;
    let totalPurchased = 0;
    rows.forEach((row) => {
      totalMiles += num($('.i-miles', row).value);
      totalPurchased += num($('.i-purchased', row).value);
    });
    const fleetMpg = totalPurchased > 0 ? totalMiles / totalPurchased : 0;

    let totalConsumed = 0;
    let netTax = 0;
    rows.forEach((row) => {
      const miles = num($('.i-miles', row).value);
      const purchased = num($('.i-purchased', row).value);
      const rate = num($('.i-rate', row).value);
      const consumed = fleetMpg > 0 ? miles / fleetMpg : 0;
      const tax = (consumed - purchased) * rate;
      totalConsumed += consumed;
      netTax += tax;
      $('.i-consumed', row).textContent = consumed.toFixed(2);
      const taxCell = $('.i-tax', row);
      taxCell.textContent = money.format(tax);
      taxCell.classList.toggle('due', tax > 0.004);
      taxCell.classList.toggle('credit', tax < -0.004);
    });

    $('#iftaTotalMiles').textContent = totalMiles.toLocaleString();
    $('#iftaTotalPurchased').textContent = totalPurchased.toLocaleString(undefined, { maximumFractionDigits: 2 });
    $('#iftaFleetMpg').textContent = fleetMpg.toFixed(2);
    $('#iftaTotalConsumed').textContent = totalConsumed.toFixed(2);
    setMoney('#iftaNetTax', netTax);
    setMoney('#iftaNetTotal', netTax);
    $('#iftaNote').textContent = totalPurchased > 0
      ? (netTax > 0.004
        ? `Estimate: ${money.format(netTax)} in tax due across these states, before your base jurisdiction settles credits against amounts due. Estimator only — not a filing.`
        : netTax < -0.004
          ? `Estimate: a ${money.format(Math.abs(netTax))} net credit across these states, before your base jurisdiction settles the return. Estimator only — not a filing.`
          : 'Estimate: these states roughly balance out to no net tax due or credit. Estimator only — not a filing.')
      : 'Enter gallons purchased so the estimator can work out your fleet MPG.';
  }

  /* ---------- Print & copy for the Cost-Per-Mile summary ---------- */
  function populatePrint() {
    $('#printMeta').textContent = `Based on ${latestCpm.miles.toLocaleString()} miles per month.`;
    const rows = [
      ['Total fixed costs / month', money.format(latestCpm.fixedTotal)],
      ['Fixed cost per mile', `$${latestCpm.fixedPerMile.toFixed(4)}`],
      ['Fuel cost per mile', `$${latestCpm.fuelPerMile.toFixed(4)}`],
      ['Variable cost per mile', `$${latestCpm.variablePerMile.toFixed(4)}`],
      ['Total monthly cost', money.format(latestCpm.monthlyTotal)]
    ];
    $('#printRows').innerHTML = rows.map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`).join('');
    $('#printTotal').textContent = `$${latestCpm.totalPerMile.toFixed(4)}`;
  }

  $('#printCpm').addEventListener('click', () => { populatePrint(); window.print(); });
  $('#copyCpm').addEventListener('click', async () => {
    const text = [
      'MileMoney — Cost-Per-Mile Summary',
      `Miles per month: ${latestCpm.miles.toLocaleString()}`,
      `Fixed costs: ${money.format(latestCpm.fixedTotal)} (${latestCpm.fixedPerMile.toFixed(4)} per mile)`,
      `Variable cost: ${latestCpm.variablePerMile.toFixed(4)} per mile (fuel ${latestCpm.fuelPerMile.toFixed(4)})`,
      `Total cost per mile: ${latestCpm.totalPerMile.toFixed(4)}`,
      `Total monthly cost: ${money.format(latestCpm.monthlyTotal)}`
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      $('#copyStatus').textContent = 'Cost summary copied.';
    } catch {
      $('#copyStatus').textContent = 'Copy is unavailable in this browser; use Print instead.';
    }
  });

  $('#cpmForm').addEventListener('input', calculateCpm);
  $('#loadForm').addEventListener('input', calculateLoad);
  $('#surchargeForm').addEventListener('input', calculateSurcharge);
  $('#breakevenForm').addEventListener('input', calculateBreakeven);
  $('#iftaForm').addEventListener('input', calculateIfta);

  calculateCpm();
  calculateLoad();
  calculateSurcharge();
  calculateBreakeven();
  calculateIfta();
})();
