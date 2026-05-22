export enum Verdict {
  AC = 'AC',
  WA = 'WA',
  TLE = 'TLE',
  MLE = 'MLE',
  RE = 'RE',
  CE = 'CE',
  OLE = 'OLE',
  IE = 'IE',
  CANCELLED = 'CANCELLED',
}

export enum Difficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export enum Language {
  CPP = 'cpp',
  PYTHON = 'python',
  JAVA = 'java',
  JAVASCRIPT = 'javascript',
}

export enum UserRole {
  GUEST = 'guest',
  USER = 'user',
  PROBLEM_SETTER = 'problem_setter',
  ORG_ADMIN = 'org_admin',
  PLATFORM_ADMIN = 'platform_admin',
}

export enum TestCaseCategory {
  SAMPLE = 'sample',
  BOUNDARY = 'boundary',
  EDGE = 'edge',
  RANDOM = 'random',
  STRESS = 'stress',
  ADVERSARIAL = 'adversarial',
}

export enum OrgPlan {
  FREE = 'free',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export enum ContestScoringMode {
  ICPC = 'icpc',
  IOI = 'ioi',
  CUSTOM = 'custom',
}

export enum AssessmentFlagType {
  TAB_SWITCH = 'tab_switch',
  PASTE = 'paste',
}
