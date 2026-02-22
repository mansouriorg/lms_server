import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
// Importing the Prisma Client from your custom generated folder
import { PrismaClient } from 'generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    // Connect to the database when the application starts
    await this.$connect();
  }

  async onModuleDestroy() {
    // Gracefully close the connection when the application shuts down
    await this.$disconnect();
  }
}