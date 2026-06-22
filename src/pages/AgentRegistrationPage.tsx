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
  Shield,
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
import { useAgentRegistration, type AgentRegistrationInput } from '@/hooks/useAgentRegistration';
import { formatSats } from '@/lib/pontmore';

const ALL_CURRENCIES = ['USD', 'KES', 'UGX', 'NGN', 'GHS', 'TZS', 'RWF', 'EUR', 'GBP'];
const SERVICE_CATEGORIES = ['deposit', 'withdrawal', 'exchange', 'remittance', 'otc'];

const EMPTY_INPUT: AgentRegistrationInput = {
  identifier: '',
  name: '',
  bio: '',
  geo: '',
  currencies: [],
  rate: '1.5',
  hours: 'Mon-Sun 08:00-20:00',
  phone: '',
  lud16: '',
  minAmount: 1000,
  maxAmount: 500000,
  liquiditySats: 0,
  categories: ['deposit', 'withdrawal'],
};

export default function AgentRegistrationPage() {
  const { user } = useCurrentUser();
  const { myAgent, isRegistered, isLoading, publishRegistration, deleteRegistration, agentToInput } =
    useAgentRegistration();

  const [input, setInput] = useState<AgentRegistrationInput>(EMPTY_INPUT);
  const [loadedExisting, setLoadedExisting] = useState(false);

  useSeoMeta({
    title: 'Register as Agent — PontPay',
    description: 'Register as a Pontmore agent and become discoverable on the network.',
  });

  // Pre-fill the form when the user's existing registration loads
  useEffect(() => {
    if (myAgent && !loadedExisting) {
      setInput(agentToInput(myAgent));
      setLoadedExisting(true);
    }
  }, [myAgent, loadedExisting, agentToInput]);

  // Auto-generate identifier from name for new registrations
  useEffect(() => {
    if (!isRegistered && !input.identifier && input.name) {
      const slug = input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
      setInput((prev) => ({ ...prev, identifier: `pontmore-${slug}` }));
    }
  }, [input.name, input.identifier, isRegistered]);

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
            Pontmore network. Agents convert between Bitcoin and local fiat
            currencies, earning commission on every transaction.
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
  ) => {
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  const toggleCurrency = (currency: string) => {
    setInput((prev) => ({
      ...prev,
      currencies: prev.currencies.includes(currency)
        ? prev.currencies.filter((c) => c !== currency)
        : [...prev.currencies, currency],
    }));
  };

  const toggleCategory = (category: string) => {
    setInput((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.name.trim()) return;
    publishRegistration.mutate(input);
  };

  const handleDelete = () => {
    deleteRegistration.mutate(input.identifier);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back link */}
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
                {isRegistered ? 'Edit Agent Listing' : 'Become a Pontmore Agent'}
              </h1>
              <p className="mt-1 text-muted-foreground">
                {isRegistered
                  ? 'Update your agent registration on the network.'
                  : 'Register and become discoverable to users worldwide.'}
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
                  {myAgent.geo ? ` in ${myAgent.geo}` : ''}.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {myAgent.currencies.map((c) => (
                    <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Registration form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
              <CardDescription>
                This is how users will identify you on the agent directory.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Agent / booth name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. Nairobi Central Exchange"
                  value={input.name}
                  onChange={(e) => handleField('name', e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="bio">Bio / description</Label>
                <Textarea
                  id="bio"
                  placeholder="Describe your services, experience, and what makes you a trusted agent."
                  value={input.bio}
                  onChange={(e) => handleField('bio', e.target.value)}
                  rows={3}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="geo" className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> Location
                  </Label>
                  <Input
                    id="geo"
                    placeholder="e.g. Nairobi, Kenya"
                    value={input.geo}
                    onChange={(e) => handleField('geo', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="phone" className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> Contact phone
                  </Label>
                  <Input
                    id="phone"
                    placeholder="e.g. +254 700 000 000"
                    value={input.phone}
                    onChange={(e) => handleField('phone', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="hours" className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Operating hours
                  </Label>
                  <Input
                    id="hours"
                    placeholder="e.g. Mon-Sun 08:00-20:00"
                    value={input.hours}
                    onChange={(e) => handleField('hours', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="lud16" className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" /> Lightning address
                  </Label>
                  <Input
                    id="lud16"
                    placeholder="e.g. agent@getalby.com"
                    value={input.lud16}
                    onChange={(e) => handleField('lud16', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Currencies & services */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Coins className="h-5 w-5" /> Currencies &amp; Services
              </CardTitle>
              <CardDescription>
                Select which fiat currencies you handle and what services you offer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Supported fiat currencies</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ALL_CURRENCIES.map((c) => {
                    const selected = input.currencies.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleCurrency(c)}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted'
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

              <div>
                <Label>Service categories</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SERVICE_CATEGORIES.map((cat) => {
                    const selected = input.categories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium capitalize transition-all ${
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {cat}
                        {selected && <CheckCircle2 className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Transaction limits & commission */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Transaction Limits &amp; Commission</CardTitle>
              <CardDescription>
                Set your operating parameters. These are visible to users browsing the directory.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="rate">Commission rate (%)</Label>
                  <Input
                    id="rate"
                    type="number"
                    step="0.1"
                    min="0"
                    max="20"
                    placeholder="1.5"
                    value={input.rate}
                    onChange={(e) => handleField('rate', e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your fee as a percentage of each transaction.
                  </p>
                </div>
                <div>
                  <Label htmlFor="liquidity">Lightning liquidity (sats)</Label>
                  <Input
                    id="liquidity"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={input.liquiditySats || ''}
                    onChange={(e) => handleField('liquiditySats', parseInt(e.target.value) || 0)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Self-reported available balance: {formatSats(input.liquiditySats)}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="minAmount">Minimum transaction (sats)</Label>
                  <Input
                    id="minAmount"
                    type="number"
                    min="1"
                    placeholder="1000"
                    value={input.minAmount || ''}
                    onChange={(e) => handleField('minAmount', parseInt(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="maxAmount">Maximum transaction (sats)</Label>
                  <Input
                    id="maxAmount"
                    type="number"
                    min="1"
                    placeholder="500000"
                    value={input.maxAmount || ''}
                    onChange={(e) => handleField('maxAmount', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Identifier (advanced) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Agent Identifier</CardTitle>
              <CardDescription>
                The unique slug used on Nostr. Auto-generated from your name —
                change only if needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Label htmlFor="identifier" className="sr-only">Identifier</Label>
                <div className="flex items-center gap-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4" />
                  <span className="font-mono text-xs">kind:33939 / d:</span>
                </div>
                <Input
                  id="identifier"
                  className="flex-1 font-mono text-sm"
                  placeholder="pontmore-nairobi-central"
                  value={input.identifier}
                  onChange={(e) => handleField('identifier', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  disabled={isRegistered}
                />
              </div>
              {isRegistered && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
                  <Info className="h-3.5 w-3.5" />
                  The identifier cannot be changed for an existing listing (it
                  would create a new registration).
                </p>
              )}
            </CardContent>
          </Card>

          {/* Info box */}
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
            <div>
              <p className="font-medium text-foreground">How registration works</p>
              <p className="mt-1">
                Your agent listing is published as a Nostr addressable event
                (kind 33939) signed by your identity. It&apos;s stored on
                decentralized relays — no central server controls it. Users
                discover you via the Pontmore agent directory. You can update
                or delete your listing at any time.
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
                        no longer find you in the directory. This action cannot
                        be undone (though you can re-register at any time).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
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
