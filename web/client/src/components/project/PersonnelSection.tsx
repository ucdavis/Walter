import { PersonnelTable } from '@/components/project/PersonnelTable.tsx';
import { usePersonnelQuery } from '@/queries/personnel.ts';

interface PersonnelSectionProps {
  projectNumbers: string[];
}

function PersonnelTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto mt-4">
      <table className="table walter-table">
        <colgroup>
          <col className="w-1/3" />
          <col className="w-14" />
          <col className="w-12" />
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-28" />
          <col className="w-24" />
          <col className="w-24" />
        </colgroup>
        <thead>
          <tr>
            <th>Position/Project</th>
            <th>
              <span className="flex justify-end w-full">FTE</span>
            </th>
            <th>
              <span className="flex justify-end w-full">Dist Pct</span>
            </th>
            <th>
              <span className="flex justify-end w-full">Effective Date</span>
            </th>
            <th>
              <span className="flex justify-end w-full">Expected End Date</span>
            </th>
            <th>
              <span className="flex justify-end w-full">Monthly Rate</span>
            </th>
            <th>
              <span className="flex justify-end w-full">Monthly Fringe</span>
            </th>
            <th>
              <span className="flex justify-end w-full">Monthly Total</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, index) => (
            <tr key={index}>
              <td>
                <div className="skeleton h-5 w-64" />
              </td>
              <td>
                <div className="skeleton h-5 w-10 ml-auto" />
              </td>
              <td>
                <div className="skeleton h-5 w-12 ml-auto" />
              </td>
              <td>
                <div className="skeleton h-5 w-20 ml-auto" />
              </td>
              <td>
                <div className="skeleton h-5 w-20 ml-auto" />
              </td>
              <td>
                <div className="skeleton h-5 w-24 ml-auto" />
              </td>
              <td>
                <div className="skeleton h-5 w-24 ml-auto" />
              </td>
              <td>
                <div className="skeleton h-5 w-24 ml-auto" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PersonnelSection({ projectNumbers }: PersonnelSectionProps) {
  const personnelQuery = usePersonnelQuery(projectNumbers);

  if (projectNumbers.length === 0) {
    return null;
  }

  return (
    <section className="section-margin">
      <h2 className="h2">Personnel</h2>
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
