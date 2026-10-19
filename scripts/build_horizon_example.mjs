// Deterministic worked example. Optional PDF / social-card rendering needs Playwright.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHorizonBrief,createHorizonExport} from '../public/lib/horizon-brief.js';
import {APP_VERSION} from '../public/lib/release.js';

const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'public/downloads');
const presets=JSON.parse(await readFile(path.join(root,'data/presets.json'),'utf8'));
const research=JSON.parse(await readFile(path.join(root,'data/research.json'),'utf8'));
const snapshot={case:{company:'Anthropic',scenario:'Base',assumptions:presets.Anthropic.Base,bridge:null},years:10,target:250};
const options={snapshot,research,baseUrl:'https://frontier-ai-valuation-lab.vercel.app/horizon.html'};
const html=createHorizonBrief(options),analysis=createHorizonExport(options);
await writeFile(path.join(out,'Frontier_AI_Value_Horizon.html'),html);
await writeFile(path.join(out,'Frontier_AI_Value_Horizon.json'),JSON.stringify(analysis,null,2)+'\n');

if(process.argv.includes('--pdf')||process.argv.includes('--preview')){
  const require=createRequire(import.meta.url),{chromium}=require(process.env.FRONTIER_PLAYWRIGHT_MODULE||'playwright');
  const executablePath=process.env.FRONTIER_CHROMIUM_EXECUTABLE||undefined;
  const browser=await chromium.launch({headless:true,executablePath,args:executablePath?['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
  try{
    const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1,reducedMotion:'reduce'});
    if(process.argv.includes('--pdf')){
      await page.setContent(html,{waitUntil:'load'});await page.emulateMedia({media:'print'});
      await page.pdf({path:path.join(out,'Frontier_AI_Value_Horizon.pdf'),printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font:8px Arial,sans-serif;color:#687871;width:100%;padding:0 44px;display:flex;justify-content:space-between"><span>Frontier AI Valuation Lab · Value Horizon</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'});
    }
    if(process.argv.includes('--preview')){
      const r=analysis.result,money=value=>'$'+value.toFixed(1)+'B';
      const x=years=>years*5.0,y=value=>164-value/r.baseline.ev*144;
      const curve=r.curve.map(p=>`${x(p.years).toFixed(2)},${y(p.ev).toFixed(2)}`).join(' ');
      const social=`<!doctype html><html lang="en"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#102333;color:#ecf0e4;font:14px Arial,sans-serif}main{padding:45px 55px}.mast{display:flex;justify-content:space-between;font:11px monospace;letter-spacing:1.6px;color:#b8cfc0}.tag{color:#e8cb92}.hero{display:grid;grid-template-columns:1fr 1fr;gap:58px;margin-top:39px}h1{font:58px/1.07 Georgia,serif;letter-spacing:-2px;margin:0}em{color:#bdd8bf;font-weight:400}.note{font:13px/1.75 Arial,sans-serif;color:#bbccbe;margin:20px 0 0;max-width:440px}.small{font:10px/1.7 monospace;color:#adc4b3}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:34px;padding-top:24px;border-top:1px solid #3b555a}.metrics span{display:block;font:10px/1.6 monospace;color:#b9cbb9}.metrics strong{display:block;font:38px/1.5 Georgia,serif;font-weight:400;color:#ead09b}.plot{margin-top:8px}.plot svg{width:100%;height:190px;display:block}.plot p{display:flex;justify-content:space-between;margin:0;font:10px monospace;color:#b8ccbb}.method{padding:18px 21px;background:#183443;border:1px solid #3b565c;margin-top:20px;line-height:1.8;color:#c7d7c4;font-size:12px}.footer{display:flex;justify-content:space-between;margin-top:25px;padding-top:18px;border-top:1px solid #3b555a;color:#b0c7b7;font:10px/1.7 monospace}</style><main><div class="mast"><span>CHARLES DAI / FINTECH RESEARCH</span><span class="tag">FRONTIER AI · VALUE HORIZON</span></div><div class="hero"><div><h1>How much future<br>is in the <em>value?</em></h1><p class="note">Keep the operating forecast. Explore how many later cash-flow years support today's modeled value.</p></div><div class="plot"><p><span>ANTHROPIC / BASE ASSUMPTIONS</span><span>OPERATING EV</span></p><svg viewBox="-10 -1 530 190" aria-label="Finite enterprise value approaches the perpetual reference"><line x1="0" y1="20" x2="500" y2="20" stroke="#b6d4c2" stroke-dasharray="7 6"/><polyline points="${curve}" fill="none" stroke="#ead09b" stroke-width="3"/><line x1="50" y1="20" x2="50" y2="164" stroke="#a49470"/><circle cx="50" cy="${y(r.selected.ev)}" r="5" fill="#ead09b"/><line x1="0" y1="164" x2="500" y2="164" stroke="#46635e"/></svg><p><span>0</span><span>Years after 2036</span><span>100</span></p></div></div><div class="metrics"><div><span>PERPETUAL REFERENCE</span><strong>${money(r.baseline.ev)}</strong></div><div><span>RETAIN 2037–2046, THEN ZERO</span><strong>${money(r.selected.ev)}</strong></div><div><span>LATER PRESENT VALUE EXCLUDED</span><strong>${money(r.selected.excludedTerminalPv)}</strong></div></div><div class="method">A conditional stress lens with zero residual after the cutoff. Exact assumptions, a verifiable API, and a complete research brief.</div><div class="footer"><span>Application ${APP_VERSION} · Financial model / 18 Oct 2026</span><span>Illustrative enterprise value · USD billions · No lifespan probability</span></div></main></html>`;
      await page.emulateMedia({media:'screen'});await page.setContent(social,{waitUntil:'load'});
      await mkdir(path.join(root,'qa-local/v3-4'),{recursive:true});await writeFile(path.join(root,'qa-local/v3-4/horizon-social.html'),social);
      await page.screenshot({path:path.join(root,'public/assets/horizon-preview.png'),animations:'disabled'});
    }
  }finally{await browser.close();}
}
console.log(`Built Value Horizon ${APP_VERSION}: Anthropic Base, 10 continuation years, $250B operating-EV target.`);
