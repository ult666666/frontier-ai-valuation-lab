import {project,MODEL_VERSION,VALUATION_DATE} from './lib/model.js';
import {APP_VERSION} from './lib/release.js';
import {compareTheses,valuationLandscape,THESIS_VERSION} from './lib/thesis.js';
import {decodeScenario,scenarioUrl} from './lib/share.js';
import {normalizeThesis,decodeThesis,thesisUrl} from './lib/thesis-share.js';
import {createThesisBrief} from './lib/thesis-brief.js';

const $=(selector,scope=document)=>scope.querySelector(selector);
const $$=(selector,scope=document)=>[...scope.querySelectorAll(selector)];
const escape=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const SIDES=['reference','alternative'],COMPANIES=['Anthropic','OpenAI'],SCENARIOS=['Bear','Base','Bull'];
const FIELDS=[
  {key:'rev2026',label:'2026 model revenue',unit:'bn',group:'Revenue & growth',help:'Illustrative full-year revenue in USD billions. This is not a reported full-year actual.',limit:'Above $0bn and no more than $10,000bn.'},
  {key:'g1',label:'2027–2030 annual growth',unit:'%',group:'Revenue & growth',help:'Revenue growth in each of the four years from 2027 through 2030.',limit:'0% to 200%.'},
  {key:'g2',label:'2031–2033 annual growth',unit:'%',group:'Revenue & growth',help:'Revenue growth in each of the three years from 2031 through 2033.',limit:'0% to 200%.'},
  {key:'g3',label:'2034–2036 annual growth',unit:'%',group:'Revenue & growth',help:'Revenue growth in each of the final three forecast years. This input is grouped with long-run economics in the attribution.',limit:'0% to 200%; no lower than perpetual growth.'},
  {key:'m27',label:'2027 EBIT margin',unit:'%',group:'Operating economics',help:'Operating profit as a share of revenue. Margins interpolate between the 2027, 2030 and 2036 anchors.',limit:'−100% to 100%.'},
  {key:'m30',label:'2030 EBIT margin',unit:'%',group:'Operating economics',help:'The middle operating-margin anchor. Tax applies only when EBIT is positive.',limit:'−100% to 100%.'},
  {key:'m36',label:'2036 EBIT margin',unit:'%',group:'Operating economics',help:'Final explicit and terminal EBIT margin. Changing it also changes interpolated margins in 2031–2036.',limit:'Above 0% and no more than 100%.'},
  {key:'tax',label:'Tax on positive EBIT',unit:'%',group:'Operating economics',help:'Tax on positive operating profit. The model provides no loss benefit or tax-loss carryforward.',limit:'0% to below 100%.'},
  {key:'turns',label:'Sales / invested capital',unit:'×',group:'Capital & valuation',help:'Incremental revenue divided by net reinvestment. Higher turns require less capital for the same growth; investment includes net capex and working capital.',limit:'0.05× to 100×.'},
  {key:'wacc',label:'Cost of capital',unit:'%',group:'Capital & valuation',help:'Weighted average cost of capital. Discounts the remaining-2026 cash flow, all forecast cash flows and terminal value.',limit:'Above perpetual growth and no more than 60%.'},
  {key:'tg',label:'Perpetual growth',unit:'%',group:'Capital & valuation',help:'Annual growth after 2036. Terminal reinvestment equals next-year NOPAT multiplied by perpetual growth divided by terminal ROIC.',limit:'At least 0%; below both WACC and terminal ROIC, and no higher than 2034–2036 growth.'},
  {key:'roic',label:'Terminal ROIC',unit:'%',group:'Capital & valuation',help:'Return on invested capital in the terminal period. This determines the reinvestment needed to support perpetual growth.',limit:'Above perpetual growth and no more than 100%.'},
  {key:'stub',label:'Remaining-2026 FCFF',unit:'bn',group:'Capital & valuation',help:'Free cash flow to the firm from 18 October through 31 December 2026. An outflow is negative; this is included once.',limit:'−$10,000bn to $10,000bn.'}
];
const FIELD_MAP=new Map(FIELDS.map(field=>[field.key,field]));
const WINDOW_FIELDS=[['window-wacc-min','rates','min'],['window-wacc-max','rates','max'],['window-margin-min','margins','min'],['window-margin-max','margins','max']];
const state={ready:false,presets:null,research:null,company:'Anthropic',cases:null,draft:null,comparison:null,landscape:null,revision:0,shareRevision:0,controller:null,verificationTimer:null,everVerified:false,presenter:false,selectedRate:0,selectedMargin:0,axes:{},windowValues:new Map(),inputValues:{reference:new Map(),alternative:new Map()},announcementTimer:null};
const formatters=new Map();
function number(value,digits=1){
  if(typeof value!=='number'||!Number.isFinite(value))return '—';
  if(Math.abs(value)>=1e7)return value.toExponential(2).replace('-','−');
  if(!formatters.has(digits))formatters.set(digits,new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}));
  return formatters.get(digits).format(Object.is(value,-0)?0:value).replace('-','−');
}
function money(value,digits=1,signed=false){return typeof value==='number'&&Number.isFinite(value)?`${value<0?'−':signed&&value>0?'+':''}$${number(Math.abs(value),digits)}bn`:'—';}
function moneyHtml(value,signed=false){return typeof value==='number'&&Number.isFinite(value)?`${value<0?'−':signed&&value>0?'+':''}$${number(Math.abs(value))}<small>bn</small>`:'—';}
function scaledPercentage(value,digits=2){const [coefficient,exponent]=value.toExponential(digits).split('e');const shifted=Number(exponent)+2;return `${coefficient.replace('-','−')}e${shifted>=0?'+':''}${shifted}`;}
function percent(value,digits=1){if(typeof value!=='number'||!Number.isFinite(value))return '—';return `${Number.isFinite(value*100)?number(value*100,digits):scaledPercentage(value)}%`;}
function fieldValue(key,value){const field=FIELD_MAP.get(key);return field.unit==='%'?percent(value,3):field.unit==='bn'?money(value,3):`${number(value,3)}×`;}
function shortDate(value){const date=new Date(`${String(value).slice(0,10)}T00:00:00Z`);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(date):String(value);}
function safeUrl(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}}
function displayInput(value,isPercent){const display=isPercent?value*100:value;if(!Number.isFinite(display)&&isPercent)return scaledPercentage(value,16).replace('−','-');const short=Number(display.toPrecision(14));return String(isPercent&&short/100===value?short:display);}
function numericInput(input){const raw=input.value.trim();if(!raw||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw))return null;const value=Number(raw);return Number.isFinite(value)?value:null;}
function evenlySpaced(lower,upper){if(!Number.isFinite(upper-lower)||!(upper>lower))throw new Error('Each window must have a finite upper bound greater than its lower bound.');return Array.from({length:13},(_,i)=>i===12?upper:lower+(upper-lower)*i/12);}
function nearest(values,value){return values.reduce((closest,item,index)=>Math.abs(item-value)<Math.abs(values[closest]-value)?index:closest,0);}
function baseCase(company,scenario){return {scenario,assumptions:{...state.presets[company][scenario]},bridge:null};}
function defaultLandscape(p){
  const rateBounds=p.wacc>=.075&&p.wacc<=.195?[.075,.195]:[Math.max(0,p.wacc-.06),Math.min(.6,p.wacc+.06)];
  const marginBounds=p.m36>=.06&&p.m36<=.42?[.06,.42]:[Math.max(0,p.m36-.18),Math.min(1,p.m36+.18)];
  return {rates:evenlySpaced(...rateBounds),margins:evenlySpaced(...marginBounds),target:500};
}

function buildEditors(){
  let previous='';
  $('#thesis-input-fields').innerHTML=FIELDS.map(field=>{
    const heading=previous!==field.group?`<tr class="input-row-group"><th colspan="3" scope="colgroup">${escape(field.group)}</th></tr>`:'';previous=field.group;
    return `${heading}<tr data-input-row="${field.key}"><th scope="row"><details class="field-definition"><summary><span>${escape(field.label)}</span><span aria-hidden="true">i</span></summary><p id="field-help-${field.key}">${escape(field.help)} <span class="field-limit">${escape(field.limit)}</span> Input unit: ${field.unit==='%'?'percent; enter 12.5 for 12.5 percent':field.unit==='bn'?'USD billions':'times'}.</p></details></th>${SIDES.map(side=>`<td><label class="sr-only" for="${side}-${field.key}">${side==='reference'?'Reference':'Alternative'} ${escape(field.label)} (${field.unit==='%'?'percent':field.unit==='bn'?'USD billions':'times'})</label><div class="input-wrap"><input id="${side}-${field.key}" type="text" inputmode="decimal" data-thesis-input="${side}:${field.key}" aria-describedby="field-help-${field.key}" autocomplete="off" spellcheck="false" disabled><span class="input-unit" aria-hidden="true">${field.unit}</span></div></td>`).join('')}</tr>`;
  }).join('');
}
function populateCase(side,item){
  state.cases[side]={scenario:item.scenario,assumptions:{...item.assumptions},bridge:item.bridge===null?null:{...item.bridge}};
  $(`#${side}-preset`).value=item.scenario;
  for(const field of FIELDS){const input=$(`#${side}-${field.key}`);input.value=displayInput(item.assumptions[field.key],field.unit==='%');input.disabled=false;state.inputValues[side].set(field.key,{display:input.value,value:item.assumptions[field.key]});}
}
function populateWindow(config){
  for(const [id,axis,end] of WINDOW_FIELDS){const value=end==='min'?config[axis][0]:config[axis].at(-1),input=$(`#${id}`);input.value=displayInput(value,true);input.disabled=false;state.windowValues.set(id,{display:input.value,value});}
  for(const axis of ['rates','margins']){const prefix=axis==='rates'?'wacc':'margin';state.axes[axis]={min:$(`#window-${prefix}-min`).value,max:$(`#window-${prefix}-max`).value,values:[...config[axis]]};}
  $('#landscape-target').value=String(config.target);$('#landscape-target').disabled=false;
}
function relatedKeys(message,p){
  if(message.includes('2026 revenue'))return ['rev2026'];
  if(message.includes('Sales / invested'))return ['turns'];
  if(message.includes('terminal growth < WACC'))return ['tg','wacc'];
  if(message.includes('Terminal ROIC'))return ['tg','roic'];
  if(message.includes('Tax'))return ['tax'];
  if(message.includes('Forecast growth'))return ['g1','g2','g3'].filter(key=>p[key]<0||p[key]>2);
  if(message.includes('Margins'))return ['m27','m30','m36'].filter(key=>p[key]<-1||p[key]>1||(key==='m36'&&p[key]<=0));
  if(message.includes('2034–2036'))return ['g3','tg'];
  if(message.includes('Remaining-2026'))return ['stub'];
  return [];
}
function readCase(side){
  const assumptions={},missing=[];
  for(const field of FIELDS){const input=$(`#${side}-${field.key}`),value=numericInput(input),loaded=state.inputValues[side].get(field.key);if(value===null){input.setAttribute('aria-invalid','true');missing.push(field.label.toLowerCase());}else assumptions[field.key]=loaded&&input.value===loaded.display?loaded.value:field.unit==='%'?value/100:value;}
  const label=side==='reference'?'Reference':'Alternative';
  if(missing.length)throw new Error(`${label}: enter a finite number for ${missing.join(', ')}.`);
  try{project(assumptions);}catch(error){for(const key of relatedKeys(error.message,assumptions))$(`#${side}-${key}`).setAttribute('aria-invalid','true');throw new Error(`${label}: ${error.message}`);}
  return {scenario:state.cases[side].scenario,assumptions,bridge:state.cases[side].bridge};
}
function readAxis(axis){
  const prefix=axis==='rates'?'wacc':'margin',label=axis==='rates'?'Cost of capital':'2036 EBIT margin';
  const lowerInput=$(`#window-${prefix}-min`),upperInput=$(`#window-${prefix}-max`),inputs=[lowerInput,upperInput];
  const values=inputs.map(input=>{const loaded=state.windowValues.get(input.id);if(loaded&&input.value===loaded.display)return loaded.value;const value=numericInput(input);if(value===null){input.setAttribute('aria-invalid','true');return null;}return value/100;});
  if(values.some(value=>value===null))throw new Error(`${label} window: enter finite numbers for both bounds.`);
  if(!(values[1]>values[0])||!Number.isFinite(values[1]-values[0])){inputs.forEach(input=>input.setAttribute('aria-invalid','true'));throw new Error(`${label} window: the upper bound must be greater than the lower bound, with a finite interval.`);}
  const cached=state.axes[axis];
  return cached&&cached.min===lowerInput.value&&cached.max===upperInput.value?[...cached.values]:evenlySpaced(...values);
}
function readDraft(){
  const reference=readCase('reference'),alternative=readCase('alternative'),rates=readAxis('rates'),margins=readAxis('margins'),target=numericInput($('#landscape-target'));
  if(target===null||target<=0||target>1e12){$('#landscape-target').setAttribute('aria-invalid','true');throw new Error('Target enterprise value must be a positive finite number, no more than 1,000,000,000,000 USD billions.');}
  return normalizeThesis({company:state.company,reference,alternative,landscape:{rates,margins,target}});
}
function apiStatus(message,kind=''){const element=$('#thesis-api-status');element.className=`api-status ${kind?'is-'+kind:''}`;element.textContent=message;}
function clearPortable(preserveLocation=false){
  state.shareRevision++;$('#thesis-share-area').hidden=true;$('#thesis-share-url').value='';$('#thesis-portable-status').textContent='';
  if(!preserveLocation){$('#thesis-notice').hidden=true;if(location.hash.startsWith('#thesis=')||location.hash.startsWith('#scenario='))history.replaceState(null,'',location.pathname+location.search);}
}
function invalidate(preserveLocation=false){
  state.revision++;if(state.controller)state.controller.abort();state.controller=null;if(state.verificationTimer)clearTimeout(state.verificationTimer);state.verificationTimer=null;
  if(state.announcementTimer)clearTimeout(state.announcementTimer);state.announcementTimer=null;$('#thesis-announcement').textContent='';
  clearPortable(preserveLocation);$('#thesis-verify').innerHTML='Verify both analyses <span aria-hidden="true">↗</span>';
  apiStatus(state.everVerified?'Inputs changed · Verify the current comparison again':'Calculated in your browser · Server check available');
}
function setButtons(valid){
  for(const id of ['thesis-share','thesis-brief','swap-cases'])$(`#${id}`).disabled=!valid;
  $('#thesis-verify').disabled=!valid||Boolean(state.controller);
  $('#landscape-rate-select').disabled=!valid;$('#landscape-margin-select').disabled=!valid;
  if(!valid){$('#use-landscape-point').disabled=true;for(const side of SIDES){$(`#${side}-open`).removeAttribute('href');$(`#${side}-open`).setAttribute('aria-disabled','true');}}
}
function invalidDraft(message){
  state.draft=null;state.comparison=null;state.landscape=null;document.body.dataset.thesisState='invalid';$('#thesis-error').textContent=message;$('#thesis-error').hidden=false;
  for(const id of ['reference-ev','alternative-ev','thesis-delta']){const element=$(`#${id}`);element.textContent='—';element.dataset.value='';element.classList.remove('is-negative');}
  $('#thesis-ratio').textContent='Analysis paused';$('#changed-input-count').textContent='Correct the highlighted inputs';
  const placeholder='<div class="empty-analysis">Complete the highlighted inputs to recalculate this analysis. Results, sharing and exports are paused.</div>';
  $('#attribution-chart').innerHTML=placeholder;$('#landscape-chart').innerHTML=placeholder;
  for(const id of ['attribution-table','group-details','landscape-table','frontier-table'])$(`#${id}`).replaceChildren();
  $('#attribution-status').textContent='No current attribution while the draft is invalid.';$('#landscape-summary').textContent='No current surface while the draft is invalid.';
  $('#landscape-min').textContent='—';$('#landscape-max').textContent='—';$('#selected-point').dataset.value='';$('#selected-point').innerHTML='<span>Analysis paused</span><strong>—</strong><p>Correct the highlighted assumptions or window inputs.</p>';
  $('#frontier-readout').innerHTML='<span>Target margin frontier</span><p>Paused until the draft is valid.</p>';
  apiStatus('Calculation paused · Complete the highlighted inputs','error');setButtons(false);
  $('#thesis-announcement').textContent=`Analysis paused. ${message}`;
}
function announce(message){if(state.announcementTimer)clearTimeout(state.announcementTimer);const revision=state.revision;state.announcementTimer=setTimeout(()=>{if(revision===state.revision&&state.draft)$('#thesis-announcement').textContent=message;state.announcementTimer=null;},180);}
function recalculate({preserveLocation=false,selectAlternative=false}={}){
  if(!state.ready)return;invalidate(preserveLocation);$$('[aria-invalid="true"]').forEach(input=>input.removeAttribute('aria-invalid'));
  try{
    const draft=readDraft(),comparison=compareTheses(draft.reference.assumptions,draft.alternative.assumptions),landscape=valuationLandscape(draft.alternative.assumptions,draft.landscape);
    state.draft=draft;state.cases={reference:draft.reference,alternative:draft.alternative};state.comparison=comparison;state.landscape=landscape;
    if(selectAlternative){state.selectedRate=nearest(landscape.rates,draft.alternative.assumptions.wacc);state.selectedMargin=nearest(landscape.margins,draft.alternative.assumptions.m36);}
    state.selectedRate=Math.min(state.selectedRate,landscape.rates.length-1);state.selectedMargin=Math.min(state.selectedMargin,landscape.margins.length-1);
    document.body.dataset.thesisState='ready';$('#thesis-error').hidden=true;$('#thesis-error').textContent='';renderCases();renderAttribution();renderLandscape();setButtons(true);
    announce(`${draft.company}. Reference ${money(comparison.reference.result.ev)}. Alternative ${money(comparison.alternative.result.ev)}. Change ${money(comparison.evDelta,1,true)}.`);
  }catch(error){invalidDraft(error.message||'This comparison could not be calculated.');}
}
function renderCases(){
  const {draft,comparison}=state;
  for(const side of SIDES){
    const item=draft[side],edited=FIELDS.some(field=>item.assumptions[field.key]!==state.presets[state.company][item.scenario][field.key]),status=$(`#${side}-case-status`),value=$(`#${side}-ev`);
    status.textContent=edited?'Edited assumptions':'Preset assumptions';status.classList.toggle('is-edited',edited);$(`#${side}-presenter-label`).textContent=`${item.scenario}${edited?' · edited':''}`;
    value.dataset.value=String(comparison[side].result.ev);value.innerHTML=moneyHtml(comparison[side].result.ev);value.classList.toggle('is-negative',comparison[side].result.ev<0);value.classList.toggle('is-large',Math.abs(comparison[side].result.ev)>=1000);value.classList.toggle('is-very-large',Math.abs(comparison[side].result.ev)>=10000);value.classList.toggle('is-huge',Math.abs(comparison[side].result.ev)>=100000);value.classList.toggle('is-extreme',Math.abs(comparison[side].result.ev)>=1e7);
    $(`#${side}-open`).href=scenarioUrl(new URL('./index.html',location.href).href,{company:state.company,...item});$(`#${side}-open`).removeAttribute('aria-disabled');$(`#${side}-bridge-note`).hidden=item.bridge===null;
  }
  $$('[data-case-company]').forEach(element=>element.textContent=state.company);$('#presenter-company').textContent=state.company;
  const delta=$('#thesis-delta');delta.dataset.value=String(comparison.evDelta);delta.innerHTML=moneyHtml(comparison.evDelta,true);delta.classList.toggle('is-negative',comparison.evDelta<0);delta.classList.toggle('is-extreme',Math.abs(comparison.evDelta)>=1e7);
  $('#thesis-ratio').textContent=comparison.evChangeRatio===null?'Relative change undefined for nonpositive reference EV':`${comparison.evChangeRatio>0?'+':''}${percent(comparison.evChangeRatio)} vs reference`;
  $('#changed-input-count').textContent=`${comparison.changedInputs.length} changed ${comparison.changedInputs.length===1?'input':'inputs'} · 13 per case`;
  for(const field of FIELDS)$(`[data-input-row="${field.key}"]`).classList.toggle('has-change',draft.reference.assumptions[field.key]!==draft.alternative.assumptions[field.key]);
}

const LABEL_LINES={growth:['Revenue scale','& growth'],margins:['Operating','margins'],capital:['Capital','efficiency'],continuation:['Long-run','economics'],tax:['Tax rate'],stub:['Remaining-2026','cash flow']};
function renderAttribution(){
  const {comparison}=state,{attribution}=comparison;
  if(attribution.status!=='ok'){
    $('#attribution-chart').innerHTML=`<div class="empty-analysis">The two enterprise values remain available. Their attribution is unavailable: ${escape(attribution.reason)}</div>`;
    $('#attribution-status').textContent='The model did not omit failed combinations or substitute an approximate allocation.';$('#attribution-table').innerHTML='<p class="method-note">No finite grouped attribution is available for this pair.</p>';$('#group-details').replaceChildren();return;
  }
  renderWaterfall();
  const scale=Math.max(1,Math.abs(comparison.evDelta)),residual=Math.abs(attribution.residual);
  $('#attribution-status').textContent=`${attribution.groups.length} allocations reconcile to ${money(comparison.evDelta,1,true)} · ${attribution.coalitions} modeled combinations${residual>scale*1e-9?` · Numerical residual ${money(attribution.residual,6)}`:''}`;
  $('#attribution-table').innerHTML=`<table><caption>Signed EV change allocated to each group · USD billions</caption><thead><tr><th scope="col">Assumption group</th><th scope="col">EV contribution</th></tr></thead><tbody>${attribution.groups.map(group=>`<tr><th scope="row">${escape(group.label)}</th><td class="attribution-number ${group.contribution<0?'contribution-negative':'contribution-positive'}">${escape(money(group.contribution,3,true))}</td></tr>`).join('')}<tr class="total-row"><th scope="row">Sum of allocations</th><td>${escape(money(attribution.sum,3,true))}</td></tr><tr><th scope="row">Alternative − reference</th><td>${escape(money(comparison.evDelta,3,true))}</td></tr><tr><th scope="row">Floating-point residual</th><td>${escape(attribution.residual===0?'0':attribution.residual.toExponential(3))} bn</td></tr></tbody></table>`;
  $('#group-details').innerHTML=attribution.groups.map(group=>`<details class="group-detail"><summary>${escape(group.label)}<span>${group.keys.length} ${group.keys.length===1?'input':'inputs'} +</span></summary><table><caption>Reference → alternative · input units shown</caption><tbody>${group.keys.map(key=>`<tr><th scope="row">${escape(FIELD_MAP.get(key).label)}</th><td>${escape(fieldValue(key,comparison.reference.assumptions[key]))}</td><td>→ ${escape(fieldValue(key,comparison.alternative.assumptions[key]))}</td></tr>`).join('')}</tbody></table></details>`).join('');
}
function renderWaterfall(){
  const {comparison}=state;if(comparison?.attribution.status!=='ok')return;
  const mobile=matchMedia('(max-width:600px)').matches,groups=comparison.attribution.groups;
  let running=comparison.reference.result.ev;
  const steps=[{key:'reference',label:['Reference'],start:0,end:running,value:running,endpoint:true}];
  for(const group of groups){steps.push({key:group.key,label:LABEL_LINES[group.key]||[group.label],start:running,end:running+group.contribution,value:group.contribution,endpoint:false});running+=group.contribution;}
  steps.push({key:'alternative',label:['Alternative'],start:0,end:comparison.alternative.result.ev,value:comparison.alternative.result.ev,endpoint:true});
  const rawMin=Math.min(0,...steps.map(step=>Math.min(step.start,step.end))),rawMax=Math.max(0,...steps.map(step=>Math.max(step.start,step.end))),unit=Math.max(Math.abs(rawMin),Math.abs(rawMax),1),minimum=rawMin/unit,maximum=rawMax/unit,span=Math.max(maximum-minimum,.01);
  const low=minimum-(rawMin<0?span*.08:0),high=maximum+span*.14,scaled=value=>(value/unit-low)/(high-low);
  const title=`Enterprise value moves from ${money(comparison.reference.result.ev)} to ${money(comparison.alternative.result.ev)} through six signed assumption-group allocations.`;
  let svg;
  if(mobile){
    const W=480,H=445,left=124,right=98,top=30,gap=43,barHeight=17,x=value=>left+scaled(value)*(W-left-right),zero=x(0);
    svg=`<svg id="waterfall-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="waterfall-title waterfall-desc"><title id="waterfall-title">What moved the value?</title><desc id="waterfall-desc">${escape(title)} Exact values are in the allocation table below.</desc><line x1="${zero}" x2="${zero}" y1="20" y2="374" stroke="#c6d2bf" stroke-dasharray="3 4"/><text x="${W-12}" y="15" text-anchor="end" font-family="var(--sans)" font-size="9" fill="#87947c">USD bn</text>${steps.map((step,index)=>{
      const y=top+index*gap,start=x(step.start),end=x(step.end),fill=step.endpoint?'#26473f':step.value<0?'#d89b7b':'#719882';
      const previous=index>0?steps[index-1]:null,connector=previous&&index<steps.length-1?`<line x1="${x(previous.end)}" x2="${x(previous.end)}" y1="${y-gap+barHeight}" y2="${y+barHeight/2}" stroke="#bccbb3" stroke-dasharray="2 3"/>`:'';
      return `<g${step.endpoint?'':` data-thesis-contribution="${step.key}" data-value="${step.value}"`}>${connector}<text x="10" y="${y+7}" font-family="var(--sans)" font-size="11" fill="${step.endpoint?'#304f3b':'#687d5f'}">${step.label.map((text,i)=>`<tspan x="10" dy="${i?13:0}">${escape(text)}</tspan>`).join('')}</text><rect x="${Math.min(start,end)}" y="${y}" width="${Math.max(1,Math.abs(end-start))}" height="${barHeight}" rx="1" fill="${fill}"/><text x="${W-12}" y="${y+13}" text-anchor="end" font-family="var(--mono)" font-size="10" fill="${step.value<0?'#a96e4e':'#58734e'}">${step.endpoint?'':step.value>0?'+':''}${number(step.value)}</text></g>`;
    }).join('')}<line x1="${left}" x2="${W-right}" y1="390" y2="390" stroke="#d6dfce"/><path d="M${x(rawMin)},386V394M${x(rawMax)},386V394" fill="none" stroke="#b8c8af"/><text x="${x(rawMin)}" y="410" font-family="var(--mono)" font-size="9" fill="#8a9780">${number(rawMin,0)}</text><text x="${x(rawMax)}" y="410" text-anchor="end" font-family="var(--mono)" font-size="9" fill="#8a9780">${number(rawMax,0)}</text><text x="${left+(W-left-right)/2}" y="432" text-anchor="middle" font-family="var(--sans)" font-size="9" fill="#88967c">Cumulative enterprise value · USD bn</text></svg>`;
  }else{
    const W=1180,H=318,left=49,right=29,top=31,bottom=78,slot=(W-left-right)/steps.length,barWidth=61,y=value=>H-bottom-scaled(value)*(H-top-bottom),zero=y(0);
    svg=`<svg id="waterfall-svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="waterfall-title waterfall-desc"><title id="waterfall-title">What moved the value?</title><desc id="waterfall-desc">${escape(title)} Exact values are in the allocation table below.</desc><line x1="${left}" x2="${W-right}" y1="${zero}" y2="${zero}" stroke="#c4d1b9" stroke-dasharray="3 4"/><text x="${left-9}" y="${zero+3}" text-anchor="end" fill="#92a080" font-family="var(--mono)" font-size="9">0</text>${steps.map((step,index)=>{
      const x=left+index*slot+(slot-barWidth)/2,start=y(step.start),end=y(step.end),fill=step.endpoint?'#26473f':step.value<0?'#d89b7b':'#719882';
      const connector=index>0&&index<steps.length-1?`<line x1="${x-slot+barWidth}" x2="${x}" y1="${start}" y2="${start}" stroke="#b7c7ab" stroke-dasharray="3 3"/>`:'';
      return `<g${step.endpoint?'':` data-thesis-contribution="${step.key}" data-value="${step.value}"`}>${connector}<rect x="${x}" y="${Math.min(start,end)}" width="${barWidth}" height="${Math.max(1,Math.abs(end-start))}" rx="1" fill="${fill}"/><text x="${x+barWidth/2}" y="${Math.min(start,end)-10}" text-anchor="middle" font-family="var(--mono)" font-size="12" fill="${step.value<0?'#aa674b':'#4b704f'}">${step.endpoint?'':step.value>0?'+':''}${number(step.value)}</text><text x="${x+barWidth/2}" y="${H-48}" text-anchor="middle" font-family="var(--sans)" font-size="11" fill="${step.endpoint?'#3b5b40':'#738668'}">${step.label.map((text,i)=>`<tspan x="${x+barWidth/2}" dy="${i?15:0}">${escape(text)}</tspan>`).join('')}</text></g>`;
    }).join('')}<text x="${W-right}" y="${H-10}" text-anchor="end" font-family="var(--sans)" font-size="9" fill="#8b987c">Present value · USD billions</text></svg>`;
  }
  $('#attribution-chart').innerHTML=svg;
}

function valueColor(value,minimum,maximum){
  if(value===null)return '#203442';
  const stops=value<0?[[151,103,79],[50,72,80]]:[[50,72,80],[191,214,175]],denominator=value<0?Math.abs(Math.min(minimum,0)):Math.max(maximum,0),t=denominator?Math.max(0,Math.min(1,value<0?1-Math.abs(value)/denominator:Math.sqrt(value/denominator))):.5;
  return `rgb(${stops[0].map((component,i)=>Math.round(component+(stops[1][i]-component)*t)).join(',')})`;
}
function axisIndex(value,values){
  if(value<=values[0])return 0;if(value>=values.at(-1))return values.length-1;
  for(let index=1;index<values.length;index++)if(value<=values[index]){const scale=Math.max(Math.abs(values[index]),Math.abs(values[index-1]),Math.abs(value),1);return index-1+(value/scale-values[index-1]/scale)/(values[index]/scale-values[index-1]/scale);}
  return values.length-1;
}
function renderLandscape(){
  const landscape=state.landscape;
  $('#landscape-context').textContent=`Other eleven inputs: ${state.company} alternative · ${state.draft.alternative.scenario}${FIELDS.some(field=>state.draft.alternative.assumptions[field.key]!==state.presets[state.company][state.draft.alternative.scenario][field.key])?' edited':''}`;
  $('#landscape-rate-select').innerHTML=landscape.rates.map((rate,index)=>`<option value="${index}"${index===state.selectedRate?' selected':''}>${percent(rate,3)}</option>`).join('');
  $('#landscape-margin-select').innerHTML=landscape.margins.map((margin,index)=>`<option value="${index}"${index===state.selectedMargin?' selected':''}>${percent(margin,3)}</option>`).join('');
  $('#presenter-target').textContent=`Target EV ${money(landscape.target)}`;
  renderHeatmap();renderLandscapeTables();renderSelectedPoint();
  $('#landscape-min').textContent=money(landscape.minEv,0);$('#landscape-max').textContent=money(landscape.maxEv,0);
  $('.color-scale').style.background=landscape.validCount?`linear-gradient(90deg,${Array.from({length:9},(_,index)=>valueColor(landscape.minEv*(1-index/8)+landscape.maxEv*index/8,landscape.minEv,landscape.maxEv)).join(',')})`:'#354a51';
  const unavailable=landscape.rates.length*landscape.margins.length-landscape.validCount,solved=landscape.frontier.filter(point=>point.status==='solved').length;
  $('#landscape-summary').textContent=`${landscape.validCount} valid sampled valuations${unavailable?` · ${unavailable} unavailable combinations shown with hatching`:''}. The frontier reaches ${money(landscape.target,0)} at ${solved} of ${landscape.rates.length} sampled discount rates within this window. Select a cell or use the point controls.`;
}
function renderHeatmap(){
  const l=state.landscape;if(!l)return;
  const mobile=matchMedia('(max-width:600px)').matches,W=mobile?480:900,H=mobile?465:560,left=61,right=20,top=23,bottom=67,width=W-left-right,height=H-top-bottom,cw=width/l.rates.length,ch=height/l.margins.length;
  const centerX=index=>left+(index+.5)*cw,centerY=index=>top+(l.margins.length-index-.5)*ch;
  let segments=[],segment=[];
  for(let index=0;index<l.frontier.length;index++){const point=l.frontier[index];if(point.status==='solved')segment.push([centerX(index),centerY(axisIndex(point.margin,l.margins)),point]);else if(segment.length){segments.push(segment);segment=[];}}
  if(segment.length)segments.push(segment);
  const frontier=segments.map(points=>`${points.length>1?`<path d="${points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(3)},${y.toFixed(3)}`).join(' ')}" fill="none" stroke="#183e42" stroke-width="5" stroke-linecap="round"/><path d="${points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(3)},${y.toFixed(3)}`).join(' ')}" fill="none" stroke="#f4d0a0" stroke-width="2" stroke-linejoin="round"/>`:''}${points.map(([x,y,point])=>`<circle data-frontier-point="${point.wacc}" data-margin="${point.margin}" cx="${x}" cy="${y}" r="${mobile?2.6:3.4}" fill="#f4deb8" stroke="#204748" stroke-width="1.4"/>`).join('')}`).join('');
  const selectedX=left+state.selectedRate*cw,selectedY=top+(l.margins.length-state.selectedMargin-1)*ch,tickStep=mobile?Math.ceil(l.rates.length/7):Math.ceil(l.rates.length/13),marginStep=mobile?Math.ceil(l.margins.length/9):Math.ceil(l.margins.length/13);
  $('#landscape-chart').innerHTML=`<svg id="heatmap-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><pattern id="unavailable-hatch" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#233843"/><path d="M-2,2L2,-2M0,7L7,0M5,9L9,5" stroke="#5c6761" stroke-width=".8"/></pattern></defs>${l.margins.map((margin,row)=>l.rates.map((rate,column)=>{const value=l.values[row][column];return `<rect data-landscape-cell="${row}:${column}"${value===null?' data-landscape-invalid="true"':''} x="${left+column*cw+.6}" y="${top+(l.margins.length-row-1)*ch+.6}" width="${Math.max(.2,cw-1.2)}" height="${Math.max(.2,ch-1.2)}" rx=".8" fill="${value===null?'url(#unavailable-hatch)':valueColor(value,l.minEv,l.maxEv)}" style="cursor:pointer"><title>WACC ${percent(rate,3)}; 2036 EBIT margin ${percent(margin,3)}; ${value===null?'Unavailable: '+escape(l.invalidReasons[row][column]):money(value)}</title></rect>`;}).join('')).join('')}<g pointer-events="none">${frontier}<rect x="${selectedX+1.1}" y="${selectedY+1.1}" width="${Math.max(.2,cw-2.2)}" height="${Math.max(.2,ch-2.2)}" rx="1" fill="none" stroke="#f1f1dc" stroke-width="2.3"/><circle cx="${selectedX+cw/2}" cy="${selectedY+ch/2}" r="2.8" fill="#f2f0d8" stroke="#1c4e4c" stroke-width="1.1"/></g>${l.rates.map((rate,index)=>index%tickStep===0||index===l.rates.length-1?`<text x="${centerX(index)}" y="${H-bottom+22}" text-anchor="middle" font-family="var(--mono)" font-size="${mobile?10:11}" fill="#a6bcb5">${percent(rate,1)}</text>`:'').join('')}${l.margins.map((margin,index)=>index%marginStep===0||index===l.margins.length-1?`<text x="${left-10}" y="${centerY(index)+3}" text-anchor="end" font-family="var(--mono)" font-size="${mobile?10:11}" fill="#a6bcb5">${percent(margin,1)}</text>`:'').join('')}<text x="${left+width/2}" y="${H-13}" text-anchor="middle" font-family="var(--sans)" font-size="${mobile?11:12}" fill="#b9c8be">Cost of capital (WACC)</text><text x="15" y="${top+height/2}" text-anchor="middle" transform="rotate(-90 15 ${top+height/2})" font-family="var(--sans)" font-size="${mobile?11:12}" fill="#b9c8be">2036 EBIT margin</text></svg>`;
}
function frontierDescription(point){
  if(point.status==='solved')return `<strong>${percent(point.margin,2)} EBIT margin</strong> reaches ${money(state.landscape.target,0)} at ${percent(point.wacc,2)} WACC.`;
  if(point.status==='below_range')return `The target requires a margin below this window’s ${percent(state.landscape.margins[0],2)} lower bound.`;
  if(point.status==='above_range')return `The target requires a margin above this window’s ${percent(state.landscape.margins.at(-1),2)} upper bound.`;
  return `Unavailable: ${escape(point.reason||'This combination cannot be calculated.')}`;
}
function renderSelectedPoint(){
  const l=state.landscape;if(!l)return;
  const value=l.values[state.selectedMargin][state.selectedRate],reason=l.invalidReasons[state.selectedMargin][state.selectedRate],rate=l.rates[state.selectedRate],margin=l.margins[state.selectedMargin],point=$('#selected-point');
  point.dataset.value=value===null?'':String(value);point.dataset.rate=String(rate);point.dataset.margin=String(margin);point.classList.toggle('is-negative',value!==null&&value<0);point.classList.toggle('is-invalid',value===null);
  point.innerHTML=`<span>Modeled enterprise value</span><strong>${value===null?'Unavailable':moneyHtml(value)}</strong><p>${percent(rate,3)} WACC · ${percent(margin,3)} EBIT margin${value===null?`<br>${escape(reason)}`:''}</p>`;
  $('#use-landscape-point').disabled=value===null||!state.draft;
  $('#frontier-readout').innerHTML=`<span>At ${percent(rate,2)} cost of capital</span><p>${frontierDescription(l.frontier[state.selectedRate])}</p>`;
  $$('#landscape-table td[data-rate-index]').forEach(cell=>cell.classList.toggle('is-selected',Number(cell.dataset.rateIndex)===state.selectedRate&&Number(cell.dataset.marginIndex)===state.selectedMargin));
}
function renderLandscapeTables(){
  const l=state.landscape;
  $('#landscape-table').innerHTML=`<table><caption>Alternative inputs held fixed except WACC across columns and 2036 EBIT margin down rows · EV in USD billions</caption><thead><tr><th scope="col">Margin / WACC</th>${l.rates.map(rate=>`<th scope="col">${percent(rate,3)}</th>`).join('')}</tr></thead><tbody>${l.margins.map((margin,row)=>`<tr><th scope="row">${percent(margin,3)}</th>${l.rates.map((rate,column)=>`<td data-rate-index="${column}" data-margin-index="${row}"${l.values[row][column]===null?` class="is-unavailable" title="${escape(l.invalidReasons[row][column])}"`:''}>${l.values[row][column]===null?'Unavailable':number(l.values[row][column],2)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('#frontier-table').innerHTML=`<table><caption>2036 EBIT margin required to reach ${money(l.target)} within the supplied window</caption><thead><tr><th scope="col">WACC</th><th scope="col">Required margin</th><th scope="col">Recalculated EV</th><th scope="col">Status</th></tr></thead><tbody>${l.frontier.map(point=>`<tr><th scope="row">${percent(point.wacc,3)}</th><td>${point.status==='solved'?percent(point.margin,6):'—'}</td><td>${point.status==='solved'?money(point.ev,3):'—'}</td><td>${point.status==='solved'?'Solved':point.status==='below_range'?'Below margin window':point.status==='above_range'?'Above margin window':'Unavailable'}${point.reason?`<span class="sr-only">: ${escape(point.reason)}</span>`:''}</td></tr>`).join('')}</tbody></table>`;
}
function selectPoint(rateIndex,marginIndex){
  if(!state.landscape)return;state.selectedRate=Math.max(0,Math.min(state.landscape.rates.length-1,rateIndex));state.selectedMargin=Math.max(0,Math.min(state.landscape.margins.length-1,marginIndex));
  $('#landscape-rate-select').value=String(state.selectedRate);$('#landscape-margin-select').value=String(state.selectedMargin);renderHeatmap();renderSelectedPoint();announce(`Selected point: WACC ${percent(state.landscape.rates[state.selectedRate],2)}, EBIT margin ${percent(state.landscape.margins[state.selectedMargin],2)}, EV ${money(state.landscape.values[state.selectedMargin][state.selectedRate])}.`);
}
function useSelectedPoint(){
  if(!state.draft||!state.landscape||state.landscape.values[state.selectedMargin][state.selectedRate]===null)return;
  const item=state.draft.alternative;populateCase('alternative',{...item,assumptions:{...item.assumptions,wacc:state.landscape.rates[state.selectedRate],m36:state.landscape.margins[state.selectedMargin]}});recalculate();
  $('#thesis-portable-status').textContent='The selected WACC and 2036 margin are now the alternative case. Its other eleven assumptions are unchanged.';
}

function renderEvidence(){
  const entry=state.research.companies[state.company],evidence=entry.operatingEvidence||[],modelStart=evidence.find(item=>item.status==='Analyst assumption'),ids=new Set([...evidence.map(item=>item.sourceId),entry.financing?.sourceId,'S19'].filter(Boolean));
  const sources=state.research.sources.filter(source=>ids.has(source.id));
  $('#thesis-evidence').innerHTML=`<article class="evidence-item"><span class="source-type">${escape(state.company)} · Model inputs</span><h3>The selected forecasts remain assumptions.</h3><p>${escape(modelStart?.note||'Forward growth, operating margins, capital efficiency and discount rates are illustrative model assumptions.')} Edited cases reflect the values entered here.</p></article>${sources.map(source=>{const url=safeUrl(source.url);return `<article class="evidence-item"><span class="source-type">${escape(source.type)} · ${escape(source.id)}</span><h3>${url?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)} <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a>`:escape(source.title)}</h3><p>${escape(source.limit)}</p><p class="source-meta">${escape(source.publisher)} · ${escape(shortDate(source.date))}</p></article>`;}).join('')}`;
}
function applyDraft(draft,{preserveLocation=false,notice=''}={}){
  const checked=normalizeThesis(draft);
  // Individual finite endpoints can still produce an overflowing pair ratio.
  // Finish all computational validation before replacing the visitor's draft.
  compareTheses(checked.reference.assumptions,checked.alternative.assumptions);
  valuationLandscape(checked.alternative.assumptions,checked.landscape);
  state.company=checked.company;state.cases={reference:checked.reference,alternative:checked.alternative};$('#thesis-company').value=checked.company;
  for(const side of SIDES)populateCase(side,checked[side]);populateWindow(checked.landscape);renderEvidence();recalculate({preserveLocation,selectAlternative:true});
  if(notice){$('#thesis-notice').className='notice';$('#thesis-notice').textContent=notice;$('#thesis-notice').hidden=false;}
}
function restoreHash(hash=location.hash){
  try{
    if(hash.startsWith('#thesis='))applyDraft(decodeThesis(hash.slice('#thesis='.length)),{preserveLocation:true,notice:'Shared comparison restored. Both complete cases and the exact landscape window have been recalculated.'});
    else if(hash.startsWith('#scenario=')){
      const imported=decodeScenario(hash.slice('#scenario='.length)),alternative={scenario:imported.scenario,assumptions:imported.assumptions,bridge:imported.bridge};
      applyDraft({company:imported.company,reference:baseCase(imported.company,imported.scenario),alternative,landscape:defaultLandscape(imported.assumptions)},{preserveLocation:true,notice:`Your exact ${imported.company} case is the alternative. The reference is its original ${imported.scenario} preset. Any hypothetical equity bridge is carried when reopening the case; this analysis uses operating enterprise value.`});
    }
  }catch(error){$('#thesis-notice').className='notice is-error';$('#thesis-notice').textContent=`This link could not be loaded: ${error.message} The current cases are retained.`;$('#thesis-notice').hidden=false;}
}
async function shareComparison(){
  if(!state.draft)return;const revision=++state.shareRevision;
  try{
    const link=thesisUrl(new URL('./thesis.html',location.href).href,state.draft);$('#thesis-share-url').value=link;$('#thesis-share-area').hidden=false;
    let copied=false;try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(link);copied=true;}}catch{/* The selectable URL below remains usable. */}
    if(revision!==state.shareRevision)return;
    $('#thesis-portable-status').textContent=copied?'Comparison link copied. It restores both exact cases, the landscape window and the target.':'Your comparison link is ready below. Select and copy it to share both exact cases.';
    if(!copied){$('#thesis-share-url').focus();$('#thesis-share-url').select();}
  }catch(error){if(revision===state.shareRevision)$('#thesis-portable-status').textContent=`Could not create the comparison link: ${error.message}`;}
}
function exportBrief(){
  if(!state.draft)return;
  try{
    const draft=normalizeThesis(state.draft),shareUrl=thesisUrl(new URL('./thesis.html',location.href).href,draft),html=createThesisBrief({draft,research:state.research,shareUrl});
    const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),anchor=document.createElement('a');anchor.href=url;anchor.download=`${draft.company.toLowerCase()}-${draft.reference.scenario.toLowerCase()}-to-${draft.alternative.scenario.toLowerCase()}-thesis-brief.html`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
    $('#thesis-portable-status').textContent='Comparison brief downloaded. It includes both cases, the attribution, the landscape and sources. Open the HTML file and print it to save a PDF.';
  }catch(error){$('#thesis-portable-status').textContent=`Could not export this comparison: ${error.message}`;}
}
function equalResult(actual,expected){
  if(typeof expected==='number')return typeof actual==='number'&&Number.isFinite(actual)&&Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected));
  if(expected===null||typeof expected!=='object')return actual===expected;
  if(!actual||typeof actual!=='object'||Array.isArray(actual)!==Array.isArray(expected))return false;
  const keys=Object.keys(expected);return keys.length===Object.keys(actual).length&&keys.every(key=>Object.hasOwn(actual,key)&&equalResult(actual[key],expected[key]));
}
async function verifyAnalyses(){
  if(!state.draft||state.controller)return;
  const revision=state.revision,controller=new AbortController(),draft=normalizeThesis(state.draft),expected={attribute:state.comparison,landscape:state.landscape};state.controller=controller;state.everVerified=true;
  let timedOut=false;state.verificationTimer=setTimeout(()=>{timedOut=true;controller.abort();},10000);setButtons(true);$('#thesis-verify').textContent='Verifying both analyses…';apiStatus('Checking the complete current attribution and landscape…','pending');
  try{
    const payloads=[{action:'attribute',reference:draft.reference.assumptions,alternative:draft.alternative.assumptions},{action:'landscape',assumptions:draft.alternative.assumptions,...draft.landscape}];
    const responses=await Promise.all(payloads.map(async payload=>{
      const response=await fetch(new URL('./api/valuation',location.href),{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      if(!response.ok)throw new Error(response.status===404?'Server verification is unavailable on this host.':`Server verification returned HTTP ${response.status}.`);
      if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Server verification is unavailable on this host.');
      const body=await response.json();if(body.appVersion!==APP_VERSION||body.modelVersion!==MODEL_VERSION||body.valuationDate!==VALUATION_DATE)throw new Error('The server and browser have different release or model versions. Refresh after deployment finishes.');
      if(!equalResult(body.result,expected[payload.action]))throw new Error('The complete server result does not match this browser calculation.');
      return body;
    }));
    if(revision!==state.revision||state.controller!==controller)return;
    if(responses.length===2)apiStatus('Verified on server · Both complete analyses match the current browser results','success');
  }catch(error){
    if(revision!==state.revision||state.controller!==controller)return;controller.abort();apiStatus(`${timedOut?'Server verification timed out after 10 seconds.':error.message} Local calculations remain unverified.`,'error');
  }finally{
    if(revision===state.revision&&state.controller===controller){clearTimeout(state.verificationTimer);state.verificationTimer=null;state.controller=null;$('#thesis-verify').innerHTML='Verify both analyses <span aria-hidden="true">↗</span>';setButtons(Boolean(state.draft));}
  }
}
function togglePresenter(force){
  state.presenter=typeof force==='boolean'?force:!state.presenter;document.body.classList.toggle('is-presenting',state.presenter);$('#presenter-toggle').setAttribute('aria-pressed',String(state.presenter));$('#presenter-toggle').lastElementChild.textContent=state.presenter?'Exit presentation':'Present analysis';
  for(const id of ['presenter-company','reference-presenter-label','alternative-presenter-label','presenter-target'])$(`#${id}`).hidden=!state.presenter;
  if(state.landscape){renderHeatmap();renderWaterfall();}
}
function bindEvents(){
  $('#thesis-assumptions-form').addEventListener('submit',event=>event.preventDefault());
  $('#thesis-assumptions-form').addEventListener('input',event=>{if(event.target.matches('[data-thesis-input]'))recalculate();});
  $('#thesis-company').addEventListener('change',()=>{const company=$('#thesis-company').value;if(!COMPANIES.includes(company))return;const reference=baseCase(company,'Base'),alternative=baseCase(company,'Bull');applyDraft({company,reference,alternative,landscape:defaultLandscape(alternative.assumptions)});});
  for(const side of SIDES)$(`#${side}-preset`).addEventListener('change',()=>{const scenario=$(`#${side}-preset`).value;if(!SCENARIOS.includes(scenario))return;populateCase(side,baseCase(state.company,scenario));recalculate({selectAlternative:side==='alternative'});});
  $('#swap-cases').addEventListener('click',()=>{if(state.draft)applyDraft({...state.draft,reference:state.draft.alternative,alternative:state.draft.reference});});
  for(const [id] of WINDOW_FIELDS)$(`#${id}`).addEventListener('input',()=>recalculate());
  $('#landscape-target').addEventListener('input',()=>recalculate());
  $('#landscape-rate-select').addEventListener('change',()=>selectPoint(Number($('#landscape-rate-select').value),state.selectedMargin));
  $('#landscape-margin-select').addEventListener('change',()=>selectPoint(state.selectedRate,Number($('#landscape-margin-select').value)));
  $('#landscape-chart').addEventListener('click',event=>{const cell=event.target.closest('[data-landscape-cell]');if(cell){const [margin,rate]=cell.dataset.landscapeCell.split(':').map(Number);selectPoint(rate,margin);}});
  $('#use-landscape-point').addEventListener('click',useSelectedPoint);$('#thesis-share').addEventListener('click',shareComparison);$('#thesis-brief').addEventListener('click',exportBrief);$('#thesis-verify').addEventListener('click',verifyAnalyses);$('#presenter-toggle').addEventListener('click',()=>togglePresenter());
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.presenter){togglePresenter(false);$('#presenter-toggle').focus();}});
  window.addEventListener('hashchange',()=>{if(state.ready)restoreHash();});
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state.draft){renderWaterfall();renderHeatmap();}},70);});
}
async function fetchJson(path){const response=await fetch(new URL(path,import.meta.url),{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Could not load the research snapshot (HTTP ${response.status}).`);return response.json();}
async function initialize(){
  buildEditors();bindEvents();
  try{
    const [presets,research]=await Promise.all([fetchJson('./data/presets.json'),fetchJson('./data/research.json')]);
    for(const company of COMPANIES)for(const scenario of SCENARIOS)project(presets?.[company]?.[scenario]);
    if(!research||!Array.isArray(research.sources)||research.modelVersion!==MODEL_VERSION||research.asOf!==VALUATION_DATE||COMPANIES.some(company=>!research.companies?.[company]))throw new Error('Research metadata and the financial model must identify the same companies, model version and date.');
    state.presets=presets;state.research=research;state.ready=true;
    for(const id of ['thesis-company','reference-preset','alternative-preset'])$(`#${id}`).disabled=false;
    $('#thesis-date').textContent=`Research snapshot · ${shortDate(VALUATION_DATE)}`;$('#thesis-version').innerHTML=`Application ${escape(APP_VERSION)} · Financial engine ${escape(MODEL_VERSION)} · Thesis analytics ${escape(THESIS_VERSION)}<br>Research snapshot · ${escape(shortDate(VALUATION_DATE))}`;
    // Read the latest fragment after data loading, so a newer incoming link wins.
    const requestedHash=location.hash,reference=baseCase('Anthropic','Base'),alternative=baseCase('Anthropic','Bull');
    applyDraft({company:'Anthropic',reference,alternative,landscape:defaultLandscape(alternative.assumptions)},{preserveLocation:true});restoreHash(requestedHash);
  }catch(error){state.ready=false;invalidDraft(`The Thesis Lab could not start: ${error.message} Reload the page, or use the model workbook and research report.`);}
}
initialize();
