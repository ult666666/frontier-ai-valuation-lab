/** Rebuild the five current worked briefs; optional PDF rendering is authoring only. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createThesisBrief} from '../public/lib/thesis-brief.js';
import {thesisUrl} from '../public/lib/thesis-share.js';
import {APP_VERSION} from '../public/lib/release.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const briefs=[
  ['capital','Frontier_AI_Capital_Decision','Capital decision','build_capital_example.mjs'],
  ['financing','Frontier_AI_Financing_Lens','Financing and ownership','build_financing_example.mjs'],
  ['horizon','Frontier_AI_Value_Horizon','Value Horizon','build_horizon_example.mjs'],
  ['research','Frontier_AI_Research_Brief','Research brief','build_research_example.mjs'],
  ['thesis','Frontier_AI_Thesis_Comparison','Thesis comparison',null]
];
const args=process.argv.slice(2),onlyArgs=args.filter(argument=>argument.startsWith('--only='));
if(args.some(argument=>argument!=='--pdf'&&!argument.startsWith('--only='))||onlyArgs.length>1)throw new Error('Use --pdf and optionally --only=capital|financing|horizon|research|thesis.');
const only=onlyArgs[0]?.slice('--only='.length);
if(only!==undefined&&!briefs.some(([id])=>id===only))throw new Error('Unknown brief selection. No files were written.');
const selected=briefs.filter(([id])=>only===undefined||id===only);
for(const [,,,name] of selected.filter(([, , ,builder])=>builder!==null)){
  execFileSync(process.execPath,[path.join(root,'scripts',name)],{cwd:root,stdio:'inherit'});
}
if(selected.some(([id])=>id==='thesis')){
const presets=JSON.parse(await readFile(path.join(root,'data/presets.json'),'utf8'));
const research=JSON.parse(await readFile(path.join(root,'data/research.json'),'utf8'));
const draft={company:'Anthropic',reference:{scenario:'Base',assumptions:presets.Anthropic.Base,bridge:null},alternative:{scenario:'Bull',assumptions:presets.Anthropic.Bull,bridge:null},landscape:{rates:Array.from({length:13},(_,i)=>(8.5+i*.5)/100),margins:Array.from({length:13},(_,i)=>(6+i*2)/100),target:500}};
const shareUrl=thesisUrl('https://frontier-ai-valuation-lab.vercel.app/thesis.html',draft);
await writeFile(path.join(root,'public/downloads/Frontier_AI_Thesis_Comparison.html'),createThesisBrief({draft,research,shareUrl}));
}

if(process.argv.includes('--pdf')){
  const require=createRequire(import.meta.url);
  const module=process.env.FRONTIER_PLAYWRIGHT_MODULE||
    (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
  const {chromium}=require(module);
  const executablePath=process.env.FRONTIER_CHROMIUM_EXECUTABLE||undefined;
  const browser=await chromium.launch({headless:true,executablePath,args:executablePath?['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
  const rendered=[];
  try{
    for(const [,name,label] of selected){
      const htmlPath=path.join(root,'public/downloads',`${name}.html`),pdfPath=path.join(root,'public/downloads',`${name}.pdf`);
      const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
      await page.goto(pathToFileURL(htmlPath).href,{waitUntil:'load'});
      await page.emulateMedia({media:'print'});
      await page.pdf({path:pdfPath,format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,
        headerTemplate:'<span></span>',
        footerTemplate:`<div style="font:8px Arial,sans-serif;color:#62716b;width:100%;padding:0 40px;display:flex;justify-content:space-between"><span>Frontier AI · ${label} · ${APP_VERSION}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`});
      await page.close();
      const html=await readFile(htmlPath),pdf=await readFile(pdfPath);
      rendered.push({name,htmlSha256:createHash('sha256').update(html).digest('hex'),pdfSha256:createHash('sha256').update(pdf).digest('hex'),pdfBytes:pdf.length});
    }
  }finally{await browser.close();}
  const out=path.join(root,'qa-local/v4-0');await mkdir(out,{recursive:true});
  const receiptName=only===undefined?'pdf-rendering.json':`pdf-rendering-${only}.json`;
  await writeFile(path.join(out,receiptName),JSON.stringify({appVersion:APP_VERSION,rendered,visualReviewPending:true},null,2)+'\n');
  console.log(`Rendered ${rendered.length} current worked PDFs. Visual review is a separate step.`);
}
console.log(`Built ${selected.length} current worked ${selected.length===1?'brief':'briefs'} for application ${APP_VERSION}. Original reviewed workbook/PDF and earlier ZIPs were not regenerated.`);
