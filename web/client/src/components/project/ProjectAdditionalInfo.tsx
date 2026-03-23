import React from 'react';
import { formatDate } from '@/lib/date.ts';
import type { ProjectSummary } from '@/lib/projectSummary.ts';

interface Field {
  label: string;
  value: string;
}

function buildPrimaryFields(summary: ProjectSummary): Field[] {
  return [
    { label: 'Award Number', value: summary.awardNumber ?? '—' },
    { label: 'Award Name', value: summary.awardName ?? '—' },
    { label: 'Award Start Date', value: formatDate(summary.awardStartDate) },
    { label: 'Award End Date', value: formatDate(summary.awardEndDate) },
    {
      label: 'Primary Sponsor Name',
      value: summary.primarySponsorName ?? '—',
    },
    {
      label: 'Sponsor Award Number',
      value: summary.sponsorAwardNumber ?? '—',
    },
    {
      label: 'Burden Schedule Rate',
      value: summary.projectBurdenCostRate
        ? `${parseFloat((parseFloat(summary.projectBurdenCostRate) * 100).toFixed(4))}%`
        : '—',
    },
    {
      label: 'Contract Administrator',
      value: summary.contractAdministrator ?? '—',
    },
  ];
}

function buildSecondaryFields(summary: ProjectSummary): Field[] {
  return [
    { label: 'Award Close Date', value: formatDate(summary.awardCloseDate) },
    { label: 'Award PI', value: summary.awardPi ?? '—' },
    { label: 'Award Status', value: summary.awardStatus ?? '—' },
    { label: 'Award Type', value: summary.awardType ?? '—' },
    { label: 'Billing Cycle', value: summary.billingCycle ?? '—' },
    {
      label: 'Burden Structure',
      value: summary.projectBurdenScheduleBase?.split('-')[0].trim() || '—',
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
    { label: 'Project Fund', value: summary.projectFund ?? '—' },
  ];
}

interface ProjectAdditionalInfoProps {
  isProjectManager: boolean;
  summary: ProjectSummary;
}

export function ProjectAdditionalInfo({
  isProjectManager,
  summary,
}: ProjectAdditionalInfoProps) {
  const [expanded, setExpanded] = React.useState(false);

  const primaryFields = buildPrimaryFields(summary);
  const secondaryFields = buildSecondaryFields(summary);

  return (
    <section className="section-margin">
      <h2 className="h2 mb-4">Award Information</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
        {primaryFields.map((field) => (
          <div
            className="grid grid-cols-[max-content_1fr] gap-x-4"
            key={field.label}
          >
            <div className="font-proxima-bold">{field.label}</div>
            <div>{field.value}</div>
          </div>
        ))}

        {expanded &&
          secondaryFields.map((field) => (
            <div
              className="grid grid-cols-[max-content_1fr] gap-x-4"
              key={field.label}
            >
              <div className="font-proxima-bold">{field.label}</div>
              <div>{field.value}</div>
            </div>
          ))}

        {isProjectManager && secondaryFields.length > 0 && (
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
