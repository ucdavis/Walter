import React from 'react';
import { Link } from '@tanstack/react-router';
import { SearchButton } from '@/components/search/SearchButton.tsx';

const formatAsOfDate = (value: string | null) => {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  return `${date.getMonth() + 1}.${date.getDate()}.${date.getFullYear()}`;
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

        <div className="absolute top-[58px] left-1/2 -translate-x-1/2">
          <span className="inline-block bg-primary-color text-white px-3 py-1 text-xs rounded font-proxima-bold">
            DATA AS OF {formatAsOfDate(new Date().toDateString())}
          </span>
        </div>
        <div className="flex items-center">
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-6">
              <Link to="/projects">Projects</Link>
              <Link to="/personnel">Personnel</Link>
              <Link to="/reports">Reports</Link>
              <Link to="/accruals">Accruals</Link>
            </nav>
          </div>
          <div className="avatar ms-6">
            <div className="w-10 rounded-full">
              <img
                alt="User avatar"
                src="https://img.daisyui.com/images/profile/demo/yellingcat@192.webp"
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
