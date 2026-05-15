# Scaling — what to do when one homelab box isn't enough

**TL;DR.** A single homelab box on Starlink is fine until you hit either ~100 concurrent users or your first sustained outage. Then migrate the whole stack to the cheapest Hetzner VPS (€4/mo · €48/yr) — same `make deploy`, just a different `ONPREM_HOST`. Don't add a second box for redundancy until you have paying customers who care, and even then prefer two Hetzner boxes over a hybrid homelab+VPS pair — the latency budget on Starlink CGNAT (40–150 ms per DB round-trip via Tailscale) eats your page render time faster than the €48/yr saves you. The one zero-cost thing worth doing today: install Tailscale on the homelab so future east-west joins are two lines, not a one-hour networking project.

See [`deploy.md`](./deploy.md) for the current single-host flow this builds on.

---

## 1. Current — single homelab box

Stack as deployed today: one Ubuntu box, Kamal 2, Cloudflare Tunnel outbound, all five containers (`app`, `postgres`, `redis`, `minio`, `cloudflared`) on the same Docker network. No inbound ports open. See [`deploy.md`](./deploy.md).

**Natural ceiling.** Three independent limits, whichever bites first:

| Limit | Threshold | Why |
|---|---|---|
| Concurrent users | ~50–100 simultaneous public-menu viewers | Node single-process + Postgres on same CPU. Public menu is `unstable_cache`'d per slug (hard rule #12), so steady-state load is mostly the `/api/track/[slug]` beacon + image fetches from MinIO. |
| Upstream bandwidth | ~10 Mbps real-world on Starlink residential ([plans](https://www.starlink.com/business/plans)) | Symmetric-ish on paper, but residential tier is best-effort and uplink dips hardest under contention. A page with 6 dish photos at 200 KB each = 1.2 MB; ~8 concurrent first-paint loads saturates uplink. |
| Reliability | ~99.0–99.5% / month realistic | Residential ISP + consumer-grade power. Starlink itself publishes no SLA for residential ([Starlink terms](https://www.starlink.com/legal/documents/DOC-1134-89405-69)). One thunderstorm = one outage. |

**When to upgrade.** First of these to be true:
- A real (paying) customer complains about an outage you can't explain.
- The CDN-bypass uploads (admin uploading menu images via signed URL → MinIO on the box) become painful, i.e. minutes per image. Means uplink is saturated.
- You start serving customers outside Western Europe and the Cloudflare edge can't hide the round-trip to your box anymore.

Until then: stay here. It's free.

**When this makes sense.** Always, as the starting point. Pre-revenue + EU + low traffic = this is the right answer.

---

## 2. Vertical — bigger homelab box

Buy more box, same address. Cheapest scaling motion.

**What it fixes.** CPU-bound rendering, Postgres memory pressure, MinIO IOPS. A modern N100 mini-PC (€150–250 one-off) or a used Xeon E-2278G tower off eBay (€200–400) gets you ~4× the current single-box throughput.

**What it does NOT fix:**
- Starlink uplink cap (~10 Mbps) — still the ceiling for outbound bandwidth.
- Starlink CGNAT — no inbound IP, you still go out via Cloudflare Tunnel (which is fine, but means you can't ever expose a non-HTTP service to the public internet directly).
- Single power circuit, single ISP, single physical location. One thunderstorm still = one outage.

**Cost.** €150–400 one-off, amortized = €30–80/yr if the box lasts five years. Cheaper per year than Hetzner (€48/yr) *if* you already trust your power + ISP, *if* you don't value off-site location, and *if* the box doesn't die in year two.

**When this makes sense.** You're hitting CPU/memory limits on the current box but bandwidth and uptime are still fine, and you genuinely enjoy homelab tinkering. Otherwise, skip straight to scenario 3 — the marginal cost over a used minipc is small and the operational simplicity is worth it.

---

## 3. Migration — move entirely to a Hetzner VPS

Single command-flow change. Same `make deploy`, different IP.

**Box.** Hetzner Cloud CX22 (x86, 2 vCPU, 4 GB, 40 GB SSD) is **€4.51/mo · €54.12/yr** as of May 2026; CAX11 (Ampere ARM, 2 vCPU, 4 GB) is **€3.79/mo · €45.48/yr** ([Hetzner Cloud pricing](https://www.hetzner.com/cloud)). ARM is the cheapest viable tier; both run the same Docker image fine (the `Dockerfile` builds for `linux/amd64` today, swap to `arm64` for CAX11 — one line in `builder.arch`).

**Cutover steps** (~30 min wall-clock):

```bash
# 1. Provision Hetzner box, paste ~/.ssh/id_ed25519.pub during creation.
# 2. ssh root@<new-ip> 'whoami'  → "root" instantly. No host-init needed.

# 3. On the OLD box: dump postgres + sync minio data.
ssh root@$OLD_HOST 'docker exec meta-menu-postgres pg_dump -U postgres metamenu | gzip' > db.sql.gz
ssh root@$OLD_HOST 'tar czf - -C /var/lib/docker/volumes/meta-menu-minio-data/_data .' > minio.tgz

# 4. Edit infra/.env: ONPREM_HOST=<new-ip>
# 5. make deploy   → tofu re-points the tunnel ingress, kamal boots fresh stack on new box.

# 6. Restore data on the new box.
gunzip < db.sql.gz | ssh root@$NEW_HOST 'docker exec -i meta-menu-postgres psql -U postgres metamenu'
ssh root@$NEW_HOST 'docker run --rm -v meta-menu-minio-data:/data -i busybox tar xzf - -C /data' < minio.tgz

# 7. Hit https://$PUBLIC_HOSTNAME/up — should be {"ok":true,"db":"ok"}.
```

DNS doesn't change — the Cloudflare Tunnel ingress is rewritten by `tofu apply`, the user-facing hostname stays put, no TTL wait.

**What you gain.** 99.9%+ uptime ([Hetzner SLA](https://www.hetzner.com/legal/cloud)), gigabit symmetric, real EU datacenter latency (Falkenstein/Helsinki/Nuremberg = 20–40 ms to most EU users), nightly snapshots for €1/mo extra.

**What you lose.** €48/yr. That's it.

**When this makes sense.**
- First paying customer, especially if they're not in your physical region.
- You're spending more than ~1 hr/quarter on homelab reliability issues — the VPS cost is cheaper than your time.
- Latency-sensitive users in a specific EU region (pick the matching Hetzner location).

This is the recommended next step. Do not skip it to chase multi-host.

---

## 4. Multi-host shared-DB — Tailscale east-west

Two web boxes, one DB. The DHH-endorsed pattern ([X post](https://x.com/dhh/status/1919681760532586706)): join all hosts to a Tailscale tailnet, address the DB by its tailnet IP, let WireGuard handle the encrypted east-west link.

```yaml
# infra/kamal/config/deploy.yml — multi-host snippet
servers:
  web:
    hosts:
      - <%= ENV.fetch("WEB_HOST_1") %>     # e.g. Hetzner Falkenstein
      - <%= ENV.fetch("WEB_HOST_2") %>     # e.g. Hetzner Helsinki, or homelab

accessories:
  postgres:
    image: postgres:18-alpine
    host: <%= ENV.fetch("DB_HOST") %>       # one box, addressed by tailnet IP
    # e.g. DB_HOST=100.64.10.5  (MagicDNS: db.tail-xxxx.ts.net also works)
```

App containers reach Postgres over the tailnet (`DATABASE_URL=postgres://...@100.64.10.5:5432/metamenu`). MinIO and Redis follow the same pattern. Kamal-proxy on each web host load-balances locally; Cloudflare Tunnel ingress points to the kamal-proxy on either box (or both via two `cloudflared` accessories).

**Latency reality.** Tailscale picks the lowest-latency path it can:
- **Direct WireGuard** EU↔EU: typically 15–40 ms. Possible when at least one peer has a public IP (any Hetzner box does). Per DB round-trip.
- **DERP-relayed** (Frankfurt/Paris/Amsterdam relays — see [Tailscale DERP map](https://tailscale.com/kb/1232/derp-servers)): 40–150 ms. This is what you get when **both** peers are CGNAT'd — which is exactly the Starlink homelab case. Starlink CGNAT means the homelab cannot do direct WireGuard with another CGNAT peer; with a Hetzner peer it usually can (Hetzner side has a public IP), so direct is achievable.

**Performance budget.** Public menu page renders ~5–20 DB queries (snapshot loader + i18n fanout). At 30 ms direct east-west that's 150–600 ms of pure RTT in the render path. At 100 ms DERP-relayed, you're at 500–2000 ms — visibly slow. The `unstable_cache` snapshot mostly hides this on the public menu, but the admin builder isn't cached and *will* feel sluggish.

Realistic page-render budgets:
- Both boxes in same Hetzner region: 200–400 ms total. Fine.
- Hetzner + homelab over direct WireGuard: 300–600 ms. Acceptable.
- Hetzner + homelab over DERP relay: 500–1500 ms. Don't.

**Cost.** Tailscale Free tier covers up to 100 devices and 3 users ([Tailscale pricing](https://tailscale.com/pricing)) — well above what you'd ever hit here. Adding one Hetzner CX22 = **€4.51/mo · €54.12/yr**. So multi-host = €48/yr more than scenario 3, for redundancy.

**What you gain.** One box can die without taking the app down (assuming DB box is the survivor; otherwise you're degraded). Lets you roll deploys without a blip.

**What you give up.** The latency penalty above. Operational complexity: now you have two boxes to patch, two `docker logs` to grep, and a tailnet to keep healthy. A failed DB box still means downtime — shared-DB is **not** HA for Postgres.

**Not Cloudflare Tunnel TCP for east-west.** CF Tunnel works for app↔Postgres in theory, but routes through the Cloudflare edge — adds 30–80 ms per hop on top of geographic latency, doesn't do MagicDNS, and isn't the maintained Kamal idiom. Tailscale is what DHH and the Kamal community use; stick with it.

**Not Docker Swarm overlay.** Kamal explicitly rejects Swarm — [`Kamal Handbook`](https://kamal-deploy.org/docs/) is built around a flat "containers on hosts" model, no orchestrator overlay. Don't fight it.

**When this makes sense.**
- You have paying customers who notice an outage within minutes.
- You're willing to spend €48/yr extra AND accept the per-page latency penalty above.
- You're deploying on a rhythm fast enough that zero-downtime matters.

If you're not yet at all three: don't.

---

## 5. Multi-region with separate DBs

Postgres logical replication ([docs](https://www.postgresql.org/docs/current/logical-replication.html)) or write-region routing (one primary, read replicas in other regions). The complexity cliff: now you're reasoning about replication lag, conflict resolution if you ever go multi-primary, and cache invalidation across regions.

**Cost floor.** 2× Hetzner CX22 = **€9/mo · €108/yr**, plus the engineering cost of getting replication right (non-trivial).

**When this makes sense.** Several thousand active tenants, real geographic spread (US + EU + APAC), and a specific reason the single-region latency from scenario 3 isn't good enough. Not pre-revenue. Probably not even at €10k MRR. Reassess when you have enough customers to notice region-specific p95 latencies in your metrics.

---

## 6. Recommended preparation today (zero cost)

Install Tailscale as a host service on the homelab. Takes 2 minutes, costs nothing, makes scenario 4 a 2-line change later instead of a networking project.

```bash
# On the homelab box, as root:
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --ssh --hostname=meta-menu-homelab
# Authenticate via the printed URL (one-time, your Tailscale account).

# Note the MagicDNS hostname Tailscale assigns (something like
# meta-menu-homelab.tail-xxxx.ts.net) — write it in infra/.env as a comment
# next to ONPREM_HOST. That's it.
```

Why on the host, not in a container: Tailscale-as-container forces you to share its netns or run sidecars per accessory. Host-level means every container's outbound traffic can reach the tailnet via the host's routing table, no Kamal config changes today.

No `infra/kamal/config/deploy.yml` change required now. When you eventually add a second box, the diff is exactly:

```yaml
servers:
  web:
    hosts:
-     - <%= ENV.fetch("ONPREM_HOST") %>
+     - <%= ENV.fetch("ONPREM_HOST") %>     # tailnet IP or MagicDNS
+     - <%= ENV.fetch("VPS_HOST") %>        # tailnet IP or MagicDNS
```

That's the entire "prep for multi-host" investment. Do it next time you SSH to the box for something else.

---

## Comparison

| Scenario | Added cost/yr | Added latency/page | Added complexity | Best fit |
|---|---|---|---|---|
| 1. Single homelab | €0 | 0 (baseline) | None | Today. Pre-revenue, EU-local, ≤100 concurrent. |
| 2. Bigger homelab | €30–80 (amortized) | 0 | Low | CPU-bound but uplink+power still fine. Skip if undecided. |
| 3. Migrate to Hetzner | €48 | -10 to -50 ms (faster) | None — same `make deploy` | First paying customer, or any reliability complaint. **Default next step.** |
| 4. Multi-host shared-DB (Tailscale) | €48 (one extra Hetzner) | +30 to +150 ms (east-west DB) | Medium — two hosts, tailnet, partial HA only | Paying users + zero-downtime deploys mandatory. Both boxes in same Hetzner region. |
| 5. Multi-region separate DBs | €108+ | depends — usually -50 to -150 ms for far users | High — replication, conflicts, cache invalidation | Thousands of tenants, real geographic spread. Not soon. |
