import React, { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { SearchButton } from '@/components/search/SearchButton.tsx';
import { UserAvatar } from '@/components/project/UserAvatar.tsx';
import WalterLogo from '@/shared/walterLogo.tsx';
import { useHasRole, useUser } from '@/shared/auth/UserContext.tsx';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

const Header: React.FC = () => {
  const user = useUser();
  const canViewAccruals = useHasRole('AccrualViewer');

  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuHeight, setMenuHeight] = useState<number>(0);

  const linkTabIndex = mobileOpen ? 0 : -1;

  useEffect(() => {
    if (menuRef.current) {
      setMenuHeight(menuRef.current.scrollHeight);
    }
  }, [mobileOpen, canViewAccruals]);

  return (
    <header className="bg-light-bg-200 border-b py-4 border-main-border sticky top-0 z-50">
      <div className="container flex items-center justify-between">
        {/* Left side */}
        <div className="flex items-center gap-4 min-w-0">
          <Link
            aria-label="Walter"
            className="flex items-center gap-2 flex-shrink-0"
            to="/"
          >
            <WalterLogo className="w-8 h-8" />
            <h1 className="text-xl hidden sm:block">Walter</h1>
          </Link>

          {/* Desktop search */}
          <div className="hidden sm:block">
            <SearchButton className="w-52 sm:w-64" placeholder="Search…" />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-6">
            <Link
              activeOptions={{ exact: false }}
              className="nav-link"
              linkTabIndex={linkTabIndex}
              params={{ employeeId: user.employeeId }}
              to="/projects/$employeeId"
            >
              Projects
            </Link>

            <Link
              activeOptions={{ exact: false }}
              className="nav-link"
              linkTabIndex={linkTabIndex}
              to="/personnel"
            >
              Personnel
            </Link>

            <Link
              activeOptions={{ exact: false }}
              className="nav-link"
              linkTabIndex={linkTabIndex}
              to="/reports"
            >
              Reports
            </Link>

            {canViewAccruals && (
              <Link
                activeOptions={{ exact: false }}
                className="nav-link"
                to="/accruals"
              >
                Accruals
              </Link>
            )}
          </nav>

          <button
            aria-expanded={mobileOpen}
            aria-label="Toggle menu"
            className="sm:hidden p-1 rounded-md focus:outline-none focus:ring-1 focus:ring-offset-1"
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
        className={`sm:hidden bg-light-bg-200 overflow-hidden
    transition-[height,opacity] duration-300 ease-out
    ${mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        style={{
          height: mobileOpen ? menuHeight : 0,
          opacity: mobileOpen ? 1 : 0,
        }}
        {...(!mobileOpen ? ({ inert: '' } as any) : {})}
      >
        <div className="container py-2 flex flex-col gap-2" ref={menuRef}>
          <Link
            activeOptions={{ exact: false }}
            className="nav-link py-2"
            onClick={() => setMobileOpen(false)}
            params={{ employeeId: user.employeeId }}
            to="/projects/$employeeId"
          >
            Projects
          </Link>

          <Link
            activeOptions={{ exact: false }}
            className="nav-link py-2"
            onClick={() => setMobileOpen(false)}
            to="/personnel"
          >
            Personnel
          </Link>

          <Link
            activeOptions={{ exact: false }}
            className="nav-link py-2"
            onClick={() => setMobileOpen(false)}
            to="/reports"
          >
            Reports
          </Link>

          {canViewAccruals && (
            <Link
              activeOptions={{ exact: false }}
              className="nav-link py-2"
              onClick={() => setMobileOpen(false)}
              to="/accruals"
            >
              Accruals
            </Link>
          )}

          <div className="pt-1">
            <SearchButton className="w-full" placeholder="Search…" />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
