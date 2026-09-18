import { useState } from 'react';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import WalterLogo from '@/shared/WalterLogo.tsx';

const Footer: React.FC = () => {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.dataset.theme === 'walter-dark'
  );

  const toggleTheme = () => {
    const nextIsDark = !isDark;
    document.documentElement.dataset.theme = nextIsDark
      ? 'walter-dark'
      : 'walter';

    try {
      localStorage.setItem('walter-color-theme', nextIsDark ? 'dark' : 'light');
    } catch {
      // The selected theme still applies for this session.
    }

    setIsDark(nextIsDark);
  };

  return (
    <footer className="bg-base-200 border-t border-main-border py-3 mt-4">
      <div className="container flex items-center justify-between">
        {/* Left */}
        <div className="flex-1 flex items-center">
          <p className="text-sm text-base-content/70">
            © {new Date().getFullYear()} UC Regents, Davis campus. All rights
            reserved.
          </p>
        </div>

        {/* Center */}
        <div className="flex-1 flex justify-center">
          <WalterLogo className="w-8 h-8 text-base-content/70" />
        </div>

        {/* Right */}
        <div className="flex-1 flex items-center justify-end gap-3">
          <button
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            className="btn btn-ghost btn-circle btn-sm"
            onClick={toggleTheme}
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            type="button"
          >
            {isDark ? (
              <SunIcon aria-hidden="true" className="h-5 w-5" />
            ) : (
              <MoonIcon aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
          <a
            aria-label="UC Davis"
            href="https://ucdavis.edu"
            rel="noopener noreferrer"
            target="_blank"
          >
            <img
              alt="UC Davis"
              className="uc-davis-logo h-5 w-auto max-w-[116px] sm:h-6"
              src="/ucdavis.svg"
            />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
