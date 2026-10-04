import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchLive,fetchSpot,fetchProducts,getJSON} from '../lib/api.js';

test('direct API requests correct Buy Low parameters and all pages',async()=>{
  const previous=globalThis.fetch;const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    if(url.includes('/ticker/'))return Response.json({price:'84800'});
    const page=Number(new URL(url).searchParams.get('pageIndex'));
    return Response.json({total:101,list:Array.from({length:page===1?100:1},(_,i)=>({id:`${page}-${i}`}))});
  };
  try{
    const result=await fetchLive();assert.equal(result.products.length,101);assert.equal(calls.length,3);
    assert.equal(result.spot,84800);
    const url=new URL(calls[1].url);assert.equal(url.searchParams.get('optionType'),'PUT');assert.equal(url.searchParams.get('exercisedCoin'),'BTC');assert.equal(url.searchParams.get('investCoin'),'USDT');
    assert.ok(!url.searchParams.has('signature'));assert.ok(!calls[1].options.headers);
  }finally{globalThis.fetch=previous;}
});
test('failed pagination never publishes partial quotes',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async url=>url.includes('/ticker/')?Response.json({price:'84800'}):Response.json({total:4,list:[]});
  try{await assert.rejects(fetchLive(),/Incomplete quote pagination/);}finally{globalThis.fetch=previous;}
});
test('region restriction is explicitly reported and no alternate host is attempted',async()=>{
  const previous=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response('{}',{status:451});};
  try{await assert.rejects(fetchLive(),/HTTP 451/);assert.equal(calls,1);}finally{globalThis.fetch=previous;}
});
test('rate limit is reported without immediate retry',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>new Response('{}',{status:429});
  try{await assert.rejects(getJSON('https://api.binance.com/test'),/HTTP 429/);}finally{globalThis.fetch=previous;}
});
test('unexpected response structure is rejected',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async url=>url.includes('/ticker/')?Response.json({price:'84800'}):Response.json({unexpected:true});
  try{await assert.rejects(fetchLive(),/format/);}finally{globalThis.fetch=previous;}
});

test('spot succeeds independently when Dual Investment access fails',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async url=>url.includes('/ticker/')?Response.json({price:'90000'}):new Response('{}',{status:451});
  try{assert.equal((await fetchSpot()).spot,90000);await assert.rejects(fetchProducts(),/HTTP 451/);}finally{globalThis.fetch=previous;}
});
test('invalid spot is rejected and empty product response is valid',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async url=>url.includes('/ticker/')?Response.json({price:'NaN'}):Response.json({total:0,list:[]});
  try{await assert.rejects(fetchSpot(),/spot response format/);assert.deepEqual((await fetchProducts()).products,[]);}finally{globalThis.fetch=previous;}
});
