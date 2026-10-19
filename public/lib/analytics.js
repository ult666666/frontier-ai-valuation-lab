/**
 * Deterministic comparisons built on the audited FCFF model.
 * Dollar amounts and EV changes are USD billions; change ratios are fractions.
 * Every calculation uses a private snapshot of the caller's assumptions.
 */
import {project, VALUATION_DATE} from './model.js';

export const ANALYTICS_VERSION = '1.0.0';
const COMPANIES = ['Anthropic','OpenAI'];
const ASSUMPTION_KEYS = ['rev2026','g1','g2','g3','m27','m30','m36','turns','wacc','tg','roic','stub','tax'];
const SHOCK_LIMITS = {growthPp:20,marginPp:10,waccPp:5,capitalEfficiencyPct:50};
const STUB_YEAR = Number(VALUATION_DATE.slice(0,4));
const DRIVER_SHOCKS = Object.freeze([
  Object.freeze({key:'g1',label:'Early growth +5 pp',change:.05}),
  Object.freeze({key:'m36',label:'Terminal margin +2 pp',change:.02}),
  Object.freeze({key:'wacc',label:'Cost of capital +1 pp',change:.01}),
  Object.freeze({key:'turns',label:'Capital efficiency +20%',factor:1.2})
]);

// Require own enumerable data fields. Inherited inputs and accessors are not
// assumption snapshots; reading an accessor could execute caller-supplied code.
function copyRecord(value,keys,label) {
  if (!value || typeof value!=='object' || Array.isArray(value) ||
      ![Object.prototype,null].includes(Object.getPrototypeOf(value))) {
    throw new Error(`${label} must be a plain object.`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key!=='string' || !keys.includes(key)) throw new Error(`${label} contains unexpected field: ${String(key)}.`);
  }
  const copy={};
  for (const key of keys) {
    const field=Object.getOwnPropertyDescriptor(value,key);
    if (!field) throw new Error(`${label} is missing field: ${key}.`);
    if (!Object.hasOwn(field,'value') || !field.enumerable) throw new Error(`${label}.${key} must be an enumerable data property.`);
    copy[key]=field.value;
  }
  return copy;
}

function forCompany(company,calculate) {
  try {return calculate();}
  catch (error) {throw new Error(`${company}: ${error.message}`);}
}

// The earliest point in the final uninterrupted qualifying run. A positive
// point followed by a later deficit therefore cannot become a sustained year.
function sustainedYear(rows,qualifies) {
  let year=null;
  for (let index=rows.length-1;index>=0;index--) {
    if (!qualifies(rows[index])) break;
    year=rows[index].year;
  }
  return year;
}

/** Compare exactly Anthropic and OpenAI, without changing either input. */
export function comparePair(assumptionsByCompany) {
  const pair=copyRecord(assumptionsByCompany,COMPANIES,'Assumptions by company');
  const companies={};
  for (const company of COMPANIES) {
    companies[company]=forCompany(company,()=>{
      const assumptions=copyRecord(pair[company],ASSUMPTION_KEYS,'Assumptions');
      const result=project(assumptions);
      return {
        assumptions,
        result,
        firstPositiveFcfYear:result.rows.find(row=>row.fcf>0)?.year??null,
        sustainedPositiveFcfYear:sustainedYear(result.rows,row=>row.fcf>0),
        cumulativeBreakEvenYear:sustainedYear([
          {year:STUB_YEAR,cumulative:assumptions.stub},...result.rows
        ],row=>row.cumulative>=0),
        valueComposition:{
          stub:result.pv_stub,
          explicitForecast:result.rows.reduce((sum,row)=>sum+row.pv,0),
          terminal:result.pvtv,
          total:result.ev
        }
      };
    });
  }
  return {companies};
}

function copyShocks(shocks) {
  if (shocks===undefined) return {growthPp:0,marginPp:0,waccPp:0,capitalEfficiencyPct:0};
  const copy=copyRecord(shocks,Object.keys(SHOCK_LIMITS),'Shocks');
  for (const [key,limit] of Object.entries(SHOCK_LIMITS)) {
    if (typeof copy[key]!=='number' || !Number.isFinite(copy[key])) throw new Error(`${key} must be a finite number.`);
    if (copy[key]<-limit || copy[key]>limit) throw new Error(`${key} must be between ${-limit} and ${limit}, inclusive.`);
  }
  return copy;
}

function valueChange(baselineEv,changedEv) {
  const evDelta=changedEv-baselineEv;
  const evChangeRatio=baselineEv>0?evDelta/baselineEv:null;
  if (!Number.isFinite(evDelta) || (evChangeRatio!==null && !Number.isFinite(evChangeRatio))) {
    throw new Error('These changes exceed the analytics numeric range.');
  }
  return {evDelta,evChangeRatio};
}

/** Apply the same four absolute/relative shocks to each company's snapshot. */
export function stressPair(assumptionsByCompany,shocks) {
  const normalizedShocks=copyShocks(shocks);
  const baseline=comparePair(assumptionsByCompany),changed={};
  for (const company of COMPANIES) {
    const p=baseline.companies[company].assumptions;
    changed[company]={
      ...p,
      g1:p.g1+normalizedShocks.growthPp/100,
      m36:p.m36+normalizedShocks.marginPp/100,
      wacc:p.wacc+normalizedShocks.waccPp/100,
      turns:p.turns*(1+normalizedShocks.capitalEfficiencyPct/100)
    };
  }
  // Model validation is applied after transformation, with no bounds clipping.
  const stressed=comparePair(changed),changes={};
  for (const company of COMPANIES) {
    changes[company]=forCompany(company,()=>valueChange(baseline.companies[company].result.ev,stressed.companies[company].result.ev));
  }
  return {shocks:normalizedShocks,baseline,stressed,changes};
}

/**
 * Four independent one-at-a-time scenarios, in a fixed display order.
 * Their shock sizes differ: these deltas do not rank economic importance or
 * measure causality, probabilities, elasticities, or comparable unit effects.
 */
export function driverImpacts(p) {
  const assumptions=copyRecord(p,ASSUMPTION_KEYS,'Assumptions');
  const baseline=project(assumptions);
  const impacts=DRIVER_SHOCKS.map(shock=>{
    const changed={...assumptions,[shock.key]:shock.factor===undefined?
      assumptions[shock.key]+shock.change:assumptions[shock.key]*shock.factor};
    try {
      const result=project(changed);
      return {...shock,assumptions:changed,result,...valueChange(baseline.ev,result.ev),reason:null};
    } catch (error) {
      return {...shock,assumptions:changed,result:null,evDelta:null,evChangeRatio:null,reason:error.message};
    }
  });
  return {assumptions,baseline,impacts};
}
