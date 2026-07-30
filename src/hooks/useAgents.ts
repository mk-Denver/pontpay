/**
 * useAgents — fetch and filter the Pontmore agent directory.
 * Agents register themselves via kind 30360 addressable events (PIP-00).
 * This hook queries relays for all agent definitions and provides
 * client-side filtering by fiat currency, location/region, and search.
 */

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  PONTMORE_AGENT_KIND,
  PONTMORE_AGENT_TAG,
  parsePontmoreAgent,
  type PontmoreAgent,
} from '@/lib/pontmore';

export interface UseAgentsFilters {
  search?: string;
  currency?: string;
  region?: string;
}

export function useAgents(filters?: UseAgentsFilters, relays?: string[]) {
  const { nostr } = useNostr();

  const relayKey = relays?.slice().sort().join(',') ?? 'pool';

  const { data: agents, ...query } = useQuery<PontmoreAgent[], Error>({
    queryKey: ['pontmore', 'agents', relayKey],
    queryFn: async (c) => {
      const target = relays && relays.length > 0
        ? nostr.group(relays)
        : nostr;

      const events = await target.query(
        [
          {
            kinds: [PONTMORE_AGENT_KIND],
            '#t': [PONTMORE_AGENT_TAG],
            limit: 100,
          },
        ],
        { signal: c.signal },
      );

      return events
        .map(parsePontmoreAgent)
        .filter((a): a is PontmoreAgent => a !== null)
        .sort((a, b) => b.event.created_at - a.event.created_at);
    },
    staleTime: Infinity,
    refetchOnMount: false,
  });

  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    if (!filters) return agents;

    return agents.filter((agent) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matches =
          agent.name.toLowerCase().includes(q) ||
          agent.about.toLowerCase().includes(q) ||
          agent.capabilities.regions.some((r) => r.toLowerCase().includes(q));
        if (!matches) return false;
      }

      if (filters.currency) {
        const hasCurrency =
          agent.fiatCurrencies.includes(filters.currency) ||
          agent.capabilities.fiatCurrencies.includes(filters.currency);
        if (!hasCurrency) return false;
      }

      if (filters.region) {
        const hasRegion = agent.capabilities.regions.some(
          (r) => r.toLowerCase().includes(filters.region!.toLowerCase()),
        );
        if (!hasRegion) return false;
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
