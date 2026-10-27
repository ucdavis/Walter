import { useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { glPpmReconciliationQueryOptions } from '@/queries/project.ts';
import { ExportDataButton } from '@/components/ExportDataButton.tsx';
import { ReconciliationTable } from '@/components/reconciliation/ReconciliationTable.tsx';
import {
  hasDiscrepancy,
  sortReconciliationRecords,
} from '@/lib/reconciliation.ts';

export const Route = createFileRoute(
  '/(authenticated)/reports/reconciliation/$projectNumber/'
)({
  component: RouteComponent,
});

const csvColumns = [
  { header: 'Dept', key: 'financialDepartment' as const },
  { header: 'Project', key: 'project' as const },
  { header: 'Project Description', key: 'projectDescription' as const },
  { header: 'GL Fund', key: 'fundCode' as const },
  { header: 'Fund Description', key: 'fundDescription' as const },
  { header: 'PPM Fund', key: 'ppmFundCode' as const },
  { header: 'PPM Fund Description', key: 'ppmFundDescription' as const },
  { header: 'Program', key: 'programCode' as const },
  { header: 'Program Description', key: 'programDescription' as const },
  { header: 'Activity', key: 'activityCode' as const },
  { header: 'Activity Description', key: 'activityDescription' as const },
  {
    format: 'currency' as const,
    header: 'GL Balance',
    key: 'glActualAmount' as const,
  },
  {
    format: 'currency' as const,
    header: 'PPM Balance',
    key: 'ppmBudBal' as const,
  },
  {
    format: 'currency' as const,
    header: 'Remaining Balance',
    key: 'remainingBalance' as const,
  },
];

function RouteComponent() {
  const { projectNumber } = Route.useParams();

  const {
    data: records,
    isError: isReconciliationError,
    isPending: isReconciliationPending,
  } = useQuery(glPpmReconciliationQueryOptions([projectNumber]));

  const sorted = useMemo(
    () => sortReconciliationRecords(records ?? []),
    [records]
  );

  const discrepancyCount = useMemo(
    () => sorted.filter(hasDiscrepancy).length,
    [sorted]
  );

  return (
    <main className="container">
      <section className="mt-8 mb-10">
        <h1 className="h1">GL/PPM Reconciliation</h1>
        <h3 className="subtitle">{projectNumber}</h3>
        <p>Comparing General Ledger balances to PPM balances</p>
        <p className="max-w-150 text-sm text-base-content/70 mt-3 mb-1">
          Known Issue: GL and PPM balances below can differ from the UCD PPM to
          GL Non-Sponsored Projects Reconciliation Report because either
        </p>
        <ol className="list-decimal pl-4 space-y-1 text-sm text-base-content/70">
          <li>
            The timing of the WALTER and Datamart daily data refreshes is
            different or
          </li>
          <li>
            Certain transactions involving natural account 300001 are excluded
            in WALTER.
          </li>
        </ol>
        <p className="text-sm text-base-content/70">
          We are actively researching these discrepancies to correct them.
        </p>
      </section>

      {isReconciliationPending ? (
        <p className="text-base-content/80 mt-4">
          Loading reconciliation data…
        </p>
      ) : isReconciliationError ? (
        <p className="text-error mt-4">Error loading reconciliation data.</p>
      ) : (
        <>
          {discrepancyCount === 0 && (
            <section className="bg-success/10 border border-success/30 rounded-lg p-6 mb-6">
              <p className="text-success font-medium">
                No discrepancies found. GL and PPM totals are in sync.
              </p>
            </section>
          )}

          <ReconciliationTable
            records={sorted}
            tableActions={
              <ExportDataButton
                columns={csvColumns}
                data={sorted}
                filename={`reconciliation-${projectNumber}.csv`}
              />
            }
          />
        </>
      )}
    </main>
  );
}
