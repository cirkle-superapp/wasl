# Security Policy

## Supported Versions
Wasl is currently in active development. Security fixes are applied to the `main` branch.

## Reporting a Vulnerability
Email: security@cirkle.app

## Security Measures

### Authentication
- Passwords hashed with bcrypt (10 rounds)
- Cookie-based sessions (httpOnly, sameSite=lax)
- Rate limiting on login (10/min per IP) and signup (5/min per IP)

### API Security
- All API routes rate-limited via proxy.ts (120/min general, 60/min data, 20/min uploads)
- Input validation on all routes
- SQL injection prevention (Prisma parameterized queries)
- XSS prevention (React text node rendering, no dangerouslySetInnerHTML)

### File Upload Security
- MIME type validation (JPEG, PNG, WebP, PDF only)
- File size limit (5MB max)
- Files stored outside the database

### CORS
- Socket.io CORS restricted to ALLOWED_ORIGINS
- Vercel security headers (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy)

### Data Protection
- .env excluded from git
- No sensitive data in client-side code
- Turso auth token stored as encrypted env var on Vercel
