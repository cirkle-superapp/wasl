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
        username: session.username,
        name: session.name,
        email: session.email,
        phone: session.phone,
        avatar: session.avatar,
        avatarColor: session.avatarColor,
        about: session.about,
        verified: session.verified,
        defaultProtectMessages: session.defaultProtectMessages,
        privacyAlwaysAllow: session.privacyAlwaysAllow,
        ghostMode: session.ghostMode,
        hideLastSeen: session.hideLastSeen,
      }}
    />
  )
}
