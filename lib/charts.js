import {detectKnee} from './analysis.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function lineChart(rows,{xKey,yKey,xLabel,yLabel,xFormat,yFormat,recommendedId,kneeKey=yKey}) {
  if(!rows.length)return '<div class="empty">No quotes to plot</div>';
  const points=[...rows].sort((a,b)=>a[xKey]-b[xKey]);
  const W=520,H=250,L=56,R=24,T=25,B=44;
  let xmin=Math.min(...points.map(p=>p[xKey])),xmax=Math.max(...points.map(p=>p[xKey]));
  if(xmin===xmax){xmin-=1;xmax+=1;}
  let ymin=Math.min(0,...points.map(p=>p[yKey])),ymax=Math.max(...points.map(p=>p[yKey]))*1.12;
  if(ymax<=ymin)ymax=ymin+1;
  const x=v=>L+(v-xmin)/(xmax-xmin)*(W-L-R),y=v=>H-B-(v-ymin)/(ymax-ymin)*(H-T-B);
  const knee=detectKnee(points,xKey,kneeKey);
  let grid='',ticks='';
  for(let i=0;i<=4;i++){
    const v=ymin+(ymax-ymin)*i/4;
    grid+=`<line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" stroke="#e4e8dd" stroke-dasharray="3 4"/><text x="${L-9}" y="${y(v)+4}" text-anchor="end" fill="#59685e" font-size="10">${esc(yFormat(v))}</text>`;
  }
  const xticks=points.length<=6?points.map(p=>p[xKey]):Array.from({length:5},(_,i)=>xmin+(xmax-xmin)*i/4);
  for(const v of xticks)ticks+=`<text x="${x(v)}" y="${H-B+20}" text-anchor="middle" fill="#59685e" font-size="10">${esc(xFormat(v))}</text>`;
  const coords=points.map(p=>`${x(p[xKey])},${y(p[yKey])}`).join(' ');
  const first=points[0],last=points.at(-1);
  const area=`${x(first[xKey])},${H-B} ${coords} ${x(last[xKey])},${H-B}`;
  const dots=points.map(p=>{
    const best=p.id===recommendedId,isKnee=knee?.product.id===p.id;
    return `<g><title>${esc(`${xLabel}: ${xFormat(p[xKey])} · ${yLabel}: ${yFormat(p[yKey])}${best?' · Balanced pick':''}${isKnee?' · Knee':''}`)}</title>${best?`<circle cx="${x(p[xKey])}" cy="${y(p[yKey])}" r="10" fill="#d7e9ac" stroke="#155e48"/>`:''}<circle cx="${x(p[xKey])}" cy="${y(p[yKey])}" r="4" fill="#155e48" stroke="#fffefa" stroke-width="1.5"/>${isKnee?`<path d="M ${x(p[xKey])} ${y(p[yKey])-10} l 10 10 l -10 10 l -10 -10 Z" fill="none" stroke="#a77c22" stroke-width="2"/><text x="${x(p[xKey])}" y="${y(p[yKey])-16}" text-anchor="middle" fill="#80561e" font-size="10">Knee</text>`:''}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${xLabel} vs ${yLabel}, ${points.length} quote points`)}"><text x="${L}" y="12" fill="#59685e" font-size="10">${esc(yLabel)}</text>${grid}<polygon points="${area}" fill="#eef3df"/><polyline points="${coords}" fill="none" stroke="#155e48" stroke-width="2" stroke-linejoin="round"/>${dots}${ticks}<text x="${W-R}" y="${H-3}" text-anchor="end" fill="#59685e" font-size="10">${esc(xLabel)}</text></svg>`;
}
