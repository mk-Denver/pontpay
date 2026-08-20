/**
 * useEscrowDiscovery — query Nostr relays for kind 30361 escrow descriptors
 * (PIP-01). Used by agents and customers to discover escrow services they can
 * transact through.
 *
 * Pass an optional array of relay URLs to query specific relays instead of
 * the default pool.
 */

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  PONTMORE_ESCROW_KIND,
  parsePontmoreEscrow,
  type PontmoreEscrow,
} from '@/lib/pontmore';

export function useEscrowDiscovery(relays?: string[]) {
  const { nostr } = useNostr();

  const relayKey = relays?.slice().sort().join(',') ?? 'pool';

  const { data: escrows, ...query } = useQuery<PontmoreEscrow[], Error>({
    queryKey: ['pontmore', 'escrows', relayKey],
    queryFn: async (c) => {
      const target = relays && relays.length > 0
        ? nostr.group(relays)
        : nostr;

      const events = await target.query(
        [{ kinds: [PONTMORE_ESCROW_KIND], limit: 50 }],
        { signal: c.signal },
      );

      return events
        .map(parsePontmoreEscrow)
        .filter((e): e is PontmoreEscrow => e !== null)
        .sort((a, b) => b.event.created_at - a.event.created_at);
    },
    staleTime: Infinity,
    refetchOnMount: false,
  });

  /** Escrows that have a service schema block (standalone-sufficient — usable by autonomous apps). */
  const standaloneEscrows = useMemo(
    () => (escrows ?? []).filter((e) => !!e.service?.schema?.url),
    [escrows],
  );

  return {
    escrows: escrows ?? [],
    standaloneEscrows,
    ...query,
  };
}

/** Fetch a single escrow by pubkey and optional d-tag. */
export function useEscrow(
  pubkey: string | undefined,
  dTag: string = 'escrow',
) {
  const { nostr } = useNostr();

  return useQuery<PontmoreEscrow | null, Error>({
    queryKey: ['pontmore', 'escrow', pubkey ?? '', dTag],
    queryFn: async (c) => {
      if (!pubkey) return null;
      const [event] = await nostr.query(
        [{ kinds: [PONTMORE_ESCROW_KIND], authors: [pubkey], '#d': [dTag], limit: 1 }],
        { signal: c.signal },
      );
      if (!event) return null;
      return parsePontmoreEscrow(event);
    },
    enabled: !!pubkey,
    staleTime: Infinity,
    refetchOnMount: false,
  });
}