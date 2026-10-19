import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createFinancingExport,createFinancingBrief} from '../public/lib/financing-brief.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const presets=JSON.parse(await readFile(path.join(root,'data/presets.json'),'utf8'));
const snapshot={case:{company:'Anthropic',scenario:'Base',assumptions:presets.Anthropic.Base,bridge:{cash:20,debt:5,otherClaims:0}},round:{basis:'pre',quote:250,primaryCapital:25,holderStake:.1}};
const dir=path.join(root,'public/downloads'),name='Frontier_AI_Financing_Lens';
await mkdir(dir,{recursive:true});
await writeFile(path.join(dir,`${name}.json`),JSON.stringify(createFinancingExport(snapshot),null,2)+'\n');
await writeFile(path.join(dir,`${name}.html`),createFinancingBrief(snapshot));
if(process.argv.includes('--pdf')){
  const modules=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
  const {chromium}=await import(modules?pathToFileURL(path.join(modules,'playwright/index.mjs')).href:'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.FRONTIER_CHROMIUM_EXECUTABLE?{executablePath:process.env.FRONTIER_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{const page=await browser.newPage({viewport:{width:1280,height:980}});await page.goto(pathToFileURL(path.join(dir,`${name}.html`)).href,{waitUntil:'networkidle'});await page.pdf({path:path.join(dir,`${name}.pdf`),format:'A4',printBackground:true,preferCSSPageSize:true});}
  finally{await browser.close();}
}
console.log(`Built the exact hypothetical Financing Lens example${process.argv.includes('--pdf')?', including PDF':''}.`);
