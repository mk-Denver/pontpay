import { useSeoMeta } from '@unhead/react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
  Smartphone,
  Banknote,
  HandCoins,
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
import { useSuperAgent } from '@/hooks/useSuperAgent';
import { useSwapMessages } from '@/hooks/useSwapMessages';
import { formatSats, estimateFiat, type PontmoreSwap } from '@/lib/pontmore';

const CURRENCIES = ['USD', 'KES', 'UGX', 'NGN', 'GHS', 'TZS', 'RWF', 'EUR', 'GBP'];
const BTC_PRICE_USD = 65000;

type Action = 'deposit' | 'withdraw' | null;

export default function Dashboard() {
  const { user } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const actionParam = searchParams.get('action') as Action;
  const agentParam = searchParams.get('agent');
  const [action, setAction] = useState<Action>(actionParam);

  useEffect(() => {
    setAction(actionParam);
  }, [actionParam]);

  const { hasWallet, balance, balanceLoading, refreshBalance } = useUnifiedWallet();
  const { localSwaps, useMySwaps } = useSwapStateMachine();
  const { data: nostrSwaps } = useMySwaps();

  useSeoMeta({
    title: 'Dashboard — PontPay',
    description: 'Deposit, withdraw, and transfer Bitcoin at an agent kiosk near you.',
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
            Log in with your Nostr identity to access the agent network dashboard.
          </p>
          <Button asChild className="mt-6">
            <Link to="/">Join PontPay</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  // Use Nostr-sourced swaps (with live transitions) if available, fall back to local
  const liveSwaps = nostrSwaps && nostrSwaps.length > 0 ? nostrSwaps : [];
  const recentSwaps = liveSwaps.length > 0
    ? liveSwaps.slice(0, 5).map(swapToLocal)
    : localSwaps.slice(0, 5);

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
            <p className="mt-1 text-muted-foreground">
              Visit an agent kiosk to deposit or withdraw Bitcoin instantly.
            </p>
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
              {balanceLoading ? (
                <Skeleton className="h-9 w-32" />
              ) : (
                <CardTitle className="text-3xl">
                  {hasWallet ? formatSats(balance) : 'Not connected'}
                </CardTitle>
              )}
            </CardHeader>
            <CardContent>
              {hasWallet ? (
                <div className="space-y-2">
                  <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                    <Check className="mr-1 h-3 w-3" /> Connected
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    ≈ ${(balance / 1e8 * BTC_PRICE_USD).toFixed(2)} USD
                  </p>
                </div>
              ) : (
                <Button asChild size="sm" className="w-full">
                  <Link to="/wallet"><WalletIcon className="h-4 w-4" /> Connect wallet</Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:col-span-2">
            <ActionButton
              icon={ArrowDownToLine}
              label="Deposit"
              description="Cash → BTC"
              onClick={() => { setAction('deposit'); setSearchParams({ action: 'deposit' }); }}
              active={action === 'deposit'}
              color="green"
            />
            <ActionButton
              icon={ArrowUpFromLine}
              label="Withdraw"
              description="BTC → Cash"
              onClick={() => { setAction('withdraw'); setSearchParams({ action: 'withdraw' }); }}
              active={action === 'withdraw'}
              color="orange"
            />
          </div>
        </div>

        {/* Action panel */}
        {action && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {action === 'deposit' && <ArrowDownToLine className="h-5 w-5 text-green-600" />}
                    {action === 'withdraw' && <ArrowUpFromLine className="h-5 w-5 text-orange-600" />}
                    {action === 'deposit' && 'Deposit — Cash to Bitcoin'}
                    {action === 'withdraw' && 'Withdraw — Bitcoin to Cash'}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {action === 'deposit' && 'Hand cash to an agent at their kiosk, receive Bitcoin instantly.'}
                    {action === 'withdraw' && 'Pay the agent\'s Lightning invoice, receive cash at the kiosk.'}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setAction(null); setSearchParams({}); }}>
                  Close
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {action === 'deposit' && <DepositForm preselectedAgent={agentParam ?? undefined} />}
              {action === 'withdraw' && <WithdrawForm preselectedAgent={agentParam ?? undefined} />}
            </CardContent>
          </Card>
        )}

        {/* Recent swaps */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Receipt className="h-5 w-5" /> Recent swaps
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/transactions">View all</Link>
            </Button>
          </div>

          {recentSwaps.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 px-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No swaps yet. Find an agent kiosk near you to get started.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link to="/agents"><Store className="h-4 w-4" /> Browse agents</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentSwaps.map((swap) => (
                <SwapRow key={swap.swapId} swap={swap} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

/** Convert a PontmoreSwap to a LocalSwapRecord for display. */
function swapToLocal(swap: PontmoreSwap): import('@/hooks/useSwapStateMachine').LocalSwapRecord {
  return {
    swapId: swap.swapId,
    swapType: swap.swapType,
    agentPubkey: swap.agentPubkey,
    customerPubkey: swap.customerPubkey,
    amountSats: swap.bitcoinAmountSats,
    fiatAmount: swap.fiatAmount,
    fiatCurrency: swap.fiatCurrency,
    escrowReference: swap.escrowReference,
    state: swap.state,
    createdAt: swap.createdAt,
    updatedAt: swap.updatedAt,
    direction: swap.direction,
  };
}

function ActionButton({
  icon: Icon, label, description, onClick, active, color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; description: string; onClick: () => void; active: boolean;
  color: 'green' | 'orange';
}) {
  const colorClasses = {
    green: 'hover:bg-green-500/5 hover:border-green-500/30 text-green-600',
    orange: 'hover:bg-orange-500/5 hover:border-orange-500/30 text-orange-600',
  };
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border bg-background p-4 text-center transition-all hover:shadow-sm sm:p-6 ${colorClasses[color]} ${active ? 'ring-2 ring-primary border-primary/30' : ''}`}
    >
      <Icon className="h-6 w-6 sm:h-8 sm:w-8" />
      <div>
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

function SwapRow({ swap }: { swap: import('@/hooks/useSwapStateMachine').LocalSwapRecord }) {
  const Icon = swap.swapType === 'deposit' ? ArrowDownToLine : ArrowUpFromLine;
  const statusClass =
    swap.state === 'completed' ? 'text-green-600 bg-green-500/10 border-green-500/20' :
    swap.state === 'cancelled' || swap.state === 'disputed' || swap.state === 'expired' ? 'text-red-600 bg-red-500/10 border-red-500/20' :
    swap.state === 'lightning_settled' ? 'text-green-600 bg-green-500/10 border-green-500/20' :
    'text-amber-600 bg-amber-500/10 border-amber-500/20';

  const stateLabel: Record<string, string> = {
    requested: 'Requested',
    accepted: 'Accepted',
    fiat_exchanged: 'Cash Exchanged',
    lightning_settled: 'BTC Sent',
    completed: 'Completed',
    cancelled: 'Cancelled',
    disputed: 'Disputed',
    expired: 'Expired',
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
            {formatSats(swap.amountSats)}
            {swap.fiatAmount ? ` · ${swap.fiatCurrency} ${swap.fiatAmount.toLocaleString()}` : ''}
            {' · '}{new Date(swap.createdAt * 1000).toLocaleDateString()}
          </p>
        </div>
        <Badge variant="outline" className={`shrink-0 capitalize ${statusClass}`}>{stateLabel[swap.state] ?? swap.state}</Badge>
      </CardContent>
    </Card>
  );
}

// ─── Deposit Form (Cash → BTC at agent kiosk) ───────────────────

function DepositForm({ preselectedAgent }: { preselectedAgent?: string }) {
  const { agents, isLoading } = useAgents();
  const { hasWallet, makeInvoice } = useUnifiedWallet();
  const { publishSwapRequest } = useSwapStateMachine();
  const { sendMessage, hasNip44 } = useSwapMessages();
  const { isConnected: isBtcPayConnected, createHoldInvoice, superAgentPubkey, payoutConfig } = useSuperAgent();
  const [selectedAgentPubkey, setSelectedAgentPubkey] = useState(preselectedAgent ?? '');
  const selectedAgent = agents.find((a) => a.event.pubkey === selectedAgentPubkey);
  const [amountSats, setAmountSats] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fiatEstimate = estimateFiat(parseInt(amountSats) || 0, BTC_PRICE_USD, currency);

  const handleSubmit = async () => {
    const sats = parseInt(amountSats);
    if (!sats || !selectedAgentPubkey) return;
    setSubmitting(true);
    setStatusMsg(null);

    try {
      // Step 1: Generate a Lightning invoice to receive BTC
      // If BTCPay Super Agent is connected, create a hold invoice via their server
      let invoice: string | null = null;
      let escrowRef = selectedAgent?.escrowRef ?? '';

      if (isBtcPayConnected) {
        setStatusMsg('Creating BTCPay hold invoice via Super Agent…');
        const holdInvoice = await createHoldInvoice.mutateAsync({
          amount: sats,
          currency: 'SATS',
          description: `PontPay deposit ${phoneNumber}`,
        });
        invoice = holdInvoice.bolt11;
        escrowRef = holdInvoice.invoiceId; // BTCPay invoice ID as escrow reference
      } else if (hasWallet) {
        setStatusMsg('Generating Lightning invoice…');
        const result = await makeInvoice(sats, `PontPay deposit ${phoneNumber}`);
        invoice = result?.invoice ?? null;
      }

      // Step 2: Publish the swap request (kind 7300)
      setStatusMsg('Publishing swap request…');
      const swapId = await publishSwapRequest.mutateAsync({
        swapType: 'deposit',
        agentPubkey: selectedAgentPubkey,
        amountSats: sats,
        fiatAmount: fiatEstimate,
        fiatCurrency: currency,
        escrowReference: escrowRef,
      });

      // Step 3: Send the invoice + customer details via NIP-17 private lane
      if (hasNip44 && swapId) {
        setStatusMsg('Sending encrypted details to agent…');
        if (invoice) {
          await sendMessage.mutateAsync({
            swapId,
            recipientPubkey: selectedAgentPubkey,
            payloadType: 'invoice',
            data: invoice,
            label: `Deposit ${sats} sats`,
          });
        }
        // Send payout destination (Lightning address or wallet info)
        if (payoutConfig?.lightningAddress) {
          await sendMessage.mutateAsync({
            swapId,
            recipientPubkey: selectedAgentPubkey,
            payloadType: 'payout',
            data: `Lightning Address: ${payoutConfig.lightningAddress}`,
            label: 'Payout destination',
          });
        }
        const customerDetails = [
          phoneNumber ? `Phone: ${phoneNumber}` : '',
          memo ? `Note: ${memo}` : '',
        ].filter(Boolean).join('\n');
        if (customerDetails) {
          await sendMessage.mutateAsync({
            swapId,
            recipientPubkey: selectedAgentPubkey,
            payloadType: 'bank_details',
            data: customerDetails,
            label: 'Customer details',
          });
        }
        setStatusMsg(payoutConfig?.lightningAddress
          ? 'Deposit request sent! The agent will send BTC to your Lightning address.'
          : 'Deposit request sent! Visit the agent kiosk, hand over cash, and the agent will send BTC to your wallet.');
      } else {
        setStatusMsg('Swap request published. Visit the agent kiosk to complete your deposit.');
      }
    } finally {
      setSubmitting(false);
      setTimeout(() => {
        setStatusMsg(null);
        setAmountSats('');
        setPhoneNumber('');
        setMemo('');
      }, 10000);
    }
  };

  return (
    <div className="space-y-4">
      {/* BTCPay Super Agent indicator */}
      {isBtcPayConnected && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
          <Shield className="h-4 w-4 text-blue-600" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-blue-600">BTCPay escrow active</p>
            <p className="text-xs text-muted-foreground">
              {payoutConfig?.lightningAddress
                ? `Payouts to ${payoutConfig.lightningAddress}`
                : payoutConfig?.method === 'cashu'
                ? 'Payouts to Cashu wallet'
                : payoutConfig?.method === 'nwc'
                ? 'Payouts to NWC wallet'
                : 'No payout method set'}
              {superAgentPubkey ? ` · Authority: ${superAgentPubkey.slice(0, 16)}...` : ''}
            </p>
          </div>
          <Link to="/super-agent"><Button variant="outline" size="sm">Configure</Button></Link>
        </div>
      )}

      {/* How it works — kiosk steps */}
      <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
        <p className="mb-3 text-sm font-medium text-green-600 flex items-center gap-2">
          <Banknote className="h-4 w-4" /> How deposit works at the kiosk
        </p>
        <ol className="space-y-1.5 text-xs text-muted-foreground">
          <li><strong className="text-foreground">1.</strong> Request a deposit below — we generate your Lightning invoice</li>
          <li><strong className="text-foreground">2.</strong> Visit the agent's kiosk and hand over cash</li>
          <li><strong className="text-foreground">3.</strong> Agent confirms cash received and pays your Lightning invoice</li>
          <li><strong className="text-foreground">4.</strong> Bitcoin arrives in your wallet instantly</li>
        </ol>
      </div>

      {!hasWallet && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-600">Wallet required</p>
            <p className="text-muted-foreground">
              Connect a Lightning wallet to receive your Bitcoin deposit.{' '}
              <Link to="/wallet" className="font-medium text-foreground underline">Connect now</Link>.
            </p>
          </div>
        </div>
      )}

      {!hasNip44 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-600">NIP-44 required for private lane</p>
            <p className="text-muted-foreground">
              Your signer doesn't support encryption. The swap request will be
              published, but your invoice and details can't be sent privately.
            </p>
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="deposit-agent">Select agent kiosk</Label>
        {isLoading ? (
          <Skeleton className="mt-1.5 h-10 w-full" />
        ) : (
          <Select value={selectedAgentPubkey} onValueChange={setSelectedAgentPubkey}>
            <SelectTrigger id="deposit-agent" className="mt-1.5"><SelectValue placeholder="Choose an agent..." /></SelectTrigger>
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
          <p className="mt-2 text-xs text-muted-foreground">
            No agents found. <Link to="/agents" className="underline">Browse the directory</Link>
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="deposit-amount">Amount (sats)</Label>
          <Input id="deposit-amount" type="number" placeholder="50000" value={amountSats} onChange={(e) => setAmountSats(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="deposit-currency">Cash currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="deposit-currency" className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {amountSats && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">
            You hand over approx: <strong className="text-foreground">{currency} {fiatEstimate.toLocaleString()}</strong> in cash
          </span>
        </div>
      )}

      <div>
        <Label htmlFor="deposit-phone" className="flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5" /> Your phone number (for agent reference)
        </Label>
        <Input
          id="deposit-phone"
          type="tel"
          placeholder="e.g. +254 712 345 678"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          The agent uses this to identify you at the kiosk. Sent encrypted.
        </p>
      </div>

      <div>
        <Label htmlFor="deposit-memo">Note (optional)</Label>
        <Textarea
          id="deposit-memo"
          placeholder="e.g. I'll be at the Westlands kiosk around 2pm"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Sent encrypted to the agent — not in the public swap event.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
        <p>
          Your Lightning invoice and phone number are sent encrypted via NIP-17
          gift wrap — only the agent can read them. The swap request itself is
          public on Nostr, but contains no personal data.
        </p>
      </div>

      {statusMsg && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          <span>{statusMsg}</span>
        </div>
      )}

      <Button onClick={handleSubmit} disabled={submitting || !selectedAgentPubkey || !amountSats || (!hasWallet && !isBtcPayConnected)} className="w-full">
        {submitting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
        ) : (
          <><HandCoins className="h-4 w-4" /> Request deposit</>
        )}
      </Button>
    </div>
  );
}

// ─── Withdraw Form (BTC → Cash at agent kiosk) ──────────────────

function WithdrawForm({ preselectedAgent }: { preselectedAgent?: string }) {
  const { agents, isLoading } = useAgents();
  const { hasWallet, balance } = useUnifiedWallet();
  const { publishSwapRequest } = useSwapStateMachine();
  const { sendMessage, hasNip44 } = useSwapMessages();
  const [selectedAgentPubkey, setSelectedAgentPubkey] = useState(preselectedAgent ?? '');
  const [amountSats, setAmountSats] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const sats = parseInt(amountSats) || 0;
  const fiatEstimate = estimateFiat(sats, BTC_PRICE_USD, currency);

  const handleSubmit = async () => {
    if (!sats || !selectedAgentPubkey) return;
    setSubmitting(true);
    setStatusMsg(null);

    try {
      // Step 1: Publish the swap request (kind 7300)
      setStatusMsg('Publishing withdrawal request…');
      const swapId = await publishSwapRequest.mutateAsync({
        swapType: 'withdrawal',
        agentPubkey: selectedAgentPubkey,
        amountSats: sats,
        fiatAmount: fiatEstimate,
        fiatCurrency: currency,
      });

      // Step 2: Send customer details via NIP-17 private lane
      if (hasNip44 && swapId) {
        setStatusMsg('Sending encrypted details to agent…');
        const customerDetails = [
          phoneNumber ? `Phone: ${phoneNumber}` : '',
          memo ? `Note: ${memo}` : '',
        ].filter(Boolean).join('\n');
        if (customerDetails) {
          await sendMessage.mutateAsync({
            swapId,
            recipientPubkey: selectedAgentPubkey,
            payloadType: 'bank_details',
            data: customerDetails,
            label: 'Customer payout details',
          });
        }
        setStatusMsg('Withdrawal request sent! The agent will accept and send you a Lightning invoice. Visit the kiosk and pay it to receive cash.');
      } else {
        setStatusMsg('Withdrawal request published. The agent will send a Lightning invoice for you to pay.');
      }
    } finally {
      setSubmitting(false);
      setTimeout(() => {
        setStatusMsg(null);
        setAmountSats('');
        setPhoneNumber('');
        setMemo('');
      }, 10000);
    }
  };

  return (
    <div className="space-y-4">
      {/* How it works — kiosk steps */}
      <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
        <p className="mb-3 text-sm font-medium text-orange-600 flex items-center gap-2">
          <Banknote className="h-4 w-4" /> How withdrawal works at the kiosk
        </p>
        <ol className="space-y-1.5 text-xs text-muted-foreground">
          <li><strong className="text-foreground">1.</strong> Request a withdrawal below</li>
          <li><strong className="text-foreground">2.</strong> Agent accepts and sends you a Lightning invoice</li>
          <li><strong className="text-foreground">3.</strong> Visit the kiosk and pay the agent's Lightning invoice</li>
          <li><strong className="text-foreground">4.</strong> Agent confirms payment and hands you cash</li>
        </ol>
      </div>

      {!hasWallet ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-600">Wallet required</p>
            <p className="text-muted-foreground">
              Connect a Lightning wallet — you'll need to pay the agent's invoice to withdraw.{' '}
              <Link to="/wallet" className="font-medium text-foreground underline">Connect now</Link>.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
          <span className="text-muted-foreground">Available balance</span>
          <strong>{formatSats(balance)}</strong>
        </div>
      )}

      {!hasNip44 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-600">NIP-44 required for private lane</p>
            <p className="text-muted-foreground">
              Your signer doesn't support encryption. The swap request will be
              published, but your details can't be sent privately.
            </p>
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="withdraw-agent">Select agent kiosk</Label>
        {isLoading ? (
          <Skeleton className="mt-1.5 h-10 w-full" />
        ) : (
          <Select value={selectedAgentPubkey} onValueChange={setSelectedAgentPubkey}>
            <SelectTrigger id="withdraw-agent" className="mt-1.5"><SelectValue placeholder="Choose an agent..." /></SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.event.pubkey} value={agent.event.pubkey}>
                  {agent.name} {agent.capabilities.regions.length > 0 ? `· ${agent.capabilities.regions.join(', ')}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="withdraw-amount">Amount (sats)</Label>
          <Input id="withdraw-amount" type="number" placeholder="50000" value={amountSats} onChange={(e) => setAmountSats(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="withdraw-currency">Cash currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="withdraw-currency" className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {amountSats && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">
            You receive approx: <strong className="text-foreground">{currency} {fiatEstimate.toLocaleString()}</strong> in cash
          </span>
        </div>
      )}

      <div>
        <Label htmlFor="withdraw-phone" className="flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5" /> Your phone number (for agent reference)
        </Label>
        <Input
          id="withdraw-phone"
          type="tel"
          placeholder="e.g. +254 712 345 678"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          The agent uses this to identify you at the kiosk. Sent encrypted.
        </p>
      </div>

      <div>
        <Label htmlFor="withdraw-memo">Note (optional)</Label>
        <Textarea
          id="withdraw-memo"
          placeholder="e.g. I'll pick up cash at the Westlands kiosk"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Sent encrypted to the agent — not in the public swap event.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
        <p>
          The agent will accept your request and send a Lightning invoice.
          Visit the kiosk, pay the invoice from your wallet, and the agent
          hands you cash. Check your History page to pay the invoice.
        </p>
      </div>

      {statusMsg && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          <span>{statusMsg}</span>
        </div>
      )}

      <Button onClick={handleSubmit} disabled={submitting || !selectedAgentPubkey || !amountSats || !hasWallet} className="w-full">
        {submitting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
        ) : (
          <><ArrowUpFromLine className="h-4 w-4" /> Request withdrawal</>
        )}
      </Button>
    </div>
  );
}

