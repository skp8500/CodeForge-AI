import { randomBytes } from 'crypto';

import {
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, asc, eq, sql } from 'drizzle-orm';

import {
  assessmentProblems,
  assessments,
  candidateFlags,
  candidateSessions,
  organizations,
  orgMembers,
  problems,
  submissions,
} from '@codeforge/db';
import type { Db } from '@codeforge/db';
import { AssessmentFlagType } from '@codeforge/shared';

import { DB_TOKEN } from '../../database/database.module';
import { MailService } from '../../mail/mail.service';
import { UsersService } from '../../users/users.service';
import type { CreateAssessmentDto, InviteCandidatesDto, LogFlagDto } from './assessments.types';

const CANDIDATE_JWT_TTL = '24h';

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
  ) {}

  // ─── Create assessment ─────────────────────────────────────────────────────

  async createAssessment(dto: CreateAssessmentDto, creatorId: string) {
    await this.requireOrgAdmin(dto.orgId, creatorId);

    const [assessment] = await this.db
      .insert(assessments)
      .values({
        title: dto.title,
        orgId: dto.orgId,
        durationMinutes: dto.durationMinutes,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        allowedLanguages: dto.allowedLanguages,
        randomizeProblems: dto.randomizeProblems,
        uniqueVariants: dto.uniqueVariants,
        createdBy: creatorId,
      })
      .returning();

    // Insert problems in order
    const problemRows = dto.problemIds.map((problemId, index) => ({
      assessmentId: assessment!.id,
      problemId,
      orderIndex: index,
      points: 100,
    }));
    await this.db.insert(assessmentProblems).values(problemRows);

    return assessment;
  }

  // ─── List org assessments ──────────────────────────────────────────────────

  async listByOrg(orgId: string, requesterId: string) {
    await this.requireOrgAdmin(orgId, requesterId);

    return this.db
      .select({
        id: assessments.id,
        title: assessments.title,
        durationMinutes: assessments.durationMinutes,
        startsAt: assessments.startsAt,
        endsAt: assessments.endsAt,
        allowedLanguages: assessments.allowedLanguages,
        randomizeProblems: assessments.randomizeProblems,
        uniqueVariants: assessments.uniqueVariants,
        createdAt: assessments.createdAt,
      })
      .from(assessments)
      .where(eq(assessments.orgId, orgId))
      .orderBy(asc(assessments.startsAt));
  }

  // ─── Invite candidates ─────────────────────────────────────────────────────

  async inviteCandidates(assessmentId: string, dto: InviteCandidatesDto, requesterId: string) {
    const assessment = await this.requireAssessmentAdmin(assessmentId, requesterId);

    const [org] = await this.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, assessment.orgId))
      .limit(1);

    const frontendUrl =
      this.config.get<string>('NEXT_PUBLIC_APP_URL') ??
      this.config.get<string>('NEXT_PUBLIC_URL') ??
      'http://localhost:3000';

    let invited = 0;
    let alreadyInvited = 0;

    // Determine problem order for randomization (shared base order)
    const problemRows = await this.db
      .select({ problemId: assessmentProblems.problemId, orderIndex: assessmentProblems.orderIndex })
      .from(assessmentProblems)
      .where(eq(assessmentProblems.assessmentId, assessmentId))
      .orderBy(asc(assessmentProblems.orderIndex));

    for (const email of dto.emails) {
      // Idempotency: skip if session already exists
      const [existing] = await this.db
        .select({ id: candidateSessions.id })
        .from(candidateSessions)
        .where(and(eq(candidateSessions.assessmentId, assessmentId), eq(candidateSessions.candidateEmail, email)))
        .limit(1);

      if (existing) {
        alreadyInvited++;
        continue;
      }

      const candidateUser = await this.usersService.findOrCreateGuest(email);

      // Determine problem order (randomize per-candidate if enabled)
      const problemOrder = assessment.randomizeProblems
        ? shuffle(problemRows.map((r) => r.problemId))
        : problemRows.map((r) => r.problemId);

      // Variant config placeholder (full AI adjustment would go here)
      const variantConfig = assessment.uniqueVariants
        ? { generatedAt: new Date().toISOString(), variant: 'base' }
        : null;

      const token = randomBytes(32).toString('hex');
      await this.db.insert(candidateSessions).values({
        assessmentId,
        userId: candidateUser.id,
        candidateEmail: email,
        token,
        problemOrder,
        variantConfig,
      });

      const assessmentUrl = `${frontendUrl}/assess/${assessmentId}?token=${token}`;
      await this.mailService
        .sendAssessmentInvite(email, assessment.title, org?.name ?? 'CodeForge', assessmentUrl, assessment.startsAt, assessment.durationMinutes)
        .catch((err) => this.logger.warn(`Failed to send invite email to ${email}`, err));

      invited++;
    }

    return { invited, alreadyInvited };
  }

  // ─── Get results (org admin) ───────────────────────────────────────────────

  async getResults(assessmentId: string, requesterId: string) {
    await this.requireAssessmentAdmin(assessmentId, requesterId);

    const sessions = await this.db
      .select({
        id: candidateSessions.id,
        candidateEmail: candidateSessions.candidateEmail,
        userId: candidateSessions.userId,
        startedAt: candidateSessions.startedAt,
        submittedAt: candidateSessions.submittedAt,
        score: candidateSessions.score,
        tabSwitches: candidateSessions.tabSwitches,
        pasteEvents: candidateSessions.pasteEvents,
      })
      .from(candidateSessions)
      .where(eq(candidateSessions.assessmentId, assessmentId));

    const assessment = await this.db
      .select({ startsAt: assessments.startsAt, endsAt: assessments.endsAt })
      .from(assessments)
      .where(eq(assessments.id, assessmentId))
      .limit(1);

    const { startsAt, endsAt } = assessment[0]!;

    // For each session, count AC submissions within the assessment window
    const results = await Promise.all(
      sessions.map(async (session) => {
        const subs = await this.db
          .select({
            problemId: submissions.problemId,
            verdict: submissions.verdict,
            runtimeMs: submissions.runtimeMs,
          })
          .from(submissions)
          .where(
            and(
              eq(submissions.userId, session.userId),
              sql`${submissions.submittedAt} >= ${startsAt}`,
              sql`${submissions.submittedAt} <= ${endsAt}`,
            ),
          );

        const acSubs = subs.filter((s) => s.verdict === 'AC');
        const uniqueSolved = new Set(acSubs.map((s) => s.problemId)).size;
        const runtimes = acSubs.map((s) => s.runtimeMs).filter((r): r is number => r !== null);
        const avgRuntime = runtimes.length > 0 ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length) : null;

        return {
          ...session,
          problemsAttempted: new Set(subs.map((s) => s.problemId)).size,
          problemsSolved: uniqueSolved,
          avgRuntimeMs: avgRuntime,
          plagiarismRisk: session.tabSwitches > 3 || session.pasteEvents > 5 ? 'high' : 'low',
        };
      }),
    );

    return results;
  }

  // ─── Export CSV ────────────────────────────────────────────────────────────

  async exportCsv(assessmentId: string, requesterId: string): Promise<string> {
    const rows = await this.getResults(assessmentId, requesterId);

    const header = [
      'Email', 'Score', 'Problems Solved', 'Problems Attempted',
      'Avg Runtime (ms)', 'Plagiarism Risk', 'Tab Switches', 'Paste Events',
      'Started At', 'Submitted At',
    ].join(',');

    const lines = rows.map((r) =>
      [
        csvEscape(r.candidateEmail),
        r.score ?? '',
        r.problemsSolved,
        r.problemsAttempted,
        r.avgRuntimeMs ?? '',
        r.plagiarismRisk,
        r.tabSwitches,
        r.pasteEvents,
        r.startedAt?.toISOString() ?? '',
        r.submittedAt?.toISOString() ?? '',
      ].join(','),
    );

    return [header, ...lines].join('\n');
  }

  // ─── Candidate: verify token and issue JWT ─────────────────────────────────

  async verifyCandidate(assessmentId: string, token: string) {
    const [session] = await this.db
      .select()
      .from(candidateSessions)
      .where(and(eq(candidateSessions.assessmentId, assessmentId), eq(candidateSessions.token, token)))
      .limit(1);

    if (!session) throw new UnauthorizedException('Invalid or expired candidate token');

    const [assessment] = await this.db
      .select()
      .from(assessments)
      .where(eq(assessments.id, assessmentId))
      .limit(1);

    if (!assessment) throw new NotFoundException('Assessment not found');

    if (new Date() > assessment.endsAt) throw new GoneException('Assessment has ended');

    // Mark session started (idempotent)
    if (!session.startedAt) {
      await this.db
        .update(candidateSessions)
        .set({ startedAt: new Date() })
        .where(eq(candidateSessions.id, session.id));
    }

    // Fetch problems in candidate's order
    const problemOrder = (session.problemOrder as string[]) ?? [];
    const problemRows = await this.db
      .select({
        id: problems.id,
        title: problems.title,
        slug: problems.slug,
        statement: problems.statement,
        difficulty: problems.difficulty,
        constraints: problems.constraints,
        timeLimitMs: problems.timeLimitMs,
        memoryLimitMb: problems.memoryLimitMb,
      })
      .from(problems)
      .where(sql`${problems.id} = ANY(${problemOrder})`);

    // Re-order to match candidate's problem order
    const orderedProblems = problemOrder
      .map((id) => problemRows.find((p) => p.id === id))
      .filter(Boolean);

    // Issue a short-lived candidate JWT (sub = guest userId)
    const secret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const candidateJwt = await this.jwtService.signAsync(
      { sub: session.userId, sessionId: session.id, assessmentId, type: 'candidate' },
      { secret, expiresIn: CANDIDATE_JWT_TTL, issuer: 'codeforge-api' },
    );

    return {
      session: {
        id: session.id,
        startedAt: session.startedAt ?? new Date(),
        submittedAt: session.submittedAt,
      },
      assessment: {
        id: assessment.id,
        title: assessment.title,
        durationMinutes: assessment.durationMinutes,
        startsAt: assessment.startsAt,
        endsAt: assessment.endsAt,
        allowedLanguages: assessment.allowedLanguages,
      },
      problems: orderedProblems,
      candidateJwt,
    };
  }

  // ─── Candidate: log flag ───────────────────────────────────────────────────

  async logFlag(sessionId: string, dto: LogFlagDto) {
    await this.db.insert(candidateFlags).values({
      sessionId,
      type: dto.type === 'tab_switch' ? AssessmentFlagType.TAB_SWITCH : AssessmentFlagType.PASTE,
      metadata: dto.metadata ?? null,
    });

    // Increment denormalized counter
    if (dto.type === 'tab_switch') {
      await this.db
        .update(candidateSessions)
        .set({ tabSwitches: sql`${candidateSessions.tabSwitches} + 1` })
        .where(eq(candidateSessions.id, sessionId));
    } else {
      await this.db
        .update(candidateSessions)
        .set({ pasteEvents: sql`${candidateSessions.pasteEvents} + 1` })
        .where(eq(candidateSessions.id, sessionId));
    }
  }

  // ─── Candidate: submit session (called on timer expiry or manual submit) ────

  async submitSession(sessionId: string, assessmentId: string, userId: string) {
    // Compute score: count AC submissions within assessment window
    const [assessment] = await this.db
      .select({ startsAt: assessments.startsAt, endsAt: assessments.endsAt })
      .from(assessments)
      .where(eq(assessments.id, assessmentId))
      .limit(1);

    if (!assessment) throw new NotFoundException('Assessment not found');

    const apRows = await this.db
      .select({ problemId: assessmentProblems.problemId, points: assessmentProblems.points })
      .from(assessmentProblems)
      .where(eq(assessmentProblems.assessmentId, assessmentId));

    const acSubs = await this.db
      .select({ problemId: submissions.problemId })
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, userId),
          sql`${submissions.verdict} = 'AC'`,
          sql`${submissions.submittedAt} >= ${assessment.startsAt}`,
          sql`${submissions.submittedAt} <= ${assessment.endsAt}`,
        ),
      );

    const solvedIds = new Set(acSubs.map((s) => s.problemId));
    const score = apRows.filter((p) => solvedIds.has(p.problemId)).reduce((sum, p) => sum + p.points, 0);

    await this.db
      .update(candidateSessions)
      .set({ submittedAt: new Date(), score })
      .where(eq(candidateSessions.id, sessionId));

    return { score };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async requireOrgAdmin(orgId: string, userId: string) {
    const [org] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) throw new NotFoundException(`Organization ${orgId} not found`);

    if (org.ownerId !== userId) {
      const [membership] = await this.db
        .select({ role: orgMembers.role })
        .from(orgMembers)
        .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
        .limit(1);

      if (!membership || membership.role !== 'admin') {
        throw new ForbiddenException('Only org admins can perform this action');
      }
    }

    return org;
  }

  private async requireAssessmentAdmin(assessmentId: string, userId: string) {
    const [assessment] = await this.db
      .select()
      .from(assessments)
      .where(eq(assessments.id, assessmentId))
      .limit(1);

    if (!assessment) throw new NotFoundException('Assessment not found');

    await this.requireOrgAdmin(assessment.orgId, userId);
    return assessment;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
