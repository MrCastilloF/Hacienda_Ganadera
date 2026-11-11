import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { AppConfig } from '../config/env';

/**
 * Contraseñas con Argon2id (RF-SEG-02).
 * Los parámetros vienen de la configuración y se calibran por entorno; nunca se
 * guardan en el código del dominio.
 */
export class PasswordService {
  constructor(private readonly config: AppConfig) {}

  async hash(plain: string): Promise<string> {
    return argonHash(plain, {
      memoryCost: this.config.argon2.memoryCost,
      timeCost: this.config.argon2.timeCost,
      parallelism: this.config.argon2.parallelism,
    });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argonVerify(hash, plain);
    } catch {
      return false;
    }
  }
}
