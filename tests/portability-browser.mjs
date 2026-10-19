// Browser QA for portable scenarios and script-free briefs. Requires a running app.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.env.FRONTIER_PROJECT_ROOT || process.cwd());
const require = createRequire(`${root}/package.json`);
const { chromium } = require(process.env.FRONTIER_PLAYWRIGHT_MODULE || `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`);
const { project, bridgeEquity, MODEL_VERSION, VALUATION_DATE } = await import(pathToFileURL(`${root}/public/lib/model.js`).href);
const { APP_VERSION } = await import(pathToFileURL(`${root}/public/lib/release.js`).href);
const { decodeScenario, scenarioUrl } = await import(pathToFileURL(`${root}/public/lib/share.js`).href);
const presets = JSON.parse(await readFile(`${root}/public/data/presets.json`, 'utf8'));
const baseUrl = process.env.FRONTIER_BASE_URL || 'http://127.0.0.1:4321/';
const qa = `${root}/qa-local/portability`;
await mkdir(qa, { recursive: true });
const keys = ['rev2026', 'g1', 'g2', 'g3', 'm27', 'm30', 'm36', 'turns', 'wacc', 'tg', 'roic', 'stub', 'tax'];
const percentKeys = new Set(['g1', 'g2', 'g3', 'm27', 'm30', 'm36', 'wacc', 'tg', 'roic', 'tax']);
const checks = [];
const failures = [];
const browserErrors = [];
const artifacts = {};
let pdfSummary = null;
const check = (name, actual, expected = true) => {
  try { assert.deepEqual(actual, expected, name); checks.push(name); }
  catch (error) { failures.push({ name, actual, expected, message: error.message }); }
};
const value = page => page.locator('[data-result-ev]').getAttribute('data-result-ev').then(Number);
const money = value => `${value < 0 ? '−' : ''}$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(value))}B`;
const rawUrl = item => {
  const payload = { schema: 1, model: MODEL_VERSION, date: VALUATION_DATE, company: item.company, scenario: item.scenario, inputs: keys.map(key => item.assumptions[key]), bridge: item.bridge ?? null, ...item.overrides };
  return `${baseUrl.split('#')[0]}#scenario=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
};
const browser = await chromium.launch({ headless: true, executablePath: process.env.FRONTIER_CHROMIUM_EXECUTABLE || undefined, args: process.env.FRONTIER_CHROMIUM_EXECUTABLE ? ['--no-sandbox', '--no-zygote', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true, reducedMotion: 'reduce' });
await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new DOMException('Denied by browser QA fixture', 'NotAllowedError'); } } }));
const track = page => { page.on('pageerror', error => browserErrors.push(error.message)); return page; };
const page = track(await context.newPage());

async function exportJson(target, name) {
  const pending = target.waitForEvent('download');
  await target.locator('#export-json').click();
  const download = await pending;
  const path = `${qa}/${name}.json`;
  await download.saveAs(path);
  return JSON.parse(await readFile(path, 'utf8'));
}

async function freshShared(url) {
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true, reducedMotion: 'reduce' });
  const target = track(await fresh.newPage());
  await target.goto(url, { waitUntil: 'networkidle' });
  await target.locator('#scenario-notice:not([hidden])').waitFor();
  return { context: fresh, page: target };
}

async function restore(target, url) {
  await target.goto(url, { waitUntil: 'networkidle' });
  await target.locator('#scenario-notice:not([hidden])').waitFor();
}

async function openDetails(target, selector) {
  if (!(await target.locator(selector).evaluate(element => element.open))) await target.locator(`${selector} summary`).click();
}

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('[data-result-ev]').waitFor();
  await page.locator('.company-switch [data-company="OpenAI"]').click();
  const edited = { rev2026: 36.125, g1: .57375, g2: .275, g3: .135, m27: -.175, m30: .145, m36: .265, turns: 2.375, wacc: .1375, tg: .0275, roic: .225, stub: -7.125, tax: .235 };
  for (const [key, number] of Object.entries(edited)) await page.locator(`#input-${key}`).fill(String(percentKeys.has(key) ? number * 100 : number));
  const original = await exportJson(page, 'original-custom-case');
  check('Custom OpenAI case has 13 current model assumptions', Object.keys(original.assumptions).sort(), [...keys].sort());
  check('All 13 edited inputs agree with the exact current model state', original.assumptions, edited);
  check('Custom OpenAI EV agrees exactly with the shared financial engine', original.result.ev, project(edited).ev);
  await openDetails(page, '#bridge-details');
  await page.locator('#bridge-enabled').check();
  await page.locator('#bridge-cash').fill('10.25');
  await page.locator('#bridge-debt').fill('2.5');
  await page.locator('#bridge-claims').fill('0.75');
  const bridge = { cash: 10.25, debt: 2.5, otherClaims: .75 };
  await page.locator('#share-scenario').click();
  await page.locator('#share-link-area:not([hidden])').waitFor();
  const sharedUrl = await page.locator('#share-url').inputValue();
  const shared = decodeScenario(new URL(sharedUrl).hash.slice('#scenario='.length));
  check('Share link encodes the current company and scenario', [shared.company, shared.scenario], ['OpenAI', 'Base']);
  check('Share link contains all 13 exact edited assumptions', shared.assumptions, edited);
  check('Share link contains the enabled hypothetical bridge', shared.bridge, bridge);
  check('Denied clipboard permission produces a usable fallback message', (await page.locator('#portable-status').innerText()).includes('ready below'));
  check('Fallback link is labeled, readonly, focused and fully selected', await page.locator('#share-url').evaluate(element => element.labels.length > 0 && element.readOnly && document.activeElement === element && element.selectionStart === 0 && element.selectionEnd === element.value.length));
  check('Portable controls and fallback have no desktop page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('.portable-tools').screenshot({ path: `${qa}/desktop-share-fallback.png` });
  artifacts.sharedUrl = sharedUrl;
  const restored = await freshShared(sharedUrl);
  check('Fresh-context initial hash survives preset initialization', new URL(restored.page.url()).hash, new URL(sharedUrl).hash);
  check('Fresh-context restoration is explicitly acknowledged', (await restored.page.locator('#scenario-notice').innerText()).includes('Shared OpenAI scenario loaded'));
  check('Restored workbench retains the correct company', await restored.page.locator('#model-workspace').getAttribute('data-company'), 'OpenAI');
  check('Restored custom case is labeled as edited', await restored.page.locator('#case-label').innerText(), 'Base · edited');
  const restoredJson = await exportJson(restored.page, 'restored-custom-case');
  check('Fresh-context shared restoration preserves all 13 assumptions exactly', restoredJson.assumptions, edited);
  check('Fresh-context shared restoration preserves EV exactly', restoredJson.result.ev, project(edited).ev);
  check('Fresh-context restoration retains the exact hypothetical equity bridge', restoredJson.hypotheticalEquityBridge, bridgeEquity(project(edited).ev, bridge));
  check('The restored bridge remains enabled', await restored.page.locator('#bridge-enabled').isChecked());
  check('Shared workbench clarifies independent comparison presets', (await restored.page.locator('#scenario-notice').innerText()).includes('comparison story above uses its own selected presets'));
  await restored.context.close();

  const loadingContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true, reducedMotion: 'reduce' });
  let releaseResearch;
  let announceResearch;
  const researchGate = new Promise(resolve => { releaseResearch = resolve; });
  const researchRequested = new Promise(resolve => { announceResearch = resolve; });
  await loadingContext.route('**/data/research.json', async route => {
    announceResearch();
    await researchGate;
    await route.continue();
  });
  const loadingPage = track(await loadingContext.newPage());
  const firstUrl = scenarioUrl(baseUrl, { company: 'Anthropic', scenario: 'Base', assumptions: presets.Anthropic.Base, bridge: null });
  await loadingPage.goto(firstUrl, { waitUntil: 'domcontentloaded' });
  await researchRequested;
  await loadingPage.evaluate(hash => { location.hash = hash; }, new URL(sharedUrl).hash);
  releaseResearch();
  await loadingPage.locator('#scenario-notice:not([hidden])').waitFor();
  check('A newer scenario fragment during research loading wins over the initial fragment', new URL(loadingPage.url()).hash, new URL(sharedUrl).hash);
  check('Delayed research loading restores the newer company', await loadingPage.locator('#model-workspace').getAttribute('data-company'), 'OpenAI');
  const loadingJson = await exportJson(loadingPage, 'restored-newer-loading-fragment');
  check('Delayed research loading restores all 13 newer assumptions exactly', loadingJson.assumptions, edited);
  check('Delayed research loading restores the newer EV and bridge exactly', [loadingJson.result.ev, loadingJson.hypotheticalEquityBridge], [project(edited).ev, bridgeEquity(project(edited).ev, bridge)]);
  await loadingContext.close();

  const pendingBrief = page.waitForEvent('download');
  await page.locator('#export-briefing').click();
  const briefDownload = await pendingBrief;
  const briefPath = `${qa}/openai-custom-brief.html`;
  await briefDownload.saveAs(briefPath);
  const html = await readFile(briefPath, 'utf8');
  artifacts.briefHtml = briefPath;
  check('Brief download has a descriptive HTML filename', /openai.*base.*edited.*-brief\.html$/.test(briefDownload.suggestedFilename()));
  check('Standalone briefing contains no executable script', !/<script\b|\son\w+\s*=/i.test(html));
  check('Standalone briefing contains the current EV', html.includes(money(project(edited).ev)));
  check('Standalone briefing distinguishes application and model versions', html.includes(`Financial engine ${MODEL_VERSION} · Application ${APP_VERSION}`));
  check('Standalone briefing includes the current hypothetical equity calculation', html.includes(money(bridgeEquity(project(edited).ev, bridge).equityValue)));
  const briefPage = track(await context.newPage());
  await briefPage.goto(pathToFileURL(briefPath).href, { waitUntil: 'load' });
  check('Standalone briefing has all ten annual forecast rows', await briefPage.locator('.forecast tbody tr').count(), 10);
  check('Standalone briefing has no script or external stylesheet dependency', await briefPage.locator('script, link[rel="stylesheet"]').count(), 0);
  const reopen = await briefPage.getByRole('link', { name: /Reopen these exact assumptions/ }).getAttribute('href');
  check('The briefing reopen link reproduces all exact assumptions and bridge', decodeScenario(new URL(reopen).hash.slice('#scenario='.length)), { company: 'OpenAI', scenario: 'Base', assumptions: edited, bridge });
  const lastRow = await briefPage.locator('.forecast tbody tr').last().innerText();
  check('Standalone briefing includes the final forecast revenue', lastRow.includes(new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(project(edited).rows.at(-1).revenue)));
  await briefPage.screenshot({ path: `${qa}/brief-browser-top.png` });
  const pdfPath = `${qa}/openai-custom-brief.pdf`;
  await briefPage.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
  const pdfInfo = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  const pageCount = Number(pdfInfo.match(/^Pages:\s+(\d+)/m)?.[1]);
  const pdfText = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
  check('Printed brief produces readable PDF pages', Number.isInteger(pageCount) && pageCount > 0);
  check('Printed brief retains the current EV and final forecast year', pdfText.includes(money(project(edited).ev)) && pdfText.includes('2036'));
  execFileSync('pdftoppm', ['-r', '95', '-png', pdfPath, `${qa}/brief-print`]);
  pdfSummary = { pageCount, path: pdfPath, renderedPages: (await readdir(qa)).filter(name => /^brief-print-\d+\.png$/.test(name)), pageSize: pdfInfo.match(/^Page size:\s+(.+)$/m)?.[1] };
  await briefPage.setViewportSize({ width: 390, height: 844 });
  check('Standalone brief has no mobile page overflow', await briefPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await briefPage.screenshot({ path: `${qa}/brief-mobile-top.png` });
  await briefPage.close();

  for (const [name, action] of [
    ['assumption edit', async target => target.locator('#input-g1').fill('55')],
    ['preset change', async target => target.locator('[data-scenario="Bull"]').click()],
    ['company change', async target => target.locator('.company-switch [data-company="Anthropic"]').click()],
    ['bridge amount edit', async target => { await openDetails(target, '#bridge-details'); await target.locator('#bridge-cash').fill('11'); }],
    ['bridge toggle', async target => { await openDetails(target, '#bridge-details'); await target.locator('#bridge-enabled').uncheck(); }],
  ]) {
    const sample = await freshShared(sharedUrl);
    await action(sample.page);
    check(`A ${name} clears the stale shared URL`, await sample.page.evaluate(()=>location.hash), '');
    check(`A ${name} clears the old restoration notice`, await sample.page.locator('#scenario-notice').isHidden());
    await sample.context.close();
  }
  await restore(page, sharedUrl);
  await openDetails(page, '.local-scenarios');
  await page.locator('#input-g1').fill('54');
  await page.locator('#save-name').fill('Portable QA saved case');
  await page.locator('#save-scenario').click();
  await page.waitForFunction(()=>document.querySelector('#saved-scenarios').value!=='',null,{timeout:15000});
  const savedId = await page.locator('#saved-scenarios').inputValue();
  await restore(page, sharedUrl);
  await openDetails(page, '.local-scenarios');
  await page.locator('#saved-scenarios').selectOption(savedId);
  await page.locator('#load-scenario').click();
  check('Loading a saved case clears the old shared URL', new URL(page.url()).hash, '');
  check('Loading a saved case applies its actual inputs', await page.locator('#input-g1').inputValue(), '54');
  await restore(page, sharedUrl);
  await page.locator('#input-g1').fill('');
  check('Invalid assumptions disable both Share and Brief', await page.locator('#share-scenario, #export-briefing').evaluateAll(buttons => buttons.every(button => button.disabled)));
  await restore(page, sharedUrl);
  await openDetails(page, '#bridge-details');
  await page.locator('#bridge-cash').fill('');
  check('An invalid enabled bridge disables both Share and Brief', await page.locator('#share-scenario, #export-briefing').evaluateAll(buttons => buttons.every(button => button.disabled)));

  const malformedCases = [
    ['malformed', `${baseUrl}#scenario=!!invalid`],
    ['empty', `${baseUrl}#scenario=`],
    ['incompatible model', rawUrl({ company: 'Anthropic', scenario: 'Base', assumptions: presets.Anthropic.Base, overrides: { model: '0.0.0' } })],
    ['invalid numerical range', rawUrl({ company: 'Anthropic', scenario: 'Base', assumptions: { ...presets.Anthropic.Base, wacc: Number.MIN_VALUE, tg: 0 } })],
  ];
  for (const [name, url] of malformedCases) {
    const bad = await freshShared(url);
    check(`A ${name} share link displays a clear error`, await bad.page.locator('#scenario-notice').evaluate(element => element.classList.contains('is-error')));
    check(`A ${name} share link retains valid Anthropic Base EV`, await value(bad.page), project(presets.Anthropic.Base).ev);
    check(`A ${name} share link never claims successful restoration`, !(await bad.page.locator('#scenario-notice').innerText()).includes('scenario loaded'));
    await bad.context.close();
  }

  for (const [name, assumptions] of [
    ['high-precision inputs', { ...presets.Anthropic.Base, g1: .4781234567890123, stub: -.123456789012345 }],
    ['very close valid WACC and perpetual growth', { ...presets.Anthropic.Base, wacc: .030000000000000002, tg: .03 }],
  ]) {
    const exactUrl = scenarioUrl(baseUrl, { company: 'Anthropic', scenario: 'Base', assumptions, bridge: null });
    const exact = await freshShared(exactUrl);
    check(`Shared ${name} remains a valid model`, await exact.page.locator('[data-result-ev]').count(), 1);
    if (await exact.page.locator('#export-json').isEnabled()) {
      const exported = await exportJson(exact.page, name.startsWith('high') ? 'restored-high-precision' : 'restored-close-wacc');
      check(`Shared ${name} preserves all 13 inputs exactly`, exported.assumptions, assumptions);
      check(`Shared ${name} preserves the exact engine EV`, exported.result.ev, project(assumptions).ev);
    } else failures.push({ name: `Shared ${name} cannot export because the restored case is invalid` });
    await exact.context.close();
  }

  const delayedContext = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  await delayedContext.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => new Promise(resolve => { window.__copiedText = text; window.__finishClipboard = resolve; }) } }));
  const delayed = track(await delayedContext.newPage());
  await delayed.goto(baseUrl, { waitUntil: 'networkidle' });
  await delayed.locator('#share-scenario').click();
  await delayed.waitForFunction(() => typeof window.__finishClipboard === 'function');
  await delayed.locator('#input-g1').fill('48');
  await delayed.evaluate(() => { window.__finishClipboard(); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  check('Delayed clipboard success cannot resurrect stale share confirmation after an edit', !(await delayed.locator('#portable-status').innerText()).includes('copied'));
  check('Delayed clipboard success leaves the stale share area hidden', await delayed.locator('#share-link-area').isHidden());
  await delayedContext.close();

  const noClipboardContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await noClipboardContext.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  const mobile = track(await noClipboardContext.newPage());
  await mobile.goto(sharedUrl, { waitUntil: 'networkidle' });
  await mobile.locator('#share-scenario').click();
  check('A browser without the Clipboard API still exposes a usable link', await mobile.locator('#share-link-area').isVisible());
  check('A browser without the Clipboard API explains manual copying', (await mobile.locator('#portable-status').innerText()).includes('Select and copy'));
  check('The mobile share link contains the exact restored current assumptions', decodeScenario(new URL(await mobile.locator('#share-url').inputValue()).hash.slice('#scenario='.length)).assumptions, edited);
  for (const width of [360, 390, 768]) {
    await mobile.setViewportSize({ width, height: 844 });
    check(`${width}px portable controls and full share URL have no page overflow`, await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.locator('.export-bar').scrollIntoViewIfNeeded();
  await mobile.locator('#share-url').blur();
  await mobile.screenshot({ path: `${qa}/mobile-share-controls.png` });
  await noClipboardContext.close();
  check('No portability browser runtime exceptions occurred', browserErrors, []);
} catch (error) {
  failures.push({ name: 'Portability browser flow could not continue', message: error.stack || error.message });
} finally {
  await browser.close();
  const summary = { passed: checks.length, failed: failures.length, checks, failures, browserErrors, artifacts, pdf: pdfSummary };
  await writeFile(`${qa}/browser-checks.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length) process.exitCode = 1;
}
