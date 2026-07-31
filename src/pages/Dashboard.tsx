import { useSeoMeta } from '@unhead/react';
import { Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Zap,
  Wallet as WalletIcon,
  Store,
  Check,
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
import { useUnifiedWallet } from '@/hooks/useUnifiedWallet';
import { useAgents } from '@/hooks/useAgents';
import { useSwapStateMachine } from '@/hooks/useSwapStateMachine';
import { useEscrowConnection } from '@/hooks/useEscrowConnection';
import { useSwapMessages } from '@/hooks/useSwapMessages';
import { formatSats, estimateFiat, type PontmoreSwap, type SwapType } from '@/lib/pontmore';

const CURRENCIES = ['USD', 'KES', 'UGX', 'NGN', 'GHS', 'TZS', 'RWF', 'EUR', 'GBP'];
const BTC_PRICE_USD = 65000;

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

  const { hasWallet, balance, balanceLoading, refreshBalance } = useUnifiedWallet();
  const { localSwaps, useMySwaps } = useSwapStateMachine();
  const { data: nostrSwaps } = useMySwaps();

  useSeoMeta({
    title: 'Dashboard — PontPay',
    description: 'Swap Bitcoin for fiat online via the Pontmore agent network.',
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
            Log in with your Nostr identity to swap Bitcoin for fiat online.
          </p>
          <Button asChild className="mt-6"><Link to="/">Join PontPay</Link></Button>
        </div>
      </AppLayout>
    );
  }

  const liveSwaps = nostrSwaps && nostrSwaps.length > 0 ? nostrSwaps : [];
  const recentSwaps = liveSwaps.length > 0
    ? liveSwaps.slice(0, 5).map(swapToLocal)
    : localSwaps.slice(0, 5);

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
            <p className="mt-1 text-muted-foreground">Swap Bitcoin for fiat online via the Pontmore agent network.</p>
          </div>
          {hasWallet && (
            <Button variant="outline" size="sm" onClick={refreshBalance} disabled={balanceLoading}>
              <Zap className="h-4 w-4" /> Refresh balance
            </Button>
          )}
        </div>

        {/* Balance + quick actions */}
        <div className="mb-8 grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1 border-orange-500/20 overflow-hidden">
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-orange-500/5 to-transparent" />
            <CardHeader className="pb-3">
              <CardDescription>Wallet balance</CardDescription>
              {balanceLoading ? <Skeleton className="h-9 w-32" /> : (
                <CardTitle className="text-3xl">{hasWallet ? formatSats(balance) : 'Not connected'}</CardTitle>
              )}
            </CardHeader>
            <CardContent>
              {hasWallet ? (
                <div className="space-y-2">
                  <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><Check className="mr-1 h-3 w-3" /> Connected</Badge>
                  <p className="text-xs text-muted-foreground">≈ ${(balance / 1e8 * BTC_PRICE_USD).toFixed(2)} USD</p>
                </div>
              ) : (
                <Button asChild size="sm" className="w-full"><Link to="/wallet"><WalletIcon className="h-4 w-4" /> Connect wallet</Link></Button>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:col-span-2">
            <ActionButton
              icon={ArrowDownToLine} label="Buy BTC" description="Fiat → Bitcoin"
              onClick={() => { setAction('buy'); setSearchParams({ action: 'buy' }); }} active={action === 'buy'} color="green"
            />
            <ActionButton
              icon={ArrowUpFromLine} label="Sell BTC" description="Bitcoin → Fiat"
              onClick={() => { setAction('sell'); setSearchParams({ action: 'sell' }); }} active={action === 'sell'} color="orange"
            />
          </div>
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
            <div className="space-y-2">{recentSwaps.map((swap) => <SwapRow key={swap.swapId} swap={swap} />)}</div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function swapToLocal(swap: PontmoreSwap): import('@/hooks/useSwapStateMachine').LocalSwapRecord {
  return {
    swapId: swap.swapId, swapType: swap.swapType, agentPubkey: swap.agentPubkey,
    customerPubkey: swap.customerPubkey, amountSats: swap.bitcoinAmountSats,
    fiatAmount: swap.fiatAmount, fiatCurrency: swap.fiatCurrency,
    escrowReference: swap.escrowReference, state: swap.state,
    createdAt: swap.createdAt, updatedAt: swap.updatedAt, direction: swap.direction,
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

function SwapRow({ swap }: { swap: import('@/hooks/useSwapStateMachine').LocalSwapRecord }) {
  const Icon = swap.swapType === 'buy' ? ArrowDownToLine : ArrowUpFromLine;
  const statusClass =
    swap.state === 'completed' ? 'text-green-600 bg-green-500/10 border-green-500/20' :
    swap.state === 'cancelled' || swap.state === 'disputed' || swap.state === 'expired' ? 'text-red-600 bg-red-500/10 border-red-500/20' :
    swap.state === 'lightning_settled' ? 'text-green-600 bg-green-500/10 border-green-500/20' :
    'text-amber-600 bg-amber-500/10 border-amber-500/20';
  const stateLabel: Record<string, string> = {
    requested: 'Requested', accepted: 'Accepted', fiat_exchanged: 'Fiat Sent',
    lightning_settled: 'BTC Settled', completed: 'Completed', cancelled: 'Cancelled', disputed: 'Disputed', expired: 'Expired',
  };
  return (
    <Card className="transition-colors hover:bg-muted/30">
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${swap.direction === 'incoming' ? 'bg-green-500/10' : 'bg-muted'}`}>
          <Icon className={`h-4 w-4 ${swap.direction === 'incoming' ? 'text-green-600' : 'text-muted-foreground'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium capitalize">{swap.swapType} · {swap.direction}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatSats(swap.amountSats)}{swap.fiatAmount ? ` · ${swap.fiatCurrency} ${swap.fiatAmount.toLocaleString()}` : ''}
            {' · '}{new Date(swap.createdAt * 1000).toLocaleDateString()}
          </p>
        </div>
        <Badge variant="outline" className={`shrink-0 capitalize ${statusClass}`}>{stateLabel[swap.state] ?? swap.state}</Badge>
      </CardContent>
    </Card>
  );
}

// ─── Swap Form (Buy/Sell BTC online) ───────────────────────────

function SwapForm({ swapType, preselectedAgent }: { swapType: SwapType; preselectedAgent?: string }) {
  const { agents, isLoading, refetch, isFetching } = useAgents();
  const { hasWallet, balance } = useUnifiedWallet();
  const { publishSwapRequest } = useSwapStateMachine();
  const { sendMessage, hasNip44 } = useSwapMessages();
  const { isConnected: isEscrowConnected, connection: escrowConn, createEscrow, getFundingInstructions } = useEscrowConnection();
  const [selectedAgentPubkey, setSelectedAgentPubkey] = useState(preselectedAgent ?? '');
  const [amountSats, setAmountSats] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [payoutDetails, setPayoutDetails] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fiatEstimate = estimateFiat(parseInt(amountSats) || 0, BTC_PRICE_USD, currency);
  const isBuy = swapType === 'buy';

  const handleSubmit = async () => {
    const sats = parseInt(amountSats);
    if (!sats || !selectedAgentPubkey) return;
    if (!isEscrowConnected) { setStatusMsg('Connect an escrow service first — see the Escrows page.'); return; }
    setSubmitting(true);
    setStatusMsg(null);

    try {
      let escrowRef = '';
      let invoice: string | null = null;

      if (isBuy) {
        setStatusMsg('Creating escrow instance…');
        const result = await createEscrow({ amount_sats: sats, description: `PontPay buy ${sats} sats` });
        escrowRef = result.escrow_id;

        setStatusMsg('Getting funding instructions…');
        const funding = await getFundingInstructions(result.escrow_id);
        invoice = funding.payment_request;
      }

      setStatusMsg('Publishing swap request…');
      const swapId = await publishSwapRequest.mutateAsync({
        swapType, agentPubkey: selectedAgentPubkey, amountSats: sats,
        fiatAmount: fiatEstimate, fiatCurrency: currency, escrowReference: escrowRef,
      });

      if (hasNip44 && swapId) {
        setStatusMsg('Sending encrypted details to agent…');
        if (invoice) {
          await sendMessage.mutateAsync({
            swapId, recipientPubkey: selectedAgentPubkey, payloadType: 'invoice',
            data: invoice, label: `${isBuy ? 'Buy' : 'Sell'} ${sats} sats`,
          });
        }
        if (payoutDetails) {
          await sendMessage.mutateAsync({
            swapId, recipientPubkey: selectedAgentPubkey, payloadType: 'bank_details',
            data: payoutDetails, label: isBuy ? 'Fiat payment details' : 'Payout details',
          });
        }
        if (memo) {
          await sendMessage.mutateAsync({
            swapId, recipientPubkey: selectedAgentPubkey,             payloadType: 'message',
            data: memo, label: 'Note',
          });
        }
        setStatusMsg(`${isBuy ? 'Buy' : 'Sell'} request sent! The agent will process your swap online.`);
      } else {
        setStatusMsg('Swap request published.');
      }
    } finally {
      setSubmitting(false);
      setTimeout(() => { setStatusMsg(null); setAmountSats(''); setPayoutDetails(''); setMemo(''); }, 10000);
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
            <p className="text-xs text-muted-foreground">{escrowConn.endpoint} · {escrowConn.fundingModel}</p>
          </div>
          <Link to="/escrows"><Button variant="outline" size="sm">Change</Button></Link>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-600">Escrow required</p>
            <p className="text-muted-foreground">Connect an escrow service to start swapping. <Link to="/escrows" className="font-medium text-foreground underline">Browse escrows</Link>.</p>
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
              <li><strong className="text-foreground">1.</strong> Request a buy — escrow creates a Lightning invoice</li>
              <li><strong className="text-foreground">2.</strong> Send your fiat payment details to the agent (encrypted)</li>
              <li><strong className="text-foreground">3.</strong> Agent confirms fiat received and settles the escrow</li>
              <li><strong className="text-foreground">4.</strong> Bitcoin arrives in your wallet instantly</li>
            </>
          ) : (
            <>
              <li><strong className="text-foreground">1.</strong> Request a sell — escrow holds your BTC</li>
              <li><strong className="text-foreground">2.</strong> Agent sends fiat to your payout details (encrypted)</li>
              <li><strong className="text-foreground">3.</strong> Escrow releases BTC to the agent on confirmation</li>
              <li><strong className="text-foreground">4.</strong> Fiat arrives in your account</li>
            </>
          )}
        </ol>
      </div>

      {!hasWallet && isBuy && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="text-sm">
            <p className="font-medium text-blue-600">Wallet recommended</p>
            <p className="text-muted-foreground">Link a Lightning wallet via NWC to receive your Bitcoin payout instantly. You can also start the swap now and connect one later. <Link to="/wallet" className="font-medium text-foreground underline">Connect wallet</Link>.</p>
          </div>
        </div>
      )}

      {hasWallet && !isBuy && (
        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
          <span className="text-muted-foreground">Available balance</span>
          <strong>{formatSats(balance)}</strong>
        </div>
      )}

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
              {agents.map((agent) => (
                <SelectItem key={agent.event.pubkey} value={agent.event.pubkey}>
                  {agent.name} {agent.capabilities.regions.length > 0 ? `· ${agent.capabilities.regions.join(', ')}` : ''}
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
          <Label htmlFor="swap-amount">Amount (sats)</Label>
          <Input id="swap-amount" type="number" placeholder="50000" value={amountSats} onChange={(e) => setAmountSats(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="swap-currency">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="swap-currency" className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
          </Select>
        </div>
      </div>

      {amountSats && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">
            {isBuy ? 'You pay approx:' : 'You receive approx:'} <strong className="text-foreground">{currency} {fiatEstimate.toLocaleString()}</strong>
          </span>
        </div>
      )}

      <div>
        <Label htmlFor="swap-payout">{isBuy ? 'Fiat payment details' : 'Payout details'}</Label>
        <Textarea id="swap-payout" placeholder={isBuy ? 'e.g. M-Pesa +254712345678' : 'e.g. Bank transfer — KCB 0123...'} value={payoutDetails} onChange={(e) => setPayoutDetails(e.target.value)} rows={2} />
        <p className="mt-1 text-xs text-muted-foreground">Sent encrypted to the agent via NIP-17.</p>
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

      <Button onClick={handleSubmit} disabled={submitting || !selectedAgentPubkey || !amountSats || !isEscrowConnected} className="w-full">
        {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>) : isBuy ? (<><ArrowDownToLine className="h-4 w-4" /> Buy Bitcoin</>) : (<><ArrowUpFromLine className="h-4 w-4" /> Sell Bitcoin</>)}
      </Button>
    </div>
  );
}
