import * as dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { Difficulty, TestCaseCategory, UserRole } from '@codeforge/shared';

import * as schema from './schema.js';
import { problems, testCases, users } from './schema.js';

type SeedCase = {
  input: string;
  output: string;
  category: TestCaseCategory;
};

type SeedProblem = {
  title: string;
  slug: string;
  difficulty: Difficulty;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  statement: string;
  constraints: Record<string, unknown>;
  visibleCases: SeedCase[];
  hiddenCases: SeedCase[];
};

const seedProblems: SeedProblem[] = [
  {
    title: 'Two Sum',
    slug: 'two-sum',
    difficulty: Difficulty.EASY,
    tags: ['arrays', 'hash-map'],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement:
      'Given an array of integers and a target value, print the indices of the two elements whose sum equals the target. Exactly one valid pair exists and indices must be printed in ascending order.',
    constraints: { n: { min: 2, max: 100000 }, values: { min: -1000000000, max: 1000000000 } },
    visibleCases: [
      { input: '4 9\n2 7 11 15', output: '0 1', category: TestCaseCategory.SAMPLE },
      { input: '3 6\n3 2 4', output: '1 2', category: TestCaseCategory.SAMPLE },
      { input: '2 6\n3 3', output: '0 1', category: TestCaseCategory.SAMPLE },
      { input: '5 10\n1 2 3 7 8', output: '2 3', category: TestCaseCategory.EDGE },
      { input: '6 1\n-5 4 3 9 6 -2', output: '0 1', category: TestCaseCategory.RANDOM },
    ],
    hiddenCases: [
      { input: '5 0\n-3 1 2 3 -1', output: '2 4', category: TestCaseCategory.RANDOM },
      { input: '4 8\n1 5 3 7', output: '0 3', category: TestCaseCategory.RANDOM },
      { input: '7 13\n5 8 2 11 4 9 1', output: '0 1', category: TestCaseCategory.RANDOM },
      { input: '2 -10\n-4 -6', output: '0 1', category: TestCaseCategory.BOUNDARY },
      { input: '5 100\n10 20 30 40 70', output: '2 4', category: TestCaseCategory.RANDOM },
      { input: '8 15\n1 14 3 5 9 6 7 8', output: '0 1', category: TestCaseCategory.RANDOM },
      { input: '4 50\n5 20 25 30', output: '1 3', category: TestCaseCategory.EDGE },
      { input: '6 18\n9 1 17 2 16 8', output: '1 2', category: TestCaseCategory.RANDOM },
      { input: '5 4\n0 4 8 -2 6', output: '0 1', category: TestCaseCategory.BOUNDARY },
      { input: '5 11\n2 1 9 5 10', output: '1 2', category: TestCaseCategory.ADVERSARIAL },
    ],
  },
  {
    title: 'Valid Parentheses',
    slug: 'valid-parentheses',
    difficulty: Difficulty.EASY,
    tags: ['stack', 'strings'],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement:
      'Given a string containing only brackets (), {}, and [], output true if the brackets are balanced and properly nested, otherwise false.',
    constraints: { length: { min: 1, max: 100000 } },
    visibleCases: [
      { input: '()', output: 'true', category: TestCaseCategory.SAMPLE },
      { input: '()[]{}', output: 'true', category: TestCaseCategory.SAMPLE },
      { input: '(]', output: 'false', category: TestCaseCategory.SAMPLE },
      { input: '{[]}', output: 'true', category: TestCaseCategory.EDGE },
      { input: '([{}])', output: 'true', category: TestCaseCategory.RANDOM },
    ],
    hiddenCases: [
      { input: '(((((', output: 'false', category: TestCaseCategory.EDGE },
      { input: '([)]', output: 'false', category: TestCaseCategory.ADVERSARIAL },
      { input: '[]{}(()[])', output: 'true', category: TestCaseCategory.RANDOM },
      { input: ']', output: 'false', category: TestCaseCategory.BOUNDARY },
      { input: '{{{{}}}}', output: 'true', category: TestCaseCategory.RANDOM },
      { input: '(()', output: 'false', category: TestCaseCategory.EDGE },
      { input: '[{()}](){}', output: 'true', category: TestCaseCategory.RANDOM },
      { input: '([[[[]]]])', output: 'true', category: TestCaseCategory.STRESS },
      { input: '([{}{}[]])', output: 'true', category: TestCaseCategory.RANDOM },
      { input: '(){[}]', output: 'false', category: TestCaseCategory.ADVERSARIAL },
    ],
  },
  {
    title: 'Binary Search',
    slug: 'binary-search',
    difficulty: Difficulty.EASY,
    tags: ['arrays', 'binary-search'],
    timeLimitMs: 500,
    memoryLimitMb: 128,
    statement:
      'Given a sorted array and a target value, return the zero-based index of the target, or -1 if it does not exist.',
    constraints: { n: { min: 1, max: 100000 } },
    visibleCases: [
      { input: '6 9\n-1 0 3 5 9 12', output: '4', category: TestCaseCategory.SAMPLE },
      { input: '6 2\n-1 0 3 5 9 12', output: '-1', category: TestCaseCategory.SAMPLE },
      { input: '1 0\n0', output: '0', category: TestCaseCategory.SAMPLE },
      { input: '5 7\n1 3 5 7 9', output: '3', category: TestCaseCategory.RANDOM },
      { input: '4 -5\n-9 -5 -2 8', output: '1', category: TestCaseCategory.EDGE },
    ],
    hiddenCases: [
      { input: '1 1\n0', output: '-1', category: TestCaseCategory.BOUNDARY },
      { input: '8 20\n1 4 6 8 10 12 16 20', output: '7', category: TestCaseCategory.RANDOM },
      { input: '7 3\n0 1 2 4 5 6 7', output: '-1', category: TestCaseCategory.ADVERSARIAL },
      { input: '5 -10\n-10 -9 -8 -7 -6', output: '0', category: TestCaseCategory.BOUNDARY },
      { input: '5 42\n2 8 13 21 34', output: '-1', category: TestCaseCategory.RANDOM },
      { input: '9 100\n1 5 10 20 30 40 50 60 100', output: '8', category: TestCaseCategory.STRESS },
      { input: '2 5\n1 5', output: '1', category: TestCaseCategory.BOUNDARY },
      { input: '6 11\n1 3 5 7 9 11', output: '5', category: TestCaseCategory.RANDOM },
      { input: '6 -3\n-8 -5 -3 -1 0 2', output: '2', category: TestCaseCategory.RANDOM },
      { input: '3 8\n3 6 9', output: '-1', category: TestCaseCategory.EDGE },
    ],
  },
  {
    title: 'Climbing Stairs',
    slug: 'climbing-stairs',
    difficulty: Difficulty.EASY,
    tags: ['dynamic-programming', 'math'],
    timeLimitMs: 500,
    memoryLimitMb: 128,
    statement:
      'Given n stairs, output the number of distinct ways to reach the top if each move can climb either 1 step or 2 steps.',
    constraints: { n: { min: 1, max: 45 } },
    visibleCases: [
      { input: '1', output: '1', category: TestCaseCategory.SAMPLE },
      { input: '2', output: '2', category: TestCaseCategory.SAMPLE },
      { input: '3', output: '3', category: TestCaseCategory.SAMPLE },
      { input: '5', output: '8', category: TestCaseCategory.RANDOM },
      { input: '10', output: '89', category: TestCaseCategory.RANDOM },
    ],
    hiddenCases: [
      { input: '4', output: '5', category: TestCaseCategory.RANDOM },
      { input: '6', output: '13', category: TestCaseCategory.RANDOM },
      { input: '7', output: '21', category: TestCaseCategory.RANDOM },
      { input: '8', output: '34', category: TestCaseCategory.RANDOM },
      { input: '9', output: '55', category: TestCaseCategory.RANDOM },
      { input: '11', output: '144', category: TestCaseCategory.RANDOM },
      { input: '12', output: '233', category: TestCaseCategory.RANDOM },
      { input: '20', output: '10946', category: TestCaseCategory.STRESS },
      { input: '30', output: '1346269', category: TestCaseCategory.STRESS },
      { input: '45', output: '1836311903', category: TestCaseCategory.BOUNDARY },
    ],
  },
  {
    title: 'Maximum Subarray',
    slug: 'maximum-subarray',
    difficulty: Difficulty.MEDIUM,
    tags: ['arrays', 'dynamic-programming'],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement:
      'Given an integer array, find the contiguous subarray with the largest possible sum and output that sum.',
    constraints: { n: { min: 1, max: 200000 } },
    visibleCases: [
      { input: '9\n-2 1 -3 4 -1 2 1 -5 4', output: '6', category: TestCaseCategory.SAMPLE },
      { input: '1\n1', output: '1', category: TestCaseCategory.SAMPLE },
      { input: '5\n5 4 -1 7 8', output: '23', category: TestCaseCategory.SAMPLE },
      { input: '3\n-3 -2 -1', output: '-1', category: TestCaseCategory.EDGE },
      { input: '6\n1 -1 1 -1 1 -1', output: '1', category: TestCaseCategory.RANDOM },
    ],
    hiddenCases: [
      { input: '1\n-100000', output: '-100000', category: TestCaseCategory.BOUNDARY },
      { input: '7\n4 -1 2 1 -5 4 3', output: '8', category: TestCaseCategory.RANDOM },
      { input: '5\n0 0 0 0 0', output: '0', category: TestCaseCategory.EDGE },
      { input: '4\n-1 -2 -3 -4', output: '-1', category: TestCaseCategory.RANDOM },
      { input: '6\n2 3 -2 4 -10 9', output: '9', category: TestCaseCategory.RANDOM },
      { input: '8\n8 -19 5 -4 20 -7 6 3', output: '23', category: TestCaseCategory.ADVERSARIAL },
      { input: '5\n100 -1 -2 -3 -4', output: '100', category: TestCaseCategory.BOUNDARY },
      { input: '6\n-2 -3 4 -1 -2 1', output: '4', category: TestCaseCategory.RANDOM },
      { input: '7\n1 2 3 4 5 -20 10', output: '15', category: TestCaseCategory.RANDOM },
      { input: '10\n1 -2 3 10 -4 7 2 -5 4 -1', output: '18', category: TestCaseCategory.STRESS },
    ],
  },
  {
    title: 'Merge Intervals',
    slug: 'merge-intervals',
    difficulty: Difficulty.MEDIUM,
    tags: ['arrays', 'sorting', 'intervals'],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement:
      'Given a list of intervals, merge all overlapping intervals and print the resulting intervals in ascending order of start time.',
    constraints: { n: { min: 1, max: 100000 } },
    visibleCases: [
      { input: '4\n1 3\n2 6\n8 10\n15 18', output: '3\n1 6\n8 10\n15 18', category: TestCaseCategory.SAMPLE },
      { input: '2\n1 4\n4 5', output: '1\n1 5', category: TestCaseCategory.SAMPLE },
      { input: '1\n0 0', output: '1\n0 0', category: TestCaseCategory.SAMPLE },
      { input: '3\n1 4\n0 2\n3 5', output: '1\n0 5', category: TestCaseCategory.RANDOM },
      { input: '3\n5 7\n1 2\n3 4', output: '3\n1 2\n3 4\n5 7', category: TestCaseCategory.RANDOM },
    ],
    hiddenCases: [
      { input: '5\n1 10\n2 3\n4 5\n6 7\n8 9', output: '1\n1 10', category: TestCaseCategory.ADVERSARIAL },
      { input: '4\n1 2\n2 3\n3 4\n4 5', output: '1\n1 5', category: TestCaseCategory.RANDOM },
      { input: '2\n10 12\n1 5', output: '2\n1 5\n10 12', category: TestCaseCategory.EDGE },
      { input: '3\n0 1\n0 2\n0 3', output: '1\n0 3', category: TestCaseCategory.BOUNDARY },
      { input: '4\n1 3\n5 7\n2 4\n6 8', output: '2\n1 4\n5 8', category: TestCaseCategory.RANDOM },
      { input: '3\n1 5\n6 10\n10 12', output: '2\n1 5\n6 12', category: TestCaseCategory.RANDOM },
      { input: '4\n-5 -1\n-3 0\n2 4\n3 5', output: '2\n-5 0\n2 5', category: TestCaseCategory.RANDOM },
      { input: '2\n100 200\n150 180', output: '1\n100 200', category: TestCaseCategory.BOUNDARY },
      { input: '3\n7 8\n1 10\n2 3', output: '1\n1 10', category: TestCaseCategory.ADVERSARIAL },
      { input: '6\n1 2\n4 5\n7 8\n2 4\n5 7\n8 9', output: '1\n1 9', category: TestCaseCategory.STRESS },
    ],
  },
  {
    title: 'Minimum Path Sum',
    slug: 'minimum-path-sum',
    difficulty: Difficulty.MEDIUM,
    tags: ['dynamic-programming', 'grids'],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement:
      'Given an m x n grid of non-negative integers, find the minimum possible sum along a path from the top-left to the bottom-right moving only right or down.',
    constraints: { m: { min: 1, max: 200 }, n: { min: 1, max: 200 } },
    visibleCases: [
      { input: '3 3\n1 3 1\n1 5 1\n4 2 1', output: '7', category: TestCaseCategory.SAMPLE },
      { input: '2 3\n1 2 3\n4 5 6', output: '12', category: TestCaseCategory.SAMPLE },
      { input: '1 1\n5', output: '5', category: TestCaseCategory.SAMPLE },
      { input: '1 5\n1 2 3 4 5', output: '15', category: TestCaseCategory.EDGE },
      { input: '2 2\n1 100\n1 1', output: '3', category: TestCaseCategory.RANDOM },
    ],
    hiddenCases: [
      { input: '3 2\n1 2\n3 4\n5 6', output: '12', category: TestCaseCategory.RANDOM },
      { input: '2 2\n9 1\n1 9', output: '19', category: TestCaseCategory.ADVERSARIAL },
      { input: '4 1\n1\n2\n3\n4', output: '10', category: TestCaseCategory.BOUNDARY },
      { input: '2 4\n1 1 1 1\n9 9 9 1', output: '5', category: TestCaseCategory.RANDOM },
      { input: '3 3\n5 9 1\n4 7 2\n3 6 1', output: '15', category: TestCaseCategory.RANDOM },
      { input: '2 3\n0 0 0\n0 0 0', output: '0', category: TestCaseCategory.BOUNDARY },
      { input: '3 3\n1 2 5\n3 2 1\n4 3 1', output: '7', category: TestCaseCategory.RANDOM },
      { input: '4 4\n1 9 9 9\n1 1 9 9\n9 1 1 9\n9 9 1 1', output: '7', category: TestCaseCategory.ADVERSARIAL },
      { input: '2 2\n100 1\n1 1', output: '102', category: TestCaseCategory.RANDOM },
      { input: '5 5\n1 1 1 1 1\n1 9 9 9 1\n1 1 1 9 1\n9 9 1 9 1\n1 1 1 1 1', output: '9', category: TestCaseCategory.STRESS },
    ],
  },
  {
    title: 'Number of Islands',
    slug: 'number-of-islands',
    difficulty: Difficulty.MEDIUM,
    tags: ['graphs', 'bfs', 'dfs', 'grid'],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    statement:
      'Given a grid of 0s and 1s, output the number of connected islands. Cells connect only vertically and horizontally.',
    constraints: { m: { min: 1, max: 300 }, n: { min: 1, max: 300 } },
    visibleCases: [
      { input: '4 5\n1 1 1 1 0\n1 1 0 1 0\n1 1 0 0 0\n0 0 0 0 0', output: '1', category: TestCaseCategory.SAMPLE },
      { input: '4 5\n1 1 0 0 0\n1 1 0 0 0\n0 0 1 0 0\n0 0 0 1 1', output: '3', category: TestCaseCategory.SAMPLE },
      { input: '1 1\n0', output: '0', category: TestCaseCategory.SAMPLE },
      { input: '1 1\n1', output: '1', category: TestCaseCategory.SAMPLE },
      { input: '2 2\n1 0\n0 1', output: '2', category: TestCaseCategory.EDGE },
    ],
    hiddenCases: [
      { input: '3 3\n1 1 1\n1 1 1\n1 1 1', output: '1', category: TestCaseCategory.BOUNDARY },
      { input: '3 3\n0 0 0\n0 0 0\n0 0 0', output: '0', category: TestCaseCategory.BOUNDARY },
      { input: '3 4\n1 0 1 0\n0 1 0 1\n1 0 1 0', output: '6', category: TestCaseCategory.ADVERSARIAL },
      { input: '2 3\n1 1 0\n0 1 0', output: '1', category: TestCaseCategory.RANDOM },
      { input: '5 1\n1\n0\n1\n0\n1', output: '3', category: TestCaseCategory.EDGE },
      { input: '2 5\n1 0 1 1 0\n1 0 0 1 0', output: '2', category: TestCaseCategory.RANDOM },
      { input: '4 4\n1 0 0 1\n0 0 0 0\n0 1 1 0\n1 0 0 1', output: '5', category: TestCaseCategory.RANDOM },
      { input: '3 3\n1 0 1\n1 0 1\n1 0 1', output: '2', category: TestCaseCategory.RANDOM },
      { input: '4 4\n1 1 0 0\n1 0 0 1\n0 0 1 1\n0 0 0 0', output: '2', category: TestCaseCategory.ADVERSARIAL },
      { input: '5 5\n1 0 1 0 1\n0 1 0 1 0\n1 0 1 0 1\n0 1 0 1 0\n1 0 1 0 1', output: '13', category: TestCaseCategory.STRESS },
    ],
  },
  {
    title: 'Trapping Rain Water',
    slug: 'trapping-rain-water',
    difficulty: Difficulty.HARD,
    tags: ['arrays', 'two-pointers', 'stack'],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement:
      'Given an elevation map represented by bar heights, compute the total amount of water trapped after raining.',
    constraints: { n: { min: 1, max: 200000 } },
    visibleCases: [
      { input: '12\n0 1 0 2 1 0 1 3 2 1 2 1', output: '6', category: TestCaseCategory.SAMPLE },
      { input: '6\n4 2 0 3 2 5', output: '9', category: TestCaseCategory.SAMPLE },
      { input: '1\n5', output: '0', category: TestCaseCategory.SAMPLE },
      { input: '2\n3 4', output: '0', category: TestCaseCategory.EDGE },
      { input: '5\n3 0 0 0 3', output: '9', category: TestCaseCategory.RANDOM },
    ],
    hiddenCases: [
      { input: '5\n0 0 0 0 0', output: '0', category: TestCaseCategory.BOUNDARY },
      { input: '5\n5 4 3 2 1', output: '0', category: TestCaseCategory.EDGE },
      { input: '5\n1 2 3 4 5', output: '0', category: TestCaseCategory.EDGE },
      { input: '7\n2 0 2 0 2 0 2', output: '6', category: TestCaseCategory.RANDOM },
      { input: '8\n5 2 1 2 1 5 2 1', output: '14', category: TestCaseCategory.ADVERSARIAL },
      { input: '3\n2 0 2', output: '2', category: TestCaseCategory.BOUNDARY },
      { input: '6\n2 1 0 1 3 2', output: '4', category: TestCaseCategory.RANDOM },
      { input: '10\n4 2 0 3 2 5 1 0 1 3', output: '14', category: TestCaseCategory.STRESS },
      { input: '4\n9 0 0 9', output: '18', category: TestCaseCategory.RANDOM },
      { input: '5\n1 0 1 0 1', output: '2', category: TestCaseCategory.RANDOM },
    ],
  },
  {
    title: 'Word Break',
    slug: 'word-break',
    difficulty: Difficulty.HARD,
    tags: ['dynamic-programming', 'strings', 'hash-map'],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    statement:
      'Given a string and a dictionary, output true if the string can be segmented into one or more dictionary words, otherwise false.',
    constraints: { sLength: { min: 1, max: 300 }, dictionarySize: { min: 1, max: 1000 } },
    visibleCases: [
      { input: 'leetcode\n2\nleet code', output: 'true', category: TestCaseCategory.SAMPLE },
      { input: 'applepenapple\n2\napple pen', output: 'true', category: TestCaseCategory.SAMPLE },
      { input: 'catsandog\n5\ncats dog sand and cat', output: 'false', category: TestCaseCategory.SAMPLE },
      { input: 'a\n1\na', output: 'true', category: TestCaseCategory.SAMPLE },
      { input: 'cars\n3\ncar ca rs', output: 'true', category: TestCaseCategory.RANDOM },
    ],
    hiddenCases: [
      { input: 'aaaaaaa\n2\na aaa', output: 'true', category: TestCaseCategory.RANDOM },
      { input: 'pineapplepenapple\n3\napple pen pineapple', output: 'true', category: TestCaseCategory.RANDOM },
      { input: 'catsanddog\n5\ncats dog sand and cat', output: 'true', category: TestCaseCategory.RANDOM },
      { input: 'aaaaaaaaaaaab\n2\na aa', output: 'false', category: TestCaseCategory.ADVERSARIAL },
      { input: 'hello\n2\nhell world', output: 'false', category: TestCaseCategory.EDGE },
      { input: 'enterapotentpot\n5\na p ent enter ot', output: 'true', category: TestCaseCategory.ADVERSARIAL },
      { input: 'aaaaab\n3\na aa aaa', output: 'false', category: TestCaseCategory.RANDOM },
      { input: 'programming\n3\npro gram ming', output: 'true', category: TestCaseCategory.RANDOM },
      { input: 'zzzz\n1\nz', output: 'true', category: TestCaseCategory.BOUNDARY },
      { input: 'abcd\n2\na abc', output: 'false', category: TestCaseCategory.EDGE },
    ],
  },
];

async function ensureIndexes(sqlClient: postgres.Sql) {
  await sqlClient`CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);`;
  await sqlClient`CREATE INDEX IF NOT EXISTS idx_submissions_problem_id ON submissions(problem_id);`;
  await sqlClient`CREATE INDEX IF NOT EXISTS idx_test_cases_problem_id ON test_cases(problem_id);`;
  await sqlClient`CREATE INDEX IF NOT EXISTS idx_problems_slug ON problems(slug);`;
}

async function seedUsers(db: ReturnType<typeof drizzle<typeof schema>>) {
  const passwordRounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  const userSeeds = [
    {
      username: 'admin',
      email: 'admin@codeforge.local',
      role: UserRole.PLATFORM_ADMIN,
      password: 'Admin@123',
      rating: 2400,
    },
    {
      username: 'setter',
      email: 'setter@codeforge.local',
      role: UserRole.PROBLEM_SETTER,
      password: 'Setter@123',
      rating: 1600,
    },
    {
      username: 'testuser',
      email: 'user@codeforge.local',
      role: UserRole.USER,
      password: 'User@123',
      rating: 1200,
    },
  ] as const;

  for (const userSeed of userSeeds) {
    await db
      .insert(users)
      .values({
        username: userSeed.username,
        email: userSeed.email,
        passwordHash: await bcrypt.hash(userSeed.password, passwordRounds),
        role: userSeed.role,
        isVerified: true,
        rating: userSeed.rating,
      })
      .onConflictDoNothing();
  }

  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'admin@codeforge.local'))
    .limit(1);

  if (!admin) {
    throw new Error('Admin user could not be loaded after seeding');
  }

  return admin;
}

async function seedProblemsData(
  db: ReturnType<typeof drizzle<typeof schema>>,
  adminId: string,
) {
  for (const problemSeed of seedProblems) {
    await db
      .insert(problems)
      .values({
        title: problemSeed.title,
        slug: problemSeed.slug,
        statement: problemSeed.statement,
        difficulty: problemSeed.difficulty,
        constraints: problemSeed.constraints,
        tags: problemSeed.tags,
        timeLimitMs: problemSeed.timeLimitMs,
        memoryLimitMb: problemSeed.memoryLimitMb,
        isSpecialJudge: false,
        isPublished: true,
        createdBy: adminId,
        aiConfidence: 0.98,
      })
      .onConflictDoNothing();

    const [problem] = await db
      .select()
      .from(problems)
      .where(eq(problems.slug, problemSeed.slug))
      .limit(1);

    if (!problem) {
      throw new Error(`Problem ${problemSeed.slug} could not be loaded after seeding`);
    }

    const existingCases = await db
      .select({ count: sql<number>`count(*)` })
      .from(testCases)
      .where(eq(testCases.problemId, problem.id));

    if (Number(existingCases[0]?.count ?? 0) > 0) {
      continue;
    }

    const allCases = [
      ...problemSeed.visibleCases.map((testCase) => ({
        problemId: problem.id,
        input: testCase.input,
        expectedOutput: testCase.output,
        isHidden: false,
        category: testCase.category,
        createdBy: 'human',
      })),
      ...problemSeed.hiddenCases.map((testCase) => ({
        problemId: problem.id,
        input: testCase.input,
        expectedOutput: testCase.output,
        isHidden: true,
        category: testCase.category,
        createdBy: 'human',
      })),
    ];

    await db.insert(testCases).values(allCases);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set. Copy .env.example to .env first.');
  }

  const sqlClient = postgres(process.env.DATABASE_URL, { max: 1 });
  const db = drizzle(sqlClient, { schema });

  console.log('Seeding CodeForge AI database...');

  const admin = await seedUsers(db);
  await seedProblemsData(db, admin.id);
  await ensureIndexes(sqlClient);

  const [userCount, problemCount, testCaseCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(users),
    db.select({ count: sql<number>`count(*)` }).from(problems),
    db.select({ count: sql<number>`count(*)` }).from(testCases),
  ]);

  console.log(`Users: ${Number(userCount[0]?.count ?? 0)}`);
  console.log(`Problems: ${Number(problemCount[0]?.count ?? 0)}`);
  console.log(`Test cases: ${Number(testCaseCount[0]?.count ?? 0)}`);
  console.log('Admin login: admin@codeforge.local / Admin@123');
  console.log('Setter login: setter@codeforge.local / Setter@123');
  console.log('User login: user@codeforge.local / User@123');

  await sqlClient.end();
}

void main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
