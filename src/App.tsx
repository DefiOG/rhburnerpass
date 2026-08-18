import { lazy, Suspense } from 'react'
import { useHashRoute } from './hooks'
import { VaultPortal } from './VaultPortal'

const DeveloperDemo = lazy(() => import('./DeveloperDemo').then((module) => ({ default: module.DeveloperDemo })))

export function App() {
  return useHashRoute() === 'demo'
    ? <Suspense fallback={<main><div className="route-loading">Loading developer demo…</div></main>}><DeveloperDemo /></Suspense>
    : <VaultPortal />
}
