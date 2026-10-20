// End-to-end continuity checks against the real public pages and calculation API.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.env.FRONTIER_PROJECT_ROOT||process.cwd()),base=process.env.FRONTIER_BASE_URL||'http://127.0.0.1:4323/';
const require=createRequire(`${root}/package.json`),{chromium}=require(process.env.FRONTIER_PLAYWRIGHT_MODULE||`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`);
const {scenarioUrl}=await import(pathToFileURL(`${root}/public/lib/share.js`).href);
const {thesisUrl,decodeThesis}=await import(pathToFileURL(`${root}/public/lib/thesis-share.js`).href);
const {decodeInspection,defaultLandscape}=await import(pathToFileURL(`${root}/public/lib/journey.js`).href);
const {decodeEntry}=await import(pathToFileURL(`${root}/public/lib/casebook.js`).href);
const {project}=await import(pathToFileURL(`${root}/public/lib/model.js`).href);
const presets=JSON.parse(await readFile(`${root}/data/presets.json`,'utf8'));
const qa=`${root}/qa-local/v3-3/journey`;await mkdir(qa,{recursive:true});
const checks=[],errors=[];
const check=(name,actual,expected=true)=>{assert.deepEqual(actual,expected,name);checks.push(name);};
const near=(name,actual,expected)=>{assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-8*Math.max(1,Math.abs(expected)),`${name}: ${actual} != ${expected}`);checks.push(name);};
const browser=await chromium.launch({headless:true,executablePath:process.env.FRONTIER_CHROMIUM_EXECUTABLE||'/tmp/frontier-chromium-runtime/chromium',args:['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce',acceptDownloads:true});
context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(20000);
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const ready=async(target=page)=>target.locator('[data-result-ev]').waitFor({state:'attached'});
const share=async()=>{await page.locator('#thesis-share').click();await page.locator('#thesis-share-area:not([hidden])').waitFor();return decodeThesis(new URL(await page.locator('#thesis-share-url').inputValue()).hash.slice(8));};
const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('frontier-ai-valuation-lab:casebook:v1')));
try{
  for(const [hash,panel,focused] of [['#sources','#panel-sources','panel-sources'],['#source-S19','#panel-sources','source-S19'],['#methodology','#panel-methodology','panel-methodology']]){
    await page.goto(new URL(`./index.html${hash}`,base).href,{waitUntil:'networkidle'});await ready();
    check(`${hash} opens its actual panel`,await page.locator(panel).isVisible());
    check(`${hash} puts keyboard focus at the destination`,await page.evaluate(()=>document.activeElement.id),focused);
    check(`${hash} lands in view`,await page.locator(`#${focused}`).evaluate(element=>{const rect=element.getBoundingClientRect();return rect.top>=-1&&rect.top<innerHeight&&rect.bottom>0;}));
  }
  await page.locator('.app-nav a').filter({hasText:'Model',exact:true}).click();await page.locator('#panel-model:not([hidden])').waitFor();
  check('Model navigation opens the workbench',await page.evaluate(()=>document.activeElement.id),'workspace');
  await page.locator('#input-g1').fill('52.125');
  await page.locator('.app-nav a').filter({hasText:'Evidence',exact:true}).click();
  await page.locator('.app-nav a').filter({hasText:'Model',exact:true}).click();
  check('Shared navigation retains a current unsaved case',await page.locator('#input-g1').inputValue(),'52.125');
  await page.waitForFunction(()=>!document.querySelector('button[data-evidence-key="g1"]').disabled);
  const trigger=page.locator('button[data-evidence-key="g1"]');await trigger.click();
  await page.locator('dialog[open]').waitFor();
  check('Contextual evidence opens a native dialog',await page.locator('dialog[open]').count(),1);
  const evidence=await page.locator('dialog[open]').innerText();
  check('Contextual evidence identifies the input as an assumption',/assumption/i.test(evidence));
  check('Contextual evidence uses the current edited value',evidence.includes('52.125'));
  check('Contextual evidence includes a modeling boundary',/limit|does not|not a|cannot|assumed/i.test(evidence));
  await page.keyboard.press('Escape');check('Escape closes contextual evidence',await page.locator('dialog[open]').count(),0);
  check('Evidence close returns focus to its opener',await trigger.evaluate(element=>document.activeElement===element));
  await trigger.click();await page.getByRole('button',{name:'Close evidence context'}).click();
  check('The explicit Close button closes evidence without reopening through delegated events',await page.locator('dialog[open]').count(),0);
  check('The explicit Close button returns focus to its opener',await trigger.evaluate(element=>document.activeElement===element));

  const bridge={cash:12.345678901234,debt:3.25,otherClaims:1.125};
  const scenario={company:'Anthropic',scenario:'Base',assumptions:{...presets.Anthropic.Base,g1:.5212345678912345},bridge};
  await page.goto(scenarioUrl(new URL('./index.html',base).href,scenario),{waitUntil:'networkidle'});await ready();
  await page.locator('.local-scenarios').evaluate(element=>element.open=true);await page.locator('#save-name').fill('Research journey — complete bridge');
  await page.locator('#save-scenario').click();await page.waitForFunction(()=>document.querySelector('#saved-scenarios').value!=='');
  const firstId=await page.locator('#saved-scenarios').inputValue();let book=await stored();
  check('Workbench save captures the exact scenario and equity bridge',decodeEntry(book.entries.find(entry=>entry.id===firstId)),scenario);
  check('Workbench save links directly to its Casebook entry',(await page.locator('.local-scenarios .casebook-inline-link').getAttribute('href')).endsWith(encodeURIComponent(firstId)));
  await page.locator('#bridge-details').evaluate(element=>element.open=true);await page.locator('#bridge-cash').fill('');
  check('An enabled incomplete equity bridge disables save',await page.locator('#save-scenario').isDisabled());
  check('Incomplete bridge also disables return/share',await page.locator('#share-scenario').isDisabled()&&await page.locator('#open-thesis').isDisabled());
  await page.locator('#bridge-enabled').uncheck();await page.locator('#save-name').fill('Research journey — no bridge');
  await page.locator('#save-scenario').click();await page.waitForFunction(id=>document.querySelector('#saved-scenarios').value!==id,firstId);
  const nullId=await page.locator('#saved-scenarios').inputValue();
  await page.locator('#saved-scenarios').selectOption(firstId);await page.locator('#load-scenario').click();
  check('Loading the captured bridge restores its enabled setting',await page.locator('#bridge-enabled').isChecked());
  check('Loading the captured bridge restores its full cash precision',await page.locator('#bridge-cash').inputValue(),String(bridge.cash));
  await page.locator('#saved-scenarios').selectOption(nullId);await page.locator('#load-scenario').click();
  check('Loading a saved null bridge clears an unrelated enabled bridge',await page.locator('#bridge-enabled').isChecked(),false);
  check('Loading a null bridge clears the old bridge amounts',await page.locator('#bridge-cash').inputValue(),'0');

  const draft={company:'Anthropic',reference:{scenario:'Base',assumptions:{...presets.Anthropic.Base,g1:.5312345678912345},bridge:{cash:3.25,debt:1.125,otherClaims:.5}},alternative:{scenario:'Bull',assumptions:{...presets.Anthropic.Bull,m30:.1612345678912345},bridge:{cash:8.75,debt:2.25,otherClaims:.75}},landscape:{rates:[.08123456789,.105,.1666666666666],margins:[.06,.1234567890123456,.42],target:537.123456789}};
  await page.goto(thesisUrl(new URL('./thesis.html',base).href,draft),{waitUntil:'networkidle'});await page.locator('[data-thesis-state="ready"]').waitFor();
  const inspection=new URL(await page.locator('#alternative-open').getAttribute('href'));
  check('Forecast inspection link contains the whole exact comparison',decodeInspection(inspection.hash).draft,draft);
  await page.locator('#alternative-open').click();await ready();
  check('The model exposes its surrounding comparison context',await page.locator('#inspection-context').isVisible());
  await page.locator('#input-m30').fill('18.12345678912345');await page.locator('#bridge-details').evaluate(element=>element.open=true);await page.locator('#bridge-cash').fill('9.875');
  await page.locator('#return-comparison').click();await page.locator('[data-thesis-state="ready"]').waitFor();
  let returned=await share();
  check('Returning an edited forecast retains the untouched reference',returned.reference,draft.reference);
  check('Returning an edited forecast retains uneven axes and target',returned.landscape,draft.landscape);
  check('Returning updates the selected assumption exactly',returned.alternative.assumptions.m30,18.12345678912345/100);
  check('Returning updates only the inspected equity bridge',returned.alternative.bridge,{...draft.alternative.bridge,cash:9.875});
  for(const key of Object.keys(draft.alternative.assumptions))if(key!=='m30')check(`Returning retains unedited ${key}`,returned.alternative.assumptions[key],draft.alternative.assumptions[key]);
  await page.locator('#thesis-save').click();await page.waitForFunction(()=>document.querySelector('#thesis-portable-status').textContent.startsWith('Saved both'));
  book=await stored();const savedThesis=book.entries.find(entry=>entry.kind==='thesis');
  check('Saving a comparison captures its entire exact state',decodeEntry(savedThesis),returned);
  await page.locator('#alternative-open').click();await ready();await page.locator('.company-switch [data-company="OpenAI"]').click();
  check('Changing companies clears the old comparison context',await page.locator('#inspection-context').isHidden());

  const targetDraft={company:'Anthropic',reference:{scenario:'Base',assumptions:presets.Anthropic.Base,bridge:null},alternative:{scenario:'Bull',assumptions:presets.Anthropic.Bull,bridge:null},landscape:{...defaultLandscape(presets.Anthropic.Bull),rates:[.075,.105,.195]}};
  await page.goto(thesisUrl(new URL('./thesis.html',base).href,targetDraft),{waitUntil:'networkidle'});await page.locator('[data-thesis-state="ready"]').waitFor();
  await page.locator('#landscape-rate-select').selectOption('1');await page.locator('#use-required-margin').click();returned=await share();
  near('Exact target requirement revalues the alternative to 500B',project(returned.alternative.assumptions).ev,500);
  check('Target requirement retains solver precision',Math.abs(returned.alternative.assumptions.m36-.07118481610922621)<3e-17);
  check('Target requirement retains exact selected WACC',returned.alternative.assumptions.wacc,.105);
  for(const key of Object.keys(presets.Anthropic.Bull))if(!['m36','wacc'].includes(key))check(`Target requirement retains ${key}`,returned.alternative.assumptions[key],presets.Anthropic.Bull[key]);
  await page.locator('#thesis-verify').click();await page.waitForFunction(()=>document.querySelector('#thesis-api-status').classList.contains('is-success'));
  check('The target comparison verifies through both real backend actions',(await page.locator('#thesis-api-status').innerText()).includes('Both complete analyses match'));
  await page.locator('#landscape-target').fill('1000000000000');check('An unsolved target disables exact application',await page.locator('#use-required-margin').isDisabled());

  await page.goto(new URL('./index.html',base).href,{waitUntil:'networkidle'});await ready();
  const shock=page.locator('[data-exp-shock]').first();await shock.evaluate(input=>{input.value=String(Number(input.min));input.dispatchEvent(new Event('input',{bubbles:true}));});
  const stressEv=Number(await page.locator('[data-exp-stress-ev="Anthropic"]').getAttribute('data-exp-value'));
  await page.locator('[data-exp-explain="Anthropic"]').click();await page.locator('[data-thesis-state="ready"]').waitFor();returned=await share();
  check('Stress attribution opens with the actual selected baseline',returned.reference.assumptions,presets.Anthropic.Base);
  near('Stress attribution opens the exact stressed alternative',project(returned.alternative.assumptions).ev,stressEv);
  check('Stress attribution labels both cases with the selected preset',returned.reference.scenario===returned.alternative.scenario&&returned.reference.scenario==='Base');

  for(const width of [390,768,1440]){
    await page.setViewportSize({width,height:1000});
    for(const route of ['index.html','thesis.html','casebook.html']){
      await page.goto(new URL(route,base).href,{waitUntil:'networkidle'});
      check(`${route} at ${width}px uses the same seven navigation items`,await page.locator('.app-nav a').allTextContents(),['Capital Studio','Overview','Model','Thesis Lab','Value Horizon','Casebook','Evidence']);
      check(`${route} at ${width}px has one current navigation item`,await page.locator('.app-nav a[aria-current]').count(),1);
      check(`${route} at ${width}px has no page overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
  }
  await page.goto(new URL('thesis.html',base).href,{waitUntil:'networkidle'});await page.locator('[data-thesis-state="ready"]').waitFor();
  await page.screenshot({path:`${qa}/thesis-connected.png`,animations:'disabled'});
  check('Integrated journey has no uncaught browser errors',errors,[]);
  await writeFile(`${qa}/report.json`,JSON.stringify({status:'passed',checks:checks.length,details:checks,browserErrors:errors},null,2)+'\n');
  console.log(`Research journey: ${checks.length} browser checks passed.`);
}catch(error){await page.screenshot({path:`${qa}/failure.png`,animations:'disabled'});await writeFile(`${qa}/failure.json`,JSON.stringify({passed:checks.length,checks,errors,error:String(error),url:page.url()},null,2)+'\n');throw error;}
finally{await browser.close();}
