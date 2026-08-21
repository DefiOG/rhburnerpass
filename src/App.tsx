import { useEffect, useState } from 'react'
import { MintPage } from './MintPage'
import { VaultPortal } from './VaultPortal'

function currentRoute() {
  return window.location.hash.startsWith('#/mint') ? 'mint' : 'portal'
}

export function App() {
  const [route, setRoute] = useState(currentRoute)

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return route === 'mint' ? <MintPage /> : <VaultPortal />
}
