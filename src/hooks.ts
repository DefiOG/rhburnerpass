import { useEffect, useState } from 'react'
import { loadConfig, type RHBPConfig } from './rhburnerpass'

export function useAppConfig() {
  const [config, setConfig] = useState<RHBPConfig | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    loadConfig()
      .then((next) => { if (alive) setConfig(next) })
      .catch((caught: unknown) => {
        if (alive) setError(caught instanceof Error ? caught.message : 'Configuration failed to load.')
      })
    return () => { alive = false }
  }, [])

  return { config, error }
}

export function useHashRoute() {
  const readRoute = () => (window.location.hash === '#/demo' ? 'demo' : 'portal')
  const [route, setRoute] = useState<'portal' | 'demo'>(readRoute)

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return route
}
