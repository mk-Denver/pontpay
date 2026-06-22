/**
 * useCashuWallet — native in-browser Bitcoin ecash wallet powered by
 * the Cashu protocol. Non-custodial: the user holds a BIP39 seed phrase
 * and all proofs are stored locally.
 *
 * Inspired by https://github.com/Codepocketdev/satoshi-pay-wallet
 *
 * Uses @cashu/cashu-ts v4 API where:
 * - CashuWallet → Wallet
 * - CashuMint → Mint
 * - Must call wallet.loadMint() after construction
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Wallet as CashuWalletInstance,
  Mint as CashuMintInstance,
  getEncodedToken,
  getDecodedToken,
  type Proof,
} from '@cashu/cashu-ts';
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useToast } from '@/hooks/useToast';

/** Default public Cashu mints. */
export const DEFAULT_MINTS = [
  { name: 'Bitcoin for Plebs', url: 'https://mint.btcforplebs.com' },
  { name: 'Kashu', url: 'https://kashu.me' },
  { name: 'Minibits', url: 'https://mint.minibits.cash/Bitcoin' },
];

export interface CashuMintConfig {
  name: string;
  url: string;
}

export interface CashuTransaction {
  id: string;
  type: 'mint' | 'melt' | 'send' | 'receive';
  amount: number;
  memo?: string;
  mint: string;
  status: 'pending' | 'paid' | 'failed';
  timestamp: number;
  token?: string;
  invoice?: string;
}

export interface MakeInvoiceResult {
  invoice: string;
  paymentHash: string;
}

export interface PaymentResult {
  preimage: string;
}

export function useCashuWallet() {
  const { toast } = useToast();

  // Persisted state
  const [seedPhrase, setSeedPhrase] = useLocalStorage<string | null>('cashu-seed', null);
  const [selectedMintUrl, setSelectedMintUrl] = useLocalStorage<string>(
    'cashu-selected-mint',
    DEFAULT_MINTS[0].url,
  );
  const [customMints, setCustomMints] = useLocalStorage<CashuMintConfig[]>(
    'cashu-custom-mints',
    [],
  );
  const [proofsByMint, setProofsByMint] = useLocalStorage<Record<string, Proof[]>>(
    'cashu-proofs',
    {},
  );
  const [txHistory, setTxHistory] = useLocalStorage<CashuTransaction[]>(
    'cashu-transactions',
    [],
  );
  const [isBackedUp, setIsBackedUp] = useLocalStorage<boolean>('cashu-backed-up', false);

  // Runtime state
  const [walletInstance, setWalletInstance] = useState<CashuWalletInstance | null>(null);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const allMints = [...DEFAULT_MINTS, ...customMints];
  const selectedMint = allMints.find((m) => m.url === selectedMintUrl) ?? allMints[0];

  // Derive BIP39 seed from mnemonic
  const bip39Seed = useMemo(() => {
    if (!seedPhrase) return null;
    try {
      return mnemonicToSeedSync(seedPhrase);
    } catch {
      return null;
    }
  }, [seedPhrase]);

  /** Calculate total balance across all mints. */
  const totalBalance = useMemo(() => {
    return Object.values(proofsByMint).reduce(
      (total, proofs) => total + proofs.reduce((sum, p) => sum + (p.amount || 0), 0),
      0,
    );
  }, [proofsByMint]);

  /** Balance for the selected mint. */
  const currentMintBalance = useMemo(() => {
    const proofs = proofsByMint[selectedMintUrl] ?? [];
    return proofs.reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [proofsByMint, selectedMintUrl]);

  /** Initialize the Cashu wallet for the selected mint. */
  useEffect(() => {
    if (!bip39Seed || !selectedMintUrl) return;

    let cancelled = false;

    const init = async () => {
      try {
        const wallet = new CashuWalletInstance(selectedMintUrl, {
          bip39seed: bip39Seed,
          unit: 'sat',
        });
        await wallet.loadMint();

        if (!cancelled) {
          setWalletInstance(wallet);
          setIsInitialized(true);
        }
      } catch (err) {
        console.error('Cashu wallet init error:', err);
        if (!cancelled) {
          toast({
            title: 'Wallet initialization failed',
            description: `Could not connect to mint: ${err instanceof Error ? err.message : 'Unknown error'}`,
            variant: 'destructive',
          });
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, [bip39Seed, selectedMintUrl, toast]);

  /** Create a new wallet with a fresh BIP39 seed phrase. */
  const createWallet = useCallback(() => {
    const mnemonic = generateMnemonic(wordlist);
    setSeedPhrase(mnemonic);
    setIsBackedUp(false);
    setProofsByMint({});
    setTxHistory([]);
    toast({
      title: 'Wallet created',
      description: 'Your new ecash wallet has been generated. Back up your seed phrase!',
    });
    return mnemonic;
  }, [setSeedPhrase, setIsBackedUp, setProofsByMint, setTxHistory, toast]);

  /** Restore a wallet from an existing BIP39 seed phrase. */
  const restoreWallet = useCallback(
    (mnemonic: string) => {
      setSeedPhrase(mnemonic);
      setIsBackedUp(true);
      toast({
        title: 'Wallet restored',
        description: 'Your wallet has been restored from the seed phrase.',
      });
    },
    [setSeedPhrase, setIsBackedUp, toast],
  );

  /** Mark the seed phrase as backed up. */
  const confirmBackup = useCallback(() => {
    setIsBackedUp(true);
  }, [setIsBackedUp]);

  /** Add a custom mint. */
  const addCustomMint = useCallback(
    (name: string, url: string) => {
      const exists = allMints.some((m) => m.url === url);
      if (exists) {
        toast({ title: 'Mint already exists', variant: 'destructive' });
        return;
      }
      setCustomMints([...customMints, { name, url }]);
      toast({ title: 'Mint added', description: name });
    },
    [allMints, customMints, setCustomMints, toast],
  );

  /** Remove a custom mint. */
  const removeCustomMint = useCallback(
    (url: string) => {
      setCustomMints(customMints.filter((m) => m.url !== url));
    },
    [customMints, setCustomMints],
  );

  /** Save proofs for a mint. */
  const saveProofs = useCallback(
    (mintUrl: string, proofs: Proof[]) => {
      setProofsByMint((prev) => ({ ...prev, [mintUrl]: proofs }));
    },
    [setProofsByMint],
  );

  /** Add a transaction to history. */
  const addTransaction = useCallback(
    (tx: Omit<CashuTransaction, 'id' | 'timestamp'>) => {
      const newTx: CashuTransaction = {
        ...tx,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
      };
      setTxHistory((prev) => [newTx, ...prev].slice(0, 100));
      return newTx;
    },
    [setTxHistory],
  );

  /**
   * Create a Lightning invoice to receive sats into the wallet (mint).
   * The user pays this invoice to receive ecash tokens from the mint.
   */
  const makeInvoice = useCallback(
    async (amountSats: number, memo?: string): Promise<MakeInvoiceResult | null> => {
      if (!walletInstance) {
        toast({
          title: 'Wallet not ready',
          description: 'Please wait for the wallet to initialize.',
          variant: 'destructive',
        });
        return null;
      }

      setIsCreatingInvoice(true);
      try {
        const quote = await walletInstance.createMintQuote(amountSats);

        addTransaction({
          type: 'mint',
          amount: amountSats,
          memo,
          mint: selectedMintUrl,
          status: 'pending',
          invoice: quote.quote,
        });

        return {
          invoice: quote.quote,
          paymentHash: quote.quote,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
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
    [walletInstance, selectedMintUrl, addTransaction, toast],
  );

  /**
   * Check if a mint quote has been paid and mint tokens.
   */
  const checkMintQuote = useCallback(
    async (quote: string, amountSats: number): Promise<boolean> => {
      if (!walletInstance) return false;
      try {
        const result = await walletInstance.checkMintQuote(quote);
        const newProofs = result?.proofs ?? [];
        if (newProofs.length > 0) {
          const existing = proofsByMint[selectedMintUrl] ?? [];
          saveProofs(selectedMintUrl, [...existing, ...newProofs]);

          addTransaction({
            type: 'mint',
            amount: amountSats,
            mint: selectedMintUrl,
            status: 'paid',
            invoice: quote,
          });

          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [walletInstance, selectedMintUrl, proofsByMint, saveProofs, addTransaction],
  );

  /**
   * Pay a Lightning invoice by melting ecash tokens (withdraw).
   */
  const payInvoice = useCallback(
    async (bolt11: string): Promise<PaymentResult | null> => {
      if (!walletInstance) {
        toast({
          title: 'Wallet not ready',
          description: 'Please wait for the wallet to initialize.',
          variant: 'destructive',
        });
        return null;
      }

      const proofs = proofsByMint[selectedMintUrl] ?? [];
      if (proofs.length === 0) {
        toast({
          title: 'Insufficient balance',
          description: 'No ecash tokens available to pay.',
          variant: 'destructive',
        });
        return null;
      }

      setIsPaying(true);
      try {
        const meltQuote = await walletInstance.createMeltQuote(bolt11);
        const result = await walletInstance.meltProofs(meltQuote, proofs);

        // Remove spent proofs and keep change
        const change = result?.change ?? [];
        saveProofs(selectedMintUrl, change);

        addTransaction({
          type: 'melt',
          amount: proofs.reduce((s, p) => s + p.amount, 0),
          mint: selectedMintUrl,
          status: 'paid',
          invoice: bolt11,
        });

        toast({
          title: 'Payment sent',
          description: 'Lightning invoice paid via ecash melt.',
        });

        return { preimage: result?.preimage ?? '' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
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
    [walletInstance, selectedMintUrl, proofsByMint, saveProofs, addTransaction, toast],
  );

  /**
   * Send ecash tokens to someone (off-chain, no Lightning needed).
   * Returns a token string that can be shared via text, QR, or Nostr DM.
   */
  const sendEcashTokens = useCallback(
    (amountSats: number): string | null => {
      if (!walletInstance) {
        toast({ title: 'Wallet not ready', variant: 'destructive' });
        return null;
      }

      const proofs = proofsByMint[selectedMintUrl] ?? [];
      const balance = proofs.reduce((s, p) => s + p.amount, 0);
      if (balance < amountSats) {
        toast({
          title: 'Insufficient balance',
          description: `You have ${balance} sats but need ${amountSats}.`,
          variant: 'destructive',
        });
        return null;
      }

      try {
        // Collect proofs that sum to >= amount
        let accumulated = 0;
        const tokensToSend: Proof[] = [];
        const remaining: Proof[] = [];

        for (const proof of proofs) {
          if (accumulated < amountSats) {
            tokensToSend.push(proof);
            accumulated += proof.amount;
          } else {
            remaining.push(proof);
          }
        }

        if (accumulated < amountSats) {
          toast({ title: 'Insufficient balance', variant: 'destructive' });
          return null;
        }

        const token = getEncodedToken({
          mint: selectedMintUrl,
          proofs: tokensToSend,
        });

        saveProofs(selectedMintUrl, remaining);

        addTransaction({
          type: 'send',
          amount: amountSats,
          mint: selectedMintUrl,
          status: 'paid',
          token,
        });

        return token;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        toast({
          title: 'Failed to send tokens',
          description: msg,
          variant: 'destructive',
        });
        return null;
      }
    },
    [walletInstance, selectedMintUrl, proofsByMint, saveProofs, addTransaction, toast],
  );

  /**
   * Receive ecash tokens from a token string (redeem to wallet).
   */
  const receiveEcashTokens = useCallback(
    async (token: string): Promise<number | null> => {
      if (!walletInstance || !bip39Seed) {
        toast({ title: 'Wallet not ready', variant: 'destructive' });
        return null;
      }

      try {
        const decoded = getDecodedToken(token);
        const tokenMint = decoded.mint;
        const tokenProofs = decoded.proofs;

        // If the token is from a different mint, create a wallet for that mint
        let targetWallet = walletInstance;
        if (tokenMint && tokenMint !== selectedMintUrl) {
          targetWallet = new CashuWalletInstance(tokenMint, {
            bip39seed: bip39Seed,
            unit: 'sat',
          });
          await targetWallet.loadMint();
        }

        const received = await targetWallet.receive(tokenProofs);
        const amount = received.reduce((s, p) => s + p.amount, 0);
        const mintUrl = tokenMint ?? selectedMintUrl;

        const existing = proofsByMint[mintUrl] ?? [];
        saveProofs(mintUrl, [...existing, ...received]);

        addTransaction({
          type: 'receive',
          amount,
          mint: mintUrl,
          status: 'paid',
          token,
        });

        toast({
          title: 'Tokens received',
          description: `${amount} sats added to your wallet.`,
        });

        return amount;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        toast({
          title: 'Failed to receive tokens',
          description: msg,
          variant: 'destructive',
        });
        return null;
      }
    },
    [walletInstance, bip39Seed, selectedMintUrl, proofsByMint, saveProofs, addTransaction, toast],
  );

  /** Reset the wallet (delete all data). */
  const resetWallet = useCallback(() => {
    setSeedPhrase(null);
    setProofsByMint({});
    setTxHistory([]);
    setIsBackedUp(false);
    setWalletInstance(null);
    setIsInitialized(false);
    toast({ title: 'Wallet reset', description: 'All wallet data has been cleared.' });
  }, [setSeedPhrase, setProofsByMint, setTxHistory, setIsBackedUp, toast]);

  return {
    // State
    isInitialized,
    hasWallet: !!seedPhrase,
    isBackedUp,
    seedPhrase,
    walletInstance,

    // Mints
    allMints,
    selectedMint,
    selectedMintUrl,
    setSelectedMintUrl,
    addCustomMint,
    removeCustomMint,

    // Balance
    balance: totalBalance,
    currentMintBalance,
    totalBalance,

    // Transactions
    transactions: txHistory,

    // Wallet lifecycle
    createWallet,
    restoreWallet,
    confirmBackup,
    resetWallet,

    // Lightning interface (same as NWC)
    makeInvoice,
    payInvoice,
    checkMintQuote,
    isPaying,
    isCreatingInvoice,

    // Cashu-specific
    sendEcashTokens,
    receiveEcashTokens,
  };
}
