// Optional end-to-end product checks. Requires the Node app and Playwright.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(process.env.FRONTIER_PROJECT_ROOT||process.cwd());
const require=createRequire(`${root}/package.json`);
const {chromium}=require(process.env.FRONTIER_PLAYWRIGHT_MODULE||`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`);
const {valueHorizon}=await import(pathToFileURL(`${root}/public/lib/horizon.js`).href);
const {horizonUrl,decodeHorizon}=await import(pathToFileURL(`${root}/public/lib/horizon-share.js`).href);
const {scenarioUrl,decodeScenario}=await import(pathToFileURL(`${root}/public/lib/share.js`).href);
const {APP_VERSION}=await import(pathToFileURL(`${root}/public/lib/release.js`).href);
const {MODEL_VERSION,VALUATION_DATE}=await import(pathToFileURL(`${root}/public/lib/model.js`).href);
const presets=JSON.parse(await readFile(`${root}/data/presets.json`,'utf8'));
const base=process.env.FRONTIER_BASE_URL||'http://127.0.0.1:4324/';
const output=resolve(process.env.FRONTIER_HORIZON_QA_DIR||`${root}/qa-local/v3-4/browser`);
await mkdir(output,{recursive:true});
const checks=[],errors=[],requests=[];
const check=(name,actual,expected=true)=>{assert.deepEqual(actual,expected,name);checks.push(name);};
const near=(name,actual,expected)=>{assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=1e-9*Math.max(1,Math.abs(expected)),`${name}: ${actual} != ${expected}`);checks.push(name);};
const browser=await chromium.launch({headless:true,executablePath:process.env.FRONTIER_CHROMIUM_EXECUTABLE||undefined,args:process.env.FRONTIER_CHROMIUM_EXECUTABLE?['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
const override=process.env.FRONTIER_ALLOW_BROWSER_CERT_OVERRIDE==='1';
const context=await browser.newContext({viewport:{width:1440,height:1100},deviceScaleFactor:1,reducedMotion:'reduce',acceptDownloads:true,ignoreHTTPSErrors:override});
context.setDefaultTimeout(12000);context.setDefaultNavigationTimeout(25000);
await context.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('Clipboard denied by QA fixture','NotAllowedError');}}}));
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(request.url().includes('/api/valuation')&&request.method()==='POST')requests.push(request.postDataJSON());});
const ready=async(target=page)=>{await target.locator('body[data-horizon-state="ready"]').waitFor();};
const value=selector=>page.locator(selector).getAttribute('data-value').then(Number);
const nav=['Overview','Model','Thesis Lab','Value Horizon','Casebook','Evidence'];
const defaultSnapshot={case:{company:'Anthropic',scenario:'Base',assumptions:presets.Anthropic.Base,bridge:null},years:10,target:250};
const wrapped=result=>({appVersion:APP_VERSION,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,result});
let failed=null;
try{
  await page.goto(new URL('horizon.html',base).href,{waitUntil:'networkidle'});await ready();
  check('A fresh visitor opens a populated analysis',await page.locator('#horizon-error').isHidden());
  check('The current horizon is the fourth consistent workspace destination',await page.locator('.app-nav a').allTextContents(),nav);
  check('Only Value Horizon has current navigation state',await page.locator('.app-nav a[aria-current]').allTextContents(),['Value Horizon']);
  check('Opening the demo creates no saved browser research',await page.evaluate(()=>localStorage.length),0);
  check('The years and range inputs have native labels',await page.locator('#horizon-years,#horizon-range,#horizon-target').evaluateAll(inputs=>inputs.every(input=>input.labels.length>0)));
  const baseline=valueHorizon(presets.Anthropic.Base,{years:10,target:250});
  near('Default ten-year EV is the exact finite-continuation result',await value('#horizon-ev'),baseline.selected.ev);
  near('Default excluded tail is calculated',await value('#horizon-excluded'),baseline.selected.excludedTerminalPv);
  check('The target identifies the first complete year',await page.locator('#horizon-target-result').innerText().then(text=>text.includes('11 years')&&text.includes('2047')));
  check('The native range communicates the calendar cutoff',await page.locator('#horizon-range').getAttribute('aria-valuetext'),'10 whole years after 2036; retain cash flows through 2046');
  await page.screenshot({path:`${output}/desktop-default.png`,animations:'disabled'});
  await page.screenshot({path:`${output}/desktop-full.png`,fullPage:true,animations:'disabled'});

  for(const company of ['Anthropic','OpenAI']){
    await page.locator(`[data-horizon-company="${company}"]`).click();
    for(const scenario of ['Bear','Base','Bull']){
      await page.locator('#horizon-preset').selectOption(scenario);
      for(const years of [0,10,100]){
        await page.locator('#horizon-years').fill(String(years));await ready();
        const expected=valueHorizon(presets[company][scenario],{years,target:250});
        near(`${company} ${scenario} ${years}-year EV`,await value('#horizon-ev'),expected.selected.ev);
        near(`${company} ${scenario} ${years}-year excluded tail`,await value('#horizon-excluded'),expected.selected.excludedTerminalPv);
        near(`${company} ${scenario} ${years}-year reconciliation`,await value('#horizon-explicit')+await value('#horizon-retained'),await value('#horizon-reconciled'));
      }
    }
  }
  await page.goto(horizonUrl(new URL('horizon.html',base).href,defaultSnapshot),{waitUntil:'networkidle'});await ready();
  await page.locator('#use-target-horizon').click();
  check('Apply target uses the actual whole-year boundary',await page.locator('#horizon-years').inputValue(),'11');
  near('Applied target recomputes the selected EV',await value('#horizon-ev'),valueHorizon(presets.Anthropic.Base,{years:11,target:250}).selected.ev);
  await page.locator('#horizon-target').fill(String(baseline.baseline.ev));
  check('An exact perpetual target is never labeled a finite solution',await page.locator('#horizon-target-result').getAttribute('data-status'),'asymptotic');
  check('Perpetuity cannot be applied as a finite horizon',await page.locator('#use-target-horizon').isDisabled());
  await page.locator('#horizon-target').fill('367.77129479956005');
  check('An unresolved adjacent floating-point target has an explicit precision state',await page.locator('#horizon-target-result').getAttribute('data-status'),'precision_limit');
  check('An unresolved precision boundary never applies a claimed year',await page.locator('#use-target-horizon').isDisabled());
  await page.locator('#horizon-target').fill('500');
  check('An unreachable target is identified',await page.locator('#horizon-target-result').getAttribute('data-status'),'unreachable');
  await page.locator('#horizon-target').fill('50');
  check('The explicit forecast can meet a target without continuation',await page.locator('#horizon-target-result').getAttribute('data-status'),'explicit');
  await page.locator('#use-target-horizon').click();check('Explicit-only target applies zero years',await page.locator('#horizon-years').inputValue(),'0');
  await page.locator('#horizon-target').fill('');
  check('Blank target explicitly removes the target',await page.locator('#horizon-target-result').getAttribute('data-status'),'none');
  check('No-target state removes the chart target legend',await page.locator('#target-legend').isHidden());
  await page.locator('#horizon-years').fill('10');await page.locator('#horizon-range').focus();await page.keyboard.press('ArrowRight');
  check('Keyboard range control changes a whole year',await page.locator('#horizon-years').inputValue(),'11');
  for(const invalid of ['-1','1.5','101','']){
    await page.locator('#horizon-years').fill(invalid);
    check(`Invalid years ${JSON.stringify(invalid)} clears the current EV`,await page.locator('#horizon-ev').getAttribute('data-value'),'');
    check(`Invalid years ${JSON.stringify(invalid)} pauses share, export and verification`,await page.locator('#horizon-share,#horizon-json,#horizon-brief,#horizon-verify').evaluateAll(buttons=>buttons.every(button=>button.disabled)));
    check(`Invalid years ${JSON.stringify(invalid)} removes a stale model handoff`,await page.locator('#horizon-open-model').getAttribute('href'),null);
    await page.locator('#horizon-years').fill('10');await ready();
  }
  for(const invalid of ['0','-10','1000000000001']){
    await page.locator('#horizon-target').fill(invalid);check(`Invalid target ${invalid} is explicit`,await page.locator('#horizon-target').getAttribute('aria-invalid'),'true');
    check(`Invalid target ${invalid} does not show an old result`,await page.locator('#horizon-ev').getAttribute('data-value'),'');
    await page.locator('#horizon-target').fill('250');await ready();
  }
  await page.locator('#horizon-years').fill('101');await page.locator('#horizon-preset').selectOption('Bull');
  check('Invalid input and a case change clear the old capture date',await page.locator('#capture-description').innerText().then(text=>!text.includes('2063')&&text.includes('Complete')));
  check('Invalid input removes the previous cutoff descriptions',await page.locator('#selected-period,#excluded-period,#retained-label').allTextContents().then(text=>text.every(value=>!value.includes('2046'))));
  check('Invalid input clears the previous assumption caption',await page.locator('#assumptions-caption').innerText().then(text=>!text.includes('Base')));
  await page.locator('#horizon-years').fill('10');await ready();
  await page.locator('#horizon-target').fill('0');await page.locator('[data-horizon-company="OpenAI"]').click();
  check('Company selection remains truthful while a target is invalid',await page.locator('[data-horizon-company="OpenAI"]').getAttribute('aria-pressed'),'true');
  await page.locator('#horizon-target').fill('250');await ready();
  await page.locator('#horizon-preset').selectOption('Bear');
  check('A negative case stays negative in the headline',(await value('#horizon-ev'))<0);
  check('Negative baseline suppresses a misleading concentration percentage',await page.locator('#horizon-interpretation').innerText().then(text=>text.includes('nonpositive')&&text.includes('undefined')));

  const custom={company:'Anthropic',scenario:'Base',assumptions:{...presets.Anthropic.Base,g1:.5212345678912345,wacc:.1234567891234567,m36:.2312345678912345},bridge:{cash:12.345678901234,debt:3.25,otherClaims:1.125}};
  const exact={case:custom,years:27,target:321.1234567891234};
  await page.goto(horizonUrl(new URL('horizon.html',base).href,exact),{waitUntil:'networkidle'});await ready();
  check('The custom-input label is visible',await page.locator('#horizon-case-status').innerText().then(text=>text.includes('Edited inputs')));
  check('A custom case has an explicit preset reset',await page.locator('#horizon-reset').isVisible());
  check('The bridge boundary is visible',await page.locator('#horizon-bridge-note').isVisible());
  await page.locator('[data-horizon-company="Anthropic"]').click();
  await page.locator('#horizon-share').click();
  const exactLink=await page.locator('#horizon-share-url').inputValue();
  check('Exact sharing preserves all 13 inputs, bridge, horizon and target',decodeHorizon(new URL(exactLink).hash.slice('#horizon='.length)),exact);
  check('Clipboard denial exposes the exact selectable link',await page.locator('#horizon-share-area').isVisible());
  check('The Model handoff preserves the complete case',decodeScenario(new URL(await page.locator('#horizon-open-model').getAttribute('href')).hash.slice('#scenario='.length)),custom);
  const beforeInvalid=await value('#horizon-ev');await page.evaluate(()=>{location.hash='horizon=invalid';});await page.locator('#horizon-notice').filter({hasText:'could not be loaded'}).waitFor();
  near('Malformed links leave the current financial result intact',await value('#horizon-ev'),beforeInvalid);
  await page.locator('#horizon-share').click();check('Malformed links leave the complete snapshot intact',decodeHorizon(new URL(await page.locator('#horizon-share-url').inputValue()).hash.slice('#horizon='.length)),exact);
  await page.waitForFunction(()=>!document.querySelector('[data-evidence-key="m36"]').disabled);
  const evidence=page.locator('.evidence-actions [data-evidence-key="m36"]');await evidence.click();await page.locator('dialog[open]').waitFor();
  check('Contextual evidence carries the exact current margin',await page.locator('dialog[open]').innerText().then(text=>text.includes('23.12345678912345')));
  await page.keyboard.press('Escape');check('Closing evidence restores focus',await evidence.evaluate(element=>document.activeElement===element));
  await page.locator('#horizon-assumptions').evaluate(element=>{element.open=true;});
  check('All thirteen assumptions remain inspectable',await page.locator('[data-horizon-input]').count(),13);
  await page.locator('#horizon-assumptions').evaluate(element=>{element.open=false;});

  let downloadEvent=page.waitForEvent('download');await page.locator('#horizon-json').click();let downloaded=await downloadEvent;
  const jsonPath=`${output}/custom-horizon.json`;await downloaded.saveAs(jsonPath);const exported=JSON.parse(await readFile(jsonPath,'utf8'));
  check('Analysis JSON is explicitly a separate horizon format',exported.kind,'frontier-value-horizon');check('JSON export carries the exact snapshot',exported.snapshot,exact);
  check('JSON includes every curve point',exported.result.curve.length,101);check('JSON recalculates the full result',exported.result,valueHorizon(custom.assumptions,{years:27,target:exact.target}));
  downloadEvent=page.waitForEvent('download');await page.locator('#horizon-brief').click();downloaded=await downloadEvent;
  const briefPath=`${output}/custom-horizon.html`;await downloaded.saveAs(briefPath);const brief=await readFile(briefPath,'utf8');
  check('The exported brief is script-free',!/<script\b/i.test(brief));check('The exported brief retains the exact horizon URL',brief.includes(exactLink.replaceAll('&','&amp;')));check('The brief explains the zero residual',/zero residual/i.test(brief));

  await page.locator('#horizon-verify').click();await page.locator('#horizon-api-status[data-tone="success"]').waitFor();
  check('The full real API calculation is verified',await page.locator('#horizon-api-status').innerText().then(text=>text.includes('full curve')&&text.includes('target requirement')));
  check('API sends only the exact operating assumptions and lens parameters',requests.at(-1),{action:'horizon',assumptions:custom.assumptions,years:27,target:exact.target});
  check('The API request carries no transported bridge or research record',!Object.hasOwn(requests.at(-1),'bridge')&&!Object.hasOwn(requests.at(-1),'notes'));
  await page.route('**/api/valuation',async route=>{const body=route.request().postDataJSON(),result=valueHorizon(body.assumptions,{years:body.years,target:body.target});result.curve[64].retainedTerminalPv+=1;await route.fulfill({json:wrapped(result)});});
  await page.locator('#horizon-verify').click();await page.locator('#horizon-api-status[data-tone="error"]').waitFor();
  check('A mismatch in an unselected curve point fails verification',await page.locator('#horizon-api-status').innerText().then(text=>text.includes('differs')));
  await page.unroute('**/api/valuation');
  let releaseResponse;const pending=new Promise(resolve=>{releaseResponse=resolve;});
  await page.route('**/api/valuation',async route=>{const body=route.request().postDataJSON();await pending;try{await route.fulfill({json:wrapped(valueHorizon(body.assumptions,{years:body.years,target:body.target}))});}catch{/* Expected abort after an edit. */}});
  await page.locator('#horizon-verify').click();await page.locator('#horizon-api-status').filter({hasText:'Comparing'}).waitFor();await page.locator('#horizon-years').fill('30');releaseResponse();
  check('An edit immediately invalidates the in-flight verification',await page.locator('#horizon-api-status').getAttribute('data-tone'),'neutral');
  await page.unroute('**/api/valuation');
  await page.route('**/api/valuation',route=>route.fulfill({status:503,json:{error:'QA unavailable fixture'}}));await page.locator('#horizon-verify').click();await page.locator('#horizon-api-status[data-tone="error"]').waitFor();
  near('Unavailable API retains the current local calculation',await value('#horizon-ev'),valueHorizon(custom.assumptions,{years:30,target:exact.target}).selected.ev);
  check('An old success cannot replace the changed-input state',await page.locator('#horizon-verify').innerText().then(text=>!text.includes('Verified through')));
  await page.unroute('**/api/valuation');

  await page.goto(scenarioUrl(new URL('index.html',base).href,custom),{waitUntil:'networkidle'});await page.locator('[data-result-ev]').waitFor({state:'attached'});
  const popupEvent=context.waitForEvent('page');await page.locator('#open-horizon').click();const popup=await popupEvent;await popup.waitForLoadState('networkidle');await ready(popup);
  check('Workbench opens a populated horizon for the exact current case',decodeScenario(new URL(popup.url()).hash.slice('#scenario='.length)),custom);
  check('Opening the horizon preserves the original workbench tab',new URL(page.url()).pathname.endsWith('index.html'));
  check('The new horizon starts with a visible default target',await popup.locator('#horizon-target').inputValue(),'250');await popup.close();

  await page.goto(horizonUrl(new URL('horizon.html',base).href,defaultSnapshot),{waitUntil:'networkidle'});await ready();
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:width<600?844:1100});
    check(`No horizontal page overflow at ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check(`All workspace destinations remain visible at ${width}px`,await page.locator('.app-nav a:visible').count(),6);
    check(`Chart coordinates are finite at ${width}px`,await page.locator('#horizon-chart svg').evaluate(svg=>!/(?:NaN|Infinity)/.test(svg.outerHTML)));
    check(`Responsive copy keeps separate words at ${width}px`,await page.locator('#method-title,.intro-note>p').allInnerTexts().then(text=>text.every(value=>!value.includes('boundaryon')&&!value.includes('more.Choose'))));
    if(width===390)await page.screenshot({path:`${output}/mobile-full.png`,fullPage:true,animations:'disabled'});
  }
  const captureBoundary={...defaultSnapshot,case:{...defaultSnapshot.case,assumptions:{...presets.Anthropic.Base,wacc:.5874010519681995,tg:0}}};
  await page.goto(horizonUrl(new URL('horizon.html',base).href,captureBoundary),{waitUntil:'networkidle'});await ready();
  check('A capture threshold near a whole-year boundary is visibly unresolved',await page.locator('#horizon-milestones').innerText().then(text=>/75% of terminal PV\s*Precision limit/.test(text)));
  await page.locator('#horizon-verify').click();await page.locator('#horizon-api-status[data-tone="success"]').waitFor();
  check('API verification includes the unresolved capture status',await page.locator('#horizon-api-status').getAttribute('data-tone'),'success');
  const nearSingular={...defaultSnapshot,case:{...defaultSnapshot.case,assumptions:{...presets.Anthropic.Base,wacc:.030000000000000006}},target:1e12};
  await page.goto(horizonUrl(new URL('horizon.html',base).href,nearSingular),{waitUntil:'networkidle'});await ready();
  check('A target beyond the bounded search is distinguished from unreachable',await page.locator('#horizon-target-result').getAttribute('data-status'),'beyond_range');
  check('Extreme valid inputs retain finite chart coordinates',await page.locator('#horizon-chart svg').evaluate(svg=>!/(?:NaN|Infinity)/.test(svg.outerHTML)));
  check('No functional browser errors occurred',errors,[]);
}catch(error){failed=error.stack||String(error);}
finally{
  const report={status:failed?'fail':'pass',testedAtUtc:new Date().toISOString(),baseUrl:base,appVersion:APP_VERSION,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,checks:checks.length,passed:checks,browserErrors:errors,browserCertificateOverride:override,error:failed};
  await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({status:report.status,checks:checks.length,browserErrors:errors,error:failed}));
}
if(failed)process.exitCode=1;
