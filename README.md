# Dual Investment Lab

A responsive, dependency-free BTC/USDT Buy Low analysis page.

Website: https://smallyunet.github.io/dual-investment-lab/

## Data flow

Opening the page makes two independent requests directly from the browser:

- BTC spot: `GET https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT`
- Buy Low products: `GET https://api.binance.com/sapi/v1/dci/product/list?optionType=PUT&exercisedCoin=BTC&investCoin=USDT&pageSize=100&pageIndex=1`

Product pagination continues until all results have been fetched, with a 10,000-record safety limit. Partial pagination is never used for analysis. Requests bypass the HTTP cache. Use **Fetch live quotes** to request fresh data again; there is no polling, background collection or schedule.

The page contains no historical market data, saved market snapshots, uploaded-data path or demo fallback. It stores only user preferences in local storage. Each refresh clears the previous market response. If a request fails, the page displays an error and leaves the affected values unavailable. Spot is shown independently when its request succeeds; analysis requires both spot and a complete product response. An empty successful product list is shown as an empty result.

The current [Binance reference](https://developers.binance.com/en/docs/catalog/investment-and-services-dual-investment/api/rest-api/market-data) describes the product-list request without signing, with IP weight 1 and page size up to 100. Browser access still depends on Binance CORS, network, geographic restrictions and API policy. The page never asks for Binance credentials. Direct browser access has previously failed in our verification environment; deployment success does not establish live API availability.

GitHub Actions only tests and deploys the static files on pushes to `main` or manual dispatch. It does not contact Binance, store quotes or run on a schedule.

## Analysis

APR is a decimal (`0.2865` means 28.65%). Period return uses `apr * duration / 365`, using the API interest duration. Time to settlement is shown separately. Effective entry is `strikePrice / (1 + periodReturn)`, conditional on conversion.

Adjustable initial preferences: 2–3% discount, 3–7 day interest terms, APR ≥20%. The page removes Pareto-dominated quotes using discount, period return and duration. It ranks the remaining candidates by Euclidean distance to the normalized ideal: highest discount, highest period return, shortest term. Score: `100 * (1 - distance / sqrt(3))`; constant dimensions contribute zero. Preferences are not market data or a claim of optimality.

Knees use the maximum positive distance above the normalized endpoint chord, at least three points, and strength greater than 0.03. Time comparisons use the same strike; price comparisons use the same settlement. Marginals describe the current product grid, not future rollover returns or assignment probabilities.

Available UI: recommendation cards, APR / period return / effective discount heatmaps, quote details, time and price curves, sorting, preference filters and CSV export. No automatic subscriptions.

## Local development

```sh
npm test
python3 -m http.server 4173
```

Open http://localhost:4173. Calculation tests contain synthetic fixtures only inside `tests/`, which is excluded from the deployed website.
