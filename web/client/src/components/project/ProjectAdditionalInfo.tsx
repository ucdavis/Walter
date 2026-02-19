// src/components/project/ProjectAdditionalInfo.tsx

const FIELDS: Array<{ label: string; value: string }> = [
  { label: 'Award Close Date', value: '06/30/2026' },
  { label: 'Award End Date', value: '06/30/2026' },
  { label: 'Award Number', value: 'AWD-123456' },
  { label: 'Award PI', value: 'Dr. Jane Smith' },
  { label: 'Award Start Date', value: '07/01/2023' },
  { label: 'Award Status', value: 'Active' },
  { label: 'Award Type', value: 'Grant' },
  { label: 'Billing Cycle', value: 'Quarterly' },
  { label: 'Burden Schedule Rate', value: '55%' },
  { label: 'Burden Structure', value: 'On-Campus Research' },
  { label: 'Contract Administrator', value: 'John Doe' },
  { label: 'Cost Share Required by Sponsor', value: 'No' },
  { label: 'Grant Administrator', value: 'Mary Johnson' },
  { label: 'Internal Funded Project', value: 'No' },
  { label: 'POETAF String', value: 'P12345-67890-001-ABC-0001' },
  { label: 'Post Reporting Period', value: '90 Days' },
  { label: 'Primary Sponsor Name', value: 'National Science Foundation' },
  { label: 'Project Fund', value: '1234567' },
  { label: 'Project Fund Name', value: 'Climate Research Initiative' },
  { label: 'SPO Contact', value: 'spo@ucdavis.edu' },
  { label: 'Sponsor Award Number', value: 'NSF-9876543' },
];

export function ProjectAdditionalInfo() {
  return (
    <section className="section-margin">
      <h2 className="h2">Additional Information</h2>

      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          {FIELDS.map((field) => (
            <div
              className="grid grid-cols-[180px_1fr] items-start"
              key={field.label}
            >
              <div className="stat-label">{field.label}</div>
              <div className="stat-value">{field.value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ProjectAdditionalInfo;
