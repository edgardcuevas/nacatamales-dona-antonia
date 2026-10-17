import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
/* El orden de estos imports ES el orden de las hojas en el bundle.
   Vite concatena segun el orden de evaluacion de los modulos, asi que
   App.jsx debe ir DESPUES: importa transitivamente el CSS de todas las
   paginas y componentes. Si se pone antes, base.css acaba al final y su
   receta de tarjeta (misma especificidad, una sola clase) pisa a
   .announcement--available y las cuatro variantes quedan en blanco. */
import './index.css'
import './styles/base.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)