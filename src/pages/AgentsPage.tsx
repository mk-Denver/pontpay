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
import { formatSats } from '@/lib/pontmore';

const CURRENCIES = ['USD', 'KES', 'UGX', 'NGN', 'GHS', 'TZS', 'RWF', 'EUR', 'GBP'];

export default function AgentsPage() {
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState<string>('all');

  const filters = useMemo(
    () => ({
      search: search || undefined,
      currency: currency === 'all' ? undefined : currency,
    }),
    [search, currency],
  );

  const { agents, isLoading } = useAgents(filters);

  useSeoMeta({
    title: 'Agent Directory — PontPay',
    description: 'Browse the decentralized Pontmore agent network.',
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Agent Directory
          </h1>
          <p className="mt-2 text-muted-foreground">
            Decentralized agents that convert between Bitcoin and local fiat
            currencies. Verified on Nostr, available worldwide.
          </p>
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
              <p className="text-lg font-medium">No agents found</p>
              <p className="mt-2 max-w-sm mx-auto text-sm text-muted-foreground">
                No agents match your filters. Try a different search or currency,
                or check back later as the network grows.
              </p>
            </CardContent>
          </Card>
        ) : (
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
        )}
      </div>
    </AppLayout>
  );
}
