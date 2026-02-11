import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { SearchButton } from '@/components/search/SearchButton.tsx';
import { UserAvatar } from '@/components/project/UserAvatar.tsx';
import WalterLogo from '@/shared/WalterLogo.tsx';
import { useHasRole, useUser } from '@/shared/auth/UserContext.tsx';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

type NavLinkItem = {
  label: string;
  params?: Record<string, any>;
  to: string;
};

function NavLinks({
  className = '',
  linkClassName = 'nav-link',
  links,
  onNavigate,
}: {
  className?: string;
  linkClassName?: string;
  links: NavLinkItem[];
  onNavigate?: () => void;
}) {
  return (
    <div className={className}>
      {links.map((link) => (
        <Link
          activeOptions={{ exact: false }}
          className={linkClassName}
          key={link.label}
          onClick={onNavigate}
          params={link.params}
          to={link.to}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

const Header: React.FC = () => {
  const user = useUser();
  const canViewAccruals = useHasRole('AccrualViewer');

  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuHeight, setMenuHeight] = useState<number>(0);

  const navLinks = useMemo<NavLinkItem[]>(
    () => [
      {
        label: 'Projects',
        params: { employeeId: user.employeeId },
        to: '/projects/$employeeId',
      },
      { label: 'Personnel', to: '/personnel' },
      { label: 'Reports', to: '/reports' },
      ...(canViewAccruals ? [{ label: 'Accruals', to: '/accruals' }] : []),
    ],
    [user.employeeId, canViewAccruals]
  );

  useEffect(() => {
    if (menuRef.current) {
      setMenuHeight(menuRef.current.scrollHeight);
    }
  }, [mobileOpen, canViewAccruals]);

  return (
    <header className="bg-light-bg-200 border-b py-4 border-main-border sticky top-0 z-50">
      <div className="container flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            aria-label="Walter"
            className="flex items-center gap-2 shrink-0"
            to="/"
          >
            <WalterLogo className="w-8 h-8" />
            <h1 className="text-xl hidden md:block">Walter</h1>
          </Link>

          {/* Desktop search */}
          <div className="hidden md:block">
            <SearchButton className="w-52 md:w-64" placeholder="Search…" />
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            <NavLinks className="flex items-center gap-6" links={navLinks} />
          </nav>

          <button
            aria-expanded={mobileOpen}
            aria-label="Toggle menu"
            className="md:hidden p-1 rounded-md focus:outline-none focus:ring-1 focus:ring-offset-1"
            onClick={() => setMobileOpen((v) => !v)}
            type="button"
          >
            {mobileOpen ? (
              <XMarkIcon aria-hidden="true" className="w-6 h-6" />
            ) : (
              <Bars3Icon aria-hidden="true" className="w-6 h-6" />
            )}
          </button>

          <div className="flex-0 ms-4">
            <UserAvatar />
          </div>
        </div>
      </div>

      {/* Mobile slide-down menu */}
      <div
        aria-hidden={!mobileOpen}
        className={`md:hidden bg-light-bg-200 overflow-hidden
          transition-[height,opacity] duration-300 ease-out
          ${mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={{
          height: mobileOpen ? menuHeight : 0,
          opacity: mobileOpen ? 1 : 0,
        }}
        {...(!mobileOpen ? ({ inert: '' } as any) : {})}
      >
        <div className="container py-2 flex flex-col gap-2" ref={menuRef}>
          <NavLinks
            className="flex flex-col gap-2"
            linkClassName="nav-link py-2"
            links={navLinks}
            onNavigate={() => setMobileOpen(false)}
          />

          <div className="pt-1">
            <SearchButton className="w-full" placeholder="Search…" />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
