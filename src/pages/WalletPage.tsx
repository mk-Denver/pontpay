import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  Zap,
  Wallet as WalletIcon,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  Shield,
  Smartphone,
  Globe,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  Copy,
  Check,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUnifiedWallet } from '@/hooks/useUnifiedWallet';
import { formatSats } from '@/lib/pontmore';
import { QRCodeCanvas } from '@/components/ui/qrcode';

export default function WalletPage() {
  const { user } = useCurrentUser();
  const unified = useUnifiedWallet();
  const [showConnect, setShowConnect] = useState(false);

  useSeoMeta({ title: 'Wallet — PontPay', description: 'Manage your Lightning wallet.' });

  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
            <WalletIcon className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold">PontPay Wallet</h1>
          <p className="mt-3 text-muted-foreground">Log in to connect your Lightning wallet.</p>
          <Button asChild className="mt-6"><Link to="/">Join PontPay</Link></Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to="/dashboard" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/20">
            <WalletIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Wallet</h1>
            <p className="mt-1 text-muted-foreground">Lightning wallet via Nostr Wallet Connect (NIP-47).</p>
          </div>
        </div>

        <Card className="mb-6 border-orange-500/20 overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardDescription>Balance</CardDescription>
                {unified.balanceLoading ? (
                  <Skeleton className="mt-1 h-9 w-32" />
                ) : (
                  <CardTitle className="text-3xl">{unified.hasWallet ? formatSats(unified.balance) : 'Not connected'}</CardTitle>
                )}
              </div>
              {unified.hasWallet ? (
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="mr-1 h-3 w-3" /> Connected</Badge>
              ) : <Badge variant="secondary">Disconnected</Badge>}
            </div>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button variant="outline" size="sm" onClick={unified.refreshBalance} disabled={unified.balanceLoading}><RefreshCw className="h-4 w-4" /> Refresh</Button>
            {unified.hasWallet ? (
              <Button variant="outline" size="sm" onClick={() => setShowConnect(true)}><Shield className="h-4 w-4" /> Change wallet</Button>
            ) : (
              <Button size="sm" onClick={() => setShowConnect(true)}><Zap className="h-4 w-4" /> Connect wallet</Button>
            )}
          </CardContent>
        </Card>

        {unified.hasWallet && (
          <Tabs defaultValue="send">
            <TabsList className="w-full">
              <TabsTrigger value="send" className="flex-1"><ArrowUpFromLine className="h-4 w-4" /> Send</TabsTrigger>
              <TabsTrigger value="receive" className="flex-1"><ArrowDownToLine className="h-4 w-4" /> Receive</TabsTrigger>
            </TabsList>
            <TabsContent value="send" className="mt-4"><SendTab /></TabsContent>
            <TabsContent value="receive" className="mt-4"><ReceiveTab /></TabsContent>
          </Tabs>
        )}

        {showConnect && <WalletModal onClose={() => setShowConnect(false)} />}
      </div>
    </AppLayout>
  );
}

function SendTab() {
  const { payInvoice, isPaying } = useUnifiedWallet();
  const [invoice, setInvoice] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const handlePay = async () => {
    if (!invoice.trim()) return;
    setStatus('Paying…');
    try { await payInvoice(invoice.trim()); setStatus('Payment sent.'); setInvoice(''); }
    catch (e) { setStatus('Failed: ' + (e instanceof Error ? e.message : '')); }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Pay Invoice</CardTitle><CardDescription>Paste a BOLT11 invoice.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <Textarea placeholder="lnbc..." value={invoice} onChange={(e) => setInvoice(e.target.value)} rows={3} className="font-mono text-sm" />
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
        <Button onClick={handlePay} disabled={isPaying || !invoice.trim()} className="w-full">
          {isPaying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {isPaying ? 'Paying…' : 'Pay invoice'}
        </Button>
      </CardContent>
    </Card>
  );
}

function ReceiveTab() {
  const { makeInvoice, isCreatingInvoice } = useUnifiedWallet();
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [invoice, setInvoice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    const sats = parseInt(amount); if (!sats) return;
    setInvoice(null);
    try { const r = await makeInvoice(sats, memo || undefined); if (r?.invoice) setInvoice(r.invoice); } catch {}
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Create Invoice</CardTitle><CardDescription>Generate an invoice to receive sats.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div><Label>Amount (sats)</Label><Input type="number" placeholder="50000" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label>Memo</Label><Input placeholder="Payment for..." value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
        <Button onClick={handleCreate} disabled={isCreatingInvoice || !amount} className="w-full">
          {isCreatingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {isCreatingInvoice ? 'Creating…' : 'Create invoice'}
        </Button>
        {invoice && (
          <div className="mt-3 space-y-3">
            <div className="rounded-lg bg-muted p-3 text-center">
              <QRCodeCanvas value={invoice} className="mx-auto mb-2" />
              <code className="block break-all text-xs text-muted-foreground">{invoice}</code>
            </div>
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(invoice); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="w-full">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
