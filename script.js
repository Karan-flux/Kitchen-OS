const state = {
  menu: [],
  orders: [],
  inventory: [],
  filter: "Active",
  search: "",
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The kitchen API could not complete that action.");
  return data;
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 3200);
}

function renderDate() {
  const now = new Date();
  document.getElementById("todayLabel").textContent = new Intl.DateTimeFormat("en", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  }).format(now);
  const hour = now.getHours();
  document.getElementById("greeting").textContent = hour < 12 ? "GOOD MORNING" : hour < 17 ? "GOOD AFTERNOON" : "GOOD EVENING";
}

function todayOrders() {
  const today = localDateKey(new Date());
  return state.orders.filter((order) => order.status !== "Cancelled" && localDateKey(new Date(order.createdAt)) === today);
}

function renderMetrics() {
  const today = todayOrders();
  const active = state.orders.filter((order) => !["Delivered", "Cancelled"].includes(order.status));
  const preparing = active.filter((order) => order.status === "Preparing");
  const ready = active.filter((order) => order.status === "Ready");
  const sales = today.reduce((sum, order) => sum + order.total, 0);
  const lowStock = state.inventory.filter((item) => item.onHand <= item.reorderAt);

  document.getElementById("todayOrders").textContent = today.length;
  document.getElementById("prepCount").textContent = preparing.length;
  document.getElementById("todaySales").textContent = currency.format(sales);
  document.getElementById("lowStockCount").textContent = lowStock.length;
  document.getElementById("activeSummary").textContent = `${active.length} active`;
  document.getElementById("readySummary").textContent = `${ready.length} ready`;
  document.getElementById("averageOrder").textContent = `${currency.format(today.length ? Math.round(sales / today.length) : 0)} avg. order`;
  document.getElementById("navOrderCount").textContent = active.length;
  document.getElementById("activeTabCount").textContent = active.length;
  document.getElementById("attentionCount").textContent = lowStock.length;
  document.getElementById("navStockAlert").classList.toggle("visible", lowStock.length > 0);
}

function getVisibleOrders() {
  const activeStatuses = ["Preparing", "Ready", "Out for delivery"];
  let orders = state.orders;
  if (state.filter === "Active") orders = orders.filter((order) => activeStatuses.includes(order.status));
  else if (state.filter !== "All") orders = orders.filter((order) => order.status === state.filter);
  if (state.search) {
    const query = state.search.toLowerCase();
    orders = orders.filter((order) => `${order.id} ${order.customerName} ${order.source}`.toLowerCase().includes(query));
  }
  return orders;
}

function nextStatus(order) {
  const next = { Preparing: "Ready", Ready: "Out for delivery", "Out for delivery": "Delivered" };
  return next[order.status];
}

function renderOrders() {
  const list = document.getElementById("ordersList");
  const orders = getVisibleOrders();
  list.replaceChildren();
  if (!orders.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<span class="empty-mark">${state.search ? "⌕" : "✓"}</span><strong>${state.search ? "No matching orders" : state.filter === "Active" ? "Queue is clear" : `No ${state.filter.toLowerCase()} orders`}</strong><p>${state.search ? "Try a different order code, source, or ticket name." : "Record an incoming order when it arrives from a delivery partner, phone, or walk-in."}</p>`;
    list.append(empty);
  } else {
    for (const order of orders) {
      const row = document.createElement("article");
      row.className = "order-row";
      const itemSummary = order.items.map((item) => `${item.quantity}× ${escapeHtml(item.name)}`).join(", ");
      const updatedLabel = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(order.createdAt));
      const status = order.status.toLowerCase().replaceAll(" ", "-");
      const advance = nextStatus(order);
      row.innerHTML = `<div class="order-identity"><strong>#${escapeHtml(order.id)}</strong><small>${escapeHtml(order.customerName || "Walk-in")}</small></div><div class="order-details"><span class="source-tag source-${escapeHtml(order.source || "Other").toLowerCase()}">${escapeHtml(order.source || "Other")}</span><span class="order-items" title="${itemSummary}">${itemSummary}</span></div><div class="order-total"><strong>${currency.format(order.total)}</strong><small>${updatedLabel}</small></div><span class="status-pill status-${status}"><i></i>${escapeHtml(order.status)}</span><div class="order-actions">${advance ? `<button class="advance-button" data-order-id="${escapeHtml(order.id)}" data-next-status="${advance}">${advance === "Out for delivery" ? "Mark picked up" : advance === "Delivered" ? "Complete" : "Mark ready"}<span>→</span></button><button class="cancel-order-button" data-order-id="${escapeHtml(order.id)}" title="Cancel this order" aria-label="Cancel order ${escapeHtml(order.id)}">×</button>` : `<span class="completed-label">${order.status === "Cancelled" ? "Voided" : "Closed"}</span>`}</div>`;
      list.append(row);
    }
  }
  document.getElementById("queueSummary").textContent = `${orders.length} ${orders.length === 1 ? "order" : "orders"}${state.filter === "Active" ? " in the active queue" : ` · ${state.filter.toLowerCase()}`}`;
  list.querySelectorAll(".advance-button").forEach((button) => {
    button.addEventListener("click", () => updateOrderStatus(button.dataset.orderId, button.dataset.nextStatus));
  });
  list.querySelectorAll(".cancel-order-button").forEach((button) => {
    button.addEventListener("click", () => updateOrderStatus(button.dataset.orderId, "Cancelled"));
  });
}

function renderInventory() {
  const list = document.getElementById("inventoryList");
  const lowStock = state.inventory.filter((item) => item.onHand <= item.reorderAt);
  list.innerHTML = state.inventory.map((item) => {
    const par = Math.max(item.par || item.reorderAt * 2, item.reorderAt, 1);
    const percent = Math.min(100, Math.round(item.onHand / par * 100));
    const low = item.onHand <= item.reorderAt;
    return `<div class="inventory-row ${low ? "stock-low" : ""}"><div class="ingredient-name"><span class="ingredient-symbol">${ingredientIcon(item.id)}</span><strong>${escapeHtml(item.name)}</strong></div><div class="on-hand"><strong>${item.onHand}</strong><span>${escapeHtml(item.unit)}</span>${low ? '<em>Low</em>' : ""}</div><div class="reorder-point">${item.reorderAt} ${escapeHtml(item.unit)}</div><div class="stock-meter"><div class="meter-track"><span style="width:${percent}%"></span></div><small>${percent}% of par</small></div><form class="receive-form" data-item-id="${escapeHtml(item.id)}"><input aria-label="Quantity to receive for ${escapeHtml(item.name)}" type="number" min="0.1" max="1000" step="0.1" value="1"><button type="submit" title="Add received stock">＋</button></form></div>`;
  }).join("");
  document.getElementById("attentionList").innerHTML = lowStock.length ? lowStock.slice(0, 4).map((item) => `<button class="attention-item" data-stock-id="${escapeHtml(item.id)}"><span class="alert-mark">!</span><span><strong>${escapeHtml(item.name)}</strong><small>${item.onHand} ${escapeHtml(item.unit)} on hand · reorder at ${item.reorderAt}</small></span><span class="restock-cta">Receive stock →</span></button>`).join("") : '<div class="all-clear"><span>✓</span><strong>Stock levels look good</strong><small>No ingredients need a restock right now.</small></div>';
  list.querySelectorAll(".receive-form").forEach((form) => form.addEventListener("submit", receiveStock));
  document.querySelectorAll(".attention-item").forEach((button) => button.addEventListener("click", () => {
    const input = list.querySelector(`.receive-form[data-item-id="${button.dataset.stockId}"] input`);
    input?.focus();
    input?.select();
  }));
  document.getElementById("inventoryUpdated").textContent = "Saved to this kitchen";
}

function ingredientIcon(id) {
  return ({ chicken: "CH", cheese: "MO", tomatoes: "TO", paneer: "PA", packaging: "BX" })[id] || "IN";
}

function renderReports() {
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (6 - index));
    const key = localDateKey(day);
    const orders = state.orders.filter((order) => order.status !== "Cancelled" && localDateKey(new Date(order.createdAt)) === key);
    return { day, key, sales: orders.reduce((sum, order) => sum + order.total, 0), count: orders.length };
  });
  const weekSales = days.reduce((sum, day) => sum + day.sales, 0);
  const maxSales = Math.max(...days.map((day) => day.sales), 1);
  document.getElementById("weekSales").textContent = currency.format(weekSales);
  document.getElementById("weekOrderCount").textContent = `${days.reduce((sum, day) => sum + day.count, 0)} orders`;
  document.getElementById("salesChart").innerHTML = days.map((day, index) => `<div class="chart-day" title="${day.day.toLocaleDateString()} · ${currency.format(day.sales)}"><div class="chart-bar-wrap"><span class="chart-value">${day.sales ? currency.format(day.sales) : ""}</span><i class="chart-bar ${index === 6 ? "today-bar" : ""}" style="height:${day.sales ? Math.max(8, day.sales / maxSales * 100) : 3}%"></i></div><small>${new Intl.DateTimeFormat("en", { weekday: "short" }).format(day.day)}</small></div>`).join("");
  const counts = new Map();
  for (const order of todayOrders()) for (const item of order.items) counts.set(item.name, (counts.get(item.name) || 0) + item.quantity);
  const popular = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3);
  document.getElementById("topDishes").innerHTML = popular.length ? popular.map(([name, count], index) => `<div class="top-dish-row"><span class="dish-rank">0${index + 1}</span><strong>${escapeHtml(name)}</strong><span>${count} sold</span></div>`).join("") : '<p class="report-empty">Dish counts appear after orders are recorded.</p>';
}

function renderOrderPicker() {
  const picker = document.getElementById("orderItemPicker");
  picker.innerHTML = state.menu.map((item) => `<label class="picker-row"><span class="picker-item-name"><strong>${escapeHtml(item.name)}</strong><small>${currency.format(item.price)}</small></span><input type="number" min="0" max="20" value="0" data-item-id="${item.id}" data-price="${item.price}" aria-label="Quantity for ${escapeHtml(item.name)}"></label>`).join("");
  picker.querySelectorAll("input").forEach((input) => input.addEventListener("input", updateOrderEstimate));
}

function updateOrderEstimate() {
  const inputs = [...document.querySelectorAll("#orderItemPicker input")];
  const total = inputs.reduce((sum, input) => sum + (Number(input.value) || 0) * Number(input.dataset.price), 0);
  const count = inputs.reduce((sum, input) => sum + (Number(input.value) || 0), 0);
  document.getElementById("orderEstimate").textContent = count ? `${count} ${count === 1 ? "item" : "items"} · ${currency.format(total)}` : "Select items to calculate total";
}

async function receiveStock(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector("input");
  if (!input.checkValidity()) {
    input.reportValidity();
    input.focus();
    return;
  }
  const adjustment = Number(input.value);
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    await apiRequest(`/api/inventory/${form.dataset.itemId}`, {
      method: "PATCH", body: JSON.stringify({ adjustment }),
    });
    await refreshDashboard();
    showToast("Stock received and inventory saved.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function updateOrderStatus(id, status) {
  try {
    await apiRequest(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await refreshDashboard();
    showToast(`Order #${id} moved to ${status.toLowerCase()}.`);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function createOrder(event) {
  event.preventDefault();
  const items = [...document.querySelectorAll("#orderItemPicker input")]
    .map((input) => ({ id: Number(input.dataset.itemId), quantity: Number(input.value) || 0 }))
    .filter((item) => item.quantity > 0);
  if (!items.length) {
    document.getElementById("orderError").textContent = "Add at least one item to record this order.";
    return;
  }
  const submit = document.querySelector("#orderForm [type='submit']");
  submit.disabled = true;
  document.getElementById("orderError").textContent = "";
  try {
    const order = await apiRequest("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        customerName: document.getElementById("customerName").value,
        source: document.getElementById("orderSource").value,
        items,
      }),
    });
    document.getElementById("orderDialog").close();
    document.getElementById("orderForm").reset();
    document.querySelectorAll("#orderItemPicker input").forEach((input) => { input.value = 0; });
    updateOrderEstimate();
    state.filter = "Active";
    setActiveFilter();
    await refreshDashboard();
    showToast(`Order #${order.id} added to the kitchen queue.`);
  } catch (error) {
    document.getElementById("orderError").textContent = error.message;
  } finally {
    submit.disabled = false;
  }
}

function setActiveFilter() {
  document.querySelectorAll(".filter-tab").forEach((button) => {
    const selected = button.dataset.filter === state.filter;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  renderOrders();
}

function updateActiveNavigation() {
  const activeHash = window.location.hash || "#overview";
  document.querySelectorAll(".nav-link").forEach((link) => {
    const active = link.hash === activeHash;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

async function refreshDashboard(showError = true) {
  const connection = document.getElementById("connectionLabel");
  try {
    const data = await apiRequest("/api/dashboard");
    state.menu = data.menu;
    state.orders = data.orders;
    state.inventory = data.inventory;
    connection.textContent = "Connected";
    connection.parentElement.classList.remove("offline");
    renderMetrics();
    renderOrders();
    renderInventory();
    renderReports();
    if (!document.getElementById("orderItemPicker").children.length) renderOrderPicker();
  } catch (error) {
    connection.textContent = "Offline";
    connection.parentElement.classList.add("offline");
    if (showError) showToast(error.message, true);
  }
}

function setupEvents() {
  const ownerMenu = document.getElementById("ownerMenu");
  const ownerMenuToggles = [document.getElementById("ownerMenuToggle"), document.getElementById("workspaceOptionsButton")];
  const closeOwnerMenu = () => {
    ownerMenu.hidden = true;
    ownerMenuToggles.forEach((button) => button.setAttribute("aria-expanded", "false"));
  };
  ownerMenuToggles.forEach((button) => button.addEventListener("click", () => {
    const open = ownerMenu.hidden;
    ownerMenu.hidden = !open;
    ownerMenuToggles.forEach((toggle) => toggle.setAttribute("aria-expanded", String(open)));
  }));
  ownerMenu.addEventListener("click", async (event) => {
    if (event.target.closest("[data-owner-link]")) {
      closeOwnerMenu();
      return;
    }
    const action = event.target.closest("[data-owner-action]")?.dataset.ownerAction;
    if (!action) return;
    closeOwnerMenu();
    if (action === "refresh") {
      await refreshDashboard();
      return;
    }
    if (action === "assistant") {
      document.getElementById("kitchenAssistant").scrollIntoView({ behavior: "smooth", block: "nearest" });
      document.getElementById("assistantInput").focus({ preventScroll: true });
      return;
    }
    document.getElementById(action).scrollIntoView({ behavior: "smooth", block: "start" });
    window.location.hash = action;
  });
  document.addEventListener("click", (event) => {
    if (!ownerMenu.contains(event.target) && !ownerMenuToggles.some((button) => button.contains(event.target))) closeOwnerMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !ownerMenu.hidden) {
      closeOwnerMenu();
      ownerMenuToggles[0].focus();
    }
  });

  document.getElementById("openOrderDialog").addEventListener("click", () => {
    document.getElementById("orderError").textContent = "";
    document.getElementById("orderDialog").showModal();
  });
  document.getElementById("closeOrderDialog").addEventListener("click", () => document.getElementById("orderDialog").close());
  document.getElementById("cancelOrderDialog").addEventListener("click", () => document.getElementById("orderDialog").close());
  document.getElementById("orderDialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  });
  document.getElementById("orderForm").addEventListener("submit", createOrder);
  document.getElementById("orderSearch").addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    renderOrders();
  });
  document.querySelectorAll(".filter-tab").forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    setActiveFilter();
  }));
  document.getElementById("refreshButton").addEventListener("click", () => refreshDashboard());
  document.getElementById("queueRefresh").addEventListener("click", () => refreshDashboard());
  window.addEventListener("hashchange", updateActiveNavigation);
  updateActiveNavigation();
}

renderDate();
setupEvents();
refreshDashboard(false);
setInterval(() => refreshDashboard(false), 15000);
