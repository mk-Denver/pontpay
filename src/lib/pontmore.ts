/**
 * Pontmore Protocol — core type definitions and helpers.
 *
 * Implements PIP-00 (Agent Definition), PIP-01 (Escrow Descriptor),
 * PIP-02 (Swap State Machine), and PIP-03 (Dispute Policy).
 *
 * Spec: https://github.com/pontmore/protocol
 */

// ─── PIP-00: Agent Definition ───────────────────────────────────

/** Kind 30360 — public agent capability and discovery record (addressable). */
export const PONTMORE_AGENT_KIND = 30360;

/** Discovery tag for relay-level agent filtering. */
export const PONTMORE_AGENT_TAG = 'agent';

// ─── PIP-01: Escrow Descriptor ──────────────────────────────────

/** Kind 30361 — public escrow declaration (addressable). */
export const PONTMORE_ESCROW_KIND = 30361;

// ─── PIP-02: Swap State Machine ─────────────────────────────────

/** Kind 7300 — immutable swap request event. */
export const PONTMORE_SWAP_REQUEST_KIND = 7300;

/** Kind 7301 — immutable swap transition event. */
export const PONTMORE_SWAP_TRANSITION_KIND = 7301;

/** Kind 7302 — immutable swap evidence event. */
export const PONTMORE_SWAP_EVIDENCE_KIND = 7302;

/** Kind 7303 — immutable swap dispute event. */
export const PONTMORE_SWAP_DISPUTE_KIND = 7303;

/** Kind 7304 — immutable swap note event. */
export const PONTMORE_SWAP_NOTE_KIND = 7304;

/** Kind 30362 — replaceable swap snapshot (addressable). */
export const PONTMORE_SWAP_SNAPSHOT_KIND = 30362;

/** Current protocol version for content schemas. */
export const PONTMORE_VERSION = 1;

// ─── PIP-00: Agent Definition Types ─────────────────────────────

/** Structured agent metadata parsed from a kind 30360 event (PIP-00). */
export interface PontmoreAgent {
  event: {
    id: string;
    pubkey: string;
    kind: number;
    created_at: number;
  };
  d: string;
  /** Agent relays (from `relay` tags). */
  relays: string[];
  /** Reference to the default escrow descriptor (kind 30361 coordinate). */
  escrowRef: string;
  /** Supported fiat currencies (from `f` tags). */
  fiatCurrencies: string[];
  /** Operator or service URLs (from `r` tags). */
  serviceUrls: string[];
  // Content fields
  name: string;
  about: string;
  capabilities: AgentCapabilities;
  pricingPolicy: string;
  escrowSummary: string;
  updatedAt: number;
  /** Whether this is the current user's own listing. */
  isOwn?: boolean;
}

/** Capability surface from PIP-00 content schema. */
export interface AgentCapabilities {
  swapTypes: string[];
  fiatCurrencies: string[];
  paymentChannels: string[];
  settlementNetworks: string[];
  regions: string[];
  minAmount: number;
  maxAmount: number;
  pricingMargin?: string;
}

// ─── PIP-01: Escrow Descriptor Types ────────────────────────────

/** Structured escrow descriptor parsed from a kind 30361 event (PIP-01). */
export interface PontmoreEscrow {
  event: {
    id: string;
    pubkey: string;
    kind: number;
    created_at: number;
  };
  d: string;
  networks: string[];
  // Content fields
  version: number;
  escrowType: string;
  fundingRules: Record<string, string>;
  releaseRules: Record<string, string>;
  disputeRules: Record<string, string>;
  referenceFormat: string;
  updatedAt: number;
  // Subtype-specific fields
  invoiceNetwork?: string;
  payoutNetwork?: string;
  custodyAuthority?: string;
  releaseAuthority?: string;
  refundAuthority?: string;
}

// ─── PIP-02: Swap State Machine Types ───────────────────────────

/** Swap types supported by the Pontmore protocol. */
export type SwapType = 'deposit' | 'withdrawal' | 'transfer';

/**
 * Swap state lifecycle for in-person agent network (no escrow).
 *
 * Deposit (fiat → BTC):  requested → accepted → fiat_exchanged → lightning_settled → completed
 * Withdrawal (BTC → fiat): requested → accepted → lightning_settled → fiat_exchanged → completed
 *
 * Both fiat_exchanged and lightning_settled must occur before completed.
 * The order depends on the swap type but either can happen first in practice.
 */
export type SwapState =
  | 'requested'          // swap request published
  | 'accepted'           // agent accepted, meeting arranged
  | 'fiat_exchanged'     // cash changed hands in person
  | 'lightning_settled'  // Lightning payment confirmed
  | 'completed'          // swap fully completed
  | 'cancelled'          // swap cancelled
  | 'disputed'           // dispute raised
  | 'expired';           // swap expired

/** Immutable swap request content (kind 7300, PIP-02). */
export interface SwapRequestContent {
  version: number;
  swap_id: string;
  swap_type: SwapType;
  agent: string;        // agent pubkey
  customer: string;     // customer pubkey
  escrow_reference: string;
  fiat: {
    currency: string;
    amount: number;
    method?: string;
  };
  bitcoin: {
    amount_sats: number;
    network: string;
  };
  expiry: number;
}

/** Immutable swap transition content (kind 7301, PIP-02). */
export interface SwapTransitionContent {
  swap_id: string;
  state: SwapState;
  prev_state: SwapState;
  actor_role: 'agent' | 'customer' | 'system';
  reason: string;
  created_at: number;
}

/** Immutable swap evidence content (kind 7302, PIP-02). */
export interface SwapEvidenceContent {
  swap_id: string;
  evidence_type: string;
  reference: string;
  description?: string;
  created_at: number;
}

/** Replaceable swap snapshot content (kind 30362, PIP-02). */
export interface SwapSnapshotContent {
  swap_id: string;
  current_state: SwapState;
  agent: string;
  customer: string;
  swap_type: SwapType;
  bitcoin_amount_sats: number;
  fiat_amount: number;
  fiat_currency: string;
  escrow_reference: string;
  updated_at: number;
}

/** A materialized swap with its full event history. */
export interface PontmoreSwap {
  swapId: string;
  swapType: SwapType;
  state: SwapState;
  agentPubkey: string;
  customerPubkey: string;
  bitcoinAmountSats: number;
  fiatAmount: number;
  fiatCurrency: string;
  escrowReference: string;
  expiry: number;
  createdAt: number;
  updatedAt: number;
  requestEvent?: { id: string; pubkey: string; created_at: number };
  transitions: { state: SwapState; prevState: SwapState; actorRole: string; reason: string; createdAt: number; eventId: string }[];
  evidence: { type: string; reference: string; description?: string; createdAt: number; eventId: string }[];
  direction: 'outgoing' | 'incoming';
}

// ─── Helpers ────────────────────────────────────────────────────

/** Generate a unique swap id. */
export function generateSwapId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `pm_${time}${random}`;
}

/** Format satoshis into a human-readable string. */
export function formatSats(sats: number): string {
  if (sats >= 100_000_000) {
    return `${(sats / 100_000_000).toFixed(4)} BTC`;
  }
  if (sats >= 1000) {
    return `${sats.toLocaleString()} sats`;
  }
  return `${sats} sats`;
}

/** Approximate fiat conversion (display only — agents set the real rate). */
export function estimateFiat(sats: number, btcPriceUsd: number, currency: string): number {
  const usd = (sats / 100_000_000) * btcPriceUsd;
  const rates: Record<string, number> = {
    USD: 1, KES: 129, UGX: 3750, NGN: 1480, GHS: 12,
    TZS: 2530, RWF: 1280, EUR: 0.92, GBP: 0.79,
  };
  const rate = rates[currency] ?? 1;
  return Math.round(usd * rate);
}

// ─── PIP-00: Agent Parsing ──────────────────────────────────────

/** Validate that a Nostr event is a well-formed Pontmore agent definition (PIP-00). */
export function isPontmoreAgentEvent(event: { kind: number; tags: string[][] }): boolean {
  if (event.kind !== PONTMORE_AGENT_KIND) return false;
  const hasD = event.tags.some(([n]) => n === 'd');
  const hasTag = event.tags.some(([n, v]) => n === 't' && v === PONTMORE_AGENT_TAG);
  return Boolean(hasD && hasTag);
}

/** Parse a kind 30360 event into a structured PontmoreAgent (PIP-00). */
export function parsePontmoreAgent(event: {
  id: string;
  pubkey: string;
  kind: number;
  content: string;
  created_at: number;
  tags: string[][];
}): PontmoreAgent | null {
  if (!isPontmoreAgentEvent(event)) return null;

  const getTag = (name: string): string | undefined =>
    event.tags.find(([n]) => n === name)?.[1];

  const getAllTag = (name: string): string[] =>
    event.tags.filter(([n]) => n === name).map(([, v]) => v);

  // Parse content JSON
  let name = 'Unknown Agent';
  let about = '';
  let capabilities: AgentCapabilities = {
    swapTypes: [], fiatCurrencies: [], paymentChannels: [],
    settlementNetworks: [], regions: [], minAmount: 0, maxAmount: 0,
  };
  let pricingPolicy = '';
  let escrowSummary = '';
  let updatedAt = 0;

  try {
    const c = JSON.parse(event.content);
    if (c && typeof c === 'object') {
      name = typeof c.name === 'string' ? c.name : name;
      about = typeof c.about === 'string' ? c.about : about;
      pricingPolicy = typeof c.pricing_policy === 'string' ? c.pricing_policy : '';
      escrowSummary = typeof c.escrow === 'string' ? c.escrow : '';
      updatedAt = typeof c.updated_at === 'number' ? c.updated_at : 0;
      if (c.capabilities && typeof c.capabilities === 'object') {
        const cap = c.capabilities;
        capabilities = {
          swapTypes: Array.isArray(cap.swap_types) ? cap.swap_types : [],
          fiatCurrencies: Array.isArray(cap.fiat_currencies) ? cap.fiat_currencies : [],
          paymentChannels: Array.isArray(cap.payment_channels) ? cap.payment_channels : [],
          settlementNetworks: Array.isArray(cap.settlement_networks) ? cap.settlement_networks : [],
          regions: Array.isArray(cap.regions) ? cap.regions : [],
          minAmount: typeof cap.min_amount === 'number' ? cap.min_amount : 0,
          maxAmount: typeof cap.max_amount === 'number' ? cap.max_amount : 0,
          pricingMargin: typeof cap.pricing_margin === 'string' ? cap.pricing_margin : undefined,
        };
      }
    }
  } catch {
    // content may not be valid JSON
  }

  return {
    event: {
      id: event.id,
      pubkey: event.pubkey,
      kind: event.kind,
      created_at: event.created_at,
    },
    d: getTag('d') ?? 'agent',
    relays: getAllTag('relay'),
    escrowRef: getTag('a') ?? '',
    fiatCurrencies: getAllTag('f'),
    serviceUrls: getAllTag('r'),
    name,
    about,
    capabilities,
    pricingPolicy,
    escrowSummary,
    updatedAt,
  };
}

// ─── PIP-01: Escrow Parsing ─────────────────────────────────────

/** Parse a kind 30361 event into a structured PontmoreEscrow (PIP-01). */
export function parsePontmoreEscrow(event: {
  id: string;
  pubkey: string;
  kind: number;
  content: string;
  created_at: number;
  tags: string[][];
}): PontmoreEscrow | null {
  if (event.kind !== PONTMORE_ESCROW_KIND) return null;

  const getTag = (name: string): string | undefined =>
    event.tags.find(([n]) => n === name)?.[1];

  const getAllTag = (name: string): string[] =>
    event.tags.filter(([n]) => n === name).map(([, v]) => v);

  let version = 1;
  let escrowType = '';
  let networks: string[] = [];
  let fundingRules: Record<string, string> = {};
  let releaseRules: Record<string, string> = {};
  let disputeRules: Record<string, string> = {};
  let referenceFormat = '';
  let updatedAt = 0;
  let invoiceNetwork: string | undefined;
  let payoutNetwork: string | undefined;
  let custodyAuthority: string | undefined;
  let releaseAuthority: string | undefined;
  let refundAuthority: string | undefined;

  try {
    const c = JSON.parse(event.content);
    if (c && typeof c === 'object') {
      version = typeof c.version === 'number' ? c.version : 1;
      escrowType = typeof c.escrow_type === 'string' ? c.escrow_type : '';
      networks = Array.isArray(c.networks) ? c.networks : [];
      fundingRules = c.funding_rules ?? {};
      releaseRules = c.release_rules ?? {};
      disputeRules = c.dispute_rules ?? {};
      referenceFormat = typeof c.reference_format === 'string' ? c.reference_format : '';
      updatedAt = typeof c.updated_at === 'number' ? c.updated_at : 0;
      invoiceNetwork = typeof c.invoice_network === 'string' ? c.invoice_network : undefined;
      payoutNetwork = typeof c.payout_network === 'string' ? c.payout_network : undefined;
      custodyAuthority = typeof c.custody_authority === 'string' ? c.custody_authority : undefined;
      releaseAuthority = typeof c.release_authority === 'string' ? c.release_authority : undefined;
      refundAuthority = typeof c.refund_authority === 'string' ? c.refund_authority : undefined;
    }
  } catch {
    // content may not be valid JSON
  }

  // Fallback to tags for networks
  if (networks.length === 0) {
    networks = getAllTag('network');
  }

  return {
    event: {
      id: event.id,
      pubkey: event.pubkey,
      kind: event.kind,
      created_at: event.created_at,
    },
    d: getTag('d') ?? 'default',
    networks,
    version,
    escrowType,
    fundingRules,
    releaseRules,
    disputeRules,
    referenceFormat,
    updatedAt,
    invoiceNetwork,
    payoutNetwork,
    custodyAuthority,
    releaseAuthority,
    refundAuthority,
  };
}

// ─── PIP-02: Swap Parsing ───────────────────────────────────────

/** Parse a kind 7300 swap request event into structured content (PIP-02). */
export function parseSwapRequest(event: {
  content: string;
  tags: string[][];
}): SwapRequestContent | null {
  try {
    const c = JSON.parse(event.content);
    if (!c || typeof c !== 'object') return null;
    if (typeof c.swap_id !== 'string' || typeof c.swap_type !== 'string') return null;
    return c as SwapRequestContent;
  } catch {
    return null;
  }
}

/** Parse a kind 7301 transition event into structured content (PIP-02). */
export function parseSwapTransition(event: {
  content: string;
  tags: string[][];
}): SwapTransitionContent | null {
  try {
    const c = JSON.parse(event.content);
    if (!c || typeof c !== 'object') return null;
    if (typeof c.swap_id !== 'string' || typeof c.state !== 'string') return null;
    return c as SwapTransitionContent;
  } catch {
    return null;
  }
}

/** Parse a kind 7302 evidence event into structured content (PIP-02). */
export function parseSwapEvidence(event: {
  content: string;
}): SwapEvidenceContent | null {
  try {
    const c = JSON.parse(event.content);
    if (!c || typeof c !== 'object') return null;
    if (typeof c.swap_id !== 'string') return null;
    return c as SwapEvidenceContent;
  } catch {
    return null;
  }
}

/** Parse a kind 30362 snapshot event into structured content (PIP-02). */
export function parseSwapSnapshot(event: {
  content: string;
}): SwapSnapshotContent | null {
  try {
    const c = JSON.parse(event.content);
    if (!c || typeof c !== 'object') return null;
    if (typeof c.swap_id !== 'string') return null;
    return c as SwapSnapshotContent;
  } catch {
    return null;
  }
}

/** Build swap state machine events from raw Nostr events. */
export function buildSwapFromEvents(
  requestEvent: { id: string; pubkey: string; content: string; created_at: number },
  transitionEvents: { id: string; content: string; created_at: number }[],
  evidenceEvents: { id: string; content: string; created_at: number }[],
  myPubkey: string,
): PontmoreSwap | null {
  const request = parseSwapRequest(requestEvent);
  if (!request) return null;

  const transitions = transitionEvents
    .map((e) => {
      const t = parseSwapTransition(e);
      return t ? {
        state: t.state,
        prevState: t.prev_state,
        actorRole: t.actor_role,
        reason: t.reason,
        createdAt: t.created_at,
        eventId: e.id,
      } : null;
    })
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .sort((a, b) => a.createdAt - b.createdAt);

  const evidence = evidenceEvents
    .map((e) => {
      const ev = parseSwapEvidence(e);
      return ev ? {
        type: ev.evidence_type,
        reference: ev.reference,
        description: ev.description,
        createdAt: ev.created_at,
        eventId: e.id,
      } : null;
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const currentState = transitions.length > 0
    ? transitions[transitions.length - 1].state
    : 'requested';

  const direction = request.customer === myPubkey ? 'outgoing' : 'incoming';

  return {
    swapId: request.swap_id,
    swapType: request.swap_type,
    state: currentState,
    agentPubkey: request.agent,
    customerPubkey: request.customer,
    bitcoinAmountSats: request.bitcoin.amount_sats,
    fiatAmount: request.fiat.amount,
    fiatCurrency: request.fiat.currency,
    escrowReference: request.escrow_reference,
    expiry: request.expiry,
    createdAt: requestEvent.created_at,
    updatedAt: transitions.length > 0 ? transitions[transitions.length - 1].createdAt : requestEvent.created_at,
    requestEvent: { id: requestEvent.id, pubkey: requestEvent.pubkey, created_at: requestEvent.created_at },
    transitions,
    evidence,
    direction,
  };
}
