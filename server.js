const http = require("node:http");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { respond: respondToAssistant } = require("./assistant");

const ROOT = __dirname;
const DEFAULT_DATABASE = path.join(ROOT, "data", "techtonic.sqlite");
const DEFAULT_STORE = path.join(ROOT, "data", "orders.json");
const DEFAULT_INVENTORY_STORE = path.join(ROOT, "data", "inventory.json");
const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const STATUSES = ["Preparing", "Ready", "Out for delivery", "Delivered", "Cancelled"];
const ORDER_SOURCES = ["Swiggy", "Zomato", "Phone", "Walk-in", "Other"];
const DEFAULT_INVENTORY = [
  { id: "chicken", name: "Chicken", onHand: 12, unit: "kg", reorderAt: 6 },
  { id: "cheese", name: "Mozzarella", onHand: 4, unit: "kg", reorderAt: 5 },
  { id: "tomatoes", name: "Tomatoes", onHand: 8, unit: "kg", reorderAt: 4 },
  { id: "paneer", name: "Paneer", onHand: 2, unit: "kg", reorderAt: 3 },
  { id: "packaging", name: "Packaging boxes", onHand: 28, unit: "pcs", reorderAt: 20 },
];

const menu = [
  { id: 1, name: "Tandoori Chicken Pizza", category: "pizza", price: 349, emoji: "🍕", description: "Tandoori chicken, onion, capsicum & cheese", image: "https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=800&q=85" },
  { id: 2, name: "Farmhouse Pizza", category: "pizza", price: 299, emoji: "🍕", description: "Fresh vegetables, mozzarella & herbs", image: "https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?auto=format&fit=crop&w=800&q=85" },
  { id: 3, name: "TechTonic Burger", category: "burger", price: 249, emoji: "🍔", description: "Crispy chicken, cheese & special sauce", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=85" },
  { id: 4, name: "Classic Veg Burger", category: "burger", price: 199, emoji: "🍔", description: "Crispy veg patty with fresh vegetables", image: "https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=800&q=85" },
  { id: 5, name: "Butter Chicken", category: "indian", price: 299, emoji: "🍛", description: "Creamy tomato gravy with tender chicken", image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=85" },
  { id: 6, name: "Paneer Tikka", category: "indian", price: 249, emoji: "🥘", description: "Grilled paneer with peppers and spices", image: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=800&q=85" },
  { id: 7, name: "Mango Shake", category: "drinks", price: 129, emoji: "🥭", description: "Fresh mango blended with chilled milk", image: "https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?auto=format&fit=crop&w=800&q=85" },
  { id: 8, name: "Cold Coffee", category: "drinks", price: 119, emoji: "☕", description: "Cold brewed coffee with cream", image: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=800&q=85" },
];

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function readBody(request) {
  let raw = "";
  let bytesRead = 0;
  for await (const chunk of request) {
    bytesRead += Buffer.byteLength(chunk);
    if (bytesRead > MAX_REQUEST_BODY_BYTES) throw Object.assign(new Error("Request is too large."), { status: 413 });
    raw += chunk;
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
}

function createAppServer({ dbPath = DEFAULT_DATABASE, storePath = DEFAULT_STORE, inventoryStorePath = DEFAULT_INVENTORY_STORE } = {}) {
  fsSync.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      source TEXT NOT NULL,
      item_count INTEGER NOT NULL,
      total INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_items (
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      menu_item_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      PRIMARY KEY (order_id, position)
    );
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      on_hand REAL NOT NULL,
      unit TEXT NOT NULL,
      reorder_at REAL NOT NULL,
      updated_at TEXT
    );
  `);

  const insertOrder = db.prepare(`
    INSERT INTO orders (id, customer_name, source, item_count, total, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (order_id, position, menu_item_id, name, price, quantity)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertInventoryItem = db.prepare(`
    INSERT INTO inventory (id, name, on_hand, unit, reorder_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  function withTransaction(operation) {
    db.exec("BEGIN");
    try {
      operation();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function importLegacyArray(filePath, fallback) {
    if (!fsSync.existsSync(filePath)) return fallback;
    const records = JSON.parse(fsSync.readFileSync(filePath, "utf8"));
    if (!Array.isArray(records)) throw new Error(`Legacy data in ${filePath} must be an array.`);
    return records;
  }

  if (!db.prepare("SELECT 1 FROM app_meta WHERE key = ?").get("legacy_json_imported")) {
    const legacyOrders = importLegacyArray(storePath, []);
    const legacyInventory = importLegacyArray(inventoryStorePath, DEFAULT_INVENTORY);
    withTransaction(() => {
      for (const order of legacyOrders) {
        insertOrder.run(order.id, order.customerName, order.source, order.itemCount, order.total, order.status, order.createdAt);
        order.items.forEach((item, position) => {
          insertOrderItem.run(order.id, position, item.id, item.name, item.price, item.quantity);
        });
      }
      for (const item of legacyInventory) {
        insertInventoryItem.run(item.id, item.name, item.onHand, item.unit, item.reorderAt, item.updatedAt || null);
      }
      db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run("legacy_json_imported", new Date().toISOString());
    });
  }

  async function readOrders() {
    const rows = db.prepare(`
      SELECT id, customer_name AS customerName, source, item_count AS itemCount,
        total, status, created_at AS createdAt
      FROM orders
    `).all();
    const readItems = db.prepare(`
      SELECT menu_item_id AS id, name, price, quantity
      FROM order_items WHERE order_id = ? ORDER BY position
    `);
    return rows.map((order) => ({ ...order, items: readItems.all(order.id) }));
  }

  async function saveOrders(orders) {
    withTransaction(() => {
      db.exec("DELETE FROM orders");
      for (const order of orders) {
        insertOrder.run(order.id, order.customerName, order.source, order.itemCount, order.total, order.status, order.createdAt);
        order.items.forEach((item, position) => {
          insertOrderItem.run(order.id, position, item.id, item.name, item.price, item.quantity);
        });
      }
    });
  }

  async function readInventory() {
    return db.prepare(`
      SELECT id, name, on_hand AS onHand, unit, reorder_at AS reorderAt, updated_at AS updatedAt
      FROM inventory
    `).all().map((item) => {
      if (item.updatedAt === null) delete item.updatedAt;
      return item;
    });
  }

  async function saveInventory(inventory) {
    withTransaction(() => {
      db.exec("DELETE FROM inventory");
      for (const item of inventory) {
        insertInventoryItem.run(item.id, item.name, item.onHand, item.unit, item.reorderAt, item.updatedAt || null);
      }
    });
  }

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return sendJson(response, 200, { ok: true, service: "TechTonic Kitchen API" });
      }

      if (url.pathname === "/api/menu" && request.method === "GET") {
        return sendJson(response, 200, menu);
      }

      if (url.pathname === "/api/dashboard" && request.method === "GET") {
        const [orders, inventory] = await Promise.all([readOrders(), readInventory()]);
        return sendJson(response, 200, {
          menu,
          orders: orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          inventory,
        });
      }

      if (url.pathname === "/api/assistant" && request.method === "POST") {
        const body = await readBody(request);
        const baseUrl = `http://127.0.0.1:${request.socket.localPort}`;
        return sendJson(response, 200, await respondToAssistant(body, baseUrl));
      }

      if (url.pathname === "/api/inventory" && request.method === "GET") {
        return sendJson(response, 200, await readInventory());
      }

      const inventoryMatch = url.pathname.match(/^\/api\/inventory\/([a-z0-9-]+)$/);
      if (inventoryMatch && request.method === "PATCH") {
        const body = await readBody(request);
        const adjustment = Number(body.adjustment);
        if (!Number.isFinite(adjustment) || adjustment === 0 || Math.abs(adjustment) > 10000) {
          return sendJson(response, 400, { error: "Enter a valid stock adjustment." });
        }
        const inventory = await readInventory();
        const item = inventory.find((entry) => entry.id === inventoryMatch[1]);
        if (!item) return sendJson(response, 404, { error: "Ingredient not found." });
        if (item.onHand + adjustment < 0) return sendJson(response, 400, { error: "Stock cannot be reduced below zero." });
        item.onHand = Number((item.onHand + adjustment).toFixed(2));
        item.updatedAt = new Date().toISOString();
        await saveInventory(inventory);
        return sendJson(response, 200, item);
      }

      if (url.pathname === "/api/orders" && request.method === "GET") {
        const orders = await readOrders();
        return sendJson(response, 200, orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      }

      if (url.pathname === "/api/orders" && request.method === "POST") {
        const body = await readBody(request);
        const customerName = typeof body.customerName === "string" ? body.customerName.trim().slice(0, 60) : "";
        const source = ORDER_SOURCES.includes(body.source) ? body.source : "Other";
        if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > menu.length) {
          return sendJson(response, 400, { error: "An order must contain menu items." });
        }

        const items = [];
        for (const entry of body.items) {
          const product = menu.find((item) => item.id === Number(entry.id));
          const quantity = Number(entry.quantity);
          if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
            return sendJson(response, 400, { error: "One or more order items are invalid." });
          }
          items.push({ id: product.id, name: product.name, price: product.price, quantity });
        }

        const orders = await readOrders();
        const order = {
          id: `TT${Date.now().toString().slice(-6)}${crypto.randomInt(100, 1000)}`,
          customerName: customerName || "Walk-in",
          source,
          items,
          itemCount: items.reduce((total, item) => total + item.quantity, 0),
          total: items.reduce((total, item) => total + item.price * item.quantity, 0),
          status: "Preparing",
          createdAt: new Date().toISOString(),
        };
        orders.push(order);
        await saveOrders(orders);
        return sendJson(response, 201, order);
      }

      const statusMatch = url.pathname.match(/^\/api\/orders\/([A-Z0-9]+)$/);
      if (statusMatch && request.method === "PATCH") {
        const body = await readBody(request);
        if (!STATUSES.includes(body.status)) return sendJson(response, 400, { error: "Unknown order status." });
        const orders = await readOrders();
        const order = orders.find((entry) => entry.id === statusMatch[1]);
        if (!order) return sendJson(response, 404, { error: "Order not found." });
        order.status = body.status;
        await saveOrders(orders);
        return sendJson(response, 200, order);
      }

      if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });
      const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const allowedFiles = new Set(["index.html", "style.css", "script.js", "voice.js", "customer.html", "customer.css", "customer.js"]);
      if (!allowedFiles.has(file)) return sendJson(response, 404, { error: "Not found." });
      const contentTypes = { "index.html": "text/html; charset=utf-8", "style.css": "text/css; charset=utf-8", "script.js": "text/javascript; charset=utf-8", "voice.js": "text/javascript; charset=utf-8", "customer.html": "text/html; charset=utf-8", "customer.css": "text/css; charset=utf-8", "customer.js": "text/javascript; charset=utf-8" };
      response.writeHead(200, { "Content-Type": contentTypes[file] });
      response.end(await fs.readFile(path.join(ROOT, file)));
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.status ? error.message : "The server could not complete this request." });
    }
  });
  server.on("close", () => db.close());
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createAppServer().listen(port, () => console.log(`TechTonic is ready at http://localhost:${port}`));
}

module.exports = { createAppServer };