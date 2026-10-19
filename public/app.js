import {
  MODEL_VERSION, VALUATION_DATE, project, validate, reverseGrowth,
  sensitivity, bridgeEquity,
} from './lib/model.js';
import {APP_VERSION} from './lib/release.js';
import {decodeScenario,scenarioUrl} from './lib/share.js';
import {createBriefing} from './lib/briefing.js';
import {initExperience} from './experience.js';
import {decodeInspection,returnFromInspection} from './lib/journey.js';
import {thesisUrl} from './lib/thesis-share.js';
import {createScenarioEntry,decodeEntry,summarizeEntry} from './lib/casebook.js';
import {createCasebookStore} from './lib/casebook-store.js';
import {createEvidenceContext} from './evidence-context.js';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const companies = ['Anthropic', 'OpenAI'];
const cases = ['Bear', 'Base', 'Bull'];
const numberFormatters = new Map();
// Loaded links and presets retain their exact IEEE-754 inputs until a field is edited.
const loadedInputValues = new Map();
const fields = [
  { key: 'rev2026', label: '2026 model revenue', unit: 'bn', group: 'Revenue & growth', help: 'Illustrative full-year 2026 revenue, in USD billions. This is not a reported full-year actual.' },
  { key: 'g1', label: '2027–2030 growth', unit: '%', group: 'Revenue & growth', help: 'Annual revenue growth for each year from 2027 through 2030.' },
  { key: 'g2', label: '2031–2033 growth', unit: '%', group: 'Revenue & growth', help: 'Annual revenue growth for each year from 2031 through 2033.' },
  { key: 'g3', label: '2034–2036 growth', unit: '%', group: 'Revenue & growth', help: 'Annual revenue growth for each year from 2034 through 2036; it must be at least perpetual growth.' },
  { key: 'm27', label: '2027 EBIT margin', unit: '%', group: 'Operating economics', help: 'EBIT as a share of revenue in 2027. Margins interpolate to the 2030 and 2036 assumptions.' },
  { key: 'm30', label: '2030 EBIT margin', unit: '%', group: 'Operating economics', help: 'EBIT as a share of revenue in 2030.' },
  { key: 'm36', label: '2036 EBIT margin', unit: '%', group: 'Operating economics', help: 'EBIT as a share of revenue in 2036 and the terminal period. This must be positive.' },
  { key: 'tax', label: 'Tax on positive EBIT', unit: '%', group: 'Operating economics', help: 'Tax rate applied to positive EBIT. No tax benefit or NOL offset is modeled for losses.' },
  { key: 'turns', label: 'Sales / invested capital', unit: '×', group: 'Capital & valuation', help: 'Incremental revenue divided by net reinvestment. Higher turns mean less capital required for the same revenue growth.' },
  { key: 'wacc', label: 'Cost of capital', unit: '%', group: 'Capital & valuation', help: 'Weighted average cost of capital, used to discount free cash flow to the firm.' },
  { key: 'tg', label: 'Perpetual growth', unit: '%', group: 'Capital & valuation', help: 'Long-term revenue and cash-flow growth after 2036. Must be lower than WACC and terminal ROIC.' },
  { key: 'roic', label: 'Terminal ROIC', unit: '%', group: 'Capital & valuation', help: 'Terminal return on invested capital. Terminal reinvestment equals NOPAT multiplied by perpetual growth divided by this return.' },
  { key: 'stub', label: 'Remaining-2026 FCFF', unit: 'bn', group: 'Capital & valuation', wide: true, help: 'Free cash flow to the firm from the valuation date through 31 December 2026. A cash outflow is negative.' },
];
const groupHints = {
  'Revenue & growth': 'Future revenue is illustrative. Growth inputs are annual rates.',
  'Operating economics': 'Margins interpolate between the three anchors. No NOL offset.',
  'Capital & valuation': 'Net reinvestment includes net capex and working capital. Do not add them again.',
};
const state = {
  presets: null, research: null, company: 'Anthropic', scenario: 'Base',
  assumptions: null, result: null, custom: false, savedName: '',
  metric: 'revenue', revision: 0, ready: false, saved: [],
  apiPending: false, apiController: null, apiEverRequested: false,
  apiUnavailable: false, reverseSolved: false, shareRevision: 0,
  inspection: null, casebook: null, saving: false, evidenceContext: null,
};

function number(value, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1e7) return value.toExponential(2).replace('-', '−');
  if (!numberFormatters.has(digits)) numberFormatters.set(digits, new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  return numberFormatters.get(digits).format(Object.is(value, -0) ? 0 : value).replace('-', '−');
}

function money(value, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value < 0 ? '−' : ''}$${number(Math.abs(value), digits)}bn`;
}

function moneyHtml(value, digits = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value < 0 ? '−' : ''}$${number(Math.abs(value), digits)}<small>bn</small>`;
}

function percent(value, digits = 1, signed = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${signed && value > 0 ? '+' : ''}${number(value * 100, digits)}%`;
}

function displayDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?$/.test(value)) return String(value ?? 'Date not specified');
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function sourceLink(sourceId, label = 'Source') {
  const source = state.research?.sources.find(item => item.id === sourceId);
  if (!source) return '';
  return `<a class="source-link" href="#source-${escapeHtml(source.id)}" data-source="${escapeHtml(source.id)}">${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`;
}

function readNumber(input) {
  const raw = input.value.trim();
  // Blank fields, incomplete exponents and non-finite values never become zero.
  if (raw === '' || input.validity.badInput) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function fingerprint(assumptions) {
  return JSON.stringify(fields.map(field => assumptions?.[field.key]));
}

function createFields() {
  const groups = [...new Set(fields.map(field => field.group))];
  $('#assumption-fields').innerHTML = groups.map(group => `<fieldset class="assumption-group"><legend>${escapeHtml(group)}</legend><div class="assumption-field-grid">${fields.filter(field => field.group === group).map(field => `<div class="assumption-field${field.wide ? ' is-wide' : ''}"><label for="input-${field.key}">${escapeHtml(field.label)}</label><button type="button" class="evidence-context-trigger" data-evidence-key="${field.key}" aria-label="Evidence for ${escapeHtml(field.label)}" aria-haspopup="dialog" disabled>Evidence <span aria-hidden="true">↗</span></button><div class="input-wrap"><input id="input-${field.key}" name="${field.key}" type="number" step="any" inputmode="decimal" data-key="${field.key}" aria-describedby="help-${field.key}" disabled><span class="input-unit" aria-hidden="true">${field.unit}</span></div><span id="help-${field.key}" class="sr-only">${escapeHtml(field.help)} Input unit: ${field.unit === '%' ? 'percent, enter 12.5 for 12.5 percent' : field.unit === 'bn' ? 'USD billions' : 'times'}.</span></div>`).join('')}</div><p class="group-hint">${escapeHtml(groupHints[group])}</p></fieldset>`).join('');
}

function updateButtons() {
  const valid = Boolean(state.result && state.assumptions);
  for (const id of ['export-json', 'export-csv']) $(`#${id}`).disabled = !valid;
  for (const id of ['share-scenario','export-briefing','open-thesis','open-horizon','return-comparison','save-scenario']) if ($(`#${id}`)) $(`#${id}`).disabled = !valid || ($('#bridge-enabled').checked && !validBridgeInputs()) || (id==='save-scenario'&&(!state.casebook||state.saving));
  if ($('#bridge-enabled').checked && !validBridgeInputs()) $('#export-json').disabled = true;
  $('#verify-server').disabled = !valid || state.apiPending;
  const target = readNumber($('#reverse-target'));
  $('#solve-reverse').disabled = !valid || target === null || target <= 0 || target > 1e12;
  $('#reset-scenario').disabled = !state.ready;
  $('#load-scenario').disabled = !$('#saved-scenarios').value;
}

function updateSelectionLabels() {
  $$('[data-company]').filter(element => element.tagName === 'BUTTON').forEach(button => {
    const selected = button.dataset.company === state.company;
    if (button.closest('.company-switch')) {
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  });
  $$('[data-scenario]').forEach(button => {
    const selected = button.dataset.scenario === state.scenario;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const suffix = state.custom ? ' · edited' : '';
  $('#case-label').textContent = state.savedName ? `Saved: ${state.savedName}` : `${state.scenario}${suffix}`;
  $('#case-label').title = state.savedName ? `Saved scenario: ${state.savedName}` : `${state.scenario} case${suffix}`;
  $('#active-model-label').textContent = `${state.company} / ${state.scenario}${suffix}`;
  $('#model-workspace').dataset.company = state.company;
}

function setApiStatus(message, type = '') {
  const element = $('#api-status');
  element.className = `api-status ${type}`.trim();
  element.innerHTML = `<span class="status-dot" aria-hidden="true"></span><span>${escapeHtml(message)}</span>`;
}

function invalidateVerification() {
  if (state.apiController) state.apiController.abort();
  state.apiController = null;
  state.apiPending = false;
  $('#verify-server').innerHTML = 'Verify on server <span aria-hidden="true">↗</span>';
  if (state.apiUnavailable) setApiStatus('Calculated in browser · Server verification unavailable on this host', 'warning');
  else if (state.apiEverRequested) setApiStatus('Assumptions changed · Verify the current scenario again');
  else setApiStatus('Calculated in your browser · Server check available');
}

function setReversePrompt(message) {
  state.reverseSolved = false;
  $('#reverse-output').className = 'reverse-output';
  $('#reverse-output').innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function showInvalid(message, invalidKeys = []) {
  state.assumptions = null;
  state.result = null;
  const error = $('#input-errors');
  error.hidden = false;
  error.textContent = message;
  invalidKeys.forEach(key => $(`#input-${key}`)?.setAttribute('aria-invalid', 'true'));
  const placeholder = '<div class="result-placeholder">Complete the highlighted assumptions to calculate this scenario. Results and exports are paused.</div>';
  for (const id of ['valuation-summary', 'forecast-chart', 'sensitivity-table']) $(`#${id}`).innerHTML = placeholder;
  $('#forecast-table').innerHTML = '<p class="small-note">No current forecast. Correct the assumptions to recalculate.</p>';
  $('#chart-topline').replaceChildren();
  $('#chart-note').textContent = 'Forecast paused while the inputs are incomplete or invalid.';
  $('#model-warnings').hidden = true;
  $('#model-warnings').replaceChildren();
  setApiStatus('Calculation paused · Enter valid assumptions', 'error');
  setReversePrompt('Correct the valuation assumptions before solving a growth path.');
  renderBridge();
  updateButtons();
}

function relatedInvalidKeys(message, p) {
  if (message.includes('2026 revenue')) return ['rev2026'];
  if (message.includes('Sales / invested')) return ['turns'];
  if (message.includes('terminal growth < WACC')) return ['tg', 'wacc'];
  if (message.includes('Terminal ROIC')) return ['tg', 'roic'];
  if (message.includes('Tax')) return ['tax'];
  if (message.includes('Forecast growth')) return ['g1', 'g2', 'g3'].filter(key => p[key] < 0 || p[key] > 2);
  if (message.includes('Margins')) return ['m27', 'm30', 'm36'].filter(key => p[key] < -1 || p[key] > 1 || (key === 'm36' && p[key] <= 0));
  if (message.includes('2034–2036')) return ['g3', 'tg'];
  if (message.includes('Remaining-2026')) return ['stub'];
  return [];
}

function recalculate() {
  if (!state.ready) return;
  state.revision += 1;
  invalidateVerification();
  const assumptions = {};
  const invalid = [];
  for (const field of fields) {
    const input = $(`#input-${field.key}`);
    input.removeAttribute('aria-invalid');
    const value = readNumber(input);
    if (value === null) invalid.push(field);
    else {
      const loaded = loadedInputValues.get(field.key);
      assumptions[field.key] = loaded && input.value === loaded.display ? loaded.value : field.unit === '%' ? value / 100 : value;
    }
  }
  state.custom = invalid.length > 0 || fingerprint(assumptions) !== fingerprint(state.presets[state.company][state.scenario]);
  updateSelectionLabels();
  if (invalid.length) {
    showInvalid(`Enter a finite number for ${invalid.map(field => field.label.toLowerCase()).join(', ')}.`, invalid.map(field => field.key));
    return;
  }
  try {
    validate(assumptions);
    const result = project(assumptions);
    state.assumptions = assumptions;
    state.result = result;
    $('#input-errors').hidden = true;
    $('#input-errors').textContent = '';
    renderValuation();
    renderForecast();
    renderSensitivity();
    setReversePrompt(readNumber($('#reverse-target')) === null ? 'Enter an enterprise value to explore a required growth path.' : 'Current assumptions are ready. Solve again to update the required growth path.');
    renderBridge();
  } catch (error) {
    showInvalid(error.message || 'These assumptions could not be calculated.', relatedInvalidKeys(error.message ?? '', assumptions));
  }
  updateButtons();
}

function populateAssumptions(assumptions) {
  for (const field of fields) {
    const input = $(`#input-${field.key}`);
    const displayValue = field.unit === '%' ? assumptions[field.key] * 100 : assumptions[field.key];
    const short = Number(displayValue.toPrecision(14));
    // Prefer a clean percentage only when that display maps back to the exact input.
    input.value = String(field.unit === '%' && short / 100 === assumptions[field.key] ? short : displayValue);
    loadedInputValues.set(field.key,{display:input.value,value:assumptions[field.key]});
    input.disabled = false;
  }
}

function loadPreset(company = state.company, scenario = state.scenario) {
  if (!state.ready || !companies.includes(company) || !cases.includes(scenario)) return;
  clearSharedLocation();
  if(company!==state.company)state.inspection=null;
  state.company = company;
  state.scenario = scenario;
  state.savedName = '';
  populateAssumptions(state.presets[company][scenario]);
  recalculate();
  renderInspectionContext();
}

function renderComparisons() {
  $('#company-comparison').innerHTML = companies.map(company => {
    const entry = state.research.companies[company];
    const base = project(state.presets[company].Base);
    const bear = project(state.presets[company].Bear);
    const bull = project(state.presets[company].Bull);
    const financing = entry.financing;
    const source = state.research.sources.find(item => item.id === financing?.sourceId);
    const url = safeUrl(source?.url);
    const financingNumber = typeof financing?.value === 'number' ? `${moneyHtml(financing.value, 0)}` : 'Not established';
    const linkedFinancing = url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(company)} financing source: ${escapeHtml(source.title)} (opens in a new tab)">${financingNumber}</a>` : financingNumber;
    return `<article class="company-overview ${company.toLowerCase()}"><div class="company-heading"><h3><span class="company-dot ${company.toLowerCase()}" aria-hidden="true"></span>${escapeHtml(entry.name || company)}</h3><span class="private-tag">${escapeHtml(entry.tickerLabel || 'Private company')}</span></div><div class="company-values"><div><span class="company-ev">${moneyHtml(base.ev)}</span><span class="metric-label">Modeled base enterprise value</span></div><div><span class="financing-value">${linkedFinancing}</span><span class="metric-label">${escapeHtml(financing?.basis || 'Equity financing reference')}<br>${escapeHtml(financing?.label || 'Completed financing not established')}${financing?.date ? ` · ${escapeHtml(displayDate(financing.date))}` : ''}</span></div></div><div class="company-footer"><div class="case-range"><span>Bear EV <strong>${money(bear.ev, 0)}</strong></span><span>Bull EV <strong>${money(bull.ev, 0)}</strong></span><span>Base terminal share <strong>${base.tv_share === null ? 'N/M' : percent(base.tv_share, 1)}</strong></span></div><button type="button" class="text-button" data-company="${company}" data-open-model="true">Explore model <span aria-hidden="true">→</span></button></div></article>`;
  }).join('');
}

function renderValuation() {
  const r = state.result;
  const last = r.rows.at(-1);
  const terminalChange = r.terminal_fcf_change === null
    ? `${r.terminal_fcf - last.fcf > 0 ? '+' : ''}${money(r.terminal_fcf - last.fcf)}`
    : percent(r.terminal_fcf_change, 1, true);
  $('#valuation-summary').innerHTML = `<div><span class="ev-primary-label">Enterprise value</span><div class="ev-primary${r.ev < 0 ? ' negative' : ''}" data-result-ev="${r.ev}">${moneyHtml(r.ev)}</div><span class="ev-basis">USD billions · ${escapeHtml(displayDate(VALUATION_DATE))}</span></div><div class="valuation-metrics"><div class="valuation-metric"><span>Explicit FCFF, present value</span><strong>${moneyHtml(r.pv_explicit)}</strong></div><div class="valuation-metric"><span>Terminal value / enterprise value</span><strong title="${r.tv_share === null ? 'Not meaningful when enterprise value is zero or negative.' : 'Can exceed 100% when explicit cash flows have negative present value.'}">${r.tv_share === null ? 'N/M' : percent(r.tv_share)}</strong></div><div class="valuation-metric"><span>Peak cumulative FCFF deficit</span><strong>${moneyHtml(r.peak_funding_need)}</strong></div><div class="valuation-metric"><span>Terminal FCFF change from 2036</span><strong>${terminalChange}</strong></div></div>`;
  const warnings = [...r.warnings];
  warnings.push('The cumulative FCFF deficit excludes opening liquidity and intrayear financing needs.');
  $('#model-warnings').innerHTML = `<ul>${warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`;
  $('#model-warnings').hidden = false;
}

function chartScale(values) {
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const rawRange = high - low || 1;
  const rough = rawRange * 1.13 / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const ratio = rough / power;
  const step = (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 2.5 ? 2.5 : ratio <= 5 ? 5 : 10) * power;
  const minimum = Math.floor((low < 0 ? low * 1.12 : 0) / step) * step;
  const maximum = Math.ceil((high > 0 ? high * 1.10 : step) / step) * step;
  const ticks = [];
  for (let value = minimum; value <= maximum + step * .01 && ticks.length < 12; value += step) ticks.push(Math.abs(value) < step * 1e-8 ? 0 : value);
  return { minimum, maximum, ticks, step };
}

function renderForecast() {
  if (!state.result) return;
  const r = state.result;
  const p = state.assumptions;
  const last = r.rows.at(-1);
  $('#chart-topline').innerHTML = `<div><span>2036 revenue</span><strong>${money(last.revenue)}</strong></div><div><span>10-year revenue CAGR</span><strong>${percent(r.cagr)}</strong></div>`;
  $$('[data-metric]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.metric === state.metric);
    button.setAttribute('aria-pressed', String(button.dataset.metric === state.metric));
  });
  const isRevenue = state.metric === 'revenue';
  const data = isRevenue ? r.rows.map(row => ({ label: String(row.year), value: row.revenue })) : [{ label: '2026 R', value: p.stub }, ...r.rows.map(row => ({ label: String(row.year), value: row.fcf }))];
  const width = 760, height = 254;
  const left = 49, right = 52, top = 22, bottom = 31;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const scale = chartScale(data.map(item => item.value));
  const y = value => top + (scale.maximum - value) / (scale.maximum - scale.minimum) * plotHeight;
  const x = index => left + (isRevenue ? index / (data.length - 1) : (index + .5) / data.length) * plotWidth;
  const digits = scale.step < 1 ? Math.min(3, Math.ceil(-Math.log10(scale.step))) : 0;
  const grids = scale.ticks.map(value => `<line x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}" class="${value === 0 ? 'chart-zero-line' : 'chart-grid-line'}"/><text x="${left - 10}" y="${y(value) + 3.5}" text-anchor="end" class="chart-axis-text">${number(value, digits)}</text>`).join('');
  const xLabels = data.map((item, index) => `<text x="${x(index)}" y="${height - 9}" text-anchor="middle" class="chart-axis-text">${item.label}</text>`).join('');
  let marks;
  if (isRevenue) {
    const line = data.map((item, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${y(item.value).toFixed(2)}`).join(' ');
    const area = `${line} L ${x(data.length - 1).toFixed(2)} ${y(0).toFixed(2)} L ${x(0).toFixed(2)} ${y(0).toFixed(2)} Z`;
    marks = `<defs><linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity=".20"/><stop offset="100%" stop-color="var(--accent)" stop-opacity=".015"/></linearGradient></defs><path d="${area}" fill="url(#revenue-fill)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round"/>${data.map((item, index) => `<circle cx="${x(index)}" cy="${y(item.value)}" r="3.4" class="chart-point"><title>${item.label} revenue: ${money(item.value)}</title></circle>`).join('')}<text x="${x(data.length - 1)}" y="${y(last.revenue) - 13}" text-anchor="middle" class="chart-end-text">${number(last.revenue, 0)}</text>`;
  } else {
    const barWidth = plotWidth / data.length * .48;
    marks = data.map((item, index) => {
      const baseline = y(0), position = y(item.value);
      return `<rect x="${x(index) - barWidth / 2}" y="${Math.min(position, baseline)}" width="${barWidth}" height="${Math.max(.65, Math.abs(baseline - position))}" rx="1" fill="${item.value < 0 ? '#b8816b' : 'var(--accent)'}" opacity="${item.label === '2026 R' ? '.6' : '.9'}"><title>${item.label === '2026 R' ? 'Remaining 2026' : item.label} free cash flow: ${money(item.value)}</title></rect>`;
    }).join('');
  }
  const metricName = isRevenue ? 'Revenue' : 'Free cash flow to the firm';
  const description = data.map(item => `${item.label}: ${money(item.value)}`).join('; ');
  $('#forecast-chart').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-title chart-desc"><title id="chart-title">${escapeHtml(state.company)} ${escapeHtml(state.scenario)}${state.custom ? ' edited' : ''}: ${metricName}</title><desc id="chart-desc">Illustrative forecast in USD billions. ${escapeHtml(description)}. Exact figures are available in the annual forecast table and CSV.</desc>${grids}${marks}${xLabels}</svg>`;
  $('#chart-note').textContent = isRevenue ? 'Annual forecast · USD billions · 2027–2036. All plotted revenue is illustrative.' : 'FCFF · USD billions · 2026 R is the remaining-year stub. Negative cash flow is shown below zero.';
  renderForecastTable();
}

function renderForecastTable() {
  const r = state.result, p = state.assumptions;
  const cell = (value, digits = 1) => `<td${typeof value === 'number' && value < 0 ? ' class="negative"' : ''}>${number(value, digits)}</td>`;
  const row = item => `<tr><th scope="row">${item.year}</th>${cell(item.revenue)}<td>${percent(item.growth)}</td><td>${percent(item.margin)}</td>${cell(item.nopat)}${cell(item.reinvestment)}${cell(item.fcf)}${cell(item.df, 3)}${cell(item.pv)}</tr>`;
  $('#forecast-table').innerHTML = `<table class="forecast-table"><caption>USD billions, except percentages and discount factors. FCFF = NOPAT − net reinvestment.</caption><thead><tr><th scope="col">Year</th><th scope="col">Revenue</th><th scope="col">Growth</th><th scope="col">EBIT margin</th><th scope="col">NOPAT</th><th scope="col">Net reinvest.</th><th scope="col">FCFF</th><th scope="col">Discount</th><th scope="col">PV FCFF</th></tr></thead><tbody><tr class="stub-row"><th scope="row">2026 remaining</th><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>${cell(p.stub)}${cell((1 + p.wacc) ** -r.stub_t, 3)}${cell(r.pv_stub)}</tr>${r.rows.map(row).join('')}<tr class="terminal-row"><th scope="row">2037 terminal</th>${cell(r.terminal_revenue)}<td>${percent(p.tg)}</td><td>${percent(p.m36)}</td>${cell(r.terminal_nopat)}${cell(r.terminal_nopat * r.terminal_reinvestment_rate)}${cell(r.terminal_fcf)}<td>—</td><td>—</td></tr></tbody></table><p class="small-note">2037 is the terminal cash-flow basis. Its perpetuity is valued at year-end 2036 and discounted to the valuation date; it is not added as another explicit forecast row.</p><dl class="cashflow-reconciliation"><dt>PV remaining-2026 FCFF</dt><dd>${money(r.pv_stub)}</dd><dt>PV 2027–2036 FCFF</dt><dd>${money(r.pv_explicit - r.pv_stub)}</dd><dt>PV terminal value</dt><dd>${money(r.pvtv)}</dd><dt>Enterprise value</dt><dd>${money(r.ev)}</dd></dl>`;
}

function renderSensitivity() {
  const p = state.assumptions;
  const round = value => Number(value.toFixed(12));
  const rates = [-.02, -.01, 0, .01, .02].map(offset => round(p.wacc + offset));
  const growthRates = [-.01, -.005, 0, .005, .01].map(offset => round(p.tg + offset));
  const matrix = sensitivity(p, rates, growthRates);
  const validValues = matrix.values.flat().filter(value => typeof value === 'number' && Number.isFinite(value));
  const minimum = Math.min(...validValues), maximum = Math.max(...validValues);
  const cells = matrix.values.map((row, rowIndex) => `<tr><th scope="row">${percent(rates[rowIndex])}</th>${row.map((value, columnIndex) => {
    if (value === null) return '<td class="invalid-cell" aria-label="Invalid WACC and perpetual-growth combination">—</td>';
    const current = rowIndex === 2 && columnIndex === 2;
    const intensity = maximum === minimum ? .5 : (value - minimum) / (maximum - minimum);
    const lightness = 94 - intensity * 17;
    const label = `WACC ${percent(rates[rowIndex])}, perpetual growth ${percent(growthRates[columnIndex])}, enterprise value ${money(value)}${current ? ', current assumptions' : ''}`;
    return `<td class="${current ? 'current-cell' : ''}" style="background-color:hsl(91 18% ${lightness.toFixed(1)}%)" aria-label="${escapeHtml(label)}">${number(value, 0)}</td>`;
  }).join('')}</tr>`).join('');
  $('#sensitivity-table').innerHTML = `<table class="sensitivity-table"><caption class="sr-only">Enterprise value in USD billions. Rows vary WACC; columns vary perpetual growth.</caption><thead><tr><th scope="col">WACC ↓ / g →</th>${growthRates.map(value => `<th scope="col">${percent(value)}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table>`;
}

function renderBridge() {
  const enabled = $('#bridge-enabled').checked;
  for (const id of ['bridge-cash', 'bridge-debt', 'bridge-claims']) $(`#${id}`).disabled = !enabled;
  const output = $('#bridge-output');
  if (!enabled) { output.textContent = 'Enable the bridge to apply your assumptions.'; return null; }
  if (!state.result) { output.textContent = 'Correct the valuation assumptions before calculating equity.'; return null; }
  const bridge = { cash: readNumber($('#bridge-cash')), debt: readNumber($('#bridge-debt')), otherClaims: readNumber($('#bridge-claims')) };
  const controls = { cash: '#bridge-cash', debt: '#bridge-debt', otherClaims: '#bridge-claims' };
  let invalid = false;
  for (const [key, selector] of Object.entries(controls)) {
    const bad = bridge[key] === null || bridge[key] < 0 || bridge[key] > 10000;
    $(selector).setAttribute('aria-invalid', String(bad));
    invalid ||= bad;
  }
  if (invalid) { output.textContent = 'Enter each cash, debt and claims assumption between $0bn and $10,000bn. Blank values are not zero. Scenario JSON is paused until this bridge is valid.'; return null; }
  try {
    const result = bridgeEquity(state.result.ev, bridge);
    output.innerHTML = `<span>Hypothetical equity value<br><span class="small-note">Using only the adjustments entered above</span></span><strong>${moneyHtml(result.equityValue)}</strong>`;
    return result;
  } catch (error) { output.textContent = error.message; return null; }
}

function validBridgeInputs() {
  return ['bridge-cash', 'bridge-debt', 'bridge-claims'].every(id => {
    const value = readNumber($(`#${id}`));
    return value !== null && value >= 0 && value <= 10000;
  });
}

function solveReverse(event) {
  event.preventDefault();
  if (!state.result || !state.assumptions) return;
  const target = readNumber($('#reverse-target'));
  if (target === null || target <= 0 || target > 1e12) {
    $('#reverse-target').setAttribute('aria-invalid', 'true');
    setReversePrompt('Enter a positive, finite target enterprise value within the model’s supported range.');
    return;
  }
  $('#reverse-target').removeAttribute('aria-invalid');
  try {
    const result = reverseGrowth(state.assumptions, target);
    const output = $('#reverse-output');
    if (result.status === 'solved') {
      output.className = 'reverse-output';
      output.innerHTML = `<div class="reverse-results"><div><span>Required 2027–2030 growth</span><strong>${percent(result.growth)}</strong></div><div><span>Implied 2030 revenue</span><strong>${moneyHtml(result.revenue2030, 0)}</strong></div><div><span>Implied 2036 revenue</span><strong>${moneyHtml(result.revenue2036, 0)}</strong></div></div><p class="reverse-footnote">Reconciles to ${money(result.ev)} enterprise value. Every assumption except 2027–2030 growth remains fixed. Displayed growth is rounded; the solver uses full precision.</p>`;
      state.reverseSolved = true;
    } else if (result.status === 'multiple_solutions') {
      output.className = 'reverse-output error';
      output.innerHTML = `<p><strong>More than one growth path reaches this target.</strong> ${escapeHtml(result.reason)}</p><p class="reverse-footnote">Permitted solutions: ${(result.solutions || []).map(solution => `${percent(solution.growth, 2)} annual early growth (${money(solution.revenue2036)} revenue in 2036)`).join('; ')}. No unique required growth rate is claimed.</p>`;
      state.reverseSolved = true;
    } else {
      output.className = 'reverse-output error';
      output.innerHTML = `<p><strong>Target not reachable in the search range.</strong> ${escapeHtml(result.reason || 'No permitted solution was found.')}</p>`;
      state.reverseSolved = true;
    }
  } catch (error) {
    $('#reverse-output').className = 'reverse-output error';
    $('#reverse-output').textContent = error.message;
  }
}

function sameNumericResults(local, remote) {
  if (!remote || typeof remote !== 'object' || !Array.isArray(remote.rows) || remote.rows.length !== local.rows.length) return false;
  const equal = (a, b) => a === null ? b === null : typeof b === 'number' && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-10);
  for (const [key, value] of Object.entries(local)) {
    if ((typeof value === 'number' || value === null) && !equal(value, remote[key])) return false;
  }
  return local.rows.every((row, index) => Object.entries(row).every(([key, value]) => equal(value, remote.rows[index]?.[key])));
}

async function verifyServer() {
  if (!state.result || !state.assumptions || state.apiPending) return;
  const revision = state.revision;
  const assumptions = { ...state.assumptions };
  const expected = state.result;
  const expectedFingerprint = fingerprint(assumptions);
  const controller = new AbortController();
  state.apiController = controller;
  state.apiPending = true;
  state.apiEverRequested = true;
  $('#verify-server').textContent = 'Verifying…';
  setApiStatus('Comparing the current scenario with the server…');
  updateButtons();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    // Relative to this module so a repository-subpath deployment fails honestly
    // at its own API path instead of accidentally calling an unrelated API.
    const response = await fetch(new URL('./api/valuation', import.meta.url), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'value', assumptions }), signal: controller.signal,
    });
    if (state.revision !== revision || fingerprint(state.assumptions) !== expectedFingerprint) return;
    if (!response.ok) {
      state.apiUnavailable = true;
      setApiStatus(`Server verification unavailable (HTTP ${response.status}) · Browser calculation remains available`, 'warning');
      return;
    }
    let payload;
    try { payload = await response.json(); } catch {
      state.apiUnavailable = true;
      setApiStatus('This host did not return a valuation API response · Browser calculation remains available', 'warning');
      return;
    }
    if (state.revision !== revision || fingerprint(state.assumptions) !== expectedFingerprint) return;
    if (payload.modelVersion !== MODEL_VERSION || payload.valuationDate !== VALUATION_DATE) {
      setApiStatus('Server metadata differs from this model · Current results are not verified', 'error');
      return;
    }
    if (!sameNumericResults(expected, payload.result)) {
      setApiStatus('Server output differs from the current browser result · Verification failed', 'error');
      return;
    }
    state.apiUnavailable = false;
    setApiStatus(`Server verified · Current operating model matches v${MODEL_VERSION}`, 'success');
  } catch (error) {
    if (state.revision !== revision) return;
    state.apiUnavailable = true;
    setApiStatus(error.name === 'AbortError' ? 'Server check timed out · Browser calculation remains available' : 'Server verification unavailable on this host · Browser calculation remains available', 'warning');
  } finally {
    clearTimeout(timeout);
    if (state.apiController === controller) {
      state.apiController = null;
      state.apiPending = false;
      $('#verify-server').innerHTML = 'Verify on server <span aria-hidden="true">↗</span>';
      updateButtons();
    }
  }
}

function renderSavedScenarios(selectedId = $('#saved-scenarios').value) {
  const select = $('#saved-scenarios');
  select.innerHTML = state.saved.length ? `<option value="">Select a saved case</option>${state.saved.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(summarizeEntry(item).company)} · ${escapeHtml(item.title)}</option>`).join('')}` : '<option value="">No saved cases</option>';
  if (state.saved.some(item => item.id === selectedId)) select.value = selectedId;
  updateButtons();
}

async function initializeCasebook() {
  try {
    state.casebook = createCasebookStore({research:state.research});
    state.casebook.subscribe(({book,error})=>{
      if(error){$('#local-status').textContent=error.message;return;}
      state.saved=book.entries.filter(entry=>entry.kind==='scenario');renderSavedScenarios();
    });
    const book = await state.casebook.read();
    state.saved = book.entries.filter(entry=>entry.kind==='scenario');renderSavedScenarios();
  } catch(error) { $('#local-status').textContent = `Saved research could not be read: ${error.message} Calculation exports remain available.`; }
}

async function saveScenario() {
  if(!state.casebook||state.saving)return;
  const title = $('#save-name').value.trim() || `${state.company} ${state.scenario}${state.custom ? ' edited' : ''}`;
  try {
    const snapshot=currentPortableScenario(),captured=JSON.stringify(snapshot);
    const item = createScenarioEntry(snapshot,{title},state.research);
    state.saving=true;updateButtons();
    $('#local-status').textContent='Saving the captured case…';
    const {book,entry}=await state.casebook.add(item);
    state.saved=book.entries.filter(value=>value.kind==='scenario');renderSavedScenarios(entry.id);
    let unchanged=false;try{unchanged=JSON.stringify(currentPortableScenario())===captured;}catch{/* The current draft may have become invalid while storage was pending. */}
    $('#local-status').textContent=unchanged?`Saved “${title}” with its complete inputs and equity-bridge setting in this browser.`:`Saved the earlier case “${title}”. Your current edits are not saved.`;
    $('.local-scenarios .casebook-inline-link').href=`./casebook.html#entry=${encodeURIComponent(entry.id)}`;
  } catch(error) { $('#local-status').textContent=`Could not save this case: ${error.message} Your current model is retained.`; }
  finally {state.saving=false;updateButtons();}
}

function loadSavedScenario() {
  const item=state.saved.find(entry=>entry.id===$('#saved-scenarios').value);if(!item)return;
  try {
    openWorkbench(decodeEntry(item));state.savedName=item.title;updateSelectionLabels();
    $('#local-status').textContent=`Loaded “${item.title}” with its exact inputs and equity-bridge setting, then recalculated with model v${MODEL_VERSION}.`;
  } catch(error) {$('#local-status').textContent=`This saved case could not be loaded: ${error.message}`;}
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('#export-status').textContent = `Downloaded ${filename}.`;
}

function exportFilename(extension) {
  return `frontier-ai-${state.company.toLowerCase()}-${state.scenario.toLowerCase()}${state.custom ? '-edited' : ''}-${VALUATION_DATE}.${extension}`;
}

function exportJson() {
  if (!state.result || !state.assumptions) return;
  if ($('#bridge-enabled').checked && !validBridgeInputs()) return;
  const payload = {
    project: 'Frontier AI Valuation Lab', appVersion: APP_VERSION, modelVersion: MODEL_VERSION,
    valuationDate: VALUATION_DATE, units: 'USD billions; rates are decimals',
    company: state.company, scenario: state.scenario, edited: state.custom,
    savedScenarioName: state.savedName || null,
    researchAsOf: state.research.asOf,
    researchCutoff: state.research.researchCutoff ?? null,
    evidenceSnapshot: {
      company: state.research.companies[state.company],
      sources: state.research.sources,
    },
    assumptionStatus: 'Illustrative analyst scenario; not management guidance or an investment recommendation',
    assumptions: { ...state.assumptions }, result: state.result,
    hypotheticalEquityBridge: $('#bridge-enabled').checked ? renderBridge() : null,
    referenceData: 'data/research.json',
  };
  download(`${JSON.stringify(payload, null, 2)}\n`, exportFilename('json'), 'application/json;charset=utf-8');
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportCsv() {
  if (!state.result || !state.assumptions) return;
  const p = state.assumptions, r = state.result;
  const header = ['company', 'scenario', 'valuation_date', 'model_version', 'period', 'year', 'revenue_usd_bn', 'revenue_growth', 'ebit_margin', 'ebit_usd_bn', 'tax_usd_bn', 'nopat_usd_bn', 'net_reinvestment_usd_bn', 'fcff_usd_bn', 'discount_years', 'discount_factor', 'pv_fcff_usd_bn', 'cumulative_fcff_usd_bn', 'scenario_enterprise_value_usd_bn'];
  const meta = [state.company, `${state.scenario}${state.custom ? ' (edited)' : ''}`, VALUATION_DATE, MODEL_VERSION];
  const stub = [...meta, 'remaining_year', 2026, null, null, null, null, null, null, null, p.stub, r.stub_t, (1 + p.wacc) ** -r.stub_t, r.pv_stub, p.stub, r.ev];
  const rows = r.rows.map(row => [...meta, 'explicit_forecast', row.year, row.revenue, row.growth, row.margin, row.ebit, row.tax, row.nopat, row.reinvestment, row.fcf, row.t, row.df, row.pv, row.cumulative, r.ev]);
  const csv = [header, stub, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  download(`\uFEFF${csv}\r\n`, exportFilename('csv'), 'text/csv;charset=utf-8');
}

function clearSharedLocation() {
  state.shareRevision += 1;
  if (location.hash.startsWith('#scenario=') || location.hash.startsWith('#inspect=')) history.replaceState(null, '', location.pathname + location.search);
  if ($('#scenario-notice')) $('#scenario-notice').hidden = true;
  if ($('#share-link-area')) $('#share-link-area').hidden = true;
  if ($('#portable-status')) $('#portable-status').textContent = '';
}

function currentPortableScenario() {
  if (!state.assumptions || !state.result) throw new Error('Complete the model assumptions first.');
  let bridge = null;
  if ($('#bridge-enabled').checked) {
    if (!validBridgeInputs()) throw new Error('Complete the hypothetical equity inputs first.');
    bridge = {cash:readNumber($('#bridge-cash')),debt:readNumber($('#bridge-debt')),otherClaims:readNumber($('#bridge-claims'))};
  }
  return {company:state.company,scenario:state.scenario,assumptions:{...state.assumptions},bridge};
}

function openWorkbench({company,scenario='Base',assumptions,bridge=null},{inspection=null}={}) {
  if (!state.ready || !companies.includes(company) || !cases.includes(scenario)) return;
  // Reject nonfinite projections before changing the visitor's current workbench.
  project(assumptions);
  if (bridge !== null) bridgeEquity(0,bridge);
  clearSharedLocation();
  state.inspection=inspection;
  state.company = company;
  state.scenario = scenario;
  state.savedName = '';
  $('#bridge-enabled').checked = bridge !== null;
  for (const [id,key] of [['bridge-cash','cash'],['bridge-debt','debt'],['bridge-claims','otherClaims']]) $(`#${id}`).value = String(bridge?.[key] ?? 0);
  populateAssumptions(assumptions);
  recalculate();
  renderInspectionContext();
  selectTab('model');
  $('#workspace').scrollIntoView({block:'start'});
  $('#workspace').focus({preventScroll:true});
}

function restoreSharedScenario(hash = location.hash) {
  if (!hash.startsWith('#scenario=')) return;
  try {
    const shared = decodeScenario(hash.slice('#scenario='.length));
    openWorkbench(shared);
    history.replaceState(null,'',location.pathname + location.search + hash);
    $('#scenario-notice').className = 'scenario-notice';
    $('#scenario-notice').textContent = `Shared ${shared.company} scenario loaded and recalculated. The comparison story above uses its own selected presets; this workbench contains the shared assumptions.`;
  } catch (error) {
    $('#scenario-notice').className = 'scenario-notice is-error';
    $('#scenario-notice').textContent = `This scenario link could not be loaded: ${error.message} The workbench retains its current case.`;
    selectTab('model');
    $('#workspace').scrollIntoView({block:'start'});
  }
  $('#scenario-notice').hidden = false;
}

function renderInspectionContext(){
  const context=$('#inspection-context');if(!context)return;
  context.hidden=!state.inspection;
  $('#open-thesis').innerHTML=state.inspection?'Return to this comparison <span aria-hidden="true">↗</span>':'Compare in Thesis Lab <span aria-hidden="true">↗</span>';
  if(state.inspection){
    const {draft,side}=state.inspection;
    $('#inspection-title').textContent=`Inspecting the ${side} · ${draft.company} ${draft.reference.scenario} → ${draft.alternative.scenario}`;
    $('#inspection-description').textContent='Edit this forecast, then return to update this side of the comparison. The other case, separate equity adjustments, target and exact analysis window travel with it.';
  }
  updateButtons();
}

function focusSection(element){
  if(!element)return;if(!element.hasAttribute('tabindex'))element.setAttribute('tabindex','-1');
  element.scrollIntoView({block:'start',behavior:'instant'});element.focus({preventScroll:true});
}

function restoreWorkspaceRoute(hash=location.hash){
  if(hash.startsWith('#scenario=')){restoreSharedScenario(hash);return;}
  if(hash.startsWith('#inspect=')){
    try{
      const inspection=decodeInspection(hash);
      openWorkbench(inspection.scenario,{inspection});
      history.replaceState(null,'',location.pathname+location.search+hash);
    }catch(error){$('#scenario-notice').className='scenario-notice is-error';$('#scenario-notice').textContent=`This comparison could not be inspected: ${error.message} The current case is retained.`;$('#scenario-notice').hidden=false;selectTab('model');focusSection($('#workspace'));}
    return;
  }
  if(hash==='#sources'||/^#source-S\d{2}$/.test(hash)){
    selectTab('sources');focusSection(hash==='#sources'?$('#panel-sources'):document.getElementById(hash.slice(1))||$('#panel-sources'));
  }else if(hash==='#methodology'){selectTab('methodology');focusSection($('#panel-methodology'));}
  else if(hash==='#workspace'){selectTab('model');focusSection($('#workspace'));}
  else if(hash==='#research-story'){focusSection($('#research-story'));window.dispatchEvent(new CustomEvent('workspace:context',{detail:{section:'Overview'}}));}
}

async function initializeEvidenceContext(){
  try{
    const catalog=await fetchJson('./data/evidence.json');state.evidenceContext=createEvidenceContext({research:state.research,catalog});
    $$('button[data-evidence-key]').forEach(button=>{button.disabled=false;button.title='Inspect related evidence and modeling limits';});
  }catch{
    $$('button[data-evidence-key]').forEach(button=>{button.disabled=true;button.title='Contextual evidence could not load. The complete source register remains available in Evidence.';});
  }
}

async function copyScenario(supplied) {
  const revision = ++state.shareRevision;
  try {
    const draft = supplied?.assumptions ? {...supplied,bridge:supplied.bridge ?? null} : currentPortableScenario();
    const url = scenarioUrl(location.href,draft);
    $('#share-url').value = url;
    $('#share-link-area').hidden = false;
    let copied = false;
    try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); copied = true; } } catch { /* The visible, selectable link remains usable. */ }
    if (revision !== state.shareRevision) return url;
    $('#portable-status').textContent = copied ? 'Scenario link copied. Opening it restores and recalculates these assumptions.' : 'Your scenario link is ready below. Select and copy it to share these assumptions.';
    if (!copied) { $('#share-url').focus(); $('#share-url').select(); }
    return url;
  } catch (error) { $('#portable-status').textContent = `Could not create the link: ${error.message}`; return null; }
}

function exportBriefing() {
  try {
    const scenario = currentPortableScenario();
    const html = createBriefing({...scenario,research:state.research,shareUrl:scenarioUrl(location.href,scenario),edited:state.custom});
    download(html,exportFilename('html').replace('.html','-brief.html'),'text/html;charset=utf-8');
    $('#portable-status').textContent = 'Scenario brief downloaded. Open the HTML file to review it or use your browser’s Print → Save as PDF.';
  } catch (error) { $('#portable-status').textContent = `Could not export this brief: ${error.message}`; }
}

function openThesisLab() {
  try {
    const current=currentPortableScenario();
    const destination = state.inspection ? thesisUrl(new URL('./thesis.html',location.href).href,returnFromInspection(state.inspection,current)) : scenarioUrl(new URL('./thesis.html',location.href).href,current);
    location.assign(destination);
  } catch (error) { $('#portable-status').textContent = `Could not open the comparison: ${error.message}`; }
}

function installPortableActions() {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./portable.css',import.meta.url).href;
  document.head.append(stylesheet);
  $('.export-actions').insertAdjacentHTML('beforeend','<button type="button" class="button button-outline" id="share-scenario" disabled>Share this case <span aria-hidden="true">↗</span></button><button type="button" class="button button-dark" id="export-briefing" disabled>Scenario brief <span aria-hidden="true">↓</span></button><button type="button" class="button button-outline" id="open-thesis" disabled>Compare in Thesis Lab <span aria-hidden="true">↗</span></button><button type="button" class="button button-outline" id="open-horizon" disabled>Explore Value Horizon <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></button>');
  $('.export-bar').insertAdjacentHTML('afterend','<div class="portable-tools"><p id="portable-status" role="status"></p><div id="share-link-area" hidden><label for="share-url">Shareable scenario link</label><textarea id="share-url" rows="3" readonly spellcheck="false"></textarea><p>Contains the selected company, model version, assumptions and any enabled hypothetical equity bridge. It restores the workbench; no saved account or server record is needed.</p></div></div>');
  $('#workspace').insertAdjacentHTML('afterend','<p id="scenario-notice" class="scenario-notice" role="status" hidden></p>');
  $('#scenario-notice').insertAdjacentHTML('afterend','<aside id="inspection-context" class="inspection-context" aria-labelledby="inspection-title" hidden><div><strong id="inspection-title"></strong><p id="inspection-description"></p></div><button type="button" class="button button-dark" id="return-comparison">Return to this comparison <span aria-hidden="true">↗</span></button></aside>');
  $('#share-scenario').addEventListener('click',() => copyScenario());
  $('#export-briefing').addEventListener('click',exportBriefing);
  $('#open-thesis').addEventListener('click',openThesisLab);
  $('#open-horizon').addEventListener('click',()=>{
    try{window.open(scenarioUrl(new URL('./horizon.html',location.href).href,currentPortableScenario()),'_blank','noopener,noreferrer');}
    catch(error){$('#portable-status').textContent=`The horizon could not open: ${error.message}`;}
  });
  $('#return-comparison').addEventListener('click',openThesisLab);
}

function renderEvidence() {
  const research = state.research;
  $('#sources-asof').textContent = `Research snapshot · ${displayDate(research.asOf)}`;
  $('#company-evidence').innerHTML = companies.map(company => {
    const entry = research.companies[company];
    const financing = entry.financing;
    const operating = Array.isArray(entry.operatingEvidence) ? entry.operatingEvidence : [];
    const limitations = Array.isArray(entry.limitations) ? entry.limitations : [entry.limitations].filter(Boolean);
    const operatingRows = operating.map(item => {
      const value = typeof item.value === 'number' ? `${number(item.value, Number.isInteger(item.value) ? 0 : 2)} ${escapeHtml(item.unit || 'USD bn')}` : escapeHtml(item.value ?? 'Not specified');
      return `<li><strong>${escapeHtml(item.label)}: ${value}</strong>${sourceLink(item.sourceId)}<span class="evidence-detail">${escapeHtml(item.status || 'Evidence category not specified')}${item.period ? ` · ${escapeHtml(item.period)}` : ''}</span>${item.note ? `<span class="evidence-detail">${escapeHtml(item.note)}</span>` : ''}</li>`;
    }).join('');
    const financingRow = financing ? `<li><strong>${money(financing.value, 0)} · ${escapeHtml(financing.basis)}</strong>${sourceLink(financing.sourceId)}<span class="evidence-detail">${escapeHtml(financing.label)} · ${escapeHtml(displayDate(financing.date))}</span><span class="evidence-detail">${escapeHtml(financing.note || '')}</span></li>` : '<li>A completed financing reference has not been established.</li>';
    return `<article class="evidence-company"><h3><span class="company-dot ${company.toLowerCase()}" aria-hidden="true"></span>${escapeHtml(entry.name || company)}</h3><p class="evidence-description">${escapeHtml(entry.description)}</p><h4 class="evidence-subtitle">Operating evidence & forecast starting point</h4><ul class="evidence-list">${operatingRows || '<li>No operating evidence has been recorded.</li>'}</ul><h4 class="evidence-subtitle">Separate financing context</h4><ul class="evidence-list">${financingRow}</ul><div class="evidence-limits"><strong>Limits on comparability</strong>${limitations.map(escapeHtml).join('<br>')}</div></article>`;
  }).join('');
  $('#source-register').innerHTML = research.sources.map(source => {
    const url = safeUrl(source.url);
    const title = url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}<span class="sr-only"> (opens in a new tab)</span></a>` : escapeHtml(source.title);
    const dateAttribute = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(source.date) ? ` datetime="${escapeHtml(source.date)}"` : '';
    return `<article class="source-entry" id="source-${escapeHtml(source.id)}" tabindex="-1"><div class="source-meta"><time${dateAttribute}>${escapeHtml(displayDate(source.date))}</time><span class="evidence-tag">${escapeHtml(source.type)}</span></div><div><p class="source-publisher">${escapeHtml(source.id)} / ${escapeHtml(source.publisher)}</p><h4>${title}</h4></div><div class="source-use"><p><strong>Used for:</strong> ${escapeHtml(source.use)}</p><p><strong>Limit:</strong> ${escapeHtml(source.limit)}</p></div></article>`;
  }).join('');
}

function selectTab(name, moveFocus = false) {
  if (!['model', 'sources', 'methodology'].includes(name)) return;
  for (const button of $$('[data-tab]')) {
    const active = button.dataset.tab === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    $(`#panel-${button.dataset.tab}`).hidden = !active;
  }
  if (moveFocus) $(`#tab-${name}`).focus();
  window.dispatchEvent(new CustomEvent('workspace:context',{detail:{section:name==='sources'?'Evidence':'Model'}}));
}

function bindEvents() {
  $('#assumptions-form').addEventListener('submit', event => event.preventDefault());
  $('#assumptions-form').addEventListener('input', event => {
    if (!event.target.matches('[data-key]')) return;
    clearSharedLocation();
    state.savedName = '';
    recalculate();
  });
  document.addEventListener('click', event => {
    const evidenceButton=event.target.closest('button[data-evidence-key]');
    if(evidenceButton&&state.evidenceContext){
      try{state.evidenceContext.open({company:state.company,key:evidenceButton.dataset.evidenceKey,cases:state.assumptions?[{label:`${state.scenario}${state.custom?' · edited':''}`,assumptions:{...state.assumptions}}]:[]});}catch(error){$('#local-status').textContent=`Evidence could not open: ${error.message}`;}
    }
    const companyButton = event.target.closest('button[data-company]');
    if (companyButton) {
      loadPreset(companyButton.dataset.company, companyButton.dataset.openModel ? 'Base' : state.scenario);
      if (companyButton.dataset.openModel) {
        selectTab('model');
        $('#workspace').scrollIntoView({ block: 'start' });
        $('#workspace').focus({ preventScroll: true });
      }
    }
    const scenarioButton = event.target.closest('button[data-scenario]');
    if (scenarioButton) loadPreset(state.company, scenarioButton.dataset.scenario);
    const tabButton = event.target.closest('button[data-tab]');
    if (tabButton) selectTab(tabButton.dataset.tab);
    const sourceAnchor = event.target.closest('a[data-source]');
    if (sourceAnchor) {
      event.preventDefault();
      const hash=`#source-${sourceAnchor.dataset.source}`;history.replaceState(null,'',location.pathname+location.search+hash);restoreWorkspaceRoute(hash);
    }
  });
  $('.tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = $$('[data-tab]');
    const current = buttons.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    selectTab(buttons[index].dataset.tab, true);
  });
  $$('[data-metric]').forEach(button => button.addEventListener('click', () => { state.metric = button.dataset.metric; if (state.result) renderForecast(); }));
  $('#reset-scenario').addEventListener('click', () => loadPreset());
  $('#verify-server').addEventListener('click', verifyServer);
  $('#reverse-form').addEventListener('submit', solveReverse);
  $('#reverse-target').addEventListener('input', () => {
    const target = readNumber($('#reverse-target'));
    $('#reverse-target').setAttribute('aria-invalid', String(target !== null && (target <= 0 || target > 1e12)));
    setReversePrompt(target === null ? 'Enter an enterprise value to explore a required growth path.' : 'Target changed. Solve to calculate a current required growth path.');
    updateButtons();
  });
  $('#bridge-enabled').addEventListener('change', () => { clearSharedLocation(); renderBridge(); updateButtons(); });
  for (const id of ['bridge-cash', 'bridge-debt', 'bridge-claims']) $(`#${id}`).addEventListener('input', () => { clearSharedLocation(); renderBridge(); updateButtons(); });
  $('#save-scenario').addEventListener('click', saveScenario);
  $('#load-scenario').addEventListener('click', loadSavedScenario);
  $('#saved-scenarios').addEventListener('change', updateButtons);
  $('#export-json').addEventListener('click', exportJson);
  $('#export-csv').addEventListener('click', exportCsv);
  window.addEventListener('hashchange', () => {
    if (!state.ready) return;
    restoreWorkspaceRoute(location.hash);
  });
  window.addEventListener('workspace:navigate',event=>{if(state.ready)restoreWorkspaceRoute(event.detail?.hash);});
}

async function fetchJson(relativePath) {
  const response = await fetch(new URL(relativePath, import.meta.url), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Could not load ${relativePath} (HTTP ${response.status}).`);
  return response.json();
}

async function initialize() {
  createFields();
  installPortableActions();
  bindEvents();
  try {
    const [presets, research] = await Promise.all([fetchJson('./data/presets.json'), fetchJson('./data/research.json')]);
    for (const company of companies) for (const scenario of cases) validate(presets?.[company]?.[scenario]);
    if (!research || !Array.isArray(research.sources) || companies.some(company => !research.companies?.[company])) throw new Error('Research metadata is incomplete.');
    if (research.modelVersion !== MODEL_VERSION || research.asOf !== VALUATION_DATE) throw new Error('Research metadata and the calculation engine have different versions or valuation dates. Refresh after the deployment has finished.');
    state.presets = presets;
    state.research = research;
    state.ready = true;
    $('#model-version').textContent = `Model v${MODEL_VERSION} · Browser ready`;
    renderComparisons();
    renderEvidence();
    initializeCasebook();
    initializeEvidenceContext();
    // A visitor may follow a newer fragment while the research files are loading.
    const requestedHash = location.hash;
    loadPreset();
    initExperience({presets,research,onOpenModel:openWorkbench,onShare:copyScenario});
    restoreWorkspaceRoute(requestedHash);
  } catch (error) {
    state.ready = false;
    $('#load-error').hidden = false;
    $('#load-error').textContent = `The model could not start: ${error.message} Please reload the page or use the workbook and research report.`;
    $('#company-comparison').innerHTML = '<div class="loading-placeholder">Model data could not be loaded. The workbook and source repository remain available from the links above.</div>';
    $('#model-version').textContent = 'Model unavailable';
    showInvalid('Model data is unavailable. Reload the page to retry.');
  }
}

initialize();
