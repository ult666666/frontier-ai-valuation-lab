import {MODEL_VERSION,VALUATION_DATE} from './model.js';

const COMPANIES=Object.freeze(['Anthropic','OpenAI']);
const RELATIONSHIPS=Object.freeze(['context','arithmetic_component','method','boundary']);
const ASSUMPTION_STATUS='Analyst or user assumption';

function freeze(value){
  if(value&&typeof value==='object'){
    for(const item of Object.values(value))freeze(item);
    Object.freeze(value);
  }
  return value;
}

export const EVIDENCE_FIELDS=freeze([
  {key:'rev2026',label:'2026 model revenue',unit:'bn',definition:'Illustrative full-year revenue in USD billions. Actual-period revenue and annualized pace remain separate observations.',limit:'Above $0B and no more than $10,000B.'},
  {key:'g1',label:'2027–2030 annual growth',unit:'%',definition:'Revenue growth applied in each of the four years from 2027 through 2030.',limit:'0% to 200%.'},
  {key:'g2',label:'2031–2033 annual growth',unit:'%',definition:'Revenue growth applied in each of the three years from 2031 through 2033.',limit:'0% to 200%.'},
  {key:'g3',label:'2034–2036 annual growth',unit:'%',definition:'Revenue growth applied in the final three forecast years, before the terminal period begins.',limit:'0% to 200%; no lower than perpetual growth.'},
  {key:'m27',label:'2027 EBIT margin',unit:'%',definition:'Operating profit as a share of revenue. Annual margins interpolate between the 2027, 2030 and 2036 anchors.',limit:'−100% to 100%.'},
  {key:'m30',label:'2030 EBIT margin',unit:'%',definition:'The middle operating-margin anchor. Tax applies only when EBIT is positive.',limit:'−100% to 100%.'},
  {key:'m36',label:'2036 EBIT margin',unit:'%',definition:'The final explicit and terminal EBIT margin. Changing this also changes the interpolated margin path for 2031–2036.',limit:'Above 0% and no more than 100%.'},
  {key:'turns',label:'Sales / invested capital',unit:'×',definition:'Incremental revenue divided by net reinvestment. Reinvestment includes net capital expenditure and working capital.',limit:'0.05× to 100×.'},
  {key:'wacc',label:'Cost of capital',unit:'%',definition:'The weighted average cost of capital discounts the remaining-2026 cash flow, all explicit forecast cash flows and terminal value.',limit:'Above perpetual growth and no more than 60%.'},
  {key:'tg',label:'Perpetual growth',unit:'%',definition:'Annual growth after 2036. The terminal reinvestment rate equals perpetual growth divided by terminal ROIC.',limit:'At least 0%; below both WACC and terminal ROIC, and no higher than 2034–2036 growth.'},
  {key:'roic',label:'Terminal ROIC',unit:'%',definition:'Return on invested capital in the terminal period. It determines the reinvestment needed to support perpetual growth.',limit:'Above perpetual growth and no more than 100%.'},
  {key:'stub',label:'Remaining-2026 FCFF',unit:'bn',definition:'Free cash flow to the firm from 18 October through 31 December 2026. Negative values are outflows; this cash flow is included once.',limit:'−$10,000B to $10,000B.'},
  {key:'tax',label:'Tax on positive EBIT',unit:'%',definition:'Tax on positive operating profit. The model provides no loss benefit or tax-loss carryforward.',limit:'0% to below 100%.'}
]);
export const EVIDENCE_INPUT_KEYS=Object.freeze(EVIDENCE_FIELDS.map(field=>field.key));

export function evidenceButtonLabel(key){
  const field=EVIDENCE_FIELDS.find(item=>item.key===key);
  if(!field)throw new Error(`Unknown assumption: ${String(key)}.`);
  return `Evidence for ${field.label}`;
}

/** Preserve the shortest round-trippable input digits when displaying its units. */
export function formatEvidenceValue(key,value){
  const field=EVIDENCE_FIELDS.find(item=>item.key===key);
  if(!field)throw new Error(`Unknown assumption: ${String(key)}.`);
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error('An evidence-panel value must be finite.');
  const sign=value<0?'−':'',raw=String(Math.abs(value));
  if(field.unit==='bn')return `${sign}$${raw}B`;
  if(field.unit==='×')return `${sign}${raw}×`;
  let percentage;
  if(raw.includes('e')){
    const [coefficient,exponent]=raw.split('e'),shifted=Number(exponent)+2;
    percentage=shifted===0?coefficient:`${coefficient}e${shifted}`;
  }else{
    const [whole,fraction='']=raw.split('.'),digits=whole+fraction,point=whole.length+2;
    const integer=digits.slice(0,point).padEnd(point,'0').replace(/^0+(?=\d)/,'');
    const decimal=digits.slice(point).replace(/0+$/,'');
    percentage=decimal?`${integer}.${decimal}`:integer;
  }
  return `${sign}${percentage}%`;
}

function record(value,label,keys=null){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`${label} must be a plain record.`);
  for(const key of Reflect.ownKeys(value)){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw new Error(`${label} must contain enumerable data fields.`);
    if(keys&&!keys.includes(key))throw new Error(`${label} has unsupported field ${key}.`);
  }
  if(keys&&keys.some(key=>!Object.hasOwn(value,key)))throw new Error(`${label} is missing a required field.`);
  return value;
}
function text(value,label,max=2000){
  if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`${label} must have a length from 1 to ${max}.`);
  return value;
}
function array(value,label,max=100){
  if(!Array.isArray(value)||value.length>max)throw new Error(`${label} must be an array of at most ${max} entries.`);
  for(let i=0;i<value.length;i++)if(!Object.hasOwn(value,i))throw new Error(`${label} must not contain missing entries.`);
  return value;
}
function unique(values,label){
  const seen=new Set();
  for(const value of values){
    if(seen.has(value))throw new Error(`Duplicate ${label}: ${String(value)}.`);
    seen.add(value);
  }
}
function ids(value,label,max=100){
  const result=array(value,label,max).map(item=>text(item,label,100));
  unique(result,label);
  return result;
}
function knownCompany(company){
  if(!COMPANIES.includes(company))throw new Error(`Unknown company: ${String(company)}.`);
  return company;
}
function webUrl(value,label){
  text(value,label,2000);
  let url;
  try{url=new URL(value);}catch{throw new Error(`${label} must be a safe web URL.`);}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error(`${label} must be a safe web URL.`);
  return value;
}
function datum(value,label,depth=0){
  if(depth>5)throw new Error(`${label} exceeds the supported datum depth.`);
  if(typeof value==='number'){
    if(!Number.isFinite(value))throw new Error(`${label} must contain finite numbers.`);
    return value;
  }
  if(typeof value==='string')return text(value,label);
  if(typeof value==='boolean'||value===null)return value;
  if(Array.isArray(value))return array(value,label,64).map(item=>datum(item,label,depth+1));
  const input=record(value,label),entries=Object.entries(input);
  if(entries.length>64)throw new Error(`${label} has too many datum fields.`);
  return Object.fromEntries(entries.map(([key,item])=>[text(key,`${label} field`,160),datum(item,`${label}.${key}`,depth+1)]));
}

/** Join the unchanged research snapshot with explicit, curated assumption context. */
export function buildEvidenceCatalog({research,ledger,mapping}){
  record(research,'Research');record(ledger,'Fact ledger');
  record(mapping,'Assumption mapping',['schemaVersion','modelVersion','valuationDate','sourceCompanies','contexts']);
  if(mapping.schemaVersion!==1||mapping.modelVersion!==MODEL_VERSION||mapping.valuationDate!==VALUATION_DATE||research.modelVersion!==MODEL_VERSION||research.asOf!==VALUATION_DATE)throw new Error('Evidence, mapping and financial model must use the same supported snapshot.');
  record(research.companies,'Research companies');
  if(Object.keys(research.companies).length!==COMPANIES.length||COMPANIES.some(company=>!Object.hasOwn(research.companies,company)))throw new Error('The evidence snapshot must identify Anthropic and OpenAI.');
  record(ledger.metadata,'Fact ledger metadata');
  const cutoff=text(research.researchCutoff,'Research cutoff',100);
  if(!Number.isFinite(Date.parse(cutoff))||ledger.metadata.as_of!==cutoff||Date.parse(ledger.metadata.as_of_utc)!==Date.parse(cutoff)||ledger.metadata.retrieved_on!==VALUATION_DATE)throw new Error('The ledger and research cutoff must identify the same frozen snapshot.');

  const sources=array(research.sources,'Research sources').map(value=>{
    const source=record(value,'Research source',['id','publisher','date','title','url','type','use','limit']);
    const result={};
    for(const key of ['id','publisher','date','title','url','type','use','limit'])result[key]=key==='url'?webUrl(source[key],`${source.id} source URL`):text(source[key],`Source ${key}`,key==='id'?100:2000);
    return result;
  });
  unique(sources.map(source=>source.id),'source');
  const sourceMap=new Map(sources.map(source=>[source.id,source]));
  const scopes=array(mapping.sourceCompanies,'Source scopes').map(value=>{
    const scope=record(value,'Source scope',['id','companies']);
    if(!sourceMap.has(scope.id))throw new Error(`Unknown source in source scope: ${scope.id}.`);
    const companies=ids(scope.companies,'company in source scope',2).map(knownCompany);
    if(!companies.length)throw new Error(`Missing company for source scope ${scope.id}.`);
    return {id:scope.id,companies};
  });
  unique(scopes.map(scope=>scope.id),'source scope');
  const scopeMap=new Map(scopes.map(scope=>[scope.id,scope.companies]));
  if(sources.some(source=>!scopeMap.has(source.id)))throw new Error('Every research source needs an explicit source scope.');
  for(const source of sources)source.companies=[...scopeMap.get(source.id)];

  const ledgerSources=array(ledger.sources,'Ledger sources');
  for(const source of ledgerSources)record(source,'Ledger source');
  unique(ledgerSources.map(source=>source.id),'ledger source');
  const ledgerSourceIds=new Set();
  for(const source of ledgerSources){
    if(!sourceMap.has(source.id))throw new Error(`Unknown source in ledger: ${source.id}.`);
    if(source.url!==sourceMap.get(source.id).url)throw new Error(`Ledger source URL differs from the research register for ${source.id}.`);
    ledgerSourceIds.add(source.id);
  }
  const facts=array(ledger.facts,'Ledger facts').map(value=>{
    const fact=record(value,'Ledger fact'),company=knownCompany(fact.entity);
    if(!sourceMap.has(fact.source)||!ledgerSourceIds.has(fact.source))throw new Error(`Unknown source for fact ${fact.id}: ${fact.source}.`);
    if(!scopeMap.get(fact.source).includes(company))throw new Error(`Fact ${fact.id} refers to a source for a different company.`);
    return {
      id:text(fact.id,'Fact ID',100),company,metric:text(fact.metric,`${fact.id} metric`),
      value:datum(fact.value,`${fact.id} datum`),unit:text(fact.unit,`${fact.id} unit`),
      observationLabel:text(fact.observation_date,`${fact.id} observation`),
      evidenceStatus:text(fact.status,`${fact.id} evidence status`,160),sourceIds:[fact.source],
      modelImplication:text(fact.model_implication,`${fact.id} model implication`)
    };
  });
  unique(facts.map(fact=>fact.id),'fact');
  const factMap=new Map(facts.map(fact=>[fact.id,fact]));

  const contexts=array(mapping.contexts,'Assumption contexts',64).map(value=>{
    const context=record(value,'Assumption context',['id','company','inputKeys','relationship','title','summary','limitation','factIds','sourceIds']);
    const id=text(context.id,'Context ID',100),company=knownCompany(context.company);
    const inputKeys=ids(context.inputKeys,`${id} input`,13);
    if(!inputKeys.length)throw new Error(`Context ${id} needs a model input.`);
    for(const key of inputKeys)if(!EVIDENCE_INPUT_KEYS.includes(key))throw new Error(`Unknown assumption in ${id}: ${key}.`);
    if(!RELATIONSHIPS.includes(context.relationship))throw new Error(`Unsupported relationship in ${id}.`);
    const factIds=ids(context.factIds,`${id} fact`,100),directSources=ids(context.sourceIds,`${id} source`,100);
    const relatedSources=new Set(directSources);
    for(const factId of factIds){
      const fact=factMap.get(factId);
      if(!fact)throw new Error(`Unknown fact in ${id}: ${factId}.`);
      if(fact.company!==company)throw new Error(`Context ${id} refers to a fact for a different company.`);
      for(const sourceId of fact.sourceIds)relatedSources.add(sourceId);
    }
    for(const sourceId of relatedSources){
      if(!sourceMap.has(sourceId))throw new Error(`Unknown source in ${id}: ${sourceId}.`);
      if(!scopeMap.get(sourceId).includes(company))throw new Error(`Context ${id} refers to a source for a different company.`);
    }
    if(!relatedSources.size&&context.relationship!=='boundary')throw new Error(`Only a boundary relationship may have no related source in ${id}.`);
    return {
      id,company,inputKeys,relationship:context.relationship,title:text(context.title,`${id} title`,200),
      summary:text(context.summary,`${id} summary`),limitation:text(context.limitation,`${id} limitation`),
      factIds,sourceIds:sources.filter(source=>relatedSources.has(source.id)).map(source=>source.id)
    };
  });
  unique(contexts.map(context=>context.id),'context');
  const companies={};
  for(const company of COMPANIES){
    const inputs={};
    for(const field of EVIDENCE_FIELDS){
      const contextIds=contexts.filter(context=>context.company===company&&context.inputKeys.includes(field.key)).map(context=>context.id);
      if(!contextIds.length)throw new Error(`No context for ${company} assumption ${field.key}.`);
      inputs[field.key]={...field,status:ASSUMPTION_STATUS,contextIds};
    }
    companies[company]={inputs};
  }
  return freeze({schemaVersion:1,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,researchCutoff:cutoff,currency:text(research.currency,'Research currency',100),companies,sources,facts,contexts});
}
