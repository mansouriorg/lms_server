import { Module } from '@nestjs/common';
import { CentersService } from './centers.service';
import { CentersController } from './centers.controller';

@Module({
  providers: [CentersService],
  controllers: [CentersController]
})
export class CentersModule {}
