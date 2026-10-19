/**
 * A single hypothetical primary equity round over the unchanged FCFF model.
 * Dollar amounts are USD billions; ownership and gap rates are decimals.
 * New cash is retained, operations are fixed, and participants have equal rights.
 */
import {project,bridgeEquity} from './model.js';

export const FINANCING_VERSION='1.0.0';
export const FINANCING_MAX_AMOUNT=1e12;
const INPUT_KEYS=['rev2026','g1','g2','g3','m27','m30','m36','turns','wacc','tg','roic','stub','tax'];
const BRIDGE_KEYS=['cash','debt','otherClaims'];
const ROUND_KEYS=['basis','quote','primaryCapital','holderStake'];
const PRECISION_BAND=32*Number.EPSILON;

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

/** Complete detached result. An omitted bridge is unavailable, never assumed zero. */
export function financingLens(assumptions,config){
  const input=record(assumptions,INPUT_KEYS,INPUT_KEYS,'Assumptions');
  const options=record(config,['bridge','round'],['round'],'Financing options');
  const round=checkedRound(options.round);
  const suppliedBridge=Object.hasOwn(options,'bridge')?options.bridge:null;
  const bridgeInput=suppliedBridge===null?null:record(suppliedBridge,BRIDGE_KEYS,BRIDGE_KEYS,'Hypothetical bridge');
  const baseline=project(input);
  const bridge=bridgeInput===null?null:bridgeEquity(baseline.ev,bridgeInput);
  const {basis,quote,primaryCapital,holderStake}=round;
  if(basis==='post'&&quote<=primaryCapital)throw new Error('Post-money equity value must exceed new primary capital so pre-money equity value remains positive.');
  const preMoney=basis==='pre'?quote:quote-primaryCapital;
  const postMoney=basis==='post'?quote:quote+primaryCapital;
  // This is a conservative supported-resolution policy. Close subtraction can
  // be exact in binary, but its economic interpretation magnifies input rounding.
  if(basis==='post'&&primaryCapital>0&&preMoney<=PRECISION_BAND*Math.max(quote,primaryCapital))throw new Error('The remaining pre-money value is too small relative to post-money value and capital to resolve at the supported numeric precision.');
  // Compute both fractions directly: 1 minus a rounded fraction can erase a
  // small but positive old or new ownership interest.
  const existingOwnership=preMoney/postMoney,newOwnership=primaryCapital/postMoney;
  if(existingOwnership===0||(primaryCapital>0&&newOwnership===0))throw new Error('The ownership fractions exceed the supported numeric precision.');
  const holderAfter=holderStake*existingOwnership;
  const holderValue=holderStake*preMoney;
  const pricing={preMoney,postMoney,primaryCapital,existingOwnership,newOwnership,
    holderBefore:holderStake,holderAfter,otherExistingAfter:(1-holderStake)*existingOwnership,
    holderDilution:holderStake*newOwnership,relativeDilution:newOwnership,
    // At the same issue price, old shares have the same quoted paper mark.
    // Algebraic simplification avoids presenting a rounding residual as a return.
    holderValueBefore:holderValue,holderValueAfter:holderValue};
  const warnings=[];
  let comparison=null;
  if(bridge!==null){
    const modelPreMoneyEquity=bridge.equityValue;
    const priceGap=preMoney-modelPreMoneyEquity;
    let priceGapPercent=modelPreMoneyEquity>0?priceGap/modelPreMoneyEquity:null;
    if(modelPreMoneyEquity<=0)warnings.push('The modeled pre-money equity residual is nonpositive. It is not a share price or a valuation of limited-liability common equity; the price-gap percentage is unavailable.');
    else if(!Number.isFinite(priceGapPercent)){
      priceGapPercent=null;
      warnings.push('The price-gap percentage exceeds the supported numeric range and is unavailable.');
    }
    comparison={modelPreMoneyEquity,modelPostMoneyEquity:modelPreMoneyEquity+primaryCapital,
      cashBefore:bridge.cash,cashAfter:bridge.cash+primaryCapital,
      operatingEvBefore:baseline.ev,operatingEvAfter:baseline.ev,
      roundImpliedOperatingEv:preMoney-bridge.cash+bridge.debt+bridge.otherClaims,
      priceGap,priceGapPercent};
  }
  return {version:FINANCING_VERSION,assumptions:input,baseline,round,pricing,bridge,comparison,
    method:{basis:'simple-primary-equity-round',operatingValue:'perpetual-fcff',proceeds:'retained-as-cash',fees:0,rights:'equal-participating',bridgeStatus:bridge===null?'not-supplied':'hypothetical'},warnings};
}
