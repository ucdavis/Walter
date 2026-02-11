import React from 'react';
import { Link } from '@tanstack/react-router';
import { SearchButton } from '@/components/search/SearchButton.tsx';
import { UserAvatar } from '@/components/project/UserAvatar.tsx';
import WalterLogo from '@/shared/WalterLogo.tsx';
import { useHasRole, useUser } from '@/shared/auth/UserContext.tsx';

const Header: React.FC = () => {
  const user = useUser();
  const canViewAccruals = useHasRole('AccrualViewer');
  return (
    <header className="bg-light-bg-200 border-b py-4 border-main-border sticky top-0 z-50">
      <div className="container flex items-center justify-between">
        <div className="flex items-center">
          <Link
            aria-label="Walter"
            className="flex items-center gap-2 mr-8"
            to="/"
          >
            <WalterLogo className="w-8 h-8" />
            <h1 className="text-xl">Walter</h1>
          </Link>
          <SearchButton className="w-52 sm:w-64" placeholder="Search…" />
        </div>

        <div className="flex items-center">
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-6">
              <Link
                activeOptions={{ exact: false }}
                className="nav-link"
                params={{ employeeId: user.employeeId }}
                to="/projects/$employeeId"
              >
                Projects
              </Link>

              <Link
                activeOptions={{ exact: false }}
                className="nav-link"
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
          </div>
          <div className="ms-6">
            <UserAvatar />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
