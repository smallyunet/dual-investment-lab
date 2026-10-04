const BASE = 'https://api.binance.com';
export async function getJSON(url, timeout = 12000) {
  const response = await fetch(url,{signal:AbortSignal.timeout(timeout), cache:'no-store'});
  if (!response.ok) {
    if(response.status===451) throw new Error('Binance restricts access from this region (HTTP 451)');
    if(response.status===429) throw new Error('Binance rate limit reached (HTTP 429). Please refresh later.');
    const detail=await response.text();
    throw new Error(`API HTTP ${response.status}：${detail.slice(0,160)}`);
  }
  return response.json();
}
export async function fetchLive() {
  const products = [];
  const ticker = await getJSON(`${BASE}/api/v3/ticker/price?symbol=BTCUSDT`);
  const observedAt = new Date().toISOString();
  let total = null;
  for (let page=1;page<=100;page++) {
    const params=new URLSearchParams({optionType:'PUT',exercisedCoin:'BTC',investCoin:'USDT',pageSize:'100',pageIndex:String(page)});
    const data=await getJSON(`${BASE}/sapi/v1/dci/product/list?${params}`);
    if(!Array.isArray(data.list)||!Number.isFinite(Number(data.total))) throw new Error('Unexpected Binance product-list response format');
    total=Number(data.total); products.push(...data.list);
    if(products.length>=total || data.list.length===0) break;
  }
  if (products.length < total) throw new Error('Incomplete quote pagination. Partial data is not used for recommendations.');
  return {version:1,source:'binance',observedAt,spot:Number(ticker.price),products};
}
