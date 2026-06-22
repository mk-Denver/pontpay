/**
 * useAgentRegistration — publish, update, delete, and fetch the current
 * user's own Pontmore agent registration (kind 33939 addressable event).
 *
 * Because kind 33939 is addressable, re-publishing with the same `d` tag
 * replaces the previous event on relays. Deletion uses NIP-09 (kind 5)
 * with an `a` tag referencing the addressable coordinate.
 */

import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import {
  PONTMORE_AGENT_KIND,
  PONTMORE_AGENT_TAG,
  parsePontmoreAgent,
  type PontmoreAgent,
} from '@/lib/pontmore';

/** Input parameters for publishing an agent registration. */
export interface AgentRegistrationInput {
  /** Unique slug identifier for the agent (the d-tag). */
  identifier: string;
  /** Display name of the agent / agent booth. */
  name: string;
  /** Free-form bio / description. */
  bio: string;
  /** Human-readable location (e.g. "Nairobi, Kenya"). */
  geo: string;
  /** Fiat currencies the agent supports. */
  currencies: string[];
  /** Commission / spread as a percentage string (e.g. "1.5"). */
  rate: string;
  /** Operating hours (e.g. "Mon-Sun 08:00-20:00"). */
  hours: string;
  /** Contact phone number. */
  phone: string;
  /** Lightning address for direct Lightning payments. */
  lud16: string;
  /** Minimum transaction amount in sats. */
  minAmount: number;
  /** Maximum transaction amount in sats. */
  maxAmount: number;
  /** Current Lightning liquidity in sats (self-reported). */
  liquiditySats: number;
  /** Service categories (e.g. "deposit", "withdrawal", "exchange"). */
  categories: string[];
}

/** The default d-tag identifier prefix for Pontmore agents. */
const DEFAULT_D_PREFIX = 'pontmore-agent';

/** Build the kind 33939 event content JSON from registration input. */
function buildContent(input: AgentRegistrationInput): string {
  return JSON.stringify({
    bio: input.bio,
    currencies: input.currencies,
    minAmount: input.minAmount,
    maxAmount: input.maxAmount,
    liquiditySats: input.liquiditySats,
    verificationLevel: 'registered',
  });
}

/** Build the tag array for a kind 33939 event from registration input. */
function buildTags(input: AgentRegistrationInput): string[][] {
  const tags: string[][] = [
    ['d', input.identifier || DEFAULT_D_PREFIX],
    ['name', input.name],
    ['t', PONTMORE_AGENT_TAG],
    ['alt', `Pontmore agent: ${input.name}${input.geo ? ` — ${input.geo}` : ''}`],
  ];

  if (input.geo) tags.push(['geo', input.geo]);
  if (input.rate) tags.push(['rate', input.rate]);
  if (input.hours) tags.push(['hours', input.hours]);
  if (input.phone) tags.push(['phone', input.phone]);
  if (input.lud16) tags.push(['lud16', input.lud16]);

  for (const currency of input.currencies) {
    tags.push(['currency', currency]);
  }

  for (const category of input.categories) {
    tags.push(['t', category]);
  }

  return tags;
}

export function useAgentRegistration() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const myPubkey = user?.pubkey;

  /** Fetch the current user's own agent registration (if any). */
  const { data: myAgent, ...myAgentQuery } = useQuery<PontmoreAgent | null, Error>({
    queryKey: ['pontmore', 'my-agent', myPubkey ?? ''],
    queryFn: async (c) => {
      if (!myPubkey) return null;
      const events = await nostr.query(
        [
          {
            kinds: [PONTMORE_AGENT_KIND],
            authors: [myPubkey],
            '#t': [PONTMORE_AGENT_TAG],
            limit: 1,
          },
        ],
        { signal: c.signal },
      );
      if (events.length === 0) return null;
      return parsePontmoreAgent(events[0]);
    },
    enabled: !!myPubkey,
    staleTime: 30_000,
  });

  /** Publish (create or update) an agent registration. */
  const publishRegistration = useMutation({
    mutationFn: async (input: AgentRegistrationInput) => {
      const content = buildContent(input);
      const tags = buildTags(input);

      const event = await publishEvent({
        kind: PONTMORE_AGENT_KIND,
        content,
        tags,
      });

      return event;
    },
    onSuccess: () => {
      toast({
        title: 'Agent listing published',
        description: 'Your agent registration is now discoverable on the Pontmore network.',
      });
      queryClient.invalidateQueries({ queryKey: ['pontmore'] });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Failed to publish listing',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  /** Delete (unpublish) the current user's agent registration via NIP-09. */
  const deleteRegistration = useMutation({
    mutationFn: async (identifier: string) => {
      if (!myPubkey) throw new Error('Not logged in');
      const d = identifier || DEFAULT_D_PREFIX;
      const coordinate = `${PONTMORE_AGENT_KIND}:${myPubkey}:${d}`;

      const event = await publishEvent({
        kind: 5, // NIP-09 deletion
        content: 'Agent listing deleted',
        tags: [
          ['a', coordinate],
          ['t', PONTMORE_AGENT_TAG],
        ],
      });

      return event;
    },
    onSuccess: () => {
      toast({
        title: 'Agent listing removed',
        description: 'Your agent registration has been deleted from the network.',
      });
      queryClient.invalidateQueries({ queryKey: ['pontmore'] });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Failed to delete listing',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  /** Convert a PontmoreAgent back into form input for editing. */
  const agentToInput = useCallback(
    (agent: PontmoreAgent): AgentRegistrationInput => ({
      identifier: agent.d,
      name: agent.name,
      bio: agent.bio,
      geo: agent.geo,
      currencies: agent.currencies,
      rate: agent.rate,
      hours: agent.hours,
      phone: agent.phone,
      lud16: agent.lud16,
      minAmount: agent.minAmount,
      maxAmount: agent.maxAmount,
      liquiditySats: agent.liquiditySats,
      categories: agent.categories,
    }),
    [],
  );

  return {
    myAgent,
    isRegistered: !!myAgent,
    isLoading: myAgentQuery.isLoading,
    publishRegistration,
    deleteRegistration,
    agentToInput,
  };
}
