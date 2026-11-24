import { useProjectNicknames } from '@/queries/projectNicknames.ts';
import { TooltipLabel } from '@/shared/TooltipLabel.tsx';

type Secondary = 'below' | 'tooltip';

interface NicknamedProps {
  name: string | null;
  nickname: string | undefined;
  secondary: Secondary;
}

// The official name always stays reachable: beneath the nickname, or in its tooltip.
function Nicknamed({ name, nickname, secondary }: NicknamedProps) {
  if (!nickname) {
    return name ? <>{name}</> : null;
  }

  if (!name) {
    return <>{nickname}</>;
  }

  if (secondary === 'tooltip') {
    return (
      <TooltipLabel
        focusable={false}
        label={nickname}
        screenReaderLabel={`${nickname} (${name})`}
        tooltip={name}
      />
    );
  }

  return (
    <>
      {nickname}
      <span className="block text-xs font-normal text-base-content/80">
        {name}
      </span>
    </>
  );
}

interface ProjectNameProps {
  name: string;
  projectNumber: string;
  secondary?: Secondary;
}

export function ProjectName({
  name,
  projectNumber,
  secondary = 'below',
}: ProjectNameProps) {
  const nickname = useProjectNicknames().project(projectNumber);
  return <Nicknamed name={name} nickname={nickname} secondary={secondary} />;
}

interface TaskNameProps {
  name: string | null;
  projectNumber: string;
  secondary?: Secondary;
  taskNumber: string;
}

export function TaskName({
  name,
  projectNumber,
  secondary = 'below',
  taskNumber,
}: TaskNameProps) {
  const nickname = useProjectNicknames().task(projectNumber, taskNumber);
  return <Nicknamed name={name} nickname={nickname} secondary={secondary} />;
}
