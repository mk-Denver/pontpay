/**
 * agentLink — generate and parse shareable agent links.
 *
 * An agent link encodes everything a customer needs to transact with a
 * specific agent without browsing the PontPay directory:
 *   - agent pubkey (npub)
 *   - offer d-tag (to fetch the NIP-69 offer)
 *   - escrow descriptor coordinate (30361:pubkey:dtag)
 *   - relay hint(s)
 *
 * Format: /swap?agent=<npub>&offer=<d-tag>&escrow=<a-coordinate>&relay=<url>
 *
 * The link opens a SwapLandingPage that auto-creates a Nostr identity
 * for new users and displays the agent's offer + escrow details.
 */

import { nip19 } from 'nostr-tools';

export interface AgentLinkParams {
  /** Agent's pubkey in npub format. */
  agentNpub: string;
  /** NIP-69 offer d-tag (e.g. "pontmore/swap@1:KES:sell"). */
  offerDTag: string;
  /** Escrow descriptor coordinate (e.g. "30361:pubkey:escrow"). */
  escrowCoordinate: string;
  /** Relay hints for fetching the agent's events. */
  relays: string[];
}

/** Encode agent link params into a shareable URL path. */
export function buildAgentLink(params: AgentLinkParams): string {
  const search = new URLSearchParams();
  search.set('agent', params.agentNpub);
  search.set('offer', params.offerDTag);
  search.set('escrow', params.escrowCoordinate);
  for (const relay of params.relays) {
    search.append('relay', relay);
  }
  return `/swap?${search.toString()}`;
}

/** Build a full shareable URL (e.g. for clipboard). */
export function buildFullAgentLink(params: AgentLinkParams): string {
  const path = buildAgentLink(params);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pontpay.app';
  return `${origin}${path}`;
}

/** Parse agent link params from a URLSearchParams object. */
export function parseAgentLink(search: URLSearchParams): AgentLinkParams | null {
  const agentNpub = search.get('agent');
  const offerDTag = search.get('offer');
  const escrowCoordinate = search.get('escrow');
  const relays = search.getAll('relay');

  if (!agentNpub || !offerDTag || !escrowCoordinate) return null;

  // Validate escrow coordinate format (kind:pubkey:dtag)
  if (!/^\d+:[a-f0-9]{64}:.+$/.test(escrowCoordinate)) return null;

  // Validate the npub
  try {
    const decoded = nip19.decode(agentNpub);
    if (decoded.type !== 'npub') return null;
  } catch {
    return null;
  }

  return { agentNpub, offerDTag, escrowCoordinate, relays };
}

/** Decode an agent npub to a hex pubkey. */
export function agentNpubToHex(npub: string): string | null {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type === 'npub') return decoded.data as string;
  } catch {
    // fall through
  }
  return null;
}
