/**
 * One fixed-quote primary round, viewed through a user-selected ownership floor.
 * Capital is USD billions; ownership fractions are decimals. This constraint
 * does not infer capital needs, financing availability or a negotiated price.
 */
import {financingLens,FINANCING_MAX_AMOUNT} from './financing.js';

export const OWNERSHIP_VERSION='1.0.0';
const COMPARISON_BAND=32*Number.EPSILON;
const FLOOR_MIN=.01;
const ROUND_KEYS=['basis','quote','primaryCapital','holderStake'];
const SAMPLE_INTERVALS=48;

function record(value,allowed,required,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`${label} must be a plain object.`);
  const keys=Reflect.ownKeys(value);
  if(keys.some(key=>typeof key!=='string'||!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key)))throw new Error(`${label} has missing or unsupported fields.`);
  const out={};
  for(const key of keys){
    const field=Object.getOwnPropertyDescriptor(value,key);
    if(!Object.hasOwn(field,'value')||!field.enumerable)throw new Error(`${label}.${key} must be an enumerable data property.`);
    out[key]=field.value===0?0:field.value;
  }
  return out;
}

function checkedRound(value){
  const round=record(value,ROUND_KEYS,ROUND_KEYS,'Round');
  if(!['pre','post'].includes(round.basis))throw new Error('Round basis must be pre or post.');
  if(typeof round.quote!=='number'||!Number.isFinite(round.quote)||round.quote<=0||round.quote>FINANCING_MAX_AMOUNT)throw new Error('The quoted equity value must be positive, finite and at most $1,000,000,000,000B.');
  if(typeof round.primaryCapital!=='number'||!Number.isFinite(round.primaryCapital)||round.primaryCapital<0||round.primaryCapital>FINANCING_MAX_AMOUNT)throw new Error('Primary capital must be finite and between $0B and $1,000,000,000,000B.');
  if(typeof round.holderStake!=='number'||!Number.isFinite(round.holderStake)||round.holderStake<0||round.holderStake>1)throw new Error('The tracked holder stake must be a decimal fraction from 0 to 1.');
  return round;
}

function checkedConstraint(value){
  const constraint=record(value,['retentionFloor'],['retentionFloor'],'Ownership constraint');
  const floor=constraint.retentionFloor;
  if(typeof floor!=='number'||!Number.isFinite(floor)||floor<FLOOR_MIN||floor>1)throw new Error('Ownership constraint.retentionFloor must be a finite fraction from 0.01 to 1.');
  return constraint;
}

// This duplicates only the frozen round arithmetic, not FCFF. Each sampled
// amount must satisfy the same supported domain as financingLens().
function point(round,capital,{enforceInputCap=true}={}){
  if(!Number.isFinite(capital)||capital<0||(enforceInputCap&&capital>FINANCING_MAX_AMOUNT))throw new Error('The sampled primary capital is outside the supported input range.');
  const {basis,quote,holderStake}=round;
  if(basis==='post'&&quote<=capital)throw new Error('Post-money equity value must exceed new primary capital so pre-money equity value remains positive.');
  const preMoney=basis==='pre'?quote:quote-capital;
  const postMoney=basis==='post'?quote:quote+capital;
  if(basis==='post'&&capital>0&&preMoney<=COMPARISON_BAND*Math.max(quote,capital))throw new Error('The remaining pre-money value is too small relative to post-money value and capital to resolve at the supported numeric precision.');
  const retainedFraction=preMoney/postMoney,newOwnership=capital/postMoney;
  if(retainedFraction===0||(capital>0&&newOwnership===0))throw new Error('The ownership fractions exceed the supported numeric precision.');
  return {primaryCapital:capital,retainedFraction,holderAfter:holderStake*retainedFraction};
}

function closeToFloor(retained,floor){return Math.abs(retained-floor)<=COMPARISON_BAND*Math.max(retained,floor);}
function currentStatus(round,retained,floor){
  if(floor===1)return round.primaryCapital===0?'at-floor':'below-floor';
  if(closeToFloor(retained,floor))return 'at-floor';
  return retained>floor?'above-floor':'below-floor';
}

function ceilingFor(round,floor,warnings){
  if(floor===1)return {analyticalCapital:0,supportedCapital:0,status:'resolved'};
  // Divide the dimensionless factor first. Multiplying a subnormal quote by
  // (1-floor) before division can prematurely erase a representable ceiling.
  const analytical=round.basis==='pre'?round.quote*((1-floor)/floor):round.quote*(1-floor);
  if(analytical===0){
    warnings.push('The positive analytical capital ceiling is below the supported numerical resolution; it has not been reported as a zero-capital economic limit.');
    return {analyticalCapital:null,supportedCapital:null,status:'below-resolution'};
  }
  try{
    const boundary=point(round,analytical,{enforceInputCap:false});
    if(!Number.isFinite(analytical)||!closeToFloor(boundary.retainedFraction,floor))throw new Error('The boundary cannot resolve the selected floor.');
    const supportedCapital=Math.min(analytical,FINANCING_MAX_AMOUNT);
    point(round,supportedCapital);
    const status=analytical>FINANCING_MAX_AMOUNT?'input-cap-limited':'resolved';
    if(status==='input-cap-limited')warnings.push('The analytical ownership ceiling exceeds the supported primary-capital input range. The graph is bounded by that input limit, which is not an economic financing ceiling.');
    return {analyticalCapital:analytical,supportedCapital,status};
  }catch{
    warnings.push('The analytical ownership boundary cannot be resolved at the supported numerical precision. Current valid round results remain available; a zero ceiling has not been substituted.');
    return {analyticalCapital:null,supportedCapital:null,status:'unresolved'};
  }
}

function graphFor(round,ceiling,warnings){
  const unavailable=()=>({status:'unavailable',capitalMax:null,points:[],ceilingInDomain:false,currentInDomain:false});
  try{
    const ceilingCapital=ceiling.supportedCapital??0;
    // Focus on the current round and chosen boundary. The 5% quote fallback
    // supplies a visible axis when both are zero; it is not a financing target.
    const desired=Math.max(round.quote*.05,round.primaryCapital*1.2,ceilingCapital*1.2);
    // The fixed-post curve stops before the singular zero-pre-money endpoint.
    // A valid current round closer to that endpoint stays in the graph.
    const inputMaximum=round.basis==='pre'?FINANCING_MAX_AMOUNT:Math.max(round.primaryCapital,round.quote*(1-2*COMPARISON_BAND));
    const capitalMax=Math.min(FINANCING_MAX_AMOUNT,inputMaximum,desired);
    if(!Number.isFinite(capitalMax)||capitalMax<=0)throw new Error('No positive graph interval.');
    point(round,capitalMax);
    const grid=Array.from({length:SAMPLE_INTERVALS+1},(_,index)=>capitalMax*(index/SAMPLE_INTERVALS));
    if(new Set(grid).size!==grid.length)throw new Error('The sampled capital axis cannot resolve distinct points.');
    const currentInDomain=round.primaryCapital<=capitalMax;
    const ceilingInDomain=ceiling.analyticalCapital!==null&&ceiling.analyticalCapital<=capitalMax;
    if(currentInDomain)grid.push(round.primaryCapital);
    if(ceilingInDomain)grid.push(ceiling.analyticalCapital);
    const points=[...new Set(grid)].sort((a,b)=>a-b).map(capital=>point(round,capital));
    return {status:'ready',capitalMax,points,ceilingInDomain,currentInDomain};
  }catch{
    warnings.push('The capital-versus-ownership graph is unavailable because its bounded sample axis cannot be resolved at the supported numerical precision. No invalid sample has been replaced with zero or silently connected.');
    return unavailable();
  }
}

/** A deterministic ownership constraint without rerunning an operating model. */
export function ownershipFrontier(roundInput,constraintInput){
  const round=checkedRound(roundInput),constraint=checkedConstraint(constraintInput);
  const floor=constraint.retentionFloor,active=point(round,round.primaryCapital),warnings=[];
  const ceiling=ceilingFor(round,floor,warnings),status=currentStatus(round,active.retainedFraction,floor);
  let holderFloor=round.holderStake*floor;
  if(round.holderStake>0&&holderFloor===0){
    holderFloor=null;
    warnings.push('The tracked holder’s positive ownership floor is below the supported numerical resolution. The cohort retention constraint remains available.');
  }
  const difference=ceiling.analyticalCapital===null?null:ceiling.analyticalCapital-round.primaryCapital;
  const atBoundary=status==='at-floor';
  const current={...active,holderFloor,status,
    capitalHeadroom:difference===null?null:atBoundary?0:Math.max(0,difference),
    capitalExcess:difference===null?null:atBoundary?0:Math.max(0,-difference)};
  const graph=graphFor(round,ceiling,warnings);
  return {version:OWNERSHIP_VERSION,constraint,current,ceiling,graph,
    method:{basis:'fixed-quote-primary-round',fixedQuoteBasis:round.basis,retentionScope:'fraction-of-starting-stakes',existingHoldersSubscribe:false,
      retentionFloorMin:FLOOR_MIN,retentionFloorMax:1,comparisonBand:COMPARISON_BAND,capitalInputLimit:FINANCING_MAX_AMOUNT,sampleIntervals:SAMPLE_INTERVALS},warnings};
}

/** Optional additive analysis; absence returns the exact legacy result shape. */
export function financingAnalysis(assumptions,config){
  const options=record(config,['bridge','round','ownership'],['round'],'Financing options');
  const legacy={round:options.round};
  if(Object.hasOwn(options,'bridge'))legacy.bridge=options.bridge;
  const result=financingLens(assumptions,legacy);
  if(Object.hasOwn(options,'ownership'))result.ownership=ownershipFrontier(result.round,options.ownership);
  return result;
}
