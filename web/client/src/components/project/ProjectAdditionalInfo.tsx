import React from 'react';
import { formatCurrency } from '@/lib/currency.ts';
import { formatDate } from '@/lib/date.ts';
import type { ProjectSummary } from '@/lib/projectSummary.ts';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';
import { tooltipDefinitions } from '@/shared/tooltips.ts';

interface Field {
  label: string;
  tooltip?: string;
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
      label: 'Indirect/Burden Rate',
      tooltip: tooltipDefinitions.burdenScheduleRate,
      value: summary.projectBurdenCostRate
        ? `${Number.parseFloat((Number.parseFloat(summary.projectBurdenCostRate) * 100).toFixed(4))}%`
        : '—',
    },
    {
      label: 'Contract Administrator',
      tooltip: tooltipDefinitions.contractAdministrator,
      value: summary.contractAdministrator ?? '—',
    },
  ];
}

function buildSecondaryFields(summary: ProjectSummary): Field[] {
  return [
    {
      label: 'Award Close Date',
      tooltip: tooltipDefinitions.awardCloseDate,
      value: formatDate(summary.awardCloseDate),
    },
    { label: 'Award PI', value: summary.awardPi ?? '—' },
    { label: 'Award Status', value: summary.awardStatus ?? '—' },
    { label: 'Award Type', value: summary.awardType ?? '—' },
    {
      label: 'Billing Cycle',
      tooltip: tooltipDefinitions.billingCycle,
      value: summary.billingCycle ?? '—',
    },
    {
      label: 'Burden Structure',
      tooltip: tooltipDefinitions.burdenStructure,
      value: summary.projectBurdenScheduleBase?.split('-')[0].trim() || '—',
    },
    {
      label: 'Cost Share Required by Sponsor',
      tooltip: tooltipDefinitions.costShareRequiredBySponsor,
      value: summary.costShareRequiredBySponsor ?? '—',
    },
    {
      label: 'Grant Administrator',
      tooltip: tooltipDefinitions.grantAdministrator,
      value: summary.grantAdministrator ?? '—',
    },
    {
      label: 'Internal Funded Project',
      value: summary.internalFundedProject ?? '—',
    },
    {
      label: 'Post Reporting Period',
      tooltip: tooltipDefinitions.postReportingPeriod,
      value: summary.postReportingPeriod ?? '—',
    },
    { label: 'Project Fund', value: summary.projectFund ?? '—' },
  ];
}

function buildFlowThroughFields(summary: ProjectSummary): Field[] {
  return [
    {
      label: 'Primary Sponsor',
      value: summary.flowThroughFundsPrimarySponsor ?? '—',
    },
    {
      label: 'Reference Award Name',
      value: summary.flowThroughFundsReferenceAwardName ?? '—',
    },
    {
      label: 'Start Date',
      value: formatDate(summary.flowThroughFundsStartDate),
    },
    {
      label: 'End Date',
      value: formatDate(summary.flowThroughFundsEndDate),
    },
    {
      label: 'Amount',
      value: summary.flowThroughFundsAmount
        ? formatCurrency(summary.flowThroughFundsAmount)
        : '—',
    },
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

  if (!summary.awardNumber) {
    return null;
  }

  const primaryFields = buildPrimaryFields(summary);
  const secondaryFields = buildSecondaryFields(summary);
  const renderLabel = (field: Field) =>
    field.tooltip ? (
      <TooltipLabel label={field.label} tooltip={field.tooltip} />
    ) : (
      field.label
    );

  return (
    <section className="section-margin">
      <h2 className="h2 mb-4">Award Information</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
        {primaryFields.map((field) => (
          <div
            className="grid grid-cols-[max-content_1fr] gap-x-4"
            key={field.label}
          >
            <div className="font-proxima-bold">{renderLabel(field)}</div>
            <div>{field.value}</div>
          </div>
        ))}

        {expanded &&
          secondaryFields.map((field) => (
            <div
              className="grid grid-cols-[max-content_1fr] gap-x-4"
              key={field.label}
            >
              <div className="font-proxima-bold">{renderLabel(field)}</div>
              <div>{field.value}</div>
            </div>
          ))}

        {expanded && summary.flowThroughFundsPrimarySponsor && (
          <div className="md:col-span-2 mt-4">
            <h3 className="h3 mb-2">Flow-Through Funds</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
              {buildFlowThroughFields(summary).map((field) => (
                <div
                  className="grid grid-cols-[max-content_1fr] gap-x-4"
                  key={field.label}
                >
                  <div className="font-proxima-bold">{renderLabel(field)}</div>
                  <div>{field.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

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
