import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import {
  Store,
  Search,
  MapPin,
  Phone,
  Clock,
  Coins,
  BadgeCheck,
  Zap,
  ArrowRight,
  ShieldCheck,
  Plus,
  Users,
  Globe,
  TrendingUp,
  Pencil,
  Store as StoreIcon,
  X,
} from 'lucide-react';
import { AppLayout } from '@/components/Navbar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAgents } from '@/hooks/useAgents';
import { useAgentRegistration } from '@/hooks/useAgentRegistration';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { formatSats } from '@/lib/pontmore';

const CURRENCIES = ['USD', 'KES', 'UGX', 'NGN', 'GHS', 'TZS', 'RWF', 'EUR', 'GBP'];

export default function AgentsPage() {
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState<string>('all');

  const { user } = useCurrentUser();
  const { myAgent, isRegistered } = useAgentRegistration();

  const filters = useMemo(
    () => ({
      search: search || undefined,
      currency: currency === 'all' ? undefined : currency,
    }),
    [search, currency],
  );

  const { agents, allAgents, isLoading } = useAgents(filters);

  // Directory stats
  const stats = useMemo(() => {
    const allCurrencies = new Set<string>();
    const allLocations = new Set<string>();
    let totalLiquidity = 0;

    for (const agent of allAgents) {
      for (const c of agent.currencies) allCurrencies.add(c);
      if (agent.geo) allLocations.add(agent.geo);
      totalLiquidity += agent.liquiditySats;
    }

    return {
      totalAgents: allAgents.length,
      totalCurrencies: allCurrencies.size,
      totalLocations: allLocations.size,
      totalLiquidity,
    };
  }, [allAgents]);

  useSeoMeta({
    title: 'Agent Directory — PontPay',
    description: 'Browse the decentralized Pontmore agent network.',
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Agent Discovery
              </h1>
              <p className="mt-2 text-muted-foreground">
                Decentralized agents that convert between Bitcoin and local fiat
                currencies. Verified on Nostr, available worldwide.
              </p>
            </div>
            {user && (
              <Button asChild className="shrink-0">
                <Link to="/register-agent">
                  {isRegistered ? (
                    <><Pencil className="h-4 w-4" /> Edit my listing</>
                  ) : (
                    <><Plus className="h-4 w-4" /> Become an agent</>
                  )}
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Your listing status */}
        {user && isRegistered && myAgent && (
          <Card className="mb-6 border-green-500/20 bg-green-500/5">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
                <StoreIcon className="h-5 w-5 text-green-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-green-600">Your agent listing is live</p>
                <p className="truncate text-sm text-muted-foreground">
                  <strong>{myAgent.name}</strong>
                  {myAgent.geo ? ` · ${myAgent.geo}` : ''}
                  {myAgent.currencies.length > 0 ? ` · ${myAgent.currencies.join(', ')}` : ''}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/register-agent">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label="Registered agents"
            value={isLoading ? '…' : stats.totalAgents.toString()}
            color="orange"
          />
          <StatCard
            icon={Coins}
            label="Currencies supported"
            value={isLoading ? '…' : stats.totalCurrencies.toString()}
            color="blue"
          />
          <StatCard
            icon={Globe}
            label="Locations"
            value={isLoading ? '…' : stats.totalLocations.toString()}
            color="green"
          />
          <StatCard
            icon={TrendingUp}
            label="Network liquidity"
            value={isLoading ? '…' : formatSats(stats.totalLiquidity)}
            color="amber"
          />
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="search" className="sr-only">
              Search agents
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search by name or location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="w-full sm:w-48">
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue placeholder="All currencies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All currencies</SelectItem>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Agent list */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 px-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                <Store className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-lg font-medium">
                {allAgents.length === 0 ? 'No agents registered yet' : 'No agents found'}
              </p>
              <p className="mt-2 max-w-sm mx-auto text-sm text-muted-foreground">
                {allAgents.length === 0
                  ? 'Be the first agent on the Pontmore network. Register your listing and start earning commission.'
                  : 'No agents match your filters. Try a different search or currency.'}
              </p>
              {user && allAgents.length === 0 && (
                <Button asChild className="mt-4">
                  <Link to="/register-agent">
                    <Plus className="h-4 w-4" /> Register as agent
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              Showing {agents.length} of {allAgents.length} agents
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent) => (
                <Card
                  key={agent.event.id}
                  className="flex flex-col transition-all hover:shadow-md hover:-translate-y-0.5"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-12 w-12 border">
                        <AvatarFallback className="bg-orange-500/10 text-orange-600 font-semibold">
                          {agent.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="truncate font-semibold">{agent.name}</h3>
                          {agent.verificationLevel === 'verified' && (
                            <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500" />
                          )}
                          {myAgent?.event.pubkey === agent.event.pubkey && (
                            <Badge className="shrink-0 bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                              You
                            </Badge>
                          )}
                        </div>
                        {agent.geo && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {agent.geo}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    {agent.bio && (
                      <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                        {agent.bio}
                      </p>
                    )}

                    <div className="space-y-1.5 text-xs">
                      {agent.currencies.length > 0 && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Coins className="h-3.5 w-3.5" />
                          <span>{agent.currencies.join(', ')}</span>
                        </div>
                      )}
                      {agent.rate && agent.rate !== '0' && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Zap className="h-3.5 w-3.5" />
                          <span>{agent.rate}% commission</span>
                        </div>
                      )}
                      {agent.hours && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{agent.hours}</span>
                        </div>
                      )}
                      {agent.phone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5" />
                          <span>{agent.phone}</span>
                        </div>
                      )}
                    </div>

                    {agent.liquiditySats > 0 && (
                      <div className="mt-3 flex items-center gap-1.5 text-xs">
                        <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                        <span className="text-muted-foreground">
                          Liquidity: {formatSats(agent.liquiditySats)}
                        </span>
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t">
                      <Button asChild size="sm" className="w-full">
                        <Link to={`/dashboard?agent=${agent.event.pubkey}`}>
                          Transact with agent
                          <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Bottom CTA */}
        {user && !isRegistered && allAgents.length > 0 && (
          <Card className="mt-8 border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-amber-500/5">
            <CardContent className="flex flex-col items-center gap-4 py-8 text-center sm:flex-row sm:text-left">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
                <Store className="h-6 w-6 text-orange-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">Want to earn commission?</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Register as a Pontmore agent. Convert between Bitcoin and
                  local fiat for users in your area.
                </p>
              </div>
              <Button asChild className="shrink-0">
                <Link to="/register-agent">
                  <Plus className="h-4 w-4" /> Register now
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: 'orange' | 'blue' | 'green' | 'amber';
}) {
  const colors = {
    orange: 'bg-orange-500/10 text-orange-600',
    blue: 'bg-blue-500/10 text-blue-600',
    green: 'bg-green-500/10 text-green-600',
    amber: 'bg-amber-500/10 text-amber-600',
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight truncate">{value}</p>
          <p className="text-xs text-muted-foreground truncate">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
