import {project,MODEL_VERSION,VALUATION_DATE} from './lib/model.js';
import {EVIDENCE_FIELDS,EVIDENCE_INPUT_KEYS,formatEvidenceValue} from './lib/evidence.js';

const RELATIONSHIP_LABELS={context:'Related evidence',arithmetic_component:'Arithmetic component',method:'Valuation method',boundary:'Boundary of the evidence'};
const STATUS_LABELS={
  company_disclosed:'Company disclosure',
  company_disclosed_historical_capital_structure:'Historical company disclosure',
  company_disclosed_monthly_pace:'Company-disclosed monthly pace',
  company_disclosed_run_rate:'Company-disclosed annualized pace',
  reported_actual_period:'Reported actual period',
  reported_commitments:'Reported commitments',
  reported_historical_financials:'Reported historical financials',
  reported_historical_financials_and_reuters_analysis:'Reported financials and Reuters analysis',
  reported_investor_expectation:'Reported investor expectation',
  reported_management_forecast:'Reported management forecast',
  reported_proposal_unverified_by_reuters:'Reported proposal; not independently verified by Reuters',
  reported_proposed_financing:'Reported proposed financing',
  reported_run_rate:'Reported annualized pace'
};
let nextDialog=0;

function element(tag,className='',text){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text!==undefined)node.textContent=String(text);
  return node;
}
function safeUrl(value){
  try{
    const url=new URL(value);
    return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;
  }catch{return null;}
}
function indexed(items,label,max){
  if(!Array.isArray(items)||items.length>max)throw new Error(`The evidence ${label} are unavailable.`);
  const result=new Map();
  for(const item of items){
    if(!item||typeof item.id!=='string'||result.has(item.id))throw new Error(`The evidence ${label} contain a missing or duplicate ID.`);
    result.set(item.id,item);
  }
  return result;
}
function catalogMaps(research,catalog){
  if(!research||!catalog||catalog.schemaVersion!==1||catalog.modelVersion!==MODEL_VERSION||catalog.valuationDate!==VALUATION_DATE||research.modelVersion!==MODEL_VERSION||research.asOf!==VALUATION_DATE||catalog.researchCutoff!==research.researchCutoff)throw new Error('Evidence context does not match this model and research snapshot.');
  const sources=indexed(catalog.sources,'sources',100),facts=indexed(catalog.facts,'facts',100),contexts=indexed(catalog.contexts,'contexts',64);
  const originalSources=indexed(research.sources,'research sources',100);
  if(sources.size!==originalSources.size)throw new Error('The evidence source register is incomplete.');
  for(const [id,source] of sources){
    const original=originalSources.get(id);
    if(!original||!safeUrl(source.url)||['publisher','date','title','url','type','use','limit'].some(key=>source[key]!==original[key]))throw new Error(`Evidence source ${id} does not match the research register.`);
  }
  for(const company of ['Anthropic','OpenAI']){
    for(const key of EVIDENCE_INPUT_KEYS){
      const input=catalog.companies?.[company]?.inputs?.[key];
      if(!input||input.key!==key||input.status!=='Analyst or user assumption'||!Array.isArray(input.contextIds)||!input.contextIds.length)throw new Error(`Evidence context for ${company} ${key} is unavailable.`);
      for(const id of input.contextIds){
        const context=contexts.get(id);
        if(!context||context.company!==company||!context.inputKeys?.includes(key)||!RELATIONSHIP_LABELS[context.relationship]||typeof context.summary!=='string'||typeof context.limitation!=='string')throw new Error(`Evidence context ${id} is inconsistent.`);
        if(!Array.isArray(context.factIds)||!Array.isArray(context.sourceIds))throw new Error(`Evidence context ${id} has invalid references.`);
        for(const factId of context.factIds){
          const fact=facts.get(factId);
          if(!fact||fact.company!==company||!Array.isArray(fact.sourceIds)||fact.sourceIds.some(sourceId=>!sources.has(sourceId)))throw new Error(`Evidence fact ${factId} is inconsistent.`);
        }
        if(context.sourceIds.some(sourceId=>!sources.has(sourceId)))throw new Error(`Evidence context ${id} has an unknown source.`);
      }
    }
  }
  return {sources,facts,contexts};
}
function datumLabel(key){
  const label=key.replaceAll('_',' ').replace(/\b(q[1-4]|fcf|ip|aws|ipo)\b/gi,match=>match.toUpperCase());
  return label.charAt(0).toUpperCase()+label.slice(1);
}
function appendDatum(list,key,value){
  const row=element('div','ec-datum-row');
  row.append(element('dt','',datumLabel(key)));
  const detail=element('dd');
  if(value!==null&&typeof value==='object'){
    const nested=element('dl','ec-datum-list');
    for(const [nestedKey,nestedValue] of Object.entries(value))appendDatum(nested,nestedKey,nestedValue);
    detail.append(nested);
  }else detail.textContent=String(value);
  row.append(detail);list.append(row);
}
function sourceRecord(source){
  const record=element('div','ec-source');
  const link=element('a','ec-source-link',`${source.id} · ${source.publisher} — ${source.title}`);
  link.href=safeUrl(source.url);link.target='_blank';link.rel='noopener noreferrer';
  link.setAttribute('aria-label',`${source.id}, ${source.publisher}, ${source.title} (opens in a new tab)`);
  record.append(link,element('p','ec-source-date',`Publication: ${source.date}`));
  const limitation=element('p','ec-source-limit');
  limitation.append(element('strong','','Source limitation. '),document.createTextNode(source.limit));
  record.append(limitation);
  const details=element('details','ec-source-use');
  details.append(element('summary','','How this source is used'),element('p','',source.use));
  record.append(details);return record;
}
function factRecord(fact,sources){
  const card=element('article','ec-fact');card.dataset.evidenceFact=fact.id;
  card.append(element('p','ec-record-class',STATUS_LABELS[fact.evidenceStatus]||datumLabel(fact.evidenceStatus)),element('h4','',fact.metric));
  const period=element('p','ec-observation');
  period.append(element('strong','','Observation / period: '),document.createTextNode(fact.observationLabel));
  card.append(period,element('p','ec-datum-unit',`Recorded units: ${fact.unit}`));
  const values=element('dl','ec-datum-list');
  if(fact.value!==null&&typeof fact.value==='object'){
    for(const [key,value] of Object.entries(fact.value))appendDatum(values,key,value);
  }else appendDatum(values,'Recorded value',fact.value);
  card.append(values);
  const implication=element('p','ec-implication');
  implication.append(element('strong','','Model relevance. '),document.createTextNode(fact.modelImplication));
  card.append(implication);
  for(const id of fact.sourceIds)card.append(sourceRecord(sources.get(id)));
  return card;
}

/**
 * Mount a reusable, read-only native dialog. Call open with the current draft,
 * using an empty cases array when the draft cannot be valued.
 */
export function createEvidenceContext({research,catalog}){
  const maps=catalogMaps(research,catalog),dialog=element('dialog','evidence-context-dialog');
  if(typeof dialog.showModal!=='function')throw new Error('This browser does not support the evidence dialog.');
  const prefix=`evidence-context-${++nextDialog}`;
  dialog.id=prefix;dialog.setAttribute('aria-labelledby',`${prefix}-title`);dialog.setAttribute('aria-describedby',`${prefix}-description`);
  let opener=null,destroyed=false;
  function restoreFocus(){
    const target=opener;opener=null;
    if(target?.isConnected&&typeof target.focus==='function')target.focus({preventScroll:true});
  }
  function close(){
    if(dialog.open)dialog.close();
    restoreFocus();
  }
  function cancel(event){event.preventDefault();close();}
  function containTab(event){
    if(event.key!=='Tab'||event.altKey||event.ctrlKey||event.metaKey)return;
    const controls=[...dialog.querySelectorAll('button:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])')].filter(node=>node.getClientRects().length>0);
    if(!controls.length)return;
    const index=controls.indexOf(document.activeElement);
    if(event.shiftKey&&index<=0){event.preventDefault();controls.at(-1).focus();}
    else if(!event.shiftKey&&index===controls.length-1){event.preventDefault();controls[0].focus();}
  }
  dialog.addEventListener('cancel',cancel);dialog.addEventListener('close',restoreFocus);dialog.addEventListener('keydown',containTab);
  document.body.append(dialog);

  function open({company,key,cases=[]}){
    if(destroyed)throw new Error('This evidence dialog has been destroyed.');
    const field=EVIDENCE_FIELDS.find(item=>item.key===key),input=catalog.companies?.[company]?.inputs?.[key];
    if(!field||!input)throw new Error('Choose a supported company and assumption for evidence context.');
    if(!Array.isArray(cases)||cases.length>2)throw new Error('Evidence context accepts zero, one or two current cases.');
    const currentCases=cases.map(item=>{
      if(!item||typeof item.label!=='string'||!item.label.trim()||item.label.length>100)throw new Error('Each evidence case needs a label of 1–100 characters.');
      project(item.assumptions);
      return {label:item.label,value:item.assumptions[key]};
    });

    const shell=element('div','ec-shell'),header=element('header','ec-header'),headingGroup=element('div','ec-heading-group');
    headingGroup.append(element('p','ec-kicker',`${company} / Evidence & assumptions`));
    const heading=element('h2','',field.label);heading.id=`${prefix}-title`;heading.tabIndex=-1;
    headingGroup.append(heading);header.append(headingGroup);
    const closeButton=element('button','ec-close','Close ×');closeButton.type='button';closeButton.setAttribute('aria-label','Close evidence context');closeButton.addEventListener('click',close);header.append(closeButton);
    const body=element('div','ec-body');
    const description=element('p','ec-description','Forecast values are analyst or user assumptions. Related evidence gives context and does not certify a selected input.');
    description.id=`${prefix}-description`;body.append(description);

    const current=element('section','ec-current');current.setAttribute('aria-label','Current assumption values');
    if(currentCases.length){
      for(const item of currentCases){
        const card=element('article','ec-current-case');
        card.append(element('p','ec-case-label',item.label));
        const value=element('p','ec-current-value',formatEvidenceValue(key,item.value));
        value.dataset.evidenceValue=String(item.value);value.dataset.evidenceKey=key;
        card.append(value,element('p','ec-assumption-status','Analyst or user assumption'));current.append(card);
      }
    }else{
      const unavailable=element('div','ec-current-unavailable');
      unavailable.append(element('h3','','Current input unavailable'),element('p','','Correct the current draft to inspect its value. The dated evidence below remains available.'));current.append(unavailable);
    }
    body.append(current);
    const definition=element('section','ec-definition');definition.setAttribute('aria-label','Model definition and input limits');
    definition.append(element('p','',field.definition));
    const limits=element('p','ec-input-limit');limits.append(element('strong','','Permitted input: '),document.createTextNode(field.limit));definition.append(limits);body.append(definition);

    for(const id of input.contextIds){
      const context=maps.contexts.get(id),section=element('section','ec-context');section.dataset.evidenceContext=id;
      const title=element('h3','',context.title);title.id=`${prefix}-${id}`;section.setAttribute('aria-labelledby',title.id);
      section.append(element('p','ec-relation',RELATIONSHIP_LABELS[context.relationship]),title,element('p','ec-context-summary',context.summary));
      const boundary=element('p','ec-boundary');boundary.append(element('strong','','Evidence limits. '),document.createTextNode(context.limitation));section.append(boundary);
      const usedSources=new Set();
      if(context.factIds.length){
        const claims=element('div','ec-facts');
        for(const factId of context.factIds){
          const fact=maps.facts.get(factId);claims.append(factRecord(fact,maps.sources));
          fact.sourceIds.forEach(sourceId=>usedSources.add(sourceId));
        }
        section.append(claims);
      }
      for(const sourceId of context.sourceIds)if(!usedSources.has(sourceId))section.append(sourceRecord(maps.sources.get(sourceId)));
      if(!context.sourceIds.length)section.append(element('p','ec-no-source','No direct company source establishes this numerical input in the research snapshot.'));
      body.append(section);
    }
    const footer=element('footer','ec-footer');
    footer.append(element('p','',`Research snapshot: ${catalog.valuationDate} · Financial engine ${catalog.modelVersion}`),element('p','ec-footer-note','Observation periods and publication dates remain separate. Source links open in a new tab.'));
    shell.append(header,body,footer);
    if(!dialog.open)opener=document.activeElement;
    dialog.replaceChildren(shell);dialog.dataset.evidenceCompany=company;dialog.dataset.evidenceKey=key;
    if(!dialog.open)dialog.showModal();
    heading.focus({preventScroll:true});body.scrollTop=0;
  }
  function destroy(){
    close();destroyed=true;dialog.removeEventListener('cancel',cancel);dialog.removeEventListener('close',restoreFocus);dialog.removeEventListener('keydown',containTab);dialog.remove();
  }
  return Object.freeze({open,close,destroy});
}
