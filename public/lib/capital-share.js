import {MODEL_VERSION,VALUATION_DATE} from './model.js';
import {CAPITAL_VERSION} from './capital-strategy.js';
import {createCapitalRecord,normalizeCapitalRecord} from './capital-record.js';

export const CAPITAL_SHARE_MAX_CHARACTERS=32768;
export const CAPITAL_SHARE_MAX_BYTES=24576;
const PAYLOAD_KEYS=['kind','schema','modelVersion','valuationDate','capitalVersion','snapshot','decision'];
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});

export class CapitalShareError extends Error{
  constructor(message,code='validation'){super(message);this.name='CapitalShareError';this.code=code;}
}
const fail=(message,code)=>{throw new CapitalShareError(message,code);};
const tooLarge=()=>fail('This decision is too large for an exact share link. Download its JSON record to preserve the complete decision.','capacity');

function base64url(bytes){
  const binary=Array.from(bytes,byte=>String.fromCharCode(byte)).join('');
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}

function payloadRecord(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('A shared decision must be a plain object.');
  const keys=Reflect.ownKeys(value);
  if(keys.length!==PAYLOAD_KEYS.length||keys.some(key=>typeof key!=='string'||!PAYLOAD_KEYS.includes(key)))fail('The shared decision has missing or unsupported fields.');
  const result={};
  for(const key of PAYLOAD_KEYS){
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)fail('Shared decision fields must be enumerable data properties.');
    result[key]=descriptor.value;
  }
  return result;
}

/** Only exact validated inputs and analyst text travel; output is recalculated. */
export function encodeCapitalShare(record){
  const normalized=normalizeCapitalRecord(record);
  const payload=Object.fromEntries(PAYLOAD_KEYS.map(key=>[key,normalized[key]]));
  const bytes=encoder.encode(JSON.stringify(payload));
  if(bytes.byteLength>CAPITAL_SHARE_MAX_BYTES)tooLarge();
  const token=base64url(bytes);
  if(token.length>CAPITAL_SHARE_MAX_CHARACTERS)tooLarge();
  return token;
}

export function decodeCapitalShare(token){
  if(typeof token!=='string'||token.length<1||token.length>CAPITAL_SHARE_MAX_CHARACTERS||!/^[A-Za-z0-9_-]+$/.test(token))fail('This decision link is incomplete, malformed or above the share-link size limit.');
  let bytes;
  try{bytes=Uint8Array.from(atob(token.replaceAll('-','+').replaceAll('_','/')),character=>character.charCodeAt(0));}
  catch{fail('This decision link does not contain readable base64url data.');}
  if(bytes.byteLength>CAPITAL_SHARE_MAX_BYTES)tooLarge();
  if(base64url(bytes)!==token)fail('This decision link uses a malformed base64url encoding.');
  let parsed;
  try{parsed=JSON.parse(decoder.decode(bytes));}catch{fail('This decision link must contain valid UTF-8 JSON.');}
  const payload=payloadRecord(parsed);
  if(payload.kind!=='frontier-capital-decision'||payload.schema!==1)fail('This decision link uses an unsupported sharing format.','incompatible');
  if(payload.modelVersion!==MODEL_VERSION||payload.valuationDate!==VALUATION_DATE||payload.capitalVersion!==CAPITAL_VERSION)fail('This decision link belongs to a different model, valuation date or capital method. Open it with the matching release.','incompatible');
  return createCapitalRecord(payload.snapshot,payload.decision);
}

export function capitalUrl(record,baseUrl='https://frontier-ai-valuation-lab.vercel.app/capital.html'){
  const url=new URL(baseUrl);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)fail('Capital decision links require an HTTP or HTTPS address without embedded credentials.');
  if(!url.pathname.endsWith('/'))url.pathname=url.pathname.slice(0,url.pathname.lastIndexOf('/')+1);
  url.pathname+='capital.html';url.search='';url.hash='decision='+encodeCapitalShare(record);
  return url.href;
}
