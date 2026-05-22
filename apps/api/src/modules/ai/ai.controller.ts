import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { UserRole } from '@codeforge/shared';

import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { JwtAccessPayload } from '../../common/types/jwt-payload.types';
import {
  ParseProblemBodySchema,
  type ParseProblemBodyDto,
  type ParseProblemResponse,
} from './problem-parser.types';
import { ProblemParserService } from './problem-parser.service';
import {
  GenerateTestsBodySchema,
  type GenerateTestsBodyDto,
  type GenerateTestsResponse,
} from './test-generator.types';
import { TestGeneratorService } from './test-generator.service';
import {
  ReviewSubmissionBodySchema,
  type ReviewSubmissionBodyDto,
  type AiReview,
} from './code-review.types';
import { CodeReviewService } from './code-review.service';
import {
  ExplainProblemBodySchema,
  FollowupBodySchema,
  type ExplainProblemBodyDto,
  type ExplainProblemResponse,
  type FollowupBodyDto,
  type FollowupResponse,
} from './problem-explainer.types';
import { ProblemExplainerService } from './problem-explainer.service';

@ApiTags('AI')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private readonly parserService: ProblemParserService,
    private readonly generatorService: TestGeneratorService,
    private readonly codeReviewService: CodeReviewService,
    private readonly explainerService: ProblemExplainerService,
  ) {}

  @Post('parse-problem')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROBLEM_SETTER, UserRole.PLATFORM_ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Parse a raw competitive programming problem into structured metadata' })
  async parseProblem(
    @Body(new ZodValidationPipe(ParseProblemBodySchema)) body: ParseProblemBodyDto,
  ): Promise<ParseProblemResponse> {
    return this.parserService.parse(body.rawText);
  }

  @Post('generate-tests')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROBLEM_SETTER, UserRole.PLATFORM_ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Generate test cases for a problem using 6 parallel AI calls (one per category)',
  })
  async generateTests(
    @Body(new ZodValidationPipe(GenerateTestsBodySchema)) body: GenerateTestsBodyDto,
  ): Promise<GenerateTestsResponse> {
    return this.generatorService.generateTests(body.problemId);
  }

  @Post('review-submission')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Request or retrieve AI code review for a submission' })
  async reviewSubmission(
    @Body(new ZodValidationPipe(ReviewSubmissionBodySchema)) body: ReviewSubmissionBodyDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<AiReview | { status: 'pending' }> {
    return this.codeReviewService.triggerReview(body.submissionId, user.sub);
  }

  @Post('explain-problem')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get an AI explanation of a problem at eli5, standard, or expert level',
  })
  async explainProblem(
    @Body(new ZodValidationPipe(ExplainProblemBodySchema)) body: ExplainProblemBodyDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<ExplainProblemResponse> {
    return this.explainerService.explainProblem(body.problemId, body.level, user.sub);
  }

  @Post('explain-problem/followup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Ask a follow-up question about a problem, using conversation history for context',
  })
  async explainFollowup(
    @Body(new ZodValidationPipe(FollowupBodySchema)) body: FollowupBodyDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<FollowupResponse> {
    return this.explainerService.explainFollowup(
      body.problemId,
      body.question,
      body.conversationHistory,
      user.sub,
    );
  }
}
