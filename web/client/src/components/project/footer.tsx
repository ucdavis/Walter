import { Link } from '@tanstack/react-router';

const Footer: React.FC = () => {
  return (
    <footer className="bg-light-bg-200 border-t py-3 border-cru-border">
      <div className="container flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-sm text-dark-font/70">Copyright 2025</h1>
        </div>
        <img
          alt="Dog outline logo"
          className="w-8 opacity-70"
          src="/walter.svg"
        />
        <Link to="https://caes.ucdavis.edu">
          <img
            alt="CA&ES UC Davis Logo"
            className="w-36 opacity-70"
            src="/caes.svg"
          />
        </Link>
      </div>
    </footer>
  );
};

export default Footer;
