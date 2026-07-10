import { ProjectsSidebar } from '@/components/project/ProjectsSidebar.tsx';
import type { ReactNode } from 'react';

interface ProjectPortfolioLayoutProps {
  children: ReactNode;
}

export function ProjectPortfolioLayout({
  children,
}: ProjectPortfolioLayoutProps) {
  return (
    <div className="container">
      <div className="flex flex-col md:flex-row gap-0 md:gap-8">
        <ProjectsSidebar />
        {children}
      </div>
    </div>
  );
}
