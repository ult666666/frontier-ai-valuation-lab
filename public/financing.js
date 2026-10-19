import {APP_VERSION} from './lib/release.js';
import {MODEL_VERSION,VALUATION_DATE} from './lib/model.js';
import {financingLens,FINANCING_MAX_AMOUNT} from './lib/financing.js';
import {normalizeFinancing,financingUrl} from './lib/financing-share.js';
import {createFinancingExport,createFinancingBrief} from './lib/financing-brief.js';
import {financingNumber as number,financingMoney as money,financingPercent as percent,financingPercentagePoints as pp} from './lib/financing-format.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const metric=(name,label,extra='')=>`<div class="financing-metric ${extra}"><span>${label}</span><strong data-financing-metric="${name}">—</strong></div>`;
const DEFAULT_ROUND=Object.freeze({basis:'pre',quote:250,primaryCapital:25,holderStake:.1});

function sameResult(a,b){
  if(typeof a!==typeof b)return false;
  if(typeof a==='number')return finite(a)&&finite(b)&&(a===b||(a!==0&&b!==0&&Math.abs(a-b)<=1e-12*Math.max(Math.abs(a),Math.abs(b))));
  if(a===null||b===null||typeof a!=='object')return a===b;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&sameResult(a[key],b[key]));
}

export function createFinancingLens({getCase,onOpenCase,getPresets,onTermsEdited}){
  const root=document.getElementById('financing-lens');
  root.innerHTML=`<div id="financing-details">
    <div class="financing-part-heading"><div><span class="eyebrow">02 / A hypothetical primary round</span><h4>One headline. Two possible meanings.</h4></div><span class="financing-assumption-label">Assumed terms</span></div>
    <p class="financing-description">Enter a financing quote and its basis. The quote is your scenario input; it is separate from the operating model’s value.</p>
    <form id="financing-form" class="financing-form" novalidate aria-label="Hypothetical financing round">
      <div><label for="financing-basis">Interpret the quote as</label><select id="financing-basis"><option value="pre">Pre-money · before new capital</option><option value="post">Post-money · including new capital</option></select></div>
      <div><label for="financing-quote">Financing quote <span>USD bn</span></label><input id="financing-quote" type="number" min="0" max="1000000000000" step="any" inputmode="decimal" value="250" aria-describedby="financing-input-note"></div>
      <div><label for="financing-capital">New primary capital <span>USD bn</span></label><input id="financing-capital" type="number" min="0" max="1000000000000" step="any" inputmode="decimal" value="25" aria-describedby="financing-input-note"></div>
      <div><label for="financing-stake">Tracked holder before <span>% ownership</span></label><input id="financing-stake" type="number" min="0" max="100" step="any" inputmode="decimal" value="10" aria-describedby="financing-input-note"></div>
    </form>
    <div class="financing-input-bottom"><p id="financing-input-note">Changing the basis reinterprets the same quote. Primary capital enters the company; the tracked holder does not invest in this round.</p><button id="financing-use-model" type="button" class="text-button" disabled>Use modeled equity as the round price ↗</button></div>
    <p id="financing-error" class="financing-error" role="alert" hidden></p>
    <div class="financing-round-panel">
      <div class="financing-panel-top"><span class="eyebrow">The round in one view</span><span id="financing-context">Hypothetical terms</span></div>
      <div class="financing-equation">${metric('preMoney','Pre-money price')}<span class="financing-operator" aria-hidden="true">+</span>${metric('primaryCapital','Primary capital')}<span class="financing-operator" aria-hidden="true">=</span>${metric('postMoney','Post-money price','financing-post')}</div>
      <div id="financing-price-bar" class="financing-price-bar" role="img" aria-label="Round price visualization unavailable"></div>
      <div class="financing-round-foot"><span>All values in USD billions</span><span>Equal rights · retained proceeds · zero fees</span></div>
    </div>
    <div class="financing-ownership-grid">
      <div><div class="financing-part-heading"><div><span class="eyebrow">03 / Ownership after issuance</span><h4>Who owns what?</h4></div></div><div id="financing-ownership-chart" class="financing-ownership-chart"></div><div class="financing-legend"><span><i class="financing-holder-color"></i>Tracked holder</span><span><i class="financing-existing-color"></i>Other existing holders</span><span><i class="financing-new-color"></i>New investors</span></div></div>
      <div class="financing-holder-card"><span class="eyebrow">The tracked position</span><div class="financing-holder-change">${metric('holderBefore','Before')}<span aria-hidden="true">→</span>${metric('holderAfter','After')}</div><p><strong data-financing-metric="holderDilution">—</strong> ownership reduction</p><p class="financing-muted">New investors own <strong data-financing-metric="newOwnership">—</strong> of the post-round pool.</p></div>
    </div>
    <p id="financing-holder-note" class="financing-note"></p>
    <div class="financing-model-panel"><div class="financing-part-heading"><div><span class="eyebrow">04 / Reconcile to the model</span><h4>Keep price and value visible.</h4></div></div><p id="financing-bridge-prompt" class="financing-description">Enable the hypothetical equity bridge above to compare the round price with modeled equity. Undisclosed balances have not been treated as zero.</p><div id="financing-model-comparison" hidden><div id="financing-bridge-chart" class="financing-bridge-chart" role="group" aria-label="Operating enterprise value to hypothetical equity reconciliation"></div><div class="financing-comparison-grid">${metric('modelPreMoneyEquity','Modeled equity · before')}${metric('modelPostMoneyEquity','Modeled equity · after')}${metric('priceGap','Round pre-money − modeled equity')}${metric('priceGapPercent','Gap / modeled equity before')}</div><details class="financing-reconciliation"><summary>Why operating value stays the same</summary><table><tbody><tr><th scope="row">Operating EV before</th><td data-financing-metric="operatingEvBefore">—</td></tr><tr><th scope="row">Operating EV after retained proceeds</th><td data-financing-metric="operatingEvAfter">—</td></tr><tr><th scope="row">Operating EV implied by round price</th><td data-financing-metric="roundImpliedOperatingEv">—</td></tr><tr><th scope="row">Cash before / after</th><td id="financing-cash-line">—</td></tr></tbody></table><p>Operating EV = equity − cash + debt + other claims. Primary capital increases cash and equity by the same amount, so it cancels in this reconciliation. The financing quote remains independent of the fixed FCFF forecast.</p></details></div></div>
    <div class="financing-insight"><strong>Primary capital changes cash and ownership.</strong><p id="financing-insight-text">With a fixed operating forecast and retained proceeds, raising cash does not by itself increase operating enterprise value.</p></div>
    <div id="financing-warnings" class="financing-warnings" hidden></div>
    <div class="financing-actions"><button id="financing-verify" type="button" class="button button-dark" disabled>Verify through the API ↗</button><button id="financing-share" type="button" class="button button-outline" disabled>Copy financing link ↗</button><button id="financing-json" type="button" class="button button-outline" disabled>Financing JSON ↓</button><button id="financing-brief" type="button" class="button button-outline" disabled>Financing brief ↓</button></div>
    <p id="financing-api-status" class="financing-api-status" data-tone="idle" role="status">Browser calculation · API check available</p><p id="financing-status" class="financing-status" role="status"></p>
    <div id="financing-share-area" class="financing-share-area" hidden><label for="financing-share-url">Exact financing case link</label><textarea id="financing-share-url" rows="3" readonly spellcheck="false"></textarea></div>
    <p class="financing-note">The financing link, JSON and brief preserve the complete operating case, bridge and round. The Model’s separate scenario exports and Casebook saves contain operating assumptions and bridge adjustments only.</p>
    <details class="financing-scope"><summary>Method, sources &amp; scope</summary><p>One hypothetical primary priced round with equal participating economic rights, retained cash and zero fees. This is not either company’s reconstructed capitalization table. It excludes secondary transactions, SAFE or note conversions, option-pool increases, liquidation preferences, debt repayment and future rounds. Other claims are outside the equity ownership pool; do not subtract and count the same claim twice.</p><p>The forecast already includes its operating deficits. They are not subtracted again or converted into a recommended raise. A nonpositive modeled residual remains signed and does not represent a negative share price.</p><p><a href="https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/debttosubtract.htm" target="_blank" rel="noopener noreferrer">NYU Stern · Current claims and equity ↗</a> · <a href="https://www.ycombinator.com/blog/how-to-raise-a-seed-round" target="_blank" rel="noopener noreferrer">Y Combinator · Priced equity rounds ↗</a> · <a href="https://github.com/ult666666/frontier-ai-valuation-lab/blob/main/docs/FINANCING_LENS.md" target="_blank" rel="noopener noreferrer">Complete method ↗</a></p><p>Financial snapshot: ${VALUATION_DATE}. Financing method references reviewed 19 October 2026. All financing amounts are user assumptions.</p></details>
  </div>`;
  const $=selector=>root.querySelector(selector);
  const allMetrics=()=>[...root.querySelectorAll('[data-financing-metric]')];
  const buttons=['verify','share','json','brief'].map(name=>$(`#financing-${name}`));
  let active=null,lastKey='',revision=0,controller=null,pending=false,stakeExact={display:'10',value:.1};
  function setMetric(name,value,format=money){for(const node of root.querySelectorAll(`[data-financing-metric="${name}"]`)){node.textContent=format(value);if(finite(value)){node.dataset.value=String(value);node.title=String(value);}else{delete node.dataset.value;node.removeAttribute('title');}}}
  function apiStatus(text,tone='idle'){$('#financing-api-status').textContent=text;$('#financing-api-status').dataset.tone=tone;}
  function invalidate(){revision++;controller?.abort();controller=null;pending=false;$('#financing-share-area').hidden=true;$('#financing-share-url').value='';apiStatus('Browser calculation · API check available');}
  function modeledRound(){
    if(!active)return null;
    const value=active.result.comparison?.modelPreMoneyEquity;if(!finite(value)||value<=0)return null;
    const round={...active.snapshot.round,quote:active.snapshot.round.basis==='post'?value+active.snapshot.round.primaryCapital:value};
    try{financingLens(active.snapshot.case.assumptions,{bridge:active.snapshot.case.bridge,round});return round;}catch{return null;}
  }
  function setButtons(valid){for(const button of buttons)button.disabled=!valid||(button.id==='financing-verify'&&pending);$('#financing-use-model').disabled=!valid||!modeledRound();}
  function readRound(){
    const result={basis:$('#financing-basis').value};
    for(const [id,key,maximum] of [['quote','quote',FINANCING_MAX_AMOUNT],['capital','primaryCapital',FINANCING_MAX_AMOUNT],['stake','holderStake',100]]){
      const input=$(`#financing-${id}`),raw=input.value.trim(),value=raw===''||input.validity.badInput?NaN:Number(raw);
      const bad=!finite(value)||value<0||value>maximum||(id==='quote'&&value===0);input.setAttribute('aria-invalid',String(bad));
      if(bad)throw new Error(`Enter a valid ${id==='quote'?'positive financing quote':id==='capital'?'primary capital amount':'holder percentage'}. Blank values are not zero.`);
      result[key]=id==='stake'?(raw===stakeExact.display?stakeExact.value:value/100):value;
    }
    return result;
  }
  function fillRound(round){$('#financing-basis').value=round.basis;$('#financing-quote').value=String(round.quote);$('#financing-capital').value=String(round.primaryCapital);const display=String(round.holderStake*100);$('#financing-stake').value=display;stakeExact={display,value:round.holderStake};}
  function drawOwnership(p){
    const bar=(name,holder,other,incoming)=>`<div class="financing-bar-caption"><span>${name}</span><span>Tracked holder ${escape(percent(holder))}</span></div><div class="financing-ownership-bar" role="img" aria-label="${name}: tracked holder ${escape(percent(holder))}, other existing holders ${escape(percent(other))}, new investors ${escape(percent(incoming))}"><span class="financing-holder-color" style="width:${holder*100}%"></span><span class="financing-existing-color" style="width:${other*100}%"></span><span class="financing-new-color" style="width:${incoming*100}%"></span></div>`;
    $('#financing-ownership-chart').innerHTML=bar('Before',p.holderBefore,1-p.holderBefore,0)+bar('After',p.holderAfter,p.otherExistingAfter,p.newOwnership);
  }
  function drawBridge(r){
    const b=r.bridge,v=r.baseline.ev,e=b.equityValue;
    const rows=[['Operating EV',0,v,v,'total'],['Cash assumed',v,v+b.cash,b.cash,'positive'],['Debt assumed',v+b.cash,v+b.cash-b.debt,-b.debt,'negative'],['Other claims',v+b.cash-b.debt,e,-b.otherClaims,'negative'],['Modeled equity',0,e,e,'total']];
    const values=rows.flatMap(row=>[row[1],row[2]]),low=Math.min(0,...values),high=Math.max(0,...values),span=high-low||1,zero=-low/span*100;
    $('#financing-bridge-chart').innerHTML=rows.map(([name,start,end,amount,tone])=>`<div class="financing-waterfall-row"><span>${name}</span><div class="financing-waterfall-track" aria-hidden="true"><i class="financing-zero" style="left:${zero}%"></i><b class="financing-waterfall-bar ${tone}" style="left:${(Math.min(start,end)-low)/span*100}%;width:${Math.abs(end-start)/span*100}%"></b></div><strong>${escape(money(amount))}</strong></div>`).join('');
  }
  function render(){
    const {snapshot,result:r}=active,p=r.pricing,c=r.comparison;
    $('#financing-error').hidden=true;$('#financing-error').textContent='';
    $('#financing-context').textContent=`${snapshot.case.company} · ${snapshot.case.scenario} operating case`;
    for(const name of ['preMoney','postMoney','primaryCapital'])setMetric(name,p[name]);
    for(const name of ['holderBefore','holderAfter','newOwnership'])setMetric(name,p[name],percent);
    setMetric('holderDilution',p.holderDilution,pp);
    $('#financing-price-bar').innerHTML=`<span style="width:${p.existingOwnership*100}%"></span><span style="width:${p.newOwnership*100}%"></span>`;
    $('#financing-price-bar').setAttribute('aria-label',`Pre-money price ${money(p.preMoney)} plus primary capital ${money(p.primaryCapital)} equals post-money price ${money(p.postMoney)}.`);
    drawOwnership(p);
    $('#financing-holder-note').textContent=`At the assumed issue price, the tracked holder’s quoted stake is ${money(p.holderValueBefore)} before and after this round. Percentage dilution is not itself an investment return or a loss of that immediate quoted mark.`;
    $('#financing-model-comparison').hidden=!c;$('#financing-bridge-prompt').hidden=Boolean(c);
    for(const name of ['modelPreMoneyEquity','modelPostMoneyEquity','operatingEvBefore','operatingEvAfter','roundImpliedOperatingEv','priceGap'])setMetric(name,c?.[name]);
    setMetric('priceGapPercent',c?.priceGapPercent,percent);
    if(c){drawBridge(r);$('#financing-cash-line').textContent=`${money(c.cashBefore)} → ${money(c.cashAfter)}`;}
    else{$('#financing-bridge-chart').replaceChildren();$('#financing-cash-line').textContent='—';}
    $('#financing-insight-text').textContent=`The assumed ${money(p.primaryCapital)} primary raise enters the company as cash. Under this fixed forecast and retained-proceeds assumption, operating EV remains ${money(r.baseline.ev)}.`;
    $('#financing-warnings').hidden=!r.warnings.length;$('#financing-warnings').textContent=r.warnings.join(' ');
    setButtons(true);
  }
  function clear(message){
    active=null;lastKey='';invalidate();setButtons(false);
    for(const node of allMetrics()){node.textContent='—';delete node.dataset.value;node.removeAttribute('title');}
    $('#financing-error').textContent=message;$('#financing-error').hidden=false;$('#financing-status').textContent='Correct the inputs to calculate and export a complete financing case.';
    $('#financing-context').textContent='Complete the analysis inputs';$('#financing-price-bar').replaceChildren();$('#financing-price-bar').setAttribute('aria-label','Round price visualization unavailable');
    for(const id of ['financing-ownership-chart','financing-bridge-chart'])$(`#${id}`).replaceChildren();
    $('#financing-model-comparison').hidden=true;$('#financing-bridge-prompt').hidden=false;$('#financing-holder-note').textContent='';$('#financing-cash-line').textContent='—';$('#financing-warnings').textContent='';$('#financing-warnings').hidden=true;
    $('#financing-insight-text').textContent='With a fixed operating forecast and retained proceeds, primary capital changes cash and ownership. Complete the inputs to inspect this scenario.';apiStatus('Complete the analysis inputs before API verification.');
  }
  function refresh({message}={}){
    try{
      const snapshot=normalizeFinancing({case:getCase(),round:readRound()}),key=JSON.stringify(snapshot);
      if(key===lastKey){if(message)$('#financing-status').textContent=message;return;}
      const previousCase=active?JSON.stringify(active.snapshot.case):null;invalidate();
      active={snapshot,result:financingLens(snapshot.case.assumptions,{bridge:snapshot.case.bridge,round:snapshot.round})};lastKey=key;render();
      $('#financing-status').textContent=message||(previousCase&&previousCase!==JSON.stringify(snapshot.case)?'Operating case updated. Your hypothetical round terms are carried forward and recalculated.':'Hypothetical round calculated. Its complete inputs travel in the financing link and exports.');
    }catch(error){clear(error.message);}
  }
  function open(){document.getElementById('financing').scrollIntoView({block:'start',behavior:'instant'});document.getElementById('financing').focus({preventScroll:true});}
  function restore(snapshot,{message='Shared financing case restored and recalculated from its exact inputs.'}={}){
    const checked=normalizeFinancing(snapshot);fillRound(checked.round);onOpenCase(checked.case);document.getElementById('bridge-details').open=checked.case.bridge!==null;refresh({message});open();
  }
  function example(){const presets=getPresets();if(!presets)return;restore({case:{company:'Anthropic',scenario:'Base',assumptions:{...presets.Anthropic.Base},bridge:{cash:20,debt:5,otherClaims:0}},round:{...DEFAULT_ROUND}},{message:'Hypothetical worked example loaded: Anthropic Base with assumed cash, debt and financing terms. These are not disclosed company balances or transaction terms.'});}
  async function verify(){
    if(!active||pending)return;const start=++revision,snapshot=active.snapshot,expected=active.result;
    controller?.abort();const requestController=new AbortController();controller=requestController;pending=true;setButtons(true);apiStatus('Checking the complete financing analysis through the API…','pending');
    const timer=setTimeout(()=>requestController.abort(),12000);
    try{
      const response=await fetch(new URL('./api/valuation',import.meta.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'financing',assumptions:snapshot.case.assumptions,bridge:snapshot.case.bridge,round:snapshot.round}),signal:requestController.signal});
      if(!response.ok)throw new Error(`Server verification unavailable (HTTP ${response.status}).`);
      const body=await response.json();if(start!==revision)return;
      if(body.appVersion!==APP_VERSION||body.modelVersion!==MODEL_VERSION||body.valuationDate!==VALUATION_DATE||!sameResult(expected,body.result))throw new Error('The server response did not match the complete financing analysis.');
      apiStatus('Verified: the complete financing result and release metadata match the API.','ok');
    }catch(error){if(start!==revision)return;apiStatus(error.name==='AbortError'?'API verification timed out. The browser analysis remains available.':`${error.message} The browser analysis remains available.`,'error');}
    finally{clearTimeout(timer);if(start===revision){pending=false;controller=null;setButtons(Boolean(active));}}
  }
  function download(content,name,mime){const url=URL.createObjectURL(new Blob([content],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function share(){if(!active)return;const start=revision,url=financingUrl(location.href,active.snapshot);$('#financing-share-url').value=url;$('#financing-share-area').hidden=false;let copied=false;try{await navigator.clipboard.writeText(url);copied=true;}catch{}if(start!==revision)return;$('#financing-status').textContent=copied?'Exact financing link copied. All model, bridge and round inputs are included.':'Your exact financing link is ready below. Select and copy it to share.';if(!copied){$('#financing-share-url').focus();$('#financing-share-url').select();}}
  $('#financing-form').addEventListener('submit',event=>event.preventDefault());
  $('#financing-form').addEventListener('input',()=>{onTermsEdited();refresh();});
  $('#financing-basis').addEventListener('change',()=>{onTermsEdited();refresh();});
  document.getElementById('financing-example').addEventListener('click',example);
  $('#financing-use-model').addEventListener('click',()=>{const round=modeledRound();if(!round)return;onTermsEdited();$('#financing-quote').value=String(round.quote);refresh({message:'Modeled equity copied once into the round price. You can edit the round quote independently; later model changes do not silently reset it.'});});
  $('#financing-verify').addEventListener('click',verify);$('#financing-share').addEventListener('click',share);
  $('#financing-json').addEventListener('click',()=>{if(!active)return;download(JSON.stringify(createFinancingExport(active.snapshot,{baseUrl:location.href}),null,2)+'\n','Frontier_AI_Financing_Lens.json','application/json;charset=utf-8');$('#financing-status').textContent='Complete financing JSON downloaded, including the exact inputs, recalculated results and reopening link.';});
  $('#financing-brief').addEventListener('click',()=>{if(!active)return;download(createFinancingBrief(active.snapshot,{baseUrl:location.href}),'Frontier_AI_Financing_Lens.html','text/html;charset=utf-8');$('#financing-status').textContent='Standalone financing brief downloaded. Open it to review, or print it to PDF.';});
  return {refresh,restore,example,open};
}
