/**
 * useSwapStateMachine — implements the PIP-02 v2 coordination lifecycle.
 *
 * A coordination is represented by:
 *   kind 7300: immutable coordination root (proposes the swap terms)
 *   kind 7301: immutable coordination actions (append-only, linked by `prev`)
 *
 * The root event ID is the coordination_id. Actions form a linear chain where
 * each action references the root via ["e", rootId, relay, "root"] and the
 * immediately preceding event via ["e", prevId, relay, "prev"].
 *
 * Sensitive payloads (invoices, bank details) are sent via the companion
 * private message lane (NIP-17 Gift Wrap), NOT in the public coordination events.
 */

import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import {
  PONTMORE_COORDINATION_ROOT_KIND,
  PONTMORE_COORDINATION_ACTION_KIND,
  PONTMORE_SWAP_PROFILE,
  PONTMORE_PIP02_VERSION,
  buildCoordinationFromEvents,
  swapTypeToDirection,
  type SwapType,
  type PontmoreCoordination,
  type LocalCoordinationRecord,
  type CoordinationRootContent,
  type CoordinationActionContent,
  type CoordinationActionId,
  type CoordinationState,
} from '@/lib/pontmore';

const HOUR = 3600;

/**
 * Map a kernel/profile action to the resulting coordination state.
 * For disputes, core/open_dispute does NOT change the state (it overlays a
 * disputed flag), and core/resolve_dispute depends on action.data.effect.
 * This is a simplified mapping for the local ledger — canonical state is
 * always derived from the full action chain via deriveCoordinationState.
 */
function deriveStateFromAction(action: CoordinationActionId, prevState: CoordinationState, data?: CoordinationActionContent['data']): CoordinationState {
  switch (action) {
    case 'core/accept': return 'accepted';
    case 'core/decline': return 'declined';
    case 'core/secure': return 'secured';
    case 'swap/fiat_sent': return 'fiat_sent';
    case 'swap/fiat_confirmed': return 'fiat_confirmed';
    case 'core/authorize_settlement': return 'settlement_authorized';
    case 'core/settle': return 'settled';
    case 'core/authorize_refund': return 'refund_authorized';
    case 'core/refund': return 'refunded';
    case 'core/cancel': return 'cancelled';
    case 'core/expire': return 'expired';
    case 'core/open_dispute': return prevState; // disputed overlay, state unchanged
    case 'core/resolve_dispute':
      if (data?.effect === 'authorize_settlement') return 'settlement_authorized';
      if (data?.effect === 'authorize_refund') return 'refund_authorized';
      if (data?.effect === 'cancel') return 'cancelled';
      return prevState; // resume
    default: return prevState;
  }
}

/** Input for publishing a coordination root (kind 7300). */
export interface PublishRootParams {
  swapType: SwapType;
  agentPubkey: string;
  customerPubkey: string;
  /** Escrow authority pubkey (the descriptor publisher). */
  escrowPubkey: string;
  /** Escrow descriptor event ID (exact revision). */
  escrowDescriptorId: string;
  /** Escrow descriptor coordinate (e.g. "30361:pubkey:dtag"). */
  escrowDescriptorCoordinate: string;
  /** Optional resolver pubkey. */
  resolverPubkey?: string;
  /** Fiat currency (ISO 4217). */
  fiatCurrency: string;
  /** Fiat amount (decimal string). */
  fiatAmount: string;
  /** Bitcoin amount in sats (integer string). */
  bitcoinAmount: string;
  /** Bitcoin network (e.g. "lightning"). */
  bitcoinNetwork: string;
  /** Payment channel identifier (e.g. "mpesa-ke-kes@1"). */
  paymentChannel: string;
  /** Acceptance deadline (Unix timestamp). Defaults to now + 1h. */
  expiresAt?: number;
  /** Fiat payment deadline (Unix timestamp). Defaults to now + 24h. */
  fiatPayBy?: number;
  /** Fiat confirmation deadline (Unix timestamp). Defaults to now + 48h. */
  fiatConfirmBy?: number;
}

/** Input for publishing a coordination action (kind 7301). */
export interface PublishActionParams {
  coordinationId: string;
  action: CoordinationActionId;
  /** The predecessor event ID (root for the first action, otherwise the chain tip). */
  prevEventId: string;
  data?: CoordinationActionContent['data'];
}

export function useSwapStateMachine() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const myPubkey = user?.pubkey;

  // Local ledger of coordinations we've initiated or seen
  const [localCoord, setLocalCoord] = useLocalStorage<LocalCoordinationRecord[]>(
    'pontmore-coordinations',
    [],
  );

  /** Upsert a local coordination record. */
  const upsertLocalCoord = useCallback((record: LocalCoordinationRecord) => {
    setLocalCoord((prev) => {
      const idx = prev.findIndex((s) => s.coordinationId === record.coordinationId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...record, updatedAt: record.updatedAt };
        return updated;
      }
      return [record, ...prev];
    });
  }, [setLocalCoord]);

  /**
   * Publish a coordination root (kind 7300) — the immutable root event.
   * The root signer is the proposing participant.
   */
  const publishCoordinationRoot = useMutation({
    mutationFn: async (params: PublishRootParams): Promise<string> => {
      if (!myPubkey) throw new Error('Not logged in');

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = params.expiresAt ?? now + HOUR;
      const fiatPayBy = params.fiatPayBy ?? now + 24 * HOUR;
      const fiatConfirmBy = params.fiatConfirmBy ?? now + 48 * HOUR;

      // Validate: expires_at < fiat_pay_by < fiat_confirm_by
      if (expiresAt >= fiatPayBy) throw new Error('Acceptance deadline must be before fiat payment deadline');
      if (fiatPayBy >= fiatConfirmBy) throw new Error('Fiat payment deadline must be before confirmation deadline');

      const direction = swapTypeToDirection(params.swapType);

      const content: CoordinationRootContent = {
        version: PONTMORE_PIP02_VERSION,
        profile: PONTMORE_SWAP_PROFILE,
        terms: {
          direction,
          fiat: {
            currency: params.fiatCurrency,
            amount: params.fiatAmount,
          },
          bitcoin: {
            amount: params.bitcoinAmount,
            unit: 'sat',
            network: params.bitcoinNetwork,
          },
          payment_channel: params.paymentChannel,
          deadlines: {
            fiat_pay_by: fiatPayBy,
            fiat_confirm_by: fiatConfirmBy,
          },
        },
        expires_at: expiresAt,
      };

      // Build participant tags with roles
      const tags: string[][] = [
        ['d', 'coordination'],
        ['alt', `Pontmore coordination: ${direction} ${params.fiatCurrency} ${params.fiatAmount} → ${params.bitcoinAmount} sats`],
        // Application participants
        ['p', params.agentPubkey, '', 'swap/agent'],
        ['p', params.customerPubkey, '', 'swap/customer'],
        // Escrow authority
        ['p', params.escrowPubkey, '', 'core/escrow'],
        // Escrow descriptor references (exact event + address)
        ['e', params.escrowDescriptorId, '', 'escrow-version'],
        ['a', params.escrowDescriptorCoordinate, '', 'escrow'],
      ];

      // Resolver (optional — enables disputes)
      if (params.resolverPubkey) {
        tags.push(['p', params.resolverPubkey, '', 'core/resolver']);
      }

      const event = await publishEvent({
        kind: PONTMORE_COORDINATION_ROOT_KIND,
        content: JSON.stringify(content),
        tags,
      });

      // Store locally
      upsertLocalCoord({
        coordinationId: event.id,
        swapType: params.swapType,
        agentPubkey: params.agentPubkey,
        customerPubkey: params.customerPubkey,
        bitcoinAmount: params.bitcoinAmount,
        fiatAmount: params.fiatAmount,
        fiatCurrency: params.fiatCurrency,
        paymentChannel: params.paymentChannel,
        state: 'proposed',
        createdAt: event.created_at,
        updatedAt: event.created_at,
        direction: 'outgoing',
        rootEventId: event.id,
      });

      return event.id;
    },
    onSuccess: (coordinationId) => {
      toast({
        title: 'Coordination proposed',
        description: `Coordination ${coordinationId.slice(0, 12)}… is on the Pontmore network.`,
      });
      queryClient.invalidateQueries({ queryKey: ['pontmore'] });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Failed to publish coordination root',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  /**
   * Publish a coordination action (kind 7301) — advance the chain.
   * The action references the root and the predecessor (prev).
   */
  const publishCoordinationAction = useMutation({
    mutationFn: async (params: PublishActionParams) => {
      if (!myPubkey) throw new Error('Not logged in');

      const content: CoordinationActionContent = {
        version: PONTMORE_PIP02_VERSION,
        action: params.action,
        data: params.data,
      };

      const event = await publishEvent({
        kind: PONTMORE_COORDINATION_ACTION_KIND,
        content: JSON.stringify(content),
        tags: [
          ['e', params.coordinationId, '', 'root'],
          ['e', params.prevEventId, '', 'prev'],
        ],
      });

      // Update local record state
      setLocalCoord((prev) =>
        prev.map((s) =>
          s.coordinationId === params.coordinationId
            ? { ...s, state: deriveStateFromAction(params.action, s.state, params.data), updatedAt: event.created_at }
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
        title: 'Failed to publish action',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  /**
   * Fetch the full coordination state for a given coordination ID (root event ID).
   * Queries the root + all actions, then builds the materialized coordination.
   */
  const useCoordination = (coordinationId: string | undefined) =>
    useQuery<PontmoreCoordination | null, Error>({
      queryKey: ['pontmore', 'coordination', coordinationId ?? ''],
      queryFn: async (c) => {
        if (!coordinationId || !myPubkey) return null;

        // Query root + actions in one round-trip
        const events = await nostr.query(
          [
            // Root event
            { kinds: [PONTMORE_COORDINATION_ROOT_KIND], ids: [coordinationId], limit: 1 },
            // Actions referencing the root via #e (root marker)
            { kinds: [PONTMORE_COORDINATION_ACTION_KIND], '#e': [coordinationId], limit: 200 },
          ],
          { signal: c.signal },
        );

        const rootEvent = events.find((e) => e.kind === PONTMORE_COORDINATION_ROOT_KIND);
        if (!rootEvent) return null;

        const actionEvents = events.filter((e) => e.kind === PONTMORE_COORDINATION_ACTION_KIND);

        return buildCoordinationFromEvents(rootEvent, actionEvents, myPubkey);
      },
      enabled: !!coordinationId && !!myPubkey,
      staleTime: 5_000,
      refetchInterval: 10_000,
    });

  /**
   * Fetch all coordinations involving the current user (as proposer or participant).
   */
  const useMyCoordinations = () =>
    useQuery<PontmoreCoordination[], Error>({
      queryKey: ['pontmore', 'my-coordinations', myPubkey ?? ''],
      queryFn: async (c) => {
        if (!myPubkey) return [];

        // Query roots where I'm the author (proposer) or tagged participant
        const [proposedRoots, incomingRoots] = await Promise.all([
          nostr.query(
            [{ kinds: [PONTMORE_COORDINATION_ROOT_KIND], authors: [myPubkey], limit: 50 }],
            { signal: c.signal },
          ),
          nostr.query(
            [{ kinds: [PONTMORE_COORDINATION_ROOT_KIND], '#p': [myPubkey], limit: 50 }],
            { signal: c.signal },
          ),
        ]);

        // Deduplicate roots by event id
        const seenIds = new Set<string>();
        const rootEvents = [...proposedRoots, ...incomingRoots].filter((e) => {
          if (seenIds.has(e.id)) return false;
          seenIds.add(e.id);
          return true;
        });

        if (rootEvents.length === 0) {
          // Fall back to local ledger
          return localCoord.map((local) => localToCoordination(local, myPubkey));
        }

        // Fetch all actions for these roots in one batch
        const rootIds = rootEvents.map((e) => e.id);
        const actionEvents = await nostr.query(
          [{ kinds: [PONTMORE_COORDINATION_ACTION_KIND], '#e': rootIds, limit: Math.max(1000, rootIds.length * 50) }],
          { signal: c.signal },
        );

        // Group actions by root
        const actionsByRoot = new Map<string, typeof actionEvents>();
        for (const evt of actionEvents) {
          const rootRef = evt.tags.find(([n, , , marker]) => n === 'e' && marker === 'root')?.[1];
          if (!rootRef) continue;
          const arr = actionsByRoot.get(rootRef) ?? [];
          arr.push(evt);
          actionsByRoot.set(rootRef, arr);
        }

        // Build coordinations
        const coordinations: PontmoreCoordination[] = [];
        for (const rootEvent of rootEvents) {
          const actions = actionsByRoot.get(rootEvent.id) ?? [];
          const coord = buildCoordinationFromEvents(rootEvent, actions, myPubkey);
          if (coord) coordinations.push(coord);
        }

        // Merge with local ledger for coordinations that may not have synced yet
        for (const local of localCoord) {
          if (!seenIds.has(local.coordinationId)) {
            coordinations.push(localToCoordination(local, myPubkey));
          }
        }

        return coordinations.sort((a, b) => b.rootEvent.created_at - a.rootEvent.created_at);
      },
      enabled: !!myPubkey,
      staleTime: 10_000,
      refetchInterval: 15_000,
    });

  /** All coordinations from local ledger (sorted by most recent). */
  const localCoordinations = useCallback((): LocalCoordinationRecord[] => {
    return [...localCoord].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [localCoord]);

  /** Clear local coordination history. */
  const clearHistory = useCallback(() => {
    setLocalCoord([]);
    queryClient.invalidateQueries({ queryKey: ['pontmore'] });
  }, [setLocalCoord, queryClient]);

  return {
    // Mutations
    publishCoordinationRoot,
    publishCoordinationAction,
    // Queries
    useCoordination,
    useMyCoordinations,
    // Local state
    localCoordinations: localCoordinations(),
    clearHistory,
    upsertLocalCoord,
  };
}

/** Convert a local record to a minimal PontmoreCoordination for display. */
function localToCoordination(local: LocalCoordinationRecord, myPubkey: string): PontmoreCoordination {
  return {
    coordinationId: local.coordinationId,
    rootEvent: {
      id: local.coordinationId,
      pubkey: local.direction === 'outgoing' ? myPubkey : local.agentPubkey,
      created_at: local.createdAt,
    },
    profile: PONTMORE_SWAP_PROFILE,
    terms: {
      direction: swapTypeToDirection(local.swapType),
      fiat: { currency: local.fiatCurrency, amount: local.fiatAmount },
      bitcoin: { amount: local.bitcoinAmount, unit: 'sat', network: 'lightning' },
      payment_channel: local.paymentChannel,
      deadlines: local.deadlines ?? { fiat_pay_by: 0, fiat_confirm_by: 0 },
    },
    expiresAt: local.expiresAt ?? 0,
    participants: [
      { pubkey: local.agentPubkey, role: 'swap/agent' },
      { pubkey: local.customerPubkey, role: 'swap/customer' },
    ],
    escrowDescriptorId: '',
    escrowDescriptorCoordinate: '',
    actions: [],
    state: local.state,
    disputed: false,
    direction: local.direction,
    swapType: local.swapType,
  };
}
