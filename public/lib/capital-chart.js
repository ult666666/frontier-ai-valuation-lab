/** A self-contained, script-free view of submitted plans and two objectives.
 * The plot adds no sampled offers. Its complete values also appear in a table.
 */
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const number=value=>Math.abs(value)>=1e6||(Math.abs(value)>0&&Math.abs(value)<.001)?value.toExponential(1):value.toLocaleString('en-US',{maximumFractionDigits:2});
const percent=value=>number(value*100)+'%';
const palette=['#e9ce99','#b5ddc4','#9bc3db','#d6b1d1','#f2b39d','#bdcfa0'];
function niceStep(value){
  if(!(value>0))return Number.MIN_VALUE;
  const magnitude=10**Math.floor(Math.log10(value))||Number.MIN_VALUE,fraction=value/magnitude;
  return (fraction<=1?1:fraction<=2?2:fraction<=2.5?2.5:fraction<=5?5:10)*magnitude;
}

function marker(index,x,y,color,selected){
  const stroke=selected?'#ffffff':color;
  const halo=selected?`<circle cx="${x}" cy="${y}" r="12" fill="none" stroke="#ffffff" stroke-width="1.5"/>`:'';
  const shape=index%3===0?`<circle cx="${x}" cy="${y}" r="5.5" fill="${color}" stroke="${stroke}" stroke-width="1.5"/>`:index%3===1?`<path d="M${x},${y-7} L${x+7},${y} L${x},${y+7} L${x-7},${y} Z" fill="${color}" stroke="${stroke}" stroke-width="1.5"/>`:`<rect x="${x-5.5}" y="${y-5.5}" width="11" height="11" fill="${color}" stroke="${stroke}" stroke-width="1.5"/>`;
  return halo+shape;
}

export function capitalPlanChart(analysis,{selectedPlanId=null,idPrefix='capital-plan-chart',compact=false}={}){
  const prefix=String(idPrefix).replace(/[^A-Za-z0-9_-]/g,'-')||'capital-plan-chart';
  const plans=analysis.plans;
  const {capitalTarget,retentionFloor}=analysis.snapshot.policy;
  const width=compact?320:880,height=compact?352:412,left=compact?55:76,right=compact?24:42,top=compact?56:55,bottom=compact?278:326;
  const tickSize=compact?14:11,axisSize=compact?14:12;
  const plotWidth=width-left-right,plotHeight=bottom-top;
  const largest=Math.max(capitalTarget,...plans.map(plan=>plan.pricing.primaryCapital));
  // A zero-capital collection still has a positive visual domain. This fallback
  // is a chart convention, never a suggested financing amount.
  const desiredXmax=largest>0?largest*1.1:1,xStep=niceStep(desiredXmax/4);
  const xmax=Math.ceil(desiredXmax/xStep)*xStep;
  const desiredYmin=Math.max(0,Math.min(retentionFloor,...plans.map(plan=>plan.retainedFraction))-.035);
  const yStep=niceStep((1-desiredYmin)/4),ymin=Math.max(0,Math.floor(desiredYmin/yStep)*yStep);
  const ymax=1.012;
  const x=value=>left+value/xmax*plotWidth;
  const y=value=>bottom-(value-ymin)/(ymax-ymin)*plotHeight;
  const objectiveX=x(capitalTarget),objectiveY=y(retentionFloor);
  const title='Financing plans against capital and ownership objectives';
  const descriptions=plans.map((plan,index)=>`${String.fromCharCode(65+index)}, ${plan.label}: ${number(plan.pricing.primaryCapital)} billion primary capital, ${percent(plan.retainedFraction)} of starting ownership retained; ${plan.eligible?'meets both objectives':'does not meet both objectives'}${plan.id===selectedPlanId?'; analyst selection':''}.`);
  const description=`Primary capital is shown horizontally in USD billions; starting stake retained is shown vertically. The objectives are at least ${number(capitalTarget)} billion of capital and at least ${percent(retentionFloor)} retention. Only the submitted plans are plotted. ${descriptions.join(' ')}`;
  const grid=[];
  for(let index=0;index<=Math.round(xmax/xStep);index++){
    const xv=xStep*index,xx=x(xv);
    grid.push(`<line x1="${xx}" y1="${top}" x2="${xx}" y2="${bottom}" stroke="#304d56" stroke-width="1"/><text x="${xx}" y="${bottom+23}" text-anchor="middle" fill="#b7cbc4" font-size="${tickSize}">${escape(number(xv))}</text>`);
  }
  for(let index=0;index<=Math.round((1-ymin)/yStep);index++){
    const yv=ymin+yStep*index,yy=y(yv);
    grid.push(`<line x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}" stroke="#304d56" stroke-width="1"/><text x="${left-10}" y="${yy+4}" text-anchor="end" fill="#b7cbc4" font-size="${tickSize}">${escape(compact?number(yv*100):percent(yv))}</text>`);
  }
  const occupied=[];
  const points=plans.map((plan,index)=>{
    const xx=x(plan.pricing.primaryCapital),yy=y(plan.retainedFraction),color=palette[index%palette.length];
    let labelY=yy-17;
    while(occupied.some(p=>Math.abs(p.x-xx)<38&&Math.abs(p.y-labelY)<20))labelY+=25;
    if(labelY>bottom-4)labelY=yy-38;
    occupied.push({x:xx,y:labelY});
    const leader=Math.abs(labelY-yy)>24?`<line x1="${xx}" y1="${yy}" x2="${xx}" y2="${labelY-5}" stroke="${color}" stroke-width=".7" stroke-dasharray="2 3"/>`:'';
    return `<g><title>${escape(descriptions[index])}</title>${leader}${marker(index,xx,yy,color,plan.id===selectedPlanId)}<text x="${xx}" y="${labelY}" text-anchor="middle" fill="${color}" font-size="${compact?16:13}" font-weight="700">${String.fromCharCode(65+index)}</text></g>`;
  });
  const qualifyingLabel=width-right-objectiveX>155?`<text x="${width-right-12}" y="${top+18}" text-anchor="end" fill="#b4d7bc" font-size="10">Meets both objectives</text>`:'';
  const legend=compact?'':`<text x="${left}" y="${height-10}" fill="#a8c0b5" font-size="10">Dashed guides: your objectives · Outer ring: analyst selection · Letters identify submitted plans</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${prefix}-title ${prefix}-description" style="display:block;width:100%;height:auto;font-family:Arial,sans-serif"><title id="${prefix}-title">${title}</title><desc id="${prefix}-description">${escape(description)}</desc><rect width="${width}" height="${height}" fill="#102b35"/><text x="${compact?16:left}" y="26" fill="#d0e0d7" font-size="${axisSize}">Starting stake retained (%)</text><rect x="${objectiveX}" y="${top}" width="${width-right-objectiveX}" height="${Math.max(0,objectiveY-top)}" fill="#345c47" opacity=".44"/>${grid.join('')}<line x1="${objectiveX}" y1="${top}" x2="${objectiveX}" y2="${bottom}" stroke="#b9d5c2" stroke-width="1.3" stroke-dasharray="5 5"/><line x1="${left}" y1="${objectiveY}" x2="${width-right}" y2="${objectiveY}" stroke="#b9d5c2" stroke-width="1.3" stroke-dasharray="5 5"/>${qualifyingLabel}${points.join('')}<line x1="${left}" y1="${bottom}" x2="${width-right}" y2="${bottom}" stroke="#93aca2" stroke-width="1"/><text x="${left+plotWidth/2}" y="${height-(compact?26:32)}" text-anchor="middle" fill="#d0e0d7" font-size="${axisSize}">Primary capital (USD bn)</text>${legend}</svg>`;
}
