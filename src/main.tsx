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
import { RequirePaper } from './components/RequirePaper'
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
          <Route path="/front" element={<RequirePaper tabs><Front /></RequirePaper>} />
          <Route path="/comics" element={<RequirePaper tabs><Comics /></RequirePaper>} />
          <Route path="/stars" element={<RequirePaper tabs><Stars /></RequirePaper>} />
          <Route path="/my-week" element={<RequirePaper tabs><ChoosePapers /></RequirePaper>} />
          <Route path="/my-week/write" element={<RequirePaper redirect="/my-week"><WriteHighlights /></RequirePaper>} />
          <Route path="/my-week/review" element={<RequirePaper redirect="/my-week"><Review /></RequirePaper>} />
          <Route path="/papers" element={<Papers />} />
          <Route path="/papers/join" element={<JoinPaper />} />
          <Route path="/back-issues" element={<RequirePaper><BackIssues /></RequirePaper>} />
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
