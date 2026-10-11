import { useSeoMeta } from '@unhead/react';
import { useState } from 'react';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import {
  Store,
  Save,
  Trash2,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Globe,
  Info,
  ArrowRight,
  ShieldCheck,
  Coins,
  Tag,
  AlertCircle,
  Share2,
  Check,
} from 'lucide-react';
import { AppLayout } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  useAgentRegistration,
  type AgentRegistrationInput,
} from '@/hooks/useAgentRegistration';
import { useAuthor } from '@/hooks/useAuthor';
import type { SwapType } from '@/lib/pontmore';
import { buildFullAgentLink } from '@/lib/agentLink';

const ALL_CURRENCIES = ['USD', 'KES', 'UGX', 'NGN', 'GHS', 'TZS', 'RWF', 'EUR', 'GBP'];
const ESCROW_TYPES = [
  { value: 'custodial_escrow', label: 'Custodial Escrow' },
  { value: 'lightning_hold_invoice', label: 'Lightning Hold Invoice' },
  { value: 'cashu_escrow', label: 'Cashu Escrow' },
];
const PAYMENT_CHANNELS = ['mpesa-ke-kes@1', 'bank-transfer-ke@1', 'mobile-money-ugx@1', 'ach-usd@1', 'sepa-eur@1'];
const BITCOIN_NETWORKS = ['mainnet', 'testnet'];
const SETTLEMENT_LAYERS = ['lightning', 'bitcoin-onchain'];

export default function AgentRegistrationPage() {
  const { user } = useCurrentUser();
  const { myAgent, isRegistered, isLoading, publishRegistration, deleteRegistration, defaultRelays, defaultInput } =
    useAgentRegistration();

  const [input, setInput] = useState<AgentRegistrationInput>(() => ({
    ...defaultInput(),
    relays: defaultRelays.length > 0 ? defaultRelays : [],
  }));
  const [validationError, setValidationError] = useState<string | null>(null);

  useSeoMeta({
    title: 'Register as Agent — PontPay',
    description: 'Register as a Pontmore agent and become discoverable on the network.',
  });

  // Fetch profile name/about for pre-fill
  const author = useAuthor(user?.pubkey);
  const profileName = author.data?.metadata?.name ?? '';
  const profileAbout = author.data?.metadata?.about ?? '';

  // Compute "now" once for relative day displays (avoids impure Date.now in render)
  const [nowSec] = useState(() => Math.floor(Date.now() / 1000));
  const escrowExpiryDays = Math.max(1, Math.floor((input.escrowExpiresAt - nowSec) / 86400));
  const offerExpiryDays = Math.max(1, Math.floor((input.offerExpiresAt - nowSec) / 86400));

  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
            <Store className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold">Become a Pontmore Agent</h1>
          <p className="mt-3 text-muted-foreground">
            Log in with your Nostr identity to register as an agent on the
            Pontmore network (PIP-00). Agents publish capabilities and conduct
            swaps, earning commission on every transaction.
          </p>
          <Button asChild className="mt-6">
            <Link to="/">Join PontPay</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const isPublishing = publishRegistration.isPending;
  const isDeleting = deleteRegistration.isPending;

  const handleField = <K extends keyof AgentRegistrationInput>(
    key: K,
    value: AgentRegistrationInput[K],
  ) => setInput((prev) => ({ ...prev, [key]: value }));

  const toggleArrayItem = <T,>(arr: T[], item: T): T[] =>
    arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.name.trim() || !input.price.trim()) {
      setValidationError('Name and price are required.');
      return;
    }
    if (parseFloat(input.faMin) > parseFloat(input.faMax)) {
      setValidationError('Minimum fiat amount cannot exceed maximum.');
      return;
    }
    if (input.offerExpiresAt <= nowSec) {
      setValidationError('Offer expiry must be in the future.');
      return;
    }
    if (input.escrowExpiresAt <= nowSec) {
      setValidationError('Escrow descriptor expiry must be in the future.');
      return;
    }
    if (input.paymentChannels.length === 0) {
      setValidationError('At least one payment channel is required.');
      return;
    }
    if (input.escrowNetworks.length === 0) {
      setValidationError('At least one settlement network is required.');
      return;
    }
    setValidationError(null);
    publishRegistration.mutate(input);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          to="/agents"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to agent directory
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/20">
              <Store className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {isRegistered ? 'Edit Agent Definition' : 'Become a Pontmore Agent'}
              </h1>
              <p className="mt-1 text-muted-foreground">
                PIP-00 agent definition · kind 30360 + NIP-69 offer
              </p>
            </div>
          </div>
        </div>

        {/* Status banner */}
        {isLoading ? (
          <Card className="mb-6">
            <CardContent className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading your registration…</span>
            </CardContent>
          </Card>
        ) : isRegistered && myAgent ? (
          <Card className="mb-6 border-green-500/20 bg-green-500/5">
            <CardContent className="flex items-start gap-3 py-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-600">You are a registered agent</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Your listing is live and discoverable on the Pontmore network.
                  Capabilities: {myAgent.capabilities.join(', ')}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Agent Identity (name/about → kind 0) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Agent Identity</CardTitle>
              <CardDescription>
                Name and about are published in your Nostr profile (kind 0).
                Capabilities are published in the PIP-00 agent definition (kind 30360).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Agent name *</Label>
                <Input
                  id="name"
                  placeholder={profileName || 'e.g. Nairobi Central Exchange'}
                  value={input.name}
                  onChange={(e) => handleField('name', e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="about">About / description</Label>
                <Textarea
                  id="about"
                  placeholder={profileAbout || 'Describe your services, experience, and what makes you a trusted agent.'}
                  value={input.about}
                  onChange={(e) => handleField('about', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                <Tag className="h-4 w-4 shrink-0" />
                <span>Capability: <code className="rounded bg-muted px-1">pontmore/swap@1</code> (published automatically)</span>
              </div>
            </CardContent>
          </Card>

          {/* Escrow Descriptor (PIP-01, kind 30361) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Escrow Descriptor
              </CardTitle>
              <CardDescription>
                PIP-01 escrow descriptor (kind 30361). Customers reference this to
                create coordinations secured by your escrow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="escrowType">Escrow type</Label>
                  <Select
                    value={input.escrowType}
                    onValueChange={(v) => handleField('escrowType', v)}
                  >
                    <SelectTrigger id="escrowType"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ESCROW_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="escrowExpiresAt">Descriptor expiry (days from now)</Label>
                  <Input
                    id="escrowExpiresAt"
                    type="number"
                    min="1"
                    value={escrowExpiryDays}
                    onChange={(e) => handleField('escrowExpiresAt', nowSec + parseInt(e.target.value || '30', 10) * 86400)}
                  />
                </div>
              </div>

              <div>
                <Label>Settlement networks</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {['lightning', 'bitcoin', 'cashu'].map((n) => {
                    const selected = input.escrowNetworks.includes(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleField('escrowNetworks', toggleArrayItem(input.escrowNetworks, n))}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium capitalize transition-all ${
                          selected ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              <div>
                <Label htmlFor="schemaUrl">Service schema URL (optional)</Label>
                <Input
                  id="schemaUrl"
                  className="font-mono text-sm"
                  placeholder="https://example.com/escrow-v1.openapi.json"
                  value={input.serviceSchemaUrl ?? ''}
                  onChange={(e) => handleField('serviceSchemaUrl', e.target.value)}
                />
                {input.serviceSchemaUrl && (
                  <div className="mt-2">
                    <Select
                      value={input.serviceSchemaType || 'openapi'}
                      onValueChange={(v) => handleField('serviceSchemaType', v)}
                    >
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openapi">OpenAPI</SelectItem>
                        <SelectItem value="asyncapi">AsyncAPI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  PIP-01: service contains only a schema pointer. The endpoint and
                  operations are defined by the referenced schema.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* NIP-69 Swap Offer (kind 38383) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Coins className="h-5 w-5" /> Swap Offer (NIP-69)
              </CardTitle>
              <CardDescription>
                Standing offer (kind 38383) advertising your price and fiat-amount
                range for one currency and direction.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="direction">Direction</Label>
                  <Select
                    value={input.direction}
                    onValueChange={(v) => handleField('direction', v as SwapType)}
                  >
                    <SelectTrigger id="direction"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sell">Sell (fiat → BTC, you provide Bitcoin)</SelectItem>
                      <SelectItem value="buy">Buy (BTC → fiat, you provide fiat)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="currency">Fiat currency</Label>
                  <Select
                    value={input.currency}
                    onValueChange={(v) => handleField('currency', v)}
                  >
                    <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ALL_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="price">Price (fiat per BTC)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="e.g. 8500000"
                    value={input.price}
                    onChange={(e) => handleField('price', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="faMin">Min fiat amount</Label>
                  <Input
                    id="faMin"
                    type="number"
                    min="0"
                    value={input.faMin}
                    onChange={(e) => handleField('faMin', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="faMax">Max fiat amount</Label>
                  <Input
                    id="faMax"
                    type="number"
                    min="0"
                    value={input.faMax}
                    onChange={(e) => handleField('faMax', e.target.value)}
                  />
                </div>
              </div>

              <Separator />

              <div>
                <Label>Payment channels</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PAYMENT_CHANNELS.map((ch) => {
                    const selected = input.paymentChannels.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => handleField('paymentChannels', toggleArrayItem(input.paymentChannels, ch))}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-mono transition-all ${
                          selected ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="network">Bitcoin network</Label>
                  <Select
                    value={input.network}
                    onValueChange={(v) => handleField('network', v)}
                  >
                    <SelectTrigger id="network"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BITCOIN_NETWORKS.map((n) => (
                        <SelectItem key={n} value={n} className="capitalize">{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="layer">Settlement layer</Label>
                  <Select
                    value={input.layer}
                    onValueChange={(v) => handleField('layer', v)}
                  >
                    <SelectTrigger id="layer"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SETTLEMENT_LAYERS.map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="offerExpiresAt">Offer expiry (days)</Label>
                  <Input
                    id="offerExpiresAt"
                    type="number"
                    min="1"
                    value={offerExpiryDays}
                    onChange={(e) => handleField('offerExpiresAt', nowSec + parseInt(e.target.value || '7', 10) * 86400)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="resolver">Resolver pubkey (optional, enables disputes)</Label>
                <Input
                  id="resolver"
                  className="font-mono text-sm"
                  placeholder="npub1... or hex pubkey"
                  value={input.resolverPubkey ?? ''}
                  onChange={(e) => handleField('resolverPubkey', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Relays */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5" /> Relay Preferences
              </CardTitle>
              <CardDescription>
                Relays where your agent definition is published and reachable.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {input.relays.map((relay, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={relay}
                      onChange={(e) => {
                        const updated = [...input.relays];
                        updated[i] = e.target.value;
                        handleField('relays', updated);
                      }}
                      className="font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleField('relays', input.relays.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleField('relays', [...input.relays, ''])}
                >
                  Add relay
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Info box */}
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
            <div>
              <p className="font-medium text-foreground">How registration works</p>
              <p className="mt-1">
                Your agent definition (kind 30360) declares the <code className="rounded bg-muted px-1">pontmore/swap@1</code> capability.
                Your escrow descriptor (kind 30361) declares escrow compatibility with an expiry.
                Your NIP-69 offer (kind 38383) advertises your price and fiat range so P2P clients can discover you.
                Name and about are published in your Nostr profile (kind 0).
              </p>
            </div>
          </div>

          {/* Validation error */}
          {validationError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <div className="flex gap-3">
              <Button type="submit" disabled={isPublishing || !input.name.trim() || !input.price.trim()}>
                {isPublishing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Publishing…</>
                ) : (
                  <><Save className="h-4 w-4" /> {isRegistered ? 'Update listing' : 'Publish listing'}</>
                )}
              </Button>

              {isRegistered && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" disabled={isDeleting}>
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <><Trash2 className="h-4 w-4" /> Delete</>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete your agent listing?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This sends a NIP-09 deletion event to relays. Users will
                        no longer find you in the directory. You can re-register
                        at any time.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteRegistration.mutate(input.identifier)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete listing
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {isRegistered && user && input.price && (
                <ShareLinkButton
                  agentNpub={nip19.npubEncode(user.pubkey)}
                  offerDTag={`pontmore/swap@1:${input.currency}:${input.direction === 'sell' ? 'sell' : 'buy'}`}
                  escrowCoordinate={`${30361}:${user.pubkey}:${input.escrowDTag || 'escrow'}`}
                  relays={input.relays.filter(Boolean)}
                />
              )}
            </div>

            <Button asChild variant="ghost">
              <Link to="/agents">
                View directory <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
         </form>
      </div>
    </AppLayout>
  );
}

/** Share link button — copies a shareable agent link to clipboard. */
function ShareLinkButton({ agentNpub, offerDTag, escrowCoordinate, relays }: {
  agentNpub: string;
  offerDTag: string;
  escrowCoordinate: string;
  relays: string[];
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const link = buildFullAgentLink({ agentNpub, offerDTag, escrowCoordinate, relays });
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Failed to copy link');
    }
  };

  return (
    <Button type="button" variant="outline" onClick={handleCopy}>
      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      {copied ? 'Link copied!' : 'Share swap link'}
    </Button>
  );
}
