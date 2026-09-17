import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowPathIcon,
  PaperAirplaneIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { monthLabel } from '@/components/projections/projection.ts';
import { projectionMoney } from '@/components/projections/projectionFormatting.ts';
import {
  planKey,
  projectionFacts,
  type CopilotMessage,
  type CopilotReply,
  type ProjectionPlan,
  type Scenario,
} from '@/components/projections/scenarios.ts';
import {
  ScenarioComparison,
  ScenarioPreview,
} from '@/components/projections/ScenarioReview.tsx';

type Proposal = { basedOn: string; scenario: Scenario };

export default function ProjectionCopilot({
  asOf,
  onApply,
  onUndo,
  plan,
  undo,
}: {
  asOf: string;
  onApply: (plan: ProjectionPlan, title: string) => void;
  onUndo: () => void;
  plan: ProjectionPlan;
  undo: { available: boolean; title: string } | null;
}) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [expanded, setExpanded] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const conversation = useRef<HTMLDivElement | null>(null);
  const currentKey = planKey(plan);
  const currentKeyRef = useRef(currentKey);
  useEffect(() => {
    currentKeyRef.current = currentKey;
  }, [currentKey]);
  useEffect(() => () => controller.current?.abort(), []);
  const facts = useMemo(() => projectionFacts(plan), [plan]);
  const shortfall = [...facts]
    .filter((row) => row.remainingBalance < 0)
    .sort((a, b) => a.remainingBalance - b.remainingBalance)[0];
  const headroom = [...facts]
    .filter((row) => row.remainingBalance > 0)
    .sort((a, b) => b.remainingBalance - a.remainingBalance)[0];
  const status = useQuery({
    queryFn: async () => {
      const response = await fetch('/__demo/projections/chat');
      if (!response.ok) {
        throw new Error('The local copilot is unavailable. Restart the demo.');
      }
      return (await response.json()) as { configured: boolean; model: string };
    },
    queryKey: ['projection-copilot-status'],
    retry: false,
    staleTime: Infinity,
  });
  const request = useMutation({
    mutationFn: async (input: {
      basedOn: string;
      messages: CopilotMessage[];
      plan: ProjectionPlan;
      scenario: Scenario | null;
    }) => {
      controller.current = new AbortController();
      const response = await fetch('/__demo/projections/chat', {
        body: JSON.stringify({
          asOf,
          messages: input.messages,
          plan: input.plan,
          scenario: input.scenario,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: controller.current.signal,
      });
      const data = (await response.json()) as CopilotReply;
      if (!response.ok) {
        throw new Error(data.message || 'The copilot could not answer.');
      }
      if (currentKeyRef.current !== input.basedOn) {
        throw new Error(
          'Your plan changed while I was answering. Ask again using the updated projection.'
        );
      }
      return { ...data, basedOn: input.basedOn };
    },
    onSuccess: (reply) => {
      setMessages((current) => [
        ...current,
        { content: reply.message, role: 'assistant' },
      ]);
      if (reply.scenario) {
        setProposal({ basedOn: reply.basedOn, scenario: reply.scenario });
      }
    },
  });

  useEffect(() => {
    if (conversation.current) {
      conversation.current.scrollTop = conversation.current.scrollHeight;
    }
  }, [messages, request.isPending]);

  function ask(text: string) {
    const content = text.trim();
    if (!content || request.isPending) {
      return;
    }
    const history =
      messages.at(-1)?.role === 'user' && messages.at(-1)?.content === content
        ? messages
        : [...messages, { content, role: 'user' as const }];
    setMessages(history);
    setQuestion('');
    request.mutate({
      basedOn: currentKey,
      messages: history.slice(-14),
      plan,
      scenario: proposal?.scenario ?? null,
    });
  }

  function apply(draft: ProjectionPlan) {
    if (!proposal || proposal.basedOn !== currentKey) {
      return;
    }
    onApply(draft, proposal.scenario.title);
    setMessages((current) => [
      ...current,
      {
        content: `Applied to the working plan: ${proposal.scenario.title}. The timeline and insights now include this change. Undo is available until you edit the plan again.`,
        role: 'assistant',
      },
    ]);
    setProposal(null);
    setExpanded(false);
  }

  function changeScenario(scenario: Scenario) {
    setProposal((current) => (current ? { ...current, scenario } : null));
  }

  const unavailable = status.isPending || !status.data?.configured;
  const stale = proposal !== null && proposal.basedOn !== currentKey;
  return (
    <aside aria-label="Projection copilot" className="projection-copilot">
      <div className="projection-copilot-heading">
        <SparklesIcon aria-hidden="true" className="size-5 text-[#2f7f79]" />
        <h2 className="font-semibold">Projection copilot</h2>
        <span className="ml-auto text-xs text-[#667277]">Demo</span>
      </div>
      <section
        aria-labelledby="projection-insights-title"
        className="border-b border-[#dce4de] p-4"
      >
        <h3 className="projection-eyebrow" id="projection-insights-title">
          What stands out
        </h3>
        {shortfall && (
          <div className="projection-insight mt-3 border-l-[#bd655a]">
            <h4 className="text-sm font-semibold">
              {shortfall.name} runs short
            </h4>
            <p className="mt-2 text-sm text-[#586861]">
              {shortfall.firstDeficitMonth &&
                `First deficit in ${monthLabel(shortfall.firstDeficitMonth)}. `}
              The plan ends {projectionMoney(-shortfall.remainingBalance)} below
              zero.
            </p>
            <p className="mt-2 text-xs text-[#667277]">
              Personnel averages {projectionMoney(shortfall.averageMonthlyCost)}
              /month across {shortfall.spendingMonthCount} funded months.
            </p>
            <button
              className="projection-text-button mt-2"
              disabled={request.isPending || unavailable}
              onClick={() =>
                ask(
                  `Why does ${shortfall.name} run short? Show what I'm spending on personnel and what would need to change.`
                )
              }
              type="button"
            >
              Explain the gap →
            </button>
          </div>
        )}
        {headroom && (
          <div className="projection-insight mt-4 border-l-[#73a58c]">
            <h4 className="text-sm font-semibold">{headroom.name} has room</h4>
            <p className="mt-2 text-sm text-[#586861]">
              {projectionMoney(headroom.remainingBalance)} remains after the
              planned assignments.
            </p>
            <button
              className="projection-text-button mt-2"
              disabled={request.isPending || unavailable}
              onClick={() =>
                ask(
                  `Could I afford an additional grad student on ${headroom.name}? What assumptions do you need?`
                )
              }
              type="button"
            >
              Explore a hire →
            </button>
          </div>
        )}
        {!shortfall && !headroom && (
          <p className="mt-3 text-sm text-[#667277]">
            Add funding and people to explore your projection.
          </p>
        )}
      </section>
      <section aria-label="Ask the copilot" className="p-4">
        <h3 className="text-sm font-semibold">Ask or try a change</h3>
        {!messages.length && (
          <p className="mt-2 text-sm text-[#667277]">
            Ask what is driving a balance, or try a different staffing plan.
          </p>
        )}
        <div
          aria-label="Copilot conversation"
          aria-live="polite"
          className="projection-conversation"
          ref={conversation}
          role="log"
        >
          {messages.map((message, index) => (
            <div
              className={`projection-message ${message.role === 'user' ? 'projection-user-message' : ''}`}
              key={index}
            >
              <p className="mb-1 text-xs font-semibold text-[#667277]">
                {message.role === 'user' ? 'You' : 'Copilot'}
              </p>
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {message.content}
              </div>
            </div>
          ))}
          {request.isPending && (
            <p className="py-3 text-sm text-[#667277]" role="status">
              Checking the projection…
            </p>
          )}
        </div>
        {request.error && (
          <div
            className="my-3 rounded-md bg-[#fff1ec] p-3 text-sm text-[#9a392a]"
            role="alert"
          >
            {request.error.message}
            <button
              className="projection-text-button mt-2 block"
              onClick={() => {
                const last = [...messages]
                  .reverse()
                  .find((row) => row.role === 'user');
                if (last) {
                  ask(last.content);
                }
              }}
              type="button"
            >
              Try again
            </button>
          </div>
        )}
        {proposal && (
          <ScenarioPreview
            asOf={asOf}
            onApply={apply}
            onChange={changeScenario}
            onDismiss={() => setProposal(null)}
            onExpand={() => setExpanded(true)}
            plan={plan}
            scenario={proposal.scenario}
            stale={stale}
          />
        )}
        {undo && (
          <div className="my-3 rounded-md border border-[#cbded4] bg-[#eff7f2] p-3 text-sm">
            <p className="font-medium">Applied: {undo.title}</p>
            {undo.available ? (
              <button
                className="projection-text-button mt-2 inline-flex items-center gap-1"
                onClick={() => {
                  onUndo();
                  setProposal(null);
                  setMessages((current) => [
                    ...current,
                    {
                      content:
                        'Undid the last scenario. The plan is back to the state before that change.',
                      role: 'assistant',
                    },
                  ]);
                }}
                type="button"
              >
                <ArrowPathIcon className="size-4" />
                Undo change
              </button>
            ) : (
              <p className="mt-1 text-xs text-[#667277]">
                The plan was edited afterward, so Undo is no longer available.
              </p>
            )}
          </div>
        )}
        <form
          className="projection-compose mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            ask(question);
          }}
        >
          <label className="sr-only" htmlFor="projection-question">
            Question about the projection
          </label>
          <textarea
            disabled={unavailable}
            id="projection-question"
            maxLength={4000}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What if I hired another grad student?"
            rows={3}
            value={question}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#667277]">
              {plan.fundingSources.length} projects · {plan.people.length}{' '}
              people
            </span>
            <button
              className="projection-primary-button"
              disabled={!question.trim() || request.isPending || unavailable}
              type="submit"
            >
              <PaperAirplaneIcon className="size-4" />
              Ask
            </button>
          </div>
        </form>
        {status.data && !status.data.configured && (
          <p className="mt-3 text-xs text-[#9a392a]" role="status">
            OpenAI is not configured. Add OPENAI_API_KEY to
            web/client/.env.demo.local and restart the demo.
          </p>
        )}
        {status.error && (
          <p className="mt-3 text-xs text-[#9a392a]" role="alert">
            {status.error.message}
          </p>
        )}
        <p className="mt-3 text-xs text-[#667277]">
          Proposals are temporary. Review the assumptions before applying.
        </p>
      </section>
      {expanded && proposal && (
        <ScenarioComparison
          asOf={asOf}
          onApply={apply}
          onChange={changeScenario}
          onClose={() => setExpanded(false)}
          plan={plan}
          scenario={proposal.scenario}
          stale={stale}
        />
      )}
    </aside>
  );
}
