export const DAY = 86400000;

export function normalizeProducts(raw, spot, observedAt) {
  if (!Number.isFinite(spot) || spot <= 0) throw new Error('BTC spot price must be positive');
  const now = new Date(observedAt).getTime();
  if (!Number.isFinite(now)) throw new Error('Invalid observation timestamp');
  if (!Array.isArray(raw)) throw new Error('Products must be an array');
  const seen = new Set();
  return [...raw].sort((a,b)=>Number(b.apr)-Number(a.apr)).flatMap((p, index) => {
    const target = Number(p.strikePrice), apr = Number(p.apr), settle = Number(p.settleDate);
    const remainingDays = (settle - now) / DAY;
    // Binance duration is the quoted interest term; do not replace it with wall-clock time.
    const days = Number(p.duration);
    if (p.optionType !== 'PUT' || p.investCoin !== 'USDT' || p.exercisedCoin !== 'BTC' || p.canPurchase !== true ||
        !Number.isFinite(target) || target <= 0 || !Number.isFinite(apr) || apr < 0 ||
        !Number.isFinite(days) || days <= 0 || !Number.isFinite(remainingDays) || remainingDays <= 0 ||
        (p.purchaseEndTime != null && Number(p.purchaseEndTime) <= now)) return [];
    const key = `${target}:${settle}`;
    // Keep the strongest available quote for the same strike and settlement.
    if (seen.has(key)) return [];
    seen.add(key);
    const periodReturn = apr * days / 365;
    const effectivePrice = target / (1 + periodReturn);
    return [{ id: String(p.id ?? index), target, apr, settle, days, remainingDays,
      discount: 1 - target / spot, periodReturn, effectivePrice,
      effectiveDiscount: 1 - effectivePrice / spot, raw: p }];
  }).sort((a,b) => a.days - b.days || b.target - a.target);
}

export function paretoFrontier(rows) {
  const eps = 1e-12;
  return rows.filter(a => !rows.some(b => b !== a &&
    b.discount >= a.discount - eps && b.periodReturn >= a.periodReturn - eps && b.days <= a.days + eps &&
    (b.discount > a.discount + eps || b.periodReturn > a.periodReturn + eps || b.days < a.days - eps)));
}

const range = (values) => [Math.min(...values), Math.max(...values)];
const norm = (x, [lo, hi]) => hi === lo ? 0 : (x - lo) / (hi - lo);
export function rankProducts(rows, preferences) {
  const eligible = rows.filter(p => p.discount >= preferences.minDiscount / 100 &&
    p.discount <= preferences.maxDiscount / 100 && p.days >= preferences.minDays &&
    p.days <= preferences.maxDays && p.apr >= preferences.minApr / 100);
  if (!eligible.length) return { ranked: [], frontier: [], eligible: [] };
  const frontier = paretoFrontier(eligible);
  const d = range(eligible.map(p => p.discount)), r = range(eligible.map(p => p.periodReturn)), t = range(eligible.map(p => p.days));
  const ranked = frontier.map(p => {
    const losses = [d[0] === d[1] ? 0 : 1 - norm(p.discount, d), r[0] === r[1] ? 0 : 1 - norm(p.periodReturn, r), norm(p.days, t)];
    const distance = Math.hypot(...losses);
    return {...p, score: 100 * (1 - distance / Math.sqrt(3)), losses};
  }).sort((a,b) => b.score - a.score || a.days - b.days || b.discount - a.discount);
  return { ranked, frontier, eligible };
}

// Normalized maximum positive distance above the endpoint chord (Kneedle-style).
// No knee is emitted for linear, convex, short, or almost-flat data.
export function detectKnee(rows, xKey, yKey) {
  const points = [...rows].sort((a,b) => a[xKey] - b[xKey]);
  if (points.length < 3) return null;
  const xr = range(points.map(p=>p[xKey])), yr = range(points.map(p=>p[yKey]));
  if (xr[0] === xr[1] || yr[0] === yr[1]) return null;
  const first = norm(points[0][yKey], yr), last = norm(points.at(-1)[yKey], yr);
  let best = null;
  for (const p of points.slice(1,-1)) {
    const x = norm(p[xKey],xr), y = norm(p[yKey],yr);
    const strength = (y - (first + x * (last-first))) / Math.sqrt(1+(last-first)**2);
    if (strength > .03 && (!best || strength > best.strength)) best = {product:p, strength};
  }
  return best;
}

export function marginalAnalysis(rows) {
  const byTarget = new Map(), bySettle = new Map();
  for (const p of rows) {
    if (!byTarget.has(p.target)) byTarget.set(p.target,[]);
    if (!bySettle.has(p.settle)) bySettle.set(p.settle,[]);
    byTarget.get(p.target).push(p); bySettle.get(p.settle).push(p);
  }
  const time = [], price = [], knees = [];
  for (const [target, group] of byTarget) {
    const sorted = [...group].sort((a,b)=>a.days-b.days);
    for (let i=1;i<sorted.length;i++) {
      const a=sorted[i-1], b=sorted[i], delta=b.days-a.days;
      if (delta>0) time.push({target,from:a.days,to:b.days,perDay:(b.periodReturn-a.periodReturn)/delta});
    }
    const knee=detectKnee(sorted,'days','periodReturn');
    if (knee) knees.push({...knee,dimension:'time'});
  }
  for (const [settle, group] of bySettle) {
    const sorted=[...group].sort((a,b)=>a.discount-b.discount);
    for (let i=1;i<sorted.length;i++) {
      const a=sorted[i-1],b=sorted[i],delta=b.discount-a.discount;
      if (delta>0) price.push({settle,days:b.days,from:a.target,to:b.target,aprLossPer1pct:(a.apr-b.apr)/delta*.01,returnLossPer1pct:(a.periodReturn-b.periodReturn)/delta*.01});
    }
    const knee=detectKnee(sorted,'discount','periodReturn');
    if(knee) knees.push({...knee,dimension:'price'});
  }
  return {time,price,knees,byTarget,bySettle};
}

export function validateSnapshot(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.products) || data.products.length > 10000 ||
      !Number.isFinite(Number(data.spot)) || Number(data.spot) <= 0 ||
      !Number.isFinite(new Date(data.observedAt).getTime())) throw new Error('Invalid JSON: expected version:1, spot, observedAt and products');
  return data;
}
