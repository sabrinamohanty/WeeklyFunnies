/** Share one in-flight promise for a key. A second call joins the first until it settles. */
export function shareInflight<T>(
  bucket: Map<string, Promise<T>>,
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const existing = bucket.get(key)
  if (existing) return existing
  const pending = run().finally(() => {
    if (bucket.get(key) === pending) bucket.delete(key)
  })
  bucket.set(key, pending)
  return pending
}
