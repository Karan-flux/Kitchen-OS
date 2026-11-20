const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createAppServer } = require("./server");

async function withServer(directory, run) {
  const server = createAppServer({
    dbPath: path.join(directory, "techtonic.sqlite"),
    storePath: path.join(directory, "orders.json"),
    inventoryStorePath: path.join(directory, "inventory.json"),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("orders are validated, priced by the server, and survive a restart", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "techtonic-"));
  try {
    let orderId;
    await withServer(directory, async (baseUrl) => {
      const invalid = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: "Sam", items: [{ id: 999, quantity: 1 }] }),
      });
      assert.equal(invalid.status, 400);

      const created = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: "Sam", source: "Phone", items: [{ id: 1, quantity: 2 }] }),
      });
      assert.equal(created.status, 201);
      const order = await created.json();
      orderId = order.id;
      assert.equal(order.total, 698);
      assert.equal(order.itemCount, 2);
      assert.equal(order.source, "Phone");

      const cancelled = await fetch(`${baseUrl}/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Cancelled" }),
      });
      assert.equal((await cancelled.json()).status, "Cancelled");

      const walkIn = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "Walk-in", items: [{ id: 2, quantity: 1 }] }),
      });
      assert.equal((await walkIn.json()).customerName, "Walk-in");

      const dashboard = await fetch(`${baseUrl}/api/dashboard`).then((response) => response.json());
      assert.equal(dashboard.orders.length, 2);
      assert.equal(dashboard.inventory.length, 5);

      const restocked = await fetch(`${baseUrl}/api/inventory/paneer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustment: 4 }),
      });
      assert.equal((await restocked.json()).onHand, 6);

      const invalidAdjustment = await fetch(`${baseUrl}/api/inventory/paneer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustment: -7 }),
      });
      assert.equal(invalidAdjustment.status, 400);
    });

    await withServer(directory, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/orders`);
      const orders = await response.json();
      assert.equal(orders.length, 2);
      assert.ok(orders.some((order) => order.id === orderId));
      const inventory = await fetch(`${baseUrl}/api/inventory`).then((response) => response.json());
      assert.equal(inventory.find((item) => item.id === "paneer").onHand, 6);
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("request bodies larger than 64 KiB are rejected by UTF-8 byte size", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "techtonic-body-size-"));
  try {
    await withServer(directory, async (baseUrl) => {
      const body = JSON.stringify({
        customerName: "é".repeat(33000),
        items: [{ id: 1, quantity: 1 }],
      });
      assert.ok(body.length < 64 * 1024);
      assert.ok(Buffer.byteLength(body) > 64 * 1024);

      const response = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      assert.equal(response.status, 413);
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("customer demo loads its assets and submits a server-priced order to the kitchen queue", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "techtonic-customer-demo-"));
  try {
    await withServer(directory, async (baseUrl) => {
      const dashboardPage = await fetch(`${baseUrl}/`);
      assert.equal(dashboardPage.status, 200);
      assert.match(await dashboardPage.text(), /href="\/customer\.html"/);

      const page = await fetch(`${baseUrl}/customer.html`);
      assert.equal(page.status, 200);
      assert.match(page.headers.get("content-type"), /text\/html/);
      assert.match(await page.text(), /Order from the kitchen/);

      const styles = await fetch(`${baseUrl}/customer.css`);
      assert.equal(styles.status, 200);
      assert.match(styles.headers.get("content-type"), /text\/css/);
      const script = await fetch(`${baseUrl}/customer.js`);
      assert.equal(script.status, 200);
      assert.match(script.headers.get("content-type"), /javascript/);
      assert.match(await script.text(), /Place demo order/);

      const created = await fetch(`${baseUrl}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: "Demo customer",
          source: "Other",
          items: [{ id: 1, quantity: 2, price: 1 }],
        }),
      });
      assert.equal(created.status, 201);
      const order = await created.json();
      assert.equal(order.total, 698);
      assert.equal(order.items[0].price, 349);
      assert.equal(order.customerName, "Demo customer");

      const dashboard = await fetch(`${baseUrl}/api/dashboard`).then((response) => response.json());
      assert.ok(dashboard.orders.some((entry) => entry.id === order.id));
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("existing JSON records are imported into SQLite on first startup", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "techtonic-migration-"));
  const storePath = path.join(directory, "orders.json");
  const inventoryStorePath = path.join(directory, "inventory.json");
  const legacyOrder = {
    id: "TTLEGACY01",
    customerName: "Legacy ticket",
    source: "Phone",
    items: [{ id: 1, name: "Tandoori Chicken Pizza", price: 349, quantity: 1 }],
    itemCount: 1,
    total: 349,
    status: "Delivered",
    createdAt: "2026-01-01T10:00:00.000Z",
  };
  const legacyInventory = [{ id: "paneer", name: "Paneer", onHand: 7, unit: "kg", reorderAt: 3 }];
  await fs.writeFile(storePath, JSON.stringify([legacyOrder]));
  await fs.writeFile(inventoryStorePath, JSON.stringify(legacyInventory));

  try {
    await withServer(directory, async (baseUrl) => {
      const orders = await fetch(`${baseUrl}/api/orders`).then((response) => response.json());
      const inventory = await fetch(`${baseUrl}/api/inventory`).then((response) => response.json());
      assert.deepEqual(orders, [legacyOrder]);
      assert.deepEqual(inventory, legacyInventory);
    });

    await fs.writeFile(storePath, JSON.stringify([]));
    await fs.writeFile(inventoryStorePath, JSON.stringify([]));
    await withServer(directory, async (baseUrl) => {
      const orders = await fetch(`${baseUrl}/api/orders`).then((response) => response.json());
      const inventory = await fetch(`${baseUrl}/api/inventory`).then((response) => response.json());
      assert.deepEqual(orders, [legacyOrder]);
      assert.deepEqual(inventory, legacyInventory);
    });
    assert.ok((await fs.stat(path.join(directory, "techtonic.sqlite"))).size > 0);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});