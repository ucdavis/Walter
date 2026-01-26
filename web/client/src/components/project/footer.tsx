const Footer: React.FC = () => {
  return (
    <footer className="bg-light-bg-200 border-t border-main-border py-3">
      <div className="container flex items-center justify-between">
        {/* Left */}
        <div className="flex-1 flex items-center">
          <h1 className="text-sm text-dark-font/80">
            © {new Date().getFullYear()} UC Regents, Davis campus. All rights
            reserved.
          </h1>
        </div>

        {/* Center */}
        <div className="flex-1 flex justify-center">
          <img
            alt="Dog outline logo"
            className="w-8 opacity-80"
            src="/walter.svg"
          />
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
