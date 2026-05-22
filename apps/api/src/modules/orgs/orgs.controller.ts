import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { JwtAccessPayload } from '../../common/types/jwt-payload.types';
import {
  AcceptInviteBodySchema,
  CreateOrgBodySchema,
  InviteMemberBodySchema,
  UpdateMemberRoleBodySchema,
  type AcceptInviteBodyDto,
  type CreateOrgBodyDto,
  type InviteMemberBodyDto,
  type UpdateMemberRoleBodyDto,
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
  @ApiOperation({ summary: 'Create a new organization — caller becomes admin' })
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

  @Get(':id/members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all members of an organization — org admin only' })
  async getMembers(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.orgsService.getMembers(id, user.sub);
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite a member by email — sends magic link invite' })
  async inviteMember(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(InviteMemberBodySchema)) body: InviteMemberBodyDto,
    @CurrentUser() user: JwtAccessPayload,
    @Req() req: Request,
  ) {
    const frontendUrl =
      process.env['NEXT_PUBLIC_APP_URL'] ??
      process.env['NEXT_PUBLIC_URL'] ??
      `${req.protocol}://${req.get('host')}`.replace(':3001', ':3000');
    return this.orgsService.inviteMember(id, body, user.sub, frontendUrl);
  }

  @Post('invite/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an org invite using the token from the invite email' })
  async acceptInvite(
    @Body(new ZodValidationPipe(AcceptInviteBodySchema)) body: AcceptInviteBodyDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.orgsService.acceptInvite(body, user.sub);
  }

  @Patch(':id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Change a member's role — org admin only" })
  async updateMemberRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(UpdateMemberRoleBodySchema)) body: UpdateMemberRoleBodyDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.orgsService.updateMemberRole(id, userId, body, user.sub);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member from an organization — org admin only' })
  async removeMember(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.orgsService.removeMember(id, userId, user.sub);
  }
}
