// Complete financing workflow against the rendered product and its real API.
// Numeric finance independence is checked separately by check_financing_reference.py.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(process.env.FRONTIER_PROJECT_ROOT||process.cwd());
const require=createRequire(`${root}/package.json`);
const {chromium}=require(process.env.FRONTIER_PLAYWRIGHT_MODULE||`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`);
const {financingLens}=await import(pathToFileURL(`${root}/public/lib/financing.js`).href);
const {financingUrl,decodeFinancing}=await import(pathToFileURL(`${root}/public/lib/financing-share.js`).href);
const {scenarioUrl}=await import(pathToFileURL(`${root}/public/lib/share.js`).href);
const {APP_VERSION}=await import(pathToFileURL(`${root}/public/lib/release.js`).href);
const {MODEL_VERSION,VALUATION_DATE}=await import(pathToFileURL(`${root}/public/lib/model.js`).href);
const presets=JSON.parse(await readFile(`${root}/data/presets.json`,'utf8'));
const base=process.env.FRONTIER_BASE_URL||'http://127.0.0.1:4335/';
const output=resolve(process.env.FRONTIER_FINANCING_QA_DIR||`${root}/qa-local/v3-5/financing-browser`);
await mkdir(output,{recursive:true});
const checks=[],errors=[],requests=[];
const check=(label,actual,expected=true)=>{assert.deepEqual(actual,expected,label);checks.push(label);};
const near=(label,actual,expected)=>{assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=1e-9*Math.max(1,Math.abs(expected)),`${label}: ${actual} != ${expected}`);checks.push(label);};
const override=process.env.FRONTIER_ALLOW_BROWSER_CERT_OVERRIDE==='1';
const browser=await chromium.launch({headless:true,executablePath:process.env.FRONTIER_CHROMIUM_EXECUTABLE||'/tmp/frontier-chromium-runtime/chromium',args:['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1100},deviceScaleFactor:1,reducedMotion:'reduce',acceptDownloads:true,ignoreHTTPSErrors:override});
context.setDefaultTimeout(12000);context.setDefaultNavigationTimeout(25000);
await context.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('Clipboard unavailable in the test fixture','NotAllowedError');}}}));
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(request.url().includes('/api/valuation')&&request.method()==='POST'){const body=request.postDataJSON();if(body?.action==='financing')requests.push(body);}});
const ready=async(target=page)=>{await target.locator('[data-result-ev]').waitFor({state:'attached'});await target.locator('#financing').waitFor({state:'attached'});};
const metric=name=>page.locator(`[data-financing-metric="${name}"]`);
const value=async name=>{const raw=await metric(name).getAttribute('data-value');return raw===null?null:Number(raw);};
const share=async()=>{await page.locator('#financing-share').click();await page.locator('#financing-share-area:not([hidden])').waitFor();return page.locator('#financing-share-url').inputValue();};
const snapshot=async()=>decodeFinancing(new URL(await share()).hash.slice('#financing='.length));
const example={case:{company:'Anthropic',scenario:'Base',assumptions:presets.Anthropic.Base,bridge:{cash:20,debt:5,otherClaims:0}},round:{basis:'pre',quote:250,primaryCapital:25,holderStake:.1}};
const compute=item=>financingLens(item.case.assumptions,{bridge:item.case.bridge,round:item.round});
const wrapped=result=>({appVersion:APP_VERSION,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,result});
const noOldMetrics=()=>page.locator('[data-financing-metric]').evaluateAll(elements=>elements.every(element=>!element.hasAttribute('data-value')&&element.textContent.trim()==='—'));
const outputButtons='#financing-verify,#financing-share,#financing-json,#financing-brief';
let failed=null;
try{
  await page.goto(new URL('index.html#model',base).href,{waitUntil:'networkidle'});await ready();
  check('An ordinary Model visit does not enable a fabricated private-company balance sheet',await page.locator('#bridge-enabled').isChecked(),false);
  check('Without an explicit bridge the use-modeled-equity action is unavailable',await page.locator('#financing-use-model').isDisabled());
  check('Without a bridge there is no modeled equity comparison',await value('modelPreMoneyEquity'),null);
  check('Financing controls have associated native labels',await page.locator('#financing-basis,#financing-quote,#financing-capital,#financing-stake').evaluateAll(inputs=>inputs.every(input=>input.labels.length>0)));
  check('Opening the model does not save synthetic portfolio records',await page.evaluate(()=>localStorage.length),0);

  await page.locator('#financing-example').click();
  check('The worked example focuses the financing section',await page.evaluate(()=>document.activeElement.id),'financing');
  const expected=compute(example);
  for(const name of ['preMoney','postMoney','newOwnership','holderBefore','holderAfter','holderDilution'])near(`The worked example calculates ${name}`,await value(name),expected.pricing[name]);
  for(const name of ['modelPreMoneyEquity','modelPostMoneyEquity','operatingEvBefore','operatingEvAfter','roundImpliedOperatingEv','priceGap','priceGapPercent'])near(`The visible model comparison calculates ${name}`,await value(name),expected.comparison[name]);
  near('Retained primary cash preserves operating EV',await value('operatingEvAfter'),await value('operatingEvBefore'));
  check('The stake control shows percent while the snapshot carries a fraction',Number(await page.locator('#financing-stake').inputValue()),10);
  check('The worked cash bridge is visibly hypothetical',await page.locator('#financing').innerText().then(text=>/hypothetical/i.test(text)));
  await page.locator('#financing').scrollIntoViewIfNeeded();
  await page.screenshot({path:`${output}/desktop-example.png`,animations:'disabled'});
  check('The example is a complete explicit snapshot',await snapshot(),example);

  await page.locator('#financing-basis').selectOption('post');
  check('Changing quote interpretation keeps the entered quote fixed',await page.locator('#financing-quote').inputValue(),'250');
  near('A 250 post-money quote with 25 primary capital has 225 pre-money',await value('preMoney'),225);
  near('Post-money interpretation retains the headline quote',await value('postMoney'),250);
  await page.locator('#financing-basis').selectOption('pre');
  await page.locator('#financing-capital').fill('0');
  near('A zero-capital round issues no new ownership',await value('newOwnership'),0);
  near('Zero new shares preserve the existing holding',await value('holderAfter'),.1);
  await page.locator('#financing-capital').fill('25');
  await page.locator('#financing-stake').fill('100');near('A 100-percent existing holder retains the whole existing-share pool',await value('holderAfter'),250/275);
  await page.locator('#financing-stake').fill('10');
  await page.locator('#financing-use-model').click();
  near('Using modeled pre-money equity copies the current hypothetical equity residual',Number(await page.locator('#financing-quote').inputValue()),await value('modelPreMoneyEquity'));
  await page.locator('#financing-basis').selectOption('post');await page.locator('#financing-use-model').click();
  near('Using modeled post-money equity includes the entered primary capital once',Number(await page.locator('#financing-quote').inputValue()),await value('modelPostMoneyEquity'));
  const copied=await page.locator('#financing-quote').inputValue();
  await page.locator('#input-m36').fill('31');
  check('A later model edit leaves the explicitly copied quote independently editable',await page.locator('#financing-quote').inputValue(),copied);

  await page.goto(new URL('index.html#financing-example',base).href,{waitUntil:'networkidle'});await ready();
  check('The public worked-example route focuses the destination',await page.evaluate(()=>document.activeElement.id),'financing');
  check('The public worked-example route reproduces the full sample',await snapshot(),example);
  for(const [selector,bad,good] of [
    ['#financing-quote','', '250'],['#financing-quote','0','250'],
    ['#financing-capital','-1','25'],['#financing-stake','101','10'],
  ]){
    await page.locator(selector).fill(bad);
    check(`Invalid ${selector}=${JSON.stringify(bad)} clears every old numeric claim`,await noOldMetrics());
    check(`Invalid ${selector} disables export, share and verification`,await page.locator(outputButtons).evaluateAll(buttons=>buttons.every(button=>button.disabled)));
    check(`Invalid ${selector} has a visible validation explanation`,await page.locator('#financing-error').isVisible());
    await page.locator(selector).fill(good);
  }
  await page.locator('#financing-basis').selectOption('post');await page.locator('#financing-quote').fill('25');
  check('Post-money equal to capital clears the previous result',await noOldMetrics());
  await page.locator('#financing-quote').fill('250');await page.locator('#financing-basis').selectOption('pre');
  await page.locator('#bridge-details').evaluate(element=>{element.open=true;});
  await page.locator('#bridge-cash').fill('');
  check('An enabled but incomplete bridge does not silently become zero cash',await noOldMetrics());
  await page.locator('#bridge-enabled').uncheck();
  near('Explicitly disabling the bridge retains the independent pricing illustration',await value('preMoney'),250);
  check('Disabling the bridge removes unsupported modeled balance-sheet outputs',await value('modelPreMoneyEquity'),null);

  const custom={case:{company:'Anthropic',scenario:'Base',assumptions:{
    rev2026:87.123456789,g1:.4123456789,g2:.2345678912,g3:.0987654321,
    m27:-.2345678912,m30:.1234567891,m36:.2987654321,turns:3.456789123,
    wacc:.1434567891,tg:.0234567891,roic:.2234567891,stub:-4.56789123,tax:.1934567891,
  },bridge:{cash:12.345678901234,debt:3.25,otherClaims:1.125}},round:{basis:'post',quote:333.123456789,primaryCapital:17.987654321,holderStake:.1234567891234567}};
  await page.goto(financingUrl(new URL('index.html',base).href,custom),{waitUntil:'networkidle'});await ready();
  const exactLink=await share();
  check('Share preserves all thirteen assumptions, the full bridge, and the exact round',decodeFinancing(new URL(exactLink).hash.slice('#financing='.length)),custom);
  check('Clipboard denial exposes a selectable exact link',await page.locator('#financing-share-url').isVisible());
  await page.reload({waitUntil:'networkidle'});await ready();
  check('Reloading a shared analysis retains every exact value',await snapshot(),custom);
  let downloadEvent=page.waitForEvent('download');await page.locator('#financing-json').click();let download=await downloadEvent;
  const jsonPath=`${output}/custom-financing.json`;await download.saveAs(jsonPath);
  const exported=JSON.parse(await readFile(jsonPath,'utf8'));
  check('The analysis JSON has its own declared format',exported.kind,'frontier-financing-lens');
  check('JSON retains the exact complete snapshot',exported.snapshot,custom);
  check('JSON retains the complete independently inspectable result',exported.result,compute(custom));
  downloadEvent=page.waitForEvent('download');await page.locator('#financing-brief').click();download=await downloadEvent;
  const htmlPath=`${output}/custom-financing.html`;await download.saveAs(htmlPath);const brief=await readFile(htmlPath,'utf8');
  check('The portable brief has no executable scripts',!/<script\b/i.test(brief));
  check('The portable brief contains the exact reproducible URL',brief.includes(exactLink.replaceAll('&','&amp;')));
  check('The portable brief explains the retained-cash boundary',/retain[\s\S]{0,60}cash|cash[\s\S]{0,60}retain/i.test(brief));

  await page.locator('#financing-verify').click();await page.locator('#financing-api-status[data-tone="ok"]').waitFor();
  check('The real calculation API verifies the complete financing analysis',await page.locator('#financing-api-status').getAttribute('data-tone'),'ok');
  check('The API request contains only the exact declared financial inputs',requests.at(-1),{action:'financing',assumptions:custom.case.assumptions,bridge:custom.case.bridge,round:custom.round});
  await page.route('**/api/valuation',async route=>{
    const body=route.request().postDataJSON();if(body.action!=='financing')return route.continue();
    const result=financingLens(body.assumptions,{bridge:body.bridge,round:body.round});result.pricing.otherExistingAfter+=.01;
    await route.fulfill({json:wrapped(result)});
  });
  await page.locator('#financing-verify').click();await page.locator('#financing-api-status[data-tone="error"]').waitFor();
  check('A mismatch outside the headline metrics fails whole-result verification',await page.locator('#financing-api-status').getAttribute('data-tone'),'error');
  await page.unroute('**/api/valuation');
  let releaseResponse;const pending=new Promise(resolve=>{releaseResponse=resolve;});
  await page.route('**/api/valuation',async route=>{
    const body=route.request().postDataJSON();if(body.action!=='financing')return route.continue();
    await pending;try{await route.fulfill({json:wrapped(financingLens(body.assumptions,{bridge:body.bridge,round:body.round}))});}catch{/* A changed request is deliberately aborted. */}
  });
  await page.locator('#financing-verify').click();await page.locator('#financing-api-status[data-tone="pending"]').waitFor();
  await page.locator('#financing-capital').fill('30');releaseResponse();
  check('Editing invalidates an in-flight verification immediately',await page.locator('#financing-api-status').getAttribute('data-tone'),'idle');
  await page.unroute('**/api/valuation');
  await page.route('**/api/valuation',route=>route.request().postDataJSON().action==='financing'?route.fulfill({status:503,json:{error:'Unavailable API test fixture'}}):route.continue());
  await page.locator('#financing-verify').click();await page.locator('#financing-api-status[data-tone="error"]').waitFor();
  near('An unavailable API retains the current local pricing calculation',await value('preMoney'),custom.round.quote-30);
  await page.unroute('**/api/valuation');
  await page.locator('#financing-verify').click();await page.locator('#financing-api-status[data-tone="ok"]').waitFor();
  check('The newest request can verify after the stale request was aborted',requests.at(-1).round.primaryCapital,30);

  const negative={...example,case:{...example.case,bridge:{cash:0,debt:10000,otherClaims:10000}}};
  await page.goto(financingUrl(new URL('index.html',base).href,negative),{waitUntil:'networkidle'});await ready();
  check('A negative modeled equity residual stays negative',await value('modelPreMoneyEquity')<0);
  check('A nonpositive modeled residual has no price-gap percentage',await value('priceGapPercent'),null);
  check('A negative residual cannot be copied as a priced financing quote',await page.locator('#financing-use-model').isDisabled());
  check('Negative residual copy explains limited-liability interpretation',await page.locator('#financing').innerText().then(text=>/limited.liability/i.test(text)));
  const unresolvedCopy={case:{...example.case,bridge:{cash:0,debt:367.77029479956013,otherClaims:0}},round:{basis:'post',quote:1e12,primaryCapital:999999999000,holderStake:.1}};
  await page.goto(financingUrl(new URL('index.html',base).href,unresolvedCopy),{waitUntil:'networkidle'});await ready();
  near('A valid large round retains its explicit pre-money price',await value('preMoney'),1000);
  check('A modeled-equity copy below the subtraction precision boundary is disabled',await page.locator('#financing-use-model').isDisabled());
  check('The disabled precision-limited copy leaves the original valid case intact',await snapshot(),unresolvedCopy);
  check('Rounded percentage presentation retains the exact incoming ownership below one',await value('newOwnership'),compute(unresolvedCopy).pricing.newOwnership);
  check('The rounded ownership metric exposes its unrounded value',Number(await metric('newOwnership').getAttribute('title')),compute(unresolvedCopy).pricing.newOwnership);
  check('A tiny positive existing holding is not formatted as exact zero',await metric('holderAfter').innerText().then(text=>!/^0(?:\.0+)?\s*%$/.test(text.trim())));
  const caseOnly={company:'OpenAI',scenario:'Bull',assumptions:presets.OpenAI.Bull,bridge:{cash:2,debt:1,otherClaims:0}};
  await page.goto(scenarioUrl(new URL('index.html',base).href,caseOnly),{waitUntil:'networkidle'});await ready();
  check('A normal scenario link remains supported after the financing feature',await snapshot().then(item=>item.case),caseOnly);

  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:width<600?844:1100});
    // Repeating an identical fragment URL may be a same-document anchor
    // navigation with no hashchange. Each width tests a fresh visitor landing.
    await page.goto('about:blank');
    await page.goto(new URL('index.html#financing-example',base).href,{waitUntil:'networkidle'});await ready();
    check(`The financing view has no page overflow at ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check(`All financing inputs remain visible at ${width}px`,await page.locator('#financing-basis,#financing-quote,#financing-capital,#financing-stake').evaluateAll(inputs=>inputs.every(input=>input.getBoundingClientRect().width>0)));
    check(`The example route retains correct focus at ${width}px`,await page.evaluate(()=>document.activeElement.id),'financing');
    if(width===390)await page.screenshot({path:`${output}/mobile-example.png`,fullPage:true,animations:'disabled'});
  }
  await page.locator('#financing-basis').focus();await page.keyboard.press('Tab');
  check('Keyboard navigation reaches the next financing input',await page.evaluate(()=>document.activeElement.id),'financing-quote');
  const noJs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844},ignoreHTTPSErrors:override});
  const noJsPage=await noJs.newPage();
  await noJsPage.goto(new URL('index.html#financing-example',base).href,{waitUntil:'domcontentloaded'});
  check('A visitor without JavaScript receives an explicit explanation',await noJsPage.locator('noscript').allTextContents().then(texts=>texts.some(text=>/javascript/i.test(text))));
  check('The no-JavaScript explanation offers the exported workbook',await noJsPage.locator('noscript a[href$=".xlsx"]:visible').count()>0);
  await noJs.close();
  check('No uncaught functional browser errors occurred',errors,[]);
}catch(error){failed=error.stack||String(error);try{await page.screenshot({path:`${output}/failure.png`,fullPage:true,animations:'disabled'});}catch{/* A failed initial navigation may not provide a page. */}}
finally{
  const sources=['tests/financing-browser.mjs','public/lib/model.js','public/lib/release.js','public/lib/financing.js','public/lib/financing-share.js','public/lib/financing-brief.js','public/lib/financing-format.js','public/financing.js','public/financing.css','public/styles.css','public/shell.css','public/portable.css','public/index.html','public/app.js','lib/http.js','data/presets.json'];
  const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async path=>[path,createHash('sha256').update(await readFile(`${root}/${path}`)).digest('hex')])));
  const report={schema:1,status:failed?'fail':'pass',testedAtUtc:new Date().toISOString(),baseUrl:base,appVersion:APP_VERSION,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,checks:checks.length,passed:checks,browserErrors:errors,browserCertificateOverride:override,sourceHashes,error:failed};
  await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');await browser.close();
  console.log(JSON.stringify({status:report.status,checks:checks.length,browserErrors:errors,browserCertificateOverride:override,error:failed}));
}
if(failed)process.exitCode=1;
