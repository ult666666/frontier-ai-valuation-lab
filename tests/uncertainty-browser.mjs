// Real-browser checks for the Monte Carlo panel: accessible chart and table
// equivalents, keyboard use, stale-result protection, mobile layout, and the
// same seed giving byte-identical results in Chromium and the Node API.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(process.env.FRONTIER_PROJECT_ROOT||process.cwd());
const require=createRequire(`${root}/package.json`);
const {chromium}=require(process.env.FRONTIER_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.FRONTIER_BASE_URL||'http://127.0.0.1:4341/';
const output=resolve(process.env.FRONTIER_UNCERTAINTY_QA_DIR||`${root}/qa-local/uncertainty/browser`);
const executablePath=process.env.FRONTIER_CHROMIUM_EXECUTABLE||undefined;
await mkdir(output,{recursive:true});
const checks=[],errors=[];
const check=(label,actual,expected=true)=>{assert.deepEqual(actual,expected,label);checks.push(label);};
const {simulateValuation}=await import(pathToFileURL(`${root}/public/lib/uncertainty.js`).href);
const {detExp,detLog}=await import(pathToFileURL(`${root}/public/lib/deterministic-math.js`).href);
const browser=await chromium.launch({headless:true,executablePath,args:executablePath?['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
const context=await browser.newContext({viewport:{width:1440,height:1100},deviceScaleFactor:1,reducedMotion:'reduce',acceptDownloads:true});
context.setDefaultTimeout(30000);
const page=await context.newPage();
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const panel=page.locator('#uncertainty-panel');
const ready=()=>page.locator('#uncertainty-panel[data-uncertainty-state="ready"]').waitFor();
const metric=async name=>Number(await page.locator(`[data-uncertainty-metric="${name}"]`).getAttribute('data-value'));
const engine={};
let failure=null;
try{
  const response=await page.goto(new URL('index.html#uncertainty',base).href,{waitUntil:'networkidle'});
  check('The Model page is served',response.status(),200);
  await page.locator('#uq-run:not([disabled])').waitFor();
  check('The uncertainty route focuses the section',await page.evaluate(()=>document.activeElement?.id),'uncertainty');
  check('Navigation keeps its seven destinations',await page.locator('.app-nav a').count(),7);
  check('Suggested ranges centre the margin on the case',[await page.locator('#uq-m36-min').inputValue(),await page.locator('#uq-m36-mid').inputValue(),await page.locator('#uq-m36-max').inputValue()],['16','22','28']);
  check('Dilution is unavailable without a hypothetical bridge',await page.locator('#uq-dilution-on').isDisabled());
  check('Every driver control has an accessible name',await page.locator('#uq-form input, #uq-form select').evaluateAll(nodes=>nodes.every(node=>(node.labels?.length)||node.getAttribute('aria-label'))));

  await page.locator('#uq-run').focus();await page.keyboard.press('Enter');await ready();
  check('Keyboard Enter runs the simulation in the browser',/Calculated in your browser/.test(await page.locator('#uq-status').innerText()));
  for(const [id,name] of [['uq-distribution-chart','distribution'],['uq-tornado-chart','tornado']]){
    const chart=page.locator(`#${id} svg`);
    check(`The ${name} chart is an image with a title and description`,await chart.evaluate(svg=>{const ids=(svg.getAttribute('aria-labelledby')||'').split(/\s+/);return svg.getAttribute('role')==='img'&&ids.length===2&&ids.every(id=>document.getElementById(id)?.textContent.trim().length>20);}));
    check(`The scrollable ${name} chart region is keyboard reachable`,await page.locator(`#${id}`).getAttribute('tabindex'),'0');
  }
  const distribution=page.locator('.uq-data').first();
  await distribution.locator('summary').focus();await page.keyboard.press('Enter');
  check('The distribution table opens from the keyboard',await distribution.evaluate(node=>node.open));
  check('The table equivalent lists five percentiles and every histogram bin',await page.locator('#uq-distribution-table tbody tr').count(),5+3+24+2);
  const tornado=page.locator('.uq-data').nth(1);
  await tornado.locator('summary').focus();await page.keyboard.press('Space');
  check('The tornado table lists every included driver',await page.locator('#uq-tornado-table [data-uncertainty-tornado-row]').count(),4);
  check('Chart and table give the same tornado order',await page.locator('#uq-tornado-chart [data-uncertainty-tornado]').evaluateAll(nodes=>nodes.map(node=>node.dataset.uncertaintyTornado)),await page.locator('#uq-tornado-table [data-uncertainty-tornado-row]').evaluateAll(nodes=>nodes.map(node=>node.dataset.uncertaintyTornadoRow)));
  check('The seed stability check reports a status',['stable','unstable'].includes(await page.locator('[data-uncertainty-stability]').getAttribute('data-uncertainty-stability')));
  await page.screenshot({path:`${output}/desktop-panel.png`,fullPage:true,animations:'disabled'});

  await page.locator('#uq-verify').click();
  await page.locator('#uq-api-status:not([data-state="pending"]):not([data-state="idle"])').waitFor();
  check('The server reruns the same seed and reports an identical result',await page.locator('#uq-api-status').getAttribute('data-state'),'success');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#uq-export').click()]);
  const record=JSON.parse(await readFile(await download.path(),'utf8'));
  check('The exported record names the request and the engine versions',[record.kind,record.uncertaintyVersion,record.modelVersion,record.request.action],['frontier-uncertainty-simulation','1.0.0','3.0.0','simulate']);
  const api=await (await fetch(new URL('api/valuation',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record.request)})).json();
  check('An independent API call gives byte-identical JSON to the browser result',JSON.stringify(api.result),JSON.stringify(record.result));
  const {action,...spec}=record.request;
  check('The Node library gives byte-identical JSON to the browser result',JSON.stringify(simulateValuation(spec)),JSON.stringify(record.result));
  check('The P50 shown is the exported P50',await metric('p50'),record.result.summary.percentiles.p50);

  // Engine identity of the elementary functions the simulation depends on.
  const probe=Array.from({length:20000},(_,i)=>((i*7919)%20000)/20000*1400-700);
  const positive=probe.map(x=>Math.exp(x/10)+1e-300);
  const pageValues=await page.evaluate(async([xs,ys])=>{
    const {detExp,detLog}=await import('./lib/deterministic-math.js');
    return {det:[...xs.map(detExp),...ys.map(detLog)],native:[...xs.map(Math.exp),...ys.map(Math.log)],pow:xs.map(x=>(1+Math.abs(x)/1400)**(-x/50))};
  },[probe,positive]);
  const nodeDet=[...probe.map(detExp),...positive.map(detLog)],nodeNative=[...probe.map(Math.exp),...positive.map(Math.log)],nodePow=probe.map(x=>(1+Math.abs(x)/1400)**(-x/50));
  engine.inputs=nodeDet.length;
  engine.nativeDifferences=nodeNative.filter((value,i)=>!Object.is(value,pageValues.native[i])).length;
  engine.powDifferences=nodePow.filter((value,i)=>!Object.is(value,pageValues.pow[i])).length;
  engine.deterministicDifferences=nodeDet.filter((value,i)=>!Object.is(value,pageValues.det[i])).length;
  engine.browser=browser.version();engine.node=process.version;
  check('fdlibm exp and log give identical bits in Chromium and Node',engine.deterministicDifferences,0);

  await page.locator('#uq-collapse').click();await page.locator('#uq-run').click();await ready();
  const caseEv=Number(await page.locator('[data-result-ev]').getAttribute('data-result-ev'));
  check('With zero spread every percentile equals the deterministic case',await Promise.all(['p5','p25','p50','p75','p95'].map(metric)),Array(5).fill(caseEv));
  check('With zero spread every tornado swing is zero',await page.locator('#uq-tornado-table [data-uncertainty-tornado-row] td:last-child').allInnerTexts(),Array(4).fill('$0.00B'));

  await page.locator('#uq-suggest').click();
  await page.locator('[data-uq-pair="growth:m36"]').fill('0.9');
  await page.locator('[data-uq-pair="growth:wacc"]').fill('-0.9');
  await page.locator('[data-uq-pair="m36:wacc"]').fill('0.9');
  check('The lower triangle mirrors an edited correlation',await page.locator('[data-uq-mirror="growth:wacc"]').innerText(),'-0.9');
  await page.locator('#uq-run').click();
  await page.locator('#uq-error:not([hidden])').waitFor();
  check('An impossible correlation matrix is explained by its smallest eigenvalue',/smallest eigenvalue is -/.test(await page.locator('#uq-error').innerText()));
  check('A rejected matrix leaves no stale results',await page.locator('#uq-results').isHidden());

  await page.locator('#uq-suggest').click();await page.locator('#uq-run').click();await ready();
  await page.locator('#input-wacc').fill('13');
  check('Editing the model case clears the simulation',await page.locator('#uq-results').isHidden());
  check('The status asks for a new run',/changed/i.test(await page.locator('#uq-status').innerText()));

  await page.locator('#reset-scenario').click();
  await page.locator('#bridge-details summary').click();
  await page.locator('#bridge-enabled').check();
  for(const [id,value] of [['#bridge-cash','20'],['#bridge-debt','5'],['#bridge-claims','0']])await page.locator(id).fill(value);
  check('A bridge makes dilution available',await page.locator('#uq-dilution-on').isEnabled());
  await page.locator('#uq-dilution-on').check();
  check('Including dilution adds a fifth correlation row',await page.locator('.uq-matrix tbody tr').count(),5);
  await page.locator('#uq-run').click();await ready();
  check('The measure becomes equity after dilution',/after dilution/.test(await page.locator('#uq-distribution-chart title').textContent()));
  await page.locator('#uq-verify').click();
  await page.locator('#uq-api-status[data-state="success"]').waitFor();
  check('The equity-after-dilution result is also identical on the server',true);

  await page.setViewportSize({width:390,height:900});
  await page.locator('#uq-run').click();await ready();
  check('No horizontal page overflow at 390 pixels',await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
  await page.screenshot({path:`${output}/mobile-panel.png`,fullPage:true,animations:'disabled'});
  check('No page or console errors',errors,[]);
}catch(error){failure=error;}
finally{await browser.close();}
const report={generatedAt:new Date().toISOString(),base,passed:failure?checks.length:checks.length,failed:failure?1:0,checks,engine,errors,failure:failure?String(failure.message):null};
await writeFile(`${output}/uncertainty-browser.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:checks.length,failed:report.failed,engine,failure:report.failure},null,2));
if(failure)process.exit(1);
