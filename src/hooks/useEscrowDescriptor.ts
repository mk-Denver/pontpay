/**
 * useEscrowDescriptor — publish and query PIP-01 escrow descriptor events
 * (kind 30361, addressable). An agent must publish at least one escrow
 * descriptor and reference it from their agent definition (kind 30360).
 *
 * PIP-01 v2 content: { version, escrow_type, networks, expires_at, service? }
 */

import { useNostr } from '@nostrify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import {
  PONTMORE_ESCROW_KIND,
  parsePontmoreEscrow,
  type PontmoreEscrow,
} from '@/lib/pontmore';

export interface EscrowDescriptorInput {
  /** Stable identifier (d-tag), usually "default". */
  identifier: string;
  /** Escrow type: "lightning_hold_invoice", "custodial_escrow", or "cashu_escrow". */
  escrowType: string;
  /** Settlement networks (lowercase). */
  networks: string[];
  /** Unix timestamp after which the descriptor cannot be selected. */
  expiresAt: number;
  /** Optional service schema type. */
  serviceSchemaType?: string;
  /** Optional service schema URL (https://). */
  serviceSchemaUrl?: string;
}

/** Build the JSON content for a kind 30361 event per PIP-01. */
function buildEscrowContent(input: EscrowDescriptorInput): string {
  const content: Record<string, unknown> = {
    version: 1,
    escrow_type: input.escrowType,
    networks: input.networks,
    expires_at: input.expiresAt,
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

export function useEscrowDescriptor() {
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /** Publish (create or update) an escrow descriptor. */
  const publishEscrow = useMutation({
    mutationFn: async (input: EscrowDescriptorInput) => {
      const content = buildEscrowContent(input);
      const tags: string[][] = [
        ['d', input.identifier || 'default'],
        ['alt', `Pontmore escrow: ${input.escrowType}`],
      ];

      for (const network of input.networks) {
        tags.push(['t', `pontmore-network:${network}`]);
      }

      const event = await publishEvent({
        kind: PONTMORE_ESCROW_KIND,
        content,
        tags,
      });

      return event;
    },
    onSuccess: () => {
      toast({
        title: 'Escrow descriptor published',
        description: 'Your escrow configuration is now referenced by your agent listing.',
      });
      queryClient.invalidateQueries({ queryKey: ['pontmore'] });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Failed to publish escrow descriptor',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  /** Fetch escrow descriptors by a specific author. */
  const useAuthorEscrow = (pubkey: string | undefined) =>
    useQuery<PontmoreEscrow | null, Error>({
      queryKey: ['pontmore', 'escrow', pubkey ?? ''],
      queryFn: async (c) => {
        if (!pubkey) return null;
        const [event] = await nostr.query(
          [{ kinds: [PONTMORE_ESCROW_KIND], authors: [pubkey], limit: 1 }],
          { signal: c.signal },
        );
        if (!event) return null;
        return parsePontmoreEscrow(event);
      },
      enabled: !!pubkey,
      staleTime: 60_000,
    });

  return {
    publishEscrow,
    useAuthorEscrow,
  };
}
