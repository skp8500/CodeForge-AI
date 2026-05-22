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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { JwtAccessPayload } from '../../common/types/jwt-payload.types';
import {
  AddMemberBodySchema,
  CreateOrgBodySchema,
  type AddMemberBodyDto,
  type CreateOrgBodyDto,
} from './orgs.types';
import { OrgsService } from './orgs.service';

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orgs')
export class OrgsController {
  constructor(private readonly orgsService: OrgsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new organization — slug auto-generated from name' })
  async createOrg(
    @Body(new ZodValidationPipe(CreateOrgBodySchema)) body: CreateOrgBodyDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.orgsService.createOrg(body, user.sub);
  }

  @Get(':slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get organization by slug with member count' })
  async getOrg(@Param('slug') slug: string) {
    return this.orgsService.getOrgBySlug(slug);
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a member to an organization' })
  async addMember(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(AddMemberBodySchema)) body: AddMemberBodyDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.orgsService.addMember(id, body, user.sub);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member from an organization' })
  async removeMember(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.orgsService.removeMember(id, userId, user.sub);
  }
}
