import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors';
import { isProd } from '../config/env';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} was not found.` },
  });
};

type MysqlError = { code?: string; errno?: number; sqlMessage?: string };

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the submitted values.',
        details: err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
      },
    });
    return;
  }

  const mysqlError = err as MysqlError;
  if (mysqlError?.code === 'ER_DUP_ENTRY') {
    res.status(409).json({
      error: { code: 'DUPLICATE', message: 'A record with that value already exists.' },
    });
    return;
  }
  if (mysqlError?.code === 'ER_ROW_IS_REFERENCED_2') {
    res.status(409).json({
      error: { code: 'IN_USE', message: 'This record is referenced by other data and cannot be removed.' },
    });
    return;
  }
  if (mysqlError?.code === 'ER_NO_REFERENCED_ROW_2') {
    res.status(400).json({
      error: { code: 'INVALID_REFERENCE', message: 'A related record could not be found.' },
    });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } });
    return;
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
      ...(isProd ? {} : { debug: (err as Error)?.message }),
    },
  });
};
