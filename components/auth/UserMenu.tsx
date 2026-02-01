/**
 * UserMenu Component
 *
 * Dropdown menu for authenticated users showing profile and sign out.
 * Shows sign-in button when not authenticated.
 */
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { AuthModal } from './AuthModal';
import { User, LogOut, Cloud, CloudOff } from 'lucide-react';

interface UserMenuProps {
  className?: string;
}

export function UserMenu({ className }: UserMenuProps) {
  const { user, isAuthenticated, isAuthAvailable, signOut, isLoading } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // If Firebase is not configured, don't show anything
  if (!isAuthAvailable) {
    return null;
  }

  // Not authenticated - show sign in button
  if (!isAuthenticated) {
    return (
      <>
        <button
          onClick={() => setAuthModalOpen(true)}
          disabled={isLoading}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--cinema-silver)]/70 hover:text-[var(--cinema-silver)] border border-[var(--cinema-silver)]/20 hover:border-[var(--cinema-silver)]/40 rounded-lg transition-colors ${className}`}
        >
          <CloudOff className="w-4 h-4" />
          <span className="hidden sm:inline">Sign In</span>
        </button>
        <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
      </>
    );
  }

  // Authenticated - show user menu
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--cinema-silver)]/80 hover:text-[var(--cinema-silver)] rounded-lg transition-colors ${className}`}
        >
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User'}
              className="w-6 h-6 rounded-full"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-[var(--cinema-spotlight)]/20 flex items-center justify-center">
              <User className="w-4 h-4 text-[var(--cinema-spotlight)]" />
            </div>
          )}
          <Cloud className="w-3.5 h-3.5 text-emerald-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 bg-[var(--cinema-celluloid)] border-[var(--cinema-silver)]/20"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium text-[var(--cinema-silver)]">
              {user?.displayName || 'User'}
            </p>
            <p className="text-xs text-[var(--cinema-silver)]/60">
              {user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[var(--cinema-silver)]/10" />
        <DropdownMenuItem className="text-[var(--cinema-silver)]/80">
          <Cloud className="w-4 h-4 mr-2 text-emerald-400" />
          <span>Sync enabled</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-[var(--cinema-silver)]/10" />
        <DropdownMenuItem
          onClick={signOut}
          className="text-[var(--cinema-velvet)] focus:text-[var(--cinema-velvet)]"
        >
          <LogOut className="w-4 h-4 mr-2" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserMenu;
