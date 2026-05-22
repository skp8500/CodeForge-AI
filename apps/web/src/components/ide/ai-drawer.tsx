'use client';
import { useRef, useEffect } from 'react';
import { useEditorStore } from '@/store/editor-store';
import { explainProblem, sendFollowup } from '@/lib/api';

interface Props {
  problemId: string;
}

const LEVELS = [
  { value: 'eli5', label: 'ELI5', desc: 'Simple analogies, no jargon' },
  { value: 'standard', label: 'Standard', desc: 'Walk-through with hints' },
  { value: 'expert', label: 'Expert', desc: 'Algorithm taxonomy + complexity' },
] as const;

export function AiDrawer({ problemId }: Props) {
  const {
    drawerOpen,
    closeDrawer,
    aiLevel,
    setAiLevel,
    aiExplanation,
    setAiExplanation,
    aiLoading,
    setAiLoading,
    conversationHistory,
    addHistory,
    followupInput,
    setFollowupInput,
  } = useEditorStore();

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationHistory, aiExplanation]);

  const handleExplain = async () => {
    setAiLoading(true);
    setAiExplanation(null);
    try {
      const data = await explainProblem({ problemId, level: aiLevel });
      setAiExplanation(data.explanation);
    } catch (err) {
      setAiExplanation(`Error: ${err instanceof Error ? err.message : 'Request failed'}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleFollowup = async () => {
    const question = followupInput.trim();
    if (!question || aiLoading) return;
    setFollowupInput('');
    addHistory({ role: 'user', content: question });
    setAiLoading(true);
    try {
      const data = await sendFollowup({ problemId, question, conversationHistory });
      addHistory({ role: 'assistant', content: data.answer });
    } catch (err) {
      addHistory({
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Request failed'}`,
      });
    } finally {
      setAiLoading(false);
    }
  };

  if (!drawerOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={closeDrawer}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-full flex-col bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <span className="font-semibold text-gray-100">✨ AI Problem Explainer</span>
          <button
            onClick={closeDrawer}
            className="text-gray-500 hover:text-gray-200 text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Level selector */}
        <div className="border-b border-gray-800 p-3">
          <div className="flex gap-2">
            {LEVELS.map(({ value, label, desc }) => (
              <button
                key={value}
                onClick={() => setAiLevel(value)}
                className={`flex-1 rounded border px-2 py-2 text-center transition-colors ${
                  aiLevel === value
                    ? 'border-brand-500 bg-brand-600/20 text-brand-300'
                    : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300'
                }`}
              >
                <div className="text-xs font-semibold">{label}</div>
                <div className="mt-0.5 text-[10px] opacity-70 leading-tight">{desc}</div>
              </button>
            ))}
          </div>
          <button
            onClick={() => void handleExplain()}
            disabled={aiLoading}
            className="mt-2 w-full rounded bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {aiLoading && !conversationHistory.length ? 'Explaining…' : 'Explain Problem'}
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Initial explanation */}
          {aiLoading && !aiExplanation && !conversationHistory.length && (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-gray-800" style={{ width: `${70 + i * 7}%` }} />
              ))}
            </div>
          )}

          {aiExplanation && (
            <div className="rounded-lg bg-gray-800/60 p-3 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
              {aiExplanation}
            </div>
          )}

          {/* Conversation history */}
          {conversationHistory.map((msg, i) => (
            <div
              key={i}
              className={`rounded-lg p-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'ml-6 bg-brand-600/20 text-brand-200'
                  : 'mr-6 bg-gray-800/60 text-gray-200'
              }`}
            >
              <div className="mb-1 text-xs font-semibold opacity-60">
                {msg.role === 'user' ? 'You' : 'AI'}
              </div>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))}

          {aiLoading && conversationHistory.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="animate-spin">⏳</span> Thinking…
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Follow-up input */}
        {(aiExplanation || conversationHistory.length > 0) && (
          <div className="border-t border-gray-800 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={followupInput}
                onChange={(e) => setFollowupInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleFollowup();
                  }
                }}
                placeholder="Ask a follow-up question…"
                disabled={aiLoading}
                className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:border-brand-500 focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={() => void handleFollowup()}
                disabled={aiLoading || !followupInput.trim()}
                className="rounded bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
