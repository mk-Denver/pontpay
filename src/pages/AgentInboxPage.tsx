/**
 * AgentInboxPage — the agent-side coordination management UI.
 *
 * Shows incoming coordination roots directed at the current user (as the
 * tagged swap/agent participant on kind 7300). The agent can:
 *   - Accept (core/accept) or decline (core/decline) incoming requests
 *   - Secure the escrow (core/secure) — as core/escrow authority
 *   - Advance the coordination chain (swap/fiat_sent, swap/fiat_confirmed, etc.)
 *   - Authorize settlement (core/authorize_settlement)
 *   - Settle (core/settle) or refund (core/refund) — as core/escrow authority
 *   - Cancel (core/cancel), open dispute (core/open_dispute)
 *   - View and send encrypted private messages (NIP-17 gift wrap)
 *
 * PIP-02 v2 coordination: kind 7300 (root) + kind 7301 (action chain)
 */

import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import {
  Inbox,
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
  Check,
  X,
  Loader2,
  MessageSquare,
  UserPlus,
  Lock,
  AlertCircle,
  Clock,
  CheckCircle2,
  Shield,
} from 'lucide-react';
import { AppLayout } from '@/components/Navbar';
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
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAgentRegistration } from '@/hooks/useAgentRegistration';
import { useIncomingSwaps } from '@/hooks/useIncomingSwaps';
import { useSwapStateMachine } from '@/hooks/useSwapStateMachine';
import { useSwapMessages, type SwapPayloadType, type SwapMessage } from '@/hooks/useSwapMessages';
import { useAuthor } from '@/hooks/useAuthor';
import {
  formatSats,
  TERMINAL_STATES,
  isAuthorizedSigner,
  type CoordinationState,
  type PontmoreCoordination,
  type CoordinationActionId,
} from '@/lib/pontmore';

// ─── State helpers ───────────────────────────────────────────────

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

interface AgentAction {
  label: string;
  action: CoordinationActionId;
  variant: 'default' | 'outline' | 'destructive';
  icon: typeof Check;
  data?: Record<string, unknown>;
}

/** Valid agent actions for a given coordination state. */
function getAgentActions(coord: PontmoreCoordination, myPubkey: string): AgentAction[] {
  const { state } = coord;
  const actions: AgentAction[] = [];
  const isTerminal = TERMINAL_STATES.includes(state);
  if (isTerminal || state === 'disputed') return actions;

  const isBuy = coord.swapType === 'buy';

  switch (state) {
    case 'proposed':
      if (isAuthorizedSigner('core/accept', myPubkey, coord)) {
        actions.push({ label: 'Accept', action: 'core/accept', variant: 'default', icon: Check });
      }
      if (isAuthorizedSigner('core/decline', myPubkey, coord)) {
        actions.push({ label: 'Decline', action: 'core/decline', variant: 'destructive', icon: X });
      }
      break;

    case 'accepted':
      if (isAuthorizedSigner('core/secure', myPubkey, coord)) {
        actions.push({ label: 'Secure escrow', action: 'core/secure', variant: 'default', icon: Shield });
      }
      if (isAuthorizedSigner('core/cancel', myPubkey, coord)) {
        actions.push({ label: 'Cancel', action: 'core/cancel', variant: 'destructive', icon: X });
      }
      break;

    case 'secured':
      if (isBuy) {
        // Buy: agent is fiat receiver and bitcoin provider
        if (isAuthorizedSigner('swap/fiat_confirmed', myPubkey, coord)) {
          actions.push({ label: 'Confirm fiat received', action: 'swap/fiat_confirmed', variant: 'default', icon: CheckCircle2, data: { payment_reference: 'agent-confirmed' } });
        }
      } else {
        // Sell: agent is fiat sender
        if (isAuthorizedSigner('swap/fiat_sent', myPubkey, coord)) {
          actions.push({ label: 'Mark fiat sent', action: 'swap/fiat_sent', variant: 'default', icon: Check, data: { payment_reference: 'agent-sent' } });
        }
      }
      if (isAuthorizedSigner('core/authorize_refund', myPubkey, coord)) {
        actions.push({ label: 'Authorize refund', action: 'core/authorize_refund', variant: 'outline', icon: AlertCircle });
      }
      break;

    case 'fiat_sent':
      // Sell: agent sent fiat, waiting for customer to confirm
      break;

    case 'fiat_confirmed':
      // Buy: agent confirmed fiat, can authorize settlement
      if (isAuthorizedSigner('core/authorize_settlement', myPubkey, coord)) {
        actions.push({ label: 'Authorize settlement', action: 'core/authorize_settlement', variant: 'default', icon: Check });
      }
      break;

    case 'settlement_authorized':
      if (isAuthorizedSigner('core/settle', myPubkey, coord)) {
        actions.push({ label: 'Settle', action: 'core/settle', variant: 'default', icon: CheckCircle2 });
      }
      break;

    case 'refund_authorized':
      if (isAuthorizedSigner('core/refund', myPubkey, coord)) {
        actions.push({ label: 'Refund', action: 'core/refund', variant: 'default', icon: CheckCircle2 });
      }
      break;
  }

  // Open dispute from any active non-terminal state
  if (['accepted', 'secured', 'fiat_sent', 'fiat_confirmed', 'settlement_authorized', 'refund_authorized'].includes(state)) {
    if (isAuthorizedSigner('core/open_dispute', myPubkey, coord)) {
      actions.push({ label: 'Open dispute', action: 'core/open_dispute', variant: 'destructive', icon: AlertCircle, data: { class: 'fiat_not_received' } });
    }
  }

  return actions;
}

// ─── Page ────────────────────────────────────────────────────────

export default function AgentInboxPage() {
  const { user } = useCurrentUser();
  const { isRegistered, isLoading: regLoading } = useAgentRegistration();
  const { data: incomingSwaps, isLoading } = useIncomingSwaps();
  const [selectedCoord, setSelectedCoord] = useState<PontmoreCoordination | null>(null);

  useSeoMeta({
    title: 'Agent Inbox — PontPay',
    description: 'Manage incoming coordination requests as a Pontmore agent.',
  });

  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
            <Inbox className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold">Agent Inbox</h1>
          <p className="mt-3 text-muted-foreground">
            Log in with your Nostr identity to view incoming coordination requests.
          </p>
        </div>
      </AppLayout>
    );
  }

  if (!regLoading && !isRegistered) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
            <UserPlus className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold">Become an Agent</h1>
          <p className="mt-3 text-muted-foreground">
            You need to register as a Pontmore agent before you can receive
            coordination requests.
          </p>
          <Button asChild className="mt-6">
            <Link to="/register-agent">
              <UserPlus className="h-4 w-4" /> Register as agent
            </Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Agent Inbox</h1>
          <p className="mt-1 text-muted-foreground">
            Incoming coordination requests from customers (PIP-02 v2).
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
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
        ) : !incomingSwaps || incomingSwaps.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 px-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium">No incoming requests</p>
              <p className="mt-2 max-w-sm mx-auto text-sm text-muted-foreground">
                When customers publish coordination roots tagged to you, they'll
                appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {incomingSwaps.map((coord) => (
              <CoordRequestCard key={coord.coordinationId} coord={coord} onClick={() => setSelectedCoord(coord)} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!selectedCoord} onOpenChange={(open) => !open && setSelectedCoord(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCoord?.swapType === 'buy' && <ArrowDownToLine className="h-5 w-5 text-green-600" />}
              {selectedCoord?.swapType === 'sell' && <ArrowUpFromLine className="h-5 w-5 text-orange-600" />}
              <span className="capitalize">{selectedCoord?.swapType} coordination</span>
            </DialogTitle>
            <DialogDescription>
              Manage this coordination — advance the action chain and exchange details.
            </DialogDescription>
          </DialogHeader>
          {selectedCoord && <LiveCoordDetailPanel coordinationId={selectedCoord.coordinationId} fallbackCoord={selectedCoord} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ─── Live Coordination Detail Panel ─────────────────────────────

function LiveCoordDetailPanel({ coordinationId, fallbackCoord }: { coordinationId: string; fallbackCoord: PontmoreCoordination }) {
  const { useCoordination } = useSwapStateMachine();
  const { data: liveCoord, isLoading } = useCoordination(coordinationId);
  const coord = liveCoord ?? fallbackCoord;
  const isNotFound = !isLoading && liveCoord === null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
        <AlertCircle className="mb-2 h-6 w-6" />
        Coordination not found on relays. Showing last known state.
      </div>
    );
  }

  return <CoordDetailPanel coord={coord} />;
}

// ─── Coordination Request Card ───────────────────────────────────

function CoordRequestCard({ coord, onClick }: { coord: PontmoreCoordination; onClick: () => void }) {
  const Icon = coord.swapType === 'buy' ? ArrowDownToLine : ArrowUpFromLine;
  const customerPubkey = coord.participants.find((p) => p.role === 'swap/customer')?.pubkey ?? '';
  const { data: authorData } = useAuthor(customerPubkey);
  const customerName = authorData?.metadata?.name ?? `${customerPubkey.slice(0, 12)}...`;

  return (
    <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30" onClick={onClick}>
      <CardContent className="flex items-center gap-3 py-4 px-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
          <Icon className="h-5 w-5 text-orange-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium capitalize">
            {coord.swapType} · from {customerName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {formatSats(coord.terms.bitcoin.amount)}
            {coord.terms.fiat.amount ? ` · ${coord.terms.fiat.currency} ${parseFloat(coord.terms.fiat.amount).toLocaleString()}` : ''}
            {' · '}{new Date(coord.rootEvent.created_at * 1000).toLocaleDateString()}
          </p>
        </div>
        <Badge variant="outline" className={`shrink-0 ${STATE_COLORS[coord.state]}`}>
          {STATE_LABELS[coord.state]}
        </Badge>
      </CardContent>
    </Card>
  );
}

// ─── Coordination Detail Panel (agent side) ─────────────────────

function CoordDetailPanel({ coord }: { coord: PontmoreCoordination }) {
  const { user } = useCurrentUser();
  const { publishCoordinationAction } = useSwapStateMachine();
  const { hasNip44 } = useSwapMessages();
  const [actionPending, setActionPending] = useState<string | null>(null);

  const myPubkey = user?.pubkey ?? '';
  const actions = useMemo(() => getAgentActions(coord, myPubkey), [coord, myPubkey]);

  // Chain tip for publishing the next action
  const chainTip = coord.actions.length > 0
    ? coord.actions[coord.actions.length - 1].eventId
    : coord.rootEvent.id;

  const customerPubkey = coord.participants.find((p) => p.role === 'swap/customer')?.pubkey ?? '';

  const handleAction = async (actionId: CoordinationActionId, data?: Record<string, unknown>) => {
    setActionPending(actionId);
    try {
      await publishCoordinationAction.mutateAsync({
        coordinationId: coord.coordinationId,
        action: actionId,
        prevEventId: chainTip,
        data,
      });
    } finally {
      setActionPending(null);
    }
  };

  const isTerminal = TERMINAL_STATES.includes(coord.state);
  const currentIndex = STATE_FLOW.indexOf(coord.state);

  // Single guard for ALL async action handlers to prevent chain forks
  const isAnyActionPending = actionPending !== null || publishCoordinationAction.isPending;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <DetailRow label="BTC amount" value={formatSats(coord.terms.bitcoin.amount)} />
        <DetailRow label="Fiat" value={`${coord.terms.fiat.currency} ${parseFloat(coord.terms.fiat.amount).toLocaleString()}`} />
        <DetailRow label="Customer" value={`${customerPubkey.slice(0, 16)}...`} mono />
        <DetailRow label="Direction" value={coord.terms.direction.replace(/_/g, ' → ')} />
        <DetailRow label="Payment channel" value={coord.terms.payment_channel} mono />
        <DetailRow label="Coordination ID" value={`${coord.coordinationId.slice(0, 16)}...`} mono />
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
            // State not in normal flow (e.g. refund_authorized) — show as badge
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

      {/* Agent actions */}
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
                  disabled={isAnyActionPending}
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

      {/* Private message lane */}
      <PrivateLane coord={coord} customerPubkey={customerPubkey} hasNip44={hasNip44} />
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

// ─── Private Lane (NIP-17 messages) ──────────────────────────────

function PrivateLane({ coord, customerPubkey, hasNip44 }: { coord: PontmoreCoordination; customerPubkey: string; hasNip44: boolean }) {
  const { useSwapInbox, sendMessage } = useSwapMessages();
  const { data: messages, isLoading } = useSwapInbox(coord.coordinationId);
  const [sendType, setSendType] = useState<SwapPayloadType>('message');
  const [sendData, setSendData] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!sendData.trim()) return;
    setSending(true);
    try {
      await sendMessage.mutateAsync({
        swapId: coord.coordinationId,
        recipientPubkey: customerPubkey,
        payloadType: sendType,
        data: sendData,
      });
      setSendData('');
    } finally {
      setSending(false);
    }
  };

  if (!hasNip44) {
    return (
      <div>
        <p className="mb-2 text-sm font-medium flex items-center gap-2">
          <Lock className="h-4 w-4" /> Private messages
        </p>
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-amber-600">
            Your signer doesn't support NIP-44 encryption. Upgrade your Nostr
            signer to use the encrypted private message lane.
          </p>
        </div>
      </div>
    );
  }

  const payloadTypeOptions: { value: SwapPayloadType; label: string }[] = [
    { value: 'message', label: 'Message' },
    { value: 'bank_details', label: 'Fiat payment details' },
    { value: 'payout_confirmation', label: 'Payout confirmation' },
  ];

  return (
    <div>
      <p className="mb-2 text-sm font-medium flex items-center gap-2">
        <MessageSquare className="h-4 w-4" /> Private messages
        <Badge variant="secondary" className="text-xs">
          <Lock className="mr-1 h-3 w-3" /> NIP-17 encrypted
        </Badge>
      </p>

      <div className="mb-3 max-h-48 space-y-1.5 overflow-y-auto">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !messages || messages.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            No private messages yet. Customers may send Lightning invoices or
            payment instructions here.
          </p>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} isOwn={msg.senderPubkey !== customerPubkey} />
          ))
        )}
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
        <div className="flex flex-wrap gap-1.5">
          {payloadTypeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSendType(opt.value)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                sendType === opt.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Textarea
          placeholder={
            sendType === 'bank_details' ? 'e.g. M-Pesa send to +254712345678'
            : sendType === 'payout_confirmation' ? 'Confirm fiat payout sent...'
            : 'Enter message to send encrypted to the customer...'
          }
          value={sendData}
          onChange={(e) => setSendData(e.target.value)}
          rows={2}
          className="text-sm"
        />
        <Button size="sm" onClick={handleSend} disabled={sending || !sendData.trim()} className="w-full">
          {sending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Encrypting & sending…</>
          ) : (
            <><Send className="h-4 w-4" /> Send encrypted</>
          )}
        </Button>
      </div>
    </div>
  );
}

function MessageBubble({ message, isOwn }: { message: SwapMessage; isOwn: boolean }) {
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
