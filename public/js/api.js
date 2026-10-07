const API = {
  token: null,
  refreshToken: null,
  refreshing: null,

  setSession(session) {
    this.token = session?.access_token || null;
    this.refreshToken = session?.refresh_token || null;
  },

  clearSession() {
    this.token = null;
    this.refreshToken = null;
    localStorage.removeItem("FOOT26_SESSION");
  },

  async refresh() {
    if (!this.refreshToken) throw new Error("Session expirée.");
    if (!this.refreshing) {
      this.refreshing = fetch(this.base("/api/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: this.refreshToken })
      }).then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok || !body.session) throw new Error(body.error || "Impossible de renouveler la session.");
        localStorage.setItem("FOOT26_SESSION", JSON.stringify(body.session));
        this.setSession(body.session);
        return body.session;
      }).finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  },

  base(url) {
    const configured = window.FOOT26_API_BASE || "";
    return configured.replace(/\/$/, "") + url;
  },

  async request(url, options = {}, canRefresh = true) {
    const headers = { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await fetch(this.base(url), { ...options, headers });
    const type = response.headers.get("content-type") || "";
    const body = type.includes("application/json") ? await response.json() : await response.text();
    if (response.status === 401 && canRefresh && this.refreshToken) {
      try { await this.refresh(); return this.request(url, options, false); }
      catch { this.clearSession(); throw new Error("Session expirée. Reconnectez-vous."); }
    }
    if (!response.ok) throw new Error(body?.error || body || `Erreur HTTP ${response.status}`);
    return body;
  },

  get(url) { return this.request(url); },
  post(url, data) { return this.request(url, { method: "POST", body: JSON.stringify(data) }); },
  put(url, data) { return this.request(url, { method: "PUT", body: JSON.stringify(data) }); },
  patch(url, data = {}) { return this.request(url, { method: "PATCH", body: JSON.stringify(data) }); },
  delete(url) { return this.request(url, { method: "DELETE" }); }
};
