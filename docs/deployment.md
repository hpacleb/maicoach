# Deploying MaiCoach

Target: `root@ssh.food21services.com` (initial address `168.144.128.161`). Existing Food21 and portfolio hosts remain separate. The app listens only on `127.0.0.1:3107`; Nginx handles the public hostname.

## Release a tested revision

From a clean checkout, after committing the intended source:

```bash
bash deploy/deploy.sh
```

The script installs dependencies, runs core/API tests, builds locally, uploads only deployment artifacts/data/package metadata, installs production dependencies remotely, switches an atomic `current` symlink, restarts the dedicated systemd service, and checks health before reloading Nginx. On an app health failure, it restores the previous release where one exists. Browser tests should pass before running this script.

Files:

- Releases: `/var/www/maicoach/releases/<timestamp>-<revision>`
- Active release: `/var/www/maicoach/current`
- Service: `/etc/systemd/system/maicoach.service`
- Private environment: `/etc/maicoach.env` (root, mode 600)
- Host: `/etc/nginx/sites-available/maicoach.harveypacleb.com`
- Access/error logs: `/var/log/nginx/maicoach.*.log`

The script does not overwrite an existing Nginx host, allowing Certbot-managed TLS settings to survive later app deployments. It preserves existing provider configuration. There is no deploy-on-push automation or shared server secret in GitHub.

## DNS and TLS

1. In Cloudflare's `harveypacleb.com` zone, add a **proxied A** record named **maicoach** with value **168.144.128.161**. This server's existing firewall permits web traffic only from Cloudflare; keep that policy. No AAAA record is needed for this IPv4 origin.
2. Once public DNS resolves, ensure Cloudflare can forward the HTTP ACME challenge at `/.well-known/acme-challenge/` to this host without an edge redirect or access challenge. Issue a dedicated certificate:

   ```bash
   ssh root@ssh.food21services.com
   certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email \
     --redirect --cert-name maicoach.harveypacleb.com -d maicoach.harveypacleb.com
   nginx -t
   curl -fsS https://maicoach.harveypacleb.com/api/health
   ```

   An existing Certbot account may be reused. A contact email can be supplied with `--email` instead of `--register-unsafely-without-email` if desired. The existing portfolio certificate does not cover this subdomain.

3. Use **Full (strict)** after the valid origin certificate is installed. Do not weaken the zone's TLS settings, which serve the other websites. If edge rules prevent HTTP certificate validation, use a hostname-scoped exception for the ACME path or a DNS challenge instead. Check that Cloudflare is not caching `/api/plan` or `/api/coach`. They already use `Cache-Control: no-store`.
4. Verify `certbot.timer` is active. Leave the ACME path reachable for renewals.

Before DNS is configured, check the HTTP virtual host over SSH:

```bash
ssh root@ssh.food21services.com \
  'curl -fsS -H "Host: maicoach.harveypacleb.com" http://127.0.0.1/api/health'
```

The initial HTTP deployment is not an HTTPS launch. Add provider secrets only through SSH and the root-only environment file. Verify public HTTPS before enabling public paid inference.

## Configure live AI privately

On the server, use an editor so the credential is not in shell history:

```bash
sudoedit /etc/maicoach.env
systemctl restart maicoach
```

Set `OPENAI_API_KEY`, `AI_MODEL`, optionally `AI_BASE_URL`, and `AI_MAX_DAILY`. The service loads the file automatically. Do not put credentials in the checkout, client variables, deployment arguments, or chat.

After configuration, check `/api/health` for `aiConfigured: true`, then use **Ask coach** once and verify the response has `mode: ai`. Credential presence alone does not verify provider access or schema compatibility. Provider errors visibly fall back to exercise-library guidance.

The app trusts only the local Nginx proxy, and Nginx replaces forwarded IP headers. With Cloudflare proxying enabled, requests initially share limits by Cloudflare edge IP. To preserve true visitor limits, configure `real_ip_header CF-Connecting-IP` **inside this host**, with `set_real_ip_from` restricted to [Cloudflare's published IP ranges](https://www.cloudflare.com/ips/). Do not trust client-supplied headers from arbitrary sources or alter the other sites' IP handling. The service-wide AI budget and concurrency limits still apply regardless.

## Verify and monitor

```bash
systemctl status maicoach --no-pager
systemctl show maicoach -p MemoryCurrent -p MemoryPeak -p NRestarts
journalctl -u maicoach -n 30 --no-pager
curl -fsS http://127.0.0.1:3107/api/health
curl -fsSI https://harveypacleb.com
curl -fsSI https://food21services.com
```

The unit uses a dynamic unprivileged user, a read-only filesystem, a 192 MB memory ceiling, and a 50% CPU quota. No catalog downloads, builds, or score writes occur inside the running service.

## Roll back

Select an existing release directory, switch the symlink, and restart only MaiCoach:

```bash
ln -s /var/www/maicoach/releases/CHOSEN_RELEASE /var/www/maicoach/rollback.next
mv -Tf /var/www/maicoach/rollback.next /var/www/maicoach/current
systemctl restart maicoach
curl -fsS http://127.0.0.1:3107/api/health
```

Release directories are retained for rollback. Remove old ones manually only when no longer needed, keeping the active and previous working releases. Nginx configuration and the environment file are not part of app rollback.
