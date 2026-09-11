import { getSession } from '@/lib/auth'
import { AuthScreen } from '@/components/wasl/auth-screen'
import { ChatApp } from '@/components/wasl/chat-app'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function Page() {
  const session = await getSession()
  if (!session) {
    return <AuthScreen />
  }
  return (
    <ChatApp
      user={{
        id: session.id,
        phone: session.phone,
        name: session.name,
        avatar: session.avatar,
        avatarColor: session.avatarColor,
        about: session.about,
        verified: session.verified,
      }}
    />
  )
}
