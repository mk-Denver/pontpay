/**
 * SwapLandingPage — opens from an agent's shareable link.
 *
 * Flow:
 *   1. Parse agent link params (agent npub, offer d-tag, escrow coordinate, relays)
 *   2. If user has no Nostr identity, auto-create one (generate nsec)
 *   3. Fetch the agent's NIP-69 offer and escrow descriptor from relays
 *   4. Display the offer (price, currency, direction, payment channels)
 *   5. Let the customer enter the fiat amount and fiat payment details
 *   6. Create the escrow instance (HTTP API)
 *   7. Show the funding invoice (BOLT11) for the BTC provider to pay externally
 *   8. Poll fund_status until the escrow reaches "active"
 *   9. Only then publish the coordination root and send fiat details via NIP-59
 *
 * Payment details are revealed via NIP-59 gift wrap ONLY when the escrow is active.
 */

import { useSeoMeta } from '@unhead/react';
import { Link, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Zap,
  Store,
  ShieldCheck,
  Loader2,
  Check,
  AlertCircle,
  Copy,
  ArrowDownToLine,
  ArrowUpFromLine,
  Info,
  Coins,
} from 'lucide-react';
import { AppLayout } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useToast } from '@/hooks/useToast';
import { useSwapStateMachine } from '@/hooks/useSwapStateMachine';
import { useSwapMessages } from '@/hooks/useSwapMessages';
import { useEscrowConnection } from '@/hooks/useEscrowConnection';
import { useAuthor } from '@/hooks/useAuthor';
import {
  PONTMORE_OFFER_KIND,
  PONTMORE_ESCROW_KIND,
  parseSwapOffer,
  parsePontmoreEscrow,
  deriveBitcoinAmount,
  formatSats,
  type SwapOffer,
  type SwapType,
} from '@/lib/pontmore';
import {
  parseAgentLink,
  agentNpubToHex,
} from '@/lib/agentLink';
import { generateSecretKey, nip19 } from 'nostr-tools';

const CURRENCIES = ['USD', 'KES', 'UGX', 'NGN', 'GHS', 'TZS', 'RWF', 'EUR', 'GBP'];

type Step = 'loading' | 'no-identity' | 'creating-identity' | 'offer' | 'form' | 'creating-escrow' | 'funding' | 'waiting-escrow' | 'publishing' | 'done' | 'error';

export default function SwapLandingPage() {
  const [searchParams] = useSearchParams();
  const linkParams = useMemo(() => parseAgentLink(searchParams), [searchParams]);
  const { user } = useCurrentUser();
  const { nsec } = useLoginActions();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const { isConnected: isEscrowConnected, connection: escrowConn, connect: connectEscrow, createEscrow, getFundingInstructions, getFundStatus } = useEscrowConnection();
  const { publishCoordinationRoot } = useSwapStateMachine();
  const { sendMessage, hasNip44 } = useSwapMessages();

  const [step, setStep] = useState<Step>('loading');
  const [agentPubkey, setAgentPubkey] = useState<string | null>(null);
  const [offer, setOffer] = useState<SwapOffer | null>(null);
  // Escrow state
  const [escrowId, setEscrowId] = useState<string | null>(null);
  const [fundingInvoice, setFundingInvoice] = useState<string | null>(null);
  const [escrowState, setEscrowState] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copiedInvoice, setCopiedInvoice] = useState(false);

  // Form state
  const [fiatAmount, setFiatAmount] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [paymentChannel, setPaymentChannel] = useState('');
  const [fiatDetails, setFiatDetails] = useState('');
  const [refundAddress, setRefundAddress] = useState('');

  // Coordination state
  const [coordinationId, setCoordinationId] = useState<string | null>(null);

  useSeoMeta({
    title: 'Swap — PontPay',
    description: 'Swap Bitcoin for fiat via a Pontmore agent.',
  });

  // Step 1: Parse link and auto-create identity
  useEffect(() => {
    if (!linkParams) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- error state on invalid link
      setStep('error');
      setStatusMsg('Invalid agent link. Please check the URL.');
      return;
    }

    const hex = agentNpubToHex(linkParams.agentNpub);
    if (!hex) {
      setStep('error');
      setStatusMsg('Invalid agent pubkey in link.');
      return;
    }
    setAgentPubkey(hex);

    if (!user) {
      setStep('no-identity');
    } else {
      setStep('offer');
    }
  }, [linkParams, user]);

  // Auto-create a Nostr identity
  const handleCreateIdentity = useCallback(() => {
    setStep('creating-identity');
    try {
      const sk = generateSecretKey();
      const nsecStr = nip19.nsecEncode(sk);
      nsec(nsecStr);
      toast({ title: 'Identity created', description: 'A new Nostr identity was generated for this swap.' });
      // The user state will update and the effect will move to 'offer' step
    } catch (err) {
      console.error('Identity creation failed:', err);
      setStep('error');
      setStatusMsg('Failed to create Nostr identity.');
    }
  }, [nsec, toast]);

  // Step 2: Fetch the agent's offer and escrow descriptor
  useEffect(() => {
    if (step !== 'offer' || !agentPubkey || !linkParams) return;

    let cancelled = false;

    async function fetchAgentData() {
      if (!linkParams || !agentPubkey) return;
      try {
        const target = linkParams.relays.length > 0 ? nostr.group(linkParams.relays) : nostr;

        // Fetch the NIP-69 offer by author + d-tag
        const offerEvents = await target.query(
          [{ kinds: [PONTMORE_OFFER_KIND], authors: [agentPubkey], '#d': [linkParams.offerDTag], limit: 1 }],
          { signal: AbortSignal.timeout(10000) },
        );

        if (cancelled) return;

        if (offerEvents.length > 0) {
          const parsed = parseSwapOffer(offerEvents[0]);
          if (parsed) {
            setOffer(parsed);
            setCurrency(parsed.f);
            if (parsed.channels.length > 0) setPaymentChannel(parsed.channels[0]);
          }
        }

        // Fetch the escrow descriptor
        const parts = linkParams.escrowCoordinate.split(':');
        if (parts.length >= 3) {
          const escrowPubkey = parts[1];
          const escrowDTag = parts[2];

          const escrowEvents = await target.query(
            [{ kinds: [PONTMORE_ESCROW_KIND], authors: [escrowPubkey], '#d': [escrowDTag], limit: 1 }],
            { signal: AbortSignal.timeout(10000) },
          );

          if (cancelled) return;

          if (escrowEvents.length > 0) {
            const escrow = parsePontmoreEscrow(escrowEvents[0]);
            if (escrow?.service?.schema?.url) {
              // Auto-connect to the escrow if not already connected
              if (!isEscrowConnected) {
                await connectEscrow(escrow);
              }
            }
          }
        }

        if (!cancelled) setStep('form');
      } catch (err) {
        if (!cancelled) {
          console.error('Agent data fetch failed:', err);
          setStep('error');
          setStatusMsg('Failed to fetch agent data from relays.');
        }
      }
    }

    fetchAgentData();
    return () => { cancelled = true; };
  }, [step, agentPubkey, linkParams, nostr, isEscrowConnected, connectEscrow]);

  // Step 3: Poll escrow fund_status until active
  useEffect(() => {
    if (step !== 'waiting-escrow' || !escrowId) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const status = await getFundStatus(escrowId);
        if (cancelled) return;
        setEscrowState(status.state);

        if (status.state === 'active' || status.state === 'release_pending') {
          setStep('publishing');
        } else if (status.state === 'canceled' || status.state === 'refunded') {
          setStep('error');
          setStatusMsg(`Escrow ${status.state}. The swap was cancelled.`);
        } else {
          // Keep polling
          setTimeout(poll, 5000);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Fund status poll failed:', err);
          setTimeout(poll, 10000);
        }
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [step, escrowId, getFundStatus]);

  // Step 4: Publish coordination root + send fiat details via NIP-59
  useEffect(() => {
    if (step !== 'publishing' || !escrowId || !agentPubkey || !offer || !linkParams || !user) return;

    let cancelled = false;

    async function publishAndReveal() {
      const currentOffer = offer;
      const currentLink = linkParams;
      const currentUser = user;
      if (!currentOffer || !currentLink || !currentUser || !agentPubkey) return;
      try {
        setStatusMsg('Publishing coordination root…');
        const bitcoinAmount = deriveBitcoinAmount(fiatAmount, currentOffer.price);
        const swapType: SwapType = currentOffer.k === 'sell' ? 'buy' : 'sell';
        const myPubkey = currentUser.pubkey;

        const parts = currentLink.escrowCoordinate.split(':');
        const escrowPubkey = parts[1] ?? '';

        const coordId = await publishCoordinationRoot.mutateAsync({
          swapType,
          agentPubkey,
          customerPubkey: myPubkey,
          escrowPubkey,
          escrowDescriptorId: '',
          escrowDescriptorCoordinate: currentLink.escrowCoordinate,
          resolverPubkey: currentOffer.resolverPubkey || undefined,
          fiatCurrency: currency,
          fiatAmount,
          bitcoinAmount,
          bitcoinNetwork: currentOffer.layer || 'lightning',
          paymentChannel: paymentChannel || currentOffer.channels[0] || 'unknown',
        });

        if (cancelled) return;
        setCoordinationId(coordId);

        // Send fiat payment details via NIP-59 gift wrap — only now that escrow is active
        if (hasNip44 && fiatDetails) {
          setStatusMsg('Sending fiat payment details via NIP-59 gift wrap…');
          await sendMessage.mutateAsync({
            swapId: coordId,
            recipientPubkey: agentPubkey,
            payloadType: 'bank_details',
            data: fiatDetails,
            label: 'Fiat payment details',
          });
        }

        if (!cancelled) setStep('done');
      } catch (err) {
        if (!cancelled) {
          console.error('Publishing failed:', err);
          setStep('error');
          setStatusMsg('Failed to publish coordination. Please try again.');
        }
      }
    }

    publishAndReveal();
    return () => { cancelled = true; };
  }, [step, escrowId, agentPubkey, offer, linkParams, user, fiatAmount, currency, paymentChannel, fiatDetails, hasNip44, publishCoordinationRoot, sendMessage]);

  // Handle form submit — create escrow
  const handleSubmit = async () => {
    if (!fiatAmount || !offer || !isEscrowConnected) return;
    setStep('creating-escrow');
    setStatusMsg('Creating escrow instance…');

    try {
      const bitcoinAmount = deriveBitcoinAmount(fiatAmount, offer.price);
      const swapType: SwapType = offer.k === 'sell' ? 'buy' : 'sell';

      // The BTC provider funds the escrow. For buy (fiat_to_btc), the agent provides BTC.
      // For sell (btc_to_fiat), the customer provides BTC.
      // In both cases, the escrow holds the BTC amount.

      const result = await createEscrow({
        amount_sats: parseInt(bitcoinAmount, 10),
        description: `Pontmore ${swapType} ${bitcoinAmount} sats — ${fiatAmount} ${currency}`,
        refund_ln_address: refundAddress || undefined,
        funding_model: '1_of_2',
      });

      setEscrowId(result.escrow_id);

      // Get funding instructions
      setStatusMsg('Getting funding invoice…');
      const funding = await getFundingInstructions(result.escrow_id);
      setFundingInvoice(funding.payment_request);

      // Move to funding step — user pays the invoice externally
      setStep('funding');
    } catch (err) {
      console.error('Escrow creation failed:', err);
      setStep('error');
      setStatusMsg('Failed to create escrow instance.');
    }
  };

  // User confirms they've paid the invoice — start polling
  const handleConfirmPaid = () => {
    setStep('waiting-escrow');
  };

  const handleCopyInvoice = async () => {
    if (!fundingInvoice) return;
    try {
      await navigator.clipboard.writeText(fundingInvoice);
      setCopiedInvoice(true);
      setTimeout(() => setCopiedInvoice(false), 2000);
    } catch {
      console.error('Failed to copy invoice');
    }
  };

  // ─── Render ─────────────────────────────────────────────────────

  if (step === 'error') {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="mt-3 text-muted-foreground">{statusMsg}</p>
          <Button asChild className="mt-6"><Link to="/dashboard">Go to dashboard</Link></Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ─── Step: No identity ─── */}
        {step === 'no-identity' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/20">
                  <Zap className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle>Welcome to PontPay</CardTitle>
                  <CardDescription>Create a Nostr identity to start swapping</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You've been invited to swap with a Pontmore agent. To get started,
                we'll create a new Nostr identity for you. This identity signs
                your swap transactions on the Nostr network.
              </p>
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className="text-amber-600">
                  Your private key will be stored in this browser. For larger
                  swaps, consider using a Nostr extension or hardware signer.
                </p>
              </div>
              <Button onClick={handleCreateIdentity} className="w-full" size="lg">
                <Zap className="h-5 w-5" /> Create identity & continue
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── Step: Creating identity ─── */}
        {step === 'creating-identity' && (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Creating your Nostr identity…</p>
          </div>
        )}

        {/* ─── Step: Loading agent data ─── */}
        {step === 'offer' && (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Loading agent details from relays…</p>
          </div>
        )}

        {/* ─── Step: Swap form ─── */}
        {(step === 'form' || step === 'creating-escrow') && offer && (
          <div className="space-y-6">
            <AgentHeader agentPubkey={agentPubkey} offer={offer} />

            {/* Offer card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {offer.k === 'sell' ? <ArrowDownToLine className="h-5 w-5 text-green-600" /> : <ArrowUpFromLine className="h-5 w-5 text-orange-600" />}
                  {offer.k === 'sell' ? 'Buy Bitcoin' : 'Sell Bitcoin'}
                </CardTitle>
                <CardDescription>
                  {offer.k === 'sell' ? 'Send fiat, receive Bitcoin via escrow' : 'Fund escrow with Bitcoin, receive fiat'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3 text-sm">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-mono font-medium">{Number(offer.price).toLocaleString(undefined, { maximumFractionDigits: 8 })} {offer.f}/BTC</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3 text-sm">
                  <span className="text-muted-foreground">Fiat range</span>
                  <span>{offer.faMin} – {offer.faMax} {offer.f}</span>
                </div>
                {offer.pm.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {offer.pm.map((p) => <Badge key={p} variant="outline" className="text-xs font-mono">{p}</Badge>)}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Escrow badge */}
            {escrowConn && (
              <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-sm">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                <span className="text-green-600 font-medium">Escrow secured</span>
                <span className="text-muted-foreground text-xs">{escrowConn.endpoint}</span>
              </div>
            )}

            {/* Swap form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Start swap</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="amount">Fiat amount</Label>
                    <Input id="amount" type="number" placeholder={offer.faMin} value={fiatAmount} onChange={(e) => setFiatAmount(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="currency">Currency</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
                      <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                {fiatAmount && offer.price && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm">
                    <Coins className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">
                      Bitcoin: <strong className="text-foreground">{formatSats(deriveBitcoinAmount(fiatAmount, offer.price))}</strong>
                    </span>
                  </div>
                )}

                {offer.channels.length > 0 && (
                  <div>
                    <Label htmlFor="channel">Payment channel</Label>
                    <Select value={paymentChannel} onValueChange={setPaymentChannel}>
                      <SelectTrigger id="channel"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {offer.channels.map((ch) => <SelectItem key={ch} value={ch} className="font-mono text-sm">{ch}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label htmlFor="fiat-details">
                    {offer.k === 'sell' ? 'Fiat payment details' : 'Fiat receiving details'}
                  </Label>
                  <Textarea
                    id="fiat-details"
                    placeholder={offer.k === 'sell' ? 'e.g. M-Pesa send to +254712345678' : 'e.g. Bank transfer — KCB 0123...'}
                    value={fiatDetails}
                    onChange={(e) => setFiatDetails(e.target.value)}
                    rows={2}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sent to the agent via NIP-59 gift wrap only after the escrow is funded.
                  </p>
                </div>

                <div>
                  <Label htmlFor="refund">Refund Lightning Address (optional)</Label>
                  <Input
                    id="refund"
                    placeholder="you@walletofsatoshi.com"
                    value={refundAddress}
                    onChange={(e) => setRefundAddress(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Where the escrow sends a refund if the swap is cancelled.</p>
                </div>

                {statusMsg && (
                  <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" /> {statusMsg}
                  </div>
                )}

                <Button
                  onClick={handleSubmit}
                  disabled={step === 'creating-escrow' || !fiatAmount || !isEscrowConnected}
                  className="w-full"
                  size="lg"
                >
                  {step === 'creating-escrow' ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Creating escrow…</>
                  ) : (
                    <><ShieldCheck className="h-4 w-4" /> Create escrow & start swap</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── Step: Funding — show invoice for external payment ─── */}
        {step === 'funding' && fundingInvoice && (
          <div className="space-y-6">
            <AgentHeader agentPubkey={agentPubkey} offer={offer} />

            <Card className="border-orange-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Zap className="h-5 w-5 text-orange-600" /> Fund the escrow
                </CardTitle>
                <CardDescription>
                  Pay this Lightning invoice from your external wallet to fund the escrow.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="mb-2 text-xs text-muted-foreground">Lightning invoice (BOLT11)</p>
                  <code className="block break-all text-xs">{fundingInvoice}</code>
                </div>
                <Button onClick={handleCopyInvoice} variant="outline" className="w-full">
                  {copiedInvoice ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedInvoice ? 'Copied to clipboard' : 'Copy invoice'}
                </Button>
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <p className="text-amber-600">
                    Open your Lightning wallet, paste this invoice, and pay it.
                    Once the escrow confirms the payment, fiat payment details
                    will be exchanged automatically.
                  </p>
                </div>
                <Button onClick={handleConfirmPaid} className="w-full" size="lg">
                  <Check className="h-4 w-4" /> I've paid the invoice — continue
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── Step: Waiting for escrow ─── */}
        {step === 'waiting-escrow' && (
          <div className="space-y-6">
            <AgentHeader agentPubkey={agentPubkey} offer={offer} />

            <Card>
              <CardContent className="flex flex-col items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-sm font-medium">Waiting for escrow confirmation…</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The escrow is checking your payment. This usually takes a few seconds.
                </p>
                {escrowState && (
                  <Badge variant="outline" className="mt-4">Escrow state: {escrowState}</Badge>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── Step: Publishing coordination ─── */}
        {step === 'publishing' && (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm font-medium">{statusMsg || 'Publishing coordination…'}</p>
            <p className="mt-1 text-xs text-muted-foreground">Sending fiat payment details via NIP-59 gift wrap.</p>
          </div>
        )}

        {/* ─── Step: Done ─── */}
        {step === 'done' && (
          <div className="space-y-6">
            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="flex flex-col items-center py-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500/10">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold">Swap coordination proposed!</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  The escrow is funded and the coordination root is on the Nostr network.
                  Fiat payment details have been sent to the agent via NIP-59 gift wrap.
                  The agent will accept and process your swap.
                </p>
                {coordinationId && (
                  <div className="mt-4 rounded-lg bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Coordination ID</p>
                    <code className="text-xs">{coordinationId.slice(0, 24)}…</code>
                  </div>
                )}
                <div className="mt-6 flex gap-3">
                  <Button asChild variant="outline"><Link to="/transactions">View swap history</Link></Button>
                  <Button asChild><Link to="/dashboard">Dashboard</Link></Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

/** Agent header with profile name from kind 0. */
function AgentHeader({ agentPubkey, offer }: { agentPubkey: string | null; offer: SwapOffer | null }) {
  const { data: authorData } = useAuthor(agentPubkey ?? undefined);
  const name = authorData?.metadata?.name ?? (agentPubkey ? `${agentPubkey.slice(0, 12)}…` : 'Agent');
  const picture = authorData?.metadata?.picture;

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10 overflow-hidden">
        {picture ? (
          <img src={picture} alt={name} className="h-full w-full object-cover" />
        ) : (
          <Store className="h-6 w-6 text-orange-600" />
        )}
      </div>
      <div>
        <h2 className="text-lg font-bold">{name}</h2>
        {offer && (
          <p className="text-sm text-muted-foreground">
            {Number(offer.price).toLocaleString(undefined, { maximumFractionDigits: 8 })} {offer.f}/BTC
          </p>
        )}
      </div>
    </div>
  );
}
