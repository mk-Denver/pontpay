/**
 * Navbar — shared top navigation for all Pontmore app pages.
 * Shows the brand, primary navigation links, wallet status, and login.
 */

import { Link, useLocation } from 'react-router-dom';
import { Zap, LayoutDashboard, Wallet, Store, History, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoginArea } from '@/components/auth/LoginArea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLightningWallet } from '@/hooks/useLightningWallet';
import { cn } from '@/lib/utils';
import { formatSats } from '@/lib/pontmore';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/agents', label: 'Agents', icon: Store },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/transactions', label: 'History', icon: History },
];

export function Navbar() {
  const location = useLocation();
  const { user } = useCurrentUser();
  const { hasWallet, balance } = useLightningWallet();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/20">
            <Zap className="h-5 w-5 text-white" fill="white" />
          </div>
          <div className="hidden sm:block">
            <span className="text-lg font-bold tracking-tight">PontPay</span>
            <span className="ml-1.5 text-xs text-muted-foreground">Pontmore</span>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const isActive = location.pathname === link.to;
            const Icon = link.icon;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {user && (
            <Link to="/wallet" className="hidden sm:block">
              <Badge
                variant={hasWallet ? 'default' : 'secondary'}
                className={cn(
                  'gap-1.5 rounded-full px-3 py-1.5 font-medium',
                  hasWallet
                    ? 'bg-orange-500/10 text-orange-600 border-orange-500/20'
                    : '',
                )}
              >
                <Zap className="h-3.5 w-3.5" />
                {hasWallet ? formatSats(balance) : 'No wallet'}
              </Badge>
            </Link>
          )}
          <LoginArea className="max-w-40" />
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-border/40 px-4 py-2 md:hidden">
        {NAV_LINKS.map((link) => {
          const isActive = location.pathname === link.to;
          const Icon = link.icon;
          return (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

/** A footer used on app pages. */
export function Footer() {
  return (
    <footer className="border-t border-border/40 py-8 mt-auto">
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
  );
}

/** Layout wrapper with Navbar + Footer. */
export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
