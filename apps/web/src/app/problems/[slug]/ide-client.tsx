'use client';
import { useEffect, useState } from 'react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { ProblemPanel } from '@/components/ide/problem-panel';
import { CodeEditor } from '@/components/ide/code-editor';
import { TestPanel } from '@/components/ide/test-panel';
import { AiDrawer } from '@/components/ide/ai-drawer';
import { useEditorStore } from '@/store/editor-store';
import { useSubmission } from '@/hooks/use-submission';
import type { ProblemDetail } from '@/lib/api';

interface Props {
  problem: ProblemDetail;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

export function IdeClient({ problem }: Props) {
  const { language, code, loadSavedCode } = useEditorStore();
  const { submit, run, cancel } = useSubmission(problem.id, language, code);
  const isMobile = useIsMobile();
  const [mobileShowProblem, setMobileShowProblem] = useState(false);

  // Load saved code from localStorage on mount
  useEffect(() => {
    loadSavedCode(problem.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem.id]);

  if (isMobile) {
    return (
      <div className="flex h-screen flex-col bg-gray-950">
        {/* Mobile header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
          <h1 className="text-sm font-medium text-gray-200 truncate max-w-[200px]">
            {problem.title}
          </h1>
          <button
            onClick={() => setMobileShowProblem((v) => !v)}
            className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300"
          >
            {mobileShowProblem ? '⌨ Editor' : '📄 Problem'}
          </button>
        </div>

        {mobileShowProblem ? (
          <div className="flex-1 overflow-hidden">
            <ProblemPanel problem={problem} />
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden" style={{ minHeight: '55%' }}>
              <CodeEditor problemId={problem.id} onSubmit={submit} onRun={run} />
            </div>
            <div className="overflow-hidden" style={{ height: '45%' }}>
              <TestPanel problem={problem} onRun={run} onSubmit={submit} onCancel={cancel} />
            </div>
          </div>
        )}

        <AiDrawer problemId={problem.id} />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-950">
      <PanelGroup orientation="horizontal" className="flex-1">
        {/* Left panel — Problem statement */}
        <Panel defaultSize="38%" minSize="20%" maxSize="55%">
          <ProblemPanel problem={problem} />
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-gray-800 hover:bg-brand-600 transition-colors cursor-col-resize" />

        {/* Right — Editor + Test runner */}
        <Panel defaultSize="62%" minSize="30%">
          <PanelGroup orientation="vertical">
            {/* Monaco editor */}
            <Panel defaultSize="68%" minSize="30%">
              <CodeEditor problemId={problem.id} onSubmit={submit} onRun={run} />
            </Panel>

            <PanelResizeHandle className="h-1.5 bg-gray-800 hover:bg-brand-600 transition-colors cursor-row-resize" />

            {/* Test runner */}
            <Panel defaultSize="32%" minSize="15%">
              <TestPanel problem={problem} onRun={run} onSubmit={submit} onCancel={cancel} />
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>

      {/* AI Explanation drawer (overlay) */}
      <AiDrawer problemId={problem.id} />
    </div>
  );
}
