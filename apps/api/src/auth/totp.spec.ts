import { describe, expect, it } from 'vitest';
import { generateCode, generateSecret, otpauthUrl, verifyCode, base32Decode, base32Encode } from './totp';

describe('TOTP', () => {
  it('genera un secreto base32 utilizable', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(base32Decode(secret).length).toBe(20);
  });

  it('genera y verifica un código en el instante actual', () => {
    const secret = generateSecret();
    const code = generateCode(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyCode(secret, code)).toBe(true);
  });

  it('acepta el código de la ventana anterior y siguiente (±1 periodo)', () => {
    const secret = generateSecret();
    const now = Date.now();
    const previous = generateCode(secret, now - 30_000);
    const next = generateCode(secret, now + 30_000);
    expect(verifyCode(secret, previous, now)).toBe(true);
    expect(verifyCode(secret, next, now)).toBe(true);
  });

  it('rechaza un código de hace dos periodos', () => {
    const secret = generateSecret();
    const old = generateCode(secret, Date.now() - 90_000);
    expect(verifyCode(secret, old)).toBe(false);
  });

  it('rechaza códigos con formato inválido', () => {
    const secret = generateSecret();
    expect(verifyCode(secret, '12345')).toBe(false);
    expect(verifyCode(secret, 'abcdef')).toBe(false);
    expect(verifyCode(secret, '')).toBe(false);
  });

  it('rechaza un código de otro secreto', () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(verifyCode(b, generateCode(a))).toBe(false);
  });

  it('genera una URL otpauth con los parámetros correctos', () => {
    const url = otpauthUrl('ABCDEF234567', 'admin@hacienda.local', 'Hacienda Ganadera');
    expect(url.startsWith('otpauth://totp/')).toBe(true);
    expect(url).toContain('issuer=Hacienda+Ganadera');
    expect(url).toContain('digits=6');
    expect(url).toContain('period=30');
  });

  it('base32 es reversible', () => {
    const original = Buffer.from('hacienda ganadera 2026', 'utf8');
    expect(base32Decode(base32Encode(original)).equals(original)).toBe(true);
  });
});
