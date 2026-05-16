const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../errors/AppError');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Token não fornecido.'));
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // sub é armazenado como string para compatibilidade com BigInt
    req.userId = BigInt(payload.sub);
    next();
  } catch {
    next(new UnauthorizedError('Token inválido ou expirado.'));
  }
}

module.exports = authMiddleware;
