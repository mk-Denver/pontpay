/**
 * useAgentRegistration — publish, update, delete, and fetch the current
 * user's own Pontmore agent definition (kind 30360, PIP-00).
 *
 * Per the mk/nip69-offers-swap-v1 spec:
 *
 * PIP-00 (Agent Definition, kind 30360):
 *   content: { version: 1, capabilities: ["pontmore/swap@1"] }
 *   tags: d, t=agent, t=pontmore-capability:<id>@<version>, a (escrow ref with "escrow" marker)
 *   name/about belong in the standard Nostr profile event (kind 0)
 *
 * PIP-01 (Escrow Descriptor, kind 30361):
 *   content: { version, escrow_type, networks, expires_at, service? }
 *   tags: d, t=pontmore-network:<network>
 *
 * NIP-69 Offers (kind 38383):
 *   Standing swap offers carrying price, fiat range, payment channels, escrow ref.
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
  PONTMORE_ESCROW_KIND,
  PONTMORE_OFFER_KIND,
  PONTMORE_SWAP_PROFILE,
  parsePontmoreAgent,
  swapTypeToDirection,
  type PontmoreAgent,
  type SwapType,
} from '@/lib/pontmore';

/** Input parameters for publishing an agent definition + escrow + offer. */
export interface AgentRegistrationInput {
  /** Stable identifier (d-tag), usually "agent". */
  identifier: string;
  /** Display name — published in kind 0 profile event. */
  name: string;
  /** About / bio — published in kind 0 profile event. */
  about: string;

  // ── Escrow descriptor (PIP-01, kind 30361) ──
  /** Escrow descriptor d-tag. */
  escrowDTag: string;
  /** Escrow type: "lightning_hold_invoice", "custodial_escrow", or "cashu_escrow". */
  escrowType: string;
  /** Settlement networks (lowercase). */
  escrowNetworks: string[];
  /** Descriptor expiry (Unix timestamp). */
  escrowExpiresAt: number;
  /** Optional service schema type ("openapi" or "asyncapi"). */
  serviceSchemaType?: string;
  /** Optional service schema URL (https://). */
  serviceSchemaUrl?: string;

  // ── NIP-69 Offer (kind 38383) ──
  /** Offer swap direction (buy = fiat_to_btc, sell = btc_to_fiat). */
  direction: SwapType;
  /** ISO 4217 fiat currency. */
  currency: string;
  /** Exact fiat amount per BTC (decimal string). */
  price: string;
  /** Minimum fiat amount. */
  faMin: string;
  /** Maximum fiat amount. */
  faMax: string;
  /** Payment channel identifiers (versioned, e.g. "mpesa-ke-kes@1"). */
  paymentChannels: string[];
  /** Bitcoin network ("mainnet", "testnet"). */
  network: string;
  /** Settlement layer (e.g. "lightning"). */
  layer: string;
  /** Offer expiry (Unix timestamp). */
  offerExpiresAt: number;
  /** Optional resolver pubkey. */
  resolverPubkey?: string;

  // ── Relay preferences (display only; relay list is managed separately) ──
  relays: string[];
}

const DAY = 86_400;

function defaultInput(): AgentRegistrationInput {
  const now = Math.floor(Date.now() / 1000);
  return {
    identifier: 'agent',
    name: '',
    about: '',
    escrowDTag: 'escrow',
    escrowType: 'custodial_escrow',
    escrowNetworks: ['lightning'],
    escrowExpiresAt: now + 30 * DAY,
    serviceSchemaType: '',
    serviceSchemaUrl: '',
    direction: 'sell',
    currency: 'KES',
    price: '',
    faMin: '1000',
    faMax: '100000',
    paymentChannels: ['mpesa-ke-kes@1'],
    network: 'mainnet',
    layer: 'lightning',
    offerExpiresAt: now + 7 * DAY,
    resolverPubkey: '',
    relays: [],
  };
}

/** Build the JSON content for a kind 30360 event (PIP-00). */
function buildAgentContent(): string {
  return JSON.stringify({
    version: 1,
    capabilities: [PONTMORE_SWAP_PROFILE],
  });
}

/** Build the tag array for a kind 30360 event (PIP-00). */
function buildAgentTags(input: AgentRegistrationInput, pubkey: string): string[][] {
  const tags: string[][] = [
    ['d', input.identifier || 'agent'],
    ['t', PONTMORE_AGENT_TAG],
    ['t', `pontmore-capability:${PONTMORE_SWAP_PROFILE}`],
    ['alt', `Pontmore agent: ${input.name || 'unnamed'}`],
    ['a', `${PONTMORE_ESCROW_KIND}:${pubkey}:${input.escrowDTag || 'escrow'}`, '', 'escrow'],
  ];
  return tags;
}

/** Build the JSON content for a kind 30361 escrow descriptor (PIP-01). */
function buildEscrowContent(input: AgentRegistrationInput): string {
  const content: Record<string, unknown> = {
    version: 1,
    escrow_type: input.escrowType,
    networks: input.escrowNetworks,
    expires_at: input.escrowExpiresAt,
  };

  if (input.serviceSchemaType && input.serviceSchemaUrl) {
    content.service = {
      schema: {
        type: input.serviceSchemaType,
        url: input.serviceSchemaUrl,
      },
    };
  }

  return JSON.stringify(content);
}

/** Build the tags for a kind 30361 escrow descriptor (PIP-01). */
function buildEscrowTags(input: AgentRegistrationInput): string[][] {
  const tags: string[][] = [
    ['d', input.escrowDTag || 'escrow'],
    ['alt', `Pontmore escrow: ${input.escrowType}`],
  ];
  for (const network of input.escrowNetworks) {
    tags.push(['t', `pontmore-network:${network}`]);
  }
  return tags;
}

/** Build the JSON content for a NIP-69 offer (kind 38383). Content MUST be empty. */
function buildOfferContent(): string {
  return '';
}

/** Build the tags for a NIP-69 offer (kind 38383, pontmore/swap@1). */
function buildOfferTags(input: AgentRegistrationInput, pubkey: string): string[][] {
  const k = input.direction === 'buy' ? 'sell' : 'buy';
  const d = `pontmore/swap@1:${input.currency}:${k}`;

  const tags: string[][] = [
    ['d', d],
    ['k', k],
    ['f', input.currency],
    ['s', 'pending'],
    ['amt', '0'],
    ['fa', input.faMin],
    ['fa', input.faMax],
    ['y', 'pontmore'],
    ['z', 'order'],
    ['protocol', PONTMORE_SWAP_PROFILE],
    ['price', input.price],
    ['network', input.network],
    ['layer', input.layer],
    ['expires_at', input.offerExpiresAt.toString()],
    ['expiration', (input.offerExpiresAt + DAY).toString()],
  ];

  for (const ch of input.paymentChannels) {
    tags.push(['channels', ch]);
    tags.push(['pm', ch]);
  }

  // Escrow descriptor address reference
  tags.push([
    'a',
    `${PONTMORE_ESCROW_KIND}:${pubkey}:${input.escrowDTag || 'escrow'}`,
    '',
    'escrow',
  ]);

  // Resolver pubkey (optional)
  if (input.resolverPubkey) {
    tags.push(['p', input.resolverPubkey, '', 'core/resolver']);
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

  /** Publish (create or update) agent definition + escrow descriptor + offer + profile. */
  const publishRegistration = useMutation({
    mutationFn: async (input: AgentRegistrationInput) => {
      if (!myPubkey) throw new Error('Not logged in');

      // 1. Publish/update kind 0 profile (name, about) — merge with existing
      try {
        const [existingProfile] = await nostr.query(
          [{ kinds: [0], authors: [myPubkey], limit: 1 }],
          { signal: AbortSignal.timeout(5000) },
        );

        let profile: Record<string, unknown> = {};
        if (existingProfile) {
          try {
            profile = JSON.parse(existingProfile.content);
          } catch {
            // start fresh
          }
        }

        if (input.name) profile.name = input.name;
        if (input.about) profile.about = input.about;

        await publishEvent({
          kind: 0,
          content: JSON.stringify(profile),
          tags: [],
        });
      } catch {
        // profile update is best-effort
      }

      // 2. Publish companion escrow descriptor (PIP-01, kind 30361) first
      await publishEvent({
        kind: PONTMORE_ESCROW_KIND,
        content: buildEscrowContent(input),
        tags: buildEscrowTags(input),
      });

      // 3. Publish the agent definition (PIP-00, kind 30360)
      const agentEvent = await publishEvent({
        kind: PONTMORE_AGENT_KIND,
        content: buildAgentContent(),
        tags: buildAgentTags(input, myPubkey),
      });

      // 4. Publish NIP-69 offer (kind 38383) if price is set
      if (input.price && input.currency) {
        try {
          await publishEvent({
            kind: PONTMORE_OFFER_KIND,
            content: buildOfferContent(),
            tags: buildOfferTags(input, myPubkey),
          });
        } catch {
          // offer is optional — failure is non-fatal
        }
      }

      return agentEvent;
    },
    onSuccess: () => {
      toast({
        title: 'Agent listing published',
        description: 'Your agent definition, escrow descriptor, and offer are now on the Pontmore network.',
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
        kind: 5,
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
    (_agent: PontmoreAgent): AgentRegistrationInput => {
      return defaultInput();
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
    defaultInput,
  };
}
