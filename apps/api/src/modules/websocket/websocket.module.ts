import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { JudgeGateway } from './judge.gateway';
import { WebsocketGateway } from './websocket.gateway';

@Module({
  imports: [
    // JwtService for verifying tokens in JudgeGateway.handleConnection()
    // No default secret — each verifyAsync call supplies its own.
    JwtModule.register({}),
  ],
  providers: [WebsocketGateway, JudgeGateway],
})
export class WebsocketModule {}
