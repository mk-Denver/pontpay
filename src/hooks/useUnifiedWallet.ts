/**
 * useUnifiedWallet — provides a single interface for wallet operations
 * regardless of whether the user is using:
 * - NWC (Nostr Wallet Connect) — remote Lightning wallet
 * - Cashu — native in-browser ecash wallet
 *
 * The Pontmore swap flows (deposit, withdraw, transfer) call this hook
 * instead of useLightningWallet directly, so users can choose their
 * preferred wallet type.
 */

import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useLightningWallet } from '@/hooks/useLightningWallet';
import { useCashuWallet } from '@/hooks/useCashuWallet';

export type WalletType = 'nwc' | 'cashu' | null;

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
  const cashu = useCashuWallet();

  // Determine which wallet is active
  const activeType: WalletType = walletType ?? (nwc.hasWallet ? 'nwc' : cashu.hasWallet ? 'cashu' : null);

  if (activeType === 'cashu') {
    return {
      walletType: activeType,
      setWalletType,
      hasWallet: cashu.hasWallet,
      walletAlias: cashu.selectedMint?.name,
      balance: cashu.balance,
      balanceLoading: !cashu.isInitialized,
      makeInvoice: cashu.makeInvoice,
      payInvoice: cashu.payInvoice,
      isPaying: cashu.isPaying,
      isCreatingInvoice: cashu.isCreatingInvoice,
      refreshBalance: () => {
        // Cashu balance is derived from local proofs — no refresh needed
      },
    };
  }

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
