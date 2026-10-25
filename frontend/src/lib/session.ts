/** Asks the API to sign out everywhere, then clears this device even if that call fails. */
export async function endSession(remote: () => Promise<unknown>, local: () => Promise<unknown>): Promise<void> {
  try {
    await remote()
  } catch {
    // The device still signs out. A failed call leaves the server session until the next logout.
  }
  await local()
}
