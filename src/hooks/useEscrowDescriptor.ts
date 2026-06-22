/**
 * useEscrowDescriptor — publish and query PIP-01 escrow descriptor events
 * (kind 30361, addressable). An agent must publish at least one escrow
 * descriptor and reference it from their agent definition (kind 30360).
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
  /** Escrow subtype: "lightning_hold_invoice" or "custodial_escrow". */
  escrowType: string;
  /** Settlement networks: ["bitcoin", "lightning"]. */
  networks: string[];
  /** Funding rules (e.g. { required_confirmation: "invoice_held" }). */
  fundingRules: Record<string, string>;
  /** Release rules (e.g. { release_trigger: "counterparty_fiat_payment_confirmed" }). */
  releaseRules: Record<string, string>;
  /** Dispute rules (e.g. { policy: "operator_resolved" }). */
  disputeRules: Record<string, string>;
  /** Reference format: "bolt11", "bolt11_or_custodial_escrow_reference", etc. */
  referenceFormat: string;
  /** Invoice network (for lightning_hold_invoice subtype). */
  invoiceNetwork?: string;
  /** Payout network. */
  payoutNetwork?: string;
}

/** Build the JSON content for a kind 30361 event. */
function buildEscrowContent(input: EscrowDescriptorInput): string {
  const content: Record<string, unknown> = {
    version: 1,
    escrow_type: input.escrowType,
    networks: input.networks,
    funding_rules: input.fundingRules,
    release_rules: input.releaseRules,
    dispute_rules: input.disputeRules,
    reference_format: input.referenceFormat,
    updated_at: Math.floor(Date.now() / 1000),
  };

  if (input.invoiceNetwork) content.invoice_network = input.invoiceNetwork;
  if (input.payoutNetwork) content.payout_network = input.payoutNetwork;

  // Add custodial fields if applicable
  if (input.escrowType === 'custodial_escrow') {
    content.custody_authority = 'escrow_operator';
    content.release_authority = 'escrow_operator';
    content.refund_authority = 'escrow_operator';
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
      ];

      // Emit network tags for relay filtering (PIP-01)
      for (const network of input.networks) {
        tags.push(['network', network]);
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
