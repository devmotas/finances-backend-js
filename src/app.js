const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const categoryRoutes = require('./routes/categories');
const transactionRoutes = require('./routes/transactions');
const recurrenceRoutes = require('./routes/recurrences');
const investmentRoutes = require('./routes/investments');
const investmentAccountRoutes = require('./routes/investmentAccounts');
const summaryRoutes = require('./routes/summary');
const reportRoutes = require('./routes/reports');

const app = express();

const DEFAULT_ALLOWED_ORIGIN = 'http://localhost:4200';

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGIN)
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

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/categories', categoryRoutes);
app.use('/transactions', transactionRoutes);
app.use('/recurrences', recurrenceRoutes);
app.use('/investments', investmentRoutes);
app.use('/investment-accounts', investmentAccountRoutes);
app.use('/finance', summaryRoutes);
app.use('/reports', reportRoutes);

app.use(errorHandler);

module.exports = app;
