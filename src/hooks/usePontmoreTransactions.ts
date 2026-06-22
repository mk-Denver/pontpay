/**
 * usePontmoreTransactions — the heart of the Pontmore protocol.
 *
 * Sends and receives encrypted transaction messages (deposits, withdrawals,
 * P2P transfers) via Nostr direct messages. Messages are encrypted with the
 * logged-in user's signer (NIP-04 for kind 4 compatibility) and contain a
 * structured JSON envelope (see NIP.md / src/lib/pontmore.ts).
 *
 * A local transaction ledger is maintained in localStorage so the user can
 * see their full transaction history and status at a glance.
 */

import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useToast } from '@/hooks/useToast';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  createPontmoreMessage,
  generateTxId,
  parsePontmoreMessage,
  type PontmoreMessage,
  type PontmoreTxStatus,
} from '@/lib/pontmore';

/** A local transaction record derived from Pontmore messages. */
export interface PontmoreTransaction {
  txId: string;
  type: 'deposit' | 'withdraw' | 'transfer';
  status: PontmoreTxStatus;
  counterpartyPubkey: string;
  counterpartyName?: string;
  amountSats: number;
  fiatAmount?: number;
  fiatCurrency?: string;
  bolt11?: string;
  memo?: string;
  preimage?: string;
  createdAt: number;
  updatedAt: number;
  direction: 'outgoing' | 'incoming';
}

const DM_KIND = 4;

export function usePontmoreTransactions() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [ledger, setLedger] = useLocalStorage<PontmoreTransaction[]>(
    'pontmore-ledger',
    [],
  );

  const myPubkey = user?.pubkey;

  /** Encrypt a message to a recipient using the signer. */
  const encrypt = useCallback(
    async (recipientPubkey: string, plaintext: string): Promise<string> => {
      if (!user) throw new Error('Not logged in');
      // Prefer nip04 for kind 4 DM compatibility, fall back to nip44
      if (user.signer.nip04) {
        return user.signer.nip04.encrypt(recipientPubkey, plaintext);
      }
      if (user.signer.nip44) {
        return user.signer.nip44.encrypt(recipientPubkey, plaintext);
      }
      throw new Error('Your signer does not support encrypted messages');
    },
    [user],
  );

  /** Decrypt an incoming message from a sender. */
  const decrypt = useCallback(
    async (senderPubkey: string, ciphertext: string): Promise<string> => {
      if (!user) throw new Error('Not logged in');
      if (user.signer.nip04) {
        return user.signer.nip04.decrypt(senderPubkey, ciphertext);
      }
      if (user.signer.nip44) {
        return user.signer.nip44.decrypt(senderPubkey, ciphertext);
      }
      throw new Error('Your signer does not support encrypted messages');
    },
    [user],
  );

  /** Update or insert a transaction in the local ledger. */
  const upsertTransaction = useCallback(
    (tx: PontmoreTransaction) => {
      setLedger((prev) => {
        const idx = prev.findIndex((t) => t.txId === tx.txId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...tx, updatedAt: tx.updatedAt };
          return updated;
        }
        return [tx, ...prev];
      });
    },
    [setLedger],
  );

  /** Send an encrypted Pontmore message to a recipient. */
  const sendMessage = useCallback(
    async (
      recipientPubkey: string,
      message: PontmoreMessage,
    ): Promise<void> => {
      if (!user) {
        toast({
          title: 'Login required',
          description: 'You must be logged in to send transaction messages.',
          variant: 'destructive',
        });
        return;
      }

      const ciphertext = await encrypt(recipientPubkey, JSON.stringify(message));

      await publishEvent({
        kind: DM_KIND,
        content: ciphertext,
        tags: [
          ['p', recipientPubkey],
        ],
      });
    },
    [user, encrypt, publishEvent, toast],
  );

  /**
   * Initiate a deposit: user sends fiat to an agent and receives BTC.
   * Sends a `deposit_request` message to the chosen agent.
   */
  const requestDeposit = useCallback(
    async (params: {
      agentPubkey: string;
      agentName?: string;
      amountSats: number;
      fiatAmount: number;
      fiatCurrency: string;
      memo?: string;
    }): Promise<string | null> => {
      const txId = generateTxId();
      const message = createPontmoreMessage({
        type: 'deposit_request',
        txId,
        amountSats: params.amountSats,
        fiatAmount: params.fiatAmount,
        fiatCurrency: params.fiatCurrency,
        status: 'pending',
        memo: params.memo,
      });

      try {
        await sendMessage(params.agentPubkey, message);
        upsertTransaction({
          txId,
          type: 'deposit',
          status: 'pending',
          counterpartyPubkey: params.agentPubkey,
          counterpartyName: params.agentName,
          amountSats: params.amountSats,
          fiatAmount: params.fiatAmount,
          fiatCurrency: params.fiatCurrency,
          memo: params.memo,
          createdAt: message.createdAt,
          updatedAt: message.createdAt,
          direction: 'outgoing',
        });
        toast({
          title: 'Deposit request sent',
          description: `Waiting for ${params.agentName ?? 'agent'} to confirm.`,
        });
        return txId;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        toast({
          title: 'Failed to send deposit request',
          description: msg,
          variant: 'destructive',
        });
        return null;
      }
    },
    [sendMessage, upsertTransaction, toast],
  );

  /**
   * Initiate a withdrawal: user sends BTC to the agent and receives fiat.
   * The user generates a Lightning invoice from their wallet, includes it
   * in the request, and the agent pays it upon fiat disbursement.
   */
  const requestWithdrawal = useCallback(
    async (params: {
      agentPubkey: string;
      agentName?: string;
      amountSats: number;
      fiatAmount: number;
      fiatCurrency: string;
      bolt11: string;
      memo?: string;
    }): Promise<string | null> => {
      const txId = generateTxId();
      const message = createPontmoreMessage({
        type: 'withdraw_request',
        txId,
        amountSats: params.amountSats,
        fiatAmount: params.fiatAmount,
        fiatCurrency: params.fiatCurrency,
        bolt11: params.bolt11,
        status: 'pending',
        memo: params.memo,
      });

      try {
        await sendMessage(params.agentPubkey, message);
        upsertTransaction({
          txId,
          type: 'withdraw',
          status: 'invoice_sent',
          counterpartyPubkey: params.agentPubkey,
          counterpartyName: params.agentName,
          amountSats: params.amountSats,
          fiatAmount: params.fiatAmount,
          fiatCurrency: params.fiatCurrency,
          bolt11: params.bolt11,
          memo: params.memo,
          createdAt: message.createdAt,
          updatedAt: message.createdAt,
          direction: 'outgoing',
        });
        toast({
          title: 'Withdrawal request sent',
          description: `Waiting for ${params.agentName ?? 'agent'} to pay your invoice.`,
        });
        return txId;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        toast({
          title: 'Failed to send withdrawal request',
          description: msg,
          variant: 'destructive',
        });
        return null;
      }
    },
    [sendMessage, upsertTransaction, toast],
  );

  /**
   * Initiate a P2P transfer: send BTC directly to another user via Lightning.
   * The recipient provides a Lightning invoice (or LNURL) which the sender pays.
   */
  const requestTransfer = useCallback(
    async (params: {
      recipientPubkey: string;
      recipientName?: string;
      amountSats: number;
      bolt11: string;
      memo?: string;
    }): Promise<string | null> => {
      const txId = generateTxId();
      const message = createPontmoreMessage({
        type: 'transfer_request',
        txId,
        amountSats: params.amountSats,
        bolt11: params.bolt11,
        status: 'pending',
        memo: params.memo,
      });

      try {
        await sendMessage(params.recipientPubkey, message);
        upsertTransaction({
          txId,
          type: 'transfer',
          status: 'pending',
          counterpartyPubkey: params.recipientPubkey,
          counterpartyName: params.recipientName,
          amountSats: params.amountSats,
          bolt11: params.bolt11,
          memo: params.memo,
          createdAt: message.createdAt,
          updatedAt: message.createdAt,
          direction: 'outgoing',
        });
        toast({
          title: 'Transfer initiated',
          description: 'Lightning payment sent to recipient.',
        });
        return txId;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        toast({
          title: 'Failed to send transfer',
          description: msg,
          variant: 'destructive',
        });
        return null;
      }
    },
    [sendMessage, upsertTransaction, toast],
  );

  /** Mark a transaction as confirmed (after Lightning payment settles). */
  const confirmTransaction = useCallback(
    (txId: string, preimage?: string) => {
      setLedger((prev) =>
        prev.map((t) =>
          t.txId === txId
            ? {
                ...t,
                status: 'confirmed',
                preimage: preimage ?? t.preimage,
                updatedAt: Math.floor(Date.now() / 1000),
              }
            : t,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ['pontmore'] });
    },
    [setLedger, queryClient],
  );

  /** Mark a transaction as failed. */
  const failTransaction = useCallback(
    (txId: string, reason?: string) => {
      setLedger((prev) =>
        prev.map((t) =>
          t.txId === txId
            ? {
                ...t,
                status: 'failed',
                memo: reason ? `${t.memo ?? ''} — ${reason}` : t.memo,
                updatedAt: Math.floor(Date.now() / 1000),
              }
            : t,
        ),
      );
    },
    [setLedger],
  );

  /** Query incoming and outgoing DMs, decrypt Pontmore messages. */
  const { data: incomingMessages, ...messagesQuery } = useQuery<
    { event: NostrEvent; message: PontmoreMessage; sender: string }[],
    Error
  >({
    queryKey: ['pontmore', 'dm-messages', myPubkey ?? ''],
    queryFn: async (c) => {
      if (!myPubkey) return [];
      // Query DMs where the user is the recipient (p-tagged) or the author
      const events = await nostr.query(
        [
          { kinds: [DM_KIND], '#p': [myPubkey], limit: 50 },
          { kinds: [DM_KIND], authors: [myPubkey], limit: 50 },
        ],
        { signal: c.signal },
      );

      // Deduplicate by event id
      const seen = new Set<string>();
      const unique = events.filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });

      const results: { event: NostrEvent; message: PontmoreMessage; sender: string }[] = [];

      for (const event of unique) {
        // Only decrypt messages from others (incoming)
        if (event.pubkey === myPubkey) continue;
        try {
          const plaintext = await decrypt(event.pubkey, event.content);
          const msg = parsePontmoreMessage(plaintext);
          if (msg) {
            results.push({ event, message: msg, sender: event.pubkey });
          }
        } catch {
          // decryption failed (not a Pontmore message or different encryption) — skip
        }
      }

      return results;
    },
    enabled: !!myPubkey,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  /** Sync incoming messages into the local ledger. */
  useEffect(() => {
    if (!incomingMessages) return;
    for (const { message, sender } of incomingMessages) {
      const existing = ledger.find((t) => t.txId === message.txId);
      if (!existing || existing.updatedAt < message.createdAt) {
        const type: PontmoreTransaction['type'] =
          message.type === 'deposit_request' || message.type === 'deposit_confirm'
            ? 'deposit'
            : message.type === 'withdraw_request' || message.type === 'withdraw_confirm'
            ? 'withdraw'
            : 'transfer';

        upsertTransaction({
          txId: message.txId,
          type,
          status: message.status,
          counterpartyPubkey: sender,
          amountSats: message.amountSats ?? 0,
          fiatAmount: message.fiatAmount,
          fiatCurrency: message.fiatCurrency,
          bolt11: message.bolt11,
          memo: message.memo,
          preimage: message.preimage,
          createdAt: message.createdAt,
          updatedAt: message.createdAt,
          direction: 'incoming',
        });
      }
    }
  }, [incomingMessages, ledger, upsertTransaction]);

  /** Sorted transaction history. */
  const transactions = useMemo(() => {
    return [...ledger].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [ledger]);

  /** Clear all transaction history (local only). */
  const clearHistory = useCallback(() => {
    setLedger([]);
    queryClient.invalidateQueries({ queryKey: ['pontmore'] });
  }, [setLedger, queryClient]);

  return {
    transactions,
    incomingMessages: incomingMessages ?? [],
    requestDeposit,
    requestWithdrawal,
    requestTransfer,
    confirmTransaction,
    failTransaction,
    sendMessage,
    clearHistory,
    messagesLoading: messagesQuery.isLoading,
  };
}
