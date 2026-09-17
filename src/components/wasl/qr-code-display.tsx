'use client'

import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'

/**
 * QRCodeDisplay — renders a QR code for the given value as an SVG data URL.
 * Uses the `qrcode` library to generate a high-contrast QR code that can be
 * scanned by phone cameras.
 */
export function QRCodeDisplay({
  value,
  size = 200,
  className,
}: {
  value: string
  size?: number
  className?: string
}) {
  const [dataUrl, setDataUrl] = useState<string>('')
  const [error, setError] = useState<string>('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      color: {
        dark: '#075E54', // wasl-green for the QR pattern
        light: '#FFFFFF', // white background
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (mountedRef.current) {
          setDataUrl(url)
          setError('')
        }
      })
      .catch((err) => {
        if (mountedRef.current) setError(err.message || 'Failed to generate QR')
      })
    return () => {
      mountedRef.current = false
    }
  }, [value, size])

  if (error) {
    return (
      <div
        className={`flex items-center justify-center text-sm text-muted-foreground ${className || ''}`}
        style={{ width: size, height: size }}
      >
        QR error
      </div>
    )
  }

  if (!dataUrl) {
    return (
      <div
        className={`flex items-center justify-center ${className || ''}`}
        style={{ width: size, height: size }}
      >
        <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-[var(--wasl-green)] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-xl overflow-hidden border-2 border-[var(--wasl-green)]/20 bg-white p-2 shadow-sm ${className || ''}`}
      style={{ width: size + 16, height: size + 16 }}
    >
      <img
        src={dataUrl}
        alt="QR code"
        width={size}
        height={size}
        className="rounded-lg"
      />
    </div>
  )
}
