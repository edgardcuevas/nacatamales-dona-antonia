import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { SettingsProvider } from './context/SettingsContext'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout/Layout'
import Home from './pages/Home'
import Menu from './pages/Menu'
import DiaADia from './pages/DiaADia'
import Nosotros from './pages/Nosotros'
import Contacto from './pages/Contacto'
import NotFound from './pages/NotFound'
import ScrollToTop from './components/ScrollToTop/ScrollToTop'

// El panel de administración (formularios, subida de videos, galería) solo
// lo usa el dueño. Cargarlo aparte evita que cada visitante descargue ese
// código para ver el menú.
const Administracion = lazy(() => import('./pages/Administracion'))

// Los estilos de .admin-loading viajan dentro del propio panel, que aún no ha
// llegado mientras se muestra este aviso: por eso va en línea.
const LOADING_STYLE = {
  textAlign: 'center',
  padding: 'var(--sp-9) var(--sp-4)',
  color: 'var(--color-tinta-3)',
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <ScrollToTop />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="menu" element={<Menu />} />
            <Route path="dia-a-dia" element={<DiaADia />} />
            <Route path="nosotros" element={<Nosotros />} />
            <Route path="contacto" element={<Contacto />} />
            <Route
              path="administracion"
              element={
                <Suspense fallback={<div style={LOADING_STYLE}>Cargando…</div>}>
                  <Administracion />
                </Suspense>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </SettingsProvider>
  )
}