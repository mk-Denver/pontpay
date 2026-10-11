/**
 * TransactionsPage — customer-side coordination history with detail view.
 *
 * Shows all coordinations involving the current user (as proposer or participant).
 * Clicking a coordination opens a detail dialog with:
 *   - Full coordination state + action chain
 *   - NIP-17 encrypted private messages (invoices, instructions)
 *   - Customer-side action buttons (cancel, open_dispute, fiat_sent, etc.)
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
import { useSwapStateMachine } from '@/hooks/useSwapStateMachine';
import { useSwapMessages, type SwapPayloadType, type SwapMessage } from '@/hooks/useSwapMessages';
import { useUnifiedWallet } from '@/hooks/useUnifiedWallet';
import {
  formatSats,
  TERMINAL_STATES,
  isAuthorizedSigner,
  type CoordinationState,
  type PontmoreCoordination,
  type CoordinationActionId,
} from '@/lib/pontmore';

type TxFilter = 'all' | 'buy' | 'sell';

const STATE_LABELS: Record<CoordinationState, string> = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  secured: 'Secured',
  fiat_sent: 'Fiat Sent',
  fiat_confirmed: 'Fiat Confirmed',
  settlement_authorized: 'Settlement Authorized',
  settled: 'Settled',
  refund_authorized: 'Refund Authorized',
  refunded: 'Refunded',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
  disputed: 'Disputed',
};

const STATE_COLORS: Record<CoordinationState, string> = {
  proposed: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  accepted: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
  secured: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
  fiat_sent: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
  fiat_confirmed: 'text-green-600 bg-green-500/10 border-green-500/20',
  settlement_authorized: 'text-green-600 bg-green-500/10 border-green-500/20',
  settled: 'text-green-600 bg-green-500/10 border-green-500/20',
  refund_authorized: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  refunded: 'text-red-600 bg-red-500/10 border-red-500/20',
  declined: 'text-red-600 bg-red-500/10 border-red-500/20',
  cancelled: 'text-red-600 bg-red-500/10 border-red-500/20',
  expired: 'text-red-600 bg-red-500/10 border-red-500/20',
  disputed: 'text-red-600 bg-red-500/10 border-red-500/20',
};

const STATE_FLOW: CoordinationState[] = [
  'proposed', 'accepted', 'secured', 'fiat_sent', 'fiat_confirmed',
  'settlement_authorized', 'settled',
];

/** Customer actions available in a given coordination state. */
function getCustomerActions(coord: PontmoreCoordination, myPubkey: string): { label: string; action: CoordinationActionId; variant: 'default' | 'outline' | 'destructive'; icon: typeof Check; data?: Record<string, unknown> }[] {
  const { state } = coord;
  const actions: ReturnType<typeof getCustomerActions> = [];

  const isTerminal = TERMINAL_STATES.includes(state);
  if (isTerminal || state === 'disputed') return actions;

  // Customer can always cancel before secure (if they're authorized)
  if (['proposed', 'accepted'].includes(state) && isAuthorizedSigner('core/cancel', myPubkey, coord)) {
    actions.push({ label: 'Cancel', action: 'core/cancel', variant: 'destructive', icon: X });
  }

  // Customer can open dispute when accepted and no terminal
  if (['accepted', 'secured', 'fiat_sent', 'fiat_confirmed', 'settlement_authorized', 'refund_authorized'].includes(state) && isAuthorizedSigner('core/open_dispute', myPubkey, coord)) {
    actions.push({ label: 'Open dispute', action: 'core/open_dispute', variant: 'destructive', icon: AlertCircle, data: { class: 'fiat_not_received' } });
  }

  // Customer can send fiat (if they're the fiat sender — buy direction)
  if (state === 'secured' && isAuthorizedSigner('swap/fiat_sent', myPubkey, coord)) {
    actions.push({ label: 'Mark fiat sent', action: 'swap/fiat_sent', variant: 'default', icon: Check, data: { payment_reference: 'customer-sent' } });
  }

  // Customer can confirm fiat received (if they're the fiat receiver — sell direction)
  if (state === 'fiat_sent' && isAuthorizedSigner('swap/fiat_confirmed', myPubkey, coord)) {
    actions.push({ label: 'Confirm fiat received', action: 'swap/fiat_confirmed', variant: 'default', icon: CheckCircle2, data: { payment_reference: 'customer-confirmed' } });
  }

  // Customer can authorize settlement (if they're the fiat receiver — sell direction)
  if (state === 'fiat_confirmed' && isAuthorizedSigner('core/authorize_settlement', myPubkey, coord)) {
    actions.push({ label: 'Authorize settlement', action: 'core/authorize_settlement', variant: 'default', icon: Check });
  }

  // Customer can authorize refund (if they're the bitcoin provider — sell direction)
  if (state === 'secured' && isAuthorizedSigner('core/authorize_refund', myPubkey, coord)) {
    actions.push({ label: 'Authorize refund', action: 'core/authorize_refund', variant: 'outline', icon: AlertCircle });
  }

  return actions;
}

export default function TransactionsPage() {
  const { user } = useCurrentUser();
  const { localCoordinations, clearHistory, useMyCoordinations } = useSwapStateMachine();
  const { data: nostrCoords, isLoading } = useMyCoordinations();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TxFilter>('all');
  const [selectedCoord, setSelectedCoord] = useState<PontmoreCoordination | null>(null);

  useSeoMeta({
    title: 'Swap History — PontPay',
    description: 'View your full Pontmore coordination history.',
  });

  const allCoords = useMemo(
    () => nostrCoords && nostrCoords.length > 0 ? nostrCoords : [],
    [nostrCoords],
  );

  const filtered = useMemo(() => {
    return allCoords.filter((coord) => {
      if (filter !== 'all' && coord.swapType !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matches =
          coord.coordinationId.toLowerCase().includes(q) ||
          coord.terms.fiat.currency.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [allCoords, filter, search]);

  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
            <Receipt className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold">Swap History</h1>
          <p className="mt-3 text-muted-foreground">
            Log in with your Nostr identity to view your coordination history.
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
              All your Pontmore coordinations (PIP-02 v2).
            </p>
          </div>
          {localCoordinations.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm('Clear local coordination history? This cannot be undone.')) {
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
              placeholder="Search by coordination ID or currency..."
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
                <SelectItem value="buy">Buy (fiat→BTC)</SelectItem>
                <SelectItem value="sell">Sell (BTC→fiat)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Coordination list */}
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
              <p className="text-lg font-medium">No coordinations yet</p>
              <p className="mt-2 max-w-sm mx-auto text-sm text-muted-foreground">
                Your swaps will appear here. Start from the dashboard.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((coord) => (
              <CoordRow key={coord.coordinationId} coord={coord} onClick={() => setSelectedCoord(coord)} />
            ))}
          </div>
        )}
      </div>

      {/* Coordination detail dialog */}
      <Dialog open={!!selectedCoord} onOpenChange={(open) => !open && setSelectedCoord(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCoord?.swapType === 'buy' && <ArrowDownToLine className="h-5 w-5 text-green-600" />}
              {selectedCoord?.swapType === 'sell' && <ArrowUpFromLine className="h-5 w-5 text-orange-600" />}
              <span className="capitalize">{selectedCoord?.swapType}</span>
            </DialogTitle>
            <DialogDescription>
              Coordination details — view state, actions, and messages.
            </DialogDescription>
          </DialogHeader>
          {selectedCoord && <LiveCoordDetailPanel coordinationId={selectedCoord.coordinationId} fallbackCoord={selectedCoord} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ─── Coordination Row ───────────────────────────────────────────

function CoordRow({ coord, onClick }: { coord: PontmoreCoordination; onClick: () => void }) {
  const Icon = coord.swapType === 'buy' ? ArrowDownToLine : ArrowUpFromLine;
  const statusClass = STATE_COLORS[coord.state];

  return (
    <Card className="cursor-pointer transition-colors hover:bg-muted/30" onClick={onClick}>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${coord.direction === 'incoming' ? 'bg-green-500/10' : 'bg-muted'}`}>
          <Icon className={`h-5 w-5 ${coord.direction === 'incoming' ? 'text-green-600' : 'text-muted-foreground'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium capitalize">{coord.swapType} · {coord.direction}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatSats(coord.terms.bitcoin.amount)}
            {coord.terms.fiat.amount ? ` · ${coord.terms.fiat.currency} ${parseFloat(coord.terms.fiat.amount).toLocaleString()}` : ''}
            {' · '}{new Date(coord.rootEvent.created_at * 1000).toLocaleString()}
          </p>
        </div>
        <Badge variant="outline" className={`shrink-0 ${statusClass}`}>{STATE_LABELS[coord.state]}</Badge>
      </CardContent>
    </Card>
  );
}

// ─── Live Coordination Detail Panel ─────────────────────────────

function LiveCoordDetailPanel({ coordinationId, fallbackCoord }: { coordinationId: string; fallbackCoord: PontmoreCoordination }) {
  const { useCoordination } = useSwapStateMachine();
  const { data: liveCoord, isLoading } = useCoordination(coordinationId);

  const coord = liveCoord ?? fallbackCoord;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <CoordDetailPanel coord={coord} />;
}

// ─── Coordination Detail Panel (customer side) ──────────────────

function CoordDetailPanel({ coord }: { coord: PontmoreCoordination }) {
  const { user } = useCurrentUser();
  const { publishCoordinationAction } = useSwapStateMachine();
  const { useSwapInbox, sendMessage, hasNip44 } = useSwapMessages();
  const { hasWallet, payInvoice, isPaying } = useUnifiedWallet();
  const { data: messages, isLoading: msgLoading } = useSwapInbox(coord.coordinationId);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [payingInvoice, setPayingInvoice] = useState(false);
  const [sendData, setSendData] = useState('');
  const [sending, setSending] = useState(false);

  const myPubkey = user?.pubkey ?? '';
  const actions = useMemo(() => getCustomerActions(coord, myPubkey), [coord, myPubkey]);

  // Chain tip for publishing the next action
  const chainTip = coord.actions.length > 0
    ? coord.actions[coord.actions.length - 1].eventId
    : coord.rootEvent.id;

  const handleAction = async (actionId: CoordinationActionId, data?: Record<string, unknown>) => {
    setActionPending(actionId);
    try {
      await publishCoordinationAction.mutateAsync({
        coordinationId: coord.coordinationId,
        action: actionId,
        prevEventId: chainTip,
        data,
      });
    } catch (err) {
      console.error('Action failed:', err);
      alert(`Failed to publish action: ${actionId}. Please try again.`);
    } finally {
      setActionPending(null);
    }
  };

  // Find the agent's invoice (for sell, agent sends invoice for customer to pay)
  const agentInvoice = messages?.find(
    (m) => m.payload.type === 'invoice' && m.senderPubkey !== myPubkey,
  );

  const handlePayAgentInvoice = async () => {
    if (!agentInvoice) return;
    setPayingInvoice(true);
    try {
      const result = await payInvoice(agentInvoice.payload.data);
      if (result) {
        await sendMessage.mutateAsync({
          swapId: coord.coordinationId,
          recipientPubkey: coord.participants.find((p) => p.role === 'swap/agent')?.pubkey ?? '',
          payloadType: 'payment_proof',
          data: result.preimage,
          label: 'Lightning payment preimage',
        });
      }
    } catch (err) {
      console.error('Invoice payment failed:', err);
      alert('Failed to pay the Lightning invoice. Please try again.');
    } finally {
      setPayingInvoice(false);
    }
  };

  const handleSendMessage = async () => {
    if (!sendData.trim()) return;
    setSending(true);
    try {
      const agentPubkey = coord.participants.find((p) => p.role === 'swap/agent')?.pubkey ?? '';
      await sendMessage.mutateAsync({
        swapId: coord.coordinationId,
        recipientPubkey: agentPubkey,
        payloadType: 'message',
        data: sendData,
      });
      setSendData('');
    } catch (err) {
      console.error('Message send failed:', err);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const isTerminal = TERMINAL_STATES.includes(coord.state);
  const currentIndex = STATE_FLOW.indexOf(coord.state);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <DetailRow label="BTC amount" value={formatSats(coord.terms.bitcoin.amount)} />
        <DetailRow label="Fiat" value={`${coord.terms.fiat.currency} ${parseFloat(coord.terms.fiat.amount).toLocaleString()}`} />
        <DetailRow label="Direction" value={coord.terms.direction.replace(/_/g, ' → ')} />
        <DetailRow label="Payment channel" value={coord.terms.payment_channel} mono />
        <DetailRow label="Coordination ID" value={`${coord.coordinationId.slice(0, 16)}...`} mono />
        <DetailRow label="Created" value={new Date(coord.rootEvent.created_at * 1000).toLocaleString()} />
      </div>

      {/* State machine progress */}
      <div>
        <p className="mb-2 text-sm font-medium">State progress</p>
        {!isTerminal && coord.state !== 'disputed' ? (
          currentIndex >= 0 ? (
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
                    {STATE_LABELS[state]}
                  </div>
                  {i < STATE_FLOW.length - 1 && (
                    <div className={`h-px w-4 ${isPast ? 'bg-green-500/40' : 'bg-border'}`} />
                  )}
                </div>
              );
            })}
          </div>
          ) : (
            <Badge variant="outline" className={STATE_COLORS[coord.state]}>
              {STATE_LABELS[coord.state]}
            </Badge>
          )
        ) : (
          <Badge variant="outline" className={STATE_COLORS[coord.state]}>
            {STATE_LABELS[coord.state]}
          </Badge>
        )}
      </div>

      {/* Action chain log */}
      {coord.actions.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Action chain</p>
          <div className="space-y-1.5">
            {coord.actions.map((act, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{act.action}</span>
                  <span className="text-muted-foreground"> · {act.pubkey.slice(0, 12)}…</span>
                  {act.data?.payment_reference && (
                    <p className="text-muted-foreground">ref: {act.data.payment_reference}</p>
                  )}
                </div>
                <span className="shrink-0 text-muted-foreground">
                  {new Date(act.created_at * 1000).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lightning payment — for sell, customer pays agent's invoice */}
      {coord.swapType === 'sell' && coord.state === 'accepted' && agentInvoice && (
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
          <p className="mb-3 text-sm font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-600" /> Pay online
          </p>
          <div className="space-y-2">
            <code className="block truncate rounded bg-background px-2 py-1.5 text-xs">
              {agentInvoice.payload.data.slice(0, 50)}...
            </code>
            {hasWallet ? (
              <Button onClick={handlePayAgentInvoice} disabled={payingInvoice || isPaying} size="sm" className="w-full">
                {payingInvoice || isPaying ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Paying invoice…</>
                ) : (
                  <><Zap className="h-4 w-4" /> Pay invoice ({formatSats(coord.terms.bitcoin.amount)})</>
                )}
              </Button>
            ) : (
              <p className="text-xs text-amber-600">Connect a wallet to pay the invoice.</p>
            )}
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
              const isPending = actionPending === action.action;
              return (
                <Button
                  key={action.action}
                  variant={action.variant}
                  size="sm"
                  onClick={() => handleAction(action.action, action.data)}
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
                  <CustomerMessageBubble key={msg.id} message={msg} isOwn={msg.senderPubkey === myPubkey} />
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
      <p className={`font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
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
