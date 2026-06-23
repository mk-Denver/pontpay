# PontPay — Pontmore Protocol Implementation

This document describes how PontPay implements the **Pontmore Protocol** —
a Nostr-native protocol family for agent identity, capability discovery,
escrow declaration, and swap lifecycle coordination.

**Canonical spec:** https://github.com/pontmore/protocol

## PIPs Implemented

| PIP | Title | Kind(s) | Status |
|-----|-------|---------|--------|
| PIP-00 | Agent Definition | 30360 | Implemented |
| PIP-01 | Escrow Descriptor | 30361 | Not used (in-person model) |
| PIP-02 | Swap State Machine | 7300, 7301, 7302, 7303, 7304, 30362 | Implemented |
| PIP-03 | Dispute Policy | 7303 | Implemented (dispute events) |

## PIP-00: Agent Definition (kind 30360)

Agents publish a kind 30360 addressable event to register on the network.

- `d` tag: stable identifier (usually `agent`)
- `t` tag: `agent` for relay-level discovery
- `relay` tags: relay preferences (required)
- `f` tags: supported fiat currencies (recommended)
- Content: JSON with `version`, `name`, `about`, `capabilities`, `pricing_policy`, `exchange_mode`, `updated_at`

### Discovery

```ts
nostr.query([{ kinds: [30360], '#t': ['agent'], limit: 100 }]);
```

### Registration Flow

1. Agent fills out registration form (name, capabilities, currencies, regions, limits)
2. Client publishes the agent definition (kind 30360) — no escrow descriptor needed
3. Updating: re-publish with same `d` tag (addressable replacement)
4. Deletion: NIP-09 kind 5 event with `a` tag referencing the coordinate

## PIP-01: Escrow Descriptor (kind 30361)

**Not used in PontPay's in-person model.** PontPay uses direct in-person cash
exchange — no escrow is required. The escrow descriptor types are retained in
the protocol library for compatibility but agents are not required to publish
them. Agent definitions (kind 30360) do not reference escrow descriptors.

### In-Person Exchange Flow

**Deposit (fiat → BTC):**
1. Customer generates a Lightning invoice and publishes a swap request
2. Customer sends the invoice + payment instructions via NIP-17 gift wrap
3. Agent sees request in inbox, accepts
4. Agent and customer meet in person; customer gives cash
5. Agent pays the customer's Lightning invoice from their wallet
6. Agent marks swap completed

**Withdrawal (BTC → fiat):**
1. Customer publishes a swap request with payout instructions
2. Agent sees request in inbox, accepts
3. Agent generates a Lightning invoice and sends it to customer via NIP-17
4. Customer sees invoice in their History page, pays it
5. Agent confirms Lightning payment received
6. Agent and customer meet; agent gives cash
7. Agent marks swap completed

## PIP-02: Swap State Machine

Swaps are modeled as Nostr-native state machines with an append-only event log.

**In-person exchange model (no escrow):** PontPay uses an in-person agent
network where the customer and agent meet face-to-face. Cash changes hands in
person, and Lightning payments settle the BTC leg. No escrow (hold invoices,
custodial escrow) is required.

### Event Types

| Kind | Type | Mutability | Purpose |
|------|------|------------|---------|
| 7300 | Swap Request | Immutable | Root event defining the requested trade |
| 7301 | Transition | Immutable | Append-only state advancement |
| 7302 | Evidence | Immutable | Payment proof, payout proof, etc. |
| 7303 | Dispute | Immutable | Dispute event (PIP-03) |
| 7304 | Note | Immutable | Optional human-readable operational note |
| 30362 | Snapshot | Addressable | Replaceable materialized view for fast lookup |

### Swap States (In-Person Model)

`requested` → `accepted` → `fiat_exchanged` → `lightning_settled` → `completed`

Both `fiat_exchanged` and `lightning_settled` must occur before `completed`.
The order depends on the swap type:

- **Deposit** (fiat → BTC): `requested → accepted → fiat_exchanged → lightning_settled → completed`
  (customer gives cash, then agent pays customer's Lightning invoice)
- **Withdrawal** (BTC → fiat): `requested → accepted → lightning_settled → fiat_exchanged → completed`
  (customer pays agent's Lightning invoice, then agent gives cash)

Branches: `cancelled`, `disputed`, `expired`

### Swap Request Content (kind 7300)

```json
{
  "version": 1,
  "swap_id": "pm_abc123",
  "swap_type": "deposit",
  "agent": "<agent_pubkey>",
  "customer": "<customer_pubkey>",
  "escrow_reference": "in_person",
  "fiat": { "currency": "KES", "amount": 7500 },
  "bitcoin": { "amount_sats": 50000, "network": "lightning" },
  "expiry": 1719127056
}
```

### Companion Private Message Lane

Per PIP-02, sensitive payloads (invoices, bank details, payout instructions)
are exchanged via NIP-17 Gift Wrap, NOT in public swap events. The private
lane is a companion channel — it does not replace the public state machine.

#### Implementation

The private lane is implemented in `src/lib/giftwrap.ts` (NIP-59 gift wrap
create/unwrap) and `src/hooks/useSwapMessages.ts` (send/receive swap payloads).

**Sending** (`useSwapMessages().sendMessage`):
1. Create a kind 14 rumor (unsigned) with a JSON `SwapPayload`:
   `{ type, swapId, data, label?, createdAt }`
2. Seal it (kind 13) — encrypt the rumor to the recipient using the sender's
   signer NIP-44, sign with the sender's real key
3. Gift wrap it (kind 1059) — encrypt the seal with a random one-time key
   (nostr-tools `generateSecretKey` + `nip44.v2`)
4. Publish two wraps: one to the recipient, one to self (archive)

**Receiving** (`useSwapMessages().useSwapInbox`):
1. Query `kinds: [1059], '#p': [myPubkey]` (gift wraps addressed to us)
2. Unwrap each: decrypt outer layer (signer NIP-44, peer = wrapper pubkey)
   → seal, decrypt inner layer (signer NIP-44, peer = seal pubkey) → rumor
3. Verify rumor.pubkey === seal.pubkey (NIP-17 anti-impersonation check)
4. Filter by `swap` tag to match a specific swap
5. Parse the JSON payload from the rumor content

**Payload types** (`SwapPayloadType`):
- `invoice` — Lightning invoice (BOLT11)
- `bank_details` — Fiat payment/payout instructions
- `payout_confirmation` — Agent confirms fiat payout sent
- `payment_proof` — Proof of payment (preimage, receipt, tx hash)
- `message` — Freeform operational note

The `swap` tag on the rumor links it to the public kind 7300 swap request.

### Agent Inbox

Agents discover incoming swap requests by querying kind 7300 events where
they are the `p`-tagged recipient:

```ts
nostr.query([{ kinds: [7300], '#p': [myPubkey], limit: 50 }]);
```

The agent inbox (`src/pages/AgentInboxPage.tsx`) provides:
- Browse incoming swap requests with customer info and state
- Accept/reject requests (advance state machine via kind 7301)
- Advance the full swap lifecycle: `requested → escrow_init → escrow_funded
  → fiat_confirmed → payout_pending → payout_sent → completed`
- Publish evidence (kind 7302)
- View and send encrypted private messages (NIP-17 gift wrap)

The customer side (`src/pages/Dashboard.tsx`) now:
1. Generates a Lightning invoice before publishing the swap request
2. Publishes the swap request (kind 7300) to relays
3. Sends the invoice + payment instructions via NIP-17 gift wrap to the agent

This closes the loop: the customer's swap request reaches the agent's inbox,
and the encrypted invoice/bank details are delivered via the private lane.

## PIP-03: Dispute Policy

Disputes are modeled as kind 7303 events within the swap lifecycle.

### Dispute Classes

- payment not received
- payment amount mismatch
- payout not sent
- escrow funding failure
- timeout and abandonment

### Resolution Modes

- confirm customer claim
- confirm agent claim
- split outcome
- cancel and refund
- escalate to manual review

### Evidence Disclosure

Evidence defaults to reference-style publication (hashes, opaque pointers).
Raw payloads stay in the private message lane unless dispute policy requires
targeted disclosure.

## Lightning Wallet Integration

PontPay uses Nostr Wallet Connect (NIP-47) via `@getalby/sdk` for:
- Wallet balance queries
- BOLT11 invoice creation
- Lightning payment execution

WebLN browser extension detection and manual QR fallback are also supported.

## Security Considerations

- Agent definitions (kind 30360) are **public** and signed by the agent's
  Nostr identity — no escrow descriptor is required (in-person model)
- Swap state machine events (kinds 7300-7304) are **public** and immutable
- Sensitive payloads are exchanged via **NIP-17 Gift Wrap** (encrypted)
- Lightning payments settle with instant finality — Nostr is the messaging
  layer, not the settlement layer
- Users should verify agent identity via Nostr social proof (NIP-05,
  follower graph) before transacting
- In-person cash exchange carries inherent physical risk — meet in safe,
  public locations

## BTCPay Server Hub-and-Spoke Architecture

PontPay supports an optional Super Agent topology using BTCPay Server's
multi-tenancy and Greenfield API. This is an infrastructure overlay, not
a protocol change — it implements the PIP-01 `custodial_escrow` subtype.

### Roles

| Role | Description |
|------|-------------|
| Super Agent | Operates a BTCPay Server with a funded Lightning node. Creates stores, issues scoped API keys, provides liquidity and dispute resolution. |
| Local Agent | Connects to a Super Agent's server via a scoped API key. Creates hold invoices through the server without running their own infrastructure. |

### Escrow Descriptor (PIP-01 custodial_escrow)

When a Local Agent operates under a Super Agent, their escrow descriptor
declares `custodial_escrow` with the Super Agent's Nostr pubkey as:

- `custody_authority` — controls the escrow asset while the swap is active
- `release_authority` — may settle the hold invoice after fiat confirmation
- `refund_authority` — may cancel/refund in disputes (PIP-03)

### Swap Execution with BTCPay Hold Invoices

1. Customer initiates swap → swap request (kind 7300) published
2. Local Agent's app pings BTCPay Server (Greenfield API) → hold invoice generated
3. Customer pays the invoice → funds locked (BTCPay status: Processing)
4. Local Agent hands physical cash to customer
5. Local Agent settles the invoice via API → Bitcoin claimed
6. Swap transition (kind 7301) published: `lightning_settled`

### Dispute Resolution (PIP-03)

The Super Agent has total visibility on their BTCPay Server:
- Hold invoice funding timestamps
- Public Nostr transition logs signed by both parties
- Admin access to force-settle or cancel invoices

Acting as `refund_authority`, the Super Agent can resolve disputes by
manually settling or cancelling the hold invoice on their server.

### Greenfield API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/stores` | Super Agent creates a store for a local agent |
| `POST /api/v1/api-keys` | Super Agent generates a scoped API key |
| `POST /api/v1/stores/{id}/invoices` | Local agent creates a hold invoice |
| `GET /api/v1/stores/{id}/invoices/{id}` | Check invoice status |
| `POST /api/v1/stores/{id}/invoices/{id}/settle` | Settle (claim funds) |
| `POST /api/v1/stores/{id}/invoices/{id}/cancel` | Cancel (refund) |
