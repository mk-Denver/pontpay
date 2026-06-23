/**
 * useSuperAgent — manages the BTCPay Server hub-and-spoke architecture.
 *
 * Two roles:
 * - Super Agent: operates the BTCPay Server, creates stores, issues API keys
 * - Local Agent: connects via a scoped API key to a Super Agent's store
 *
 * The Super Agent's Nostr pubkey is declared as custody_authority,
 * release_authority, and refund_authority in the PIP-01 escrow descriptor.
 */

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useToast } from '@/hooks/useToast';
import { useQueryClient } from '@tanstack/react-query';
import {
  type BtcPayConfig,
  type BtcPayStore,
  type BtcPayInvoice,
  type CreateInvoiceParams,
  type BtcPayInvoiceStatus,
  createInvoice as btcCreateInvoice,
  getInvoice as btcGetInvoice,
  settleInvoice as btcSettleInvoice,
  cancelInvoice as btcCancelInvoice,
  listStores as btcListStores,
  createStore as btcCreateStore,
  createApiKey as btcCreateApiKey,
  pollInvoiceStatus as btcPollInvoiceStatus,
} from '@/lib/btcpay';

export type AgentRole = 'super' | 'local' | null;

/** How a user or local agent receives their Bitcoin payout. */
export type PayoutMethod = 'lightning_address' | 'nwc' | 'cashu';

/** Persisted payout configuration. */
export interface PayoutConfig {
  method: PayoutMethod;
  /** Lightning address (e.g. user@blink.sv) for lightning_address method. */
  lightningAddress?: string;
  /** NWC connection string for nwc method. */
  nwcConnectionString?: string;
}

/** Persisted BTCPay connection config. */
export interface BtcPayConnection {
  serverUrl: string;
  apiKey: string;
  storeId: string;
  /** Super Agent's Nostr pubkey (for escrow authority roles). */
  superAgentPubkey?: string;
  /** Store name / label. */
  storeName?: string;
  /** API key label (for local agents, set by super agent). */
  apiKeyLabel?: string;
  /** How this local agent receives Bitcoin payouts. */
  payout?: PayoutConfig;
}

/** A store created by the super agent for a local agent. */
export interface LocalAgentStore {
  storeId: string;
  name: string;
  apiKey?: string;
  apiKeyLabel?: string;
  createdAt: number;
}

/** A BTCPay hold invoice used as escrow in a swap. */
export interface HoldInvoice {
  invoiceId: string;
  bolt11: string;
  amount: number;
  status: BtcPayInvoiceStatus;
  checkoutLink: string;
  createdTime: number;
  expirationTime: number;
}

export function useSuperAgent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Agent role (super or local)
  const [role, setRole] = useLocalStorage<AgentRole>('pontpay-agent-role', null);

  // BTCPay connection config (for local agents connecting to a super agent)
  const [connection, setConnection] = useLocalStorage<BtcPayConnection | null>(
    'pontpay-btcpay-connection',
    null,
  );

  // Super Agent: stores created for local agents
  const [localAgentStores, setLocalAgentStores] = useLocalStorage<LocalAgentStore[]>(
    'pontpay-local-agent-stores',
    [],
  );

  const [isCreatingStore, setIsCreatingStore] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);

  /** Get the current BTCPay config (from connection). */
  const btcPayConfig: BtcPayConfig | null = connection
    ? {
        serverUrl: connection.serverUrl,
        apiKey: connection.apiKey,
        storeId: connection.storeId,
      }
    : null;

  // ─── Super Agent: Store & API Key Management ──────────────────

  /** Super Agent: Create a new store for a local agent. */
  const createStoreForAgent = useMutation({
    mutationFn: async (params: {
      adminConfig: BtcPayConfig;
      agentName: string;
      defaultCurrency?: string;
    }) => {
      setIsCreatingStore(true);
      const store = await btcCreateStore(params.adminConfig, params.agentName, params.defaultCurrency);

      // Generate a scoped API key for this store
      setIsGeneratingKey(true);
      const apiKeyResult = await btcCreateApiKey(
        params.adminConfig,
        store.id,
        `Local Agent: ${params.agentName}`,
      );
      setIsGeneratingKey(false);

      const newStore: LocalAgentStore = {
        storeId: store.id,
        name: params.agentName,
        apiKey: apiKeyResult.apiKey,
        apiKeyLabel: `Local Agent: ${params.agentName}`,
        createdAt: Date.now(),
      };

      setLocalAgentStores((prev) => [...prev, newStore]);
      return { store, apiKey: apiKeyResult };
    },
    onSuccess: (data) => {
      toast({
        title: 'Store created',
        description: `Store "${data.store.name}" created with scoped API key for the local agent.`,
      });
      queryClient.invalidateQueries({ queryKey: ['btcpay'] });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Failed to create store',
        description: msg,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsCreatingStore(false);
      setIsGeneratingKey(false);
    },
  });

  /** Super Agent: List all stores. */
  const listStores = useMutation({
    mutationFn: async (adminConfig: BtcPayConfig) => {
      return btcListStores(adminConfig);
    },
  });

  // ─── Local Agent: Connection ──────────────────────────────────

  /** Local Agent: Connect to a Super Agent's BTCPay Server. */
  const connectToSuperAgent = useCallback(
    (params: {
      serverUrl: string;
      apiKey: string;
      storeId: string;
      superAgentPubkey?: string;
      storeName?: string;
      payout?: PayoutConfig;
    }) => {
      const conn: BtcPayConnection = {
        serverUrl: params.serverUrl,
        apiKey: params.apiKey,
        storeId: params.storeId,
        superAgentPubkey: params.superAgentPubkey,
        storeName: params.storeName,
        payout: params.payout,
      };
      setConnection(conn);
      setRole('local');
      toast({
        title: 'Connected to Super Agent',
        description: `You are now connected to the BTCPay Server at ${params.serverUrl}.`,
      });
    },
    [setConnection, setRole, toast],
  );

  /** Update payout configuration for the current connection. */
  const updatePayoutConfig = useCallback(
    (payout: PayoutConfig) => {
      setConnection((prev) => prev ? { ...prev, payout } : prev);
      toast({
        title: 'Payout method updated',
        description: payout.method === 'lightning_address'
          ? `Settlements will go to ${payout.lightningAddress}`
          : payout.method === 'nwc'
          ? 'Settlements will go to your NWC wallet'
          : 'Settlements will go to your Cashu wallet',
      });
    },
    [setConnection, toast],
  );

  /** Disconnect from the Super Agent's server. */
  const disconnect = useCallback(() => {
    setConnection(null);
    setRole(null);
    toast({
      title: 'Disconnected',
      description: 'You have been disconnected from the BTCPay Server.',
    });
  }, [setConnection, setRole, toast]);

  // ─── Escrow: Hold Invoice Operations ──────────────────────────

  /**
   * Create a Lightning hold invoice via BTCPay Server.
   * The customer pays this invoice to lock funds in escrow.
   * Status transitions: New → Paid → Processing (locked) → Settled
   */
  const createHoldInvoice = useMutation({
    mutationFn: async (params: CreateInvoiceParams): Promise<HoldInvoice> => {
      if (!btcPayConfig) throw new Error('Not connected to BTCPay Server');
      const invoice = await btcCreateInvoice(btcPayConfig, params);
      return {
        invoiceId: invoice.id,
        bolt11: invoice.bolt11 || invoice.paymentLink || '',
        amount: parseFloat(invoice.amount),
        status: invoice.status,
        checkoutLink: invoice.checkoutLink,
        createdTime: invoice.createdTime,
        expirationTime: invoice.expirationTime,
      };
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Failed to create hold invoice',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  /** Check the status of a hold invoice. */
  const checkInvoiceStatus = useCallback(
    async (invoiceId: string): Promise<HoldInvoice | null> => {
      if (!btcPayConfig) return null;
      try {
        const invoice = await btcGetInvoice(btcPayConfig, invoiceId);
        return {
          invoiceId: invoice.id,
          bolt11: invoice.bolt11 || invoice.paymentLink || '',
          amount: parseFloat(invoice.amount),
          status: invoice.status,
          checkoutLink: invoice.checkoutLink,
          createdTime: invoice.createdTime,
          expirationTime: invoice.expirationTime,
        };
      } catch {
        return null;
      }
    },
    [btcPayConfig],
  );

  /**
   * Settle a hold invoice — called when the Local Agent confirms
   * physical settlement (cash handed to customer) and the preimage
   * is revealed. The Super Agent's node executes the claim.
   */
  const settleHoldInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      if (!btcPayConfig) throw new Error('Not connected to BTCPay Server');
      await btcSettleInvoice(btcPayConfig, invoiceId);
    },
    onSuccess: () => {
      toast({
        title: 'Invoice settled',
        description: 'The hold invoice has been settled. Bitcoin claimed.',
      });
      queryClient.invalidateQueries({ queryKey: ['btcpay'] });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Failed to settle invoice',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  /**
   * Cancel a hold invoice — called by the Super Agent (as
   * refund_authority) when a dispute is resolved in favor of the
   * customer, or when a swap times out.
   */
  const cancelHoldInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      if (!btcPayConfig) throw new Error('Not connected to BTCPay Server');
      await btcCancelInvoice(btcPayConfig, invoiceId);
    },
    onSuccess: () => {
      toast({
        title: 'Invoice cancelled',
        description: 'The hold invoice has been cancelled. Funds returned to customer.',
      });
      queryClient.invalidateQueries({ queryKey: ['btcpay'] });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: 'Failed to cancel invoice',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  /**
   * Poll an invoice until it reaches a target status.
   * Used to detect when a hold invoice is funded (Processing).
   */
  const pollInvoice = useCallback(
    async (
      invoiceId: string,
      targetStatuses: BtcPayInvoiceStatus[],
      intervalMs?: number,
      timeoutMs?: number,
    ): Promise<HoldInvoice | null> => {
      if (!btcPayConfig) return null;
      try {
        const invoice = await btcPollInvoiceStatus(
          btcPayConfig,
          invoiceId,
          targetStatuses,
          intervalMs,
          timeoutMs,
        );
        return {
          invoiceId: invoice.id,
          bolt11: invoice.bolt11 || invoice.paymentLink || '',
          amount: parseFloat(invoice.amount),
          status: invoice.status,
          checkoutLink: invoice.checkoutLink,
          createdTime: invoice.createdTime,
          expirationTime: invoice.expirationTime,
        };
      } catch {
        return null;
      }
    },
    [btcPayConfig],
  );

  // ─── Store management for Super Agent ─────────────────────────

  /** Remove a local agent store from the local list. */
  const removeLocalAgentStore = useCallback(
    (storeId: string) => {
      setLocalAgentStores((prev) => prev.filter((s) => s.storeId !== storeId));
      toast({ title: 'Store removed', description: 'Local agent store removed from list.' });
    },
    [setLocalAgentStores, toast],
  );

  return {
    // Role
    role,
    setRole,
    isSuperAgent: role === 'super',
    isLocalAgent: role === 'local',

    // Connection
    connection,
    btcPayConfig,
    isConnected: !!btcPayConfig,
    connectToSuperAgent,
    disconnect,

    // Payout configuration
    payoutConfig: connection?.payout ?? null,
    updatePayoutConfig,

    // Super Agent: store management
    localAgentStores,
    createStoreForAgent,
    listStores,
    removeLocalAgentStore,
    isCreatingStore,
    isGeneratingKey,

    // Escrow: hold invoice operations
    createHoldInvoice,
    checkInvoiceStatus,
    settleHoldInvoice,
    cancelHoldInvoice,
    pollInvoice,

    // Super Agent's pubkey (for escrow authority roles)
    superAgentPubkey: connection?.superAgentPubkey,
  };
}
