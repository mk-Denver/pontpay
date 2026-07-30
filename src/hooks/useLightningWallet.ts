/**
 * useLightningWallet — extends NWC connectivity with balance queries,
 * invoice creation, and payment. Uses the @getalby/sdk NostrWebLNProvider
 * which wraps NWC in a standard WebLN interface.
 */

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NostrWebLNProvider } from '@getalby/sdk';
import type { WebLNProvider } from '@webbtc/webln-types';
import { useNWC } from '@/hooks/useNWCContext';
import { useToast } from '@/hooks/useToast';

export interface MakeInvoiceResult {
  invoice: string;
  paymentHash: string;
}

export interface PaymentResult {
  preimage: string;
}

/** Create a WebLN provider from an NWC connection string. */
function createProvider(connectionString: string): WebLNProvider | null {
  try {
    const provider = new NostrWebLNProvider({
      nostrWalletConnectUrl: connectionString,
    });
    return provider as unknown as WebLNProvider;
  } catch {
    return null;
  }
}

export function useLightningWallet() {
  const { getActiveConnection } = useNWC();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPaying, setIsPaying] = useState(false);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);

  const activeConnection = getActiveConnection();
  const connectionString = activeConnection?.connectionString;

  const { data: balance, ...balanceQuery } = useQuery<number, Error>({
    queryKey: ['pontmore', 'wallet-balance', connectionString ?? ''],
    queryFn: async () => {
      if (!connectionString) return 0;
      const provider = createProvider(connectionString);
      if (!provider) return 0;
      await provider.enable?.();
      const result = await provider.getBalance?.();
      return result?.balance ?? 0;
    },
    enabled: !!connectionString,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const refreshBalance = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['pontmore', 'wallet-balance'],
    });
  }, [queryClient]);

  /** Create a Lightning invoice to receive sats into the connected wallet. */
  const makeInvoice = useCallback(
    async (amountSats: number, memo?: string): Promise<MakeInvoiceResult | null> => {
      if (!connectionString) {
        toast({
          title: 'No wallet connected',
          description: 'Connect a Lightning wallet first to receive payments.',
          variant: 'destructive',
        });
        return null;
      }

      setIsCreatingInvoice(true);
      try {
        const provider = createProvider(connectionString);
        if (!provider) throw new Error('Failed to create wallet provider');
        await provider.enable?.();
        const result = await provider.makeInvoice({
          amount: amountSats,
          defaultMemo: memo ?? 'Pontmore swap',
        });
        return {
          invoice: result.paymentRequest,
          paymentHash: (result as { paymentHash?: string }).paymentHash ?? '',
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        toast({
          title: 'Failed to create invoice',
          description: msg,
          variant: 'destructive',
        });
        return null;
      } finally {
        setIsCreatingInvoice(false);
      }
    },
    [connectionString, toast],
  );

  /** Pay a BOLT11 Lightning invoice from the connected wallet. */
  const payInvoice = useCallback(
    async (invoice: string): Promise<PaymentResult | null> => {
      if (!connectionString) {
        toast({
          title: 'No wallet connected',
          description: 'Connect a Lightning wallet first to send payments.',
          variant: 'destructive',
        });
        return null;
      }

      setIsPaying(true);
      try {
        const provider = createProvider(connectionString);
        if (!provider) throw new Error('Failed to create wallet provider');
        await provider.enable?.();
        const result = await provider.sendPayment(invoice);
        toast({
          title: 'Payment sent',
          description: 'Lightning payment settled successfully.',
        });
        refreshBalance();
        return { preimage: result.preimage };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        toast({
          title: 'Payment failed',
          description: msg,
          variant: 'destructive',
        });
        return null;
      } finally {
        setIsPaying(false);
      }
    },
    [connectionString, toast, refreshBalance],
  );

  return {
    hasWallet: !!connectionString,
    walletAlias: activeConnection?.alias,
    balance: balance ?? 0,
    balanceLoading: balanceQuery.isLoading,
    refreshBalance,
    makeInvoice,
    payInvoice,
    isPaying,
    isCreatingInvoice,
  };
}
