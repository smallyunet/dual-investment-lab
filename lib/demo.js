import {DAY} from './analysis.js';
// User-provided historical observations. Dates are synthetic relative dates for visualization only.
export function demoSnapshot() {
  const observedAt=new Date().toISOString();
  const base=new Date(observedAt).getTime();
  const targets=[84500,84000,83500,83000,82500,82000,81500,81000];
  const grid={3:[68.13,48.48,32.80,24.08,16.87,11.61,8.52,6.16],4:[60.83,45.25,32.49,24.77,18.28,13.30,10,7.43],5:[63.98,49.10,37.88,28.65,21.95,16.62,12.75,9.64],9:[47.62,39.57,32.44,26.28,20.95,17.20,14.12,11.43]};
  const products=[];
  function add(target,days,apr){products.push({id:`demo-${target}-${days}`,strikePrice:String(target),duration:days,settleDate:base+days*DAY,apr:String(apr/100),optionType:'PUT',investCoin:'USDT',exercisedCoin:'BTC',canPurchase:true});}
  for(const [days,aprs] of Object.entries(grid)) targets.forEach((target,i)=>add(target,Number(days),aprs[i]));
  add(83000,12,29.44);add(83000,19,27.17);
  return {version:1,source:'demo',observedAt,spot:84800,products};
}
