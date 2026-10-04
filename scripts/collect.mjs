import {mkdir,writeFile,rename} from 'node:fs/promises';
import {fetchLive} from '../lib/api.js';
import {validateSnapshot,normalizeProducts} from '../lib/analysis.js';
await mkdir('data',{recursive:true});
const attemptedAt=new Date().toISOString();
try {
  const data=validateSnapshot(await fetchLive());
  if(!normalizeProducts(data.products,data.spot,data.observedAt).length) throw new Error('The official API returned no available BTC/USDT Buy Low quotes');
  await writeFile('data/latest.tmp',JSON.stringify(data,null,2));
  await rename('data/latest.tmp','data/latest.json');
  await writeFile('data/status.json',JSON.stringify({ok:true,attemptedAt,count:data.products.length}));
  console.log(`Collected ${data.products.length} products at ${attemptedAt}`);
} catch (error) {
  await writeFile('data/status.json',JSON.stringify({ok:false,attemptedAt,error:error.message}));
  console.error(`Collection unavailable: ${error.message}`);
  // Preserve the previous successful snapshot; status carries the explicit failure.
}
