import { HttpError } from '@/lib/api.ts';
import type {
  Projection,
  SaveProjectionRequest,
} from '@/queries/projections.ts';

export type PreviewSaveOutcome = 'success' | 'failure' | 'lost-response';

interface PreviewStatus {
  hold: boolean;
  outcome: PreviewSaveOutcome;
  pending: number;
  reloads: number;
  requests: number;
  storedSalary: number | null;
  updatedAt: string;
}

function nextTimestamp(timestamp: string) {
  const [seconds, fraction = ''] = timestamp.replace(/Z$/, '').split('.');
  const ticks = Number(fraction.padEnd(7, '0')) + 1;
  return `${seconds}.${String(ticks).padStart(7, '0')}Z`;
}

/** A synthetic saved document for the separate development preview. Nothing leaves this tab. */
export function createProjectionPreviewServer(initialPlan: Projection) {
  let stored: Projection | null = structuredClone(initialPlan);
  let hold = false;
  let outcome: PreviewSaveOutcome = 'success';
  let reloads = 0;
  const requests: SaveProjectionRequest[] = [];
  const pending: (() => void)[] = [];
  const listeners = new Set<() => void>();
  let status: PreviewStatus = {
    hold,
    outcome,
    pending: 0,
    reloads,
    requests: 0,
    storedSalary: stored.appointments[0]?.monthlySalary ?? null,
    updatedAt: stored.updatedAt,
  };

  const publish = () => {
    status = {
      hold,
      outcome,
      pending: pending.length,
      reloads,
      requests: requests.length,
      storedSalary: stored?.appointments[0]?.monthlySalary ?? null,
      updatedAt: stored?.updatedAt ?? 'Deleted',
    };
    for (const listener of listeners) {
      listener();
    }
  };
  const url = `/api/projections/${initialPlan.id}`;
  const missing = () => new HttpError(404, url, 'This plan was deleted.');

  return {
    deleteRemotely: () => {
      stored = null;
      publish();
    },
    editRemotely: () => {
      if (!stored) {
        return;
      }
      stored.name = 'Plan edited by another user';
      if (stored.appointments[0]) {
        stored.appointments[0].monthlySalary = 128_000 / 12;
      }
      stored.updatedAt = nextTimestamp(stored.updatedAt);
      stored.updatedBy = 'Another user';
      publish();
    },
    finishNextSave: () => {
      pending.shift()?.();
      publish();
    },
    getStatus: () => status,
    read: () =>
      structuredClone({ pending: pending.length, reloads, requests, stored }),
    reload: async () => {
      reloads++;
      publish();
      if (!stored) {
        throw missing();
      }
      return structuredClone(stored);
    },
    resetRemotely: () => {
      if (!stored) {
        return;
      }
      const updatedAt = nextTimestamp(stored.updatedAt);
      const seededAt = nextTimestamp(stored.seededAt);
      stored = { ...structuredClone(initialPlan), seededAt, updatedAt };
      for (const source of stored.fundingSources) {
        source.capturedAt = seededAt;
      }
      publish();
    },
    save: async (request: SaveProjectionRequest) => {
      const submitted = structuredClone(request);
      requests.push(submitted);
      const nextOutcome = outcome;
      outcome = 'success';
      publish();
      if (hold) {
        await new Promise<void>((resolve) => {
          pending.push(resolve);
          publish();
        });
      }
      if (nextOutcome === 'failure') {
        publish();
        throw new TypeError('Synthetic save request failed.');
      }
      if (!stored) {
        throw missing();
      }
      if (stored.seededAt !== submitted.expectedSeededAt) {
        throw new HttpError(409, url, {
          code: 'snapshotChanged',
          message: 'The saved snapshot was reset.',
        });
      }
      if (
        !submitted.overwrite &&
        stored.updatedAt !== submitted.expectedUpdatedAt
      ) {
        throw new HttpError(409, url, {
          code: 'conflict',
          message: 'Someone else changed this plan.',
        });
      }
      stored = {
        ...stored,
        appointments: submitted.appointments,
        fundingSources: submitted.fundingSources,
        historyMonths: submitted.historyMonths,
        name: submitted.name,
        updatedAt: nextTimestamp(stored.updatedAt),
        updatedBy: 'Preview user',
      };
      publish();
      if (nextOutcome === 'lost-response') {
        throw new TypeError('Synthetic save response was lost.');
      }
      return structuredClone(stored);
    },
    setHold: (value: boolean) => {
      hold = value;
      publish();
    },
    setOutcome: (value: PreviewSaveOutcome) => {
      outcome = value;
      publish();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type ProjectionPreviewServer = ReturnType<
  typeof createProjectionPreviewServer
>;
