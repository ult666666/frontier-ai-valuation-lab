// Optional browser QA; run against a started application. See docs/VERIFICATION.md.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.env.FRONTIER_PROJECT_ROOT || process.cwd());
const { project } = await import(pathToFileURL(`${root}/public/lib/model.js`).href);
const require = createRequire(`${root}/package.json`);
const { chromium } = require(process.env.FRONTIER_PLAYWRIGHT_MODULE || 'playwright');
const presets = JSON.parse(await readFile(`${root}/public/data/presets.json`, 'utf8'));
const research = JSON.parse(await readFile(`${root}/public/data/research.json`, 'utf8'));
const checks = [];
const browserErrors = [];
const qa = `${root}/qa-local`;
await mkdir(qa, { recursive: true });
await mkdir(`${root}/docs`, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.FRONTIER_CHROMIUM_EXECUTABLE || undefined, args: process.env.FRONTIER_CHROMIUM_EXECUTABLE ? ['--no-sandbox', '--no-zygote', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', error => browserErrors.push(error.message));
const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push(name); };
const near = (name, actual, expected, tolerance = 1e-8) => { assert.ok(Math.abs(actual - expected) < tolerance, `${name}: ${actual} != ${expected}`); checks.push(name); };
const ev = async () => Number(await page.locator('[data-result-ev]').getAttribute('data-result-ev'));
const input = (key, value) => page.locator(`#input-${key}`).fill(String(value));
const reset = () => page.locator('#reset-scenario').click();
try {
  await page.goto(process.env.FRONTIER_BASE_URL || 'http://127.0.0.1:4321/', { waitUntil: 'networkidle' });
  await page.locator('[data-result-ev]').waitFor();
  near('Default Anthropic Base agrees with shared engine', await ev(), project(presets.Anthropic.Base).ev);
  check('Two comparison companies appear', await page.locator('.company-overview').count(), 2);
  check('All assumption inputs retain labels', await page.locator('#assumptions-form input').evaluateAll(inputs => inputs.every(element => Boolean(element.labels?.length))), true);
  check('Pristine page has no desktop overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${qa}/desktop-full.png`, fullPage: true });
  await page.screenshot({ path: `${qa}/desktop-top.png` });
  const bounds = await page.locator('.section-navigation').boundingBox();
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), Math.max(0, bounds.y - 20));
  await page.screenshot({ path: `${root}/docs/demo-desktop.png` });

  await input('g1', 60);
  const edited = { ...presets.Anthropic.Base, g1: .6 };
  near('Percentage input uses decimal model units', await ev(), project(edited).ev);
  check('Edited scenario is labeled', await page.locator('#case-label').innerText(), 'Base · edited');
  const apiRequest = page.waitForRequest(request => request.url().endsWith('/api/valuation'));
  await page.locator('#verify-server').click();
  check('API receives current edited inputs', (await apiRequest).postDataJSON().assumptions.g1, .6);
  await page.locator('#api-status.success').waitFor();
  checks.push('Real Node API verifies current scenario');

  await input('g1', '');
  check('Blank input removes stale EV', await page.locator('[data-result-ev]').count(), 0);
  check('Blank input removes stale chart', await page.locator('#forecast-chart svg').count(), 0);
  check('Blank input disables JSON', await page.locator('#export-json').isDisabled(), true);
  check('Blank input disables CSV', await page.locator('#export-csv').isDisabled(), true);
  check('Blank input removes API success', await page.locator('#api-status.success').count(), 0);
  await input('g1', -1);
  check('Out-of-range input suppresses current value', await page.locator('[data-result-ev]').count(), 0);
  await reset();
  await input('wacc', 3);
  check('Singular WACC and terminal growth are rejected', await page.locator('[data-result-ev]').count(), 0);
  await reset();
  await input('rev2026', '1e309');
  check('Non-finite input suppresses current value', await page.locator('[data-result-ev]').count(), 0);
  await reset();
  near('Reset recovers exact current preset', await ev(), project(presets.Anthropic.Base).ev);

  await page.locator('[data-scenario="Bear"]').click();
  near('Negative enterprise value remains negative', await ev(), project(presets.Anthropic.Bear).ev);
  assert.match(await page.locator('.ev-primary').innerText(), /−\$/);
  checks.push('Negative EV has a visible minus sign');
  await page.locator('[data-metric="fcf"]').click();
  const negativeBars = await page.locator('#forecast-chart rect').evaluateAll(rects => rects.filter(rect => rect.querySelector('title')?.textContent.includes('−$')).map(rect => ({ y: Number(rect.getAttribute('y')), height: Number(rect.getAttribute('height')) })));
  const zeroY = Number(await page.locator('.chart-zero-line').getAttribute('y1'));
  check('Negative FCFF bars extend below zero', negativeBars.length > 0 && negativeBars.every(bar => Math.abs(bar.y - zeroY) < .001 && bar.height > 0), true);
  await page.locator('.company-switch [data-company="OpenAI"]').click();
  await page.locator('[data-scenario="Base"]').click();
  near('Company and case switch to OpenAI Base', await ev(), project(presets.OpenAI.Base).ev);
  await input('g1', 55);
  const openaiEdited = { ...presets.OpenAI.Base, g1: .55 };
  near('OpenAI edit recalculates the model', await ev(), project(openaiEdited).ev);
  const jsonDownload = page.waitForEvent('download');
  await page.locator('#export-json').click();
  const downloadedJson = await jsonDownload;
  await downloadedJson.saveAs(`${qa}/current-scenario.json`);
  const exportedJson = JSON.parse(await readFile(`${qa}/current-scenario.json`, 'utf8'));
  check('JSON export contains current assumptions', exportedJson.assumptions.g1, .55);
  near('JSON export contains current EV', exportedJson.result.ev, project(openaiEdited).ev);
  check('JSON retains research date and cutoff', [exportedJson.researchAsOf, exportedJson.researchCutoff], [research.asOf, research.researchCutoff]);
  check('JSON embeds all current source IDs', exportedJson.evidenceSnapshot.sources.map(source => source.id), research.sources.map(source => source.id));
  check('JSON embeds selected company evidence', exportedJson.evidenceSnapshot.company, research.companies.OpenAI);
  check('JSON embeds the current model version', exportedJson.modelVersion, research.modelVersion);
  check('JSON does not manufacture an equity bridge', exportedJson.hypotheticalEquityBridge, null);
  const csvDownload = page.waitForEvent('download');
  await page.locator('#export-csv').click();
  await (await csvDownload).saveAs(`${qa}/current-forecast.csv`);
  const csv = (await readFile(`${qa}/current-forecast.csv`, 'utf8')).replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  check('CSV contains the stub and 10 explicit years', csv.length, 12);
  check('CSV columns remain aligned', csv.every(row => row.split(',').length === 19), true);
  near('CSV uses current first forecast revenue', Number(csv[2].split(',')[6]), project(openaiEdited).rows[0].revenue);

  await page.locator('.local-scenarios summary').click();
  await page.locator('#save-name').fill('QA growth case <safe>');
  await page.locator('#save-scenario').click();
  const selectedSave = await page.locator('#saved-scenarios').inputValue();
  check('Local save creates a named record', Boolean(selectedSave), true);
  await reset();
  await page.locator('#load-scenario').click();
  near('Local load restores edited assumptions', await ev(), project(openaiEdited).ev);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-result-ev]').waitFor();
  await page.locator('.local-scenarios summary').click();
  await page.locator('#saved-scenarios').selectOption(selectedSave);
  await page.locator('#load-scenario').click();
  near('Local scenario persists through reload', await ev(), project(openaiEdited).ev);
  check('Saved user text is escaped in the UI', await page.locator('#case-label svg').count(), 0);

  await page.locator('#reverse-target').fill(String(project(openaiEdited).ev));
  await page.locator('#solve-reverse').click();
  assert.match(await page.locator('#reverse-output').innerText(), /55\.0%/);
  checks.push('Reverse DCF recovers active early growth for its own EV');
  await page.locator('#reverse-target').fill('1000000000000');
  await page.locator('#solve-reverse').click();
  assert.match(await page.locator('#reverse-output').innerText(), /not reachable/i);
  checks.push('Unreachable reverse target is explicit');
  await page.locator('#reverse-target').fill('0');
  check('Nonpositive reverse target is rejected', await page.locator('#solve-reverse').isDisabled(), true);

  const multiple = { rev2026: 53.26, g1: .45, g2: .2, g3: .03, m27: -.2, m30: .05, m36: .12, turns: 1.5, wacc: .125, tg: .03, roic: .2, stub: -3, tax: .25 };
  const percentFields = new Set(['g1','g2','g3','m27','m30','m36','wacc','tg','roic','tax']);
  for (const [key, value] of Object.entries(multiple)) await input(key, percentFields.has(key) ? value * 100 : value);
  await page.locator('#reverse-target').fill('5');
  await page.locator('#solve-reverse').click();
  assert.match(await page.locator('#reverse-output').innerText(), /More than one growth path/);
  checks.push('Nonmonotonic reverse case exposes multiple solutions');
  await reset();

  await page.locator('#bridge-details summary').click();
  await page.locator('#bridge-enabled').check();
  await page.locator('#bridge-cash').fill('10');
  await page.locator('#bridge-debt').fill('2');
  await page.locator('#bridge-claims').fill('3');
  const expectedEquity = project(presets.OpenAI.Base).ev + 5;
  assert.match(await page.locator('#bridge-output').innerText(), new RegExp(expectedEquity.toFixed(1).replace('.', '\\.')));
  checks.push('Hypothetical bridge adds cash and subtracts debt and claims');
  await page.locator('#bridge-cash').fill('');
  check('Blank bridge removes stale equity output', await page.locator('#bridge-output strong').count(), 0);
  check('Invalid enabled bridge pauses JSON export', await page.locator('#export-json').isDisabled(), true);
  await page.locator('#bridge-enabled').uncheck();
  check('Disabling bridge restores valid scenario export', await page.locator('#export-json').isDisabled(), false);

  await page.locator('#tab-sources').click();
  check('Source register includes all source records', await page.locator('.source-entry').count(), 19);
  await page.locator('.evidence-company .source-link').first().click();
  check('Internal source link focuses its evidence record', await page.evaluate(() => document.activeElement.id.startsWith('source-')), true);
  await page.locator('#tab-sources').focus();
  await page.keyboard.press('ArrowRight');
  check('Keyboard tab navigation opens methodology', await page.locator('#panel-methodology').isVisible(), true);
  await page.keyboard.press('Home');
  check('Keyboard Home restores model tab', await page.locator('#panel-model').isVisible(), true);

  let requestSeen;
  const requested = new Promise(resolve => { requestSeen = resolve; });
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  await page.route('**/api/valuation', async route => {
    const captured = route.request().postDataJSON().assumptions;
    requestSeen();
    await delayed;
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelVersion: '3.0.0', valuationDate: '2026-10-18', result: project(captured) }) }); } catch {}
  });
  await page.locator('#verify-server').click();
  await requested;
  await input('g1', 51);
  release();
  await page.waitForFunction(() => !document.querySelector('#verify-server').disabled);
  check('An edited in-flight request cannot produce stale success', await page.locator('#api-status.success').count(), 0);
  await page.unroute('**/api/valuation');
  await page.route('**/api/valuation', route => route.fulfill({ status: 404, body: 'Not found' }));
  await page.locator('#verify-server').click();
  await page.locator('#api-status.warning').waitFor();
  assert.match(await page.locator('#api-status').innerText(), /unavailable/i);
  check('Unavailable server retains valid browser results', await page.locator('[data-result-ev]').count(), 1);
  await page.unroute('**/api/valuation');
  await page.route('**/api/valuation', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelVersion: '3.0.0', valuationDate: '2026-10-18', result: project(presets.Anthropic.Base) }) }));
  await page.locator('#verify-server').click();
  await page.locator('#api-status.error').waitFor();
  assert.match(await page.locator('#api-status').innerText(), /differs/);
  checks.push('Mismatched server output fails verification');
  await page.unroute('**/api/valuation');

  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
  const staticServer = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (!path.startsWith('/frontier-ai-valuation-lab/') || path.includes('/api/')) { response.writeHead(404).end('Not found'); return; }
    const relative = path.slice('/frontier-ai-valuation-lab/'.length) || 'index.html';
    const filename = resolve(root, 'public', relative);
    if (!filename.startsWith(`${root}/public/`)) { response.writeHead(403).end(); return; }
    try { const content = await readFile(filename); response.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream' }); response.end(content); } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve));
  try {
    const staticPage = await context.newPage();
    await staticPage.goto(`http://127.0.0.1:${staticServer.address().port}/frontier-ai-valuation-lab/`, { waitUntil: 'networkidle' });
    await staticPage.locator('[data-result-ev]').waitFor();
    near('Static repository-subpath hosting loads engine and data', Number(await staticPage.locator('[data-result-ev]').getAttribute('data-result-ev')), project(presets.Anthropic.Base).ev);
    await staticPage.locator('#verify-server').click();
    await staticPage.locator('#api-status.warning').waitFor();
    assert.match(await staticPage.locator('#api-status').innerText(), /unavailable/);
    checks.push('Static subpath reports its missing API honestly');
    await staticPage.close();
  } finally { await new Promise(resolve => staticServer.close(resolve)); }

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', error => browserErrors.push(error.message));
  await mobile.goto(process.env.FRONTIER_BASE_URL || 'http://127.0.0.1:4321/', { waitUntil: 'networkidle' });
  await mobile.locator('[data-result-ev]').waitFor();
  check('Mobile layout has no horizontal page overflow', await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.screenshot({ path: `${qa}/mobile-top.png` });
  await mobile.screenshot({ path: `${qa}/mobile-full.png`, fullPage: true });
  await mobile.locator('.valuation-section').scrollIntoViewIfNeeded();
  await mobile.screenshot({ path: `${qa}/mobile-model.png` });
  await mobile.locator('#input-g1').fill('46');
  near('Mobile edits recalculate current scenario', Number(await mobile.locator('[data-result-ev]').getAttribute('data-result-ev')), project({ ...presets.Anthropic.Base, g1: .46 }).ev);
  await mobile.locator('#tab-sources').click();
  check('Mobile source register has no page overflow', await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobileContext.close();

  check('No browser runtime exceptions occurred', browserErrors, []);
  await writeFile(`${qa}/frontend-checks.json`, JSON.stringify({ checks, passed: checks.length, browserErrors, screenshot: 'docs/demo-desktop.png' }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, browserErrors, screenshot: 'docs/demo-desktop.png' }, null, 2));
} finally {
  await browser.close();
}
