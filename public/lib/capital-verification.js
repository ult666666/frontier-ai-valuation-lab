/** A comparison policy, not a financial method or a propagated error bound. */
export const CAPITAL_ROUNDING_RELATIVE_LIMIT=32*Number.EPSILON;

// Only FCFF/continuation-dependent outputs can receive a qualified comparison.
// Inputs, pricing, ownership, crossovers, counts and all decision semantics stay
// exact. Unknown fields default to exact comparison as the result evolves.
const derivedPaths=[
  /^scenarios\.\d+\.(operatingEv|perpetualEv|modelPreMoneyEquity)$/,
  /^matrix\.\d+\.(modelPreMoneyEquity|modelPostMoneyEquity|existingCohortAllocation|trackedHolderAllocation|modelToQuote|regret)$/,
  /^comparison\.range\.(minEquity|maxEquity)$/,
  /^comparison\.perScenario\.\d+\.bestAllocation$/,
  /^comparison\.planMetrics\.\d+\.(worstRegret|minAllocation|maxAllocation)$/,
  /^comparison\.minimax\.worstRegret$/,
  /^envelope\.(modelQuoteCeiling|maximumPrimaryCapital)$/,
  /^envelope\.plans\.\d+\.upperPreMoney$/
];

/** Compare complete already-computed analyses without changing either record.
 * `exact` retains the strict verification meaning. `rounding` is a separate
 * qualified result; no input, classification or zero/sign change is tolerated.
 */
export function compareCapitalAnalysis(expected,actual){
  const differences=[];let firstMismatch=null;
  const mismatch=path=>{firstMismatch=`analysis${path?'.'+path:''}`;return false;};
  function compare(left,right,path=''){
    if(typeof left!==typeof right)return mismatch(path);
    if(typeof left==='number'){
      if(!Number.isFinite(left)||!Number.isFinite(right))return mismatch(path);
      if(Object.is(left,right))return true;
      if(left===0||right===0||Math.sign(left)!==Math.sign(right)||!derivedPaths.some(pattern=>pattern.test(path)))return mismatch(path);
      const relativeDifference=Math.abs(left-right)/Math.max(Math.abs(left),Math.abs(right));
      if(relativeDifference>CAPITAL_ROUNDING_RELATIVE_LIMIT)return mismatch(path);
      differences.push({path:`analysis.${path}`,expected:left,actual:right,relativeDifference});return true;
    }
    if(left===null||right===null)return left===right||mismatch(path);
    if(typeof left==='string'||typeof left==='boolean')return left===right||mismatch(path);
    if(typeof left!=='object')return mismatch(path);
    const arrays=Array.isArray(left);
    if(arrays!==Array.isArray(right))return mismatch(path);
    if(!arrays&&[left,right].some(value=>![Object.prototype,null].includes(Object.getPrototypeOf(value))))return mismatch(path);
    const leftKeys=Object.keys(left).sort(),rightKeys=Object.keys(right).sort();
    if(arrays&&(left.length!==right.length||leftKeys.length!==left.length||rightKeys.length!==right.length))return mismatch(path);
    if(leftKeys.length!==rightKeys.length||leftKeys.some((key,index)=>key!==rightKeys[index]))return mismatch(path);
    for(const key of leftKeys){
      const a=Object.getOwnPropertyDescriptor(left,key),b=Object.getOwnPropertyDescriptor(right,key);
      if(!Object.hasOwn(a,'value')||!Object.hasOwn(b,'value'))return mismatch(path?`${path}.${key}`:key);
      if(!compare(a.value,b.value,path?`${path}.${key}`:key))return false;
    }
    return true;
  }
  const matches=compare(expected,actual);
  return {status:matches?(differences.length?'rounding':'exact'):'mismatch',differences,firstMismatch};
}
