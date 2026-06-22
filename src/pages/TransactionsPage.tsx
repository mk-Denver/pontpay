import { useSeoMeta } from '@unhead/react';
import { useState, useMemo } from 'react';
import {
  Receipt,
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
  Search,
  Trash2,
  Filter,
  ExternalLink,
} from 'lucide-react';
import { AppLayout } from '@/components/Navbar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePontmoreTransactions, type PontmoreTransaction } from '@/hooks/usePontmoreTransactions';
import { formatSats } from '@/lib/pontmore';

type TxFilter = 'all' | 'deposit' | 'withdraw' | 'transfer';

export default function TransactionsPage() {
  const { user } = useCurrentUser();
  const { transactions, clearHistory } = usePontmoreTransactions();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TxFilter>('all');
  const [selectedTx, setSelectedTx] = useState<PontmoreTransaction | null>(null);

  useSeoMeta({
    title: 'Transaction History — PontPay',
    description: 'View your full Pontmore transaction history.',
  });

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (filter !== 'all' && tx.type !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matches =
          tx.txId.toLowerCase().includes(q) ||
          tx.counterpartyName?.toLowerCase().includes(q) ||
          tx.memo?.toLowerCase().includes(q) ||
          tx.counterpartyPubkey.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [transactions, filter, search]);

  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
            <Receipt className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold">Transaction History</h1>
          <p className="mt-3 text-muted-foreground">
            Log in with your Nostr identity to view your transaction history.
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
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Transaction History
            </h1>
            <p className="mt-1 text-muted-foreground">
              All your Pontmore deposits, withdrawals, and transfers.
            </p>
          </div>
          {transactions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm('Clear local transaction history? This cannot be undone.')) {
                  clearHistory();
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by ID, name, or memo..."
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
                <SelectItem value="withdraw">Withdrawals</SelectItem>
                <SelectItem value="transfer">Transfers</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Transaction list */}
        {transactions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 px-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <Receipt className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium">No transactions yet</p>
              <p className="mt-2 max-w-sm mx-auto text-sm text-muted-foreground">
                Your deposits, withdrawals, and peer-to-peer transfers will
                appear here. Start transacting from the dashboard.
              </p>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center">
              <p className="text-sm text-muted-foreground">
                No transactions match your filters.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((tx) => (
              <TransactionRow
                key={tx.txId}
                tx={tx}
                onClick={() => setSelectedTx(tx)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Transaction detail dialog */}
      <Dialog open={!!selectedTx} onOpenChange={(open) => !open && setSelectedTx(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedTx?.type === 'deposit' && <ArrowDownToLine className="h-5 w-5 text-green-600" />}
              {selectedTx?.type === 'withdraw' && <ArrowUpFromLine className="h-5 w-5 text-orange-600" />}
              {selectedTx?.type === 'transfer' && <Send className="h-5 w-5 text-blue-600" />}
              <span className="capitalize">{selectedTx?.type}</span>
            </DialogTitle>
            <DialogDescription>
              Transaction details
            </DialogDescription>
          </DialogHeader>
          {selectedTx && <TransactionDetail tx={selectedTx} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function TransactionRow({ tx, onClick }: { tx: PontmoreTransaction; onClick: () => void }) {
  const Icon =
    tx.type === 'deposit' ? ArrowDownToLine :
    tx.type === 'withdraw' ? ArrowUpFromLine :
    Send;

  const statusClass =
    tx.status === 'confirmed' ? 'text-green-600 bg-green-500/10 border-green-500/20' :
    tx.status === 'failed' || tx.status === 'expired' ? 'text-red-600 bg-red-500/10 border-red-500/20' :
    'text-amber-600 bg-amber-500/10 border-amber-500/20';

  return (
    <Card className="cursor-pointer transition-colors hover:bg-muted/30" onClick={onClick}>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          tx.direction === 'incoming' ? 'bg-green-500/10' : 'bg-muted'
        }`}>
          <Icon className={`h-5 w-5 ${tx.direction === 'incoming' ? 'text-green-600' : 'text-muted-foreground'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium capitalize">
            {tx.type} · {tx.direction}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {formatSats(tx.amountSats)}
            {tx.fiatAmount ? ` · ${tx.fiatCurrency} ${tx.fiatAmount.toLocaleString()}` : ''}
            {' · '}{new Date(tx.createdAt * 1000).toLocaleString()}
          </p>
        </div>
        <Badge variant="outline" className={`shrink-0 capitalize ${statusClass}`}>
          {tx.status}
        </Badge>
      </CardContent>
    </Card>
  );
}

function TransactionDetail({ tx }: { tx: PontmoreTransaction }) {
  const rows = [
    { label: 'Transaction ID', value: tx.txId, mono: true },
    { label: 'Type', value: tx.type, capitalize: true },
    { label: 'Direction', value: tx.direction, capitalize: true },
    { label: 'Status', value: tx.status, capitalize: true },
    { label: 'Amount', value: formatSats(tx.amountSats) },
    tx.fiatAmount ? { label: 'Fiat', value: `${tx.fiatCurrency} ${tx.fiatAmount.toLocaleString()}` } : null,
    tx.counterpartyName ? { label: 'Counterparty', value: tx.counterpartyName } : null,
    { label: 'Counterparty pubkey', value: `${tx.counterpartyPubkey.slice(0, 16)}...`, mono: true },
    { label: 'Created', value: new Date(tx.createdAt * 1000).toLocaleString() },
    { label: 'Updated', value: new Date(tx.updatedAt * 1000).toLocaleString() },
    tx.memo ? { label: 'Memo', value: tx.memo } : null,
    tx.preimage ? { label: 'Preimage', value: `${tx.preimage.slice(0, 20)}...`, mono: true } : null,
  ].filter(Boolean) as { label: string; value: string; mono?: boolean; capitalize?: boolean }[];

  return (
    <div className="space-y-3">
      <div className="divide-y divide-border rounded-lg border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
            <span className="shrink-0 text-muted-foreground">{row.label}</span>
            <span className={`text-right font-medium ${row.mono ? 'font-mono text-xs' : ''} ${row.capitalize ? 'capitalize' : ''}`}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {tx.bolt11 && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Lightning Invoice</p>
          <code className="block truncate text-xs">{tx.bolt11.slice(0, 60)}...</code>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Transaction messages are transmitted via encrypted Nostr direct
          messages (Pontmore protocol). Lightning payments settle on-chain
          instantly.
        </span>
      </div>
    </div>
  );
}
