const state = {
  menu: [],
  category: "All",
  search: "",
  cart: new Map(),
  submitting: false,
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The kitchen could not complete that request.");
  return data;
}

function getQuantity(itemId) {
  return state.cart.get(itemId) || 0;
}

function changeQuantity(itemId, difference) {
  const quantity = Math.min(20, Math.max(0, getQuantity(itemId) + difference));
  if (quantity) state.cart.set(itemId, quantity);
  else state.cart.delete(itemId);
  renderMenu();
  renderCart();
}

function renderFilters() {
  const filters = document.getElementById("categoryFilters");
  const categories = ["All", ...new Set(state.menu.map((item) => item.category))];
  filters.replaceChildren();

  for (const category of categories) {
    const button = element("button", `category-filter${state.category === category ? " selected" : ""}`, category === "All" ? "All dishes" : category);
    button.type = "button";
    button.setAttribute("aria-pressed", String(state.category === category));
    button.addEventListener("click", () => {
      state.category = category;
      renderFilters();
      renderMenu();
    });
    filters.append(button);
  }
}

function renderMenu() {
  const grid = document.getElementById("menuGrid");
  const query = state.search.toLowerCase();
  const items = state.menu.filter((item) => {
    const matchesCategory = state.category === "All" || item.category === state.category;
    const matchesSearch = `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  grid.replaceChildren();
  document.getElementById("menuResultCount").textContent = `${items.length} ${items.length === 1 ? "dish" : "dishes"}`;
  if (!items.length) {
    grid.append(element("p", "menu-empty", "No dishes match that search. Try another name or category."));
    return;
  }

  for (const item of items) {
    const card = element("article", "menu-card");
    const imageWrap = element("div", "menu-card-image");
    const image = element("img");
    image.src = item.image;
    image.alt = item.name;
    image.loading = "lazy";
    image.onerror = () => {
      image.hidden = true;
      imageWrap.classList.add("image-unavailable");
    };
    imageWrap.append(image);

    const content = element("div", "menu-card-content");
    const category = element("span", "menu-category", item.category);
    const title = element("h3", "", item.name);
    const description = element("p", "menu-description", item.description);
    const footer = element("div", "menu-card-footer");
    const price = element("strong", "menu-price", currency.format(item.price));
    footer.append(price, makeQuantityControl(item.id, getQuantity(item.id), "menu"));
    content.append(category, title, description, footer);
    card.append(imageWrap, content);
    grid.append(card);
  }
}

function makeQuantityControl(itemId, quantity, context) {
  const controls = element("div", `quantity-control quantity-control-${context}`);
  if (!quantity) {
    const add = element("button", "add-to-order", "Add");
    add.type = "button";
    add.setAttribute("aria-label", `Add ${state.menu.find((item) => item.id === itemId)?.name || "dish"} to order`);
    add.addEventListener("click", () => changeQuantity(itemId, 1));
    controls.append(add);
    return controls;
  }

  const decrease = element("button", "quantity-step", "−");
  decrease.type = "button";
  decrease.setAttribute("aria-label", `Remove one ${state.menu.find((item) => item.id === itemId)?.name || "dish"}`);
  decrease.addEventListener("click", () => changeQuantity(itemId, -1));
  const count = element("span", "quantity-count", String(quantity));
  count.setAttribute("aria-live", "polite");
  const increase = element("button", "quantity-step", "+");
  increase.type = "button";
  increase.disabled = quantity >= 20;
  increase.setAttribute("aria-label", `Add one ${state.menu.find((item) => item.id === itemId)?.name || "dish"}`);
  increase.addEventListener("click", () => changeQuantity(itemId, 1));
  controls.append(decrease, count, increase);
  return controls;
}

function renderCart() {
  const cartItems = document.getElementById("cartItems");
  const selected = state.menu.filter((item) => getQuantity(item.id) > 0);
  const itemCount = selected.reduce((total, item) => total + getQuantity(item.id), 0);
  const total = selected.reduce((sum, item) => sum + item.price * getQuantity(item.id), 0);
  cartItems.replaceChildren();

  if (!selected.length) {
    cartItems.append(element("p", "cart-empty", "Your order is empty. Add a dish from the menu to get started."));
  } else {
    for (const item of selected) {
      const row = element("div", "cart-row");
      const description = element("div", "cart-item-description");
      description.append(
        element("strong", "", item.name),
        element("small", "", `${currency.format(item.price)} each`),
      );
      const lineTotal = element("strong", "cart-line-total", currency.format(item.price * getQuantity(item.id)));
      row.append(description, lineTotal, makeQuantityControl(item.id, getQuantity(item.id), "cart"));
      cartItems.append(row);
    }
  }

  document.getElementById("cartItemCount").textContent = `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
  document.getElementById("orderTotal").textContent = currency.format(total);
  const submit = document.getElementById("placeOrderButton");
  submit.disabled = !itemCount || state.submitting;
  submit.textContent = state.submitting ? "Sending order..." : `Place demo order · ${currency.format(total)}`;

  const mobileBar = document.getElementById("mobileCartBar");
  mobileBar.hidden = !itemCount;
  document.getElementById("mobileCartButton").textContent = `Review order · ${itemCount} ${itemCount === 1 ? "item" : "items"} · ${currency.format(total)}`;
}

async function loadMenu() {
  const status = document.getElementById("menuStatus");
  status.textContent = "Loading menu...";
  try {
    const menu = await getJson("/api/menu");
    state.menu = menu;
    status.textContent = "Prices are set by the kitchen.";
    renderFilters();
    renderMenu();
    renderCart();
  } catch (error) {
    status.textContent = error.message;
    document.getElementById("menuGrid").replaceChildren();
  }
}

async function placeOrder(event) {
  event.preventDefault();
  if (!state.cart.size || state.submitting) return;

  const error = document.getElementById("checkoutError");
  error.textContent = "";
  state.submitting = true;
  renderCart();
  try {
    const customerName = document.getElementById("customerName").value.trim();
    const order = await getJson("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: customerName || "Demo customer",
        source: "Other",
        items: [...state.cart].map(([id, quantity]) => ({ id, quantity })),
      }),
    });
    state.cart.clear();
    document.getElementById("customerName").value = "";
    state.submitting = false;
    renderCart();
    document.getElementById("receiptOrderId").textContent = order.id;
    document.getElementById("receiptTotal").textContent = currency.format(order.total);
    document.getElementById("receiptStatus").textContent = order.status;
    document.getElementById("orderSuccessDialog").showModal();
  } catch (requestError) {
    state.submitting = false;
    renderCart();
    error.textContent = requestError.message;
  }
}

document.getElementById("customerSearch").addEventListener("input", (event) => {
  state.search = event.target.value.trim();
  renderMenu();
});
document.getElementById("reloadMenu").addEventListener("click", loadMenu);
document.getElementById("checkoutForm").addEventListener("submit", placeOrder);
document.getElementById("mobileCartButton").addEventListener("click", () => {
  document.getElementById("cartPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("customerName").focus({ preventScroll: true });
});
document.getElementById("continueShopping").addEventListener("click", () => {
  document.getElementById("orderSuccessDialog").close();
  document.getElementById("menuSection").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.getElementById("orderSuccessDialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

loadMenu();