(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const num = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  };
  const numOr0 = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const fmt = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '—');
  const fmtPct = (value) => (Number.isFinite(value) ? `${value.toFixed(1)}%` : '—');

  /* ---------- Tool 1: GPA Calculator ---------- */
  const GRADE_POINTS = {
    'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7,
    'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'F': 0
  };
  const LEVEL_BOOST = { regular: 0, honors: 0.5, ap: 1.0 };

  function gradePoints(letter) {
    return Object.prototype.hasOwnProperty.call(GRADE_POINTS, letter) ? GRADE_POINTS[letter] : 0;
  }
  function weightedPoints(letter, level) {
    const base = gradePoints(letter);
    if (base <= 0) return 0;
    return Math.min(base + (LEVEL_BOOST[level] || 0), 5.0);
  }

  const courseRows = $('#courseRows');

  function addCourseRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'dynamic-row course-row';
    const gradeOptions = Object.keys(GRADE_POINTS)
      .map((g) => `<option value="${g}"${g === (data.grade || 'A') ? ' selected' : ''}>${g.replace('-', '−')}</option>`).join('');
    row.innerHTML = `
      <label>Course<input type="text" class="c-name" value="${data.name || ''}" aria-label="Course name"></label>
      <label>Grade<select class="c-grade" aria-label="Letter grade">${gradeOptions}</select></label>
      <label>Credits<input type="number" class="c-credits" min="0" step="0.5" value="${data.credits ?? 3}" aria-label="Credits"></label>
      <label>Level<select class="c-level" aria-label="Course level">
        <option value="regular"${data.level === 'regular' || !data.level ? ' selected' : ''}>Regular</option>
        <option value="honors"${data.level === 'honors' ? ' selected' : ''}>Honors</option>
        <option value="ap"${data.level === 'ap' ? ' selected' : ''}>AP</option>
      </select></label>
      <button type="button" class="row-remove" aria-label="Remove course">×</button>`;
    courseRows.appendChild(row);
  }

  addCourseRow({ name: 'English', grade: 'A', credits: 4, level: 'regular' });
  addCourseRow({ name: 'Algebra II', grade: 'B', credits: 3, level: 'regular' });
  addCourseRow({ name: 'Biology (Honors)', grade: 'A', credits: 3, level: 'honors' });
  addCourseRow({ name: 'AP U.S. History', grade: 'B+', credits: 3, level: 'ap' });

  $('#addCourse').addEventListener('click', () => { addCourseRow(); calculateGPA(); });

  let latestGPA = { unweighted: 0, weighted: 0, credits: 0, courses: 0, rows: [] };

  function calculateGPA() {
    let credits = 0;
    let pointsU = 0;
    let pointsW = 0;
    const rows = [];
    $$('.course-row').forEach((row) => {
      const cr = numOr0($('.c-credits', row).value);
      const grade = $('.c-grade', row).value;
      const level = $('.c-level', row).value;
      const name = $('.c-name', row).value || 'Course';
      credits += cr;
      pointsU += gradePoints(grade) * cr;
      pointsW += weightedPoints(grade, level) * cr;
      rows.push({ name, grade, credits: cr, level });
    });
    const unweighted = credits ? pointsU / credits : 0;
    const weighted = credits ? pointsW / credits : 0;
    latestGPA = { unweighted, weighted, credits, courses: rows.length, rows, pointsU, pointsW };
    $('#gpaUnweighted').textContent = fmt(unweighted);
    $('#gpaWeighted').textContent = fmt(weighted);
    $('#gpaCredits').textContent = credits % 1 === 0 ? String(credits) : credits.toFixed(1);
    $('#gpaCourses').textContent = String(rows.length);
    $('#gpaPoints').textContent = pointsU.toFixed(1);
    $('#gpaPointsW').textContent = pointsW.toFixed(1);
  }

  $('#printGpa').addEventListener('click', () => {
    $('#printMeta').textContent = `${latestGPA.courses} courses · ${latestGPA.credits} total credits`;
    $('#printRows').innerHTML = latestGPA.rows.map((r) =>
      `<tr><td>${r.name} — ${r.grade.replace('-', '−')} (${r.level === 'ap' ? 'AP' : r.level === 'honors' ? 'Honors' : 'Regular'})</td><td>${r.credits} cr</td></tr>`).join('');
    $('#printGpaU').textContent = fmt(latestGPA.unweighted);
    $('#printGpaW').textContent = fmt(latestGPA.weighted);
    window.print();
  });
  $('#copyGpa').addEventListener('click', async () => {
    const text = [
      'GradePoint — GPA Summary',
      ...latestGPA.rows.map((r) => `${r.name}: ${r.grade} · ${r.credits} credits · ${r.level}`),
      `Total credits: ${latestGPA.credits}`,
      `Unweighted GPA: ${fmt(latestGPA.unweighted)}`,
      `Weighted GPA: ${fmt(latestGPA.weighted)}`
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      $('#gpaCopyStatus').textContent = 'GPA summary copied.';
    } catch {
      $('#gpaCopyStatus').textContent = 'Copy is unavailable in this browser; use Print instead.';
    }
  });

  /* ---------- Tool 2: Grade Needed on the Final ---------- */
  function neededOnFinal(current, weightPct, target) {
    const w = weightPct / 100;
    if (!(w > 0)) return NaN;
    return (target - current * (1 - w)) / w;
  }

  function calculateFinal() {
    const current = num($('#finalCurrent').value);
    const weight = num($('#finalWeight').value);
    const target = num($('#finalTarget').value);
    const flag = $('#finalFlag');
    if (!Number.isFinite(current) || !Number.isFinite(weight) || !Number.isFinite(target) || weight <= 0) {
      $('#finalNeeded').textContent = '—';
      flag.className = 'flag flag-neutral';
      flag.textContent = 'Enter a current grade, a final-exam weight above 0, and a target grade.';
      $('#finalFloor').textContent = '—';
      $('#finalCeiling').textContent = '—';
      $('#finalHold').textContent = '—';
      return;
    }
    const w = weight / 100;
    const needed = neededOnFinal(current, weight, target);
    const floor = current * (1 - w);
    const ceiling = floor + 100 * w;
    $('#finalFloor').textContent = fmtPct(floor);
    $('#finalCeiling').textContent = fmtPct(ceiling);
    $('#finalHold').textContent = fmtPct(floor + current * w);
    if (needed <= 0) {
      $('#finalNeeded').textContent = '0%';
      $('#finalNeededNote').textContent = 'needed — target already secured';
      flag.className = 'flag flag-ok';
      flag.textContent = `Already secured: even a 0 on the final leaves you at ${fmtPct(floor)}, which meets your ${fmtPct(target)} target.`;
    } else if (needed > 100) {
      $('#finalNeeded').textContent = fmtPct(needed);
      $('#finalNeededNote').textContent = 'needed — above a perfect score';
      flag.className = 'flag flag-bad';
      flag.textContent = `Not possible: you would need ${fmtPct(needed)} on the final. The highest grade still reachable is ${fmtPct(ceiling)} (a perfect 100 on the final).`;
    } else {
      $('#finalNeeded').textContent = fmtPct(needed);
      $('#finalNeededNote').textContent = 'on the final exam';
      flag.className = needed >= 90 ? 'flag flag-mid' : 'flag flag-neutral';
      flag.textContent = needed >= 90
        ? `Within reach, but demanding: you need ${fmtPct(needed)} on the final to finish at ${fmtPct(target)}.`
        : `Within reach: score ${fmtPct(needed)} or better on the final to finish at ${fmtPct(target)}.`;
    }
  }

  /* ---------- Tool 3: % → Letter Converter ---------- */
  const scaleRows = $('#scaleRows');

  function addScaleRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'dynamic-row scale-row scale-entry';
    row.innerHTML = `
      <label>Letter<input type="text" class="s-letter" value="${data.letter || ''}" maxlength="3" aria-label="Letter grade"></label>
      <label>Minimum %<input type="number" class="s-min" min="0" max="100" step="0.1" value="${data.min ?? ''}" aria-label="Minimum percent"></label>
      <button type="button" class="row-remove" aria-label="Remove scale row">×</button>`;
    scaleRows.appendChild(row);
  }

  addScaleRow({ letter: 'A', min: 90 });
  addScaleRow({ letter: 'B', min: 80 });
  addScaleRow({ letter: 'C', min: 70 });
  addScaleRow({ letter: 'D', min: 60 });
  addScaleRow({ letter: 'F', min: 0 });

  $('#addScaleRow').addEventListener('click', () => { addScaleRow(); calculateConverter(); });

  function readScale() {
    const entries = $$('.scale-entry').map((row) => ({
      letter: $('.s-letter', row).value.trim(),
      min: num($('.s-min', row).value)
    }));
    const errors = [];
    const seenLetters = new Set();
    const seenMins = new Set();
    entries.forEach((e) => {
      if (!e.letter) errors.push('Every scale row needs a letter.');
      if (seenLetters.has(e.letter.toUpperCase())) errors.push(`Letter "${e.letter}" appears more than once.`);
      seenLetters.add(e.letter.toUpperCase());
      if (!Number.isFinite(e.min) || e.min < 0 || e.min > 100) errors.push(`Minimum for "${e.letter || '?'}" must be a number from 0 to 100.`);
      else if (seenMins.has(e.min)) errors.push(`Minimum ${e.min}% is used by more than one letter — overlapping cutoffs.`);
      seenMins.add(e.min);
    });
    const sorted = [...entries].sort((a, b) => b.min - a.min);
    if (sorted.length && Number.isFinite(sorted[sorted.length - 1].min) && sorted[sorted.length - 1].min > 0) {
      errors.push('The lowest cutoff is above 0%, so low scores have no letter. Add a row starting at 0.');
    }
    return { sorted, errors: [...new Set(errors)] };
  }

  function letterFor(pct, sortedScale) {
    for (const entry of sortedScale) {
      if (Number.isFinite(entry.min) && pct >= entry.min) return entry.letter;
    }
    return '—';
  }

  function calculateConverter() {
    const { sorted, errors } = readScale();
    const warning = $('#scaleWarning');
    warning.textContent = errors.length ? `Scale problem: ${errors.join(' ')}` : '';

    const earned = num($('#convEarned').value);
    const possible = num($('#convPossible').value);
    let pct = num($('#convPct').value);
    let echo = '';
    if (Number.isFinite(earned) && Number.isFinite(possible) && possible > 0) {
      pct = (earned / possible) * 100;
      echo = `${earned} / ${possible} points = ${pct.toFixed(1)}%`;
    } else if (Number.isFinite(pct)) {
      echo = `${pct}%`;
    }
    if (errors.length) {
      $('#convLetter').textContent = '—';
      $('#convInputEcho').textContent = echo || 'No score entered';
      $('#convNote').textContent = 'fix the scale problem to convert';
    } else if (Number.isFinite(pct)) {
      $('#convLetter').textContent = letterFor(pct, sorted);
      $('#convInputEcho').textContent = echo;
      $('#convNote').textContent = 'on your current scale';
    } else {
      $('#convLetter').textContent = '—';
      $('#convInputEcho').textContent = 'No score entered';
      $('#convNote').textContent = 'enter a percentage or points';
    }

    // Batch conversion
    const lines = $('#batchInput').value.split('\n');
    const out = lines.map((raw) => {
      const trimmed = raw.trim();
      if (!trimmed) return '';
      const value = Number.parseFloat(trimmed);
      if (!Number.isFinite(value)) return `<div class="batch-line invalid"><span>${trimmed}</span><strong>not a number</strong></div>`;
      const letter = errors.length ? '—' : letterFor(value, sorted);
      return `<div class="batch-line"><span>${value}%</span><strong>${letter}</strong></div>`;
    }).filter(Boolean).join('');
    $('#batchResults').innerHTML = out || '<div class="batch-line"><span>No scores yet</span><strong>—</strong></div>';
  }

  /* ---------- Tool 4: Class Average & Curve Visualizer ---------- */
  const STD_SCALE = [
    { letter: 'A', min: 90 }, { letter: 'B', min: 80 }, { letter: 'C', min: 70 },
    { letter: 'D', min: 60 }, { letter: 'F', min: 0 }
  ];
  function parseScores(text) {
    return text.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)
      .map((t) => Number.parseFloat(t)).filter((v) => Number.isFinite(v));
  }
  function meanOf(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN; }
  function medianOf(arr) {
    if (!arr.length) return NaN;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  function distribution(scores) {
    const counts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    scores.forEach((s) => { counts[letterFor(s, STD_SCALE)] += 1; });
    return counts;
  }
  function renderBars(el, counts, total) {
    el.innerHTML = ['A', 'B', 'C', 'D', 'F'].map((letter) => {
      const count = counts[letter] || 0;
      const width = total ? Math.round((count / total) * 100) : 0;
      return `<div class="bar-row"><span>${letter}</span><div class="bar-track"><div class="bar-fill ${letter.toLowerCase()}" style="width:${width}%"></div></div><span>${count}</span></div>`;
    }).join('');
  }
  const clamp100 = (v) => Math.min(Math.max(v, 0), 100);
  function flatCurve(scores, points) { return scores.map((s) => clamp100(s + points)); }
  function linearCurve(scores) {
    const top = scores.length ? Math.max(...scores) : 0;
    if (!(top > 0)) return [...scores];
    const factor = 100 / top;
    return scores.map((s) => clamp100(s * factor));
  }
  function sqrtCurve(scores) { return scores.map((s) => clamp100(10 * Math.sqrt(Math.max(s, 0)))); }

  function calculateCurve() {
    const raw = $('#classScores').value;
    const tokens = raw.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
    const scores = parseScores(raw);
    const invalid = tokens.length - scores.length;
    const outOfRange = scores.filter((s) => s < 0 || s > 100).length;
    const flatPts = numOr0($('#flatPoints').value);
    $('#flatLabel').textContent = `(+${flatPts} pts)`;
    const warn = $('#curveWarning');
    if (invalid > 0 || outOfRange > 0) {
      warn.textContent = `Heads up: ${invalid} entr${invalid === 1 ? 'y was' : 'ies were'} not a number and ignored${outOfRange ? `; ${outOfRange} score(s) fall outside 0–100 and are still counted as entered` : ''}.`;
    } else if (!scores.length) {
      warn.textContent = 'Add at least one score to see class statistics.';
    } else {
      warn.textContent = '';
    }

    $('#statCount').textContent = String(scores.length);
    $('#statMean').textContent = scores.length ? meanOf(scores).toFixed(1) : '—';
    $('#statMedian').textContent = scores.length ? medianOf(scores).toFixed(1) : '—';
    $('#statRange').textContent = scores.length ? `${Math.max(...scores)} / ${Math.min(...scores)}` : '—';

    const sets = [
      { scores, dist: '#distOriginal', mean: '#meanOriginal' },
      { scores: flatCurve(scores, flatPts), dist: '#distFlat', mean: '#meanFlat' },
      { scores: linearCurve(scores), dist: '#distLinear', mean: '#meanLinear' },
      { scores: sqrtCurve(scores), dist: '#distSqrt', mean: '#meanSqrt' }
    ];
    sets.forEach(({ scores: set, dist, mean }) => {
      renderBars($(dist), distribution(set), set.length);
      $(mean).textContent = set.length ? meanOf(set).toFixed(1) : '—';
    });
  }

  /* ---------- Shared row removal ---------- */
  document.addEventListener('click', (event) => {
    if (!event.target.classList.contains('row-remove')) return;
    const row = event.target.closest('.dynamic-row');
    if (!row) return;
    const siblings = row.parentElement.querySelectorAll('.dynamic-row');
    if (siblings.length > 1) row.remove();
    calculateGPA();
    calculateConverter();
    calculateCurve();
  });

  /* ---------- Wiring ---------- */
  $('#gpaForm').addEventListener('input', calculateGPA);
  $('#gpaForm').addEventListener('change', calculateGPA);
  $('#finalForm').addEventListener('input', calculateFinal);
  $('#scaleForm').addEventListener('input', calculateConverter);
  $('#scaleForm').addEventListener('change', calculateConverter);
  $('#convertForm').addEventListener('input', calculateConverter);
  $('#batchForm').addEventListener('input', calculateConverter);
  $('#curveForm').addEventListener('input', calculateCurve);

  calculateGPA();
  calculateFinal();
  calculateConverter();
  calculateCurve();
})();
