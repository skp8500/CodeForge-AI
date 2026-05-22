import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { JwtAccessPayload } from '../../common/types/jwt-payload.types';
import {
  CreateAssessmentSchema,
  InviteCandidatesSchema,
  LogFlagSchema,
  type CreateAssessmentDto,
  type InviteCandidatesDto,
  type LogFlagDto,
} from './assessments.types';
import { AssessmentsService } from './assessments.service';

@ApiTags('Assessments')
@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  // ─── Admin routes ──────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new assessment — org admin only' })
  async createAssessment(
    @Body(new ZodValidationPipe(CreateAssessmentSchema)) body: CreateAssessmentDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.assessmentsService.createAssessment(body, user.sub);
  }

  @Get('org/:orgId')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List assessments for an org — org admin only' })
  async listByOrg(
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.assessmentsService.listByOrg(orgId, user.sub);
  }

  @Post(':id/candidates')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Bulk invite candidates by email — org admin only' })
  async inviteCandidates(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(InviteCandidatesSchema)) body: InviteCandidatesDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.assessmentsService.inviteCandidates(id, body, user.sub);
  }

  @Get(':id/results')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all candidate results for an assessment — org admin only' })
  async getResults(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.assessmentsService.getResults(id, user.sub);
  }

  @Get(':id/export')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Export assessment results as CSV — org admin only' })
  @ApiQuery({ name: 'format', required: false, enum: ['csv'] })
  async exportResults(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Res() res: Response,
  ) {
    const csv = await this.assessmentsService.exportCsv(id, user.sub);
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="assessment-${id}-results.csv"`,
    });
    res.send(csv);
  }

  // ─── Candidate routes ──────────────────────────────────────────────────────

  @Get(':id/candidate/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate candidate token and get assessment details + JWT' })
  @ApiQuery({ name: 'token', required: true })
  async verifyCandidate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('token') token: string,
  ) {
    return this.assessmentsService.verifyCandidate(id, token);
  }

  @Post(':id/candidate/flag')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Log a candidate flag (tab switch or paste) for monitoring' })
  async logFlag(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(LogFlagSchema)) body: LogFlagDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    // sessionId is embedded in the candidate JWT as a custom claim
    const payload = user as JwtAccessPayload & { sessionId?: string };
    if (!payload.sessionId) return;
    await this.assessmentsService.logFlag(payload.sessionId, body);
  }

  @Post(':id/candidate/submit')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Finalize the candidate session (manual or auto-submit on timer expiry)' })
  async submitSession(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    const payload = user as JwtAccessPayload & { sessionId?: string };
    if (!payload.sessionId) return { score: 0 };
    return this.assessmentsService.submitSession(payload.sessionId, id, user.sub);
  }
}
