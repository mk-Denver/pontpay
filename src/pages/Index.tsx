import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import {
  Zap,
  Globe,
  Shield,
  Users,
  TrendingDown,
  ArrowRight,
  CheckCircle2,
  Wallet,
  Store,
  Send,
  Lock,
  Network,
} from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const FEATURES = [
  {
    icon: TrendingDown,
    title: 'Ultra-low fees',
    description:
      'Lightning Network routing means cross-border transfers cost a fraction of traditional remittance services.',
  },
  {
    icon: Zap,
    title: 'Instant finality',
    description:
      'Payments settle in milliseconds. No waiting days for bank clearing — your money moves at the speed of light.',
  },
  {
    icon: Globe,
    title: 'Borderless by design',
    description:
      'Send value anywhere on Earth. No correspondent banks, no intermediary holds, no geographic restrictions.',
  },
  {
    icon: Shield,
    title: 'Self-custodial & secure',
    description:
      'Your keys, your Bitcoin. Nostr identity + Lightning wallets mean you always control your funds.',
  },
];

const STEPS = [
  {
    icon: Wallet,
    title: 'Connect your wallet',
    description:
      'Link an existing Lightning wallet via Nostr Wallet Connect (NWC) or create a new one in seconds.',
  },
  {
    icon: Store,
    title: 'Find an agent',
    description:
      'Browse the decentralized agent directory. Agents convert between BTC and local fiat currencies.',
  },
  {
    icon: Send,
    title: 'Deposit, withdraw, or transfer',
    description:
      'Send fiat to an agent for a BTC deposit, cash out BTC for fiat, or transfer sats peer-to-peer instantly.',
  },
];

export default function Index() {
  const { user } = useCurrentUser();

  useSeoMeta({
    title: 'PontPay — Lightning Agent Network | Cross-Border Payments on Nostr',
    description:
      'An M-Pesa-style agent network powered by Bitcoin Lightning and the Pontmore protocol. Deposit, withdraw, and transfer instantly with ultra-low fees.',
  });

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Nav bar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/20">
              <Zap className="h-5 w-5 text-white" fill="white" />
            </div>
            <span className="text-lg font-bold tracking-tight">PontPay</span>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <Link
                to="/dashboard"
                className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            <LoginArea className="max-w-40" />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute left-1/2 top-0 -z-10 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-br from-orange-500/20 via-amber-500/10 to-transparent blur-3xl" />
          <div className="absolute right-0 top-40 -z-10 h-[400px] w-[400px] rounded-full bg-blue-500/10 blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 pt-20 pb-24 sm:px-6 sm:pt-28 lg:px-8 lg:pt-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/5 px-4 py-1.5 text-sm font-medium text-orange-600">
              <Network className="h-4 w-4" />
              Powered by the Pontmore Protocol
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              The agent network for{' '}
              <span className="bg-gradient-to-r from-orange-500 to-amber-600 bg-clip-text text-transparent">
                borderless Bitcoin
              </span>{' '}
              payments
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              An M-Pesa-style agent network built on Bitcoin Lightning and Nostr.
              Deposit, withdraw, and transfer instantly — with fees so low they
              make traditional remittance obsolete.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <LoginArea className="w-full sm:w-auto" />
              <Link
                to="/agents"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background px-6 py-2.5 text-sm font-medium transition-colors hover:bg-muted sm:w-auto"
              >
                <Store className="h-4 w-4" />
                Browse agents
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Instant settlement
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Self-custodial
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                End-to-end encrypted
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                No bank account needed
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border/40 bg-muted/20 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              How PontPay works
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Three simple steps from sign-up to your first cross-border payment.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative">
                  <div className="absolute -top-4 left-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background p-6 pt-8 shadow-sm transition-all hover:shadow-md">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10">
                      <Icon className="h-6 w-6 text-orange-600" />
                    </div>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Why PontPay
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Built on open protocols. Designed for the people the financial
              system left behind.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-border/60 bg-background p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Protocol section */}
      <section className="border-y border-border/40 bg-gradient-to-b from-muted/20 to-background py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-1.5 text-sm font-medium">
                <Lock className="h-4 w-4 text-primary" />
                The Pontmore Protocol
              </div>
              <h2 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
                Nostr is the messaging layer.
                <br />
                Lightning is the settlement layer.
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Every transaction request, confirmation, and status update is
                transmitted via Nostr relays using the Pontmore protocol —
                end-to-end encrypted with NIP-44. Agents register on a
                decentralized, censorship-resistant directory. Value settles
                instantly on the Lightning Network.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Encrypted transaction messages via NIP-17 / NIP-44',
                  'Decentralized agent directory (kind 33939)',
                  'Nostr Wallet Connect (NIP-47) for wallet control',
                  'No central server — fully peer-to-peer',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                    <span className="text-sm">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative">
              <div className="rounded-2xl border border-border/60 bg-background p-8 shadow-xl">
                <div className="space-y-4">
                  {/* Architecture diagram (simplified) */}
                  <div className="flex items-center justify-between rounded-xl bg-orange-500/5 p-4">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-orange-600" />
                      <span className="text-sm font-medium">User</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Nostr identity</span>
                  </div>
                  <div className="flex justify-center">
                    <ArrowRight className="h-4 w-4 rotate-90 text-muted-foreground" />
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-blue-500/5 p-4">
                    <div className="flex items-center gap-3">
                      <Network className="h-5 w-5 text-blue-600" />
                      <span className="text-sm font-medium">Pontmore Protocol</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Encrypted DMs</span>
                  </div>
                  <div className="flex justify-center">
                    <ArrowRight className="h-4 w-4 rotate-90 text-muted-foreground" />
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-green-500/5 p-4">
                    <div className="flex items-center gap-3">
                      <Store className="h-5 w-5 text-green-600" />
                      <span className="text-sm font-medium">Agent</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Fiat ↔ BTC</span>
                  </div>
                  <div className="flex justify-center">
                    <Zap className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-amber-500/5 p-4">
                    <div className="flex items-center gap-3">
                      <Zap className="h-5 w-5 text-amber-600" fill="currentColor" />
                      <span className="text-sm font-medium">Lightning Network</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Instant settlement</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 to-amber-600 px-8 py-16 text-center shadow-2xl shadow-orange-500/20 sm:px-16">
            <div className="absolute inset-0 -z-10 opacity-20">
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white blur-3xl" />
              <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-white blur-3xl" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to move money differently?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">
              Join the Pontmore agent network. Deposit, withdraw, and transfer
              Bitcoin with the speed of Lightning.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <LoginArea className="w-full sm:w-auto" />
              <Link
                to="/agents"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-orange-600 transition-opacity hover:opacity-90 sm:w-auto"
              >
                Explore the network
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>Secured by Nostr &amp; Lightning</span>
            </div>
            <div className="flex items-center gap-1">
              <span>Vibed with</span>
              <a
                href="https://shakespeare.diy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground hover:text-primary transition-colors"
              >
                Shakespeare
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
