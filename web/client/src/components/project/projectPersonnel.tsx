import { useProjectPersonnelQuery } from '@/queries/personnel.ts';
import { Currency } from '@/shared/Currency.tsx';
import { UserGroupIcon } from '@heroicons/react/24/outline';

interface ProjectPersonnelProps {
  projects: string[];
}

export function ProjectPersonnel({ projects }: ProjectPersonnelProps) {
  const {
    data: personnel,
    error,
    isLoading,
  } = useProjectPersonnelQuery(projects);

  return (
    <section className="section-margin">
      <div className="flex justify-between">
        <h2 className="h2">Personnel</h2>
      </div>

      {isLoading && <p className="text-gray-500 mt-4">Loading personnel...</p>}
      {error && <p className="text-red-500 mt-4">Error loading personnel.</p>}

      {personnel && personnel.length > 0 && (
        <div className="overflow-x-auto mt-4">
          <table className="table walter-table">
            <thead>
              <tr>
                <th className="text-left">Name</th>
                <th className="text-right">Dist %</th>
                <th className="text-right pr-6">FTE</th>
                <th className="text-left">Job Description</th>
                <th className="text-right">Monthly Rate</th>
              </tr>
            </thead>
            <tbody>
              {personnel.map((person, index) => (
                <tr
                  key={`${person.JOB_EMPLID}-${person.POSITION_NBR}-${index}`}
                >
                  <td>
                    <div className="flex items-center gap-2">
                      <UserGroupIcon className="w-5 h-5" />
                      <span>{person.PREFERRED_NAME}</span>
                    </div>
                  </td>
                  <td className="text-right">{person.DIST_PCT}%</td>
                  <td className="text-right pr-6">{person.FTE}</td>
                  <td>{person.JOBCODE_SHORT}</td>
                  <td className="text-right">
                    <Currency value={person.JOB_MONTHLY_RT_EQUIV} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {personnel && personnel.length === 0 && (
        <p className="text-gray-500 mt-4">
          No personnel found for selected projects.
        </p>
      )}
    </section>
  );
}
