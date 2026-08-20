import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';

import { ValidationError } from '../errors/AppError.js';

/**
 * Single-file, memory-buffered upload under the form field name `file`.
 * Multer's own errors (e.g. `LIMIT_FILE_SIZE`) are raised via `next(err)`
 * BEFORE the route's `asyncHandler` ever runs, so they'd otherwise bypass
 * our AppError-aware formatting and fall through to a generic 500. This
 * wrapper converts them into a proper `ValidationError` first.
 */
export function uploadSingleImage(maxSizeBytes: number): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeBytes, files: 1 },
  }).single('file');

  return function uploadSingleImageMiddleware(req: Request, res: Response, next: NextFunction) {
    upload(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        next(
          new ValidationError(
            `The uploaded file exceeds the maximum size of ${maxSizeBytes} bytes.`,
          ),
        );
        return;
      }
      next(new ValidationError('File upload failed.'));
    });
  };
}
