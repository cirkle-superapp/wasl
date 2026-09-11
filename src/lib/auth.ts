import { cookies } from 'next/headers'
import { db } from './db'

export const SESSION_COOKIE = 'wasl_session'

export type SessionUser = {
  id: string
  username: string
  name: string
  email: string | null
  phone: string | null
  avatar: string | null
  avatarColor: string | null
  about: string
  verified: boolean
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const userId = cookieStore.get(SESSION_COOKIE)?.value
  if (!userId) return null
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      phone: true,
      avatar: true,
      avatarColor: true,
      about: true,
      verified: true,
    },
  })
  return user ?? null
}

export async function setSession(userId: string) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
