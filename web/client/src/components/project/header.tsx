import React from 'react';
import { Link } from '@tanstack/react-router';

const formatAsOfDate = (value: string | null) => {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  return `${date.getMonth() + 1}.${date.getDate()}.${date.getFullYear()}`;
};

const Header: React.FC = () => {
  return (
    <header className="bg-light-bg-200 border-b py-3 border-main-border sticky top-0 z-50">
      <div className="container flex items-center justify-between">
        <Link className="flex items-center gap-2" to="/">
          <img alt="Dog outline logo" className="w-8" src="/walter.svg" />
          <h1 className="text-2xl">Walter</h1>
        </Link>
        <div className="absolute top-[60px] left-1/2 -translate-x-1/2">
          <span className="inline-block bg-primary-color text-white px-3 py-1 text-xs rounded font-proxima-bold">
            DATA AS OF {formatAsOfDate(new Date().toDateString())}
          </span>
        </div>
        <div className="flex items-center gap-8">
          <nav className="flex text-lg items-center gap-6">
            <Link to="/projects">Projects</Link>
            <Link to="/about">About</Link>
            <Link to="/accruals">Accruals</Link>
          </nav>
          <div className="flex-col text-right border-l border-main-border ps-4">
            <p>Username</p>
            <a
              className="underline text-sm text-dark-font/70 font-proxima-bold"
              href="#"
            >
              Staff
            </a>
          </div>
          <div className="avatar">
            <div className="w-12 rounded-full">
              <img src="https://img.daisyui.com/images/profile/demo/yellingcat@192.webp" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
