import { render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StoreProvider, type State } from '../store'
import { CheckEmail } from './Auth'

const authMock = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
}))

vi.mock('../lib/auth', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: vi.fn(),
      signInWithOtp: authMock.signInWithOtp,
    },
  },
  accessToken: vi.fn(async () => null),
}))

function renderCheckEmail() {
  const initial: Partial<State> = { ready: true, email: 'Ada@Example.com' }
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={['/check-email']}>
        <StoreProvider initial={initial}>
          <Routes>
            <Route path="/check-email" element={<CheckEmail />} />
          </Routes>
        </StoreProvider>
      </MemoryRouter>
    </StrictMode>,
  )
}

describe('check email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.signInWithOtp.mockResolvedValue({ data: {}, error: null })
  })

  it('requests one sign-in link when the screen mounts twice', async () => {
    renderCheckEmail()
    await waitFor(() => expect(authMock.signInWithOtp).toHaveBeenCalledTimes(1))
    expect(authMock.signInWithOtp).toHaveBeenCalledWith({
      email: 'Ada@Example.com',
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    expect(await screen.findByText(/A sign-in link is on its way/)).toBeTruthy()
  })
})
