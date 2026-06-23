/**
 * useCashuWallet — native in-browser Bitcoin ecash wallet powered by
 * the Cashu protocol. Non-custodial: the user holds a BIP39 seed phrase
 * and all proofs are stored locally.
 *
 * Uses @cashu/cashu-ts v4 typed BOLT11 helper methods.
 * In v4, Proof.amount and quote amounts are Amount class instances.
 * We use a helper to safely convert them to numbers.
 *
 * Reference: https://github.com/Codepocketdev/satoshi-pay-wallet
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Wallet as CashuWalletInstance,
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
  quoteId: string;
}

export interface PaymentResult {
  preimage: string;
}

/**
 * Safely extract a number from a v4 Amount value.
 * In v4, amounts can be Amount class instances, numbers, strings, or bigints.
 * This helper handles all cases.
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseInt(value, 10) || 0;
  if (typeof value === 'bigint') return Number(value);
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  if (value && typeof value === 'object' && 'toBigInt' in value && typeof (value as { toBigInt: unknown }).toBigInt === 'function') {
    return Number((value as { toBigInt: () => bigint }).toBigInt());
  }
  return 0;
}

/** Sum the amounts of an array of proofs, handling v4 Amount objects. */
function sumProofs(proofs: Proof[]): number {
  return proofs.reduce((sum, p) => sum + toNumber(p.amount), 0);
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
      (total, proofs) => total + sumProofs(proofs),
      0,
    );
  }, [proofsByMint]);

  /** Balance for the selected mint. */
  const currentMintBalance = useMemo(() => {
    const proofs = proofsByMint[selectedMintUrl] ?? [];
    return sumProofs(proofs);
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

  /** Save proofs for a mint (replaces all proofs for that mint). */
  const saveProofsForMint = useCallback(
    (mintUrl: string, proofs: Proof[]) => {
      setProofsByMint((prev) => ({ ...prev, [mintUrl]: proofs }));
    },
    [setProofsByMint],
  );

  /** Get proofs for a mint. */
  const getProofsForMint = useCallback(
    (mintUrl: string): Proof[] => {
      return proofsByMint[mintUrl] ?? [];
    },
    [proofsByMint],
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

  // ═══════════════════════════════════════════════════════════════
  // RECEIVE: Create a Lightning invoice to mint new ecash tokens
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create a Lightning invoice to receive sats into the wallet (mint).
   *
   * v4 API: wallet.createMintQuoteBolt11(amount, description)
   * Returns: { quote (ID), request (BOLT11 invoice), amount, state }
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
        const quoteResponse = await walletInstance.createMintQuoteBolt11(amountSats, memo);

        addTransaction({
          type: 'mint',
          amount: amountSats,
          memo,
          mint: selectedMintUrl,
          status: 'pending',
          invoice: quoteResponse.request,
        });

        return {
          invoice: quoteResponse.request,
          paymentHash: quoteResponse.quote,
          quoteId: quoteResponse.quote,
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
   * Check if a mint quote has been paid and mint tokens if so.
   *
   * v4 flow:
   * 1. checkMintQuoteBolt11(quoteId) → { state: "UNPAID" | "PAID" | "ISSUED" }
   * 2. If state is "PAID", call mintProofsBolt11(amount, quoteId) → Proof[]
   */
  const checkMintQuote = useCallback(
    async (quoteId: string, amountSats: number): Promise<boolean> => {
      if (!walletInstance) return false;
      try {
        const quoteStatus = await walletInstance.checkMintQuoteBolt11(quoteId);

        if (quoteStatus.state === 'UNPAID') {
          return false;
        }

        if (quoteStatus.state === 'PAID') {
          const newProofs = await walletInstance.mintProofsBolt11(amountSats, quoteId);

          if (newProofs && newProofs.length > 0) {
            const existing = getProofsForMint(selectedMintUrl);
            saveProofsForMint(selectedMintUrl, [...existing, ...newProofs]);

            addTransaction({
              type: 'mint',
              amount: amountSats,
              mint: selectedMintUrl,
              status: 'paid',
              invoice: quoteId,
            });

            toast({
              title: 'Payment received!',
              description: `${amountSats} sats minted to your wallet.`,
            });

            return true;
          }
        }

        if (quoteStatus.state === 'ISSUED') {
          return true;
        }

        return false;
      } catch (err) {
        console.error('checkMintQuote error:', err);
        return false;
      }
    },
    [walletInstance, selectedMintUrl, getProofsForMint, saveProofsForMint, addTransaction, toast],
  );

  // ═══════════════════════════════════════════════════════════════
  // SEND: Pay a Lightning invoice by melting ecash tokens
  // ═══════════════════════════════════════════════════════════════

  /**
   * Pay a Lightning invoice by melting ecash tokens.
   *
   * v4 flow:
   * 1. createMeltQuoteBolt11(invoice) → { amount, fee_reserve, quote }
   * 2. send(totalAmount, proofs) → { send, keep }
   * 3. meltProofsBolt11(meltQuote, proofsToSend) → { quote, change }
   * 4. Save keep + change proofs
   *
   * NOTE: In v4, amount and fee_reserve are Amount objects — use toNumber()
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

      const proofs = getProofsForMint(selectedMintUrl);
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
        // Step 1: Create melt quote
        const meltQuote = await walletInstance.createMeltQuoteBolt11(bolt11);

        // v4: amount and fee_reserve are Amount objects — convert to numbers
        const invoiceAmount = toNumber(meltQuote.amount);
        const feeReserve = toNumber(meltQuote.fee_reserve);
        const totalNeeded = invoiceAmount + feeReserve;

        const currentBalance = sumProofs(proofs);
        if (currentBalance < totalNeeded) {
          throw new Error(`Insufficient balance. Need ${totalNeeded} sats (incl ${feeReserve} fee), have ${currentBalance}.`);
        }

        // Step 2: Split proofs using wallet.send()
        const sendResult = await walletInstance.send(totalNeeded, proofs);

        if (!sendResult) {
          throw new Error('Failed to prepare proofs for payment');
        }

        const proofsToSend = sendResult.send ?? [];
        const proofsToKeep = sendResult.keep ?? [];

        if (!proofsToSend || proofsToSend.length === 0) {
          throw new Error('Failed to create send proofs');
        }

        // Step 3: Melt the proofs to pay the invoice
        const meltResponse = await walletInstance.meltProofsBolt11(meltQuote, proofsToSend);

        if (!meltResponse) {
          throw new Error('Payment failed at the mint');
        }

        // Step 4: Save keep proofs + change
        const changeProofs = meltResponse.change ?? [];
        const allRemainingProofs = [...proofsToKeep, ...changeProofs];
        saveProofsForMint(selectedMintUrl, allRemainingProofs);

        addTransaction({
          type: 'melt',
          amount: invoiceAmount,
          mint: selectedMintUrl,
          status: 'paid',
          invoice: bolt11,
        });

        toast({
          title: 'Payment sent',
          description: `${invoiceAmount} sats paid via Lightning.`,
        });

        return { preimage: meltResponse.preimage ?? '' };
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
    [walletInstance, selectedMintUrl, getProofsForMint, saveProofsForMint, addTransaction, toast],
  );

  // ═══════════════════════════════════════════════════════════════
  // SEND: Generate ecash token (offline, no Lightning needed)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Send ecash tokens to someone (off-chain, no Lightning needed).
   * Returns a token string that can be shared via text, QR, or Nostr DM.
   *
   * v4 API: wallet.send(amount, proofs) → Promise<{ send, keep }>
   */
  const sendEcashTokens = useCallback(
    async (amountSats: number): Promise<string | null> => {
      if (!walletInstance) {
        toast({ title: 'Wallet not ready', variant: 'destructive' });
        return null;
      }

      const proofs = getProofsForMint(selectedMintUrl);
      const balance = sumProofs(proofs);
      if (balance < amountSats) {
        toast({
          title: 'Insufficient balance',
          description: `You have ${balance} sats but need ${amountSats}.`,
          variant: 'destructive',
        });
        return null;
      }

      try {
        const sendResult = await walletInstance.send(amountSats, proofs);

        if (!sendResult) {
          throw new Error('wallet.send returned null');
        }

        const proofsToSend = sendResult.send ?? [];
        const proofsToKeep = sendResult.keep ?? [];

        if (!proofsToSend || proofsToSend.length === 0) {
          throw new Error('Failed to create send proofs');
        }

        const token = getEncodedToken({
          mint: selectedMintUrl,
          proofs: proofsToSend,
        });

        saveProofsForMint(selectedMintUrl, proofsToKeep);

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
    [walletInstance, selectedMintUrl, getProofsForMint, saveProofsForMint, addTransaction, toast],
  );

  // ═══════════════════════════════════════════════════════════════
  // RECEIVE: Redeem ecash token
  // ═══════════════════════════════════════════════════════════════

  /**
   * Receive ecash tokens from a token string (redeem to wallet).
   *
   * v4 API: wallet.receive(proofs) → Proof[]
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

        if (!tokenProofs || tokenProofs.length === 0) {
          throw new Error('Token does not contain any proofs');
        }

        let targetWallet = walletInstance;
        if (tokenMint && tokenMint !== selectedMintUrl) {
          targetWallet = new CashuWalletInstance(tokenMint, {
            bip39seed: bip39Seed,
            unit: 'sat',
          });
          await targetWallet.loadMint();
        }

        const received = await targetWallet.receive(tokenProofs);

        if (!received || received.length === 0) {
          throw new Error('Token already claimed or invalid.');
        }

        const amount = sumProofs(received);
        const mintUrl = tokenMint ?? selectedMintUrl;

        const existing = getProofsForMint(mintUrl);
        saveProofsForMint(mintUrl, [...existing, ...received]);

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
    [walletInstance, bip39Seed, selectedMintUrl, getProofsForMint, saveProofsForMint, addTransaction, toast],
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
    customMints,
    selectedMint,
    selectedMintUrl,
    setSelectedMintUrl,
    addCustomMint,
    removeCustomMint,

    // Balance
    balance: totalBalance,
    currentMintBalance,
    totalBalance,
    proofsByMint,

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
