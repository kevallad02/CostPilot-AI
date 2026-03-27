/**
 * Lightweight structured logger + Express request logging middleware.
 */

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level, data) {
  if (LEVELS[level] < LEVELS[LOG_LEVEL]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    ...(typeof data === 'string' ? { msg: data } : data),
  };
  const out = level === 'error' ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + '\n');
}

const logger = {
  debug: (data) => log('debug', data),
  info: (data) => log('info', data),
  warn: (data) => log('warn', data),
  error: (data) => log('error', data),
};

/**
 * Express middleware – logs method, path, status, and duration.
 */
logger.requestMiddleware = function (req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      event: 'http_request',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      ip: req.ip,
    });
  });
  next();
};

module.exports = logger;
