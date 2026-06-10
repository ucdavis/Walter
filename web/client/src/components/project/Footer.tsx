import WalterLogo from '@/shared/WalterLogo.tsx';

const Footer: React.FC = () => {
  return (
    <footer className="bg-light-bg-200 border-t border-main-border py-3 mt-15">
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
        <div className="flex-1 flex justify-end">
          <a
            href="https://ucdavis.edu"
            rel="noopener noreferrer"
            target="_blank"
          >
            <img
              alt="UC Davis"
              className="h-5 w-auto max-w-[116px] sm:h-6 opacity-55"
              src="/ucdavis.svg"
            />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
