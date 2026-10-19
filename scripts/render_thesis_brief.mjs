// Optional authoring/visual-QA helper. Playwright is a development dependency only.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createThesisBrief} from '../public/lib/thesis-brief.js';
import {thesisUrl} from '../public/lib/thesis-share.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'qa-local/brief-preview');
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.FRONTIER_PLAYWRIGHT_MODULE||'playwright');
const presets=JSON.parse(await readFile(path.join(root,'data/presets.json'),'utf8'));
const research=JSON.parse(await readFile(path.join(root,'data/research.json'),'utf8'));
const draft={company:'Anthropic',reference:{scenario:'Base',assumptions:presets.Anthropic.Base,bridge:null},alternative:{scenario:'Bull',assumptions:presets.Anthropic.Bull,bridge:null},landscape:{rates:Array.from({length:13},(_,i)=>(8.5+i*.5)/100),margins:Array.from({length:13},(_,i)=>(6+i*2)/100),target:500}};
const shareUrl=thesisUrl('https://frontier-ai-valuation-lab.vercel.app/thesis.html',draft);
const html=createThesisBrief({draft,research,shareUrl});
await mkdir(out,{recursive:true});
await writeFile(path.join(out,'Anthropic_Thesis_Comparison.html'),html);
await writeFile(path.join(out,'comparison.json'),JSON.stringify(draft,null,2)+'\n');
const executablePath=process.env.FRONTIER_CHROMIUM_EXECUTABLE||undefined;
const browser=await chromium.launch({headless:true,executablePath,args:executablePath?['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  await page.setContent(html,{waitUntil:'load'});
  await page.emulateMedia({media:'print'});
  await page.pdf({path:path.join(out,'Anthropic_Thesis_Comparison.pdf'),printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font:8px Arial,sans-serif;color:#687871;width:100%;padding:0 48px;display:flex;justify-content:space-between"><span>Frontier AI Valuation Lab · Thesis comparison</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'});
  console.log(`Rendered ${out}/Anthropic_Thesis_Comparison.pdf`);
}finally{await browser.close();}
