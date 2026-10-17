const { userIdFromToken } = require('../security/tokens');
const { UnauthorizedError } = require('../errors/AppError');

const BEARER_PREFIX = 'Bearer ';

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    return next(new UnauthorizedError('Token não fornecido.'));
  }
  const token = header.slice(BEARER_PREFIX.length);
  try {
    req.userId = userIdFromToken(token);
    next();
  } catch {
    next(new UnauthorizedError('Token inválido ou expirado.'));
  }
}

module.exports = authMiddleware;
