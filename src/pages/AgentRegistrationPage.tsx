import { useSeoMeta } from '@unhead/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Store,
  Zap,
  Save,
  Trash2,
  Loader2,
  CheckCircle2,
  MapPin,
  Coins,
  Phone,
  Clock,
  ArrowLeft,
  Globe,
  Info,
  ArrowRight,
} from 'lucide-react';
import { AppLayout } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import { formatSats } from '@/lib/pontmore';
import type { AgentCapabilities } from '@/lib/pontmore';

const ALL_CURRENCIES = ['USD', 'KES', 'UGX', 'NGN', 'GHS', 'TZS', 'RWF', 'EUR', 'GBP'];
const SWAP_TYPES = ['deposit', 'withdrawal', 'transfer'];
const PAYMENT_CHANNELS = ['cash', 'bank_transfer', 'mobile_money', 'm_pesa', 'ach', 'sepa'];
const SETTLEMENT_NETWORKS = ['lightning', 'bitcoin'];
const REGIONS = [
  'East Africa', 'West Africa', 'Southern Africa', 'North Africa',
  'Europe', 'North America', 'South America', 'Asia', 'Global',
];

function defaultInput(): AgentRegistrationInput {
  return {
    identifier: 'agent',
    name: '',
    about: '',
    capabilities: {
      swapTypes: ['deposit', 'withdrawal'],
      fiatCurrencies: [],
      paymentChannels: ['cash', 'mobile_money'],
      settlementNetworks: ['lightning'],
      regions: [],
      minAmount: 1000,
      maxAmount: 500000,
      pricingMargin: '1.5',
    },
    pricingPolicy: 'percentage_margin',
    fiatCurrencies: [],
    relays: [],
  };
}

export default function AgentRegistrationPage() {
  const { user } = useCurrentUser();
  const { myAgent, isRegistered, isLoading, publishRegistration, deleteRegistration, agentToInput, defaultRelays } =
    useAgentRegistration();

  const [input, setInput] = useState<AgentRegistrationInput>(defaultInput);
  const [loadedExisting, setLoadedExisting] = useState(false);

  useSeoMeta({
    title: 'Register as Agent — PontPay',
    description: 'Register as a Pontmore agent and become discoverable on the network.',
  });

  // Pre-fill form with existing registration + default relays
  useEffect(() => {
    if (myAgent && !loadedExisting) {
      setInput(agentToInput(myAgent));
      setLoadedExisting(true);
    }
  }, [myAgent, loadedExisting, agentToInput]);

  // Set default relays for new registrations
  useEffect(() => {
    if (!isRegistered && input.relays.length === 0 && defaultRelays.length > 0) {
      setInput((prev) => ({ ...prev, relays: defaultRelays }));
    }
  }, [isRegistered, input.relays, defaultRelays]);

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

  const handleCapability = <K extends keyof AgentCapabilities>(
    key: K,
    value: AgentCapabilities[K],
  ) => setInput((prev) => ({
    ...prev,
    capabilities: { ...prev.capabilities, [key]: value },
  }));

  const toggleArrayItem = <T,>(arr: T[], item: T): T[] =>
    arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.name.trim()) return;
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
                PIP-00 agent definition · kind 30360
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
                  Your listing <strong>{myAgent.name}</strong> is live and discoverable
                  on the Pontmore network.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {myAgent.fiatCurrencies.map((c) => (
                    <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                  ))}
                  {myAgent.capabilities.regions.map((r) => (
                    <Badge key={r} variant="outline" className="text-xs">{r}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* PIP-00: Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Agent Identity (PIP-00)</CardTitle>
              <CardDescription>
                Public agent capability and discovery record.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Agent name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. Nairobi Central Exchange"
                  value={input.name}
                  onChange={(e) => handleField('name', e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="about">About / description</Label>
                <Textarea
                  id="about"
                  placeholder="Describe your services, experience, and what makes you a trusted agent."
                  value={input.about}
                  onChange={(e) => handleField('about', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="identifier">Profile identifier (d-tag)</Label>
                  <Input
                    id="identifier"
                    className="font-mono text-sm"
                    placeholder="agent"
                    value={input.identifier}
                    onChange={(e) => handleField('identifier', e.target.value)}
                    disabled={isRegistered}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Usually <code className="rounded bg-muted px-1">agent</code>. Use
                    <code className="rounded bg-muted px-1">agent:ke</code> for regional profiles.
                  </p>
                </div>
                <div>
                  <Label htmlFor="pricing">Pricing policy</Label>
                  <Select
                    value={input.pricingPolicy}
                    onValueChange={(v) => handleField('pricingPolicy', v)}
                  >
                    <SelectTrigger id="pricing">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage_margin">Percentage margin</SelectItem>
                      <SelectItem value="flat_fee">Flat fee per swap</SelectItem>
                      <SelectItem value="tiered">Tiered pricing</SelectItem>
                      <SelectItem value="negotiated">Negotiated per swap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* PIP-00: Capabilities */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Coins className="h-5 w-5" /> Capabilities
              </CardTitle>
              <CardDescription>
                Declare what swap types, currencies, and channels you support.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Swap types */}
              <div>
                <Label>Supported swap types</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SWAP_TYPES.map((type) => {
                    const selected = input.capabilities.swapTypes.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleCapability('swapTypes', toggleArrayItem(input.capabilities.swapTypes, type))}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium capitalize transition-all ${
                          selected ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {type}
                        {selected && <CheckCircle2 className="ml-1 inline h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Fiat currencies */}
              <div>
                <Label>Fiat currencies</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ALL_CURRENCIES.map((c) => {
                    const selected = input.fiatCurrencies.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          handleField('fiatCurrencies', toggleArrayItem(input.fiatCurrencies, c));
                          handleCapability('fiatCurrencies', toggleArrayItem(input.capabilities.fiatCurrencies, c));
                        }}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                          selected ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {c}
                        {selected && <CheckCircle2 className="ml-1 inline h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Payment channels */}
              <div>
                <Label>Payment channels</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PAYMENT_CHANNELS.map((ch) => {
                    const selected = input.capabilities.paymentChannels.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => handleCapability('paymentChannels', toggleArrayItem(input.capabilities.paymentChannels, ch))}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium capitalize transition-all ${
                          selected ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {ch.replace(/_/g, ' ')}
                        {selected && <CheckCircle2 className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Regions */}
              <div>
                <Label className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Regions served
                </Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {REGIONS.map((r) => {
                    const selected = input.capabilities.regions.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => handleCapability('regions', toggleArrayItem(input.capabilities.regions, r))}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                          selected ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {r}
                        {selected && <CheckCircle2 className="ml-1 inline h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Limits */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="minAmount">Min amount (sats)</Label>
                  <Input
                    id="minAmount"
                    type="number"
                    min="1"
                    value={input.capabilities.minAmount || ''}
                    onChange={(e) => handleCapability('minAmount', parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="maxAmount">Max amount (sats)</Label>
                  <Input
                    id="maxAmount"
                    type="number"
                    min="1"
                    value={input.capabilities.maxAmount || ''}
                    onChange={(e) => handleCapability('maxAmount', parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="margin">Margin (%)</Label>
                  <Input
                    id="margin"
                    type="number"
                    step="0.1"
                    min="0"
                    max="20"
                    value={input.capabilities.pricingMargin || ''}
                    onChange={(e) => handleCapability('pricingMargin', e.target.value)}
                  />
                </div>
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
                Your agent definition is published as a Nostr addressable event
                (kind 30360), signed by your Nostr identity and stored on
                decentralized relays. Users discover you via the Pontmore agent
                directory. PontPay uses an in-person exchange model — no escrow
                is required. You can update or delete your listing at any time.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <div className="flex gap-3">
              <Button type="submit" disabled={isPublishing || !input.name.trim()}>
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
