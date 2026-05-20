import { fetchJson } from '@/lib/api.ts';

export type EmailPreviewRequest = {
  notificationType: string;
  payloadJson: string;
  payloadVersion: number;
  recipientName: string;
  templateKey: string;
  templateVersion: number;
};

export type EmailPreviewResponse = {
  htmlBody: string;
  subject: string;
  textBody: string;
};

export async function renderEmailPreview(
  input: EmailPreviewRequest
): Promise<EmailPreviewResponse> {
  return await fetchJson<EmailPreviewResponse>('/api/admin/email-preview/render', {
    body: JSON.stringify(input),
    method: 'POST',
  });
}
