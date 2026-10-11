/**
 * useAgents — fetch and filter the Pontmore agent directory.
 * Agents register themselves via kind 30360 addressable events (PIP-00).
 * This hook also fetches NIP-69 offers (kind 38383) for discovered agents
 * to display price, currency, and payment-channel info.
 */

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  PONTMORE_AGENT_KIND,
  PONTMORE_AGENT_TAG,
  PONTMORE_OFFER_KIND,
  parsePontmoreAgent,
  parseSwapOffer,
  type PontmoreAgent,
  type SwapOffer,
} from '@/lib/pontmore';

/** An agent enriched with its NIP-69 offers for display. */
export interface AgentWithOffers extends PontmoreAgent {
  offers: SwapOffer[];
}

export interface UseAgentsFilters {
  search?: string;
  currency?: string;
}

export function useAgents(filters?: UseAgentsFilters, relays?: string[]) {
  const { nostr } = useNostr();

  const relayKey = relays?.slice().sort().join(',') ?? 'pool';

  const { data: agents, ...query } = useQuery<AgentWithOffers[], Error>({
    queryKey: ['pontmore', 'agents', relayKey],
    queryFn: async (c) => {
      const target = relays && relays.length > 0
        ? nostr.group(relays)
        : nostr;

      // Step 1: fetch agent definitions
      const agentEvents = await target.query(
        [{ kinds: [PONTMORE_AGENT_KIND], '#t': [PONTMORE_AGENT_TAG], limit: 100 }],
        { signal: c.signal },
      );

      const parsedAgents = agentEvents
        .map(parsePontmoreAgent)
        .filter((a): a is PontmoreAgent => a !== null)
        .sort((a, b) => b.event.created_at - a.event.created_at);

      // Step 2: fetch offers only for known agent pubkeys (batched to respect relay limits)
      const agentPubkeys = [...new Set(parsedAgents.map((a) => a.event.pubkey))];
      const BATCH_SIZE = 50;
      const offerEvents: typeof agentEvents = [];
      for (let i = 0; i < agentPubkeys.length; i += BATCH_SIZE) {
        const batch = agentPubkeys.slice(i, i + BATCH_SIZE);
        if (batch.length === 0) continue;
        const events = await target.query(
          [{ kinds: [PONTMORE_OFFER_KIND], authors: batch, limit: 200 }],
          { signal: c.signal },
        );
        offerEvents.push(...events);
      }

      // Parse and group offers by pubkey — filter out malformed only (expired filtered below)
      const nowSec = Math.floor(Date.now() / 1000);
      const offersByPubkey = new Map<string, SwapOffer[]>();
      for (const evt of offerEvents) {
        const offer = parseSwapOffer(evt);
        if (!offer || !offer.f || !offer.price) continue;
        const arr = offersByPubkey.get(offer.event.pubkey) ?? [];
        arr.push(offer);
        offersByPubkey.set(offer.event.pubkey, arr);
      }

      // Enrich agents with offers — filter to pending and not expired
      const enriched: AgentWithOffers[] = parsedAgents.map((agent) => ({
        ...agent,
        offers: (offersByPubkey.get(agent.event.pubkey) ?? []).filter(
          (o) => o.s === 'pending' && (!o.expiresAt || o.expiresAt > nowSec),
        ),
      }));

      return enriched;
    },
    staleTime: 60_000,
    refetchOnMount: false,
  });

  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    if (!filters) return agents;

    return agents.filter((agent) => {
      if (filters.currency) {
        const hasCurrency = agent.offers.some((o) => o.f === filters.currency);
        if (!hasCurrency) return false;
      }

      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matches =
          agent.d.toLowerCase().includes(q) ||
          agent.event.pubkey.toLowerCase().includes(q) ||
          agent.offers.some((o) => o.f.toLowerCase().includes(q) || o.pm.some((p) => p.toLowerCase().includes(q)));
        if (!matches) return false;
      }

      return true;
    });
  }, [agents, filters]);

  return {
    agents: filteredAgents,
    allAgents: agents ?? [],
    ...query,
  };
}

/** Fetch a single agent by pubkey (used for transaction detail views). */
export function useAgent(pubkey: string | undefined) {
  const { nostr } = useNostr();

  return useQuery<PontmoreAgent | null, Error>({
    queryKey: ['pontmore', 'agent', pubkey ?? ''],
    queryFn: async (c) => {
      if (!pubkey) return null;
      const [event] = await nostr.query(
        [{ kinds: [PONTMORE_AGENT_KIND], authors: [pubkey], '#t': [PONTMORE_AGENT_TAG], limit: 1 }],
        { signal: c.signal },
      );
      if (!event) return null;
      return parsePontmoreAgent(event);
    },
    enabled: !!pubkey,
    staleTime: 60_000,
    refetchOnMount: false,
  });
}
