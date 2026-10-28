/** A fresh key for one user decision. Reuse it only when retrying that same decision. */
export function createIdempotencyKey(): string {
  return crypto.randomUUID()
}
