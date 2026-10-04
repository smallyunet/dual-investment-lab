# Dual Investment Lab

Responsive, dependency-free BTC/USDT Buy Low analysis on GitHub Pages.

**Website (after Pages is enabled):** https://smallyunet.github.io/dual-investment-lab/

## Run locally

Node.js 24 and Python 3 are sufficient. No package installation is required.

```sh
npm test
npm run dev
```

Open http://localhost:4173. The UI is English and supports desktop and mobile.

## Data and authentication

The browser requests the official public endpoints:

- `GET https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT`
- `GET https://api.binance.com/sapi/v1/dci/product/list?optionType=PUT&exercisedCoin=BTC&investCoin=USDT&pageSize=100&pageIndex=1`

As checked on 2026-10-04, the current [Binance reference](https://developers.binance.com/en/docs/catalog/investment-and-services-dual-investment/api/rest-api/market-data), its linked OpenAPI schema, and official Python SDK describe the list endpoint without signing. The current general security documentation defines unspecified security as `NONE`. An older official GitHub Swagger still labels this endpoint `USER_DATA`; this inconsistency is documented rather than silently assuming authenticated access works. This application implements the current public contract and never requests or stores Binance credentials.

IP weight: 1 per product-list request; page size up to 100. All pages are collected, with a 10,000-record safety limit. Spot and product requests are not atomic.

GitHub Actions attempts collection every 30 minutes and deploys the static site. Scheduled actions may be delayed. A successful response is saved to `data/latest.json`; a failed request updates `data/status.json` while preserving the last successful snapshot. Browsers first load the snapshot, then try to refresh directly. Regional restrictions (HTTP 451), CORS, or API policy can prevent either path. Never bypass these restrictions. The original cloud environment returned HTTP 451, so live availability was not established there.

Fallbacks are labelled explicitly:

- Official live response / official snapshot, with observation timestamp.
- Stale snapshot after 60 minutes, labelled as past analysis.
- User-imported JSON, whose source is unverified.
- Historical demo quotes supplied by the user. The spot is 84,800 USDT; settlement dates are synthetic relative dates for charting. These are not live products. There is no invented 12-day or 19-day grid: only the provided 83,000 quotes are included for those terms.

## Analysis

APR is a decimal (`0.2865` means 28.65%). Period return uses `apr * duration / 365`, using the official quoted interest duration rather than substituting wall-clock time to settlement. Both are shown. Effective entry is `strikePrice / (1 + periodReturn)`, an approximation conditional on conversion, not a loss guarantee.

Initial adjustable preferences: 2–3% discount, 3–7 day interest terms, APR ≥20%. Among eligible quotes, remove Pareto-dominated products using discount, period return and duration. Rank the frontier by Euclidean distance to the normalized ideal (highest discount, highest period return, shortest duration), with equal treatment of dimensions. Score is `100 * (1 - distance / sqrt(3))`. Constant dimensions contribute zero. This is explicit preference-based ranking, not a uniquely optimal financial recommendation.

Knees use maximum positive distance above the normalized endpoint chord, at least three points, and strength greater than 0.03. Linear and convex curves are not forced to have knees. They are labelled separately from rankings. Time comparisons use the same strike; price comparisons use the same settlement date. Price marginal loss is measured per extra 1 percentage point of discount; the local 0.5-point estimate is half. These comparisons do not estimate future rollovers or assignment probability.

The UI includes three recommendation cards, APR / period return / effective discount heatmaps, interactive quote details, time and price curves, marginal figures, sorting, preference filtering, CSV export and JSON import. No auto-subscription is implemented.

## Import format

```json
{
  "version": 1,
  "spot": 84800,
  "observedAt": "2026-10-04T00:00:00Z",
  "products": [
    {
      "id": "quote-1",
      "optionType": "PUT",
      "investCoin": "USDT",
      "exercisedCoin": "BTC",
      "strikePrice": "83000",
      "duration": 5,
      "settleDate": 1791504000000,
      "apr": "0.2865",
      "canPurchase": true
    }
  ]
}
```

Expired, unavailable or malformed quotes are excluded; when duplicate strike/date quotes exist, the highest APR is kept. Imported timestamps must not be more than five minutes in the future. Numeric CSV fields use decimal fractions for percentages.
