import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../design.css'
import '../styles.css'
import './simulator.css'
import SimulatorApp from './SimulatorApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SimulatorApp />
  </StrictMode>,
)
