import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownToLine, ArrowUpRight, Boxes, Check, ChevronDown, CircleAlert,
  Clock3, Command, Cpu, Globe2, LoaderCircle, LogIn, LogOut, Package, Play, Plus,
  RefreshCw, Search, ShieldCheck, SlidersHorizontal, Square, Terminal, Wallet
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { createExecutionJob, createInventory, listExecutionJobs, listInventory, updateInventory } from "./lib/api";
import { toCsv } from "./lib/csv";
import type { Currency, ExecutionJob, InventoryItem, Region } from "./lib/types";

const regions: { name: Region; currency: Currency; store: string }[] = [
  { name: "Ghana", currency: "GHS", store: "Accra Central" },
  { name: "Nigeria", currency: "NGN", store: "Lagos Mainland" },
  { name: "Kenya", currency: "KES", store: "Nairobi CBD" },
  { name: "South Africa", currency: "ZAR", store: "Johannesburg" }
];
const platformNames = ["Tonaton", "Jiji", "Jumia", "Konga", "Takealot"];
const demoInventory: InventoryItem[] = [
  { id: "demo-1", title: "Sony WH-1000XM5 Headphones", sku: "AUD-2041", image_url: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=160&q=80", base_price: 2850, currency: "GHS", age_days: 14, status: "active", platforms: ["Jiji", "Tonaton"] },
  { id: "demo-2", title: "Apple MacBook Air M2", sku: "ELC-8820", image_url: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=160&q=80", base_price: 14500, currency: "GHS", age_days: 9, status: "active", platforms: ["Jumia", "Jiji"] },
  { id: "demo-3", title: "Nike Air Max 270", sku: "FAS-1193", image_url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=160&q=80", base_price: 1250, currency: "GHS", age_days: 21, status: "paused", platforms: ["Jiji"] },
  { id: "demo-4", title: "Samsung Galaxy S24 Ultra", sku: "MOB-5508", image_url: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=160&q=80", base_price: 11800, currency: "GHS", age_days: 6, status: "active", platforms: ["Jumia", "Tonaton"] },
  { id: "demo-5", title: "Canon EOS R6 Camera", sku: "CAM-3105", image_url: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=160&q=80", base_price: 18200, currency: "GHS", age_days: 18, status: "draft", platforms: ["Jiji"] }
];

function money(value: number, currency: Currency) {
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}
function dateLabel(date: string) {
  return new Date(date).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function App() {
  const [regionName, setRegionName] = useState<Region>("Ghana");
  const region = regions.find(r => r.name === regionName)!;
  const [inventory, setInventory] = useState<InventoryItem[]>(demoInventory);
  const [jobs, setJobs] = useState<ExecutionJob[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["Tonaton", "Jiji", "Jumia"]);
  const [schedule, setSchedule] = useState("now");
  const [jitter, setJitter] = useState(35);
  const [priceOffset, setPriceOffset] = useState(0);
  const [logs, setLogs] = useState<string[]>([
    "[SYSTEM] Adlister Africa interface initialized.",
    "[SECURITY] Marketplace publishing requires a configured approved adapter.",
    "[READY] Demo inventory shown until backend setup is complete."
  ]);
  const [busy, setBusy] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [notice, setNotice] = useState("Demo mode — connect Supabase for persistent data and authenticated access.");

  const log = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(old => [`[${timestamp}] ${message}`, ...old].slice(0, 80));
  }, []);

  const refreshBackend = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSessionEmail(session?.user.email ?? null);
      if (!session) {
        // Never leave one account's private records visible after sign-out or session expiry.
        setBackendReady(false);
        setInventory(demoInventory);
        setJobs([]);
        setSelected([]);
        setNotice("Demo mode — connect Supabase for persistent data and authenticated access.");
        return;
      }
      const [items, latestJobs] = await Promise.all([listInventory(), listExecutionJobs()]);
      setInventory(items);
      setJobs(latestJobs);
      setBackendReady(true);
      setNotice("Connected — inventory and execution history are loaded from your database.");
    } catch (e) {
      setBackendReady(false);
      // Fail closed: do not leave data from a previous session displayed on a backend error.
      setInventory(demoInventory);
      setJobs([]);
      setSelected([]);
      setNotice(e instanceof Error ? e.message : "Backend connection failed.");
    }
  }, []);

  useEffect(() => {
    void refreshBackend();
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Defer Supabase calls until after the auth callback releases its internal lock.
      window.setTimeout(() => {
        if (!session) {
          setSessionEmail(null);
          setBackendReady(false);
          setInventory(demoInventory);
          setJobs([]);
          setSelected([]);
          setNotice("Demo mode — connect Supabase for persistent data and authenticated access.");
        } else {
          setBackendReady(false);
          setInventory(demoInventory);
          setJobs([]);
          setSelected([]);
          void refreshBackend();
        }
      }, 0);
    });
    return () => subscription.unsubscribe();
  }, [refreshBackend]);

  const visibleInventory = useMemo(() => inventory.filter(item =>
    `${item.title} ${item.sku ?? ""} ${item.platforms.join(" ")}`.toLowerCase().includes(search.toLowerCase())
  ), [inventory, search]);
  const queued = jobs.filter(j => j.status === "queued" || j.status === "running").length;
  const activeCount = inventory.filter(i => i.status === "active").length;
  const selectedItems = inventory.filter(i => selected.includes(i.id));
  const currencyInventory = inventory.filter(i => i.currency === region.currency);
  const averagePrice = currencyInventory.length ? currencyInventory.reduce((sum, i) => sum + i.base_price, 0) / currencyInventory.length : 0;

  async function signIn() {
    if (!supabase) { setNotice("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first."); return; }
    const email = window.prompt("Enter your account email");
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) setNotice(error.message);
    else setNotice("Magic link sent. Open it on this device to sign in.");
  }
  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setNotice(error.message);
    else { setSessionEmail(null); setBackendReady(false); setNotice("Signed out."); }
  }
  function toggleSelected(id: string) {
    setSelected(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  }
  function toggleAll() {
    const visibleIds = visibleInventory.map(i => i.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selected.includes(id));
    setSelected(old => allSelected ? old.filter(id => !visibleIds.includes(id)) : [...new Set([...old, ...visibleIds])]);
  }
  function exportCsv() {
    const rows = inventory.filter(i => selected.length ? selected.includes(i.id) : true);
    const csv = toCsv([["id","title","sku","base_price","currency","age_days","status","platforms"],
      ...rows.map(i => [i.id,i.title,i.sku ?? "",i.base_price,i.currency,i.age_days,i.status,i.platforms.join(";")])]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "adlister-inventory.csv"; a.click(); URL.revokeObjectURL(url);
    log(`Exported ${rows.length} inventory records to CSV.`);
  }
  async function addItem() {
    const price = Number(newPrice);
    if (!newTitle.trim() || !Number.isFinite(price) || price < 0) { setNotice("Enter a product title and a valid non-negative price."); return; }
    if (!backendReady) { setNotice("Sign in and connect the database to save inventory. Demo mode does not persist changes."); return; }
    try {
      const item = await createInventory({ title: newTitle.trim(), base_price: price, currency: region.currency, age_days: 0, status: "draft", platforms: [] });
      setInventory(old => [item, ...old]); setNewTitle(""); setNewPrice(""); setShowAdd(false); setNotice("Inventory item saved.");
      log(`Persisted inventory item ${item.id}.`);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not save item."); }
  }
  async function runExecution() {
    if (!selectedItems.length) { setNotice("Select at least one inventory item."); return; }
    if (!platforms.length) { setNotice("Select at least one target platform."); return; }
    if (schedule !== "now") { setNotice("Scheduled execution is not enabled in this starter. Jobs can be queued for immediate processing only."); return; }
    if (!backendReady) { setNotice("Execution is disabled in demo mode. Connect Supabase and sign in first."); log("[BLOCKED] No backend session; no marketplace action was attempted."); return; }
    if (selectedItems.some(i => !/^[0-9a-f-]{36}$/i.test(i.id))) { setNotice("Demo records cannot be executed. Import or create persistent inventory first."); return; }
    setBusy(true);
    try {
      const job = await createExecutionJob(selected, platforms, priceOffset);
      setJobs(old => [job, ...old]); log(`[JOB CREATED] ${job.id} — status ${job.status}. No listing has been published yet.`);
      setNotice(`Job ${job.id} created. Marketplace execution will only proceed when an approved adapter is configured.`);
      await refreshBackend();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Execution job could not be created.";
      setNotice(message); log(`[ERROR] ${message}`);
    } finally { setBusy(false); }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Command size={21}/></div><div><div className="brand-name">ADLISTER<span>AFRICA</span></div><div className="brand-sub">LISTING OPERATIONS</div></div></div>
      <div className="workspace"><span className="workspace-dot"/><div><b>Operations Workspace</b><small>{region.store}</small></div><ChevronDown size={15}/></div>
      <div className="nav-label">WORKSPACE</div>
      <nav><a className="nav-item active"><Boxes size={17}/> Overview <span className="nav-active-dot"/></a><a className="nav-item" href="#inventory"><Package size={17}/> Inventory</a><a className="nav-item" href="#execution"><Activity size={17}/> Execution jobs</a><a className="nav-item" href="#analytics"><Wallet size={17}/> Analytics</a></nav>
      <div className="nav-label">CONFIGURATION</div>
      <nav><a className="nav-item" href="#settings"><SlidersHorizontal size={17}/> Posting rules</a><a className="nav-item" href="#integrations"><Globe2 size={17}/> Integrations</a></nav>
      <div className="sidebar-bottom"><div className="secure-card"><ShieldCheck size={17}/><b>Compliance-first engine</b><p>Publishing is only reported after an approved marketplace confirms it.</p></div><div className="account-row"><div className="avatar">{sessionEmail ? sessionEmail.slice(0,1).toUpperCase() : "A"}</div><div className="account-copy"><b>{sessionEmail ?? "Local preview"}</b><small>{backendReady ? "Authenticated" : "Not connected"}</small></div>{sessionEmail ? <button className="icon-btn" title="Sign out" onClick={signOut}><LogOut size={16}/></button> : <button className="icon-btn" title="Sign in" onClick={signIn}><LogIn size={16}/></button>}</div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>Overview</b></div><div className="top-actions"><div className="connection-pill"><span className={backendReady ? "live-dot" : "muted-dot"}/>{backendReady ? "BACKEND CONNECTED" : "PREVIEW MODE"}</div><select value={regionName} onChange={e => setRegionName(e.target.value as Region)} aria-label="Market region">{regions.map(r => <option key={r.name} value={r.name}>{r.name} · {r.currency}</option>)}</select><button className="button secondary small" onClick={exportCsv}><ArrowDownToLine size={15}/> Export CSV</button><button className="icon-btn" onClick={() => void refreshBackend()} title="Refresh data"><RefreshCw size={16}/></button></div></header>
      <div className="content">
        <section className="hero"><div><div className="eyebrow"><span className="eyebrow-line"/> MULTI-STORE LISTING INTELLIGENCE</div><h1>Listing operations,<br/><span>under your control.</span></h1><p>One operational view for your catalog, store workflows and marketplace activity across Africa.</p><div className="hero-tags"><span><ShieldCheck size={14}/> Authorized workflows</span><span><Activity size={14}/> Auditable jobs</span><span><Globe2 size={14}/> Multi-market ready</span></div></div><div className="hero-orbit"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit-core"><Cpu size={35}/></div><div className="orbit-node node-one"/><div className="orbit-node node-two"/><div className="orbit-node node-three"/></div><div className="hero-index">SYS / 01<br/><span>CONTROL PLANE</span></div></section>
        <div className={`notice ${backendReady ? "notice-good" : "notice-warn"}`}><CircleAlert size={17}/><span>{notice}</span>{!sessionEmail && <button onClick={signIn} className="notice-action">Connect account <ArrowUpRight size={14}/></button>}</div>
        <section className="metric-grid">
          <Metric icon={<Boxes size={18}/>} label="CATALOG ITEMS" value={backendReady ? inventory.length.toLocaleString() : "—"} sub={backendReady ? "Persisted records" : "Connect backend"} tone="cyan"/>
          <Metric icon={<Clock3 size={18}/>} label="ACTIVE JOBS" value={String(queued)} sub="Queued or running" tone="purple"/>
          <Metric icon={<ArrowUpRight size={18}/>} label="ACTIVE LISTINGS" value={backendReady ? activeCount.toLocaleString() : "—"} sub="Database status only" tone="green"/>
          <Metric icon={<Activity size={18}/>} label="ENGINE HEALTH" value={backendReady ? "Connected" : "Preview"} sub="No fabricated telemetry" tone="orange"/>
        </section>
        <div className="section-heading" id="inventory"><div><div className="eyebrow">01 / CATALOG</div><h2>Inventory management</h2><p>Review, select and prepare products for an authorized marketplace workflow.</p></div><button className="button primary" onClick={() => setShowAdd(v => !v)}><Plus size={16}/> Add inventory</button></div>
        {showAdd && <div className="add-form"><label>Product title<input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Wireless headphones"/></label><label>Price ({region.currency})<input type="number" min="0" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="0.00"/></label><button className="button primary" onClick={() => void addItem()}><Check size={15}/> Save item</button></div>}
        <section className="panel inventory-panel"><div className="panel-toolbar"><div className="searchbox"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products, SKU or platform..."/></div><div className="toolbar-right"><span className="selected-count">{selected.length} selected</span><button className="button secondary small" onClick={toggleAll}>{visibleInventory.length > 0 && visibleInventory.every(i => selected.includes(i.id)) ? "Deselect visible" : "Select visible"}</button></div></div>
          <div className="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select all visible inventory" checked={visibleInventory.length > 0 && visibleInventory.every(i => selected.includes(i.id))} onChange={toggleAll}/></th><th>PRODUCT</th><th>BASE PRICE</th><th>AGE</th><th>CHANNELS</th><th>STATUS</th><th></th></tr></thead><tbody>{visibleInventory.map(item => <tr key={item.id}><td><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelected(item.id)} aria-label={`Select ${item.title}`}/></td><td><div className="product-cell">{item.image_url ? <img src={item.image_url} alt="" loading="lazy" onError={e => { e.currentTarget.style.visibility = "hidden"; }}/> : <div className="product-placeholder"><Package size={17}/></div>}<div><b>{item.title}</b><small>{item.sku ?? item.id.slice(0,8)}</small></div></div></td><td className="price">{money(item.base_price, item.currency)}</td><td><span className={item.age_days > 14 ? "age old" : "age"}>{item.age_days} days</span></td><td><div className="channel-tags">{item.platforms.length ? item.platforms.map(p => <span key={p}>{p}</span>) : <span className="muted">Not assigned</span>}</div></td><td><Status status={item.status}/></td><td><button className="icon-btn" title="Toggle draft/active" onClick={() => { if (!backendReady) { setNotice("Sign in to persist inventory changes."); return; } void updateInventory(item.id, { status: item.status === "active" ? "paused" : "active" }).then(updated => setInventory(old => old.map(i => i.id === updated.id ? updated : i))).catch(e => setNotice(e.message)); }}><ChevronDown size={15}/></button></td></tr>)}</tbody></table></div>
          {!visibleInventory.length && <div className="empty-state">No inventory matches this search.</div>}
          <div className="table-footer"><span>Showing {visibleInventory.length} of {inventory.length} records</span><span><span className="live-dot"/> Database records only appear after authentication</span></div>
        </section>
        <div className="two-col">
          <section className="panel" id="settings"><div className="panel-title"><div><div className="eyebrow">02 / EXECUTION CONFIG</div><h3>Posting rules</h3></div><SlidersHorizontal size={18}/></div><p className="panel-desc">Set the intended operation. Settings are sent with a job request; they do not bypass marketplace policies.</p>
            <div className="form-label">TARGET MARKETPLACES <span>Select enabled channels</span></div><div className="platform-grid">{platformNames.map((p, i) => <label className="platform-option" key={p}><input type="checkbox" checked={platforms.includes(p)} onChange={e => setPlatforms(old => e.target.checked ? [...old,p] : old.filter(x => x !== p))}/><span className={`platform-icon p${i}`}>{p.slice(0,1)}</span><span>{p}</span>{p === "Tonaton" || p === "Jiji" ? <span className="platform-status">Adapter needed</span> : <span className="platform-status unavailable">Unconfigured</span>}</label>)}</div>
            <div className="setting-row"><div><b>Execution schedule</b><small>Only immediate queueing is enabled in this release</small></div><select value={schedule} onChange={e => setSchedule(e.target.value)}><option value="now">Queue now</option><option value="later">Scheduled — not enabled</option></select></div>
            <div className="setting-row"><div><b>Request pacing</b><small>Reserved for adapter rate-limit policy</small></div><div className="range-control"><input type="range" min="0" max="100" value={jitter} onChange={e => setJitter(Number(e.target.value))}/><span>{jitter}%</span></div></div>
            <div className="setting-row"><div><b>Price adjustment</b><small>Applied as a proposed percentage; marketplace support varies</small></div><div className="range-control"><input type="range" min="-20" max="30" value={priceOffset} onChange={e => setPriceOffset(Number(e.target.value))}/><span>{priceOffset > 0 ? "+" : ""}{priceOffset}%</span></div></div>
            <div className="compliance-note"><ShieldCheck size={17}/><span>Human-emulation, proxy rotation, EXIF manipulation and anti-detection features are intentionally excluded. Adapter behavior must follow official marketplace policies and rate limits.</span></div>
            <button className="button primary execute-btn" disabled={busy} onClick={() => void runExecution()}>{busy ? <LoaderCircle className="spin" size={17}/> : <Play size={16}/>} Create execution job <span>{selected.length} selected</span></button>
          </section>
          <section className="panel" id="execution"><div className="panel-title"><div><div className="eyebrow">03 / JOB MONITOR</div><h3>Execution console</h3></div><div className="console-live"><span className="muted-dot"/> {backendReady ? "CONNECTED" : "PREVIEW"}</div></div><div className="terminal"><div className="terminal-head"><span><span className="terminal-dot red"/><span className="terminal-dot yellow"/><span className="terminal-dot green"/></span><span>adlister-runtime / audit stream</span><Terminal size={14}/></div><div className="terminal-body">{logs.map((line,i) => <div className={`log-line ${line.includes("ERROR") || line.includes("BLOCKED") ? "log-error" : line.includes("JOB") ? "log-job" : ""}`} key={`${line}-${i}`}><span className="log-caret">›</span>{line}</div>)}</div><div className="terminal-foot"><span><span className="live-dot"/> Listening for job events</span><button onClick={() => setLogs([])}>Clear log</button></div></div><div className="job-list-head"><b>RECENT JOBS</b><span>{jobs.length} recorded</span></div>{jobs.slice(0,4).map(job => <div className="job-row" key={job.id}><div className="job-icon"><Activity size={15}/></div><div className="job-copy"><b>{job.id.slice(0,8)}…</b><small>{dateLabel(job.created_at)} · {job.message}</small></div><Status status={job.status}/></div>)}{!jobs.length && <div className="empty-jobs"><Square size={19}/><b>No execution jobs yet</b><span>Create a job to record an authorized operation request. No marketplace changes are implied.</span></div>}</section>
        </div>
        <section className="section-heading analytics-heading" id="analytics"><div><div className="eyebrow">04 / BUSINESS INTELLIGENCE</div><h2>Catalog analytics</h2><p>Calculated from records currently available in this session.</p></div></section>
        <div className="analytics-grid"><section className="panel roi-panel"><div className="panel-title"><div><div className="eyebrow">INVENTORY SNAPSHOT</div><h3>Catalog value</h3></div><Wallet size={18}/></div><div className="roi-value">{money(currencyInventory.reduce((s,i) => s+i.base_price,0), region.currency)}</div><div className="roi-caption">Sum of listed base prices in {region.currency} · not sales revenue</div><div className="roi-stats"><div><span>Average price</span><b>{money(averagePrice, region.currency)}</b></div><div><span>Active records</span><b>{currencyInventory.filter(i => i.status === "active").length}</b></div><div><span>Older than 14 days</span><b>{currencyInventory.filter(i => i.age_days > 14).length}</b></div></div></section><section className="panel channel-panel" id="integrations"><div className="panel-title"><div><div className="eyebrow">CONNECTIVITY</div><h3>Marketplace adapters</h3></div><Globe2 size={18}/></div><div className="adapter-row"><div className="adapter-logo">T</div><div><b>Tonaton</b><small>Credential & approved API review required</small></div><Status status="unconfigured"/></div><div className="adapter-row"><div className="adapter-logo">J</div><div><b>Jiji</b><small>Credential & approved API review required</small></div><Status status="unconfigured"/></div><div className="adapter-row"><div className="adapter-logo">M</div><div><b>Jumia / Konga / Takealot</b><small>Separate partner access and adapter review</small></div><Status status="unconfigured"/></div><div className="adapter-footer"><ShieldCheck size={15}/> No adapter is assumed available until verified.</div></section></div>
        <footer className="footer"><div className="brand-mini"><Command size={15}/> ADLISTER AFRICA</div><span>Designed for accountable listing operations across African markets.</span><span>v1.0.0 · <span className="footer-status"/>{backendReady ? "Connected" : "Preview mode"}</span></footer>
      </div>
    </main>
  </div>;
}

function Metric({icon,label,value,sub,tone}:{icon:React.ReactNode;label:string;value:string;sub:string;tone:string}) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div><div className={`metric-spark ${tone}`}><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div></div>;
}
function Status({status}:{status:string}) {
  const map:Record<string,string> = { active:"Active", draft:"Draft", paused:"Paused", archived:"Archived", queued:"Queued", running:"Running", succeeded:"Succeeded", partial:"Partial", failed:"Failed", cancelled:"Cancelled", unconfigured:"Unconfigured" };
  return <span className={`status status-${status}`}>{status === "active" || status === "succeeded" ? <Check size={11}/> : status === "running" ? <LoaderCircle size={11}/> : <span className="status-dot"/>}{map[status] ?? status}</span>;
}
export default App;
