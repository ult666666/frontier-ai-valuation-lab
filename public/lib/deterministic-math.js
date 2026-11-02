/**
 * exp and log built only from IEEE-754 basic operations.
 *
 * ECMAScript does not fix the last bit of Math.exp or Math.log, and engines
 * differ: Node 24 and the Chromium 153 test browser return different bits for
 * both functions on ordinary inputs. The Monte Carlo layer must produce the
 * same draws in the browser and in the API, so it uses these ports of the Sun
 * fdlibm 5.3 algorithms (e_exp.c and e_log.c, error below one unit in the last
 * place). Addition, subtraction, multiplication, division and exponent-field
 * edits are correctly rounded by every conforming engine, so the results are
 * identical everywhere. Source: https://www.netlib.org/fdlibm/
 */
const view=new DataView(new ArrayBuffer(8));
// Signed high word and unsigned low word of a binary64 value, as in fdlibm.
function highWord(x){view.setFloat64(0,x);return view.getInt32(0);}
function lowWord(x){view.setFloat64(0,x);return view.getUint32(4);}
function withHighWord(x,high){view.setFloat64(0,x);view.setInt32(0,high);return view.getFloat64(0);}

const LN2_HI=6.93147180369123816490e-01; // 0x3FE62E42 FEE00000
const LN2_LO=1.90821492927058770002e-10; // 0x3DEA39EF 35793C76
const INV_LN2=1.44269504088896338700e+00; // 0x3FF71547 652B82FE
const O_THRESHOLD=7.09782712893383973096e+02; // 0x40862E42 FEFA39EF
const U_THRESHOLD=-7.45133219101941108420e+02; // 0xC0874910 D52D3051
const TWO_M1000=9.33263618503218878990e-302; // 2^-1000
const P1=1.66666666666666019037e-01; // 0x3FC55555 5555553E
const P2=-2.77777777770155933842e-03; // 0xBF66C16C 16BEBD93
const P3=6.61375632143793436117e-05; // 0x3F11566A AF25DE2C
const P4=-1.65339022054652515390e-06; // 0xBEBBBD41 C5D26BF1
const P5=4.13813679705723846039e-08; // 0x3E663769 72BEA4D0
const TWO54=1.80143985094819840000e+16; // 2^54
const LG1=6.666666666666735130e-01; // 0x3FE55555 55555593
const LG2=3.999999999940941908e-01; // 0x3FD99999 9997FA04
const LG3=2.857142874366239149e-01; // 0x3FD24924 94229359
const LG4=2.222219843214978396e-01; // 0x3FCC71C5 1D8E78AF
const LG5=1.818357216161805012e-01; // 0x3FC74664 96CB03DE
const LG6=1.531383769920937332e-01; // 0x3FC39A09 D078C69F
const LG7=1.479819860511658591e-01; // 0x3FC2F112 DF3E5244

/** e^x. Reduces x = k ln2 + r with |r| <= ln2/2, then a rational fit for e^r. */
export function detExp(x){
  let high=highWord(x);
  const negative=high<0?1:0;
  high&=0x7fffffff;
  if(high>=0x40862E42){
    if(high>=0x7ff00000)return ((high&0xfffff)|lowWord(x))!==0?x+x:negative?0:x;
    if(x>O_THRESHOLD)return Infinity;
    if(x<U_THRESHOLD)return 0;
  }
  let hi=0,lo=0,k=0;
  if(high>0x3fd62e42){
    if(high<0x3FF0A2B2){
      hi=x-(negative?-LN2_HI:LN2_HI);lo=negative?-LN2_LO:LN2_LO;k=1-negative-negative;
    }else{
      k=Math.trunc(INV_LN2*x+(negative?-.5:.5));
      hi=x-k*LN2_HI; // exact: k has at most 11 bits and LN2_HI has 21 trailing zero bits
      lo=k*LN2_LO;
    }
    x=hi-lo;
  }else if(high<0x3e300000)return 1+x;
  const t=x*x;
  const c=x-t*(P1+t*(P2+t*(P3+t*(P4+t*P5))));
  if(k===0)return 1-((x*c)/(c-2)-x);
  const y=1-((lo-(x*c)/(2-c))-hi);
  if(k>=-1021)return withHighWord(y,highWord(y)+(k<<20));
  return withHighWord(y,highWord(y)+((k+1000)<<20))*TWO_M1000;
}

/** Natural logarithm. Reduces x = 2^k (1 + f), then log(1 + f) = 2 atanh(f / (2 + f)). */
export function detLog(x){
  let hx=highWord(x),k=0;
  const lx=lowWord(x);
  if(hx<0x00100000){
    if(((hx&0x7fffffff)|lx)===0)return -Infinity;
    if(hx<0)return NaN;
    k-=54;x*=TWO54;hx=highWord(x); // scale a subnormal input into the normal range
  }
  if(hx>=0x7ff00000)return x+x;
  k+=(hx>>20)-1023;
  hx&=0x000fffff;
  const i=(hx+0x95f64)&0x100000;
  x=withHighWord(x,hx|(i^0x3ff00000)); // normalize x or x/2 into [sqrt(2)/2, sqrt(2))
  k+=i>>20;
  const f=x-1;
  if((0x000fffff&(2+hx))<3){ // |f| < 2^-20
    if(f===0)return k===0?0:k*LN2_HI+k*LN2_LO;
    const r=f*f*(.5-.33333333333333333*f);
    return k===0?f-r:k*LN2_HI-((r-k*LN2_LO)-f);
  }
  const s=f/(2+f),z=s*s,w=z*z;
  const t1=w*(LG2+w*(LG4+w*LG6)),t2=z*(LG1+w*(LG3+w*(LG5+w*LG7))),r=t2+t1;
  if(((hx-0x6147a)|(0x6b851-hx))>0){
    const hfsq=.5*f*f;
    return k===0?f-(hfsq-s*(hfsq+r)):k*LN2_HI-((hfsq-(s*(hfsq+r)+k*LN2_LO))-f);
  }
  return k===0?f-s*(f-r):k*LN2_HI-((s*(f-r)-k*LN2_LO)-f);
}
