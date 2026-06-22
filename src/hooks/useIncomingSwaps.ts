/**
 * useIncomingSwaps — agent inbox: discover swap requests directed at the
 * current user (where they are the tagged agent).
 *
 * The Pontmore swap request (kind 7300) includes a `['p', agentPubkey]` tag.
 * Agents discover incoming requests by querying:
 *   { kinds: [7300], '#p': [<myPubkey>], limit: 50 }
 *
 * For each request, we also fetch its transitions (7301) and evidence (7302)
 * to build the full materialized swap state.
 */

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  PONTMORE_SWAP_REQUEST_KIND,
  PONTMORE_SWAP_TRANSITION_KIND,
  PONTMORE_SWAP_EVIDENCE_KIND,
  buildSwapFromEvents,
  type PontmoreSwap,
} from '@/lib/pontmore';
import type { NostrEvent } from '@nostrify/nostrify';

export function useIncomingSwaps() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const myPubkey = user?.pubkey;

  return useQuery<PontmoreSwap[], Error>({
    queryKey: ['pontmore', 'incoming-swaps', myPubkey ?? ''],
    queryFn: async (c) => {
      if (!myPubkey) return [];

      // Step 1: find all swap requests where I'm the tagged agent
      const requestEvents = await nostr.query(
        [{ kinds: [PONTMORE_SWAP_REQUEST_KIND], '#p': [myPubkey], limit: 50 }],
        { signal: c.signal },
      );

      if (requestEvents.length === 0) return [];

      // Extract swap IDs (d-tag) for the transition/evidence queries
      const swapIds = requestEvents
        .map((e) => e.tags.find(([n]) => n === 'd')?.[1])
        .filter((id): id is string => !!id);

      if (swapIds.length === 0) return [];

      // Step 2: fetch transitions + evidence for all these swaps in one batch.
      // We query by '#e' tag (transitions/evidence reference the swapId via 'e'
      // and 'd' tags). We also query by '#d' in case relays index differently.
      const [transitionEvents, evidenceEvents] = await Promise.all([
        nostr.query(
          [
            { kinds: [PONTMORE_SWAP_TRANSITION_KIND], '#e': swapIds, limit: 200 },
            { kinds: [PONTMORE_SWAP_TRANSITION_KIND], '#d': swapIds, limit: 200 },
          ],
          { signal: c.signal },
        ).then((events) => dedupeEvents(events)),
        nostr.query(
          [
            { kinds: [PONTMORE_SWAP_EVIDENCE_KIND], '#e': swapIds, limit: 200 },
          ],
          { signal: c.signal },
        ),
      ]);

      // Step 3: build materialized swaps
      const swaps: PontmoreSwap[] = [];

      for (const reqEvent of requestEvents) {
        const swapId = reqEvent.tags.find(([n]) => n === 'd')?.[1];
        if (!swapId) continue;

        // Match transitions/evidence to this swap by 'e' or 'd' tag
        const swapTransitions = transitionEvents.filter((e) =>
          e.tags.some(([n, v]) => (n === 'e' || n === 'd') && v === swapId)
        );
        const swapEvidence = evidenceEvents.filter((e) =>
          e.tags.some(([n, v]) => (n === 'e' || n === 'd') && v === swapId)
        );

        const swap = buildSwapFromEvents(
          reqEvent,
          swapTransitions,
          swapEvidence,
          myPubkey,
        );

        if (swap) {
          // Force direction to 'incoming' (we're the agent)
          swaps.push({ ...swap, direction: 'incoming' });
        }
      }

      // Sort newest first
      return swaps.sort((a, b) => b.createdAt - a.createdAt);
    },
    enabled: !!myPubkey,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/** Deduplicate events by id (relay pool may return duplicates). */
function dedupeEvents(events: NostrEvent[]): NostrEvent[] {
  const seen = new Set<string>();
  const result: NostrEvent[] = [];
  for (const e of events) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      result.push(e);
    }
  }
  return result;
}
