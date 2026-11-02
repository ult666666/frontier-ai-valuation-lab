/**
 * Seeded pseudorandom numbers and standard normal functions with identical
 * bits in every JavaScript runtime. Only integer operations, IEEE-754 basic
 * operations, Math.sqrt and the fdlibm ports in deterministic-math.js are used.
 */
import {detExp,detLog} from './deterministic-math.js';

export const RANDOM_ALGORITHM='xoshiro128** 1.1; state from two SplitMix64 outputs of the seed';
export const MAX_SEED=4294967295;
const MASK64=(1n<<64n)-1n;
const TWO_26=67108864;
const TWO_52=4503599627370496;
const SQRT_2PI=Math.sqrt(2*Math.PI);
const CDF_SWITCH=2.5;
const CDF_FRACTION_DEPTH=100;

/**
 * SplitMix64 (Steele, Lea and Flood, 2014), as recommended by the xoshiro
 * authors for filling a generator state from one integer seed.
 */
export function splitMix64(seed){
  let state=BigInt(seed);
  return ()=>{
    state=(state+0x9E3779B97F4A7C15n)&MASK64;
    let z=state;
    z=((z^(z>>30n))*0xBF58476D1CE4E5B9n)&MASK64;
    z=((z^(z>>27n))*0x94D049BB133111EBn)&MASK64;
    return z^(z>>31n);
  };
}

const rotl=(x,k)=>(x<<k)|(x>>>(32-k));

/**
 * xoshiro128** 1.1 (Blackman and Vigna, 2021): https://prng.di.unimi.it/
 * The four 32-bit state words are the low and high halves of two SplitMix64
 * outputs, in that order. A SplitMix64 output is a bijection of its counter,
 * so two consecutive outputs cannot both be zero.
 */
export function createRandom(seed){
  if(typeof seed!=='number'||!Number.isInteger(seed)||seed<0||seed>MAX_SEED)throw new Error(`Seed must be a whole number from 0 to ${MAX_SEED}.`);
  const next64=splitMix64(seed),first=next64(),second=next64();
  const s=new Uint32Array([Number(first&0xffffffffn),Number(first>>32n),Number(second&0xffffffffn),Number(second>>32n)]);
  function nextUint32(){
    const result=Math.imul(rotl(Math.imul(s[1],5),7),9)>>>0;
    const t=s[1]<<9;
    s[2]^=s[0];s[3]^=s[1];s[1]^=s[2];s[0]^=s[3];s[2]^=t;s[3]=rotl(s[3],11);
    return result;
  }
  /**
   * Two outputs give 26 high bits each. The 52-bit integer k maps to the
   * midpoint (k + 0.5) / 2^52, which is exact, symmetric and never 0 or 1.
   */
  function nextUniform(){
    const high=nextUint32()>>>6,low=nextUint32()>>>6;
    return (high*TWO_26+low+.5)/TWO_52;
  }
  return {nextUint32,nextUniform};
}

/**
 * Coefficients of Wichura (1988), Algorithm AS 241 (PPND16), lowest degree
 * first. Each denominator starts with its implicit constant 1. The paper
 * prints a check sum of the 15 significands in each region: 55.88319 28806
 * 14901 4439, 49.33206 50330 16102 89036 and 47.52583 31754 92896 71629.
 * https://doi.org/10.2307/2347330
 */
export const AS241_COEFFICIENTS=Object.freeze({
  central:Object.freeze({
    numerator:Object.freeze([3.3871328727963666080e+0,1.3314166789178437745e+2,1.9715909503065514427e+3,1.3731693765509461125e+4,4.5921953931549871457e+4,6.7265770927008700853e+4,3.3430575583588128105e+4,2.5090809287301226727e+3]),
    denominator:Object.freeze([1,4.2313330701600911252e+1,6.8718700749205790830e+2,5.3941960214247511077e+3,2.1213794301586595867e+4,3.9307895800092710610e+4,2.8729085735721942674e+4,5.2264952788528545610e+3])
  }),
  intermediate:Object.freeze({
    numerator:Object.freeze([1.42343711074968357734e+0,4.63033784615654529590e+0,5.76949722146069140550e+0,3.64784832476320460504e+0,1.27045825245236838258e+0,2.41780725177450611770e-1,2.27238449892691845833e-2,7.74545014278341407640e-4]),
    denominator:Object.freeze([1,2.05319162663775882187e+0,1.67638483018380384940e+0,6.89767334985100004550e-1,1.48103976427480074590e-1,1.51986665636164571966e-2,5.47593808499534494600e-4,1.05075007164441684324e-9])
  }),
  tail:Object.freeze({
    numerator:Object.freeze([6.65790464350110377720e+0,5.46378491116411436990e+0,1.78482653991729133580e+0,2.96560571828504891230e-1,2.65321895265761230930e-2,1.24266094738807843860e-3,2.71155556874348757815e-5,2.01033439929228813265e-7]),
    denominator:Object.freeze([1,5.99832206555887937690e-1,1.36929880922735805310e-1,1.48753612908506148525e-2,7.86869131145613259100e-4,1.84631831751005468180e-5,1.42151175831644588870e-7,2.04426310338993978564e-15])
  })
});

const {central:CENTRAL,intermediate:INTERMEDIATE,tail:TAIL}=AS241_COEFFICIENTS;
// Horner evaluation from the highest degree, the operation order of AS 241.
function horner(coefficients,r){
  let value=coefficients[7];
  for(let i=6;i>=0;i--)value=value*r+coefficients[i];
  return value;
}

/** Standard normal quantile (AS 241), relative accuracy about 1e-16. */
export function normalQuantile(p){
  if(typeof p!=='number'||!(p>0&&p<1))throw new Error('Normal quantile probabilities must be strictly between 0 and 1.');
  const q=p-.5;
  if(Math.abs(q)<=.425){
    const r=.180625-q*q;
    return q*horner(CENTRAL.numerator,r)/horner(CENTRAL.denominator,r);
  }
  let r=Math.sqrt(-detLog(q<0?p:1-p));
  const region=r<=5?INTERMEDIATE:TAIL;
  r-=r<=5?1.6:5;
  const x=horner(region.numerator,r)/horner(region.denominator,r);
  return q<0?-x:x;
}

/**
 * exp(-z^2 / 2) / sqrt(2 pi). Splitting z into a 1/16 grid point and a
 * remainder keeps the large exponent argument exact (Cody, 1969).
 */
function normalDensity(z){
  const grid=Math.trunc(z*16)/16,remainder=(z-grid)*(z+grid);
  return detExp(-.5*grid*grid)*detExp(-.5*remainder)/SQRT_2PI;
}

/**
 * Standard normal CDF. For |z| < 2.5 the Taylor series
 * Phi(z) = 1/2 + phi(z) (z + z^3/3 + z^5/(3*5) + ...) (Marsaglia, 2004).
 * Otherwise the lower tail uses Laplace's continued fraction for the Mills
 * ratio, Q(a) = phi(a) / (a + 1/(a + 2/(a + 3/(a + ...)))), evaluated at a
 * fixed depth so the arithmetic is the same on every run.
 */
export function normalCdf(z){
  if(typeof z!=='number'||Number.isNaN(z))throw new Error('Normal CDF input must be a number.');
  const a=Math.abs(z);
  if(a<CDF_SWITCH){
    const z2=z*z;let term=z,sum=z;
    for(let n=1;n<200;n++){
      term=term*z2/(2*n+1);
      const next=sum+term;
      if(next===sum)break;
      sum=next;
    }
    return .5+normalDensity(z)*sum;
  }
  if(a>40)return z<0?0:1;
  let fraction=a;
  for(let k=CDF_FRACTION_DEPTH;k>=1;k--)fraction=a+k/fraction;
  const tail=normalDensity(a)/fraction;
  return z<0?tail:1-tail;
}
