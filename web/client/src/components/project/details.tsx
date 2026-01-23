import { formatDate } from '@/lib/date.ts';
import type { ProjectSummary } from '@/lib/projectSummary.ts';
import { Currency } from '@/shared/Currency.tsx';

interface ProjectDetailsProps {
  summary: ProjectSummary;
}

const displayValue = (value: string | null) => value ?? 'Not provided';

export function ProjectDetails({ summary }: ProjectDetailsProps) {
  return (
    <section className="section-margin">
      <div className="fancy-data">
        <div className="fancy-data-grid">
          <div className="flex flex-col">
            <div>
              <div>
                <div className="h5">Status</div>
                <div className="h4">
                  <div className="badge badge-soft badge-primary">
                    {displayValue(summary.projectStatusCode)}
                  </div>
                </div>
              </div>
              <div className="h5">Start date</div>
              <div className="h4">{formatDate(summary.awardStartDate)}</div>
              <div className="h5">End date</div>
              <div className="h4">{formatDate(summary.awardEndDate)}</div>
            </div>
          </div>
          <div className="flex flex-col">
            <div>
              <div className="h5">PM</div>
              <div className="h4">{displayValue(summary.pm)}</div>
            </div>
            <div>
              <div className="h5">PI</div>
              <div className="h4">{displayValue(summary.pi)}</div>
            </div>
            <div>
              <div className="h5">ID</div>
              <div className="h4">{summary.projectNumber}</div>
            </div>
          </div>
          <div className="flex flex-col">
            <div>
              <div className="h5">Co-PI</div>
              <div className="h4">{displayValue(summary.copi)}</div>
            </div>
            <div>
              <div className="h5">PA</div>
              <div className="h4">{displayValue(summary.pa)}</div>
            </div>
          </div>
          <div className="flex flex-col">
            <div>
              <div className="h5">Total Budget</div>
              <div className="h4">
                <Currency value={summary.totals.budget} />
              </div>
            </div>
            <div>
              <div className="h5">Balance</div>
              <div className="h4 text-success font-proxima-bold">
                <Currency value={summary.totals.balance} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
