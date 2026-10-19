import {MODEL_VERSION,VALUATION_DATE} from './model.js';
import {encodeScenario,decodeScenario} from './share.js';
import {FINANCING_VERSION} from './financing.js';
import {financingAnalysis,OWNERSHIP_VERSION} from './ownership.js';

const LIMIT=8192;
const INPUT_KEYS=['rev2026','g1','g2','g3','m27','m30','m36','turns','wacc','tg','roic','stub','tax'];
function record(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`${label} must be a plain object.`);
  const own=Reflect.ownKeys(value);
  if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key)))throw new Error(`${label} has missing or unsupported fields.`);
  const copy={};
  for(const key of keys){
    const field=Object.getOwnPropertyDescriptor(value,key);
    if(!Object.hasOwn(field,'value')||!field.enumerable)throw new Error(`${label}.${key} must be an enumerable data property.`);
    copy[key]=field.value;
  }
  return copy;
}

/** An exact financing snapshot wraps the existing model case without changing it. */
export function normalizeFinancing(snapshot){
  const hasOwnership=snapshot!==null&&typeof snapshot==='object'&&Object.hasOwn(snapshot,'ownership');
  const input=record(snapshot,hasOwnership?['case','round','ownership']:['case','round'],'Financing Lens');
  const item=record(input.case,['company','scenario','assumptions','bridge'],'Model case');
  item.assumptions=record(item.assumptions,INPUT_KEYS,'Assumptions');
  if(item.bridge!==null)item.bridge=record(item.bridge,['cash','debt','otherClaims'],'Hypothetical bridge');
  const checked=decodeScenario(encodeScenario(item));
  const round=record(input.round,['basis','quote','primaryCapital','holderStake'],'Round terms');
  const options={bridge:checked.bridge,round};
  if(hasOwnership)options.ownership=input.ownership;
  const result=financingAnalysis(checked.assumptions,options);
  const normalized={case:checked,round:{...result.round}};
  if(hasOwnership)normalized.ownership={...result.ownership.constraint};
  return normalized;
}

export function encodeFinancing(snapshot){
  const item=normalizeFinancing(snapshot);
  const payload={schema:1,financing:FINANCING_VERSION,model:MODEL_VERSION,date:VALUATION_DATE,case:encodeScenario(item.case),round:item.round};
  if(Object.hasOwn(item,'ownership')){payload.schema=2;payload.ownership=item.ownership;payload.ownershipVersion=OWNERSHIP_VERSION;}
  const token=btoa(JSON.stringify(payload)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  if(token.length>LIMIT)throw new Error('This financing analysis exceeds the share-link limit.');
  return token;
}

export function decodeFinancing(token){
  if(typeof token!=='string'||token.length<1||token.length>LIMIT||!/^[A-Za-z0-9_-]+$/.test(token))throw new Error('This financing link is incomplete or malformed.');
  let parsed;
  try{parsed=JSON.parse(atob(token.replaceAll('-','+').replaceAll('_','/')));}catch{throw new Error('This financing link does not contain readable analysis data.');}
  const schema=parsed!==null&&typeof parsed==='object'?Object.getOwnPropertyDescriptor(parsed,'schema')?.value:undefined;
  const fields=['schema','financing','model','date','case','round'];
  if(schema===2)fields.push('ownership','ownershipVersion');
  const payload=record(parsed,fields,'Shared financing');
  if(![1,2].includes(payload.schema)||payload.financing!==FINANCING_VERSION||(payload.schema===2&&payload.ownershipVersion!==OWNERSHIP_VERSION))throw new Error('This financing link uses an unsupported calculation or sharing format.');
  if(payload.model!==MODEL_VERSION||payload.date!==VALUATION_DATE)throw new Error('This financing link belongs to a different financial model or research date. Use its matching release to reproduce it.');
  const snapshot={case:decodeScenario(payload.case),round:payload.round};
  if(payload.schema===2)snapshot.ownership=payload.ownership;
  return normalizeFinancing(snapshot);
}

export function financingUrl(base,snapshot){
  const url=new URL(base);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Financing links require an HTTP or HTTPS page without embedded credentials.');
  if(!url.pathname.endsWith('/'))url.pathname=url.pathname.slice(0,url.pathname.lastIndexOf('/')+1);
  url.pathname+='index.html';url.search='';url.hash='financing='+encodeFinancing(snapshot);
  return url.href;
}
