#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
target="${DEPLOY_TARGET:-root@ssh.food21services.com}"
revision="$(git rev-parse --short=12 HEAD)"
release="$(date -u +%Y%m%dT%H%M%SZ)-${revision}"
release_path="/var/www/maicoach/releases/${release}"
if [ "${1:-}" = '--prebuilt' ]; then
  test -f dist/client/index.html
  test -f dist/server/index.js
elif [ -n "${1:-}" ]; then
  echo 'Usage: bash deploy/deploy.sh [--prebuilt]' >&2
  exit 1
else
  npm ci
  npm test
  npm run build
fi
ssh "$target" "mkdir -p '${release_path}' /var/www/maicoach/acme"
rsync -az dist data package.json package-lock.json "$target:${release_path}/"
rsync -az deploy/ "$target:${release_path}/deploy/"
ssh "$target" bash -s -- "$release_path" <<'REMOTE'
set -euo pipefail
release_path="$1"
cd "$release_path"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund
test -f data/catalog.json
old_release="$(readlink -f /var/www/maicoach/current || true)"
ln -s "$release_path" /var/www/maicoach/current.next
mv -Tf /var/www/maicoach/current.next /var/www/maicoach/current
install -m 644 deploy/maicoach.service /etc/systemd/system/maicoach.service
# Never overwrite a host that certbot may already have configured.
if [ ! -e /etc/nginx/sites-available/maicoach.harveypacleb.com ]; then
  install -m 644 deploy/nginx.conf /etc/nginx/sites-available/maicoach.harveypacleb.com
  ln -s /etc/nginx/sites-available/maicoach.harveypacleb.com /etc/nginx/sites-enabled/maicoach.harveypacleb.com
fi
if [ ! -e /etc/maicoach.env ]; then
  install -m 600 /dev/null /etc/maicoach.env
  printf '%s\n' 'PORT=3107' 'AI_MODEL=gpt-4o-mini' 'AI_MAX_DAILY=100' > /etc/maicoach.env
fi
systemctl daemon-reload
systemctl enable maicoach
systemctl restart maicoach
ready=false
for attempt in {1..20}; do
  if curl --fail --silent http://127.0.0.1:3107/api/health > /dev/null; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then
  if [ -n "$old_release" ] && [ -d "$old_release" ]; then
    ln -s "$old_release" /var/www/maicoach/rollback.next
    mv -Tf /var/www/maicoach/rollback.next /var/www/maicoach/current
    systemctl restart maicoach
  else
    systemctl stop maicoach
  fi
  echo 'Health check failed; previous release restored where available.' >&2
  exit 1
fi
nginx -t
systemctl reload nginx
host_ready=false
for attempt in {1..20}; do
  host_health="$(curl --fail --silent --max-time 5 -H 'Host: maicoach.harveypacleb.com' http://127.0.0.1/api/health || true)"
  case "$host_health" in
    *'"status":"ok"'*) host_ready=true; break ;;
  esac
  sleep 1
done
if [ "$host_ready" != true ]; then
  echo 'Nginx host health check failed.' >&2
  exit 1
fi
printf '%s\n' "$host_health"
printf '\nRelease: %s\n' "$release_path"
REMOTE
