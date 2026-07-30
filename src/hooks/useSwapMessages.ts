/**
 * useSwapMessages — the NIP-17 private message lane for Pontmore swaps.
 *
 * Per PIP-02, sensitive payloads (Lightning invoices, bank details, payout
 * instructions, payment proofs) are exchanged via NIP-17 Gift Wrap (NIP-59),
 * NOT in the public swap state machine events.
 *
 * This hook provides:
 *   - sendSwapMessage()  — encrypt + gift-wrap a payload to a swap participant
 *   - useSwapMessages()  — query incoming gift wraps, unwrap, filter by swapId
 *
 * The rumor (kind 14) carries a structured JSON payload:
 *   { type, swapId, data, label?, createdAt }
 *
 * The `swap` tag on the rumor links it to the public swap request (kind 7300).
 */

import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import {
  wrapMessage,
  unwrapGiftWrap,
  type GiftWrapSigner,
} from '@/lib/giftwrap';
import type { NostrEvent } from '@nostrify/nostrify';

// ─── Payload types ───────────────────────────────────────────────

/** Types of sensitive payloads exchanged in the private lane. */
export type SwapPayloadType =
  | 'invoice'           // Lightning invoice (buy: customer receives BTC)
  | 'bank_details'      // Payout/payment instructions (sell: customer → agent)
  | 'payout_confirmation' // Agent confirms fiat payout sent
  | 'payment_proof'     // Proof of payment (receipt, tx hash, etc.)
  | 'message';          // Freeform operational note

/** Structured payload carried inside the encrypted rumor content. */
export interface SwapPayload {
  type: SwapPayloadType;
  swapId: string;
  data: string;
  label?: string;
  createdAt: number;
}

/** A decrypted swap message ready for display. */
export interface SwapMessage {
  id: string;
  swapId: string;
  senderPubkey: string;
  payload: SwapPayload;
  createdAt: number;
  /** The gift wrap event id (for dedup / reply threading). */
  giftWrapId: string;
}

// ─── Signer adapter ──────────────────────────────────────────────

/**
 * Adapt the NUser signer to the GiftWrapSigner interface.
 * NUser.signer has signEvent + nip44.{encrypt,decrypt} + pubkey getter.
 */
function getSigner(user: NonNullable<ReturnType<typeof useCurrentUser>['user']>): GiftWrapSigner | null {
  const signer = user.signer as unknown as {
    pubkey?: string;
    nip44?: {
      encrypt(peer: string, plaintext: string): Promise<string>;
      decrypt(peer: string, ciphertext: string): Promise<string>;
    };
    signEvent(t: { kind: number; content: string; tags: string[][]; created_at: number }): Promise<NostrEvent>;
  };

  if (!signer.nip44) {
    return null;
  }

  return {
    get pubkey() {
      return user.pubkey;
    },
    nip44: signer.nip44,
    signEvent: (t) => signer.signEvent(t),
  };
}

// ─── Hook ────────────────────────────────────────────────────────

export function useSwapMessages() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const signer = user ? getSigner(user) : null;

  /**
   * Send an encrypted swap payload to a participant via NIP-17 gift wrap.
   * Publishes two gift wraps: one to the recipient, one to self (archive).
   */
  const sendMessage = useMutation({
    mutationFn: async (params: {
      swapId: string;
      recipientPubkey: string;
      payloadType: SwapPayloadType;
      data: string;
      label?: string;
    }): Promise<void> => {
      if (!signer) throw new Error('Not logged in or signer lacks NIP-44 support');

      const payload: SwapPayload = {
        type: params.payloadType,
        swapId: params.swapId,
        data: params.data,
        label: params.label,
        createdAt: Math.floor(Date.now() / 1000),
      };

      const { toRecipient, toSelf } = await wrapMessage(signer, {
        recipientPubkey: params.recipientPubkey,
        kind: 14,
        content: JSON.stringify(payload),
        tags: [
          ['p', params.recipientPubkey],
          ['swap', params.swapId],
        ],
      });

      // Publish both wraps to the relay pool
      await nostr.event(toRecipient, { signal: AbortSignal.timeout(5000) });
      // Self-wrap is best-effort (archive copy)
      try {
        await nostr.event(toSelf, { signal: AbortSignal.timeout(5000) });
      } catch {
        // non-fatal
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pontmore', 'messages'] });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Failed to send private message',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  /**
   * Query all incoming gift wraps for the current user, unwrap them, and
   * filter to those carrying a swap payload. Optionally filter by swapId.
   *
   * NOTE: Gift wraps use random one-time keys, so we query by #p (recipient).
   * Relays with NIP-42 AUTH will only serve wraps where the requester is the
   * p-tagged recipient.
   */
  const useSwapInbox = (swapId?: string) =>
    useQuery<SwapMessage[], Error>({
      queryKey: ['pontmore', 'messages', 'inbox', user?.pubkey ?? '', swapId ?? ''],
      queryFn: async (c) => {
        if (!signer || !user) return [];

        // Query gift wraps addressed to us
        const wraps = await nostr.query(
          [{ kinds: [1059], '#p': [user.pubkey], limit: 100 }],
          { signal: c.signal },
        );

        const messages: SwapMessage[] = [];

        for (const wrap of wraps) {
          try {
            const unwrapped = await unwrapGiftWrap(signer, wrap);
            if (!unwrapped) continue;

            const { rumor, seal } = unwrapped;

            // Only care about kind 14 chat messages with a swap tag
            if (rumor.kind !== 14) continue;

            const swapTag = rumor.tags.find(([n]) => n === 'swap')?.[1];
            if (!swapTag) continue;

            // Filter by swapId if provided
            if (swapId && swapTag !== swapId) continue;

            let payload: SwapPayload;
            try {
              payload = JSON.parse(rumor.content);
            } catch {
              continue;
            }

            if (typeof payload.swapId !== 'string') continue;

            messages.push({
              id: seal.id + wrap.id,
              swapId: payload.swapId,
              senderPubkey: seal.pubkey,
              payload,
              createdAt: payload.createdAt ?? rumor.created_at,
              giftWrapId: wrap.id,
            });
          } catch {
            // Decryption failed for this wrap — skip it
            continue;
          }
        }

        // Sort newest first
        return messages.sort((a, b) => b.createdAt - a.createdAt);
      },
      enabled: !!user && !!signer,
      staleTime: 10_000,
      refetchInterval: 15_000,
    });

  return {
    sendMessage,
    useSwapInbox,
    /** Whether the current signer supports NIP-44 (required for private lane). */
    hasNip44: !!signer,
  };
}
