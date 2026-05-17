const { PrismaClient } = require('@prisma/client');

function buildDatasourceUrl() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url || url.includes('connection_limit')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=1&pool_timeout=0`;
}

const globalForPrisma = global;
const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: buildDatasourceUrl() } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

module.exports = prisma;
