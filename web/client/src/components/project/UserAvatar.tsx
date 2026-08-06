import React, { useMemo, useState } from 'react';
import { IdentificationIcon } from '@heroicons/react/24/outline';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { useUser } from '@/shared/auth/UserContext.tsx';

const toTokens = (value: string) =>
  value.replaceAll('.', ' ').trim().split(/\s+/).filter(Boolean);

export const isLocalLoopbackHost = (hostname: string) => {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
};

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
  if (tokens.length === 0) {
    return '?';
  }

  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  const first = tokens[0];
  const last = tokens.at(-1) || '';
  return (first[0] + last[0]).toUpperCase();
};

export const UserAvatar: React.FC = () => {
  const user = useUser();
  const initials = useMemo(
    () => getInitials(user.name || user.kerberos || ''),
    [user.name, user.kerberos]
  );
  const [showPhoto, setShowPhoto] = useState(true);
  const userName = user.name || user.kerberos || '';
  const hoverName = user.isEmulating ? `Emulating ${userName}` : userName;
  const shouldLinkToLogin =
    !user.isEmulating &&
    typeof window !== 'undefined' &&
    isLocalLoopbackHost(window.location.hostname);

  const avatar = user.isEmulating ? (
    <div className="avatar avatar-placeholder">
      <div
        aria-label={hoverName}
        className="bg-warning text-warning-content flex w-10 items-center justify-center rounded-full"
        role="img"
      >
        <IdentificationIcon aria-hidden="true" className="h-6 w-6" />
      </div>
    </div>
  ) : !showPhoto ? (
    <div className="avatar avatar-placeholder">
      <div className="bg-neutral text-neutral-content w-10 rounded-full">
        <span>{initials}</span>
      </div>
    </div>
  ) : (
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

  const avatarContent = shouldLinkToLogin ? (
    <a aria-label="Open local login chooser" href="/login">
      {avatar}
    </a>
  ) : (
    avatar
  );

  return (
    <TooltipLabel
      asChild={shouldLinkToLogin}
      label={avatarContent}
      labelClassName="no-underline"
      placement="bottom"
      tooltip={hoverName}
    />
  );
};
