/**
 * useSwapStateMachine — implements the PIP-02 swap lifecycle.
 *
 * Swaps are modeled as Nostr-native state machines with:
 * - kind 7300: immutable swap request (the root event)
 * - kind 7301: immutable transition events (append-only state log)
 * - kind 7302: immutable evidence events (payment proof, payout proof, etc.)
 * - kind 7303: immutable dispute events
 * - kind 7304: immutable note events
 * - kind 30362: replaceable snapshot (materialized view for fast lookup)
 *
 * Sensitive payloads (invoices, bank details) are sent via the companion
 * private message lane (NIP-17 Gift Wrap), NOT in the public swap events.
 */

import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import {
  PONTMORE_SWAP_REQUEST_KIND,
  PONTMORE_SWAP_TRANSITION_KIND,
  PONTMORE_SWAP_EVIDENCE_KIND,
  PONTMORE_SWAP_NOTE_KIND,
  PONTMORE_SWAP_SNAPSHOT_KIND,
  generateSwapId,
  buildSwapFromEvents,
  parseSwapSnapshot,
  parseSwapRequest,
  parseSwapTransition,
  type SwapType,
  type SwapState,
  type SwapRequestContent,
  type SwapTransitionContent,
  type SwapEvidenceContent,
  type SwapSnapshotContent,
  type PontmoreSwap,
} from '@/lib/pontmore';
import type { NostrEvent } from '@nostrify/nostrify';

/** A local swap record for quick lookup (supplements the snapshot). */
export interface LocalSwapRecord {
  swapId: string;
  swapType: SwapType;
  agentPubkey: string;
  customerPubkey: string;
  amountSats: number;
  fiatAmount: number;
  fiatCurrency: string;
  escrowReference: string;
  state: SwapState;
  createdAt: number;
  updatedAt: number;
  direction: 'outgoing' | 'incoming';
  requestId?: string;
}

export function useSwapStateMachine() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const myPubkey = user?.pubkey;

  // Local ledger of swap IDs we've initiated or seen
  const [localSwaps, setLocalSwaps] = useLocalStorage<LocalSwapRecord[]>(
    'pontmore-swaps',
    [],
  );

  /** Upsert a local swap record. */
  const upsertLocalSwap = useCallback((record: LocalSwapRecord) => {
    setLocalSwaps((prev) => {
      const idx = prev.findIndex((s) => s.swapId === record.swapId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...record, updatedAt: record.updatedAt };
        return updated;
      }
      return [record, ...prev];
    });
  }, [setLocalSwaps]);

  /**
   * Publish a swap request (kind 7300) — the immutable root event.
   * This initiates a buy or sell swap.
   */
  const publishSwapRequest = useMutation({
    mutationFn: async (params: {
      swapType: SwapType;
      agentPubkey: string;
      amountSats: number;
      fiatAmount: number;
      fiatCurrency: string;
      escrowReference: string;
      expirySeconds?: number;
    }): Promise<string> => {
      if (!myPubkey) throw new Error('Not logged in');

      const swapId = generateSwapId();
      const expiry = Math.floor(Date.now() / 1000) + (params.expirySeconds ?? 3600);

      const content: SwapRequestContent = {
        version: 1,
        swap_id: swapId,
        swap_type: params.swapType,
        agent: params.agentPubkey,
        customer: myPubkey,
        escrow_reference: params.escrowReference,
        fiat: {
          currency: params.fiatCurrency,
          amount: params.fiatAmount,
        },
        bitcoin: {
          amount_sats: params.amountSats,
          network: 'lightning',
        },
        expiry,
      };

      const event = await publishEvent({
        kind: PONTMORE_SWAP_REQUEST_KIND,
        content: JSON.stringify(content),
        tags: [
          ['d', swapId],
          ['t', params.swapType],
          ['p', params.agentPubkey],
        ],
      });

      // Store locally
      upsertLocalSwap({
        swapId,
        swapType: params.swapType,
        agentPubkey: params.agentPubkey,
        customerPubkey: myPubkey,
        amountSats: params.amountSats,
        fiatAmount: params.fiatAmount,
        fiatCurrency: params.fiatCurrency,
        escrowReference: params.escrowReference,
        state: 'requested',
        createdAt: event.created_at,
        updatedAt: event.created_at,
        direction: 'outgoing',
        requestId: event.id,
      });

      // Publish initial snapshot (kind 30362)
      await publishSnapshot(swapId, 'requested', {
        ...params,
        escrowReference: params.escrowReference,
      }, event.created_at);

      return swapId;
    },
    onSuccess: (swapId) => {
      toast({
        title: 'Swap request published',
        description: `Swap ${swapId} is now on the Pontmore network.`,
      });
      queryClient.invalidateQueries({ queryKey: ['pontmore'] });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Failed to publish swap request',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  /** Publish a swap snapshot (kind 30362) — replaceable materialized view. */
  const publishSnapshot = useCallback(
    async (
      swapId: string,
      state: SwapState,
      params: {
        agentPubkey: string;
        amountSats: number;
        fiatAmount: number;
        fiatCurrency: string;
        escrowReference: string;
        swapType: SwapType;
      },
      createdAt: number,
    ) => {
      if (!myPubkey) return;

      const snapshot: SwapSnapshotContent = {
        swap_id: swapId,
        current_state: state,
        agent: params.agentPubkey,
        customer: myPubkey,
        swap_type: params.swapType,
        bitcoin_amount_sats: params.amountSats,
        fiat_amount: params.fiatAmount,
        fiat_currency: params.fiatCurrency,
        escrow_reference: params.escrowReference,
        updated_at: Math.floor(Date.now() / 1000),
      };

      try {
        await publishEvent({
          kind: PONTMORE_SWAP_SNAPSHOT_KIND,
          content: JSON.stringify(snapshot),
          tags: [
            ['d', swapId],
            ['t', params.swapType],
          ],
        });
      } catch {
        // snapshot is an optimization — failure is non-fatal
      }
    },
    [myPubkey, publishEvent],
  );

  /**
   * Publish a swap transition (kind 7301) — advance the state machine.
   */
  const publishTransition = useMutation({
    mutationFn: async (params: {
      swapId: string;
      newState: SwapState;
      prevState: SwapState;
      actorRole: 'agent' | 'customer' | 'system';
      reason: string;
    }) => {
      const content: SwapTransitionContent = {
        swap_id: params.swapId,
        state: params.newState,
        prev_state: params.prevState,
        actor_role: params.actorRole,
        reason: params.reason,
        created_at: Math.floor(Date.now() / 1000),
      };

      const event = await publishEvent({
        kind: PONTMORE_SWAP_TRANSITION_KIND,
        content: JSON.stringify(content),
        tags: [
          ['d', params.swapId],
          ['e', params.swapId],
        ],
      });

      // Update local record
      setLocalSwaps((prev) =>
        prev.map((s) =>
          s.swapId === params.swapId
            ? { ...s, state: params.newState, updatedAt: content.created_at }
            : s,
        ),
      );

      return event;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pontmore'] });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Failed to publish transition',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  /**
   * Publish swap evidence (kind 7302) — payment proof, payout proof, etc.
   * Per PIP-02, evidence SHOULD default to reference-style publication.
   */
  const publishEvidence = useMutation({
    mutationFn: async (params: {
      swapId: string;
      evidenceType: string;
      reference: string;
      description?: string;
    }) => {
      const content: SwapEvidenceContent = {
        swap_id: params.swapId,
        evidence_type: params.evidenceType,
        reference: params.reference,
        description: params.description,
        created_at: Math.floor(Date.now() / 1000),
      };

      const event = await publishEvent({
        kind: PONTMORE_SWAP_EVIDENCE_KIND,
        content: JSON.stringify(content),
        tags: [
          ['e', params.swapId],
        ],
      });

      return event;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pontmore'] });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Failed to publish evidence',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  /**
   * Publish a swap note (kind 7304) — optional human-readable operational note.
   */
  const publishNote = useMutation({
    mutationFn: async (params: {
      swapId: string;
      note: string;
    }) => {
      const event = await publishEvent({
        kind: PONTMORE_SWAP_NOTE_KIND,
        content: params.note,
        tags: [
          ['e', params.swapId],
        ],
      });
      return event;
    },
  });

  /**
   * Fetch the full swap state for a given swap ID.
   * Queries the immutable request + transitions + evidence, then builds
   * the materialized swap object.
   */
  const useSwap = (swapId: string | undefined) =>
    useQuery<PontmoreSwap | null, Error>({
      queryKey: ['pontmore', 'swap', swapId ?? ''],
      queryFn: async (c) => {
        if (!swapId || !myPubkey) return null;

        // Query swap request + transitions + evidence in one round-trip
        const events = await nostr.query(
          [
            // Swap request (root event)
            { kinds: [PONTMORE_SWAP_REQUEST_KIND], '#d': [swapId], limit: 1 },
            // Transitions (append-only) — query by both #d and #e for reliability
            { kinds: [PONTMORE_SWAP_TRANSITION_KIND], '#d': [swapId], limit: 100 },
            { kinds: [PONTMORE_SWAP_TRANSITION_KIND], '#e': [swapId], limit: 100 },
            // Evidence
            { kinds: [PONTMORE_SWAP_EVIDENCE_KIND], '#e': [swapId], limit: 50 },
          ],
          { signal: c.signal },
        );

        // Find the request event (kind 7300)
        const requestEvent = events.find((e) => e.kind === PONTMORE_SWAP_REQUEST_KIND);
        if (!requestEvent) return null;

        // Deduplicate transitions by event id
        const seenIds = new Set<string>();
        const transitionEvents = events.filter(
          (e) => e.kind === PONTMORE_SWAP_TRANSITION_KIND && !seenIds.has(e.id) && seenIds.add(e.id)
        );
        const evidenceEvents = events.filter((e) => e.kind === PONTMORE_SWAP_EVIDENCE_KIND);

        return buildSwapFromEvents(
          requestEvent,
          transitionEvents,
          evidenceEvents,
          myPubkey,
        );
      },
      enabled: !!swapId && !!myPubkey,
      staleTime: 5_000,
      refetchInterval: 10_000,
    });

  /**
   * Fetch all swaps involving the current user (as customer or agent).
   *
   * Queries snapshots (kind 30362) + swap requests (kind 7300) for initial
   * data, then fetches ALL transition events (kind 7301) for those swap IDs
   * so the customer sees live state updates as the agent advances the swap.
   */
  const useMySwaps = () =>
    useQuery<PontmoreSwap[], Error>({
      queryKey: ['pontmore', 'my-swaps', myPubkey ?? ''],
      queryFn: async (c) => {
        if (!myPubkey) return [];

        // Query snapshots published by the user (as customer) AND swap
        // requests where the user is the tagged agent (as agent).
        const [snapshotEvents, incomingRequests] = await Promise.all([
          nostr.query(
            [
              { kinds: [PONTMORE_SWAP_SNAPSHOT_KIND], authors: [myPubkey], limit: 50 },
            ],
            { signal: c.signal },
          ),
          nostr.query(
            [
              { kinds: [PONTMORE_SWAP_REQUEST_KIND], '#p': [myPubkey], limit: 50 },
            ],
            { signal: c.signal },
          ),
        ]);

        const swaps: PontmoreSwap[] = [];
        const seenSwapIds = new Set<string>();

        // Process snapshots (outgoing — I'm the customer)
        for (const event of snapshotEvents) {
          const snapshot = parseSwapSnapshot(event);
          if (!snapshot) continue;
          if (seenSwapIds.has(snapshot.swap_id)) continue;
          seenSwapIds.add(snapshot.swap_id);

          swaps.push({
            swapId: snapshot.swap_id,
            swapType: snapshot.swap_type,
            state: snapshot.current_state,
            agentPubkey: snapshot.agent,
            customerPubkey: snapshot.customer,
            bitcoinAmountSats: snapshot.bitcoin_amount_sats,
            fiatAmount: snapshot.fiat_amount,
            fiatCurrency: snapshot.fiat_currency,
            escrowReference: snapshot.escrow_reference,
            expiry: 0,
            createdAt: event.created_at,
            updatedAt: snapshot.updated_at,
            direction: snapshot.customer === myPubkey ? 'outgoing' : 'incoming',
            transitions: [],
            evidence: [],
          });
        }

        // Process incoming requests (I'm the agent)
        for (const reqEvent of incomingRequests) {
          const swapId = reqEvent.tags.find(([n]) => n === 'd')?.[1];
          if (!swapId || seenSwapIds.has(swapId)) continue;
          seenSwapIds.add(swapId);

          const request = parseSwapRequest(reqEvent);
          if (!request) continue;

          swaps.push({
            swapId: request.swap_id,
            swapType: request.swap_type,
            state: 'requested',
            agentPubkey: request.agent,
            customerPubkey: request.customer,
            bitcoinAmountSats: request.bitcoin.amount_sats,
            fiatAmount: request.fiat.amount,
            fiatCurrency: request.fiat.currency,
            escrowReference: request.escrow_reference,
            expiry: request.expiry,
            createdAt: reqEvent.created_at,
            updatedAt: reqEvent.created_at,
            direction: 'incoming',
            transitions: [],
            evidence: [],
          });
        }

        // Merge with local ledger for swaps that may not have snapshots yet
        for (const local of localSwaps) {
          if (!seenSwapIds.has(local.swapId)) {
            seenSwapIds.add(local.swapId);
            swaps.push({
              swapId: local.swapId,
              swapType: local.swapType,
              state: local.state,
              agentPubkey: local.agentPubkey,
              customerPubkey: local.customerPubkey,
              bitcoinAmountSats: local.amountSats,
              fiatAmount: local.fiatAmount,
              fiatCurrency: local.fiatCurrency,
              escrowReference: local.escrowReference,
              expiry: 0,
              createdAt: local.createdAt,
              updatedAt: local.updatedAt,
              direction: local.direction,
              transitions: [],
              evidence: [],
            });
          }
        }

        // ── Fetch transitions for ALL swap IDs ──────────────────────
        // This is the critical piece: without it, the customer's swap state
        // is frozen at "requested" because the agent's transitions (kind 7301)
        // are never queried. We fetch all transitions for all swap IDs in one
        // batch, then rebuild each swap's state from the latest transition.
        const allSwapIds = swaps.map((s) => s.swapId);
        if (allSwapIds.length > 0) {
          const transitionEvents = await nostr.query(
            [
              { kinds: [PONTMORE_SWAP_TRANSITION_KIND], '#d': allSwapIds, limit: 500 },
              { kinds: [PONTMORE_SWAP_TRANSITION_KIND], '#e': allSwapIds, limit: 500 },
            ],
            { signal: c.signal },
          );

          // Deduplicate by event id
          const seenEventIds = new Set<string>();
          const uniqueTransitions = transitionEvents.filter((e) => {
            if (seenEventIds.has(e.id)) return false;
            seenEventIds.add(e.id);
            return true;
          });

          // Parse and group transitions by swap ID
          const transitionsBySwap = new Map<string, {
            state: SwapState;
            prevState: SwapState;
            actorRole: string;
            reason: string;
            createdAt: number;
            eventId: string;
          }[]>();

          for (const evt of uniqueTransitions) {
            const parsed = parseSwapTransition(evt);
            if (!parsed) continue;

            // Match by 'd' or 'e' tag
            const swapId = evt.tags.find(([n]) => n === 'd')?.[1]
              ?? evt.tags.find(([n]) => n === 'e')?.[1];
            if (!swapId) continue;

            const arr = transitionsBySwap.get(swapId) ?? [];
            arr.push({
              state: parsed.state,
              prevState: parsed.prev_state,
              actorRole: parsed.actor_role,
              reason: parsed.reason,
              createdAt: parsed.created_at,
              eventId: evt.id,
            });
            transitionsBySwap.set(swapId, arr);
          }

          // Apply transitions to each swap — update state + transitions list
          for (const swap of swaps) {
            const transitions = transitionsBySwap.get(swap.swapId);
            if (!transitions || transitions.length === 0) continue;

            // Sort by created_at ascending
            transitions.sort((a, b) => a.createdAt - b.createdAt);

            // Latest transition determines current state
            const latest = transitions[transitions.length - 1];
            swap.state = latest.state;
            swap.updatedAt = latest.createdAt;
            swap.transitions = transitions;
          }
        }

        return swaps.sort((a, b) => b.updatedAt - a.updatedAt);
      },
      enabled: !!myPubkey,
      staleTime: 10_000,
      refetchInterval: 15_000,
    });

  /** All swaps from local ledger (sorted by most recent). */
  const swaps = useCallback((): LocalSwapRecord[] => {
    return [...localSwaps].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [localSwaps]);

  /** Clear local swap history. */
  const clearHistory = useCallback(() => {
    setLocalSwaps([]);
    queryClient.invalidateQueries({ queryKey: ['pontmore'] });
  }, [setLocalSwaps, queryClient]);

  return {
    // Mutations
    publishSwapRequest,
    publishTransition,
    publishEvidence,
    publishNote,
    // Queries
    useSwap,
    useMySwaps,
    // Local state
    localSwaps: swaps(),
    clearHistory,
    upsertLocalSwap,
  };
}
