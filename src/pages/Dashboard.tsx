import { useSeoMeta } from '@unhead/react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
  Zap,
  Wallet as WalletIcon,
  Store,
  Check,
  Loader2,
  Receipt,
  TrendingUp,
  Shield,
  Info,
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
import { useSwapMessages } from '@/hooks/useSwapMessages';
import { formatSats, estimateFiat } from '@/lib/pontmore';

const CURRENCIES = ['USD', 'KES', 'UGX', 'NGN', 'GHS', 'TZS', 'RWF', 'EUR', 'GBP'];
const BTC_PRICE_USD = 65000;

type Action = 'deposit' | 'withdraw' | 'transfer' | null;

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
  const { localSwaps } = useSwapStateMachine();

  useSeoMeta({
    title: 'Dashboard — PontPay',
    description: 'Deposit, withdraw, and transfer Bitcoin on the Pontmore network.',
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

  const recentSwaps = localSwaps.slice(0, 5);

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
            <p className="mt-1 text-muted-foreground">
              Initiate swaps on the Pontmore network (PIP-02).
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

          <div className="grid grid-cols-3 gap-3 lg:col-span-2">
            <ActionButton
              icon={ArrowDownToLine}
              label="Deposit"
              description="Fiat → BTC"
              onClick={() => { setAction('deposit'); setSearchParams({ action: 'deposit' }); }}
              active={action === 'deposit'}
              color="green"
            />
            <ActionButton
              icon={ArrowUpFromLine}
              label="Withdraw"
              description="BTC → Fiat"
              onClick={() => { setAction('withdraw'); setSearchParams({ action: 'withdraw' }); }}
              active={action === 'withdraw'}
              color="orange"
            />
            <ActionButton
              icon={Send}
              label="Transfer"
              description="BTC → BTC"
              onClick={() => { setAction('transfer'); setSearchParams({ action: 'transfer' }); }}
              active={action === 'transfer'}
              color="blue"
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
                    {action === 'transfer' && <Send className="h-5 w-5 text-blue-600" />}
                    {action === 'deposit' && 'Deposit Bitcoin'}
                    {action === 'withdraw' && 'Withdraw to Fiat'}
                    {action === 'transfer' && 'Peer-to-Peer Transfer'}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {action === 'deposit' && 'Send fiat to an agent and receive BTC via swap (PIP-02).'}
                    {action === 'withdraw' && 'Convert BTC to fiat via an agent swap (PIP-02).'}
                    {action === 'transfer' && 'Send BTC instantly via Lightning Network.'}
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
              {action === 'transfer' && <TransferForm />}
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
                  No swaps yet. Start by depositing or find an agent to transact with.
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

function ActionButton({
  icon: Icon, label, description, onClick, active, color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; description: string; onClick: () => void; active: boolean;
  color: 'green' | 'orange' | 'blue';
}) {
  const colorClasses = {
    green: 'hover:bg-green-500/5 hover:border-green-500/30 text-green-600',
    orange: 'hover:bg-orange-500/5 hover:border-orange-500/30 text-orange-600',
    blue: 'hover:bg-blue-500/5 hover:border-blue-500/30 text-blue-600',
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
  const Icon = swap.swapType === 'deposit' ? ArrowDownToLine : swap.swapType === 'withdrawal' ? ArrowUpFromLine : Send;
  const statusClass =
    swap.state === 'completed' ? 'text-green-600 bg-green-500/10 border-green-500/20' :
    swap.state === 'cancelled' || swap.state === 'disputed' || swap.state === 'expired' ? 'text-red-600 bg-red-500/10 border-red-500/20' :
    swap.state === 'lightning_settled' ? 'text-green-600 bg-green-500/10 border-green-500/20' :
    'text-amber-600 bg-amber-500/10 border-amber-500/20';

  const stateLabel: Record<string, string> = {
    requested: 'Requested',
    accepted: 'Accepted',
    fiat_exchanged: 'Fiat Exchanged',
    lightning_settled: 'Lightning Settled',
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

// ─── Deposit Form (PIP-02 swap request) ─────────────────────────

function DepositForm({ preselectedAgent }: { preselectedAgent?: string }) {
  const { agents, isLoading } = useAgents();
  const { hasWallet, makeInvoice, isCreatingInvoice } = useUnifiedWallet();
  const { publishSwapRequest } = useSwapStateMachine();
  const { sendMessage, hasNip44 } = useSwapMessages();
  const [selectedAgentPubkey, setSelectedAgentPubkey] = useState(preselectedAgent ?? '');
  const [amountSats, setAmountSats] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const selectedAgent = agents.find((a) => a.event.pubkey === selectedAgentPubkey);
  const fiatEstimate = estimateFiat(parseInt(amountSats) || 0, BTC_PRICE_USD, currency);

  const handleSubmit = async () => {
    const sats = parseInt(amountSats);
    if (!sats || !selectedAgentPubkey) return;
    setSubmitting(true);
    setStatusMsg(null);

    try {
      // Step 1: Generate a Lightning invoice to receive BTC (if wallet connected)
      let invoice: string | null = null;
      if (hasWallet) {
        setStatusMsg('Generating Lightning invoice…');
        const result = await makeInvoice(sats, `Pontmore deposit ${memo}`);
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
      });

      // Step 3: Send the invoice + payment instructions via NIP-17 private lane
      if (hasNip44 && swapId) {
        setStatusMsg('Sending encrypted invoice to agent…');
        if (invoice) {
          await sendMessage.mutateAsync({
            swapId,
            recipientPubkey: selectedAgentPubkey,
            payloadType: 'invoice',
            data: invoice,
            label: `Deposit ${sats} sats`,
          });
        }
        if (memo) {
          await sendMessage.mutateAsync({
            swapId,
            recipientPubkey: selectedAgentPubkey,
            payloadType: 'bank_details',
            data: memo,
            label: 'Fiat payment instructions',
          });
        }
        setStatusMsg('Swap request sent! The agent will respond in your inbox.');
      } else {
        setStatusMsg(
          hasNip44
            ? 'Swap request published. Connect a wallet and send your invoice via the private lane.'
            : 'Swap request published. Upgrade your signer to send encrypted invoice details.',
        );
      }
    } finally {
      setSubmitting(false);
      setTimeout(() => {
        setStatusMsg(null);
        setAmountSats('');
        setMemo('');
      }, 8000);
    }
  };

  return (
    <div className="space-y-4">
      {!hasWallet && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-600">Wallet recommended</p>
            <p className="text-muted-foreground">
              Connect a Lightning wallet to receive your BTC deposit.{' '}
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
              published publicly, but you won't be able to send invoices or bank
              details privately.
            </p>
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="deposit-agent">Select agent</Label>
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
          <Label htmlFor="deposit-currency">Fiat currency</Label>
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
            Estimated fiat: <strong className="text-foreground">{currency} {fiatEstimate.toLocaleString()}</strong>
          </span>
        </div>
      )}

      <div>
        <Label htmlFor="deposit-memo">Payment instructions (optional)</Label>
        <Textarea id="deposit-memo" placeholder="e.g. M-Pesa send to 254712345678, or cash at Westlands booth" value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} />
        <p className="mt-1 text-xs text-muted-foreground">
          Sent encrypted to the agent via NIP-17 — not in the public swap event.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
        <p>
          This publishes a PIP-02 swap request (kind 7300) on Nostr. Your
          Lightning invoice and payment instructions are sent encrypted via the
          NIP-17 private lane — only the agent can read them.
        </p>
      </div>

      {statusMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {statusMsg}
        </div>
      )}

      <Button onClick={handleSubmit} disabled={submitting || !selectedAgentPubkey || !amountSats} className="w-full">
        {submitting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
        ) : (
          <><ArrowDownToLine className="h-4 w-4" /> Request deposit</>
        )}
      </Button>
    </div>
  );
}

// ─── Withdraw Form (PIP-02 swap request) ────────────────────────

function WithdrawForm({ preselectedAgent }: { preselectedAgent?: string }) {
  const { agents, isLoading } = useAgents();
  const { hasWallet, balance } = useUnifiedWallet();
  const { publishSwapRequest } = useSwapStateMachine();
  const { sendMessage, hasNip44 } = useSwapMessages();
  const [selectedAgentPubkey, setSelectedAgentPubkey] = useState(preselectedAgent ?? '');
  const [amountSats, setAmountSats] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const selectedAgent = agents.find((a) => a.event.pubkey === selectedAgentPubkey);
  const sats = parseInt(amountSats) || 0;
  const fiatEstimate = estimateFiat(sats, BTC_PRICE_USD, currency);

  const handleSubmit = async () => {
    if (!sats || !selectedAgentPubkey) return;
    setSubmitting(true);
    setStatusMsg(null);

    try {
      // Step 1: Publish the swap request (kind 7300)
      setStatusMsg('Publishing swap request…');
      const swapId = await publishSwapRequest.mutateAsync({
        swapType: 'withdrawal',
        agentPubkey: selectedAgentPubkey,
        amountSats: sats,
        fiatAmount: fiatEstimate,
        fiatCurrency: currency,
      });

      // Step 2: Send payout instructions via NIP-17 private lane
      if (hasNip44 && swapId) {
        setStatusMsg('Sending encrypted payout instructions to agent…');
        if (memo) {
          await sendMessage.mutateAsync({
            swapId,
            recipientPubkey: selectedAgentPubkey,
            payloadType: 'bank_details',
            data: memo,
            label: 'Fiat payout instructions',
          });
        }
        setStatusMsg('Withdrawal request sent! The agent will accept and send you a Lightning invoice. Check your History to pay it.');
      } else {
        setStatusMsg('Swap request published. The agent will send a Lightning invoice for you to pay.');
      }
    } finally {
      setSubmitting(false);
      setTimeout(() => {
        setStatusMsg(null);
        setAmountSats('');
        setMemo('');
      }, 8000);
    }
  };

  return (
    <div className="space-y-4">
      {!hasWallet ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-600">Wallet required</p>
            <p className="text-muted-foreground">
              Connect a Lightning wallet to withdraw — you'll need to pay the agent's invoice.{' '}
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
              published, but payout instructions can't be sent privately.
            </p>
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="withdraw-agent">Select agent</Label>
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
          <Label htmlFor="withdraw-currency">Payout currency</Label>
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
            You receive approx: <strong className="text-foreground">{currency} {fiatEstimate.toLocaleString()}</strong>
          </span>
        </div>
      )}

      <div>
        <Label htmlFor="withdraw-memo">Payout instructions (optional)</Label>
        <Textarea id="withdraw-memo" placeholder="e.g. M-Pesa to 254712345678, or cash pickup at Westlands booth" value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} />
        <p className="mt-1 text-xs text-muted-foreground">
          Sent encrypted to the agent via NIP-17 — not in the public swap event.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
        <p>
          This publishes a PIP-02 swap request (kind 7300). The agent will
          accept and send you a Lightning invoice to pay. You meet in person,
          pay the invoice, and receive cash. Check your History page to pay the
          agent's invoice.
        </p>
      </div>

      {statusMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {statusMsg}
        </div>
      )}

      <Button onClick={handleSubmit} disabled={submitting || !selectedAgentPubkey || !amountSats} className="w-full">
        {submitting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
        ) : (
          <><ArrowUpFromLine className="h-4 w-4" /> Request withdrawal</>
        )}
      </Button>
    </div>
  );
}

// ─── Transfer Form (Lightning P2P) ──────────────────────────────

function TransferForm() {
  const { hasWallet, balance, payInvoice } = useUnifiedWallet();
  const { publishSwapRequest } = useSwapStateMachine();
  const [recipientPubkey, setRecipientPubkey] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [bolt11, setBolt11] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);

  const handleSubmit = async () => {
    if (!bolt11 || !recipientPubkey) return;
    setSubmitting(true);

    // Pay the Lightning invoice first
    setPaying(true);
    const result = await payInvoice(bolt11);
    setPaying(false);

      if (result) {
        // Publish a swap request for record-keeping (PIP-02)
        await publishSwapRequest.mutateAsync({
          swapType: 'transfer',
          agentPubkey: recipientPubkey, // in a transfer, the "agent" is the recipient
          amountSats: 0, // amount is in the invoice
          fiatAmount: 0,
          fiatCurrency: 'BTC',
        });
    }

    setSubmitting(false);
    setRecipientPubkey('');
    setRecipientName('');
    setBolt11('');
    setMemo('');
  };

  return (
    <div className="space-y-4">
      {!hasWallet ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-600">Wallet required</p>
            <p className="text-muted-foreground">
              Connect a Lightning wallet to send transfers.{' '}
              <Link to="/wallet" className="font-medium text-foreground underline">Connect now</Link>.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
          <span className="text-muted-foreground">Wallet balance</span>
          <strong>{formatSats(balance)}</strong>
        </div>
      )}

      <div>
        <Label htmlFor="transfer-recipient">Recipient Nostr pubkey (npub or hex)</Label>
        <Input id="transfer-recipient" placeholder="npub1..." value={recipientPubkey} onChange={(e) => setRecipientPubkey(e.target.value)} />
      </div>

      <div>
        <Label htmlFor="transfer-name">Recipient name (optional)</Label>
        <Input id="transfer-name" placeholder="e.g. Alice" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
      </div>

      <div>
        <Label htmlFor="transfer-invoice">Lightning invoice (BOLT11)</Label>
        <Textarea id="transfer-invoice" placeholder="lnbc..." value={bolt11} onChange={(e) => setBolt11(e.target.value)} rows={3} />
      </div>

      <div>
        <Label htmlFor="transfer-memo">Memo (optional)</Label>
        <Input id="transfer-memo" placeholder="e.g. Dinner split" value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p>
          The Lightning payment settles instantly. A PIP-02 swap request is
          published for record-keeping on the Pontmore network.
        </p>
      </div>

      <Button onClick={handleSubmit} disabled={submitting || !recipientPubkey || !bolt11} className="w-full">
        {paying ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Paying Lightning invoice…</>
        ) : submitting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Publishing swap record…</>
        ) : (
          <><Send className="h-4 w-4" /> Send transfer</>
        )}
      </Button>
    </div>
  );
}
