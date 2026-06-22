/**
 * Pontmore Protocol — core type definitions and helpers.
 *
 * The Pontmore protocol is a Nostr-based communication layer for an
 * M-Pesa-style agent network that settles value over the Bitcoin
 * Lightning Network. See NIP.md for the full specification.
 */

/** The Pontmore addressable agent-registration kind. */
export const PONTMORE_AGENT_KIND = 33939;

/** Category tag used for relay-level agent discovery. */
export const PONTMORE_AGENT_TAG = 'pontmore-agent';

/** Current Pontmore message schema version. */
export const PONTMORE_VERSION = 1;

/** Transaction message types exchanged via encrypted NIP-17 DMs. */
export type PontmoreMessageType =
  | 'deposit_request'
  | 'deposit_confirm'
  | 'withdraw_request'
  | 'withdraw_confirm'
  | 'transfer_request'
  | 'transfer_confirm'
  | 'status_update';

/** Transaction lifecycle statuses. */
export type PontmoreTxStatus =
  | 'pending'
  | 'invoice_sent'
  | 'payment_received'
  | 'confirmed'
  | 'failed'
  | 'expired';

/** The decrypted JSON envelope for all Pontmore transaction messages. */
export interface PontmoreMessage {
  pontmore: typeof PONTMORE_VERSION;
  type: PontmoreMessageType;
  txId: string;
  amountSats?: number;
  fiatAmount?: number;
  fiatCurrency?: string;
  bolt11?: string;
  lnurl?: string;
  status: PontmoreTxStatus;
  memo?: string;
  preimage?: string;
  createdAt: number;
}

/** Structured agent metadata parsed from a kind 33939 event. */
export interface PontmoreAgent {
  event: {
    id: string;
    pubkey: string;
    kind: number;
    created_at: number;
  };
  d: string;
  name: string;
  bio: string;
  geo: string;
  currencies: string[];
  rate: string;
  hours: string;
  phone: string;
  lud16: string;
  minAmount: number;
  maxAmount: number;
  liquiditySats: number;
  verificationLevel: string;
  categories: string[];
}

/** Generate a unique Pontmore transaction id. */
export function generateTxId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `pm_${time}${random}`;
}

/** Create a Pontmore message envelope. */
export function createPontmoreMessage(
  partial: Omit<PontmoreMessage, 'pontmore' | 'createdAt'> & {
    createdAt?: number;
  },
): PontmoreMessage {
  return {
    pontmore: PONTMORE_VERSION,
    createdAt: partial.createdAt ?? Math.floor(Date.now() / 1000),
    ...partial,
  };
}

/** Safely parse a Pontmore message from a decrypted string. */
export function parsePontmoreMessage(content: string): PontmoreMessage | null {
  try {
    const parsed = JSON.parse(content);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.pontmore === PONTMORE_VERSION &&
      typeof parsed.type === 'string' &&
      typeof parsed.txId === 'string' &&
      typeof parsed.status === 'string'
    ) {
      return parsed as PontmoreMessage;
    }
  } catch {
    // not JSON or malformed — ignore
  }
  return null;
}

/** Validate that a Nostr event is a well-formed Pontmore agent registration. */
export function isPontmoreAgentEvent(event: {
  kind: number;
  tags: string[][];
}): boolean {
  if (event.kind !== PONTMORE_AGENT_KIND) return false;
  const tags = event.tags;
  const hasD = tags.some(([n]) => n === 'd');
  const hasName = tags.some(([n]) => n === 'name');
  const hasCategory = tags.some(([n, v]) => n === 't' && v === PONTMORE_AGENT_TAG);
  return Boolean(hasD && hasName && hasCategory);
}

/** Parse a kind 33939 event into a structured PontmoreAgent object. */
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

  let bio = '';
  let minAmount = 0;
  let maxAmount = 0;
  let liquiditySats = 0;
  let verificationLevel = 'unverified';

  try {
    const content = JSON.parse(event.content);
    if (content && typeof content === 'object') {
      bio = typeof content.bio === 'string' ? content.bio : '';
      minAmount = typeof content.minAmount === 'number' ? content.minAmount : 0;
      maxAmount = typeof content.maxAmount === 'number' ? content.maxAmount : 0;
      liquiditySats =
        typeof content.liquiditySats === 'number' ? content.liquiditySats : 0;
      verificationLevel =
        typeof content.verificationLevel === 'string'
          ? content.verificationLevel
          : 'unverified';
    }
  } catch {
    // content may be empty or plain text
  }

  const currencies = getAllTag('currency');
  const contentCurrencies =
    (() => {
      try {
        const c = JSON.parse(event.content);
        return Array.isArray(c?.currencies) ? c.currencies : [];
      } catch {
        return [];
      }
    })();

  return {
    event: {
      id: event.id,
      pubkey: event.pubkey,
      kind: event.kind,
      created_at: event.created_at,
    },
    d: getTag('d') ?? '',
    name: getTag('name') ?? 'Unknown Agent',
    bio,
    geo: getTag('geo') ?? '',
    currencies: currencies.length > 0 ? currencies : contentCurrencies,
    rate: getTag('rate') ?? '0',
    hours: getTag('hours') ?? '',
    phone: getTag('phone') ?? '',
    lud16: getTag('lud16') ?? '',
    minAmount,
    maxAmount,
    liquiditySats,
    verificationLevel,
    categories: getAllTag('t').filter((t) => t !== PONTMORE_AGENT_TAG),
  };
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
  // Rough static conversion rates for display; real rates come from agents
  const rates: Record<string, number> = {
    USD: 1,
    KES: 129,
    UGX: 3750,
    NGN: 1480,
    GHS: 12,
    TZS: 2530,
    RWF: 1280,
    EUR: 0.92,
    GBP: 0.79,
  };
  const rate = rates[currency] ?? 1;
  return Math.round(usd * rate);
}
