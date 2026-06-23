import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  Zap,
  Wallet as WalletIcon,
  ArrowDownToLine,
  ArrowUpFromLine,
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
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Plus,
  Trash2,
  Settings,
  Receipt,
  Store,
  Repeat,
  QRCode,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useUnifiedWallet, type WalletType } from '@/hooks/useUnifiedWallet';
import { useCashuWallet, DEFAULT_MINTS, type CashuTransaction } from '@/hooks/useCashuWallet';
import { useLightningWallet } from '@/hooks/useLightningWallet';
import { useWallet } from '@/hooks/useWallet';
import { formatSats } from '@/lib/pontmore';
import { QRCodeCanvas } from '@/components/ui/qrcode';

const NWC_WALLETS = [
  { name: 'Alby Hub', description: 'Self-hosted Lightning wallet with NWC.', url: 'https://getalby.com', icon: Zap, badge: 'Self-custody' },
  { name: 'Mutiny', description: 'Browser-based Lightning wallet.', url: 'https://mutinywallet.com', icon: Smartphone, badge: 'Beginner' },
  { name: 'Zeus', description: 'Mobile Lightning wallet.', url: 'https://zeusln.app', icon: Globe, badge: 'Mobile' },
];

export default function WalletPage() {
  const { user } = useCurrentUser();
  const unified = useUnifiedWallet();
  const cashu = useCashuWallet();
  const nwc = useLightningWallet();
  const { webln } = useWallet();

  // Dialog state
  const [showSeedDialog, setShowSeedDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [restoreSeed, setRestoreSeed] = useState('');
  const [copied, setCopied] = useState(false);

  // Send state
  const [sendAmount, setSendAmount] = useState('');
  const [sendInvoice, setSendInvoice] = useState('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  // Receive state
  const [receiveTokenInput, setReceiveTokenInput] = useState('');
  const [receiveAmount, setReceiveAmount] = useState('');
  const [generatedInvoice, setGeneratedInvoice] = useState<string | null>(null);
  const [invoiceCheckInterval, setInvoiceCheckInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  // Mint management
  const [newMintName, setNewMintName] = useState('');
  const [newMintUrl, setNewMintUrl] = useState('');

  useSeoMeta({
    title: 'Wallet — PontPay',
    description: 'Your Bitcoin wallet for the Pontmore network.',
  });

  // ─── Login gate ──────────────────────────────────────────────
  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
            <WalletIcon className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold">Connect your wallet</h1>
          <p className="mt-3 text-muted-foreground">
            Log in with your Nostr identity to create or connect a Bitcoin wallet.
          </p>
          <Button asChild className="mt-6">
            <Link to="/">Join PontPay</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  // ─── Wallet creation handlers ────────────────────────────────
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

  // ─── Send handlers ───────────────────────────────────────────
  const handleSendEcash = async () => {
    const amount = parseInt(sendAmount);
    if (!amount) return;
    const token = await cashu.sendEcashTokensAsync(amount);
    if (token) setGeneratedToken(token);
  };

  const handleSendLightning = async () => {
    if (!sendInvoice.trim()) return;
    await unified.payInvoice(sendInvoice.trim());
    setSendInvoice('');
  };

  // ─── Receive handlers ────────────────────────────────────────
  const handleReceiveEcash = async () => {
    if (!receiveTokenInput.trim()) return;
    await cashu.receiveEcashTokens(receiveTokenInput.trim());
    setReceiveTokenInput('');
  };

  const handleGenerateInvoice = async () => {
    const amount = parseInt(receiveAmount);
    if (!amount) return;
    const result = await unified.makeInvoice(amount, 'PontPay receive');
    if (result) {
      setGeneratedInvoice(result.invoice);
      // Poll for payment (Cashu mint quote check)
      if (unified.walletType === 'cashu') {
        const interval = setInterval(async () => {
          const paid = await cashu.checkMintQuote(result.invoice, amount);
          if (paid) {
            clearInterval(interval);
            setInvoiceCheckInterval(null);
            setGeneratedInvoice(null);
            setReceiveAmount('');
          }
        }, 3000);
        setInvoiceCheckInterval(interval);
      }
    }
  };

  // ─── Mint management ─────────────────────────────────────────
  const handleAddMint = () => {
    if (!newMintName.trim() || !newMintUrl.trim()) return;
    cashu.addCustomMint(newMintName.trim(), newMintUrl.trim());
    setNewMintName('');
    setNewMintUrl('');
  };

  // ─── No wallet connected: show creation options ──────────────
  if (!unified.hasWallet) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Wallet</h1>
            <p className="mt-2 text-muted-foreground">
              Create a native ecash wallet or connect an existing Lightning wallet.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Native Cashu Wallet */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                    <Coins className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle>Native Ecash Wallet</CardTitle>
                    <CardDescription>Cashu protocol · in-browser</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Create a non-custodial ecash wallet directly in your browser. No
                  external app needed. Powered by Cashu blind signatures for privacy.
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
                <div className="space-y-2">
                  <Button className="w-full" onClick={handleCreateCashu}>
                    <Sparkles className="h-4 w-4" /> Create new wallet
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => setShowRestoreDialog(true)}>
                    <Key className="h-4 w-4" /> Restore from seed
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* NWC Remote Wallet */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                    <Zap className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle>Lightning Wallet (NWC)</CardTitle>
                    <CardDescription>Remote wallet · NIP-47</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Connect an existing Lightning wallet via Nostr Wallet Connect.
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
                </div>
                <WalletModal />
                <div className="grid grid-cols-3 gap-2">
                  {NWC_WALLETS.map((w) => {
                    const Icon = w.icon;
                    return (
                      <a key={w.name} href={w.url} target="_blank" rel="noopener noreferrer"
                        className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all hover:bg-muted">
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="text-xs font-medium">{w.name}</span>
                      </a>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Restore dialog */}
        <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> Restore from seed</DialogTitle>
              <DialogDescription>Enter your 12-word BIP39 seed phrase to restore your ecash wallet.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea placeholder="Enter your 12-word seed phrase..." value={restoreSeed} onChange={(e) => setRestoreSeed(e.target.value)} rows={3} className="font-mono text-sm" />
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRestoreDialog(false)}>Cancel</Button>
                <Button onClick={handleRestoreCashu} disabled={!restoreSeed.trim()}>Restore wallet</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* Seed dialog */}
        <SeedDialog open={showSeedDialog} onOpenChange={setShowSeedDialog} seedPhrase={cashu.seedPhrase} isBackedUp={cashu.isBackedUp} onConfirm={cashu.confirmBackup} copied={copied} setCopied={setCopied} />
      </AppLayout>
    );
  }

  // ─── Wallet active: full wallet UI ───────────────────────────
  const isCashu = unified.walletType === 'cashu';

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Wallet</h1>
            <p className="mt-1 text-muted-foreground">
              {isCashu ? 'Cashu ecash wallet' : 'Lightning wallet (NWC)'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={unified.refreshBalance} disabled={unified.balanceLoading}>
              <RefreshCw className={`h-4 w-4 ${unified.balanceLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link to="/dashboard"><Store className="h-4 w-4" /> Pontmore swaps</Link>
            </Button>
          </div>
        </div>

        {/* Balance card */}
        <Card className="mb-6 overflow-hidden border-orange-500/20">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-orange-500/5 to-amber-500/5" />
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total balance</p>
                {unified.balanceLoading ? (
                  <Skeleton className="mt-2 h-10 w-40" />
                ) : (
                  <p className="mt-1 text-4xl font-bold tracking-tight">{formatSats(unified.balance)}</p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> {unified.walletAlias ?? 'Connected'}
                  </Badge>
                  <Badge variant="outline">
                    {isCashu ? <><Coins className="mr-1 h-3 w-3" /> Cashu</> : <><Zap className="mr-1 h-3 w-3" /> NWC</>}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm"><Link to="/dashboard?action=deposit"><ArrowDownToLine className="h-4 w-4" /> Deposit</Link></Button>
                <Button asChild size="sm" variant="secondary"><Link to="/dashboard?action=transfer"><Send className="h-4 w-4" /> Send</Link></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs: Send | Receive | History | Settings */}
        <Tabs defaultValue="send" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="send"><Send className="mr-1.5 h-4 w-4" /> Send</TabsTrigger>
            <TabsTrigger value="receive"><ArrowDownToLine className="mr-1.5 h-4 w-4" /> Receive</TabsTrigger>
            <TabsTrigger value="history"><Receipt className="mr-1.5 h-4 w-4" /> History</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="mr-1.5 h-4 w-4" /> Settings</TabsTrigger>
          </TabsList>

          {/* ─── Send tab ─────────────────────────────────────── */}
          <TabsContent value="send" className="mt-4">
            <SendTab
              isCashu={isCashu}
              balance={unified.balance}
              currentMintBalance={isCashu ? cashu.currentMintBalance : unified.balance}
              selectedMint={cashu.selectedMint}
              allMints={cashu.allMints}
              selectedMintUrl={cashu.selectedMintUrl}
              onMintSwitch={cashu.setSelectedMintUrl}
              sendAmount={sendAmount}
              setSendAmount={setSendAmount}
              sendInvoice={sendInvoice}
              setSendInvoice={setSendInvoice}
              generatedToken={generatedToken}
              setGeneratedToken={setGeneratedToken}
              onSendEcash={handleSendEcash}
              onSendLightning={handleSendLightning}
              isPaying={unified.isPaying}
              copied={copied}
              setCopied={setCopied}
            />
          </TabsContent>

          {/* ─── Receive tab ──────────────────────────────────── */}
          <TabsContent value="receive" className="mt-4">
            <ReceiveTab
              isCashu={isCashu}
              receiveTokenInput={receiveTokenInput}
              setReceiveTokenInput={setReceiveTokenInput}
              receiveAmount={receiveAmount}
              setReceiveAmount={setReceiveAmount}
              generatedInvoice={generatedInvoice}
              onReceiveEcash={handleReceiveEcash}
              onGenerateInvoice={handleGenerateInvoice}
              isCreatingInvoice={unified.isCreatingInvoice}
              copied={copied}
              setCopied={setCopied}
              invoiceCheckInterval={invoiceCheckInterval}
            />
          </TabsContent>

          {/* ─── History tab ──────────────────────────────────── */}
          <TabsContent value="history" className="mt-4">
            <HistoryTab
              isCashu={isCashu}
              transactions={isCashu ? cashu.transactions : []}
              balance={unified.balance}
            />
          </TabsContent>

          {/* ─── Settings tab ─────────────────────────────────── */}
          <TabsContent value="settings" className="mt-4">
            <SettingsTab
              isCashu={isCashu}
              cashu={cashu}
              unified={unified}
              showSeedDialog={showSeedDialog}
              setShowSeedDialog={setShowSeedDialog}
              copied={copied}
              setCopied={setCopied}
              newMintName={newMintName}
              setNewMintName={setNewMintName}
              newMintUrl={newMintUrl}
              setNewMintUrl={setNewMintUrl}
              onAddMint={handleAddMint}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Seed dialog */}
      <SeedDialog open={showSeedDialog} onOpenChange={setShowSeedDialog} seedPhrase={cashu.seedPhrase} isBackedUp={cashu.isBackedUp} onConfirm={cashu.confirmBackup} copied={copied} setCopied={setCopied} />

      {/* Restore dialog */}
      <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> Restore from seed</DialogTitle>
            <DialogDescription>Enter your 12-word BIP39 seed phrase.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea placeholder="Enter your 12-word seed phrase..." value={restoreSeed} onChange={(e) => setRestoreSeed(e.target.value)} rows={3} className="font-mono text-sm" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRestoreDialog(false)}>Cancel</Button>
              <Button onClick={handleRestoreCashu} disabled={!restoreSeed.trim()}>Restore</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// ─── Seed Dialog Component ───────────────────────────────────────

function SeedDialog({ open, onOpenChange, seedPhrase, isBackedUp, onConfirm, copied, setCopied }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seedPhrase: string | null;
  isBackedUp: boolean;
  onConfirm: () => void;
  copied: boolean;
  setCopied: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> Your seed phrase</DialogTitle>
          <DialogDescription>
            Write down these 12 words and keep them safe. Anyone with these words can access your funds.
          </DialogDescription>
        </DialogHeader>
        {seedPhrase && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex flex-wrap gap-2">
                {seedPhrase.split(' ').map((word, i) => (
                  <span key={i} className="flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1.5 text-sm font-mono">
                    <span className="text-xs text-muted-foreground">{i + 1}.</span>{word}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(seedPhrase); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied!' : 'Copy'}
              </Button>
              {!isBackedUp && <Button size="sm" onClick={() => { onConfirm(); onOpenChange(false); }}>
                <CheckCircle2 className="h-4 w-4" /> I've saved it
              </Button>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Send Tab ────────────────────────────────────────────────────

function SendTab({ isCashu, balance, currentMintBalance, selectedMint, allMints, selectedMintUrl, onMintSwitch, sendAmount, setSendAmount, sendInvoice, setSendInvoice, generatedToken, setGeneratedToken, onSendEcash, onSendLightning, isPaying, copied, setCopied }: {
  isCashu: boolean;
  balance: number;
  currentMintBalance: number;
  selectedMint: { name: string; url: string };
  allMints: { name: string; url: string }[];
  selectedMintUrl: string;
  onMintSwitch: (url: string) => void;
  sendAmount: string;
  setSendAmount: (v: string) => void;
  sendInvoice: string;
  setSendInvoice: (v: string) => void;
  generatedToken: string | null;
  setGeneratedToken: (v: string | null) => void;
  onSendEcash: () => Promise<void>;
  onSendLightning: () => void;
  isPaying: boolean;
  copied: boolean;
  setCopied: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Mint selector (Cashu only) */}
      {isCashu && allMints.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Sending from</p>
                <p className="font-semibold text-sm">{selectedMint?.name ?? 'Unknown'}</p>
                <p className="text-xs text-muted-foreground">{formatSats(currentMintBalance)}</p>
              </div>
              {allMints.length > 1 && (
                <Select value={selectedMintUrl} onValueChange={onMintSwitch}>
                  <SelectTrigger className="w-40 h-8 text-sm"><Repeat className="mr-1 h-3 w-3" /><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allMints.map((m) => (<SelectItem key={m.url} value={m.url}>{m.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Balance display */}
      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
        <span className="text-muted-foreground">Available balance</span>
        <strong>{formatSats(isCashu ? currentMintBalance : balance)}</strong>
      </div>

      {/* Send ecash token (Cashu only) */}
      {isCashu && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Coins className="h-5 w-5 text-orange-600" /> Send ecash token</CardTitle>
            <CardDescription>Generate a token to share via text, QR, or Nostr DM. No Lightning needed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {generatedToken ? (
              <div className="space-y-3">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="mb-2 text-sm font-medium">Ecash token generated</p>
                  <div className="flex justify-center rounded-lg bg-white p-4">
                    <QRCodeCanvas value={generatedToken} size={180} />
                  </div>
                  <code className="mt-3 block break-all rounded bg-background p-2 text-xs">{generatedToken}</code>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { navigator.clipboard.writeText(generatedToken); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy token
                  </Button>
                  <Button size="sm" onClick={() => { setGeneratedToken(null); setSendAmount(''); }}>Done</Button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="send-ecash-amount">Amount (sats)</Label>
                  <Input id="send-ecash-amount" type="number" placeholder="1000" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} />
                </div>
                <Button onClick={onSendEcash} disabled={!sendAmount} className="w-full">
                  <Send className="h-4 w-4" /> Generate ecash token
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Send via Lightning */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Zap className="h-5 w-5 text-amber-500" /> Send via Lightning</CardTitle>
          <CardDescription>Pay a BOLT11 Lightning invoice.{isCashu ? ' Melts ecash tokens.' : ''}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="send-invoice">Lightning invoice</Label>
            <Textarea id="send-invoice" placeholder="lnbc..." value={sendInvoice} onChange={(e) => setSendInvoice(e.target.value)} rows={3} className="font-mono text-sm" />
          </div>
          <Button onClick={onSendLightning} disabled={!sendInvoice.trim() || isPaying} className="w-full">
            {isPaying ? <><Loader2 className="h-4 w-4 animate-spin" /> Paying…</> : <><Zap className="h-4 w-4" /> Pay invoice</>}
          </Button>
        </CardContent>
      </Card>

      {/* Pontmore swap link */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="flex items-center gap-3 py-4">
          <Store className="h-5 w-5 text-blue-600" />
          <div className="flex-1 text-sm">
            <p className="font-medium">Send via Pontmore agent swap</p>
            <p className="text-muted-foreground">Deposit, withdraw, or transfer with agents.</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/dashboard"><ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Receive Tab ─────────────────────────────────────────────────

function ReceiveTab({ isCashu, receiveTokenInput, setReceiveTokenInput, receiveAmount, setReceiveAmount, generatedInvoice, onReceiveEcash, onGenerateInvoice, isCreatingInvoice, copied, setCopied, invoiceCheckInterval }: {
  isCashu: boolean;
  receiveTokenInput: string;
  setReceiveTokenInput: (v: string) => void;
  receiveAmount: string;
  setReceiveAmount: (v: string) => void;
  generatedInvoice: string | null;
  onReceiveEcash: () => void;
  onGenerateInvoice: () => void;
  isCreatingInvoice: boolean;
  copied: boolean;
  setCopied: (v: boolean) => void;
  invoiceCheckInterval: ReturnType<typeof setInterval> | null;
}) {
  return (
    <div className="space-y-4">
      {/* Receive via Lightning invoice */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Zap className="h-5 w-5 text-amber-500" /> Receive via Lightning</CardTitle>
          <CardDescription>
            {isCashu ? 'Create a Lightning invoice to mint new ecash tokens.' : 'Create a Lightning invoice to receive sats.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {generatedInvoice ? (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Invoice created</p>
                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                    <Clock className="mr-1 h-3 w-3" /> Waiting for payment…
                  </Badge>
                </div>
                <div className="flex justify-center rounded-lg bg-white p-4">
                  <QRCodeCanvas value={`lightning:${generatedInvoice}`} size={200} />
                </div>
                <code className="mt-3 block break-all rounded bg-background p-2 text-xs">{generatedInvoice.slice(0, 80)}...</code>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => { navigator.clipboard.writeText(generatedInvoice); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy invoice
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { if (invoiceCheckInterval) clearInterval(invoiceCheckInterval); }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="recv-amount">Amount (sats)</Label>
                <Input id="recv-amount" type="number" placeholder="1000" value={receiveAmount} onChange={(e) => setReceiveAmount(e.target.value)} />
              </div>
              <Button onClick={onGenerateInvoice} disabled={!receiveAmount || isCreatingInvoice} className="w-full">
                {isCreatingInvoice ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating invoice…</> : <><ArrowDownToLine className="h-4 w-4" /> Generate invoice</>}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Receive ecash token (Cashu only) */}
      {isCashu && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Coins className="h-5 w-5 text-orange-600" /> Receive ecash token</CardTitle>
            <CardDescription>Paste a Cashu token to redeem it into your wallet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea placeholder="cashu..." value={receiveTokenInput} onChange={(e) => setReceiveTokenInput(e.target.value)} rows={4} className="font-mono text-sm" />
            <Button onClick={onReceiveEcash} disabled={!receiveTokenInput.trim()} className="w-full">
              <ArrowDownToLine className="h-4 w-4" /> Redeem token
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── History Tab ─────────────────────────────────────────────────

function HistoryTab({ isCashu, transactions, balance }: {
  isCashu: boolean;
  transactions: CashuTransaction[];
  balance: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
        <span className="text-muted-foreground">Wallet balance</span>
        <strong>{formatSats(balance)}</strong>
      </div>

      {transactions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 px-8 text-center">
            <Receipt className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No wallet transactions yet.</p>
          </CardContent>
        </Card>
      ) : (
        transactions.map((tx) => {
          const isIncoming = tx.type === 'receive' || tx.type === 'mint';
          const Icon = isIncoming ? ArrowDownLeft : ArrowUpRight;
          return (
            <Card key={tx.id} className="transition-colors hover:bg-muted/30">
              <CardContent className="flex items-center gap-3 py-3 px-4">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isIncoming ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                  <Icon className={`h-4 w-4 ${isIncoming ? 'text-green-600' : 'text-red-500'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${isIncoming ? 'text-green-600' : 'text-red-500'}`}>
                    {isIncoming ? '+' : '−'}{tx.amount} sats
                  </p>
                  <p className="truncate text-xs text-muted-foreground capitalize">
                    {tx.type} · {tx.mint ? new URL(tx.mint).hostname : ''}
                    {tx.memo ? ` · ${tx.memo}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{new Date(tx.timestamp).toLocaleDateString()}</p>
                  {tx.status === 'pending' && (
                    <Badge className="mt-0.5 bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">Pending</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      <Separator />

      {/* Pontmore swap history link */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="flex items-center gap-3 py-4">
          <Store className="h-5 w-5 text-blue-600" />
          <div className="flex-1 text-sm">
            <p className="font-medium">Pontmore swap history</p>
            <p className="text-muted-foreground">View your agent network transactions.</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/transactions"><ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Settings Tab ────────────────────────────────────────────────

function SettingsTab({ isCashu, cashu, unified, showSeedDialog, setShowSeedDialog, copied, setCopied, newMintName, setNewMintName, newMintUrl, setNewMintUrl, onAddMint }: {
  isCashu: boolean;
  cashu: ReturnType<typeof useCashuWallet>;
  unified: ReturnType<typeof useUnifiedWallet>;
  showSeedDialog: boolean;
  setShowSeedDialog: (v: boolean) => void;
  copied: boolean;
  setCopied: (v: boolean) => void;
  newMintName: string;
  setNewMintName: (v: string) => void;
  newMintUrl: string;
  setNewMintUrl: (v: string) => void;
  onAddMint: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Seed phrase backup (Cashu only) */}
      {isCashu && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Key className="h-5 w-5" /> Seed phrase</CardTitle>
            <CardDescription>Your 12-word backup phrase. Keep it safe.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!cashu.isBackedUp && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-600">Back up your seed phrase!</p>
                  <p className="text-muted-foreground">Your funds are only recoverable with your seed.</p>
                </div>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowSeedDialog(true)}>
              <Key className="h-4 w-4" /> View seed phrase
            </Button>
            {cashu.isBackedUp && <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="mr-1 h-3 w-3" /> Backed up</Badge>}
          </CardContent>
        </Card>
      )}

      {/* Mint management (Cashu only) */}
      {isCashu && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Coins className="h-5 w-5" /> Mints</CardTitle>
            <CardDescription>Manage Cashu mints. Spread risk across multiple mints.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {cashu.allMints.map((mint) => (
                <div key={mint.url} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{mint.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{mint.url}</p>
                    <p className="text-xs text-muted-foreground">{formatSats(cashu.proofsByMint?.[mint.url]?.reduce((s: number, p: { amount: number }) => s + p.amount, 0) ?? 0)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {cashu.selectedMintUrl === mint.url && <Badge variant="secondary" className="text-xs">Active</Badge>}
                    {(cashu.customMints ?? []).some((m) => m.url === mint.url) && (
                      <Button size="sm" variant="ghost" onClick={() => cashu.removeCustomMint(mint.url)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            {/* Add custom mint */}
            <div className="space-y-2">
              <Label className="text-xs">Add custom mint</Label>
              <div className="flex gap-2">
                <Input placeholder="Name" value={newMintName} onChange={(e) => setNewMintName(e.target.value)} className="text-sm" />
                <Input placeholder="https://mint.example.com" value={newMintUrl} onChange={(e) => setNewMintUrl(e.target.value)} className="text-sm" />
                <Button size="sm" onClick={onAddMint} disabled={!newMintName.trim() || !newMintUrl.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wallet type switch */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><WalletIcon className="h-5 w-5" /> Wallet type</CardTitle>
          <CardDescription>Switch between wallet types.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={unified.walletType === 'cashu' ? 'default' : 'outline'}
              onClick={() => unified.setWalletType('cashu' as WalletType)}
              disabled={!cashu.hasWallet}
            >
              <Coins className="h-4 w-4" /> Cashu ecash
            </Button>
            <Button
              size="sm"
              variant={unified.walletType === 'nwc' ? 'default' : 'outline'}
              onClick={() => unified.setWalletType('nwc' as WalletType)}
            >
              <Zap className="h-4 w-4" /> NWC Lightning
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* NWC connection (always available) */}
      {!isCashu && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Zap className="h-5 w-5" /> NWC connection</CardTitle>
            <CardDescription>Manage your Nostr Wallet Connect settings.</CardDescription>
          </CardHeader>
          <CardContent><WalletModal /></CardContent>
        </Card>
      )}

      {/* Reset wallet (Cashu only) */}
      {isCashu && (
        <Card className="border-destructive/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive"><AlertTriangle className="h-5 w-5" /> Danger zone</CardTitle>
            <CardDescription>Reset your wallet. Make sure you have your seed phrase.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30"
              onClick={() => {
                if (confirm('Reset wallet? All ecash tokens will be lost unless you have your seed phrase.')) {
                  cashu.resetWallet();
                  unified.setWalletType(null);
                }
              }}
            >
              <Trash2 className="h-4 w-4" /> Reset wallet
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
