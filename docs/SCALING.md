# Wasl Scaling Guide

## Current Setup (MVP)
- **Database**: Turso (libSQL) — single primary, single-region
- **Limit**: ~100 concurrent users (single-writer)
- **Cost**: $0 (free tier)

## Scaling to 1,000+ Users

### Option 1: Turso Replication (Zero-Cost)
Turso supports read replicas in multiple regions. This scales read-heavy workloads
without additional cost.

```bash
# Create a replica in a new region (free tier supports up to 3 locations)
turso db replicate wasl-fortleem fra  # Frankfurt
turso db replicate wasl-fortleem sin  # Singapore
```

### Option 2: Turso Paid Tier ($29/mo)
- 9GB storage, 1B row reads, 25M row writes, unlimited replicas

### Option 3: Self-Hosted PostgreSQL (Free)
- Supabase free tier (500MB) or Neon free tier (3GB)
- Update Prisma schema provider from sqlite to postgresql
