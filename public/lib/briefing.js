import {project,bridgeEquity,MODEL_VERSION,VALUATION_DATE} from './model.js';
import {APP_VERSION} from './release.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const number=(value,digits=1)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(value);
const money=value=>(value<0?'−':'')+'$'+number(Math.abs(value))+'B';
const percentage=value=>number(value*100)+'%';
const row=(label,value)=>'<tr><th scope="row">'+escape(label)+'</th><td>'+escape(value)+'</td></tr>';
function safeUrl(value){
  try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}
  catch{return null;}
}
const STYLE=[
  '*{box-sizing:border-box}body{margin:0;background:#e9ece8;color:#14272b;font:14px/1.6 system-ui,-apple-system,sans-serif}a{color:#175f59;text-underline-offset:3px}',
  '.sheet{max-width:960px;margin:32px auto;background:#fcfcf5;box-shadow:0 20px 70px #112a2a14}.masthead{padding:38px 44px;background:#12282d;color:#eff8ef;display:flex;justify-content:space-between;gap:24px}.wordmark{font-size:13px;font-weight:650;letter-spacing:.3px}.masthead small{color:#bfd0c9;display:block;margin-top:6px;font-size:11px}.issue{text-align:right;font-size:11px;letter-spacing:1px;text-transform:uppercase}',
  'main{padding:34px 44px}.eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:1.6px;color:#697b73;font-weight:650}h1{font:normal 44px/1.07 Georgia,serif;letter-spacing:-1px;margin:9px 0 13px}h2{font:normal 24px/1.2 Georgia,serif;margin:30px 0 15px}h3{font-size:13px;margin:20px 0 8px}p{margin:0 0 13px}.lede{color:#60736b;max-width:680px}.kpis{display:grid;grid-template-columns:2fr 1fr 1fr;gap:24px;padding:22px 0 25px;border-top:2px solid #ba745c;border-bottom:1px solid #ccd5ca}.kpi span{display:block;color:#65766b;font-size:11px}.kpi strong{font:normal 25px Georgia,serif;display:block;margin:5px 0}.kpi:first-child strong{font-size:40px;letter-spacing:-1px}.kpi small{color:#65766b;font-size:10px}',
  '.judgment{padding:19px 21px;border-left:3px solid #518b78;background:#eef2e8;margin:23px 0}.judgment p:last-child{margin:0}.two{display:grid;grid-template-columns:1fr 1fr;gap:28px}.note{font-size:11px;color:#68776c}.badge{font-size:10px;border:1px solid #bdcabb;border-radius:20px;padding:4px 9px;display:inline-block;margin-right:5px}.negative{color:#963e35}',
  'table{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}th,td{padding:8px 7px;border-bottom:1px solid #dde3d7;text-align:right}th:first-child,td:first-child{text-align:left}thead{background:#edf1e6;color:#53664f}tbody th{font-weight:500}.total{font-weight:700;background:#eaf0e4}.source{font-size:11px;margin:0 0 9px}.source strong{display:block}.source span{color:#627269;display:block}.footer{padding:22px 44px;border-top:1px solid #d7ded2;font-size:10px;color:#647368;display:flex;justify-content:space-between;gap:24px}.mono{font-variant-numeric:tabular-nums}.print-hint{text-align:center;font-size:11px;color:#637169;padding:0 16px 24px}',
  '@media(max-width:650px){.sheet{margin:0}.masthead,main,.footer{padding:25px}.masthead{display:block}.issue{text-align:left;margin-top:18px}h1{font-size:36px}.kpis{grid-template-columns:1fr 1fr;gap:18px}.kpi:first-child{grid-column:1/-1}.two{grid-template-columns:1fr;gap:0}.forecast{overflow-x:auto}.forecast table{min-width:570px}.footer{display:block}.footer div+div{margin-top:12px}}',
  '@page{size:A4;margin:13mm}@media print{body{background:white;font-size:11px}.sheet{margin:0;box-shadow:none;max-width:none}.masthead{padding:20px 25px;-webkit-print-color-adjust:exact;print-color-adjust:exact}main{padding:22px 25px}.footer{padding:15px 25px}.print-hint{display:none}h1{font-size:34px}h2{font-size:20px;margin:23px 0 11px}.kpis,.judgment,.two,table,tr,h2,h3{break-inside:avoid}h2,h3{break-after:avoid}.forecast{break-inside:avoid}.forecast table{min-width:0}a{color:inherit}.kpi:first-child strong{font-size:35px}thead{display:table-header-group}}',
].join('');

/** Standalone, script-free briefing calculated from the visitor's current inputs. */
export function createBriefing({company,scenario,assumptions,research,bridge=null,shareUrl,edited=false}){
  if(!['Anthropic','OpenAI'].includes(company)||!['Bear','Base','Bull'].includes(scenario)) throw new Error('Choose a supported company and scenario.');
  if(!research||research.asOf!==VALUATION_DATE||research.modelVersion!==MODEL_VERSION||!Array.isArray(research.sources)||!research.companies?.[company]) throw new Error('A matching dated research snapshot is required.');
  const result=project(assumptions),equity=bridge===null?null:bridgeEquity(result.ev,bridge);
  const firstPositive=result.rows.find(item=>item.fcf>0)?.year??null;
  const caseLabel=scenario+(edited?' · custom assumptions':'');
  const share=safeUrl(shareUrl);
  const companyEvidence=research.companies[company];
  const sourceIds=new Set([companyEvidence.financing?.sourceId,...(companyEvidence.operatingEvidence??[]).map(item=>item.sourceId),'S19'].filter(Boolean));
  const sources=research.sources.filter(source=>sourceIds.has(source.id));
  const explicit=result.rows.reduce((sum,item)=>sum+item.pv,0);
  const judgment=result.ev>0
    ? 'This scenario assigns '+money(result.ev)+' to the operating business. '+percentage(result.tv_share)+' of that value comes from the present value of cash flows after 2036.'
    : 'This scenario produces '+money(result.ev)+' of operating enterprise value. The model preserves that nonpositive result; it does not impose a zero floor or equate it with a stock price.';
  const shareMeaning=result.tv_share!==null&&result.tv_share>1?'The terminal-value share exceeds 100% because discounted cash flows through 2036 are negative.':'Terminal value is a modeled continuation value, not cash received in 2036.';
  const assumptionsRows=[
    ['2026 model revenue',money(assumptions.rev2026)],
    ['2027–2030 annual growth',percentage(assumptions.g1)],
    ['2031–2033 annual growth',percentage(assumptions.g2)],
    ['2034–2036 annual growth',percentage(assumptions.g3)],
    ['2027 / 2030 / 2036 EBIT margins',[assumptions.m27,assumptions.m30,assumptions.m36].map(percentage).join(' / ')],
    ['Sales / invested capital',number(assumptions.turns,2)+'×'],
    ['Cost of capital (WACC)',percentage(assumptions.wacc)],
    ['Perpetual growth',percentage(assumptions.tg)],
    ['Terminal ROIC',percentage(assumptions.roic)],
    ['Tax on positive EBIT',percentage(assumptions.tax)],
    ['Remaining-2026 FCFF',money(assumptions.stub)],
  ].map(([label,value])=>row(label,value)).join('');
  const forecastRows=result.rows.map(item=>'<tr><th scope="row">'+item.year+'</th><td>'+number(item.revenue)+'</td><td>'+percentage(item.margin)+'</td><td>'+number(item.nopat)+'</td><td>'+number(item.reinvestment)+'</td><td>'+number(item.fcf)+'</td><td>'+number(item.pv)+'</td></tr>').join('');
  const financing=companyEvidence.financing;
  const financingSource=research.sources.find(source=>source.id===financing?.sourceId);
  const financingUrl=safeUrl(financingSource?.url);
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>',
    escape(company+' · '+caseLabel+' · Scenario brief'),'</title><style>',STYLE,'</style></head><body><article class="sheet"><header class="masthead"><div class="wordmark">Frontier AI Valuation Lab<small>Independent financial research · Charles Dai</small></div><div class="issue">Scenario brief<small>Research snapshot · 18 October 2026</small></div></header><main>',
    '<div class="eyebrow">Conditional operating valuation</div><h1>',escape(company),'<br>Under these assumptions.</h1><p class="lede">',escape(caseLabel),' · All financial amounts are USD billions. This briefing is recalculated from the selected inputs; it is not a company forecast.</p>',
    '<div class="kpis"><div class="kpi"><span>Modeled enterprise value</span><strong>',escape(money(result.ev)),'</strong><small>Value of operating assets · before an equity bridge</small></div><div class="kpi"><span>Terminal value / EV</span><strong>',escape(result.tv_share===null?'N/A':percentage(result.tv_share)),'</strong><small>',result.tv_share===null?'Undefined for nonpositive EV':'Present value of cash flows after 2036','</small></div><div class="kpi"><span>First positive annual FCFF</span><strong>',firstPositive??'None','</strong><small>Within the 2027–2036 forecast</small></div></div>',
    '<div class="judgment"><p>',escape(judgment),'</p><p class="note">',escape(shareMeaning),'</p></div>',
    '<div class="two"><section><h2>The value bridge</h2><table><caption class="note">Present value as of 18 October 2026 · USD billions</caption><tbody>',
    row('Remaining-2026 cash flow',money(result.pv_stub)),row('2027–2036 cash flows',money(explicit)),row('Cash flows after 2036',money(result.pvtv)),
    '<tr class="total"><th scope="row">Enterprise value</th><td>',escape(money(result.ev)),'</td></tr></tbody></table>',
    '<h3>Capital before the payoff</h3><p>Peak cumulative economic FCFF deficit: <strong>',escape(money(result.peak_funding_need)),'</strong>.</p><p class="note">Includes the remaining-2026 stub and annual unlevered cash flows. This is not cash runway or literal external funding required: opening liquidity, financing, payment schedules and intrayear timing are outside the model.</p></section>',
    '<section><h2>The assumptions</h2><table><tbody>',assumptionsRows,'</tbody></table></section></div>',
    '<section class="forecast"><h2>Trace the cash flows</h2><table><caption class="note">Annual modeled values · USD billions except margin</caption><thead><tr><th scope="col">Year</th><th scope="col">Revenue</th><th scope="col">EBIT margin</th><th scope="col">NOPAT</th><th scope="col">Net investment</th><th scope="col">FCFF</th><th scope="col">PV of FCFF</th></tr></thead><tbody>',forecastRows,'</tbody></table><p class="note">Remaining-2026 FCFF of ',escape(money(assumptions.stub)),' is included separately, once. Net reinvestment includes net capex and working capital. Positive EBIT is taxed; no NOL benefit is modeled.</p></section>',
    '<section><h2>What needs to hold</h2><p>By 2036, revenue reaches <strong>',escape(money(result.rows.at(-1).revenue)),'</strong> and EBIT margin reaches <strong>',escape(percentage(assumptions.m36)),'</strong>. The terminal period assumes <strong>',escape(percentage(assumptions.tg)),'</strong> perpetual growth and <strong>',escape(percentage(assumptions.roic)),'</strong> return on invested capital.</p><p class="note">Terminal FCFF = next-year NOPAT × (1 − perpetual growth / terminal ROIC). All cash flows use year-end dates and elapsed days / 365.25. No scenario probability, target stock price, liquidation floor or investor preference waterfall is inferred.</p>',
    result.warnings.length?'<h3>Model diagnostics</h3><ul>'+result.warnings.map(warning=>'<li>'+escape(warning)+'</li>').join('')+'</ul>':'',
    '</section>',
    equity?'<section><h2>Optional hypothetical equity bridge</h2><p>'+escape(money(equity.ev))+' enterprise value + '+escape(money(equity.cash))+' cash − '+escape(money(equity.debt))+' debt − '+escape(money(equity.otherClaims))+' other claims = <strong>'+escape(money(equity.equityValue))+'</strong> hypothetical equity.</p><p class="note">Every balance in this bridge is a user assumption. This does not establish verified current equity value or model security preferences, dilution or share classes.</p></section>':'',
    '<section><h2>Keep price and value distinct</h2>',
    financing?'<p>The separate '+escape(financing.label.toLowerCase())+' reference is <strong>'+escape(money(financing.value))+'</strong> of '+escape(financing.basis.toLowerCase())+' on '+escape(financing.date)+'. '+(financingUrl?'<a href="'+escape(financingUrl)+'" rel="noopener noreferrer">Company source ↗</a>':'')+'</p><p class="note">'+escape(financing.note)+' No discount or upside to that reference is calculated: the operating EV and equity financing price use different bases.</p>':'',
    '<h3>Selected evidence</h3>',sources.map(source=>{
      const url=safeUrl(source.url);
      return '<p class="source"><strong>'+escape(source.id+' · '+source.publisher+' · '+source.date)+'</strong>'+(url?'<a href="'+escape(url)+'" rel="noopener noreferrer">'+escape(source.title)+'</a>':escape(source.title))+'<span>'+escape(source.limit)+'</span></p>';
    }).join(''),
    '<p class="note">Full source register and original research cutoff: <a href="https://frontier-ai-valuation-lab.vercel.app/#sources">Evidence & sources</a>. The research snapshot was frozen at ',escape(research.researchCutoff??research.asOf),'. This briefing does not imply a live data refresh.</p></section>',
    '</main><footer class="footer"><div>Financial engine ',escape(MODEL_VERSION),' · Application ',escape(APP_VERSION),'<br>Valuation date ',escape(VALUATION_DATE),' · Illustrative research; not an investment recommendation.</div><div>',
    share?'<a href="'+escape(share)+'">Reopen these exact assumptions ↗</a><br>':'',
    '<a href="https://github.com/ult666666/frontier-ai-valuation-lab">Inspect the code and methodology ↗</a></div></footer></article><p class="print-hint">Save a PDF with your browser’s Print menu. The calculation and all selected inputs are already in this standalone document.</p></body></html>',
  ].join('');
}
