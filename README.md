# PriceMatch — Full-stack prototype

A college-demo-ready product price comparison web app built with HTML, CSS, JavaScript, Node.js, Express and SQLite.

## Features
- Product images (paste an image URL when adding/editing)
- Search, category filters and sorting
- Compare prices across Amazon, Flipkart, Croma, Reliance Digital and Meesho
- Cheapest offer highlighting
- Exact product URLs (optional); otherwise opens a shop search page
- Price history (each saved update is retained)
- Add, edit and delete products
- CSV export
- Responsive mobile/desktop layout
- SQLite database persisted in `data/pricematch.db`

## Run locally
1. Install Node.js 20 or newer: https://nodejs.org/
2. Extract this folder.
3. Open a terminal in this folder and run:
   ```bash
   npm install
   npm start
   ```
4. Open http://localhost:3000

The first run creates a SQLite database and inserts sample products. Sample prices are illustrative, not live prices.

## Put it online (Render)
This project is configured for a Node web service. For persistent SQLite data, attach a Render persistent disk:
1. Create a GitHub repository and upload the contents of this folder.
2. In Render, choose **New → Web Service**, connect the repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add a persistent disk mounted at `/var/data`.
6. Add environment variable `DATA_DIR=/var/data`.
7. Deploy. Render provides a public `https://...onrender.com` URL.

A hosted service may incur charges for persistent storage depending on the provider's current plan. Check current pricing before enabling a disk. If you deploy without persistent storage, the app may lose its SQLite data when the host restarts or redeploys.

## Important project limitations
- It does **not** scrape or fetch live prices. Users enter prices manually.
- Shop links open search results unless an exact product URL was entered.
- Product images are URLs supplied by the user or sample records.
- This is a demonstration prototype, not a production shopping/affiliate platform.
- No login or multi-user permissions are included.

## API overview
- `GET /api/health` — health check
- `GET /api/shops` — supported stores
- `GET /api/products` — list/search products (`q`, `category`, `sort`)
- `GET /api/products/:id` — product and latest offers
- `POST /api/products` — create product (requires 2+ prices)
- `PUT /api/products/:id` — edit product and append price snapshots
- `DELETE /api/products/:id` — delete product and history
- `GET /api/products/:id/history` — price history

## Suggested demo flow
1. Open the public/local site.
2. Search “Sony” or select Audio.
3. Add a product, paste an image URL, and enter prices for two or more shops.
4. Save and point out the green “Best” offer.
5. Update a price and open Price history.
6. Export the comparison to CSV.

## Project stack
- Frontend: HTML5, CSS3, vanilla JavaScript
- Backend: Node.js + Express
- Database: SQLite (`better-sqlite3`)
