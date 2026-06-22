import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  Zap,
  Wallet as WalletIcon,
  Plus,
  ArrowDownToLine,
  Send,
  RefreshCw,
  ExternalLink,
  Shield,
  Smartphone,
  Globe,
  CheckCircle2,
  Coins,
  Key,
  Copy,
  Check,
  Loader2,
  Sparkles,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { AppLayout } from '@/components/Navbar';
import { WalletModal } from '@/components/WalletModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUnifiedWallet } from '@/hooks/useUnifiedWallet';
import { useCashuWallet, DEFAULT_MINTS } from '@/hooks/useCashuWallet';
import { useLightningWallet } from '@/hooks/useLightningWallet';
import { useWallet } from '@/hooks/useWallet';
import { formatSats } from '@/lib/pontmore';

const NWC_WALLETS = [
  {
    name: 'Alby Hub',
    description: 'Self-hosted Lightning wallet with NWC support.',
    url: 'https://getalby.com',
    icon: Zap,
    badge: 'Self-custody',
  },
  {
    name: 'Mutiny Wallet',
    description: 'Browser-based Lightning wallet.',
    url: 'https://mutinywallet.com',
    icon: Smartphone,
    badge: 'Beginner',
  },
  {
    name: 'Zeus',
    description: 'Mobile Lightning wallet for Android and iOS.',
    url: 'https://zeusln.app',
    icon: Globe,
    badge: 'Mobile',
  },
];

export default function WalletPage() {
  const { user } = useCurrentUser();
  const unified = useUnifiedWallet();
  const cashu = useCashuWallet();
  const nwc = useLightningWallet();
  const { webln } = useWallet();

  const [showSeedDialog, setShowSeedDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showSendEcash, setShowSendEcash] = useState(false);
  const [showReceiveEcash, setShowReceiveEcash] = useState(false);
  const [restoreSeed, setRestoreSeed] = useState('');
  const [ecashToken, setEcashToken] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useSeoMeta({
    title: 'Wallet — PontPay',
    description: 'Connect or create a Bitcoin wallet for the Pontmore network.',
  });

  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
            <WalletIcon className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold">Connect your wallet</h1>
          <p className="mt-3 text-muted-foreground">
            Log in with your Nostr identity to connect or create a Bitcoin wallet
            and start transacting on the Pontmore network.
          </p>
          <Button asChild className="mt-6">
            <Link to="/">Join PontPay</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const handleCreateCashu = () => {
    const mnemonic = cashu.createWallet();
    if (mnemonic) {
      setShowSeedDialog(true);
      unified.setWalletType('cashu');
    }
  };

  const handleRestoreCashu = () => {
    if (!restoreSeed.trim()) return;
    cashu.restoreWallet(restoreSeed.trim());
    unified.setWalletType('cashu');
    setShowRestoreDialog(false);
    setRestoreSeed('');
  };

  const handleSendEcash = () => {
    const amount = parseInt(sendAmount);
    if (!amount) return;
    const token = cashu.sendEcashTokens(amount);
    if (token) {
      setGeneratedToken(token);
    }
  };

  const handleReceiveEcash = async () => {
    if (!ecashToken.trim()) return;
    await cashu.receiveEcashTokens(ecashToken.trim());
    setShowReceiveEcash(false);
    setEcashToken('');
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Wallet</h1>
          <p className="mt-2 text-muted-foreground">
            Connect an existing Lightning wallet or create a native ecash wallet in your browser.
          </p>
        </div>

        {/* Balance card */}
        <Card className="mb-8 overflow-hidden border-orange-500/20">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-orange-500/5 to-amber-500/5" />
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Wallet balance</p>
                {unified.balanceLoading ? (
                  <Skeleton className="mt-2 h-10 w-40" />
                ) : (
                  <p className="mt-1 text-4xl font-bold tracking-tight">
                    {unified.hasWallet ? formatSats(unified.balance) : '—'}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  {unified.hasWallet ? (
                    <>
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        {unified.walletAlias ?? 'Connected'}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {unified.walletType === 'cashu' ? (
                          <><Coins className="mr-1 h-3 w-3" /> Cashu ecash</>
                        ) : (
                          <><Zap className="mr-1 h-3 w-3" /> NWC Lightning</>
                        )}
                      </Badge>
                    </>
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

              {unified.hasWallet && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={unified.refreshBalance} disabled={unified.balanceLoading}>
                    <RefreshCw className={`h-4 w-4 ${unified.balanceLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  <Button asChild size="sm">
                    <Link to="/dashboard?action=deposit">
                      <ArrowDownToLine className="h-4 w-4" /> Deposit
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/dashboard?action=transfer">
                      <Send className="h-4 w-4" /> Send
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Wallet type selector */}
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          {/* Native Cashu Wallet */}
          <Card className={unified.walletType === 'cashu' ? 'ring-2 ring-orange-500/30 border-orange-500/20' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                    <Coins className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle>Native Ecash Wallet</CardTitle>
                    <CardDescription>Cashu protocol · in-browser</CardDescription>
                  </div>
                </div>
                {cashu.hasWallet && <CheckCircle2 className="h-5 w-5 text-green-500" />}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create a non-custodial ecash wallet directly in your browser. No
                external app needed. Powered by Cashu blind signatures for
                enhanced privacy.
              </p>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">Non-custodial · BIP39 seed backup</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span className="text-muted-foreground">Instant ecash transfers (no Lightning needed)</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-blue-500" />
                  <span className="text-muted-foreground">Multi-mint support · spread risk</span>
                </div>
              </div>

              {cashu.hasWallet ? (
                <div className="space-y-3">
                  {/* Mint selector */}
                  <div>
                    <Label className="text-xs">Active mint</Label>
                    <Select value={cashu.selectedMintUrl} onValueChange={cashu.setSelectedMintUrl}>
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {cashu.allMints.map((m) => (
                          <SelectItem key={m.url} value={m.url}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Cashu-specific actions */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowSendEcash(true)}>
                      <Send className="h-3.5 w-3.5" /> Send ecash
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowReceiveEcash(true)}>
                      <ArrowDownToLine className="h-3.5 w-3.5" /> Receive ecash
                    </Button>
                  </div>

                  {/* Seed backup warning */}
                  {!cashu.isBackedUp && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div>
                        <p className="font-medium text-amber-600">Back up your seed phrase!</p>
                        <p className="text-muted-foreground">
                          Your funds are only recoverable with your 12-word seed.
                          <Button variant="link" className="h-auto p-0 ml-1 text-xs" onClick={() => setShowSeedDialog(true)}>
                            View seed
                          </Button>
                        </p>
                      </div>
                    </div>
                  )}

                  <Separator />

                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setShowSeedDialog(true)}>
                      <Key className="h-3.5 w-3.5" /> View seed
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm('Reset wallet? All ecash tokens will be lost unless you have your seed phrase.')) {
                          cashu.resetWallet();
                          unified.setWalletType(null);
                        }
                      }}
                    >
                      Reset wallet
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button className="w-full" onClick={handleCreateCashu}>
                    <Sparkles className="h-4 w-4" /> Create new wallet
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => setShowRestoreDialog(true)}>
                    <Key className="h-4 w-4" /> Restore from seed
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* NWC Remote Wallet */}
          <Card className={unified.walletType === 'nwc' ? 'ring-2 ring-blue-500/30' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                    <Zap className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle>Lightning Wallet (NWC)</CardTitle>
                    <CardDescription>Remote wallet · NIP-47</CardDescription>
                  </div>
                </div>
                {nwc.hasWallet && <CheckCircle2 className="h-5 w-5 text-green-500" />}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect an existing Lightning wallet via Nostr Wallet Connect.
                Your wallet stays on your device — PontPay sends payment
                instructions over Nostr.
              </p>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">Connection secret stays in your browser</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span className="text-muted-foreground">Direct Lightning Network payments</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-blue-500" />
                  <span className="text-muted-foreground">Works with Alby, Mutiny, Zeus, and more</span>
                </div>
              </div>

              <WalletModal />

              <div className="grid grid-cols-3 gap-2">
                {NWC_WALLETS.map((w) => {
                  const Icon = w.icon;
                  return (
                    <a
                      key={w.name}
                      href={w.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all hover:bg-muted"
                    >
                      <Icon className="h-5 w-5 text-primary" />
                      <span className="text-xs font-medium">{w.name}</span>
                    </a>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* How to connect (NWC) */}
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6">
          <h3 className="text-sm font-semibold">How to connect via NWC</h3>
          <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><strong className="text-foreground">1.</strong> Create a wallet with one of the providers above (or use your existing wallet).</li>
            <li><strong className="text-foreground">2.</strong> Find the &ldquo;Nostr Wallet Connect&rdquo; or &ldquo;NWC&rdquo; section in your wallet settings.</li>
            <li><strong className="text-foreground">3.</strong> Copy the connection URI (starts with <code className="rounded bg-muted px-1.5 py-0.5 text-xs">nostr+walletconnect://</code>) and paste it via the &ldquo;Wallet Settings&rdquo; button.</li>
            <li><strong className="text-foreground">4.</strong> Your wallet is connected! You can now deposit, withdraw, and transfer on the Pontmore network.</li>
          </ol>
        </div>
      </div>

      {/* Seed phrase dialog */}
      <Dialog open={showSeedDialog} onOpenChange={setShowSeedDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" /> Your seed phrase
            </DialogTitle>
            <DialogDescription>
              Write down these 12 words and keep them safe. Anyone with these
              words can access your funds. You will need them to restore your wallet.
            </DialogDescription>
          </DialogHeader>
          {cashu.seedPhrase && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex flex-wrap gap-2">
                  {cashu.seedPhrase.split(' ').map((word, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1.5 text-sm font-mono"
                    >
                      <span className="text-xs text-muted-foreground">{i + 1}.</span>
                      {word}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(cashu.seedPhrase ?? '');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
                {!cashu.isBackedUp && (
                  <Button
                    size="sm"
                    onClick={() => {
                      cashu.confirmBackup();
                      setShowSeedDialog(false);
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" /> I&apos;ve saved it
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Restore wallet dialog */}
      <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" /> Restore from seed
            </DialogTitle>
            <DialogDescription>
              Enter your 12-word BIP39 seed phrase to restore your ecash wallet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Enter your 12-word seed phrase..."
              value={restoreSeed}
              onChange={(e) => setRestoreSeed(e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRestoreDialog(false)}>Cancel</Button>
              <Button onClick={handleRestoreCashu} disabled={!restoreSeed.trim()}>
                Restore wallet
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send ecash dialog */}
      <Dialog open={showSendEcash} onOpenChange={setShowSendEcash}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" /> Send ecash tokens
            </DialogTitle>
            <DialogDescription>
              Generate an ecash token to send to anyone. They can redeem it in
              any Cashu-compatible wallet — no Lightning invoice needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {generatedToken ? (
              <div className="space-y-3">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="mb-2 text-sm font-medium">Ecash token generated</p>
                  <code className="block break-all rounded bg-background p-3 text-xs">{generatedToken}</code>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedToken);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    Copy token
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setGeneratedToken(null);
                      setSendAmount('');
                      setShowSendEcash(false);
                    }}
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="ecash-amount">Amount (sats)</Label>
                  <Input
                    id="ecash-amount"
                    type="number"
                    placeholder="1000"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Available: {formatSats(cashu.currentMintBalance)}
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowSendEcash(false)}>Cancel</Button>
                  <Button onClick={handleSendEcash} disabled={!sendAmount}>
                    <Send className="h-4 w-4" /> Generate token
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Receive ecash dialog */}
      <Dialog open={showReceiveEcash} onOpenChange={setShowReceiveEcash}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownToLine className="h-5 w-5" /> Receive ecash tokens
            </DialogTitle>
            <DialogDescription>
              Paste an ecash token string to redeem it into your wallet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="cashu..."
              value={ecashToken}
              onChange={(e) => setEcashToken(e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReceiveEcash(false)}>Cancel</Button>
              <Button onClick={handleReceiveEcash} disabled={!ecashToken.trim()}>
                <ArrowDownToLine className="h-4 w-4" /> Redeem tokens
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
