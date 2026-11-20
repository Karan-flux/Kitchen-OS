const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createAppServer } = require("./server");

async function withServer(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "techtonic-assistant-"));
  const server = createAppServer({
    dbPath: path.join(directory, "techtonic.sqlite"),
    storePath: path.join(directory, "orders.json"),
    inventoryStorePath: path.join(directory, "inventory.json"),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function ask(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

test("assistant answers low-stock and ingredient quantity questions", async () => {
  await withServer(async (baseUrl) => {
    const stock = await ask(baseUrl, { text: "Which ingredients are low stock?" });
    assert.equal(stock.status, 200);
    assert.match(stock.data.reply, /Mozzarella/);
    assert.match(stock.data.reply, /Paneer/);
    assert.equal(stock.data.pending, null);

    const quantity = await ask(baseUrl, { text: "How much paneer is left?" });
    assert.match(quantity.data.reply, /Paneer: 2 kg on hand/);

    const todayCount = await ask(baseUrl, { text: "How many orders today?" });
    assert.match(todayCount.data.reply, /0 recorded orders today/);

    const activeCount = await ask(baseUrl, { text: "How many active orders?" });
    assert.match(activeCount.data.reply, /0 active orders/);

    const sales = await ask(baseUrl, { text: "What are today's sales?" });
    assert.match(sales.data.reply, /Today's recorded sales are ₹0/);

    const topDishes = await ask(baseUrl, { text: "What are today's top dishes?" });
    assert.match(topDishes.data.reply, /No dishes have been recorded today yet/);
  });
});

test("order creation requires confirmation and saves the server menu price", async () => {
  await withServer(async (baseUrl) => {
    const first = await ask(baseUrl, { text: "Create a Swiggy order with two Tandoori Chicken Pizza for ticket 4821" });
    assert.equal(first.data.pending.type, "createOrder");
    assert.match(first.data.reply, /Say yes to confirm/);
    assert.deepEqual(first.data.pending.items, [{ id: 1, quantity: 2 }]);
    assert.equal(Object.hasOwn(first.data.pending.items[0], "price"), false);

    const confirmed = await ask(baseUrl, { execute: first.data.pending });
    assert.equal(confirmed.data.actionSucceeded, true);
    assert.match(confirmed.data.reply, /₹698/);
    const orders = await fetch(`${baseUrl}/api/orders`).then((response) => response.json());
    assert.equal(orders.length, 1);
    assert.equal(orders[0].total, 698);
    assert.equal(orders[0].customerName, "4821");
    assert.equal(orders[0].source, "Swiggy");
  });
});

test("assistant marks the oldest active order ready after confirmation", async () => {
  await withServer(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "Phone", items: [{ id: 2, quantity: 1 }] }),
    }).then((response) => response.json());

    const first = await ask(baseUrl, { text: "Mark the oldest order ready" });
    assert.equal(first.data.pending.type, "updateOrderStatus");
    assert.equal(first.data.pending.orderId, created.id);
    assert.equal(first.data.pending.status, "Ready");
    assert.equal((await fetch(`${baseUrl}/api/orders`).then((response) => response.json()))[0].status, "Preparing");

    const confirmed = await ask(baseUrl, { execute: first.data.pending });
    assert.equal(confirmed.data.actionSucceeded, true);
    assert.equal((await fetch(`${baseUrl}/api/orders`).then((response) => response.json()))[0].status, "Ready");
  });
});

test("status requests support every target and select the latest order when requested", async () => {
  await withServer(async (baseUrl) => {
    const createOrder = async () => fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "Phone", items: [{ id: 2, quantity: 1 }] }),
    }).then((response) => response.json());

    const older = await createOrder();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await createOrder();

    const latest = await ask(baseUrl, { text: "Mark the latest order out for delivery" });
    assert.equal(latest.data.pending.orderId, newer.id);
    assert.equal(latest.data.pending.status, "Out for delivery");

    const delivered = await ask(baseUrl, { text: "Mark the oldest order delivered" });
    assert.equal(delivered.data.pending.orderId, older.id);
    assert.equal(delivered.data.pending.status, "Delivered");

    const cancelled = await ask(baseUrl, { text: "Cancel the oldest order" });
    assert.equal(cancelled.data.pending.orderId, older.id);
    assert.equal(cancelled.data.pending.status, "Cancelled");
  });
});

test("receiving stock requires confirmation and updates inventory", async () => {
  await withServer(async (baseUrl) => {
    const first = await ask(baseUrl, { text: "Receive two kg paneer" });
    assert.equal(first.data.pending.type, "receiveStock");
    assert.equal(first.data.pending.ingredientId, "paneer");
    assert.equal(first.data.pending.adjustment, 2);

    const confirmed = await ask(baseUrl, { execute: first.data.pending });
    assert.equal(confirmed.data.actionSucceeded, true);
    const inventory = await fetch(`${baseUrl}/api/inventory`).then((response) => response.json());
    assert.equal(inventory.find((item) => item.id === "paneer").onHand, 4);
  });
});

test("receiving stock understands common ingredient aliases", async () => {
  await withServer(async (baseUrl) => {
    const cheese = await ask(baseUrl, { text: "Receive two kg cheese" });
    assert.equal(cheese.data.pending.ingredientId, "cheese");
    assert.equal(cheese.data.pending.adjustment, 2);

    const boxes = await ask(baseUrl, { text: "Receive five boxes" });
    assert.equal(boxes.data.pending.ingredientId, "packaging");
    assert.equal(boxes.data.pending.adjustment, 5);
  });
});

test("unknown actions and unissued execute requests are rejected", async () => {
  await withServer(async (baseUrl) => {
    const unknown = await ask(baseUrl, { text: "Delete every order" });
    assert.equal(unknown.data.pending, null);
    assert.match(unknown.data.reply, /No changes were made/);

    const forged = await ask(baseUrl, { execute: { type: "dropDatabase" } });
    assert.equal(forged.data.pending, null);
    assert.match(forged.data.reply, /could not confirm/);
    assert.deepEqual(await fetch(`${baseUrl}/api/orders`).then((response) => response.json()), []);
  });
});

test("voice.js is served as a JavaScript static file", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/voice.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /javascript/);
    assert.match(await response.text(), /SpeechRecognition/);
  });
});