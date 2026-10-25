import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { StoreProvider, useStore } from './store'
import { CheckEmail, Login, SignUp, Welcome } from './screens/Auth'
import { AvatarStep, Joined, Profile } from './screens/Onboarding'
import { Comics, Front, Stars } from './screens/Read'
import { ChoosePapers, Review, WriteHighlights } from './screens/MyWeek'
import { BackIssues, JoinPaper, Papers } from './screens/Papers'
import { Settings } from './screens/Settings'
import './styles.css'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

/** Screens past sign-in send signed-out visitors to the welcome page. */
function RequireAuth() {
  const { state } = useStore()
  return state.authed ? <Outlet /> : <Navigate to="/welcome" replace />
}

function App() {
  const { state } = useStore()
  return (
    <div className="app">
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Navigate to={state.authed ? '/front' : '/welcome'} replace />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/login" element={<Login />} />
        <Route path="/check-email" element={<CheckEmail />} />
        <Route element={<RequireAuth />}>
          <Route path="/onboarding/profile" element={<Profile />} />
          <Route path="/onboarding/avatar" element={<AvatarStep />} />
          <Route path="/onboarding/joined" element={<Joined />} />
          <Route path="/front" element={<Front />} />
          <Route path="/comics" element={<Comics />} />
          <Route path="/stars" element={<Stars />} />
          <Route path="/my-week" element={<ChoosePapers />} />
          <Route path="/my-week/write" element={<WriteHighlights />} />
          <Route path="/my-week/review" element={<Review />} />
          <Route path="/papers" element={<Papers />} />
          <Route path="/papers/join" element={<JoinPaper />} />
          <Route path="/back-issues" element={<BackIssues />} />
          <Route path="/settings" element={<Settings />} />
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
