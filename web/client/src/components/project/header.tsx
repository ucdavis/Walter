import React from 'react';
import { Link } from '@tanstack/react-router';

const Header: React.FC = () => {
  return (
    <header className="bg-light-bg-200 border-b py-3 border-main-border sticky top-0 z-50">
      <div className="container flex items-center justify-between">
        <Link className="flex items-center gap-2" to="/">
          <img alt="Dog outline logo" className="w-8" src="/walter.svg" />
          <h1 className="text-2xl">Walter</h1>
        </Link>

        <nav className="flex items-center gap-6">
          <Link to="/projects">Projects</Link>
          <Link to="/about">About</Link>
          <Link to="/accruals">Accruals</Link>
        </nav>
      </div>
    </header>
  );
};

export default Header;
