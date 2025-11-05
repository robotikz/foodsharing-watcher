import React, { useEffect, useMemo, useRef, useState } from 'react'

const LS_KEYS = {
  storeId: 'fs_store_id',
  headers: 'fs_auth_headers',
  freeSlots: 'fs_prev_free_slots',
}
const BERLIN_TZ = 'Europe/Berlin'

function fmtDate(iso) {
  try {
    const d = new Date(iso)
    const df = new Intl.DateTimeFormat('de-DE', {
      timeZone: BERLIN_TZ,
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    return df.format(d)
  } catch {
    return iso
  }
}
function msUntilNextTopOfHour(now = new Date()) {
  const n = new Date(now)
  n.setMinutes(0, 0, 0)
  n.setHours(n.getHours() + 1)
  return n.getTime() - now.getTime()
}
function diffHuman(ms) {
  if (ms < 0) ms = 0
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const parts = []
  if (h) parts.push(`${h}h`)
  if (m || h) parts.push(`${m}m`)
  parts.push(`${sec}s`)
  return parts.join(' ')
}
function computeAvailability(p) {
  const occupied = (p.occupiedSlots?.length ?? 0)
  const free = Math.max(0, (p.totalSlots ?? 0) - occupied)
  return { free, occupied }
}
function parseHeaders(jsonLike) {
  if (!jsonLike) return undefined
  try {
    const obj = JSON.parse(jsonLike)
    if (obj && typeof obj === 'object') return obj
  } catch {}
  return undefined
}

/**
 * Get the default proxy URL based on build mode and environment.
 *
 * Build modes:
 * - local: Uses .env.local → VITE_PROXY_URL=http://localhost:8787/proxy
 * - emulator: Uses .env.emulator → VITE_PROXY_URL=http://localhost:5001/.../proxy
 * - firebase: Uses .env.firebase → VITE_PROXY_URL=/proxy
 */
function getDefaultProxyUrl() {
  // Priority 1: Use VITE_PROXY_URL from environment (set by build mode)
  // Vite automatically exposes VITE_* variables via import.meta.env
  const envProxyUrl = import.meta.env.VITE_PROXY_URL
  if (envProxyUrl) {
    return envProxyUrl
  }

  // Priority 2: If on Firebase hosting, use relative path
  if (typeof window !== 'undefined') {
    const isFirebaseHosting = /(?:web\.app|firebaseapp\.com)$/i.test(window.location.hostname)
    if (isFirebaseHosting) {
      return '/proxy'
    }
  }

  // Priority 3: Fallback based on mode
  const mode = import.meta?.env?.MODE
  if (mode === 'local') {
    return 'http://localhost:8787/proxy'
  }
  if (mode === 'emulator') {
    return 'http://localhost:5001/foodsharing-watcher/europe-west3/proxy'
  }
  if (mode === 'firebase') {
    return '/proxy'
  }

  // Last resort fallback (should not happen if env files are set up correctly)
  return '/proxy'
}

export default function App() {
  const [storeId, setStoreId] = useState(() => localStorage.getItem(LS_KEYS.storeId) || '29441,29438')
  const defaultProxyUrl = getDefaultProxyUrl()
  // Always use environment-based proxy URL (not persisted in localStorage)
  const [proxyUrl, setProxyUrl] = useState(defaultProxyUrl)

  // Get build mode for display (dev only)
  const buildMode = import.meta.env.MODE || 'unknown'
  const envProxyUrl = import.meta.env.VITE_PROXY_URL

  // Debug: Log environment info in development
  if (import.meta.env.DEV) {
    console.log('[App] Build mode:', buildMode)
    console.log('[App] VITE_PROXY_URL:', envProxyUrl)
    console.log('[App] All env vars:', Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')))
  }
  const [headersInput, setHeadersInput] = useState(() => localStorage.getItem(LS_KEYS.headers) || '')
  const [pickups, setPickups] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [countdown, setCountdown] = useState(msUntilNextTopOfHour())
  const [showOnlyNotOccupied, setShowOnlyNotOccupied] = useState(true)
  const [settingsCollapsed, setSettingsCollapsed] = useState(true)
  const [statusCollapsed, setStatusCollapsed] = useState(true)
  const countdownRef = useRef(null)
  const intervalRef = useRef(null)
  // Persisted free pickup keys for new free notification
  const [prevFreeKeys, setPrevFreeKeys] = useState(() => {
    try {
      const val = localStorage.getItem(LS_KEYS.freeSlots)
      if (val) return JSON.parse(val)
    } catch {}
    return []
  })

  const targetUrl = useMemo(() => `https://foodsharing.de/api/stores/${storeId}/pickups`, [storeId])

  function buildFetchUrl() {
    if (!proxyUrl) return targetUrl
    try {
      const u = new URL(proxyUrl)
      // Multi storeId support (comma separated)
      if (storeId.includes(',')) {
        storeId.split(',').map(sid => sid.trim()).filter(Boolean).forEach(id => u.searchParams.append('store_id', id))
      } else {
        // Fallback to original (single id)
        if (!u.searchParams.has('url')) u.searchParams.set('url', targetUrl)
      }
      return u.toString()
    } catch {
      return proxyUrl || targetUrl
    }
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const url = buildFetchUrl()
      const headers = parseHeaders(headersInput)
      const res = await fetch(url, {
        method: 'GET',
        headers: headers ?? undefined,
        cache: 'no-store',
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${text?.slice(0, 200)}`)
      }
      const data = await res.json()
      let list = [];
      if (Array.isArray(data?.pickups)) {
        list = data.pickups;
      } else if (data.multi && Array.isArray(data.results)) {
        // Aggregate pickups arrays from all responses
        list = data.results.flatMap(x => Array.isArray(x.pickups) ? x.pickups : [])
      }
      setPickups(list)
      setLastUpdated(new Date())

      // Notification: new free pickup slot
      const nowFree = list.filter(p => (computeAvailability(p).free > 0) || p.isAvailable)
      const nowFreeKeys = nowFree.map(p => `${p.storeId || ''}-${p.date}`)
      const newFreeSet = nowFreeKeys.filter(x => !prevFreeKeys.includes(x))
      if (newFreeSet.length > 0 && !document.hidden && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          newFreeSet.forEach(key => {
            const found = nowFree.find(p => `${p.storeId || ''}-${p.date}` === key)
            let msg = 'Neuer freier Abhol-Slot!'
            if (found) msg = `Neuer freier Slot: ${fmtDate(found.date)} ${found.description ? 'um ' + found.description : ''}`
            new Notification(msg)
          })
        }
        // Fire-and-forget email notification
        try {
          fetch('/notify-email', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              subject: 'Neue freie Foodsharing Abhol-Slots!',
              text: newFreeSet.map(key => {
                const found = nowFree.find(p => `${p.storeId || ''}-${p.date}` === key);
                return found ? `${found.date}: ${found.description || ''}` : key;
              }).join('\n')
            })
          });
        } catch {}
      }
      setPrevFreeKeys(nowFreeKeys)
      localStorage.setItem(LS_KEYS.freeSlots, JSON.stringify(nowFreeKeys))

      if (!document.hidden) {
        const hasFree = list.some(p => computeAvailability(p).free > 0 || p.isAvailable)
        if (hasFree && 'Notification' in window) {
          if (Notification.permission === 'granted') new Notification('Foodsharing: freie Abhol-Slots!')
        }
      }
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    function scheduleNextTick() {
      const ms = msUntilNextTopOfHour()
      if (intervalRef.current) window.clearTimeout(intervalRef.current)
      intervalRef.current = window.setTimeout(() => {
        load()
        scheduleNextTick()
      }, ms)
      setCountdown(ms)
    }
    scheduleNextTick()

    function tick() {
      setCountdown(prev => (prev > 1000 ? prev - 1000 : msUntilNextTopOfHour()))
      countdownRef.current = window.setTimeout(tick, 1000)
    }
    tick()

    return () => {
      if (intervalRef.current) window.clearTimeout(intervalRef.current)
      if (countdownRef.current) window.clearTimeout(countdownRef.current)
    }
  }, [storeId, proxyUrl, headersInput])

  useEffect(() => localStorage.setItem(LS_KEYS.storeId, storeId), [storeId])
  useEffect(() => localStorage.setItem(LS_KEYS.headers, headersInput), [headersInput])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  const totals = React.useMemo(() => {
    const total = pickups.length
    const withFree = pickups.filter(p => computeAvailability(p).free > 0 || p.isAvailable).length
    return { total, withFree }
  }, [pickups])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Foodsharing Pickup Watcher</h1>
          <div className="text-sm text-slate-600">
            Nächste Prüfung in <span className="font-semibold">{diffHuman(countdown)}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left column: Settings and Status */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-2xl shadow p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Settings</h2>
                <button
                  className={`px-3 py-1 rounded-xl border text-sm ${loading ? 'opacity-60' : 'hover:bg-slate-50'}`}
                  onClick={() => load()}
                  disabled={loading}
                  title="Fetch now"
                >
                  {loading ? 'Loading…' : 'Check now'}
                </button>
              </div>
            <label className="block text-sm">
              <span className="text-slate-600">Laden-IDs</span>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={storeId}
                onChange={e => setStoreId(e.target.value)}
                inputMode="text"
                placeholder="z.B. 29441,29438"
              />
              <span className="text-xs text-slate-500">Durch Komma getrennt. Beispiel: 29441,29438</span>
            </label>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                className={`px-3 py-1 rounded-xl border text-sm transition ${showOnlyNotOccupied ? 'bg-green-700 text-white border-green-700' : 'bg-white hover:bg-slate-50 border-slate-300 text-slate-800'}`}
                onClick={() => setShowOnlyNotOccupied(s => !s)}
              >
                {showOnlyNotOccupied ? 'Alle Slots anzeigen' : 'Nur freie Slots anzeigen'}
              </button>
              <button
                type="button"
                className="px-3 py-1 rounded-xl border text-sm hover:bg-slate-50 border-slate-300 text-slate-800"
                onClick={() => {
                  if ('Notification' in window) {
                    if (Notification.permission === 'granted') {
                      new Notification('Test-Benachrichtigung: Foodsharing Abholungs-Beobachter')
                    } else if (Notification.permission === 'default') {
                      Notification.requestPermission().then(p => {
                        if (p === 'granted') {
                          new Notification('Test-Benachrichtigung: Foodsharing Abholungs-Beobachter')
                        }
                      })
                    }
                  }
                }}
              >
                Push-Benachrichtigung testen
              </button>
            </div>
            <label className="block text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Proxy URL</span>
                {proxyUrl !== defaultProxyUrl && (
                  <button
                    type="button"
                    onClick={() => setProxyUrl(defaultProxyUrl)}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    Reset to default
                  </button>
                )}
              </div>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={proxyUrl}
                onChange={e => setProxyUrl(e.target.value)}
                placeholder={defaultProxyUrl || "Proxy URL from environment"}
              />
              {envProxyUrl && (
                <span className="text-xs text-slate-500 block mt-1">
                  Default from env ({buildMode}): <code className="text-xs">{envProxyUrl}</code>
                  {proxyUrl !== defaultProxyUrl && <span className="ml-2 text-orange-600">(overridden)</span>}
                </span>
              )}
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Zusätzliche Header JSON (optional)</span>
              <textarea
                className="mt-1 w-full rounded-xl border px-3 py-2 font-mono text-xs h-28"
                value={headersInput}
                onChange={e => setHeadersInput(e.target.value)}
                placeholder='{"accept":"application/json"}'
              />
            </label>
            <p className="text-xs text-slate-500">
              Tipp: Wenn Sie einen Proxy verwenden, leiten Sie nur die mindestens erforderlichen Header weiter.
              Vermeiden Sie, Cookies oder Geheimnisse direkt hier einzufügen.
            </p>
            </div>

            <div className="bg-white rounded-2xl shadow p-4 space-y-2">
              <h2 className="font-semibold">Status</h2>
              <div className="text-sm text-slate-700">
                {(import.meta?.env?.DEV || import.meta?.env?.MODE) && (
                  <div className="mb-2 text-xs text-slate-500">
                    Build mode: <span className="font-mono font-semibold">{buildMode}</span>
                    {envProxyUrl && <span className="ml-2">| Env URL: <span className="font-mono">{envProxyUrl}</span></span>}
                  </div>
                )}
                <div>Endpoint:&nbsp;
                  <code className="text-xs break-all">{targetUrl}</code>
                </div>
                {proxyUrl && (
                  <div>Via proxy:&nbsp;
                    <code className="text-xs break-all">{buildFetchUrl()}</code>
                  </div>
                )}
                <div>
                  Last updated: {lastUpdated ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'medium', timeZone: BERLIN_TZ }).format(lastUpdated) : '—'}
                </div>
                <div>Pickups: <span className="font-semibold">{totals.total}</span> ({totals.withFree} with free slots)</div>
                {error && (
                  <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2 text-red-800 text-sm">
                    Error: {error}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right column: Slots */}
          <div className="lg:col-span-2">
            <div className="space-y-4">
              {pickups.length === 0 && !loading && !error && (
                <div className="text-slate-600">No pickups found.</div>
              )}

              {pickups
                .slice()
                .filter(p => !showOnlyNotOccupied || (p.occupiedSlots && p.occupiedSlots.length === 0))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((p, idx) => {
              const { free, occupied } = computeAvailability(p)
              const hasFree = (p.isAvailable ?? false) || free > 0
              const isEmpty = p.occupiedSlots && p.occupiedSlots.length === 0
              const d = new Date(p.date)
              const isMonday = d.getDay() === 1
              const ringClass = isMonday
                ? 'ring-4 ring-orange-600'
                : isEmpty
                ? 'ring-4 ring-red-600'
                : hasFree
                ? 'ring-4 ring-green-500'
                : ''
              const bgClass = isMonday ? 'bg-yellow-50' : 'bg-white'
              return (
                <article
                  key={idx}
                  className={`rounded-2xl border p-4 ${bgClass} shadow ${ringClass}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">{fmtDate(p.date)}</h3>
                      <p className="text-sm text-slate-600">{p.description || 'Abholung'}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${hasFree ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
                      {hasFree ? `Frei: ${free}` : 'Vollständig gebucht'}
                    </div>
                  </div>

                  <div className="mt-3 text-sm text-slate-700">
                    <div>Gesamte Slots: <span className="font-medium">{p.totalSlots}</span></div>
                    <div>Belegt: <span className="font-medium">{occupied}</span></div>
                  </div>

                  {p.occupiedSlots && p.occupiedSlots.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-sm font-semibold mb-2">Teilnehmer</h4>
                      <ul className="space-y-2">
                        {p.occupiedSlots.map((os, i) => (
                          <li key={i} className="flex items-center gap-3">
                            {os.profile?.avatar ? (
                              <img
                                src={`https://foodsharing.de${os.profile.avatar}`}
                                alt={os.profile?.name || 'avatar'}
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-200" />
                            )}
                            <div>
                              <div className="text-sm font-medium">{os.profile?.name || 'Unbekannt'}</div>
                              <div className="text-xs text-slate-500">{os.isConfirmed ? 'bestätigt' : 'ausstehend'}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  </article>
                )
              })}
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 py-8 text-center text-xs text-slate-500">
        Runs hourly (on the hour) and on demand. Times shown in Europe/Berlin.
      </footer>
    </div>
  )
}
