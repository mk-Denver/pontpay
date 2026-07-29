/**
 * useUnifiedWallet — provides a single interface for wallet operations.
 *
 * Supports NWC (Nostr Wallet Connect) remote Lightning wallets.
 */

import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useLightningWallet } from '@/hooks/useLightningWallet';

export type WalletType = 'nwc' | null;

export interface UnifiedWallet {
  /** Which wallet type is active. */
  walletType: WalletType;
  /** Set the active wallet type. */
  setWalletType: (type: WalletType) => void;
  /** Whether any wallet is connected. */
  hasWallet: boolean;
  /** Wallet display name. */
  walletAlias: string | undefined;
  /** Current balance in sats. */
  balance: number;
  /** Balance is loading. */
  balanceLoading: boolean;
  /** Create a Lightning invoice to receive sats. */
  makeInvoice: (amountSats: number, memo?: string) => Promise<{ invoice: string; paymentHash: string; quoteId?: string } | null>;
  /** Pay a Lightning invoice. */
  payInvoice: (bolt11: string) => Promise<{ preimage: string } | null>;
  /** Is a payment in progress. */
  isPaying: boolean;
  /** Is an invoice being created. */
  isCreatingInvoice: boolean;
  /** Refresh balance. */
  refreshBalance: () => void;
}

export function useUnifiedWallet(): UnifiedWallet {
  const [walletType, setWalletType] = useLocalStorage<WalletType>('pontpay-wallet-type', null);

  const nwc = useLightningWallet();

  const activeType: WalletType = walletType ?? (nwc.hasWallet ? 'nwc' : null);

  if (activeType === 'nwc') {
    return {
      walletType: activeType,
      setWalletType,
      hasWallet: nwc.hasWallet,
      walletAlias: nwc.walletAlias,
      balance: nwc.balance,
      balanceLoading: nwc.balanceLoading,
      makeInvoice: nwc.makeInvoice,
      payInvoice: nwc.payInvoice,
      isPaying: nwc.isPaying,
      isCreatingInvoice: nwc.isCreatingInvoice,
      refreshBalance: nwc.refreshBalance,
    };
  }

  // No wallet connected
  return {
    walletType: null,
    setWalletType,
    hasWallet: false,
    walletAlias: undefined,
    balance: 0,
    balanceLoading: false,
    makeInvoice: async () => null,
    payInvoice: async () => null,
    isPaying: false,
    isCreatingInvoice: false,
    refreshBalance: () => {},
  };
}