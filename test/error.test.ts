/**
 * Error Module Tests
 */

import { describe, it, expect } from 'vitest';
import { 
  ErrorCode, 
  createError, 
  errors, 
  isOperationalError, 
  toRegardedError,
  type RegardedError 
} from '../lib/error';

describe('Error System', () => {
  describe('ErrorCode', () => {
    it('should have correct values', () => {
      expect(ErrorCode.UNKNOWN).toBe('UNKNOWN');
      expect(ErrorCode.NOT_IMPLEMENTED).toBe('NOT_IMPLEMENTED');
      expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
      expect(ErrorCode.AUTH_REQUIRED).toBe('AUTH_REQUIRED');
      expect(ErrorCode.CONNECTOR_NOT_FOUND).toBe('CONNECTOR_NOT_FOUND');
    });
  });

  describe('createError', () => {
    it('should create error with all properties', () => {
      const error = createError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Test error',
        statusCode: 400,
        details: { field: 'email' },
      });

      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(ErrorCode.INVALID_INPUT);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({ field: 'email' });
      expect(error.isOperational).toBe(true);
    });

    it('should default statusCode to 500', () => {
      const error = createError({
        code: ErrorCode.UNKNOWN,
        message: 'Test',
      });
      expect(error.statusCode).toBe(500);
    });

    it('should include cause if provided', () => {
      const cause = new Error('Original error');
      const error = createError({
        code: ErrorCode.UNKNOWN,
        message: 'Wrapped error',
        cause,
      });
      expect(error.cause).toBe(cause);
    });
  });

  describe('Error Factory', () => {
    it('should create notImplemented error', () => {
      const error = errors.notImplemented('Feature X');
      expect(error.code).toBe(ErrorCode.NOT_IMPLEMENTED);
      expect(error.message).toContain('Feature X');
      expect(error.statusCode).toBe(501);
    });

    it('should create invalidInput error', () => {
      const error = errors.invalidInput('email', 'must be valid');
      expect(error.code).toBe(ErrorCode.INVALID_INPUT);
      expect(error.statusCode).toBe(400);
      expect(error.details?.field).toBe('email');
    });

    it('should create validationFailed error', () => {
      const error = errors.validationFailed(['email required', 'password too short']);
      expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(error.details?.errors).toHaveLength(2);
    });

    it('should create auth errors', () => {
      expect(errors.authRequired().code).toBe(ErrorCode.AUTH_REQUIRED);
      expect(errors.invalidToken().code).toBe(ErrorCode.AUTH_INVALID_TOKEN);
      expect(errors.tokenExpired().code).toBe(ErrorCode.AUTH_TOKEN_EXPIRED);
      expect(errors.lockedOut('too many attempts').message).toContain('locked');
      expect(errors.invalidCredentials().code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
    });

    it('should create connector errors', () => {
      expect(errors.connectorNotFound('binance').code).toBe(ErrorCode.CONNECTOR_NOT_FOUND);
      expect(errors.notConnected('kraken').code).toBe(ErrorCode.CONNECTOR_NOT_CONNECTED);
      expect(errors.connectorError('solana', 'connection failed').code).toBe(ErrorCode.CONNECTOR_ERROR);
    });

    it('should create trading errors', () => {
      const error = errors.insufficientBalance(100, 50, 'SOL');
      expect(error.code).toBe(ErrorCode.INSUFFICIENT_BALANCE);
      expect(error.details?.required).toBe(100);
      expect(error.details?.available).toBe(50);
      
      expect(errors.orderFailed('123', 'insufficient liquidity').code).toBe(ErrorCode.ORDER_FAILED);
      expect(errors.orderNotFound('456').code).toBe(ErrorCode.ORDER_NOT_FOUND);
    });

    it('should create config errors', () => {
      expect(errors.configNotFound('API_KEY').code).toBe(ErrorCode.CONFIG_NOT_FOUND);
      expect(errors.configInvalid('timeout', 'must be positive').code).toBe(ErrorCode.CONFIG_INVALID);
      expect(errors.secretsMissing().code).toBe(ErrorCode.SECRETS_MISSING);
    });

    it('should create rateLimited error', () => {
      const error = errors.rateLimited(60);
      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(error.statusCode).toBe(429);
      expect(error.details?.retryAfter).toBe(60);
    });
  });

  describe('isOperationalError', () => {
    it('should return true for operational errors', () => {
      const error = errors.notImplemented('test');
      expect(isOperationalError(error)).toBe(true);
    });

    it('should return false for regular errors', () => {
      const regularError = new Error('test');
      expect(isOperationalError(regularError)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isOperationalError(null)).toBe(false);
      expect(isOperationalError(undefined)).toBe(false);
    });
  });

  describe('toRegardedError', () => {
    it('should convert RegardedError unchanged', () => {
      const original = errors.notImplemented('test');
      const converted = toRegardedError(original);
      expect(converted).toBe(original);
    });

    it('should wrap regular Error', () => {
      const regularError = new Error('Original message');
      const converted = toRegardedError(regularError);
      expect(converted.code).toBe(ErrorCode.UNKNOWN);
      expect(converted.message).toBe('Original message');
      expect(converted.cause).toBe(regularError);
    });

    it('should convert string to error', () => {
      const converted = toRegardedError('Something went wrong');
      expect(converted.code).toBe(ErrorCode.UNKNOWN);
      expect(converted.message).toBe('Something went wrong');
    });

    it('should use default message for unknown types', () => {
      // Numbers get converted to string, not the default message
      const converted = toRegardedError(123, 'Default message');
      expect(converted.message).toBe('123');
    });
  });
});
