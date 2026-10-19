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
const html=[
  '<!doctype html><html><head><meta charset="utf-8"><style>',
  '*{box-sizing:border-box}body{margin:0;background:#0c1929;color:#f3f0e9;font-family:Arial,sans-serif;width:1200px;height:630px}header{display:flex;justify-content:space-between;align-items:center;padding:34px 48px;border-bottom:1px solid #334151;font-size:17px}.mark{color:#ffab82;font-size:27px;margin-right:11px}.credit{font-size:13px;color:#b7c9d3}.content{display:grid;grid-template-columns:1.17fr 1fr;gap:45px;padding:43px 48px 29px}.kicker{font-size:11px;letter-spacing:2.2px;color:#c2d0d4;text-transform:uppercase;margin:0 0 18px}h1{font-size:62px;line-height:1.04;font-weight:400;letter-spacing:-2.2px;margin:0}h1 em{font-family:Georgia,serif;color:#ffab82;font-size:65px}.lede{font-size:16px;line-height:1.6;color:#b8cbd6;max-width:450px;margin-top:23px}.panel{background:#132336;border:1px solid #3d4b5c;padding:25px 28px}.panel h2{font-size:18px;font-weight:400;margin:0 0 8px}.subtitle{font-size:11px;color:#bfd0da;margin:0 0 28px}.company{border-top:1px solid #344658;padding-top:14px;margin-top:19px}.name{font-size:12px}.figure{font-family:Georgia,serif;font-size:52px;letter-spacing:-1.2px;line-height:1.2}.company.a .name,.company.a .figure{color:#ffab82}.company.o .name,.company.o .figure{color:#8adfc6}.detail{font-size:11px;color:#bcced7;margin-top:2px}.bar{height:5px;background:#304356;margin-top:12px}.bar i{height:100%;display:block}.a .bar i{background:#ffab82}.o .bar i{background:#8adfc6}footer{display:flex;justify-content:space-between;margin:0 48px;border-top:1px solid #334151;padding-top:19px;font-size:12px;color:#bbccd7}.cta{color:#f3f0e9}small{font-size:11px}',
  '</style></head><body><header><div><span class="mark">F.</span>Frontier AI Valuation Lab</div><div class="credit">A fintech project by Charles Dai</div></header><div class="content"><section><p class="kicker">Anthropic × OpenAI · Interactive research</p><h1>How much<br>future is<br><em>in the price?</em></h1><p class="lede">Explore the cash flows. Stress the assumptions.<br>Build a case you can explain.</p></section><section class="panel"><h2>Value after 2036.</h2><p class="subtitle">Terminal value as a share of modeled enterprise value</p>',
  ...companies.map((company,index)=>'<div class="company '+(index?'o':'a')+'"><div class="name">'+company+'</div><div class="figure">'+(values[index].tv_share*100).toFixed(1)+'%</div><div class="detail">Illustrative Base EV · $'+values[index].ev.toFixed(1)+' billion</div><div class="bar"><i style="width:'+(values[index].tv_share*100)+'%"></i></div></div>'),
  '</section></div><footer><span>Research snapshot · 18 Oct 2026 · USD billions</span><span class="cta">Compare → Stress → Share</span></footer></body></html>',
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
