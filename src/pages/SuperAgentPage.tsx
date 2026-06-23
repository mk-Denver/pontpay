import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  Server,
  Store,
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  Loader2,
  ArrowLeft,
  Shield,
  Zap,
  Coins,
  CheckCircle2,
  AlertTriangle,
  Network,
  ArrowRight,
} from 'lucide-react';
import { AppLayout } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSuperAgent } from '@/hooks/useSuperAgent';

export default function SuperAgentPage() {
  const { user } = useCurrentUser();
  const {
    role,
    setRole,
    isSuperAgent,
    isLocalAgent,
    connection,
    isConnected,
    connectToSuperAgent,
    disconnect,
    localAgentStores,
    createStoreForAgent,
    removeLocalAgentStore,
    isCreatingStore,
    isGeneratingKey,
    payoutConfig,
    updatePayoutConfig,
  } = useSuperAgent();

  // Super Agent setup form
  const [adminServerUrl, setAdminServerUrl] = useState('');
  const [adminApiKey, setAdminApiKey] = useState('');
  const [newStoreName, setNewStoreName] = useState('');

  // Local Agent connection form
  const [localServerUrl, setLocalServerUrl] = useState('');
  const [localApiKey, setLocalApiKey] = useState('');
  const [localStoreId, setLocalStoreId] = useState('');
  const [superAgentPubkey, setSuperAgentPubkey] = useState('');

  // Payout config form
  const [payoutMethod, setPayoutMethod] = useState<'lightning_address' | 'nwc' | 'cashu'>('lightning_address');
  const [lightningAddress, setLightningAddress] = useState('');
  const [nwcUri, setNwcUri] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useSeoMeta({
    title: 'Super Agent — PontPay',
    description: 'Configure BTCPay Server hub-and-spoke architecture.',
  });

  if (!user) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
            <Network className="h-8 w-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold">Super Agent Network</h1>
          <p className="mt-3 text-muted-foreground">
            Log in to configure the BTCPay Server hub-and-spoke architecture.
          </p>
          <Button asChild className="mt-6">
            <Link to="/">Join PontPay</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const handleSuperAgentSetup = () => {
    if (!adminServerUrl.trim() || !adminApiKey.trim()) return;
    setRole('super');
    connectToSuperAgent({
      serverUrl: adminServerUrl.trim(),
      apiKey: adminApiKey.trim(),
      storeId: '', // Super agent doesn't need a specific store
      storeName: 'Super Agent Admin',
    });
  };

  const handleLocalAgentConnect = () => {
    if (!localServerUrl.trim() || !localApiKey.trim() || !localStoreId.trim()) return;
    const payout = lightningAddress.trim()
      ? { method: 'lightning_address' as const, lightningAddress: lightningAddress.trim() }
      : nwcUri.trim()
      ? { method: 'nwc' as const, nwcConnectionString: nwcUri.trim() }
      : undefined;
    setRole('local');
    connectToSuperAgent({
      serverUrl: localServerUrl.trim(),
      apiKey: localApiKey.trim(),
      storeId: localStoreId.trim(),
      superAgentPubkey: superAgentPubkey.trim() || undefined,
      storeName: 'Local Agent Store',
      payout,
    });
  };

  const handleUpdatePayout = () => {
    if (payoutMethod === 'lightning_address' && !lightningAddress.trim()) return;
    if (payoutMethod === 'nwc' && !nwcUri.trim()) return;
    updatePayoutConfig({
      method: payoutMethod,
      lightningAddress: payoutMethod === 'lightning_address' ? lightningAddress.trim() : undefined,
      nwcConnectionString: payoutMethod === 'nwc' ? nwcUri.trim() : undefined,
    });
  };

  const handleCreateStore = () => {
    if (!newStoreName.trim() || !isConnected) return;
    createStoreForAgent.mutate({
      adminConfig: {
        serverUrl: connection!.serverUrl,
        apiKey: connection!.apiKey,
        storeId: connection!.storeId || '',
      },
      agentName: newStoreName.trim(),
      defaultCurrency: 'SATS',
    });
    setNewStoreName('');
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to="/dashboard" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
              <Network className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Super Agent Network</h1>
              <p className="mt-1 text-muted-foreground">
                BTCPay Server hub-and-spoke architecture for agent liquidity.
              </p>
            </div>
          </div>
        </div>

        {/* Architecture explanation */}
        <Card className="mb-6 border-blue-500/20 bg-blue-500/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
              <div className="text-sm">
                <p className="font-medium text-blue-600">Hub-and-Spoke Liquidity Model</p>
                <p className="mt-1 text-muted-foreground">
                  The <strong>Super Agent</strong> operates a BTCPay Server with a funded Lightning node
                  (the Hub). For each <strong>Local Agent</strong>, they create a dedicated Store and issue
                  a scoped API key (the Spokes). Local agents get instant Lightning access without
                  running their own infrastructure. The Super Agent is declared as the
                  <code className="mx-1 rounded bg-muted px-1 text-xs">custody_authority</code>,
                  <code className="mx-1 rounded bg-muted px-1 text-xs">release_authority</code>, and
                  <code className="mx-1 rounded bg-muted px-1 text-xs">refund_authority</code> in the
                  PIP-01 escrow descriptor.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Role selector / status */}
        {isConnected ? (
          <Card className="mb-6 border-green-500/20 bg-green-500/5">
            <CardContent className="flex items-center gap-4 py-4">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-600">
                  Connected as {isSuperAgent ? 'Super Agent' : 'Local Agent'}
                </p>
                <p className="text-sm text-muted-foreground font-mono text-xs">
                  {connection?.serverUrl}
                  {connection?.storeId ? ` · Store: ${connection.storeId.slice(0, 8)}...` : ''}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={disconnect}>Disconnect</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Role selection */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card
                className={role === 'super' ? 'ring-2 ring-blue-500/30' : 'cursor-pointer hover:border-blue-500/30'}
                onClick={() => setRole('super')}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                      <Server className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Super Agent</CardTitle>
                      <CardDescription>I operate a BTCPay Server</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Run the hub. Create stores, issue API keys, provide liquidity and dispute resolution for local agents.
                  </p>
                </CardContent>
              </Card>

              <Card
                className={role === 'local' ? 'ring-2 ring-orange-500/30' : 'cursor-pointer hover:border-orange-500/30'}
                onClick={() => setRole('local')}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
                      <Store className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Local Agent</CardTitle>
                      <CardDescription>I connect to a Super Agent</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Plug into a Super Agent&apos;s BTCPay Server. Get instant Lightning access with a scoped API key.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Super Agent setup */}
            {role === 'super' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><Server className="h-5 w-5 text-blue-600" /> Super Agent Setup</CardTitle>
                  <CardDescription>Enter your BTCPay Server admin credentials.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="server-url">BTCPay Server URL</Label>
                    <Input id="server-url" placeholder="https://btcpay.example.com" value={adminServerUrl} onChange={(e) => setAdminServerUrl(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="admin-key">Admin API Key</Label>
                    <Input id="admin-key" type="password" placeholder="Enter your Greenfield admin API key" value={adminApiKey} onChange={(e) => setAdminApiKey(e.target.value)} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Generate an admin API key in BTCPay Server → Account → API Keys.
                    </p>
                  </div>
                  <Button onClick={handleSuperAgentSetup} disabled={!adminServerUrl.trim() || !adminApiKey.trim()} className="w-full">
                    <Shield className="h-4 w-4" /> Connect as Super Agent
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Local Agent connection */}
            {role === 'local' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base"><Store className="h-5 w-5 text-orange-600" /> Connect to Super Agent</CardTitle>
                  <CardDescription>Enter the credentials provided by your Super Agent.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="local-server">Super Agent&apos;s BTCPay Server URL</Label>
                    <Input id="local-server" placeholder="https://btcpay.example.com" value={localServerUrl} onChange={(e) => setLocalServerUrl(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="local-key">API Key (provided by Super Agent)</Label>
                    <Input id="local-key" type="password" placeholder="Your scoped API key" value={localApiKey} onChange={(e) => setLocalApiKey(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="local-store">Store ID</Label>
                    <Input id="local-store" placeholder="e.g. ABC123..." value={localStoreId} onChange={(e) => setLocalStoreId(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="super-pubkey">Super Agent&apos;s Nostr pubkey (optional)</Label>
                    <Input id="super-pubkey" placeholder="npub1... (for escrow authority)" value={superAgentPubkey} onChange={(e) => setSuperAgentPubkey(e.target.value)} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Used to declare the Super Agent as custody/release/refund authority in your PIP-01 escrow descriptor.
                    </p>
                  </div>

                  <Separator />

                  {/* Payout method selection */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Your wallet / payout method</Label>
                    <p className="text-xs text-muted-foreground">
                      Where should Bitcoin be sent when a swap settles? You can use a Lightning address, connect an NWC wallet, or use your Cashu ecash wallet.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPayoutMethod('lightning_address')}
                        className={`rounded-lg border p-2.5 text-center text-xs font-medium transition-all ${payoutMethod === 'lightning_address' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                      >
                        <Zap className="mx-auto mb-1 h-4 w-4" />
                        Lightning Address
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayoutMethod('nwc')}
                        className={`rounded-lg border p-2.5 text-center text-xs font-medium transition-all ${payoutMethod === 'nwc' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                      >
                        <Server className="mx-auto mb-1 h-4 w-4" />
                        NWC Wallet
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayoutMethod('cashu')}
                        className={`rounded-lg border p-2.5 text-center text-xs font-medium transition-all ${payoutMethod === 'cashu' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                      >
                        <Coins className="mx-auto mb-1 h-4 w-4" />
                        Cashu Wallet
                      </button>
                    </div>

                    {payoutMethod === 'lightning_address' && (
                      <div>
                        <Label htmlFor="ln-address">Your Lightning address</Label>
                        <Input id="ln-address" placeholder="user@blink.sv" value={lightningAddress} onChange={(e) => setLightningAddress(e.target.value)} />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Enter your Lightning address (LNURL). Bitcoin will be sent here when swaps settle.
                        </p>
                      </div>
                    )}
                    {payoutMethod === 'nwc' && (
                      <div>
                        <Label htmlFor="nwc-uri">NWC connection URI</Label>
                        <Input id="nwc-uri" type="password" placeholder="nostr+walletconnect://..." value={nwcUri} onChange={(e) => setNwcUri(e.target.value)} />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Paste your Nostr Wallet Connect URI. Must support <code className="rounded bg-muted px-1">makeInvoice</code>.
                        </p>
                      </div>
                    )}
                    {payoutMethod === 'cashu' && (
                      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                        <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Your Cashu ecash wallet will be used.</p>
                        <p className="mt-1 text-xs">Make sure you have a Cashu wallet set up in the <Link to="/wallet" className="underline">Wallet page</Link>.</p>
                      </div>
                    )}
                  </div>

                  <Button onClick={handleLocalAgentConnect} disabled={!localServerUrl.trim() || !localApiKey.trim() || !localStoreId.trim()} className="w-full">
                    <Zap className="h-4 w-4" /> Connect to Super Agent
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Super Agent: Store management */}
        {isSuperAgent && isConnected && (
          <div className="mt-6 space-y-4">
            <Separator />
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Store className="h-5 w-5" /> Local Agent Stores
            </h2>

            {/* Create new store */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-5 w-5" /> Create Store for Local Agent</CardTitle>
                <CardDescription>
                  Creates a dedicated BTCPay Store and generates a scoped API key for a local agent.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="store-name">Agent / store name</Label>
                  <Input id="store-name" placeholder="e.g. Nairobi Downtown Agent" value={newStoreName} onChange={(e) => setNewStoreName(e.target.value)} />
                </div>
                <Button onClick={handleCreateStore} disabled={!newStoreName.trim() || isCreatingStore} className="w-full">
                  {isCreatingStore ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Creating store…</>
                  ) : isGeneratingKey ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Generating API key…</>
                  ) : (
                    <><Plus className="h-4 w-4" /> Create store & API key</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Store list */}
            {localAgentStores.length > 0 && (
              <div className="space-y-2">
                {localAgentStores.map((store) => (
                  <Card key={store.storeId}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Store className="h-4 w-4 text-muted-foreground" />
                            <p className="font-medium text-sm">{store.name}</p>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono">Store ID: {store.storeId}</p>
                          {store.apiKey && (
                            <div className="flex items-center gap-2 mt-2">
                              <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                                API Key: {store.apiKey.slice(0, 16)}...
                              </code>
                              <Button size="sm" variant="ghost" onClick={() => copyKey(store.apiKey!)}>
                                {copiedKey === store.apiKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          )}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => removeLocalAgentStore(store.storeId)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Onboarding instructions */}
            <Card className="border-dashed">
              <CardContent className="py-4">
                <p className="text-sm font-medium">How to onboard a Local Agent:</p>
                <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  <li><strong className="text-foreground">1.</strong> Create a store for the local agent above.</li>
                  <li><strong className="text-foreground">2.</strong> Share the <strong>Server URL</strong>, <strong>Store ID</strong>, and <strong>API Key</strong> with the local agent.</li>
                  <li><strong className="text-foreground">3.</strong> The local agent opens PontPay → Super Agent → select &ldquo;Local Agent&rdquo; and pastes the credentials.</li>
                  <li><strong className="text-foreground">4.</strong> They can now create Lightning hold invoices through your server.</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Local Agent: connected status */}
        {isLocalAgent && isConnected && (
          <div className="mt-6 space-y-4">
            <Separator />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Zap className="h-5 w-5 text-orange-600" /> Your BTCPay Connection</CardTitle>
                <CardDescription>You are connected to a Super Agent&apos;s server.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Server</span>
                  <code className="font-mono text-xs">{connection?.serverUrl}</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Store ID</span>
                  <code className="font-mono text-xs">{connection?.storeId}</code>
                </div>
                {connection?.superAgentPubkey && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Super Agent pubkey</span>
                    <code className="font-mono text-xs">{connection.superAgentPubkey.slice(0, 20)}...</code>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payout method status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Coins className="h-5 w-5 text-orange-600" /> Payout Method</CardTitle>
                <CardDescription>Where your Bitcoin is sent when swaps settle.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {payoutConfig ? (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      {payoutConfig.method === 'lightning_address' && <Zap className="h-4 w-4 text-amber-500" />}
                      {payoutConfig.method === 'nwc' && <Server className="h-4 w-4 text-blue-500" />}
                      {payoutConfig.method === 'cashu' && <Coins className="h-4 w-4 text-orange-600" />}
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {payoutConfig.method.replace(/_/g, ' ')}
                        </p>
                        {payoutConfig.lightningAddress && (
                          <p className="text-xs text-muted-foreground">{payoutConfig.lightningAddress}</p>
                        )}
                        {payoutConfig.nwcConnectionString && (
                          <p className="text-xs text-muted-foreground">NWC wallet connected</p>
                        )}
                        {payoutConfig.method === 'cashu' && (
                          <p className="text-xs text-muted-foreground">Cashu ecash wallet</p>
                        )}
                      </div>
                    </div>
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Active
                    </Badge>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No payout method configured. Set one below.</p>
                )}

                {/* Update payout method */}
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs">Update payout method</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => setPayoutMethod('lightning_address')}
                      className={`rounded-lg border p-2 text-center text-xs font-medium transition-all ${payoutMethod === 'lightning_address' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                      <Zap className="mx-auto mb-0.5 h-3.5 w-3.5" /> LN Address
                    </button>
                    <button type="button" onClick={() => setPayoutMethod('nwc')}
                      className={`rounded-lg border p-2 text-center text-xs font-medium transition-all ${payoutMethod === 'nwc' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                      <Server className="mx-auto mb-0.5 h-3.5 w-3.5" /> NWC
                    </button>
                    <button type="button" onClick={() => setPayoutMethod('cashu')}
                      className={`rounded-lg border p-2 text-center text-xs font-medium transition-all ${payoutMethod === 'cashu' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                      <Coins className="mx-auto mb-0.5 h-3.5 w-3.5" /> Cashu
                    </button>
                  </div>
                  {payoutMethod === 'lightning_address' && (
                    <Input placeholder="user@blink.sv" value={lightningAddress} onChange={(e) => setLightningAddress(e.target.value)} className="text-sm" />
                  )}
                  {payoutMethod === 'nwc' && (
                    <Input type="password" placeholder="nostr+walletconnect://..." value={nwcUri} onChange={(e) => setNwcUri(e.target.value)} className="text-sm" />
                  )}
                  {payoutMethod === 'cashu' && (
                    <p className="text-xs text-muted-foreground">Uses your Cashu wallet from the <Link to="/wallet" className="underline">Wallet page</Link>.</p>
                  )}
                  <Button size="sm" variant="outline" onClick={handleUpdatePayout} className="w-full">
                    Update payout method
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="flex items-center gap-3 py-4">
                <ArrowRight className="h-5 w-5 text-blue-600" />
                <div className="flex-1 text-sm">
                  <p className="font-medium text-blue-600">Ready to transact</p>
                  <p className="text-muted-foreground">Your swap requests will use BTCPay hold invoices through the Super Agent&apos;s server.</p>
                </div>
                <Button asChild size="sm">
                  <Link to="/dashboard">Go to Dashboard</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
