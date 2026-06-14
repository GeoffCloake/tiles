// assets/js/net/online-client.js
// Thin wrapper around sync.php. Every method returns the parsed JSON response
// ({ ok: true, ... } or { ok: false, error: '...' }). Network errors throw.

export class OnlineClient {
  constructor(baseUrl = './sync.php') {
    this.baseUrl = baseUrl;
  }

  async _post(action, body) {
    const res = await fetch(`${this.baseUrl}?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    });
    return res.json();
  }

  async _get(action, params) {
    const qs = new URLSearchParams({ action, ...params }).toString();
    const res = await fetch(`${this.baseUrl}?${qs}`);
    return res.json();
  }

  health()                    { return this._get('health', {}); }
  create(name, config)        { return this._post('create', { name, config }); }
  join(code, name)            { return this._post('join', { code, name }); }
  resume(code, token)         { return this._post('resume', { code, token }); }
  poll(code, since, token)    { return this._get('poll', { code, since, token }); }
  start(code, token, payload) { return this._post('start', { code, token, ...payload }); }
  move(code, token, payload)  { return this._post('move', { code, token, ...payload }); }
  leave(code, token)          { return this._post('leave', { code, token }); }
}
