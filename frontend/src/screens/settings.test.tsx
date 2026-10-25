import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StoreProvider, type State } from '../store'
import { OTHER, PAPER, uiPaper } from '../test-fixtures'
import { Settings } from './Settings'

const apiMock = vi.hoisted(() => ({
  listEditions: vi.fn(async () => ({ editions: [] })),
  leavePaper: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('../lib/auth', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
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

function show() {
  const initial: Partial<State> = {
    ready: true,
    authed: true,
    email: 'ama@example.com',
    papers: [
      { ...uiPaper, id: PAPER, name: 'Home Desk', role: 'Editor' },
      { ...uiPaper, id: OTHER, name: 'Club Notes', role: 'Contributor' },
    ],
    activePaper: PAPER,
    profile: { name: 'Ama', city: 'Austin, Texas', cityId: 1, birthday: '1995-10-15' },
  }
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <StoreProvider initial={initial}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </StoreProvider>
    </MemoryRouter>,
  )
}

describe('settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMock.listEditions.mockResolvedValue({
      editions: [{ savedAt: '2026-10-20T00:00:00.000Z' }, { savedAt: null }],
    })
  })

  it('keeps the editor and leaves another paper through the API', async () => {
    apiMock.leavePaper.mockResolvedValue({ paperId: OTHER, left: true })
    show()
    expect(await screen.findByText(/2 saved editions/)).toBeTruthy()
    const leaves = screen.getAllByRole('button', { name: 'Leave' })
    expect((leaves[0] as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(leaves[1]!)
    fireEvent.click(screen.getAllByRole('button', { name: 'Leave' }).find(button => !button.hasAttribute('disabled'))!)
    await waitFor(() => expect(apiMock.leavePaper).toHaveBeenCalledWith(OTHER))
    expect(screen.queryByText('Club Notes')).toBeNull()
    expect(screen.getByText('Home Desk')).toBeTruthy()
  })
})
