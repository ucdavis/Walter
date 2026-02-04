import React, { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { SearchButton } from '@/components/search/SearchButton.tsx';
import { useUser } from '@/shared/auth/UserContext.tsx';

const toTokens = (value: string) =>
  value.replaceAll('.', ' ').trim().split(/\s+/).filter(Boolean);

export const getInitials = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }

  // Common directory-style display name: "Last, First Middle"
  const commaIndex = trimmed.indexOf(',');
  if (commaIndex >= 0) {
    const lastName = trimmed.slice(0, commaIndex);
    const firstNames = trimmed.slice(commaIndex + 1);

    const lastTokens = toTokens(lastName);
    const firstTokens = toTokens(firstNames);

    const firstInitial = firstTokens[0]?.[0] ?? lastTokens[0]?.[0];
    const lastInitial = lastTokens[0]?.[0];

    if (!firstInitial) {
      return '?';
    }
    if (!lastInitial) {
      return firstInitial.toUpperCase();
    }

    return (firstInitial + lastInitial).toUpperCase();
  }

  const tokens = toTokens(trimmed);
  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  const first = tokens[0];
  const last = tokens.at(-1) || '';
  return (first[0] + last[0]).toUpperCase();
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
      <div className="avatar avatar-placeholder">
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
