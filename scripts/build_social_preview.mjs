// Optional authoring tool. The app does not depend on Playwright at runtime.
import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {project} from '../public/lib/model.js';
import presets from '../data/presets.json' with {type:'json'};
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.FRONTIER_PLAYWRIGHT_MODULE||'playwright');
const companies=['Anthropic','OpenAI'];
const values=companies.map(company=>project(presets[company].Base));
// A plain card: the product name, one sentence and the two Base-case figures.
const html=[
  '<!doctype html><html><head><meta charset="utf-8"><style>',
  '*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#f6f7f4;color:#1b2624;font-family:Inter,Arial,sans-serif;font-variant-numeric:tabular-nums}main{padding:64px 72px;height:100%;display:flex;flex-direction:column}h1{margin:0;font-size:54px;font-weight:600;letter-spacing:-.5px}.lede{margin:16px 0 0;font-size:24px;line-height:1.4;color:#55615c;max-width:900px}h2{margin:56px 0 18px;font-size:20px;font-weight:600}.row{display:grid;grid-template-columns:170px 150px 1fr 260px;align-items:center;gap:24px;padding:16px 0;border-top:1px solid #dfe3dd;font-size:22px}.row strong{font-size:34px;font-weight:600}.bar{height:12px;background:#e6e9e4;border-radius:6px;overflow:hidden}.bar i{display:block;height:100%}.a i{background:#b0583b}.o i{background:#23705d}.ev{color:#55615c;text-align:right}footer{margin-top:auto;display:flex;justify-content:space-between;font-size:18px;color:#55615c}',
  '</style></head><body><main><h1>Frontier AI Valuation Lab</h1><p class="lede">A discounted cash flow model of Anthropic and OpenAI, with funding-round, Monte Carlo and scenario tools.</p><h2>Share of Base-case enterprise value from cash flows after 2036</h2>',
  ...companies.map((company,index)=>'<div class="row '+(index?'o':'a')+'"><span>'+company+'</span><strong>'+(values[index].tv_share*100).toFixed(1)+'%</strong><div class="bar"><i style="width:'+(values[index].tv_share*100)+'%"></i></div><span class="ev">Base EV $'+values[index].ev.toFixed(1)+'B</span></div>'),
  '<footer><span>Illustrative assumptions · data as of 18 Oct 2026 · USD billions</span><span>Charles Dai</span></footer></main></body></html>',
].join('');
await mkdir(root+'qa-local/social',{recursive:true});
await mkdir(root+'public/assets',{recursive:true});
await writeFile(root+'qa-local/social/preview.html',html);
const browser=await chromium.launch({headless:true,executablePath:process.env.FRONTIER_CHROMIUM_EXECUTABLE||undefined,args:process.env.FRONTIER_CHROMIUM_EXECUTABLE?['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
try{
  const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
  await page.setContent(html,{waitUntil:'load'});
  await page.screenshot({path:root+'public/assets/social-preview.png'});
  console.log('Created 1200×630 preview from current Base model outputs.');
}finally{await browser.close();}
