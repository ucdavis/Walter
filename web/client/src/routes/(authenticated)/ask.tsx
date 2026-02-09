import { useEffect, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
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
import {
  ChartSpec,
  ConversationMessage,
  useAskMutation,
} from '@/queries/ask.ts';

export const Route = createFileRoute('/(authenticated)/ask')({
  component: AskPage,
});

interface DisplayMessage extends ConversationMessage {
  charts?: ChartSpec[];
}

const COLORS = [
  '#0047BA',
  '#DAAA00',
  '#007155',
  '#C6542E',
  '#5B7083',
  '#8E6BBF',
  '#2E8B8B',
  '#D4763A',
];

const formatDollar = (value: number) =>
  `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function AskChart({ spec }: { spec: ChartSpec }) {
  const data = spec.data.map((d) => ({
    name: d.label,
    [spec.xKey ?? 'Value']: d.value,
    ...(d.value2 != null ? { [spec.yKey ?? 'Value 2']: d.value2 } : {}),
  }));

  const key1 = spec.xKey ?? 'Value';
  const key2 = spec.yKey ?? 'Value 2';
  const hasValue2 = spec.data.some((d) => d.value2 != null);

  return (
    <div className="bg-base-100 my-3 rounded-lg border p-4">
      <h3 className="mb-3 text-center text-sm font-semibold">{spec.title}</h3>
      <ResponsiveContainer height={300} width="100%">
        {spec.type === 'pie' ? (
          <PieChart>
            <Pie
              cx="50%"
              cy="50%"
              data={data}
              dataKey={key1}
              label={({ name, value }) => `${name}: ${formatDollar(value)}`}
              nameKey="name"
              outerRadius={100}
            >
              {data.map((_, idx) => (
                <Cell
                  fill={COLORS[idx % COLORS.length]}
                  key={`cell-${idx}`}
                />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => formatDollar(v)} />
          </PieChart>
        ) : spec.type === 'line' ? (
          <LineChart data={data}>
            <CartesianGrid stroke="#D8D8D8" strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={formatDollar} />
            <Tooltip formatter={(v: number) => formatDollar(v)} />
            <Legend />
            <Line
              dataKey={key1}
              dot={{ fill: '#0047BA', r: 3 }}
              stroke="#0047BA"
              strokeWidth={2}
              type="monotone"
            />
            {hasValue2 && (
              <Line
                dataKey={key2}
                dot={{ fill: '#DAAA00', r: 3 }}
                stroke="#DAAA00"
                strokeWidth={2}
                type="monotone"
              />
            )}
          </LineChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid stroke="#D8D8D8" strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={formatDollar} />
            <Tooltip formatter={(v: number) => formatDollar(v)} />
            <Legend />
            <Bar dataKey={key1} fill="#0047BA" radius={[4, 4, 0, 0]} />
            {hasValue2 && (
              <Bar dataKey={key2} fill="#DAAA00" radius={[4, 4, 0, 0]} />
            )}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function AskPage() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const askMutation = useAskMutation();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, askMutation.isPending]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || askMutation.isPending) return;

    setInput('');

    const userMessage: DisplayMessage = { role: 'user', content: question };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    try {
      // Strip charts from history sent to backend (only send role+content)
      const history: ConversationMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await askMutation.mutateAsync({
        question,
        conversationHistory: history,
      });

      setMessages([
        ...updatedMessages,
        {
          role: 'assistant',
          content: response.answer,
          charts: response.charts?.length > 0 ? response.charts : undefined,
        },
      ]);
    } catch {
      // Keep user message visible, error shown via askMutation.isError
    }
  };

  return (
    <div className="container">
      <div className="mx-auto flex h-[calc(100vh-8rem)] w-full flex-col sm:max-w-[90%] md:max-w-[80%] xl:max-w-[66%]">
        <div className="pt-10 pb-5">
          <h1 className="text-2xl font-proxima-bold">Ask Walter</h1>
          <p className="text-base-content/70">
            Ask questions about your project finances in plain English.
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto pb-4">
          {messages.length === 0 && (
            <div className="text-base-content/50 py-20 text-center">
              <p className="text-lg">
                Ask a question about your projects to get started.
              </p>
              <p className="mt-2 text-sm">
                For example: &ldquo;What is the remaining balance on project
                K30PR12345?&rdquo;
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}>
              <div
                className={`chat ${msg.role === 'user' ? 'chat-end' : 'chat-start'}`}
              >
                <div
                  className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-primary' : ''}`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
              {msg.charts?.map((chart, ci) => (
                <AskChart key={ci} spec={chart} />
              ))}
            </div>
          ))}

          {askMutation.isPending && (
            <div className="chat chat-start">
              <div className="chat-bubble">
                <span className="loading loading-dots loading-sm" />
              </div>
            </div>
          )}

          {askMutation.isError && !askMutation.isPending && (
            <div className="alert alert-error">
              <span>Something went wrong. Please try again.</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form className="flex gap-2 border-t py-4" onSubmit={handleSubmit}>
          <input
            className="input input-bordered flex-1"
            disabled={askMutation.isPending}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your project finances..."
            type="text"
            value={input}
          />
          <button
            className="btn btn-primary"
            disabled={!input.trim() || askMutation.isPending}
            type="submit"
          >
            {askMutation.isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              'Ask'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
