// ─── Custom Error Classes ───

export class SPLPError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public endpoint?: string,
  ) {
    super(message);
    this.name = 'SPLPError';
  }
}

export class DatasetError extends Error {
  constructor(
    message: string,
    public datasetSlug?: string,
  ) {
    super(message);
    this.name = 'DatasetError';
  }
}

export class AIError extends Error {
  constructor(
    message: string,
    public provider?: string,
    public model?: string,
  ) {
    super(message);
    this.name = 'AIError';
  }
}

// ─── Consistent API Response ───

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  meta?: {
    timestamp: string;
    duration?: number;
  };
}

export function successResponse<T>(data: T, meta?: ApiResponse['meta']): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: { timestamp: new Date().toISOString(), ...meta },
  };
}

export function errorResponse(
  error: string,
  errorCode?: string,
): ApiResponse {
  return {
    success: false,
    error,
    errorCode,
    meta: { timestamp: new Date().toISOString() },
  };
}

// ─── Error Handler Wrapper ───

import { NextResponse } from 'next/server';

export function handleApiError(err: unknown) {
  if (err instanceof SPLPError) {
    console.error(`[SPLPError] ${err.endpoint}: ${err.message}`);
    return NextResponse.json(
      errorResponse(`SPLP: ${err.message}`, 'SPLP_ERROR'),
      { status: err.statusCode ?? 502 },
    );
  }

  if (err instanceof DatasetError) {
    console.error(`[DatasetError] ${err.datasetSlug}: ${err.message}`);
    return NextResponse.json(
      errorResponse(`Dataset: ${err.message}`, 'DATASET_ERROR'),
      { status: 404 },
    );
  }

  if (err instanceof AIError) {
    console.error(`[AIError] ${err.provider}: ${err.message}`);
    return NextResponse.json(
      errorResponse(`AI: ${err.message}`, 'AI_ERROR'),
      { status: 503 },
    );
  }

  console.error('[API] Unknown error:', err);
  return NextResponse.json(
    errorResponse('Internal server error', 'INTERNAL_ERROR'),
    { status: 500 },
  );
}
