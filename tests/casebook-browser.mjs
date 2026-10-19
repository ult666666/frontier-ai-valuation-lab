// Focused real-browser checks for the research Casebook. Uses isolated, labeled QA records.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(process.env.FRONTIER_PROJECT_ROOT||process.cwd());
const require=createRequire(`${root}/package.json`);
const {chromium}=require(process.env.FRONTIER_PLAYWRIGHT_MODULE||`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`);
const moduleAt=path=>import(pathToFileURL(`${root}/${path}`).href);
const {createCasebook,createScenarioEntry,createThesisEntry,parseCasebook,serializeCasebook,decodeEntry}=await moduleAt('public/lib/casebook.js');
const {CASEBOOK_STORAGE_KEY,LEGACY_STORAGE_KEY}=await moduleAt('public/lib/casebook-store.js');
const {decodeScenario}=await moduleAt('public/lib/share.js');
const {decodeThesis}=await moduleAt('public/lib/thesis-share.js');
const {defaultLandscape}=await moduleAt('public/lib/journey.js');
const {MODEL_VERSION,VALUATION_DATE,project}=await moduleAt('public/lib/model.js');
const {APP_VERSION}=await moduleAt('public/lib/release.js');
const research=JSON.parse(await readFile(`${root}/data/research.json`,'utf8'));
const presets=JSON.parse(await readFile(`${root}/data/presets.json`,'utf8'));
const base=process.env.FRONTIER_BASE_URL||'http://127.0.0.1:4323/';
const qa=resolve(process.env.FRONTIER_QA_OUTPUT||`${root}/qa-local/v3-3/casebook`);
await mkdir(qa,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.FRONTIER_CHROMIUM_EXECUTABLE||'/tmp/frontier-chromium-runtime/chromium',args:['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const checks=[],browserErrors=[],screenshots={};
const check=(name,actual,expected=true)=>{assert.deepEqual(actual,expected,name);checks.push(name);};
const capture=async(page,name,fullPage=false)=>{const path=`${qa}/${name}.png`;await page.screenshot({path,fullPage});screenshots[name]=path;};
const now='2026-10-19T08:00:00.000Z';
const notes={rationale:'QA demonstration: test the economics implied by these explicit assumptions.',keyAssumption:'Capital must remain available at the modeled cost.',reviewTrigger:'Revisit after dated evidence changes the operating context.'};
const a={company:'Anthropic',scenario:'Base',assumptions:{...presets.Anthropic.Base,g1:.5737533333333333,turns:1.55,wacc:.1375},bridge:null};
const b={company:'Anthropic',scenario:'Bull',assumptions:{...presets.Anthropic.Bull,m36:.3151234556667,wacc:.1034567890123},bridge:{cash:12.25,debt:2.5,otherClaims:.75}};
const c={company:'OpenAI',scenario:'Base',assumptions:{...presets.OpenAI.Base},bridge:null};
const caseOnly=({scenario,assumptions,bridge})=>({scenario,assumptions,bridge});
const pair={company:'Anthropic',reference:caseOnly(a),alternative:caseOnly(b),landscape:{rates:[.081,.105,.136,.18],margins:[.03,.071,.13,.275,.49],target:500}};
const meta=(id,title,sourceIds=['S19'])=>({id,title,createdAt:now,updatedAt:now,notes:{...notes},sourceIds});
const entries=[createScenarioEntry(a,meta('qa-capital','Capital efficiency under pressure',['S04','S19']),research),createScenarioEntry(b,meta('qa-margins','Stronger operating leverage'),research),createScenarioEntry(c,meta('qa-openai','Distribution and the margin transition'),research),createThesisEntry(pair,meta('qa-comparison','Two views of the capital requirement',['S01','S18','S19']),research)];
const fixture=createCasebook(entries,research),fixtureText=serializeCasebook(fixture,research);
const contexts=[];
async function pageFor({seed=null,legacy=null,deny=false,quota=false}={}){
  const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true,reducedMotion:'reduce'});contexts.push(context);
  await context.addInitScript(({key,legacyKey,seed,legacy,deny,quota})=>{
    if(!sessionStorage.getItem('casebook-qa-seeded')){
      if(seed!==null)localStorage.setItem(key,seed);
      if(legacy!==null)localStorage.setItem(legacyKey,legacy);
      sessionStorage.setItem('casebook-qa-seeded','yes');
    }
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('QA clipboard denial','NotAllowedError');}}});
    if(quota){const original=Storage.prototype.setItem;Storage.prototype.setItem=function(name,value){if(name===key)throw new DOMException('QA storage quota exhausted','QuotaExceededError');return original.call(this,name,value);};}
    if(deny)Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('QA storage access denied','SecurityError');}});
  },{key:CASEBOOK_STORAGE_KEY,legacyKey:LEGACY_STORAGE_KEY,seed,legacy,deny,quota});
  const page=await context.newPage();page.on('pageerror',error=>browserErrors.push(error.message));
  return{context,page};
}
const stored=page=>page.evaluate(key=>localStorage.getItem(key),CASEBOOK_STORAGE_KEY);
const book=async page=>parseCasebook(await stored(page),research);
const choose=async(page,id)=>{await page.locator(`[data-select-entry="${id}"]`).click();await page.waitForFunction(id=>document.querySelector('#entry-detail').dataset.entryId===id,id);};
const upload=async(page,text,name='casebook.json')=>{await page.locator('#import-file').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(text)});};
async function downloaded(page,selector,name){const pending=page.waitForEvent('download');await page.locator(selector).click();const file=await pending;await file.saveAs(`${qa}/${name}`);return readFile(`${qa}/${name}`,'utf8');}
let failure;
try{
  const{page,context}=await pageFor();
  await page.goto(new URL('casebook.html',base).href,{waitUntil:'networkidle'});
  await page.locator('body[data-casebook-state="empty"]').waitFor();
  check('Fresh browser opens an honest empty Casebook',await page.locator('.entry-card').count(),0);
  check('Empty state points to the real Thesis Lab',await page.locator('.empty-actions a').first().getAttribute('href'),'./thesis.html');
  check('Export is unavailable until a saved record exists',await page.locator('#export-all').isDisabled());
  check('All five research navigation destinations are visible',await page.locator('.app-nav a').count(),5);
  await capture(page,'empty-desktop');

  await page.locator('#import-open').click();await upload(page,fixtureText);await page.locator('#import-merge:not([disabled])').waitFor();
  check('Strict import previews all four real fixture entries',await page.locator('#import-entries li').count(),4);
  check('Import preview makes no storage write',await stored(page),null);
  await capture(page,'import-preview');
  await page.locator('#import-merge').click();await page.locator('body[data-casebook-state="ready"]').waitFor();
  check('Merging a preview adds complete entries', (await book(page)).entries.length,4);
  check('Saved cards are built from actual entries',await page.locator('.entry-card').count(),4);
  check('The detail shows all nineteen known source controls',await page.locator('#source-choices input').count(),19);
  check('Source metadata preserves every register date, including undated, update and retrieval qualifiers',await page.locator('#source-choices .source-choice').evaluateAll(choices=>choices.map(choice=>({id:choice.querySelector('input').value,metadata:choice.querySelector('div > p').textContent}))),research.sources.map(source=>({id:source.id,metadata:`${source.publisher} · ${source.date} · ${source.type}`})));

  const initialBytes=await stored(page);
  await page.locator('#import-open').click();await upload(page,fixtureText);await page.waitForFunction(()=>document.querySelector('#import-summary').textContent==='No new analyses to add.');
  check('Exact duplicate import is a no-op',await page.locator('#import-merge').isDisabled());
  check('Duplicate preview leaves original bytes unchanged',await stored(page),initialBytes);
  await page.keyboard.press('Escape');check('Escape closes the native import dialog',await page.locator('#import-dialog').evaluate(el=>el.open),false);

  await page.locator('#company-filter').selectOption('OpenAI');check('Company filter finds only that business',await page.locator('.entry-card').count(),1);
  await page.locator('#company-filter').selectOption('all');await page.locator('#kind-filter').selectOption('thesis');check('Kind filter finds saved comparisons',await page.locator('.entry-card').count(),1);
  await page.locator('#kind-filter').selectOption('all');await page.locator('#casebook-search').fill('capital efficiency');check('Search finds a saved title',await page.locator('.entry-card').count(),1);
  await page.locator('#casebook-search').fill('no-such-qa-entry');check('No-match state is explicit',await page.locator('#filter-empty').isVisible());await page.locator('#clear-filters').click();

  await choose(page,'qa-capital');
  check('Saved financial token is the exact original token',await page.locator('#entry-snapshot').getAttribute('data-entry-token'),entries[0].token);
  check('Reopen carries all exact inputs and the null bridge',decodeScenario(new URL(await page.locator('#entry-reopen').getAttribute('href')).hash.slice(10)),a);
  const hostile='A plain-text thesis <img src=x onerror=window.casebookInjected=1>';
  const hostileNote='A <script>window.casebookInjected=2</script> is text.\nKeep <b>this claim</b>, café, Ω and 🧭 exactly.';
  await page.locator('#entry-title').fill(hostile);await page.locator('#note-rationale').fill(hostileNote);await page.locator('#note-key-assumption').fill('The 2027–2030 growth assumption remains 57.37533333333333%.');
  await page.locator('.source-picker > summary').click();await page.locator('#casebook-source-S18').check();await page.locator('.source-picker > summary').click();
  check('Edited notes visibly remain unsaved before saving',await page.locator('#notes-state').textContent(),'Unsaved notes');
  await page.locator('#save-notes').click();await page.waitForFunction(()=>document.querySelector('#notes-state').textContent==='Saved');
  let current=(await book(page)).entries.find(entry=>entry.id==='qa-capital');
  check('Saving notes does not alter the immutable financial token',current.token,entries[0].token);
  check('Plain-text notes round-trip exactly',current.notes.rationale,hostileNote);
  check('Chosen sources retain known register IDs',current.sourceIds,['S04','S18','S19']);
  check('Hostile titles do not create image/script elements',await page.locator('#detail-title img, #detail-title script, #entry-list img, #entry-list script').count(),0);
  check('Hostile text never executes',await page.evaluate(()=>window.casebookInjected??null),null);
  await page.reload({waitUntil:'networkidle'});await page.locator('#entry-detail[data-entry-id="qa-capital"]').waitFor();
  check('Reload restores the selected saved analysis',await page.locator('#entry-title').inputValue(),hostile);
  check('Reload preserves multiline Unicode notes',await page.locator('#note-rationale').inputValue(),hostileNote);
  check('Native note controls enforce the agreed character bounds',await page.locator('#entry-title, #note-rationale, #note-key-assumption, #note-review-trigger').evaluateAll(elements=>elements.map(el=>el.maxLength)),[100,1200,600,1000]);

  await page.locator('#copy-calculation').click();await page.locator('#calculation-link-area:not([hidden])').waitFor();
  const calculationLink=await page.locator('#calculation-link').inputValue();check('Manual clipboard fallback contains the exact saved calculation',decodeScenario(new URL(calculationLink).hash.slice(10)),a);
  check('Calculation link does not include research notes',calculationLink.includes('casebookInjected'),false);
  const selectedExport=parseCasebook(await downloaded(page,'#export-entry','selected.json'),research);
  check('Selected JSON exports one complete entry',selectedExport.entries,[current]);
  const allExport=parseCasebook(await downloaded(page,'#export-all','all.json'),research);check('Full JSON export contains every saved analysis',allExport.entries.length,4);
  const brief=await downloaded(page,'#export-brief','research-brief.html');
  check('Research brief is script-free',await page.evaluate(html=>{const doc=new DOMParser().parseFromString(html,'text/html');return doc.querySelectorAll('script').length===0&&[...doc.querySelectorAll('*')].every(element=>[...element.attributes].every(attribute=>!/^on/i.test(attribute.name)));},brief));
  check('Research brief escapes hostile notes',brief.includes('&lt;script&gt;window.casebookInjected=2&lt;/script&gt;'));
  check('Research brief retains its exact calculation reopening link',brief.includes(calculationLink));

  const requests=[];page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/valuation')requests.push(request.postDataJSON());});
  await page.locator('#verify-entry').click();await page.waitForFunction(()=>document.querySelector('#entry-verification').dataset.state==='success');
  check('Scenario verification sends only a calculation payload',Object.keys(requests.at(-1)).sort(),['action','assumptions']);
  check('Verification uses exact saved assumptions',requests.at(-1).assumptions,a.assumptions);
  await choose(page,'qa-comparison');await page.locator('#verify-entry').click();await page.waitForFunction(()=>document.querySelector('#entry-verification').dataset.state==='success');
  check('Comparison verification submits attribution and landscape',requests.slice(-2).map(value=>value.action).sort(),['attribute','landscape']);
  check('Research notes and selected evidence are never submitted for verification',requests.every(value=>!('notes'in value)&&!('sourceIds'in value)&&!('title'in value)&&!JSON.stringify(value).includes('casebookInjected')));
  await choose(page,'qa-capital');
  await page.route('**/api/valuation',async route=>{const response=await route.fetch(),json=await response.json();json.result.rows[2].reinvestment+=1;await route.fulfill({response,json});});
  await page.locator('#verify-entry').click();await page.waitForFunction(()=>document.querySelector('#entry-verification').dataset.state==='error');
  check('Complete-result verification detects a changed annual field with unchanged EV',(await page.locator('#entry-verification').textContent()).includes('complete server result does not match'));
  await page.unroute('**/api/valuation');

  let releaseResponse,delayed=false;
  await page.route('**/api/valuation',async route=>{const response=await route.fetch();delayed=true;await new Promise(resolve=>{releaseResponse=resolve;});try{await route.fulfill({response});}catch{/* Selection aborts the request. */}});
  await page.locator('#verify-entry').click();await page.waitForFunction(()=>document.querySelector('#entry-verification').dataset.state==='pending');
  const delayDeadline=Date.now()+10000;while(!delayed&&Date.now()<delayDeadline)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(delayed,'Delayed API fixture was reached');
  await choose(page,'qa-margins');releaseResponse();await page.unroute('**/api/valuation');await page.waitForTimeout(100);
  check('Selecting another saved analysis cancels stale verification',await page.locator('#entry-verification').textContent(),'Recalculated in your browser');

  await page.locator('[data-compare-entry="qa-capital"]').focus();await page.keyboard.press('Space');check('Saved-case comparison selection is keyboard operable',await page.locator('[data-compare-entry="qa-capital"]').isChecked());await page.locator('[data-compare-entry="qa-openai"]').check();
  check('Cross-company saved cases cannot become a same-company attribution',await page.locator('#compare-saved').isDisabled());
  await page.locator('#clear-comparison').click();await page.locator('[data-compare-entry="qa-capital"]').check();await page.locator('[data-compare-entry="qa-margins"]').check();
  await page.locator('#compare-saved').click();await page.waitForURL(url=>url.pathname.endsWith('/thesis.html'));
  const comparison=decodeThesis(new URL(page.url()).hash.slice(8));
  check('Comparison uses the first chosen saved case as reference',comparison.reference,caseOnly(a));
  check('Comparison keeps the alternative exact inputs and its own bridge',comparison.alternative,caseOnly(b));
  check('Saved-case comparison uses the shared default landscape',comparison.landscape,defaultLandscape(b.assumptions));
  await page.goto(new URL('casebook.html#entry=qa-capital',base).href,{waitUntil:'networkidle'});await page.locator('#entry-detail[data-entry-id="qa-capital"]').waitFor();

  await page.locator('#delete-entry').click();await page.waitForFunction(()=>document.querySelector('#casebook-count').textContent==='3');
  check('Deleting a selected record preserves all others',(await book(page)).entries.some(entry=>entry.id==='qa-capital'),false);
  await page.locator('#undo-delete').click();await page.waitForFunction(()=>document.querySelector('#casebook-count').textContent==='4');
  check('Undo restores the exact saved record',(await book(page)).entries.find(entry=>entry.id==='qa-capital'),current);

  const beforeImport=await stored(page);
  await page.locator('#import-open').click();await upload(page,'{"schema":1}');await page.locator('#import-error:not([hidden])').waitFor();
  check('Malformed JSON envelope cannot be merged',await page.locator('#import-merge').isDisabled());check('Malformed import preserves existing bytes',await stored(page),beforeImport);
  const invalidSource=structuredClone(fixture);invalidSource.entries[0].sourceIds=['S999'];await upload(page,JSON.stringify(invalidSource));await page.locator('#import-error:not([hidden])').waitFor();
  check('Unknown source IDs reject the entire import',await page.locator('#import-merge').isDisabled());
  const incompatible=structuredClone(fixture);incompatible.modelVersion='99.0.0';await upload(page,JSON.stringify(incompatible));await page.locator('#import-error:not([hidden])').waitFor();check('Incompatible model imports leave saved data intact',await stored(page),beforeImport);
  await upload(page,' '.repeat(524289));await page.waitForFunction(()=>document.querySelector('#import-error').textContent.includes('512 KiB'));
  check('Oversized file is rejected before merging',await page.locator('#import-merge').isDisabled());
  const crowded=createCasebook(Array.from({length:24},(_,i)=>createScenarioEntry(a,meta(`qa-more-${i}`,`Additional QA case ${i}`),research)),research);await upload(page,serializeCasebook(crowded,research));await page.locator('#import-error:not([hidden])').waitFor();
  check('Over-capacity merge preserves the complete existing book',await stored(page),beforeImport);
  await upload(page,serializeCasebook(createCasebook([entries[0]],research),research));await page.locator('#import-merge:not([disabled])').waitFor();
  check('ID collision preview explicitly preserves both records',(await page.locator('#import-detail').textContent()).includes('1 conflicting version'));
  await page.locator('#import-merge').click();await page.waitForFunction(()=>document.querySelector('#casebook-count').textContent==='5');
  check('Import collision keeps the existing edited title',(await book(page)).entries.find(entry=>entry.id==='qa-capital').title,hostile);
  check('Import collision remaps the older conflicting record',(await book(page)).entries.some(entry=>entry.id!=='qa-capital'&&entry.title===entries[0].title));

  // Native input tampering must not bypass the saved record's validated bounds.
  await choose(page,'qa-capital');await page.locator('#note-review-trigger').evaluate(el=>{el.value='x'.repeat(1001);el.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#save-notes').click();
  check('Oversized note cannot be persisted',(await page.locator('#notes-error').textContent()).includes('1,000'));
  check('Failed note validation retains the saved financial record',(await book(page)).entries.find(entry=>entry.id==='qa-capital').token,entries[0].token);
  await page.locator('#discard-notes').click();
  await page.locator('#entry-title').fill('Capital efficiency under pressure');await page.locator('#note-rationale').fill(notes.rationale);await page.locator('#save-notes').click();await page.waitForFunction(()=>document.querySelector('#notes-state').textContent==='Saved');
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await capture(page,'populated-desktop');
  for(const width of[390,768,1440]){
    await page.setViewportSize({width,height:1000});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    check(`No horizontal page overflow at ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    check(`All five navigation links remain available at ${width}px`,await page.locator('.app-nav a:visible').count(),5);
    await capture(page,`populated-${width}`);
    if(width===390){await choose(page,'qa-margins');check('Selecting a card on mobile brings the detail heading into view',await page.locator('#detail-title').evaluate(el=>{const box=el.getBoundingClientRect();return box.top>=0&&box.bottom<innerHeight;}));check('Mobile currency amounts stay on one readable line',await page.locator('.snapshot-stat > strong').evaluateAll(elements=>elements.every(el=>getComputedStyle(el).whiteSpace==='nowrap'&&el.scrollWidth<=el.clientWidth+1)));await capture(page,'detail-mobile');}
  }
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.documentElement.style.zoom='2');check('Casebook reflows without page overflow at 200% zoom',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>document.documentElement.style.zoom='');

  await choose(page,'qa-margins');await page.locator('#note-rationale').fill('Keep this unsaved reasoning attached to the removed margin case.');
  const beforeExternal=await stored(page),other=await context.newPage();other.on('pageerror',error=>browserErrors.push(error.message));await other.goto(new URL('casebook.html',base).href,{waitUntil:'networkidle'});
  await other.evaluate(({key,id})=>{const book=JSON.parse(localStorage.getItem(key));book.entries=book.entries.filter(entry=>entry.id!==id);localStorage.setItem(key,JSON.stringify(book));},{key:CASEBOOK_STORAGE_KEY,id:'qa-margins'});
  await page.locator('#external-change:not([hidden])').waitFor();
  check('A record removed in another tab does not redirect unsaved notes to a different record',await page.locator('#entry-detail').getAttribute('data-entry-id'),'qa-margins');
  check('Notes on an externally removed record cannot overwrite another case',await page.locator('#save-notes').isDisabled());
  const removedRescue=parseCasebook(await downloaded(page,'#export-entry','removed-record-rescue.json'),research);check('Unsaved notes from an externally removed record remain portable',removedRescue.entries[0].notes.rationale,'Keep this unsaved reasoning attached to the removed margin case.');check('Removed-record rescue retains the correct financial token',removedRescue.entries[0].token,entries[1].token);
  await page.locator('#discard-notes').click();await other.evaluate(({key,text})=>localStorage.setItem(key,text),{key:CASEBOOK_STORAGE_KEY,text:beforeExternal});await other.close();

  const legacyPayload=JSON.stringify({version:1,scenarios:[{id:'earlier-valid',name:'Earlier research case',company:a.company,scenario:a.scenario,assumptions:a.assumptions,modelVersion:MODEL_VERSION,savedAt:now},{id:'earlier-invalid',name:'Older incompatible model',company:c.company,scenario:c.scenario,assumptions:c.assumptions,modelVersion:'2.0.0',savedAt:now}]});
  const{page:legacyPage}=await pageFor({legacy:legacyPayload});await legacyPage.goto(new URL('casebook.html',base).href,{waitUntil:'networkidle'});await legacyPage.locator('#legacy-notice:not([hidden])').waitFor();
  check('Earlier saves are not automatically migrated',await stored(legacyPage),null);await legacyPage.locator('#migration-open').click();await legacyPage.locator('#import-merge:not([disabled])').waitFor();
  check('Legacy migration identifies invalid records',await legacyPage.locator('#migration-invalid-list li').count(),1);await legacyPage.locator('#import-merge').click();await legacyPage.waitForFunction(()=>document.querySelector('#casebook-count').textContent==='1');
  check('Legacy migration restores assumptions with an explicit disabled bridge',decodeEntry((await book(legacyPage)).entries[0]),a);
  check('Legacy migration never rewrites its source key',await legacyPage.evaluate(key=>localStorage.getItem(key),LEGACY_STORAGE_KEY),legacyPayload);
  await legacyPage.locator('#migration-open').click();await legacyPage.waitForFunction(()=>document.querySelector('#import-summary').textContent==='No new analyses to add.');check('Repeated legacy migration is idempotent',await legacyPage.locator('#import-merge').isDisabled());await legacyPage.locator('#import-cancel').click();

  const{page:denied}=await pageFor({deny:true});await denied.goto(new URL('casebook.html',base).href,{waitUntil:'networkidle'});await denied.locator('body[data-casebook-state="unavailable"]').waitFor();check('Denied browser storage is explicit',await denied.locator('#storage-error').isVisible());check('Denied storage is never represented as an empty saved casebook',await denied.locator('#casebook-empty').isVisible(),false);
  const{page:corrupt}=await pageFor({seed:'{"schema":1}'});await corrupt.goto(new URL('casebook.html',base).href,{waitUntil:'networkidle'});await corrupt.locator('body[data-casebook-state="unavailable"]').waitFor();check('Corrupt stored data is preserved for recovery',await stored(corrupt),'{"schema":1}');
  const{page:quota}=await pageFor({seed:fixtureText,quota:true});await quota.goto(new URL('casebook.html#entry=qa-capital',base).href,{waitUntil:'networkidle'});await quota.locator('#entry-detail[data-entry-id="qa-capital"]').waitFor();await quota.locator('#note-rationale').fill('Unsaved reasoning survives a quota failure.');await quota.locator('#save-notes').click();await quota.locator('#notes-error:not([hidden])').waitFor();
  check('Failed storage write leaves the original casebook bytes intact',await stored(quota),fixtureText);
  check('Failed storage write leaves typed notes visible',await quota.locator('#note-rationale').inputValue(),'Unsaved reasoning survives a quota failure.');
  const rescue=parseCasebook(await downloaded(quota,'#export-entry','quota-rescue.json'),research);check('Portable export rescues valid unsaved notes after quota failure',rescue.entries[0].notes.rationale,'Unsaved reasoning survives a quota failure.');check('Rescue export retains the original immutable calculation',rescue.entries[0].token,entries[0].token);

  check('All Casebook browser flows complete without runtime errors',browserErrors,[]);
}catch(error){failure=error;}
finally{
  await writeFile(`${qa}/browser-checks.json`,JSON.stringify({status:failure?'failed':'passed',applicationVersion:APP_VERSION,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,testedAtUtc:new Date().toISOString(),baseUrl:base,browserVersion:browser.version(),fixturePurpose:'Isolated synthetic research records for interface verification; no user saved history was fabricated.',passed:checks.length,checks,browserErrors,screenshots,error:failure?.stack??null},null,2)+'\n');
  await browser.close();
}
if(failure)throw failure;
console.log(JSON.stringify({status:'passed',checks:checks.length,browserErrors,screenshots},null,2));
