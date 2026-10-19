import {MODEL_VERSION,VALUATION_DATE} from './lib/model.js';
import {APP_VERSION} from './lib/release.js';
import {valueHorizon,HORIZON_MAX_YEARS} from './lib/horizon.js';
import {normalizeHorizon,decodeHorizon,horizonUrl} from './lib/horizon-share.js';
import {createHorizonBrief,createHorizonExport} from './lib/horizon-brief.js';
import {decodeScenario,scenarioUrl} from './lib/share.js';
import {EVIDENCE_FIELDS,formatEvidenceValue} from './lib/evidence.js';
import {createEvidenceContext} from './evidence-context.js';

const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
const state={ready:false,presets:null,research:null,case:null,snapshot:null,result:null,revision:0,controller:null,evidence:null,announcement:null};
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
function amount(value,digits=1){
  const abs=Math.abs(value),sign=value<0?'−':'';
  if(abs>1e7||(abs>0&&abs<.01))return `${sign}${abs.toExponential(2)}`;
  return sign+abs.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
}
const money=(value,digits=1)=>`${value<0?'−':''}$${amount(Math.abs(value),digits)}B`;
const percent=value=>(value*100).toLocaleString('en-US',{maximumFractionDigits:2})+'%';
const snapshotBase=()=>new URL('./horizon.html',location.href).href;
function numeric(input){return input.value.trim()===''||!Number.isFinite(Number(input.value))?null:Number(input.value);}
function metric(id,value){const element=$(`#${id}`);element.textContent=money(value);element.dataset.value=String(value);element.classList.toggle('is-negative',value<0);}
function isCustom(){return EVIDENCE_FIELDS.some(field=>state.case.assumptions[field.key]!==state.presets[state.case.company][state.case.scenario][field.key]);}
function renderCaseSelection(){
  const custom=isCustom();$('#horizon-case-status').textContent=custom?`Edited inputs · based on ${state.case.scenario}`:`${state.case.scenario} preset · 13 explicit assumptions`;
  $('#horizon-reset').hidden=!custom;$('#horizon-preset').value=state.case.scenario;
  $$('[data-horizon-company]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.horizonCompany===state.case.company)));
}
function apiStatus(message,tone='neutral'){$('#horizon-api-status').textContent=message;$('#horizon-api-status').dataset.tone=tone;}
function announce(message){clearTimeout(state.announcement);const revision=state.revision;state.announcement=setTimeout(()=>{if(revision===state.revision)$('#horizon-announcement').textContent=message;},200);}
function invalidate({preserveLocation=false}={}){
  state.revision++;state.controller?.abort();state.controller=null;state.snapshot=null;state.result=null;
  clearTimeout(state.announcement);$('#horizon-announcement').textContent='';
  $('#horizon-share-area').hidden=true;$('#horizon-portable-status').textContent='';
  $('#horizon-verify').innerHTML='Verify through the API <span aria-hidden="true">↗</span>';
  if(!preserveLocation&&/^#(?:horizon|scenario)=/.test(location.hash))history.replaceState(null,'',location.pathname+location.search);
  apiStatus('Inputs changed. Verify the current calculation again.');
}
function setActions(valid){
  for(const id of ['horizon-share','horizon-brief','horizon-json'])$(`#${id}`).disabled=!valid;
  $('#horizon-verify').disabled=!valid||Boolean(state.controller);
  if(!valid){$('#horizon-open-model').removeAttribute('href');$('#horizon-open-model').setAttribute('aria-disabled','true');$('#use-target-horizon').disabled=true;}
  $$('[data-evidence-key]').forEach(button=>{button.disabled=!valid||!state.evidence;});
}
function clearResults(message){
  document.body.dataset.horizonState='invalid';$('#horizon-error').textContent=message;$('#horizon-error').hidden=false;
  for(const id of ['horizon-ev','horizon-perpetuity','horizon-excluded','horizon-explicit','horizon-retained','horizon-reconciled']){const element=$(`#${id}`);element.textContent='—';element.dataset.value='';element.classList.remove('is-negative');}
  $('#horizon-chart').innerHTML='<p class="chart-placeholder">Complete the highlighted inputs to recalculate this horizon.</p>';
  $('#horizon-chart').setAttribute('aria-label','The horizon analysis is paused until all inputs are valid.');
  $('#horizon-target-result').innerHTML='<p>Complete the highlighted inputs.</p>';$('#horizon-target-result').dataset.status='invalid';
  $('#capture-90').textContent='—';$('#horizon-milestones').replaceChildren();$('#horizon-values-body').replaceChildren();$('#horizon-assumptions-body').replaceChildren();
  for(const [id,text] of Object.entries({
    'selected-ev-label':'Selected operating EV','selected-period':'Complete the current horizon.',
    'excluded-period':'Complete the current horizon.','retained-label':'Continuation retained',
    'retained-description':'Complete the current horizon to inspect the retained cash flows.',
    'reconcile-note':'The current analysis is paused.',
    'capture-description':'Complete the current inputs to calculate terminal present-value capture.',
    'assumptions-caption':'The current case’s inputs will appear when the analysis is valid.',
    'chart-range-note':'The horizon chart will appear when the analysis is valid.'
  }))$(`#${id}`).textContent=text;
  $('#target-legend').hidden=true;
  $('#horizon-interpretation').textContent='The current analysis is paused. Results and exports resume when the horizon and target are valid.';
  $('#economics-summary').textContent='Complete the current inputs to inspect this case.';$('#horizon-snapshot-detail').textContent='';
  $('#horizon-cutoff').textContent='Enter 0–100 whole continuation years.';$('#horizon-bridge-note').hidden=true;
  apiStatus('Calculation paused. Complete the highlighted inputs.','error');setActions(false);announce(message);
}
function readSnapshot(){
  const years=numeric($('#horizon-years')),target=numeric($('#horizon-target'));
  if(years===null||!Number.isInteger(years)||years<0||years>HORIZON_MAX_YEARS){$('#horizon-years').setAttribute('aria-invalid','true');throw new Error('Enter a whole continuation horizon from 0 to 100 years after 2036.');}
  if($('#horizon-target').validity.badInput||($('#horizon-target').value.trim()!==''&&(target===null||target<=0||target>1e12))){$('#horizon-target').setAttribute('aria-invalid','true');throw new Error('Enter a positive target operating EV up to $1,000,000,000,000B, or leave it blank.');}
  return normalizeHorizon({case:state.case,years,target});
}
function recalculate({preserveLocation=false}={}){
  if(!state.ready)return;
  invalidate({preserveLocation});$$('[aria-invalid="true"]').forEach(input=>input.removeAttribute('aria-invalid'));
  renderCaseSelection();
  try{
    const snapshot=readSnapshot(),result=valueHorizon(snapshot.case.assumptions,{years:snapshot.years,target:snapshot.target});
    state.snapshot=snapshot;state.result=result;document.body.dataset.horizonState='ready';$('#horizon-error').hidden=true;$('#horizon-error').textContent='';
    render();setActions(true);apiStatus('Calculated in this browser. Server verification is available.');
    announce(`${state.case.company}, ${isCustom()?'edited ':''}${state.case.scenario} case. ${snapshot.years} years after 2036. Operating enterprise value ${money(result.selected.ev)}. Later value excluded ${money(result.selected.excludedTerminalPv)}.`);
  }catch(error){clearResults(error.message||'This horizon could not be calculated.');}
}
function targetReadout(){
  const {targetRequirement:requirement,target}=state.result,element=$('#horizon-target-result'),button=$('#use-target-horizon');
  button.disabled=true;element.dataset.status=requirement?.status??'none';$('#target-legend').hidden=target===null;
  if(!requirement){element.innerHTML='<strong>No target selected</strong><p>Explore the curve, or enter an operating EV to test a requirement.</p>';return;}
  if(requirement.status==='finite'||requirement.status==='explicit'){
    const label=requirement.years===0?'Explicit forecast suffices':`${requirement.years.toLocaleString('en-US')} years`;
    const description=requirement.years===0?'The forecast through 2036 already reaches this target.':`Cash flows through ${requirement.throughYear.toLocaleString('en-US',{useGrouping:false})}. First whole year reaching ${money(target)}.`;
    element.innerHTML=`<strong>${escape(label)}</strong><p>${escape(description)}</p>${requirement.withinChart?'':`<p>${escape(requirement.reason)}</p>`}`;
    button.disabled=!requirement.withinChart;button.innerHTML=`Use ${requirement.years===0?'explicit-only':requirement.years+'-year'} horizon <span aria-hidden="true">↗</span>`;
  }else{
    const labels={asymptotic:'Perpetuity only',unreachable:'Beyond this case',beyond_range:'Beyond 10,000 years',precision_limit:'Precision limit'};
    element.innerHTML=`<strong>${labels[requirement.status]||'Unavailable'}</strong><p>${escape(requirement.reason)}</p>`;
    button.innerHTML='Use required horizon <span aria-hidden="true">↗</span>';
  }
}
function renderChart(){
  const {curve,baseline,selected,target}=state.result;
  // Normalize dollar coordinates before subtracting large signed magnitudes.
  const unit=Math.max(Math.abs(baseline.ev),Math.abs(baseline.pv_explicit),...curve.map(point=>Math.abs(point.ev)))||1;
  let low=Math.min(0,baseline.pv_explicit/unit),high=Math.max(0,baseline.ev/unit);
  const span=high-low||1;low-=span*.08;high+=span*.12;
  const width=860,height=316,left=62,right=17,top=24,bottom=47,plotWidth=width-left-right,plotHeight=height-top-bottom;
  const x=years=>left+plotWidth*years/100,scaledY=value=>top+(high-value)/(high-low)*plotHeight,y=value=>scaledY(value/unit);
  const px=value=>Number(value.toFixed(3));
  const points=curve.map(point=>`${px(x(point.years))},${px(y(point.ev))}`);
  const zeroY=y(0),ticks=Array.from({length:5},(_,i)=>low+(high-low)*i/4);
  const tickLabel=tick=>{
    const value=tick*unit;if(Number.isFinite(value))return amount(value,0);
    const exponent=Math.floor(Math.log10(unit)),coefficient=tick*(unit/(10**exponent));return `${coefficient.toFixed(1)}e+${exponent}`;
  };
  const horizontal=ticks.map(tick=>`<g><line class="chart-grid" x1="${left}" y1="${px(scaledY(tick))}" x2="${width-right}" y2="${px(scaledY(tick))}"/><text class="axis-label" x="${left-10}" y="${px(scaledY(tick)+3)}" text-anchor="end">${escape(tickLabel(tick))}</text></g>`).join('');
  const vertical=[0,20,40,60,80,100].map(year=>`<text class="axis-label" x="${px(x(year))}" y="${height-25}" text-anchor="middle">${year}</text>`).join('');
  const showTarget=target!==null&&target/unit>=low&&target/unit<=high;
  const targetLine=showTarget?`<line class="target-line" x1="${left}" y1="${px(y(target))}" x2="${width-right}" y2="${px(y(target))}"/>`:'';
  const selectionX=px(x(selected.years)),selectionY=px(y(selected.ev));
  const content=`<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><defs><linearGradient id="horizon-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#d5bc83" stop-opacity=".15"/><stop offset="100%" stop-color="#d5bc83" stop-opacity=".01"/></linearGradient></defs>${horizontal}<line x1="${left}" y1="${px(zeroY)}" x2="${width-right}" y2="${px(zeroY)}" stroke="#739085" stroke-width="1"/><polygon points="${left},${px(zeroY)} ${points.join(' ')} ${width-right},${px(zeroY)}" fill="url(#horizon-fill)"/>${targetLine}<line class="perpetual-line" x1="${left}" y1="${px(y(baseline.ev))}" x2="${width-right}" y2="${px(y(baseline.ev))}"/><polyline class="curve-path" points="${points.join(' ')}"/><line class="selection-line" x1="${selectionX}" y1="${top}" x2="${selectionX}" y2="${height-bottom}"/><circle cx="${selectionX}" cy="${selectionY}" r="8" fill="#ead09b" fill-opacity=".15"/><circle cx="${selectionX}" cy="${selectionY}" r="4" fill="#ead09b" stroke="#102333" stroke-width="1.3"/>${vertical}<text class="axis-label" x="${left}" y="12">EV / USD billions</text><text class="axis-label" x="${left+plotWidth/2}" y="${height-4}" text-anchor="middle">Whole years after 2036</text></svg>`;
  $('#horizon-chart').innerHTML=content;$('#horizon-chart').setAttribute('aria-label',`${state.case.company} operating enterprise value from zero through 100 continuation years. Explicit-only value ${money(baseline.pv_explicit)}. Selected ${selected.years}-year value ${money(selected.ev)}. Perpetual reference ${money(baseline.ev)}. The complete values are available in the table below.`);
  $('#chart-range-note').textContent=`The x-axis counts whole years after 2036. The perpetual reference is not a finite endpoint.${target!==null&&!showTarget?' The target is outside this chart’s value range; its requirement is shown alongside.':''}`;
}
function renderAssumptions(){
  $('#assumptions-caption').textContent=`${state.case.company} · ${state.case.scenario}${isCustom()?' with edited inputs':''}. Exact assumption values; evidence provides context for analyst or user inputs.`;
  $('#horizon-assumptions-body').innerHTML=EVIDENCE_FIELDS.map(field=>`<tr><th scope="row">${escape(field.label)}</th><td data-horizon-input="${field.key}">${escape(formatEvidenceValue(field.key,state.case.assumptions[field.key]))}</td><td><button type="button" data-evidence-key="${field.key}" aria-label="Evidence for ${escape(field.label)}"${state.evidence?'':' disabled'}>Inspect evidence <span aria-hidden="true">↗</span></button></td></tr>`).join('');
  $('#horizon-snapshot-detail').textContent=`${state.snapshot.years} continuation years after 2036. Target: ${state.snapshot.target===null?'none':money(state.snapshot.target)}. Research cutoff: ${state.research.researchCutoff}. The horizon changes no operating assumption.`;
  $('#horizon-values-body').innerHTML=state.result.curve.map(point=>`<tr${point.years===state.snapshot.years?' aria-current="true"':''}><th scope="row">${point.years}</th><td>${point.throughYear}</td><td>${escape(money(point.ev,4))}</td><td>${escape(money(point.retainedTerminalPv,4))}</td><td>${escape(money(point.excludedTerminalPv,4))}</td></tr>`).join('');
}
function render(){
  const {selected,baseline,capture,years}=state.result,custom=isCustom();
  for(const [id,value] of [['horizon-ev',selected.ev],['horizon-perpetuity',baseline.ev],['horizon-excluded',selected.excludedTerminalPv],['horizon-explicit',baseline.pv_explicit],['horizon-retained',selected.retainedTerminalPv],['horizon-reconciled',selected.ev]])metric(id,value);
  $('#selected-ev-label').textContent=years===0?'Retain only the explicit forecast':`Retain ${years} ${years===1?'year':'years'} after 2036`;
  $('#selected-period').textContent=`Cash flows through ${selected.throughYear}`;$('#excluded-period').textContent=`Cash flows after ${selected.throughYear}`;
  $('#horizon-cutoff').textContent=years===0?'No post-2036 cash flow is included. The explicit forecast stays intact.':`Retain 2037–${selected.throughYear}. No later cash flow or residual value is included.`;
  $('#retained-label').textContent=years===0?'No continuation retained':`Continuation / 2037–${selected.throughYear}`;
  $('#retained-description').textContent=years===0?'Zero post-2036 cash flow in this selected horizon.':'Present value of the selected annual continuation cash flows.';
  $('#reconcile-note').textContent='Forecast PV + retained continuation PV. Negative values remain signed.';
  $('#horizon-case-status').textContent=custom?`Edited inputs · based on ${state.case.scenario}`:`${state.case.scenario} preset · 13 explicit assumptions`;
  $('#horizon-reset').hidden=!custom;$('#horizon-preset').value=state.case.scenario;
  $$('[data-horizon-company]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.horizonCompany===state.case.company)));
  $$('[data-horizon-years]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.horizonYears)===years)));
  $('#horizon-range').value=String(years);$('#horizon-range').setAttribute('aria-valuetext',`${years} whole years after 2036; retain cash flows through ${selected.throughYear}`);
  const ninety=capture.find(item=>item.fraction===.9);
  $('#capture-90').textContent=ninety.status==='finite'?`${ninety.years.toLocaleString('en-US')} years`:ninety.status==='beyond_range'?'>10,000 years':ninety.status==='precision_limit'?'Precision limit':'Unavailable';
  $('#capture-description').textContent=ninety.status==='finite'?`Through ${ninety.throughYear}: the first whole year retaining at least 90% of terminal PV. This threshold describes present-value capture, not survival.`:ninety.reason;
  $('#horizon-milestones').innerHTML=capture.filter(item=>item.fraction!==.9).map(item=>`<span title="${escape(item.reason)}">${percent(item.fraction)} of terminal PV<strong>${item.status==='finite'?item.years.toLocaleString('en-US')+' years':item.status==='beyond_range'?'>10,000':item.status==='precision_limit'?'Precision limit':'Unavailable'}</strong></span>`).join('');
  const terminalContext=baseline.tv_share===null?`This case has nonpositive operating EV (${money(baseline.ev)}). Terminal concentration as a share of total EV is undefined.`:`${percent(baseline.tv_share)} of this case’s perpetual operating EV comes from cash flows after 2036.`;
  $('#horizon-interpretation').textContent=`${terminalContext} With ${years} continuation years retained, ${money(selected.excludedTerminalPv)} of later present value is excluded. All thirteen operating inputs stay fixed.`;
  const p=state.case.assumptions;
  $('#economics-summary').textContent=`This case carries a ${percent(p.m36)} terminal EBIT margin, ${percent(p.tg)} annual growth, ${percent(p.roic)} terminal return on invested capital and ${percent(p.wacc)} cost of capital. What evidence would support these economics over the chosen horizon?`;
  $('#horizon-open-model').href=scenarioUrl(new URL('./index.html',location.href).href,state.snapshot.case);$('#horizon-open-model').removeAttribute('aria-disabled');
  $('#horizon-bridge-note').hidden=state.case.bridge===null;
  targetReadout();renderChart();renderAssumptions();
}
function loadSnapshot(snapshot,{notice=null,preserveLocation=true}={}){
  const checked=normalizeHorizon(snapshot); // Complete preflight before changing current work.
  state.case=checked.case;$('#horizon-years').value=String(checked.years);$('#horizon-target').value=checked.target===null?'':String(checked.target);
  recalculate({preserveLocation});
  if(notice){$('#horizon-notice').textContent=notice;$('#horizon-notice').hidden=false;}
}
function loadHash(){
  const match=location.hash.match(/^#(horizon|scenario)=(.*)$/);if(!match)return false;
  try{
    const snapshot=match[1]==='horizon'?decodeHorizon(match[2]):{case:decodeScenario(match[2]),years:10,target:250};
    loadSnapshot(snapshot,{notice:match[1]==='horizon'?'Loaded the exact operating case, horizon and target from this link.':'Loaded the exact operating case from the Model. The horizon starts at 10 years with an illustrative $250B target.'});return true;
  }catch(error){$('#horizon-notice').textContent=`This link could not be loaded: ${error.message} The current case is retained.`;$('#horizon-notice').hidden=false;return false;}
}
function changePreset(company,scenario){
  state.case={company,scenario,assumptions:{...state.presets[company][scenario]},bridge:null};$('#horizon-notice').hidden=true;recalculate();
}
function download(content,name,type){
  const url=URL.createObjectURL(new Blob([content],{type})),anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function copyLink(){
  if(!state.snapshot)return;
  const revision=state.revision,url=horizonUrl(snapshotBase(),state.snapshot);$('#horizon-share-url').value=url;$('#horizon-share-area').hidden=false;
  try{
    if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(url);
    if(revision===state.revision)$('#horizon-portable-status').textContent='Copied the exact case, horizon and target link. No account or saved browser record is required.';
  }catch{if(revision===state.revision){$('#horizon-portable-status').textContent='The link is ready below. Select and copy it to reopen this exact analysis.';$('#horizon-share-url').focus();$('#horizon-share-url').select();}}
}
function exportAnalysis(format){
  if(!state.snapshot)return;
  try{
    const options={snapshot:state.snapshot,research:state.research,baseUrl:snapshotBase()},name=`Frontier_${state.case.company}_${state.case.scenario}${isCustom()?'_Edited':''}_Value_Horizon`;
    if(format==='html')download(createHorizonBrief(options),name+'.html','text/html;charset=utf-8');
    else download(JSON.stringify(createHorizonExport(options),null,2)+'\n',name+'.json','application/json;charset=utf-8');
    $('#horizon-portable-status').textContent=format==='html'?'Downloaded a script-free research brief with recalculated values, complete assumptions and an exact reopening link.':'Downloaded the complete horizon analysis with its exact snapshot, recalculated results and reopening link. This is a horizon export, separate from Casebook JSON.';
  }catch(error){$('#horizon-portable-status').textContent=`The export could not be created: ${error.message}`;}
}
function sameResult(actual,expected){
  if(typeof expected==='number')return typeof actual==='number'&&Number.isFinite(actual)&&Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected));
  if(expected===null||typeof expected!=='object')return actual===expected;
  if(actual===null||typeof actual!=='object'||Array.isArray(actual)!==Array.isArray(expected))return false;
  const keys=Object.keys(expected);return keys.length===Object.keys(actual).length&&keys.every(key=>Object.hasOwn(actual,key)&&sameResult(actual[key],expected[key]));
}
async function verify(){
  if(!state.snapshot||state.controller)return;
  const snapshot=state.snapshot,expected=state.result,revision=state.revision,controller=new AbortController();state.controller=controller;setActions(true);
  const timeout=setTimeout(()=>controller.abort(),10000);apiStatus('Comparing the complete curve, selected value, milestones and target requirement…');
  try{
    const response=await fetch('./api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'horizon',assumptions:snapshot.case.assumptions,years:snapshot.years,target:snapshot.target}),signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw new Error(`Server returned HTTP ${response.status}.`);
    const payload=await response.json();if(revision!==state.revision)return;
    if(payload.appVersion!==APP_VERSION||payload.modelVersion!==MODEL_VERSION||payload.valuationDate!==VALUATION_DATE||!sameResult(payload.result,expected))throw new Error('The server result or deployed version differs from this complete browser calculation.');
    apiStatus('Verified: the full curve, selected value, capture milestones and target requirement match the server.','success');$('#horizon-verify').textContent='Verified through the API ✓';
  }catch(error){if(revision===state.revision)apiStatus(error.name==='AbortError'?'Server verification timed out. The browser calculation remains available.':`Verification unavailable or failed: ${error.message} The browser calculation remains available.`,'error');}
  finally{clearTimeout(timeout);if(state.controller===controller){state.controller=null;setActions(Boolean(state.snapshot));}}
}
async function fetchJson(relative){const response=await fetch(relative,{cache:'no-cache'});if(!response.ok)throw new Error(`Could not load ${relative}.`);return response.json();}
function bind(){
  $('#horizon-years').addEventListener('input',()=>recalculate());
  $('#horizon-range').addEventListener('input',()=>{$('#horizon-years').value=$('#horizon-range').value;recalculate();});
  $('#horizon-target').addEventListener('input',()=>recalculate());
  $$('[data-horizon-years]').forEach(button=>button.addEventListener('click',()=>{$('#horizon-years').value=button.dataset.horizonYears;recalculate();}));
  $$('[data-horizon-company]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.horizonCompany!==state.case.company)changePreset(button.dataset.horizonCompany,state.case.scenario);}));
  $('#horizon-preset').addEventListener('change',()=>changePreset(state.case.company,$('#horizon-preset').value));
  $('#horizon-reset').addEventListener('click',()=>changePreset(state.case.company,state.case.scenario));
  $('#use-target-horizon').addEventListener('click',()=>{const requirement=state.result?.targetRequirement;if(!requirement?.withinChart)return;$('#horizon-years').value=String(requirement.years);recalculate();});
  $('#horizon-share').addEventListener('click',copyLink);$('#horizon-brief').addEventListener('click',()=>exportAnalysis('html'));$('#horizon-json').addEventListener('click',()=>exportAnalysis('json'));$('#horizon-verify').addEventListener('click',verify);
  document.addEventListener('click',event=>{const button=event.target.closest('button[data-evidence-key]');if(!button||button.disabled||!state.evidence||!state.snapshot)return;try{state.evidence.open({company:state.case.company,key:button.dataset.evidenceKey,cases:[{label:`${state.case.scenario}${isCustom()?' · edited inputs':''}`,assumptions:state.case.assumptions}]});}catch(error){$('#horizon-notice').textContent=`Evidence could not open: ${error.message}`;$('#horizon-notice').hidden=false;}});
  window.addEventListener('hashchange',()=>{if(state.ready)loadHash();});
}
async function initialize(){
  try{
    const [presets,research]=await Promise.all([fetchJson('./data/presets.json'),fetchJson('./data/research.json')]);
    if(research.modelVersion!==MODEL_VERSION||research.asOf!==VALUATION_DATE)throw new Error('The company research does not match this financial engine.');
    state.presets=presets;state.research=research;state.case={company:'Anthropic',scenario:'Base',assumptions:{...presets.Anthropic.Base},bridge:null};
    // Check the dated default before enabling the interactive controls.
    normalizeHorizon({case:state.case,years:10,target:250});
    state.ready=true;bind();
    for(const selector of ['#horizon-years','#horizon-range','#horizon-target','#horizon-preset','[data-horizon-company]','[data-horizon-years]'])$$(selector).forEach(element=>{element.disabled=false;});
    recalculate({preserveLocation:true});loadHash();
    $('#horizon-version').textContent=`Application ${APP_VERSION} · Financial engine ${MODEL_VERSION}. Developed with AI assistance. Dated, illustrative analysis.`;
    try{const catalog=await fetchJson('./data/evidence.json');state.evidence=createEvidenceContext({research,catalog});setActions(Boolean(state.snapshot));}
    catch{$$('[data-evidence-key]').forEach(button=>{button.disabled=true;button.title='Contextual evidence could not load. The Evidence page retains the source register.';});}
  }catch(error){state.ready=false;clearResults(`The horizon workspace could not load: ${error.message} Reload to try again, or open the research report.`);}
}
initialize();
