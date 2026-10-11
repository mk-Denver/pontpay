/**
 * Pontmore Protocol — core type definitions and helpers.
 *
 * Implements:
 *   PIP-00  (Agent Definition, kind 30360)
 *   PIP-01  (Escrow Descriptor, kind 30361)
 *   PIP-02  (Coordination Event Chains, kinds 7300/7301, content version 2)
 *   pontmore/swap@1 profile (bilateral fiat/Bitcoin swap, NIP-69 offers kind 38383)
 *
 * Spec: https://github.com/mk-Denver/protocol/tree/mk/nip69-offers-swap-v1
 */

// ─── PIP-00: Agent Definition ───────────────────────────────────

/** Kind 30360 — public agent capability and discovery record (addressable). */
export const PONTMORE_AGENT_KIND = 30360;

/** Discovery tag for relay-level agent filtering. */
export const PONTMORE_AGENT_TAG = 'agent';

// ─── PIP-01: Escrow Descriptor ──────────────────────────────────

/** Kind 30361 — public escrow declaration (addressable). */
export const PONTMORE_ESCROW_KIND = 30361;

// ─── PIP-02: Coordination Event Chains (version 2) ─────────────

/** Kind 7300 — immutable coordination root event. */
export const PONTMORE_COORDINATION_ROOT_KIND = 7300;

/** Kind 7301 — immutable coordination action event. */
export const PONTMORE_COORDINATION_ACTION_KIND = 7301;

/** PIP-02 content version for the generalized kernel. */
export const PONTMORE_PIP02_VERSION = 2;

// ─── pontmore/swap@1 profile ────────────────────────────────────

/** The coordination profile identifier for bilateral fiat/Bitcoin swaps. */
export const PONTMORE_SWAP_PROFILE = 'pontmore/swap@1';

/** NIP-69 offer event kind (peer-to-peer order). */
export const PONTMORE_OFFER_KIND = 38383;

/** Known escrow type identifiers (PIP-01). */
export const ESCROW_TYPES = ['lightning_hold_invoice', 'custodial_escrow', 'cashu_escrow'] as const;

// ─── PIP-00: Agent Definition Types ─────────────────────────────

/** Structured agent definition parsed from a kind 30360 event (PIP-00). */
export interface PontmoreAgent {
  event: {
    id: string;
    pubkey: string;
    kind: number;
    created_at: number;
  };
  /** d-tag stable identifier (usually "agent"). */
  d: string;
  /** Versioned capability identifiers from content.capabilities (e.g. ["pontmore/swap@1"]). */
  capabilities: string[];
  /** Escrow descriptor address from the `a` tag with "escrow" marker, if present. */
  escrowRef?: string;
  /** Relay hint from the escrow `a` tag, if present. */
  escrowRelayHint?: string;
  /** Whether this is the current user's own listing. */
  isOwn?: boolean;
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
  version: number;
  escrowType: string;
  networks: string[];
  /** Unix timestamp after which the descriptor cannot be selected for a new coordination. */
  expiresAt: number;
  /** Optional service schema pointer (PIP-01). */
  service?: PontmoreEscrowService;
}

/** The service block of a PIP-01 escrow descriptor (schema pointer only). */
export interface PontmoreEscrowService {
  schema: {
    type: string;
    url: string;
  };
}

// ─── PIP-02: Coordination Types ──────────────────────────────────

/** Swap direction (pontmore/swap@1 terms). */
export type SwapDirection = 'fiat_to_btc' | 'btc_to_fiat';

/** UI alias: buy = fiat_to_btc, sell = btc_to_fiat. */
export type SwapType = 'buy' | 'sell';

/** Map a UI swap type to the protocol direction. */
export function swapTypeToDirection(type: SwapType): SwapDirection {
  return type === 'buy' ? 'fiat_to_btc' : 'btc_to_fiat';
}

/** Map a protocol direction to the UI swap type. */
export function directionToSwapType(direction: SwapDirection): SwapType {
  return direction === 'fiat_to_btc' ? 'buy' : 'sell';
}

/** Derived coordination state from replaying the action chain. */
export type CoordinationState =
  | 'proposed'
  | 'accepted'
  | 'secured'
  | 'fiat_sent'
  | 'fiat_confirmed'
  | 'settlement_authorized'
  | 'settled'
  | 'refund_authorized'
  | 'refunded'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'disputed';

/** Terminal states — no further action is permitted. */
export const TERMINAL_STATES: CoordinationState[] = [
  'settled', 'refunded', 'declined', 'cancelled', 'expired',
];

/** Kernel action identifiers (PIP-02 `core/` namespace). */
export type KernelAction =
  | 'core/accept'
  | 'core/decline'
  | 'core/secure'
  | 'core/authorize_settlement'
  | 'core/settle'
  | 'core/authorize_refund'
  | 'core/refund'
  | 'core/cancel'
  | 'core/expire'
  | 'core/open_dispute'
  | 'core/resolve_dispute';

/** Profile action identifiers (pontmore/swap@1). */
export type SwapAction = 'swap/fiat_sent' | 'swap/fiat_confirmed';

/** All valid action identifiers. */
export type CoordinationActionId = KernelAction | SwapAction;

/** Dispute classes (pontmore/swap@1). */
export type DisputeClass =
  | 'fiat_not_received'
  | 'incorrect_fiat_amount'
  | 'payment_reference_invalid'
  | 'escrow_not_secured'
  | 'bitcoin_not_released'
  | 'conflicting_confirmation'
  | 'timeout';

/** Resolution effects (PIP-02 core/resolve_dispute). */
export type ResolutionEffect = 'resume' | 'authorize_settlement' | 'authorize_refund' | 'cancel';

/** Evidence reference object (PIP-02 kernel). */
export interface EvidenceRef {
  type: 'event' | 'commitment' | 'opaque';
  value: string;
}

/** A PIP-02 commitment object. */
export interface Commitment {
  algorithm: string;
  digest: string;
}

/** Swap terms (pontmore/swap@1 profile). */
export interface SwapTerms {
  direction: SwapDirection;
  fiat: {
    currency: string;
    amount: string;
  };
  bitcoin: {
    amount: string;
    unit: string;
    network: string;
  };
  payment_channel: string;
  deadlines: {
    fiat_pay_by: number;
    fiat_confirm_by: number;
  };
}

/** Coordination root content (kind 7300, PIP-02 version 2). */
export interface CoordinationRootContent {
  version: 2;
  profile: string;
  terms: SwapTerms;
  expires_at: number;
  commitments?: Record<string, Commitment>;
}

/** Coordination action content (kind 7301, PIP-02 version 2). */
export interface CoordinationActionContent {
  version: 2;
  action: string;
  data?: {
    payment_reference?: string;
    evidence?: EvidenceRef[];
    class?: string;
    policy?: string;
    effect?: ResolutionEffect;
  };
}

/** A participant bound by the coordination root. */
export interface CoordinationParticipant {
  pubkey: string;
  role: string;
  relayHint?: string;
}

/** A parsed coordination action in the chain. */
export interface CoordinationAction {
  eventId: string;
  pubkey: string;
  created_at: number;
  action: string;
  data?: CoordinationActionContent['data'];
  /** The predecessor event id (root for the first action, otherwise the preceding action). */
  prevEventId: string;
}

/** A materialized coordination with its full action history. */
export interface PontmoreCoordination {
  /** Root event id — the coordination identifier. */
  coordinationId: string;
  rootEvent: {
    id: string;
    pubkey: string;
    created_at: number;
  };
  profile: string;
  terms: SwapTerms;
  expiresAt: number;
  commitments?: Record<string, Commitment>;
  participants: CoordinationParticipant[];
  /** Exact descriptor event id from the `e` tag with "escrow-version" marker. */
  escrowDescriptorId: string;
  /** Descriptor coordinate from the `a` tag with "escrow" marker. */
  escrowDescriptorCoordinate: string;
  actions: CoordinationAction[];
  state: CoordinationState;
  /** Whether the coordination is in a disputed overlay state. */
  disputed: boolean;
  direction: 'outgoing' | 'incoming';
  /** UI convenience: swap type derived from direction. */
  swapType: SwapType;
}

/** A local coordination record for quick lookup (supplements relay queries). */
export interface LocalCoordinationRecord {
  coordinationId: string;
  swapType: SwapType;
  agentPubkey: string;
  customerPubkey: string;
  bitcoinAmount: string;
  fiatAmount: string;
  fiatCurrency: string;
  paymentChannel: string;
  state: CoordinationState;
  createdAt: number;
  updatedAt: number;
  direction: 'outgoing' | 'incoming';
  rootEventId?: string;
}

// ─── NIP-69 Offer Types ─────────────────────────────────────────

/** A parsed NIP-69 swap offer (kind 38383, pontmore/swap@1). */
export interface SwapOffer {
  event: {
    id: string;
    pubkey: string;
    kind: number;
    created_at: number;
  };
  d: string;
  /** NIP-69: sell (fiat_to_btc) or buy (btc_to_fiat). */
  k: 'sell' | 'buy';
  /** ISO 4217 fiat currency. */
  f: string;
  /** Status: pending or canceled. */
  s: 'pending' | 'canceled';
  /** NIP-69 amt — always "0" for Pontmore (Bitcoin amount derived from price). */
  amt: string;
  /** Fiat amount range [min, max]. */
  faMin: string;
  faMax: string;
  /** Payment method names. */
  pm: string[];
  /** Optional premium percentage. */
  premium?: string;
  /** Bitcoin network (mainnet, testnet, etc.). */
  network?: string;
  /** Settlement layer, matching terms.bitcoin.network. */
  layer?: string;
  /** Unix timestamp after which the offer is no longer selectable. */
  expiresAt?: number;
  /** Relay deletion timestamp (NIP-40). */
  expiration?: number;
  // Pontmore profile tags
  /** "pontmore/swap@1". */
  protocol: string;
  /** Exact fiat amount per BTC (decimal string). */
  price: string;
  /** Versioned payment-channel identifiers. */
  channels: string[];
  /** Escrow descriptor address. */
  escrowAddress: string;
  /** Resolver pubkey (optional). */
  resolverPubkey?: string;
}

// ─── Helpers ────────────────────────────────────────────────────

/** Format satoshis into a human-readable string. */
export function formatSats(sats: number | string): string {
  const n = typeof sats === 'string' ? parseInt(sats, 10) : sats;
  if (Number.isNaN(n)) return '0 sats';
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(4)} BTC`;
  if (n >= 1000) return `${n.toLocaleString()} sats`;
  return `${n} sats`;
}

/** Approximate fiat conversion (display only — agents set the real rate via offers). */
export function estimateFiat(sats: number, btcPriceUsd: number, currency: string): number {
  const usd = (sats / 100_000_000) * btcPriceUsd;
  const rates: Record<string, number> = {
    USD: 1, KES: 129, UGX: 3750, NGN: 1480, GHS: 12,
    TZS: 2530, RWF: 1280, EUR: 0.92, GBP: 0.79,
  };
  const rate = rates[currency] ?? 1;
  return Math.round(usd * rate);
}

/** Compute the Bitcoin amount (sats) from fiat amount and price (fiat per BTC). */
export function deriveBitcoinAmount(fiatAmount: string, price: string): string {
  const fiat = parseFloat(fiatAmount);
  const p = parseFloat(price);
  if (!fiat || !p || p <= 0) return '0';
  return Math.floor((fiat * 100_000_000) / p).toString();
}

/** Compute a sha256-bytes@1 commitment digest from arbitrary bytes. */
export async function sha256Commitment(bytes: Uint8Array): Promise<Commitment> {
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { algorithm: 'sha256-bytes@1', digest: `sha256:${hex}` };
}

/** Check whether an escrow descriptor is selectable (current and not expired). */
export function isDescriptorSelectable(escrow: PontmoreEscrow, now: number = Date.now() / 1000): boolean {
  return escrow.expiresAt > now;
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

  // Parse content JSON: { version, capabilities: [...] }
  let capabilities: string[] = [];
  try {
    const c = JSON.parse(event.content);
    if (c && typeof c === 'object' && Array.isArray(c.capabilities)) {
      capabilities = c.capabilities.filter((v: unknown): v is string => typeof v === 'string');
    }
  } catch {
    // content may not be valid JSON
  }

  // Extract escrow descriptor reference from `a` tag with "escrow" marker
  let escrowRef: string | undefined;
  let escrowRelayHint: string | undefined;
  for (const tag of event.tags) {
    if (tag[0] === 'a' && tag[3] === 'escrow') {
      escrowRef = tag[1];
      escrowRelayHint = tag[2] || undefined;
      break;
    }
  }

  // Fallback: an `a` tag starting with "30361:" without explicit marker
  if (!escrowRef) {
    const aTag = event.tags.find(([n, v]) => n === 'a' && v?.startsWith(`${PONTMORE_ESCROW_KIND}:`));
    if (aTag) {
      escrowRef = aTag[1];
      escrowRelayHint = aTag[2] || undefined;
    }
  }

  return {
    event: {
      id: event.id,
      pubkey: event.pubkey,
      kind: event.kind,
      created_at: event.created_at,
    },
    d: getTag('d') ?? 'agent',
    capabilities,
    escrowRef,
    escrowRelayHint,
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

  let version = 1;
  let escrowType = '';
  let networks: string[] = [];
  let expiresAt = 0;
  let service: PontmoreEscrowService | undefined;

  try {
    const c = JSON.parse(event.content);
    if (c && typeof c === 'object') {
      version = typeof c.version === 'number' ? c.version : 1;
      escrowType = typeof c.escrow_type === 'string' ? c.escrow_type : '';
      networks = Array.isArray(c.networks) ? c.networks.filter((v: unknown): v is string => typeof v === 'string') : [];
      expiresAt = typeof c.expires_at === 'number' ? c.expires_at : 0;

      if (c.service && typeof c.service === 'object' && c.service.schema) {
        const s = c.service.schema;
        service = {
          schema: {
            type: typeof s.type === 'string' ? s.type : '',
            url: typeof s.url === 'string' ? s.url : '',
          },
        };
      }
    }
  } catch {
    // content may not be valid JSON
  }

  // Fallback: extract networks from pontmore-network: tags
  if (networks.length === 0) {
    networks = event.tags
      .filter(([n, v]) => n === 't' && v?.startsWith('pontmore-network:'))
      .map(([, v]) => v.replace('pontmore-network:', ''));
  }

  return {
    event: {
      id: event.id,
      pubkey: event.pubkey,
      kind: event.kind,
      created_at: event.created_at,
    },
    d: getTag('d') ?? 'default',
    version,
    escrowType,
    networks,
    expiresAt,
    service,
  };
}

// ─── PIP-02: Coordination Parsing ──────────────────────────────

/** Parse a kind 7300 coordination root event into structured content (PIP-02 v2). */
export function parseCoordinationRoot(event: {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
}): CoordinationRootContent | null {
  try {
    const c = JSON.parse(event.content);
    if (!c || typeof c !== 'object') return null;
    if (c.version !== PONTMORE_PIP02_VERSION) return null;
    if (typeof c.profile !== 'string' || typeof c.terms !== 'object' || typeof c.expires_at !== 'number') return null;
    return c as CoordinationRootContent;
  } catch {
    return null;
  }
}

/** Parse a kind 7301 coordination action event into structured content (PIP-02 v2). */
export function parseCoordinationAction(event: {
  content: string;
}): CoordinationActionContent | null {
  try {
    const c = JSON.parse(event.content);
    if (!c || typeof c !== 'object') return null;
    if (c.version !== PONTMORE_PIP02_VERSION) return null;
    if (typeof c.action !== 'string') return null;
    return c as CoordinationActionContent;
  } catch {
    return null;
  }
}

/** Extract participants from a root event's `p` tags. */
export function extractParticipants(tags: string[][]): CoordinationParticipant[] {
  return tags
    .filter(([n]) => n === 'p')
    .map(([, pubkey, relayHint, role]) => ({
      pubkey,
      role: role ?? '',
      relayHint: relayHint || undefined,
    }));
}

/** Extract the escrow descriptor references from a root event's tags. */
export function extractEscrowRefs(tags: string[][]): {
  descriptorId: string;
  descriptorCoordinate: string;
} {
  let descriptorId = '';
  let descriptorCoordinate = '';

  for (const tag of tags) {
    if (tag[0] === 'e' && tag[3] === 'escrow-version') {
      descriptorId = tag[1];
    }
    if (tag[0] === 'a' && tag[3] === 'escrow') {
      descriptorCoordinate = tag[1];
    }
  }

  return { descriptorId, descriptorCoordinate };
}

/** Extract the root and predecessor references from an action event's tags. */
export function extractActionRefs(tags: string[][]): {
  rootId: string;
  prevId: string;
} {
  let rootId = '';
  let prevId = '';

  for (const tag of tags) {
    if (tag[0] === 'e' && tag[3] === 'root') {
      rootId = tag[1];
    }
    if (tag[0] === 'e' && tag[3] === 'prev') {
      prevId = tag[1];
    }
  }

  return { rootId, prevId };
}

// ─── Coordination State Machine ─────────────────────────────────

/**
 * Derive the coordination state by replaying the validated action chain.
 *
 * Implements the pontmore/swap@1 profile state reconstruction on top of the
 * PIP-02 kernel. The chain is linear (linked by `prev`), so we walk it in order
 * and derive each state transition.
 */
export function deriveCoordinationState(
  actions: CoordinationAction[],
  rootCreatedAt: number,
  rootExpiresAt: number,
): { state: CoordinationState; disputed: boolean } {
  let state: CoordinationState = 'proposed';
  let disputed = false;

  for (const action of actions) {
    switch (action.action) {
      case 'core/accept':
        state = 'accepted';
        break;
      case 'core/decline':
        state = 'declined';
        break;
      case 'core/secure':
        state = 'secured';
        break;
      case 'swap/fiat_sent':
        state = 'fiat_sent';
        break;
      case 'swap/fiat_confirmed':
        state = 'fiat_confirmed';
        break;
      case 'core/authorize_settlement':
        state = 'settlement_authorized';
        break;
      case 'core/settle':
        state = 'settled';
        break;
      case 'core/authorize_refund':
        state = 'refund_authorized';
        break;
      case 'core/refund':
        state = 'refunded';
        break;
      case 'core/cancel':
        state = 'cancelled';
        break;
      case 'core/expire':
        state = 'expired';
        break;
      case 'core/open_dispute':
        disputed = true;
        break;
      case 'core/resolve_dispute':
        if (action.data?.effect === 'resume') {
          disputed = false;
        } else if (action.data?.effect === 'authorize_settlement') {
          disputed = false;
          state = 'settlement_authorized';
        } else if (action.data?.effect === 'authorize_refund') {
          disputed = false;
          state = 'refund_authorized';
        } else if (action.data?.effect === 'cancel') {
          disputed = false;
          state = 'cancelled';
        }
        break;
    }

    // Stop processing once terminal (except for dispute resolution)
    if (TERMINAL_STATES.includes(state) && action.action !== 'core/resolve_dispute') {
      break;
    }
  }

  // Auto-expire if the root was never accepted past its expires_at
  if (state === 'proposed' && rootExpiresAt > 0 && Date.now() / 1000 > rootExpiresAt) {
    state = 'expired';
  }

  return { state, disputed };
}

/**
 * Reconstruct a linear action chain from a set of action events.
 *
 * Actions are linked by `prev` — the first action's predecessor is the root.
 * We build the chain by following the links from root → tip. If a fork is
 * detected (two actions with the same predecessor), both branches are retained
 * but the coordination is considered frozen.
 */
export function reconstructActionChain(
  rootEventId: string,
  actionEvents: { id: string; pubkey: string; content: string; created_at: number; tags: string[][] }[],
): { chain: CoordinationAction[]; forked: boolean } {
  // Parse and index actions by their prev reference
  const byPrev = new Map<string, CoordinationAction[]>();

  for (const evt of actionEvents) {
    const parsed = parseCoordinationAction(evt);
    if (!parsed) continue;

    const { rootId, prevId } = extractActionRefs(evt.tags);
    if (rootId !== rootEventId) continue;
    if (!prevId) continue;

    const action: CoordinationAction = {
      eventId: evt.id,
      pubkey: evt.pubkey,
      created_at: evt.created_at,
      action: parsed.action,
      data: parsed.data,
      prevEventId: prevId,
    };

    const arr = byPrev.get(prevId) ?? [];
    arr.push(action);
    byPrev.set(prevId, arr);
  }

  // Walk the chain from root
  const chain: CoordinationAction[] = [];
  let forked = false;
  let currentPrev = rootEventId;

  for (;;) {
    const candidates = byPrev.get(currentPrev);
    if (!candidates || candidates.length === 0) break;

    if (candidates.length > 1) {
      forked = true;
      // Keep the earliest by created_at as the canonical branch
      candidates.sort((a, b) => a.created_at - b.created_at);
    }

    const next = candidates[0];
    chain.push(next);
    currentPrev = next.eventId;
  }

  return { chain, forked };
}

/**
 * Build a materialized coordination from a root event and its action events.
 */
export function buildCoordinationFromEvents(
  rootEvent: { id: string; pubkey: string; content: string; created_at: number; tags: string[][] },
  actionEvents: { id: string; pubkey: string; content: string; created_at: number; tags: string[][] }[],
  myPubkey: string,
): PontmoreCoordination | null {
  const root = parseCoordinationRoot(rootEvent);
  if (!root) return null;

  const participants = extractParticipants(rootEvent.tags);
  const { descriptorId, descriptorCoordinate } = extractEscrowRefs(rootEvent.tags);
  const { chain, forked } = reconstructActionChain(rootEvent.id, actionEvents);

  // If forked, the coordination is frozen — derive state from the canonical branch
  const { state, disputed } = deriveCoordinationState(chain, rootEvent.created_at, root.expires_at);

  // Determine direction: if myPubkey is the proposer, it's outgoing (we proposed)
  const proposer = rootEvent.pubkey;
  const direction = proposer === myPubkey ? 'outgoing' : 'incoming';
  const swapType = directionToSwapType(root.terms.direction);

  return {
    coordinationId: rootEvent.id,
    rootEvent: {
      id: rootEvent.id,
      pubkey: rootEvent.pubkey,
      created_at: rootEvent.created_at,
    },
    profile: root.profile,
    terms: root.terms,
    expiresAt: root.expires_at,
    commitments: root.commitments,
    participants,
    escrowDescriptorId: descriptorId,
    escrowDescriptorCoordinate: descriptorCoordinate,
    actions: chain,
    state: forked ? 'disputed' : state,
    disputed: forked || disputed,
    direction,
    swapType,
  };
}

// ─── NIP-69 Offer Parsing ───────────────────────────────────────

/** Parse a kind 38383 NIP-69 offer event into a SwapOffer (pontmore/swap@1). */
export function parseSwapOffer(event: {
  id: string;
  pubkey: string;
  kind: number;
  content: string;
  created_at: number;
  tags: string[][];
}): SwapOffer | null {
  if (event.kind !== PONTMORE_OFFER_KIND) return null;

  const getTag = (name: string): string | undefined =>
    event.tags.find(([n]) => n === name)?.[1];

  const getAllTag = (name: string): string[] =>
    event.tags.filter(([n]) => n === name).map(([, v]) => v);

  const k = getTag('k');
  if (k !== 'sell' && k !== 'buy') return null;

  const fa = getAllTag('fa');
  const channels = getAllTag('channels');

  // Extract escrow `a` tag
  let escrowAddress = '';
  for (const tag of event.tags) {
    if (tag[0] === 'a' && tag[1]?.startsWith(`${PONTMORE_ESCROW_KIND}:`)) {
      escrowAddress = tag[1];
      break;
    }
  }

  // Extract resolver `p` tag
  let resolverPubkey: string | undefined;
  for (const tag of event.tags) {
    if (tag[0] === 'p' && tag[3] === 'core/resolver') {
      resolverPubkey = tag[1];
      break;
    }
  }

  const expiresAtStr = getTag('expires_at');
  const expirationStr = getTag('expiration');

  return {
    event: {
      id: event.id,
      pubkey: event.pubkey,
      kind: event.kind,
      created_at: event.created_at,
    },
    d: getTag('d') ?? '',
    k,
    f: getTag('f') ?? '',
    s: (getTag('s') as 'pending' | 'canceled') ?? 'pending',
    amt: getTag('amt') ?? '0',
    faMin: fa[0] ?? '0',
    faMax: fa[1] ?? fa[0] ?? '0',
    pm: getAllTag('pm'),
    premium: getTag('premium'),
    network: getTag('network'),
    layer: getTag('layer'),
    expiresAt: expiresAtStr ? parseInt(expiresAtStr, 10) : undefined,
    expiration: expirationStr ? parseInt(expirationStr, 10) : undefined,
    protocol: getTag('protocol') ?? '',
    price: getTag('price') ?? '0',
    channels,
    escrowAddress,
    resolverPubkey,
  };
}

// ─── Coordination Authorization Helpers ──────────────────────────

/** Get the pubkey bound to a role in a coordination. */
export function getParticipantByRole(
  participants: CoordinationParticipant[],
  role: string,
): string | undefined {
  return participants.find((p) => p.role === role)?.pubkey;
}

/** Check if a signer is authorized for a given kernel action (pontmore/swap@1). */
export function isAuthorizedSigner(
  action: string,
  signerPubkey: string,
  coordination: PontmoreCoordination,
): boolean {
  const { participants, terms } = coordination;
  const agent = getParticipantByRole(participants, 'swap/agent');
  const customer = getParticipantByRole(participants, 'swap/customer');
  const escrow = getParticipantByRole(participants, 'core/escrow');
  const resolver = getParticipantByRole(participants, 'core/resolver');
  const proposer = coordination.rootEvent.pubkey;

  // The non-proposing application participant is the accepter
  const accepter = proposer === agent ? customer : agent;

  // Direction-derived roles
  const isFiatToBtc = terms.direction === 'fiat_to_btc';
  const fiatSender = isFiatToBtc ? customer : agent;
  const fiatReceiver = isFiatToBtc ? agent : customer;
  const bitcoinProvider = isFiatToBtc ? agent : customer;

  switch (action) {
    case 'core/accept':
    case 'core/decline':
      return signerPubkey === accepter;

    case 'core/cancel':
      return signerPubkey === agent || signerPubkey === customer;

    case 'core/expire':
      return signerPubkey === agent || signerPubkey === customer;

    case 'core/secure':
    case 'core/settle':
    case 'core/refund':
      return signerPubkey === escrow;

    case 'core/authorize_settlement':
      return signerPubkey === fiatReceiver;

    case 'core/authorize_refund':
      return signerPubkey === bitcoinProvider;

    case 'core/open_dispute':
      return signerPubkey === agent || signerPubkey === customer;

    case 'core/resolve_dispute':
      return signerPubkey === resolver;

    case 'swap/fiat_sent':
      return signerPubkey === fiatSender;

    case 'swap/fiat_confirmed':
      return signerPubkey === fiatReceiver;

    default:
      return false;
  }
}
