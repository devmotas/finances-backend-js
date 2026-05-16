const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');
const transactionRoutes = require('./routes/transactions');
const recurrenceRoutes = require('./routes/recurrences');
const investmentRoutes = require('./routes/investments');
const summaryRoutes = require('./routes/summary');
const reportRoutes = require('./routes/reports');

const app = express();

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:4200')
  .split(',')
  .map((s) => s.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'],
  })
);

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/debug', async (req, res) => {
  try {
    const prisma = require('./db/prisma');
    await prisma.$queryRaw`SELECT 1`;
    res.json({ db: 'ok', env: { hasDbUrl: !!process.env.DATABASE_URL, hasJwt: !!process.env.JWT_SECRET } });
  } catch (err) {
    res.status(500).json({ db: 'error', message: err.message });
  }
});

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/categories', categoryRoutes);
app.use('/transactions', transactionRoutes);
app.use('/recurrences', recurrenceRoutes);
app.use('/investments', investmentRoutes);
app.use('/finance', summaryRoutes);
app.use('/reports', reportRoutes);

app.use(errorHandler);

module.exports = app;
