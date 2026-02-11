import WalterLogo from '@/shared/WalterLogo.tsx';

const Footer: React.FC = () => {
  return (
    <footer className="bg-light-bg-200 border-t border-main-border py-3">
      <div className="container flex items-center justify-between">
        {/* Left */}
        <div className="flex-1 flex items-center">
          <p className="text-sm text-dark-font/80">
            © {new Date().getFullYear()} UC Regents, Davis campus. All rights
            reserved.
          </p>
        </div>

        {/* Center */}
        <div className="flex-1 flex justify-center">
          <WalterLogo className="w-8 h-8 text-dark-font/80" />
        </div>

        {/* Right */}
        <div className="flex-1 flex justify-end">
          <a
            href="https://caes.ucdavis.edu"
            rel="noopener noreferrer"
            target="_blank"
          >
            <img
              alt="CA&ES UC Davis Logo"
              className="w-36 opacity-80"
              src="/caes.svg"
            />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
