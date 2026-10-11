# PontPay — Pontmore Protocol Implementation

This document describes how PontPay implements the **Pontmore Protocol** —
a Nostr-native protocol family for agent identity, capability discovery,
escrow declaration, and coordination lifecycle management.

**Canonical spec:** https://github.com/mk-Denver/protocol/tree/mk/nip69-offers-swap-v1

## PIPs Implemented

| PIP | Title | Kind(s) | Status |
|-----|-------|---------|--------|
| PIP-00 | Agent Definition | 30360 | Implemented (v2 content schema) |
| PIP-01 | Escrow Descriptor | 30361 | Implemented (v2 content with `expires_at`) |
| PIP-02 | Coordination Event Chains | 7300, 7301 | Implemented (content version 2) |
| pontmore/swap@1 | Bilateral Fiat/Bitcoin Swap Profile | 38383 (offers) | Implemented (experimental) |

## PIP-00: Agent Definition (kind 30360)

Agents publish a kind 30360 addressable event to register on the network.

- `d` tag: stable identifier (usually `agent`)
- `t` tag: `agent` for relay-level discovery
- `t` tag: `pontmore-capability:pontmore/swap@1` (one per declared capability)
- `a` tag: references the agent's escrow descriptor (`30361:<pubkey>:<d-tag>` with `escrow` marker)
- Content: JSON with `version` and `capabilities` (array of versioned capability identifiers)

```json
{
  "version": 1,
  "capabilities": ["pontmore/swap@1"]
}
```

Name and about belong in the standard Nostr profile event (kind 0), not in
the PIP-00 content. Relay declarations belong in the standard relay-list event.
Prices, margins, limits, and currencies belong in NIP-69 offers (kind 38383).

### Registration Flow

1. Agent fills out registration form (name, about, escrow config, offer config)
2. Client publishes a companion escrow descriptor (kind 30361) first
3. Client publishes the agent definition (kind 30360) with `a` tag referencing the escrow
4. Client publishes a NIP-69 offer (kind 38383) with price, currency, and payment channels
5. Client updates the kind 0 profile event with name/about
6. Updating: re-publish with same `d` tag (addressable replacement)
7. Deletion: NIP-09 kind 5 event with `a` tag referencing the coordinate

### Discovery

```ts
nostr.query([{ kinds: [30360], '#t': ['agent'], limit: 100 }]);
```

Agent and escrow discovery refresh only when the user presses the Refresh button.

## PIP-01: Escrow Descriptor (kind 30361)

PontPay discovers escrow services published on Nostr and connects to them
by resolving their service schema. Escrow is **required** for all coordinations.

### Descriptor Content (PIP-01 v2)

The kind 30361 content field MUST include:

| Field | Type | Description |
|-------|------|-------------|
| `version` | number | Protocol version (1) |
| `escrow_type` | string | `custodial_escrow`, `lightning_hold_invoice`, or `cashu_escrow` |
| `networks` | string[] | Lowercase network identifiers (`lightning`, `bitcoin`, `cashu`) |
| `expires_at` | number | Unix timestamp after which the descriptor cannot be selected |
| `service` | object (optional) | `{ schema: { type, url } }` — schema pointer |

Each value in `content.networks` also appears as a `t` tag: `pontmore-network:<network>`.

### Escrow Discovery

```ts
nostr.query([{ kinds: [30361], limit: 50 }]);
```

### Escrow Connection

When a user connects to a discovered escrow with a `service.schema` block:

1. PontPay fetches the referenced OpenAPI/AsyncAPI schema (with safety checks: `https://` only, size limits, timeouts, content-type verification)
2. Extracts the base endpoint URL from the schema (`servers[0].url`)
3. Stores the connection (endpoint, schemaType, schemaUrl) in localStorage
4. Authenticates each HTTP request with NIP-98 (kind 27235) signed by the user's Nostr identity
5. Calls the escrow's HTTP API operations: `create`, `funding_instructions`, `fund_status`, `release`, `refund`, `cancel`

The `useEscrowConnection` hook provides the API client. NIP-98 auth events
are signed client-side via the Nostrify signer and never published — only
sent as the `Authorization: Nostr <base64>` header.

## PIP-02: Coordination Event Chains (content version 2)

A coordination is a bounded, profile-defined process between identified
participants. It is represented by one immutable root event (kind 7300)
followed by append-only, cryptographically linked action events (kind 7301).

### Event Types

| Kind | Type | Mutability | Purpose |
|------|------|------------|---------|
| 7300 | Coordination Root | Immutable | Root event proposing the swap terms |
| 7301 | Coordination Action | Immutable | Append-only, linked by `prev` reference |

Kinds 7302, 7303, 7304, and 30362 from the earlier draft are NOT used in
version 2. Evidence is referenced by action `data.evidence`, disputes are
kernel actions (`core/open_dispute`, `core/resolve_dispute`).

### Coordination Root (kind 7300)

The root event ID is the `coordination_id`. Its signer is the proposing participant.

**Required tags:**
- `["p", "<pubkey>", "<relay-hint>", "<role>"]` — one per participant/authority
  - Roles: `swap/agent`, `swap/customer`, `core/escrow`, `core/resolver`
- `["e", "<descriptor-event-id>", "<relay-hint>", "escrow-version"]` — exact descriptor revision
- `["a", "30361:<publisher-pubkey>:<descriptor-d-tag>", "<relay-hint>", "escrow"]` — descriptor coordinate

**Content (version 2):**

```json
{
  "version": 2,
  "profile": "pontmore/swap@1",
  "terms": {
    "direction": "fiat_to_btc",
    "fiat": { "currency": "KES", "amount": "1000" },
    "bitcoin": { "amount": "60000", "unit": "sat", "network": "lightning" },
    "payment_channel": "mpesa-ke-kes@1",
    "deadlines": { "fiat_pay_by": 1780001800, "fiat_confirm_by": 1780003600 }
  },
  "expires_at": 1780000000
}
```

### Coordination Action (kind 7301)

Each action references the root and its predecessor:

- `["e", "<root-id>", "<relay-hint>", "root"]` — root reference
- `["e", "<prev-id>", "<relay-hint>", "prev"]` — predecessor (root for the first action)

**Content (version 2):**

```json
{
  "version": 2,
  "action": "core/accept"
}
```

Actions may include `data` with `payment_reference`, `evidence`, `class`,
`policy`, or `effect` depending on the action type.

### Kernel Actions (PIP-02 `core/` namespace)

| Action | Authorized signer | Preconditions |
|--------|-------------------|---------------|
| `core/accept` | Non-proposing participant | Before `expires_at` |
| `core/decline` | Non-proposing participant | Before acceptance |
| `core/secure` | `core/escrow` | Accepted |
| `core/authorize_settlement` | Fiat receiver | Valid `swap/fiat_confirmed` |
| `core/settle` | `core/escrow` | Settlement authorized |
| `core/authorize_refund` | Bitcoin provider | Secured, `fiat_pay_by` elapsed |
| `core/refund` | `core/escrow` | Refund authorized |
| `core/cancel` | Either participant | Before `core/secure` |
| `core/expire` | Either participant | Not accepted before `expires_at` |
| `core/open_dispute` | Either participant | Accepted, no terminal outcome |
| `core/resolve_dispute` | `core/resolver` | Disputed |

### Profile Actions (pontmore/swap@1)

| Action | Authorized signer | Preconditions |
|--------|-------------------|---------------|
| `swap/fiat_sent` | Fiat sender | Secured, before `fiat_pay_by` |
| `swap/fiat_confirmed` | Fiat receiver | Valid `swap/fiat_sent`, before `fiat_confirm_by` |

### Direction-Derived Roles

| Direction | Fiat sender | Fiat receiver | Bitcoin provider | Bitcoin recipient |
|-----------|-------------|---------------|------------------|-------------------|
| `fiat_to_btc` | `swap/customer` | `swap/agent` | `swap/agent` | `swap/customer` |
| `btc_to_fiat` | `swap/agent` | `swap/customer` | `swap/customer` | `swap/agent` |

### Normal Settlement History

```
proposed → core/accept → accepted → core/secure → secured
  → swap/fiat_sent → fiat_sent → swap/fiat_confirmed → fiat_confirmed
  → core/authorize_settlement → settlement_authorized → core/settle → settled
```

### No-Payment Refund History

```
secured → fiat_pay_by elapses without swap/fiat_sent
  → core/authorize_refund → refund_authorized → core/refund → refunded
```

### Chain Reconstruction

State is derived by replaying the validated root and actions. The `prev` link
establishes chain order — relay arrival order and timestamps do not. The
`reconstructActionChain` function follows the `prev` links from root to tip.
Forks (two actions with the same predecessor) freeze the coordination.

## NIP-69 Offers (kind 38383)

Standing swap offers are NIP-69 kind 38383 addressable events signed by the
`swap/agent` identity. They advertise a price and fiat-amount range for one
currency and direction.

### Offer Tags

| Tag | Value |
|-----|-------|
| `d` | `pontmore/swap@1:<fiat-currency>:<k>` |
| `k` | `sell` (fiat_to_btc) or `buy` (btc_to_fiat) |
| `f` | ISO 4217 fiat currency code |
| `s` | `pending` or `canceled` |
| `amt` | `0` (Bitcoin amount derived from price) |
| `fa` | minimum and maximum fiat amount |
| `pm` | payment method names |
| `network` | Bitcoin network |
| `layer` | settlement layer |
| `expires_at` | offer expiry timestamp |
| `y` | `pontmore` |
| `z` | `order` |
| `protocol` | `pontmore/swap@1` |
| `price` | exact fiat amount per BTC |
| `channels` | versioned payment-channel identifiers |
| `a` | escrow descriptor address with `escrow` marker |
| `p` | resolver pubkey with `core/resolver` marker (optional) |

Content MUST be empty. Payment instructions MUST NOT appear in the offer.

### Bitcoin Amount Derivation

```
bitcoin_amount = floor(fiat_amount × 100,000,000 ÷ price)
```

## Companion Private Message Lane

Sensitive payloads (invoices, payout details) are exchanged via NIP-17 Gift
Wrap, NOT in public coordination events.

### Implementation

The private lane is implemented in `src/lib/giftwrap.ts` (NIP-59 gift wrap
create/unwrap) and `src/hooks/useSwapMessages.ts` (send/receive swap payloads).

**Sending** (`useSwapMessages().sendMessage`):
1. Create a kind 14 rumor (unsigned) with a JSON `SwapPayload`
2. Seal it (kind 13) — encrypt the rumor to the recipient using NIP-44
3. Gift wrap it (kind 1059) — encrypt the seal with a random one-time key
4. Publish two wraps: one to the recipient, one to self (archive)

**Receiving** (`useSwapMessages().useSwapInbox`):
1. Query `kinds: [1059], '#p': [myPubkey]` (gift wraps addressed to us)
2. Unwrap each: decrypt outer → seal → rumor
3. Verify rumor.pubkey === seal.pubkey (NIP-17 anti-impersonation check)
4. Parse the JSON payload from the rumor content

**Payload types** (`SwapPayloadType`):
- `invoice` — Lightning invoice (BOLT11)
- `bank_details` — Fiat payment/payout instructions
- `payout_confirmation` — Agent confirms fiat payout sent
- `payment_proof` — Proof of payment
- `message` — Freeform operational note

## Lightning Wallet Integration

PontPay uses Nostr Wallet Connect (NIP-47) via `@getalby/sdk` for:
- Wallet balance queries
- BOLT11 invoice creation
- Lightning payment execution

## Security Considerations

- Agent definitions (kind 30360) are **public** and signed by the agent's
  Nostr identity. Each agent publishes a companion escrow descriptor (kind 30361)
  and references it via the `a` tag with `escrow` marker.
- Escrow connections require NIP-98 auth — the user's Nostr identity signs
  each HTTP request. Private keys never leave the browser. The escrow service
  endpoint is resolved from the referenced OpenAPI/AsyncAPI schema at connect
  time, with fetch safety checks per PIP-01.
- Coordination events (kinds 7300/7301) are **public** and immutable. The root
  binds the exact escrow descriptor revision; republishing or expiring the
  descriptor does not alter an existing coordination.
- Sensitive payloads are exchanged via **NIP-17 Gift Wrap** (encrypted)
- Lightning payments settle with instant finality — Nostr is the messaging
  layer, not the settlement layer
- Users should verify agent identity via Nostr social proof (NIP-05,
  follower graph) before transacting
- The `core/escrow` and `core/resolver` authority pubkeys are bound by the
  coordination root. Actions are validated against these bindings.
