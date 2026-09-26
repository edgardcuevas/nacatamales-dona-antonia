import { Outlet } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import { IconDefs } from '../icons/Icons'

export default function Layout() {
  return (
    <>
      <IconDefs />
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  )
}