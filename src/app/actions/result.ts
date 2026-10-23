export type ActionResult = { ok: boolean; error?: string; message?: string; data?: Record<string, string> };

export const fail = (error: string, data?: Record<string, string>): ActionResult => ({ ok: false, error, data });
export const okResult = (message?: string, data?: Record<string, string>): ActionResult => ({ ok: true, message, data });
