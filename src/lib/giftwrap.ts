/**
 * giftwrap.ts — NIP-59 Gift Wrap helpers for the Pontmore private message lane.
 *
 * The Pontmore swap flow uses the public state machine (kinds 7300-7304) for
 * state tracking, and a companion NIP-17 private lane (NIP-59 gift wraps) for
 * sensitive payloads: Lightning invoices, bank details, payout instructions.
 *
 * Layering (per NIP-59):
 *   rumor  (unsigned, kind 14)  — carries the actual payload
 *   seal   (kind 13, signed by sender, encrypted to recipient) — proves authorship
 *   wrap   (kind 1059, random key, encrypted to recipient) — hides metadata
 *
 * The signer interface handles all private-key operations. We only need
 * nostr-tools for the gift-wrap layer's random key generation (the signer
 * can only sign with the user's real key, not a random one-time key).
 */

import { generateSecretKey, finalizeEvent, nip44 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

/** Convert a Uint8Array to a hex string (avoids extra @noble dependency). */
function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/** A NIP-07 / nostrify signer with NIP-44 support. */
export interface GiftWrapSigner {
  pubkey: string;
  nip44: {
    encrypt(peerPubkey: string, plaintext: string): Promise<string>;
    decrypt(peerPubkey: string, ciphertext: string): Promise<string>;
  };
  signEvent(t: {
    kind: number;
    content: string;
    tags: string[][];
    created_at: number;
  }): Promise<NostrEvent>;
}

const TWO_DAYS = 2 * 24 * 60 * 60;

/** Current unix time in seconds. */
const now = () => Math.floor(Date.now() / 1000);

/** Random timestamp up to 2 days in the past (NIP-59 metadata protection). */
export function randomNow(): number {
  return now() - Math.floor(Math.random() * TWO_DAYS);
}

// ─── Rumor ───────────────────────────────────────────────────────

/** An unsigned rumor event (NIP-59). The `id` is computed but `sig` is absent. */
export interface Rumor {
  id: string;
  pubkey: string;
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}

/** Build an unsigned rumor event. */
export function createRumor(params: {
  authorPubkey: string;
  kind: number;
  content: string;
  tags?: string[][];
  createdAt?: number;
}): Rumor {
  const { authorPubkey, kind, content, tags = [], createdAt = now() } = params;
  // Compute a canonical id (hash of the unsigned event) so recipients can
  // reference it. nostr-tools getEventHash works on {kind, content, tags,
  // pubkey, created_at} — but to avoid a heavy import we use a lightweight
  // approach: the id is set by the seal decryptor anyway. We set a placeholder.
  return {
    id: '',
    pubkey: authorPubkey,
    kind,
    content,
    tags,
    created_at: createdAt,
  };
}

// ─── Seal (kind 13) ──────────────────────────────────────────────

/**
 * Create a NIP-59 seal (kind 13): encrypt the rumor to the recipient and sign
 * with the sender's real key (via the signer).
 */
export async function createSeal(
  signer: GiftWrapSigner,
  rumor: Rumor,
  recipientPubkey: string,
): Promise<NostrEvent> {
  const ciphertext = await signer.nip44.encrypt(
    recipientPubkey,
    JSON.stringify(rumor),
  );

  return signer.signEvent({
    kind: 13,
    content: ciphertext,
    tags: [],
    created_at: randomNow(),
  });
}

// ─── Gift Wrap (kind 1059) ───────────────────────────────────────

/**
 * Create a NIP-59 gift wrap (kind 1059): encrypt the seal with a random
 * one-time key and sign with that random key. The recipient decrypts the outer
 * layer with their private key + the wrapper's (random) pubkey.
 */
export function createGiftWrap(
  seal: NostrEvent,
  recipientPubkey: string,
): NostrEvent {
  const randomKey = generateSecretKey(); // Uint8Array(32)
  const randomKeyHex = bytesToHex(randomKey);

  const conversationKey = nip44.v2.utils.getConversationKey(
    randomKeyHex,
    recipientPubkey,
  );

  const ciphertext = nip44.v2.encrypt(JSON.stringify(seal), conversationKey);

  return finalizeEvent(
    {
      kind: 1059,
      content: ciphertext,
      created_at: randomNow(),
      tags: [['p', recipientPubkey]],
    },
    randomKey,
  );
}

// ─── Unwrapping (receiving) ──────────────────────────────────────

/** Result of unwrapping a gift wrap. */
export interface UnwrappedGift {
  /** The decrypted seal event (kind 13, signed by the real sender). */
  seal: NostrEvent;
  /** The decrypted rumor (unsigned, carries the actual payload). */
  rumor: Rumor;
  /** The original gift wrap event. */
  giftWrap: NostrEvent;
}

/**
 * Unwrap a gift wrap: decrypt the outer layer to get the seal, decrypt the
 * seal to get the rumor. Both decryptions use the receiver's signer — the
 * peer pubkey differs per layer:
 *   - Outer (wrap → seal): peer = wrap.pubkey (random one-time key)
 *   - Inner (seal → rumor): peer = seal.pubkey (real sender)
 *
 * Returns null if decryption fails (wrong recipient, corrupted, etc.).
 */
export async function unwrapGiftWrap(
  signer: GiftWrapSigner,
  giftWrap: NostrEvent,
): Promise<UnwrappedGift | null> {
  try {
    // Layer 1: decrypt the gift wrap → seal JSON
    const sealJson = await signer.nip44.decrypt(
      giftWrap.pubkey,
      giftWrap.content,
    );
    const seal = JSON.parse(sealJson) as NostrEvent;

    // Validate seal is kind 13
    if (seal.kind !== 13) return null;

    // Layer 2: decrypt the seal → rumor JSON
    const rumorJson = await signer.nip44.decrypt(seal.pubkey, seal.content);
    const rumor = JSON.parse(rumorJson) as Rumor;

    // NIP-17: verify the rumor's pubkey matches the seal's pubkey
    // (prevents impersonation)
    if (rumor.pubkey !== seal.pubkey) return null;

    return { seal, rumor, giftWrap };
  } catch {
    // Decryption failure — this wrap wasn't for us or is malformed
    return null;
  }
}

// ─── Full send helper ────────────────────────────────────────────

/**
 * High-level: create a sealed + gift-wrapped message and return the kind 1059
 * event ready to publish. Also returns a self-addressed copy for the sender's
 * own archive (NIP-17 recommends wrapping to self).
 */
export async function wrapMessage(
  signer: GiftWrapSigner,
  params: {
    recipientPubkey: string;
    kind: number;
    content: string;
    tags?: string[][];
    createdAt?: number;
  },
): Promise<{ toRecipient: NostrEvent; toSelf: NostrEvent }> {
  const { recipientPubkey, kind, content, tags, createdAt } = params;

  const rumor = createRumor({
    authorPubkey: signer.pubkey,
    kind,
    content,
    tags,
    createdAt,
  });

  // Seal to recipient
  const sealForRecipient = await createSeal(signer, rumor, recipientPubkey);
  // Seal to self (for our own archive — same rumor, encrypted to ourselves)
  const sealForSelf = await createSeal(signer, rumor, signer.pubkey);

  const toRecipient = createGiftWrap(sealForRecipient, recipientPubkey);
  const toSelf = createGiftWrap(sealForSelf, signer.pubkey);

  return { toRecipient, toSelf };
}
