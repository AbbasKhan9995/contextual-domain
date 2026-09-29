import { createContext, useContext } from 'react'

// { authEnabled, user, client, storage: 'blob' | 'local', mode, refresh(), logout() }
export const SessionContext = createContext(null)
export const useSession = () => useContext(SessionContext)
