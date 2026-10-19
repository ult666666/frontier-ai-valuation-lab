// Focused integration checks for the ownership constraint, real API, and exact
// state transport. Numerical independence lives in check_ownership_reference.py.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(process.env.FRONTIER_PROJECT_ROOT||process.cwd());
const require=createRequire(`${root}/package.json`);
const {chromium}=require(process.env.FRONTIER_PLAYWRIGHT_MODULE||`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`);
const {financingAnalysis}=await import(pathToFileURL(`${root}/public/lib/ownership.js`).href);
const {financingUrl,decodeFinancing}=await import(pathToFileURL(`${root}/public/lib/financing-share.js`).href);
const {APP_VERSION}=await import(pathToFileURL(`${root}/public/lib/release.js`).href);
const {MODEL_VERSION,VALUATION_DATE}=await import(pathToFileURL(`${root}/public/lib/model.js`).href);
const presets=JSON.parse(await readFile(`${root}/data/presets.json`,'utf8'));
const base=process.env.FRONTIER_BASE_URL||'http://127.0.0.1:4336/';
const output=resolve(process.env.FRONTIER_OWNERSHIP_QA_DIR||`${root}/qa-local/v3-6/ownership-browser`);
await mkdir(output,{recursive:true});
const checks=[],errors=[],requests=[];
const check=(label,actual,expected=true)=>{assert.deepEqual(actual,expected,label);checks.push(label);};
const near=(label,actual,expected)=>{assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=1e-11*Math.max(Math.abs(expected),1e-300),`${label}: ${actual} != ${expected}`);checks.push(label);};
const override=process.env.FRONTIER_ALLOW_BROWSER_CERT_OVERRIDE==='1';
const browser=await chromium.launch({headless:true,executablePath:process.env.FRONTIER_CHROMIUM_EXECUTABLE||'/tmp/frontier-chromium-runtime/chromium',args:['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1100},deviceScaleFactor:1,reducedMotion:'reduce',acceptDownloads:true,ignoreHTTPSErrors:override});
context.setDefaultTimeout(12000);context.setDefaultNavigationTimeout(25000);
await context.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('Clipboard unavailable in this fixture','NotAllowedError');}}}));
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(request.url().includes('/api/valuation')&&request.method()==='POST'){const body=request.postDataJSON();if(body?.action==='financing')requests.push(body);}});
const ready=async()=>{await page.locator('#ownership-floor').waitFor({state:'attached'});await page.locator('[data-financing-metric="ownershipRetained"][data-value]').waitFor({state:'attached'});};
const metric=name=>page.locator(`[data-financing-metric="${name}"]`).first();
const value=async name=>{const raw=await metric(name).getAttribute('data-value');return raw===null?null:Number(raw);};
const share=async()=>{await page.locator('#financing-share').click();await page.locator('#financing-share-area:not([hidden])').waitFor();return page.locator('#financing-share-url').inputValue();};
const snapshot=async()=>decodeFinancing(new URL(await share()).hash.slice('#financing='.length));
const legacy={case:{company:'Anthropic',scenario:'Base',assumptions:presets.Anthropic.Base,bridge:{cash:20,debt:5,otherClaims:0}},round:{basis:'pre',quote:250,primaryCapital:25,holderStake:.1}};
const example={...legacy,ownership:{retentionFloor:.9}};
const compute=item=>financingAnalysis(item.case.assumptions,{bridge:item.case.bridge,round:item.round,...(item.ownership?{ownership:item.ownership}:{})});
const wrapped=result=>({appVersion:APP_VERSION,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,result});
const openUrl=async url=>{await page.goto('about:blank');await page.goto(url,{waitUntil:'networkidle'});await ready();};
const openSnapshot=item=>openUrl(financingUrl(new URL('index.html',base).href,item));
const noOldMetrics=()=>page.locator('[data-financing-metric]').evaluateAll(elements=>elements.every(element=>!element.hasAttribute('data-value')&&element.textContent.trim()==='—'));
const outputButtons='#financing-verify,#financing-share,#financing-json,#financing-brief';
let failed=null;
try{
  await openUrl(new URL('index.html#ownership-example',base).href);
  check('The ownership demo route focuses its destination',await page.evaluate(()=>document.activeElement.id),'ownership-frontier');
  check('The ownership demo preserves the full explicit example',await snapshot(),example);
  check('A 90-percent constraint is shown as a percentage in its control',Number(await page.locator('#ownership-floor').inputValue()),90);
  near('At 250 pre-money and a 90-percent floor the ceiling is 27.777... billion',await value('ownershipCeiling'),250/9);
  near('The 25-billion pre-money example retains ten elevenths of the starting stake',await value('ownershipRetained'),10/11);
  near('The capital headroom is distinct from total capital at the floor',await value('ownershipHeadroom'),250/9-25);
  check('The example classifies its current round within the selected limit',await page.locator('#ownership-status').getAttribute('data-state'),'above-floor');
  check('The constraint explains the relationship between the starting stake and company ownership',await page.locator('#ownership-floor-meaning').innerText().then(text=>/90\.00%[\s\S]*10\.00%[\s\S]*9\.00%/.test(text)));
  check('The ownership graph has an accessible title and description',await page.locator('#ownership-chart svg').evaluate(svg=>{const ids=(svg.getAttribute('aria-labelledby')||'').split(/\s+/);return svg.getAttribute('role')==='img'&&ids.length===2&&ids.every(id=>document.getElementById(id)?.textContent.trim());}));
  check('The chart identifies primary capital units and the retained-stake axis',await page.locator('#ownership-chart svg').textContent().then(text=>/Primary capital \(USD bn\)/.test(text)&&/Starting stake retained \(%\)/.test(text)));
  await page.locator('#ownership-frontier').scrollIntoViewIfNeeded();await page.locator('#ownership-frontier').screenshot({path:`${output}/desktop-frontier.png`,animations:'disabled'});

  await page.locator('#financing-basis').selectOption('post');
  check('Changing the basis keeps the entered 250-billion quote fixed',await page.locator('#financing-quote').inputValue(),'250');
  near('The same post-money quote and floor allow 25 billion of primary capital',await value('ownershipCeiling'),25);
  near('The fixed post-money hand case retains 90 percent',await value('ownershipRetained'),.9);
  check('The inclusive numerical boundary treats the post-money hand case as at the floor',await page.locator('#ownership-status').getAttribute('data-state'),'at-floor');
  check('At the numerical boundary headroom does not invent a rounding surplus',await value('ownershipHeadroom'),0);
  check('At the numerical boundary excess does not invent a rounding shortfall',await value('ownershipExcess'),0);
  check('The fixed post-money relationship is explained beside the curve',await page.locator('#ownership-basis-note').innerText().then(text=>/post.money[\s\S]*fixed[\s\S]*lower pre.money/i.test(text)));
  await page.locator('#ownership-floor').fill('95');
  check('A round beyond the floor remains a valid analysis with an exceeded status',await page.locator('#ownership-status').getAttribute('data-state'),'below-floor');
  check('An unmet floor does not disable reproducible outputs',await page.locator(outputButtons).evaluateAll(buttons=>buttons.every(button=>!button.disabled)));
  near('An unmet floor shows the excess capital separately',await value('ownershipExcess'),12.5);
  check('An unmet floor reveals the excess row',await page.locator('#ownership-excess-row').isVisible());

  const noHolder={...example,round:{...example.round,holderStake:0}};
  await openSnapshot(noHolder);
  near('A zero tracked stake does not change the all-holder retention ceiling',await value('ownershipCeiling'),250/9);
  check('A zero tracked stake stays zero after issuance',await value('holderAfter'),0);
  await page.locator('#ownership-floor').fill('100');await page.locator('#financing-capital').fill('0');
  check('A 100-percent floor allows an exactly zero-capital round',await page.locator('#ownership-status').getAttribute('data-state'),'at-floor');
  check('A 100-percent floor has an economic capital ceiling of zero',await value('ownershipCeiling'),0);
  await page.locator('#financing-quote').fill('1000000000000');await page.locator('#financing-capital').fill('.000001');
  check('Positive primary capital breaches a 100-percent floor even when the ratio rounds to one',await page.locator('#ownership-status').getAttribute('data-state'),'below-floor');
  near('The strict 100-percent floor preserves the tiny positive excess',await value('ownershipExcess'),.000001);

  await openSnapshot(example);
  for(const bad of ['', '0', '100.01']){
    await page.locator('#ownership-floor').fill(bad);
    check(`Invalid floor ${JSON.stringify(bad)} clears all previous financial metrics`,await noOldMetrics());
    check(`Invalid floor ${JSON.stringify(bad)} removes the old ownership curve`,await page.locator('#ownership-chart svg').count(),0);
    check(`Invalid floor ${JSON.stringify(bad)} disables verification, share and exports`,await page.locator(outputButtons).evaluateAll(buttons=>buttons.every(button=>button.disabled)));
    check(`Invalid floor ${JSON.stringify(bad)} has a visible validation message`,await page.locator('#financing-error').isVisible());
    await page.locator('#ownership-floor').fill('90');
  }

  const legacyUrl=financingUrl(new URL('index.html',base).href,legacy);
  check('The version-one link decoder retains the original snapshot shape',decodeFinancing(new URL(legacyUrl).hash.slice('#financing='.length)),legacy);
  await openUrl(legacyUrl);
  check('An old financing link restores its original case and round with the explicit default floor',await snapshot(),example);
  const custom={case:{company:'OpenAI',scenario:'Bull',assumptions:{
    rev2026:87.123456789,g1:.4123456789,g2:.2345678912,g3:.0987654321,
    m27:-.2345678912,m30:.1234567891,m36:.2987654321,turns:3.456789123,
    wacc:.1434567891,tg:.0234567891,roic:.2234567891,stub:-4.56789123,tax:.1934567891,
  },bridge:{cash:12.345678901234,debt:3.25,otherClaims:1.125}},round:{basis:'post',quote:333.123456789,primaryCapital:17.987654321,holderStake:.1234567891234567},ownership:{retentionFloor:.9123456789123456}};
  await openSnapshot(custom);const exactLink=await share();
  check('The new link preserves the exact fractional floor, round, bridge and thirteen assumptions',decodeFinancing(new URL(exactLink).hash.slice('#financing='.length)),custom);
  check('Clipboard denial exposes an exact selectable link',await page.locator('#financing-share-url').isVisible());
  await page.reload({waitUntil:'networkidle'});await ready();
  check('Reloading preserves the fractional floor without percentage conversion loss',await snapshot(),custom);
  let event=page.waitForEvent('download');await page.locator('#financing-json').click();let download=await event;
  const jsonPath=`${output}/custom-ownership.json`;await download.saveAs(jsonPath);const exported=JSON.parse(await readFile(jsonPath,'utf8'));
  check('The complete JSON includes the exact ownership constraint',exported.snapshot,custom);
  check('The complete JSON includes the recalculated financing and ownership result',exported.result,compute(custom));
  event=page.waitForEvent('download');await page.locator('#financing-brief').click();download=await event;
  const htmlPath=`${output}/custom-ownership.html`;await download.saveAs(htmlPath);const brief=await readFile(htmlPath,'utf8');
  check('The portable ownership brief is script-free',!/<script\b/i.test(brief));
  check('The portable ownership brief includes its exact reopening link',brief.includes(exactLink.replaceAll('&','&amp;')));
  check('The portable ownership brief includes the ownership frontier',/ownership frontier/i.test(brief));

  await page.locator('#financing-verify').click();await page.locator('#financing-api-status[data-tone="ok"]').waitFor();
  check('The real API verifies the complete ownership analysis',await page.locator('#financing-api-status').getAttribute('data-tone'),'ok');
  check('The real API receives the exact ownership floor with the other declared inputs',requests.at(-1),{action:'financing',assumptions:custom.case.assumptions,bridge:custom.case.bridge,round:custom.round,ownership:custom.ownership});
  await page.locator('#ownership-floor').fill('94');
  check('Changing only the floor invalidates a completed API verification',await page.locator('#financing-api-status').getAttribute('data-tone'),'idle');
  await page.route('**/api/valuation',async route=>{
    const body=route.request().postDataJSON();if(body.action!=='financing')return route.continue();
    const result=financingAnalysis(body.assumptions,{bridge:body.bridge,round:body.round,ownership:body.ownership});result.ownership.graph.points[0].holderAfter+=.001;
    await route.fulfill({json:wrapped(result)});
  });
  await page.locator('#financing-verify').click();await page.locator('#financing-api-status[data-tone="error"]').waitFor();
  check('An ownership mismatch away from the headline metrics fails whole-result verification',await page.locator('#financing-api-status').getAttribute('data-tone'),'error');
  await page.unroute('**/api/valuation');
  let releaseResponse;const pending=new Promise(resolve=>{releaseResponse=resolve;});
  await page.route('**/api/valuation',async route=>{
    const body=route.request().postDataJSON();if(body.action!=='financing')return route.continue();
    await pending;try{await route.fulfill({json:wrapped(financingAnalysis(body.assumptions,{bridge:body.bridge,round:body.round,ownership:body.ownership}))});}catch{/* Changed inputs deliberately abort the older request. */}
  });
  await page.locator('#financing-verify').click();await page.locator('#financing-api-status[data-tone="pending"]').waitFor();
  await page.locator('#ownership-floor').fill('95');releaseResponse();
  check('A floor edit invalidates an in-flight API request immediately',await page.locator('#financing-api-status').getAttribute('data-tone'),'idle');
  await page.unroute('**/api/valuation');
  await page.locator('#financing-verify').click();await page.locator('#financing-api-status[data-tone="ok"]').waitFor();
  check('The latest floor can verify after the stale response is discarded',requests.at(-1).ownership,{retentionFloor:.95});

  const capped={...example,round:{...example.round,quote:1e12,primaryCapital:1e12},ownership:{retentionFloor:.01}};
  await openSnapshot(capped);
  near('The analytical ceiling is not silently clipped to the supported input cap',await value('ownershipCeiling'),9.9e13);
  check('A cap-limited graph visibly explains its numerical input boundary',await page.locator('#ownership-range-note').innerText().then(text=>/input (limit|range)|input.range/i.test(text)));
  const unresolved={...example,round:{...example.round,quote:5e-324,primaryCapital:0}};
  await openSnapshot(unresolved);
  check('A below-resolution positive ceiling is unavailable rather than zero',await value('ownershipCeiling'),null);
  check('A below-resolution curve is not drawn from invented zero data',await page.locator('#ownership-chart svg').count(),0);
  check('A below-resolution ceiling has a visible explanation',await page.locator('#ownership-range-note').isVisible());
  check('The valid current round remains exportable when only the frontier is unresolved',await page.locator(outputButtons).evaluateAll(buttons=>buttons.every(button=>!button.disabled)));

  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:width<600?844:1100});
    await openUrl(new URL('index.html#ownership-example',base).href);
    check(`The ownership demo has no horizontal page overflow at ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check(`The ownership controls remain rendered at ${width}px`,await page.locator('#ownership-floor,#ownership-floor-range').evaluateAll(inputs=>inputs.every(input=>input.getBoundingClientRect().width>0)));
    check(`The ownership destination receives focus at ${width}px`,await page.evaluate(()=>document.activeElement.id),'ownership-frontier');
    if(width===390)await page.locator('#ownership-frontier').screenshot({path:`${output}/mobile-frontier.png`,animations:'disabled'});
  }
  await page.locator('#ownership-floor-range').focus();await page.keyboard.press('ArrowRight');
  check('The range control responds to native keyboard adjustment',await snapshot().then(item=>item.ownership),{retentionFloor:.91});
  check('The numeric floor has a native label and retained-stake description',await page.locator('#ownership-floor').evaluate(input=>input.labels.length>0&&input.getAttribute('aria-describedby')==='ownership-floor-meaning'));
  check('The range control has an accessible name',await page.locator('#ownership-floor-range').getAttribute('aria-label').then(Boolean));
  check('No uncaught ownership-workflow browser errors occurred',errors,[]);
}catch(error){failed=error.stack||String(error);try{await page.screenshot({path:`${output}/failure.png`,fullPage:true,animations:'disabled'});}catch{/* The initial navigation may fail before a page exists. */}}
finally{
  const sources=['tests/ownership-browser.mjs','public/lib/model.js','public/lib/release.js','public/lib/financing.js','public/lib/ownership.js','public/lib/ownership-chart.js','public/lib/financing-share.js','public/lib/financing-brief.js','public/lib/financing-format.js','public/financing.js','public/financing.css','public/styles.css','public/shell.css','public/portable.css','public/index.html','public/app.js','lib/http.js','data/presets.json'];
  const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async path=>[path,createHash('sha256').update(await readFile(`${root}/${path}`)).digest('hex')])));
  const report={schema:1,status:failed?'fail':'pass',testedAtUtc:new Date().toISOString(),baseUrl:base,appVersion:APP_VERSION,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,checks:checks.length,passed:checks,browserErrors:errors,browserCertificateOverride:override,sourceHashes,error:failed};
  await writeFile(`${output}/report.json`,JSON.stringify(report,null,2)+'\n');await browser.close();
  console.log(JSON.stringify({status:report.status,checks:checks.length,browserErrors:errors,browserCertificateOverride:override,error:failed}));
}
if(failed)process.exitCode=1;
