/**
 * Exact, deterministic comparisons of two operating enterprise-value theses.
 * Dollar amounts are USD billions; rates, margins and change ratios are fractions.
 * Attribution is conditional on the fixed groups below, not a causal estimate.
 */
import {project} from './model.js';

export const THESIS_VERSION='1.0.0';
export const THESIS_GROUPS=Object.freeze([
  {key:'growth',label:'Revenue scale & growth',keys:['rev2026','g1','g2']},
  {key:'margins',label:'Operating margins',keys:['m27','m30','m36']},
  {key:'capital',label:'Capital efficiency',keys:['turns']},
  {key:'continuation',label:'Long-run economics',keys:['g3','wacc','tg','roic']},
  {key:'tax',label:'Tax rate',keys:['tax']},
  {key:'stub',label:'Remaining-2026 cash flow',keys:['stub']}
].map(group=>Object.freeze({...group,keys:Object.freeze(group.keys)})));

const ASSUMPTION_KEYS=['rev2026','g1','g2','g3','m27','m30','m36','turns','wacc','tg','roic','stub','tax'];
const GROUP_COUNT=THESIS_GROUPS.length;
const COALITIONS=2**GROUP_COUNT;
const FACTORIAL=[1,1,2,6,24,120,720];
const ATTRIBUTION_METHOD={method:'exact-grouped-shapley',groupCount:GROUP_COUNT,coalitions:COALITIONS,orderings:FACTORIAL[GROUP_COUNT]};

// Inspect data descriptors before reading values. An assumption snapshot cannot
// inherit inputs, hide a field, add a symbol, or execute code through a getter.
function copyRecord(value,keys,label) {
  if(!value||typeof value!=='object'||Array.isArray(value)||
      ![Object.prototype,null].includes(Object.getPrototypeOf(value))) {
    throw new Error(`${label} must be a plain object.`);
  }
  for(const key of Reflect.ownKeys(value)) {
    if(typeof key!=='string'||!keys.includes(key)) throw new Error(`${label} contains unexpected field: ${String(key)}.`);
  }
  const result={};
  for(const key of keys) {
    const field=Object.getOwnPropertyDescriptor(value,key);
    if(!field) throw new Error(`${label} is missing field: ${key}.`);
    if(!Object.hasOwn(field,'value')||!field.enumerable) throw new Error(`${label}.${key} must be an enumerable data property.`);
    result[key]=field.value;
  }
  return result;
}

function finite(value) {
  if(!Number.isFinite(value)) throw new Error('These changes exceed the thesis numeric range.');
  return value;
}

// Neumaier summation reduces cancellation error without changing, normalizing,
// or redistributing any group's exact subset-weight allocation.
function compensatedSum(values) {
  let sum=0,correction=0;
  for(const value of values) {
    finite(value);
    const next=finite(sum+value);
    correction=finite(correction+(Math.abs(sum)>=Math.abs(value)?(sum-next)+value:(value-next)+sum));
    sum=next;
  }
  return finite(sum+correction);
}

function groupAttribution(reference,alternative,evDelta) {
  try {
    const values=Array(COALITIONS);
    values[0]=reference.result.ev;
    values[COALITIONS-1]=alternative.result.ev;
    for(let mask=1;mask<COALITIONS-1;mask++) {
      const assumptions={...reference.assumptions};
      THESIS_GROUPS.forEach((group,index)=>{
        if(mask&(1<<index)) for(const key of group.keys) assumptions[key]=alternative.assumptions[key];
      });
      values[mask]=project(assumptions).ev;
    }
    const groups=THESIS_GROUPS.map((group,index)=>{
      const bit=1<<index,terms=[];
      for(let mask=0;mask<COALITIONS;mask++) {
        if(mask&bit) continue;
        let size=0;
        for(let remaining=mask;remaining;remaining&=remaining-1) size++;
        const weight=FACTORIAL[size]*FACTORIAL[GROUP_COUNT-size-1]/FACTORIAL[GROUP_COUNT];
        terms.push(finite(finite(values[mask|bit]-values[mask])*weight));
      }
      return {...group,keys:[...group.keys],contribution:compensatedSum(terms)};
    });
    const sum=compensatedSum(groups.map(group=>group.contribution));
    return {status:'ok',...ATTRIBUTION_METHOD,groups,sum,residual:finite(evDelta-sum),reason:null};
  } catch(error) {
    return {status:'unavailable',...ATTRIBUTION_METHOD,groups:[],sum:null,residual:null,
      reason:`The combined scenarios cannot support a finite attribution: ${error.message}`};
  }
}

/**
 * Value every coalition of six fixed groups and use k!(5-k)!/6! weights.
 * The linked g3, WACC, terminal-growth and ROIC assumptions move together.
 * Finite endpoints remain available if a hybrid or attribution exceeds range.
 */
export function compareTheses(reference,alternative) {
  const referenceAssumptions=copyRecord(reference,ASSUMPTION_KEYS,'Reference assumptions');
  const alternativeAssumptions=copyRecord(alternative,ASSUMPTION_KEYS,'Alternative assumptions');
  const referenceCase={assumptions:referenceAssumptions,result:project(referenceAssumptions)};
  const alternativeCase={assumptions:alternativeAssumptions,result:project(alternativeAssumptions)};
  const evDelta=finite(alternativeCase.result.ev-referenceCase.result.ev);
  const evChangeRatio=referenceCase.result.ev>0?finite(evDelta/referenceCase.result.ev):null;
  const changedInputs=ASSUMPTION_KEYS.filter(key=>referenceAssumptions[key]!==alternativeAssumptions[key]).map(key=>({
    key,reference:referenceAssumptions[key],alternative:alternativeAssumptions[key],delta:finite(alternativeAssumptions[key]-referenceAssumptions[key])
  }));
  return {version:THESIS_VERSION,reference:referenceCase,alternative:alternativeCase,evDelta,evChangeRatio,changedInputs,
    attribution:groupAttribution(referenceCase,alternativeCase,evDelta)};
}

function copyAxis(value,label) {
  if(!Array.isArray(value)) throw new Error(`${label} must contain 2–21 strictly increasing finite numeric values.`);
  const length=Object.getOwnPropertyDescriptor(value,'length').value;
  if(length<2||length>21) throw new Error(`${label} must contain 2–21 strictly increasing finite numeric values.`);
  const keys=Array.from({length},(_,index)=>String(index));
  for(const key of Reflect.ownKeys(value)) {
    if(key!=='length'&&(typeof key!=='string'||!keys.includes(key))) throw new Error(`${label} contains an unexpected array field: ${String(key)}.`);
  }
  const result=[];
  for(const key of keys) {
    const field=Object.getOwnPropertyDescriptor(value,key);
    if(!field||!Object.hasOwn(field,'value')||!field.enumerable) throw new Error(`${label} entries must be own enumerable data properties.`);
    if(typeof field.value!=='number'||!Number.isFinite(field.value)) throw new Error(`${label} must contain finite numeric values.`);
    if(result.length&&field.value<=result.at(-1)) throw new Error(`${label} must be strictly increasing, without duplicates.`);
    result.push(field.value);
  }
  return result;
}

function valueCell(assumptions,wacc,m36) {
  try {return {ev:project({...assumptions,wacc,m36}).ev,reason:null};}
  catch(error) {return {ev:null,reason:error.message};}
}

function missingFrontier(wacc,status,reason) {
  return {wacc,status,margin:null,ev:null,residual:null,reason};
}

function solvedFrontier(wacc,margin,ev,target) {
  return {wacc,status:'solved',margin,ev,residual:ev-target,reason:null};
}

function solveFrontier(assumptions,wacc,lowerMargin,upperMargin,target,lowerCell,upperCell) {
  if(lowerCell.reason!==null) return missingFrontier(wacc,'invalid',`The lower margin endpoint is unavailable: ${lowerCell.reason}`);
  if(upperCell.reason!==null) return missingFrontier(wacc,'invalid',`The upper margin endpoint is unavailable: ${upperCell.reason}`);
  if(target===lowerCell.ev) return solvedFrontier(wacc,lowerMargin,lowerCell.ev,target);
  if(target===upperCell.ev) return solvedFrontier(wacc,upperMargin,upperCell.ev,target);
  if(target<lowerCell.ev) return missingFrontier(wacc,'below_range','The target requires an operating margin below the supplied margin range.');
  if(target>upperCell.ev) return missingFrontier(wacc,'above_range','The target requires an operating margin above the supplied margin range.');

  // EV increases with m36; its explicit-year tax kinks make it piecewise linear.
  // Bisection preserves that full cash-flow path and the other eleven inputs.
  let lower={margin:lowerMargin,ev:lowerCell.ev},upper={margin:upperMargin,ev:upperCell.ev};
  let best=Math.abs(lower.ev-target)<=Math.abs(upper.ev-target)?lower:upper;
  for(let iteration=0;iteration<80;iteration++) {
    const margin=lower.margin+(upper.margin-lower.margin)/2;
    if(margin===lower.margin||margin===upper.margin) break;
    const cell=valueCell(assumptions,wacc,margin);
    if(cell.reason!==null) return missingFrontier(wacc,'invalid',`An interior margin is unavailable: ${cell.reason}`);
    const point={margin,ev:cell.ev};
    if(Math.abs(point.ev-target)<Math.abs(best.ev-target)) best=point;
    if(point.ev===target) return solvedFrontier(wacc,margin,point.ev,target);
    if(point.ev<target) lower=point;
    else upper=point;
  }
  const residual=best.ev-target;
  // Relative tolerance follows the target's scale, including very small cases;
  // the minimum subnormal value is the representability floor for this check.
  if(!Number.isFinite(residual)||Math.abs(residual)>Math.max(Number.MIN_VALUE,Math.abs(target)*1e-10)) {
    return missingFrontier(wacc,'invalid','The target margin cannot be resolved within the model’s numeric precision.');
  }
  return solvedFrontier(wacc,best.margin,best.ev,target);
}

/**
 * Vary WACC across columns and m36 down rows, holding the other eleven inputs
 * fixed. Invalid combinations are explicit nulls, never value floors. A target
 * frontier is a conditional valuation requirement, not a probability forecast.
 */
export function valuationLandscape(assumptions,config) {
  const snapshot=copyRecord(assumptions,ASSUMPTION_KEYS,'Assumptions');
  project(snapshot); // The active case must itself be valid and representable.
  const supplied=copyRecord(config,['rates','margins','target'],'Landscape configuration');
  const rates=copyAxis(supplied.rates,'rates'),margins=copyAxis(supplied.margins,'margins');
  const target=supplied.target;
  if(typeof target!=='number'||!Number.isFinite(target)||target<=0||target>1e12) {
    throw new Error('Target enterprise value must be positive, finite, and at most $1,000,000,000,000B.');
  }
  let validCount=0,minEv=null,maxEv=null;
  const cells=margins.map(margin=>rates.map(rate=>{
    const cell=valueCell(snapshot,rate,margin);
    if(cell.ev!==null) {
      validCount++;
      if(minEv===null||cell.ev<minEv) minEv=cell.ev;
      if(maxEv===null||cell.ev>maxEv) maxEv=cell.ev;
    }
    return cell;
  }));
  const values=cells.map(row=>row.map(cell=>cell.ev));
  const invalidReasons=cells.map(row=>row.map(cell=>cell.reason));
  const frontier=rates.map((rate,column)=>solveFrontier(snapshot,rate,margins[0],margins.at(-1),target,cells[0][column],cells.at(-1)[column]));
  return {version:THESIS_VERSION,assumptions:snapshot,rates,margins,target,values,invalidReasons,validCount,minEv,maxEv,frontier};
}
