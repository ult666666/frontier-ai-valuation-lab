// End-to-end checks for an exact capital decision. The independent Python
// reference verifies arithmetic; this harness verifies the real visitor flow.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(process.env.FRONTIER_PROJECT_ROOT||process.cwd());
const require=createRequire(`${root}/package.json`);
const {chromium}=require(process.env.FRONTIER_PLAYWRIGHT_MODULE||`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`);
const base=process.env.FRONTIER_BASE_URL||'http://127.0.0.1:4340/';
const output=resolve(process.env.FRONTIER_CAPITAL_QA_DIR||`${root}/qa-local/v4-0/capital-browser`);
await mkdir(output,{recursive:true});
const checks=[],errors=[],requests=[];
const check=(label,actual,expected=true)=>{assert.deepEqual(actual,expected,label);checks.push(label);};
const browser=await chromium.launch({headless:true,executablePath:process.env.FRONTIER_CHROMIUM_EXECUTABLE||'/tmp/frontier-chromium-runtime/chromium',args:['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1100},deviceScaleFactor:1,reducedMotion:'reduce',acceptDownloads:true});
context.setDefaultTimeout(12000);
context.setDefaultNavigationTimeout(25000);
await context.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('Clipboard unavailable in this test','NotAllowedError');}}}));
const page=await context.newPage();
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/api/valuation'))requests.push(request.postDataJSON());});
const ready=()=>page.locator('body[data-capital-state="ready"]').waitFor();
const metric=name=>page.locator(`[data-capital-metric="${name}"]`).first();
const numeric=async name=>{const raw=await metric(name).getAttribute('data-value');return raw===null?null:Number(raw);};
const share=async()=>{await page.locator('#capital-share').click();await page.locator('#capital-share-area:not([hidden])').waitFor();return page.locator('#capital-share-url').inputValue();};
const open=async hash=>{await page.goto('about:blank');await page.goto(new URL(`capital.html${hash||''}`,base).href,{waitUntil:'networkidle'});await ready();};
let failure=null;
try{
  const response=await page.goto(new URL('capital.html#worked-decision',base).href,{waitUntil:'networkidle'});
  check('Capital Strategy is served as a complete page',response.status(),200);
  await ready();
  check('The complete seven-destination navigation is present',await page.locator('.app-nav a').allTextContents(),['Capital Studio','Overview','Model','Thesis Lab','Value Horizon','Casebook','Evidence']);
  check('Capital Studio is the current navigation destination',await page.locator('.app-nav [aria-current="page"]').innerText(),'Capital Studio');
  check('The worked route preserves the introduction and header on arrival',await page.evaluate(()=>scrollY===0&&document.querySelector('.app-header').getBoundingClientRect().top>=0));
  check('The worked decision has three editable plans',await page.locator('[data-plan-editor]').count(),3);
  check('The worked decision has three explicit scenarios',await page.locator('[data-scenario-editor]').count(),3);
  check('Two worked plans meet the explicit capital and retention objectives',await numeric('eligiblePlans'),2);
  check('Plan C shows its capital shortfall',await page.locator('[data-plan-id="c"] [data-plan-status]').innerText().then(t=>/capital/i.test(t)&&/5/.test(t)));
  check('The plan plot has an accessible title and description',await page.locator('#capital-plan-chart svg').evaluate(svg=>{const ids=(svg.getAttribute('aria-labelledby')||'').split(/\s+/);return svg.getAttribute('role')==='img'&&ids.length===2&&ids.every(id=>document.getElementById(id)?.textContent.trim());}));
  check('The plot identifies both financial quantities',await page.locator('#capital-plan-chart svg').textContent().then(t=>/Primary capital/.test(t)&&/Starting stake retained/.test(t)));
  check('The worked A/B crossover is shown as 635 billion',Math.abs(Number(await page.locator('[data-crossover="a:b"]').getAttribute('data-equity'))-635)<1e-9);
  check('The full worked matrix includes every scenario and plan',await page.locator('#capital-matrix [data-matrix-plan]').count(),9);
  check('Model-conditioned pricing diagnostics stay separate from two eligible plans',await page.locator('#capital-envelope-table tbody tr').allTextContents().then(rows=>rows.length===3&&rows.every(row=>row.includes('Conditions conflict'))));
  const overviewHeight=await page.locator('#capital-decision').evaluate(element=>Math.ceil(element.getBoundingClientRect().bottom+scrollY+32));
  await page.setViewportSize({width:1440,height:overviewHeight});
  await page.screenshot({path:`${output}/desktop-overview.png`,animations:'disabled'});
  await page.setViewportSize({width:1440,height:1100});
  await page.locator('#capital-decision').screenshot({path:`${output}/desktop-decision.png`,animations:'disabled'});
  await page.screenshot({path:`${output}/desktop-page.png`,fullPage:true,animations:'disabled'});

  await page.locator('#capital-selected-plan').selectOption('b');
  check('The analyst can explicitly choose a plan independently of the comparison rule',await page.locator('#capital-rule-plans').innerText(),'Smaller round');
  await page.locator('#capital-retention').fill('90');
  check('A 90-percent floor leaves only Plan A eligible',await numeric('eligiblePlans'),1);
  check('Plan B explicitly misses the changed ownership floor',await page.locator('[data-plan-id="b"] [data-plan-status]').innerText().then(t=>/retention/i.test(t)));
  await page.locator('#capital-objective').fill('30');
  check('A 30-billion objective with 90-percent retention has no eligible plan',await numeric('eligiblePlans'),0);
  check('No eligible plan is an ordinary valid analytical result',await page.locator('body').getAttribute('data-capital-state'),'ready');
  check('The comparison explicitly reports no eligible plan',await page.locator('#capital-rule-result').getAttribute('data-state'),'no-eligible-plans');
  await page.locator('#capital-retention').fill('88');
  check('Relaxing the retention floor restores an eligible plan',await numeric('eligiblePlans'),1);
  check('An input change preserves the analyst selection',await page.locator('#capital-selected-plan').inputValue(),'b');
  check('Input edits mark existing reasoning for review',await page.locator('#capital-reasoning-status').getAttribute('data-state'),'needs-review');

  const {decodeCapitalShare}=await import(pathToFileURL(`${root}/public/lib/capital-share.js`).href);
  const {createCapitalRecord,CAPITAL_RECORD_MAX_BYTES}=await import(pathToFileURL(`${root}/public/lib/capital-record.js`).href);
  const {decodeScenario}=await import(pathToFileURL(`${root}/public/lib/share.js`).href);
  const {decodeHorizon}=await import(pathToFileURL(`${root}/public/lib/horizon-share.js`).href);
  const tokenFrom=url=>new URL(url).hash.slice('#decision='.length);
  const currentRecord=async()=>decodeCapitalShare(tokenFrom(await share()));
  const firstScenario=page.locator('[data-scenario-editor]').first();
  await firstScenario.locator('summary').click();
  await firstScenario.locator('[data-scenario-mode]').selectOption('finite');
  await firstScenario.locator('[data-scenario-years]').fill('10');
  const finite=await currentRecord();
  check('Finite continuation is preserved in the exact snapshot',finite.snapshot.scenarios[0].continuationYears,10);
  check('Finite continuation affects the scenario analysis',finite.analysis.scenarios[0].operatingEv<finite.analysis.scenarios[0].perpetualEv);
  await firstScenario.locator('[data-assumption-field="g1"]').fill('43.333333333333336');
  const precise=await currentRecord();
  check('Editing one precise operating input leaves every other assumption exact',precise.snapshot.scenarios[0].assumptions,{...finite.snapshot.scenarios[0].assumptions,g1:Number('43.333333333333336')/100});
  const modelLink=await firstScenario.locator('[data-scenario-links] a').first().getAttribute('href');
  check('The operating-model handoff preserves every custom assumption and bridge',decodeScenario(new URL(modelLink).hash.slice('#scenario='.length)),{company:precise.snapshot.company,scenario:'Base',assumptions:precise.snapshot.scenarios[0].assumptions,bridge:precise.snapshot.bridge});
  const horizonLink=await firstScenario.locator('[data-scenario-links] a').nth(1).getAttribute('href');
  check('The horizon handoff preserves the selected finite cutoff',decodeHorizon(new URL(horizonLink).hash.slice('#horizon='.length)).years,10);
  await page.locator('#capital-add-plan').click();
  check('A fourth editable plan is supported',await page.locator('[data-plan-editor]').count(),4);
  const added=page.locator('[data-plan-editor]').last();
  await added.locator('[data-plan-field="label"]').fill('Flexible round');
  await added.locator('[data-plan-field="quote"]').fill('400');
  await added.locator('[data-plan-field="primaryCapital"]').fill('40');
  check('Added plans recalculate through the complete snapshot',(await currentRecord()).snapshot.plans.at(-1).quote,400);
  await added.locator('[data-plan-field="basis"]').selectOption('post');
  const postMoney=await currentRecord();
  check('Changing the quote basis keeps the entered quote fixed',postMoney.snapshot.plans.at(-1),{id:postMoney.snapshot.plans.at(-1).id,label:'Flexible round',basis:'post',quote:400,primaryCapital:40});
  check('A post-money quote derives the correct pre-money price',postMoney.analysis.plans.at(-1).pricing.preMoney,360);

  const unicode='选择 B：cash first — "review" <img src=x onerror="window.capitalInjected=1">';
  await page.locator('#capital-rationale').fill(unicode);
  await page.locator('#capital-review-trigger').fill('Revisit if the operating evidence changes materially.');
  const exact=await currentRecord();
  check('Unicode reasoning survives the exact share codec',exact.decision.rationale,unicode);
  check('Markup-like reasoning stays inert',await page.evaluate(()=>window.capitalInjected===undefined));
  const url=await share();
  check('The clipboard fallback exposes a selectable complete link',await page.locator('#capital-share-url').evaluate(el=>el.readOnly&&el.value.startsWith('http')));
  const fresh=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const freshPage=await fresh.newPage();freshPage.on('pageerror',error=>errors.push(error.message));
  await freshPage.goto(url,{waitUntil:'networkidle'});await freshPage.locator('body[data-capital-state="ready"]').waitFor();
  check('A shared decision restores notes in a fresh browser',await freshPage.locator('#capital-rationale').inputValue(),unicode);
  check('A shared decision restores every added plan',await freshPage.locator('[data-plan-editor]').count(),4);
  await freshPage.reload({waitUntil:'networkidle'});await freshPage.locator('body[data-capital-state="ready"]').waitFor();
  check('The exact shared route survives reload',await freshPage.locator('#capital-rationale').inputValue(),unicode);
  await fresh.close();

  await page.locator('#capital-verify').click();
  await page.locator('#capital-api-status[data-state="verified"]').waitFor();
  check('The real API receives the complete current numeric snapshot',requests.at(-1),{action:'capital',snapshot:exact.snapshot});
  check('Analyst prose is excluded from the computation request',!JSON.stringify(requests.at(-1)).includes('capitalInjected'));
  await page.locator('#capital-objective').fill('31');
  check('An edit immediately removes the previous verification',await page.locator('#capital-api-status').getAttribute('data-state'),'unverified');

  let releaseResponse,receivedResponse,completedRoute;
  const held=new Promise(resolve=>receivedResponse=resolve),release=new Promise(resolve=>releaseResponse=resolve),completed=new Promise(resolve=>completedRoute=resolve);
  await page.route('**/api/valuation',async route=>{
    try{const response=await route.fetch();receivedResponse();await release;await route.fulfill({response});}
    catch(error){if(!/abort|closed|handled/i.test(error.message))throw error;}
    finally{completedRoute();}
  });
  await page.locator('#capital-verify').click();
  await held;
  check('A real server response can remain pending without a verification claim',await page.locator('#capital-api-status').getAttribute('data-state'),'pending');
  await page.locator('#capital-objective').fill('32');releaseResponse();await completed;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  check('A late response cannot verify a newer edited draft',await page.locator('#capital-api-status').getAttribute('data-state'),'unverified');
  await page.unroute('**/api/valuation');
  await page.route('**/api/valuation',async route=>{const response=await route.fetch(),payload=await response.json();payload.result.matrix.at(-1).trackedHolderAllocation+=1;await route.fulfill({response,json:payload});});
  await page.locator('#capital-verify').click();await page.locator('#capital-api-status[data-state="failed"]').waitFor();
  check('A mismatch in one nested matrix result fails full verification',await page.locator('#capital-api-status').innerText().then(text=>/complete result differs/.test(text)));
  await page.unroute('**/api/valuation');

  const imported=createCapitalRecord(exact.snapshot,{...exact.decision,rationale:'Imported decision — 可复核 '+unicode});
  await page.locator('#capital-import-file').setInputFiles({name:'capital.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
  await page.locator('#capital-import-preview:not([hidden])').waitFor();
  check('Import preview leaves the current draft unchanged',await page.locator('#capital-rationale').inputValue(),unicode);
  await page.locator('#capital-import-apply').click();
  check('Explicit import applies the validated complete decision',await page.locator('#capital-rationale').inputValue(),imported.decision.rationale);
  await page.locator('#capital-import-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await page.locator('#capital-import-status[data-state="error"]').waitFor();
  check('Failed import preserves the current decision',await page.locator('#capital-rationale').inputValue(),imported.decision.rationale);

  const downloadJson=page.waitForEvent('download');await page.locator('#capital-json').click();
  const jsonDownload=await downloadJson;const jsonPath=`${output}/custom-decision.json`;await jsonDownload.saveAs(jsonPath);
  check('JSON export carries all exact inputs',JSON.parse(await readFile(jsonPath,'utf8')).snapshot,exact.snapshot);
  const downloadHtml=page.waitForEvent('download');await page.locator('#capital-brief').click();
  const htmlDownload=await downloadHtml;const htmlPath=`${output}/custom-decision.html`;await htmlDownload.saveAs(htmlPath);
  const html=await readFile(htmlPath,'utf8');
  check('The standalone brief retains the analyst reasoning',html.includes('Imported decision — 可复核'));
  check('The standalone brief contains no executable script',!/<script(?:\s|>)/i.test(html));
  check('Markup-like reasoning is escaped in the standalone brief',html.includes('&lt;img src=x onerror='));

  await page.locator('#capital-bridge-enabled').uncheck();
  check('Missing bridge keeps ownership screening available',await numeric('eligiblePlans')!==null);
  check('Missing bridge makes the modeled allocation rule unavailable',await page.locator('#capital-rule-result').getAttribute('data-state'),'unavailable');
  await page.locator('#capital-bridge-enabled').check();
  await page.locator('#capital-objective').fill('');
  check('An invalid input pauses the complete decision',await page.locator('body').getAttribute('data-capital-state'),'invalid');
  check('An invalid input clears the old graph',await page.locator('#capital-plan-chart svg').count(),0);
  check('An invalid input disables potentially misleading outputs',await page.locator('#capital-share,#capital-json,#capital-brief,#capital-verify').evaluateAll(buttons=>buttons.every(button=>button.disabled)));
  await page.locator('#capital-objective').fill('25');await ready();

  const maximumSnapshot=structuredClone(exact.snapshot);
  maximumSnapshot.scenarios=Array.from({length:9},(_,index)=>({...structuredClone(exact.snapshot.scenarios[index%exact.snapshot.scenarios.length]),id:`max-scenario-${index+1}`,label:'📈'.repeat(60)}));
  maximumSnapshot.plans=Array.from({length:6},(_,index)=>({...structuredClone(exact.snapshot.plans[index%exact.snapshot.plans.length]),id:`max-plan-${index+1}`,label:'🧭'.repeat(60)}));
  const maximumDecision={selectedPlanId:'max-plan-1',rationale:'🧠'.repeat(1500),tradeoff:'🧮'.repeat(1500),reviewTrigger:'🔭'.repeat(1500),informationNeeded:'📊'.repeat(1500)};
  const maximum=createCapitalRecord(maximumSnapshot,maximumDecision),maximumJson=JSON.stringify(maximum,null,2),maximumBytes=Buffer.byteLength(maximumJson,'utf8');
  check('The maximum browser fixture exercises the larger complete-record import guard',maximumBytes>96*1024&&maximumBytes<CAPITAL_RECORD_MAX_BYTES);
  await page.locator('#capital-import-file').setInputFiles({name:'maximum-unicode.json',mimeType:'application/json',buffer:Buffer.from(maximumJson)});
  await page.locator('#capital-import-preview:not([hidden])').waitFor();await page.locator('#capital-import-apply').click();await ready();
  check('The full 9-scenario and 6-plan decision imports through explicit preview and apply',[await page.locator('[data-scenario-editor]').count(),await page.locator('[data-plan-editor]').count()],[9,6]);
  check('Plan and scenario additions stop at the supported finite capacities',await page.locator('#capital-add-plan,#capital-add-scenario').evaluateAll(buttons=>buttons.every(button=>button.disabled)));
  check('Maximum Unicode reasoning is retained exactly',await page.locator('#capital-rationale').inputValue(),maximumDecision.rationale);
  await page.locator('#capital-share').click();await page.locator('#capital-portable-status[data-state="error"]').waitFor();
  check('Oversized link sharing explains the complete JSON fallback',await page.locator('#capital-portable-status').innerText().then(text=>/Download decision JSON/.test(text)));
  check('A share-size limit preserves valid complete exports',await page.locator('#capital-json,#capital-brief').evaluateAll(buttons=>buttons.every(button=>!button.disabled)));
  const maximumDownloadPromise=page.waitForEvent('download');await page.locator('#capital-json').click();const maximumDownload=await maximumDownloadPromise;const maximumPath=`${output}/maximum-decision.json`;await maximumDownload.saveAs(maximumPath);
  const maximumExport=JSON.parse(await readFile(maximumPath,'utf8'));
  check('The JSON fallback preserves the entire maximum snapshot and Unicode decision',{snapshot:maximumExport.snapshot,decision:maximumExport.decision},{snapshot:maximum.snapshot,decision:maximum.decision});
  await page.setViewportSize({width:390,height:844});
  check('Maximum Unicode labels remain contained on a phone',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#capital-import-file').setInputFiles({name:'too-large.json',mimeType:'application/json',buffer:Buffer.alloc(CAPITAL_RECORD_MAX_BYTES+1,32)});
  await page.locator('#capital-import-status[data-state="error"]').waitFor();
  check('An oversized import preserves the current complete draft',await page.locator('#capital-rationale').inputValue(),maximumDecision.rationale);

  await page.goto(new URL('capital.html#decision=malformed',base).href,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#capital-notice').textContent.includes('No shared inputs were applied'));
  check('A malformed hash change preserves the open decision',await page.locator('#capital-rationale').inputValue(),maximumDecision.rationale);
  await page.goto('about:blank');
  await page.goto(new URL('capital.html#decision=malformed',base).href,{waitUntil:'networkidle'});
  await page.locator('body[data-capital-state="invalid"]').waitFor();
  check('A malformed shared decision does not silently substitute the worked example',await page.locator('[data-plan-editor]').count(),0);
  await page.locator('#capital-reset-worked').click();await ready();
  check('The explicit reset recovers from a malformed shared record',await page.locator('[data-plan-editor]').count(),3);

  const exampleDraftRationale='Visitor-authored rationale must survive browsing another company example.';
  await page.locator('[data-plan-id="a"] [data-plan-field="quote"]').fill('299.125');
  await page.locator('#capital-objective').fill('27.5');
  await page.locator('#capital-add-plan').click();
  await page.locator('#capital-rationale').fill(exampleDraftRationale);
  const beforeExampleChoice=await currentRecord();
  await page.locator('#capital-company').selectOption('OpenAI');
  check('Choosing another worked example preserves the edited quote, objective, fourth plan and rationale',{quote:await page.locator('[data-plan-id="a"] [data-plan-field="quote"]').inputValue(),objective:await page.locator('#capital-objective').inputValue(),plans:await page.locator('[data-plan-editor]').count(),rationale:await page.locator('#capital-rationale').inputValue()},{quote:'299.125',objective:'27.5',plans:4,rationale:exampleDraftRationale});
  check('The queued example selection leaves the complete exact decision unchanged',await currentRecord(),beforeExampleChoice);
  check('The current company remains explicit while another example is queued',await page.locator('#capital-state-label').innerText().then(text=>text.startsWith('Current decision: Anthropic')));
  check('The replacement action names the queued example and explains its scope',await page.locator('#capital-reset-worked').innerText().then(text=>text.includes('Replace with OpenAI example'))&&await page.locator('#capital-example-help').innerText().then(text=>['plans','scenarios','objectives','balances','decision text'].every(term=>text.includes(term))));
  await page.locator('#capital-reset-worked').click();await ready();
  const openedExample=await currentRecord();
  check('Only the explicit replace action loads the selected company and default plan inputs',{company:openedExample.snapshot.company,plans:openedExample.snapshot.plans.length,quote:openedExample.snapshot.plans[0].quote,objective:openedExample.snapshot.policy.capitalTarget},{company:'OpenAI',plans:3,quote:250,objective:25});
  const expectedPresets=JSON.parse(await readFile(`${root}/public/data/presets.json`,'utf8'));
  check('The explicit company example uses its matching operating presets',openedExample.snapshot.scenarios.map(scenario=>scenario.assumptions),['Bear','Base','Bull'].map(name=>expectedPresets.OpenAI[name]));
  check('Explicit replacement clearly opens fresh illustrative reasoning',openedExample.decision.rationale!==exampleDraftRationale&&openedExample.decision.rationale.startsWith('Illustrative analyst choice:'));

  await open('#worked-decision');
  await page.locator('#capital-retention').fill('100');
  check('A 100-percent retention floor rejects all positive-capital worked offers',await numeric('eligiblePlans'),0);
  await page.locator('#capital-reset-worked').click();await ready();
  check('An explicit reset focuses the decision for keyboard continuation',await page.evaluate(()=>document.activeElement.id),'capital-decision');
  await page.locator('#capital-add-scenario').click();
  check('Adding a scenario creates an editable complete operating case',await page.locator('[data-scenario-editor]').last().locator('[data-assumption-field]').count(),13);
  await page.locator('[data-scenario-editor]').last().locator('[data-remove-scenario]').click();
  check('Removing a scenario returns focus to the add control',await page.evaluate(()=>document.activeElement.id),'capital-add-scenario');
  await open('#worked-decision');
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:1000});
    check(`The workspace fits ${width} CSS pixels without page overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#capital-decision').screenshot({path:`${output}/mobile-decision.png`,animations:'disabled'});
  await page.screenshot({path:`${output}/mobile-page.png`,fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>document.body.style.zoom='2');
  check('The decision reflows under 200-percent CSS zoom',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.evaluate(()=>document.body.style.zoom='');
  await page.locator('#capital-retention').focus();await page.keyboard.press('Tab');
  check('The native ownership range is keyboard reachable',await page.evaluate(()=>document.activeElement.id),'capital-retention-range');
  const before=Number(await page.locator('#capital-retention-range').inputValue());await page.keyboard.press('ArrowRight');
  check('Keyboard adjustment changes the explicit ownership constraint',Number(await page.locator('#capital-retention').inputValue())>before);
  check('No browser page errors occurred',errors,[]);
}catch(error){failure={name:error.name,message:error.message,stack:error.stack};}
finally{
  const files=['public/capital.html','public/capital.css','public/capital.js','public/lib/capital-chart.js','public/lib/capital-strategy.js','public/lib/capital-record.js','public/lib/capital-share.js','public/lib/capital-brief.js','public/lib/capital-example.js','tests/capital-browser.mjs'];
  const sourceFiles=[];for(const path of files){try{const data=await readFile(`${root}/${path}`);sourceFiles.push({path,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}catch{}}
  await writeFile(`${output}/report.json`,JSON.stringify({recordedAt:new Date().toISOString(),baseUrl:base,status:failure?'failed':'passed',assertions:checks.length,checks,pageErrors:errors,sourceFiles,failure},null,2)+'\n');
  await browser.close();
}
if(failure){console.error(failure.message);process.exitCode=1;}else console.log(`Capital browser: ${checks.length} assertions passed; ${errors.length} page errors.`);
