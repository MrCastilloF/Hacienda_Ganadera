import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  audited?: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function setContextUserId(userId: string | undefined): void {
  const ctx = storage.getStore();
  if (ctx) ctx.userId = userId;
}

/** Marca la petición como auditada para que el interceptor no duplique el registro. */
export function markAudited(): void {
  const ctx = storage.getStore();
  if (ctx) ctx.audited = true;
}

export function wasAudited(): boolean {
  return storage.getStore()?.audited === true;
}
