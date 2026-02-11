import React, { useMemo, useState } from 'react';
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
  const hoverName = user.name || user.kerberos || '';

  if (!showPhoto) {
    return (
      <div
        className="tooltip tooltip-left md:tooltip-bottom"
        data-tip={hoverName}
        title={hoverName}
      >
        <div className="avatar avatar-placeholder">
          <div className="bg-neutral text-neutral-content w-10 rounded-full">
            <span>{initials}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="tooltip tooltip-left md:tooltip-bottom"
      data-tip={hoverName}
      title={hoverName}
    >
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
    </div>
  );
};
