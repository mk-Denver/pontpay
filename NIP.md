# Pontmore Protocol — NIP

The **Pontmore Protocol** defines a Nostr-based communication layer for an
M-Pesa-style agent network that settles value over the Bitcoin Lightning
Network. All transaction requests, confirmations, and status updates are
securely transmitted and received via Nostr relays using encrypted
direct messages (NIP-17 / NIP-44) and a dedicated addressable kind for
agent registration.

## Kind 33939 — Pontmore Agent Registration (Addressable)

An agent publishes a kind `33939` event to register themselves on the
Pontmore agent network. The `d` tag is a unique agent identifier (slug).
Only the latest event per `pubkey + kind + d` is kept by relays.

### Tags

| Tag     | Required | Description                                                  |
|---------|----------|--------------------------------------------------------------|
| `d`     | yes      | Unique agent identifier (e.g. `agent-nairobi-001`)           |
| `name`  | yes      | Display name of the agent / agent booth                      |
| `t`     | yes      | `pontmore-agent` — enables relay-level discovery             |
| `t`     | no       | Additional category tags (e.g. `deposit`, `withdrawal`)      |
| `geo`   | no       | Human-readable location (e.g. `Nairobi, Kenya`)              |
| `currency` | no   | Fiat currencies the agent supports (repeatable)             |
| `rate`  | no       | Commission / spread as a percentage (e.g. `1.5`)             |
| `hours` | no       | Operating hours (e.g. `Mon-Sun 08:00-20:00`)                 |
| `phone` | no       | Contact phone number                                         |
| `lud16` | no       | Lightning address for direct Lightning payments              |
| `alt`   | yes      | NIP-31 human-readable description                            |

### Content

JSON object with extended agent metadata:

```json
{
  "bio": "Trusted Pontmore agent serving downtown Nairobi.",
  "currencies": ["KES", "USD", "UGX"],
  "minAmount": 1000,
  "maxAmount": 500000,
  "liquiditySats": 2500000,
  "verificationLevel": "verified"
}
```

### Querying

Agents are discoverable at the relay level:

```ts
nostr.query([{ kinds: [33939], '#t': ['pontmore-agent'], limit: 50 }]);
```

To fetch a specific agent's listing (e.g. for editing):

```ts
nostr.query([{
  kinds: [33939],
  authors: [agentPubkey],
  '#t': ['pontmore-agent'],
  limit: 1,
}]);
```

### Registration Flow

1. The agent fills out a registration form (name, location, currencies,
   commission rate, operating hours, contact info, Lightning address,
   transaction limits, and liquidity).
2. The client builds a kind 33939 event with the appropriate tags and a
   JSON `content` payload containing extended metadata.
3. The event is signed by the agent's Nostr identity and published to
   relays. It is immediately discoverable in the agent directory.
4. **Updating** — re-publishing with the same `d` tag replaces the
   previous event on relays (addressable semantics).
5. **Deletion** — a NIP-09 kind 5 event is published with an `a` tag
   referencing the addressable coordinate
   (`33939:<pubkey>:<d-identifier>`), signaling to relays and clients
   that the listing should be removed.

### Content Schema

```json
{
  "bio": "Trusted Pontmore agent serving downtown Nairobi.",
  "currencies": ["KES", "USD", "UGX"],
  "minAmount": 1000,
  "maxAmount": 500000,
  "liquiditySats": 2500000,
  "verificationLevel": "registered"
}
```

---

## Transaction Messages — NIP-17 Encrypted Direct Messages

Transaction requests, confirmations, and status updates are sent as
**NIP-17 gift-wrapped direct messages** (kinds 13/14/15). The plaintext
content (after NIP-44 decryption) is a JSON envelope following the
**Pontmore Message Schema** below.

Using NIP-17 ensures end-to-end encryption between the user and the
agent (or between two peers). The signer interface performs all
cryptographic operations — the app never touches private keys.

### Pontmore Message Schema

Every decrypted message content is a JSON object:

```json
{
  "pontmore": 1,
  "type": "deposit_request",
  "txId": "pm_abc123",
  "amountSats": 50000,
  "fiatAmount": 7500,
  "fiatCurrency": "KES",
  "bolt11": "lnbc500n1p...",
  "lnurl": "user@wallet.com",
  "status": "pending",
  "memo": "Deposit via agent booth Nairobi-001",
  "preimage": "abcdef...",
  "createdAt": 1719123456
}
```

### Message Types (`type` field)

| Type                  | Direction     | Description                                              |
|-----------------------|---------------|----------------------------------------------------------|
| `deposit_request`     | user → agent  | User requests to deposit fiat and receive BTC            |
| `deposit_confirm`     | agent → user  | Agent confirms deposit; includes BOLT11 invoice to pay   |
| `withdraw_request`    | user → agent  | User requests to withdraw BTC for fiat payout            |
| `withdraw_confirm`    | agent → user  | Agent confirms withdrawal; fiat disbursed, LN paid       |
| `transfer_request`    | user → peer   | P2P Lightning transfer request                           |
| `transfer_confirm`    | peer → user   | Peer confirms receipt of transfer                        |
| `status_update`       | either        | General status update (pending, confirmed, failed)       |

### Transaction Statuses (`status` field)

`pending` → `invoice_sent` → `payment_received` → `confirmed`
or → `failed` / `expired`

---

## NIP-57 Zaps (Reused)

Agent-to-agent and tip-style micro-transactions reuse standard NIP-57
zap receipts (kind 9735). No custom kind is needed for zaps.

## Security Considerations

- Transaction details are **encrypted** via NIP-44 gift wraps — relays
  cannot read payment metadata.
- Agent registration events (kind 33939) are **public** and signed by
  the agent's pubkey, providing proof of authorship.
- Users should verify agent identity via Nostr social proof (NIP-05,
  follower graph) before transacting.
- Lightning payments settle with instant finality on the Lightning
  Network — Nostr is the messaging layer, not the settlement layer.
