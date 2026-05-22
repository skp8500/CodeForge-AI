import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { UserRole } from '@codeforge/shared';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtOptionalGuard } from '../../common/guards/jwt-optional.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { JwtAccessPayload } from '../../common/types/jwt-payload.types';
import {
  CreateProblemBodySchema,
  ProblemListQuerySchema,
  type CreateProblemBodyDto,
  type PaginatedProblems,
  type ProblemDetail,
  type ProblemListItem,
  type ProblemListQueryDto,
} from './problems.types';
import { ProblemsService } from './problems.service';

@ApiTags('Problems')
@Controller('problems')
export class ProblemsController {
  constructor(private readonly problemsService: ProblemsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtOptionalGuard)
  @ApiOperation({ summary: 'List published problems with pagination and filters' })
  @ApiOkResponse({ description: 'Paginated problem list' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max 100' })
  @ApiQuery({ name: 'difficulty', required: false, enum: ['easy', 'medium', 'hard'] })
  @ApiQuery({ name: 'tags', required: false, description: 'Comma-separated tag list' })
  @ApiQuery({ name: 'search', required: false, description: 'Title substring search' })
  @ApiQuery({ name: 'solved', required: false, enum: ['true', 'false'], description: 'Requires auth' })
  async listProblems(
    @Query(new ZodValidationPipe(ProblemListQuerySchema)) query: ProblemListQueryDto,
    @CurrentUser() user: JwtAccessPayload | null,
  ): Promise<PaginatedProblems> {
    return this.problemsService.listProblems(query, user?.sub);
  }

  @Get(':slug')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtOptionalGuard)
  @ApiOperation({ summary: 'Get full problem details with sample test cases and submission stats' })
  @ApiOkResponse({ description: 'Problem detail with visible test cases and stats' })
  @ApiNotFoundResponse({ description: 'Problem not found or not published' })
  async getProblem(@Param('slug') slug: string): Promise<ProblemDetail> {
    return this.problemsService.getProblemBySlug(slug);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROBLEM_SETTER, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Create a new problem — slug auto-generated from title (collision-safe)' })
  @ApiCreatedResponse({ description: 'Problem created, initially unpublished' })
  async createProblem(
    @Body(new ZodValidationPipe(CreateProblemBodySchema)) body: CreateProblemBodyDto,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<ProblemListItem> {
    return this.problemsService.createProblem(body, user.sub);
  }

  @Patch(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PROBLEM_SETTER, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Publish a draft problem (set isPublished=true)' })
  @ApiOkResponse({ description: 'Problem published' })
  @ApiNotFoundResponse({ description: 'Problem not found or access denied' })
  async publishProblem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<ProblemListItem> {
    return this.problemsService.publishProblem(id, user.sub);
  }

  @Get(':id/submissions')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get current user's submissions for a problem, sorted by submittedAt desc" })
  @ApiOkResponse({ description: 'Submission history for this problem' })
  async getProblemSubmissions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtAccessPayload,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.problemsService.getProblemSubmissions(id, user.sub, page, limit);
  }
}
