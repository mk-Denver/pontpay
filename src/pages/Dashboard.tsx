import { useSeoMeta } from '@unhead/react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
  Zap,
  Wallet as WalletIcon,
  Store,
  Copy,
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
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLightningWallet } from '@/hooks/useLightningWallet';
import { useAgents } from '@/hooks/useAgents';
import { usePontmoreTransactions } from '@/hooks/usePontmoreTransactions';
import { formatSats, estimateFiat } from '@/lib/pontmore';
import { QRCodeCanvas } from '@/components/ui/qrcode';

const CURRENCIES = ['USD', 'KES', 'UGX', 'NGN', 'GHS', 'TZS', 'RWF', 'EUR', 'GBP'];
// Approximate BTC price in USD for display-only fiat estimates
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

  const { hasWallet, balance, balanceLoading, refreshBalance } =
    useLightningWallet();
  const { transactions } = usePontmoreTransactions();

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

  const recentTx = transactions.slice(0, 5);

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Dashboard
            </h1>
            <p className="mt-1 text-muted-foreground">
              Deposit, withdraw, and transfer Bitcoin instantly.
            </p>
          </div>
          {hasWallet && (
            <Button variant="outline" size="sm" onClick={refreshBalance} disabled={balanceLoading}>
              <Zap className="h-4 w-4" />
              Refresh balance
            </Button>
          )}
        </div>

        {/* Balance + quick actions */}
        <div className="mb-8 grid gap-6 lg:grid-cols-3">
          {/* Balance card */}
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
                  <div className="flex items-center gap-2 text-sm">
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                      <Check className="mr-1 h-3 w-3" /> Connected
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ≈ ${(balance / 1e8 * BTC_PRICE_USD).toFixed(2)} USD
                  </p>
                </div>
              ) : (
                <Button asChild size="sm" className="w-full">
                  <Link to="/wallet">
                    <WalletIcon className="h-4 w-4" />
                    Connect wallet
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Quick action buttons */}
          <div className="grid grid-cols-3 gap-3 lg:col-span-2">
            <ActionButton
              icon={ArrowDownToLine}
              label="Deposit"
              description="Fiat → BTC"
              onClick={() => {
                setAction('deposit');
                setSearchParams({ action: 'deposit' });
              }}
              active={action === 'deposit'}
              color="green"
            />
            <ActionButton
              icon={ArrowUpFromLine}
              label="Withdraw"
              description="BTC → Fiat"
              onClick={() => {
                setAction('withdraw');
                setSearchParams({ action: 'withdraw' });
              }}
              active={action === 'withdraw'}
              color="orange"
            />
            <ActionButton
              icon={Send}
              label="Transfer"
              description="BTC → BTC"
              onClick={() => {
                setAction('transfer');
                setSearchParams({ action: 'transfer' });
              }}
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
                    {action === 'deposit' &&
                      'Send fiat to an agent and receive BTC in your Lightning wallet.'}
                    {action === 'withdraw' &&
                      'Convert BTC in your wallet to fiat via an agent.'}
                    {action === 'transfer' &&
                      'Send BTC instantly to another user on the Lightning Network.'}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAction(null);
                    setSearchParams({});
                  }}
                >
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

        {/* Recent transactions */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Recent transactions
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/transactions">View all</Link>
            </Button>
          </div>

          {recentTx.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 px-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No transactions yet. Start by depositing or find an agent to transact with.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link to="/agents">
                    <Store className="h-4 w-4" />
                    Browse agents
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentTx.map((tx) => (
                <TransactionRow key={tx.txId} tx={tx} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// --- Quick Action Button ---

function ActionButton({
  icon: Icon,
  label,
  description,
  onClick,
  active,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  onClick: () => void;
  active: boolean;
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

// --- Transaction Row ---

function TransactionRow({ tx }: { tx: import('@/hooks/usePontmoreTransactions').PontmoreTransaction }) {
  const icon =
    tx.type === 'deposit' ? ArrowDownToLine :
    tx.type === 'withdraw' ? ArrowUpFromLine :
    Send;

  const Icon = icon;
  const statusColor =
    tx.status === 'confirmed' ? 'text-green-600 bg-green-500/10 border-green-500/20' :
    tx.status === 'failed' || tx.status === 'expired' ? 'text-red-600 bg-red-500/10 border-red-500/20' :
    'text-amber-600 bg-amber-500/10 border-amber-500/20';

  return (
    <Card className="transition-colors hover:bg-muted/30">
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          tx.direction === 'incoming' ? 'bg-green-500/10' : 'bg-muted'
        }`}>
          <Icon className={`h-4 w-4 ${tx.direction === 'incoming' ? 'text-green-600' : 'text-muted-foreground'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium capitalize">
            {tx.type} · {tx.direction}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {formatSats(tx.amountSats)}
            {tx.fiatAmount ? ` · ${tx.fiatCurrency} ${tx.fiatAmount.toLocaleString()}` : ''}
            {' · '}{new Date(tx.createdAt * 1000).toLocaleDateString()}
          </p>
        </div>
        <Badge variant="outline" className={`shrink-0 capitalize ${statusColor}`}>
          {tx.status}
        </Badge>
      </CardContent>
    </Card>
  );
}

// --- Deposit Form ---

function DepositForm({ preselectedAgent }: { preselectedAgent?: string }) {
  const { agents, isLoading } = useAgents();
  const { hasWallet } = useLightningWallet();
  const { requestDeposit } = usePontmoreTransactions();
  const [selectedAgentPubkey, setSelectedAgentPubkey] = useState(preselectedAgent ?? '');
  const [amountSats, setAmountSats] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.event.pubkey === selectedAgentPubkey),
    [agents, selectedAgentPubkey],
  );

  const fiatEstimate = useMemo(() => {
    const sats = parseInt(amountSats) || 0;
    return estimateFiat(sats, BTC_PRICE_USD, currency);
  }, [amountSats, currency]);

  const handleSubmit = async () => {
    const sats = parseInt(amountSats);
    if (!sats || sats <= 0) return;
    if (!selectedAgentPubkey) return;
    setSubmitting(true);
    await requestDeposit({
      agentPubkey: selectedAgentPubkey,
      agentName: selectedAgent?.name,
      amountSats: sats,
      fiatAmount: fiatEstimate,
      fiatCurrency: currency,
      memo: memo || undefined,
    });
    setSubmitting(false);
    setAmountSats('');
    setMemo('');
  };

  return (
    <div className="space-y-4">
      {!hasWallet && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-600">Wallet required</p>
            <p className="text-muted-foreground">
              You need a connected Lightning wallet to receive deposits.{' '}
              <Link to="/wallet" className="font-medium text-foreground underline">
                Connect one now
              </Link>
              .
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
            <SelectTrigger id="deposit-agent" className="mt-1.5">
              <SelectValue placeholder="Choose an agent..." />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.event.pubkey} value={agent.event.pubkey}>
                  {agent.name} {agent.geo ? `· ${agent.geo}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {agents.length === 0 && !isLoading && (
          <p className="mt-2 text-xs text-muted-foreground">
            No agents found.{' '}
            <Link to="/agents" className="underline">Browse the directory</Link>
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="deposit-amount">Amount (sats)</Label>
          <Input
            id="deposit-amount"
            type="number"
            placeholder="50000"
            value={amountSats}
            onChange={(e) => setAmountSats(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="deposit-currency">Fiat currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="deposit-currency" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
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
        <Label htmlFor="deposit-memo">Memo (optional)</Label>
        <Textarea
          id="deposit-memo"
          placeholder="e.g. Cash deposit at agent booth"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
        <p>
          Your deposit request is sent via an encrypted Nostr direct message
          to the agent. The agent will confirm receipt and send a Lightning
          invoice for you to pay, which delivers BTC to your wallet.
        </p>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={submitting || !selectedAgentPubkey || !amountSats}
        className="w-full"
      >
        {submitting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Sending request...</>
        ) : (
          <><ArrowDownToLine className="h-4 w-4" /> Request deposit</>
        )}
      </Button>
    </div>
  );
}

// --- Withdraw Form ---

function WithdrawForm({ preselectedAgent }: { preselectedAgent?: string }) {
  const { agents, isLoading } = useAgents();
  const { hasWallet, balance, makeInvoice, isCreatingInvoice } = useLightningWallet();
  const { requestWithdrawal } = usePontmoreTransactions();
  const [selectedAgentPubkey, setSelectedAgentPubkey] = useState(preselectedAgent ?? '');
  const [amountSats, setAmountSats] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState<string | null>(null);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.event.pubkey === selectedAgentPubkey),
    [agents, selectedAgentPubkey],
  );

  const sats = parseInt(amountSats) || 0;
  const fiatEstimate = estimateFiat(sats, BTC_PRICE_USD, currency);

  const handleGenerateInvoice = async () => {
    if (!sats || sats <= 0) return;
    const result = await makeInvoice(sats, `Pontmore withdrawal ${memo}`);
    if (result) {
      setGeneratedInvoice(result.invoice);
    }
  };

  const handleSubmit = async () => {
    if (!sats || !selectedAgentPubkey || !generatedInvoice) return;
    setSubmitting(true);
    await requestWithdrawal({
      agentPubkey: selectedAgentPubkey,
      agentName: selectedAgent?.name,
      amountSats: sats,
      fiatAmount: fiatEstimate,
      fiatCurrency: currency,
      bolt11: generatedInvoice,
      memo: memo || undefined,
    });
    setSubmitting(false);
    setAmountSats('');
    setMemo('');
    setGeneratedInvoice(null);
  };

  return (
    <div className="space-y-4">
      {!hasWallet ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-600">Wallet required</p>
            <p className="text-muted-foreground">
              You need a connected Lightning wallet to withdraw.{' '}
              <Link to="/wallet" className="font-medium text-foreground underline">
                Connect one now
              </Link>
              .
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
          <span className="text-muted-foreground">Available balance</span>
          <strong>{formatSats(balance)}</strong>
        </div>
      )}

      <div>
        <Label htmlFor="withdraw-agent">Select agent</Label>
        {isLoading ? (
          <Skeleton className="mt-1.5 h-10 w-full" />
        ) : (
          <Select value={selectedAgentPubkey} onValueChange={setSelectedAgentPubkey}>
            <SelectTrigger id="withdraw-agent" className="mt-1.5">
              <SelectValue placeholder="Choose an agent..." />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.event.pubkey} value={agent.event.pubkey}>
                  {agent.name} {agent.geo ? `· ${agent.geo}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="withdraw-amount">Amount (sats)</Label>
          <Input
            id="withdraw-amount"
            type="number"
            placeholder="50000"
            value={amountSats}
            onChange={(e) => setAmountSats(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="withdraw-currency">Payout currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="withdraw-currency" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
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
        <Label htmlFor="withdraw-memo">Memo (optional)</Label>
        <Textarea
          id="withdraw-memo"
          placeholder="e.g. Cash pickup at agent booth"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
        />
      </div>

      {/* Generate invoice step */}
      {hasWallet && sats > 0 && !generatedInvoice && (
        <Button onClick={handleGenerateInvoice} variant="outline" className="w-full" disabled={isCreatingInvoice}>
          {isCreatingInvoice ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating invoice...</>
          ) : (
            <><Zap className="h-4 w-4" /> Generate Lightning invoice</>
          )}
        </Button>
      )}

      {generatedInvoice && (
        <div className="space-y-3">
          <Separator />
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="mb-2 text-sm font-medium">Lightning invoice generated</p>
            <div className="flex justify-center rounded-lg bg-white p-4">
              <QRCodeCanvas value={`lightning:${generatedInvoice}`} size={180} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-background px-2 py-1.5 text-xs">
                {generatedInvoice.slice(0, 40)}...
              </code>
              <CopyButton text={generatedInvoice} />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
        <p>
          Your withdrawal request (with Lightning invoice) is encrypted and sent
          to the agent. The agent pays your invoice on the Lightning Network and
          dispenses fiat to you. Settlement is instant.
        </p>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={submitting || !selectedAgentPubkey || !generatedInvoice}
        className="w-full"
      >
        {submitting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Sending request...</>
        ) : (
          <><ArrowUpFromLine className="h-4 w-4" /> Request withdrawal</>
        )}
      </Button>
    </div>
  );
}

// --- Transfer Form ---

function TransferForm() {
  const { hasWallet, balance, payInvoice } = useLightningWallet();
  const { requestTransfer } = usePontmoreTransactions();
  const [recipientPubkey, setRecipientPubkey] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [bolt11, setBolt11] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paying, setPaying] = useState(false);

  const handleSubmit = async () => {
    if (!bolt11 || !recipientPubkey) return;
    setSubmitting(true);

    // First, pay the Lightning invoice
    setPaying(true);
    const paymentResult = await payInvoice(bolt11);
    setPaying(false);

    if (paymentResult) {
      // Then send the encrypted confirmation via Nostr
      await requestTransfer({
        recipientPubkey,
        recipientName: recipientName || undefined,
        amountSats: 0, // amount is embedded in the invoice
        bolt11,
        memo: memo || undefined,
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
              You need a connected Lightning wallet to send transfers.{' '}
              <Link to="/wallet" className="font-medium text-foreground underline">
                Connect one now
              </Link>
              .
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
        <Input
          id="transfer-recipient"
          placeholder="npub1..."
          value={recipientPubkey}
          onChange={(e) => setRecipientPubkey(e.target.value)}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          The recipient&apos;s Nostr public key. They will receive an encrypted
          confirmation of your transfer.
        </p>
      </div>

      <div>
        <Label htmlFor="transfer-name">Recipient name (optional)</Label>
        <Input
          id="transfer-name"
          placeholder="e.g. Alice"
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="transfer-invoice">Lightning invoice (BOLT11)</Label>
        <Textarea
          id="transfer-invoice"
          placeholder="lnbc..."
          value={bolt11}
          onChange={(e) => setBolt11(e.target.value)}
          rows={3}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Paste a Lightning invoice from the recipient. The amount is encoded in
          the invoice. The payment will be sent from your connected wallet.
        </p>
      </div>

      <div>
        <Label htmlFor="transfer-memo">Memo (optional)</Label>
        <Input
          id="transfer-memo"
          placeholder="e.g. Dinner split"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p>
          The Lightning payment settles instantly on the network. An encrypted
          Nostr message is sent to the recipient as confirmation, creating a
          permanent record of the transfer on the Pontmore protocol.
        </p>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={submitting || !recipientPubkey || !bolt11}
        className="w-full"
      >
        {paying ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Paying Lightning invoice...</>
        ) : submitting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Sending confirmation...</>
        ) : (
          <><Send className="h-4 w-4" /> Send transfer</>
        )}
      </Button>
    </div>
  );
}

// --- Copy Button ---

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}
