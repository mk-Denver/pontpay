import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  ShieldCheck,
  Server,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  Globe,
  Zap,
  ArrowRight,
  RefreshCw,
  FileJson,
  Clock,
} from 'lucide-react';
import { AppLayout } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEscrowDiscovery } from '@/hooks/useEscrowDiscovery';
import { useEscrowConnection } from '@/hooks/useEscrowConnection';
import { RelaySelector, useDiscoveryRelays } from '@/components/RelaySelector';

export default function EscrowPage() {
  const { user } = useCurrentUser();
  const { selectedRelays } = useDiscoveryRelays();

  const { escrows, isLoading, refetch } = useEscrowDiscovery(selectedRelays);
  const { connection, isConnected, isConnecting, connect, disconnect } = useEscrowConnection();
  const [connectingId, setConnectingId] = useState<string | null>(null);

  useSeoMeta({
    title: 'Escrow Discovery — PontPay',
    description: 'Discover escrow services published on Nostr and connect to them.',
  });

  const handleConnect = async (escrow: Parameters<typeof connect>[0]) => {
    setConnectingId(escrow.event.id);
    try {
      await connect(escrow);
    } finally {
      setConnectingId(null);
    }
  };

  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
            <ShieldCheck className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold">Escrow Discovery</h1>
          <p className="mt-3 text-muted-foreground">
            Log in with your Nostr identity to discover and connect to escrow services.
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
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to="/dashboard" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Escrow Discovery</h1>
              <p className="mt-1 text-muted-foreground">
                Discover escrow services published on Nostr (PIP-01, kind 30361) and connect to them.
              </p>
            </div>
          </div>
        </div>

        {/* Connected status */}
        {isConnected && connection ? (
          <Card className="mb-6 border-green-500/20 bg-green-500/5">
            <CardContent className="flex items-center gap-4 py-4">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-600">Connected to escrow</p>
                <p className="text-sm text-muted-foreground font-mono text-xs">{connection.endpoint}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-xs">{connection.escrowType}</Badge>
                  <Badge variant="outline" className="text-xs">{connection.schemaType} schema</Badge>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={disconnect}>Disconnect</Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6 border-blue-500/20 bg-blue-500/5">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Server className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <div className="text-sm">
                  <p className="font-medium text-blue-600">No escrow connected</p>
                  <p className="mt-1 text-muted-foreground">
                    Browse the escrow directory below and click <strong>Connect</strong> on a
                    service that advertises a schema URL. Once connected, your swap requests will
                    use that escrow for custody and settlement.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Relay selector */}
        <RelaySelector />

        {/* Refresh + heading */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Discovered Escrows</h2>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading || selectedRelays.length === 0}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        {/* Escrow list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : escrows.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center">
              <p className="text-sm text-muted-foreground">
                {selectedRelays.length === 0
                  ? 'Select at least one relay above to discover escrows.'
                  : 'No escrow descriptors found on the selected relays. Try different relays, or '}
                {selectedRelays.length > 0 && (
                  <><Link to="/register-agent" className="underline">publish your own</Link>.</>
                )}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {escrows.map((escrow) => {
              const hasService = !!escrow.service?.schema?.url;
              const isActive = connection?.pubkey === escrow.event.pubkey && connection?.d === escrow.d;
              const isConnectingThis = connectingId === escrow.event.id;
              return (
                <Card key={escrow.event.id} className={isActive ? 'ring-2 ring-green-500/30' : ''}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                          <p className="font-medium text-sm capitalize">{escrow.escrowType?.replace(/_/g, ' ') || 'Unknown escrow type'}</p>
                          {hasService ? (
                            <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                              <Globe className="mr-1 h-3 w-3" /> Standalone
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Discovery only</Badge>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground font-mono">{escrow.event.pubkey.slice(0, 20)}…</p>

                        {/* PIP-01: expiry */}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          <span>
                            {escrow.expiresAt > Date.now() / 1000 ? (
                              <>Expires: <strong className="text-foreground">{new Date(escrow.expiresAt * 1000).toLocaleDateString()}</strong></>
                            ) : (
                              <span className="text-red-600 font-medium">Expired</span>
                            )}
                          </span>
                        </div>

                        {/* Networks */}
                        <div className="flex flex-wrap gap-1.5">
                          {escrow.networks.map((n) => (
                            <Badge key={n} variant="outline" className="text-xs capitalize">{n}</Badge>
                          ))}
                        </div>

                        {/* Service schema info */}
                        {hasService && escrow.service?.schema && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <FileJson className="h-3.5 w-3.5" />
                            <Badge variant="outline" className="text-xs">{escrow.service.schema.type}</Badge>
                            <span className="font-mono truncate">{escrow.service.schema.url}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        {hasService ? (
                          isActive ? (
                            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
                            </Badge>
                          ) : (
                            <Button size="sm" onClick={() => handleConnect(escrow)} disabled={isConnecting || isConnectingThis}>
                              {isConnectingThis ? (
                                <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</>
                              ) : (
                                <><Zap className="h-4 w-4" /> Connect</>
                              )}
                            </Button>
                          )
                        ) : (
                          <Badge variant="secondary" className="text-xs">No schema</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Next step */}
        {isConnected && (
          <Card className="mt-6 border-blue-500/20 bg-blue-500/5">
            <CardContent className="flex items-center gap-3 py-4">
              <ArrowRight className="h-5 w-5 text-blue-600" />
              <div className="flex-1 text-sm">
                <p className="font-medium text-blue-600">Ready to transact</p>
                <p className="text-muted-foreground">Your swap requests will use this escrow service for custody and settlement.</p>
              </div>
              <Button asChild size="sm"><Link to="/dashboard">Go to Dashboard</Link></Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}