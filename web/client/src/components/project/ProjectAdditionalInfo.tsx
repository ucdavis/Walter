import React from 'react';
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

const COLLAPSE_AFTER_LABEL = 'Billing Cycle';

export function ProjectAdditionalInfo() {
  const [expanded, setExpanded] = React.useState(false);

  const splitIndex =
    FIELDS.findIndex((f) => f.label === COLLAPSE_AFTER_LABEL) + 1;

  const visibleFields = splitIndex > 0 ? FIELDS.slice(0, splitIndex) : FIELDS;

  const hiddenFields = splitIndex > 0 ? FIELDS.slice(splitIndex) : [];

  return (
    <section className="section-margin">
      <h2 className="h2 mb-4">Additional Information</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
        {/* Always visible */}
        {visibleFields.map((field) => (
          <div
            className="grid grid-cols-[max-content_1fr] gap-x-4"
            key={field.label}
          >
            <div className="font-proxima-bold">{field.label}</div>
            <div>{field.value}</div>
          </div>
        ))}

        {/* Conditionally visible */}
        {expanded &&
          hiddenFields.map((field) => (
            <div
              className="grid grid-cols-[max-content_1fr] gap-x-4"
              key={field.label}
            >
              <div className="font-proxima-bold">{field.label}</div>
              <div>{field.value}</div>
            </div>
          ))}

        {/* ALWAYS last row */}
        {hiddenFields.length > 0 && (
          <div className="md:col-span-2 mt-2">
            <button
              className="btn"
              onClick={() => setExpanded((v) => !v)}
              type="button"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default ProjectAdditionalInfo;
