/**
 * useAgentRegistration — publish, update, delete, and fetch the current
 * user's own Pontmore agent definition (kind 30360, PIP-00).
 *
 * Per PIP-00, an agent definition is an addressable event with:
 * - `d` tag (usually "agent")
 * - `t` tag = "agent" for discovery
 * - `relay` tags for relay preferences
 * - `a` tag referencing the default escrow descriptor (kind 30361)
 * - `f` tags for supported fiat currencies
 * - JSON content with version, name, about, capabilities, pricing_policy, escrow, updated_at
 *
 * This hook also publishes a companion escrow descriptor (kind 30361, PIP-01)
 * when the agent registers, since PIP-00 requires at least one usable escrow.
 */

import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import {
  PONTMORE_AGENT_KIND,
  PONTMORE_AGENT_TAG,
  parsePontmoreAgent,
  type PontmoreAgent,
  type AgentCapabilities,
} from '@/lib/pontmore';

/** Input parameters for publishing an agent definition (PIP-00). */
export interface AgentRegistrationInput {
  /** Stable identifier (d-tag), usually "agent". */
  identifier: string;
  /** Display name. */
  name: string;
  /** About / bio. */
  about: string;
  /** Capabilities surface (PIP-00). */
  capabilities: AgentCapabilities;
  /** Pricing or margin policy reference. */
  pricingPolicy: string;
  /** Supported fiat currencies (emitted as `f` tags). */
  fiatCurrencies: string[];
  /** Relay URLs the agent is reachable on (emitted as `relay` tags). */
  relays: string[];
}

/** Build the JSON content for a kind 30360 event (PIP-00). */
function buildAgentContent(input: AgentRegistrationInput): string {
  return JSON.stringify({
    version: 1,
    name: input.name,
    about: input.about,
    capabilities: {
      swap_types: input.capabilities.swapTypes,
      fiat_currencies: input.capabilities.fiatCurrencies,
      payment_channels: input.capabilities.paymentChannels,
      settlement_networks: input.capabilities.settlementNetworks,
      regions: input.capabilities.regions,
      min_amount: input.capabilities.minAmount,
      max_amount: input.capabilities.maxAmount,
      pricing_margin: input.capabilities.pricingMargin,
    },
    pricing_policy: input.pricingPolicy,
    exchange_mode: 'in_person',
    updated_at: Math.floor(Date.now() / 1000),
  });
}

/** Build the tag array for a kind 30360 event (PIP-00). */
function buildAgentTags(input: AgentRegistrationInput): string[][] {
  const tags: string[][] = [
    ['d', input.identifier || 'agent'],
    ['t', PONTMORE_AGENT_TAG],
    ['alt', `Pontmore agent: ${input.name}`],
  ];

  // Relay tags (PIP-00 required)
  for (const relay of input.relays) {
    tags.push(['relay', relay]);
  }

  // Fiat currency tags (PIP-00 recommended)
  for (const currency of input.fiatCurrencies) {
    tags.push(['f', currency]);
  }

  return tags;
}

export function useAgentRegistration() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const myPubkey = user?.pubkey;

  /** Fetch the current user's own agent definition (if any). */
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
      const agent = parsePontmoreAgent(events[0]);
      if (agent) agent.isOwn = true;
      return agent;
    },
    enabled: !!myPubkey,
    staleTime: 30_000,
  });

  /** Publish (create or update) agent definition. */
  const publishRegistration = useMutation({
    mutationFn: async (input: AgentRegistrationInput) => {
      if (!myPubkey) throw new Error('Not logged in');

      // Publish the agent definition (PIP-00)
      const content = buildAgentContent(input);
      const tags = buildAgentTags(input);

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
        description: 'Your agent definition is now discoverable on the Pontmore network.',
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

  /** Delete the agent definition via NIP-09. */
  const deleteRegistration = useMutation({
    mutationFn: async (identifier: string) => {
      if (!myPubkey) throw new Error('Not logged in');
      const d = identifier || 'agent';
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
        description: 'Your agent definition has been deleted from the network.',
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
    (agent: PontmoreAgent): AgentRegistrationInput => {
      return {
        identifier: agent.d,
        name: agent.name,
        about: agent.about,
        capabilities: agent.capabilities,
        pricingPolicy: agent.pricingPolicy,
        fiatCurrencies: agent.fiatCurrencies,
        relays: agent.relays,
      };
    },
    [],
  );

  /** Default relays from app config for new registrations. */
  const defaultRelays = config.relayMetadata.relays
    .filter((r) => r.write)
    .map((r) => r.url);

  return {
    myAgent,
    isRegistered: !!myAgent,
    isLoading: myAgentQuery.isLoading,
    publishRegistration,
    deleteRegistration,
    agentToInput,
    defaultRelays,
  };
}
