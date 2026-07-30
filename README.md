# PontPay ⚡

**Swap Bitcoin for fiat online via the Pontmore agent network.**

PontPay is a Nostr-native application that enables online Bitcoin ↔ fiat swaps with ultra-low fees and instant finality. Users discover agents and escrow services on Nostr, initiate swaps secured by PIP-01 escrow, and settle on the Lightning Network — all coordinated through encrypted Nostr messages.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Pontmore Protocol Implementation](#pontmore-protocol-implementation)
- [Wallet](#wallet)
- [Escrow Discovery](#escrow-discovery)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Security](#security)
- [License](#license)

---

## Overview

PontPay implements the [Pontmore Protocol](https://github.com/mk-Denver/protocol) — a Nostr-native protocol family for agent identity, capability discovery, escrow declaration, and swap lifecycle coordination.

The app functions as a Pontmore agent network client:
- Discover agents (PIP-00) and escrow services (PIP-01) on Nostr
- Connect to an escrow service via its HTTP API (NIP-98 auth)
- Initiate swaps (buy/sell BTC) as Nostr-native state machines (PIP-02)
- Track swap lifecycle with immutable transition logs and encrypted private messages

## How It Works

```
User                    Pontmore Protocol                  Agent
 │                          │                               │
 │  1. Swap request (kind 7300) + escrow instance          │
 │ ────────────────────────► │ ──────────────────────────► │
 │                          │                               │
 │  2. Transition (kind 7301) — escrow funded, fiat sent    │
 │ ◄──────────────────────── │ ◄────────────────────────── │
 │                          │                               │
 │  3. Private lane (NIP-17 Gift Wrap) — invoices, payout   │
 │ ◄──────────────────────── │ ◄────────────────────────── │
 │                          │                               │
 │  4. Lightning payment settles + escrow releases          │
 │ ═════════════════════════════════════════════════════► │
 │                          │                               │
 │  5. Snapshot (kind 30362) — completed                    │
 │ ◄──────────────────────── │ ◄────────────────────────── │
```

- **Nostr** is the messaging layer (public swap state machine + encrypted private lane)
- **Lightning Network** is the settlement layer (instant, low-fee Bitcoin payments)
- **Escrow** (PIP-01) secures every swap — funds are held until conditions are met
- **NIP-98** authenticates the user's identity to the escrow HTTP API

## Features

### Agent Network
- **Agent registration** (PIP-00) — publish your agent definition on Nostr (kind 30360) with companion escrow descriptor (kind 30361)
- **Agent discovery** — browse the decentralized agent directory with search and currency filters
- **Escrow discovery** (PIP-01) — discover escrow services published on Nostr and connect to them
- **Escrow connection** — connect to a standalone-sufficient escrow via its HTTP API (NIP-98 auth)
- **Swap state machine** (PIP-02) — initiate buy/sell swaps as Nostr-native state machines
- **Swap lifecycle tracking** — immutable transition log, evidence events, and replaceable snapshots
- **Encrypted private lane** — sensitive payloads (invoices, payout details) sent via NIP-17 Gift Wrap
- **Agent inbox** — receive and respond to incoming swap requests
- **Relay selector** — choose which relays to query for agents and escrows (shared, manual refresh)

### Wallet
- **NWC Lightning wallet** — connect existing wallets (Alby, Mutiny, Zeus) via Nostr Wallet Connect (NIP-47)
- **Pay Lightning invoices** — pay directly via NWC
- **Receive via Lightning** — generate invoices with QR codes

### General
- **Nostr identity login** — signup, extension, nsec, or remote signer (NIP-46)
- **Responsive design** — works on mobile, tablet, and desktop
- **PWA-ready** — installable on any device

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + Vite 8 |
| Styling | TailwindCSS 4 + shadcn/ui |
| Nostr | Nostrify (`@nostrify/react`) + nostr-tools |
| Lightning (NWC) | `@getalby/sdk` (NIP-47) |
| State | TanStack Query |
| Routing | React Router 7 |
| Language | TypeScript 6 |
| Testing | Vitest + Testing Library |

## Pontmore Protocol Implementation

PontPay implements PIP-00 through PIP-03 from the [Pontmore Protocol spec](https://github.com/mk-Denver/protocol):

| PIP | Title | Kind(s) | Description |
|-----|-------|---------|-------------|
| PIP-00 | Agent Definition | 30360 | Public agent capability and discovery record (with `a` tag referencing escrow) |
| PIP-01 | Escrow Descriptor | 30361 | Escrow discovery, HTTP service connection via NIP-98 |
| PIP-02 | Swap State Machine | 7300, 7301, 7302, 7303, 7304, 30362 | Swap request, transitions, evidence, disputes, notes, snapshots |
| PIP-03 | Dispute Policy | 7303 | Dispute classes, timeout classes, resolution modes |

See [`NIP.md`](./NIP.md) for the full implementation documentation.

## Wallet

PontPay uses Nostr Wallet Connect (NIP-47) via `@getalby/sdk`:
- Connect existing Lightning wallets (Alby Hub, Mutiny, Zeus, or any NWC-compatible wallet)
- Pay BOLT11 invoices directly from your remote wallet
- Generate invoices to receive sats
- Balance queries and refresh

## Escrow Discovery

PontPay discovers escrow services published on Nostr (kind 30361 events). Users can:

1. **Browse escrows** — the Escrows page lists all discovered descriptors, showing which have standalone HTTP service blocks
2. **Select relays** — a shared relay selector (used by both Agents and Escrows pages) lets users choose which relays to query
3. **Connect** — clicking Connect on a standalone-sufficient escrow stores the connection in localStorage
4. **Swap** — once connected, all swap requests use that escrow's HTTP API for custody and settlement

Escrow HTTP API calls are authenticated with NIP-98 (kind 27235) — the user's Nostr identity signs each request. Private keys never leave the browser.

## Project Structure

```
pontpay/
├── src/
│   ├── components/
│   │   ├── ui/                    # shadcn/ui primitives
│   │   ├── auth/                  # Login components
│   │   ├── Navbar.tsx             # Shared navigation + layout
│   │   ├── RelaySelector.tsx      # Shared relay selector for agents + escrows
│   │   └── ...
│   ├── hooks/
│   │   ├── useUnifiedWallet.ts     # NWC wallet interface
│   │   ├── useLightningWallet.ts   # NWC wallet (balance, invoices, payments)
│   │   ├── useAgentRegistration.ts # PIP-00 agent definition + escrow descriptor publishing
│   │   ├── useAgents.ts            # PIP-00 agent directory discovery
│   │   ├── useEscrowDiscovery.ts   # PIP-01 escrow discovery from Nostr
│   │   ├── useEscrowConnection.ts  # PIP-01 escrow HTTP API client (NIP-98 auth)
│   │   ├── useSwapStateMachine.ts  # PIP-02 swap lifecycle
│   │   ├── useSwapMessages.ts      # NIP-17 gift wrap private lane
│   │   ├── useCurrentUser.ts       # Nostr identity
│   │   └── ...
│   ├── pages/
│   │   ├── Index.tsx               # Landing page
│   │   ├── Dashboard.tsx           # Swap initiation (buy/sell BTC)
│   │   ├── WalletPage.tsx          # NWC wallet UI (send, receive)
│   │   ├── AgentsPage.tsx          # Agent discovery directory
│   │   ├── AgentRegistrationPage.tsx # Agent registration form
│   │   ├── EscrowPage.tsx          # Escrow discovery + connection
│   │   ├── TransactionsPage.tsx    # Swap history
│   │   └── ...
│   ├── lib/
│   │   ├── pontmore.ts             # Protocol types, parsers, helpers
│   │   └── ...
│   ├── contexts/
│   │   └── NWCContext.tsx           # NWC provider context
│   └── AppRouter.tsx               # Route definitions
├── NIP.md                           # Pontmore protocol implementation docs
└── package.json
```

## Getting Started

### Prerequisites

- **Node.js 22+**

### Installation

```bash
git clone https://github.com/mk-Denver/pontpay.git
cd pontpay
npm install --legacy-peer-deps
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Run Tests

```bash
npm run test
```

## Usage Guide

### 1. Log In
- Click **"Join"** → choose: browser extension (NIP-07), nsec, or remote signer (NIP-46)

### 2. Connect a Wallet
- Go to **Wallet** → paste your `nostr+walletconnect://` connection URI

### 3. Connect an Escrow
- Go to **Escrows** → browse discovered escrow services → click **Connect** on one with a service endpoint

### 4. Find an Agent
- Go to **Agents** → browse the decentralized agent directory → filter by currency or search

### 5. Initiate a Swap
- Go to **Dashboard** → choose **Buy BTC** or **Sell BTC**
- Select an agent, enter the amount, provide payout details → publish the swap request

### 6. Register as an Agent
- Go to **Register** → fill out the agent registration form
- Your listing becomes discoverable in the agent directory with a companion escrow descriptor

## Deployment

### Railway

The project includes `railpack.json`, `railway.json`, and `.nvmrc` for Railway deployment.

### Other Static Hosts

```bash
npm run build
# Deploy the dist/ folder to Netlify, Vercel, Cloudflare Pages, etc.
```

## Security

- **Nostr private keys** are stored in `localStorage` — treat XSS as the top security concern
- **NWC connection strings** contain a secret key — they stay in `localStorage` only
- **Swap events** (kinds 7300-7304) are public and signed by your Nostr identity
- **Private payloads** (invoices, payout details) are sent via NIP-17 Gift Wrap (encrypted)
- **Escrow API calls** are authenticated with NIP-98 — signed client-side, never published
- **Lightning payments** settle with instant finality

Always verify agent identity via Nostr social proof (NIP-05, follower graph) before transacting.

## License

This project is open source. See the repository for details.

---

Powered by [Pontmore Protocol](https://github.com/mk-Denver/protocol) · Built on Nostr &amp; Lightning
