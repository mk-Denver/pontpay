/**
 * useAgents — fetch and filter the Pontmore agent directory.
 * Agents register themselves via kind 33939 addressable events
 * (see NIP.md). This hook queries relays for all agent registrations
 * and provides client-side filtering by location, currency, and search.
 */

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  PONTMORE_AGENT_KIND,
  PONTMORE_AGENT_TAG,
  parsePontmoreAgent,
  type PontmoreAgent,
} from '@/lib/pontmore';

export interface UseAgentsFilters {
  search?: string;
  currency?: string;
  location?: string;
}

export function useAgents(filters?: UseAgentsFilters) {
  const { nostr } = useNostr();

  const { data: agents, ...query } = useQuery<PontmoreAgent[], Error>({
    queryKey: ['pontmore', 'agents'],
    queryFn: async (c) => {
      const events = await nostr.query(
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
    staleTime: 60_000,
  });

  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    if (!filters) return agents;

    return agents.filter((agent) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matches =
          agent.name.toLowerCase().includes(q) ||
          agent.bio.toLowerCase().includes(q) ||
          agent.geo.toLowerCase().includes(q);
        if (!matches) return false;
      }

      if (filters.currency) {
        if (!agent.currencies.includes(filters.currency)) return false;
      }

      if (filters.location) {
        if (!agent.geo.toLowerCase().includes(filters.location.toLowerCase())) {
          return false;
        }
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
    staleTime: 60_000,
  });
}
