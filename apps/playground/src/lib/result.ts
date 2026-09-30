/**
 * Flatten pipeline output ([[…]] → […]). Returns null when the run failed (undefined result),
 * so demos never try to render a missing result.
 */
export const flat = (r: unknown): any[] | null => (r == null ? null : ([r].flat(2) as any[]).filter((x) => x != null));
