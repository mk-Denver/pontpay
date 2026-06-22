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
} from 'lucide-react';
import { AppLayout } from '@/components/Navbar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { useSwapStateMachine, type LocalSwapRecord } from '@/hooks/useSwapStateMachine';
import { formatSats } from '@/lib/pontmore';

type TxFilter = 'all' | 'deposit' | 'withdrawal' | 'transfer';

export default function TransactionsPage() {
  const { user } = useCurrentUser();
  const { localSwaps, clearHistory } = useSwapStateMachine();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TxFilter>('all');
  const [selectedSwap, setSelectedSwap] = useState<LocalSwapRecord | null>(null);

  useSeoMeta({
    title: 'Swap History — PontPay',
    description: 'View your full Pontmore swap history.',
  });

  const filtered = useMemo(() => {
    return localSwaps.filter((swap) => {
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
  }, [localSwaps, filter, search]);

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
              All your Pontmore swaps (PIP-02 state machine events).
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
              <Trash2 className="h-4 w-4" /> Clear
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
                <SelectItem value="transfer">Transfers</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Swap list */}
        {localSwaps.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 px-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <Receipt className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium">No swaps yet</p>
              <p className="mt-2 max-w-sm mx-auto text-sm text-muted-foreground">
                Your deposits, withdrawals, and transfers will appear here.
                Start from the dashboard.
              </p>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center">
              <p className="text-sm text-muted-foreground">No swaps match your filters.</p>
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
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedSwap?.swapType === 'deposit' && <ArrowDownToLine className="h-5 w-5 text-green-600" />}
              {selectedSwap?.swapType === 'withdrawal' && <ArrowUpFromLine className="h-5 w-5 text-orange-600" />}
              {selectedSwap?.swapType === 'transfer' && <Send className="h-5 w-5 text-blue-600" />}
              <span className="capitalize">{selectedSwap?.swapType}</span>
            </DialogTitle>
            <DialogDescription>Swap details (PIP-02)</DialogDescription>
          </DialogHeader>
          {selectedSwap && <SwapDetail swap={selectedSwap} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function SwapRow({ swap, onClick }: { swap: LocalSwapRecord; onClick: () => void }) {
  const Icon = swap.swapType === 'deposit' ? ArrowDownToLine : swap.swapType === 'withdrawal' ? ArrowUpFromLine : Send;
  const statusClass =
    swap.state === 'completed' ? 'text-green-600 bg-green-500/10 border-green-500/20' :
    swap.state === 'cancelled' || swap.state === 'disputed' || swap.state === 'expired' ? 'text-red-600 bg-red-500/10 border-red-500/20' :
    'text-amber-600 bg-amber-500/10 border-amber-500/20';

  return (
    <Card className="cursor-pointer transition-colors hover:bg-muted/30" onClick={onClick}>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${swap.direction === 'incoming' ? 'bg-green-500/10' : 'bg-muted'}`}>
          <Icon className={`h-5 w-5 ${swap.direction === 'incoming' ? 'text-green-600' : 'text-muted-foreground'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium capitalize">{swap.swapType} · {swap.direction}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatSats(swap.amountSats)}
            {swap.fiatAmount ? ` · ${swap.fiatCurrency} ${swap.fiatAmount.toLocaleString()}` : ''}
            {' · '}{new Date(swap.createdAt * 1000).toLocaleString()}
          </p>
        </div>
        <Badge variant="outline" className={`shrink-0 capitalize ${statusClass}`}>{swap.state}</Badge>
      </CardContent>
    </Card>
  );
}

function SwapDetail({ swap }: { swap: LocalSwapRecord }) {
  const rows = [
    { label: 'Swap ID', value: swap.swapId, mono: true },
    { label: 'Type', value: swap.swapType, capitalize: true },
    { label: 'Direction', value: swap.direction, capitalize: true },
    { label: 'State', value: swap.state, capitalize: true },
    { label: 'Amount', value: formatSats(swap.amountSats) },
    swap.fiatAmount ? { label: 'Fiat', value: `${swap.fiatCurrency} ${swap.fiatAmount.toLocaleString()}` } : null,
    { label: 'Agent pubkey', value: `${swap.agentPubkey.slice(0, 16)}...`, mono: true },
    { label: 'Escrow ref', value: swap.escrowReference.slice(0, 30) + '...', mono: true },
    { label: 'Created', value: new Date(swap.createdAt * 1000).toLocaleString() },
    { label: 'Updated', value: new Date(swap.updatedAt * 1000).toLocaleString() },
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
      <div className="flex items-start gap-2 rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
        <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Swap events are published as Nostr-native state machine events
          (PIP-02): immutable swap request (kind 7300), append-only transitions
          (kind 7301), and replaceable snapshots (kind 30362).
        </span>
      </div>
    </div>
  );
}
