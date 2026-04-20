import { createFileRoute } from '@tanstack/react-router';

type SupportLink = {
  description: string;
  href: string;
  label: string;
};

const supportLinks: SupportLink[] = [
  {
    description:
      'Search the knowledge base for guides, answers, and other documentation.',
    href: 'https://computing.caes.ucdavis.edu/documentation/walter',
    label: 'Knowledge Base (Coming Soon)',
  },
  {
    description:
      'For questions, problems, or other help requests, contact the support team.',
    href: 'https://caeshelp.ucdavis.edu/?appname=Walter',
    label: 'Help',
  },
  {
    description:
      'For suggestions or general comments, share feedback with the team.',
    href: 'https://feedback.ucdavis.edu/app/walter',
    label: 'Feedback',
  },
];

export const Route = createFileRoute('/(authenticated)/help')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="container">
      <div className="max-w-3xl space-y-6 pt-16 pb-8 md:pt-20">
        <div className="space-y-2">
          <h1 className="h1">Help</h1>
          <p className="text-lg text-dark-font/80">
            If you need support, the knowledge base is the best place to start.
            You can also submit a help request or share feedback with the team.
          </p>
        </div>

        <div className="grid gap-4">
          {supportLinks.map((link) => (
            <section
              className="card bg-base-100 border border-main-border shadow-sm"
              key={link.label}
            >
              <div className="card-body gap-3">
                <h2 className="card-title">{link.label}</h2>
                <p>{link.description}</p>
                <div className="card-actions justify-start">
                  <a
                    className="btn btn-primary"
                    href={link.href}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Open {link.label}
                  </a>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
