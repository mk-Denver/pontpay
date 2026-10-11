import { useSeoMeta } from '@unhead/react';
import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Zap,
  Store,
  Loader2,
  Receipt,
  TrendingUp,
  Shield,
  Info,
  RefreshCw,
} from 'lucide-react';
import { AppLayout } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAgents } from '@/hooks/useAgents';
import { useSwapStateMachine } from '@/hooks/useSwapStateMachine';
import { useSwapMessages } from '@/hooks/useSwapMessages';
import { useEscrowConnection } from '@/hooks/useEscrowConnection';
import { useNostr } from '@nostrify/react';
import {
  formatSats,
  deriveBitcoinAmount,
  PONTMORE_ESCROW_KIND,
  parsePontmoreEscrow,
  type PontmoreCoordination,
  type CoordinationState,
  type SwapType,
} from '@/lib/pontmore';

const CURRENCIES = ['USD', 'KES', 'UGX', 'NGN', 'GHS', 'TZS', 'RWF', 'EUR', 'GBP'];

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

export default function Dashboard() {
  const { user } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const actionParam = searchParams.get('action') as SwapType | null;
  const agentParam = searchParams.get('agent');
  const [action, setAction] = useState<SwapType | null>(actionParam);
  const [prevActionParam, setPrevActionParam] = useState(actionParam);
  if (actionParam !== prevActionParam) {
    setPrevActionParam(actionParam);
    setAction(actionParam);
  }

  const { localCoordinations, useMyCoordinations } = useSwapStateMachine();
  const { data: nostrCoords } = useMyCoordinations();

  useSeoMeta({
    title: 'Dashboard — PontPay',
    description: 'Swap Bitcoin for fiat via the Pontmore agent network.',
  });

  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
            <Zap className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold">Welcome to PontPay</h1>
          <p className="mt-3 text-muted-foreground">
            Log in with your Nostr identity to swap Bitcoin for fiat.
          </p>
          <Button asChild className="mt-6"><Link to="/">Join PontPay</Link></Button>
        </div>
      </AppLayout>
    );
  }

  const liveCoords = nostrCoords && nostrCoords.length > 0 ? nostrCoords : [];
  const recentSwaps = liveCoords.length > 0
    ? liveCoords.slice(0, 5).map(coordToRow)
    : localCoordinations.slice(0, 5);

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
            <p className="mt-1 text-muted-foreground">Swap Bitcoin for fiat via the Pontmore agent network.</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <ActionButton
            icon={ArrowDownToLine} label="Buy BTC" description="Send fiat, receive Bitcoin via escrow"
            onClick={() => { setAction('buy'); setSearchParams({ action: 'buy' }); }} active={action === 'buy'} color="green"
          />
          <ActionButton
            icon={ArrowUpFromLine} label="Sell BTC" description="Send Bitcoin to escrow, receive fiat"
            onClick={() => { setAction('sell'); setSearchParams({ action: 'sell' }); }} active={action === 'sell'} color="orange"
          />
        </div>

        {/* Swap form */}
        {action && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {action === 'buy' && <ArrowDownToLine className="h-5 w-5 text-green-600" />}
                    {action === 'sell' && <ArrowUpFromLine className="h-5 w-5 text-orange-600" />}
                    {action === 'buy' ? 'Buy Bitcoin' : 'Sell Bitcoin'}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {action === 'buy' && 'Send fiat to an agent and receive Bitcoin to your wallet.'}
                    {action === 'sell' && 'Send Bitcoin to an agent and receive fiat to your account.'}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setAction(null); setSearchParams({}); }}>Close</Button>
              </div>
            </CardHeader>
            <CardContent>
              <SwapForm swapType={action} preselectedAgent={agentParam ?? undefined} />
            </CardContent>
          </Card>
        )}

        {/* Recent swaps */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Receipt className="h-5 w-5" /> Recent swaps</h2>
            <Button asChild variant="ghost" size="sm"><Link to="/transactions">View all</Link></Button>
          </div>
          {recentSwaps.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 px-8 text-center">
                <p className="text-sm text-muted-foreground">No swaps yet. Find an agent to start swapping.</p>
                <Button asChild variant="outline" size="sm" className="mt-4"><Link to="/agents"><Store className="h-4 w-4" /> Browse agents</Link></Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">{recentSwaps.map((swap) => <SwapRow key={swap.coordinationId} swap={swap} />)}</div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

/** Unified display row for a coordination (live or local). */
interface SwapDisplayRow {
  coordinationId: string;
  swapType: SwapType;
  state: CoordinationState;
  bitcoinAmount: string;
  fiatAmount: string;
  fiatCurrency: string;
  direction: 'outgoing' | 'incoming';
  createdAt: number;
}

function coordToRow(c: PontmoreCoordination): SwapDisplayRow {
  return {
    coordinationId: c.coordinationId,
    swapType: c.swapType,
    state: c.state,
    bitcoinAmount: c.terms.bitcoin.amount,
    fiatAmount: c.terms.fiat.amount,
    fiatCurrency: c.terms.fiat.currency,
    direction: c.direction,
    createdAt: c.rootEvent.created_at,
  };
}

function ActionButton({ icon: Icon, label, description, onClick, active, color }: {
  icon: React.ComponentType<{ className?: string }>; label: string; description: string;
  onClick: () => void; active: boolean; color: 'green' | 'orange';
}) {
  const colorClasses = {
    green: 'hover:bg-green-500/5 hover:border-green-500/30 text-green-600',
    orange: 'hover:bg-orange-500/5 hover:border-orange-500/30 text-orange-600',
  };
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-2 rounded-xl border bg-background p-4 text-center transition-all hover:shadow-sm sm:p-6 ${colorClasses[color]} ${active ? 'ring-2 ring-primary border-primary/30' : ''}`}>
      <Icon className="h-6 w-6 sm:h-8 sm:w-8" />
      <div><p className="text-sm font-semibold text-foreground">{label}</p><p className="text-xs text-muted-foreground">{description}</p></div>
    </button>
  );
}

function SwapRow({ swap }: { swap: SwapDisplayRow }) {
  const Icon = swap.swapType === 'buy' ? ArrowDownToLine : ArrowUpFromLine;
  const statusClass =
    swap.state === 'settled' ? 'text-green-600 bg-green-500/10 border-green-500/20' :
    swap.state === 'cancelled' || swap.state === 'disputed' || swap.state === 'expired' || swap.state === 'declined' || swap.state === 'refunded' ? 'text-red-600 bg-red-500/10 border-red-500/20' :
    swap.state === 'settlement_authorized' || swap.state === 'fiat_confirmed' ? 'text-green-600 bg-green-500/10 border-green-500/20' :
    'text-amber-600 bg-amber-500/10 border-amber-500/20';
  return (
    <Card className="transition-colors hover:bg-muted/30">
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${swap.direction === 'incoming' ? 'bg-green-500/10' : 'bg-muted'}`}>
          <Icon className={`h-4 w-4 ${swap.direction === 'incoming' ? 'text-green-600' : 'text-muted-foreground'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium capitalize">{swap.swapType} · {swap.direction}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatSats(swap.bitcoinAmount)}{swap.fiatAmount ? ` · ${swap.fiatCurrency} ${parseFloat(swap.fiatAmount).toLocaleString()}` : ''}
            {' · '}{new Date(swap.createdAt * 1000).toLocaleDateString()}
          </p>
        </div>
        <Badge variant="outline" className={`shrink-0 ${statusClass}`}>{STATE_LABELS[swap.state] ?? swap.state}</Badge>
      </CardContent>
    </Card>
  );
}

// ─── Swap Form ───────────────────────────────────────────────────

function SwapForm({ swapType, preselectedAgent }: { swapType: SwapType; preselectedAgent?: string }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const myPubkey = user?.pubkey ?? '';
  const { agents, isLoading, refetch, isFetching } = useAgents();
  const { publishCoordinationRoot } = useSwapStateMachine();
  const { sendMessage, hasNip44 } = useSwapMessages();
  const { isConnected: isEscrowConnected, connection: escrowConn, createEscrow } = useEscrowConnection();
  const [selectedAgentPubkey, setSelectedAgentPubkey] = useState(preselectedAgent ?? '');
  const [fiatAmount, setFiatAmount] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [paymentChannel, setPaymentChannel] = useState('');
  const [payoutDetails, setPayoutDetails] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [nowSec] = useState(() => Math.floor(Date.now() / 1000));

  const isBuy = swapType === 'buy';

  // Find the selected agent's offer matching the selected currency
  const selectedAgent = agents.find((a) => a.event.pubkey === selectedAgentPubkey);
  const matchingOffer = selectedAgent?.offers.find(
    (o) => o.f === currency && o.k === (isBuy ? 'sell' : 'buy'),
  );

  // Derive bitcoin amount from the offer price
  const bitcoinAmount = matchingOffer && fiatAmount
    ? deriveBitcoinAmount(fiatAmount, matchingOffer.price)
    : '0';

  const handleSubmit = async () => {
    if (!fiatAmount || !selectedAgentPubkey || !matchingOffer) return;
    setSubmitting(true);
    setStatusMsg(null);

    try {
      // 1. Fetch the agent's escrow descriptor event (exact revision)
      setStatusMsg('Resolving escrow descriptor…');

      // Parse the escrow coordinate from the agent's offer or agent definition
      const escrowCoord = matchingOffer.escrowAddress || selectedAgent?.escrowRef;
      if (!escrowCoord) {
        setStatusMsg('Agent has no escrow descriptor. Cannot proceed.');
        return;
      }

      // Parse "30361:pubkey:dtag"
      const parts = escrowCoord.split(':');
      if (parts.length < 3) {
        setStatusMsg('Invalid escrow descriptor reference.');
        return;
      }
      const escrowPubkey = parts[1];
      const escrowDTag = parts[2];

      // Query the exact descriptor event
      const [descriptorEvent] = await nostr.query(
        [{ kinds: [PONTMORE_ESCROW_KIND], authors: [escrowPubkey], '#d': [escrowDTag], limit: 1 }],
        { signal: AbortSignal.timeout(10000) },
      );

      if (!descriptorEvent) {
        setStatusMsg('Could not fetch the escrow descriptor event.');
        return;
      }

      const descriptor = parsePontmoreEscrow(descriptorEvent);
      if (!descriptor) {
        setStatusMsg('Invalid escrow descriptor.');
        return;
      }

      // Check expiry
      if (descriptor.expiresAt <= nowSec) {
        setStatusMsg('The escrow descriptor has expired. The agent needs to republish.');
        return;
      }

      // 2. Optionally create an escrow instance via the HTTP API
      let escrowFailMsg: string | null = null;
      if (isEscrowConnected) {
        try {
          setStatusMsg('Creating escrow instance…');
          await createEscrow({ amount_sats: parseInt(bitcoinAmount, 10), description: `PontPay ${isBuy ? 'buy' : 'sell'} ${bitcoinAmount} sats`, funding_model: '1_of_2' });
        } catch (err) {
          console.warn('Escrow HTTP API failed (non-fatal):', err);
          escrowFailMsg = 'Escrow instance creation failed — proceeding with coordination.';
        }
      }

      // 3. Publish the coordination root (kind 7300)
      setStatusMsg('Publishing coordination root…');
      const coordinationId = await publishCoordinationRoot.mutateAsync({
        swapType,
        agentPubkey: selectedAgentPubkey,
        customerPubkey: myPubkey,
        escrowPubkey,
        escrowDescriptorId: descriptorEvent.id,
        escrowDescriptorCoordinate: escrowCoord,
        resolverPubkey: matchingOffer.resolverPubkey || undefined,
        fiatCurrency: currency,
        fiatAmount,
        bitcoinAmount,
        bitcoinNetwork: matchingOffer.layer || 'lightning',
        paymentChannel: paymentChannel || matchingOffer.channels[0] || 'unknown',
      });

      // 4. Send fiat payment details to the agent via NIP-17
      if (hasNip44 && coordinationId) {
        setStatusMsg('Sending fiat payment details to agent…');
        if (payoutDetails) {
          await sendMessage.mutateAsync({
            swapId: coordinationId, recipientPubkey: selectedAgentPubkey, payloadType: 'bank_details',
            data: payoutDetails, label: isBuy ? 'Fiat payment details' : 'Fiat receiving details',
          });
        }
        if (memo) {
          await sendMessage.mutateAsync({
            swapId: coordinationId, recipientPubkey: selectedAgentPubkey,
            payloadType: 'message', data: memo, label: 'Note',
          });
        }
        setStatusMsg(`${isBuy ? 'Buy' : 'Sell'} coordination proposed! The escrow will handle the BTC payout. The agent will accept and process your swap.${escrowFailMsg ? ' ' + escrowFailMsg : ''}`);
      } else {
        setStatusMsg(`Coordination root published.${escrowFailMsg ? ' ' + escrowFailMsg : ''}`);
      }
    } catch (err) {
      console.error('Swap submission failed:', err);
      setStatusMsg('Failed to submit coordination. Please try again.');
    } finally {
      setSubmitting(false);
      setTimeout(() => { setStatusMsg(null); setFiatAmount(''); setPayoutDetails(''); setMemo(''); }, 10000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Escrow status */}
      {isEscrowConnected && escrowConn ? (
        <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
          <Shield className="h-4 w-4 text-blue-600" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-blue-600">Escrow active</p>
            <p className="text-xs text-muted-foreground">{escrowConn.endpoint} · {escrowConn.escrowType?.replace(/_/g, ' ')}</p>
          </div>
          <Link to="/escrows"><Button variant="outline" size="sm">Change</Button></Link>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-600">Escrow recommended</p>
            <p className="text-muted-foreground">Connecting an escrow service enables Lightning funding. You can still propose a coordination without it. <Link to="/escrows" className="font-medium text-foreground underline">Browse escrows</Link>.</p>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className={`rounded-xl border p-4 ${isBuy ? 'border-green-500/20 bg-green-500/5' : 'border-orange-500/20 bg-orange-500/5'}`}>
        <p className={`mb-3 text-sm font-medium flex items-center gap-2 ${isBuy ? 'text-green-600' : 'text-orange-600'}`}>
          <RefreshCw className="h-4 w-4" /> How {isBuy ? 'buying' : 'selling'} works
        </p>
        <ol className="space-y-1.5 text-xs text-muted-foreground">
          {isBuy ? (
            <>
              <li><strong className="text-foreground">1.</strong> Select an agent offer and enter the fiat amount</li>
              <li><strong className="text-foreground">2.</strong> A coordination root (kind 7300) is published on Nostr</li>
              <li><strong className="text-foreground">3.</strong> Agent accepts (core/accept) and escrow secures (core/secure)</li>
              <li><strong className="text-foreground">4.</strong> You send fiat to the agent (swap/fiat_sent), agent confirms (swap/fiat_confirmed)</li>
              <li><strong className="text-foreground">5.</strong> Escrow settles (core/settle) — escrow sends BTC to the buyer</li>
            </>
          ) : (
            <>
              <li><strong className="text-foreground">1.</strong> Select an agent offer and enter the fiat amount</li>
              <li><strong className="text-foreground">2.</strong> A coordination root (kind 7300) is published on Nostr</li>
              <li><strong className="text-foreground">3.</strong> Agent accepts (core/accept) and escrow secures (core/secure)</li>
              <li><strong className="text-foreground">4.</strong> You fund the escrow with BTC, agent sends fiat (swap/fiat_sent), you confirm (swap/fiat_confirmed)</li>
              <li><strong className="text-foreground">5.</strong> Escrow settles (core/settle) — escrow releases BTC to the agent, fiat arrives in your account</li>
            </>
          )}
        </ol>
      </div>

      {/* Agent selector with refresh */}
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="swap-agent">Select agent</Label>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className="mt-1.5 h-10 w-full" />
        ) : (
          <Select value={selectedAgentPubkey} onValueChange={setSelectedAgentPubkey}>
            <SelectTrigger id="swap-agent" className="mt-1.5"><SelectValue placeholder="Choose an agent..." /></SelectTrigger>
            <SelectContent>
              {agents.filter((a) => a.offers.length > 0).map((agent) => (
                <SelectItem key={agent.event.pubkey} value={agent.event.pubkey}>
                  {agent.event.pubkey.slice(0, 12)}… · {agent.offers.length} offer(s)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {agents.length === 0 && !isLoading && (
          <p className="mt-2 text-xs text-muted-foreground">No agents found. <Link to="/agents" className="underline">Browse the directory</Link></p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="swap-amount">Fiat amount</Label>
          <Input id="swap-amount" type="number" placeholder="1000" value={fiatAmount} onChange={(e) => setFiatAmount(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="swap-currency">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="swap-currency" className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
          </Select>
        </div>
      </div>

      {matchingOffer && fiatAmount && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">
            {isBuy ? 'You receive approx:' : 'You send approx:'} <strong className="text-foreground">{formatSats(bitcoinAmount)}</strong>
            {' · '}<span className="font-mono text-xs">{matchingOffer.price} {currency}/BTC</span>
            {matchingOffer.faMin && matchingOffer.faMax && (
              parseFloat(fiatAmount) < parseFloat(matchingOffer.faMin) || parseFloat(fiatAmount) > parseFloat(matchingOffer.faMax)
                ? <span className="text-amber-600 ml-2">· Outside offer range ({matchingOffer.faMin}–{matchingOffer.faMax})</span>
                : null
            )}
          </span>
        </div>
      )}

      {/* Payment channel selector */}
      {matchingOffer && matchingOffer.channels.length > 0 && (
        <div>
          <Label htmlFor="swap-channel">Payment channel</Label>
          <Select value={paymentChannel || matchingOffer.channels[0]} onValueChange={setPaymentChannel}>
            <SelectTrigger id="swap-channel" className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {matchingOffer.channels.map((ch) => (
                <SelectItem key={ch} value={ch} className="font-mono text-sm">{ch}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label htmlFor="swap-payout">{isBuy ? 'Fiat payment details' : 'Fiat receiving details'}</Label>
        <Textarea id="swap-payout" placeholder={isBuy ? 'e.g. M-Pesa send to +254712345678' : 'e.g. Bank transfer — KCB 0123...'} value={payoutDetails} onChange={(e) => setPayoutDetails(e.target.value)} rows={2} />
        <p className="mt-1 text-xs text-muted-foreground">Sent encrypted to the agent via NIP-17. The escrow handles all BTC movement.</p>
      </div>

      <div>
        <Label htmlFor="swap-memo">Note (optional)</Label>
        <Textarea id="swap-memo" placeholder="Any additional info for the agent..." value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} />
      </div>

      {statusMsg && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /><span>{statusMsg}</span>
        </div>
      )}

      <Button onClick={handleSubmit} disabled={submitting || !selectedAgentPubkey || !fiatAmount || !matchingOffer} className="w-full">
        {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>) : isBuy ? (<><ArrowDownToLine className="h-4 w-4" /> Buy Bitcoin</>) : (<><ArrowUpFromLine className="h-4 w-4" /> Sell Bitcoin</>)}
      </Button>
    </div>
  );
}
