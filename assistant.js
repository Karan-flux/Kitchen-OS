const crypto = require("node:crypto");

const SOURCES = ["Swiggy", "Zomato", "Phone", "Walk-in", "Other"];
const ACTION_STATUSES = ["Ready", "Out for delivery", "Delivered", "Cancelled"];
const ACTIVE_STATUSES = ["Preparing", "Ready", "Out for delivery"];
const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
};
const ALLOWED_ACTIONS = new Set(["createOrder", "updateOrderStatus", "receiveStock"]);
const pendingActions = new Map();

function normalizedText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b[a-z]+\b/g, (word) => NUMBER_WORDS[word] ?? word)
    .replace(/[^a-z0-9#.-]+/g, " ")
    .trim();
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function apiRequest(baseUrl, route, options) {
  const response = await fetch(new URL(route, baseUrl), options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The kitchen API could not complete that action.");
  return data;
}

async function getDashboard(baseUrl) {
  return apiRequest(baseUrl, "/api/dashboard");
}

function findIngredient(text, inventory) {
  const normalized = normalizedText(text);
  return inventory.find((item) => {
    const names = [item.name, item.id].map(normalizedText);
    if (item.id === "cheese") names.push("mozzarella");
    if (item.id === "packaging") names.push("boxes", "box");
    return names.some((name) => name && new RegExp(`(?:^|\\b)${escapeRegex(name)}(?:$|\\b)`).test(normalized));
  });
}

function findMentionedMenuItems(text, menu) {
  const normalized = normalizedText(text);
  const items = [];
  for (const product of menu) {
    const name = normalizedText(product.name);
    const match = new RegExp(`(?:^|\\b)(\\d+)\\s*(?:x\\s*)?${escapeRegex(name)}(?:$|\\b)`).exec(normalized)
      || new RegExp(`(?:^|\\b)${escapeRegex(name)}\\s*(?:x\\s*)?(\\d+)?(?:$|\\b)`).exec(normalized);
    if (!match) continue;
    const quantity = Number(match[1] || match[2] || 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) continue;
    items.push({ id: product.id, quantity, name: product.name });
  }
  return items;
}

function findQuantityNear(text, item) {
  const normalized = normalizedText(text);
  const names = [item.name, item.id];
  if (item.id === "cheese") names.push("mozzarella");
  if (item.id === "packaging") names.push("boxes", "box");
  const unitPattern = "(?:kg|kgs|kilo|kilos|pcs|pieces|boxes|box)";
  for (const candidate of new Set(names.map(normalizedText))) {
    const namePattern = escapeRegex(candidate);
    const before = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${unitPattern}\\s+)?(?:of\\s+)?${namePattern}(?:$|\\b)`).exec(normalized);
    const after = new RegExp(`${namePattern}\\s+(\\d+(?:\\.\\d+)?)(?:$|\\b)`).exec(normalized);
    const quantity = before?.[1] || after?.[1];
    if (quantity) return Number(quantity);
  }
  return 0;
}

function orderSource(text) {
  const normalized = normalizedText(text);
  if (/\bswiggy\b/.test(normalized)) return "Swiggy";
  if (/\bzomato\b/.test(normalized)) return "Zomato";
  if (/\bphone\b/.test(normalized)) return "Phone";
  if (/\bwalk in\b/.test(normalized)) return "Walk-in";
  if (/\bother\b/.test(normalized)) return "Other";
  return "Other";
}

function ticketReference(text) {
  const match = /\b(?:ticket|reference|ref)\s*#?\s*([a-z0-9-]{1,30})\b|#([a-z0-9-]{1,30})\b/i.exec(text);
  return match ? (match[1] || match[2]).slice(0, 60) : "";
}

function createPendingReply(pending, summary) {
  for (const [id, record] of pendingActions) {
    if (record.expiresAt <= Date.now()) pendingActions.delete(id);
  }
  const confirmationId = crypto.randomUUID();
  const confirmedAction = { ...pending, confirmationId };
  pendingActions.set(confirmationId, { action: validatePending(confirmedAction), expiresAt: Date.now() + 10 * 60 * 1000 });
  return { reply: `${summary} Say yes to confirm, or no to cancel.`, pending: confirmedAction };
}

function validatePending(action) {
  if (!action || typeof action !== "object" || !ALLOWED_ACTIONS.has(action.type)) return null;

  if (action.type === "createOrder") {
    if (!SOURCES.includes(action.source) || !Array.isArray(action.items) || action.items.length < 1 || action.items.length > 8) return null;
    const items = action.items.map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) }));
    if (items.some((item) => !Number.isInteger(item.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)) return null;
    return {
      type: action.type,
      source: action.source,
      customerName: typeof action.customerName === "string" ? action.customerName.trim().slice(0, 60) : "",
      items,
    };
  }

  if (action.type === "updateOrderStatus") {
    if (!/^[A-Z0-9]{1,32}$/.test(String(action.orderId || "")) || !ACTION_STATUSES.includes(action.status)) return null;
    return { type: action.type, orderId: action.orderId, status: action.status };
  }

  const adjustment = Number(action.adjustment);
  if (!/^[a-z0-9-]{1,40}$/.test(String(action.ingredientId || "")) || !Number.isFinite(adjustment) || adjustment <= 0 || adjustment > 10000) return null;
  return { type: action.type, ingredientId: action.ingredientId, adjustment };
}

async function executePending(action, baseUrl) {
  const pending = validatePending(action);
  if (!pending) return { reply: "I could not confirm that action. Please give the command again.", pending: null };
  const confirmationId = typeof action.confirmationId === "string" ? action.confirmationId : "";
  const saved = pendingActions.get(confirmationId);
  if (!saved || saved.expiresAt <= Date.now() || JSON.stringify(saved.action) !== JSON.stringify(pending)) {
    pendingActions.delete(confirmationId);
    return { reply: "That confirmation is missing or expired. Please give the command again.", pending: null };
  }
  pendingActions.delete(confirmationId);

  if (pending.type === "createOrder") {
    const order = await apiRequest(baseUrl, "/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending),
    });
    return { reply: `Order ${order.id} was added for ₹${order.total}.`, pending: null, actionSucceeded: true };
  }

  if (pending.type === "updateOrderStatus") {
    const order = await apiRequest(baseUrl, `/api/orders/${encodeURIComponent(pending.orderId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: pending.status }),
    });
    return { reply: `Order ${order.id} is now ${order.status}.`, pending: null, actionSucceeded: true };
  }

  const item = await apiRequest(baseUrl, `/api/inventory/${encodeURIComponent(pending.ingredientId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adjustment: pending.adjustment }),
  });
  return { reply: `Received ${pending.adjustment} ${item.unit} of ${item.name}. On hand: ${item.onHand} ${item.unit}.`, pending: null, actionSucceeded: true };
}

function parseStatusRequest(text, orders) {
  const normalized = normalizedText(text);
  const command = /\b(mark|set|change|update|move|make|cancel|complete|deliver)\b/.test(normalized);
  if (!command) return null;

  let status;
  if (/\b(cancel|cancelled|canceled)\b/.test(normalized)) status = "Cancelled";
  else if (/\b(out for delivery|picked up|dispatched)\b/.test(normalized)) status = "Out for delivery";
  else if (/\b(deliver|delivered|complete|completed)\b/.test(normalized)) status = "Delivered";
  else if (/\bready\b/.test(normalized)) status = "Ready";
  if (!status) return { error: "Say which status to set: Ready, Out for delivery, Delivered, or Cancelled." };

  const active = orders.filter((order) => ACTIVE_STATUSES.includes(order.status));
  if (!active.length) return { error: "There are no active orders to update." };
  active.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const order = /\blatest\b|\bnewest\b/.test(normalized) ? active[active.length - 1] : active[0];
  return { order, status };
}

function isUnknownAction(text) {
  return /\b(delete|erase|wipe|remove|drop)\b/.test(normalizedText(text));
}

async function ollamaReply(text, baseUrl) {
  const model = process.env.OLLAMA_MODEL;
  if (!model) return null;
  try {
    const dashboard = await getDashboard(baseUrl);
    const stock = dashboard.inventory.map((item) => `${item.name}: ${item.onHand} ${item.unit} (reorder at ${item.reorderAt})`).join("; ");
    const active = dashboard.orders
      .filter((order) => ACTIVE_STATUSES.includes(order.status))
      .map((order) => `${order.id}: ${order.status}, ${order.itemCount} items`)
      .join("; ") || "none";
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        prompt: `You are a concise kitchen operations helper. Answer only from this current app data. Do not claim to make changes.\nStock: ${stock}\nActive orders: ${active}\nOwner question: ${String(text).slice(0, 500)}`,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.response === "string" && data.response.trim() ? data.response.trim().slice(0, 700) : null;
  } catch {
    return null;
  }
}

async function respond(body, baseUrl) {
  if (body && Object.hasOwn(body, "execute")) return executePending(body.execute, baseUrl);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 500) : "";
  if (!text) return { reply: "Tell me what you need for orders or stock.", pending: null };

  const dashboard = await getDashboard(baseUrl);
  const normalized = normalizedText(text);

  if (/\b(receive|restock|add)\b/.test(normalized)) {
    const ingredient = findIngredient(text, dashboard.inventory);
    if (!ingredient) return { reply: "I could not find that ingredient in inventory.", pending: null };
    const adjustment = findQuantityNear(text, ingredient);
    if (!Number.isFinite(adjustment) || adjustment <= 0 || adjustment > 10000) {
      return { reply: `How much ${ingredient.name} should I receive?`, pending: null };
    }
    const pending = { type: "receiveStock", ingredientId: ingredient.id, adjustment };
    return createPendingReply(pending, `Receive ${adjustment} ${ingredient.unit} of ${ingredient.name}?`);
  }

  const statusRequest = parseStatusRequest(text, dashboard.orders);
  if (statusRequest) {
    if (statusRequest.error) return { reply: statusRequest.error, pending: null };
    const pending = { type: "updateOrderStatus", orderId: statusRequest.order.id, status: statusRequest.status };
    return createPendingReply(pending, `Mark order ${statusRequest.order.id} as ${statusRequest.status}?`);
  }

  const mentionedItems = findMentionedMenuItems(text, dashboard.menu);
  if (mentionedItems.length && /\b(create|record|add|new|place|take|incoming)\b/.test(normalized)) {
    const items = mentionedItems.map(({ id, quantity }) => ({ id, quantity }));
    const reference = ticketReference(text);
    const source = orderSource(text);
    const pending = { type: "createOrder", source, customerName: reference, items };
    const details = mentionedItems.map((item) => `${item.quantity} ${item.name}`).join(", ");
    return createPendingReply(pending, `Create a ${source} order${reference ? ` for ticket ${reference}` : ""}: ${details}?`);
  }

  if (/\b(low stock|stock alerts?|need restock|reorder|running low)\b/.test(normalized)) {
    const low = dashboard.inventory.filter((item) => item.onHand <= item.reorderAt);
    const reply = low.length
      ? `Low stock: ${low.map((item) => `${item.name} ${item.onHand} ${item.unit}, reorder at ${item.reorderAt}`).join("; ")}.`
      : "No ingredients are at or below their reorder point.";
    return { reply, pending: null };
  }

  const ingredient = findIngredient(text, dashboard.inventory);
  if (ingredient && /\b(left|remain|remaining|on hand|have|stock|quantity|much|many)\b/.test(normalized)) {
    return { reply: `${ingredient.name}: ${ingredient.onHand} ${ingredient.unit} on hand. Reorder point: ${ingredient.reorderAt} ${ingredient.unit}.`, pending: null };
  }

  const todayKey = localDateKey(new Date());
  const today = dashboard.orders.filter((order) => order.status !== "Cancelled" && localDateKey(new Date(order.createdAt)) === todayKey);
  if (/\b(sales|revenue|turnover)\b/.test(normalized) && /\b(today|so far|current)\b/.test(normalized)) {
    const sales = today.reduce((total, order) => total + order.total, 0);
    return { reply: `Today's recorded sales are ₹${sales}.`, pending: null };
  }
  if (/\b(active|open|in progress)\b/.test(normalized) && /\borders?\b/.test(normalized)) {
    const active = dashboard.orders.filter((order) => ACTIVE_STATUSES.includes(order.status));
    return { reply: `There ${active.length === 1 ? "is" : "are"} ${active.length} active order${active.length === 1 ? "" : "s"}.`, pending: null };
  }
  if (/\b(how many|number of|count|orders? today|today.*orders?)\b/.test(normalized) && /\borders?\b/.test(normalized)) {
    return { reply: `There ${today.length === 1 ? "is" : "are"} ${today.length} recorded order${today.length === 1 ? "" : "s"} today.`, pending: null };
  }
  if (/\b(top|popular|best selling|most ordered)\b/.test(normalized) && /\b(dish|dishes|item|items|today)\b/.test(normalized)) {
    const counts = new Map();
    for (const order of today) for (const item of order.items) counts.set(item.name, (counts.get(item.name) || 0) + item.quantity);
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { reply: top.length ? `Top dishes today: ${top.map(([name, count]) => `${name} (${count})`).join(", ")}.` : "No dishes have been recorded today yet.", pending: null };
  }
  if (isUnknownAction(text)) {
    return { reply: "I can only create orders, update order status, or receive stock. No changes were made.", pending: null };
  }

  const aiReply = await ollamaReply(text, baseUrl);
  return { reply: aiReply || "I can answer about low stock, ingredient quantities, today's sales and orders, top dishes, or active orders. I can also record orders, update status, and receive stock.", pending: null };
}

module.exports = { respond };