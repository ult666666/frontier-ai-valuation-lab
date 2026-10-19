import {MODEL_VERSION,VALUATION_DATE,project,bridgeEquity} from './model.js';
import {APP_VERSION} from './release.js';
import {compareTheses,valuationLandscape,THESIS_VERSION} from './thesis.js';
import {normalizeEntry,decodeEntry,entryUrl} from './casebook.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const INPUTS=[
  ['rev2026','2026 model revenue','USD bn'],['g1','2027–2030 annual growth','%'],['g2','2031–2033 annual growth','%'],
  ['g3','2034–2036 annual growth','%'],['m27','2027 EBIT margin','%'],['m30','2030 EBIT margin','%'],
  ['m36','2036 EBIT margin','%'],['turns','Sales / invested capital','×'],['wacc','Cost of capital (WACC)','%'],
  ['tg','Perpetual growth','%'],['roic','Terminal ROIC','%'],['stub','Remaining-2026 FCFF','USD bn'],['tax','Tax on positive EBIT','%']
];
function number(value,digits=2){
  if(typeof value!=='number'||!Number.isFinite(value))return 'Unavailable';
  if(Math.abs(value)>=1e7||(value!==0&&Math.abs(value)<1e-5))return value.toExponential(3).replace('-','−');
  return new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Object.is(value,-0)?0:value).replace('-','−');
}
function money(value,signed=false){return (value<0?'−':signed&&value>0?'+':'')+'$'+number(Math.abs(value),1)+'bn';}
function percent(value){
  if(value===null)return 'Undefined';
  const scaled=value*100;
  if(Number.isFinite(scaled))return number(scaled,2)+'%';
  const [coefficient,exponent]=value.toExponential(3).split('e'),power=Number(exponent)+2;
  return coefficient.replace('-','−')+'e'+(power>=0?'+':'')+power+'%';
}
function safeUrl(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}}
function link(value,label){const url=safeUrl(value);return url?'<a href="'+escape(url)+'" rel="noopener noreferrer">'+escape(label)+'</a>':escape(label);}
function storedInput(key,value,unit,side){
  const displayed=unit==='%'?percent(value):number(value,unit==='×'?3:2)+(unit==='×'?'×':'');
  return '<td data-side="'+side+'" data-input="'+key+'" data-value="'+value+'"><span>'+escape(displayed)+'</span><small class="exact">Stored: '+escape(value)+'</small></td>';
}
function metric(label,value,attribute,note,signed=false){
  return '<div class="metric"><span>'+escape(label)+'</span><strong '+attribute+'="'+value+'">'+escape(money(value,signed))+'</strong><small>'+escape(note)+'</small></div>';
}
function noteCard(title,value){
  return '<div class="argument-card"><h3>'+escape(title)+'</h3><p class="analyst-text">'+escape(value||'Not recorded.')+'</p></div>';
}
const STYLE=[
  '*{box-sizing:border-box}body{margin:0;background:#e7ebe7;color:#182b35;font:13px/1.55 system-ui,-apple-system,sans-serif}a{color:#17665e;text-underline-offset:3px;overflow-wrap:anywhere}.sheet{max-width:980px;margin:28px auto;background:#fffdf7;box-shadow:0 18px 60px #10233312}.masthead{padding:25px 38px;background:#102333;color:#fff9ed;display:flex;justify-content:space-between;gap:24px}.masthead strong{font-size:14px}.masthead small{display:block;font-size:10px;color:#cad8de;margin-top:5px}.issue{text-align:right;font-size:11px}.page{padding:30px 38px 34px;border-bottom:1px solid #d6dfd6}.eyebrow{font-size:10px;letter-spacing:1.25px;text-transform:uppercase;color:#567468;font-weight:700}h1,h2{font-family:Georgia,serif;font-weight:400;line-height:1.13;letter-spacing:-.6px}h1{font-size:40px;max-width:810px;margin:10px 0 16px;overflow-wrap:anywhere}h2{font-size:28px;margin:7px 0 16px}h3{font-size:13px;margin:18px 0 9px}p{margin:0 0 12px}.lede{font-size:14px;color:#576b70}.note{font-size:10px;color:#61726f}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin:23px 0}.metric{padding:15px;border:1px solid #cbd8cf;border-top:3px solid #b57457;min-width:0}.metric:nth-child(2){border-top-color:#3d8372}.metric:last-child{background:#102333;color:#fff9ed;border-color:#102333}.metric span,.metric small{display:block;font-size:10px}.metric strong{display:block;font:29px Georgia,serif;margin:7px 0;overflow-wrap:anywhere}.metric small{opacity:.8}.metrics.single{grid-template-columns:1.2fr 1fr 1fr}.argument{border-top:1px solid #d5ded5;margin-top:22px;padding-top:16px}.argument-card{padding:12px 15px;background:#eef2ea;border-left:3px solid #598c79;margin:10px 0;break-inside:avoid}.argument-card h3{margin:0 0 7px;color:#466557;font-size:11px}.analyst-text{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font-size:12px}.callout{padding:12px 15px;border-left:3px solid #bb785e;background:#f4ede4;margin:14px 0}.callout p:last-child{margin:0}table{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}caption{text-align:left;color:#63766c;font-size:10px;padding-bottom:8px}th,td{padding:8px 7px;border-bottom:1px solid #dce2d8;text-align:right;vertical-align:top;overflow-wrap:anywhere}th:first-child,td:first-child{text-align:left}thead{background:#eaf0e8}thead th{font-size:10px}tbody th{font-weight:500}.input-table th:first-child{width:38%}.input-table td{min-width:100px}.exact{display:block;font:9px/1.4 ui-monospace,monospace;color:#708075;margin-top:3px;overflow-wrap:anywhere}.total{font-weight:700;background:#eff2e8}.positive{color:#206852}.negative{color:#a04f3a}.bridge-table{font-size:10px}.forecast th,.forecast td{padding:6px}.source{padding:13px 0;border-bottom:1px solid #e1e6dc;break-inside:avoid}.source h3{margin:5px 0 7px;font-size:13px}.source p{font-size:10px;color:#5c7068;margin:0 0 6px}.source .source-meta{font-size:9px;color:#697d70}.source-tag{font-size:9px;color:#446b59;text-transform:uppercase;letter-spacing:.6px}.axis{font-size:10px;overflow-wrap:anywhere}.axis code{font-size:9px}.frontier-status{font-size:9px;text-align:left}.footer{padding:22px 38px;background:#eff2ea;display:flex;justify-content:space-between;gap:25px;font-size:10px;color:#577063}.reopen{display:inline-block;padding:11px 16px;background:#102333;color:#fff7e6;text-decoration:none;margin:5px 0 12px}.print-hint{max-width:750px;margin:18px auto 30px;padding:0 20px;font-size:11px;color:#607569;text-align:center}',
  '@media(max-width:650px){.sheet{margin:0}.masthead,.page,.footer{padding:23px 19px}.masthead,.footer{flex-direction:column;gap:12px}.issue{text-align:left}h1{font-size:32px}h2{font-size:24px}.metrics,.metrics.single{grid-template-columns:1fr}.metric strong{font-size:26px}.table-wrap{overflow:auto}.input-table{font-size:10px}.input-table th:first-child{width:35%}.input-table td{min-width:90px}.forecast{min-width:590px}.bridge-table{min-width:530px}.exact{font-size:8px}}',
  '@page{size:A4;margin:14mm}@media print{body{background:white;font-size:10px}.sheet{margin:0;max-width:none;box-shadow:none}.masthead{padding:15px 20px}.page{padding:18px 20px;border:0}.page+.page{break-before:page}.masthead small{font-size:8px}h1{font-size:31px}h2{font-size:23px}h3{font-size:11px}.lede{font-size:11px}.metrics{margin:16px 0;gap:10px}.metric{padding:12px}.metric strong{font-size:24px}.metric span,.metric small{font-size:9px}.argument{margin-top:16px;padding-top:12px}.analyst-text{font-size:10px}.argument-card{padding:10px 12px}.note,.source p{font-size:9px}.source h3{font-size:11px;margin:2px 0 3px}.source{padding:7px 0}.source p{margin:0 0 2px}.note{margin-bottom:8px}.source .source-meta,.source-tag{font-size:8px}table{font-size:9px}th,td{padding:6px}thead th{font-size:8px}.exact{font-size:8px;line-height:1.3;margin-top:1.5px}.input-table th,.input-table td{padding:4px 6px}.input-table td{min-width:0}.forecast th,.forecast td{padding:4px}.table-wrap{overflow:visible}.forecast,.bridge-table{min-width:0}.axis{font-size:9px}.axis code{font-size:8px}.frontier-status{font-size:8px}.footer{padding:12px 20px;font-size:8px}.print-hint{display:none}thead{display:table-header-group}tr{break-inside:avoid}h2,h3{break-after:avoid}}'
].join('\n');

function valuationMetrics(cases,comparison){
  if(cases.length===2)return '<div class="metrics">'+
    metric('Reference · '+cases[0].scenario,cases[0].result.ev,'data-reference-ev','Operating enterprise value')+
    metric('Alternative · '+cases[1].scenario,cases[1].result.ev,'data-alternative-ev','Operating enterprise value')+
    metric('Alternative minus reference',comparison.evDelta,'data-ev-delta','Signed enterprise-value change',true)+'</div>';
  const {result,scenario}=cases[0],positive=result.rows.find(row=>row.fcf>0)?.year;
  return '<div class="metrics single">'+metric('Scenario · '+scenario,result.ev,'data-scenario-ev','Operating enterprise value')+
    '<div class="metric"><span>Terminal value / EV</span><strong>'+escape(percent(result.tv_share))+'</strong><small>'+(result.tv_share===null?'Not defined for nonpositive EV':'PV of cash flows after 2036')+'</small></div>'+
    '<div class="metric"><span>First positive annual FCFF</span><strong>'+escape(positive??'None')+'</strong><small>Within the 2027–2036 forecast</small></div></div>';
}
function bridgeSection(cases){
  const rows=cases.filter(item=>item.bridge!==null).map(item=>{
    const equity=bridgeEquity(item.result.ev,item.bridge);
    return '<tr><th scope="row">'+escape(item.label)+'</th><td>'+escape(money(equity.ev))+'</td><td>'+escape(number(equity.cash))+'</td><td>'+escape(number(equity.debt))+'</td><td>'+escape(number(equity.otherClaims))+'</td><td data-equity-value="'+equity.equityValue+'">'+escape(money(equity.equityValue))+'</td></tr>';
  }).join('');
  if(!rows)return '';
  return '<h3>Hypothetical equity bridge</h3><div class="table-wrap"><table class="bridge-table"><thead><tr><th>Case</th><th>EV</th><th>Cash</th><th>Debt</th><th>Other claims</th><th>Hypothetical equity</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="note">Every bridge balance is an assumption. The bridge is excluded from operating EV and its attribution, and does not establish current equity value, security preferences or dilution.</p>';
}
function inputSection(cases){
  const rows=INPUTS.map(([key,label,unit])=>'<tr><th scope="row">'+escape(label)+' <span class="note">'+escape(unit)+'</span></th>'+cases.map(item=>storedInput(key,item.assumptions[key],unit,item.key)).join('')+'</tr>').join('');
  const forecastHeaders=cases.length===1?'<th>Year</th><th>Revenue</th><th>EBIT margin</th><th>FCFF</th><th>PV of FCFF</th>':'<th>Year</th><th>Revenue Ref</th><th>Revenue Alt</th><th>FCFF Ref</th><th>FCFF Alt</th><th>PV Ref</th><th>PV Alt</th>';
  const forecastRows=cases[0].result.rows.map((row,index)=>{
    const values=cases.length===1?[number(row.revenue,1),percent(row.margin),number(row.fcf,1),number(row.pv,1)]:['revenue','fcf','pv'].flatMap(key=>cases.map(item=>number(item.result.rows[index][key],1)));
    return '<tr><th scope="row">'+row.year+'</th>'+values.map(value=>'<td>'+escape(value)+'</td>').join('')+'</tr>';
  }).join('');
  return '<section class="page"><div class="eyebrow">The captured calculation</div><h2>Complete model inputs</h2><p class="note">The main values use the labeled input units. Each “Stored” line gives the exact captured number, with rates expressed as decimals. Future inputs remain analyst assumptions.</p><div class="table-wrap"><table class="input-table"><thead><tr><th>Assumption / input unit</th>'+cases.map(item=>'<th>'+escape(item.label)+' · '+escape(item.scenario)+' origin</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<h3>Follow the cash-flow path</h3><div class="table-wrap"><table class="forecast"><caption>Recalculated annual values · USD billions, except margin · Displayed cash flows rounded</caption><thead><tr>'+forecastHeaders+'</tr></thead><tbody>'+forecastRows+'</tbody></table></div>'+
    '<p class="note">Remaining-2026 FCFF is included separately, once. '+cases.map(item=>escape(item.label)+': '+escape(money(item.assumptions.stub))+' before discounting; '+escape(money(item.result.pv_stub))+' present value.').join(' ')+'</p>'+
    '<p class="note">FCFF deducts taxes on positive EBIT and aggregate net reinvestment, including net capital expenditure and working capital. No tax-loss carryforward or loss benefit is modeled. '+cases.map(item=>escape(item.label)+' peak cumulative economic FCFF deficit: '+escape(money(item.result.peak_funding_need))+'.').join(' ')+' These deficits are not literal cash runway or exact external financing requirements.</p></section>';
}
function comparisonSection(comparison,surface){
  const attribution=comparison.attribution;
  const allocation=attribution.status==='ok'?'<table><thead><tr><th>Assumption group</th><th>Signed EV contribution</th></tr></thead><tbody>'+attribution.groups.map(group=>'<tr data-contribution="'+group.contribution+'"><th scope="row">'+escape(group.label)+'</th><td class="'+(group.contribution<0?'negative':'positive')+'">'+escape(money(group.contribution,true))+'</td></tr>').join('')+'<tr class="total"><th scope="row">Sum of contributions</th><td>'+escape(money(attribution.sum,true))+'</td></tr></tbody></table><p class="note">Reconciliation residual: '+escape(attribution.residual)+' USD billions. No contribution is normalized or clipped.</p>':'<div class="callout"><strong>Attribution unavailable</strong><p>'+escape(attribution.reason)+'</p><p class="note">Finite endpoint values remain available. No failed combination is omitted or replaced with zero.</p></div>';
  const frontierRows=surface.frontier.map(point=>'<tr data-frontier-wacc="'+point.wacc+'"><th scope="row">'+escape(percent(point.wacc))+'</th>'+(point.status==='solved'?'<td data-required-margin="'+point.margin+'">'+escape(percent(point.margin))+'<small class="exact">Stored: '+point.margin+'</small></td><td>'+escape(money(point.ev))+'</td><td class="frontier-status">Solved within the displayed window.</td>':'<td>—</td><td>'+escape(({below_range:'Below window',above_range:'Above window',invalid:'Unavailable'})[point.status]??point.status)+'</td><td class="frontier-status">'+escape(point.reason)+'</td>')+'</tr>').join('');
  return '<section class="page"><div class="eyebrow">The complete two-case context</div><h2>Explain the valuation change</h2><p class="note">Exact grouped attribution evaluates all 64 combinations of six assumption groups, equivalent to averaging all 720 orders. It is conditional on these cases and these groups; it does not establish causality or scenario probabilities.</p>'+allocation+
    '<h3>What would support the target?</h3><p data-target="'+surface.target+'"><strong>Target operating EV: '+escape(money(surface.target))+'.</strong> Hold the alternative case’s other eleven assumptions fixed and solve its 2036 EBIT margin at each captured WACC.</p><p class="axis">Exact target · USD billions: <code>'+surface.target+'</code></p><p class="axis">WACC axis · decimals: <code>'+escape(surface.rates.join(', '))+'</code></p><p class="axis">Margin axis · decimals: <code>'+escape(surface.margins.join(', '))+'</code></p>'+
    '<table><thead><tr><th>WACC</th><th>Required margin</th><th>EV / outcome</th><th>Interpretation</th></tr></thead><tbody>'+frontierRows+'</tbody></table><p class="note">'+surface.validCount+' of '+surface.rates.length*surface.margins.length+' captured grid combinations are model-valid. This is a count of deterministic inputs, not a probability. A target outside the supplied margin range is labeled rather than extrapolated. Changing the 2036 margin also changes interpolated margins in 2031–2036.</p></section>';
}

/** Standalone, script-free research argument with values recalculated from tokens. */
export function createCasebookBrief({entry,research,baseUrl='https://frontier-ai-valuation-lab.vercel.app/casebook.html'}){
  const item=normalizeEntry(entry,research),snapshot=decodeEntry(item),reopen=entryUrl(baseUrl,item);
  const evidence=research.companies?.[snapshot.company];
  if(!evidence)throw new Error('The matching company research context is required.');
  const cases=item.kind==='scenario'?[{key:'scenario',label:'Scenario',...snapshot,result:project(snapshot.assumptions)}]:
    ['reference','alternative'].map(key=>({key,label:key==='reference'?'Reference':'Alternative',...snapshot[key],result:project(snapshot[key].assumptions)}));
  const comparison=item.kind==='thesis'?compareTheses(snapshot.reference.assumptions,snapshot.alternative.assumptions):null;
  const surface=item.kind==='thesis'?valuationLandscape(snapshot.alternative.assumptions,snapshot.landscape):null;
  const selectedIds=new Set(item.sourceIds),sourceIds=new Set([...item.sourceIds,evidence.financing?.sourceId,...(evidence.operatingEvidence??[]).map(item=>item.sourceId),'S19'].filter(Boolean));
  const sources=research.sources.filter(source=>sourceIds.has(source.id)).map(source=>
    '<article class="source" id="source-'+escape(source.id)+'"><div class="source-tag">'+(selectedIds.has(source.id)?'Analyst-selected':'Company / method context')+' · '+escape(source.type)+'</div><h3>'+escape(source.id)+' · '+link(source.url,source.title)+'</h3><p class="source-meta">'+escape(source.publisher)+' · '+escape(source.date)+'</p><p><strong>Recorded use:</strong> '+escape(source.use)+'</p><p><strong>Limit:</strong> '+escape(source.limit)+'</p></article>'
  ).join('');
  const financing=evidence.financing;
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>',escape(item.title+' · Research brief'),'</title><style>',STYLE,'</style></head><body><article class="sheet">',
    '<header class="masthead"><div><strong>Frontier AI Valuation Lab</strong><small>Saved research brief · Recalculated from the captured inputs</small></div><div class="issue">',escape(snapshot.company),' / ',item.kind==='thesis'?'Two-case analysis':'Scenario','<small>Research snapshot · ',escape(VALUATION_DATE),'</small></div></header>',
    '<section class="page"><div class="eyebrow">An argument tied to a complete calculation</div><h1>',escape(item.title),'</h1><p class="lede">',escape(snapshot.company),' · Operating enterprise value · USD billions. The saved cases are illustrative assumptions, not disclosed company forecasts.</p>',
    '<p class="note">Captured ',escape(item.createdAt),' · Metadata updated ',escape(item.updatedAt),'. This document recalculates the captured inputs; it carries no saved server-verification claim.</p>',
    valuationMetrics(cases,comparison),
    '<div class="argument"><h2>Analyst argument</h2><p class="note">The following plain-text notes were supplied by the analyst. Selected sources provide context and do not establish every assumption or certify the conclusion.</p>',
    noteCard('Rationale',item.notes.rationale),noteCard('Key assumption',item.notes.keyAssumption),noteCard('Review trigger',item.notes.reviewTrigger),'</div>',
    bridgeSection(cases),
    '<div class="callout"><p class="note">Negative operating EV remains negative. This operating model does not apply a liquidation floor or calculate a share price. Terminal value describes cash flows after 2036; it is not cash received in that year.</p></div></section>',
    inputSection(cases),
    comparison?comparisonSection(comparison,surface):'',
    '<section class="page"><div class="eyebrow">Dated evidence, with its limits</div><h2>Keep the evidence next to the argument</h2><p class="note">',
    selectedIds.size?'“Analyst-selected” identifies the references saved with these notes.':'No sources were selected for the analyst notes. Company and method context is included below.',
    ' Source dates, evidence classes and limitations remain visible. A financing equity value uses a different basis from the operating EV calculation.</p>',
    financing?'<div class="callout"><p><strong>Separate financing context:</strong> '+escape(money(financing.value))+' of '+escape(financing.basis)+' · '+escape(financing.label)+' · '+escape(financing.date)+'.</p><p class="note">'+escape(financing.note)+'</p></div>':'',
    sources,
    '<p class="note">Frozen research cutoff: ',escape(research.researchCutoff),'. The argument does not imply a live company-data refresh. Future growth, operating margins, capital efficiency, WACC and terminal returns remain analyst inputs.</p>',
    '<a id="casebook-reopen" class="reopen" href="',escape(reopen),'">Reopen the exact calculation ↗</a><p class="note">The calculation link restores the numeric scenarios',item.kind==='thesis'?', target and exact landscape axes':'',' and any hypothetical bridges. This research brief and the exported casebook JSON retain the title, analyst notes and selected source references.</p></section>',
    '<footer class="footer"><div>Application ',escape(APP_VERSION),' · Financial engine ',escape(MODEL_VERSION),item.kind==='thesis'?' · Thesis method '+escape(THESIS_VERSION):'','<br>Valuation date ',escape(VALUATION_DATE),' · Conditional research; not an investment recommendation.</div><div>',link('https://github.com/ult666666/frontier-ai-valuation-lab','Inspect the source and methodology ↗'),'</div></footer></article><p class="print-hint">Open the browser’s Print menu to save a PDF. The complete assumptions, analyst argument and recalculated case context are already in this standalone document.</p></body></html>'
  ].join('');
}
