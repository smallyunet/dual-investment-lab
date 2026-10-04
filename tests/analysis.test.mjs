import test from 'node:test';
import assert from 'node:assert/strict';
import {DAY,normalizeProducts,paretoFrontier,rankProducts,detectKnee,marginalAnalysis,validateSnapshot} from '../lib/analysis.js';
import {demoSnapshot} from '../lib/demo.js';
const now='2026-10-04T00:00:00Z';
const quote=(overrides={})=>({id:'a',strikePrice:'83000',duration:5,settleDate:new Date(now).getTime()+5*DAY,apr:'0.2865',optionType:'PUT',investCoin:'USDT',exercisedCoin:'BTC',canPurchase:true,...overrides});
test('known quote: APR decimal, actual period return, conversion cost',()=>{
  const [p]=normalizeProducts([quote()],84800,now);
  assert.ok(Math.abs(p.periodReturn-0.003924657534246576)<1e-12);
  assert.ok(Math.abs(p.effectivePrice-82675.53)<.01);
  assert.ok(Math.abs(p.effectivePrice-(83000/(1+.2865*5/365)))<1e-9);
  assert.ok(Math.abs(p.discount-(1800/84800))<1e-12);
  assert.ok(Math.abs(p.effectiveDiscount-(1-p.effectivePrice/84800))<1e-12);
});
test('interest term is separate from wall-clock time until settlement',()=>{
  const [p]=normalizeProducts([quote({settleDate:new Date(now).getTime()+4.4*DAY})],84800,now);
  assert.equal(p.days,5);assert.ok(Math.abs(p.remainingDays-4.4)<1e-9);
  assert.equal(p.periodReturn,.2865*5/365);
});
test('ignore expired, unavailable, wrong currency, malformed quotes; retain strongest duplicate',()=>{
  const quotes=[quote({canPurchase:false}),quote({optionType:'CALL'}),quote({investCoin:'USDC'}),quote({strikePrice:'NaN'}),quote({apr:'-1'}),quote({settleDate:0}),quote({purchaseEndTime:1}),quote({id:'low',apr:'.1'}),quote({id:'high',apr:'.3'})];
  const rows=normalizeProducts(quotes,84800,now);assert.equal(rows.length,1);assert.equal(rows[0].id,'high');
  assert.throws(()=>normalizeProducts([],0,now));
});
test('Pareto removes dominated rows but preserves opposing tradeoffs',()=>{
  const a={id:'a',discount:.02,periodReturn:.004,days:5},b={id:'b',discount:.01,periodReturn:.003,days:6},c={id:'c',discount:.03,periodReturn:.002,days:3};
  assert.deepEqual(paretoFrontier([a,b,c]).map(p=>p.id),['a','c']);
});
test('ranking is finite for single and tied candidates and never escapes preferences',()=>{
  const rows=normalizeProducts([quote()],84800,now),pref={minDiscount:2,maxDiscount:3,minDays:3,maxDays:7,minApr:20};
  assert.equal(rankProducts(rows,pref).ranked[0].score,100);
  assert.equal(rankProducts(rows,{...pref,minApr:50}).ranked.length,0);
  const demo=demoSnapshot(),all=normalizeProducts(demo.products,demo.spot,demo.observedAt),result=rankProducts(all,pref);
  assert.equal(result.eligible.length,4);assert.ok(result.ranked.every(p=>p.discount>=.02&&p.discount<=.03&&p.apr>=.2));
});
test('knee detector rejects straight lines and detects diminishing returns',()=>{
  assert.equal(detectKnee([{x:0,y:0},{x:1,y:1},{x:2,y:2}],'x','y'),null);
  assert.equal(detectKnee([{x:0,y:0},{x:1,y:3},{x:2,y:4}],'x','y').product.x,1);
  assert.equal(detectKnee([{x:0,y:0},{x:1,y:0}],'x','y'),null);
});
test('19 day quote provides less marginal daily return than extending to 12 days',()=>{
  const d=demoSnapshot(),rows=normalizeProducts(d.products,d.spot,d.observedAt),time=marginalAnalysis(rows).time.filter(p=>p.target===83000);
  const first=time.find(p=>p.from===9&&p.to===12),last=time.find(p=>p.from===12&&p.to===19);
  assert.ok(last.perDay<first.perDay);
  assert.ok(Math.abs(last.perDay-((.2717*19-.2944*12)/365/7))<1e-12);
});
test('price marginals are percentage point losses per extra 1% discount',()=>{
  const rows=normalizeProducts([quote({id:'a',strikePrice:'83000',apr:'.3'}),quote({id:'b',strikePrice:'82000',apr:'.2'})],100000,now);
  const [m]=marginalAnalysis(rows).price;
  assert.ok(Math.abs(m.aprLossPer1pct-.1)<1e-12);
  assert.ok(Math.abs(m.returnLossPer1pct-(.1*5/365))<1e-12);
});
test('snapshot validation rejects bad timestamps and arrays',()=>{
  assert.throws(()=>validateSnapshot({version:1,spot:1,observedAt:'oops',products:[]}));
  assert.throws(()=>validateSnapshot({version:1,spot:1,observedAt:now,products:{}}));
  assert.equal(validateSnapshot({version:1,spot:84800,observedAt:now,products:[]}).spot,84800);
});
