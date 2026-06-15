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
    <section className="mt-8 mb-10">
      <div className="max-w-4xl">
        <h1 className="h1">Spend Intelligence Workspace</h1>
        <p className="subtitle mt-1">PURCHASING ASSISTANT</p>
        <p className="mt-3 max-w-3xl text-base leading-7 text-base-content/80">
          Walter uses AI to answer questions about purchasing data. Responses may contain inaccuracies and should be verified before making business decisions.
        </p>
          </div>

      <section
        className="card bg-base-100 border border-main-border shadow-sm mt-6"
        id="procurement-assistant"
      >
        <div className="card-body gap-5">
          <div className="max-w-3xl">
            <h2 className="h2">Ask a Question</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((example) => (
              <button
                className="btn btn-sm btn-outline"
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

          <div className="rounded-md border border-main-border bg-base-200 p-4">
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
                 Ask questions about suppliers, purchases, categories, and spend.
              </p>
              <button
                className="btn btn-primary"
                disabled={mutation.isPending || !question.trim()}
                onClick={() => handleSubmit(question)}
                type="button"
              >
                {mutation.isPending
                  ? 'Running query...'
                  : 'Run procurement query'}
              </button>
            </div>
          </div>

          {mutation.isError ? (
            <div className="alert alert-error">
              <span>{getErrorMessage(mutation.error)}</span>
            </div>
          ) : null}

          {mutation.data ? (
            <SpendAnalysisResults response={mutation.data} />
          ) : (
            <div className="rounded-md border border-dashed border-main-border bg-base-200/70 p-6 text-base-content/70">
              Run a sample question to preview the answer card, charts, table,
              and tool trace.
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function SpendAnalysisResults({
  response,
}: {
  response: SpendAnalysisResponse;
}) {
  const supportingTable = response.supportingTable;

  return (
    <div className="mt-6 space-y-5">
      <section className="card bg-base-100 border border-main-border shadow-sm">
        <div className="card-body gap-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <h2 className="h2">Answer</h2>
              <p className="text-lg leading-7 text-base-content/85">
                {response.answerText}
              </p>
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

          <div className="fancy-data mb-0 mt-0">
            <dl className="grid gap-6 md:grid-cols-3">
              {response.summaryCards.map((card) => (
                <div key={card.label}>
                  <dt className="stat-label">{card.label}</dt>
                  <dd className="stat-value-lg mt-2">{card.value}</dd>
                  {card.description ? (
                    <dd className="mt-2 text-sm text-base-content/70">
                      {card.description}
                    </dd>
                  ) : null}
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {response.charts.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {response.charts.map((chart) => (
            <SpendAnalysisChartCard chart={chart} key={chart.title} />
          ))}
        </div>
      ) : null}

      {supportingTable ? (
        <section className="card bg-base-100 border border-main-border shadow-sm">
          <div className="card-body">
            <h2 className="h2">{supportingTable.title}</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="table walter-table">
                <thead>
                  <tr>
                    {supportingTable.columns.map((column) => (
                      <th className="whitespace-nowrap" key={column}>
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supportingTable.rows.map((row, rowIndex) => (
                    <tr key={`${supportingTable.title}-${rowIndex}`}>
                      {supportingTable.columns.map((column) => (
                        <td key={column}>{row[column] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
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
        <section className="card bg-base-100 border border-main-border shadow-sm">
          <div className="card-body">
            <h2 className="h2">Audit Summary</h2>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-base-content/80">
              {response.auditSummary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </section>

        <details className="card bg-base-100 border border-main-border shadow-sm">
          <summary className="cursor-pointer px-6 pt-6 text-2xl font-proxima-bold">
            Query Trace
          </summary>

          {response.trace ? (
            <div className="space-y-4 px-6 pb-6 pt-4">
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
                  className="rounded-md border border-main-border bg-base-200 p-4"
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
                  className="rounded-md border border-main-border bg-base-200 p-4"
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
                  <pre className="mt-3 overflow-x-auto rounded-md bg-neutral p-3 text-xs text-neutral-content">
                    {toolCall.payloadJson}
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-6 pb-6 pt-4 text-sm text-base-content/70">
              Trace output is not available for this response.
            </p>
          )}
        </details>
      </div>
    </div>
  );
}

function FindingsCard({ items, title }: { items: string[]; title: string }) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="card bg-base-100 border border-main-border shadow-sm">
      <div className="card-body">
        <h2 className="h2">{title}</h2>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-base-content/80">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SpendAnalysisChartCard({
  chart,
}: {
  chart: SpendAnalysisChartPayload;
}) {
  return (
    <section className="card bg-base-100 border border-main-border shadow-sm">
      <div className="card-body">
        <h2 className="h2">{chart.title}</h2>
        <div className="mt-4 h-80">
          <ResponsiveContainer height="100%" width="100%">
            {renderChart(chart)}
          </ResponsiveContainer>
        </div>
      </div>
    </section>
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
