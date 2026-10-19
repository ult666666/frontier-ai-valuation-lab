import {MODEL_VERSION,VALUATION_DATE} from './model.js';
import {encodeScenario,decodeScenario} from './share.js';
import {financingLens,FINANCING_VERSION} from './financing.js';

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
  const input=record(snapshot,['case','round'],'Financing Lens');
  const item=record(input.case,['company','scenario','assumptions','bridge'],'Model case');
  item.assumptions=record(item.assumptions,INPUT_KEYS,'Assumptions');
  if(item.bridge!==null)item.bridge=record(item.bridge,['cash','debt','otherClaims'],'Hypothetical bridge');
  const checked=decodeScenario(encodeScenario(item));
  const round=record(input.round,['basis','quote','primaryCapital','holderStake'],'Round terms');
  const result=financingLens(checked.assumptions,{bridge:checked.bridge,round});
  return {case:checked,round:{...result.round}};
}

export function encodeFinancing(snapshot){
  const item=normalizeFinancing(snapshot);
  const payload={schema:1,financing:FINANCING_VERSION,model:MODEL_VERSION,date:VALUATION_DATE,case:encodeScenario(item.case),round:item.round};
  const token=btoa(JSON.stringify(payload)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  if(token.length>LIMIT)throw new Error('This financing analysis exceeds the share-link limit.');
  return token;
}

export function decodeFinancing(token){
  if(typeof token!=='string'||token.length<1||token.length>LIMIT||!/^[A-Za-z0-9_-]+$/.test(token))throw new Error('This financing link is incomplete or malformed.');
  let parsed;
  try{parsed=JSON.parse(atob(token.replaceAll('-','+').replaceAll('_','/')));}catch{throw new Error('This financing link does not contain readable analysis data.');}
  const payload=record(parsed,['schema','financing','model','date','case','round'],'Shared financing');
  if(payload.schema!==1||payload.financing!==FINANCING_VERSION)throw new Error('This financing link uses an unsupported calculation or sharing format.');
  if(payload.model!==MODEL_VERSION||payload.date!==VALUATION_DATE)throw new Error('This financing link belongs to a different financial model or research date. Use its matching release to reproduce it.');
  return normalizeFinancing({case:decodeScenario(payload.case),round:payload.round});
}

export function financingUrl(base,snapshot){
  const url=new URL(base);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Financing links require an HTTP or HTTPS page without embedded credentials.');
  if(!url.pathname.endsWith('/'))url.pathname=url.pathname.slice(0,url.pathname.lastIndexOf('/')+1);
  url.pathname+='index.html';url.search='';url.hash='financing='+encodeFinancing(snapshot);
  return url.href;
}
