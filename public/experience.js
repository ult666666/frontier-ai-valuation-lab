import { MODEL_VERSION, VALUATION_DATE } from './lib/model.js';
import { comparePair, stressPair } from './lib/analytics.js';

const COMPANIES = ['Anthropic', 'OpenAI'];
const CHAPTERS = ['revenue', 'fcf', 'value'];
const COLORS = { Anthropic: '#ffab82', OpenAI: '#8adfc6' };
const ZERO_SHOCKS = { growthPp: 0, marginPp: 0, waccPp: 0, capitalEfficiencyPct: 0 };
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value, digits = 1) => new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Object.is(value, -0) ? 0 : value).replace('-', '−');
const money = value => `${value < 0 ? '−' : ''}$${fmt(Math.abs(value))}bn`;
const moneyHtml = value => `${value < 0 ? '−' : ''}$${fmt(Math.abs(value), Math.abs(value) >= 1000 ? 0 : 1)}<small>bn</small>`;
const ratio = value => `${fmt(value * 100)}%`;
const dateLabel = value => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`));

function niceDomain(values, includeZero = true) {
  let min = Math.min(...values, ...(includeZero ? [0] : []));
  let max = Math.max(...values, ...(includeZero ? [0] : []));
  const span = max - min || Math.max(Math.abs(max), 1);
  const rawStep = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / magnitude;
  const step = ([1, 2, 2.5, 5, 10].find(candidate => candidate >= fraction) ?? 10) * magnitude;
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  if (max === min) max += step;
  const ticks = [];
  for (let i = 0; i <= Math.round((max - min) / step); i++) ticks.push(min + i * step);
  return { min, max, ticks, step };
}

function sameResult(actual, expected) {
  // Compare the complete contract, including every annual row and diagnostic.
  if (typeof expected === 'number') return typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected));
  if (expected === null || typeof expected !== 'object') return actual === expected;
  if (!actual || typeof actual !== 'object' || Array.isArray(actual) !== Array.isArray(expected)) return false;
  const keys = Object.keys(expected);
  return keys.length === Object.keys(actual).length && keys.every(key => Object.prototype.hasOwnProperty.call(actual, key) && sameResult(actual[key], expected[key]));
}

function rangeFill(input) {
  const position = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
  input.style.setProperty('--range-fill', `${position * 100}%`);
}

/**
 * The story owns a paired preset comparison and reversible shocks.
 * Opening a company sends its exact current assumptions to the full workbench.
 */
export function initExperience({ presets, research, onOpenModel }) {
  const theater = $('#comparison-theater');
  if (!theater || theater.dataset.experienceReady === 'true') return;
  const state = {
    scenario: 'Base', chapter: 'revenue', year: 2036, shocks: { ...ZERO_SHOCKS },
    pair: null, comparison: null, stress: null, revision: 0,
    apiController: null, apiPending: false,
  };

  function setPair() {
    state.pair = Object.fromEntries(COMPANIES.map(company => [company, { ...presets[company][state.scenario] }]));
    state.comparison = comparePair(state.pair);
  }

  function invalidateVerification() {
    state.revision++;
    state.apiController?.abort();
    state.apiController = null;
    state.apiPending = false;
    $('#exp-server-status').className = '';
    $('#exp-server-status').textContent = 'Calculated in your browser';
  }

  function renderLineChart(animate) {
    const chart = $('#exp-chart');
    const width = Math.max(240, chart.clientWidth);
    const narrow = width < 490;
    const height = narrow ? 253 : 282;
    const plot = { left: narrow ? 34 : 46, right: width - (narrow ? 59 : 80), top: 24, bottom: height - 33 };
    const metric = state.chapter;
    const allValues = COMPANIES.flatMap(company => state.comparison.companies[company].result.rows.map(row => row[metric]));
    const domain = niceDomain(allValues);
    const x = year => plot.left + (year - 2027) / 9 * (plot.right - plot.left);
    const y = value => plot.bottom - (value - domain.min) / (domain.max - domain.min) * (plot.bottom - plot.top);
    const zero = y(0);
    const selectedX = x(state.year);
    const lastValues = COMPANIES.map(company => state.comparison.companies[company].result.rows.at(-1)[metric]);
    const labelYs = lastValues.map(value => y(value));
    if (Math.abs(labelYs[0] - labelYs[1]) < 22) {
      const middle = (labelYs[0] + labelYs[1]) / 2;
      const firstAbove = labelYs[0] <= labelYs[1];
      labelYs[0] = middle + (firstAbove ? -11 : 11);
      labelYs[1] = middle + (firstAbove ? 11 : -11);
    }
    for (let i = 0; i < labelYs.length; i++) labelYs[i] = Math.max(14, Math.min(height - 32, labelYs[i]));
    const unit = metric === 'revenue' ? 'annual revenue' : 'annual free cash flow to the firm';
    const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="exp-plot-title exp-plot-desc" data-exp-chart-metric="${metric}" class="${animate ? 'chart-reveal' : ''}">
      <title id="exp-plot-title">${escapeHtml(state.scenario)} case ${unit}, 2027–2036</title>
      <desc id="exp-plot-desc">Both companies are modeled forecasts on one USD billions scale. Anthropic is a solid orange line with circle marks. OpenAI is a dashed mint line with diamond marks. Selected year ${state.year}: ${COMPANIES.map(company => `${company} ${money(state.comparison.companies[company].result.rows[state.year - 2027][metric])}`).join('; ')}. The table below contains all plotted values.</desc>
      <defs>${COMPANIES.map(company => `<linearGradient id="exp-area-${company}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${COLORS[company]}" stop-opacity=".09"/><stop offset="100%" stop-color="${COLORS[company]}" stop-opacity="0"/></linearGradient>`).join('')}</defs>
      ${metric === 'fcf' && domain.min < 0 ? `<rect x="${plot.left}" y="${zero}" width="${plot.right - plot.left}" height="${plot.bottom - zero}" fill="#a9715a" opacity=".035"/>` : ''}
      ${domain.ticks.map(tick => `<g><line class="plot-grid-line${Math.abs(tick) < 1e-9 ? ' is-zero' : ''}" x1="${plot.left}" x2="${plot.right + 1}" y1="${y(tick)}" y2="${y(tick)}"${Math.abs(tick) < 1e-9 ? ' data-exp-zero-line="true"' : ''}/><text class="plot-axis-label" x="${plot.left - 10}" y="${y(tick) + 3}" text-anchor="end">${fmt(tick, domain.step < 1 ? 1 : 0)}</text></g>`).join('')}
      <line class="plot-selector" x1="${selectedX}" x2="${selectedX}" y1="${plot.top}" y2="${plot.bottom}"/>
      ${COMPANIES.map((company, index) => {
        const rows = state.comparison.companies[company].result.rows;
        const path = rows.map((row, i) => `${i ? 'L' : 'M'}${x(row.year).toFixed(2)},${y(row[metric]).toFixed(2)}`).join(' ');
        const selected = rows[state.year - 2027];
        const selectedY = y(selected[metric]);
        const directY = labelYs[index];
        return `${metric === 'revenue' ? `<path d="${path} L${plot.right},${zero} L${plot.left},${zero} Z" fill="url(#exp-area-${company})"/>` : ''}<path class="plot-line plot-line-${company.toLowerCase()}" d="${path}" data-exp-line="${company}"/>
          ${rows.map(row => `<circle cx="${x(row.year)}" cy="${y(row[metric])}" r="1.9" fill="${COLORS[company]}" opacity=".72"><title>${company}, ${row.year}: ${money(row[metric])}</title></circle>`).join('')}
          ${company === 'Anthropic' ? `<circle class="plot-dot" cx="${selectedX}" cy="${selectedY}" r="5.5" fill="${COLORS[company]}" data-exp-point="${company}" data-exp-value="${selected[metric]}"><title>${company}, ${state.year}: ${money(selected[metric])}</title></circle>` : `<rect class="plot-dot" x="${selectedX - 4.7}" y="${selectedY - 4.7}" width="9.4" height="9.4" transform="rotate(45 ${selectedX} ${selectedY})" fill="${COLORS[company]}" data-exp-point="${company}" data-exp-value="${selected[metric]}"><title>${company}, ${state.year}: ${money(selected[metric])}</title></rect>`}
          <line x1="${plot.right + 4}" x2="${plot.right + 9}" y1="${y(rows.at(-1)[metric])}" y2="${directY}" stroke="${COLORS[company]}" stroke-width="1" opacity=".7"/><text class="plot-direct-label" x="${plot.right + 13}" y="${directY + 3}" fill="${COLORS[company]}"${narrow ? ' style="font-size:9px"' : ''}>${company}</text>`;
      }).join('')}
      ${[2027, 2030, 2033, 2036].filter(year => year !== state.year).map(year => `<text class="plot-axis-label" text-anchor="middle" x="${x(year)}" y="${height - 10}"${narrow ? ' style="font-size:8px"' : ''}>${year}</text>`).join('')}
      <rect x="${selectedX - 18}" y="${height - 23}" width="36" height="20" fill="#304257" rx="2"/><text class="plot-axis-label is-emphasis" text-anchor="middle" x="${selectedX}" y="${height - 9}"${narrow ? ' style="font-size:9px"' : ''}>${state.year}</text>
    </svg>`;
    chart.innerHTML = svg;
    chart.setAttribute('aria-label', `Paired ${unit} forecast, ${state.scenario} cases`);
  }

  function renderComposition(animate) {
    const chart = $('#exp-chart');
    const width = Math.max(240, chart.clientWidth);
    const narrow = width < 490;
    const height = narrow ? 320 : 282;
    const parts = [{ key: 'stub', label: 'Remaining 2026' }, { key: 'explicitForecast', label: '2027–2036' }, { key: 'terminal', label: 'After 2036' }];
    const allValues = COMPANIES.flatMap(company => parts.map(part => state.comparison.companies[company].valueComposition[part.key]));
    const domain = niceDomain(allValues);
    // Each contribution uses the same dollars scale. Values are never normalized to 100%.
    const left = narrow ? 91 : 109;
    const right = width - (narrow ? 37 : 60);
    const bottom = height - 30;
    const x = value => left + (value - domain.min) / (domain.max - domain.min) * (right - left);
    const zero = x(0);
    const groupGap = narrow ? 137 : 119;
    const barHeight = narrow ? 15 : 14;
    chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="exp-plot-title exp-plot-desc" data-exp-chart-metric="value" class="${animate ? 'chart-reveal' : ''}"><title id="exp-plot-title">Discounted value composition, ${escapeHtml(state.scenario)} cases</title><desc id="exp-plot-desc">Three discounted cash-flow contributions are shown for each company on one USD billions scale. Negative contributions extend left of zero. The table gives each component and total enterprise value.</desc>
      ${domain.ticks.map(tick => `<line class="plot-grid-line${Math.abs(tick) < 1e-9 ? ' is-zero' : ''}" x1="${x(tick)}" x2="${x(tick)}" y1="20" y2="${bottom}"${Math.abs(tick) < 1e-9 ? ' data-exp-zero-line="true"' : ''}/><text class="plot-axis-label" x="${x(tick)}" y="${height - 10}" text-anchor="middle"${narrow ? ' style="font-size:8px"' : ''}>${fmt(tick, domain.step < 1 ? 1 : 0)}</text>`).join('')}
      ${COMPANIES.map((company, companyIndex) => {
        const groupTop = 21 + groupGap * companyIndex;
        const values = state.comparison.companies[company].valueComposition;
        return `<text class="composition-company" x="0" y="${groupTop}" fill="${COLORS[company]}" style="fill:${COLORS[company]}">${company}</text>${parts.map((part, partIndex) => {
          const value = values[part.key];
          const rowY = groupTop + 21 + partIndex * (narrow ? 30 : 26);
          const end = x(value);
          // A signed bar always begins at the zero axis. No floor is imposed.
          const barX = Math.min(zero, end);
          const barWidth = Math.abs(end - zero);
          const valueX = value < 0 ? zero + 5 : end + 5;
          const valueY = rowY + barHeight / 2 + 3;
          return `<text class="composition-label" x="0" y="${rowY + barHeight / 2 + 3}"${narrow ? ' style="font-size:8px"' : ''}>${part.label}</text><rect x="${barX}" y="${rowY}" width="${barWidth}" height="${barHeight}" fill="${COLORS[company]}" opacity="${part.key === 'terminal' ? '.88' : '.55'}" data-exp-component="${company}:${part.key}" data-exp-value="${value}"><title>${company}, ${part.label}: ${money(value)}</title></rect><text class="composition-value" x="${valueX}" y="${valueY}"${narrow ? ' style="font-size:8px"' : ''}>${fmt(value, 1)}</text>`;
        }).join('')}`;
      }).join('')}</svg>`;
    chart.setAttribute('aria-label', `Discounted enterprise value composition, ${state.scenario} cases`);
  }

  function renderReadout() {
    const isValue = state.chapter === 'value';
    const isFcf = state.chapter === 'fcf';
    let insight = '';
    if (isValue) {
      const shares = COMPANIES.map(company => state.comparison.companies[company].result.tv_share);
      if (shares.some(share => share === null)) insight = 'A nonpositive enterprise value has no meaningful terminal-value percentage. <strong>Inspect the dollar contributions.</strong>';
      else if (shares.some(share => share > 1)) insight = 'Terminal value can exceed <strong>100% of EV</strong> when earlier discounted cash flows make a negative contribution.';
      else insight = 'The further out the value sits, the more the result depends on <strong>lasting margins, reinvestment and the discount rate.</strong>';
    } else if (isFcf) {
      insight = 'Positive annual cash flow is a milestone. <strong>Recovering the cumulative cash deficit is a separate question.</strong>';
    } else {
      const values = COMPANIES.map(company => state.comparison.companies[company].result.rows[state.year - 2027].revenue);
      const leader = values[0] >= values[1] ? 0 : 1;
      const gap = Math.abs(values[0] - values[1]);
      insight = `In ${state.year}, ${COMPANIES[leader]} leads modeled revenue by <strong>${money(gap)}</strong>. The next chapter asks what converts to cash.`;
    }
    $('#exp-readout').innerHTML = `<div class="readout-kicker"><strong>${isValue ? 'TERMINAL' : state.year}</strong><span>${isValue ? 'Share of EV' : isFcf ? 'Annual FCFF' : 'Revenue'}</span></div>${COMPANIES.map(company => {
      const data = state.comparison.companies[company];
      const row = data.result.rows[state.year - 2027];
      const main = isValue ? data.result.tv_share === null ? '—' : ratio(data.result.tv_share) : moneyHtml(row[state.chapter]);
      let detail;
      if (isValue) detail = data.result.tv_share === null ? `Nonpositive EV: <strong>${money(data.result.ev)}</strong>` : `Enterprise value <strong>${money(data.result.ev)}</strong>`;
      else if (isFcf) detail = data.firstPositiveFcfYear ? `First positive annual FCFF: <strong>${data.firstPositiveFcfYear}</strong>` : '<strong>No positive annual FCFF</strong> through 2036';
      else detail = `2026–2036 revenue CAGR: <strong>${ratio(data.result.cagr)}</strong>`;
      return `<div class="readout-company${company === 'OpenAI' ? ' is-openai' : ''}"><span class="readout-company-name">${company}</span><strong class="readout-value" data-exp-readout="${company}"${isValue ? ` data-exp-share="${data.result.tv_share === null ? '' : data.result.tv_share}"` : ` data-exp-value="${row[state.chapter]}"`}>${main}</strong><p class="readout-detail">${detail}</p></div>`;
    }).join('')}<p class="readout-insight">${insight}</p>`;
  }

  function renderDataTable() {
    if (state.chapter === 'value') {
      const parts = [['stub', 'Remaining 2026'], ['explicitForecast', '2027–2036'], ['terminal', 'After 2036'], ['total', 'Enterprise value']];
      $('#exp-data-table').innerHTML = `<table><caption>${state.scenario} cases · Discounted contributions, USD billions</caption><thead><tr><th scope="col">Cash-flow period</th>${COMPANIES.map(company => `<th scope="col">${company}</th>`).join('')}</tr></thead><tbody>${parts.map(([key, label]) => `<tr><th scope="row">${label}</th>${COMPANIES.map(company => `<td>${fmt(state.comparison.companies[company].valueComposition[key], 3)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    } else {
      const label = state.chapter === 'revenue' ? 'Annual revenue' : 'Annual free cash flow to the firm';
      $('#exp-data-table').innerHTML = `<table><caption>${state.scenario} cases · ${label}, USD billions · All values are modeled forecasts</caption><thead><tr><th scope="col">Year</th>${COMPANIES.map(company => `<th scope="col">${company}</th>`).join('')}</tr></thead><tbody>${state.comparison.companies.Anthropic.result.rows.map((row, index) => `<tr><th scope="row">${row.year}</th>${COMPANIES.map(company => `<td>${fmt(state.comparison.companies[company].result.rows[index][state.chapter], 3)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
  }

  function renderStory(animate = false) {
    const meta = {
      revenue: { title: 'Growth is the beginning.', description: 'Follow both modeled revenue paths on the same scale.', units: 'Annual revenue · USD bn' },
      fcf: { title: 'Cash flow is the test.', description: 'Growth consumes capital before it can create value.', units: 'Annual free cash flow to the firm · USD bn' },
      value: { title: 'How much rests on the distant future?', description: 'Separate the cash flows in view from the value beyond 2036.', units: 'Discounted cash-flow contributions · USD bn' },
    }[state.chapter];
    $('#exp-story-title').textContent = meta.title;
    $('#exp-story-description').textContent = meta.description;
    $('#exp-chart-units').textContent = meta.units;
    $('#exp-story-panel').setAttribute('aria-labelledby', `exp-tab-${state.chapter}`);
    $$('[data-exp-chapter]').forEach(button => {
      const active = button.dataset.expChapter === state.chapter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    $$('[data-exp-scenario]').forEach(button => {
      const active = button.dataset.expScenario === state.scenario;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('#exp-year-controls').hidden = state.chapter === 'value';
    $('#exp-value-note').hidden = state.chapter !== 'value';
    $('#exp-year-output').textContent = state.year;
    $('#exp-year').value = state.year;
    $('#exp-year').setAttribute('aria-valuetext', `${state.year}; ${COMPANIES.map(company => `${company} ${money(state.comparison.companies[company].result.rows[state.year - 2027][state.chapter === 'fcf' ? 'fcf' : 'revenue'])}`).join('; ')}`);
    rangeFill($('#exp-year'));
    if (state.chapter === 'value') renderComposition(animate);
    else renderLineChart(animate);
    renderReadout();
    renderDataTable();
    $('#exp-story-context').innerHTML = `Illustrative ${state.scenario.toLowerCase()} cases · Valuation date ${escapeHtml(dateLabel(research.asOf || VALUATION_DATE))} · <a href="./report.html#section-2">Assumptions & evidence ↗</a>`;
  }

  function renderShockLabels() {
    $$('[data-exp-shock]').forEach(input => {
      const value = Number(input.value);
      const isPercent = input.dataset.expShock === 'capitalEfficiencyPct';
      const signed = `${value > 0 ? '+' : ''}${fmt(value, value % 1 === 0 ? 0 : 1)}`;
      $(`#${input.id}-output`).textContent = `${signed}${isPercent ? '%' : ' pp'}`;
      input.setAttribute('aria-valuetext', `${value > 0 ? 'plus ' : value < 0 ? 'minus ' : ''}${Math.abs(value)} ${isPercent ? 'percent' : 'percentage points'} relative to ${state.scenario} case`);
      rangeFill(input);
    });
    $('#exp-stress-case').textContent = `Relative to the ${state.scenario} cases`;
    $('#exp-reset-stress').disabled = Object.values(state.shocks).every(value => value === 0);
  }

  function renderStress() {
    renderShockLabels();
    const results = $('#exp-stress-results');
    try {
      state.stress = stressPair(state.pair, state.shocks);
      $('#exp-stress-error').hidden = true;
      results.classList.remove('is-invalid');
      results.innerHTML = COMPANIES.map(company => {
        const baseline = state.stress.baseline.companies[company].result;
        const stressed = state.stress.stressed.companies[company].result;
        const { evDelta, evChangeRatio } = state.stress.changes[company];
        const changed = Math.abs(evDelta) > 1e-9;
        const direction = evDelta > 0 ? ' is-positive' : evDelta < 0 ? ' is-negative' : '';
        const deltaText = changed ? `${evDelta > 0 ? '+' : '−'}$${fmt(Math.abs(evDelta))}bn${evChangeRatio === null ? '' : ` (${evChangeRatio > 0 ? '+' : ''}${ratio(evChangeRatio)})`}` : 'No change from baseline';
        return `<article class="stress-company${company === 'OpenAI' ? ' is-openai' : ''}"><h4 class="stress-company-name">${company}</h4><strong class="stress-ev" data-exp-stress-ev="${company}" data-exp-value="${stressed.ev}" title="${money(stressed.ev)}">${moneyHtml(stressed.ev)}</strong><span class="stress-delta${direction}" data-exp-delta="${company}">${deltaText}</span><p class="stress-baseline"><span>${state.scenario} baseline</span><strong>${money(baseline.ev)}</strong></p><button type="button" data-exp-open="${company}">Open this case in model <span aria-hidden="true">→</span></button></article>`;
      }).join('');
      $('#exp-stress-announcement').textContent = `${state.scenario} stressed enterprise values. ${COMPANIES.map(company => `${company}: ${money(state.stress.stressed.companies[company].result.ev)}`).join('. ')}.`;
    } catch (error) {
      state.stress = null;
      results.classList.add('is-invalid');
      results.innerHTML = '';
      const errorBox = $('#exp-stress-error');
      errorBox.textContent = `These changes do not produce a valid scenario. ${error.message} Adjust the controls or reset the changes. No result is carried over from the previous case.`;
      errorBox.hidden = false;
      $('#exp-stress-announcement').textContent = 'The current stress scenario is invalid. Adjust the controls or reset the changes.';
    }
    $('#exp-verify-stress').disabled = !state.stress || state.apiPending;
  }

  async function verifyStress() {
    if (!state.stress || state.apiPending) return;
    const revision = state.revision;
    const expected = state.stress;
    const controller = new AbortController();
    state.apiController = controller;
    state.apiPending = true;
    const status = $('#exp-server-status');
    status.className = '';
    status.textContent = 'Checking both current cases…';
    $('#exp-verify-stress').disabled = true;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    try {
      const response = await fetch(new URL('api/valuation', document.baseURI), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action: 'stress', assumptionsByCompany: state.pair, shocks: { ...state.shocks } }),
        signal: controller.signal,
      });
      if (revision !== state.revision || controller.signal.aborted) return;
      if (!response.ok) {
        status.className = response.status === 400 ? 'error' : 'warning';
        status.textContent = response.status === 400 ? 'Server rejected this scenario. Review the inputs.' : 'Server check unavailable. Browser calculations remain available.';
        return;
      }
      const body = await response.json();
      if (revision !== state.revision || controller.signal.aborted) return;
      if (body.modelVersion !== MODEL_VERSION || body.valuationDate !== VALUATION_DATE || !sameResult(body.result, expected)) {
        status.className = 'error';
        status.textContent = 'Server output differs. This scenario has not been verified.';
        return;
      }
      status.className = 'success';
      status.textContent = 'Both cases verified · All cash flows and values match';
    } catch (error) {
      if (revision !== state.revision || (controller.signal.aborted && !timedOut)) return;
      status.className = 'warning';
      status.textContent = timedOut ? 'Server check timed out. Browser calculations remain available.' : 'Server check unavailable. Browser calculations remain available.';
    } finally {
      clearTimeout(timeout);
      if (revision === state.revision) {
        state.apiPending = false;
        state.apiController = null;
        $('#exp-verify-stress').disabled = !state.stress;
      }
    }
  }

  try {
    setPair();
    renderStory();
    renderStress();
    $$('[data-exp-chapter], [data-exp-scenario], [data-exp-shock], #exp-year').forEach(element => { element.disabled = false; });
    $$('[data-exp-scenario]').forEach(button => button.addEventListener('click', () => {
      if (state.scenario === button.dataset.expScenario) return;
      invalidateVerification();
      state.scenario = button.dataset.expScenario;
      setPair();
      renderStory(true);
      renderStress();
    }));
    function selectChapter(chapter, focus = false) {
      if (!CHAPTERS.includes(chapter)) return;
      state.chapter = chapter;
      renderStory(true);
      if (focus) $(`#exp-tab-${chapter}`).focus();
    }
    $$('[data-exp-chapter]').forEach(button => {
      button.addEventListener('click', () => selectChapter(button.dataset.expChapter));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = CHAPTERS.indexOf(state.chapter);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? CHAPTERS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + CHAPTERS.length) % CHAPTERS.length;
        selectChapter(CHAPTERS[next], true);
      });
    });
    $('#exp-year').addEventListener('input', event => {
      state.year = Number(event.currentTarget.value);
      renderStory();
    });
    $$('[data-exp-shock]').forEach(input => input.addEventListener('input', () => {
      invalidateVerification();
      state.shocks[input.dataset.expShock] = Number(input.value);
      renderStress();
    }));
    $('#exp-reset-stress').addEventListener('click', () => {
      invalidateVerification();
      state.shocks = { ...ZERO_SHOCKS };
      $$('[data-exp-shock]').forEach(input => { input.value = '0'; });
      renderStress();
    });
    $('#exp-stress-results').addEventListener('click', event => {
      const button = event.target.closest('[data-exp-open]');
      if (!button || !state.stress || !COMPANIES.includes(button.dataset.expOpen)) return;
      const company = button.dataset.expOpen;
      onOpenModel?.({ company, scenario: state.scenario, assumptions: { ...state.stress.stressed.companies[company].assumptions } });
    });
    $('#exp-verify-stress').addEventListener('click', verifyStress);
    $$('.research-theater a[href="#workspace"], .skip-link[href="#workspace"]').forEach(link => link.addEventListener('click', event => {
      event.preventDefault();
      $('#tab-model').click();
      const workspace = $('#workspace');
      workspace.focus({ preventScroll: true });
      workspace.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }));
    let previousWidth = $('#exp-chart').clientWidth;
    let frame = null;
    const resize = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (Math.abs(width - previousWidth) < 1) return;
      previousWidth = width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => state.chapter === 'value' ? renderComposition(false) : renderLineChart(false));
    });
    resize.observe($('#exp-chart'));
    theater.dataset.experienceReady = 'true';
    theater.setAttribute('aria-busy', 'false');
  } catch (error) {
    theater.setAttribute('aria-busy', 'false');
    $('#experience-error').textContent = 'The comparison experience could not load. The complete valuation model, research report and workbook remain available below.';
    $('#experience-error').hidden = false;
  }
}
