import {normalizeProducts,rankProducts,marginalAnalysis,validateSnapshot} from './lib/analysis.js';
import {fetchSpot,fetchProducts} from './lib/api.js';
import {lineChart} from './lib/charts.js';

const $=id=>document.getElementById(id);
const money=(n,d=0)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct=(n,d=2)=>`${(n*100).toFixed(d)}%`;
const date=n=>new Date(n).toLocaleDateString('en-US',{timeZone:'UTC',month:'short',day:'numeric'});
const datetime=n=>new Date(n).toLocaleString('en-US',{timeZone:'UTC',hour12:false})+' UTC';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults={minDiscount:2,maxDiscount:3,minDays:3,maxDays:7,minApr:20};
const fieldIds={'minDiscount':'min-discount','maxDiscount':'max-discount','minDays':'min-days','maxDays':'max-days','minApr':'min-apr'};
let snapshot,rows=[],analysis,ranked,preferences={...defaults},heatKey='apr',sortKey='target',sortAsc=false,bestId,selectedId,loading=false,spotQuote=null,spotError='',productsError='';
try {const saved=JSON.parse(localStorage.getItem('dual-lab-preferences'));if(validPreferences(saved))preferences=saved;}catch{}
for(const [key,id] of Object.entries(fieldIds))$(id).value=preferences[key];

function validPreferences(p){return p&&Object.keys(defaults).every(k=>Number.isFinite(p[k]))&&p.minDiscount>=0&&p.maxDiscount<100&&p.minDiscount<=p.maxDiscount&&p.minDays>0&&p.minDays<=p.maxDays&&p.maxDays<=365&&p.minApr>=0&&p.minApr<=10000;}
function toast(message){document.querySelector('.toast')?.remove();const el=document.createElement('div');el.className='toast';el.setAttribute('role','alert');el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),6000);}
function daysUntil(p){return Math.max(0,(p.settle-Date.now())/86400000);}
function unavailableMessage(){return loading?'Fetching live Binance quotes…':productsError||spotError?'Live analysis unavailable. Retry the Binance request.':'Binance returned no available BTC/USDT Buy Low quotes.';}
function renderStatus(){
  $('source-badge').textContent=spotQuote?'Live · official':loading?'Connecting…':'Unavailable';
  $('source-badge').className=`badge ${spotQuote?'live':''}`;
  $('spot').innerHTML=spotQuote?`${money(spotQuote.spot,2)}<small>USDT</small>`:'—';
  $('quote-time').textContent=spotQuote?`Spot fetched ${datetime(spotQuote.observedAt)}`:loading?'Requesting Binance BTC/USDT spot…':'BTC spot price could not be loaded.';
  const messages=[];
  if(loading)messages.push('Requesting live BTC spot and Buy Low quotes directly from Binance…');
  if(spotError)messages.push(`BTC spot unavailable: ${spotError}`);
  if(productsError)messages.push(`Dual Investment quotes unavailable: ${productsError}`);
  if(snapshot)messages.push(`Official Buy Low quotes fetched ${datetime(snapshot.observedAt)}. Spot and product requests are separate; APR can change before subscription.`);
  else if(!loading&&!productsError&&!spotError)messages.push('Binance returned no available BTC/USDT Buy Low quotes.');
  if(snapshot&&!rows.length)messages.push('Binance returned no available BTC/USDT Buy Low quotes.');
  $('data-banner').textContent=messages.join('\n');
  $('data-banner').className=`notice ${snapshot&&!spotError&&!productsError?'good':''}`;
  $('data-summary').textContent=snapshot?`${rows.length} available quotes · ${new Set(rows.map(p=>p.target)).size} target prices · ${new Set(rows.map(p=>p.settle)).size} settlements`:loading?'Connecting to Binance…':'No live quotes available for analysis';
  $('refresh-btn').disabled=loading;
  $('refresh-btn').textContent=loading?'Fetching…':'↻ Fetch live quotes';
  $('export-btn').disabled=!rows.length;
  $('target-select').disabled=!rows.length;
  $('days-select').disabled=!rows.length;
}
function loadLive(data){
  snapshot=validateSnapshot(data);
  rows=normalizeProducts(snapshot.products,Number(snapshot.spot),snapshot.observedAt)
    .filter(p=>p.settle>Date.now()&&(p.raw.purchaseEndTime==null||Number(p.raw.purchaseEndTime)>Date.now()));
  selectedId=null;
}
function render(){
  analysis=marginalAnalysis(rows);ranked=rankProducts(rows,preferences);bestId=ranked.ranked[0]?.id;
  renderStatus();renderRecommendations();renderHeatmap();renderSelectors();renderCharts();renderTable();
}
function renderRecommendations(){
  $('candidate-count').textContent=snapshot?`${ranked.eligible.length} eligible quotes / ${ranked.frontier.length} Pareto candidates`:'Awaiting live quotes';
  if(!snapshot||!rows.length){$('recommendation-cards').innerHTML=`<div class="empty">${unavailableMessage()}</div>`;return;}
  if(!ranked.ranked.length){$('recommendation-cards').innerHTML='<div class="empty">No quotes match your preferences. Widen the ranges to explore available tradeoffs.<br><button id="expand-btn" class="ghost">Explore all ranges</button></div>';$('expand-btn').onclick=expandPreferences;return;}
  const balanced=ranked.ranked[0],conservative=[...ranked.ranked].sort((a,b)=>a.effectivePrice-b.effectivePrice)[0],aggressive=[...ranked.ranked].sort((a,b)=>b.periodReturn-a.periodReturn)[0];
  const candidates=[{p:balanced,name:'Balanced pick',en:'BEST BALANCED',cls:'balanced',reason:`Distance-to-ideal score: ${balanced.score.toFixed(1)} / 100. Closest relative tradeoff to the ideal across discount, period return and term.`},{p:conservative,name:'Lower entry cost',en:'LOWER ENTRY',cls:'',reason:'Lowest effective entry cost among eligible Pareto candidates. Lower entry does not mean an absence of risk.'},{p:aggressive,name:'Higher period return',en:'HIGHER RETURN',cls:'',reason:'Highest period return among eligible Pareto candidates. Usually involves a higher target price or longer lockup.'}];
  $('recommendation-cards').innerHTML=candidates.map(({p,name,en,cls,reason},i)=>`<article class="recommendation-card ${cls}"><div class="card-heading"><span>${name}</span><span class="card-tag">${en}</span></div><div class="target-price">${money(p.target)}<small>USDT / BTC</small></div><div class="card-subtitle">${p.days} interest days · ${date(p.settle)} settlement UTC · APR ${pct(p.apr)}</div><div class="card-metrics"><div><label>Target discount</label><strong>${pct(p.discount)}</strong></div><div><label>Period return</label><strong>${pct(p.periodReturn,3)}</strong></div><div><label>Effective entry</label><strong>${money(p.effectivePrice)}</strong></div><div><label>Effective discount</label><strong>${pct(p.effectiveDiscount)}</strong></div></div><p class="card-reason">${reason}</p><div class="card-footer">${i&&p.id===balanced.id?'Same as the balanced pick · ':''}${analysis.knees.some(k=>k.product.id===p.id)?'◇ Detected knee':'No clear knee'} · Time to settlement: ${daysUntil(p).toFixed(2)} days</div></article>`).join('');
}
function expandPreferences(){
  if(!rows.length)return;
  preferences={minDiscount:0,maxDiscount:99,minDays:.1,maxDays:365,minApr:0};
  for(const [key,id] of Object.entries(fieldIds))$(id).value=preferences[key];
  persistPreferences();render();$('preference-status').textContent='Preferences widened. Picks now consider all nonnegative-discount quotes.';
}
function persistPreferences(){try{localStorage.setItem('dual-lab-preferences',JSON.stringify(preferences));}catch{}}
function heatTextColor(light){
  // Choose the foreground with the higher actual WCAG contrast on this HSL cell.
  const l=light/100,s=.24,h=139/60,c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h%2-1)),m=l-c/2;
  const rgb=[m,c+m,x+m].map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  const luminance=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  const dark=[0,0,0].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
  const darkL=dark[0]*.2126+dark[1]*.7152+dark[2]*.0722;
  return (luminance+.05)/(darkL+.05)>=1.05/(luminance+.05)?'#000000':'#ffffff';
}
function renderHeatmap(){
  const targets=[...new Set(rows.map(p=>p.target))].sort((a,b)=>b-a),settles=[...new Set(rows.map(p=>p.settle))].sort((a,b)=>a-b);
  if(!rows.length){$('heatmap').innerHTML=`<div class="empty">${unavailableMessage()}</div>`;renderSelected();return;}
  const vals=rows.map(p=>p[heatKey]),min=Math.min(...vals),max=Math.max(...vals),lookup=new Map(rows.map(p=>[`${p.target}:${p.settle}`,p]));
  $('heatmap').innerHTML=`<table class="heatmap"><thead><tr><th>Target ↓</th>${settles.map(s=>{const p=rows.find(p=>p.settle===s);return `<th>${p.days} days<br>${date(s)} UTC</th>`;}).join('')}</tr></thead><tbody>${targets.map(t=>`<tr><th>${money(t)}<br><span class="muted">Discount ${pct(1-t/snapshot.spot)}</span></th>${settles.map(s=>{
    const p=lookup.get(`${t}:${s}`);if(!p)return '<td class="muted">—</td>';
    const intensity=max===min?.5:(p[heatKey]-min)/(max-min),light=96-intensity*66,color=heatTextColor(light),knee=analysis.knees.some(k=>k.product.id===p.id);
    return `<td><button class="heat-cell ${p.id===bestId?'recommended':''} ${p.id===selectedId?'selected':''}" style="--cell:hsl(139 24% ${light}%);--cell-text:${color}" data-product="${escape(p.id)}" aria-label="Target ${p.target}, ${p.days} days, ${heatKey==='apr'?'APR':heatKey==='periodReturn'?'Period return':'Effective discount'} ${pct(p[heatKey],heatKey==='periodReturn'?3:2)}"><small>${p.id===bestId?'◎':knee?'◇':''}</small>${pct(p[heatKey],heatKey==='periodReturn'?3:2)}</button></td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
  $('heatmap').querySelectorAll('[data-product]').forEach(b=>b.onclick=()=>{selectedId=b.dataset.product;renderHeatmap();renderSelected();});
  renderSelected();
}
function renderSelected(){
  const p=rows.find(p=>p.id===selectedId);
  $('selected-detail').textContent=p?`Target ${money(p.target)} · ${datetime(p.settle)} settlement · ${p.days} interest days / ${daysUntil(p).toFixed(2)} days remaining · APR ${pct(p.apr)} · Period return ${pct(p.periodReturn,3)} · Effective entry ${money(p.effectivePrice,2)} USDT · Effective discount ${pct(p.effectiveDiscount)}`:'Select a quote to inspect its effective entry cost and return.';
}
function renderSelectors(){
  const targetValue=$('target-select').value,daysValue=$('days-select').value;
  $('target-select').innerHTML=[...analysis.byTarget.keys()].sort((a,b)=>b-a).map(t=>`<option value="${t}">${money(t)} USDT</option>`).join('');
  $('days-select').innerHTML=[...analysis.bySettle.keys()].sort((a,b)=>a-b).map(s=>`<option value="${s}">${analysis.bySettle.get(s)[0].days} days · ${date(s)} UTC</option>`).join('');
  const best=rows.find(p=>p.id===bestId);
  $('target-select').value=analysis.byTarget.has(Number(targetValue))?targetValue:String(best?.target??[...analysis.byTarget.keys()][0]);
  $('days-select').value=analysis.bySettle.has(Number(daysValue))?daysValue:String(best?.settle??[...analysis.bySettle.keys()][0]);
}
function renderCharts(){
  if(!rows.length){for(const id of ['time-chart','price-chart'])$(id).innerHTML=`<div class="empty">${unavailableMessage()}</div>`;for(const id of ['time-marginals','price-marginals'])$(id).textContent='';return;}
  const target=Number($('target-select').value),settle=Number($('days-select').value),timeRows=analysis.byTarget.get(target)||[],priceRows=analysis.bySettle.get(settle)||[];
  $('time-chart').innerHTML=lineChart(timeRows,{xKey:'days',yKey:'periodReturn',xLabel:'Interest term / days',yLabel:'Period return',xFormat:n=>money(n,0),yFormat:n=>pct(n,2),recommendedId:bestId});
  $('price-chart').innerHTML=lineChart(priceRows,{xKey:'discount',yKey:'apr',xLabel:'Target discount / %',yLabel:'APR',xFormat:n=>pct(n,1),yFormat:n=>pct(n,0),recommendedId:bestId,kneeKey:'periodReturn'});
  const time=analysis.time.filter(m=>m.target===target),price=analysis.price.filter(m=>m.settle===settle);
  const tk=analysis.knees.find(k=>k.dimension==='time'&&k.product.target===target),pk=analysis.knees.find(k=>k.dimension==='price'&&k.product.settle===settle);
  $('time-marginals').innerHTML=`<strong>${tk?`◇ Detected ${tk.product.days}-day term knee`:'No clear term knee detected'}</strong><br>${time.length?time.map(m=>`${m.from}→${m.to} days: extra ${pct(m.perDay,4)} / day`).join('; '):'At least two different terms are required for comparison.'}`;
  $('price-marginals').innerHTML=`<strong>${pk?`◇ Detected target ${money(pk.product.target)} price knee`:'No clear price knee detected'}</strong><br>${price.length?price.map(m=>`${money(m.from)}→${money(m.to)}: per extra 1% discount, APR loss ${(m.aprLossPer1pct*100).toFixed(2)} pp / period return loss ${(m.returnLossPer1pct*100).toFixed(3)} pp (half for 0.5%)`).join('; '):'At least two different targets are required for comparison.'}`;
}
function visibleRows(){
  const list=$('only-preferred').checked?ranked.eligible:rows;
  return [...list].sort((a,b)=>(a[sortKey]-b[sortKey])*(sortAsc?1:-1));
}
function renderTable(){
  const list=visibleRows();
  const frontIds=new Set(ranked.frontier.map(p=>p.id));
  $('quotes-body').innerHTML=list.length?list.map(p=>`<tr class="quotes-table-row ${p.id===bestId?'best':''}"><td><strong>${money(p.target)}</strong></td><td>${date(p.settle)} UTC</td><td>${p.days} days</td><td>${pct(p.apr)}</td><td>${pct(p.discount)}</td><td>${pct(p.periodReturn,3)}</td><td>${money(p.effectivePrice,2)}</td><td>${pct(p.effectiveDiscount)}</td><td>${p.id===bestId?'<span class="marker">◎ Balanced</span>':frontIds.has(p.id)?'<span class="marker">Pareto</span>':''}${analysis.knees.some(k=>k.product.id===p.id)?' <span class="marker">◇ Knee</span>':''}</td></tr>`).join(''):`<tr><td colspan="9">${snapshot&&rows.length?'No quotes match your preferences.':unavailableMessage()}</td></tr>`;
}
function requestError(error){return error.message==='Failed to fetch'?'The browser could not connect to Binance. CORS, network or regional restrictions may apply.':error.message;}
async function refresh(){
  if(loading)return;
  loading=true;snapshot=null;spotQuote=null;rows=[];selectedId=null;spotError='';productsError='';render();
  let productsQuote=null;
  function updateAnalysis(){
    if(spotQuote&&productsQuote){
      try{loadLive({version:1,source:'binance',spot:spotQuote.spot,observedAt:productsQuote.observedAt,products:productsQuote.products});}
      catch(error){snapshot=null;rows=[];productsError=requestError(error);}
    }
    render();
  }
  await Promise.all([
    fetchSpot().then(data=>{spotQuote=data;}).catch(error=>{spotError=requestError(error);}).finally(updateAnalysis),
    fetchProducts().then(data=>{productsQuote=data;}).catch(error=>{productsError=requestError(error);}).finally(updateAnalysis)
  ]);
  loading=false;render();
}
$('preferences-form').onsubmit=e=>{
  e.preventDefault();const p=Object.fromEntries(Object.entries(fieldIds).map(([k,id])=>[k,Number($(id).value)]));
  if(!validPreferences(p)){toast('Invalid ranges: minimums cannot exceed maximums. Use 0–99% discounts and positive terms.');return;}
  preferences=p;persistPreferences();render();$('preference-status').textContent='Preferences updated and saved in this browser.';
};
$('reset-btn').onclick=()=>{preferences={...defaults};for(const [key,id] of Object.entries(fieldIds))$(id).value=preferences[key];persistPreferences();render();$('preference-status').textContent='Defaults restored: 2–3% discount, 3–7 days, APR at least 20%.';};
$('refresh-btn').onclick=refresh;
$('target-select').onchange=renderCharts;$('days-select').onchange=renderCharts;$('only-preferred').onchange=renderTable;
document.querySelectorAll('[data-heat]').forEach(b=>b.onclick=()=>{heatKey=b.dataset.heat;document.querySelectorAll('[data-heat]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});renderHeatmap();});
document.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{sortAsc=sortKey===b.dataset.sort?!sortAsc:true;sortKey=b.dataset.sort;renderTable();document.querySelectorAll('[data-sort]').forEach(x=>x.closest('th').setAttribute('aria-sort',x===b?(sortAsc?'ascending':'descending'):'none'));});
$('export-btn').onclick=()=>{
  if(!snapshot||!rows.length)return;
  const header=['source','observedAt','spot','targetPrice','settlementDateUTC','durationDays','remainingDaysAtObservation','apr','discount','periodReturn','effectiveBuyPrice','effectiveDiscount'];
  const csv=[header.join(','),...visibleRows().map(p=>['binance',snapshot.observedAt,snapshot.spot,p.target,new Date(p.settle).toISOString(),p.days,p.remainingDays,p.apr,p.discount,p.periodReturn,p.effectivePrice,p.effectiveDiscount].join(','))].join('\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`btc-buy-low-live.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

// Only user-triggered browser requests: on page open and manual refresh.
try{localStorage.removeItem('dual-lab-last-snapshot');}catch{}
refresh();
