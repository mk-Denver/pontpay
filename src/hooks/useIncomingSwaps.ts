/**
 * useIncomingSwaps — agent inbox: discover coordination roots directed at the
 * current user where they are the `swap/agent` participant.
 *
 * The PIP-02 v2 coordination root (kind 7300) includes `['p', pubkey, relay, role]`
 * tags for each participant. Agents discover incoming roots by querying:
 *   { kinds: [7300], '#p': [<myPubkey>] }
 *
 * For each root, we also fetch its actions (kind 7301) to build the full
 * materialized coordination state.
 */

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  PONTMORE_COORDINATION_ROOT_KIND,
  PONTMORE_COORDINATION_ACTION_KIND,
  buildCoordinationFromEvents,
  type PontmoreCoordination,
} from '@/lib/pontmore';
import type { NostrEvent } from '@nostrify/nostrify';

export function useIncomingSwaps() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const myPubkey = user?.pubkey;

  return useQuery<PontmoreCoordination[], Error>({
    queryKey: ['pontmore', 'incoming-coordinations', myPubkey ?? ''],
    queryFn: async (c) => {
      if (!myPubkey) return [];

      // Step 1: find all coordination roots where I'm tagged as a participant
      const rootEvents = await nostr.query(
        [{ kinds: [PONTMORE_COORDINATION_ROOT_KIND], '#p': [myPubkey], limit: 50 }],
        { signal: c.signal },
      );

      if (rootEvents.length === 0) return [];

      // Filter to roots where I'm the swap/agent AND not the proposer
      const incomingRoots = rootEvents.filter((evt) => {
        if (evt.pubkey === myPubkey) return false; // I'm the proposer — not incoming
        const myRole = evt.tags.find(
          ([n, v, , role]) => n === 'p' && v === myPubkey && role === 'swap/agent',
        );
        return !!myRole;
      });

      if (incomingRoots.length === 0) return [];

      // Step 2: fetch all actions for these roots in one batch
      const rootIds = incomingRoots.map((e) => e.id);
      const actionEvents = await nostr.query(
        [{ kinds: [PONTMORE_COORDINATION_ACTION_KIND], '#e': rootIds, limit: Math.max(1000, rootIds.length * 50) }],
        { signal: c.signal },
      );

      // Deduplicate by event id
      const seenEventIds = new Set<string>();
      const uniqueActions = actionEvents.filter((e) => {
        if (seenEventIds.has(e.id)) return false;
        seenEventIds.add(e.id);
        return true;
      });

      // Group actions by root
      const actionsByRoot = new Map<string, NostrEvent[]>();
      for (const evt of uniqueActions) {
        const rootRef = evt.tags.find(([n, , , marker]) => n === 'e' && marker === 'root')?.[1];
        if (!rootRef) continue;
        const arr = actionsByRoot.get(rootRef) ?? [];
        arr.push(evt);
        actionsByRoot.set(rootRef, arr);
      }

      // Step 3: build materialized coordinations
      const coordinations: PontmoreCoordination[] = [];

      for (const rootEvent of incomingRoots) {
        const actions = actionsByRoot.get(rootEvent.id) ?? [];
        const coord = buildCoordinationFromEvents(rootEvent, actions, myPubkey);
        if (coord) {
          coordinations.push({ ...coord, direction: 'incoming' });
        }
      }

      // Sort newest first
      return coordinations.sort((a, b) => b.rootEvent.created_at - a.rootEvent.created_at);
    },
    enabled: !!myPubkey,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
