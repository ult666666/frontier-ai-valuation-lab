const finite=value=>typeof value==='number'&&Number.isFinite(value);

export function financingNumber(value,digits=2){
  if(!finite(value))return '—';
  const magnitude=Math.abs(value);
  if(magnitude>=1e7||magnitude>0&&magnitude<.01)return value.toExponential(Math.max(3,digits)).replace(/^-/,'−');
  return new Intl.NumberFormat('en-US',{minimumFractionDigits:Math.min(2,digits),maximumFractionDigits:digits}).format(Object.is(value,-0)?0:value).replace(/^-/,'−');
}

export function financingMoney(value){return finite(value)?`${value<0?'−':''}$${financingNumber(Math.abs(value))}B`:'—';}

function percentageNumber(value,digits){
  const scaled=value*100;
  if(Number.isFinite(scaled))return financingNumber(scaled,digits);
  // Percentage scaling can exceed binary64 even when the ratio is finite.
  // Shift the decimal exponent as text instead of displaying an unavailable value.
  const [mantissa,exponent]=value.toExponential(Math.max(3,digits)).split('e');
  return `${mantissa.replace(/^-/,'−')}e+${Number(exponent)+2}`;
}

export function financingPercent(value,digits=2){return finite(value)?`${percentageNumber(value,digits)}%`:'—';}
export function financingPercentagePoints(value,digits=2){return finite(value)?`${percentageNumber(value,digits)} pp`:'—';}
