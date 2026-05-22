import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { Difficulty, Language, TestCaseCategory, UserRole, Verdict } from '@codeforge/shared';

import * as schema from './schema.js';
import {
  aiReviews,
  problems,
  submissions,
  testCases,
  users,
} from './schema.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Problem seed data ─────────────────────────────────────────────────────────

const SEED_PROBLEMS: Array<{
  title: string;
  difficulty: Difficulty;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  statement: string;
  constraints: Record<string, { min: number; max: number }>;
  samples: Array<{ input: string; output: string; hidden: boolean; category: TestCaseCategory }>;
}> = [
  {
    title: 'Two Sum',
    difficulty: Difficulty.EASY,
    tags: ['arrays', 'hash-map'],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement: `Given an array of integers \`nums\` and an integer \`target\`, return the indices of the two numbers that add up to \`target\`.

You may assume that each input has **exactly one solution** and you may not use the same element twice.

**Input format:**
- Line 1: Two integers \`n\` and \`target\`
- Line 2: \`n\` space-separated integers

**Output format:**
Two space-separated integers — the 0-based indices of the two numbers (smaller index first).`,
    constraints: {
      n: { min: 2, max: 10000 },
      nums_elements: { min: -1000000000, max: 1000000000 },
      target: { min: -1000000000, max: 1000000000 },
    },
    samples: [
      { input: '4 9\n2 7 11 15', output: '0 1', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '3 6\n3 2 4', output: '1 2', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '2 6\n3 3', output: '0 1', hidden: true, category: TestCaseCategory.EDGE },
      { input: '2 0\n-1000000000 1000000000', output: '0 1', hidden: true, category: TestCaseCategory.BOUNDARY },
      { input: '5 100\n10 20 30 40 60', output: '2 4', hidden: true, category: TestCaseCategory.RANDOM },
    ],
  },
  {
    title: 'Valid Parentheses',
    difficulty: Difficulty.EASY,
    tags: ['stack', 'strings'],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement: `Given a string \`s\` containing only \`(\`, \`)\`, \`{\`, \`}\`, \`[\`, \`]\`, determine if the input string is valid.

An input string is valid if:
1. Open brackets must be closed by the same type of brackets.
2. Open brackets must be closed in the correct order.
3. Every close bracket has a corresponding open bracket of the same type.

**Input format:** A single string \`s\`

**Output format:** \`true\` or \`false\``,
    constraints: {
      s_length: { min: 1, max: 10000 },
    },
    samples: [
      { input: '()', output: 'true', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '()[]{}\n', output: 'true', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '(]', output: 'false', hidden: true, category: TestCaseCategory.EDGE },
      { input: '{[]}', output: 'true', hidden: true, category: TestCaseCategory.RANDOM },
      { input: '((((((((((', output: 'false', hidden: true, category: TestCaseCategory.STRESS },
    ],
  },
  {
    title: 'Binary Search',
    difficulty: Difficulty.EASY,
    tags: ['binary-search', 'arrays'],
    timeLimitMs: 500,
    memoryLimitMb: 128,
    statement: `Given an array of integers \`nums\` sorted in ascending order and an integer \`target\`, return the index of \`target\` if it is in the array, or \`-1\` if it is not.

You must write an algorithm with **O(log n)** runtime complexity.

**Input format:**
- Line 1: Two integers \`n\` and \`target\`
- Line 2: \`n\` space-separated integers in ascending order

**Output format:** A single integer — the 0-based index, or -1 if not found.`,
    constraints: {
      n: { min: 1, max: 10000 },
      nums_elements: { min: -1000000000, max: 1000000000 },
    },
    samples: [
      { input: '6 9\n-1 0 3 5 9 12', output: '4', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '6 2\n-1 0 3 5 9 12', output: '-1', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '1 0\n0', output: '0', hidden: true, category: TestCaseCategory.BOUNDARY },
      { input: '1 1\n0', output: '-1', hidden: true, category: TestCaseCategory.EDGE },
      { input: '5 -1000000000\n-1000000000 -3 0 5 1000000000', output: '0', hidden: true, category: TestCaseCategory.BOUNDARY },
    ],
  },
  {
    title: 'Climbing Stairs',
    difficulty: Difficulty.EASY,
    tags: ['dynamic-programming', 'math'],
    timeLimitMs: 500,
    memoryLimitMb: 128,
    statement: `You are climbing a staircase. It takes \`n\` steps to reach the top. Each time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?

**Input format:** A single integer \`n\`

**Output format:** A single integer — the number of distinct ways.`,
    constraints: {
      n: { min: 1, max: 45 },
    },
    samples: [
      { input: '2', output: '2', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '3', output: '3', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '1', output: '1', hidden: true, category: TestCaseCategory.BOUNDARY },
      { input: '45', output: '1836311903', hidden: true, category: TestCaseCategory.BOUNDARY },
      { input: '10', output: '89', hidden: true, category: TestCaseCategory.RANDOM },
    ],
  },
  {
    title: 'Maximum Subarray',
    difficulty: Difficulty.MEDIUM,
    tags: ['arrays', 'dynamic-programming', 'divide-and-conquer'],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement: `Given an integer array \`nums\`, find the subarray with the largest sum and return its sum.

**Input format:**
- Line 1: Integer \`n\`
- Line 2: \`n\` space-separated integers

**Output format:** A single integer — the maximum subarray sum.`,
    constraints: {
      n: { min: 1, max: 100000 },
      nums_elements: { min: -100000, max: 100000 },
    },
    samples: [
      { input: '9\n-2 1 -3 4 -1 2 1 -5 4', output: '6', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '1\n1', output: '1', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '5\n5 4 -1 7 8', output: '23', hidden: true, category: TestCaseCategory.RANDOM },
      { input: '3\n-3 -2 -1', output: '-1', hidden: true, category: TestCaseCategory.EDGE },
      { input: '1\n-100000', output: '-100000', hidden: true, category: TestCaseCategory.BOUNDARY },
    ],
  },
  {
    title: 'Merge Intervals',
    difficulty: Difficulty.MEDIUM,
    tags: ['intervals', 'sorting', 'arrays'],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement: `Given an array of intervals where \`intervals[i] = [start_i, end_i]\`, merge all overlapping intervals and return an array of the non-overlapping intervals that cover all the intervals in the input.

**Input format:**
- Line 1: Integer \`n\` (number of intervals)
- Next \`n\` lines: Two space-separated integers \`start end\` for each interval

**Output format:**
- First line: Integer \`m\` (number of merged intervals)
- Next \`m\` lines: Two space-separated integers for each merged interval`,
    constraints: {
      n: { min: 1, max: 10000 },
      interval_values: { min: 0, max: 100000 },
    },
    samples: [
      {
        input: '4\n1 3\n2 6\n8 10\n15 18',
        output: '3\n1 6\n8 10\n15 18',
        hidden: false,
        category: TestCaseCategory.SAMPLE,
      },
      { input: '2\n1 4\n4 5', output: '1\n1 5', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '1\n0 0', output: '1\n0 0', hidden: true, category: TestCaseCategory.BOUNDARY },
      {
        input: '3\n1 4\n0 2\n3 5',
        output: '1\n0 5',
        hidden: true,
        category: TestCaseCategory.RANDOM,
      },
    ],
  },
  {
    title: 'Minimum Path Sum',
    difficulty: Difficulty.MEDIUM,
    tags: ['dynamic-programming', 'grids', 'arrays'],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement: `Given a \`m x n\` grid filled with non-negative numbers, find a path from the top-left to the bottom-right which minimizes the sum of all numbers along its path.

You can only move either **down** or **right** at any point in time.

**Input format:**
- Line 1: Two integers \`m\` and \`n\`
- Next \`m\` lines: \`n\` space-separated integers

**Output format:** A single integer — the minimum path sum.`,
    constraints: {
      m: { min: 1, max: 200 },
      n: { min: 1, max: 200 },
      grid_elements: { min: 0, max: 100 },
    },
    samples: [
      { input: '3 3\n1 3 1\n1 5 1\n4 2 1', output: '7', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '2 3\n1 2 3\n4 5 6', output: '12', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '1 1\n5', output: '5', hidden: true, category: TestCaseCategory.BOUNDARY },
      { input: '1 5\n1 2 3 4 5', output: '15', hidden: true, category: TestCaseCategory.EDGE },
    ],
  },
  {
    title: 'Number of Islands',
    difficulty: Difficulty.MEDIUM,
    tags: ['graphs', 'BFS', 'DFS', 'grid'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    statement: `Given an \`m x n\` 2D binary grid where \`1\` represents land and \`0\` represents water, return the number of islands.

An island is surrounded by water and is formed by connecting adjacent lands horizontally or vertically.

**Input format:**
- Line 1: Two integers \`m\` and \`n\`
- Next \`m\` lines: \`n\` space-separated characters (\`0\` or \`1\`)

**Output format:** A single integer — the number of islands.`,
    constraints: {
      m: { min: 1, max: 300 },
      n: { min: 1, max: 300 },
    },
    samples: [
      {
        input: '4 5\n1 1 1 1 0\n1 1 0 1 0\n1 1 0 0 0\n0 0 0 0 0',
        output: '1',
        hidden: false,
        category: TestCaseCategory.SAMPLE,
      },
      {
        input: '4 5\n1 1 0 0 0\n1 1 0 0 0\n0 0 1 0 0\n0 0 0 1 1',
        output: '3',
        hidden: false,
        category: TestCaseCategory.SAMPLE,
      },
      { input: '1 1\n0', output: '0', hidden: true, category: TestCaseCategory.BOUNDARY },
      { input: '1 1\n1', output: '1', hidden: true, category: TestCaseCategory.BOUNDARY },
      {
        input: '2 2\n1 0\n0 1',
        output: '2',
        hidden: true,
        category: TestCaseCategory.EDGE,
      },
    ],
  },
  {
    title: 'Trapping Rain Water',
    difficulty: Difficulty.HARD,
    tags: ['arrays', 'two-pointers', 'stack', 'dynamic-programming'],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement: `Given \`n\` non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.

**Input format:**
- Line 1: Integer \`n\`
- Line 2: \`n\` space-separated non-negative integers

**Output format:** A single integer — the total units of water trapped.`,
    constraints: {
      n: { min: 1, max: 100000 },
      height_elements: { min: 0, max: 100000 },
    },
    samples: [
      { input: '12\n0 1 0 2 1 0 1 3 2 1 2 1', output: '6', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '6\n4 2 0 3 2 5', output: '9', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: '1\n5', output: '0', hidden: true, category: TestCaseCategory.BOUNDARY },
      { input: '2\n3 4', output: '0', hidden: true, category: TestCaseCategory.EDGE },
      { input: '5\n0 0 0 0 0', output: '0', hidden: true, category: TestCaseCategory.EDGE },
      { input: '5\n3 0 0 0 3', output: '9', hidden: true, category: TestCaseCategory.RANDOM },
    ],
  },
  {
    title: 'Word Break',
    difficulty: Difficulty.HARD,
    tags: ['dynamic-programming', 'strings', 'hash-map', 'trie'],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement: `Given a string \`s\` and a dictionary of strings \`wordDict\`, return \`true\` if \`s\` can be segmented into a space-separated sequence of one or more dictionary words.

Note that the same word in the dictionary may be reused multiple times in the segmentation.

**Input format:**
- Line 1: String \`s\`
- Line 2: Integer \`k\` (dictionary size)
- Line 3: \`k\` space-separated words

**Output format:** \`true\` or \`false\``,
    constraints: {
      s_length: { min: 1, max: 300 },
      wordDict_size: { min: 1, max: 1000 },
      word_length: { min: 1, max: 20 },
    },
    samples: [
      { input: 'leetcode\n2\nleet code', output: 'true', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: 'applepenapple\n2\napple pen', output: 'true', hidden: false, category: TestCaseCategory.SAMPLE },
      { input: 'catsandog\n5\ncats dog sand and cat', output: 'false', hidden: true, category: TestCaseCategory.RANDOM },
      { input: 'a\n1\na', output: 'true', hidden: true, category: TestCaseCategory.BOUNDARY },
      { input: 'aaaaaaaaaaaab\n2\na aa', output: 'false', hidden: true, category: TestCaseCategory.ADVERSARIAL },
    ],
  },
];

// ─── Main seed function ────────────────────────────────────────────────────────

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set. Copy .env.example to .env first.');
  }

  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql, { schema });

  console.log('🌱 Starting seed...\n');

  // ── 1. Users ────────────────────────────────────────────────────────────────

  const SALT_ROUNDS = 12;

  const [adminUser] = await db
    .insert(users)
    .values({
      username: 'admin',
      email: 'admin@codeforge.dev',
      passwordHash: await bcrypt.hash('Admin@1234', SALT_ROUNDS),
      role: UserRole.PLATFORM_ADMIN,
      isVerified: true,
      rating: 2500,
    })
    .onConflictDoNothing()
    .returning();

  const [testUser] = await db
    .insert(users)
    .values({
      username: 'testuser',
      email: 'test@codeforge.dev',
      passwordHash: await bcrypt.hash('Test@1234', SALT_ROUNDS),
      role: UserRole.USER,
      isVerified: true,
      rating: 1200,
    })
    .onConflictDoNothing()
    .returning();

  if (!adminUser || !testUser) {
    console.log('⚠️  Users already exist — skipping problem seed to avoid duplicates.');
    await sql.end();
    return;
  }

  console.log(`✅ Created users: ${adminUser.username}, ${testUser.username}`);

  // ── 2. Problems + test cases ─────────────────────────────────────────────────

  for (const p of SEED_PROBLEMS) {
    const [problem] = await db
      .insert(problems)
      .values({
        title: p.title,
        slug: slug(p.title),
        statement: p.statement,
        difficulty: p.difficulty,
        constraints: p.constraints,
        tags: p.tags,
        timeLimitMs: p.timeLimitMs,
        memoryLimitMb: p.memoryLimitMb,
        isSpecialJudge: false,
        isPublished: true,
        createdBy: adminUser.id,
        aiConfidence: 0.97,
      })
      .returning();

    await db.insert(testCases).values(
      p.samples.map((s) => ({
        problemId: problem.id,
        input: s.input,
        expectedOutput: s.output,
        isHidden: s.hidden,
        category: s.category,
        createdBy: 'human',
      })),
    );

    console.log(`  📝 ${p.difficulty.padEnd(6)} ${p.title} (${p.samples.length} test cases)`);
  }

  // ── 3. Sample submission with AI review ──────────────────────────────────────

  const [firstProblem] = await db.select().from(problems).limit(1);

  const [sampleSubmission] = await db
    .insert(submissions)
    .values({
      userId: testUser.id,
      problemId: firstProblem.id,
      language: Language.PYTHON,
      code: [
        'from typing import List',
        '',
        'def two_sum(nums: List[int], target: int) -> List[int]:',
        '    seen = {}',
        '    for i, n in enumerate(nums):',
        '        complement = target - n',
        '        if complement in seen:',
        '            return [seen[complement], i]',
        '        seen[n] = i',
        '    return []',
        '',
        'n, target = map(int, input().split())',
        'nums = list(map(int, input().split()))',
        'result = two_sum(nums, target)',
        'print(*result)',
      ].join('\n'),
      verdict: Verdict.AC,
      runtimeMs: 48,
      memoryKb: 14432,
      testCasesPassed: 5,
      totalTestCases: 5,
    })
    .returning();

  const [review] = await db
    .insert(aiReviews)
    .values({
      submissionId: sampleSubmission.id,
      timeComplexity: 'O(n)',
      spaceComplexity: 'O(n)',
      correctnessNotes: 'Solution is correct. Uses a hash map to achieve O(n) time by storing complements.',
      optimizationHint: 'This is already optimal. A brute-force O(n²) approach exists but is unnecessary here.',
      dryRun: 'Input: [2,7,11,15], target=9\n→ i=0, n=2, complement=7, seen={}\n→ i=1, n=7, complement=2, found at seen[2]=0\n→ return [0, 1]',
      qualityScore: 0.95,
    })
    .returning();

  // Link the review back to the submission
  await db
    .update(submissions)
    .set({ aiReviewId: review.id })
    .where(eq(submissions.id, sampleSubmission.id));

  console.log(`\n✅ Sample submission + AI review created for "${firstProblem.title}"`);

  // ── Summary ──────────────────────────────────────────────────────────────────

  console.log('\n─────────────────────────────────────────────');
  console.log('🎉 Seed complete!');
  console.log('');
  console.log('  Admin     admin@codeforge.dev   / Admin@1234');
  console.log('  Test user test@codeforge.dev    / Test@1234');
  console.log(`  Problems  ${SEED_PROBLEMS.length} published problems`);
  console.log('─────────────────────────────────────────────\n');

  await sql.end();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
