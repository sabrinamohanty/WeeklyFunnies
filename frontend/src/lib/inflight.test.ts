import { describe, expect, it } from 'vitest'
import { shareInflight } from './inflight'

describe('shareInflight', () => {
  it('runs overlapping work for the same key once', async () => {
    const bucket = new Map<string, Promise<string>>()
    let calls = 0
    let release: (value: string) => void = () => {}
    const run = () => {
      calls += 1
      return new Promise<string>(resolve => {
        release = resolve
      })
    }

    const first = shareInflight(bucket, 'ada@example.com', run)
    const second = shareInflight(bucket, 'ada@example.com', run)
    expect(calls).toBe(1)
    release('ok')
    await expect(first).resolves.toBe('ok')
    await expect(second).resolves.toBe('ok')
    expect(bucket.size).toBe(0)
  })

  it('starts a new request after the first one settles', async () => {
    const bucket = new Map<string, Promise<number>>()
    let calls = 0
    const run = async () => {
      calls += 1
      return calls
    }
    await shareInflight(bucket, 'ada@example.com', run)
    await shareInflight(bucket, 'ada@example.com', run)
    expect(calls).toBe(2)
  })
})
