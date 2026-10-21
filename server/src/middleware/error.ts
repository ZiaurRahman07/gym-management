import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors';
import { isProd } from '../config/env';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} was not found.` },
  });
};

type PostgresError = { code?: string; constraint?: string; detail?: string; message?: string };

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

  const pgError = err as PostgresError;

  if (pgError?.code === '23505') {
    res.status(409).json({
      error: { code: 'DUPLICATE', message: 'A record with that value already exists.' },
    });
    return;
  }

  if (pgError?.code === '23P01') {
    const overlap = pgError.constraint === 'subscriptions_no_overlap';
    res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: overlap
          ? 'This member already has a membership covering those dates.'
          : 'That change conflicts with existing data.',
      },
    });
    return;
  }

  if (pgError?.code === '23503') {
    res.status(409).json({
      error: { code: 'IN_USE', message: 'This record is referenced by other data and cannot be changed.' },
    });
    return;
  }

  if (pgError?.code === '23514') {
    res.status(400).json({
      error: { code: 'INVALID_VALUE', message: 'A value is outside the allowed range for this record.' },
    });
    return;
  }

  if (pgError?.code === '23502') {
    res.status(400).json({
      error: { code: 'MISSING_VALUE', message: 'A required value is missing.' },
    });
    return;
  }

  if (pgError?.code === '22P02') {
    res.status(400).json({
      error: { code: 'INVALID_VALUE', message: 'One of the submitted values has the wrong format.' },
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
