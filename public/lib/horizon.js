/**
 * Finite-continuation stress lens on the unchanged FCFF valuation.
 * Amounts are USD billions. N counts annual terminal periods after 2036.
 * The cutoff has zero residual value; it does not predict a company lifespan.
 */
import {project} from './model.js';

export const HORIZON_VERSION='1.0.0';
export const HORIZON_MAX_YEARS=100;
export const HORIZON_SOLVER_MAX_YEARS=10000;
const END_YEAR=2036;
const INPUT_KEYS=['rev2026','g1','g2','g3','m27','m30','m36','turns','wacc','tg','roic','stub','tax'];
const PRECISION_BAND=32*Number.EPSILON;
const TARGET_PRECISION_REASON='The target is too close to a numerical valuation boundary to resolve the first whole year at the model’s floating-point precision.';
const CAPTURE_PRECISION_REASON='The capture threshold is too close to a whole-year boundary to resolve its first year at the model’s floating-point precision.';

// Error-free transforms preserve the small remainder when the rounded
// perpetual sum is close to a target. This does not increase input precision.
function twoSum(a,b){
  const sum=a+b,virtualB=sum-a;
  return [sum,(a-(sum-virtualB))+(b-virtualB)];
}
function sumMinus(a,b,c){
  const [sum,error]=twoSum(a,b),[difference,remainder]=twoSum(sum,-c);
  return difference+(error+remainder);
}
const moneyBand=(...values)=>Math.max(32*Number.MIN_VALUE,PRECISION_BAND*Math.max(...values.map(Math.abs)));

function record(value,allowed,required,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`${label} must be a plain object.`);
  const keys=Reflect.ownKeys(value);
  if(keys.some(key=>typeof key!=='string'||!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key)))throw new Error(`${label} has missing or unsupported fields.`);
  const out={};
  for(const key of keys){
    const field=Object.getOwnPropertyDescriptor(value,key);
    if(!Object.hasOwn(field,'value')||!field.enumerable)throw new Error(`${label}.${key} must be an enumerable data property.`);
    out[key]=field.value;
  }
  return out;
}

function options(value){
  const input=record(value,['years','target'],['years'],'Horizon options');
  if(typeof input.years!=='number'||!Number.isInteger(input.years)||input.years<0||input.years>HORIZON_MAX_YEARS)throw new Error(`Continuation years must be a whole number from 0 to ${HORIZON_MAX_YEARS}.`);
  const target=Object.hasOwn(input,'target')?input.target:null;
  if(target!==null&&(typeof target!=='number'||!Number.isFinite(target)||target<=0||target>1e12))throw new Error('Target enterprise value must be null or positive, finite and at most $1,000,000,000,000B.');
  return {years:input.years===0?0:input.years,target};
}

/** First qualifying whole year within a declared inclusive bound. */
function firstYear(qualifies){
  if(qualifies(0))return 0;
  if(!qualifies(HORIZON_SOLVER_MAX_YEARS))return null;
  let lower=0,upper=HORIZON_SOLVER_MAX_YEARS;
  while(upper-lower>1){
    const middle=Math.floor((lower+upper)/2);
    if(qualifies(middle))upper=middle;else lower=middle;
  }
  return upper;
}

/** Complete deterministic result for a validated snapshot. No caller is mutated. */
export function valueHorizon(assumptions,config){
  const input=record(assumptions,INPUT_KEYS,INPUT_KEYS,'Assumptions');
  const {years,target}=options(config),baseline=project(input);
  // Using the rate difference avoids cancellation in log1p(g)-log1p(r)
  // when adjacent representable rates are selected close to the singularity.
  const logQ=Math.log1p(-(input.wacc-input.tg)/(1+input.wacc));
  if(!Number.isFinite(logQ)||!(logQ<0))throw new Error('The continuation discount ratio exceeds the numeric range.');
  const positiveTerminal=baseline.pvtv>0;
  function point(n){
    const exponent=n*logQ;
    const fraction=n===0?0:-Math.expm1(exponent),remaining=Math.exp(exponent);
    const retainedTerminalPv=baseline.pvtv*fraction,excludedTerminalPv=baseline.pvtv*remaining;
    const ev=baseline.pv_explicit+retainedTerminalPv;
    if(![ev,retainedTerminalPv,excludedTerminalPv].every(Number.isFinite))throw new Error('The horizon result exceeds the numeric range.');
    return {years:n,throughYear:END_YEAR+n,ev,retainedTerminalPv,excludedTerminalPv,
      terminalPvFraction:positiveTerminal?fraction:null,remainingTerminalFraction:positiveTerminal?remaining:null};
  }
  const curve=Array.from({length:HORIZON_MAX_YEARS+1},(_,n)=>point(n));
  const capture=[.5,.75,.9,.95].map(fraction=>{
    if(!positiveTerminal)return {fraction,status:'unavailable',years:null,throughYear:null,reason:'Terminal present value is zero at the model’s numerical precision.'};
    // Compare the remaining fraction, which avoids rounding 1-q^N to one.
    const distance=year=>Math.exp(year*logQ)-(1-fraction);
    const uncertain=year=>Math.abs(distance(year))<=PRECISION_BAND*Math.max(1,Math.abs(year*logQ));
    const n=firstYear(year=>distance(year)<=0);
    // The cap is itself a classification boundary when no year qualifies.
    if(n===null?uncertain(HORIZON_SOLVER_MAX_YEARS):uncertain(n)||(n>0&&uncertain(n-1)))return {fraction,status:'precision_limit',years:null,throughYear:null,reason:CAPTURE_PRECISION_REASON};
    return n===null
      ?{fraction,status:'beyond_range',years:null,throughYear:null,reason:`More than ${HORIZON_SOLVER_MAX_YEARS.toLocaleString('en-US')} continuation years are required.`}
      :{fraction,status:'finite',years:n,throughYear:END_YEAR+n,reason:null};
  });
  let targetRequirement=null;
  if(target!==null){
    const empty=(status,reason)=>({status,years:null,throughYear:null,ev:null,previousEv:null,withinChart:null,reason});
    const explicit=baseline.pv_explicit,terminal=baseline.pvtv;
    const tailGap=sumMinus(explicit,terminal,target);
    if(target<=baseline.pv_explicit){
      targetRequirement={status:'explicit',years:0,throughYear:END_YEAR,ev:baseline.pv_explicit,previousEv:null,withinChart:true,reason:'The explicit forecast already reaches the target; no post-2036 cash flow is required.'};
    }else if(!positiveTerminal){
      targetRequirement=empty('unreachable','The perpetual operating EV is below the target. Extending continuation alone cannot reach it.');
    }else if(target===baseline.ev){
      // Never label the perpetuity as a finite solution, even when a distant
      // finite point rounds to the same displayed/IEEE-754 EV.
      targetRequirement=empty('asymptotic','The target equals the perpetual baseline. No finite continuation period attains the mathematical perpetuity.');
    }else if(Math.abs(tailGap)<=moneyBand(explicit,terminal,target)){
      targetRequirement=empty('precision_limit',TARGET_PRECISION_REASON);
    }else if(target>baseline.ev){
      targetRequirement=empty('unreachable','The perpetual operating EV is below the target. Extending continuation alone cannot reach it.');
    }else{
      const needed=target-explicit,compareRetained=needed<=terminal/2;
      // Early in the curve, compare small retained PV with the shortfall.
      // Near perpetuity, compare the excluded tail with a compensated gap.
      // Using rounded total EV for either comparison can invent a first year.
      const boundary=year=>{
        const p=point(year);
        return compareRetained
          ?{distance:p.retainedTerminalPv-needed,band:moneyBand(explicit,target,p.retainedTerminalPv)}
          :{distance:tailGap-p.excludedTerminalPv,band:moneyBand(explicit,terminal,target)};
      };
      const uncertain=year=>{const b=boundary(year);return Math.abs(b.distance)<=b.band;};
      const n=firstYear(year=>boundary(year).distance>=0);
      if(n===null?uncertain(HORIZON_SOLVER_MAX_YEARS):uncertain(n)||(n>0&&uncertain(n-1)))targetRequirement=empty('precision_limit',TARGET_PRECISION_REASON);
      else if(n===null)targetRequirement=empty('beyond_range',`The target is below perpetual EV but is not reached within ${HORIZON_SOLVER_MAX_YEARS.toLocaleString('en-US')} continuation years.`);
      else{
        const current=point(n),previous=n>0?point(n-1):null;
        if(current.ev<target||(previous!==null&&previous.ev>=target))targetRequirement=empty('precision_limit',TARGET_PRECISION_REASON);
        else targetRequirement={status:'finite',years:n,throughYear:END_YEAR+n,ev:current.ev,previousEv:previous?.ev??null,withinChart:n<=HORIZON_MAX_YEARS,reason:n<=HORIZON_MAX_YEARS?null:'The requirement is beyond the displayed 0–100 year chart.'};
      }
    }
  }
  return {version:HORIZON_VERSION,assumptions:input,baseline,years,target,maxYears:HORIZON_MAX_YEARS,
    solverMaxYears:HORIZON_SOLVER_MAX_YEARS,selected:{...curve[years]},curve,capture,targetRequirement};
}
