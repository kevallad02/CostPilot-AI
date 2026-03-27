require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const logger = require('./middleware/logger');
const routes = require('./routes');

const PORT = parseInt(process.env.PORT || '3001', 10);
const app = express();

// Security & parsing
app.use(helmet());
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false }));

// Request logging
app.use(logger.requestMiddleware);

// Routes (all under /api)
app.use('/api', routes);

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  logger.error({ event: 'unhandled_error', message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Start
app.listen(PORT, () => {
  logger.info({ event: 'server_started', port: PORT });
});

module.exports = app;
