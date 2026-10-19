// Run against an existing local server. Each case uses an isolated browser profile
// and a genuine held Web Lock to expose delayed persistence without timing sleeps.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(process.env.FRONTIER_PROJECT_ROOT||process.cwd());
const base=process.env.FRONTIER_BASE_URL||'http://127.0.0.1:4323/';
const require=createRequire(`${root}/package.json`);
const {chromium}=require(process.env.FRONTIER_PLAYWRIGHT_MODULE||`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`);
const {scenarioUrl}=await import(pathToFileURL(`${root}/public/lib/share.js`).href);
const {thesisUrl}=await import(pathToFileURL(`${root}/public/lib/thesis-share.js`).href);
const {decodeEntry}=await import(pathToFileURL(`${root}/public/lib/casebook.js`).href);
const {CASEBOOK_STORAGE_KEY}=await import(pathToFileURL(`${root}/public/lib/casebook-store.js`).href);
const presets=JSON.parse(await readFile(`${root}/data/presets.json`,'utf8'));
const qa=`${root}/qa-local/v3-3/save-race`;await mkdir(qa,{recursive:true});
const checks=[],errors=[];
const check=(name,actual,expected=true)=>{assert.deepEqual(actual,expected,name);checks.push(name);};
const draft={
  company:'Anthropic',
  reference:{scenario:'Base',assumptions:{...presets.Anthropic.Base,g1:.5312345678912345},bridge:{cash:3.25,debt:1.125,otherClaims:.5}},
  alternative:{scenario:'Bull',assumptions:{...presets.Anthropic.Bull,m30:.1612345678912345},bridge:{cash:8.75,debt:2.25,otherClaims:.75}},
  landscape:{rates:[.075,.105,.195],margins:[.06,.181234567891,.42],target:500}
};
const scenario={company:'Anthropic',scenario:'Base',assumptions:{...presets.Anthropic.Base,g1:.5212345678912345},bridge:{cash:3.45,debt:1.125,otherClaims:.5}};
const browser=await chromium.launch({headless:true,executablePath:process.env.FRONTIER_CHROMIUM_EXECUTABLE||'/tmp/frontier-chromium-runtime/chromium',args:['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let currentPage;

async function isolated(task){
  const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
  context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(20000);
  const page=await context.newPage();currentPage=page;page.on('pageerror',error=>errors.push(error.message));
  try{await task(page);}finally{await context.close();currentPage=null;}
}
async function holdSaveLock(page){
  await page.evaluate(key=>{
    window.saveRaceAcquired=false;
    window.saveRaceLock=navigator.locks.request(key,async()=>{
      window.saveRaceAcquired=true;
      await new Promise(resolve=>{window.releaseSaveRaceLock=resolve;});
    });
  },CASEBOOK_STORAGE_KEY);
  await page.waitForFunction(()=>window.saveRaceAcquired);
}
async function waitForPendingSave(page){
  await page.waitForFunction(async key=>(await navigator.locks.query()).pending.some(lock=>lock.name===key),CASEBOOK_STORAGE_KEY);
}
async function releaseSaveLock(page,status){
  await page.evaluate(()=>window.releaseSaveRaceLock());
  await page.waitForFunction(selector=>document.querySelector(selector).textContent.startsWith('Saved'),status);
}
async function storedEntry(page){
  const book=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),CASEBOOK_STORAGE_KEY);
  assert.equal(book.entries.length,1,'The pending save must create exactly one entry.');
  return book.entries[0];
}
function honestEarlierStatus(message){return /earlier|previous/i.test(message)&&/current[^.]*?(not saved|unsaved)/i.test(message);}

try{
  await isolated(async page=>{
    await page.goto(thesisUrl(new URL('./thesis.html',base).href,draft),{waitUntil:'networkidle'});
    await page.locator('[data-thesis-state="ready"]').waitFor();
    await holdSaveLock(page);await page.locator('#thesis-save').click();await waitForPendingSave(page);
    check('A pending comparison save cannot be submitted twice',await page.locator('#thesis-save').isDisabled());
    await page.locator('#landscape-target').fill('601');
    await releaseSaveLock(page,'#thesis-portable-status');
    const entry=await storedEntry(page);
    check('A delayed comparison save retains both exact captured cases, bridges and axes',decodeEntry(entry),draft);
    check('The later visible target edit remains in the workbench',await page.locator('#landscape-target').inputValue(),'601');
    check('The comparison status identifies the earlier save and unsaved current edits',honestEarlierStatus(await page.locator('#thesis-portable-status').innerText()));
    check('The earlier saved comparison link opens the actual returned entry',(await page.locator('.review-actions .casebook-inline-link').getAttribute('href')).endsWith(encodeURIComponent(entry.id)));
    check('The changed comparison can be saved after the prior operation completes',await page.locator('#thesis-save').isEnabled());
  });

  await isolated(async page=>{
    await page.goto(scenarioUrl(new URL('./index.html',base).href,scenario),{waitUntil:'networkidle'});
    await page.locator('[data-result-ev]').waitFor();
    await page.locator('.local-scenarios').evaluate(element=>element.open=true);
    await page.locator('#save-name').fill('Pending bridge');
    await page.locator('#bridge-details').evaluate(element=>element.open=true);
    await holdSaveLock(page);await page.locator('#save-scenario').click();await waitForPendingSave(page);
    check('A pending scenario save cannot be submitted twice',await page.locator('#save-scenario').isDisabled());
    await page.locator('#bridge-cash').fill('99');
    await releaseSaveLock(page,'#local-status');
    const entry=await storedEntry(page);
    check('A delayed scenario save retains all exact captured inputs and bridge balances',decodeEntry(entry),scenario);
    check('A bridge-only edit remains visible after the prior snapshot saves',await page.locator('#bridge-cash').inputValue(),'99');
    check('A bridge-only edit receives an honest earlier-save status',honestEarlierStatus(await page.locator('#local-status').innerText()));
    check('The earlier scenario link opens the actual returned entry',(await page.locator('.local-scenarios .casebook-inline-link').getAttribute('href')).endsWith(encodeURIComponent(entry.id)));
    check('The edited bridge can be saved after the prior operation completes',await page.locator('#save-scenario').isEnabled());
  });

  await isolated(async page=>{
    await page.goto(thesisUrl(new URL('./thesis.html',base).href,draft),{waitUntil:'networkidle'});
    await page.locator('[data-thesis-state="ready"]').waitFor();
    await holdSaveLock(page);await page.locator('#thesis-save').click();await waitForPendingSave(page);
    await page.locator('#thesis-share').click();await page.locator('#thesis-share-area:not([hidden])').waitFor();
    await releaseSaveLock(page,'#thesis-portable-status');
    check('Copying an unchanged comparison while saving retains the exact snapshot',decodeEntry(await storedEntry(page)),draft);
    check('Copying an unchanged calculation does not falsely mark it as unsaved',!honestEarlierStatus(await page.locator('#thesis-portable-status').innerText()));
    check('An unchanged calculation receives the normal current-save confirmation',(await page.locator('#thesis-portable-status').innerText()).startsWith('Saved both complete cases'));
  });

  check('Pending-save journeys produce no uncaught browser errors',errors,[]);
  await writeFile(`${qa}/report.json`,JSON.stringify({status:'passed',checks:checks.length,details:checks,browserErrors:errors},null,2)+'\n');
  console.log(`Pending save continuity: ${checks.length} browser checks passed.`);
}catch(error){
  if(currentPage)await currentPage.screenshot({path:`${qa}/failure.png`,animations:'disabled'}).catch(()=>{});
  await writeFile(`${qa}/failure.json`,JSON.stringify({passed:checks.length,checks,errors,error:String(error)},null,2)+'\n');
  throw error;
}finally{await browser.close();}
