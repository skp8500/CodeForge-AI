'use client';
import { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { OnMount } from '@monaco-editor/react';
import { useEditorStore, type Language, type EditorTheme } from '@/store/editor-store';
import { STARTER_TEMPLATES, LANGUAGE_LABELS, MONACO_LANGUAGE_MAP } from '@/lib/templates';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const FONT_SIZES = [12, 14, 16, 18] as const;
const THEMES: { value: EditorTheme; label: string }[] = [
  { value: 'vs-dark', label: 'Dark' },
  { value: 'vs-light', label: 'Light' },
  { value: 'hc-black', label: 'High Contrast' },
];

function debounce<F extends (...args: Parameters<F>) => void>(fn: F, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<F>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

interface Props {
  problemId: string;
  onSubmit: () => void;
  onRun: () => void;
}

type MarkerData = {
  severity: number;
  message: string;
  startLineNumber: number;
  endLineNumber: number;
  startColumn: number;
  endColumn: number;
};

function parseCEMarkers(errorText: string): MarkerData[] {
  const markers: MarkerData[] = [];

  // GCC/G++ / Java: file.ext:line:col: error: msg
  const gccRe = /(?:\w+\.\w+):(\d+):(\d+):\s+(?:error|fatal error):\s+(.+)/gm;
  let m: RegExpExecArray | null;
  while ((m = gccRe.exec(errorText)) !== null) {
    markers.push({
      severity: 8,
      message: m[3]!.trim(),
      startLineNumber: parseInt(m[1]!),
      endLineNumber: parseInt(m[1]!),
      startColumn: parseInt(m[2]!),
      endColumn: parseInt(m[2]!) + 1,
    });
  }

  // Python: line N
  if (markers.length === 0) {
    const pyM = /line (\d+)/m.exec(errorText);
    if (pyM) {
      const line = parseInt(pyM[1]!);
      markers.push({
        severity: 8,
        message: errorText.split('\n')[0] ?? errorText,
        startLineNumber: line,
        endLineNumber: line,
        startColumn: 1,
        endColumn: 200,
      });
    }
  }

  return markers;
}

export function CodeEditor({ problemId, onSubmit, onRun }: Props) {
  const { code, language, theme, fontSize, vimMode, verdict, setCode, setLanguage, setTheme, setFontSize, toggleVimMode } =
    useEditorStore();

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const vimRef = useRef<{ dispose: () => void } | null>(null);

  // Autosave debounced
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const save = useCallback(
    debounce((c: string, lang: Language, pid: string) => {
      localStorage.setItem(`code:${pid}:${lang}`, c);
    }, 500),
    [],
  );

  useEffect(() => {
    if (code) save(code, language, problemId);
  }, [code, language, problemId, save]);

  // Initialize code from localStorage on mount / language change
  useEffect(() => {
    const saved = localStorage.getItem(`code:${problemId}:${language}`);
    setCode(saved ?? STARTER_TEMPLATES[language]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, problemId]);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Keyboard shortcuts
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onSubmit);
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        onRun,
      );

      // Apply vim mode if toggled on
      if (vimMode) {
        void import('monaco-vim').then(({ initVimMode }) => {
          const statusBar = document.getElementById('vim-status-bar');
          vimRef.current = initVimMode(editor, statusBar ?? undefined);
        });
      }
    },
    [onSubmit, onRun, vimMode],
  );

  // Toggle vim mode dynamically
  useEffect(() => {
    if (!editorRef.current) return;
    if (vimMode) {
      void import('monaco-vim').then(({ initVimMode }) => {
        const statusBar = document.getElementById('vim-status-bar');
        vimRef.current?.dispose();
        vimRef.current = initVimMode(editorRef.current!, statusBar ?? undefined);
      });
    } else {
      vimRef.current?.dispose();
      vimRef.current = null;
    }
  }, [vimMode]);

  // Set Monaco error markers when a CE verdict arrives; clear them otherwise
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    if (verdict?.verdict === 'CE' && verdict.compileError) {
      monaco.editor.setModelMarkers(model, 'judge', parseCEMarkers(verdict.compileError));
    } else {
      monaco.editor.setModelMarkers(model, 'judge', []);
    }
  }, [verdict]);

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang, problemId);
  };

  return (
    <div className="flex h-full flex-col bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-gray-800 px-3 py-1.5">
        {/* Language selector */}
        <select
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value as Language)}
          className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => (
            <option key={lang} value={lang}>
              {LANGUAGE_LABELS[lang]}
            </option>
          ))}
        </select>

        {/* Theme */}
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as EditorTheme)}
          className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {THEMES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        {/* Font size */}
        <select
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}px
            </option>
          ))}
        </select>

        {/* Vim mode */}
        <button
          onClick={toggleVimMode}
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
            vimMode
              ? 'bg-brand-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          VIM
        </button>

        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          <span>Ctrl+Enter to submit</span>
          <span>Ctrl+Shift+Enter to run</span>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <MonacoEditor
          height="100%"
          language={MONACO_LANGUAGE_MAP[language]}
          theme={theme}
          value={code}
          onChange={(v) => setCode(v ?? '')}
          onMount={handleMount}
          options={{
            fontSize,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            tabSize: language === 'python' ? 4 : 4,
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>

      {/* Vim status bar */}
      {vimMode && (
        <div
          id="vim-status-bar"
          className="border-t border-gray-800 px-3 py-0.5 font-mono text-xs text-gray-400"
        />
      )}
    </div>
  );
}
