import { Injectable } from '@nestjs/common';
import { AppError } from './app-error';

interface Bucket {
  hits: number[];
}

/**
 * Limitador de frecuencia en memoria (RF-SEG-06).
 *
 * Suficiente para una sola instancia, que es el despliegue objetivo. Cuando la
 * plataforma corra en varias instancias (F12) se sustituye por Redis sin tocar
 * a los consumidores: la interfaz es `consume(key)`.
 */
@Injectable()
export class RateLimiterService {
  private readonly buckets = new Map<string, Bucket>();

  consume(key: string, max: number, windowMs: number): void {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

    if (bucket.hits.length >= max) {
      this.buckets.set(key, bucket);
      throw AppError.rateLimited(
        `Demasiados intentos. Vuelva a intentarlo en ${Math.ceil(windowMs / 60000)} minuto(s).`,
      );
    }

    bucket.hits.push(now);
    this.buckets.set(key, bucket);

    if (this.buckets.size > 10_000) this.prune(now, windowMs);
  }

  private prune(now: number, windowMs: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.hits.every((t) => now - t >= windowMs)) this.buckets.delete(key);
    }
  }
}
