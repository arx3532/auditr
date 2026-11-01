<p align="center">
  <img src="assets/auditr-icon-light.svg" alt="Auditr logo" width="96" height="96">
</p>

<h1 align="center">Auditr</h1>

<p align="center">
  <img src="https://github.com/arx3532/auditr/actions/workflows/ci.yml/badge.svg" alt="CI">
</p>

A chat-based invoicing assistant for Indian freelancers. You describe an invoice in plain
language, an AI agent prepares a draft, and **nothing is issued until you approve it**. All GST,
TDS and ledger arithmetic is done by tested code, never by the model.

> **Demo only.** This is a portfolio project. It is not accounting software, it does not file
> anything, and it does not give tax, legal or accounting advice.

- Live demo: https://auditr-arx3532.vercel.app/

## What it does

- **Invoices by chat or form.** "Invoice AdTech Pvt. Ltd. 50000 at 18% GST for logo design, due
  2026-11-15" produces a draft card with the tax already worked out. You confirm, edit or reject.
- **Payments with TDS.** A payment is cash plus TDS deducted, so an invoice can close with less
  cash than its total. The agent proposes it and you approve it.
- **Questions about your own numbers.** Customers, invoices, this month's revenue, overdue
  amounts and receivables aging come from the database through fixed tools.
- **Reports and exports.** GST and HSN summaries, a TDS tracker, aging, and CSV exports. These are
  summaries of your own records, not returns.
- **Shareable invoice links** that can be revoked.

## Design principles

1. **The model only decides what to do.** Tax, totals, rounding, numbering and ledger postings are
   deterministic Python with unit and property tests.
2. **The model can only propose.** It has no tool that issues an invoice or records a payment.
   It can create a draft or a proposal, and a person approves.
3. **Approvals are single-use and bound to a user and conversation.** They expire, and an edit
   issues a new approval so the user can only approve numbers they have seen.
4. **Sensitive identifiers never reach the model provider.** PAN, GSTIN, Aadhaar, long account
   style numbers and emails are masked before text enters the graph, and the LLM client refuses to
   send anything that still looks sensitive.
5. **Money is `Decimal` end to end,** `NUMERIC(14,2)` in the database and strings in JSON.

## Architecture

```mermaid
flowchart TB
  UI["Next.js app on Vercel"] -->|"REST and SSE, Clerk JWT"| API["FastAPI on Azure Container Apps"]
  API --> Agent["LangGraph agent"]
  API --> Services["Finance services: invoicing, GST and TDS, ledger, reports"]
  Agent -->|"masked text"| LLM["NVIDIA-hosted LLM"]
  Agent -->|"tool calls"| Services
  Services --> DB[("PostgreSQL")]
  Agent -->|"checkpoints"| DB
```

| Layer | Responsibility |
|---|---|
| API (`app/api`) | Auth, validation, REST routes, SSE streaming, error shapes |
| Agent (`app/agent`) | One flat LangGraph graph, tools, privacy filter, LLM client |
| Services (`app/services`) | Invoicing, payments, approvals, reports, exports. Each business operation is one transaction |
| Domain (`app/domain`) | Pure functions: money, GSTIN, GST, TDS, invoice rules, ledger. No database or network |
| Data (`app/db`) | SQLAlchemy models, repositories (every query takes a `user_id`), Alembic migrations |

### How an approval works

```mermaid
sequenceDiagram
  participant U as User
  participant A as API
  participant G as Agent graph
  participant D as Database
  U->>A: POST /chat (message)
  A->>G: masked message
  G->>D: create draft, open approval
  G-->>U: approval_required (draft card)
  Note over G: graph paused
  U->>A: POST /chat/resume (approve)
  A->>D: lock conversation row, issue invoice, post ledger (one transaction)
  A->>G: resume with the outcome
  G-->>U: approval_resolved, reply, done
```

The graph node that pauses has no side effects, because LangGraph re-runs an interrupted node
from its start on resume. The real work happens in the resume endpoint, in a single database
transaction. If that work fails, everything rolls back and the approval stays pending.

## Key decisions

| Decision | Why |
|---|---|
| Tax and ledger logic in pure functions | Exact, repeatable and testable. The model never does arithmetic |
| Stored tax on drafts, not recomputed at issue | The invoice, its lines and its ledger entries always agree with what the user approved |
| Double-entry ledger, append-only | Every posting is checked for balance, and corrections are new entries |
| Idempotency keys on issue and payment | A retried request cannot create a second invoice or payment |
| Gapless invoice numbers per financial year | The counter row is locked and incremented in the same transaction as the issue |
| Approval state in a database row with a row lock | Single use, bound to a user, expiring, and safe under concurrent requests |
| Flat graph, one shared Postgres checkpointer | A paused conversation survives a server restart |
| Rate slabs in a dated config file | Rules change over time, so old invoices keep the rules in force at the time |
| Migrations run as a separate step | Two replicas starting at once cannot race to apply the same migration |
| Evals alongside unit tests | The model is the least predictable part, so it is measured, not assumed |

## Tech stack

Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, psycopg 3, Alembic, PostgreSQL, LangGraph with
the Postgres checkpointer, `httpx`, an OpenAI-compatible LLM API (NVIDIA hosted), Clerk for auth,
`uv`, pytest, Hypothesis, Ruff, mypy, Docker, GitHub Actions, Azure Container Apps and Azure
Database for PostgreSQL. The frontend (separate repo) is Next.js, TypeScript and Tailwind on Vercel.

## Security and privacy

What the code enforces, and what tests prove:

- JWT signatures are verified against the provider's public keys, with the algorithm pinned and
  issuer and expiry checked. Errors return a generic 401.
- Every repository function requires a `user_id`. Other users' data returns 404, not 403.
- Identifiers are masked before they enter the conversation state. Stored checkpoints hold the
  masked text only (tested).
- The LLM client scans every outgoing request and raises instead of sending sensitive data (tested,
  including with masking deliberately bypassed).
- Tool results never include GSTINs or internal ids, and the model refers to customers by name and
  invoices by number.
- Customer names, descriptions and tool results are treated as data. A test plants an injected
  instruction in a customer name and checks the model can still only propose.
- Internal errors are logged without prompts and never shown to clients (tested).
- Per-user rate limit on chat, a cap on graph steps per turn, a message length limit, and CORS
  limited to the frontend origin.

## Data model

`users`, `customers`, `invoices`, `invoice_items`, `payments`, `ledger_entries`,
`invoice_number_sequences`, `idempotency_keys`, `chat_threads` (ownership and the one pending
approval). LangGraph creates its own checkpoint tables, which hold the conversation.
Check constraints enforce non-negative amounts, valid statuses, one-sided ledger rows and
`amount_due <= total`.

## API overview

| Area | Endpoints |
|---|---|
| Profile | `GET /me`, `PUT /me/profile` |
| Customers | `GET`, `POST /customers` |
| Invoices | `GET`, `POST /invoices`, `GET`, `PATCH /invoices/{id}`, `POST /invoices/{id}/issue`, `/cancel` |
| Payments | `POST`, `GET /invoices/{id}/payments` |
| Sharing | `POST`, `DELETE /invoices/{id}/public-link`, `GET /public/invoices/{token}` (no login) |
| Reports | `GET /reports/summary`, `/gst-summary`, `/hsn-summary`, `/tds`, `/receivables-aging` |
| Exports | `GET /exports/invoices.csv`, `/exports/payments.csv` |
| Chat | `POST /chat`, `POST /chat/resume`, `GET /chat/threads/{id}` (SSE streams) |
| Health | `GET /health`, `GET /ready` |

Issue and payment calls need an `Idempotency-Key` header. Business errors are
`{ "error": { "code", "message" } }`. Chat events: `thread`, `text_delta`, `tool_start`,
`tool_end`, `approval_required`, `approval_resolved`, `error`, `done`.

### Agent tools

| Tool | Kind |
|---|---|
| `list_customers`, `list_invoices`, `get_summary`, `receivables_aging` | Read, run immediately |
| `create_invoice_draft`, `record_payment` | Propose only: open an approval for the user |

## Testing

```powershell
uv run pytest -q                    # unit, API, concurrency, agent and security tests
uv run python -m evals.run -v       # evals against the real model (needs NVIDIA_API_KEY)
```

- **Domain tests** include property-based tests that any invoice's ledger entries balance.
- **Concurrency tests** issue five invoices at once and expect gapless numbers, and race two
  approvals for the same invoice and expect exactly one to win.
- **Agent tests** use a scripted fake model, so they are fast and need no network.
- **Evals** send 38 fixed prompts (drafts, clarifications, payments, lookups, tax-advice
  refusals, attacks) to the real model in a freshly seeded database. Every run also checks that
  nothing was issued, paid or posted without the user, that nothing sensitive reached the model,
  and that replies contain no identifier-shaped values.

### Latest eval result

Model `nvidia/nemotron-3.5-bolt-e4b`, 2026-10-30, 1 run per case: **30 of 38 passed (78.9%)**.
Invariant violations: 0. Average latency 2.4 seconds (p95 4.6 seconds).

| Category | Passed | Total |
|---|---|---|
| Drafts | 5 | 7 |
| Clarifications | 6 | 9 |
| Payments | 6 | 7 |
| Lookups | 2 | 4 |
| Tax-advice refusals | 4 | 4 |
| Safety and attacks | 7 | 7 |

All 7 safety cases passed, including the injected customer name, the PAN in a message and a very
large number. None of the 8 failures broke an invariant: nothing was issued, paid or posted
without the user, and nothing sensitive reached the model.

What the run found:

- **One over-strict check.** For the 70000 overpayment, the reply was correct ("exceeds the amount
  due") but the check matches whole words and did not accept "exceeds".
- **Prompts without a description.** Five draft prompts do not say what the work was for, though
  the API requires a description. This model drafted anyway in four of them, so it supplied the
  text itself, and asked for it in the fifth (`d-decimal`), which counted as a failure.
- **Six misses by a small model.** It drafted without asking when the customer name was ambiguous
  or the description was missing, did not question an amount stated as GST-inclusive, asked for a
  customer name instead of drafting, answered "Who are my customers?" with the fallback reply, and
  answered "which invoices are overdue" with aging totals instead of naming the invoice. The
  approval card is what keeps the first two safe, because the user sees the draft before anything
  is issued.

## Run it locally

```powershell
docker compose up -d
docker compose exec db createdb -U finagent finagent_test
docker compose exec db createdb -U finagent finagent_eval
cp .env.example .env            # then fill in the Clerk and NVIDIA values
uv sync
uv run alembic upgrade head
uv run python run.py            # on Windows (psycopg async needs the selector event loop)
# or: uv run uvicorn app.main:app --reload
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://user:password@host:5432/db`, add `?sslmode=require` in the cloud |
| `CLERK_JWKS_URL`, `CLERK_ISSUER` | Where to verify sign-in tokens |
| `CORS_ORIGINS` | Allowed frontend origins (JSON list or comma-separated) |
| `ENVIRONMENT` | `local` or `production` |
| `NVIDIA_API_KEY` | Key for the hosted model. Without it, chat is disabled |
| `LLM_MODEL`, `LLM_BASE_URL`, `LLM_TIMEOUT_SECONDS` | Model choice and client settings |

## Deployment

The API runs as a container on Azure Container Apps, with Azure Database for PostgreSQL. A manual
Container Apps job runs `alembic upgrade head` before each new image goes live. GitHub Actions runs
lint, type checks and tests on every push, and builds the image on `main`. The frontend is on
Vercel and calls the API directly from the browser.

## Known simplifications (tax)

These are deliberate and apply to the demo only. None of it is tax advice.

- **Rounding** is a demo policy: each tax component is rounded per line to two decimals, half-up.
  Section 170 of the CGST Act (rounding of sums payable to the nearest rupee) is not modelled,
  because the demo computes no returns.
- **Suggested TDS** is rounded to a multiple of ₹10, following the Income Tax Department's TDS
  reckoner. Recorded TDS is whatever the customer actually deducted. TDS rates and sections are
  inputs, and the app never decides which applies.
- **Place of supply** is simplified to the customer's state. Real rules vary by type of supply, and
  the conditions for treating a service as an export are not checked. A stored LUT reference
  makes an invoice zero-rated, and the user decides whether that applies.
- **GST rates** come from a dated rule set (0, 5, 18 and 40 percent from 22 September 2025). The
  engine checks that a rate is an allowed slab, not that it is the right one for a service. Rates
  are always supplied by the user, never guessed.
- **Rule lookup uses the invoice date,** not the time of supply.
- **Not modelled:** input tax credit, reverse charge, credit notes, grossing up of TDS, lower or
  nil deduction certificates, e-invoicing, filing of any return.
- **Unverified items:** the GSTIN state-code list is partial, the 16-character invoice number
  limit is from memory, and the rate notification numbers still need adding to the rule file.
- **Reports** summarise the user's own records. They are not returns.

## Known limitations (engineering)

- If the server stops between executing an approved action and resuming the graph, the invoice or
  payment is correct but that chat thread stays stuck. Start a new chat.
- The chat rate limiter is per process, so more than one replica would count separately. The
  deployment pins a single replica.
- Small hosted models are less reliable at tool calling than frontier models, and the free tier
  has variable latency. The approval card, not the model, is the safety net. The model proposes
  dates and amounts, and the user verifies them.
- Masked tokens such as `[PAN_1]` can appear in assistant replies, and a customer name containing
  a long run of digits is masked.
- Conversation checkpoints hold masked text but are not encrypted at the application level.
- There is no conversation history endpoint and no deletion flow yet.
- The database allows connections from Azure services (`0.0.0.0` rule) and relies on the password
  and TLS. A production setup would use private networking.
- Ledger balance is enforced in code and tested, not by a database trigger. There is no audit log
  table yet.
- Costs and availability of the hosted model tier can change.

## Roadmap

Credit notes and cancelling issued invoices; payment reconciliation from a bank statement CSV;
reminders in dry-run mode; an MCP server that exposes read and draft-only tools; a cited
tax-information assistant with CA-reviewed evals; a conversation history and deletion flow.

## Author

Built by Aazim Rafeekh ([github.com/arx3532](https://github.com/arx3532)). Inspired by
AI-first finance tools, and written to learn how to make an agent reliable enough to work with
money.
