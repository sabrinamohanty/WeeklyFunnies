import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StoreProvider, type State } from '../store'
import { file, profile } from '../test-fixtures'
import { AvatarStep, Joined } from './Onboarding'

const apiMock = vi.hoisted(() => ({
  createAvatar: vi.fn(),
  uploadAvatarPhoto: vi.fn(),
  me: vi.fn(),
  papers: vi.fn(),
  currentPage: vi.fn(),
}))

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: { user: { email: 'ama@example.com' } } }, error: null })),
}))

vi.mock('../lib/auth', () => ({
  supabase: {
    auth: {
      getSession: authMock.getSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: vi.fn(),
    },
  },
  accessToken: vi.fn(async () => 'tok'),
}))

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  return { ...actual, api: apiMock }
})

function renderAvatar(patch: Partial<State> = {}) {
  const initial: Partial<State> = {
    ready: true,
    authed: true,
    profile: { name: 'Ama', city: 'Austin, Texas', cityId: 1, birthday: '1995-10-15' },
    avatar: { style: 'classic', hair: 0, glasses: false, outfit: 0 },
    avatarUrl: 'http://127.0.0.1/avatar.png',
    style: 'classic',
    ...patch,
  }
  return render(
    <MemoryRouter initialEntries={['/onboarding/avatar']}>
      <StoreProvider initial={initial}>
        <Routes>
          <Route path="/onboarding/avatar" element={<AvatarStep />} />
          <Route path="/onboarding/joined" element={<Joined />} />
        </Routes>
      </StoreProvider>
    </MemoryRouter>,
  )
}

describe('avatar onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.me.mockResolvedValue({ profile })
    apiMock.papers.mockResolvedValue({ papers: [] })
    apiMock.currentPage.mockResolvedValue({ page: null })
    apiMock.uploadAvatarPhoto.mockResolvedValue({
      photoUrl: 'http://127.0.0.1/storage/v1/object/sign/selfies/me.png',
      expiresAt: '2026-10-25T01:00:00.000Z',
    })
    apiMock.createAvatar.mockImplementation(async (body: { style?: string }) => ({
      avatarUrl: 'http://127.0.0.1/storage/v1/object/sign/avatars/drawn.png',
      style: body.style ?? 'classic',
      look: 'short dark hair',
    }))
  })

  it('does not upload a selfie until the reader consents, and then draws from that photo', async () => {
    renderAvatar()
    const upload = document.querySelectorAll('input[type="file"]')[1] as HTMLInputElement
    fireEvent.change(upload, { target: { files: [file('me.png', 'image/png')] } })
    expect(await screen.findByText(/Check the box/)).toBeTruthy()
    expect(apiMock.uploadAvatarPhoto).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('checkbox', { name: /agree to use this photo/i }))
    fireEvent.change(upload, { target: { files: [file('me.gif', 'image/gif')] } })
    expect(await screen.findByText('Use a JPEG or PNG photo.')).toBeTruthy()
    expect(apiMock.uploadAvatarPhoto).not.toHaveBeenCalled()

    fireEvent.change(upload, { target: { files: [file('me.png', 'image/png')] } })
    await waitFor(() => expect(apiMock.uploadAvatarPhoto).toHaveBeenCalledTimes(1))
    expect(apiMock.createAvatar).toHaveBeenCalledWith(expect.objectContaining({
      photoUrl: 'http://127.0.0.1/storage/v1/object/sign/selfies/me.png',
      style: 'classic',
    }))
    const consent = apiMock.uploadAvatarPhoto.mock.calls[0]![0] as File
    expect(consent.name).toBe('me.png')
  })

  it('does not redraw when nothing changed, and does redraw after a chip changes', async () => {
    renderAvatar()
    fireEvent.click(screen.getByRole('button', { name: 'Looks like me!' }))
    expect(await screen.findByRole('heading', { name: "You're on the staff!" })).toBeTruthy()
    expect(apiMock.createAvatar).not.toHaveBeenCalled()

    cleanup()
    renderAvatar()
    fireEvent.click(screen.getByRole('button', { name: 'Hair' }))
    fireEvent.click(screen.getByRole('button', { name: 'Looks like me!' }))
    await waitFor(() => expect(apiMock.createAvatar).toHaveBeenCalledWith(expect.objectContaining({
      traits: expect.objectContaining({ hairColor: 'brown', glasses: 'none' }),
    })))
  })

  it('draws immediately when a style is picked, and draws on finish when there is no portrait yet', async () => {
    renderAvatar({ avatarUrl: null })
    fireEvent.click(screen.getByRole('radio', { name: 'Sketch' }))
    await waitFor(() => expect(apiMock.createAvatar).toHaveBeenCalledWith(expect.objectContaining({ style: 'sketch' })))
    const first = apiMock.createAvatar.mock.calls[0]![0] as { photoUrl?: string }
    expect(first.photoUrl).toBeUndefined()

    fireEvent.click(screen.getByRole('button', { name: 'Looks like me!' }))
    await screen.findByRole('heading', { name: "You're on the staff!" })
  })
})
