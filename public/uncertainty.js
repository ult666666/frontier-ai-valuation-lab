import {APP_VERSION} from './lib/release.js';
import {MODEL_VERSION,VALUATION_DATE} from './lib/model.js';
import {simulateValuation,UNCERTAINTY_DRIVERS,UNCERTAINTY_LIMITS,UNCERTAINTY_VERSION} from './lib/uncertainty.js';
import {distributionChart,tornadoChart,uncertaintyMoney as money,uncertaintyPercent as percent,measureLabel} from './lib/uncertainty-chart.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PERCENT_KEYS=new Set(['m36','wacc','tg','dilution']);
const SHAPES=[['triangular','Triangular'],['uniform','Uniform'],['normal','Truncated normal']];
// Illustrative analyst assumptions, labelled as such in the panel.
const DEFAULT_CORRELATION=Object.freeze({'growth:m36':.4,'wacc:tg':.3});
const DEFAULTS=Object.freeze({draws:10000,seed:20261018,hurdle:300});

function displayNumber(key,value){
  const shown=PERCENT_KEYS.has(key)?value*100:value;
  return String(Number(shown.toPrecision(12)));
}
export function formatDriverValue(key,value){
  if(typeof value!=='number'||!Number.isFinite(value))return '–';
  return key==='growth'?`×${value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:3})}`:percent(value,PERCENT_KEYS.has(key)&&Math.abs(value)<.1?2:1);
}

/** Ranges centred on the current case. They are starting points, not estimates. */
export function suggestedDistributions(assumptions){
  const m36=assumptions.m36,wacc=assumptions.wacc,tg=assumptions.tg;
  const marginLow=Math.max(m36-.06,m36/2),marginHigh=Math.min(1,m36+.06);
  return {
    growth:{type:'triangular',min:.7,mode:1,max:1.3},
    m36:{type:'triangular',min:marginLow,mode:m36,max:marginHigh},
    wacc:{type:'normal',mean:wacc,sd:.015,min:Math.max(0,wacc-.03),max:Math.min(.6,wacc+.03)},
    tg:{type:'triangular',min:Math.max(0,tg-.01),mode:tg,max:tg+.01},
    dilution:{type:'triangular',min:0,mode:.02,max:.08}
  };
}

export function createUncertaintyPanel({getCase}){
  const root=document.getElementById('uncertainty-panel');
  const rows=UNCERTAINTY_DRIVERS.map(driver=>{
    const unit=driver.key==='growth'?'× case growth rates':'%';
    return `<tr data-uncertainty-driver="${driver.key}">
      <td><input type="checkbox" id="uq-${driver.key}-on" data-uq-field="on"${driver.key==='dilution'?'':' checked'} aria-describedby="uq-${driver.key}-detail"></td>
      <th scope="row"><label for="uq-${driver.key}-on">${escape(driver.label)}</label><span id="uq-${driver.key}-detail" class="uq-driver-detail">${escape(driver.detail)}</span></th>
      <td data-uq-base>–</td>
      <td><select id="uq-${driver.key}-type" data-uq-field="type" aria-label="${escape(driver.label)} distribution shape">${SHAPES.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></td>
      <td><input id="uq-${driver.key}-min" data-uq-field="min" type="number" step="any" inputmode="decimal" aria-label="${escape(driver.label)} low, ${unit}"></td>
      <td><input id="uq-${driver.key}-mid" data-uq-field="mid" type="number" step="any" inputmode="decimal" aria-label="${escape(driver.label)} most likely or mean, ${unit}"></td>
      <td><input id="uq-${driver.key}-max" data-uq-field="max" type="number" step="any" inputmode="decimal" aria-label="${escape(driver.label)} high, ${unit}"></td>
      <td><input id="uq-${driver.key}-sd" data-uq-field="sd" type="number" step="any" min="0" inputmode="decimal" aria-label="${escape(driver.label)} standard deviation, ${unit}"></td>
    </tr>`;
  }).join('');
  root.innerHTML=`<form id="uq-form" class="uq-form" novalidate aria-label="Monte Carlo driver distributions">
    <p id="uq-measure" class="uq-measure"></p>
    <p id="uq-drivers-note" class="small-note">Percent fields are entered in percent. The growth path multiplies every 2027–2036 growth rate. Low and high bound every shape; triangular uses the middle value as its mode, truncated normal as its mean.</p>
    <div class="table-scroll uq-table-scroll" tabindex="0" role="region" aria-label="Driver distributions">
      <table class="uq-drivers" aria-describedby="uq-drivers-note"><caption class="sr-only">Driver distributions</caption>
      <thead><tr><th scope="col">Use</th><th scope="col">Driver</th><th scope="col">Case value</th><th scope="col">Shape</th><th scope="col">Low</th><th scope="col">Mode / mean</th><th scope="col">High</th><th scope="col">Std. dev.</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>
    <fieldset class="uq-correlation"><legend>Correlation of the drivers’ normal scores</legend>
      <p class="small-note">Enter the upper triangle; the lower triangle mirrors it. The matrix must be positive semidefinite. Defaults are illustrative: growth with margin +0.4, discount rate with terminal growth +0.3.</p>
      <div id="uq-correlation" class="table-scroll" tabindex="0" role="region" aria-label="Correlation matrix inputs"></div>
    </fieldset>
    <div class="uq-run-row">
      <div><label for="uq-draws">Draws <span>${UNCERTAINTY_LIMITS.minDraws}–${UNCERTAINTY_LIMITS.maxDraws.toLocaleString('en-US')}</span></label><input id="uq-draws" type="number" min="${UNCERTAINTY_LIMITS.minDraws}" max="${UNCERTAINTY_LIMITS.maxDraws}" step="1" inputmode="numeric" value="${DEFAULTS.draws}"></div>
      <div><label for="uq-seed">Seed <span>0–4,294,967,295</span></label><input id="uq-seed" type="number" min="0" max="4294967295" step="1" inputmode="numeric" value="${DEFAULTS.seed}"></div>
      <div><label for="uq-hurdle">Hurdle value <span>USD bn · optional</span></label><input id="uq-hurdle" type="number" step="any" inputmode="decimal" value="${DEFAULTS.hurdle}"></div>
      <button id="uq-run" type="submit" class="button button-dark" disabled>Run simulation <span aria-hidden="true">→</span></button>
    </div>
    <div class="uq-form-actions"><button id="uq-suggest" type="button" class="text-button">Reset to suggested ranges <span aria-hidden="true">↺</span></button><button id="uq-collapse" type="button" class="text-button">Set every spread to zero <span aria-hidden="true">→</span></button></div>
  </form>
  <p id="uq-error" class="uq-error" role="alert" hidden></p>
  <p id="uq-status" class="uq-status" role="status">Complete the model assumptions to run a simulation.</p>
  <div id="uq-results" class="uq-results" hidden>
    <div class="uq-metrics">
      ${['p5','p25','p50','p75','p95'].map(key=>`<div class="uq-metric${key==='p50'?' is-median':''}"><span>${key.toUpperCase()}</span><strong data-uncertainty-metric="${key}">–</strong></div>`).join('')}
      <div class="uq-metric"><span>Mean ± standard error</span><strong data-uncertainty-metric="mean">–</strong></div>
      <div class="uq-metric"><span id="uq-hurdle-label">Share above hurdle</span><strong data-uncertainty-metric="hurdle">–</strong></div>
    </div>
    <div class="uq-figure"><div id="uq-distribution-chart" class="uq-chart-wrap" tabindex="0" role="region" aria-label="Distribution chart"></div>
      <details class="uq-data"><summary>Distribution table <span class="summary-hint">Percentiles and every histogram bin</span></summary><div id="uq-distribution-table" class="table-scroll" tabindex="0" role="region" aria-label="Simulated distribution table"></div></details></div>
    <div class="uq-figure"><h4 class="uq-subheading">Which driver moves the value most?</h4><div id="uq-tornado-chart" class="uq-chart-wrap" tabindex="0" role="region" aria-label="Tornado chart"></div>
      <details class="uq-data"><summary>Tornado table <span class="summary-hint">Values at each driver’s P10 and P90</span></summary><div id="uq-tornado-table" class="table-scroll" tabindex="0" role="region" aria-label="Tornado sensitivity table"></div></details></div>
    <div class="uq-diagnostics"><h4 class="uq-subheading">Is the simulation precise enough?</h4><div id="uq-diagnostics"></div></div>
    <ul id="uq-warnings" class="uq-warnings" hidden></ul>
    <div class="uq-actions"><button id="uq-verify" type="button" class="button button-outline">Verify on server <span aria-hidden="true">↗</span></button><button id="uq-export" type="button" class="button button-outline">Simulation JSON <span aria-hidden="true">↓</span></button></div>
    <p id="uq-api-status" class="uq-api-status" data-state="idle" role="status">Calculated in your browser. The server can rerun the same seed.</p>
  </div>
  <details class="uq-method"><summary>Method and limits</summary>
    <p>Each draw turns uniform random numbers from a seeded xoshiro128** generator into correlated normal scores with a Cholesky factor of your correlation matrix, maps them to your bounded distributions (a Gaussian copula) and values the case with the same FCFF engine as the rest of the Model. Every corner of the ranges you enter must pass the model’s validation, so no draw is clipped or discarded.</p>
    <p>The tornado moves one driver at a time between its own 10th and 90th percentiles. Results describe the distributions you entered. They are not forecasts, calibrated probabilities, valuations of either company or investment advice.</p>
    <p><a href="https://github.com/ult666666/frontier-ai-valuation-lab/blob/main/docs/UNCERTAINTY.md" target="_blank" rel="noopener noreferrer">Complete method, references and limits <span aria-hidden="true">↗</span><span class="sr-only"> (opens in a new tab)</span></a></p>
  </details>`;
  const $=selector=>root.querySelector(selector);
  const exact=new Map();
  let current=null,suggestedFor='',edited=false,result=null,spec=null,revision=0,controller=null;

  function setInput(input,key,value){
    const shown=displayNumber(key,value);
    input.value=shown;exact.set(input.id,{display:shown,value});
  }
  function readInput(input,key){
    const raw=input.value.trim();
    if(raw===''||input.validity.badInput)return null;
    const loaded=exact.get(input.id);
    if(loaded&&loaded.display===input.value)return loaded.value;
    const number=Number(raw);
    if(!Number.isFinite(number))return null;
    return PERCENT_KEYS.has(key)?number/100:number;
  }
  function caseLabel(){return `${current.company} · ${current.scenario}${current.custom?' (edited)':''}`;}
  function row(key){return root.querySelector(`[data-uncertainty-driver="${key}"]`);}
  function field(key,name){return row(key).querySelector(`[data-uq-field="${name}"]`);}
  function syncShape(key){
    const type=field(key,'type').value,sd=field(key,'sd'),mid=field(key,'mid');
    sd.disabled=type!=='normal'||!field(key,'on').checked;mid.disabled=type==='uniform'||!field(key,'on').checked;
  }
  function loadDistribution(key,d){
    field(key,'type').value=d.type;
    setInput(field(key,'min'),key,d.min);setInput(field(key,'max'),key,d.max);
    if(d.type==='triangular')setInput(field(key,'mid'),key,d.mode);
    else if(d.type==='normal')setInput(field(key,'mid'),key,d.mean);
    else field(key,'mid').value='';
    if(d.type==='normal')setInput(field(key,'sd'),key,d.sd);else field(key,'sd').value='';
    syncShape(key);
  }
  function enabledKeys(){return UNCERTAINTY_DRIVERS.map(driver=>driver.key).filter(key=>field(key,'on').checked&&!field(key,'on').disabled);}
  function correlationValue(a,b){
    const input=root.querySelector(`[data-uq-pair="${a}:${b}"]`)||root.querySelector(`[data-uq-pair="${b}:${a}"]`);
    return input?readInput(input,'correlation'):null;
  }
  function renderCorrelation(){
    const keys=enabledKeys(),previous=new Map([...root.querySelectorAll('[data-uq-pair]')].map(input=>[input.dataset.uqPair,input.value]));
    const label=key=>UNCERTAINTY_DRIVERS.find(driver=>driver.key===key).label;
    if(keys.length<2){$('#uq-correlation').innerHTML='<p class="small-note">Include at least two drivers to correlate them.</p>';return;}
    $('#uq-correlation').innerHTML=`<table class="uq-matrix"><caption class="sr-only">Correlation matrix. Upper-triangle cells are editable; lower-triangle cells mirror them.</caption><thead><tr><td></td>${keys.map(key=>`<th scope="col">${escape(label(key))}</th>`).join('')}</tr></thead><tbody>${keys.map((a,i)=>`<tr><th scope="row">${escape(label(a))}</th>${keys.map((b,j)=>{
      if(i===j)return '<td class="uq-diagonal">1</td>';
      if(j<i)return `<td class="uq-mirror" data-uq-mirror="${b}:${a}" aria-label="Mirrors ${escape(label(b))} with ${escape(label(a))}">–</td>`;
      const value=previous.get(`${a}:${b}`)??String(DEFAULT_CORRELATION[`${a}:${b}`]??DEFAULT_CORRELATION[`${b}:${a}`]??0);
      return `<td><input type="number" min="-1" max="1" step="0.05" inputmode="decimal" data-uq-pair="${a}:${b}" value="${escape(value)}" aria-label="Correlation of ${escape(label(a))} with ${escape(label(b))}"></td>`;
    }).join('')}</tr>`).join('')}</tbody></table>`;
    syncMirrors();
  }
  function syncMirrors(){
    for(const cell of root.querySelectorAll('[data-uq-mirror]')){const [a,b]=cell.dataset.uqMirror.split(':');const value=correlationValue(a,b);cell.textContent=value===null?'–':String(value);}
  }
  function suggest(){
    if(!current)return;
    const suggested=suggestedDistributions(current.assumptions);
    for(const driver of UNCERTAINTY_DRIVERS)loadDistribution(driver.key,suggested[driver.key]);
    for(const input of root.querySelectorAll('[data-uq-pair]')){const [a,b]=input.dataset.uqPair.split(':');input.value=String(DEFAULT_CORRELATION[`${a}:${b}`]??DEFAULT_CORRELATION[`${b}:${a}`]??0);}
    syncMirrors();suggestedFor=JSON.stringify(current.assumptions);edited=false;
  }
  function collapse(){
    if(!current)return;
    for(const key of enabledKeys()){
      const base=key==='growth'?1:key==='dilution'?0:current.assumptions[key];
      loadDistribution(key,{type:'triangular',min:base,mode:base,max:base});
    }
    edited=true;
  }
  function readSpec(){
    if(!current)throw new Error('Complete the model assumptions and any enabled bridge first.');
    const keys=enabledKeys();
    if(!keys.length)throw new Error('Include at least one driver.');
    const drivers=keys.map(key=>{
      const label=UNCERTAINTY_DRIVERS.find(driver=>driver.key===key).label,type=field(key,'type').value;
      const read=name=>{const value=readInput(field(key,name),key);if(value===null)throw new Error(`Enter a number for the ${label.toLowerCase()} ${name==='mid'?(type==='normal'?'mean':'mode'):name==='sd'?'standard deviation':name==='min'?'low':'high'} value.`);return value;};
      const min=read('min'),max=read('max');
      const distribution=type==='uniform'?{type,min,max}:type==='triangular'?{type,min,mode:read('mid'),max}:{type,mean:read('mid'),sd:read('sd'),min,max};
      return {key,distribution};
    });
    const correlation=keys.length<2?null:keys.map(a=>keys.map(b=>{
      if(a===b)return 1;
      const value=correlationValue(a,b);
      if(value===null)throw new Error('Enter every correlation as a number from −1 to 1.');
      return value;
    }));
    const integer=(id,label)=>{const raw=$(id).value.trim(),value=Number(raw);if(raw===''||!Number.isInteger(value))throw new Error(`${label} must be a whole number.`);return value;};
    const hurdleRaw=$('#uq-hurdle').value.trim(),hurdle=hurdleRaw===''?null:Number(hurdleRaw);
    if(hurdle!==null&&!Number.isFinite(hurdle))throw new Error('Enter the hurdle as a number of USD billions, or leave it blank.');
    return {assumptions:{...current.assumptions},bridge:current.bridge?{...current.bridge}:null,drivers,correlation,draws:integer('#uq-draws','Draws'),seed:integer('#uq-seed','Seed'),hurdle};
  }
  function apiStatus(text,state='idle'){$('#uq-api-status').textContent=text;$('#uq-api-status').dataset.state=state;}
  function invalidate(message){
    revision++;controller?.abort();controller=null;result=null;spec=null;
    $('#uq-results').hidden=true;root.dataset.uncertaintyState='idle';
    if(message)$('#uq-status').textContent=message;
  }
  function showError(message){$('#uq-error').textContent=message;$('#uq-error').hidden=!message;}
  function updateBaseCells(){
    for(const driver of UNCERTAINTY_DRIVERS){
      const base=!current?null:driver.key==='growth'?1:driver.key==='dilution'?0:current.assumptions[driver.key];
      row(driver.key).querySelector('[data-uq-base]').textContent=base===null?'–':formatDriverValue(driver.key,base);
    }
    const dilution=field('dilution','on'),bridge=Boolean(current?.bridge);
    dilution.disabled=!bridge;if(!bridge)dilution.checked=false;
    row('dilution').classList.toggle('is-unavailable',!bridge);
    row('dilution').title=bridge?'':'Enable the hypothetical equity bridge below to model dilution of equity value.';
    for(const driver of UNCERTAINTY_DRIVERS){const on=field(driver.key,'on').checked&&!field(driver.key,'on').disabled;for(const name of ['type','min','mid','max','sd'])field(driver.key,name).disabled=!on;syncShape(driver.key);}
    $('#uq-measure').textContent=current?`Measure: ${measureLabel(current.bridge?'equity-value':'operating-ev')}${current.bridge?' (operating EV + cash − debt − other claims, from the hypothetical bridge below)':''} for ${caseLabel()}. USD billions.`:'';
    $('#uq-run').disabled=!current;
  }
  function table(head,body,caption){return `<table class="uq-table"><caption>${escape(caption)}</caption><thead><tr>${head.map(cell=>`<th scope="col">${escape(cell)}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table>`;}
  function render(){
    const r=result,subject=caseLabel();
    for(const key of ['p5','p25','p50','p75','p95']){const node=root.querySelector(`[data-uncertainty-metric="${key}"]`);node.textContent=money(r.summary.percentiles[key]);node.dataset.value=String(r.summary.percentiles[key]);}
    const mean=root.querySelector('[data-uncertainty-metric="mean"]');mean.textContent=`${money(r.summary.mean)} ± ${money(r.convergence.standardError,2)}`;mean.dataset.value=String(r.summary.mean);
    const hurdle=root.querySelector('[data-uncertainty-metric="hurdle"]');
    if(r.hurdle){$('#uq-hurdle-label').textContent=`Share above ${money(r.hurdle.value)}`;hurdle.textContent=`${percent(r.hurdle.probabilityAbove)} (95%: ${percent(r.hurdle.interval95[0])}–${percent(r.hurdle.interval95[1])})`;hurdle.dataset.value=String(r.hurdle.probabilityAbove);}
    else{$('#uq-hurdle-label').textContent='Share above hurdle';hurdle.textContent='No hurdle set';delete hurdle.dataset.value;}
    $('#uq-distribution-chart').innerHTML=distributionChart(r,{subject});
    $('#uq-tornado-chart').innerHTML=tornadoChart(r,{subject,format:formatDriverValue});
    const percentileRows=Object.entries(r.summary.percentiles).map(([key,value])=>`<tr><th scope="row">${key.toUpperCase()}</th><td>${money(value,2)}</td></tr>`);
    percentileRows.push(`<tr><th scope="row">Mean</th><td>${money(r.summary.mean,2)}</td></tr><tr><th scope="row">Minimum / maximum</th><td>${money(r.summary.min,2)} / ${money(r.summary.max,2)}</td></tr><tr><th scope="row">Deterministic case</th><td>${money(r.base.value,2)}</td></tr>`);
    const binRows=[`<tr><th scope="row">Below ${money(r.histogram.lower,1)}</th><td>${r.histogram.below.toLocaleString('en-US')}</td><td>${percent(r.histogram.below/r.sampling.draws,2)}</td></tr>`,...r.histogram.bins.map(bin=>`<tr><th scope="row">${money(bin.lower,1)} to ${money(bin.upper,1)}</th><td>${bin.count.toLocaleString('en-US')}</td><td>${percent(bin.count/r.sampling.draws,2)}</td></tr>`),`<tr><th scope="row">Above ${money(r.histogram.upper,1)}</th><td>${r.histogram.above.toLocaleString('en-US')}</td><td>${percent(r.histogram.above/r.sampling.draws,2)}</td></tr>`];
    $('#uq-distribution-table').innerHTML=table(['Statistic','Value'],percentileRows,`${measureLabel(r.measure)} across ${r.sampling.draws.toLocaleString('en-US')} draws, USD billions. Percentiles use linear interpolation between order statistics.`)+table(['Range','Draws','Share'],binRows,'Histogram bins between the 1st and 99th percentiles. Each bin includes its lower edge; the last bin also includes its upper edge.');
    $('#uq-tornado-table').innerHTML=table(['Driver','P10','P90','Value at P10','Value at P90','Swing'],r.tornado.bars.map(bar=>`<tr data-uncertainty-tornado-row="${escape(bar.key)}"><th scope="row">${escape(bar.label)}</th><td>${formatDriverValue(bar.key,bar.p10)}</td><td>${formatDriverValue(bar.key,bar.p90)}</td><td>${money(bar.valueAtP10,2)}</td><td>${money(bar.valueAtP90,2)}</td><td>${money(bar.swing,2)}</td></tr>`),`Largest swing first. Other drivers stay at the case value of ${money(r.tornado.base,2)}.`);
    const stability=r.convergence.stability;
    const relative=stability.relativeRange===null?'unavailable':percent(stability.relativeRange,2);
    const region=(label,html)=>`<div class="table-scroll" tabindex="0" role="region" aria-label="${escape(label)}">${html}</div>`;
    $('#uq-diagnostics').innerHTML=`<p class="uq-stability" data-uncertainty-stability="${stability.status}"><strong>${stability.status==='stable'?'Median stable across seeds':stability.status==='unstable'?'Median not yet stable':'Median stability unavailable'}.</strong> Five seeds give medians within ${money(stability.range,2)}, ${relative} of the primary median; the tolerance is ${percent(stability.tolerance,0)}. Standard error of the mean: ${money(r.convergence.standardError,2)}${r.convergence.relativeStandardError===null?'':` (${percent(r.convergence.relativeStandardError,2)} of the mean)`}.</p><div class="uq-diagnostic-grid">`+
      region('Median for each seed',table(['Seed','P50'],stability.seeds.map((seed,i)=>`<tr><th scope="row">${seed}${i===0?' (primary)':''}</th><td>${money(stability.p50[i],2)}</td></tr>`),'Same number of draws for each of five seeds.'))+
      region('Percentiles as draws accumulate',table(['First draws','P5','P50','P95','Mean','Std. error'],r.convergence.prefixes.map(prefix=>`<tr><th scope="row">${prefix.draws.toLocaleString('en-US')}</th><td>${money(prefix.p5,1)}</td><td>${money(prefix.p50,1)}</td><td>${money(prefix.p95,1)}</td><td>${money(prefix.mean,1)}</td><td>${money(prefix.standardError,2)}</td></tr>`),'Percentiles from growing prefixes of the primary stream.'))+'</div>'+
      (r.drivers.length>1?region('Requested and achieved correlation',table(['Pair','Requested','Achieved'],r.drivers.flatMap((a,i)=>r.drivers.slice(i+1).map((b,offset)=>{const j=i+1+offset;return `<tr><th scope="row">${escape(a.label)} · ${escape(b.label)}</th><td>${r.correlation.requested[i][j].toFixed(3)}</td><td>${r.correlation.achieved[i][j].toFixed(3)}</td></tr>`;})),`Correlation of the latent normal scores in the primary draws. Largest deviation: ${r.correlation.maxAbsoluteDeviation.toFixed(3)}.`)):'');
    $('#uq-warnings').innerHTML=r.warnings.map(text=>`<li>${escape(text)}</li>`).join('');$('#uq-warnings').hidden=!r.warnings.length;
    $('#uq-results').hidden=false;$('#uq-verify').disabled=false;root.dataset.uncertaintyState='ready';
  }
  async function run(event){
    event?.preventDefault();showError('');
    let next;
    try{next=readSpec();}catch(error){invalidate('Simulation paused until the inputs are complete.');showError(error.message);return;}
    invalidate(`Running ${next.draws.toLocaleString('en-US')} draws for five seeds…`);
    const mine=revision;root.dataset.uncertaintyState='running';$('#uq-run').disabled=true;
    await new Promise(resolve=>setTimeout(resolve,20)); // let the running state paint
    if(mine!==revision)return;
    try{
      const started=performance.now(),computed=simulateValuation(next),seconds=(performance.now()-started)/1000;
      if(mine!==revision)return;
      result=computed;spec=next;render();
      $('#uq-status').textContent=`Calculated in your browser in ${seconds.toFixed(1)} s · seed ${next.seed} · ${next.draws.toLocaleString('en-US')} draws × 5 seeds.`;
      apiStatus('Calculated in your browser. The server can rerun the same seed.');
    }catch(error){invalidate('Simulation paused until the inputs are valid.');showError(error.message);}
    finally{if(mine===revision||!result)$('#uq-run').disabled=!current;}
  }
  async function verify(){
    if(!result||!spec)return;
    const mine=revision,expected=JSON.stringify(result),request={action:'simulate',...spec};
    controller?.abort();controller=new AbortController();const own=controller;
    $('#uq-verify').disabled=true;apiStatus('Asking the server to rerun the same seed…','pending');
    const timeout=setTimeout(()=>own.abort(),20000);
    try{
      const response=await fetch(new URL('./api/valuation',import.meta.url),{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(request),signal:own.signal});
      if(mine!==revision)return;
      if(!response.ok){apiStatus(`Server verification unavailable (HTTP ${response.status}). The browser result remains available.`,'warning');return;}
      const payload=await response.json();
      if(mine!==revision)return;
      if(payload.modelVersion!==MODEL_VERSION||payload.valuationDate!==VALUATION_DATE||payload.result?.version!==UNCERTAINTY_VERSION){apiStatus('Server versions differ from this page. The result is not verified.','error');return;}
      if(JSON.stringify(payload.result)!==expected){apiStatus('The server result differs from the browser result. Verification failed.','error');return;}
      apiStatus(`Server result identical: every field matches the browser bit for bit (seed ${spec.seed}).`,'success');
    }catch(error){if(mine===revision)apiStatus(error.name==='AbortError'?'Server check timed out. The browser result remains available.':'Server verification is unavailable on this host. The browser result remains available.','warning');}
    finally{clearTimeout(timeout);if(controller===own)controller=null;if(mine===revision)$('#uq-verify').disabled=false;}
  }
  function exportJson(){
    if(!result||!spec)return;
    const record={kind:'frontier-uncertainty-simulation',schema:1,appVersion:APP_VERSION,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,uncertaintyVersion:UNCERTAINTY_VERSION,company:current.company,scenario:current.scenario,request:{action:'simulate',...spec},result};
    const blob=new Blob([JSON.stringify(record,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`Frontier_${current.company}_${current.scenario}_Simulation_seed-${spec.seed}.json`;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function edited_(){edited=true;invalidate('Inputs changed. Run the simulation to update the results.');}
  root.addEventListener('input',event=>{
    if(event.target.matches('[data-uq-pair]'))syncMirrors();
    if(event.target.matches('[data-uq-field="on"]')){updateBaseCells();renderCorrelation();}
    if(event.target.matches('[data-uq-field="type"]'))syncShape(event.target.closest('[data-uncertainty-driver]').dataset.uncertaintyDriver);
    showError('');edited_();
  });
  $('#uq-form').addEventListener('submit',run);
  $('#uq-suggest').addEventListener('click',()=>{suggest();showError('');invalidate('Suggested ranges restored. Run the simulation to see the results.');});
  $('#uq-collapse').addEventListener('click',()=>{collapse();showError('');invalidate('Every included driver now has zero spread at the case value. Run to reproduce the deterministic case.');});
  $('#uq-verify').addEventListener('click',verify);
  $('#uq-export').addEventListener('click',exportJson);

  /** Called by the Model whenever its assumptions or bridge change. */
  function refresh(){
    let next=null;
    try{next=getCase();}catch{next=null;}
    const changed=JSON.stringify(next)!==JSON.stringify(current);
    current=next;
    if(current&&(!edited||!suggestedFor)&&JSON.stringify(current.assumptions)!==suggestedFor)suggest();
    updateBaseCells();renderCorrelation();
    if(changed)invalidate(current?(result?'The case changed. Run the simulation again.':'Ready. Run the simulation for the current case.'):'Complete the model assumptions and any enabled bridge to run a simulation.');
  }
  return {refresh};
}
