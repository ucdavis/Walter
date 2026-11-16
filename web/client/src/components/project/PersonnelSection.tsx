import {
  FundingColumnGroup,
  FundingColumnHeaders,
  PersonnelTable,
} from '@/components/project/PersonnelTable.tsx';
import { usePersonnelQuery } from '@/queries/personnel.ts';

interface PersonnelSectionProps {
  iamId: string;
  projectNumbers: string[];
}

function PersonnelTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto mt-4">
      <table
        aria-label="Loading personnel"
        className="table walter-table personnel-reverse-table"
      >
        <colgroup>
          <col className="personnel-reverse-col-employee" />
          <FundingColumnGroup />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <FundingColumnHeaders />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, index) => (
            <tr key={index}>
              {Array.from({ length: 9 }).map((_, column) => (
                <td key={column}>
                  <div
                    className={`skeleton h-5 ${column < 2 ? 'w-full' : 'w-16 ml-auto'}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PersonnelSection({
  iamId,
  projectNumbers,
}: PersonnelSectionProps) {
  const personnelQuery = usePersonnelQuery(iamId, projectNumbers);

  if (projectNumbers.length === 0) {
    return null;
  }

  return (
    <section className="section-margin">
      <h2 className="h2">Personnel</h2>
      <p className="max-w-3xl mb-2">
        The list of employees below is limited to UCPath records that can be
        accessed by WALTER. Additional information will be displayed once
        available.
      </p>
      <p className="max-w-3xl mb-4">
        Monthly amounts show current funding for this PI only. Expand an
        employee to see job details and full job amounts.
      </p>
      {personnelQuery.isPending && <PersonnelTableSkeleton />}
      {personnelQuery.isError && (
        <p className="text-error mt-4">Error loading personnel.</p>
      )}
      {personnelQuery.isSuccess && (
        <PersonnelTable data={personnelQuery.data ?? []} />
      )}
    </section>
  );
}
