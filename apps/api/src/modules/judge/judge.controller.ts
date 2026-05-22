import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../../common/types/jwt-payload.types';
import {
  CreateSubmissionBodySchema,
  type CreateSubmissionBodyDto,
  type SubmissionEnqueuedResponse,
  type SubmissionStatusResponse,
} from './judge.types';
import { JudgeService } from './judge.service';
import type { AiReview } from '../ai/code-review.types';
import { CodeReviewService } from '../ai/code-review.service';

@ApiTags('Submissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('submissions')
export class JudgeController {
  constructor(
    private readonly judgeService: JudgeService,
    private readonly codeReviewService: CodeReviewService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submit code for a problem — enqueues for judging' })
  @ApiAcceptedResponse({ description: 'Submission enqueued; returns submissionId and queue position' })
  @ApiTooManyRequestsResponse({ description: 'User has 5+ pending submissions' })
  async createSubmission(
    @Body(new ZodValidationPipe(CreateSubmissionBodySchema)) body: CreateSubmissionBodyDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SubmissionEnqueuedResponse> {
    return this.judgeService.createSubmission(body, user.sub);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Poll submission status — returns current verdict (null while pending)' })
  @ApiOkResponse({ description: 'Submission with current verdict' })
  @ApiNotFoundResponse({ description: 'Submission not found or not owned by caller' })
  async getSubmission(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<SubmissionStatusResponse> {
    return this.judgeService.getSubmission(id, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a queued submission — only works while verdict is still null' })
  @ApiNotFoundResponse({ description: 'Submission not found, already judged, or not owned by caller' })
  async cancelSubmission(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<void> {
    return this.judgeService.cancelSubmission(id, user.sub);
  }

  @Get(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get AI code review for a submission' })
  @ApiOkResponse({ description: 'AI review with complexity analysis and quality score' })
  @ApiNotFoundResponse({ description: 'No review generated yet' })
  async getSubmissionReview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<AiReview> {
    return this.codeReviewService.getReview(id, user.sub);
  }
}
