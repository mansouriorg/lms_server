import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Uses the new Prisma v7 'env' utility for maximum safety
    url: env("DATABASE_URL"), 
  },
});