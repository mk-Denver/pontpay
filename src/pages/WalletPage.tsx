import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import {
  Zap,
  Wallet as WalletIcon,
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
  RefreshCw,
  ExternalLink,
  Shield,
  Smartphone,
  Globe,
  CheckCircle2,
} from 'lucide-react';
import { AppLayout } from '@/components/Navbar';
import { WalletModal } from '@/components/WalletModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLightningWallet } from '@/hooks/useLightningWallet';
import { useWallet } from '@/hooks/useWallet';
import { formatSats } from '@/lib/pontmore';

const WALLETS = [
  {
    name: 'Alby Hub',
    description: 'Self-hosted Lightning wallet with NWC support. Great for power users.',
    url: 'https://getalby.com',
    icon: Zap,
    badge: 'Self-custody',
  },
  {
    name: 'Mutiny Wallet',
    description: 'Browser-based Lightning wallet. Create a wallet in seconds.',
    url: 'https://mutinywallet.com',
    icon: Smartphone,
    badge: 'Beginner friendly',
  },
  {
    name: 'Zeus',
    description: 'Mobile Lightning wallet for Android and iOS with NWC.',
    url: 'https://zeusln.app',
    icon: Globe,
    badge: 'Mobile',
  },
];

export default function WalletPage() {
  const { user } = useCurrentUser();
  const { hasWallet, walletAlias, balance, balanceLoading, refreshBalance } =
    useLightningWallet();
  const { webln, preferredMethod } = useWallet();

  useSeoMeta({
    title: 'Wallet — PontPay',
    description: 'Connect and manage your Bitcoin Lightning wallet.',
  });

  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
            <WalletIcon className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold">Connect your Lightning wallet</h1>
          <p className="mt-3 text-muted-foreground">
            Log in with your Nostr identity to connect a Bitcoin Lightning wallet
            and start transacting on the Pontmore network.
          </p>
          <Button asChild className="mt-6">
            <Link to="/">Join PontPay</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Lightning Wallet
          </h1>
          <p className="mt-2 text-muted-foreground">
            Connect an existing wallet via Nostr Wallet Connect or create a new one.
          </p>
        </div>

        {/* Balance card */}
        <Card className="mb-8 overflow-hidden border-orange-500/20">
          <div className="relative">
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-orange-500/5 to-amber-500/5" />
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Wallet balance
                  </p>
                  {balanceLoading ? (
                    <Skeleton className="mt-2 h-10 w-40" />
                  ) : (
                    <p className="mt-1 text-4xl font-bold tracking-tight">
                      {hasWallet ? formatSats(balance) : '—'}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    {hasWallet ? (
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        {walletAlias ?? 'Wallet connected'}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">No wallet connected</Badge>
                    )}
                    {webln && (
                      <Badge variant="outline" className="gap-1">
                        <Globe className="h-3 w-3" /> WebLN
                      </Badge>
                    )}
                  </div>
                </div>

                {hasWallet && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={refreshBalance}
                      disabled={balanceLoading}
                    >
                      <RefreshCw className={`h-4 w-4 ${balanceLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                    <Button asChild size="sm">
                      <Link to="/dashboard?action=deposit">
                        <ArrowDownToLine className="h-4 w-4" />
                        Deposit
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="secondary">
                      <Link to="/dashboard?action=transfer">
                        <Send className="h-4 w-4" />
                        Send
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </div>
        </Card>

        {/* Connect wallet */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Quick connect */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Connect wallet
              </CardTitle>
              <CardDescription>
                Link an existing Lightning wallet via NWC.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WalletModal />
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p className="flex items-start gap-2">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  Your connection secret stays in your browser. Payments are
                  authorized locally.
                </p>
                <p className="flex items-start gap-2">
                  <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  Payment method: <strong className="text-foreground">{preferredMethod}</strong>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Recommended wallets */}
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold">
              Don&apos;t have a wallet? Create one
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {WALLETS.map((w) => {
                const Icon = w.icon;
                return (
                  <Card
                    key={w.name}
                    className="flex flex-col transition-all hover:shadow-md hover:-translate-y-0.5"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {w.badge}
                        </Badge>
                      </div>
                      <CardTitle className="mt-3 text-base">{w.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="mt-auto">
                      <p className="text-xs text-muted-foreground">
                        {w.description}
                      </p>
                      <a
                        href={w.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        Visit <ExternalLink className="h-3 w-3" />
                      </a>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/30 p-6">
              <h3 className="text-sm font-semibold">How to connect</h3>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  <strong className="text-foreground">1.</strong> Create a wallet
                  with one of the providers above (or use your existing wallet).
                </li>
                <li>
                  <strong className="text-foreground">2.</strong> Find the
                  &ldquo;Nostr Wallet Connect&rdquo; or &ldquo;NWC&rdquo; section
                  in your wallet settings.
                </li>
                <li>
                  <strong className="text-foreground">3.</strong> Copy the
                  connection URI (starts with{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    nostr+walletconnect://
                  </code>
                  ) and paste it via the &ldquo;Wallet Settings&rdquo; button.
                </li>
                <li>
                  <strong className="text-foreground">4.</strong> Your wallet is
                  connected! You can now deposit, withdraw, and transfer on the
                  Pontmore network.
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
