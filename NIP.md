# PontPay — Pontmore Protocol Implementation

This document describes how PontPay implements the **Pontmore Protocol** —
a Nostr-native protocol family for agent identity, capability discovery,
escrow declaration, and swap lifecycle coordination.

**Canonical spec:** https://github.com/pontmore/protocol

## PIPs Implemented

| PIP | Title | Kind(s) | Status |
|-----|-------|---------|--------|
| PIP-00 | Agent Definition | 30360 | Implemented |
| PIP-01 | Escrow Descriptor | 30361 | Implemented |
| PIP-02 | Swap State Machine | 7300, 7301, 7302, 7303, 7304, 30362 | Implemented |
| PIP-03 | Dispute Policy | 7303 | Implemented (dispute events) |

## PIP-00: Agent Definition (kind 30360)

Agents publish a kind 30360 addressable event to register on the network.

- `d` tag: stable identifier (usually `agent`)
- `t` tag: `agent` for relay-level discovery
- `relay` tags: relay preferences (required)
- `a` tag: reference to the default escrow descriptor (kind 30361 coordinate)
- `f` tags: supported fiat currencies (recommended)
- Content: JSON with `version`, `name`, `about`, `capabilities`, `pricing_policy`, `escrow`, `updated_at`

### Discovery

```ts
nostr.query([{ kinds: [30360], '#t': ['agent'], limit: 100 }]);
```

### Registration Flow

1. Agent fills out registration form (name, capabilities, currencies, regions, limits)
2. Client publishes a companion escrow descriptor (kind 30361) first
3. Client publishes the agent definition (kind 30360) referencing the escrow via `a` tag
4. Updating: re-publish with same `d` tag (addressable replacement)
5. Deletion: NIP-09 kind 5 event with `a` tag referencing the coordinate

## PIP-01: Escrow Descriptor (kind 30361)

Public escrow declaration referenced by agent definitions and swaps.

- `d` tag: stable identifier (usually `default`)
- `network` tags: settlement networks for relay filtering
- Content: JSON with `version`, `escrow_type`, `networks`, `funding_rules`, `release_rules`, `dispute_rules`, `reference_format`, `updated_at`

### Supported Escrow Types

- `lightning_hold_invoice` — Lightning hold invoice as escrow lock
- `custodial_escrow` — Operator custody with network-specific implementations

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

`requested` → `escrow_init` → `escrow_funded` → `fiat_pending` → `fiat_confirmed` → `payout_pending` → `payout_sent` → `completed`

Branches: `cancelled`, `disputed`, `expired`

### Swap Request Content (kind 7300)

```json
{
  "version": 1,
  "swap_id": "pm_abc123",
  "swap_type": "deposit",
  "agent": "<agent_pubkey>",
  "customer": "<customer_pubkey>",
  "escrow_reference": "30361:<pubkey>:default",
  "fiat": { "currency": "KES", "amount": 7500 },
  "bitcoin": { "amount_sats": 50000, "network": "lightning" },
  "expiry": 1719127056
}
```

### Companion Private Message Lane

Per PIP-02, sensitive payloads (invoices, bank details, payout instructions)
are exchanged via NIP-17 Gift Wrap, NOT in public swap events. The private
lane is a companion channel — it does not replace the public state machine.

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

- Agent definitions (kind 30360) and escrow descriptors (kind 30361) are
  **public** and signed by the agent's Nostr identity
- Swap state machine events (kinds 7300-7304) are **public** and immutable
- Sensitive payloads are exchanged via **NIP-17 Gift Wrap** (encrypted)
- Lightning payments settle with instant finality — Nostr is the messaging
  layer, not the settlement layer
- Users should verify agent identity via Nostr social proof (NIP-05,
  follower graph) before transacting
