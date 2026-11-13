#!/usr/bin/env python3
"""Deploy the FreshTrack AI Worker to Cloudflare.

Uploads the Worker script with PUT only (never PATCH settings, so no
existing binding or secret is touched), then creates the Worker route
grokingstore.my.id/freshtrack-ai/* in zone grokingstore.my.id if it
does not exist yet.

The Gemini key is NOT set here: the secret GEMINI_API_KEY is installed
separately by the main agent together with the user. Until then the
Worker answers 503 { error: 'ai_unavailable' } and the app falls back
to rule-based recipes.

Run: python3 worker/deploy_worker.py
"""
import json, os, sys, urllib.request, urllib.error

sys.path.insert(0, '/opt/muse/skills/custom-connector-setup/bin')
import dynamic_credentials as dc

ACCT = '4ee061cebe8412fcb40c43f95cc534f0'
ZONE = '804f88e1923492d8f0a5e402acf6a767'
API = 'https://api.cloudflare.com/client/v4'
NAME = 'freshtrack-ai'
PATTERN = 'grokingstore.my.id/freshtrack-ai/*'
HERE = os.path.dirname(os.path.abspath(__file__))

if not os.environ.get('HTTPS_PROXY') and not os.environ.get('https_proxy'):
    try:
        with open('/home/hatch/workspace/9router/proxy.env') as f:
            for line in f:
                line = line.strip()
                if line and '=' in line and not line.startswith('#'):
                    k, v = line.split('=', 1)
                    k, v = k.strip(), v.strip()
                    if k in ('HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy', 'NO_PROXY', 'no_proxy'):
                        os.environ.setdefault(k, v)
    except FileNotFoundError:
        pass


def call(method, path, body=None, raw=None):
    data = raw
    headers = {}
    if body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    if raw is not None:
        headers['Content-Type'] = 'application/javascript'
    req = urllib.request.Request(API + path, method=method, data=data, headers=headers)
    dc.add_surrogate_to_request(req, 'custom.cloudflare', allowed_hosts=['api.cloudflare.com'])
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        try:
            return json.load(e)
        except Exception:
            return {'success': False, 'errors': [{'message': 'HTTP %d' % e.code}]}


def main():
    with open(os.path.join(HERE, 'worker.js'), 'rb') as f:
        script = f.read()
    out = call('PUT', '/accounts/%s/workers/scripts/%s' % (ACCT, NAME), raw=script)
    print('UPLOAD:', json.dumps(out)[:400])
    if not out.get('success'):
        sys.exit(1)

    routes = call('GET', '/zones/%s/workers/routes' % ZONE)
    if not routes.get('success'):
        print('ROUTES-LIST-FAILED:', json.dumps(routes)[:300])
        sys.exit(1)
    exists = any(r.get('pattern') == PATTERN for r in routes.get('result', []))
    if exists:
        print('ROUTE: already exists (%s)' % PATTERN)
    else:
        created = call('POST', '/zones/%s/workers/routes' % ZONE,
                       {'pattern': PATTERN, 'script': NAME})
        print('ROUTE-CREATE:', json.dumps(created)[:400])
        if not created.get('success'):
            sys.exit(1)
    print('DEPLOY-DONE')


if __name__ == '__main__':
    main()
