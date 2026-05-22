'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  parseProblem,
  createProblem,
  publishProblem,
  generateTests,
  getAllTags,
  type GeneratedTestCase,
} from '@/lib/api';
import { DifficultyBadge } from '@/components/ui/difficulty-badge';

// ─── Schema ────────────────────────────────────────────────────────────────────

const ConstraintRow = z.object({
  variable: z.string().min(1, 'Required'),
  min: z.number({ invalid_type_error: 'Number required' }),
  max: z.number({ invalid_type_error: 'Number required' }),
  description: z.string(),
});

const SampleRow = z.object({
  input: z.string().min(1, 'Input required'),
  output: z.string().min(1, 'Output required'),
  explanation: z.string(),
});

const CreatorSchema = z.object({
  rawText: z.string().min(10, 'At least 10 characters required'),
  title: z.string().min(3, 'Min 3 characters').max(255),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string()),
  timeLimitMs: z.number().int().min(100).max(60_000),
  memoryLimitMb: z.number().int().min(16).max(2048),
  statement: z.string().min(20, 'At least 20 characters required'),
  inputFormat: z.string().min(1, 'Required'),
  outputFormat: z.string().min(1, 'Required'),
  isSpecialJudge: z.boolean(),
  constraints: z.array(ConstraintRow),
  samples: z.array(SampleRow).min(1, 'At least one sample required'),
});

type CreatorForm = z.infer<typeof CreatorSchema>;

// ─── Constants ─────────────────────────────────────────────────────────────────

const DRAFT_KEY = 'codeforge:creator:draft';

const CATEGORIES = [
  { key: 'SAMPLE', label: 'Sample tests', count: 3 },
  { key: 'BOUNDARY', label: 'Boundary tests', count: 5 },
  { key: 'EDGE', label: 'Edge case tests', count: 5 },
  { key: 'RANDOM', label: 'Random tests', count: 8 },
  { key: 'STRESS', label: 'Stress tests', count: 5 },
  { key: 'ADVERSARIAL', label: 'Adversarial tests', count: 3 },
] as const;

type CatKey = (typeof CATEGORIES)[number]['key'];
type CatStatus = 'pending' | 'generating' | 'done';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getUserRole(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('accessToken');
  if (!token) return null;
  try {
    const p = JSON.parse(atob(token.split('.')[1]!)) as { role?: string };
    return p.role ?? null;
  } catch { return null; }
}

function loadDraft(): Partial<CreatorForm> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<CreatorForm>) : null;
  } catch { return null; }
}

// ─── Small shared UI ───────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
      {children} {required && <span className="text-red-500">*</span>}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-400">{msg}</p>;
}

function FormInput({
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-brand-500 focus:outline-none disabled:opacity-50 ${className}`}
    />
  );
}

function FormTextarea({
  className = '',
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { className?: string }) {
  return (
    <textarea
      {...props}
      className={`w-full resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-sm text-gray-200 placeholder-gray-600 focus:border-brand-500 focus:outline-none ${className}`}
    />
  );
}

// ─── Tag Input ─────────────────────────────────────────────────────────────────

function TagInput({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = suggestions
    .filter((s) => s.toLowerCase().includes(input.toLowerCase()) && !value.includes(s))
    .slice(0, 8);

  const add = useCallback(
    (tag: string) => {
      const trimmed = tag.trim().toLowerCase();
      if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
      setInput('');
      setOpen(false);
    },
    [value, onChange],
  );

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="flex min-h-[38px] flex-wrap gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 focus-within:border-brand-500">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-brand-600/20 px-2 py-0.5 text-xs text-brand-300"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="text-brand-400 hover:text-red-400"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
              e.preventDefault();
              add(input);
            }
            if (e.key === 'Backspace' && !input && value.length > 0) {
              remove(value[value.length - 1]!);
            }
          }}
          placeholder={value.length === 0 ? 'Type tag and press Enter…' : ''}
          className="min-w-[120px] flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-800"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Markdown editor with preview toggle ──────────────────────────────────────

function MarkdownEditor({
  value,
  onChange,
  rows = 14,
  placeholder = 'Write markdown…',
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-gray-700">
      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800/50 px-3 py-1.5">
        <span className="text-xs text-gray-500">Markdown</span>
        <button
          type="button"
          onClick={() => setPreview((v) => !v)}
          className={`rounded px-2 py-0.5 text-xs transition-colors ${
            preview ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {preview ? '✎ Edit' : '👁 Preview'}
        </button>
      </div>
      {preview ? (
        <div className="prose prose-invert prose-sm max-w-none p-4 prose-code:text-brand-400 prose-pre:bg-gray-900">
          <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {value || '*Nothing to preview yet*'}
          </Markdown>
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          spellCheck={false}
          className="w-full resize-y bg-gray-800 px-3 py-2.5 font-mono text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
        />
      )}
    </div>
  );
}

// ─── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  const steps = ['Parse', 'Review', 'Test Cases', 'Publish'];
  return (
    <div className="flex items-center">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4;
        const done = n < current;
        const active = n === current;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                  done
                    ? 'bg-brand-600 text-white'
                    : active
                    ? 'bg-brand-600 text-white ring-4 ring-brand-600/30'
                    : 'bg-gray-800 text-gray-500'
                }`}
              >
                {done ? '✓' : n}
              </div>
              <span
                className={`mt-1 text-xs font-medium ${
                  active ? 'text-brand-400' : done ? 'text-gray-400' : 'text-gray-600'
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`mx-2 mb-5 h-0.5 w-16 transition-colors ${
                  n < current ? 'bg-brand-600' : 'bg-gray-800'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1 — Parse ───────────────────────────────────────────────────────────

function Step1({
  form,
  onParsed,
}: {
  form: ReturnType<typeof useForm<CreatorForm>>;
  onParsed: (data: NonNullable<ReturnType<typeof parseProblem> extends Promise<infer T> ? T : never>) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rawText = form.watch('rawText');

  const handleParse = async () => {
    if (!rawText?.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await parseProblem(rawText);
      onParsed(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse problem');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <FieldLabel required>Raw problem text</FieldLabel>
        <Controller
          name="rawText"
          control={form.control}
          render={({ field, fieldState }) => (
            <>
              <FormTextarea
                {...field}
                rows={18}
                placeholder="Paste your raw problem text here…

Example:
Given an array of N integers, find the maximum subarray sum.

Constraints:
1 ≤ N ≤ 10^5
-10^9 ≤ A[i] ≤ 10^9

Input: First line N, second line N space-separated integers.
Output: Single integer — the maximum subarray sum."
                className="font-mono"
              />
              <FieldError msg={fieldState.error?.message} />
            </>
          )}
        />
        <p className="mt-1.5 text-xs text-gray-600">
          10 – 10,000 characters. The AI will extract title, difficulty, constraints, and sample test cases.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleParse()}
        disabled={loading || !rawText?.trim()}
        className={`relative w-full overflow-hidden rounded-xl py-3 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
          loading
            ? 'bg-gradient-to-r from-brand-700 via-purple-600 to-brand-700 bg-[length:200%_100%] animate-shimmer'
            : 'bg-brand-600 hover:bg-brand-700'
        }`}
        style={loading ? { backgroundSize: '200% 100%', animation: 'shimmer 1.5s linear infinite' } : {}}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            AI is reading your problem…
          </span>
        ) : (
          '✨ Parse with AI'
        )}
      </button>
    </div>
  );
}

// ─── Step 2 — Review & Edit ────────────────────────────────────────────────────

function Step2({
  form,
  confidenceScore,
  ambiguities,
  allTags,
  onNext,
}: {
  form: ReturnType<typeof useForm<CreatorForm>>;
  confidenceScore: number | null;
  ambiguities: string[];
  allTags: string[];
  onNext: () => void;
}) {
  const { fields: constraintFields, append: addConstraint, remove: removeConstraint } = useFieldArray({
    control: form.control,
    name: 'constraints',
  });
  const { fields: sampleFields, append: addSample, remove: removeSample } = useFieldArray({
    control: form.control,
    name: 'samples',
  });

  const statement = form.watch('statement');
  const tags = form.watch('tags');

  const handleNext = async () => {
    const ok = await form.trigger([
      'title', 'difficulty', 'tags', 'timeLimitMs', 'memoryLimitMb',
      'statement', 'inputFormat', 'outputFormat', 'samples',
    ]);
    if (ok) onNext();
  };

  return (
    <div className="space-y-7">
      {/* Confidence banner */}
      {confidenceScore !== null && (
        <div
          className={`rounded-xl border p-4 ${
            confidenceScore < 0.75
              ? 'border-amber-500/30 bg-amber-500/10'
              : 'border-green-500/30 bg-green-500/10'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className={`text-sm font-semibold ${confidenceScore < 0.75 ? 'text-amber-300' : 'text-green-300'}`}>
                {confidenceScore < 0.75
                  ? '⚠ AI confidence is low — review the extracted data carefully'
                  : '✓ AI parsed with high confidence'}
              </p>
              {ambiguities.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {ambiguities.map((a, i) => (
                    <li key={i} className="text-xs text-amber-200/80">• {a}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-2xl font-bold ${confidenceScore < 0.75 ? 'text-amber-300' : 'text-green-300'}`}>
                {Math.round(confidenceScore * 100)}%
              </p>
              <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-gray-700">
                <div
                  className={`h-full rounded-full ${confidenceScore < 0.75 ? 'bg-amber-400' : 'bg-green-400'}`}
                  style={{ width: `${confidenceScore * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Title + Difficulty row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <FieldLabel required>Title</FieldLabel>
          <Controller
            name="title"
            control={form.control}
            render={({ field, fieldState }) => (
              <>
                <FormInput {...field} placeholder="e.g. Maximum Subarray Sum" />
                <FieldError msg={fieldState.error?.message} />
              </>
            )}
          />
        </div>
        <div>
          <FieldLabel required>Difficulty</FieldLabel>
          <Controller
            name="difficulty"
            control={form.control}
            render={({ field }) => (
              <div className="flex rounded-lg border border-gray-700 overflow-hidden">
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => field.onChange(d)}
                    className={`flex-1 py-2 text-xs font-semibold capitalize transition-colors ${
                      field.value === d
                        ? d === 'easy'
                          ? 'bg-green-600 text-white'
                          : d === 'medium'
                          ? 'bg-yellow-600 text-black'
                          : 'bg-red-600 text-white'
                        : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          />
        </div>
      </div>

      {/* Tags */}
      <div>
        <FieldLabel>Tags</FieldLabel>
        <Controller
          name="tags"
          control={form.control}
          render={({ field }) => (
            <TagInput value={field.value} onChange={field.onChange} suggestions={allTags} />
          )}
        />
        <p className="mt-1 text-xs text-gray-600">Press Enter or comma to add a new tag</p>
      </div>

      {/* Limits row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel required>Time Limit (ms)</FieldLabel>
          <Controller
            name="timeLimitMs"
            control={form.control}
            render={({ field, fieldState }) => (
              <>
                <FormInput
                  type="number"
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
                <FieldError msg={fieldState.error?.message} />
              </>
            )}
          />
        </div>
        <div>
          <FieldLabel required>Memory Limit (MB)</FieldLabel>
          <Controller
            name="memoryLimitMb"
            control={form.control}
            render={({ field, fieldState }) => (
              <>
                <FormInput
                  type="number"
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
                <FieldError msg={fieldState.error?.message} />
              </>
            )}
          />
        </div>
      </div>

      {/* Problem Statement */}
      <div>
        <FieldLabel required>Problem Statement (Markdown)</FieldLabel>
        <Controller
          name="statement"
          control={form.control}
          render={({ field, fieldState }) => (
            <>
              <MarkdownEditor
                value={field.value}
                onChange={field.onChange}
                rows={14}
                placeholder="Write the full problem statement in Markdown…"
              />
              <FieldError msg={fieldState.error?.message} />
            </>
          )}
        />
      </div>

      {/* Input / Output Format */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <FieldLabel required>Input Format</FieldLabel>
          <Controller
            name="inputFormat"
            control={form.control}
            render={({ field, fieldState }) => (
              <>
                <FormTextarea {...field} rows={4} placeholder="Describe the input format…" />
                <FieldError msg={fieldState.error?.message} />
              </>
            )}
          />
        </div>
        <div>
          <FieldLabel required>Output Format</FieldLabel>
          <Controller
            name="outputFormat"
            control={form.control}
            render={({ field, fieldState }) => (
              <>
                <FormTextarea {...field} rows={4} placeholder="Describe the output format…" />
                <FieldError msg={fieldState.error?.message} />
              </>
            )}
          />
        </div>
      </div>

      {/* Special Judge toggle */}
      <div className="flex items-center gap-3">
        <Controller
          name="isSpecialJudge"
          control={form.control}
          render={({ field }) => (
            <button
              type="button"
              role="switch"
              aria-checked={field.value}
              onClick={() => field.onChange(!field.value)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                field.value ? 'bg-brand-600' : 'bg-gray-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  field.value ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          )}
        />
        <div>
          <p className="text-sm font-medium text-gray-300">Special Judge</p>
          <p className="text-xs text-gray-500">Enable when multiple outputs are acceptable</p>
        </div>
      </div>

      {/* Constraints */}
      <div>
        <FieldLabel>Constraints</FieldLabel>
        <div className="space-y-2">
          {constraintFields.map((field, i) => (
            <div key={field.id} className="grid grid-cols-[1fr_100px_100px_1fr_32px] gap-2 items-start">
              <Controller
                name={`constraints.${i}.variable`}
                control={form.control}
                render={({ field: f }) => (
                  <FormInput {...f} placeholder="Variable (e.g. N)" />
                )}
              />
              <Controller
                name={`constraints.${i}.min`}
                control={form.control}
                render={({ field: f }) => (
                  <FormInput
                    type="number"
                    {...f}
                    onChange={(e) => f.onChange(Number(e.target.value))}
                    placeholder="Min"
                  />
                )}
              />
              <Controller
                name={`constraints.${i}.max`}
                control={form.control}
                render={({ field: f }) => (
                  <FormInput
                    type="number"
                    {...f}
                    onChange={(e) => f.onChange(Number(e.target.value))}
                    placeholder="Max"
                  />
                )}
              />
              <Controller
                name={`constraints.${i}.description`}
                control={form.control}
                render={({ field: f }) => (
                  <FormInput {...f} placeholder="Description (optional)" />
                )}
              />
              <button
                type="button"
                onClick={() => removeConstraint(i)}
                className="flex h-9 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-800 hover:text-red-400"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addConstraint({ variable: '', min: 1, max: 100, description: '' })}
            className="text-xs text-brand-400 hover:text-brand-300"
          >
            + Add constraint
          </button>
        </div>
      </div>

      {/* Sample Test Cases */}
      <div>
        <FieldLabel required>Sample Test Cases</FieldLabel>
        <div className="space-y-3">
          {sampleFields.map((field, i) => (
            <div key={field.id} className="overflow-hidden rounded-xl border border-gray-700">
              <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800/50 px-3 py-1.5">
                <span className="text-xs font-medium text-gray-400">Sample {i + 1}</span>
                {sampleFields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSample(i)}
                    className="text-xs text-gray-600 hover:text-red-400"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 divide-x divide-gray-700">
                <div className="p-3">
                  <p className="mb-1.5 text-xs text-gray-500">Input</p>
                  <Controller
                    name={`samples.${i}.input`}
                    control={form.control}
                    render={({ field: f }) => (
                      <FormTextarea {...f} rows={3} placeholder="Input…" />
                    )}
                  />
                </div>
                <div className="p-3">
                  <p className="mb-1.5 text-xs text-gray-500">Expected Output</p>
                  <Controller
                    name={`samples.${i}.output`}
                    control={form.control}
                    render={({ field: f }) => (
                      <FormTextarea {...f} rows={3} placeholder="Output…" />
                    )}
                  />
                </div>
              </div>
              <div className="border-t border-gray-700 p-3">
                <p className="mb-1.5 text-xs text-gray-500">Explanation (optional)</p>
                <Controller
                  name={`samples.${i}.explanation`}
                  control={form.control}
                  render={({ field: f }) => (
                    <FormInput {...f} placeholder="Brief explanation…" />
                  )}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addSample({ input: '', output: '', explanation: '' })}
            className="text-xs text-brand-400 hover:text-brand-300"
          >
            + Add sample
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleNext()}
        className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
      >
        Next: Generate Test Cases →
      </button>
    </div>
  );
}

// ─── Step 3 — Generate Test Cases ────────────────────────────────────────────

interface DisplayTestCase extends GeneratedTestCase {
  localId: string;
  deleted: boolean;
  expanded: boolean;
}

function Step3({
  problemId,
  onNext,
}: {
  problemId: string;
  onNext: (unverified: number) => void;
}) {
  const [catStatus, setCatStatus] = useState<Record<CatKey, CatStatus>>(
    () => Object.fromEntries(CATEGORIES.map((c) => [c.key, 'pending'])) as Record<CatKey, CatStatus>,
  );
  const [tests, setTests] = useState<DisplayTestCase[]>([]);
  const [unverified, setUnverified] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [customOutput, setCustomOutput] = useState('');
  const timerRefs = useRef<NodeJS.Timeout[]>([]);

  const clearTimers = () => { timerRefs.current.forEach(clearTimeout); timerRefs.current = []; };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setDone(false);
    setCatStatus(Object.fromEntries(CATEGORIES.map((c) => [c.key, 'pending'])) as Record<CatKey, CatStatus>);

    // Simulate sequential progress
    CATEGORIES.forEach((cat, i) => {
      const t1 = setTimeout(() => {
        setCatStatus((prev) => ({ ...prev, [cat.key]: 'generating' }));
      }, i * 1500);
      timerRefs.current.push(t1);
    });

    try {
      const result = await generateTests(problemId);
      clearTimers();
      setCatStatus(Object.fromEntries(CATEGORIES.map((c) => [c.key, 'done'])) as Record<CatKey, CatStatus>);
      setTests(
        result.testCases.map((tc, i) => ({
          ...tc,
          localId: `gen-${i}`,
          deleted: false,
          expanded: false,
        })),
      );
      setUnverified(result.unverifiedCount);
      setDone(true);
    } catch (e) {
      clearTimers();
      setError(e instanceof Error ? e.message : 'Generation failed');
      setCatStatus(Object.fromEntries(CATEGORIES.map((c) => [c.key, 'pending'])) as Record<CatKey, CatStatus>);
    } finally {
      setGenerating(false);
    }
  };

  const addCustom = () => {
    if (!customInput.trim() || !customOutput.trim()) return;
    setTests((prev) => [
      ...prev,
      {
        localId: `custom-${Date.now()}`,
        input: customInput,
        expectedOutput: customOutput,
        category: 'SAMPLE',
        isHidden: false,
        deleted: false,
        expanded: false,
      },
    ]);
    setCustomInput('');
    setCustomOutput('');
  };

  const visible = tests.filter((t) => !t.deleted);
  const grouped = CATEGORIES.map((c) => ({
    ...c,
    cases: visible.filter((t) => t.category === c.key),
  })).filter((g) => g.cases.length > 0);

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">Generation Progress</h3>
          {!done && (
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating}
              className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generating…
                </span>
              ) : (
                '✨ Generate Test Cases'
              )}
            </button>
          )}
        </div>

        <div className="space-y-2">
          {CATEGORIES.map((cat) => {
            const status = catStatus[cat.key];
            return (
              <div key={cat.key} className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-center text-sm">
                  {status === 'done' ? (
                    <span className="text-green-400">✓</span>
                  ) : status === 'generating' ? (
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
                  ) : (
                    <span className="text-gray-600">○</span>
                  )}
                </span>
                <span
                  className={`text-sm ${
                    status === 'done'
                      ? 'text-gray-300'
                      : status === 'generating'
                      ? 'text-brand-300'
                      : 'text-gray-600'
                  }`}
                >
                  {cat.label}
                  {status === 'done' && (
                    <span className="ml-1.5 text-xs text-gray-500">
                      ({visible.filter((t) => t.category === cat.key).length})
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Unverified warning */}
      {done && unverified > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
          ⚠ {unverified} test case{unverified !== 1 ? 's' : ''} with uncertain expected output — review before publishing
        </div>
      )}

      {/* Test case table */}
      {grouped.length > 0 && (
        <div className="space-y-5">
          {grouped.map((group) => (
            <div key={group.key} className="overflow-hidden rounded-xl border border-gray-800">
              <div className="border-b border-gray-800 bg-gray-900/60 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {group.label} ({group.cases.length})
                </span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-gray-500">
                    <th className="w-36 px-4 py-2 font-medium">Category</th>
                    <th className="px-4 py-2 font-medium">Input</th>
                    <th className="px-4 py-2 font-medium">Expected Output</th>
                    <th className="w-16 px-4 py-2 text-center font-medium">Visibility</th>
                    <th className="w-12 px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {group.cases.map((tc) => (
                    <tr
                      key={tc.localId}
                      className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="px-4 py-2">
                        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400">
                          {tc.category}
                        </span>
                      </td>
                      <td
                        className="max-w-[240px] cursor-pointer px-4 py-2 font-mono text-gray-300"
                        onClick={() =>
                          setTests((prev) =>
                            prev.map((t) =>
                              t.localId === tc.localId ? { ...t, expanded: !t.expanded } : t,
                            ),
                          )
                        }
                      >
                        <pre className={`overflow-hidden whitespace-pre-wrap ${tc.expanded ? '' : 'line-clamp-2'}`}>
                          {tc.input}
                        </pre>
                      </td>
                      <td className="max-w-[200px] px-4 py-2 font-mono text-gray-300">
                        <pre className="line-clamp-2 overflow-hidden whitespace-pre-wrap">
                          {tc.expectedOutput}
                        </pre>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-[10px] ${tc.isHidden ? 'text-gray-600' : 'text-green-400'}`}>
                          {tc.isHidden ? 'Hidden' : 'Visible'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setTests((prev) =>
                              prev.map((t) =>
                                t.localId === tc.localId ? { ...t, deleted: true } : t,
                              ),
                            )
                          }
                          className="text-gray-600 hover:text-red-400"
                          title="Delete"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Add custom test case */}
      {done && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Add Custom Test Case
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-xs text-gray-500">Input</p>
              <FormTextarea
                rows={3}
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Custom input…"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs text-gray-500">Expected Output</p>
              <FormTextarea
                rows={3}
                value={customOutput}
                onChange={(e) => setCustomOutput(e.target.value)}
                placeholder="Expected output…"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={addCustom}
            disabled={!customInput.trim() || !customOutput.trim()}
            className="mt-3 rounded-lg bg-gray-700 px-4 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-600 disabled:opacity-40 transition-colors"
          >
            + Add test case
          </button>
        </div>
      )}

      {done && (
        <button
          type="button"
          onClick={() => onNext(unverified)}
          className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          Next: Preview & Publish →
        </button>
      )}
    </div>
  );
}

// ─── Step 4 — Publish ─────────────────────────────────────────────────────────

function Step4({
  form,
  problemId,
  onDraft,
  onPublish,
  publishing,
  published,
}: {
  form: ReturnType<typeof useForm<CreatorForm>>;
  problemId: string;
  onDraft: () => void;
  onPublish: () => void;
  publishing: boolean;
  published: { slug: string } | null;
}) {
  const values = form.getValues();

  if (published) {
    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/20 text-4xl">
          🎉
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Problem Published!</h2>
          <p className="mt-1.5 text-gray-400">Your problem is now live and available to all users.</p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/problems/${published.slug}`}
            className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            View Live Problem →
          </Link>
          <Link
            href="/problems"
            className="rounded-xl bg-gray-800 px-6 py-2.5 text-sm font-semibold text-gray-200 hover:bg-gray-700 transition-colors"
          >
            Back to Problems
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Preview */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-100">{values.title}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <DifficultyBadge difficulty={values.difficulty} />
              {values.tags.map((t) => (
                <span key={t} className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="shrink-0 text-right text-xs text-gray-500">
            <p>⏱ {values.timeLimitMs}ms</p>
            <p>💾 {values.memoryLimitMb}MB</p>
            {values.isSpecialJudge && <p className="text-amber-400">Special Judge</p>}
          </div>
        </div>

        <div className="prose prose-invert prose-sm max-w-none prose-code:text-brand-400 prose-pre:bg-gray-800">
          <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {values.statement}
          </Markdown>
        </div>

        {(values.inputFormat || values.outputFormat) && (
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-700 pt-4">
            {values.inputFormat && (
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-400">Input Format</p>
                <p className="text-sm text-gray-300">{values.inputFormat}</p>
              </div>
            )}
            {values.outputFormat && (
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-400">Output Format</p>
                <p className="text-sm text-gray-300">{values.outputFormat}</p>
              </div>
            )}
          </div>
        )}

        {values.samples.length > 0 && (
          <div className="mt-4 border-t border-gray-700 pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Sample Test Cases
            </p>
            <div className="space-y-3">
              {values.samples.map((s, i) => (
                <div key={i} className="overflow-hidden rounded-lg border border-gray-700">
                  <div className="border-b border-gray-700 px-3 py-1 text-xs text-gray-500">
                    Example {i + 1}
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-gray-700">
                    <div className="p-3">
                      <p className="mb-1 text-[10px] text-gray-600">INPUT</p>
                      <pre className="whitespace-pre-wrap font-mono text-xs text-gray-200">{s.input}</pre>
                    </div>
                    <div className="p-3">
                      <p className="mb-1 text-[10px] text-gray-600">OUTPUT</p>
                      <pre className="whitespace-pre-wrap font-mono text-xs text-gray-200">{s.output}</pre>
                    </div>
                  </div>
                  {s.explanation && (
                    <div className="border-t border-gray-700 bg-gray-800/30 px-3 py-2 text-xs text-gray-400">
                      {s.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {values.constraints.length > 0 && (
          <div className="mt-4 border-t border-gray-700 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Constraints
            </p>
            <div className="space-y-1 font-mono text-sm text-gray-300">
              {values.constraints.map((c, i) => (
                <p key={i}>
                  {c.min} ≤ {c.variable} ≤ {c.max}
                  {c.description && <span className="text-gray-500"> — {c.description}</span>}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onDraft}
          disabled={publishing}
          className="flex-1 rounded-xl border border-gray-700 bg-gray-800 py-3 text-sm font-semibold text-gray-200 hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          Save as Draft
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={publishing}
          className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {publishing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Publishing…
            </span>
          ) : (
            '🚀 Publish Problem'
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main wizard ───────────────────────────────────────────────────────────────

export function CreateClient() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [confidenceScore, setConfidenceScore] = useState<number | null>(null);
  const [ambiguities, setAmbiguities] = useState<string[]>([]);
  const [problemId, setProblemId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ slug: string } | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [authError, setAuthError] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const form = useForm<CreatorForm>({
    resolver: zodResolver(CreatorSchema),
    defaultValues: {
      rawText: '',
      title: '',
      difficulty: 'medium',
      tags: [],
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      statement: '',
      inputFormat: '',
      outputFormat: '',
      isSpecialJudge: false,
      constraints: [],
      samples: [{ input: '', output: '', explanation: '' }],
      ...loadDraft(),
    },
  });

  // Role guard
  useEffect(() => {
    const role = getUserRole();
    if (!role || (role !== 'PROBLEM_SETTER' && role !== 'PLATFORM_ADMIN')) {
      setAuthError(true);
    }
  }, []);

  // Persist form to localStorage
  useEffect(() => {
    const { unsubscribe } = form.watch((values) => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
      setSavedAt(new Date());
    });
    return unsubscribe;
  }, [form]);

  // Load tags
  useEffect(() => {
    void getAllTags().then(setAllTags).catch(() => {});
  }, []);

  const handleParsed = (result: Awaited<ReturnType<typeof parseProblem>>) => {
    const p = result.parsed;
    setConfidenceScore(p.confidenceScore);
    setAmbiguities(p.ambiguities);

    // Convert constraints record → array
    const constraintsArr = Object.entries(p.constraints).map(([variable, { min, max }]) => ({
      variable,
      min,
      max,
      description: '',
    }));

    form.reset({
      ...form.getValues(),
      title: p.title,
      difficulty: p.difficulty,
      tags: p.tags,
      timeLimitMs: p.timeLimitMs,
      memoryLimitMb: p.memoryLimitMb,
      isSpecialJudge: p.isSpecialJudge,
      constraints: constraintsArr,
      samples: p.samples.map((s) => ({ input: s.input, output: s.output, explanation: s.explanation })),
      inputFormat: p.inputFormat,
      outputFormat: p.outputFormat,
      statement: `${p.inputFormat}\n\n**Output:** ${p.outputFormat}`,
    });

    setStep(2);
  };

  const handleStep2Next = async () => {
    setCreateError(null);
    const values = form.getValues();
    try {
      const constraintsRecord = values.constraints.reduce<Record<string, { min: number; max: number }>>(
        (acc, c) => ({ ...acc, [c.variable]: { min: c.min, max: c.max } }),
        {},
      );

      const result = await createProblem({
        title: values.title,
        statement: values.statement,
        difficulty: values.difficulty,
        constraints: constraintsRecord,
        tags: values.tags,
        timeLimitMs: values.timeLimitMs,
        memoryLimitMb: values.memoryLimitMb,
        isSpecialJudge: values.isSpecialJudge,
      });

      setProblemId(result.id);
      setStep(3);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create problem');
    }
  };

  const handlePublish = async (asDraft = false) => {
    if (!problemId) return;
    setPublishing(true);
    try {
      if (!asDraft) {
        const result = await publishProblem(problemId);
        setPublished({ slug: result.slug });
      } else {
        router.push('/problems');
      }
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to publish');
    } finally {
      setPublishing(false);
    }
  };

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f1117]">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-300">
            Problem Setter access required
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Only users with the PROBLEM_SETTER role can access this page.
          </p>
          <Link
            href="/problems"
            className="mt-4 inline-block rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Browse Problems
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-gray-800 bg-[#0f1117]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-bold text-brand-400">
              CodeForge AI
            </Link>
            <span className="text-gray-700">/</span>
            <span className="text-sm text-gray-400">Create Problem</span>
          </div>
          <div className="flex items-center gap-3">
            {savedAt && (
              <span className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Saved {savedAt.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Stepper */}
        <div className="mb-8 flex justify-center">
          <Stepper current={step} />
        </div>

        {/* Create error */}
        {createError && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {createError}
          </div>
        )}

        {/* Step content */}
        {step === 1 && <Step1 form={form} onParsed={handleParsed} />}

        {step === 2 && (
          <Step2
            form={form}
            confidenceScore={confidenceScore}
            ambiguities={ambiguities}
            allTags={allTags}
            onNext={() => void handleStep2Next()}
          />
        )}

        {step === 3 && problemId && (
          <Step3
            problemId={problemId}
            onNext={() => setStep(4)}
          />
        )}

        {step === 4 && problemId && (
          <Step4
            form={form}
            problemId={problemId}
            onDraft={() => void handlePublish(true)}
            onPublish={() => void handlePublish(false)}
            publishing={publishing}
            published={published}
          />
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
