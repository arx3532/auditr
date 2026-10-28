# Invoice Agent — Frontend

A Maya-inspired finance agent demo for Indian freelancers. You describe an invoice in plain language in a chat, the agent proposes a **draft**, and **nothing is issued until you confirm it**.

> **Demo only. Not tax, legal or accounting advice.** This text is shown in the footer of every page.

This repository is the **thin client**. A separate FastAPI backend computes all GST, TDS and totals. The UI never calculates tax or totals; it only displays the strings the server returns.

```
You: "Invoice AdTech ₹50,000, due the 15th"
 └─► agent streams a reply ─► draft card appears inline
      └─► Confirm & issue │ Edit │ Reject ─► the server issues the invoice
```

---

## Table of contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Quick start](#quick-start)
4. [Environment variables](#environment-variables)
5. [Mock mode and failure scenarios](#mock-mode-and-failure-scenarios)
6. [Scripts](#scripts)
7. [Routes](#routes)
8. [Project structure](#project-structure)
9. [Architecture](#architecture)
10. [API contract](#api-contract)
11. [Security](#security)
12. [Accessibility and responsiveness](#accessibility-and-responsiveness)
13. [Testing](#testing)
14. [Deployment](#deployment)
15. [Known limitations and open items](#known-limitations-and-open-items)
16. [Troubleshooting](#troubleshooting)

---

## Features

- **Chat that drafts invoices.** Streaming replies over server-sent events, a tool-status indicator ("Looking up overdue invoices..."), a Stop button, Enter to send and Shift+Enter for a new line.
- **Approval card.** The draft is rendered inline with the customer, line items, the server-provided tax breakdown, total and due date, exactly as received. Buttons: **Confirm & issue**, **Edit**, **Reject**.
- **Safe decisions.** One `Idempotency-Key` per decision, reused on retry, and double-clicks cannot send two requests.
- **Dashboard.** Revenue this month, overdue count and total, and recent invoices, with skeletons and an empty state.
- **Invoices.** A filterable table (by status) with cursor pagination, plus a detail page showing the tax breakdown, payments (cash received and TDS deducted shown separately) and a copy-link button for the public URL.
- **Customers list.**
- **Public invoice page** at `/pay/[token]`: no sign-in, read-only, with a UPI placeholder, `noindex`, and clear messages for invalid or revoked links.
- **One login page.** Sign-in and sign-up are a single page at `/login` (Clerk).
- **Gmail-style navigation.** A collapsible sidebar rail with hover-to-peek, a mobile drawer, and a remembered collapsed state.
- **Landing page** at `/`, light and dark themes.
- **Mock API** (MSW) with fixtures and togglable failure scenarios, so the whole UI works without the backend.

## Tech stack

| Area           | Choice                                                               |
| -------------- | -------------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router), React 19, TypeScript in strict mode         |
| Styling        | Tailwind CSS 4, shadcn/ui (Base UI primitives), `lucide-react` icons |
| Auth           | Clerk (`@clerk/nextjs`), bearer token sent to the API                |
| Server state   | TanStack Query                                                       |
| Forms          | `react-hook-form` + `zod`                                            |
| Streaming      | `fetch` + `ReadableStream` parsing of SSE (**not** `EventSource`)    |
| Tests          | Vitest + React Testing Library, MSW, Playwright                      |
| Tooling        | ESLint, Prettier, pnpm                                               |
| Hosting target | Vercel                                                               |

The chat endpoint is `POST`, and `EventSource` only supports `GET`, which is why a custom SSE parser is used.

## Quick start

**Requirements:** Node.js 20.9 or newer, and pnpm.

```bash
pnpm install
cp .env.example .env.local     # then fill in the values (see below)
pnpm dev                       # http://localhost:3000
```

Before you run it, you need:

1. **A Clerk application.** Create one at [dashboard.clerk.com](https://dashboard.clerk.com), enable Email and Google sign-in, **leave sign-ups enabled**, and copy the publishable and secret keys into `.env.local`.
2. **Either the backend or mocks.** Point `NEXT_PUBLIC_API_URL` at the FastAPI service, or set `NEXT_PUBLIC_USE_MOCKS=true` to use the built-in mock API.

> **Mocks still need Clerk.** The API client refuses to send a request without a Clerk session token, so even in mock mode you need valid Clerk keys and must be signed in. The mock only replaces the backend, not authentication.

> **Builds need internet access.** `next/font` downloads Figtree and Geist Mono from Google Fonts at build time. If your build environment is offline, switch to `next/font/local`.

## Environment variables

Copy `.env.example` to `.env.local`.

| Variable                            | Required             | Purpose                                                                 |
| ----------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`               | Unless mocks are on  | FastAPI base URL, **no trailing slash** (e.g. `http://localhost:8000`). |
| `NEXT_PUBLIC_USE_MOCKS`             | No (default `false`) | `true` starts MSW and serves fixture data instead of calling the API.   |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes                  | Clerk browser key.                                                      |
| `CLERK_SECRET_KEY`                  | Yes                  | Clerk server key. Server only; never expose it to client code.          |

Notes:

- Only `NEXT_PUBLIC_*` values reach the browser. Nothing is hardcoded; URLs and keys always come from the environment.
- Variables are validated with `zod` in `src/lib/env.ts`. An invalid value fails fast with a readable message.
- Sign-in URLs are set in code (`/login`), so you do not need `NEXT_PUBLIC_CLERK_SIGN_IN_URL` or `NEXT_PUBLIC_CLERK_SIGN_UP_URL`. If you have set them elsewhere, set them to `/login` or remove them.

## Mock mode and failure scenarios

With `NEXT_PUBLIC_USE_MOCKS=true`, MSW serves everything the UI needs from `src/mocks/`:

- **Fixtures:** a freelance designer with 4 customers and about 10 invoices across statuses, including drafts, issued, one overdue, one partially paid with TDS, and one cancelled. Dates are relative to "now", so the overdue invoice stays overdue.
- **Scripted chat:** `POST /chat` replays text deltas, a `tool_start`/`tool_end` pair, then `approval_required`. `POST /chat/resume` replays a short confirmation stream. Edits are applied and a new draft is returned.
- **Pagination:** invoice lists are served in pages of 5 so cursor pagination is exercised.

### Failure scenarios

Add `?mock=<scenario>` to any page URL, for example `/chat?mock=drop`. The choice is remembered for the browser session. `?mock=default` clears it.

| Scenario       | What happens                                                             |
| -------------- | ------------------------------------------------------------------------ |
| `default`      | Everything works.                                                        |
| `drop`         | The chat stream is cut off midway. The UI shows a retryable error row.   |
| `expired`      | The approval expires. The card shows "expired" and offers **Ask again**. |
| `error`        | The stream sends an `error` event.                                       |
| `unauthorized` | Every authenticated call returns 401. The app redirects to `/login`.     |
| `server_error` | Every authenticated call returns 500. Screens show a retry state.        |

Handy URLs in mock mode: the public invoice `/pay/pubtok-inv-0005`, and `/pay/revoked-demo-token` for the revoked-link message.

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `pnpm dev`          | Start the Next.js dev server.                 |
| `pnpm build`        | Create a production build.                    |
| `pnpm start`        | Serve the production build.                   |
| `pnpm typecheck`    | `tsc --noEmit`.                               |
| `pnpm lint`         | ESLint.                                       |
| `pnpm test`         | Run the Vitest unit and component suite once. |
| `pnpm test:watch`   | Vitest in watch mode.                         |
| `pnpm test:e2e`     | Run the Playwright end-to-end tests.          |
| `pnpm format`       | Format everything with Prettier.              |
| `pnpm format:check` | Verify Prettier formatting.                   |

## Routes

| Route            | Access    | Description                                                |
| ---------------- | --------- | ---------------------------------------------------------- |
| `/`              | Public    | Landing page.                                              |
| `/login`         | Public    | Single sign-in-or-sign-up page (Clerk `<SignIn />`).       |
| `/pay/[token]`   | Public    | Read-only public invoice. `noindex`, `no-referrer`.        |
| `/dashboard`     | Signed in | Revenue, overdue summary, recent invoices.                 |
| `/chat`          | Signed in | Chat with inline approval card.                            |
| `/invoices`      | Signed in | Invoice table with status filter and pagination.           |
| `/invoices/[id]` | Signed in | Invoice detail, tax breakdown, payments, copy public link. |
| `/customers`     | Signed in | Customers list.                                            |

Authentication is enforced in `src/proxy.ts` (Clerk middleware). Public routes are `/`, `/login`, `/pay`, `/robots.txt` and `/sitemap.xml`; everything else calls `auth.protect()`. After login, users land on `/dashboard`.

## Project structure

```
src/
  app/
    (marketing)/           landing page at "/"
    (auth)/login/          the single login page ([[...login]] catch-all for Clerk's steps)
    (app)/                 authenticated app: dashboard, chat, invoices, customers
      layout.tsx           reads the sidebar cookie, renders <AppShell>
    pay/[token]/           public invoice page (no auth)
    layout.tsx             ClerkProvider, fonts, providers, analytics
    robots.ts, sitemap.ts
  components/
    ui/                    shadcn/ui components (generated)
    layout/                AppShell, AppHeader, SidebarNav, SiteDisclaimer, nav-items
    chat/                  ChatPanel, MessageList, MessageBubble, Composer, ToolStatus, ChatErrorRow
    approval/              DraftInvoiceCard, ApprovalActions, EditDraftDialog
    invoices/              InvoicesView, InvoiceTable, InvoiceDetailView, InvoiceDetail,
                           InvoiceStatusBadge, CopyLinkButton, status helpers
    dashboard/             DashboardView, SummaryCards
    customers/             CustomersView, CustomerTable
    public/                PublicInvoiceView, PublicInvoice, UpiPlaceholder
    common/                MoneyText, DateText, EmptyState, ErrorState, Skeletons, PageHeader
    marketing/, landing/   landing page sections
    providers.tsx          theme, TanStack Query, MSW, tooltips, toasts
    msw-provider.tsx       starts the mock worker before rendering when mocks are on
  lib/
    api/
      client.ts            fetch wrapper: base URL, auth header, error normalisation
      endpoints.ts         one typed function per endpoint
      types.ts             the API contract (source of truth)
      schemas.ts           zod schemas for the edit form
      useApi.ts            endpoints bound to the Clerk session
      queries.ts           TanStack Query hooks
    stream/
      parseSse.ts          SSE parser over ReadableStream
      chatEvent.ts         validates and decodes each event
      chatState.ts         reducer: the chat state machine
      useChatStream.ts     hook: send, decide, stop, retry, new thread
      threadStorage.ts     keeps the thread id in sessionStorage
    format/                money.ts, date.ts (display-only formatting)
    env.ts                 validated environment
    idempotency.ts         crypto.randomUUID() helper
  mocks/                   MSW handlers, fixtures, scripted streams, scenarios
  tests/                   Vitest suites
  proxy.ts                 Clerk middleware (route protection)
  config/site.ts           marketing copy and links
e2e/                       Playwright tests
```

## Architecture

### Thin client, server-owned numbers

All money fields are **decimal strings** (e.g. `"50000.00"`) and dates are ISO 8601 strings. The UI never parses money to a float and never adds, multiplies or rounds anything. Tax, GST, TDS, totals and invoice numbers all come from the API.

`formatMoney` (`lib/format/money.ts`) shows `"125000.5"` as `₹1,25,000.50` by grouping the integer part as a `BigInt` with `Intl.NumberFormat("en-IN")` and carrying the fraction over as text. Anything that is not a plain decimal string is returned untouched rather than guessed at. Dates are shown in the user's locale, with the ISO value kept in `<time dateTime>`.

### API client

`lib/api/client.ts` is the only place that talks to the network.

- Builds URLs only from the configured API origin and refuses to call any other origin.
- Adds `Authorization: Bearer <Clerk token>` to authenticated calls. Public calls pass `auth: false` and send no token.
- Normalises every failure into one `ApiError` with a `kind` (`network`, `unauthorized`, `not_found`, `gone`, `client`, `server`, `invalid_response`), a `code` and a message. It accepts both `{ code, message }` and FastAPI's default `{ detail }` bodies.
- `retryable` is true for network failures and 5xx responses, which is what decides whether a screen offers **Retry**.
- A `401` on an authenticated call redirects to `/login`.
- Streaming calls verify the response is really `text/event-stream`.

TanStack Query owns server state with a 30 second stale time. It retries only retryable errors, at most twice.

### Chat streaming and state machine

`useChatStream` drives the chat through an explicit state machine in `lib/stream/chatState.ts`:

```
idle → streaming → awaiting_approval → resuming → streaming → idle        (+ error)
```

- **Partial chunks.** `parseSse` buffers until a complete SSE message has arrived, so events split across network chunks are handled. Comment and keepalive lines are ignored.
- **Validation.** Each event is decoded and checked before it reaches the reducer. Bad data raises a stream protocol error instead of corrupting state.
- **Abort and cleanup.** The Stop button aborts the in-flight request, and the stream is cleaned up on unmount.
- **Never stuck.** An `error` event or a dropped stream produces a retryable error row, so the UI never stays in `streaming`.
- **Approval lock.** On `approval_required` the draft card appears inline and the composer is disabled until a decision is made.
- **Thread persistence.** Only the `threadId` (never message text) is kept in `sessionStorage`, so a refresh can continue the thread. Re-fetching history is out of scope because the API doesn't provide it.
- **Retry.** Retrying a failed message repeats the request. Retrying a failed decision repeats it with its **original idempotency key**.

### The approval card

`DraftInvoiceCard` is the most important component. It shows the draft exactly as the server sent it, and moves through these states:

| State        | What the user sees                                                    |
| ------------ | --------------------------------------------------------------------- |
| `pending`    | Actions enabled; the primary action is focused when the card appears. |
| `submitting` | Buttons disabled with a spinner.                                      |
| `approved`   | The issued invoice number and a link to the invoice.                  |
| `rejected`   | A confirmation that nothing was issued.                               |
| `expired`    | A message, actions disabled, and an **Ask again** button.             |

- **Idempotency.** One `crypto.randomUUID()` key is generated per user decision and reused if the same decision is retried after a network failure. Double-clicking Confirm sends one request.
- **Edit.** Opens a dialog (`react-hook-form` + `zod`) limited to the editable fields: customer, description, amount and due date. Only changed fields are sent. The server recomputes tax and replies with a new draft. Because the contract has a single `description` and `amount`, **only drafts with one line item can be edited**.
- **Expiry** is detected from the server's `approval_expired` error code.
- **Accessibility.** The card is a labelled region, keyboard operable, and announces state changes through a polite live region.

### App shell and sidebar

The authenticated layout (`AppShell`) follows the Gmail look and feel:

- A tinted frame with a top bar (hamburger, logo, theme toggle, user menu), and the page content in a rounded card.
- The sidebar collapses to a 72px icon rail. A collapsed rail **floats open on hover or keyboard focus** without shifting the page. Icons stay in a fixed position, so only labels and the active pill animate. A **New invoice** button sits at the top.
- Below 768px the rail becomes a slide-in drawer.
- The collapsed state is stored in the `sidebar_state` cookie and read on the server, so there is no flash on load. **Ctrl/Cmd+B** toggles it.
- Animations respect `prefers-reduced-motion`.

### Theming

Light and dark themes via `next-themes` (system by default), using CSS variables defined in `src/app/globals.css`.

## API contract

The source of truth is `src/lib/api/types.ts`.

### Endpoints

All endpoints require authentication except the public one.

| Method | Path                        | Notes                                                                 |
| ------ | --------------------------- | --------------------------------------------------------------------- |
| GET    | `/invoices?status=&cursor=` | Returns `{ items, nextCursor? }`.                                     |
| GET    | `/invoices/:id`             | Returns the invoice plus its `payments`.                              |
| GET    | `/customers`                | Returns `Customer[]`.                                                 |
| GET    | `/reports/summary`          | Returns `{ revenueThisMonth, overdueCount, overdueTotal }`.           |
| POST   | `/chat`                     | Body `{ threadId?, message }`. Responds with an SSE stream.           |
| POST   | `/chat/resume`              | Body `{ threadId, decision, edits? }`, header `Idempotency-Key`. SSE. |
| GET    | `/public/invoices/:token`   | **No auth.** `404` for an unknown token, `410` for a revoked one.     |

### Server-sent events

Each event is JSON in `data:` with a `type`:

```ts
type ChatEvent =
  | { type: 'thread'; threadId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; tool: string }
  | { type: 'tool_end'; tool: string }
  | { type: 'approval_required'; approvalId: string; expiresAt: string; draft: Invoice }
  | { type: 'error'; code: string; message: string }
  | { type: 'done' }
  | { type: 'invoice_issued'; invoice: Invoice } // proposed addition
```

### Proposed additions to the contract

The original contract left some shapes undefined. The code assumes the following, isolated at the bottom of `types.ts` so the backend team can confirm or change them:

| Addition                                                      | Why it is needed                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `InvoiceListResponse { items, nextCursor? }`                  | `GET /invoices` names a cursor but not how the next one is returned.                              |
| `InvoiceDetail` = `Invoice` + `payments[]`                    | The detail screen must show cash received and TDS deducted, but no endpoint returned payments.    |
| `DraftEdits { customerId?, description?, amount?, dueDate? }` | The brief names the editable fields but not the payload shape.                                    |
| `invoice_issued` event                                        | The approval card must show the issued number and link to it, but no existing event carries that. |
| `ApiErrorBody { code, message }`                              | A JSON error body for non-2xx responses. FastAPI's `{ detail }` is also tolerated.                |
| Error code `approval_expired`                                 | Lets the card show the expired state reliably.                                                    |
| `410` for revoked public tokens                               | Distinguishes a revoked link from an unknown one (`404`).                                         |

The public endpoint currently returns the full `Invoice` type. If the backend returns a reduced shape without internal IDs, add a `PublicInvoice` type.

## Security

- No secrets in client code; only `NEXT_PUBLIC_*` values are exposed.
- All server and model text is rendered as plain text. `dangerouslySetInnerHTML` is not used anywhere. If Markdown rendering is ever added, it must be sanitised.
- The API client only calls the configured API origin.
- Tokens, message contents and personal data are not logged.
- The UI never asks for or displays PAN, Aadhaar or bank numbers. Seed data is obviously fake.
- Security headers are set in `next.config.mjs`: `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `X-Frame-Options` and `Permissions-Policy`.
- The public invoice page is `noindex`, and sets `no-referrer` so the token in the URL is not leaked to other sites.
- `E2E_BYPASS_AUTH=true` makes the proxy skip route protection. It exists only for the Playwright server command. **Never set it in a deployed environment.**

## Accessibility and responsiveness

- Responsive from 360px wide.
- Keyboard navigable with visible focus states, semantic HTML and labels on all inputs.
- Status badges use text plus colour, never colour alone.
- The approval card moves focus to its primary action and announces itself to screen readers.
- Reduced-motion preferences are respected.

## Testing

```bash
pnpm test        # unit and component tests
pnpm test:e2e    # Playwright
pnpm typecheck && pnpm lint && pnpm format:check
```

**Vitest** (11 files, 149 tests) covers formatting, the API client and its error normalisation, the MSW fixtures and handlers, the SSE parser (chunk splitting, errors, abort), the chat state reducer, `useChatStream`, the chat UI and approval card, the dashboard, invoice and customer views, the public invoice page, and the app shell and sidebar. Tests run against MSW with `NEXT_PUBLIC_API_URL=http://api.test`.

**Playwright** (`e2e/invoice-flow.spec.ts`) covers the main flow (chat, draft, confirm, issued) and the public invoice page. Its web server runs with `NEXT_PUBLIC_USE_MOCKS=true` and `E2E_BYPASS_AUTH=true`. Install browsers first with `pnpm exec playwright install`.

## Deployment

The frontend runs on **Vercel**, the FastAPI backend on **Azure**, and **Clerk** handles sign-in. The browser talks to both: it loads the app from Vercel, then calls the API directly with a Clerk bearer token.

```
Browser ──► Vercel (this Next.js app)
   │
   ├──► Clerk (sign-in, issues a session token)
   └──► Azure (FastAPI) ── checks the token against Clerk's public keys
```

### 1. Decide your domain (this decides your Clerk keys)

- **`*.vercel.app` address:** works, but only with Clerk **development** keys. Clerk production keys cannot be used on a `vercel.app` domain, because a production instance needs DNS records on a domain you own. Fine for a demo or portfolio link.
- **Your own domain:** create a Clerk **production** instance, add the DNS records Clerk gives you, and use the production keys. Needed for a real launch.

### 2. Clerk

- [ ] Email and Google sign-in are enabled, and sign-ups are **not** restricted.
- [ ] Copy the **publishable key** and **secret key** (for the frontend).
- [ ] Copy the **Frontend API URL** (the token issuer) and the **JWKS URL** (for the backend). Both are on the _API keys_ page.
- [ ] Note the exact origin(s) users will load the app from, such as `https://your-app.vercel.app`. The backend must list these as allowed token origins.

### 3. Backend on Azure

- [ ] Serve it over **HTTPS only**. A page loaded over HTTPS cannot call an `http://` API.
- [ ] Set these environment variables on the backend:

  | Variable                   | Example                                                       | Purpose                                      |
  | -------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
  | `CLERK_JWKS_URL`           | `https://<instance>.clerk.accounts.dev/.well-known/jwks.json` | Where to fetch Clerk's public keys           |
  | `CLERK_ISSUER`             | `https://<instance>.clerk.accounts.dev`                       | The Frontend API URL; must match the token   |
  | `CLERK_AUTHORIZED_PARTIES` | `https://your-app.vercel.app,http://localhost:3000`           | Origins allowed to obtain tokens             |
  | `CORS_ORIGINS`             | `https://your-app.vercel.app,http://localhost:3000`           | Browsers allowed to call the API             |
  | `CORS_ORIGIN_REGEX`        | _(optional)_ a narrow pattern for your preview URLs           | Lets Vercel preview deployments call the API |

- [ ] Origins have **no trailing slash**.
- [ ] CORS allows the headers `Authorization`, `Content-Type` and `Idempotency-Key`.
- [ ] Event streams (`/chat`, `/chat/resume`) are **not** compressed or buffered, and send a keepalive comment every ~15 seconds. Azure's front end closes long idle requests (about four minutes on App Service; check the limit for your tier).
- [ ] Use a health probe on `GET /health` (no auth).
- [ ] Avoid cold starts for demos: free tiers sleep, so the first request after a pause can be slow. Prefer a small always-on tier.
- [ ] The API implements every endpoint and shape in [API contract](#api-contract), including the proposed additions.
- [ ] Only `GET /public/invoices/:token` is public; every other route requires a valid token.

### 4. Frontend on Vercel

- [ ] Import the repository. If the app lives in a subfolder, set the **root directory** to `frontend`.
- [ ] Add the environment variables, scoped to _Production_ (and _Preview_ if you use previews):

  | Variable                            | Value                                                      |
  | ----------------------------------- | ---------------------------------------------------------- |
  | `NEXT_PUBLIC_API_URL`               | `https://<your-api>.azurewebsites.net` (no trailing slash) |
  | `NEXT_PUBLIC_USE_MOCKS`             | `false` (or `true` for a self-contained demo)              |
  | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | from Clerk                                                 |
  | `CLERK_SECRET_KEY`                  | from Clerk (server only)                                   |

- [ ] **Redeploy after changing any `NEXT_PUBLIC_*` value.** They are baked in at build time.
- [ ] **Do not set `E2E_BYPASS_AUTH`** in any deployed environment.
- [ ] `src/config/site.ts` has your project name and repository link.

### 5. Smoke test, in this order

1. `GET https://<your-api>/health` returns `200`.
2. Open the site, go to `/login`, and sign in with Google.
3. In the browser's Network tab, API calls return `200` and show no CORS or mixed-content errors.
4. The dashboard loads. A `401` here means the token check failed: compare `CLERK_ISSUER`, `CLERK_JWKS_URL` and `CLERK_AUTHORIZED_PARTIES` with your Clerk dashboard and your site's exact origin.
5. **New invoice:** create a draft, open it, choose **Confirm & issue**, and check that a number appears. Double-click Confirm and check that only one invoice is issued.
6. **Chat:** send a message and check that the reply arrives piece by piece, not all at once at the end (if it arrives all at once, something is buffering the stream). Leave a draft waiting for over a minute and check the stream stays open.
7. Refresh in the middle of a chat and check the thread continues.
8. Open `/pay/<token>` while signed out. An invalid or revoked token shows a clear message.
9. Check the app at 360px wide and in dark mode.
10. View the page source and search for `CLERK_SECRET_KEY` and your Azure secrets. Neither may appear.

### 6. Troubleshooting

| Symptom                                       | Likely cause and fix                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| "blocked by CORS policy" in the console       | The Vercel origin is missing from `CORS_ORIGINS`, has a trailing slash, or `Idempotency-Key` is not allowed. |
| Every API call returns `401` after signing in | Wrong `CLERK_ISSUER` or `CLERK_JWKS_URL`, or the site's origin is missing from `CLERK_AUTHORIZED_PARTIES`.   |
| API calls return `503`                        | The backend could not reach Clerk's key endpoint. Check outbound network access from Azure.                  |
| Chat reply appears all at once                | A proxy or middleware is buffering or compressing the stream. Remove GZip for these routes.                  |
| Chat stops after a few minutes of waiting     | The keepalive is missing, or the Azure idle limit was reached.                                               |
| First request after a pause is very slow      | The Azure tier sleeps when idle. Use an always-on tier for demos.                                            |
| Clerk shows a development warning             | You are on development keys. That is expected on a `vercel.app` domain.                                      |
| Page still talks to the mock API              | `NEXT_PUBLIC_USE_MOCKS` was `true` at build time. Set it to `false` and redeploy.                            |

## Known limitations and open items

- **Repository link.** `src/config/site.ts` points the "View on GitHub" button at the GitHub profile. Replace it with the repository URL once it is pushed.
- **Mocks need Clerk.** See [Quick start](#quick-start). The mock replaces the backend, not authentication.
- **Playwright and auth.** The e2e bypass only skips the proxy check. API calls still require a Clerk token, so confirm the e2e tests pass in your environment with valid Clerk keys and a signed-in session, or add a token bypass for test mode.
- **`zustand`** is installed but not used, because the chat state lives in a reducer. Remove it if you don't plan to use it.
- **Edit is limited** to single-line-item drafts.
- **No chat history.** Only the thread id persists across refreshes.
- **UPI link and QR** on the public page are placeholders.
- **Contract additions** listed above need backend confirmation.

## Troubleshooting

| Symptom                                       | Likely cause and fix                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Build fails fetching fonts                    | No access to Google Fonts. Allow the network, or switch to `next/font/local`.                       |
| "Invalid environment configuration" on start  | `NEXT_PUBLIC_API_URL` is not a valid URL, or `NEXT_PUBLIC_USE_MOCKS` is not `true` or `false`.      |
| "NEXT_PUBLIC_API_URL is not set"              | Set it, or enable `NEXT_PUBLIC_USE_MOCKS=true`.                                                     |
| Redirected to `/login` in mock mode           | The mock still needs a Clerk session. Sign in, or check you are not on `?mock=unauthorized`.        |
| Mock data does not appear                     | Restart the dev server after changing env vars, and make sure `public/mockServiceWorker.js` exists. |
| Old `/sign-in` or `/sign-up` links return 404 | They were removed on purpose. Use `/login`.                                                         |
| Sign-up does not work on the login page       | Sign-ups may be disabled in the Clerk dashboard.                                                    |

---

This is a demo. It is not tax, legal or accounting advice.
