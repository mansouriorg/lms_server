import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg'; // <-- FIXED: Directly import Pool here!
import { PrismaClient } from 'src/generated/prisma/client';

// REMOVED: const { Pool } = pg;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // 1. Create a secure connection pool to your PostgreSQL database
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    // 2. Wrap the pool in Prisma's lightning-fast v7 Driver Adapter
    const adapter = new PrismaPg(pool);
    
    // 3. Initialize the Prisma Client using the adapter
    super({ adapter });
  }

  async onModuleInit() {
    // Connect to the database when the application starts
    await this.$connect();
  }

  async onModuleDestroy() {
    // Gracefully close the connection when the application shuts down
    await this.$disconnect();
  }
}