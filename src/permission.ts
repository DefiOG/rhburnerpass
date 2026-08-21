import { useEffect, useState } from 'react'

// Keys are unchanged from the original implementation so existing sessions
// and any external tooling that reads them keep working.
const VAULT_KEY = 'rhbp:vault'
const BURNER_KEY = 'rhbp:burner'
const MINT_KEY = 'rhbp:mint'

export type ActivePermission = {
  vault: string
  burner: string
  mint: string
}

const EVENT = 'rhbp:permission-changed'

export function readActivePermission(): ActivePermission | null {
  const vault = sessionStorage.getItem(VAULT_KEY) ?? ''
  const burner = sessionStorage.getItem(BURNER_KEY) ?? ''
  const mint = sessionStorage.getItem(MINT_KEY) ?? ''
  if (!vault || !burner || !mint) return null
  return { vault, burner, mint }
}

export function saveActivePermission(permission: ActivePermission) {
  sessionStorage.setItem(VAULT_KEY, permission.vault)
  sessionStorage.setItem(BURNER_KEY, permission.burner)
  sessionStorage.setItem(MINT_KEY, permission.mint)
  window.dispatchEvent(new Event(EVENT))
}

export function clearActivePermission() {
  sessionStorage.removeItem(VAULT_KEY)
  sessionStorage.removeItem(BURNER_KEY)
  sessionStorage.removeItem(MINT_KEY)
  window.dispatchEvent(new Event(EVENT))
}

/** Live-updating view of the saved (vault, burner, mint) handoff, visible across the app. */
export function useActivePermission() {
  const [permission, setPermission] = useState<ActivePermission | null>(readActivePermission)

  useEffect(() => {
    const refresh = () => setPermission(readActivePermission())
    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return permission
}
