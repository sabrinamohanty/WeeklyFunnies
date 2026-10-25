import { describe, expect, it } from 'vitest'
import { endSession } from './session'

describe('endSession', () => {
  it('asks the server to sign out before clearing the device', async () => {
    const order: string[] = []
    await endSession(
      async () => {
        order.push('remote')
      },
      async () => {
        order.push('local')
      },
    )
    expect(order).toEqual(['remote', 'local'])
  })

  it('still clears the device when the server logout fails', async () => {
    let local = false
    await endSession(
      async () => {
        throw new Error('down')
      },
      async () => {
        local = true
      },
    )
    expect(local).toBe(true)
  })
})
