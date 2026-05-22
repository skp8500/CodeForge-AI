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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { UserRole } from '@codeforge/shared';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtOptionalGuard } from '../../common/guards/jwt-optional.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { JwtAccessPayload } from '../../common/types/jwt-payload.types';
import {
  AddContestProblemBodySchema,
  ContestListQuerySchema,
  CreateContestBodySchema,
  type AddContestProblemBodyDto,
  type ContestListQueryDto,
  type CreateContestBodyDto,
} from './contests.types';
import { ContestsService } from './contests.service';

@ApiTags('Contests')
@Controller('contests')
export class ContestsController {
  constructor(private readonly contestsService: ContestsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtOptionalGuard)
  @ApiOperation({ summary: 'List public contests with optional status filter' })
  async listContests(
    @Query(new ZodValidationPipe(ContestListQuerySchema)) query: ContestListQueryDto,
  ) {
    return this.contestsService.listContests(query);
  }

  @Get(':slug')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtOptionalGuard)
  @ApiOperation({ summary: 'Get contest details with problem list' })
  async getContest(@Param('slug') slug: string) {
    return this.contestsService.getContestBySlug(slug);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Create a new contest — slug auto-generated from title' })
  async createContest(
    @Body(new ZodValidationPipe(CreateContestBodySchema)) body: CreateContestBodyDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.contestsService.createContest(body, user.sub);
  }

  @Post(':id/problems')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.PLATFORM_ADMIN)
  @ApiOperation({ summary: 'Add a problem to a contest' })
  async addProblem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(AddContestProblemBodySchema)) body: AddContestProblemBodyDto,
    @CurrentUser() _user: JwtAccessPayload,
  ) {
    return this.contestsService.addProblemToContest(id, body);
  }
}
