# PontPay — Pontmore Protocol Implementation

This document describes how PontPay implements the **Pontmore Protocol** —
a Nostr-native protocol family for agent identity, capability discovery,
escrow declaration, and swap lifecycle coordination.

**Canonical spec:** https://github.com/mk-Denver/protocol

## PIPs Implemented

| PIP | Title | Kind(s) | Status |
|-----|-------|---------|--------|
| PIP-00 | Agent Definition | 30360 | Implemented |
| PIP-01 | Escrow Descriptor | 30361 | Implemented (discovery + HTTP service connection) |
| PIP-02 | Swap State Machine | 7300, 7301, 7302, 7303, 7304, 30362 | Implemented |
| PIP-03 | Dispute Policy | 7303 | Implemented (dispute events) |

## PIP-00: Agent Definition (kind 30360)

Agents publish a kind 30360 addressable event to register on the network.

- `d` tag: stable identifier (usually `agent`)
- `t` tag: `agent` for relay-level discovery
- `a` tag: references the agent's escrow descriptor (`30361:<pubkey>:<d-tag>`) — **required**
- `relay` tags: relay preferences (required)
- `f` tags: supported fiat currencies (recommended)
- Content: JSON with `version`, `name`, `about`, `capabilities`, `pricing_policy`, `escrow`, `updated_at`

### Registration Flow

1. Agent fills out registration form (name, capabilities, currencies, regions, limits)
2. Client publishes a companion escrow descriptor (kind 30361) first
3. Client publishes the agent definition (kind 30360) with `a` tag referencing the escrow
4. Updating: re-publish with same `d` tag (addressable replacement)
5. Deletion: NIP-09 kind 5 event with `a` tag referencing the coordinate

### Discovery

```ts
nostr.query([{ kinds: [30360], '#t': ['agent'], limit: 100 }]);
```

Agent and escrow discovery refresh only when the user presses the Refresh button.

## PIP-01: Escrow Descriptor (kind 30361)

PontPay discovers escrow services published on Nostr and connects to them
via their HTTP service interface. Escrow is **required** for all swaps.

### Escrow Discovery

```ts
nostr.query([{ kinds: [30361], limit: 50 }]);
```

The `useEscrowDiscovery` hook queries the user's selected relays (managed by
a shared `RelaySelector` component used by both the Agents and Escrows pages).
Results refresh only on manual button press.

### Escrow Connection

When a user connects to a discovered escrow with a `service` block
(standalone-sufficient), PontPay:

1. Stores the connection (endpoint, schema_url, auth, operations, funding_model, release_decisions) in localStorage
2. Authenticates each HTTP request with NIP-98 (kind 27235) signed by the user's Nostr identity
3. Calls the escrow's HTTP API operations: `create`, `funding_instructions`, `fund_status`, `release`, `refund`, `cancel`

The `useEscrowConnection` hook provides the API client. NIP-98 auth events
are signed client-side via the Nostrify signer and never published — only
sent as the `Authorization: Nostr <base64>` header.

### Swap Execution with Escrow

**Buy BTC (fiat → BTC):**
1. Customer connects an escrow service and selects an agent
2. Customer calls `create` on the escrow → escrow instance created
3. Customer calls `funding_instructions` → Lightning invoice returned
4. Customer publishes swap request (kind 7300) with escrow reference
5. Customer sends invoice + fiat payment details via NIP-17 gift wrap
6. Agent confirms fiat received and settles the escrow
7. Bitcoin released to the customer's wallet

**Sell BTC (BTC → fiat):**
1. Customer connects an escrow service and selects an agent
2. Customer publishes swap request (kind 7300) with escrow reference
3. Customer sends payout details via NIP-17 gift wrap
4. Agent sends fiat to the customer's payout details
5. Escrow releases BTC to the agent on confirmation
6. Fiat arrives in the customer's account

## PIP-02: Swap State Machine

Swaps are modeled as Nostr-native state machines with an append-only event log.

### Event Types

| Kind | Type | Mutability | Purpose |
|------|------|------------|---------|
| 7300 | Swap Request | Immutable | Root event defining the requested trade |
| 7301 | Transition | Immutable | Append-only state advancement |
| 7302 | Evidence | Immutable | Payment proof, payout proof, etc. |
| 7303 | Dispute | Immutable | Dispute event (PIP-03) |
| 7304 | Note | Immutable | Optional human-readable operational note |
| 30362 | Snapshot | Addressable | Replaceable materialized view for fast lookup |

### Swap States

`requested` → `accepted` → `fiat_exchanged` → `lightning_settled` → `completed`

Both `fiat_exchanged` and `lightning_settled` must occur before `completed`.
The order depends on the swap type:

- **Buy** (fiat → BTC): `requested → accepted → fiat_exchanged → lightning_settled → completed`
- **Sell** (BTC → fiat): `requested → accepted → lightning_settled → fiat_exchanged → completed`

Branches: `cancelled`, `disputed`, `expired`

### Swap Request Content (kind 7300)

```json
{
  "version": 1,
  "swap_id": "pm_abc123",
  "swap_type": "buy",
  "agent": "<agent_pubkey>",
  "customer": "<customer_pubkey>",
  "escrow_reference": "<escrow_instance_id>",
  "fiat": { "currency": "KES", "amount": 7500 },
  "bitcoin": { "amount_sats": 50000, "network": "lightning" },
  "expiry": 1719127056
}
```

### Companion Private Message Lane

Per PIP-02, sensitive payloads (invoices, payout details) are exchanged via
NIP-17 Gift Wrap, NOT in public swap events.

#### Implementation

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
- `note` — Freeform operational note

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

## Security Considerations

- Agent definitions (kind 30360) are **public** and signed by the agent's
  Nostr identity. Each agent publishes a companion escrow descriptor (kind 30361)
  and references it via the `a` tag.
- Escrow connections require NIP-98 auth — the user's Nostr identity signs
  each HTTP request. Private keys never leave the browser.
- Swap state machine events (kinds 7300-7304) are **public** and immutable
- Sensitive payloads are exchanged via **NIP-17 Gift Wrap** (encrypted)
- Lightning payments settle with instant finality — Nostr is the messaging
  layer, not the settlement layer
- Users should verify agent identity via Nostr social proof (NIP-05,
  follower graph) before transacting
