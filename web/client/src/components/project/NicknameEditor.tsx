import { useState } from 'react';
import { PencilIcon } from '@heroicons/react/24/outline';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  projectNicknamesQueryKey,
  upsertProjectNickname,
  useProjectNicknames,
} from '@/queries/projectNicknames.ts';

const NICKNAME_MAX_LENGTH = 40;

interface NicknameEditorProps {
  /** Owner of the portfolio page being viewed; the server checks access against it. */
  iamId: string;
  officialName: string;
  projectNumber: string;
  /** Omit to nickname the project itself. */
  taskNumber?: string;
}

export function NicknameEditor(props: NicknameEditorProps) {
  const nicknames = useProjectNicknames();
  return nicknames.enabled ? <EnabledNicknameEditor {...props} /> : null;
}

function EnabledNicknameEditor({
  iamId,
  officialName,
  projectNumber,
  taskNumber,
}: NicknameEditorProps) {
  const nicknames = useProjectNicknames();
  const current = taskNumber
    ? nicknames.task(projectNumber, taskNumber)
    : nicknames.project(projectNumber);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const save = useMutation({
    mutationFn: (nickname: string) =>
      upsertProjectNickname({
        iamId,
        nickname,
        projectNumber,
        ...(taskNumber ? { taskNumber } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: projectNicknamesQueryKey,
      });
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <button
        aria-label={`Edit nickname for ${officialName}`}
        className="btn btn-ghost btn-xs btn-square text-base-content/70"
        onClick={() => {
          setDraft(current ?? '');
          save.reset();
          setOpen(true);
        }}
        title="Edit nickname"
        type="button"
      >
        <PencilIcon aria-hidden="true" className="h-4 w-4" />
      </button>
    );
  }

  return (
    <form
      className="inline-flex flex-wrap items-center gap-2 text-sm font-normal"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(draft.trim());
      }}
    >
      <input
        aria-label="Nickname"
        autoFocus
        className="input input-sm w-64"
        maxLength={NICKNAME_MAX_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder="Short name everyone will see"
        value={draft}
      />
      <button
        className="btn btn-primary btn-sm"
        disabled={save.isPending}
        type="submit"
      >
        Save
      </button>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(false)}
        type="button"
      >
        Cancel
      </button>
      {current && (
        <button
          className="btn btn-ghost btn-sm"
          disabled={save.isPending}
          onClick={() => save.mutate('')}
          type="button"
        >
          Use official name
        </button>
      )}
      {save.isError && (
        <span className="text-error" role="alert">
          Could not save nickname.
        </span>
      )}
    </form>
  );
}
