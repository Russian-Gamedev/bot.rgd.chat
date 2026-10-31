import { describe, expect, it } from 'bun:test';

import { formatError, getErrorMessage } from './error';

describe('formatError', () => {
  it('returns the stack when it is present', () => {
    const error = new Error('boom');
    error.stack = 'Error: boom\n    at test';

    expect(formatError(error)).toBe('Error: boom\n    at test');
  });

  it('falls back to the message when the stack is empty', () => {
    const error = new Error('The operation timed out.');
    error.stack = '';

    expect(formatError(error)).toBe('The operation timed out.');
  });

  it('falls back to the name when stack and message are empty', () => {
    const error = new Error('');
    error.stack = '';

    expect(formatError(error)).toBe('Error');
  });

  it('stringifies non-Error values', () => {
    expect(formatError('failure')).toBe('failure');
  });
});

describe('getErrorMessage', () => {
  it('returns the message for Error instances', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies non-Error values', () => {
    expect(getErrorMessage(42)).toBe('42');
  });
});
