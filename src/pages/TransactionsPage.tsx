/**
 * TransactionsPage — customer-side swap history with detail view.
 *
 * Shows all swaps involving the current user (as customer or agent).
 * Clicking a swap opens a detail dialog with:
 *   - Full swap state + transition log
 *   - NIP-17 encrypted private messages (invoices, instructions)
 *   - For withdrawals: pay the agent's Lightning invoice
 *   - For deposits: see the status of the invoice the customer sent
 *   - Send messages to the agent
 *   - Customer-side state actions (cancel, dispute)
 */

import { useSeoMeta } from '@unhead/react';
import { useState, useMemo } from 'react';
import {
  Receipt,
  ArrowDownToLine,
  ArrowUpFromLine,
  Search,
  Send,
  Trash2,
  Filter,
  Loader2,
  Zap,
  Check,
  X,
  AlertCircle,
  Lock,
  MessageSquare,
  Clock,
  Shield,
  CheckCircle2,
} from 'lucide-react';
import { AppLayout } from '@/components/Navbar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSwapStateMachine, type LocalSwapRecord } from '@/hooks/useSwapStateMachine';
import { useSwapMessages, type SwapPayloadType, type SwapMessage } from '@/hooks/useSwapMessages';
import { useUnifiedWallet } from '@/hooks/useUnifiedWallet';
import { formatSats, type SwapState, type PontmoreSwap } from '@/lib/pontmore';

type TxFilter = 'all' | 'buy' | 'sell';

// ─── State helpers (shared with AgentInboxPage) ──────────────────

const STATE_LABELS: Record<SwapState, string> = {
  requested: 'Requested',
  accepted: 'Accepted',
  fiat_exchanged: 'Fiat Sent',
  lightning_settled: 'BTC Settled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
  expired: 'Expired',
};

/** Context-aware state label for the progress bar. */
function stateFlowLabel(state: SwapState, swapType: string): string {
  if (state === 'fiat_exchanged') {
    return swapType === 'buy' ? 'Fiat Sent' : 'Fiat Received';
  }
  if (state === 'lightning_settled') {
    return swapType === 'buy' ? 'BTC Received' : 'BTC Settled';
  }
  return STATE_LABELS[state];
}

const STATE_COLORS: Record<SwapState, string> = {
  requested: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  accepted: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
  fiat_exchanged: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
  lightning_settled: 'text-green-600 bg-green-500/10 border-green-500/20',
  completed: 'text-green-600 bg-green-500/10 border-green-500/20',
  cancelled: 'text-red-600 bg-red-500/10 border-red-500/20',
  disputed: 'text-red-600 bg-red-500/10 border-red-500/20',
  expired: 'text-red-600 bg-red-500/10 border-red-500/20',
};

const STATE_FLOW: SwapState[] = [
  'requested',
  'accepted',
  'fiat_exchanged',
  'lightning_settled',
  'completed',
];

const TERMINAL_STATES: SwapState[] = ['cancelled', 'disputed', 'expired'];

interface CustomerAction {
  label: string;
  nextState: SwapState;
  reason: string;
  variant: 'default' | 'outline' | 'destructive';
  icon: typeof Check;
}

function getCustomerActions(state: SwapState): CustomerAction[] {
  const actions: CustomerAction[] = [];

  if (['requested', 'accepted'].includes(state)) {
    actions.push({
      label: 'Cancel swap',
      nextState: 'cancelled',
      reason: 'Customer cancelled the swap',
      variant: 'destructive',
      icon: X,
    });
  }

  if (!['completed', 'cancelled', 'disputed', 'expired'].includes(state)) {
    actions.push({
      label: 'Raise dispute',
      nextState: 'disputed',
      reason: 'Customer raised a dispute',
      variant: 'destructive',
      icon: AlertCircle,
    });
  }

  return actions;
}

// ─── Page ────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const { user } = useCurrentUser();
  const { localSwaps, clearHistory, useMySwaps } = useSwapStateMachine();
  const { data: nostrSwaps, isLoading } = useMySwaps();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TxFilter>('all');
  const [selectedSwap, setSelectedSwap] = useState<PontmoreSwap | null>(null);

  useSeoMeta({
    title: 'Swap History — PontPay',
    description: 'View your full Pontmore swap history.',
  });

  // Use Nostr-sourced swaps if available, fall back to local
  const allSwaps = nostrSwaps && nostrSwaps.length > 0 ? nostrSwaps : [];
  const displaySwaps = allSwaps.length > 0
    ? allSwaps
    : localSwaps.map(localToSwap);

  const filtered = useMemo(() => {
    return displaySwaps.filter((swap) => {
      if (filter !== 'all' && swap.swapType !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matches =
          swap.swapId.toLowerCase().includes(q) ||
          swap.agentPubkey.toLowerCase().includes(q) ||
          swap.fiatCurrency.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [displaySwaps, filter, search]);

  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
            <Receipt className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold">Swap History</h1>
          <p className="mt-3 text-muted-foreground">
            Log in with your Nostr identity to view your swap history.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Swap History</h1>
            <p className="mt-1 text-muted-foreground">
              All your Pontmore swaps (online swap).
            </p>
          </div>
          {localSwaps.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm('Clear local swap history? This cannot be undone.')) {
                  clearHistory();
                }
              }}
            >
              <Trash2 className="h-4 w-4" /> Clear local
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by swap ID, agent, or currency..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="w-full sm:w-40">
            <Select value={filter} onValueChange={(v) => setFilter(v as TxFilter)}>
              <SelectTrigger>
                <Filter className="mr-1 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="deposit">Deposits</SelectItem>
                <SelectItem value="withdrawal">Withdrawals</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Swap list */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 px-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <Receipt className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium">No swaps yet</p>
              <p className="mt-2 max-w-sm mx-auto text-sm text-muted-foreground">
                Your deposits and withdrawals will appear here.
                Start from the dashboard.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((swap) => (
              <SwapRow key={swap.swapId} swap={swap} onClick={() => setSelectedSwap(swap)} />
            ))}
          </div>
        )}
      </div>

      {/* Swap detail dialog */}
      <Dialog open={!!selectedSwap} onOpenChange={(open) => !open && setSelectedSwap(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedSwap?.swapType === 'buy' && <ArrowDownToLine className="h-5 w-5 text-green-600" />}
              {selectedSwap?.swapType === 'sell' && <ArrowUpFromLine className="h-5 w-5 text-orange-600" />}
              <span className="capitalize">{selectedSwap?.swapType}</span>
            </DialogTitle>
            <DialogDescription>
              Swap details — view state, messages, and pay invoices.
            </DialogDescription>
          </DialogHeader>
          {selectedSwap && <LiveSwapDetailPanel swapId={selectedSwap.swapId} fallbackSwap={selectedSwap} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

/** Convert a local swap record to a PontmoreSwap for display. */
function localToSwap(local: LocalSwapRecord): PontmoreSwap {
  return {
    swapId: local.swapId,
    swapType: local.swapType,
    state: local.state,
    agentPubkey: local.agentPubkey,
    customerPubkey: local.customerPubkey,
    bitcoinAmountSats: local.amountSats,
    fiatAmount: local.fiatAmount,
    fiatCurrency: local.fiatCurrency,
    escrowReference: local.escrowReference,
    expiry: 0,
    createdAt: local.createdAt,
    updatedAt: local.updatedAt,
    direction: local.direction,
    transitions: [],
    evidence: [],
  };
}

// ─── Swap Row ────────────────────────────────────────────────────

function SwapRow({ swap, onClick }: { swap: PontmoreSwap; onClick: () => void }) {
  const Icon = swap.swapType === 'buy' ? ArrowDownToLine : ArrowUpFromLine;
  const statusClass = STATE_COLORS[swap.state];

  return (
    <Card className="cursor-pointer transition-colors hover:bg-muted/30" onClick={onClick}>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${swap.direction === 'incoming' ? 'bg-green-500/10' : 'bg-muted'}`}>
          <Icon className={`h-5 w-5 ${swap.direction === 'incoming' ? 'text-green-600' : 'text-muted-foreground'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium capitalize">{swap.swapType} · {swap.direction}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatSats(swap.bitcoinAmountSats)}
            {swap.fiatAmount ? ` · ${swap.fiatCurrency} ${swap.fiatAmount.toLocaleString()}` : ''}
            {' · '}{new Date(swap.createdAt * 1000).toLocaleString()}
          </p>
        </div>
        <Badge variant="outline" className={`shrink-0 ${statusClass}`}>{STATE_LABELS[swap.state]}</Badge>
      </CardContent>
    </Card>
  );
}

// ─── Live Swap Detail Panel ──────────────────────────────────────
// Wraps SwapDetailPanel with a live query (useSwap) so the customer sees
// real-time state updates as the agent advances the swap.

function LiveSwapDetailPanel({ swapId, fallbackSwap }: { swapId: string; fallbackSwap: PontmoreSwap }) {
  const { useSwap } = useSwapStateMachine();
  const { data: liveSwap, isLoading } = useSwap(swapId);

  // Use live swap data if available, fall back to the snapshot from the list
  const swap = liveSwap ?? fallbackSwap;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <SwapDetailPanel swap={swap} />;
}

// ─── Swap Detail Panel (customer side) ───────────────────────────

function SwapDetailPanel({ swap }: { swap: PontmoreSwap }) {
  const { publishTransition } = useSwapStateMachine();
  const { useSwapInbox, sendMessage, hasNip44 } = useSwapMessages();
  const { hasWallet, payInvoice, isPaying } = useUnifiedWallet();
  const { data: messages, isLoading: msgLoading } = useSwapInbox(swap.swapId);
  const [actionPending, setActionPending] = useState<CustomerAction | null>(null);
  const [payingInvoice, setPayingInvoice] = useState(false);
  const [sendData, setSendData] = useState('');
  const [sending, setSending] = useState(false);

  const actions = useMemo(() => getCustomerActions(swap.state), [swap.state]);

  const handleAction = async (action: CustomerAction) => {
    setActionPending(action);
    try {
      await publishTransition.mutateAsync({
        swapId: swap.swapId,
        newState: action.nextState,
        prevState: swap.state,
        actorRole: 'customer',
        reason: action.reason,
      });
    } finally {
      setActionPending(null);
    }
  };

  // Find the agent's invoice (for withdrawals, agent sends invoice for customer to pay)
  const agentInvoice = messages?.find(
    (m) => m.payload.type === 'invoice' && m.senderPubkey === swap.agentPubkey
  );

  const handlePayAgentInvoice = async () => {
    if (!agentInvoice) return;
    setPayingInvoice(true);
    try {
      const result = await payInvoice(agentInvoice.payload.data);
      if (result) {
        // Notify the agent that payment was made
        await sendMessage.mutateAsync({
          swapId: swap.swapId,
          recipientPubkey: swap.agentPubkey,
          payloadType: 'payment_proof',
          data: result.preimage,
          label: 'Lightning payment preimage',
        });
      }
    } finally {
      setPayingInvoice(false);
    }
  };

  const handleSendMessage = async () => {
    if (!sendData.trim()) return;
    setSending(true);
    try {
      await sendMessage.mutateAsync({
        swapId: swap.swapId,
        recipientPubkey: swap.agentPubkey,
        payloadType: 'message',
        data: sendData,
      });
      setSendData('');
    } finally {
      setSending(false);
    }
  };

  const isTerminal = TERMINAL_STATES.includes(swap.state);
  const currentIndex = STATE_FLOW.indexOf(swap.state);

  return (
    <div className="space-y-5">
      {/* Swap summary */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <DetailRow label="Amount" value={formatSats(swap.bitcoinAmountSats)} />
        <DetailRow label="Fiat" value={`${swap.fiatCurrency} ${swap.fiatAmount.toLocaleString()}`} />
        <DetailRow label="Agent" value={`${swap.agentPubkey.slice(0, 16)}...`} mono />
        <DetailRow label="Swap ID" value={swap.swapId} mono />
        <DetailRow label="Created" value={new Date(swap.createdAt * 1000).toLocaleString()} />
        <DetailRow label="Direction" value={swap.direction} />
      </div>

      {/* State machine progress */}
      <div>
        <p className="mb-2 text-sm font-medium">State progress</p>
        {!isTerminal ? (
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {STATE_FLOW.map((state, i) => {
              const isPast = i < currentIndex;
              const isCurrent = i === currentIndex;
              return (
                <div key={state} className="flex items-center gap-1 shrink-0">
                  <div className={`flex h-7 items-center rounded-full px-2.5 text-xs font-medium transition-colors ${
                    isCurrent ? 'bg-primary text-primary-foreground'
                    : isPast ? 'bg-green-500/15 text-green-600'
                    : 'bg-muted text-muted-foreground'
                  }`}>
                    {isPast && <Check className="mr-1 h-3 w-3" />}
                    {stateFlowLabel(state, swap.swapType)}
                  </div>
                  {i < STATE_FLOW.length - 1 && (
                    <div className={`h-px w-4 ${isPast ? 'bg-green-500/40' : 'bg-border'}`} />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <Badge variant="outline" className={STATE_COLORS[swap.state]}>
            {STATE_LABELS[swap.state]}
          </Badge>
        )}
      </div>

      {/* Lightning payment — for withdrawals, customer pays agent's invoice online */}
      {swap.swapType === 'sell' && swap.state === 'accepted' && (
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
          <p className="mb-3 text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-600" /> Pay online
          </p>
          {agentInvoice ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                The agent sent you a Lightning invoice. Complete online and pay
                it from your wallet to send BTC. The agent will then hand you
                cash.
              </p>
              <code className="block truncate rounded bg-background px-2 py-1.5 text-xs">
                {agentInvoice.payload.data.slice(0, 50)}...
              </code>
              {hasWallet ? (
                <Button onClick={handlePayAgentInvoice} disabled={payingInvoice || isPaying} size="sm" className="w-full">
                  {payingInvoice || isPaying ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Paying invoice…</>
                  ) : (
                    <><Zap className="h-4 w-4" /> Pay invoice ({formatSats(swap.bitcoinAmountSats)})</>
                  )}
                </Button>
              ) : (
                <p className="text-xs text-amber-600">Connect a wallet to pay the invoice.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Waiting for the agent to generate a Lightning invoice. Visit the
              online — the agent will send it to you when you arrive.
            </p>
          )}
        </div>
      )}

      {/* Deposit status — customer handed cash, waiting for agent to pay invoice */}
      {swap.swapType === 'buy' && swap.state === 'accepted' && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
          <p className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-green-600" /> At the kiosk
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Hand over cash to the agent. Once they confirm cash received,
            they'll pay your Lightning invoice and Bitcoin arrives in your
            wallet instantly.
          </p>
        </div>
      )}

      {/* Deposit — cash exchanged, waiting for Lightning */}
      {swap.swapType === 'buy' && swap.state === 'fiat_exchanged' && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
          <p className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600" /> Cash received by agent
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The agent confirmed cash received. They're now paying your Lightning
            invoice — Bitcoin will arrive in your wallet momentarily.
          </p>
        </div>
      )}

      {/* Transition log */}
      {swap.transitions.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Transition log</p>
          <div className="space-y-1.5">
            {swap.transitions.map((t, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{STATE_LABELS[t.state] ?? t.state}</span>
                  <span className="text-muted-foreground"> · {t.actorRole}</span>
                  <p className="text-muted-foreground">{t.reason}</p>
                </div>
                <span className="shrink-0 text-muted-foreground">
                  {new Date(t.createdAt * 1000).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customer actions */}
      {actions.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Actions</p>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
              const Icon = action.icon;
              const isPending = actionPending === action;
              return (
                <Button
                  key={action.label}
                  variant={action.variant}
                  size="sm"
                  onClick={() => handleAction(action)}
                  disabled={actionPending !== null}
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                  {action.label}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <Separator />

      {/* Private messages */}
      <div>
        <p className="mb-2 text-sm font-medium flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Private messages
          {hasNip44 && (
            <Badge variant="secondary" className="text-xs">
              <Lock className="mr-1 h-3 w-3" /> NIP-17
            </Badge>
          )}
        </p>

        {!hasNip44 ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-amber-600">
              Your signer doesn't support NIP-44 encryption. Upgrade your
              signer to send/receive encrypted messages.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 max-h-48 space-y-1.5 overflow-y-auto">
              {msgLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : !messages || messages.length === 0 ? (
                <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  No messages yet. The agent may send invoices or instructions here.
                </p>
              ) : (
                messages.map((msg) => (
                  <CustomerMessageBubble key={msg.id} message={msg} isOwn={msg.senderPubkey !== swap.agentPubkey} />
                ))
              )}
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <Textarea
                placeholder="Send a message to the agent..."
                value={sendData}
                onChange={(e) => setSendData(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <Button size="sm" onClick={handleSendMessage} disabled={sending || !sendData.trim()} className="w-full">
                {sending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                ) : (
                  <><Send className="h-4 w-4" /> Send encrypted</>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-medium capitalize ${mono ? 'font-mono text-xs normal-case' : ''}`}>{value}</p>
    </div>
  );
}

function CustomerMessageBubble({ message, isOwn }: { message: SwapMessage; isOwn: boolean }) {
  const typeLabels: Record<SwapPayloadType, string> = {
    invoice: 'Lightning Invoice',
    bank_details: 'Payment Instructions',
    payout_confirmation: 'Payout Confirmation',
    payment_proof: 'Payment Proof',
    message: 'Message',
  };

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg p-2.5 text-xs ${isOwn ? 'bg-primary/10' : 'bg-muted/60'}`}>
        <div className="mb-0.5 flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px] py-0">
            {typeLabels[message.payload.type]}
          </Badge>
          <span className="text-muted-foreground">
            {new Date(message.createdAt * 1000).toLocaleTimeString()}
          </span>
        </div>
        <p className="break-words font-mono">
          {message.payload.data.length > 120
            ? message.payload.data.slice(0, 120) + '...'
            : message.payload.data}
        </p>
      </div>
    </div>
  );
}
