#!/usr/bin/env python3
"""Bind the freshtrack-pantry KV namespace to the freshtrack-ai Worker.

D1 is NOT usable with the stored Cloudflare credential (D1 list/create
return auth error 10000), so server pantry storage uses Workers KV
instead: namespace 'freshtrack-pantry', binding PANTRY_KV.

Uses the proven PATCH-settings multipart pattern from gembala-v2
(part named "settings"). The existing GEMINI_API_KEY secret binding is
re-declared WITHOUT a text value, so the secret value is preserved
(verified: /api/health still reports ai:true after this runs).

Run once: python3 worker/bind_kv.py
"""
import json, os, sys, urllib.request, urllib.error

sys.path.insert(0, '/opt/muse/skills/custom-connector-setup/bin')
import dynamic_credentials as dc

ACCT = '4ee061cebe8412fcb40c43f95cc534f0'
NS_ID = 'a9d1d812378b48c4a3bdc9ee3a1dac48'  # freshtrack-pantry KV namespace
NS_TITLE = 'freshtrack-pantry'
API = 'https://api.cloudflare.com/client/v4'


def call(method, path, body=None, headers=None):
    req = urllib.request.Request(API + path, method=method, data=body,
                                 headers=headers or {})
    dc.add_surrogate_to_request(req, 'custom.cloudflare',
                                allowed_hosts=['api.cloudflare.com'])
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        try:
            return json.load(e)
        except Exception:
            return {'success': False,
                    'errors': [{'message': 'HTTP %d' % e.code}]}


def main():
    # 1. Make sure the namespace exists (create is idempotent-safe:
    #    it creates a second namespace with the same title if run twice,
    #    so only create when the known id is missing from the list).
    listed = call('GET', '/accounts/%s/storage/kv/namespaces' % ACCT)
    ids = [r.get('id') for r in (listed.get('result') or [])]
    if NS_ID not in ids:
        created = call('POST', '/accounts/%s/storage/kv/namespaces' % ACCT,
                       {'title': NS_TITLE})
        if not created.get('success'):
            print('KV-CREATE-FAILED:', json.dumps(created)[:400])
            sys.exit(1)
        print('KV-CREATED:', json.dumps(created.get('result'))[:200])
        print('NOTE: update NS_ID in this file to the new id and rerun.')
        sys.exit(1)
    print('KV namespace exists:', NS_ID)

    # 2. PATCH settings (multipart, part "settings"), preserving the secret.
    boundary = '----muse-worker-settings-freshtrack'
    meta = json.dumps({'bindings': [
        {'type': 'secret_text', 'name': 'GEMINI_API_KEY'},
        {'type': 'kv_namespace', 'name': 'PANTRY_KV',
         'namespace_id': NS_ID},
    ]})
    body = (
        '--' + boundary + '\r\n'
        'Content-Disposition: form-data; name="settings"\r\n'
        'Content-Type: application/json\r\n\r\n'
        + meta + '\r\n'
        + '--' + boundary + '--\r\n'
    ).encode()
    out = call('PATCH',
               '/accounts/%s/workers/scripts/freshtrack-ai/settings' % ACCT,
               body=body,
               headers={'Content-Type':
                        'multipart/form-data; boundary=' + boundary})
    print('PATCH:', json.dumps(out)[:400])
    if not out.get('success'):
        sys.exit(1)
    out2 = call('GET',
                '/accounts/%s/workers/scripts/freshtrack-ai/settings' % ACCT)
    print('BINDINGS:', json.dumps(
        out2.get('result', {}).get('bindings'))[:400])
    print('BIND-DONE')


if __name__ == '__main__':
    main()
