import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth', () => ({
  accessToken: vi.fn(async () => 'tok'),
}))

import { api, userMessage } from './api'
import { ApiError } from './types'
import { file } from '../test-fixtures'

function jsonResponse(status: number, body: unknown) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
}

describe('api request', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('sends JSON with a bearer token and does not set a content type on a photo upload', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { highlight: { id: 'h' } }))
    await api.updateHighlight('h', { text: 'Hi' })
    const jsonInit = fetchMock.mock.calls[0]![1] as RequestInit
    const jsonHeaders = new Headers(jsonInit.headers)
    expect(jsonHeaders.get('Content-Type')).toBe('application/json')
    expect(jsonHeaders.get('Authorization')).toBe('Bearer tok')
    expect(String(jsonInit.body)).toBe(JSON.stringify({ text: 'Hi' }))

    fetchMock.mockResolvedValue(jsonResponse(200, { photo: { id: 'p' } }))
    await api.addPhoto('h', file('a.png', 'image/png'))
    const formInit = fetchMock.mock.calls[1]![1] as RequestInit
    const formHeaders = new Headers(formInit.headers)
    expect(formHeaders.has('Content-Type')).toBe(false)
    expect(formInit.body).toBeInstanceOf(FormData)
    expect((formInit.body as FormData).get('photo')).toBeInstanceOf(File)

    fetchMock.mockResolvedValue(jsonResponse(200, { photoUrl: 'http://signed', expiresAt: '2026-10-25T01:00:00Z' }))
    await api.uploadAvatarPhoto(file('me.png', 'image/png'))
    const avatarBody = fetchMock.mock.calls[2]![1] as RequestInit
    expect((avatarBody.body as FormData).get('photoConsent')).toBe('true')
    expect(new Headers(avatarBody.headers).has('Content-Type')).toBe(false)
  })

  it('turns a dead API and an HTML error page into ApiError instead of a parse crash', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed to fetch'))
    await expect(api.health()).rejects.toMatchObject({ code: 'network', status: 0 })

    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }))
    await expect(api.health()).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      code: 'internal',
      message: 'Something went wrong.',
    })
  })

  it('rejects a success body that is not an object', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [1, 2, 3]))
    await expect(api.health()).rejects.toMatchObject({
      code: 'internal',
      message: 'The API sent a response the app could not read.',
    })
    fetchMock.mockResolvedValue(new Response('not-json', { status: 200 }))
    await expect(api.health()).rejects.toMatchObject({ message: 'The API sent a response the app could not read.' })
  })

  it('reads an empty success body', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    await expect(api.health()).resolves.toEqual({})
  })

  it('keeps the crisis line instead of the generic editor message', async () => {
    const crisis = "It sounds like you're going through something really hard."
    fetchMock.mockResolvedValue(jsonResponse(422, {
      error: crisis,
      code: 'content_blocked',
      requestId: 'req-1',
      details: [{ path: 'body.text', issue: 'self_harm_support' }],
    }))
    let caught: unknown
    try {
      await api.addHighlight('page', { text: 'secret' })
    } catch (err) {
      caught = err
    }
    {
      const err = caught
      expect(err).toBeInstanceOf(ApiError)
      expect(userMessage(err)).toBe(crisis)
    }
  })

  it('maps the press errors a reader can actually hit', async () => {
    const cases: [number, Record<string, unknown>, string][] = [
      [409, { error: 'locked', code: 'edition_locked' }, 'This week’s deadline has passed.'],
      [422, { error: 'nope', code: 'content_blocked' }, 'That didn’t make it past the editor. Try different wording.'],
      [429, { error: 'slow down', code: 'rate_limited', retryAfterSeconds: 12 }, 'Too many requests. Try again in 12 seconds.'],
      [429, { error: 'slow down', code: 'rate_limited', retryAfterSeconds: 'soon' }, 'Too many requests. Try again shortly.'],
      [429, { error: 'cap', code: 'quota_exceeded' }, 'The press is out of ink for now. Try again later.'],
      [503, { error: 'down', code: 'provider_unavailable' }, 'The writer is busy. Try again in a moment.'],
      [413, { error: 'huge', code: 'payload_too_large' }, 'That photo is too large. Use a JPEG or PNG under 12 MB.'],
      [415, { error: 'svg', code: 'unsupported_media' }, 'Use a JPEG or PNG photo.'],
      [401, { error: 'nope', code: 'unauthorized' }, 'Please sign in again.'],
      [501, { error: 'later', code: 'not_implemented' }, 'That part of the paper is still being built.'],
      [403, { error: "You can't do that.", code: 'forbidden' }, "You can't do that."],
    ]
    for (const [status, body, message] of cases) {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, body))
      await expect(api.health()).rejects.toBeInstanceOf(ApiError)
      try {
        fetchMock.mockResolvedValueOnce(jsonResponse(status, body))
        await api.health()
      } catch (err) {
        expect(userMessage(err)).toBe(message)
      }
    }
    expect(userMessage(new Error('nope'))).toBe('Something went wrong.')
  })
})
