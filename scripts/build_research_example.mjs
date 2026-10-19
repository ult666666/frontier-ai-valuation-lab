// Deterministic, explicitly illustrative Casebook artifact. PDF rendering is optional.
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createScenarioEntry,createThesisEntry,createCasebook,serializeCasebook} from '../public/lib/casebook.js';
import {createCasebookBrief} from '../public/lib/casebook-brief.js';
import {defaultLandscape,applyRequiredMargin} from '../public/lib/journey.js';

const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'public/downloads');
const presets=JSON.parse(await readFile(path.join(root,'data/presets.json'),'utf8'));
const research=JSON.parse(await readFile(path.join(root,'data/research.json'),'utf8'));
const date='2026-10-19T00:00:00.000Z';
const metadata=(id,title,notes,sourceIds)=>({id,title,notes,sourceIds,createdAt:date,updatedAt:date});
const initial={company:'Anthropic',reference:{scenario:'Base',assumptions:presets.Anthropic.Base,bridge:null},alternative:{scenario:'Bull',assumptions:presets.Anthropic.Bull,bridge:null},landscape:{...defaultLandscape(presets.Anthropic.Bull),rates:[.075,.09,.105,.12,.135,.15,.165,.18,.195]}};
const required=applyRequiredMargin(initial,2);
const entries=[
  createThesisEntry(required,metadata('example-anthropic-required-margin','Example · Anthropic at a $500bn EV',{
    rationale:'Illustrative research example: explore the 2036 EBIT margin required to support a $500bn operating enterprise value while retaining the Bull revenue and capital assumptions. Compare the solved alternative against the original Base case. This is a conditional model requirement, not a financing price or a forecast of what will happen.',
    keyAssumption:'The selected 10.5% WACC, Bull growth path and capital efficiency must hold. The solved margin retains full numerical precision. Source S19 supports the terminal reinvestment relationship; it does not establish the chosen WACC, perpetual growth or ROIC.',
    reviewTrigger:'Revisit the case when dated operating disclosures change the revenue bridge, evidence clarifies gross versus net revenue, or capital commitments can be translated into a defensible payment and reinvestment schedule. Recalculate the complete case before updating the argument.'
  },['S01','S09','S13','S18','S19']),research),
  createScenarioEntry({company:'OpenAI',scenario:'Base',assumptions:presets.OpenAI.Base,bridge:null},metadata('example-openai-base','Example · OpenAI operating baseline',{
    rationale:'Illustrative baseline for inspecting OpenAI operating economics. Keep actual-period revenue, annualized run-rate and the illustrative full-year forecast distinct. The result is operating enterprise value; no current cash, debt or investor preference waterfall is assumed.',
    keyAssumption:'The Base growth path, margin progression and reinvestment assumptions are selected inputs. Reported cash-flow forecasts and commercial arrangements provide context without verifying those numerical assumptions.',
    reviewTrigger:'Review when new dated revenue or cost disclosures become comparable, commercial terms are clarified, or a complete capital-payment schedule supports a different reinvestment estimate.'
  },['S02','S05','S08','S10','S15','S19']),research),
  createScenarioEntry({company:'OpenAI',scenario:'Base',assumptions:{...presets.OpenAI.Base,wacc:presets.OpenAI.Base.wacc+.02},bridge:null},metadata('example-openai-higher-wacc','Example · OpenAI with WACC +2 pp',{
    rationale:'Illustrative discount-rate experiment. Increase the Base cost of capital by two percentage points and retain its other twelve operating assumptions. Compare this saved case with the OpenAI operating baseline to isolate that conditional valuation change.',
    keyAssumption:'A higher required return discounts the same cash flows more heavily. The two-percentage-point increment is a chosen test, not a measured market-implied cost of capital or a probability estimate.',
    reviewTrigger:'Reconsider the discount-rate range if business-risk evidence, capital structure information or a documented valuation framework changes. An equity financing headline alone does not identify operating WACC.'
  },['S02','S15','S19']),research)
];
const book=createCasebook(entries,research);
const html=createCasebookBrief({entry:entries[0],research,baseUrl:'https://frontier-ai-valuation-lab.vercel.app/casebook.html'});
await writeFile(path.join(out,'Frontier_AI_Research_Casebook.json'),serializeCasebook(book,research));
await writeFile(path.join(out,'Frontier_AI_Research_Brief.html'),html);
if(process.argv.includes('--pdf')){
  const require=createRequire(import.meta.url),{chromium}=require(process.env.FRONTIER_PLAYWRIGHT_MODULE||'playwright');
  const executablePath=process.env.FRONTIER_CHROMIUM_EXECUTABLE||undefined;
  const browser=await chromium.launch({headless:true,executablePath,args:executablePath?['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
    await page.setContent(html,{waitUntil:'load'});await page.emulateMedia({media:'print'});
    await page.pdf({path:path.join(out,'Frontier_AI_Research_Brief.pdf'),printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font:8px Arial,sans-serif;color:#687871;width:100%;padding:0 44px;display:flex;justify-content:space-between"><span>Frontier AI Valuation Lab · Illustrative research brief</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'});
  }finally{await browser.close();}
}
console.log(`Built ${entries.length} explicitly labeled research examples${process.argv.includes('--pdf')?' and the printable PDF':''}.`);
