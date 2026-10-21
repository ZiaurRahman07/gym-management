import { execute } from '../db/pool';

export async function logAudit(
  userId: number | undefined,
  action: string,
  entity: string,
  entityId: number | null,
  meta?: unknown,
): Promise<void> {
  try {
    await execute('INSERT INTO audit_log (user_id, action, entity, entity_id, meta) VALUES (?, ?, ?, ?, ?::jsonb)', [
      userId ?? null,
      action,
      entity,
      entityId,
      meta === undefined ? null : JSON.stringify(meta),
    ]);
  } catch (error) {
    console.error('[audit] failed to write entry', error);
  }
}
