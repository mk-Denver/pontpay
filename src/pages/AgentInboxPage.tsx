/**
 * AgentInboxPage — the agent-side swap management UI.
 *
 * Shows incoming swap requests directed at the current user (as the tagged
 * agent on kind 7300). The agent can:
 *   - Accept or reject incoming requests
 *   - Advance the swap state machine (kind 7301 transitions)
 *   - Publish evidence (kind 7302)
 *   - View and send encrypted private messages (NIP-17 gift wrap)
 *
 * This closes the loop: when a customer publishes a swap request, the agent
 * discovers it here and can act on it.
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
  Shield,
  Loader2,
  MessageSquare,
  Zap,
  UserPlus,
  Lock,
  AlertCircle,
  Receipt,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { AppLayout } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAgentRegistration } from '@/hooks/useAgentRegistration';
import { useIncomingSwaps } from '@/hooks/useIncomingSwaps';
import { useSwapStateMachine } from '@/hooks/useSwapStateMachine';
import { useSwapMessages, type SwapPayloadType } from '@/hooks/useSwapMessages';
import { useAuthor } from '@/hooks/useAuthor';
import { formatSats, type SwapState, type PontmoreSwap } from '@/lib/pontmore';

// ─── State machine helpers ───────────────────────────────────────

interface SwapAction {
  label: string;
  nextState: SwapState;
  reason: string;
  variant: 'default' | 'outline' | 'destructive';
  icon: typeof Check;
}

/** Valid agent actions for a given swap state. */
function getAgentActions(state: SwapState, swapType: string): SwapAction[] {
  const actions: SwapAction[] = [];

  switch (state) {
    case 'requested':
      actions.push({
        label: 'Accept swap',
        nextState: 'escrow_init',
        reason: 'Agent accepted the swap request and is initializing escrow',
        variant: 'default',
        icon: Check,
      });
      actions.push({
        label: 'Reject',
        nextState: 'cancelled',
        reason: 'Agent rejected the swap request',
        variant: 'destructive',
        icon: X,
      });
      break;

    case 'escrow_init':
      // Waiting for customer to fund escrow — no agent action needed
      break;

    case 'escrow_funded':
      if (swapType === 'deposit') {
        // For deposits: customer funded BTC escrow, now waiting for fiat
        actions.push({
          label: 'Fiat received',
          nextState: 'fiat_confirmed',
          reason: 'Agent confirms fiat payment received from customer',
          variant: 'default',
          icon: CheckCircle2,
        });
      } else if (swapType === 'withdrawal') {
        // For withdrawals: customer paid BTC, agent needs to send fiat
        actions.push({
          label: 'Sending fiat payout',
          nextState: 'payout_pending',
          reason: 'Agent initiated fiat payout to customer',
          variant: 'default',
          icon: Send,
        });
      }
      break;

    case 'fiat_pending':
      if (swapType === 'deposit') {
        actions.push({
          label: 'Confirm fiat received',
          nextState: 'fiat_confirmed',
          reason: 'Agent confirms fiat payment received',
          variant: 'default',
          icon: CheckCircle2,
        });
      }
      break;

    case 'fiat_confirmed':
      if (swapType === 'deposit') {
        actions.push({
          label: 'Release BTC payout',
          nextState: 'payout_pending',
          reason: 'Agent releasing BTC to customer via Lightning',
          variant: 'default',
          icon: Zap,
        });
      }
      break;

    case 'payout_pending':
      actions.push({
        label: 'Mark payout sent',
        nextState: 'payout_sent',
        reason: 'Agent confirms payout has been sent',
        variant: 'default',
        icon: CheckCircle2,
      });
      break;

    case 'payout_sent':
      actions.push({
        label: 'Complete swap',
        nextState: 'completed',
        reason: 'Swap fully settled — both sides confirmed',
        variant: 'default',
        icon: CheckCircle2,
      });
      break;

    case 'completed':
    case 'cancelled':
    case 'disputed':
    case 'expired':
      // Terminal states — no actions
      break;
  }

  // Allow dispute from any active state
  if (!['completed', 'cancelled', 'disputed', 'expired', 'requested'].includes(state)) {
    actions.push({
      label: 'Raise dispute',
      nextState: 'disputed',
      reason: 'Agent raised a dispute on this swap',
      variant: 'destructive',
      icon: AlertCircle,
    });
  }

  return actions;
}

/** Ordered states for the progress visualization. */
const STATE_FLOW: SwapState[] = [
  'requested',
  'escrow_init',
  'escrow_funded',
  'fiat_pending',
  'fiat_confirmed',
  'payout_pending',
  'payout_sent',
  'completed',
];

const TERMINAL_STATES: SwapState[] = ['cancelled', 'disputed', 'expired'];

const STATE_LABELS: Record<SwapState, string> = {
  requested: 'Requested',
  escrow_init: 'Escrow Init',
  escrow_funded: 'Escrow Funded',
  fiat_pending: 'Fiat Pending',
  fiat_confirmed: 'Fiat Confirmed',
  payout_pending: 'Payout Pending',
  payout_sent: 'Payout Sent',
  completed: 'Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
  expired: 'Expired',
};

const STATE_COLORS: Record<SwapState, string> = {
  requested: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  escrow_init: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
  escrow_funded: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
  fiat_pending: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  fiat_confirmed: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
  payout_pending: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  payout_sent: 'text-green-600 bg-green-500/10 border-green-500/20',
  completed: 'text-green-600 bg-green-500/10 border-green-500/20',
  cancelled: 'text-red-600 bg-red-500/10 border-red-500/20',
  disputed: 'text-red-600 bg-red-500/10 border-red-500/20',
  expired: 'text-red-600 bg-red-500/10 border-red-500/20',
};

// ─── Page ────────────────────────────────────────────────────────

export default function AgentInboxPage() {
  const { user } = useCurrentUser();
  const { isRegistered, isLoading: regLoading } = useAgentRegistration();
  const { data: incomingSwaps, isLoading } = useIncomingSwaps();
  const [selectedSwap, setSelectedSwap] = useState<PontmoreSwap | null>(null);

  useSeoMeta({
    title: 'Agent Inbox — PontPay',
    description: 'Manage incoming swap requests as a Pontmore agent.',
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
            Log in with your Nostr identity to view incoming swap requests.
          </p>
        </div>
      </AppLayout>
    );
  }

  // Not registered as an agent
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
            swap requests. Register now to join the agent network.
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
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Agent Inbox</h1>
          <p className="mt-1 text-muted-foreground">
            Incoming swap requests directed at you (PIP-02 state machine).
          </p>
        </div>

        {/* Swap list */}
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
                When customers publish swap requests tagged to you, they'll
                appear here. Share your agent listing so customers can find you.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link to="/agents">View your listing</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {incomingSwaps.map((swap) => (
              <SwapRequestCard
                key={swap.swapId}
                swap={swap}
                onClick={() => setSelectedSwap(swap)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Swap detail dialog */}
      <Dialog open={!!selectedSwap} onOpenChange={(open) => !open && setSelectedSwap(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedSwap?.swapType === 'deposit' && <ArrowDownToLine className="h-5 w-5 text-green-600" />}
              {selectedSwap?.swapType === 'withdrawal' && <ArrowUpFromLine className="h-5 w-5 text-orange-600" />}
              {selectedSwap?.swapType === 'transfer' && <Send className="h-5 w-5 text-blue-600" />}
              <span className="capitalize">{selectedSwap?.swapType} request</span>
            </DialogTitle>
            <DialogDescription>
              Manage this swap — advance the state machine and exchange private details.
            </DialogDescription>
          </DialogHeader>
          {selectedSwap && <SwapDetailPanel swap={selectedSwap} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ─── Swap Request Card ───────────────────────────────────────────

function SwapRequestCard({ swap, onClick }: { swap: PontmoreSwap; onClick: () => void }) {
  const Icon = swap.swapType === 'deposit' ? ArrowDownToLine : swap.swapType === 'withdrawal' ? ArrowUpFromLine : Send;
  const { data: authorData } = useAuthor(swap.customerPubkey);
  const customerName = authorData?.metadata?.name ?? `${swap.customerPubkey.slice(0, 12)}...`;

  return (
    <Card className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30" onClick={onClick}>
      <CardContent className="flex items-center gap-3 py-4 px-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
          <Icon className="h-5 w-5 text-orange-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium capitalize">
            {swap.swapType} · from {customerName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {formatSats(swap.bitcoinAmountSats)}
            {swap.fiatAmount ? ` · ${swap.fiatCurrency} ${swap.fiatAmount.toLocaleString()}` : ''}
            {' · '}{new Date(swap.createdAt * 1000).toLocaleDateString()}
          </p>
        </div>
        <Badge variant="outline" className={`shrink-0 ${STATE_COLORS[swap.state]}`}>
          {STATE_LABELS[swap.state]}
        </Badge>
      </CardContent>
    </Card>
  );
}

// ─── Swap Detail Panel (inside dialog) ───────────────────────────

function SwapDetailPanel({ swap }: { swap: PontmoreSwap }) {
  const { publishTransition, publishEvidence } = useSwapStateMachine();
  const { hasNip44 } = useSwapMessages();
  const [evidenceDialogOpen, setEvidenceDialogOpen] = useState(false);
  const [actionPending, setActionPending] = useState<SwapAction | null>(null);

  const actions = useMemo(() => getAgentActions(swap.state, swap.swapType), [swap.state, swap.swapType]);

  const handleAction = async (action: SwapAction) => {
    setActionPending(action);
    try {
      await publishTransition.mutateAsync({
        swapId: swap.swapId,
        newState: action.nextState,
        prevState: swap.state,
        actorRole: 'agent',
        reason: action.reason,
      });
    } finally {
      setActionPending(null);
    }
  };

  const currentIndex = STATE_FLOW.indexOf(swap.state);
  const isTerminal = TERMINAL_STATES.includes(swap.state);

  return (
    <div className="space-y-5">
      {/* Swap summary */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <DetailRow label="Amount" value={formatSats(swap.bitcoinAmountSats)} />
        <DetailRow label="Fiat" value={`${swap.fiatCurrency} ${swap.fiatAmount.toLocaleString()}`} />
        <DetailRow label="Customer" value={`${swap.customerPubkey.slice(0, 16)}...`} mono />
        <DetailRow label="Swap ID" value={swap.swapId} mono />
        <DetailRow label="Created" value={new Date(swap.createdAt * 1000).toLocaleString()} />
        <DetailRow label="Escrow ref" value={swap.escrowReference.slice(0, 24) + '...'} mono />
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
                  <div
                    className={`flex h-7 items-center rounded-full px-2.5 text-xs font-medium transition-colors ${
                      isCurrent
                        ? 'bg-primary text-primary-foreground'
                        : isPast
                        ? 'bg-green-500/15 text-green-600'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
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
          <Badge variant="outline" className={STATE_COLORS[swap.state]}>
            {STATE_LABELS[swap.state]}
          </Badge>
        )}
      </div>

      {/* Transition log */}
      {swap.transitions.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Transition log</p>
          <div className="space-y-1.5">
            {swap.transitions.map((t, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{STATE_LABELS[t.state]}</span>
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

      {/* Agent actions */}
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
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                  {action.label}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      <Separator />

      {/* Private message lane */}
      <PrivateLane swap={swap} hasNip44={hasNip44} />

      <Separator />

      {/* Evidence */}
      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Evidence
          </p>
          <Button variant="outline" size="sm" onClick={() => setEvidenceDialogOpen(true)}>
            <Receipt className="h-4 w-4" /> Add evidence
          </Button>
        </div>
        {swap.evidence.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {swap.evidence.map((ev, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{ev.type}</span>
                  {ev.description && <p className="text-muted-foreground">{ev.description}</p>}
                  <p className="truncate font-mono text-muted-foreground">{ev.reference}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">No evidence published yet.</p>
        )}
      </div>

      {/* Evidence dialog */}
      <EvidenceDialog
        open={evidenceDialogOpen}
        onOpenChange={setEvidenceDialogOpen}
        swapId={swap.swapId}
        onPublish={async (type, reference, description) => {
          await publishEvidence.mutateAsync({
            swapId: swap.swapId,
            evidenceType: type,
            reference,
            description,
          });
          setEvidenceDialogOpen(false);
        }}
        isPublishing={publishEvidence.isPending}
      />
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

function PrivateLane({ swap, hasNip44 }: { swap: PontmoreSwap; hasNip44: boolean }) {
  const { useSwapInbox, sendMessage } = useSwapMessages();
  const { data: messages, isLoading } = useSwapInbox(swap.swapId);
  const [sendType, setSendType] = useState<SwapPayloadType>('payment_proof');
  const [sendData, setSendData] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!sendData.trim()) return;
    setSending(true);
    try {
      await sendMessage.mutateAsync({
        swapId: swap.swapId,
        recipientPubkey: swap.customerPubkey,
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
            signer (browser extension or nsec login) to use the encrypted
            private message lane for exchanging invoices and payment details.
          </p>
        </div>
      </div>
    );
  }

  const payloadTypeOptions: { value: SwapPayloadType; label: string }[] = [
    { value: 'payment_proof', label: 'Payment proof' },
    { value: 'payout_confirmation', label: 'Payout confirmation' },
    { value: 'invoice', label: 'Lightning invoice' },
    { value: 'message', label: 'Message' },
  ];

  return (
    <div>
      <p className="mb-2 text-sm font-medium flex items-center gap-2">
        <MessageSquare className="h-4 w-4" /> Private messages
        <Badge variant="secondary" className="text-xs">
          <Lock className="mr-1 h-3 w-3" /> NIP-17 encrypted
        </Badge>
      </p>

      {/* Received messages */}
      <div className="mb-3 max-h-48 space-y-1.5 overflow-y-auto">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !messages || messages.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            No private messages yet. Customers may send Lightning invoices or
            bank details here after you accept the swap.
          </p>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} isOwn={msg.senderPubkey === swap.agentPubkey} />
          ))
        )}
      </div>

      {/* Send message */}
      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
        <div className="flex flex-wrap gap-1.5">
          {payloadTypeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSendType(opt.value)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                sendType === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Textarea
          placeholder={
            sendType === 'invoice'
              ? 'Paste Lightning invoice (lnbc...)...'
              : sendType === 'payment_proof'
              ? 'Payment proof (preimage, tx hash, receipt number)...'
              : 'Enter details to send encrypted to the customer...'
          }
          value={sendData}
          onChange={(e) => setSendData(e.target.value)}
          rows={2}
          className="text-sm"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={sending || !sendData.trim()}
          className="w-full"
        >
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

function MessageBubble({ message, isOwn }: { message: import('@/hooks/useSwapMessages').SwapMessage; isOwn: boolean }) {
  const typeLabels: Record<SwapPayloadType, string> = {
    invoice: 'Lightning Invoice',
    bank_details: 'Bank Details',
    payout_confirmation: 'Payout Confirmation',
    payment_proof: 'Payment Proof',
    message: 'Message',
  };

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg p-2.5 text-xs ${
        isOwn ? 'bg-primary/10' : 'bg-muted/60'
      }`}>
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

// ─── Evidence Dialog ─────────────────────────────────────────────

function EvidenceDialog({
  open,
  onOpenChange,
  swapId,
  onPublish,
  isPublishing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  swapId: string;
  onPublish: (type: string, reference: string, description?: string) => Promise<void>;
  isPublishing: boolean;
}) {
  const [type, setType] = useState('payment_receipt');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');

  const evidenceTypes = [
    'payment_receipt',
    'payout_proof',
    'fiat_transfer_proof',
    'lightning_preimage',
    'bank_transaction_ref',
    'other',
  ];

  const handlePublish = async () => {
    if (!type || !reference.trim()) return;
    await onPublish(type, reference, description || undefined);
    setType('payment_receipt');
    setReference('');
    setDescription('');
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish evidence (kind 7302)</AlertDialogTitle>
          <AlertDialogDescription>
            Evidence for swap <code className="text-xs">{swapId}</code>. This is
            a public, immutable record — use references (hashes, tx ids), not
            raw sensitive data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="evidence-type">Evidence type</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {evidenceTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    type === t
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="evidence-ref">Reference</Label>
            <Input
              id="evidence-ref"
              placeholder="e.g. tx hash, preimage, receipt number"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="evidence-desc">Description (optional)</Label>
            <Input
              id="evidence-desc"
              placeholder="Brief context for this evidence"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPublishing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handlePublish}
            disabled={isPublishing || !reference.trim()}
          >
            {isPublishing ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Publishing…</>
            ) : (
              'Publish evidence'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
