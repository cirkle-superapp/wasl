'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  X,
  Volume2,
  VolumeX,
  UserCircle2,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWaslStore, type ActiveCall, type IncomingCall } from '@/lib/store'
import { getSocket } from '@/lib/socket'
import { cn } from '@/lib/utils'

// ----------------------------------------------------------------------------
// CallOverlay — orchestrates a single voice / video call.
//
// Responsibilities:
//   • Render the incoming-call modal (peer is calling us)
//   • Render the outgoing-call screen (we placed the call, waiting for answer)
//   • Render the active-call screen (peer connection established)
//   • Render the "call ended" toast (auto-dismiss after a few seconds)
//   • Own the RTCPeerConnection — create SDP offer when placing, accept the
//     peer's offer when answering, exchange ICE candidates, and stream local
//     mic / camera to the remote peer while playing their incoming stream.
//
// The WebRTC signaling events are relayed by the socket.io mini-service:
//   call:invite / call:accept / call:reject / call:end / call:signal
// ----------------------------------------------------------------------------

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
]

const RING_TIMEOUT_MS = 35_000 // give up ringing after 35s → mark as "missed"

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'
}

export function CallOverlay() {
  const {
    activeCall,
    incomingCall,
    callEnded,
    user,
    setIncomingCall,
    acceptIncomingCall,
    rejectIncomingCall,
    startCall,
    endCall,
    setCallEnded,
  } = useWaslStore()

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cleanupFnsRef = useRef<Array<() => void>>([])

  const [muted, setMuted] = useState(false)
  const [videoOn, setVideoOn] = useState(true)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [now, setNow] = useState(Date.now())
  const [connectingState, setConnectingState] =
    useState<'new' | 'connecting' | 'connected' | 'failed'>('new')

  // ---- Tick the duration timer once a second while a call is active ----
  useEffect(() => {
    if (!activeCall) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [activeCall?.startedAt])

  // ---- Auto-clear the "call ended" toast after 4s ----
  useEffect(() => {
    if (!callEnded) return
    const id = setTimeout(() => setCallEnded(null), 4500)
    return () => clearTimeout(id)
  }, [callEnded, setCallEnded])

  // ------------------------------------------------------------------------
  // Tear down the WebRTC peer connection and release media. Safe to call
  // multiple times — every ref is null-checked.
  // ------------------------------------------------------------------------
  const teardownPeer = useCallback(() => {
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current)
      ringTimerRef.current = null
    }
    for (const fn of cleanupFnsRef.current) {
      try { fn() } catch {}
    }
    cleanupFnsRef.current = []
    try { pcRef.current?.getSenders().forEach((s) => { try { s.track?.stop() } catch {} }) } catch {}
    try { localStreamRef.current?.getTracks().forEach((t) => t.stop()) } catch {}
    localStreamRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
    try { pcRef.current?.close() } catch {}
    pcRef.current = null
    setMuted(false)
    setVideoOn(true)
    setSpeakerOn(true)
    setConnectingState('new')
  }, [])

  // ------------------------------------------------------------------------
  // Caller: place an outgoing call. Captures local media, creates the SDP
  // offer, and emits call:invite to the peer via the socket.
  // ------------------------------------------------------------------------
  const placeCall = useCallback(
    async (call: ActiveCall) => {
      if (!user?.id) return
      const socket = getSocket()

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: call.callType === 'video',
        })
        localStreamRef.current = stream
        if (localVideoRef.current && call.callType === 'video') {
          localVideoRef.current.srcObject = stream
          localVideoRef.current.play().catch(() => {})
        }
        setVideoOn(call.callType === 'video')
      } catch (err) {
        toast.error('Could not access camera / microphone')
        endCall({ peerName: call.peerName, peerAvatarColor: call.peerAvatarColor, reason: 'failed', durationMs: 0 })
        return
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc
      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!)
      })

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0]
        if (call.callType === 'video' && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream
          remoteVideoRef.current.play().catch(() => {})
        } else if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream
          remoteAudioRef.current.play().catch(() => {})
        }
        setConnectingState('connected')
      }

      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState
        if (st === 'connected' || st === 'completed') {
          setConnectingState('connected')
          // Update the active call's direction to 'connected' so the UI flips
          // from the "Calling…" state to the live-call state.
          useWaslStore.setState((s) => ({
            activeCall: s.activeCall
              ? { ...s.activeCall, direction: 'connected' }
              : s.activeCall,
          }))
        } else if (st === 'disconnected') {
          setConnectingState('connecting')
          useWaslStore.setState((s) => ({
            activeCall: s.activeCall
              ? { ...s.activeCall, direction: 'reconnecting' }
              : s.activeCall,
          }))
        } else if (st === 'failed') {
          setConnectingState('failed')
        }
      }

      // Caller's ICE candidates are relayed to the peer.
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('call:signal', {
            toUserId: call.peerUserId,
            fromUserId: user.id,
            candidate: event.candidate.toJSON(),
          })
        }
      }

      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: call.callType === 'video' })
        await pc.setLocalDescription(offer)
        socket.emit('call:invite', {
          toUserId: call.peerUserId,
          fromUserId: user.id,
          fromName: user.name,
          fromAvatarColor: user.avatarColor,
          conversationId: call.conversationId,
          callType: call.callType,
          offer,
        })
      } catch (err) {
        toast.error('Failed to start call')
        teardownPeer()
        endCall({ peerName: call.peerName, peerAvatarColor: call.peerAvatarColor, reason: 'failed', durationMs: 0 })
        return
      }

      // Give the peer RING_TIMEOUT_MS to answer before giving up.
      ringTimerRef.current = setTimeout(() => {
        if (useWaslStore.getState().activeCall?.direction === 'outgoing') {
          try { socket.emit('call:end', { toUserId: call.peerUserId, fromUserId: user.id, reason: 'timeout' }) } catch {}
          endCall({ peerName: call.peerName, peerAvatarColor: call.peerAvatarColor, reason: 'timeout', durationMs: 0 })
          teardownPeer()
        }
      }, RING_TIMEOUT_MS)
    },
    [user, endCall, teardownPeer]
  )

  // ------------------------------------------------------------------------
  // Callee: accept an incoming call. Creates the SDP answer based on the
  // peer's offer and emits call:accept back.
  // ------------------------------------------------------------------------
  const answerCall = useCallback(async () => {
    const ic = useWaslStore.getState().incomingCall
    if (!ic || !user?.id) return
    acceptIncomingCall()

    const socket = getSocket()
    const active = useWaslStore.getState().activeCall
    if (!active) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: ic.callType === 'video',
      })
      localStreamRef.current = stream
      if (localVideoRef.current && ic.callType === 'video') {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.play().catch(() => {})
      }
      setVideoOn(ic.callType === 'video')
    } catch (err) {
      toast.error('Could not access camera / microphone')
      try { socket.emit('call:reject', { toUserId: ic.fromUserId, fromUserId: user.id, reason: 'unavailable' }) } catch {}
      endCall({ peerName: ic.fromName, peerAvatarColor: ic.fromAvatarColor, reason: 'failed', durationMs: 0 })
      return
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc
    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current!)
    })

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0]
      if (ic.callType === 'video' && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream
        remoteVideoRef.current.play().catch(() => {})
      } else if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream
        remoteAudioRef.current.play().catch(() => {})
      }
      setConnectingState('connected')
    }

    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState
      if (st === 'connected' || st === 'completed') {
        setConnectingState('connected')
        useWaslStore.setState((s) => ({
          activeCall: s.activeCall ? { ...s.activeCall, direction: 'connected' } : s.activeCall,
        }))
      } else if (st === 'disconnected') {
        setConnectingState('connecting')
        useWaslStore.setState((s) => ({
          activeCall: s.activeCall ? { ...s.activeCall, direction: 'reconnecting' } : s.activeCall,
        }))
      } else if (st === 'failed') {
        setConnectingState('failed')
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call:signal', {
          toUserId: ic.fromUserId,
          fromUserId: user.id,
          candidate: event.candidate.toJSON(),
        })
      }
    }

    try {
      await pc.setRemoteDescription(ic.offer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('call:accept', { toUserId: ic.fromUserId, fromUserId: user.id, answer })
    } catch (err) {
      toast.error('Failed to accept call')
      try { socket.emit('call:reject', { toUserId: ic.fromUserId, fromUserId: user.id, reason: 'unavailable' }) } catch {}
      endCall({ peerName: ic.fromName, peerAvatarColor: ic.fromAvatarColor, reason: 'failed', durationMs: 0 })
      teardownPeer()
    }
  }, [user, acceptIncomingCall, endCall, teardownPeer])

  // ------------------------------------------------------------------------
  // Callee: reject an incoming call.
  // ------------------------------------------------------------------------
  const declineCall = useCallback(() => {
    const ic = useWaslStore.getState().incomingCall
    if (!ic || !user?.id) return
    const socket = getSocket()
    try {
      socket.emit('call:reject', { toUserId: ic.fromUserId, fromUserId: user.id, reason: 'declined' })
    } catch {}
    rejectIncomingCall()
  }, [user, rejectIncomingCall])

  // ------------------------------------------------------------------------
  // Either party: end an active call. Emits call:end so the peer tears down
  // their peer connection too.
  // ------------------------------------------------------------------------
  const hangup = useCallback(() => {
    const ac = useWaslStore.getState().activeCall
    if (!ac || !user?.id) return
    const socket = getSocket()
    try {
      socket.emit('call:end', { toUserId: ac.peerUserId, fromUserId: user.id, reason: 'ended' })
    } catch {}
    endCall({
      peerName: ac.peerName,
      peerAvatarColor: ac.peerAvatarColor,
      reason: 'ended',
      durationMs: Date.now() - ac.startedAt,
    })
    teardownPeer()
  }, [user, endCall, teardownPeer])

  // ------------------------------------------------------------------------
  // Socket listeners: call:incoming (callee side), call:accepted (caller
  // side), call:rejected (caller side), call:ended (both), call:signal (both)
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.id) return
    const uid = user.id
    const uname = user.name
    const uavatarColor = user.avatarColor
    const socket = getSocket()

    function onCallIncoming(payload: {
      fromUserId: string
      fromName: string
      fromAvatarColor: string | null
      conversationId: string | null
      callType: 'audio' | 'video'
      offer: any
      at: number
    }) {
      if (!payload || payload.fromUserId === uid) return
      // If we're already in a call, automatically decline the new call with
      // a "busy" reason so the caller shows the right UI.
      if (useWaslStore.getState().activeCall) {
        try {
          socket.emit('call:reject', {
            toUserId: payload.fromUserId,
            fromUserId: uid,
            reason: 'busy',
          })
        } catch {}
        return
      }
      setIncomingCall({
        conversationId: payload.conversationId,
        fromUserId: payload.fromUserId,
        fromName: payload.fromName,
        fromAvatarColor: payload.fromAvatarColor,
        callType: payload.callType,
        offer: payload.offer,
        receivedAt: Date.now(),
      })
      // Play a ringtone-ish notification sound (subtle).
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=')
        audio.volume = 0.3
        audio.play().catch(() => {})
      } catch {}
    }

    function onCallAccepted(payload: { fromUserId: string; answer: any }) {
      const pc = pcRef.current
      const ac = useWaslStore.getState().activeCall
      if (!pc || !ac || payload.fromUserId !== ac.peerUserId) return
      // The peer accepted and sent their SDP answer. Apply it and flip the
      // active call's direction to 'connected' so the UI updates.
      pc.setRemoteDescription(payload.answer)
        .then(() => {
          setConnectingState('connecting')
          useWaslStore.setState((s) => ({
            activeCall: s.activeCall ? { ...s.activeCall, direction: 'connected' } : s.activeCall,
          }))
        })
        .catch((err) => {
          console.error('[wasl-call] failed to apply answer', err)
          endCall({ peerName: ac.peerName, peerAvatarColor: ac.peerAvatarColor, reason: 'failed', durationMs: 0 })
          teardownPeer()
        })
      // Cancel the ring timeout since the peer answered.
      if (ringTimerRef.current) {
        clearTimeout(ringTimerRef.current)
        ringTimerRef.current = null
      }
    }

    function onCallRejected(payload: { fromUserId: string; reason: string }) {
      const ac = useWaslStore.getState().activeCall
      if (!ac || payload.fromUserId !== ac.peerUserId) return
      endCall({
        peerName: ac.peerName,
        peerAvatarColor: ac.peerAvatarColor,
        reason: (payload.reason as 'declined' | 'busy' | 'timeout' | 'unavailable') || 'declined',
        durationMs: Date.now() - ac.startedAt,
      })
      teardownPeer()
    }

    function onCallEnded(payload: { fromUserId: string; reason: string }) {
      const ac = useWaslStore.getState().activeCall
      const ic = useWaslStore.getState().incomingCall
      if (ac && payload.fromUserId === ac.peerUserId) {
        endCall({
          peerName: ac.peerName,
          peerAvatarColor: ac.peerAvatarColor,
          reason: (payload.reason as 'ended' | 'busy' | 'missed' | 'failed') || 'ended',
          durationMs: Date.now() - ac.startedAt,
        })
        teardownPeer()
      } else if (ic && payload.fromUserId === ic.fromUserId) {
        // The caller hung up before we even answered → "missed" call.
        setIncomingCall(null)
        setCallEnded({
          peerName: ic.fromName,
          peerAvatarColor: ic.fromAvatarColor,
          reason: 'missed',
          durationMs: 0,
        })
      }
    }

    function onCallSignal(payload: { fromUserId: string; candidate: any }) {
      const pc = pcRef.current
      const ac = useWaslStore.getState().activeCall
      const ic = useWaslStore.getState().incomingCall
      const peerId = ac?.peerUserId ?? ic?.fromUserId
      if (!pc || !peerId || payload.fromUserId !== peerId) return
      try {
        pc.addIceCandidate(payload.candidate).catch(() => {})
      } catch {}
    }

    socket.on('call:incoming', onCallIncoming)
    socket.on('call:accepted', onCallAccepted)
    socket.on('call:rejected', onCallRejected)
    socket.on('call:ended', onCallEnded)
    socket.on('call:signal', onCallSignal)

    return () => {
      socket.off('call:incoming', onCallIncoming)
      socket.off('call:accepted', onCallAccepted)
      socket.off('call:rejected', onCallRejected)
      socket.off('call:ended', onCallEnded)
      socket.off('call:signal', onCallSignal)
    }
  }, [user?.id, setIncomingCall, endCall, teardownPeer, setCallEnded])

  // ---- When activeCall flips from null → outgoing, kick off the call ----
  // The ChatWindow's Phone/Video button calls startCall() which sets
  // activeCall; we react to that here so the WebRTC side is owned by this
  // single effect rather than scattered across components.
  const lastStartedAtRef = useRef<number | null>(null)
  useEffect(() => {
    if (!activeCall) {
      lastStartedAtRef.current = null
      return
    }
    // Only fire on outgoing calls (incoming calls are triggered by the
    // user clicking Accept, which calls answerCall directly).
    if (activeCall.direction === 'outgoing' && lastStartedAtRef.current !== activeCall.startedAt) {
      lastStartedAtRef.current = activeCall.startedAt
      void placeCall(activeCall)
    }
  }, [activeCall, placeCall])

  // ---- Cleanup on unmount ----
  useEffect(() => {
    return () => teardownPeer()
  }, [teardownPeer])

  // ---- Toggle mute ----
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const audioTrack = stream.getAudioTracks()[0]
    if (!audioTrack) return
    const next = !audioTrack.enabled
    audioTrack.enabled = next
    setMuted(!next)
  }, [])

  // ---- Toggle camera ----
  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) {
      toast.error('This call has no video track')
      return
    }
    const next = !videoTrack.enabled
    videoTrack.enabled = next
    setVideoOn(next)
    if (localVideoRef.current) {
      // Reflect the change immediately so the local preview goes black.
      localVideoRef.current.srcObject = next ? stream : null
    }
  }, [])

  // ---- Toggle speaker (mute/unmute the remote audio element) ----
  const toggleSpeaker = useCallback(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !remoteAudioRef.current.muted
      setSpeakerOn(!remoteAudioRef.current.muted)
    } else if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !remoteVideoRef.current.muted
      setSpeakerOn(!remoteVideoRef.current.muted)
    }
  }, [])

  // ========================================================================
  // Render
  // ========================================================================

  // 1. Incoming call modal (we are the callee)
  if (incomingCall) {
    return (
      <>
        <CallBackdrop blur />
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-sm rounded-3xl border border-border bg-card shadow-2xl overflow-hidden">
            <div
              className="relative px-6 pt-8 pb-6 text-center"
              style={{
                background: `linear-gradient(135deg, ${incomingCall.fromAvatarColor || 'var(--wasl-green)'}22 0%, transparent 100%)`,
              }}
            >
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-4">
                Incoming {incomingCall.callType === 'video' ? 'video' : 'voice'} call
              </div>
              <div className="flex justify-center mb-4">
                <AvatarCircle
                  name={incomingCall.fromName}
                  color={incomingCall.fromAvatarColor}
                  size={88}
                  pulse
                />
              </div>
              <div className="text-xl font-semibold text-foreground">{incomingCall.fromName}</div>
              <div className="mt-1 text-sm text-muted-foreground">Wasl · Encrypted</div>
              <div className="mt-6 flex items-center justify-center gap-3">
                <Button
                  variant="destructive"
                  size="lg"
                  className="rounded-full h-14 w-14 p-0"
                  onClick={declineCall}
                  aria-label="Decline call"
                  title="Decline"
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
                <Button
                  variant="default"
                  size="lg"
                  className="rounded-full h-14 w-14 p-0 bg-[var(--wasl-green)] hover:bg-[var(--wasl-green)]/90"
                  onClick={() => void answerCall()}
                  aria-label="Accept call"
                  title="Accept"
                >
                  {incomingCall.callType === 'video' ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  // 2. Active call screen (outgoing OR connected)
  if (activeCall) {
    const isVideo = activeCall.callType === 'video'
    const isOutgoing = activeCall.direction === 'outgoing'
    const isReconnecting = activeCall.direction === 'reconnecting'
    const isConnecting = activeCall.direction === 'incoming' || connectingState === 'connecting'
    const isConnected = activeCall.direction === 'connected' && connectingState === 'connected'
    const durationMs = now - activeCall.startedAt
    const statusLabel = isOutgoing
      ? 'Calling…'
      : isReconnecting
        ? 'Reconnecting…'
        : isConnecting
          ? 'Connecting…'
          : isConnected
            ? formatDuration(durationMs)
            : 'Connecting…'

    return (
      <>
        {/* Hidden elements that hold the local/remote media streams */}
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
        <video ref={localVideoRef} autoPlay playsInline muted className="hidden" />
        <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />

        <div className="fixed inset-0 z-[100] bg-[#0b141a] text-white flex flex-col">
          {/* Top bar — peer info + close */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-white/60 font-semibold">
                {isVideo ? 'Video call' : 'Voice call'}
              </div>
              <span className="text-white/40">·</span>
              <div className="text-sm text-white/80 truncate">Wasl · Encrypted</div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isOutgoing || isConnected || isConnecting || isReconnecting) hangup()
              }}
              className="rounded-full p-2 text-white/70 hover:text-white hover:bg-white/10 transition"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Main stage */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden">
            {/* Remote video (full-bleed) */}
            {isVideo && (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                style={{ background: '#0b141a' }}
              />
            )}

            {/* Local video (picture-in-picture) */}
            {isVideo && videoOn && (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-4 right-4 w-28 h-40 sm:w-36 sm:h-52 rounded-2xl border border-white/20 object-cover shadow-xl bg-black"
              />
            )}

            {/* Audio-only / pre-connection stage */}
            {(!isVideo || !isConnected) && (
              <div className="relative z-10 flex flex-col items-center text-center px-6">
                <AvatarCircle
                  name={activeCall.peerName}
                  color={activeCall.peerAvatarColor}
                  size={120}
                  pulse={isOutgoing || isConnecting}
                />
                <div className="mt-6 text-2xl font-semibold">{activeCall.peerName}</div>
                <div className="mt-2 text-sm text-white/70 inline-flex items-center gap-2">
                  {(isOutgoing || isConnecting) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {statusLabel}
                </div>
                {isVideo && (
                  <div className="mt-1 text-[11px] text-white/40">
                    {videoOn ? 'Camera on' : 'Camera off'}
                  </div>
                )}
              </div>
            )}

            {/* Reconnecting overlay */}
            {isReconnecting && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="text-sm text-white/80 inline-flex items-center gap-2 bg-black/60 rounded-full px-4 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Reconnecting…
                </div>
              </div>
            )}
          </div>

          {/* Call controls */}
          <div className="px-4 py-6 border-t border-white/10">
            <div className="max-w-md mx-auto flex items-center justify-center gap-3">
              <CallControlButton
                active={!muted}
                onClick={toggleMute}
                activeIcon={<Mic className="h-5 w-5" />}
                inactiveIcon={<MicOff className="h-5 w-5" />}
                activeLabel="Mute"
                inactiveLabel="Unmute"
              />
              {isVideo && (
                <CallControlButton
                  active={videoOn}
                  onClick={toggleVideo}
                  activeIcon={<Video className="h-5 w-5" />}
                  inactiveIcon={<VideoOff className="h-5 w-5" />}
                  activeLabel="Camera off"
                  inactiveLabel="Camera on"
                />
              )}
              <CallControlButton
                active={speakerOn}
                onClick={toggleSpeaker}
                activeIcon={<Volume2 className="h-5 w-5" />}
                inactiveIcon={<VolumeX className="h-5 w-5" />}
                activeLabel="Mute speaker"
                inactiveLabel="Speaker on"
              />
              <button
                type="button"
                onClick={hangup}
                className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-lg transition"
                aria-label="End call"
                title="End call"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
            </div>
            {isConnected && (
              <div className="mt-3 text-center text-[11px] text-white/40">
                🔒 End-to-end encrypted · {formatDuration(durationMs)}
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  // 3. Call ended toast (auto-dismiss after 4.5s)
  if (callEnded) {
    const reasonText: Record<string, string> = {
      ended: 'Call ended',
      declined: 'Call declined',
      missed: 'Missed call',
      failed: 'Call failed',
      busy: 'User is busy',
      timeout: 'No answer',
      unavailable: 'User unavailable',
    }
    const duration = callEnded.durationMs > 1000 ? ` · ${formatDuration(callEnded.durationMs)}` : ''
    return (
      <>
        <CallBackdrop blur={false} />
        <div className="fixed bottom-6 right-6 z-[100] pointer-events-none">
          <div className="pointer-events-auto w-80 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3 p-3">
              <div
                className={cn(
                  'h-12 w-12 rounded-full flex items-center justify-center shrink-0',
                  callEnded.reason === 'ended' || callEnded.reason === 'declined'
                    ? 'bg-[var(--wasl-green)]/10 text-[var(--wasl-green)]'
                    : 'bg-amber-500/10 text-amber-600'
                )}
              >
                {callEnded.reason === 'missed' ? (
                  <PhoneMissed className="h-5 w-5" />
                ) : callEnded.reason === 'ended' ? (
                  <PhoneOff className="h-5 w-5" />
                ) : (
                  <PhoneOff className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground truncate">{callEnded.peerName}</div>
                <div className="text-xs text-muted-foreground">
                  {reasonText[callEnded.reason] || 'Call ended'}
                  {duration}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCallEnded(null)}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  return null
}

// ----------------------------------------------------------------------------
// Subcomponents
// ----------------------------------------------------------------------------

function CallBackdrop({ blur }: { blur: boolean }) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-[99] bg-black/40',
        blur && 'backdrop-blur-sm'
      )}
      aria-hidden="true"
    />
  )
}

function AvatarCircle({
  name,
  color,
  size,
  pulse,
}: {
  name: string
  color: string | null
  size: number
  pulse?: boolean
}) {
  const bg = color || '#075E54'
  return (
    <div
      className={cn('relative rounded-full flex items-center justify-center text-white font-semibold shrink-0', pulse && 'wasl-call-pulse')}
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: size * 0.35,
      }}
    >
      {initials(name)}
    </div>
  )
}

function CallControlButton({
  active,
  onClick,
  activeIcon,
  inactiveIcon,
  activeLabel,
  inactiveLabel,
}: {
  active: boolean
  onClick: () => void
  activeIcon: React.ReactNode
  inactiveIcon: React.ReactNode
  activeLabel: string
  inactiveLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-14 w-14 rounded-full flex items-center justify-center transition shadow-lg',
        active
          ? 'bg-white/15 text-white hover:bg-white/25'
          : 'bg-white text-slate-900 hover:bg-white/90'
      )}
      title={active ? activeLabel : inactiveLabel}
      aria-label={active ? activeLabel : inactiveLabel}
    >
      {active ? activeIcon : inactiveIcon}
    </button>
  )
}
