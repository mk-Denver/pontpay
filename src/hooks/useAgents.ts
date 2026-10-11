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
  directionToSwapType,
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

      // Query agent definitions and offers in parallel
      const [agentEvents, offerEvents] = await Promise.all([
        target.query(
          [
            {
              kinds: [PONTMORE_AGENT_KIND],
              '#t': [PONTMORE_AGENT_TAG],
              limit: 100,
            },
          ],
          { signal: c.signal },
        ),
        target.query(
          [
            {
              kinds: [PONTMORE_OFFER_KIND],
              limit: 200,
            },
          ],
          { signal: c.signal },
        ),
      ]);

      // Parse agents
      const parsedAgents = agentEvents
        .map(parsePontmoreAgent)
        .filter((a): a is PontmoreAgent => a !== null)
        .sort((a, b) => b.event.created_at - a.event.created_at);

      // Parse and group offers by pubkey
      const offersByPubkey = new Map<string, SwapOffer[]>();
      for (const evt of offerEvents) {
        const offer = parseSwapOffer(evt);
        if (!offer) continue;
        const arr = offersByPubkey.get(offer.event.pubkey) ?? [];
        arr.push(offer);
        offersByPubkey.set(offer.event.pubkey, arr);
      }

      // Enrich agents with offers
      const enriched: AgentWithOffers[] = parsedAgents.map((agent) => ({
        ...agent,
        offers: (offersByPubkey.get(agent.event.pubkey) ?? []).filter(
          (o) => o.s === 'pending',
        ),
      }));

      return enriched;
    },
    staleTime: Infinity,
    refetchOnMount: false,
  });

  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    if (!filters) return agents;

    return agents.filter((agent) => {
      // Currency filter: check offers
      if (filters.currency) {
        const hasCurrency = agent.offers.some((o) => o.f === filters.currency);
        if (!hasCurrency) return false;
      }

      // Search filter: match against d-tag, pubkey, or offer currencies
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
        [
          {
            kinds: [PONTMORE_AGENT_KIND],
            authors: [pubkey],
            '#t': [PONTMORE_AGENT_TAG],
            limit: 1,
          },
        ],
        { signal: c.signal },
      );
      if (!event) return null;
      return parsePontmoreAgent(event);
    },
    enabled: !!pubkey,
    staleTime: Infinity,
    refetchOnMount: false,
  });
}
