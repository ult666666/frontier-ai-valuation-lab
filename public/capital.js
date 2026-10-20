import {MODEL_VERSION,VALUATION_DATE} from './lib/model.js';
import {APP_VERSION} from './lib/release.js';
import {CAPITAL_VERSION} from './lib/capital-strategy.js';
import {createCapitalRecord,parseCapitalRecord,CAPITAL_RECORD_MAX_BYTES} from './lib/capital-record.js';
import {decodeCapitalShare,capitalUrl} from './lib/capital-share.js';
import {capitalBriefHtml} from './lib/capital-brief.js';
import {createCapitalExample} from './lib/capital-example.js';
import {capitalPlanChart} from './lib/capital-chart.js';
import {EVIDENCE_FIELDS,formatEvidenceValue} from './lib/evidence.js';
import {scenarioUrl} from './lib/share.js';
import {horizonUrl} from './lib/horizon-share.js';

const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const copy=value=>structuredClone(value);
const state={ready:false,presets:null,research:null,draft:null,decision:null,record:null,revision:0,controller:null,announcement:null,lastBridge:null,lastYears:new Map(),preview:null,importGeneration:0,needsReview:false,reasoningReviewed:false,origin:'worked'};
const fields={capitalTarget:'#capital-objective',retentionFloor:'#capital-retention',holderStake:'#capital-holder',modelCoverageFloor:'#capital-coverage'};
const notes={rationale:'#capital-rationale',tradeoff:'#capital-tradeoff',reviewTrigger:'#capital-review-trigger',informationNeeded:'#capital-information-needed'};
const percentFields=new Set(EVIDENCE_FIELDS.filter(field=>field.unit==='%').map(field=>field.key));

function number(value,digits=2){
  if(value===null||!Number.isFinite(value))return '—';
  const abs=Math.abs(value),sign=value<0?'−':'';
  if(abs>=1e7||(abs>0&&abs<.001))return sign+abs.toExponential(2);
  return sign+abs.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
}
const money=(value,digits=2)=>value===null||!Number.isFinite(value)?'—':`${value<0?'−':''}$${number(Math.abs(value),digits)}B`;
const percent=value=>value===null||!Number.isFinite(value)?'—':`${number(value*100,2)}%`;
const ratio=value=>value===null||!Number.isFinite(value)?'—':`${number(value,3)}×`;
const rawPercent=value=>formatEvidenceValue('g1',value).slice(0,-1).replace('−','-');
const readNumber=input=>input.value.trim()===''?NaN:Number(input.value);
const labelOf=(items,id)=>items.find(item=>item.id===id)?.label||id||'None';
const planLabel=id=>labelOf(state.draft?.plans||[],id);
const scenarioLabel=id=>labelOf(state.draft?.scenarios||[],id);
const finiteText=years=>years===null?'Perpetual continuation':years===0?'Explicit forecast only':`${years} terminal ${years===1?'year':'years'} · through ${2036+years}`;
const statusText=value=>value===null?'Unavailable':value?'Meets':'Does not meet';

function metric(name,value,format=money){
  for(const element of $$(`[data-capital-metric="${name}"]`)){
    element.textContent=value===null?'—':format(value);
    if(value===null)delete element.dataset.value;else element.dataset.value=String(value);
  }
}
function apiStatus(text,status='unverified'){$('#capital-api-status').textContent=text;$('#capital-api-status').dataset.state=status;}
function portableStatus(text,status='neutral'){$('#capital-portable-status').textContent=text;$('#capital-portable-status').dataset.state=status;}
function announce(text){clearTimeout(state.announcement);const revision=state.revision;state.announcement=setTimeout(()=>{if(revision===state.revision)$('#capital-announcement').textContent=text;},220);}
function setActions(){
  const valid=Boolean(state.record);
  for(const id of ['capital-json','capital-brief','capital-share'])$(`#${id}`).disabled=!valid;
  $('#capital-verify').disabled=!valid||Boolean(state.controller);
  $('#capital-review-reasoning').disabled=!valid||!state.needsReview;
  $('#capital-add-plan').disabled=!state.draft||state.draft.plans.length>=6;
  $('#capital-add-scenario').disabled=!state.draft||state.draft.scenarios.length>=9;
}
function invalidate({preserveLocation=false,markReasoning=true}={}){
  state.revision++;state.controller?.abort();state.controller=null;state.record=null;
  clearTimeout(state.announcement);$('#capital-announcement').textContent='';
  $('#capital-share-area').hidden=true;portableStatus('');
  $('#capital-verify').innerHTML='Verify complete analysis <span aria-hidden="true">↗</span>';
  apiStatus('Draft changed. Verify the current complete calculation when ready.');
  state.importGeneration++;state.preview=null;$('#capital-import-preview').hidden=true;
  if(markReasoning&&Object.values(state.decision||{}).some(value=>typeof value==='string'&&value.trim())){state.needsReview=true;state.reasoningReviewed=false;}
  if(!preserveLocation&&/^#(?:decision=|worked-decision)/.test(location.hash))history.replaceState(null,'',location.pathname+location.search);
}
function showError(message){
  document.body.dataset.capitalState='invalid';$('#capital-error').hidden=false;$('#capital-error').textContent=message;
  metric('eligiblePlans',null);metric('quoteCeiling',null);metric('primaryCeiling',null);
  $('#capital-eligibility-caption').textContent='Complete every submitted input to compare the plans.';
  $('#capital-selection-summary').textContent=state.decision?.selectedPlanId?planLabel(state.decision.selectedPlanId):'No selection';
  $('#capital-plan-chart').innerHTML='<p class="chart-placeholder">The decision is paused until all submitted inputs are valid.</p>';
  $('#capital-plan-legend').replaceChildren();$('#capital-plan-table').replaceChildren();$('#capital-matrix').innerHTML='<p class="empty-state">Complete the current draft before reading this comparison.</p>';
  $('#capital-rule-result').dataset.state='invalid';$('#capital-rule-plans').textContent='Paused';$('#capital-rule-gap').textContent='No current comparison';$('#capital-rule-explanation').textContent='A missing or invalid input pauses the complete decision; no scenario is silently dropped.';
  for(const id of ['capital-crossovers','capital-plan-metrics','capital-envelope-table','capital-complete-matrix','capital-warnings'])$(`#${id}`).replaceChildren();
  $('#capital-envelope-status').textContent='Complete the current inputs to calculate the pricing intervals.';$('#capital-dominance').textContent='';
  for(const element of $$('[data-plan-status]')){element.textContent='Complete the current decision';element.dataset.state='invalid';delete element.dataset.eligible;}
  for(const element of $$('[data-plan-retained],[data-plan-holder],[data-scenario-ev]')){element.textContent='—';delete element.dataset.value;}
  $('#capital-state-label').textContent='Draft needs attention';renderReasoningStatus();setActions();announce(message);
}
function recalculate(options={}){
  invalidate(options);
  try{
    if(!state.draft||!state.decision)throw new Error('Open the worked decision or import a complete saved record to start.');
    state.record=createCapitalRecord(state.draft,state.decision);
    for(const control of $$('[aria-invalid="true"]'))control.removeAttribute('aria-invalid');
    $('#capital-error').hidden=true;document.body.dataset.capitalState='ready';
    renderResults();setActions();
    announce(`${state.record.analysis.comparison.eligiblePlanIds.length} of ${state.draft.plans.length} plans meet the capital and retention objectives. Comparison updated.`);
  }catch(error){showError(error.message);}
}

function planEditors(){
  $('#capital-plan-editors').innerHTML=state.draft.plans.map((plan,index)=>`<article class="plan-editor" data-plan-editor data-plan-id="${escape(plan.id)}"><div class="plan-card-top"><span class="plan-letter">${String.fromCharCode(65+index)}</span><span data-plan-selected-label>Submitted plan</span></div><label for="capital-plan-${plan.id}-label">Plan name</label><input id="capital-plan-${plan.id}-label" type="text" data-plan-field="label" value="${escape(plan.label)}" aria-describedby="capital-plan-${plan.id}-status"><div class="plan-input-grid"><div class="basis-field"><label for="capital-plan-${plan.id}-basis">Interpret the entered quote as</label><select id="capital-plan-${plan.id}-basis" data-plan-field="basis"><option value="pre"${plan.basis==='pre'?' selected':''}>Pre-money</option><option value="post"${plan.basis==='post'?' selected':''}>Post-money</option></select></div><div><label for="capital-plan-${plan.id}-quote">Equity quote <span>USD billions</span></label><input id="capital-plan-${plan.id}-quote" type="text" inputmode="decimal" data-plan-field="quote" value="${escape(plan.quote)}"></div><div><label for="capital-plan-${plan.id}-capital">Primary capital <span>USD billions</span></label><input id="capital-plan-${plan.id}-capital" type="text" inputmode="decimal" data-plan-field="primaryCapital" value="${escape(plan.primaryCapital)}"></div></div><p id="capital-plan-${plan.id}-status" data-plan-status>Preparing this plan…</p><div class="plan-output"><span class="plan-output-label">Starting stake retained</span><strong data-plan-retained>—</strong></div><div class="plan-output"><span class="plan-output-label">Tracked holder after</span><strong data-plan-holder>—</strong></div><button class="text-button plan-remove" data-remove-plan type="button"${state.draft.plans.length===1?' disabled':''}>Remove this plan</button></article>`).join('');
}
function scenarioEditors(){
  $('#capital-scenarios').innerHTML=state.draft.scenarios.map((scenario,index)=>`<details class="scenario-editor" data-scenario-editor data-scenario-id="${escape(scenario.id)}"><summary><span class="scenario-summary-main"><span class="scenario-marker">S${index+1}</span><strong data-scenario-title>${escape(scenario.label)}</strong><small data-scenario-period>${escape(finiteText(scenario.continuationYears))}</small></span><span class="scenario-summary-value"><span><small>Operating EV</small><strong data-scenario-ev>—</strong></span><span aria-hidden="true">+</span></span></summary><div class="scenario-body"><div class="scenario-basics"><label for="capital-scenario-${scenario.id}-label">Scenario name<input id="capital-scenario-${scenario.id}-label" type="text" data-scenario-field="label" value="${escape(scenario.label)}"></label><label for="capital-scenario-${scenario.id}-mode">Continuation after 2036<select id="capital-scenario-${scenario.id}-mode" data-scenario-mode><option value="perpetual"${scenario.continuationYears===null?' selected':''}>Perpetual reference</option><option value="finite"${scenario.continuationYears!==null?' selected':''}>Finite, zero residual</option></select></label><label class="scenario-year-field" for="capital-scenario-${scenario.id}-years"${scenario.continuationYears===null?' hidden':''}>Years after 2036 · 0 to 100<input id="capital-scenario-${scenario.id}-years" type="text" inputmode="numeric" data-scenario-years value="${scenario.continuationYears??10}"${scenario.continuationYears===null?' disabled':''}></label></div><div class="scenario-preset"><label for="capital-scenario-${scenario.id}-preset">Replace operating assumptions<select id="capital-scenario-${scenario.id}-preset" data-scenario-preset><option${scenario.label==='Bear'?' selected':''}>Bear</option><option${!['Bear','Bull'].includes(scenario.label)?' selected':''}>Base</option><option${scenario.label==='Bull'?' selected':''}>Bull</option></select></label><button type="button" class="text-button" data-apply-preset>Load selected preset</button><button type="button" class="text-button scenario-remove" data-remove-scenario${state.draft.scenarios.length===1?' disabled':''}>Remove scenario</button></div><div class="assumption-grid">${EVIDENCE_FIELDS.map(field=>`<div class="assumption-field"><label for="capital-${scenario.id}-${field.key}">${escape(field.label)} <span>${escape(field.unit==='bn'?'USD bn':field.unit)}</span></label><input id="capital-${scenario.id}-${field.key}" type="text" inputmode="decimal" data-assumption-field="${field.key}" value="${escape(percentFields.has(field.key)?rawPercent(scenario.assumptions[field.key]):String(scenario.assumptions[field.key]))}" aria-describedby="capital-${scenario.id}-${field.key}-help"><small id="capital-${scenario.id}-${field.key}-help">${escape(field.limit)}</small></div>`).join('')}</div><p class="small-note">All future inputs are analyst assumptions. Changing the continuation horizon preserves the operating inputs and sets cash flows and residual value after the selected cutoff to zero.</p><div class="scenario-links" data-scenario-links></div></div></details>`).join('');
}
function writeControls(){
  $('#capital-company').value=state.draft.company;
  renderExampleLauncher();
  for(const [key,selector] of Object.entries(fields))$(selector).value=['retentionFloor','holderStake'].includes(key)?rawPercent(state.draft.policy[key]):String(state.draft.policy[key]);
  $('#capital-retention-range').value=String(state.draft.policy.retentionFloor*100);
  $('#capital-bridge-enabled').checked=state.draft.bridge!==null;
  const bridge=state.draft.bridge||state.lastBridge||{cash:0,debt:0,otherClaims:0};
  for(const [key,id] of [['cash','capital-cash'],['debt','capital-debt'],['otherClaims','capital-claims']]){$(`#${id}`).value=String(bridge[key]);$(`#${id}`).disabled=state.draft.bridge===null;}
  for(const [key,selector] of Object.entries(notes))$(selector).value=state.decision[key];
  for(const input of $$('[aria-invalid="true"]'))input.removeAttribute('aria-invalid');
  planEditors();scenarioEditors();renderSelection();renderNoteCounts();
}
function renderSelection(){
  const select=$('#capital-selected-plan');
  select.innerHTML='<option value="">No plan selected</option>'+state.draft.plans.map((plan,index)=>`<option value="${escape(plan.id)}">${String.fromCharCode(65+index)} / ${escape(plan.label)}</option>`).join('');
  select.value=state.decision.selectedPlanId||'';
}
function renderExampleLauncher(){
  $('#capital-reset-worked').innerHTML=`Replace with ${escape($('#capital-company').value)} example <span aria-hidden="true">↻</span>`;
}
function renderNoteCounts(){
  for(const [key,selector] of Object.entries(notes)){
    const count=[...$(selector).value].length;$(`[data-note-count="${key}"]`).textContent=`${count.toLocaleString('en-US')} / 1,500`;
    if(count>1500)$(selector).setAttribute('aria-invalid','true');else $(selector).removeAttribute('aria-invalid');
  }
}
function renderReasoningStatus(){
  const element=$('#capital-reasoning-status');
  if(state.needsReview){element.dataset.state='needs-review';element.textContent='Inputs changed. Review this reasoning against the current decision.';}
  else if(state.reasoningReviewed){element.dataset.state='reviewed';element.textContent='You marked this reasoning reviewed for the current page inputs.';}
  else{element.dataset.state='draft';element.textContent=state.origin==='worked'?'Illustrative analyst draft. The comparison rule does not select for you.':'Analyst draft. Review the reasoning alongside its exact inputs.';}
  $('#capital-review-reasoning').disabled=!state.record||!state.needsReview;
}

function renderPlans(analysis){
  metric('eligiblePlans',analysis.comparison.eligiblePlanIds.length,value=>String(value));
  $('#capital-eligibility-caption').textContent=`Of ${analysis.plans.length} submitted ${analysis.plans.length===1?'plan':'plans'} · Capital + ownership only`;
  $('#capital-selection-summary').textContent=state.decision.selectedPlanId?planLabel(state.decision.selectedPlanId):'No selection';
  $('#capital-plan-chart').innerHTML=capitalPlanChart(analysis,{selectedPlanId:state.decision.selectedPlanId,idPrefix:'capital-main-chart',compact:matchMedia('(max-width:650px)').matches});
  $('#capital-plan-legend').innerHTML=analysis.plans.map((plan,index)=>`<span data-selected="${plan.id===state.decision.selectedPlanId}"><b>${String.fromCharCode(65+index)}</b>${escape(plan.label)}</span>`).join('');
  const policy=analysis.snapshot.policy;
  $('#capital-retention-meaning').textContent=`${percent(policy.retentionFloor)} retained means a ${percent(policy.holderStake)} starting stake stays at or above ${percent(policy.holderStake*policy.retentionFloor)} of the company.`;
  for(const plan of analysis.plans){
    const element=$(`[data-plan-id="${plan.id}"]`),status=element.querySelector('[data-plan-status]');
    const selected=state.decision.selectedPlanId===plan.id;element.dataset.selected=String(selected);element.querySelector('[data-plan-selected-label]').textContent=selected?'Analyst selection':'Submitted plan';
    status.dataset.eligible=String(plan.eligible);status.dataset.state='ready';
    const failures=[];if(!plan.meetsCapital)failures.push(`${money(-plan.capitalGap)} below capital objective`);if(!plan.meetsRetention)failures.push(`Below ${percent(policy.retentionFloor)} retention floor`);
    status.textContent=plan.eligible?'Meets both explicit objectives':failures.join(' · ');
    for(const [selector,value] of [['[data-plan-retained]',plan.retainedFraction],['[data-plan-holder]',plan.pricing.holderAfter]]){const output=element.querySelector(selector);output.textContent=percent(value);output.dataset.value=String(value);}
  }
  $('#capital-plan-table').innerHTML=analysis.plans.map(plan=>`<tr data-selected="${plan.id===state.decision.selectedPlanId}"><th scope="row">${escape(plan.label)}</th><td>${money(plan.pricing.preMoney)}</td><td>${money(plan.pricing.primaryCapital)}</td><td>${money(plan.pricing.postMoney)}</td><td>${percent(plan.retainedFraction)}</td><td>${percent(plan.pricing.holderAfter)}</td><td>${money(plan.capitalGap)}</td><td>${plan.eligible?'Meets both':'Does not meet both'}</td></tr>`).join('');
}
function renderScenarios(analysis){
  const bridge=analysis.snapshot.bridge;
  $('#capital-bridge-summary').textContent=bridge===null?'Bridge unavailable · allocation comparisons pause':`Cash ${money(bridge.cash)} · Debt ${money(bridge.debt)} · Other claims ${money(bridge.otherClaims)}`;
  for(const scenario of analysis.scenarios){
    const editor=$(`[data-scenario-id="${scenario.id}"]`);
    editor.querySelector('[data-scenario-title]').textContent=scenario.label;editor.querySelector('[data-scenario-period]').textContent=finiteText(scenario.continuationYears);
    const ev=editor.querySelector('[data-scenario-ev]');ev.textContent=money(scenario.operatingEv,1);ev.dataset.value=String(scenario.operatingEv);
    const preset=['Bear','Base','Bull'].find(name=>EVIDENCE_FIELDS.every(field=>state.presets[analysis.snapshot.company][name][field.key]===scenario.assumptions[field.key]))||'Base';
    const operatingCase={company:analysis.snapshot.company,scenario:preset,assumptions:scenario.assumptions,bridge};
    const model=scenarioUrl(new URL('./index.html',location.href).href,operatingCase);
    const horizon=scenario.continuationYears===null?null:horizonUrl(new URL('./horizon.html',location.href).href,{case:operatingCase,years:scenario.continuationYears,target:null});
    editor.querySelector('[data-scenario-links]').innerHTML=`<a href="${escape(model)}" target="_blank" rel="noopener noreferrer">Inspect this operating case <span aria-hidden="true">↗</span></a>${horizon?`<a href="${escape(horizon)}" target="_blank" rel="noopener noreferrer">Inspect this exact horizon <span aria-hidden="true">↗</span></a>`:''}<a href="./index.html#sources" target="_blank" rel="noopener noreferrer">Dated evidence <span aria-hidden="true">↗</span></a>`;
  }
}
function renderMatrix(analysis){
  const selected=$('#capital-matrix-metric').value;
  const captions={existingCohortAllocation:'Signed modeled residual allocated to the whole existing cohort after each round.',trackedHolderAllocation:'Signed modeled residual allocated to the tracked holder after each round.',regret:'Gap to the best allocation among eligible plans in each scenario. Lower is closer to that benchmark.',modelToQuote:'Modeled pre-round equity residual divided by the positive pre-money quote. This coverage test is separate from eligibility.'};
  $('#capital-matrix-caption').textContent=captions[selected];
  const headers=`<div class="matrix-cell plan-header desktop-matrix-header">Same operating cases<br>across every plan</div>${analysis.plans.map((plan,index)=>`<div class="matrix-cell plan-header desktop-matrix-header"><span>${String.fromCharCode(65+index)} / ${plan.id===state.decision.selectedPlanId?'Analyst selection':'Submitted plan'}</span><strong>${escape(plan.label)}</strong><small>${plan.eligible?'Meets both objectives':'Outside one or both objectives'}</small></div>`).join('')}`;
  const rows=analysis.scenarios.map(scenario=>{
    const cells=analysis.plans.map(plan=>{
      const cell=analysis.matrix.find(item=>item.scenarioId===scenario.id&&item.planId===plan.id),value=cell[selected];
      const display=selected==='modelToQuote'?ratio(value):money(value,2);
      let note=selected==='regret'&&!plan.eligible?'Not compared: plan is outside the objectives.':value===null?'Unavailable; see calculation warnings.':selected==='modelToQuote'?`${statusText(cell.meetsModelCoverage)} ${ratio(analysis.snapshot.policy.modelCoverageFloor)} model coverage.`:`${plan.eligible?'Eligible for the declared comparison':'Outside the capital/retention comparison'}.`;
      return `<div class="matrix-cell result-cell" data-matrix-scenario="${scenario.id}" data-matrix-plan="${plan.id}" data-selected="${plan.id===state.decision.selectedPlanId}" data-eligible="${plan.eligible}"><span class="mobile-plan-name">${escape(plan.label)}</span><strong${value<0?' class="negative"':''}${value===null?'':` data-value="${value}"`}>${display}</strong><small>${escape(note)}</small></div>`;
    }).join('');
    return `<div class="matrix-cell scenario-header"><strong>${escape(scenario.label)}</strong><small>${escape(finiteText(scenario.continuationYears))}<br>Pre-round model residual ${money(scenario.modelPreMoneyEquity)}</small></div><div class="matrix-scenario-values">${cells}</div>`;
  }).join('');
  $('#capital-matrix').innerHTML=`<div class="matrix-scroll" tabindex="0" role="region" aria-label="${escape(captions[selected])}"><div class="matrix-grid" style="--plan-count:${analysis.plans.length}">${headers}${rows}</div></div><p class="matrix-context">${analysis.scenarios.length} submitted ${analysis.scenarios.length===1?'scenario':'scenarios'} · ${analysis.plans.length} submitted ${analysis.plans.length===1?'plan':'plans'} · No probability weights · All amounts remain signed</p>`;
  const rowsAll=analysis.matrix.map(cell=>`<tr><th scope="row">${escape(scenarioLabel(cell.scenarioId))}</th><td>${escape(planLabel(cell.planId))}</td><td>${money(cell.modelPreMoneyEquity)}</td><td>${money(cell.modelPostMoneyEquity)}</td><td>${money(cell.existingCohortAllocation)}</td><td>${money(cell.trackedHolderAllocation)}</td><td>${ratio(cell.modelToQuote)}</td><td>${statusText(cell.meetsModelCoverage)}</td><td>${money(cell.regret)}</td></tr>`).join('');
  $('#capital-complete-matrix').innerHTML=`<table><caption>Every submitted scenario and plan. USD billions except coverage. A dash is unavailable or outside the eligible comparison, never a zero substitute.</caption><thead><tr><th scope="col">Scenario</th><th scope="col">Plan</th><th scope="col">Model pre-round residual</th><th scope="col">Model post-round residual</th><th scope="col">Existing cohort allocation</th><th scope="col">Tracked holder allocation</th><th scope="col">Model / quote</th><th scope="col">Coverage floor</th><th scope="col">Gap to eligible best</th></tr></thead><tbody>${rowsAll}</tbody></table>`;
}
function renderComparison(analysis){
  const comparison=analysis.comparison,rule=comparison.minimax;
  $('#capital-rule-result').dataset.state=rule.status;
  if(rule.status==='available'){
    $('#capital-rule-plans').textContent=rule.planIds.map(planLabel).join(' / ');
    $('#capital-rule-gap').textContent=`${money(rule.worstRegret)} largest gap to a scenario’s eligible best`;
    $('#capital-rule-explanation').textContent=`${rule.planIds.length>1?'These plans tie for':'This plan has'} the smallest worst-case gap across the ${analysis.scenarios.length} submitted scenarios, measured using the existing cohort’s signed modeled residual. Your analyst selection remains separate.`;
  }else if(rule.status==='no-eligible-plans'){
    $('#capital-rule-plans').textContent='No eligible plan';$('#capital-rule-gap').textContent='Revise the plans or objectives';$('#capital-rule-explanation').textContent='None of the submitted plans meets both the capital objective and the retained-stake floor. No ranking is produced, and your analyst selection is preserved.';
  }else{
    $('#capital-rule-plans').textContent='Unavailable';$('#capital-rule-gap').textContent='Allocation context is incomplete';$('#capital-rule-explanation').textContent='Capital and ownership can still be screened. The full allocation comparison requires an explicit bridge and numerically resolved values for every submitted scenario.';
  }
  $('#capital-plan-metrics').innerHTML=`<table><caption>Comparison metrics for each plan, evaluated over the listed scenarios. The coverage count has no probability interpretation.</caption><thead><tr><th scope="col">Plan</th><th scope="col">Eligible</th><th scope="col">Worst gap</th><th scope="col">Scenario(s) at worst gap</th><th scope="col">Minimum allocation</th><th scope="col">Maximum allocation</th><th scope="col">Coverage cases</th></tr></thead><tbody>${comparison.planMetrics.map(plan=>`<tr data-selected="${plan.planId===state.decision.selectedPlanId}"><th scope="row">${escape(planLabel(plan.planId))}</th><td>${plan.eligible?'Yes':'No'}</td><td>${money(plan.worstRegret)}</td><td class="wrap-cell">${plan.worstScenarioIds.length?escape(plan.worstScenarioIds.map(scenarioLabel).join(', ')):'—'}</td><td>${money(plan.minAllocation)}</td><td>${money(plan.maxAllocation)}</td><td>${plan.meetsModelCoverageIn===null?'Unavailable':`${plan.meetsModelCoverageIn} / ${plan.totalScenarios}`}</td></tr>`).join('')}</tbody></table>`;
  $('#capital-dominance').textContent=comparison.dominanceStatus!=='available'?'Dominance comparison unavailable.':comparison.dominance.length?`Dominance among eligible plans: ${comparison.dominance.map(pair=>`${planLabel(pair.dominatingPlanId)} has at least as large an allocation in every listed scenario as ${planLabel(pair.dominatedPlanId)}, with a strict advantage in at least one`).join('; ')}.`:'No eligible plan dominates another across the submitted scenarios under this allocation metric.';
  $('#capital-crossovers').innerHTML=comparison.crossovers.length?comparison.crossovers.map(pair=>{
    const caption=`${planLabel(pair.planA)} / ${planLabel(pair.planB)}`;
    let value='Unavailable',detail='The pairwise switching point could not be resolved at the supported precision.';
    if(pair.status==='finite'){value=money(pair.equityResidual);detail=`Below this residual: ${planLabel(pair.lowerResidualPreferred)} has the higher allocation. Above it: ${planLabel(pair.higherResidualPreferred)}. The common allocation at the crossover is ${money(pair.allocation)}.`;}
    else if(pair.status==='parallel'){value='Parallel';detail='These plans have indistinguishable retention slopes at the supported precision, with different allocation levels. There is no resolved switching point.';}
    else if(pair.status==='identical'){value='Identical lines';detail='The two modeled allocation lines coincide at the supported precision.';}
    const range=pair.status==='finite'?(pair.inSelectedRange===null?'Scenario residual range unavailable.':pair.inSelectedRange?'Within the selected model-residual range.':'Outside the selected model-residual range.'):'No finite crossing is displayed.';
    return `<article class="crossover-card" data-crossover="${pair.planA}:${pair.planB}" data-status="${pair.status}"${pair.equityResidual===null?'':` data-equity="${pair.equityResidual}"`}><h4>${escape(caption)}</h4><strong>${value}</strong><p>${escape(detail)}</p><p class="crossover-range">${escape(range)} ${pair.eligiblePair?'Both plans meet the objectives.':'Includes a plan outside the objectives; excluded from the ranking.'}</p></article>`;
  }).join(''):'<p class="small-note">Add another plan to inspect a pairwise switching value.</p>';
}
function renderEnvelope(analysis){
  const envelope=analysis.envelope;
  metric('quoteCeiling',envelope.modelQuoteCeiling);metric('primaryCeiling',envelope.maximumPrimaryCapital);
  let summary=envelope.status==='unavailable'?'The all-scenario quote ceiling is unavailable. Supply explicit hypothetical balances and review calculation warnings.':envelope.status==='no-positive-price'?'The model-conditioned ceiling is nonpositive. No positive financing quote can meet the selected coverage condition in every submitted scenario.':`Limiting ${envelope.limitingScenarioIds.length===1?'scenario':'scenarios'}: ${envelope.limitingScenarioIds.map(scenarioLabel).join(', ')}. The analytical maximum is conditional on every submitted scenario and the ${ratio(analysis.snapshot.policy.modelCoverageFloor)} coverage floor.`;
  $('#capital-envelope-status').textContent=summary;$('#capital-envelope-status').dataset.state=envelope.status;
  const meaning={compatible:'Conditions overlap',empty:'Conditions conflict','no-finite-quote':'No finite quote meets retention','no-positive-price':'No positive compatible price',unavailable:'Unavailable'};
  $('#capital-envelope-table').innerHTML=`<table><caption>Pre-money quote intervals for the entered primary amounts. The lower endpoint is open at zero; otherwise its inclusion is shown explicitly.</caption><thead><tr><th scope="col">Plan</th><th scope="col">Ownership lower bound</th><th scope="col">All-scenario upper bound</th><th scope="col">Interval status</th><th scope="col">Supported range intersects</th><th scope="col">Current quote meets</th></tr></thead><tbody>${envelope.plans.map(plan=>`<tr><th scope="row">${escape(planLabel(plan.planId))}</th><td>${plan.lowerPreMoney===null?'—':`${plan.includesLower?'≥': '>'} ${money(plan.lowerPreMoney)}`}</td><td>${money(plan.upperPreMoney)}</td><td class="wrap-cell">${escape(meaning[plan.status]||plan.status)}</td><td>${plan.withinInputRange===null?'Unavailable':plan.withinInputRange?'Yes':'No'}</td><td>${plan.currentQuoteMeets===null?'Unavailable':plan.currentQuoteMeets?'Yes':'No'}</td></tr>`).join('')}</tbody></table>`;
}
function renderWarnings(analysis){
  const warnings=[...analysis.warnings,...analysis.scenarios.flatMap(scenario=>scenario.warnings.map(warning=>`${scenario.label}: ${warning}`)),...analysis.matrix.flatMap(cell=>cell.warnings.map(warning=>`${scenarioLabel(cell.scenarioId)} / ${planLabel(cell.planId)}: ${warning}`))];
  $('#capital-warnings').innerHTML=[...new Set(warnings)].map(warning=>`<li>${escape(warning)}</li>`).join('')||'<li>No additional numerical warning for the current inputs. The stated method boundaries still apply.</li>';
}
function renderResults(){
  const analysis=state.record.analysis;
  renderSelection();renderPlans(analysis);renderScenarios(analysis);renderMatrix(analysis);renderComparison(analysis);renderEnvelope(analysis);renderWarnings(analysis);renderReasoningStatus();renderNoteCounts();
  const selected=analysis.plans.find(plan=>plan.id===state.decision.selectedPlanId);
  $('#capital-selection-status').textContent=selected?(selected.eligible?'Your selected plan currently meets both explicit capital and ownership objectives.':'Your selection is preserved, but this plan does not currently meet both explicit objectives.'):'No analyst selection has been made. The comparison rule remains separately visible.';
  $('#capital-state-label').textContent=`Current decision: ${state.draft.company} · ${analysis.scenarios.length} scenarios · ${analysis.plans.length} plans · Exact numeric draft`;
}

function applyRecord(record,{origin='import',preserveLocation=false,focus=false}={}){
  state.draft=copy(record.snapshot);state.decision=copy(record.decision);state.origin=origin;state.needsReview=false;state.reasoningReviewed=false;
  state.lastBridge=record.snapshot.bridge===null?null:copy(record.snapshot.bridge);state.lastYears.clear();for(const scenario of state.draft.scenarios)if(scenario.continuationYears!==null)state.lastYears.set(scenario.id,scenario.continuationYears);
  writeControls();recalculate({preserveLocation,markReasoning:false});
  if(focus&&state.record){$('#capital-decision').focus({preventScroll:true});$('#capital-decision').scrollIntoView({behavior:'auto',block:'start'});}
}
function nextId(items,prefix){let number=items.length+1;while(items.some(item=>item.id===`${prefix}-${number}`))number++;return `${prefix}-${number}`;}
function replaceWorked(company=state.draft?.company||'Anthropic'){
  applyRecord(createCapitalExample(state.presets,company),{origin:'worked'});$('#capital-notice').hidden=true;
  history.replaceState(null,'',`${location.pathname}${location.search}#worked-decision`);
  $('#capital-decision').focus({preventScroll:true});
}
function updateInput(event){
  const input=event.target;if(!state.ready||!state.draft)return;
  const selectedField=Object.entries(fields).find(([,selector])=>$(selector)===input);
  if(selectedField){const [key]=selectedField,value=readNumber(input);state.draft.policy[key]=['retentionFloor','holderStake'].includes(key)?value/100:value;if(key==='retentionFloor'&&Number.isFinite(value)&&value>=1&&value<=100)$('#capital-retention-range').value=String(value);input.toggleAttribute('aria-invalid',!Number.isFinite(value));if(input.hasAttribute('aria-invalid'))input.setAttribute('aria-invalid','true');recalculate();return;}
  if(input.id==='capital-retention-range'){$('#capital-retention').value=input.value;state.draft.policy.retentionFloor=Number(input.value)/100;$('#capital-retention').removeAttribute('aria-invalid');recalculate();return;}
  const bridgeField={ 'capital-cash':'cash','capital-debt':'debt','capital-claims':'otherClaims'}[input.id];
  if(bridgeField&&state.draft.bridge!==null){state.draft.bridge[bridgeField]=readNumber(input);state.lastBridge=copy(state.draft.bridge);recalculate();return;}
  const planEditor=input.closest('[data-plan-editor]');
  if(planEditor&&input.dataset.planField){const plan=state.draft.plans.find(item=>item.id===planEditor.dataset.planId),field=input.dataset.planField;plan[field]=['quote','primaryCapital'].includes(field)?readNumber(input):input.value;recalculate();return;}
  const scenarioEditor=input.closest('[data-scenario-editor]');
  if(scenarioEditor){
    const scenario=state.draft.scenarios.find(item=>item.id===scenarioEditor.dataset.scenarioId);
    if(input.dataset.scenarioField==='label'){scenario.label=input.value;recalculate();return;}
    if(input.hasAttribute('data-assumption-field')){const key=input.dataset.assumptionField;scenario.assumptions[key]=readNumber(input)/(percentFields.has(key)?100:1);recalculate();return;}
    if(input.hasAttribute('data-scenario-years')){scenario.continuationYears=readNumber(input);if(Number.isInteger(scenario.continuationYears)&&scenario.continuationYears>=0&&scenario.continuationYears<=100)state.lastYears.set(scenario.id,scenario.continuationYears);recalculate();return;}
  }
  if(input.dataset.decisionField){state.decision[input.dataset.decisionField]=input.value;renderNoteCounts();recalculate({markReasoning:false});}
}
function onChange(event){
  const input=event.target;if(!state.ready)return;
  if(input.id==='capital-company'){renderExampleLauncher();return;}
  if(input.id==='capital-selected-plan'){state.decision.selectedPlanId=input.value||null;recalculate();return;}
  if(input.id==='capital-matrix-metric'){if(state.record)renderMatrix(state.record.analysis);return;}
  if(input.id==='capital-bridge-enabled'){
    if(input.checked)state.draft.bridge=copy(state.lastBridge||{cash:0,debt:0,otherClaims:0});else{state.lastBridge=copy(state.draft.bridge);state.draft.bridge=null;}
    for(const id of ['capital-cash','capital-debt','capital-claims'])$(`#${id}`).disabled=!input.checked;recalculate();return;
  }
  if(input.hasAttribute('data-scenario-mode')){
    const editor=input.closest('[data-scenario-editor]'),scenario=state.draft.scenarios.find(item=>item.id===editor.dataset.scenarioId),years=editor.querySelector('[data-scenario-years]');
    scenario.continuationYears=input.value==='perpetual'?null:(state.lastYears.get(scenario.id)??10);years.disabled=scenario.continuationYears===null;years.closest('label').hidden=years.disabled;if(!years.disabled)years.value=String(scenario.continuationYears);recalculate();return;
  }
  if(input.id==='capital-import-file')previewImport(input.files?.[0]);
}
function onClick(event){
  const button=event.target.closest('button');if(!button||button.disabled||!state.ready)return;
  const editor=button.closest('[data-plan-editor]');
  if(button.hasAttribute('data-remove-plan')&&state.draft.plans.length>1){const id=editor.dataset.planId;state.draft.plans=state.draft.plans.filter(plan=>plan.id!==id);if(state.decision.selectedPlanId===id)state.decision.selectedPlanId=null;planEditors();recalculate();$('#capital-add-plan').focus();return;}
  const scenarioEditor=button.closest('[data-scenario-editor]');
  if(button.hasAttribute('data-remove-scenario')&&state.draft.scenarios.length>1){state.draft.scenarios=state.draft.scenarios.filter(scenario=>scenario.id!==scenarioEditor.dataset.scenarioId);scenarioEditors();recalculate();$('#capital-add-scenario').focus();return;}
  if(button.hasAttribute('data-apply-preset')){const scenario=state.draft.scenarios.find(item=>item.id===scenarioEditor.dataset.scenarioId),preset=scenarioEditor.querySelector('[data-scenario-preset]').value;scenario.assumptions=copy(state.presets[state.draft.company][preset]);scenario.label=preset;const id=scenario.id;scenarioEditors();const replacement=$(`[data-scenario-id="${id}"]`);replacement.open=true;replacement.querySelector('[data-apply-preset]').focus();recalculate();return;}
  if(button.id==='capital-add-plan'&&state.draft.plans.length<6){const plan={id:nextId(state.draft.plans,'plan'),label:`Plan ${state.draft.plans.length+1}`,basis:'pre',quote:250,primaryCapital:25};state.draft.plans.push(plan);planEditors();recalculate();$(`[data-plan-id="${plan.id}"] [data-plan-field="label"]`).focus();return;}
  if(button.id==='capital-add-scenario'&&state.draft.scenarios.length<9){const preset=$('#capital-new-scenario-preset').value,scenario={id:nextId(state.draft.scenarios,'scenario'),label:preset,assumptions:copy(state.presets[state.draft.company][preset]),continuationYears:null};state.draft.scenarios.push(scenario);scenarioEditors();recalculate();const replacement=$(`[data-scenario-id="${scenario.id}"]`);replacement.open=true;replacement.querySelector('[data-scenario-field="label"]').focus();return;}
  if(button.id==='capital-reset-worked')replaceWorked($('#capital-company').value);
  if(button.id==='capital-review-reasoning'&&state.record){state.needsReview=false;state.reasoningReviewed=true;renderReasoningStatus();announce('Reasoning marked reviewed for the current page inputs. This review flag is local to this page.');}
  if(button.id==='capital-json')exportRecord('json');if(button.id==='capital-brief')exportRecord('html');if(button.id==='capital-share')shareRecord();if(button.id==='capital-verify')verify();
  if(button.id==='capital-select-share'){$('#capital-share-url').focus();$('#capital-share-url').select();}
  if(button.id==='capital-import-cancel'){state.preview=null;$('#capital-import-preview').hidden=true;$('#capital-import-status').textContent='Import canceled. Your current draft remains unchanged.';$('#capital-import-status').dataset.state='neutral';}
  if(button.id==='capital-import-apply'&&state.preview){const incoming=state.preview;applyRecord(incoming,{origin:'import'});$('#capital-import-status').textContent='The complete imported decision is now open. Its analysis was recomputed from the validated inputs.';$('#capital-import-status').dataset.state='applied';$('#capital-selected-plan').focus();}
}

function download(name,type,content){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportRecord(kind){
  if(!state.record)return;
  try{
    const record=createCapitalRecord(state.draft,state.decision);
    if(kind==='json')download('Frontier_AI_Capital_Decision.json','application/json;charset=utf-8',JSON.stringify(record)+'\n');
    else download('Frontier_AI_Capital_Decision.html','text/html;charset=utf-8',capitalBriefHtml(record));
    portableStatus(kind==='json'?'Complete decision JSON downloaded. Import it to reopen the exact inputs and reasoning.':'Standalone decision brief downloaded. Open it offline or print it to PDF.','success');
  }catch(error){portableStatus(`Export could not be prepared: ${error.message}`,'error');}
}
async function shareRecord(){
  if(!state.record)return;const revision=state.revision;
  try{
    const url=capitalUrl(state.record,new URL('./capital.html',location.href).href);
    if(revision!==state.revision)return;
    $('#capital-share-url').value=url;$('#capital-share-area').hidden=false;
    history.replaceState(null,'',url);portableStatus('The exact link includes the current snapshot and analyst text. It does not carry a server-verification badge.');
    try{await navigator.clipboard.writeText(url);if(revision===state.revision)portableStatus('Exact decision link copied. The selectable link remains available below.','success');}
    catch{if(revision===state.revision){$('#capital-share-url').focus();$('#capital-share-url').select();portableStatus('Clipboard access is unavailable. Copy the selected complete link below.','neutral');}}
  }catch(error){if(revision===state.revision){$('#capital-share-area').hidden=true;portableStatus(`Link sharing is unavailable: ${error.message} Download decision JSON to preserve the complete record.`,'error');}}
}
async function previewImport(file){
  const generation=++state.importGeneration;state.preview=null;$('#capital-import-preview').hidden=true;if(!file)return;
  $('#capital-import-file').closest('details').open=true;
  const status=$('#capital-import-status');status.textContent='Validating the complete decision…';status.dataset.state='pending';
  try{
    if(file.size>CAPITAL_RECORD_MAX_BYTES)throw new Error(`The selected JSON exceeds the ${CAPITAL_RECORD_MAX_BYTES/1024} KiB import limit.`);
    const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
    const record=parseCapitalRecord(text);if(generation!==state.importGeneration)return;
    state.preview=record;$('#capital-import-description').textContent=`${record.snapshot.company} · ${record.snapshot.scenarios.length} scenarios · ${record.snapshot.plans.length} plans. Capital objective ${money(record.snapshot.policy.capitalTarget)}; minimum retention ${percent(record.snapshot.policy.retentionFloor)}.`;
    $('#capital-import-selection').textContent=`Analyst selection: ${record.decision.selectedPlanId?labelOf(record.snapshot.plans,record.decision.selectedPlanId):'None'}. ${record.decision.rationale?'A written rationale is included.':'The rationale is an empty draft.'}`;
    $('#capital-import-preview').hidden=false;status.textContent='Valid record. Review the preview before applying it.';status.dataset.state='preview';
  }catch(error){if(generation===state.importGeneration){status.textContent=`Import rejected: ${error.message} Your current draft is unchanged.`;status.dataset.state='error';}}
}
function sameResult(a,b){
  if(Object.is(a,b))return true;if(typeof a!==typeof b||a===null||b===null||typeof a!=='object')return false;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();return ak.length===bk.length&&ak.every((key,index)=>key===bk[index]&&sameResult(a[key],b[key]));
}
async function verify(){
  if(!state.record||state.controller)return;
  const revision=state.revision,expected=copy(state.record.analysis),body=JSON.stringify({action:'capital',snapshot:state.record.snapshot});
  if(new TextEncoder().encode(body).length>16*1024){apiStatus('This valid decision exceeds the API’s 16 KiB request limit. The browser calculation and complete exports remain available.','unavailable');return;}
  const controller=new AbortController();state.controller=controller;setActions();apiStatus('Comparing every scenario, plan, allocation and diagnostic with the deployed API…','pending');
  const timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch('./api/valuation',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body,signal:controller.signal});
    if(!response.ok)throw new Error(`Server returned HTTP ${response.status}.`);
    const payload=await response.json();if(revision!==state.revision||state.controller!==controller)return;
    if(payload.appVersion!==APP_VERSION||payload.modelVersion!==MODEL_VERSION||payload.valuationDate!==VALUATION_DATE||!sameResult(payload.result,expected))throw new Error('The deployed version or complete result differs from the current browser calculation.');
    apiStatus('Verified: all submitted scenarios, plans, allocations, comparison results and pricing intervals match the deployed calculation.','verified');$('#capital-verify').textContent='Complete analysis verified ✓';
  }catch(error){if(revision===state.revision&&state.controller===controller)apiStatus(error.name==='AbortError'?'Verification timed out. The current browser result remains available.':`Verification failed or is unavailable: ${error.message}`,'failed');}
  finally{clearTimeout(timeout);if(state.controller===controller){state.controller=null;setActions();}}
}
function loadHash({initial=false}={}){
  if(location.hash.startsWith('#decision=')){
    try{const record=decodeCapitalShare(location.hash.slice('#decision='.length));applyRecord(record,{origin:'shared',preserveLocation:true,focus:true});$('#capital-notice').hidden=false;$('#capital-notice').textContent='Exact shared decision opened. All calculations were recomputed; no verification badge was imported.';}
    catch(error){$('#capital-notice').hidden=false;$('#capital-notice').textContent=`The shared decision could not be opened: ${error.message} No shared inputs were applied.`;if(initial)showError('This shared decision is invalid. Open the worked decision to start a new comparison, or import a valid record.');}
  }else if(location.hash==='#worked-decision'||initial){applyRecord(createCapitalExample(state.presets,'Anthropic'),{origin:'worked',preserveLocation:true,focus:!initial&&location.hash==='#worked-decision'});}
}
async function fetchJson(path){const response=await fetch(path,{cache:'no-cache'});if(!response.ok)throw new Error(`Could not load ${path}.`);return response.json();}
async function initialize(){
  try{
    const [presets,research]=await Promise.all([fetchJson('./data/presets.json'),fetchJson('./data/research.json')]);
    if(research.modelVersion!==MODEL_VERSION||research.asOf!==VALUATION_DATE)throw new Error('Company evidence does not match the financial model and valuation date.');
    state.presets=presets;state.research=research;state.ready=true;
    for(const control of $$('[data-ready-control]'))control.disabled=false;$('#capital-policy-controls').disabled=false;
    document.addEventListener('input',updateInput);document.addEventListener('change',onChange);document.addEventListener('click',onClick);document.addEventListener('submit',event=>event.preventDefault());
    window.addEventListener('hashchange',()=>{if(state.ready)loadHash();});
    matchMedia('(max-width:650px)').addEventListener('change',()=>{if(state.record)renderPlans(state.record.analysis);});
    loadHash({initial:true});
    $('#capital-version').textContent=`Application ${APP_VERSION} · Capital method ${CAPITAL_VERSION} · Financial engine ${MODEL_VERSION}. Developed with AI assistance. Financial snapshot: ${VALUATION_DATE}.`;
  }catch(error){state.ready=false;showError(`Capital Strategy could not load: ${error.message} Reload to try again, or open the standalone research brief.`);}
}
initialize();
