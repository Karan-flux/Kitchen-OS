# TechTonic Kitchen Ops

TechTonic is a local, owner-facing operations workspace for a cloud kitchen. It is designed to help an owner or shift lead keep incoming tickets, kitchen progress, ingredient stock, and recorded sales visible in one place.
The project also includes a customer-facing demo storefront at `/customer.html`. A demo customer can browse the menu and submit an unpaid order to the same kitchen queue. External delivery marketplace and POS integrations are not implemented; orders are not imported from or sent to external providers.

## Contents

- [What it does](#what-it-does)
- [Academic project summary](#academic-project-summary)
- [Screens and workflows](#screens-and-workflows)
- [Technology](#technology)
- [Run locally](#run-locally)
- [Deploy online](#deploy-online)
- [Upload to GitHub](#upload-to-github)
- [Project files](#project-files)
- [How the app works](#how-the-app-works)
- [Verification](#verification)
- [Test report](TEST_REPORT.md)
- [Configuration](#configuration)
- [Limitations and production notes](#limitations-and-production-notes)
- [Troubleshooting](#troubleshooting)

## Academic Project Summary

### Project information

| Field | Details |
| --- | --- |
| Project title | **TechTonic Kitchen Ops: Cloud Kitchen Operations Dashboard and Customer Ordering Demo** |
| Short description | A local web application for recording and tracking kitchen orders, managing sample ingredient inventory, reviewing shift sales, and demonstrating a customer menu-to-kitchen order flow. |
| Student contributors | Karnajit Ghosh; Shyamal Debnath; Argyajit Shill; Rahul Debnath; Santanu Banik |
| Program | `BCA` |
| Course code and title | `CA210 — MINI PROJECT I` |
| Submission month and year | November 2026 |
| Project guide | `[Enter guide name]` |
| Guide designation | `[Enter guide designation]` |
| Company (internship only) | `N/A` |
Replace the bracketed fields with the details supplied by your college and guide before submitting the report.

**Before creating a public repository:** confirm every contributor agrees to publish their name. Student ID numbers are omitted from this public-project copy. No `LICENSE` file is included; choose and add a license before granting reuse rights.

### Problem and users

Small kitchen teams may track incoming tickets, preparation status, ingredient quantities, and daily sales across separate notes or spreadsheets. That makes it harder for an owner or shift lead to see the current queue and low-stock items together. TechTonic provides one local view of those tasks and a customer demo page that shows how a menu selection becomes a kitchen ticket.

The intended users are a cloud-kitchen owner or shift lead managing orders and stock, kitchen staff viewing order progress, and a demo customer placing an example order. The customer page is a demonstration workflow, not a public commerce or payment service.

### Technology and requirements

| Area | Used or required |
| --- | --- |
| Languages | HTML5, CSS3, and plain JavaScript (browser and CommonJS server code) |
| Frameworks and packages | No frontend framework, build step, or npm package dependencies |
| Server | Node.js built-in HTTP server; Node.js 22.13+ required. The development environment reported Node.js 24.16.0. |
| Database | SQLite through Node.js's built-in `node:sqlite` module |
| Browser APIs | `fetch`, native `<dialog>`, `Intl`; optional `SpeechRecognition`/`webkitSpeechRecognition` and `speechSynthesis` |
| Development tools | Visual Studio Code, Windows, Node.js command line, and `node:test` |
| Hardware | 64-bit Windows computer used for development. Add the actual CPU, RAM, and available storage here: `[Enter machine specifications]`. No GPU is required. |
| Runtime software | Windows or another Node.js-supported operating system, Node.js 22.13+, and a modern browser. Chrome or Edge is recommended for speech recognition. |
| Optional network access | Needed for Google Fonts and the menu's hosted food photos. Core server, database, and order functions use no external service. |

### Main modules and features

- Owner dashboard with order queue, order status actions, inventory quantities, restock alerts, sales metrics, and top dishes.
- Customer demo storefront with the server menu, search and category filters, basket quantities, optional customer name, and order receipt.
- Node.js HTTP API that validates order items and calculates prices from the server-owned menu.
- SQLite persistence for orders, order items, and inventory; legacy JSON import on first database startup.
- Kitchen Assistant with rule-based stock/order questions and confirmed order, status, and stock actions. A local Ollama fallback is optional.
- Automated API and integration tests using Node.js's built-in `node:test` module.

### Existing-system comparison

The comparison baseline is a manual register/spreadsheet workflow, rather than a claim that one particular commercial product was evaluated.

| Workflow | Manual register or spreadsheet baseline | TechTonic project |
| --- | --- | --- |
| Order tracking | Orders and status may be recorded in separate rows or notes. | A searchable queue shows active tickets and their current status. |
| Stock visibility | Quantities and reorder checks are maintained separately. | Inventory, reorder points, and low-stock alerts appear in the owner dashboard. |
| Sales overview | Totals may need to be calculated manually. | Recorded orders feed daily and seven-day summaries. |
| Customer-to-kitchen demonstration | Requires a separate paper or verbal handoff. | The customer demo submits a menu-priced ticket into the same local order queue. |
| Setup and scope | No shared software state. | Runs locally with Node.js built-ins and SQLite, without package installation. |

The project is better suited to a low-cost coursework demonstration of these connected workflows. It is not a replacement for a production POS: authentication, payments, delivery, supplier management, and marketplace integrations are outside its scope.

### Testing and results

The latest verification run completed **12 automated tests with 12 passing and 0 failing** using `node --test`. The integration tests use temporary databases and random local ports. Coverage includes server-side menu pricing, order validation and persistence, stock updates, legacy import, the 64 KiB request limit, assistant questions and confirmed actions, and the customer demo assets and order-to-dashboard flow. All JavaScript files also passed `node --check`.

Manual browser checks covered the owner dashboard, customer menu search and category filters, basket totals and quantity controls, responsive layout, and the success receipt. The browser receipt check used an intercepted sample response; the automated integration test separately verified that customer-style order data is saved and priced by the real API.

Suggested screenshots for the Results chapter:

| Figure | Capture |
| --- | --- |
| 1 | Owner dashboard overview showing metrics and the active order queue. |
| 2 | Customer demo storefront showing menu categories and food items. |
| 3 | Customer basket with selected items, quantities, and total before submission. |
| 4 | Customer order success receipt showing order ID, total, and Preparing status. |
| 5 | Owner dashboard queue after a customer demo order appears. |
| 6 | Inventory low-stock alerts and the seven-day shift report. |

Capture these screens from the running app and insert them as figures in the report; no screenshot files are currently included in this repository.

### Three-month timeline

| Month | Phase | Main work |
| --- | --- | --- |
| Month 1 | Requirements and design | Identify owner and customer workflows; define order, inventory, and menu data; sketch dashboard and customer-page layouts. |
| Month 2 | Implementation | Build the Node.js API and SQLite persistence; implement the owner dashboard, customer demo storefront, and Kitchen Assistant. |
| Month 3 | Testing and delivery | Run API and integration tests; check desktop/mobile workflows; fix issues; prepare README, screenshots, and project demonstration. |

## What it does

### Order intake and queue
- Record a ticket from Swiggy, Zomato, Phone, Walk-in, or Other.
- Optionally enter a customer name or external ticket reference.
- Add quantities for menu items; the server uses its menu prices to calculate the total.
- Search orders by generated ID, source, or customer/ticket name.
- Filter the queue to active, preparing, ready, or all tickets.
- Refresh the queue manually or allow the dashboard to refresh every 15 seconds.
### Inventory

- View ingredient quantities, units, and reorder points.
- Get attention alerts when an item is at or below its reorder point.
### Shift overview and reports

- Today's order count, active count, preparation count, ready count, sales, average order amount, and low-stock count.
- Sales and order totals for the previous seven calendar dates, calculated from locally recorded, non-cancelled tickets.
- Top dishes for today by recorded item quantity.
- All dashboard figures are derived from the app's local order and inventory data; they are not external marketplace totals.

## Screens and workflows

### Record an incoming ticket

1. Start the server and open the dashboard.
2. Select **Record incoming order**.
3. Choose the channel that supplied the order.
4. Optionally enter a customer name or the external provider's ticket reference.
5. Set the quantity for each ordered dish. The dialog displays an estimate using the menu prices.
6. Select **Add to kitchen queue**. The server validates the items and quantities, calculates the authoritative total, creates an order ID, and saves the record.

### Work the queue

- Select Active, Preparing, Ready, or All orders to filter tickets.
- Use the search field to find a ticket by its ID, source, or name/reference.
- Select **Mark ready**, **Mark picked up**, or **Complete** to advance the current ticket.
- Use the `×` action to mark an active ticket Cancelled. It is not deleted, so the owner can still inspect it in All orders.

### Receive ingredient stock

1. Find the ingredient in the Inventory section or Needs attention list.
2. Enter the quantity delivered in the Receive field.
3. Select `+`. The API adds that amount to on-hand stock and saves it to the database.
4. The dashboard reloads the quantity, stock meter, and low-stock alerts.

## Technology

- **Frontend:** HTML5, CSS, browser JavaScript, and optional built-in browser speech APIs; no frontend framework or build system.
- **Customer demo:** A separate menu and checkout page that submits demo orders to the same kitchen queue.
- **Backend:** Node.js built-in HTTP server and APIs; no third-party runtime packages.
- **Persistence:** SQLite database at `data/techtonic.sqlite`, using Node.js's built-in `node:sqlite` module.
- **Assistant:** Rule-based command parsing and same-origin API actions; optional local Ollama question fallback, with no paid API or key.
- **Fonts:** DM Sans and Syne via Google Fonts, with local system fallbacks. An internet connection is needed for the hosted fonts; the app itself does not require the network for dependencies.
- **Browser support:** A modern browser with `fetch`, `Intl`, native `<dialog>`, and JavaScript enabled.
- **Node version:** Node.js 22.13 or newer is required for the built-in SQLite module (the project has been verified with Node.js 24).

## Run locally

1. Install Node.js 22.13+ if it is not already installed.
2. Open a terminal in the project directory.
3. Start the app:

   ```powershell
   node server.js
   ```

4. Open [http://localhost:3000](http://localhost:3000).

To demonstrate the customer order flow, open [http://localhost:3000/customer.html](http://localhost:3000/customer.html) in another tab. Add menu items, enter an optional customer name, and place the demo order; it appears in the owner dashboard's active queue.

The server prints its address when it is ready. Keep that terminal running while you use the dashboard. Stop it with `Ctrl+C`.

To use a different port in PowerShell:

```powershell
$env:PORT = "3001"
node server.js
```

Then visit `http://localhost:3001`. There is no `npm install`, build, or separate static-file server step.

## Deploy online

The Vercel deployment serves static files but does not run this project's Node.js API. Use the included `render.yaml` Blueprint to deploy the complete Node.js server so the pages and `/api/*` routes share one origin.

1. Sign in to Render with the GitHub account that can access `Karan-flux/Kitchen-OS`.
2. Open the [Render Blueprint deployment page](https://render.com/deploy?repo=https://github.com/Karan-flux/Kitchen-OS).
3. Review the `kitchen-os` web service settings from `render.yaml` and select **Apply**.
4. Wait for the first build and deployment to finish. Use the `onrender.com` service URL from the Render dashboard for the owner page; append `/customer.html` for the customer demo.
5. Check `<your-service-url>/api/health`. It should return JSON with `"ok": true`.

The Blueprint uses Render's free web-service plan and needs no package install. Free instances can sleep while idle, and their local filesystem is temporary. Demo orders and inventory stored in SQLite can be lost when the service restarts or redeploys. Do not enter real customer information or rely on this deployment for production data. Persistent storage requires a paid disk or changing the app to use a managed database.

## Upload to GitHub

Before publishing a public repository, confirm the student names and IDs above may be shared, and decide whether to add a `LICENSE`. The local SQLite database, legacy kitchen records, environment files, and dependency folders are excluded by `.gitignore`.

This project is already connected to `https://github.com/Karan-flux/Kitchen-OS.git`. After making changes, review and push them from the project directory:

```powershell
git add .
git status --short
git diff --cached --stat
git commit -m "Describe your change"
git push origin main
```

Check that `data/techtonic.sqlite`, `data/orders.json`, `data/inventory.json`, and any secrets are not staged. These local data files are excluded by `.gitignore`.

GitHub Actions runs the JavaScript syntax checks and `node --test` for pushes and pull requests. The project requires no package installation.

## Project files

```text
tech0tonic/
├── .gitignore           # Excludes local data, secrets, and generated files
├── .github/
│   └── workflows/
│       └── node-tests.yml # Runs syntax checks and tests on pushes and pull requests
├── render.yaml           # Render Blueprint for the Node.js web service
├── index.html          # Owner dashboard, order dialog, and assistant panel
├── style.css           # Responsive dashboard and floating assistant styles
├── script.js           # Dashboard rendering and browser interactions
├── voice.js            # Assistant chat, speech input, and spoken replies
├── customer.html       # Customer-facing menu and checkout demo
├── customer.css        # Responsive storefront and basket styles
├── customer.js         # Menu loading, basket controls, and order submission
├── server.js           # Static file server, API routes, and SQLite persistence
├── assistant.js        # Rule-based intents, confirmations, and optional Ollama fallback
├── server.test.js      # API and database persistence integration tests
├── assistant.test.js   # Assistant action and voice asset integration tests
├── README.md           # This project guide
└── data/                 # Created at runtime; local databases and records are ignored by Git
```

The server creates `data/techtonic.sqlite` on startup. If local legacy JSON files exist when the database is first initialized, their records are imported once and the files are left untouched. These local data files are excluded from Git to avoid publishing kitchen/customer records. New orders and inventory changes are stored in SQLite. If no legacy inventory file exists, the sample starting inventory is inserted into the database.

## How the app works

`server.js` serves the dashboard files and the `/api/*` endpoints from the same origin. On page load, `script.js` requests `/api/dashboard`, which returns the current menu, orders, and inventory. The browser builds the queue, metrics, attention list, and reports from that response.

The customer demo at `/customer.html` loads its menu from `/api/menu`, displays server-provided prices, and submits item IDs and quantities to `/api/orders`. The API recalculates the total and saves the order like any other kitchen ticket; its source is recorded as `Other` and no payment is collected.

When staff record an order or receive stock, the browser sends a JSON request to the API. The server validates the request, updates SQLite in a transaction, and returns the saved record. Order totals are calculated from the server's menu, not trusted from the browser.

The floating Kitchen Assistant uses browser speech recognition when available, with text input as a fallback. It sends questions and commands to `/api/assistant`. Mutations are prepared first and require a second request containing the returned pending action; the server only executes an unexpired, server-issued confirmation. Successful actions use the existing order and inventory APIs, so they follow the same validation and pricing rules as the dashboard.

```text
Kitchen operator
      │
      ▼
index.html + style.css + script.js + voice.js
customer.html + customer.css + customer.js
      │  same-origin HTTP/JSON
      ▼
server.js + assistant.js ─────── data/techtonic.sqlite
      │           orders + order items + inventory
      └─────────── menu and dashboard API
```

## HTTP API

All API request and response bodies use JSON. The app serves these routes on its current origin.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Return service health and name. |
| `GET` | `/api/menu` | Return the server-owned menu and prices. |
| `GET` | `/api/dashboard` | Return `{ menu, orders, inventory }` for the owner view. |
| `GET` | `/api/orders` | Return orders newest first. |
| `POST` | `/api/orders` | Validate and save an incoming kitchen ticket. |
| `PATCH` | `/api/orders/:id` | Update an order to an allowed lifecycle status. |
| `GET` | `/api/inventory` | Return saved inventory from SQLite. |
| `PATCH` | `/api/inventory/:ingredientId` | Apply an inventory adjustment. |
| `POST` | `/api/assistant` | Answer an operations question or prepare/execute a confirmed action. |

### Kitchen assistant

Send a question or command as `{ "text": "How much paneer is left?" }`. For an action, the first response contains a `reply` and a `pending` object. The reply asks for confirmation. After the operator confirms, send `{ "execute": pending }` using that exact object. A successful action response includes `actionSucceeded: true`; pending confirmations expire after ten minutes and can only be used once. Supported questions cover low stock, ingredient quantities, today's recorded sales and order count, top dishes, and active orders. Supported actions create menu-priced orders, change an order status, and receive inventory stock.

The browser uses the built-in `SpeechRecognition` or `webkitSpeechRecognition` API with `en-IN`, and speaks replies with `speechSynthesis`. Speech recognition works best in Chrome or Edge; when recognition is unavailable, the assistant remains usable by typing.

### Create an order

`POST /api/orders`

```json
{
  "source": "Phone",
  "customerName": "Ticket 4821",
  "items": [
    { "id": 1, "quantity": 2 },
    { "id": 6, "quantity": 1 }
  ]
}
```

`source` may be `Swiggy`, `Zomato`, `Phone`, `Walk-in`, or `Other`. An omitted or unsupported source is stored as `Other`. `customerName` is optional and defaults to `Walk-in`. Each item must reference a menu ID and have an integer quantity from 1 to 20; the order must contain at least one valid item. Invalid input returns an HTTP 400 response with an `error` field. A successful response returns HTTP 201 and the saved order, including its generated ID, item count, calculated total, status, and timestamp.

### Update order status

`PATCH /api/orders/:id`

```json
{ "status": "Ready" }
```

Allowed values are `Preparing`, `Ready`, `Out for delivery`, `Delivered`, and `Cancelled`. The API accepts any allowed value for an existing order; the user interface presents the normal forward progression and a cancellation action. Unknown orders return 404; unsupported statuses return 400.

### Adjust inventory

`PATCH /api/inventory/:ingredientId`

```json
{ "adjustment": 4 }
```

The adjustment is added to the current on-hand quantity. Positive values record received stock; a negative value can represent a manual deduction. The adjustment must be finite, non-zero, no greater in absolute value than 10,000, and must not take stock below zero. Successful responses return the updated inventory item.

### Error responses

Errors have a JSON shape such as:

```json
{ "error": "One or more order items are invalid." }
```

Common status codes are `400` for invalid input, `404` for an unknown route or record, `405` for a non-GET static-file request, `413` for a request body over 64 KiB, and `500` for an unexpected server/file error.

## Stored data

### Order record

An order contains these fields:

- `id`: generated TechTonic ticket ID.
- `customerName`: entered name/reference or `Walk-in`.
- `source`: intake channel.
- `items`: menu item ID, name and server price, plus quantity for each line.
- `itemCount`: sum of line quantities.
- `total`: sum of server menu price multiplied by quantity.
- `status`: current lifecycle status.
- `createdAt`: ISO timestamp used for today's and seven-day summaries.

Orders and their line items are stored in the `orders` and `order_items` SQLite tables, including delivered and cancelled tickets. Cancellation does not erase the order.

### Inventory record

The initial sample inventory is:

| ID | Ingredient | On hand | Unit | Reorder at |
| --- | --- | ---: | --- | ---: |
| `chicken` | Chicken | 12 | kg | 6 |
| `cheese` | Mozzarella | 4 | kg | 5 |
| `tomatoes` | Tomatoes | 8 | kg | 4 |
| `paneer` | Paneer | 2 | kg | 3 |
| `packaging` | Packaging boxes | 28 | pcs | 20 |

Saved entries also get `updatedAt` after a stock adjustment. These are sample opening balances; edit or replace them for a real kitchen before relying on alerts.

## Verification

Run all backend integration tests from the project directory:

```powershell
node --test
```

The tests start temporary local servers and verify server-side item validation and pricing, order source/default handling, cancellation, dashboard data, rejected stock underflow, restocking, persistence after a restart, one-time import of existing JSON data, and the 64 KiB UTF-8 request limit. Temporary database files are removed afterwards. See [TEST_REPORT.md](TEST_REPORT.md) for the latest recorded results.

Check JavaScript syntax with:

```powershell
node --check server.js
node --check script.js
node --check assistant.js
node --check voice.js
node --check server.test.js
node --check assistant.test.js
```

A quick live health check while the app is running:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

## Configuration

- `PORT`: optional environment variable for the HTTP port. Defaults to `3000`.
- `OLLAMA_MODEL`: optional installed Ollama model name, for example `llama3.2`. When set, unknown questions are sent to `http://127.0.0.1:11434/api/generate` with a 25-second timeout and a short current stock/active-order summary. Ollama must be running locally and the model must already be available; otherwise the assistant uses its built-in help response.
- SQLite database path: `data/techtonic.sqlite` beside `server.js`.
- Legacy JSON import sources: `data/orders.json` and `data/inventory.json`, read only during first database initialization.
- Starting inventory and menu: defined near the top of `server.js`.
- Reorder thresholds: the `reorderAt` field on each starting inventory item.
- Display timezone: browser local time. Sales periods use the browser's local calendar date.
- Currency: Indian rupees (`INR`), formatted in the browser with `Intl.NumberFormat`.

No `.env` file or package manifest is required.

## Limitations and production notes

- **Manual intake only:** Selecting Swiggy/Zomato records the source label; it does not connect to either platform or import its ticket.
- **Customer page is a demo:** `/customer.html` submits an unpaid demo order to the local kitchen queue. It is not a public ordering service and does not process payments or delivery.
- **Sample menu and stock:** Menu items, prices, ingredient balances, and reorder points are demonstration data and must be configured for the kitchen.
- **No recipe deduction:** Recording a ticket does not consume stock automatically because recipe-to-ingredient quantities are not modeled.
- **Sales scope:** Reports include only orders manually recorded in this app. They are not accounting reports or a reconciliation of partner payouts, refunds, discounts, tax, or cancellations from external platforms.
- **Local SQLite storage:** This is intended for a single local app instance. Back up `data/techtonic.sqlite`; the legacy JSON files are not updated after import.
- **Free hosted demo storage:** The Render free service uses an ephemeral filesystem and may sleep when idle. SQLite demo data can reset after restarts or redeployments; use persistent storage and a security review before production.
- **No authentication or roles:** Anyone with access to the server can view and change its records. Restrict network exposure; add authentication and authorization before deployment.
- **No payment, delivery, supplier, or POS services:** Those integrations are outside the current project.
- **Browser speech support:** Speech recognition is browser-dependent and works best in Chrome or Edge. Typing remains available when the browser does not support recognition.
- **Optional AI fallback:** The assistant's core features are rule-based and work without Ollama. Only unknown questions can use Ollama, and only when `OLLAMA_MODEL` is set and a local Ollama server is available.
- **No enforced status transition rules:** The UI guides the ordinary progression, but the API permits any status in its allowed list for an existing order.
- **External fonts:** Google Fonts are optional; system fallbacks are defined if the font service is unavailable.

## Troubleshooting

### The browser cannot connect

- Confirm `node server.js` is still running and printed `TechTonic is ready at http://localhost:3000`.
- Use the exact port shown by the server, especially if `PORT` was set.
- If port 3000 is already occupied, start the app on another port using the PowerShell example above.

### Dashboard shows Offline

- Check `http://localhost:3000/api/health` in the same browser.
- Restart the Node process after editing `server.js` because Node does not automatically reload backend code.
- Check that the project folder is writable so the SQLite database can be created or updated.

### Restock alert remains visible

The warning clears when on-hand stock is greater than the item's reorder point. Receiving exactly the reorder-point quantity still qualifies as an alert because the rule is “at or below.”

### Sales look incomplete

The dashboard counts only tickets entered in TechTonic, uses the browser's local date, and excludes cancelled tickets. Orders from delivery apps are not imported automatically.
