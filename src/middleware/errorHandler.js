const { AppError } = require('../errors/AppError');
const { ZodError } = require('zod');

function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      status: 400,
      error: 'Validation Error',
      fields: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: err.statusCode,
      error: err.name,
      message: err.message,
    });
  }

  console.error(err);
  res.status(500).json({
    status: 500,
    error: 'InternalServerError',
    message: 'Erro interno do servidor.',
  });
}

module.exports = errorHandler;
