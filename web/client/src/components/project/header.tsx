import React, { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { SearchButton } from '@/components/search/SearchButton.tsx';
import { useUser } from '@/shared/auth/UserContext.tsx';

const getInitials = (name: string) => {
  const cleaned = name.replaceAll(',', ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const UserAvatar: React.FC = () => {
  const user = useUser();
  const initials = useMemo(
    () => getInitials(user.name || user.kerberos || ''),
    [user.name, user.kerberos]
  );
  const [showPhoto, setShowPhoto] = useState(true);

  if (!showPhoto) {
    return (
      <div className="avatar placeholder">
        <div className="bg-neutral text-neutral-content w-10 rounded-full">
          <span>{initials}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="avatar">
      <div className="w-10 rounded-full">
        <img
          alt="User avatar"
          decoding="async"
          loading="lazy"
          onError={() => setShowPhoto(false)}
          src="/api/user/me/photo"
        />
      </div>
    </div>
  );
};

const Header: React.FC = () => {
  return (
    <header className="bg-light-bg-200 border-b py-4 border-main-border sticky top-0 z-50">
      <div className="container flex items-center justify-between">
        <div className="flex items-center">
          <Link className="flex items-center gap-2 mr-8" to="/">
            <img alt="Dog outline logo" className="w-6" src="/walter.svg" />
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
                to="/projects"
              >
                Projects
              </Link>

              <Link
                activeOptions={{ exact: false }}
                className="nav-link"
                to="/personnel"
              >
                Personnel
              </Link>

              <Link
                activeOptions={{ exact: false }}
                className="nav-link"
                to="/reports"
              >
                Reports
              </Link>

              <Link
                activeOptions={{ exact: false }}
                className="nav-link"
                to="/accruals"
              >
                Accruals
              </Link>
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
