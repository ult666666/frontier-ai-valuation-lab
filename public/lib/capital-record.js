import {MODEL_VERSION,VALUATION_DATE} from './model.js';
import {CAPITAL_VERSION,validateCapitalSnapshot,capitalStrategy} from './capital-strategy.js';

export const CAPITAL_RECORD_MAX_BYTES=256*1024;
export const CAPITAL_DECISION_TEXT_LIMIT=1500;
const KIND='frontier-capital-decision';
const RECORD_KEYS=['kind','schema','modelVersion','valuationDate','capitalVersion','snapshot','decision','analysis'];
const DECISION_KEYS=['selectedPlanId','rationale','tradeoff','reviewTrigger','informationNeeded'];
const encoder=new TextEncoder();

export class CapitalRecordError extends Error{
  constructor(message,code='validation'){super(message);this.name='CapitalRecordError';this.code=code;}
}
const fail=(message,code)=>{throw new CapitalRecordError(message,code);};

function dataRecord(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail(`${label} must be a plain object.`);
  const own=Reflect.ownKeys(value);
  if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key)))fail(`${label} has missing or unsupported fields.`);
  const result={};
  for(const key of keys){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)fail(`${label}.${key} must be an enumerable data property.`);
    result[key]=descriptor.value;
  }
  return result;
}

function decisionText(value,key){
  if(typeof value!=='string')fail(`Decision.${key} must be plain text.`);
  const points=Array.from(value);
  if(points.length>CAPITAL_DECISION_TEXT_LIMIT)fail(`Decision.${key} exceeds the ${CAPITAL_DECISION_TEXT_LIMIT} Unicode code-point limit.`);
  if(points.some(character=>{const point=character.codePointAt(0);return point>=0xD800&&point<=0xDFFF;}))fail(`Decision.${key} must contain well-formed Unicode text.`);
  // Paragraphs and tabs are allowed; other C0/C1 controls are not analyst prose.
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(value))fail(`Decision.${key} contains unsupported control characters.`);
  return value;
}

function normalizeDecision(value,snapshot){
  const input=dataRecord(value,DECISION_KEYS,'Decision');
  if(input.selectedPlanId!==null&&(typeof input.selectedPlanId!=='string'||!snapshot.plans.some(plan=>plan.id===input.selectedPlanId)))fail('The selected plan must be null or an ID in the current decision.');
  const decision={selectedPlanId:input.selectedPlanId};
  for(const key of DECISION_KEYS.slice(1))decision[key]=decisionText(input[key],key);
  return decision;
}

/** A complete detached record. Analyst preferences never change the calculation. */
export function createCapitalRecord(snapshot,decision){
  const checked=validateCapitalSnapshot(snapshot),notes=normalizeDecision(decision,checked);
  const analysis=capitalStrategy(checked);
  return {kind:KIND,schema:1,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,capitalVersion:CAPITAL_VERSION,snapshot:checked,decision:notes,analysis};
}

/** Validate metadata and inputs; supplied analytical output is deliberately ignored. */
export function normalizeCapitalRecord(value){
  const record=dataRecord(value,RECORD_KEYS,'Capital decision record');
  if(record.kind!==KIND||record.schema!==1)fail('This file uses an unsupported capital decision record format.','incompatible');
  if(record.modelVersion!==MODEL_VERSION||record.valuationDate!==VALUATION_DATE||record.capitalVersion!==CAPITAL_VERSION)fail('This decision belongs to a different financial model, valuation date or capital method. Open it with the matching release.','incompatible');
  return createCapitalRecord(record.snapshot,record.decision);
}

/** A bounded UTF-8 import never accepts stored results as a verification claim. */
export function parseCapitalRecord(text){
  if(typeof text!=='string')fail('The decision import must be JSON text.');
  if(text.length>CAPITAL_RECORD_MAX_BYTES||encoder.encode(text).byteLength>CAPITAL_RECORD_MAX_BYTES)fail('The capital decision import exceeds the 256 KiB UTF-8 size limit.','capacity');
  let parsed;
  try{parsed=JSON.parse(text);}catch{fail('The decision import must contain readable JSON.');}
  return normalizeCapitalRecord(parsed);
}
