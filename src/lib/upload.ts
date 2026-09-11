'use client'

// Uploads a file to /api/upload and returns the public path.
// Used by the verify-person and business registration flows.
export async function uploadFile(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch('/api/upload', { method: 'POST', body: formData })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error || 'Upload failed')
  }
  return data.path as string
}
