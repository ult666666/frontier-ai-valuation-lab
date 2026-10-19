// Optional real-browser checks for the research story. Requires a running Node app.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.env.FRONTIER_PROJECT_ROOT || process.cwd());
const { project, MODEL_VERSION, VALUATION_DATE } = await import(pathToFileURL(`${root}/public/lib/model.js`).href);
const { APP_VERSION } = await import(pathToFileURL(`${root}/public/lib/release.js`).href);
const { comparePair, stressPair } = await import(pathToFileURL(`${root}/public/lib/analytics.js`).href);
const require = createRequire(`${root}/package.json`);
const { chromium } = require(process.env.FRONTIER_PLAYWRIGHT_MODULE || `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`);
const presets = JSON.parse(await readFile(`${root}/public/data/presets.json`, 'utf8'));
const baseUrl = process.env.FRONTIER_BASE_URL || 'http://127.0.0.1:4321/';
const qa = `${root}/qa-local/experience`;
await mkdir(qa, { recursive: true });
const checks = [];
const browserErrors = [];
const check = (name, actual, expected = true) => { assert.deepEqual(actual, expected, name); checks.push(name); };
const near = (name, actual, expected) => { assert.ok(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)), `${name}: ${actual} !== ${expected}`); checks.push(name); };
const pair = scenario => ({ Anthropic: presets.Anthropic[scenario], OpenAI: presets.OpenAI[scenario] });
const zero = { growthPp: 0, marginPp: 0, waccPp: 0, capitalEfficiencyPct: 0 };
const browser = await chromium.launch({ headless: true, executablePath: process.env.FRONTIER_CHROMIUM_EXECUTABLE || undefined, args: process.env.FRONTIER_CHROMIUM_EXECUTABLE ? ['--no-sandbox', '--no-zygote', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', error => browserErrors.push(error.message));
const numberAttr = async (selector, attribute = 'data-exp-value') => Number(await page.locator(selector).getAttribute(attribute));
const setRange = (id, value) => page.locator(`#${id}`).fill(String(value));
const wrapped = result => ({ appVersion: APP_VERSION, modelVersion: MODEL_VERSION, valuationDate: VALUATION_DATE, result });

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('[data-experience-ready="true"]').waitFor();
  check('Comparison initializes without an error banner', await page.locator('#experience-error').isHidden());
  await page.keyboard.press('Tab');
  check('The skip link is visible when reached with the keyboard', await page.locator('.skip-link').evaluate(element => document.activeElement === element && getComputedStyle(element).opacity === '1'));
  await page.locator('.skip-link').blur();
  check('Both companies share one chart', await page.locator('#exp-chart svg [data-exp-line]').count(), 2);
  check('All five range inputs have native labels', await page.locator('.research-theater input[type="range"], .stress-lab input[type="range"]').evaluateAll(inputs => inputs.length === 5 && inputs.every(input => input.labels.length > 0)));
  for (const company of ['Anthropic', 'OpenAI']) {
    const expected = project(presets[company].Base);
    near(`${company} default chart value matches the model`, await numberAttr(`[data-exp-readout="${company}"]`), expected.rows.at(-1).revenue);
    near(`${company} default stress value matches the model`, await numberAttr(`[data-exp-stress-ev="${company}"]`), expected.ev);
  }
  near('The original workbench still opens on Anthropic Base', await numberAttr('[data-result-ev]', 'data-result-ev'), project(presets.Anthropic.Base).ev);
  check('Pristine desktop has no horizontal page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${qa}/desktop-top.png`, animations: 'disabled' });
  await page.screenshot({ path: `${qa}/desktop-full.png`, fullPage: true, animations: 'disabled' });

  await page.locator('[data-exp-scenario="Bull"]').click();
  for (const company of ['Anthropic', 'OpenAI']) {
    near(`${company} paired scenario updates the plot`, await numberAttr(`[data-exp-point="${company}"]`), project(presets[company].Bull).rows.at(-1).revenue);
    near(`${company} paired scenario updates the stress baseline`, await numberAttr(`[data-exp-stress-ev="${company}"]`), project(presets[company].Bull).ev);
  }
  check('Stress baseline label follows the selected paired scenario', await page.locator('#exp-stress-case').innerText(), 'Relative to the Bull cases');
  near('Paired exploration preserves the independently labeled workbench', await numberAttr('[data-result-ev]', 'data-result-ev'), project(presets.Anthropic.Base).ev);
  await page.locator('#exp-year').focus();
  await page.keyboard.press('ArrowLeft');
  check('Native year slider supports the keyboard', await page.locator('#exp-year').inputValue(), '2035');
  near('Keyboard year selection displays its actual annual value', await numberAttr('[data-exp-readout="OpenAI"]'), project(presets.OpenAI.Bull).rows[8].revenue);
  check('Selected year is exposed to assistive technology', (await page.locator('#exp-year').getAttribute('aria-valuetext')).startsWith('2035; Anthropic'));

  await page.locator('[data-exp-scenario="Base"]').click();
  await page.locator('#exp-tab-fcf').click();
  await setRange('exp-year', 2027);
  const zeroY = Number(await page.locator('#exp-chart [data-exp-zero-line]').getAttribute('y1'));
  for (const company of ['Anthropic', 'OpenAI']) {
    const expected = project(presets[company].Base).rows[0].fcf;
    near(`${company} selected FCFF remains signed and exact`, await numberAttr(`[data-exp-point="${company}"]`), expected);
    const markerY = await page.locator(`[data-exp-point="${company}"]`).evaluate(element => element.tagName === 'circle' ? Number(element.getAttribute('cy')) : Number(element.getAttribute('y')) + Number(element.getAttribute('height')) / 2);
    check(`${company} negative annual cash flow appears below zero`, expected < 0 && markerY > zeroY);
  }
  check('Annual cash-flow milestone is clearly named', (await page.locator('#exp-readout').innerText()).includes('First positive annual FCFF: 2030'));
  await page.locator('#comparison-theater').screenshot({ path: `${qa}/cash-flow.png`, animations: 'disabled' });
  await page.locator('#exp-tab-fcf').focus();
  await page.keyboard.press('ArrowRight');
  check('Keyboard chapter navigation selects value composition', await page.locator('#exp-tab-value').getAttribute('aria-selected'), 'true');
  check('Composition correctly hides the annual year control', await page.locator('#exp-year-controls').isHidden());
  const comparison = comparePair(pair('Base'));
  for (const company of ['Anthropic', 'OpenAI']) {
    near(`${company} terminal share matches the model`, await numberAttr(`[data-exp-readout="${company}"]`, 'data-exp-share'), comparison.companies[company].result.tv_share);
    for (const key of ['stub', 'explicitForecast', 'terminal']) near(`${company} ${key} contribution reconciles`, await numberAttr(`[data-exp-component="${company}:${key}"]`), comparison.companies[company].valueComposition[key]);
  }
  await page.locator('.story-data summary').click();
  check('The accessible composition table includes EV reconciliation', await page.locator('#exp-data-table tbody tr').count(), 4);
  await page.locator('.story-data summary').click();
  await page.locator('#comparison-theater').screenshot({ path: `${qa}/value-composition.png`, animations: 'disabled' });
  await page.locator('[data-exp-scenario="Bear"]').click();
  check('Nonpositive EV does not receive a terminal percentage', await page.locator('[data-exp-share=""]').count(), 2);
  check('Nonpositive EV has an explicit readout explanation', (await page.locator('#exp-readout').innerText()).includes('Nonpositive EV'));
  check('No zero floor is imposed on Bear stress values', (await numberAttr('[data-exp-stress-ev="Anthropic"]')) < 0);
  await page.locator('[data-exp-scenario="Base"]').click();
  await setRange('exp-wacc', 2);
  const discountStress = stressPair(pair('Base'), { ...zero, waccPp: 2 });
  for (const company of ['Anthropic', 'OpenAI']) near(`${company} +2pp WACC stress uses exact transformed assumptions`, await numberAttr(`[data-exp-stress-ev="${company}"]`), discountStress.stressed.companies[company].result.ev);
  check('Both signed EV changes are shown against the baseline', await page.locator('.stress-delta.is-negative').count(), 2);
  check('The chart retains the selected baseline when stress changes', await numberAttr('[data-exp-readout="Anthropic"]', 'data-exp-share'), comparison.companies.Anthropic.result.tv_share);
  const requestPromise = page.waitForRequest(request => request.url().endsWith('/api/valuation') && request.postDataJSON()?.action === 'stress');
  await page.locator('#exp-verify-stress').click();
  const request = (await requestPromise).postDataJSON();
  check('API request carries both exact baseline assumption objects', request.assumptionsByCompany, pair('Base'));
  check('API request carries all four current shocks', request.shocks, { ...zero, waccPp: 2 });
  await page.locator('#exp-server-status.success').waitFor();
  checks.push('Live Node API verifies both complete current stress results');
  await page.locator('#stress-lab').screenshot({ path: `${qa}/stress-thesis.png`, animations: 'disabled' });
  await page.locator('[data-exp-open="OpenAI"]').click();
  near('Open-this-case loads the exact stressed assumptions into the workbench', await numberAttr('[data-result-ev]', 'data-result-ev'), discountStress.stressed.companies.OpenAI.result.ev);
  check('Opened stressed case is labeled as edited', await page.locator('#case-label').innerText(), 'Base · edited');
  check('Opened stressed WACC is visible in percent input units', await page.locator('#input-wacc').inputValue(), '14.5');
  await page.locator('#tab-sources').click();
  await page.locator('.theater-caption a[href="#workspace"]').click();
  check('Explore-complete-model reopens the workbench from the sources tab', await page.locator('#panel-model').isVisible());
  near('Returning to the workbench retains its edited current assumptions', await numberAttr('[data-result-ev]', 'data-result-ev'), discountStress.stressed.companies.OpenAI.result.ev);

  let release;
  let requestSeen;
  const delayed = new Promise(resolve => { release = resolve; });
  const captured = new Promise(resolve => { requestSeen = resolve; });
  await page.route('**/api/valuation', async route => {
    const body = route.request().postDataJSON();
    const result = stressPair(body.assumptionsByCompany, body.shocks);
    requestSeen();
    await delayed;
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wrapped(result)) }); } catch {}
  });
  await page.locator('#exp-verify-stress').click();
  await captured;
  await setRange('exp-growth', 3);
  release();
  check('Changing a shock cancels stale verification success', await page.locator('#exp-server-status.success').count(), 0);
  check('Changing a shock restores the verify action for current values', await page.locator('#exp-verify-stress').isEnabled());
  await page.unroute('**/api/valuation');
  await page.route('**/api/valuation', async route => {
    const body = route.request().postDataJSON();
    const result = stressPair(body.assumptionsByCompany, body.shocks);
    result.stressed.companies.OpenAI.result.rows[0].nopat += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wrapped(result)) });
  });
  await page.locator('#exp-verify-stress').click();
  await page.locator('#exp-server-status.error').waitFor();
  check('Verification rejects a changed annual cash flow even when EV matches', (await page.locator('#exp-server-status').innerText()).includes('differs'));
  await page.unroute('**/api/valuation');
  await page.route('**/api/valuation', route => route.fulfill({ status: 404, body: 'Not found' }));
  await page.locator('#exp-verify-stress').click();
  await page.locator('#exp-server-status.warning').waitFor();
  check('A missing API is explicit and preserves both browser results', await page.locator('[data-exp-stress-ev]').count(), 2);
  await page.unroute('**/api/valuation');
  await page.locator('#exp-reset-stress').click();
  near('Reset recovers exact selected baseline', await numberAttr('[data-exp-stress-ev="Anthropic"]'), project(presets.Anthropic.Base).ev);
  check('Reset removes all four shocks', await page.locator('[data-exp-shock]').evaluateAll(inputs => inputs.every(input => Number(input.value) === 0)));

  // Exercise invalid transformed inputs without modifying the shipped presets.
  const invalidPage = await context.newPage();
  const smallMargin = structuredClone(presets);
  smallMargin.Anthropic.Base.m36 = 0.05;
  smallMargin.OpenAI.Base.stub = -30;
  await invalidPage.route('**/data/presets.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(smallMargin) }));
  await invalidPage.goto(baseUrl, { waitUntil: 'networkidle' });
  await invalidPage.locator('[data-experience-ready="true"]').waitFor();
  await invalidPage.locator('#exp-tab-value').click();
  check('Terminal share may exceed 100% when explicit cash flows detract', Number(await invalidPage.locator('[data-exp-readout="OpenAI"]').getAttribute('data-exp-share')) > 1);
  check('Terminal share above 100% is explained and never capped', (await invalidPage.locator('#exp-readout').innerText()).includes('can exceed'));
  await invalidPage.locator('#exp-margin').fill('-10');
  check('Invalid stressed assumptions remove all stale EV cards', await invalidPage.locator('[data-exp-stress-ev]').count(), 0);
  check('Invalid stressed assumptions have a company-specific error', (await invalidPage.locator('#exp-stress-error').innerText()).includes('Anthropic'));
  check('Invalid shocks are not silently clipped', await invalidPage.locator('#exp-margin').inputValue(), '-10');
  check('Invalid stress disables verification', await invalidPage.locator('#exp-verify-stress').isDisabled());
  await invalidPage.locator('#exp-reset-stress').click();
  check('Invalid stress recovers after a reset', await invalidPage.locator('[data-exp-stress-ev]').count(), 2);
  await invalidPage.close();

  await page.locator('#exp-tab-revenue').click();
  await setRange('exp-year', 2036);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1100 });
    await page.locator('#exp-chart svg').waitFor();
    check(`${width}px page has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#exp-tab-value').click();
    check(`${width}px value composition has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width === 390) {
      await page.locator('#exp-tab-value').blur();
      await page.locator('#comparison-theater').screenshot({ path: `${qa}/mobile-value-composition.png`, animations: 'disabled' });
      await page.locator('#stress-lab').screenshot({ path: `${qa}/mobile-stress-thesis.png`, animations: 'disabled' });
    }
    await page.locator('#exp-tab-revenue').click();
    if (width === 390) {
      await page.locator('#exp-tab-revenue').blur();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: `${qa}/mobile-top.png`, animations: 'disabled' });
      await page.locator('#comparison-theater').screenshot({ path: `${qa}/mobile-theater.png`, animations: 'disabled' });
    }
    if (width === 768) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: `${qa}/tablet-top.png`, animations: 'disabled' });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#exp-tab-fcf').click();
  check('Reduced-motion preference disables chart transitions', await page.locator('#exp-chart svg').evaluate(element => getComputedStyle(element).animationName), 'none');
  await page.locator('#exp-tab-fcf').focus();
  await page.keyboard.press('Home');
  check('Chapter Home key returns to the first chapter', await page.locator('#exp-tab-revenue').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End');
  check('Chapter End key selects the final chapter', await page.locator('#exp-tab-value').getAttribute('aria-selected'), 'true');
  await page.locator('#exp-tab-revenue').click();
  await page.locator('#exp-tab-revenue').blur();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: `${qa}/desktop-top-final.png`, animations: 'disabled' });
  check('No browser runtime exceptions occurred', browserErrors, []);
  const summary = { passed: checks.length, checks, browserErrors, screenshots: 'qa-local/experience/' };
  await writeFile(`${qa}/browser-checks.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}
