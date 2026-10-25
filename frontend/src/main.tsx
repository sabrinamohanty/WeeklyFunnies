import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { isProfileReady, StoreProvider, useStore } from './store'
import { AuthCallback, CheckEmail, Login, SignUp, Welcome } from './screens/Auth'
import { AvatarStep, Joined, Profile } from './screens/Onboarding'
import { Comics, Front, Stars } from './screens/Read'
import { ChoosePapers, Review, WriteHighlights } from './screens/MyWeek'
import { BackIssues, JoinPaper, Papers } from './screens/Papers'
import './styles.css'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function RequireAuth() {
  const { state } = useStore()
  if (!state.ready) return <div className="app"><p className="lede center" style={{ padding: '4rem 1.5rem' }}>Opening the paper…</p></div>
  return state.authed ? <Outlet /> : <Navigate to="/welcome" replace />
}

function RequireProfile() {
  const { state } = useStore()
  return isProfileReady(state) ? <Outlet /> : <Navigate to="/onboarding/profile" replace />
}

function App() {
  const { state } = useStore()
  if (!state.ready) {
    return <div className="app"><p className="lede center" style={{ padding: '4rem 1.5rem' }}>Opening the paper…</p></div>
  }
  return (
    <div className="app">
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Navigate to={state.authed ? (isProfileReady(state) ? '/front' : '/onboarding/profile') : '/welcome'} replace />} />
        <Route path="/welcome" element={state.authed ? <Navigate to="/" replace /> : <Welcome />} />
        <Route path="/signup" element={state.authed ? <Navigate to="/" replace /> : <SignUp />} />
        <Route path="/login" element={state.authed ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/check-email" element={<CheckEmail />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route element={<RequireAuth />}>
          <Route path="/onboarding/profile" element={<Profile />} />
          <Route path="/onboarding/avatar" element={<AvatarStep />} />
          <Route path="/onboarding/joined" element={<Joined />} />
          <Route element={<RequireProfile />}>
            <Route path="/front" element={<Front />} />
            <Route path="/comics" element={<Comics />} />
            <Route path="/stars" element={<Stars />} />
            <Route path="/my-week" element={<ChoosePapers />} />
            <Route path="/my-week/write" element={<WriteHighlights />} />
            <Route path="/my-week/review" element={<Review />} />
            <Route path="/papers" element={<Papers />} />
            <Route path="/papers/join" element={<JoinPaper />} />
            <Route path="/back-issues" element={<BackIssues />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
)
