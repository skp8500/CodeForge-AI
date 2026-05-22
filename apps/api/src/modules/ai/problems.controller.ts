import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../../common/types/jwt-payload.types';
import { ProblemExplainerService } from './problem-explainer.service';
import type { HintResponse } from './problem-explainer.types';

@ApiTags('Problems')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('problems')
export class ProblemsController {
  constructor(private readonly explainerService: ProblemExplainerService) {}

  @Get(':id/hint')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a progressive hint for a problem — users can only advance forward',
  })
  @ApiQuery({ name: 'hintNumber', enum: [1, 2, 3], required: true })
  async getHint(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('hintNumber', new ParseIntPipe()) hintNumber: number,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<HintResponse> {
    if (hintNumber < 1 || hintNumber > 3) {
      throw new BadRequestException('hintNumber must be 1, 2, or 3');
    }
    return this.explainerService.getHint(id, hintNumber as 1 | 2 | 3, user.sub);
  }
}
