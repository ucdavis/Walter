import { createFileRoute } from '@tanstack/react-router';
import {
  ArrowRightIcon,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  LifebuoyIcon,
} from '@heroicons/react/24/outline';

type SupportLink = {
  description: string;
  href: string;
  Icon: typeof BookOpenIcon;
  label: string;
};

const supportLinks: SupportLink[] = [
  {
    description:
      'Search the knowledge base for guides, answers, and other documentation.',
    href: 'https://computing.caes.ucdavis.edu/documentation/walter',
    Icon: BookOpenIcon,
    label: 'Knowledge Base',
  },
  {
    description:
      'For questions, problems, or other help requests, contact the support team.',
    href: 'https://caeshelp.ucdavis.edu/?appname=Walter',
    Icon: LifebuoyIcon,
    label: 'Help',
  },
  {
    description:
      'For suggestions or general comments, share feedback with the team.',
    href: 'https://feedback.ucdavis.edu/app/walter',
    Icon: ChatBubbleLeftRightIcon,
    label: 'Feedback',
  },
];

export const Route = createFileRoute('/(authenticated)/help')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="container">
      <div className="space-y-6 pt-16 pb-8 md:pt-20">
        <div className="space-y-2">
          <h1 className="h1">Help</h1>
          <p className="text-lg text-base-content/80">
            If you need support, the knowledge base is the best place to start.
            You can also submit a help request or share feedback with the team.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {supportLinks.map((link) => (
            <section key={link.label}>
              <a
                aria-label={`Open ${link.label}`}
                className="border-main-border group block h-full rounded-sm border bg-base-100 p-5 transition hover:bg-[#F2F6FC] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                href={link.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                <div className="flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <link.Icon className="h-6 w-6" />
                    <ArrowRightIcon className="mt-1 h-5 w-5 shrink-0 text-base-content/40 transition group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-sans font-bold">
                      {link.label}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-base-content/70">
                      {link.description}
                    </p>
                  </div>
                </div>
              </a>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
