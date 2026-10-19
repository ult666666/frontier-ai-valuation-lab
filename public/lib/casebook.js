import {project,MODEL_VERSION,VALUATION_DATE} from './model.js';
import {encodeScenario,decodeScenario,scenarioUrl} from './share.js';
import {encodeThesis,decodeThesis,thesisUrl} from './thesis-share.js';

export const CASEBOOK_LIMITS=Object.freeze({
  entries:24,title:100,rationale:1200,keyAssumption:600,reviewTrigger:1000,sources:19,bytes:512*1024
});
const ENTRY_KEYS=['id','kind','title','createdAt','updatedAt','token','notes','sourceIds'];
const BOOK_KEYS=['schema','modelVersion','valuationDate','researchCutoff','entries'];
const NOTE_KEYS=['rationale','keyAssumption','reviewTrigger'];
const META_KEYS=['id','title','createdAt','updatedAt','notes','sourceIds'];
const encoder=new TextEncoder();

export class CasebookError extends Error{
  constructor(message,code='validation'){super(message);this.name='CasebookError';this.code=code;}
}
const fail=(message,code)=>{throw new CasebookError(message,code);};

function record(value,required,label,allowed=required){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail(label+' must be a plain object.');
  const result={};
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||!allowed.includes(key))fail(label+' has an unsupported field.');
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)fail(label+'.'+key+' must be an enumerable data property.');
    result[key]=descriptor.value;
  }
  for(const key of required)if(!Object.hasOwn(result,key))fail(label+' is missing field '+key+'.');
  return result;
}
function array(value,label,maximum){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>maximum)fail(label+' must be an array with at most '+maximum+' entries.');
  const keys=Reflect.ownKeys(value);
  if(keys.length!==value.length+1||keys.some(key=>key!=='length'&&(typeof key!=='string'||!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=value.length)))fail(label+' has missing or unsupported array entries.');
  const result=[];
  for(let i=0;i<value.length;i++){
    const descriptor=Object.getOwnPropertyDescriptor(value,String(i));
    if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)fail(label+' entries must be enumerable data properties.');
    result.push(descriptor.value);
  }
  return result;
}
function text(value,label,maximum,{required=false}={}){
  if(typeof value!=='string')fail(label+' must be plain text.');
  if(value.length>maximum)fail(label+' exceeds the '+maximum+' character limit.');
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value))fail(label+' contains unsupported control characters.');
  if(required&&!value.trim())fail(label+' must not be empty.');
  return required?value.trim():value;
}
function identifier(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(value))fail('Entry ID must contain 1–100 letters, numbers, dots, underscores, colons or hyphens.');
  return value;
}
function timestamp(value,label){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail(label+' must be a valid ISO timestamp in UTC, including milliseconds.');
  return value;
}
function researchInfo(research){
  if(!research||research.modelVersion!==MODEL_VERSION||research.asOf!==VALUATION_DATE||typeof research.researchCutoff!=='string'||!Number.isFinite(Date.parse(research.researchCutoff))||!Array.isArray(research.sources))fail('A matching dated research snapshot is required.','incompatible');
  const sourceIds=research.sources.map(source=>source?.id);
  if(sourceIds.length>CASEBOOK_LIMITS.sources||sourceIds.some(id=>typeof id!=='string'||!/^S\d{2}$/.test(id))||new Set(sourceIds).size!==sourceIds.length)fail('The research snapshot must provide unique known source IDs.');
  return {researchCutoff:research.researchCutoff,sourceIds};
}
function canonicalSnapshot(kind,token){
  try{
    if(kind==='scenario'){
      const snapshot=decodeScenario(token);
      if(snapshot.bridge!==null)snapshot.bridge={cash:snapshot.bridge.cash,debt:snapshot.bridge.debt,otherClaims:snapshot.bridge.otherClaims};
      return {snapshot,token:encodeScenario(snapshot)};
    }
    if(kind==='thesis'){
      const snapshot=decodeThesis(token);
      return {snapshot,token:encodeThesis(snapshot)};
    }
    fail('Entry kind must be scenario or thesis.');
  }catch(error){
    if(error instanceof CasebookError)throw error;
    fail('The saved calculation is invalid: '+error.message);
  }
}
function plainJson(value){return JSON.stringify(value,null,2)+'\n';}
function boundedText(value,label){
  if(typeof value!=='string')fail(label+' must be JSON text.');
  if(encoder.encode(value).byteLength>CASEBOOK_LIMITS.bytes)fail(label+' exceeds the 512 KiB UTF-8 size limit.','capacity');
  return value;
}
function parseJson(value,label){
  boundedText(value,label);
  try{return JSON.parse(value);}
  catch{fail(label+' must contain readable JSON.');}
}
function newId(){
  if(typeof globalThis.crypto?.randomUUID==='function')return globalThis.crypto.randomUUID();
  return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
}

/** Validate a detached snapshot. Analyst text never enters the financial token. */
export function normalizeEntry(value,research){
  const input=record(value,ENTRY_KEYS,'Entry'),info=researchInfo(research);
  const id=identifier(input.id),title=text(input.title,'Title',CASEBOOK_LIMITS.title,{required:true});
  const createdAt=timestamp(input.createdAt,'Created date'),updatedAt=timestamp(input.updatedAt,'Updated date');
  if(updatedAt<createdAt)fail('Updated date cannot precede the created date.');
  const {token}=canonicalSnapshot(input.kind,input.token);
  const suppliedNotes=record(input.notes,NOTE_KEYS,'Notes'),notes={};
  for(const key of NOTE_KEYS)notes[key]=text(suppliedNotes[key],key,CASEBOOK_LIMITS[key]);
  const suppliedSources=array(input.sourceIds,'Source IDs',CASEBOOK_LIMITS.sources);
  if(suppliedSources.some(id=>typeof id!=='string'||!info.sourceIds.includes(id))||new Set(suppliedSources).size!==suppliedSources.length)fail('Source IDs must be unique references from the dated research register.');
  const sourceIds=info.sourceIds.filter(id=>suppliedSources.includes(id));
  return {id,kind:input.kind,title,createdAt,updatedAt,token,notes,sourceIds};
}

export function normalizeCasebook(value,research){
  const input=record(value,BOOK_KEYS,'Casebook'),info=researchInfo(research);
  if(input.schema!==1)fail('This casebook uses an unsupported schema.','incompatible');
  if(input.modelVersion!==MODEL_VERSION||input.valuationDate!==VALUATION_DATE||input.researchCutoff!==info.researchCutoff)fail('This casebook belongs to a different financial model, valuation date or research cutoff. Open it with the matching research release.','incompatible');
  const entries=array(input.entries,'Casebook entries',CASEBOOK_LIMITS.entries).map(entry=>normalizeEntry(entry,research));
  if(new Set(entries.map(entry=>entry.id)).size!==entries.length)fail('Casebook entry IDs must be unique; duplicate IDs are not accepted.');
  const result={schema:1,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,researchCutoff:info.researchCutoff,entries};
  boundedText(plainJson(result),'Casebook');
  return result;
}

export function createCasebook(entries,research){
  return normalizeCasebook({schema:1,modelVersion:MODEL_VERSION,valuationDate:VALUATION_DATE,researchCutoff:researchInfo(research).researchCutoff,entries},research);
}

function createEntry(kind,token,metadata,research){
  const input=record(metadata,['title'],'Entry metadata',META_KEYS),createdAt=input.createdAt??new Date().toISOString();
  return normalizeEntry({id:input.id??newId(),kind,title:input.title,createdAt,updatedAt:input.updatedAt??createdAt,token,
    notes:input.notes??{rationale:'',keyAssumption:'',reviewTrigger:''},sourceIds:input.sourceIds??[]},research);
}
export function createScenarioEntry(scenario,metadata,research){return createEntry('scenario',encodeScenario(scenario),metadata,research);}
export function createThesisEntry(draft,metadata,research){return createEntry('thesis',encodeThesis(draft),metadata,research);}

/** Decoded values are fresh data; no saved numerical output is accepted. */
export function decodeEntry(value){
  const input=record(value,ENTRY_KEYS,'Entry');
  return canonicalSnapshot(input.kind,input.token).snapshot;
}
export function summarizeEntry(entry){
  const snapshot=decodeEntry(entry);
  if(entry.kind==='scenario')return {company:snapshot.company,kind:'scenario',scenario:snapshot.scenario,referenceScenario:null,alternativeScenario:null,ev:project(snapshot.assumptions).ev,referenceEv:null,alternativeEv:null,evDelta:null};
  const referenceEv=project(snapshot.reference.assumptions).ev,alternativeEv=project(snapshot.alternative.assumptions).ev,evDelta=alternativeEv-referenceEv;
  if(!Number.isFinite(evDelta))fail('The saved comparison exceeds the numeric range.');
  return {company:snapshot.company,kind:'thesis',scenario:null,referenceScenario:snapshot.reference.scenario,alternativeScenario:snapshot.alternative.scenario,ev:null,referenceEv,alternativeEv,evDelta};
}
export function entryUrl(base,entry){
  const origin=new URL(base);
  if(!['http:','https:'].includes(origin.protocol))fail('Calculation links require an HTTP or HTTPS URL.');
  const snapshot=decodeEntry(entry);
  return entry.kind==='scenario'?scenarioUrl(new URL('./index.html',origin).href,snapshot):thesisUrl(new URL('./thesis.html',origin).href,snapshot);
}
export function parseCasebook(value,research){return normalizeCasebook(parseJson(value,'Casebook import'),research);}
export function serializeCasebook(value,research){return plainJson(normalizeCasebook(value,research));}

function identity(entry){const {id,...content}=entry;return JSON.stringify(content);}
/** An ID conflict preserves both records. Reimporting its remapped copy is harmless. */
export function mergeCasebooks(current,incoming,research,{makeId=newId}={}){
  const existing=normalizeCasebook(current,research),supplied=normalizeCasebook(incoming,research);
  const ids=new Set(existing.entries.map(entry=>entry.id)),identities=new Set(existing.entries.map(identity));
  const entries=[];let skipped=0,conflicts=0;
  for(const source of supplied.entries){
    const fingerprint=identity(source);
    if(identities.has(fingerprint)){skipped++;continue;}
    if(existing.entries.length+entries.length>=CASEBOOK_LIMITS.entries)fail('The casebook is full. Keep at most 24 entries; export or remove an entry before importing more.','capacity');
    let entry=source;
    if(ids.has(source.id)){
      conflicts++;let id=null;
      for(let attempt=0;attempt<32;attempt++){
        const candidate=identifier(makeId());
        if(!ids.has(candidate)){id=candidate;break;}
      }
      if(id===null)fail('A unique entry ID could not be allocated. Existing entries were retained.','conflict');
      entry={...source,id};
    }
    ids.add(entry.id);identities.add(fingerprint);entries.push(entry);
  }
  return {book:createCasebook([...entries,...existing.entries],research),imported:entries.length,skipped,conflicts,entries:entries.map(entry=>normalizeEntry(entry,research))};
}

function legacyId(id){
  if(('legacy:'+id).length<=100)return 'legacy:'+id;
  let hash=14695981039346656037n;
  for(const byte of encoder.encode(id)){hash^=BigInt(byte);hash=BigInt.asUintN(64,hash*1099511628211n);}
  return 'legacy:'+id.slice(0,70)+':'+hash.toString(16).padStart(16,'0');
}
/** The original legacy key is never changed. Invalid records are reported individually. */
export function migrateLegacyScenarios(raw,research){
  if(raw===null||raw===undefined)return {book:createCasebook([],research),invalid:[],total:0};
  const payload=record(parseJson(raw,'Legacy scenario data'),['version','scenarios'],'Legacy scenario data');
  if(payload.version!==1)fail('The legacy scenario format is not recognized.','incompatible');
  const scenarios=array(payload.scenarios,'Legacy scenarios',4096),entries=[],invalid=[],ids=new Set();
  for(let index=0;index<scenarios.length;index++){
    const value=scenarios[index];
    try{
      const item=record(value,['id','name','company','scenario','assumptions','modelVersion','savedAt'],'Legacy scenario');
      if(item.modelVersion!==MODEL_VERSION)fail('The legacy scenario belongs to a different financial model.','incompatible');
      const id=legacyId(identifier(item.id));
      if(ids.has(id))fail('The legacy scenario repeats an earlier entry ID.');
      const entry=createScenarioEntry({company:item.company,scenario:item.scenario,assumptions:item.assumptions,bridge:null},{id,title:item.name,createdAt:item.savedAt,updatedAt:item.savedAt},research);
      entries.push(entry);ids.add(id);
    }catch(error){
      invalid.push({index,id:typeof value?.id==='string'?value.id:null,reason:error.message});
    }
  }
  return {book:createCasebook(entries,research),invalid,total:scenarios.length};
}
