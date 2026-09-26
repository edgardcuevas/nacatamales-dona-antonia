import { Routes, Route } from 'react-router-dom'
import { SettingsProvider } from './context/SettingsContext'
import Layout from './components/Layout/Layout'
import Home from './pages/Home'
import Menu from './pages/Menu'
import DiaADia from './pages/DiaADia'
import Nosotros from './pages/Nosotros'
import Contacto from './pages/Contacto'
import Administracion from './pages/Administracion'

export default function App() {
  return (
    <SettingsProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="menu" element={<Menu />} />
          <Route path="dia-a-dia" element={<DiaADia />} />
          <Route path="nosotros" element={<Nosotros />} />
          <Route path="contacto" element={<Contacto />} />
          <Route path="administracion" element={<Administracion />} />
        </Route>
      </Routes>
    </SettingsProvider>
  )
}