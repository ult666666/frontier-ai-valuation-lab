import {financingMoney as money,financingPercent as percent,financingNumber as number} from './financing-format.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=value=>typeof value==='number'&&Number.isFinite(value);

/** A static, accessible SVG of the supplied, recalculated ownership frontier. */
export function ownershipChart(frontier,round,{id='ownership-curve'}={}){
  const graph=frontier?.graph,points=graph?.points;
  if(!Array.isArray(points)||points.length<2||!finite(graph.capitalMax)||graph.capitalMax<=0){
    return '<p class="ownership-chart-unavailable">The ownership curve is outside the supported numerical range. Review the numerical values and range note.</p>';
  }
  const floor=frontier.constraint.retentionFloor,current=frontier.current,ceiling=frontier.ceiling.analyticalCapital;
  const width=640,height=330,left=56,right=28,top=38,bottom=60,plotW=width-left-right,plotH=height-top-bottom;
  const lowest=Math.min(floor,current.retainedFraction,...points.map(point=>point.retainedFraction));
  const yMin=Math.max(0,Math.floor(lowest*10)/10-.05),ySpan=1-yMin;
  const x=value=>left+(value/graph.capitalMax)*plotW,y=value=>top+((1-value)/ySpan)*plotH;
  const coordinate=value=>Number(value.toFixed(3));
  const path=points.map((point,index)=>`${index?'L':'M'}${coordinate(x(point.primaryCapital))},${coordinate(y(point.retainedFraction))}`).join(' ');
  const area=`${path} L${coordinate(x(points.at(-1).primaryCapital))},${top+plotH} L${left},${top+plotH} Z`;
  const horizontal=Array.from({length:5},(_,n)=>{const value=1-ySpan*n/4,cy=y(value);return `<line x1="${left}" x2="${width-right}" y1="${cy}" y2="${cy}" class="ownership-gridline"/><text x="${left-10}" y="${cy+4}" text-anchor="end">${escape(percent(value,0))}</text>`;}).join('');
  const vertical=Array.from({length:5},(_,n)=>{const value=graph.capitalMax*n/4,cx=x(value);return `<line x1="${cx}" x2="${cx}" y1="${top+plotH}" y2="${top+plotH+5}" class="ownership-axis"/><text x="${cx}" y="${height-bottom+23}" text-anchor="${n===0?'start':n===4?'end':'middle'}">${escape(number(value,1))}</text>`;}).join('');
  const inside=finite(ceiling)&&ceiling>=0&&ceiling<=graph.capitalMax;
  const limitMarker=inside?`<line x1="${x(ceiling)}" x2="${x(ceiling)}" y1="${y(floor)}" y2="${top+plotH}" class="ownership-limit-line"/><rect x="${x(ceiling)-4}" y="${y(floor)-4}" width="8" height="8" class="ownership-limit-point"/>`:'';
  const currentInside=current.primaryCapital<=graph.capitalMax;
  const marker=currentInside?`<circle cx="${x(current.primaryCapital)}" cy="${y(current.retainedFraction)}" r="6" class="ownership-current-point"/><text x="${Math.max(left+44,Math.min(width-right-42,x(current.primaryCapital)))}" y="${Math.max(top+14,y(current.retainedFraction)-16)}" text-anchor="middle" class="ownership-point-label">Current round</text>`:'';
  const title=`Ownership retained at a fixed ${round.basis==='pre'?'pre-money':'post-money'} quote of ${money(round.quote)}`;
  const description=`Primary capital is on the horizontal axis; the fraction of a starting stake retained is on the vertical axis, shown from ${percent(yMin)} to 100%. Current capital ${money(current.primaryCapital)} retains ${percent(current.retainedFraction)}. Chosen minimum ${percent(floor)}. ${finite(ceiling)?`The analytical capital limit is ${money(ceiling)}.`:'The capital limit is numerically unresolved.'}`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${escape(id)}-title ${escape(id)}-desc" xmlns="http://www.w3.org/2000/svg"><title id="${escape(id)}-title">${escape(title)}</title><desc id="${escape(id)}-desc">${escape(description)}</desc><text x="${left}" y="16" class="ownership-axis-label">Starting stake retained (%)</text>${horizontal}<path d="${area}" class="ownership-curve-area"/><line x1="${left}" x2="${width-right}" y1="${y(floor)}" y2="${y(floor)}" class="ownership-floor-line"/><path d="${path}" class="ownership-curve"/>${limitMarker}${marker}<line x1="${left}" x2="${width-right}" y1="${top+plotH}" y2="${top+plotH}" class="ownership-axis"/>${vertical}<text x="${left+plotW/2}" y="${height-10}" text-anchor="middle" class="ownership-axis-label">Primary capital (USD bn)</text></svg>`;
}

export const OWNERSHIP_CHART_CSS=`.ownership-chart svg{display:block;width:100%;height:auto;overflow:visible}.ownership-chart svg text{font-family:Arial,sans-serif;font-size:11px;fill:#637365}.ownership-chart .ownership-axis-label{font-size:11px;fill:#4b6052}.ownership-gridline{stroke:#dce2d5;stroke-width:1}.ownership-axis{stroke:#94a590;stroke-width:1}.ownership-curve-area{fill:#668971;opacity:.09}.ownership-curve{fill:none;stroke:#326e59;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.ownership-floor-line{stroke:#a66c3e;stroke-width:1.5;stroke-dasharray:7 5}.ownership-limit-line{stroke:#a66c3e;stroke-width:1.5;stroke-dasharray:2 4}.ownership-limit-point{fill:#a66c3e;stroke:#faf9f1;stroke-width:2}.ownership-current-point{fill:#233b31;stroke:#faf9f1;stroke-width:3}.ownership-chart .ownership-point-label{fill:#233b31;font-size:11px;font-weight:600}.ownership-chart-unavailable{padding:30px 16px;color:#855538;font-size:12px}`;
