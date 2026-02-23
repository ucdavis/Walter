import React from 'react';
import { formatDate } from '@/lib/date.ts';
import type { ProjectSummary } from '@/lib/projectSummary.ts';

interface Field {
  label: string;
  value: string;
}

function buildFields(summary: ProjectSummary): Field[] {
  return [
    { label: 'Award Close Date', value: formatDate(summary.awardCloseDate) },
    { label: 'Award End Date', value: formatDate(summary.awardEndDate) },
    { label: 'Award Number', value: summary.awardNumber ?? '—' },
    { label: 'Award PI', value: summary.awardPi ?? '—' },
    { label: 'Award Start Date', value: formatDate(summary.awardStartDate) },
    { label: 'Award Status', value: summary.awardStatus ?? '—' },
    { label: 'Award Type', value: summary.awardType ?? '—' },
    { label: 'Billing Cycle', value: summary.billingCycle ?? '—' },
    {
      label: 'Burden Schedule Rate',
      value: summary.projectBurdenCostRate ?? '—',
    },
    {
      label: 'Burden Structure',
      value: summary.projectBurdenScheduleBase ?? '—',
    },
    {
      label: 'Contract Administrator',
      value: summary.contractAdministrator ?? '—',
    },
    {
      label: 'Cost Share Required by Sponsor',
      value: summary.costShareRequiredBySponsor ?? '—',
    },
    { label: 'Grant Administrator', value: summary.grantAdministrator ?? '—' },
    {
      label: 'Internal Funded Project',
      value: summary.internalFundedProject ?? '—',
    },
    {
      label: 'Post Reporting Period',
      value: summary.postReportingPeriod ?? '—',
    },
    {
      label: 'Primary Sponsor Name',
      value: summary.primarySponsorName ?? '—',
    },
    { label: 'Project Fund', value: summary.projectFund ?? '—' },
    {
      label: 'Sponsor Award Number',
      value: summary.sponsorAwardNumber ?? '—',
    },
  ];
}

const COLLAPSE_AFTER_LABEL = 'Billing Cycle';

interface ProjectAdditionalInfoProps {
  summary: ProjectSummary;
}

export function ProjectAdditionalInfo({
  summary,
}: ProjectAdditionalInfoProps) {
  const [expanded, setExpanded] = React.useState(false);

  const fields = buildFields(summary);

  const splitIndex =
    fields.findIndex((f) => f.label === COLLAPSE_AFTER_LABEL) + 1;

  const visibleFields = splitIndex > 0 ? fields.slice(0, splitIndex) : fields;
  const hiddenFields = splitIndex > 0 ? fields.slice(splitIndex) : [];

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
