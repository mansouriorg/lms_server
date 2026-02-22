import { Module } from '@nestjs/common';
import { StagesService } from './stages.service';
import { StagesController } from './stages.controller';

@Module({
  controllers: [StagesController],
  providers: [StagesService],
})
export class StagesModule {}
