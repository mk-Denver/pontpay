import { useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import AuthDialog from './AuthDialog';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { AccountSwitcher } from './AccountSwitcher';
import { cn } from '@/lib/utils';

export interface LoginAreaProps {
  className?: string;
}

export function LoginArea({ className }: LoginAreaProps) {
  const { currentUser } = useLoggedInAccounts();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  return (
    <div className={cn('inline-flex items-center justify-center', className)}>
      {currentUser ? (
        <AccountSwitcher onAddAccountClick={() => setAuthDialogOpen(true)} />
      ) : (
        <Button
          onClick={() => setAuthDialogOpen(true)}
          className="flex items-center gap-2 px-5 py-2 rounded-full bg-primary text-primary-foreground font-medium transition-all hover:bg-primary/90 animate-scale-in"
        >
          <span className="truncate">Join</span>
        </Button>
      )}

      <AuthDialog
        isOpen={authDialogOpen}
        onClose={() => setAuthDialogOpen(false)}
      />
    </div>
  );
}
