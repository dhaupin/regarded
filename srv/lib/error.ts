/**
 * Error Handling System
 * 
 * Standardized error codes and error factory for the entire library.
 */

export enum ErrorCode {
  // Generic errors
  UNKNOWN = 'UNKNOWN',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  INVALID_INPUT = 'INVALID_INPUT',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  
  // Auth errors
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_INVALID_TOKEN = 'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_LOCKED_OUT = 'AUTH_LOCKED_OUT',
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  
  // Connector errors
  CONNECTOR_NOT_FOUND = 'CONNECTOR_NOT_FOUND',
  CONNECTOR_NOT_CONNECTED = 'CONNECTOR_NOT_CONNECTED',
  CONNECTOR_ERROR = 'CONNECTOR_ERROR',
  EXCHANGE_ERROR = 'EXCHANGE_ERROR',
  
  // Trading errors
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  ORDER_FAILED = 'ORDER_FAILED',
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  POSITION_NOT_FOUND = 'POSITION_NOT_FOUND',
  
  // Storage errors
  STORAGE_ERROR = 'STORAGE_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  
  // Config errors
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  CONFIG_INVALID = 'CONFIG_INVALID',
  SECRETS_MISSING = 'SECRETS_MISSING',
  
  // Rate limiting
  RATE_LIMITED = 'RATE_LIMITED',
}

export interface RegardedError extends Error {
  code: ErrorCode;
  statusCode: number;
  details?: any;
  isOperational: boolean;
}

export interface ErrorOptions {
  code: ErrorCode;
  message: string;
  statusCode?: number;
  details?: any;
  cause?: Error;
}

/**
 * Create a Regarded error
 */
export function createError(options: ErrorOptions): RegardedError {
  const { code, message, statusCode = 500, details, cause } = options;
  
  const error = new Error(message) as RegardedError;
  error.name = 'RegardedError';
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  error.isOperational = true;
  
  if (cause) {
    error.cause = cause;
  }
  
  return error;
}

/**
 * Error factory functions for common errors
 */
export const errors = {
  notImplemented(feature: string): RegardedError {
    return createError({
      code: ErrorCode.NOT_IMPLEMENTED,
      message: `${feature} is not implemented`,
      statusCode: 501,
    });
  },
  
  invalidInput(field: string, reason: string): RegardedError {
    return createError({
      code: ErrorCode.INVALID_INPUT,
      message: `Invalid ${field}: ${reason}`,
      statusCode: 400,
      details: { field },
    });
  },
  
  validationFailed(errors: string[]): RegardedError {
    return createError({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Validation failed',
      statusCode: 400,
      details: { errors },
    });
  },
  
  authRequired(): RegardedError {
    return createError({
      code: ErrorCode.AUTH_REQUIRED,
      message: 'Authentication required',
      statusCode: 401,
    });
  },
  
  invalidToken(): RegardedError {
    return createError({
      code: ErrorCode.AUTH_INVALID_TOKEN,
      message: 'Invalid authentication token',
      statusCode: 401,
    });
  },
  
  tokenExpired(): RegardedError {
    return createError({
      code: ErrorCode.AUTH_TOKEN_EXPIRED,
      message: 'Authentication token has expired',
      statusCode: 401,
    });
  },
  
  lockedOut(reason: string): RegardedError {
    return createError({
      code: ErrorCode.AUTH_LOCKED_OUT,
      message: `Account locked: ${reason}`,
      statusCode: 403,
    });
  },
  
  invalidCredentials(): RegardedError {
    return createError({
      code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      message: 'Invalid credentials',
      statusCode: 401,
    });
  },
  
  connectorNotFound(name: string): RegardedError {
    return createError({
      code: ErrorCode.CONNECTOR_NOT_FOUND,
      message: `Connector not found: ${name}`,
      statusCode: 404,
      details: { connector: name },
    });
  },
  
  notConnected(name: string): RegardedError {
    return createError({
      code: ErrorCode.CONNECTOR_NOT_CONNECTED,
      message: `Connector not connected: ${name}`,
      statusCode: 400,
      details: { connector: name },
    });
  },
  
  connectorError(name: string, message: string): RegardedError {
    return createError({
      code: ErrorCode.CONNECTOR_ERROR,
      message: `Connector error (${name}): ${message}`,
      statusCode: 500,
      details: { connector: name },
    });
  },
  
  insufficientBalance(required: number, available: number, asset: string): RegardedError {
    return createError({
      code: ErrorCode.INSUFFICIENT_BALANCE,
      message: `Insufficient ${asset} balance. Required: ${required}, Available: ${available}`,
      statusCode: 400,
      details: { required, available, asset },
    });
  },
  
  orderFailed(orderId: string, reason: string): RegardedError {
    return createError({
      code: ErrorCode.ORDER_FAILED,
      message: `Order failed: ${reason}`,
      statusCode: 500,
      details: { orderId, reason },
    });
  },
  
  orderNotFound(orderId: string): RegardedError {
    return createError({
      code: ErrorCode.ORDER_NOT_FOUND,
      message: `Order not found: ${orderId}`,
      statusCode: 404,
      details: { orderId },
    });
  },
  
  configNotFound(key: string): RegardedError {
    return createError({
      code: ErrorCode.CONFIG_NOT_FOUND,
      message: `Configuration not found: ${key}`,
      statusCode: 404,
      details: { key },
    });
  },
  
  configInvalid(key: string, reason: string): RegardedError {
    return createError({
      code: ErrorCode.CONFIG_INVALID,
      message: `Invalid configuration for ${key}: ${reason}`,
      statusCode: 400,
      details: { key, reason },
    });
  },
  
  secretsMissing(): RegardedError {
    return createError({
      code: ErrorCode.SECRETS_MISSING,
      message: 'Required secrets are missing',
      statusCode: 500,
    });
  },
  
  rateLimited(retryAfter?: number): RegardedError {
    return createError({
      code: ErrorCode.RATE_LIMITED,
      message: 'Rate limit exceeded',
      statusCode: 429,
      details: retryAfter ? { retryAfter } : undefined,
    });
  },
};

/**
 * Check if error is operational (expected) vs programming error
 */
export function isOperationalError(error: any): boolean {
  return error?.isOperational === true;
}

/**
 * Convert any error to RegardedError
 */
export function toRegardedError(error: unknown, defaultMessage = 'An error occurred'): RegardedError {
  if (error instanceof Error) {
    if ('code' in error && 'statusCode' in error) {
      return error as RegardedError;
    }
    return createError({
      code: ErrorCode.UNKNOWN,
      message: error.message || defaultMessage,
      cause: error,
    });
  }
  
  return createError({
    code: ErrorCode.UNKNOWN,
    message: String(error) || defaultMessage,
  });
}
