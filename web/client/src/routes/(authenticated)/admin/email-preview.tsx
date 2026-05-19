import { HttpError } from '@/lib/api.ts';
import {
  EmailPreviewResponse,
  renderEmailPreview,
} from '@/queries/emailPreview.ts';
import { meQueryOptions } from '@/queries/user.ts';
import { RouterContext } from '@/main.tsx';
import { hasAdminRole } from '@/shared/auth/roleAccess.ts';
import {
  ArrowLeftIcon,
  EnvelopeIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';

type EmailPreviewPreset = {
  id: string;
  label: string;
  notificationType: string;
  payloadJson: string;
  payloadVersion: number;
  recipientName: string;
  templateKey: string;
  templateVersion: number;
};

const formatJson = (value: unknown) => JSON.stringify(value, null, 2);

const createEmployeePayload = (
  employeeGroup: string,
  employeeName: string,
  pctOfCap: number
) =>
  formatJson({
    accrualHoursPerMonth: 10,
    balanceHours: 240,
    capHours: 240,
    classification: employeeGroup,
    department: 'PLANT SCIENCES',
    departmentCode: '030003',
    employeeAsOfDate: '2026-04-30T00:00:00',
    employeeGroup,
    employeeId: 'E001',
    employeeName,
    lastVacationDate: '2026-02-28T00:00:00',
    monthsToCap: 0,
    pctOfCap,
    snapshotAsOfDate: '2026-04-30T00:00:00',
    status: 'AtCap',
  });

const presets: EmailPreviewPreset[] = [
  {
    id: 'employee-staff',
    label: 'Accrual employee: staff',
    notificationType: 'accrual.employee',
    payloadJson: createEmployeePayload('Staff', 'Staff Member', 100),
    payloadVersion: 1,
    recipientName: 'Staff Member',
    templateKey: 'accrual.employee.staff.v1',
    templateVersion: 1,
  },
  {
    id: 'employee-faculty',
    label: 'Accrual employee: faculty',
    notificationType: 'accrual.employee',
    payloadJson: createEmployeePayload(
      'FacultyAcademic',
      'Faculty Member',
      91.7
    ),
    payloadVersion: 1,
    recipientName: 'Faculty Member',
    templateKey: 'accrual.employee.faculty-academic.v1',
    templateVersion: 1,
  },
  {
    id: 'employee-generic',
    label: 'Accrual employee: generic',
    notificationType: 'accrual.employee',
    payloadJson: createEmployeePayload('Generic', 'Employee One', 83.3),
    payloadVersion: 1,
    recipientName: 'Employee One',
    templateKey: 'accrual.employee.generic.v1',
    templateVersion: 1,
  },
];

const firstPreset = presets[0];

export const Route = createFileRoute(
  '/(authenticated)/admin/email-preview'
)({
  beforeLoad: async ({ context }: { context: RouterContext }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions());

    if (!hasAdminRole(user.roles)) {
      throw redirect({ to: '/admin' });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  const [selectedPresetId, setSelectedPresetId] = useState(firstPreset.id);
  const [notificationType, setNotificationType] = useState(
    firstPreset.notificationType
  );
  const [templateKey, setTemplateKey] = useState(firstPreset.templateKey);
  const [templateVersion, setTemplateVersion] = useState(
    firstPreset.templateVersion.toString()
  );
  const [payloadVersion, setPayloadVersion] = useState(
    firstPreset.payloadVersion.toString()
  );
  const [recipientName, setRecipientName] = useState(
    firstPreset.recipientName
  );
  const [payloadJson, setPayloadJson] = useState(firstPreset.payloadJson);
  const [preview, setPreview] = useState<EmailPreviewResponse | null>(null);

  const renderMutation = useMutation({
    mutationFn: renderEmailPreview,
    onSuccess: (data) => {
      setPreview(data);
    },
  });

  const loadPreset = (presetId: string) => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    setSelectedPresetId(preset.id);
    setNotificationType(preset.notificationType);
    setTemplateKey(preset.templateKey);
    setTemplateVersion(preset.templateVersion.toString());
    setPayloadVersion(preset.payloadVersion.toString());
    setRecipientName(preset.recipientName);
    setPayloadJson(preset.payloadJson);
    renderMutation.reset();
  };

  const renderError = renderMutation.error
    ? getPreviewErrorMessage(renderMutation.error)
    : null;

  return (
    <main className="mt-8">
      <div className="container">
        <Link className="btn btn-sm mb-4" to="/admin">
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Admin Dashboard
        </Link>
        <EnvelopeIcon className="h-6 w-6" />
        <h1 className="h1">Email Preview</h1>
        <p className="subtitle">
          Render an email using the production notification renderer.
        </p>
        <hr className="border-main-border my-4" />

        <form
          className="grid gap-6 xl:grid-cols-[minmax(360px,520px)_1fr]"
          onSubmit={(event) => {
            event.preventDefault();
            renderMutation.mutate({
              notificationType,
              payloadJson,
              payloadVersion: Number(payloadVersion),
              recipientName,
              templateKey,
              templateVersion: Number(templateVersion),
            });
          }}
        >
          <section className="flex flex-col gap-4">
            <div>
              <label className="label" htmlFor="email-preview-preset">
                <span className="label-text">Load preset</span>
              </label>
              <select
                className="select select-bordered w-full"
                id="email-preview-preset"
                onChange={(event) => loadPreset(event.target.value)}
                value={selectedPresetId}
              >
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="email-preview-notification">
                <span className="label-text">NotificationType</span>
              </label>
              <input
                className="input input-bordered w-full"
                id="email-preview-notification"
                onChange={(event) => setNotificationType(event.target.value)}
                type="text"
                value={notificationType}
              />
            </div>

            <div>
              <label className="label" htmlFor="email-preview-template">
                <span className="label-text">TemplateKey</span>
              </label>
              <input
                className="input input-bordered w-full"
                id="email-preview-template"
                onChange={(event) => setTemplateKey(event.target.value)}
                type="text"
                value={templateKey}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="email-preview-template-version">
                  <span className="label-text">TemplateVersion</span>
                </label>
                <input
                  className="input input-bordered w-full"
                  id="email-preview-template-version"
                  min={1}
                  onChange={(event) => setTemplateVersion(event.target.value)}
                  type="number"
                  value={templateVersion}
                />
              </div>

              <div>
                <label className="label" htmlFor="email-preview-payload-version">
                  <span className="label-text">PayloadVersion</span>
                </label>
                <input
                  className="input input-bordered w-full"
                  id="email-preview-payload-version"
                  min={1}
                  onChange={(event) => setPayloadVersion(event.target.value)}
                  type="number"
                  value={payloadVersion}
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="email-preview-recipient">
                <span className="label-text">RecipientName</span>
              </label>
              <input
                className="input input-bordered w-full"
                id="email-preview-recipient"
                onChange={(event) => setRecipientName(event.target.value)}
                type="text"
                value={recipientName}
              />
            </div>

            <div>
              <label className="label" htmlFor="email-preview-payload">
                <span className="label-text">PayloadJson</span>
              </label>
              <textarea
                className="textarea textarea-bordered min-h-96 w-full font-mono text-sm"
                id="email-preview-payload"
                onChange={(event) => setPayloadJson(event.target.value)}
                spellCheck={false}
                value={payloadJson}
              />
            </div>

            <button
              className="btn btn-primary w-fit"
              disabled={renderMutation.isPending}
              type="submit"
            >
              {renderMutation.isPending ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  Rendering...
                </>
              ) : (
                <>
                  <EyeIcon className="h-4 w-4" />
                  Preview
                </>
              )}
            </button>

            {renderError ? (
              <div className="alert alert-error">
                <span>{renderError}</span>
              </div>
            ) : null}
          </section>

          <section className="flex min-w-0 flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Subject</h2>
              <div className="mt-2 rounded border border-main-border bg-base-100 p-3">
                {preview?.subject ?? 'No preview rendered yet.'}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold">HTML</h2>
              <iframe
                className="mt-2 h-[640px] w-full rounded border border-main-border bg-white"
                sandbox=""
                srcDoc={preview?.htmlBody ?? ''}
                title="Email HTML preview"
              />
            </div>

            <div>
              <h2 className="text-lg font-semibold">Text</h2>
              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded border border-main-border bg-base-100 p-3 text-sm">
                {preview?.textBody ?? 'No preview rendered yet.'}
              </pre>
            </div>
          </section>
        </form>
      </div>
    </main>
  );
}

function getPreviewErrorMessage(error: unknown) {
  if (error instanceof HttpError) {
    const body = error.body;
    if (typeof body === 'string' && body.trim()) {
      return body;
    }

    if (isEmailPreviewError(body)) {
      return body.error;
    }

    return `Render failed with HTTP ${error.status}.`;
  }

  return error instanceof Error ? error.message : 'Render failed.';
}

function isEmailPreviewError(value: unknown): value is { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'string'
  );
}
