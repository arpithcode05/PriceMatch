const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "pricematch.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  image_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL,
  price REAL NOT NULL CHECK(price > 0),
  product_url TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_prices_product ON prices(product_id, checked_at);
`);

const shops = [
  { id: "amazon", name: "Amazon", search: q => `https://www.amazon.in/s?k=${encodeURIComponent(q)}` },
  { id: "flipkart", name: "Flipkart", search: q => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}` },
  { id: "croma", name: "Croma", search: q => `https://www.croma.com/searchB?q=${encodeURIComponent(q)}%3Arelevance` },
  { id: "reliance", name: "Reliance Digital", search: q => `https://www.reliancedigital.in/search?q=${encodeURIComponent(q)}` },
  { id: "meesho", name: "Meesho", search: q => `https://www.meesho.com/search?q=${encodeURIComponent(q)}` }
];

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function productData(id) {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  if (!product) return null;
  const prices = db.prepare(`
    SELECT p.* FROM prices p
    JOIN (SELECT shop_id, MAX(id) AS latest_id FROM prices WHERE product_id = ? GROUP BY shop_id) latest
    ON p.id = latest.latest_id WHERE p.product_id = ?
  `).all(id, id);
  const history = db.prepare(`
    SELECT shop_id, price, checked_at FROM prices
    WHERE product_id = ? ORDER BY id DESC LIMIT 50
  `).all(id).reverse();
  const offers = prices.map(p => {
    const shop = shops.find(s => s.id === p.shop_id);
    return { ...p, shop_name: shop?.name || p.shop_id };
  });
  const min = offers.length ? Math.min(...offers.map(p => p.price)) : null;
  const max = offers.length ? Math.max(...offers.map(p => p.price)) : null;
  return { ...product, offers, history, lowest_price: min, saving: min !== null ? max - min : 0 };
}

function seedIfEmpty() {
  if (db.prepare("SELECT COUNT(*) AS n FROM products").get().n) return;
  const seed = [
    { name: "Samsung Galaxy A55 5G (8/128 GB)", category: "Phones", image_url: "https://images.unsplash.com/photo-1511709268805-4e9042af9f23?auto=format&fit=crop&w=900&q=80", description: "Sample smartphone listing", prices: [["amazon", 27999], ["flipkart", 26999], ["croma", 28499]] },
    { name: "Sony WH-CH520 Wireless Headphones", category: "Audio", image_url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80", description: "Sample wireless headphones", prices: [["amazon", 4490], ["flipkart", 4299], ["reliance", 4590]] },
    { name: "Apple iPad 10th Gen (64 GB)", category: "Tablets", image_url: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=900&q=80", description: "Sample tablet listing", prices: [["amazon", 29900], ["flipkart", 29499], ["croma", 30900]] },
    { name: "Philips Air Fryer 4.1 L", category: "Home", image_url: "https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=900&q=80", description: "Sample kitchen appliance", prices: [["amazon", 6995], ["flipkart", 7499], ["reliance", 6899]] }
  ];
  const insertProduct = db.prepare("INSERT INTO products(name,category,image_url,description) VALUES(?,?,?,?)");
  const insertPrice = db.prepare("INSERT INTO prices(product_id,shop_id,price,product_url) VALUES(?,?,?,?)");
  const tx = db.transaction(() => {
    for (const item of seed) {
      const result = insertProduct.run(item.name, item.category, item.image_url, item.description);
      for (const [shop, price] of item.prices) insertPrice.run(result.lastInsertRowid, shop, price, "");
    }
  });
  tx();
}
seedIfEmpty();

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "PriceMatch API" }));
app.get("/api/shops", (_req, res) => res.json(shops.map(({id,name}) => ({id,name}))));
app.get("/api/products", (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  const category = String(req.query.category || "All");
  const sort = String(req.query.sort || "saving");
  let rows = db.prepare("SELECT * FROM products ORDER BY created_at DESC").all()
    .map(p => productData(p.id))
    .filter(p => p.name.toLowerCase().includes(q) && (category === "All" || p.category === category));
  if (sort === "price") rows.sort((a,b) => (a.lowest_price ?? Infinity) - (b.lowest_price ?? Infinity));
  else if (sort === "name") rows.sort((a,b) => a.name.localeCompare(b.name));
  else rows.sort((a,b) => b.saving - a.saving);
  res.json(rows);
});
app.get("/api/products/:id", (req, res) => {
  const p = productData(Number(req.params.id));
  if (!p) return res.status(404).json({ error: "Product not found" });
  res.json(p);
});
app.post("/api/products", (req, res) => {
  const { name, category = "Other", image_url = "", description = "", prices = [] } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Product name is required." });
  if (!Array.isArray(prices) || prices.filter(x => Number(x.price) > 0).length < 2)
    return res.status(400).json({ error: "Enter prices for at least two shops." });
  const allowed = new Set(shops.map(s => s.id));
  const insert = db.transaction(() => {
    const p = db.prepare("INSERT INTO products(name,category,image_url,description) VALUES(?,?,?,?)")
      .run(String(name).trim(), String(category), String(image_url), String(description));
    const add = db.prepare("INSERT INTO prices(product_id,shop_id,price,product_url) VALUES(?,?,?,?)");
    for (const offer of prices) {
      const price = Number(offer.price);
      if (allowed.has(offer.shop_id) && Number.isFinite(price) && price > 0)
        add.run(p.lastInsertRowid, offer.shop_id, price, String(offer.product_url || ""));
    }
    return p.lastInsertRowid;
  });
  try { res.status(201).json(productData(insert())); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.put("/api/products/:id", (req, res) => {
  const id = Number(req.params.id), old = db.prepare("SELECT * FROM products WHERE id=?").get(id);
  if (!old) return res.status(404).json({ error: "Product not found" });
  const { name = old.name, category = old.category, image_url = old.image_url, description = old.description, prices } = req.body || {};
  db.prepare("UPDATE products SET name=?,category=?,image_url=?,description=? WHERE id=?")
    .run(String(name).trim(), String(category), String(image_url), String(description), id);
  if (Array.isArray(prices)) {
    const allowed = new Set(shops.map(s => s.id));
    const add = db.prepare("INSERT INTO prices(product_id,shop_id,price,product_url) VALUES(?,?,?,?)");
    for (const offer of prices) {
      const price = Number(offer.price);
      if (allowed.has(offer.shop_id) && Number.isFinite(price) && price > 0)
        add.run(id, offer.shop_id, price, String(offer.product_url || ""));
    }
  }
  res.json(productData(id));
});
app.delete("/api/products/:id", (req, res) => {
  const result = db.prepare("DELETE FROM products WHERE id=?").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Product not found" });
  res.json({ ok: true });
});
app.get("/api/products/:id/history", (req, res) => {
  if (!db.prepare("SELECT id FROM products WHERE id=?").get(Number(req.params.id)))
    return res.status(404).json({ error: "Product not found" });
  res.json(db.prepare("SELECT shop_id,price,checked_at FROM prices WHERE product_id=? ORDER BY id ASC")
    .all(Number(req.params.id)));
});
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`PriceMatch running on http://localhost:${PORT}`));
