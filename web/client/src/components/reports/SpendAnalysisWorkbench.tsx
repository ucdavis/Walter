'use no memo';

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { HttpError } from '@/lib/api.ts';
import {
  SpendAnalysisChartPayload,
  SpendAnalysisResponse,
  useSpendAnalysisMutation,
} from '@/queries/spendAnalysis.ts';

const EXAMPLE_QUESTIONS = [
  'What do we buy at Amazon?',
  'Where do we buy gravel?',
  'Have we purchased fire hoses before?',
  'What suppliers do we use for gift cards?',
  'Give me the top categories we buy from Grainger.',
];

const CHART_COLORS = ['#0b6e4f', '#f18f01', '#2e86ab', '#c73e1d', '#6c584c'];

export function SpendAnalysisWorkbench() {
  const [question, setQuestion] = useState(EXAMPLE_QUESTIONS[0]);
  const mutation = useSpendAnalysisMutation();

  function handleSubmit(nextQuestion: string) {
    const trimmedQuestion = nextQuestion.trim();
    if (!trimmedQuestion) {
      return;
    }

    mutation.mutate({ question: trimmedQuestion });
  }

  return (
    <section className="py-8 md:py-10">
      <div className="rounded-[2rem] border border-main-border bg-[radial-gradient(circle_at_top_left,_rgba(2,87,151,0.12),_transparent_38%),linear-gradient(135deg,_rgba(244,194,0,0.16),_rgba(250,250,250,0.98)_42%,_rgba(0,150,136,0.08))] p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-proxima-bold text-primary">
              Spend Intelligence Console
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-base-content/75">
              Ask procurement questions about suppliers, items, categories, and
              spend. Walter now uses model-driven tool selection to answer questions about purchasing data.
            </p>
          </div>

          
        </div>
      </div>

      <section
        className="mt-6 rounded-[2rem] border border-base-300 bg-[linear-gradient(135deg,rgba(11,110,79,0.08),rgba(241,143,1,0.12),rgba(255,255,255,0.9))] p-6 shadow-sm"
        id="procurement-assistant"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-base-content/60">
              Procurement Assistant
            </p>
            <div className="space-y-2">
              <h2 className="h2 mb-0">Ask a Question</h2>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.map((example) => (
            <button
              className="btn btn-sm btn-outline rounded-full"
              key={example}
              onClick={() => {
                setQuestion(example);
                handleSubmit(example);
              }}
              type="button"
            >
              {example}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-base-300 bg-base-100/90 p-4">
          <label className="form-control gap-3">
            <textarea
              className="textarea textarea-bordered min-h-28 w-full text-base"
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Try: What suppliers do we use for merchant gift cards?"
              value={question}
            />
          </label>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-base-content/70">
              Ask a question about your procurement data.
            </p>
            <button
              className="btn btn-primary"
              disabled={mutation.isPending || !question.trim()}
              onClick={() => handleSubmit(question)}
              type="button"
            >
              {mutation.isPending ? 'Running query…' : 'Run procurement query'}
            </button>
          </div>
        </div>

        {mutation.isError ? (
          <div className="alert alert-error mt-5">
            <span>{getErrorMessage(mutation.error)}</span>
          </div>
        ) : null}

        {mutation.data ? (
          <SpendAnalysisResults response={mutation.data} />
        ) : (
          <div className="mt-5 rounded-[1.5rem] border border-dashed border-base-300 bg-base-100/70 p-6 text-base-content/70">
            Run a sample question to preview the answer card, charts, table,
            and tool trace.
          </div>
        )}
      </section>
    </section>
  );
}

function SpendAnalysisResults({
  response,
}: {
  response: SpendAnalysisResponse;
}) {
  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-[1.5rem] bg-base-100 p-5 shadow-sm ring-1 ring-base-300">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-base-content/60">
              Answer
            </p>
            <h3 className="text-2xl font-semibold leading-tight">
              {response.answerText}
            </h3>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="badge badge-neutral">{response.intent}</div>
            <div className="badge badge-outline">
              confidence: {response.confidence}
            </div>
            {response.entity ? (
              <div className="badge badge-outline">
                {response.entity.type}: {response.entity.value}
              </div>
            ) : null}
            {!response.isConfigured ? (
              <div className="badge badge-warning">Needs configuration</div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {response.summaryCards.map((card) => (
            <div
              className="rounded-2xl border border-base-300 bg-base-200/60 p-4"
              key={card.label}
            >
              <div className="text-sm font-medium text-base-content/65">
                {card.label}
              </div>
              <div className="mt-2 text-2xl font-semibold">{card.value}</div>
              {card.description ? (
                <div className="mt-2 text-sm text-base-content/70">
                  {card.description}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {response.charts.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {response.charts.map((chart) => (
            <SpendAnalysisChartCard chart={chart} key={chart.title} />
          ))}
        </div>
      ) : null}

      {response.supportingTable ? (
        <div className="rounded-[1.5rem] border border-base-300 bg-base-100 p-5 shadow-sm">
          <h3 className="text-xl font-semibold">
            {response.supportingTable.title}
          </h3>
          <div className="mt-4 overflow-x-auto">
            <table className="table table-zebra">
              <thead>
                <tr>
                  {response.supportingTable.columns.map((column) => (
                    <th className="whitespace-nowrap" key={column}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {response.supportingTable.rows.map((row, rowIndex) => (
                  <tr key={`${response.supportingTable.title}-${rowIndex}`}>
                    {response.supportingTable.columns.map((column) => (
                      <td key={column}>{row[column] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {response.confirmedFindings.length ||
      response.supportingFindings.length ||
      response.exploratoryFindings.length ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <FindingsCard
            items={response.confirmedFindings}
            title="Confirmed Findings"
          />
          <FindingsCard
            items={response.supportingFindings}
            title="Supporting Findings"
          />
          <FindingsCard
            items={response.exploratoryFindings}
            title="Exploratory Findings"
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-[1.5rem] border border-base-300 bg-base-100 p-5 shadow-sm">
          <h3 className="text-xl font-semibold">Audit Summary</h3>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-base-content/80">
            {response.auditSummary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <details className="rounded-[1.5rem] border border-base-300 bg-base-100 p-5 shadow-sm">
          <summary className="cursor-pointer text-xl font-semibold">
            Query Trace
          </summary>

          {response.trace ? (
            <div className="mt-4 space-y-4">
              <div className="text-sm text-base-content/75">
                Intent: {response.trace.inferredIntent}
              </div>
              <div className="text-sm text-base-content/75">
                Resolved entity: {response.trace.resolvedEntity ?? 'unknown'}
              </div>
              <div className="text-sm text-base-content/75">
                Final answer source: {response.trace.finalAnswerSource}
              </div>
              <div className="text-sm text-base-content/75">
                Expansions:{' '}
                {response.trace.queryExpansions.join(', ') || 'none'}
              </div>

              {response.trace.evidenceAssessments.map((assessment) => (
                <div
                  className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"
                  key={assessment.assessmentId}
                >
                  <div className="font-semibold">
                    {assessment.assessmentId}: {assessment.evidenceState}
                  </div>
                  <div className="mt-1 text-sm text-base-content/75">
                    {assessment.summary}
                  </div>
                  <div className="mt-2 text-xs text-base-content/65">
                    Confidence: {assessment.confidence}
                  </div>
                  <div className="mt-1 text-xs text-base-content/65">
                    Focus: {assessment.focus || 'n/a'}
                  </div>
                  <div className="mt-1 text-xs text-base-content/65">
                    Suggested filters:{' '}
                    {Object.entries(assessment.suggestedFilters)
                      .map(([key, value]) => `${key}=${value}`)
                      .join(', ') || 'none'}
                  </div>
                </div>
              ))}

              {response.trace.toolCalls.map((toolCall, index) => (
                <div
                  className="rounded-2xl border border-base-300 bg-base-200/50 p-4"
                  key={`${toolCall.toolName}-${index}`}
                >
                  <div className="font-semibold">{toolCall.toolName}</div>
                  <div className="mt-1 text-sm text-base-content/75">
                    {toolCall.reason}
                  </div>
                  <div className="mt-2 text-xs text-base-content/65">
                    Query: {toolCall.queryText || '(filter only)'}
                  </div>
                  <div className="mt-1 text-xs text-base-content/65">
                    Filters: {toolCall.filtersApplied.join(', ') || 'none'}
                  </div>
                  <div className="mt-1 text-xs text-base-content/65">
                    Top result IDs: {toolCall.topResultIds.join(', ') || 'none'}
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded-xl bg-neutral p-3 text-xs text-neutral-content">
                    {toolCall.payloadJson}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-base-content/70">
              Trace output is not available for this response.
            </p>
          )}
        </details>
      </div>
    </div>
  );
}

function FindingsCard({
  items,
  title,
}: {
  items: string[];
  title: string;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="rounded-[1.5rem] border border-base-300 bg-base-100 p-5 shadow-sm">
      <h3 className="text-xl font-semibold">{title}</h3>
      <ul className="mt-4 space-y-2 text-sm leading-6 text-base-content/80">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function SpendAnalysisChartCard({
  chart,
}: {
  chart: SpendAnalysisChartPayload;
}) {
  return (
    <div className="rounded-[1.5rem] border border-base-300 bg-base-100 p-5 shadow-sm">
      <h3 className="text-xl font-semibold">{chart.title}</h3>
      <div className="mt-4 h-80">
        <ResponsiveContainer height="100%" width="100%">
          {renderChart(chart)}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SummaryChip({
  label,
  note,
  value,
}: {
  label: string;
  note: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-base-300 bg-base-100/85 px-4 py-3 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-base-content/55">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-base-content">{value}</div>
      <div className="mt-1 text-sm text-base-content/70">{note}</div>
    </div>
  );
}

function renderChart(chart: SpendAnalysisChartPayload) {
  switch (chart.kind) {
    case 'line':
      return (
        <LineChart data={chart.data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={chart.xKey} />
          <YAxis />
          <Tooltip />
          <Legend />
          {chart.yKeys.map((yKey, index) => (
            <Line
              dataKey={yKey}
              dot={false}
              key={yKey}
              stroke={CHART_COLORS[index % CHART_COLORS.length]}
              strokeWidth={2.5}
              type="monotone"
            />
          ))}
        </LineChart>
      );
    case 'pie': {
      const valueKey = chart.yKeys[0] ?? 'amount';
      return (
        <PieChart>
          <Tooltip />
          <Legend />
          <Pie data={chart.data} dataKey={valueKey} nameKey={chart.xKey}>
            {chart.data.map((entry) => (
              <Cell
                fill={
                  CHART_COLORS[
                    Math.abs(String(entry[chart.xKey] ?? '').length) %
                      CHART_COLORS.length
                  ]
                }
                key={String(entry[chart.xKey] ?? '')}
              />
            ))}
          </Pie>
        </PieChart>
      );
    }
    default:
      return (
        <BarChart data={chart.data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={chart.xKey} />
          <YAxis />
          <Tooltip />
          <Legend />
          {chart.yKeys.map((yKey, index) => (
            <Bar
              dataKey={yKey}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
              key={yKey}
              radius={[8, 8, 0, 0]}
            />
          ))}
        </BarChart>
      );
  }
}

function getErrorMessage(error: Error) {
  if (error instanceof HttpError) {
    if (
      error.body &&
      typeof error.body === 'object' &&
      'message' in error.body &&
      typeof error.body.message === 'string' &&
      error.body.message.trim()
    ) {
      return error.body.message;
    }

    return error.message;
  }

  return 'We could not answer that procurement question right now.';
}
