/**
 * Gmail credential helpers: validation happens before any network call and
 * App Passwords are never stored in plaintext.
 */
import { describe, it, expect } from 'vitest';
const mailService = require('../services/mail.service');
const { encryptSecret, decryptSecret } = require('../utils/credentials');
const { mailConnect, register } = require('../validation/schemas');

describe('Gmail credential handling', () => {
  it('accepts only Gmail and Googlemail addresses', () => {
    expect(mailService.isGmailAddress('user@gmail.com')).toBe(true);
    expect(mailService.isGmailAddress('USER@GOOGLEMAIL.COM')).toBe(true);
    expect(mailService.isGmailAddress('user@example.com')).toBe(false);
  });

  it('strips the spaces Google displays in App Passwords', () => {
    expect(mailService.normalizeAppPassword('abcd efgh ijkl mnop')).toBe('abcdefghijklmnop');
  });

  it('rejects non-Gmail addresses before contacting Gmail', async () => {
    await expect(
      mailService.verifyGmailCredentials('user@example.com', 'abcdefghijklmnop')
    ).rejects.toMatchObject({ code: 'GMAIL_ACCOUNT_REQUIRED', status: 400 });
  });

  it('rejects App Passwords that are not 16 characters', async () => {
    await expect(
      mailService.verifyGmailCredentials('user@gmail.com', 'too-short')
    ).rejects.toMatchObject({ code: 'GMAIL_APP_PASSWORD_INVALID', status: 400 });
  });

  it('accepts 16 characters with or without display spaces in HTTP bodies', () => {
    expect(mailConnect.validate({ gmailAppPassword: 'abcd efgh ijkl mnop' }).error).toBeUndefined();
    expect(mailConnect.validate({ gmailAppPassword: 'abcdefghijklmnop' }).error).toBeUndefined();
    expect(register.validate({ email: 'a@gmail.com', password: 'password-1234', gmailAppPassword: 'abcd efgh ijkl mnop' }).error).toBeUndefined();
  });

  it('rejects App Passwords with fewer or more than 16 characters', () => {
    expect(mailConnect.validate({ gmailAppPassword: 'abcdefghijklmno' }).error).toBeTruthy();
    expect(mailConnect.validate({ gmailAppPassword: 'abcdefghijklmnopq' }).error).toBeTruthy();
  });

  it('encrypts App Passwords with authenticated encryption', () => {
    const ciphertext = encryptSecret('abcdefghijklmnop');
    expect(ciphertext).not.toContain('abcdefghijklmnop');
    expect(ciphertext.startsWith('v1:')).toBe(true);
    expect(decryptSecret(ciphertext)).toBe('abcdefghijklmnop');
    expect(decryptSecret('v1:invalid')).toBeNull();
  });
});
