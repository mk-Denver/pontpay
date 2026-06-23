# PontPay ⚡

**An M-Pesa-style agent network powered by Bitcoin Lightning and the Pontmore protocol.**

PontPay is a Nostr-native application that enables cross-border payments with ultra-low fees and instant finality. Users deposit fiat with local agents, receive Bitcoin in their Lightning wallet, send peer-to-peer transfers, and withdraw to fiat — all coordinated through encrypted Nostr messages and settled on the Lightning Network.

[![Edit with Shakespeare](https://shakespeare.diy/badge.svg)](https://shakespeare.diy/clone?url=https%3A%2F%2Fgithub.com%2FDenver-1st%2Fpontpay.git)

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Pontmore Protocol Implementation](#pontmore-protocol-implementation)
- [Wallet Options](#wallet-options)
- [Super Agent Hub-and-Spoke Architecture](#super-agent-hub-and-spoke-architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Security](#security)
- [License](#license)

---

## Overview

PontPay implements the [Pontmore Protocol](https://github.com/pontmore/protocol) — a Nostr-native protocol family for agent identity, capability discovery, escrow declaration, and swap lifecycle coordination.

The app functions as both:

1. **A standalone Bitcoin wallet** — send/receive ecash tokens, pay Lightning invoices, manage multiple Cashu mints, and track transaction history
2. **A Pontmore agent network client** — discover agents, register as an agent, initiate swaps (deposits, withdrawals, P2P transfers), and track swap state on Nostr

## How It Works

```
User                    Pontmore Protocol                  Agent
 │                          │                               │
 │  1. Swap request (kind 7300)                             │
 │ ────────────────────────► │ ──────────────────────────► │
 │                          │                               │
 │  2. Transition (kind 7301) — escrow init, funded, etc.  │
 │ ◄──────────────────────── │ ◄────────────────────────── │
 │                          │                               │
 │  3. Private lane (NIP-17 Gift Wrap) — invoices, bank     │
 │ ◄──────────────────────── │ ◄────────────────────────── │
 │                          │                               │
 │  4. Lightning payment settles                            │
 │ ═════════════════════════════════════════════════════► │
 │                          │                               │
 │  5. Snapshot (kind 30362) — completed                    │
 │ ◄──────────────────────── │ ◄────────────────────────── │
```

- **Nostr** is the messaging layer (public swap state machine + encrypted private lane)
- **Lightning Network** is the settlement layer (instant, low-fee Bitcoin payments)
- **Cashu** is the in-browser ecash layer (privacy-preserving, non-custodial)
- **BTCPay Server** is the optional infrastructure layer for Super Agent escrow

## Features

### Wallet
- **Native Cashu ecash wallet** — non-custodial, in-browser, BIP39 seed backup, multi-mint support
- **NWC Lightning wallet** — connect existing wallets (Alby, Mutiny, Zeus) via Nostr Wallet Connect (NIP-47)
- **Send ecash tokens** — generate shareable tokens with QR codes (offline, no Lightning needed)
- **Receive ecash tokens** — redeem tokens from any Cashu-compatible wallet
- **Pay Lightning invoices** — melt ecash tokens or pay directly via NWC
- **Receive via Lightning** — generate invoices with QR codes and auto-payment detection
- **Transaction history** — track all wallet activity (mint, melt, send, receive)
- **Mint management** — add/remove custom Cashu mints, view per-mint balances
- **Seed phrase backup** — 12-word BIP39 mnemonic, view and confirm backup
- **Wallet restore** — recover funds from a seed phrase

### Agent Network
- **Agent registration** (PIP-00) — publish your agent definition on Nostr (kind 30360)
- **Agent discovery** — browse the decentralized agent directory with search and currency filters
- **Escrow descriptors** (PIP-01) — declare escrow configurations (kind 30361)
- **Swap state machine** (PIP-02) — initiate deposits, withdrawals, and transfers as Nostr-native state machines
- **Swap lifecycle tracking** — immutable transition log, evidence events, and replaceable snapshots
- **Encrypted private lane** — sensitive payloads (invoices, bank details) sent via NIP-17 Gift Wrap
- **Agent inbox** — receive and respond to incoming swap requests

### Super Agent Hub-and-Spoke
- **BTCPay Server integration** — Super Agents operate a BTCPay Server with multi-tenancy
- **Store creation** — create dedicated stores for each Local Agent via the Greenfield API
- **Scoped API keys** — issue restricted API keys per store (create invoices, view status, settle)
- **Hold invoice escrow** — Lightning hold invoices lock funds during swaps (PIP-01 custodial_escrow)
- **Dispute resolution** — Super Agent has server visibility and admin override (PIP-03)
- **Payout methods** — local agents and users choose where Bitcoin is sent:
  - Lightning address (LNURL-pay resolution)
  - NWC wallet (direct Lightning payment)
  - Cashu ecash wallet (mint new tokens)

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
| Ecash (Cashu) | `@cashu/cashu-ts` v4 |
| BIP39 seeds | `@scure/bip39` |
| BTCPay Server | Greenfield REST API |
| State | TanStack Query |
| Routing | React Router 7 |
| Language | TypeScript 6 |
| Testing | Vitest + Testing Library |

## Pontmore Protocol Implementation

PontPay implements PIP-00 through PIP-03 from the [Pontmore Protocol spec](https://github.com/pontmore/protocol):

| PIP | Title | Kind(s) | Description |
|-----|-------|---------|-------------|
| PIP-00 | Agent Definition | 30360 | Public agent capability and discovery record |
| PIP-01 | Escrow Descriptor | 30361 | Public escrow declaration referenced by agents |
| PIP-02 | Swap State Machine | 7300, 7301, 7302, 7303, 7304, 30362 | Swap request, transitions, evidence, disputes, notes, snapshots |
| PIP-03 | Dispute Policy | 7303 | Dispute classes, timeout classes, resolution modes |

See [`NIP.md`](./NIP.md) for the full implementation documentation.

## Wallet Options

PontPay supports two wallet types, unified behind a single interface (`useUnifiedWallet`):

### 1. Native Cashu Ecash Wallet
- **Non-custodial** — you hold a BIP39 seed phrase, all proofs stored locally
- **Privacy** — Cashu blind signatures mean mints can't track transactions
- **Multi-mint** — spread risk across multiple mints
- **Offline transfers** — send ecash tokens without Lightning
- **No external app needed** — everything happens in the browser
- **Full transaction support** — send, receive, mint, melt using correct Cashu v4 API

**Cashu transaction flow:**
- **Send ecash:** `wallet.send(amount, proofs)` → `{ send, keep }` → encode token
- **Pay Lightning:** `createMeltQuote` → `send` → `meltProofs` → save change
- **Receive via Lightning:** `createMintQuote` → user pays → `checkMintQuote` → mint tokens
- **Receive ecash:** `getDecodedToken` → `wallet.receive(proofs)` → save to wallet

### 2. NWC Lightning Wallet
- **Connect existing wallets** — Alby Hub, Mutiny, Zeus, or any NWC-compatible wallet
- **Direct Lightning payments** — pay invoices from your remote wallet
- **NIP-47** — payment instructions sent over Nostr

Both wallet types work seamlessly with Pontmore swap flows — the unified interface abstracts the differences.

## Super Agent Hub-and-Spoke Architecture

PontPay supports an optional Super Agent topology using [BTCPay Server](https://btcpayserver.org)'s multi-tenancy and Greenfield API. This implements the PIP-01 `custodial_escrow` subtype.

```
                    ┌─────────────────────┐
                    │   Super Agent (Hub)  │
                    │   BTCPay Server      │
                    │   Lightning Node     │
                    │   ┌───┐ ┌───┐ ┌───┐ │
                    │   │S1 │ │S2 │ │S3 │ │  (Stores)
                    │   └───┘ └───┘ └───┘ │
                    │   ┌───┐ ┌───┐ ┌───┐ │
                    │   │K1 │ │K2 │ │K3 │ │  (Scoped API Keys)
                    │   └───┘ └───┘ └───┘ │
                    └─────┬───────┬───────┘
                          │       │
              ┌───────────┘       └───────────┐
              ▼                               ▼
     ┌────────────────┐              ┌────────────────┐
     │  Local Agent 1  │              │  Local Agent 2  │
     │  (Spoke)        │              │  (Spoke)        │
     │  API Key K1     │              │  API Key K2     │
     │  Payout: LN addr│              │  Payout: Cashu  │
     └────────────────┘              └────────────────┘
```

### Roles

| Role | Description |
|------|-------------|
| **Super Agent** | Operates a BTCPay Server with a funded Lightning node. Creates stores, issues scoped API keys, provides liquidity and dispute resolution. |
| **Local Agent** | Connects to a Super Agent's server via a scoped API key. Creates hold invoices through the server without running their own infrastructure. |

### Escrow (PIP-01 custodial_escrow)

The Super Agent's Nostr pubkey is declared as:
- `custody_authority` — controls the escrow asset while the swap is active
- `release_authority` — may settle the hold invoice after fiat confirmation
- `refund_authority` — may cancel/refund in disputes (PIP-03)

### Swap Execution with BTCPay Hold Invoices

1. Customer initiates swap → swap request (kind 7300) published
2. App pings BTCPay Greenfield API → hold invoice generated
3. Customer pays the invoice → funds locked (BTCPay status: Processing)
4. Local Agent hands physical cash to customer
5. Local Agent settles the invoice via API → Bitcoin claimed
6. Swap transition (kind 7301) published: `lightning_settled`
7. Bitcoin sent to the user's chosen payout destination

### Payout Methods

Local agents and users choose where Bitcoin is sent when a swap settles:

| Method | Description |
|--------|-------------|
| **Lightning Address** | Enter a Lightning address (e.g. `user@blink.sv`). Resolved via LNURL-pay. |
| **NWC Wallet** | Connect an existing Lightning wallet via Nostr Wallet Connect. |
| **Cashu Wallet** | Uses the native Cashu ecash wallet. Payouts minted as ecash tokens. |

### Greenfield API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/stores` | Super Agent creates a store for a local agent |
| `POST /api/v1/api-keys` | Super Agent generates a scoped API key |
| `POST /api/v1/stores/{id}/invoices` | Local agent creates a hold invoice |
| `GET /api/v1/stores/{id}/invoices/{id}` | Check invoice status |
| `POST /api/v1/stores/{id}/invoices/{id}/settle` | Settle (claim funds) |
| `POST /api/v1/stores/{id}/invoices/{id}/cancel` | Cancel (refund) |

## Project Structure

```
pontpay/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui primitives (48+ components)
│   │   ├── auth/            # Login components (LoginArea, AuthDialog)
│   │   ├── Navbar.tsx       # Shared navigation + layout
│   │   ├── WalletModal.tsx  # NWC wallet connection modal
│   │   └── ...
│   ├── hooks/
│   │   ├── useCashuWallet.ts        # Cashu ecash wallet (v4 API: send, receive, mint, melt)
│   │   ├── useUnifiedWallet.ts      # Unified interface (NWC + Cashu)
│   │   ├── useLightningWallet.ts    # NWC wallet (balance, invoices, payments)
│   │   ├── useSuperAgent.ts         # BTCPay hub-and-spoke (stores, API keys, hold invoices, payouts)
│   │   ├── useAgentRegistration.ts  # PIP-00 agent definition publishing
│   │   ├── useAgents.ts             # PIP-00 agent directory discovery
│   │   ├── useEscrowDescriptor.ts   # PIP-01 escrow descriptor publishing
│   │   ├── useSwapStateMachine.ts   # PIP-02 swap lifecycle (kinds 7300-7304, 30362)
│   │   ├── useCurrentUser.ts        # Nostr identity
│   │   ├── useNostrPublish.ts       # Nostr event publishing
│   │   └── ...
│   ├── pages/
│   │   ├── Index.tsx                # Landing page
│   │   ├── Dashboard.tsx            # Swap initiation (deposit, withdraw, transfer)
│   │   ├── WalletPage.tsx           # Full wallet UI (send, receive, history, settings)
│   │   ├── AgentsPage.tsx           # Agent discovery directory
│   │   ├── AgentRegistrationPage.tsx # Agent registration form (PIP-00/PIP-01)
│   │   ├── SuperAgentPage.tsx       # BTCPay Super Agent config + local agent onboarding
│   │   ├── TransactionsPage.tsx     # Swap history (PIP-02 state machine events)
│   │   └── NIP19Page.tsx            # NIP-19 identifier router
│   ├── lib/
│   │   ├── pontmore.ts              # Protocol types, parsers, helpers
│   │   └── btcpay.ts                # BTCPay Server Greenfield API client
│   ├── contexts/
│   │   ├── AppContext.ts            # App config (theme, relays, blossom)
│   │   └── NWCContext.tsx           # NWC provider context
│   ├── App.tsx                      # Root provider tree
│   └── AppRouter.tsx               # Route definitions
├── public/
│   ├── favicon.svg                  # Custom PontPay logo
│   └── manifest.webmanifest         # PWA manifest
├── NIP.md                           # Pontmore protocol implementation docs
├── railpack.json                    # Railway/Railpack deployment config
├── railway.json                     # Railway deploy settings
├── .nvmrc                           # Node.js version (22)
└── package.json
```

## Getting Started

### Prerequisites

- **Node.js 22+** (the project uses bleeding-edge dependencies)
- **npm** (comes with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/Denver-1st/pontpay.git
cd pontpay

# Install dependencies
npm install --legacy-peer-deps
```

> **Note:** `--legacy-peer-deps` is needed because React 19 is newer than some packages' peer dependency ranges.

### Development

```bash
# Start the dev server (http://localhost:5173)
npm run dev
```

The dev server automatically installs dependencies and starts Vite with hot module replacement.

### Build

```bash
# Production build (outputs to dist/)
npm run build
```

### Preview Production Build

```bash
# Serve the production build locally
npm run start
```

This serves the `dist/` folder on port 3000 (or the `PORT` environment variable) using the `serve` package with SPA mode.

### Run Tests

```bash
# Type check + lint + unit tests + build
npm run test
```

## Usage Guide

### 1. Log In
- Click **"Join"** in the top right
- Choose a login method: browser extension (NIP-07), nsec, or remote signer (NIP-46)

### 2. Set Up a Wallet
- Go to **Wallet** → choose **Native Ecash Wallet** or **Lightning Wallet (NWC)**
- For Cashu: click **Create new wallet**, back up your 12-word seed phrase
- For NWC: paste your `nostr+walletconnect://` connection URI from your wallet
- The wallet functions as a full standalone Bitcoin wallet with send, receive, history, and settings tabs

### 3. Find an Agent
- Go to **Agents** → browse the decentralized agent directory
- Filter by currency or search by name/region

### 4. Initiate a Swap
- Go to **Dashboard** → choose **Deposit**, **Withdraw**, or **Transfer**
- Select an agent, enter the amount, and publish the swap request
- The swap lifecycle is tracked on Nostr via the PIP-02 state machine

### 5. Register as an Agent
- Go to **Register** → fill out the agent registration form
- Declare your capabilities, currencies, regions, and escrow configuration
- Your listing becomes discoverable in the agent directory

### 6. Set Up Super Agent (Optional)
- Go to **Hub** → choose **Super Agent** or **Local Agent**
- Super Agent: enter your BTCPay Server URL and admin API key, create stores for local agents
- Local Agent: enter the Super Agent's server URL, API key, and store ID
- Choose your payout method: Lightning address, NWC wallet, or Cashu wallet

## Deployment

### Railway

The project includes `railpack.json`, `railway.json`, and `.nvmrc` for Railway deployment:

1. Go to [railway.app/new](https://railway.app/new)
2. Select the `Denver-1st/pontpay` GitHub repo
3. Railway auto-detects the config and builds with Node 22
4. Generate a domain in Settings → Networking

### Other Static Hosts

Since PontPay is a static SPA, it can be deployed to any static host:

```bash
# Build
npm run build

# Deploy the dist/ folder to:
# - Netlify (drag and drop dist/)
# - Vercel (vercel --prod)
# - Cloudflare Pages
# - GitHub Pages
# - Any static file server
```

## Security

- **Nostr private keys** are stored in `localStorage` — treat XSS as the top security concern
- **Cashu seed phrases** are stored in `localStorage` — back them up and keep them safe
- **NWC connection strings** contain a secret key — they stay in `localStorage` only
- **BTCPay API keys** are stored in `localStorage` — scoped keys limit exposure for local agents
- **Swap events** (kinds 7300-7304) are public and signed by your Nostr identity
- **Private payloads** (invoices, bank details) are sent via NIP-17 Gift Wrap (encrypted)
- **Agent definitions** (kind 30360) are public and signed by the agent's pubkey
- **Lightning payments** settle with instant finality — Nostr is the messaging layer, not the settlement layer
- **BTCPay hold invoices** lock funds in escrow — the Super Agent controls settlement/cancellation

Always verify agent identity via Nostr social proof (NIP-05, follower graph) before transacting.

## License

This project is open source. See the repository for details.

---

**Vibed with [Shakespeare](https://shakespeare.diy)** · Powered by [Pontmore Protocol](https://github.com/pontmore/protocol) · Built on Nostr &amp; Lightning
