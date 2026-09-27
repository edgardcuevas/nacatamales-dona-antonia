import { Outlet } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import { IconDefs } from '../icons/Icons'
import './Layout.css'

export default function Layout() {
  return (
    <div className="app-shell">
      <IconDefs />
      <Header />
      <main className="app-shell__main">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}