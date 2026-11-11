import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Disc3,
  ExternalLink,
  Globe2,
  LayoutDashboard,
  ListMusic,
  LoaderCircle,
  Menu,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Upload,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import type {
  Catalog,
  Chart,
  CoachResponse,
  PracticePlan,
  Score,
  Settings,
} from "../shared/types";
import { DEFAULT_SETTINGS } from "../shared/types";
import { best50, rank, rating } from "../shared/rating";
import { createPlan } from "../shared/planner";
import { scoreSchema, settingsSchema } from "../shared/validation";
import {
  downloadJson,
  importScores,
  makeDemo,
  readScores,
  saveScores,
} from "./storage";

type View = "overview" | "planner" | "library" | "scores" | "about";
const names: Record<View, string> = {
  overview: "Overview",
  planner: "Session planner",
  library: "Song library",
  scores: "My scores",
  about: "Behind the coach",
};
const diffName: Record<string, string> = {
  basic: "BASIC",
  advanced: "ADVANCED",
  expert: "EXPERT",
  master: "MASTER",
  remaster: "Re:MASTER",
};
const fmt = (n: number) => n.toLocaleString("en-US");
function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`logo ${small ? "small" : ""}`}>
      <Disc3 strokeWidth={1.7} />
      {!small && (
        <span>
          mai<span>coach</span>
          <i />
        </span>
      )}
    </div>
  );
}
function Badge({ chart }: { chart: Chart }) {
  return (
    <span className={`badge ${chart.difficulty}`}>
      {diffName[chart.difficulty]}
    </span>
  );
}
function Cover({ chart, small = false }: { chart: Chart; small?: boolean }) {
  return (
    <div
      className={`cover ${chart.difficulty} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      <span>{chart.type.toUpperCase()}</span>
      <AudioLines />
      <i>{chart.constant.toFixed(1)}</i>
    </div>
  );
}
async function request<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const value = await res.json();
  if (!res.ok) throw new Error(value.error || "Request failed. Try again.");
  return value;
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState("");
  const [aiConfigured, setAiConfigured] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [mobile, setMobile] = useState(false);
  const [userScores, setUserScores] = useState<Score[]>([]);
  const [demo, setDemo] = useState(true);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [plan, setPlan] = useState<PracticePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<CoachResponse | null>(null);
  const [coaching, setCoaching] = useState(false);
  const [question, setQuestion] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const [chartType, setChartType] = useState("all");
  const [level, setLevel] = useState("all");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Chart | null>(null);
  const [achievement, setAchievement] = useState("");
  const [combo, setCombo] = useState<Score["combo"]>("none");
  const [formError, setFormError] = useState("");
  const [resetting, setResetting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    request<Catalog>("/api/catalog")
      .then((data) => {
        setCatalog(data);
        try {
          const stored = readScores();
          // An updated catalog can retire a chart. Keep it in the stored export, but exclude it from calculations.
          setUserScores(stored);
          setDemo(localStorage.getItem("maicoach.profile") !== "own");
        } catch {
          setToast(
            "Saved scores could not be read. Import a valid backup to recover them.",
          );
        }
      })
      .catch(() =>
        setLoadError(
          "The international catalog could not be loaded. Please reload to try again.",
        ),
      );
    request<{ aiConfigured: boolean }>("/api/health")
      .then((v) => setAiConfigured(v.aiConfigured))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setPage(0);
  }, [search, difficulty, chartType, level]);
  useEffect(() => {
    if (editing && !modalRef.current?.open) modalRef.current?.showModal();
  }, [editing]);

  const demoScores = useMemo(
    () => (catalog ? makeDemo(catalog) : []),
    [catalog],
  );
  const chartMap = useMemo(
    () => new Map(catalog?.charts.map((c) => [c.id, c]) ?? []),
    [catalog],
  );
  const activeScores = useMemo(
    () =>
      (demo ? demoScores : userScores).filter((s) => chartMap.has(s.chartId)),
    [demo, demoScores, userScores, chartMap],
  );
  const scoreMap = useMemo(
    () => new Map(activeScores.map((s) => [s.chartId, s])),
    [activeScores],
  );
  const stats = useMemo(
    () => best50(catalog?.charts ?? [], activeScores),
    [catalog, activeScores],
  );
  const preview = useMemo(
    () =>
      catalog
        ? createPlan(catalog.charts, activeScores, DEFAULT_SETTINGS)
        : null,
    [catalog, activeScores],
  );
  const displayedPlan = plan ?? preview;
  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return (catalog?.charts ?? [])
      .filter(
        (c) =>
          (!q ||
            `${c.title} ${c.artist} ${c.id}`.toLocaleLowerCase().includes(q)) &&
          (difficulty === "all" || c.difficulty === difficulty) &&
          (chartType === "all" || c.type === chartType) &&
          (level === "all" || Math.floor(c.constant) === Number(level)),
      )
      .sort(
        (a, b) => b.constant - a.constant || a.title.localeCompare(b.title),
      );
  }, [catalog, search, difficulty, chartType, level]);

  function navigate(next: View) {
    setView(next);
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function switchProfile() {
    const next = !demo;
    setDemo(next);
    localStorage.setItem("maicoach.profile", next ? "demo" : "own");
    setPlan(null);
    setAdvice(null);
  }
  function commitScores(next: Score[]) {
    try {
      saveScores(next);
      localStorage.setItem("maicoach.profile", "own");
    } catch {
      throw new Error(
        "Browser storage is full or unavailable. Export your scores before closing this tab.",
      );
    }
    setUserScores(next);
    setDemo(false);
    setPlan(null);
    setAdvice(null);
  }
  function openScore(chart: Chart) {
    setEditing(chart);
    const current = scoreMap.get(chart.id);
    setAchievement(current?.achievement.toFixed(4) ?? "");
    setCombo(current?.combo ?? "none");
    setFormError("");
  }
  function closeScore() {
    modalRef.current?.close();
    setEditing(null);
  }
  function logScore(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const parsed = scoreSchema.safeParse({
      chartId: editing.id,
      achievement: achievement.trim() === "" ? NaN : Number(achievement),
      combo,
    });
    if (!parsed.success) {
      setFormError(
        "Enter an achievement from 0 to 101%, with up to four decimal places.",
      );
      return;
    }
    const existing = userScores.find((s) => s.chartId === editing.id);
    if (
      existing &&
      (rating(editing.constant, existing.achievement, existing.combo) >
        rating(editing.constant, parsed.data.achievement, parsed.data.combo) ||
        (rating(editing.constant, existing.achievement, existing.combo) ===
          rating(
            editing.constant,
            parsed.data.achievement,
            parsed.data.combo,
          ) &&
          existing.achievement > parsed.data.achievement))
    ) {
      setFormError(
        "Your saved result is better. Remove it first if you want to correct it.",
      );
      return;
    }
    try {
      commitScores([
        ...userScores.filter((s) => s.chartId !== editing.id),
        parsed.data,
      ]);
      closeScore();
      setToast(
        demo
          ? "Saved to your profile. Sample scores were excluded."
          : "Personal best saved. Your next plan will use it.",
      );
    } catch (err) {
      setFormError((err as Error).message);
    }
  }
  async function importFile(file?: File) {
    if (!file || !catalog) return;
    try {
      if (file.size > 2000000)
        throw new Error("Choose a JSON file smaller than 2 MB.");
      const incoming = importScores(JSON.parse(await file.text()), catalog);
      const merged = importScores([...userScores, ...incoming], catalog);
      commitScores(merged);
      setToast(
        `Imported ${incoming.length} scores. Your best results were kept.`,
      );
    } catch (err) {
      setToast(
        err instanceof SyntaxError
          ? "That file is not valid JSON. Nothing was imported."
          : (err as Error).message.slice(0, 220),
      );
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  async function generate() {
    const valid = settingsSchema.safeParse(settings);
    if (!valid.success) {
      setToast(
        "Check your credits and level range. Minimum level must not exceed maximum.",
      );
      return;
    }
    setBusy(true);
    setAdvice(null);
    try {
      setPlan(
        await request<PracticePlan>("/api/plan", {
          scores: activeScores,
          settings,
        }),
      );
      setToast("Session ready. Make every credit count.");
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function askCoach(event?: React.FormEvent) {
    event?.preventDefault();
    if (!displayedPlan) return;
    setCoaching(true);
    try {
      setAdvice(
        await request<CoachResponse>("/api/coach", {
          scores: activeScores,
          settings: displayedPlan.settings,
          question: question.trim() || "Explain how to approach this session.",
        }),
      );
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setCoaching(false);
    }
  }
  const isStale =
    displayedPlan &&
    JSON.stringify(settings) !== JSON.stringify(displayedPlan.settings);

  if (!catalog)
    return (
      <div className="loading-screen">
        <Logo />
        <div>
          {loadError ? (
            <>
              <p role="alert">{loadError}</p>
              <button
                className="button primary"
                onClick={() => location.reload()}
              >
                Try again
              </button>
            </>
          ) : (
            <>
              <LoaderCircle className="spin" />
              <p>Finding your next personal best…</p>
            </>
          )}
        </div>
      </div>
    );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          aria-label="MaiCoach overview"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <Logo />
          <span className="brand-caption">MAKE EVERY CREDIT COUNT</span>
        </a>
        <p className="nav-label">YOUR PLAYSPACE</p>
        <nav aria-label="Main navigation">
          {(
            [
              ["overview", LayoutDashboard],
              ["planner", WandSparkles],
              ["library", ListMusic],
              ["scores", Target],
            ] as const
          ).map(([id, Icon]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => navigate(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{names[id]}</span>
              {id === "planner" && <span className="tiny-new">NEW</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="side-note">
            <div className="side-orbit">
              <Disc3 />
            </div>
            <h3>A little more intentional.</h3>
            <p>Your next great session starts with a plan.</p>
            <button onClick={() => navigate("planner")}>
              Build my session <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className={`nav-item ${view === "about" ? "active" : ""}`}
            onClick={() => navigate("about")}
          >
            <CircleHelp size={18} />
            Behind the coach
          </button>
          <a
            className="github-link"
            href="https://github.com/hpacleb/maicoach"
            target="_blank"
            rel="noreferrer"
          >
            Built by Harvey Pacleb <ArrowUpRight size={13} />
          </a>
          <div className="sidebar-profile">
            <div className="avatar">{demo ? "D" : "P"}</div>
            <div>
              <strong>{demo ? "Demo player" : "Your profile"}</strong>
              <span>
                {demo ? "Try it. Make it yours." : "Saved on this browser"}
              </span>
            </div>
            <button
              aria-label={demo ? "Use my profile" : "Use demo profile"}
              onClick={switchProfile}
            >
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-toggle icon-button"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span>MY PLAYSPACE</span>
            <span className="slash">/</span>
            <strong>{names[view]}</strong>
          </div>
          <div className="topbar-right">
            <span className="region">
              <Globe2 size={14} /> INTERNATIONAL <i />
            </span>
            <button
              className="profile-dot"
              aria-label="Switch profile"
              onClick={switchProfile}
            >
              {demo ? "D" : "P"}
            </button>
          </div>
        </header>
        <main>
          <div className="demo-banner">
            <span>
              <i className={demo ? "" : "own"} />
              <strong>
                {demo
                  ? "You’re exploring a demo profile."
                  : "Your personal playspace."}
              </strong>{" "}
              {demo
                ? "Real charts. Sample scores. Zero setup."
                : "Scores stay in this browser. Export a backup anytime."}
            </span>
            <button onClick={switchProfile}>
              {demo ? "Start my profile" : "Explore demo"}
              <ArrowRight size={14} />
            </button>
          </div>

          {view === "overview" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span /> YOUR NEXT PERSONAL BEST STARTS HERE
                  </div>
                  <h1>
                    Less grinding.
                    <br />
                    <span>More progress.</span>
                  </h1>
                  <p>
                    A smarter plan for your next arcade visit.
                    <br />
                    Find your targets, build your session, and play with
                    purpose.
                  </p>
                  <div className="hero-actions">
                    <button
                      className="button primary"
                      onClick={() => navigate("planner")}
                    >
                      <WandSparkles size={17} />
                      Plan my session
                      <ArrowRight size={17} />
                    </button>
                    <button
                      className="text-button"
                      onClick={() => navigate("library")}
                    >
                      Explore charts
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="hero-foot">
                    <ShieldCheck size={14} />
                    International charts. Transparent targets. Your pace.
                  </div>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orbit orbit-three" />
                  <span className="orbit-dot dot-one" />
                  <span className="orbit-dot dot-two" />
                  <span className="orbit-cross">+</span>
                  <div className="machine-ring">
                    <div className="machine-screen">
                      <span>THE NEXT ONE IS YOURS</span>
                      <Disc3 />
                      <strong>LET’S PLAY.</strong>
                      <small>READY WHEN YOU ARE</small>
                    </div>
                    {Array.from({ length: 8 }, (_, i) => (
                      <i
                        className="ring-button"
                        key={i}
                        style={{
                          transform: `rotate(${i * 45}deg) translateY(-131px)`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="floating-tag tag-top">
                    <span className="lime-square">
                      <Target size={16} />
                    </span>
                    <div>
                      <small>ONE SESSION AT A TIME</small>
                      <strong>Small steps. Better scores.</strong>
                    </div>
                  </div>
                  <div className="floating-tag tag-bottom">
                    <span className="mini-bars">▂▅▃▇▅</span>
                    <div>
                      <small>YOUR NEW HIGH SCORE</small>
                      <strong>
                        Within reach <Sparkles size={13} />
                      </strong>
                    </div>
                  </div>
                </div>
              </section>
              <section className="stat-grid" aria-label="Profile statistics">
                <Stat
                  label={demo ? "DEMO B50 RATING" : "RECORDED B50 TOTAL"}
                  value={fmt(stats.total)}
                  icon={<Target size={18} />}
                  detail={`${stats.count}/50 entries · ${stats.count < 50 ? "partial profile" : "from saved scores"}`}
                  accent
                />
                <Stat
                  label="CHARTS RECORDED"
                  value={fmt(activeScores.length)}
                  icon={<ListMusic size={18} />}
                  detail={`${activeScores.filter((s) => s.achievement >= 100).length} at SSS or above`}
                />
                <Stat
                  label="INTERNATIONAL LIBRARY"
                  value={fmt(catalog.charts.length)}
                  icon={<Globe2 size={18} />}
                  detail={`${fmt(catalog.songCount)} songs · ${catalog.currentVersion}`}
                />
                <Stat
                  label="YOUR NEXT SESSION"
                  value={`${DEFAULT_SETTINGS.credits} credits`}
                  icon={<Zap size={18} />}
                  detail={`${preview?.slots.length ?? 0} tracks · a plan to get you started`}
                />
              </section>
              <div className="dashboard-columns">
                <section>
                  <div className="section-heading">
                    <div>
                      <div className="eyebrow muted">PICK YOUR NEXT WIN</div>
                      <h2>
                        Within striking distance
                        <span className="heading-dot">.</span>
                      </h2>
                      <p>
                        Achievement milestones worth a little focused practice.
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("planner")}
                    >
                      Full session
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="target-list">
                    {preview?.slots
                      .filter((s) => s.phase === "push")
                      .slice(0, 3)
                      .map((slot) => (
                        <div className="target-row" key={slot.chart.id}>
                          <Cover chart={slot.chart} small />
                          <div className="target-song">
                            <h3>{slot.chart.title}</h3>
                            <div>
                              <Badge chart={slot.chart} />
                              <span>
                                {slot.chart.type.toUpperCase()} ·{" "}
                                {slot.chart.constant.toFixed(1)}
                              </span>
                            </div>
                          </div>
                          <div className="target-score">
                            <strong>
                              {slot.current === null
                                ? "Unplayed"
                                : `${slot.current.toFixed(4)}%`}
                            </strong>
                            <span>Target {slot.target.toFixed(1)}%</span>
                          </div>
                          <span className="gain">
                            +{slot.gain}
                            <small>potential</small>
                          </span>
                          <button
                            className="icon-button"
                            aria-label={`Log score for ${slot.chart.title}`}
                            onClick={() => openScore(slot.chart)}
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                      ))}
                  </div>
                  <p className="subtle-footnote">
                    Potential gains assume the target is achieved, using your
                    recorded B50.
                  </p>
                </section>
                <section className="coach-card">
                  <div className="coach-card-heading">
                    <span className="spark-icon">
                      <Sparkles size={18} />
                    </span>
                    <span>Meet your practice companion</span>
                    <span className="label-pill">COACH</span>
                  </div>
                  <h2>
                    A plan that knows
                    <br />
                    where you’re starting.
                  </h2>
                  <p>
                    Turn your scores into a session with warmups, focused
                    targets, and something new.
                  </p>
                  <div className="coach-step">
                    <i>01</i>
                    <span>Bring your scores</span>
                    <Check size={14} />
                  </div>
                  <div className="coach-step">
                    <i>02</i>
                    <span>Choose your focus</span>
                    <SlidersHorizontal size={14} />
                  </div>
                  <div className="coach-step">
                    <i>03</i>
                    <span>Make those credits count</span>
                    <Zap size={14} />
                  </div>
                  <button
                    className="button subtle"
                    onClick={() => navigate("planner")}
                  >
                    Let’s build a session
                    <ArrowRight size={15} />
                  </button>
                  <div className="mode-note">
                    <i />
                    {aiConfigured
                      ? "Live AI coaching available"
                      : "Exercise-library guidance · AI optional"}
                  </div>
                </section>
              </div>
              <section className="bottom-strip">
                <div>
                  <AudioLines size={22} />
                  <span>
                    Great sessions aren’t always about the hardest chart.
                  </span>
                </div>
                <button
                  className="text-button"
                  onClick={() => navigate("about")}
                >
                  How MaiCoach works
                  <ArrowUpRight size={14} />
                </button>
              </section>
            </>
          )}

          {view === "planner" && (
            <>
              <PageHeading
                eyebrow="A LITTLE INTENTION GOES A LONG WAY"
                title="Your next session, sorted."
                description="Set your budget and focus. We’ll find the charts; you bring the energy."
              />
              <div className="planner-layout">
                <section className="panel settings-panel">
                  <div className="panel-heading">
                    <SlidersHorizontal size={18} />
                    <h2>Make it your session</h2>
                  </div>
                  <div className="field-label">
                    Credit budget<span>3 tracks per credit</span>
                  </div>
                  <div className="credit-picker">
                    <button
                      aria-label="Fewer credits"
                      disabled={settings.credits <= 1}
                      onClick={() =>
                        setSettings((s) => ({ ...s, credits: s.credits - 1 }))
                      }
                    >
                      −
                    </button>
                    <span>
                      <strong>{settings.credits}</strong> credits
                    </span>
                    <button
                      aria-label="More credits"
                      disabled={settings.credits >= 12}
                      onClick={() =>
                        setSettings((s) => ({ ...s, credits: s.credits + 1 }))
                      }
                    >
                      +
                    </button>
                  </div>
                  <label className="field-label" htmlFor="goal">
                    Today’s goal
                  </label>
                  <select
                    id="goal"
                    value={settings.goal}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        goal: e.target.value as Settings["goal"],
                      }))
                    }
                  >
                    <option value="rating">Find rating opportunities</option>
                    <option value="consistency">Build consistency</option>
                    <option value="discovery">Discover new charts</option>
                  </select>
                  <label className="field-label" htmlFor="focus">
                    Practice focus
                  </label>
                  <select
                    id="focus"
                    value={settings.focus}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        focus: e.target.value as Settings["focus"],
                      }))
                    }
                  >
                    <option value="balanced">A little of everything</option>
                    <option value="slides">Slide timing</option>
                    <option value="breaks">Break accuracy</option>
                    <option value="timing">FAST / LATE awareness</option>
                  </select>
                  <label className="field-label">Chart constant range</label>
                  <div className="range-inputs">
                    <label>
                      <span>FROM</span>
                      <input
                        aria-label="Minimum chart constant"
                        type="number"
                        min="1"
                        max="15"
                        step="0.1"
                        value={settings.minLevel}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            minLevel: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                    <span>—</span>
                    <label>
                      <span>TO</span>
                      <input
                        aria-label="Maximum chart constant"
                        type="number"
                        min="1"
                        max="15"
                        step="0.1"
                        value={settings.maxLevel}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            maxLevel: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  </div>
                  <p className="settings-help">
                    Choose a range you’re comfortable playing. Focus is
                    self-selected; scores don’t diagnose technique.
                  </p>
                  <button
                    className="button primary full"
                    disabled={busy}
                    onClick={generate}
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <WandSparkles size={17} />
                    )}
                    Build my session
                    <ArrowRight size={16} />
                  </button>
                  {isStale && (
                    <p className="inline-warning">
                      Settings changed. Rebuild to apply them.
                    </p>
                  )}
                  <div className="data-stamp">
                    <Globe2 size={15} />
                    <div>
                      International only
                      <span>{catalog.currentVersion} · DXRating data</span>
                    </div>
                  </div>
                </section>
                <section className="plan-area">
                  <div className="section-heading">
                    <div>
                      <div className="eyebrow muted">
                        YOUR PLAYLIST WITH A PURPOSE
                      </div>
                      <h2>
                        {displayedPlan?.slots.length ?? 0} tracks. Let’s make
                        them count.
                      </h2>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Download session plan"
                      onClick={() =>
                        downloadJson("maicoach-session.json", {
                          region: "intl",
                          version: catalog.currentVersion,
                          demo,
                          plan: displayedPlan,
                        })
                      }
                    >
                      <ArrowDownToLine size={18} />
                    </button>
                  </div>
                  {displayedPlan && (
                    <>
                      <div className="plan-summary">
                        <div>
                          <span>RECORDED B50</span>
                          <strong>{fmt(displayedPlan.totalBefore)}</strong>
                        </div>
                        <ArrowRight size={18} />
                        <div>
                          <span>IF EVERY TARGET LANDS</span>
                          <strong>
                            {fmt(displayedPlan.totalAfter)}
                            <small>
                              +
                              {displayedPlan.totalAfter -
                                displayedPlan.totalBefore}
                            </small>
                          </strong>
                        </div>
                        <span className="label-pill">
                          {displayedPlan.recordedCount < 50
                            ? "PARTIAL PROFILE"
                            : "HYPOTHETICAL"}
                        </span>
                      </div>
                      {displayedPlan.slots.length === 0 && (
                        <Empty
                          title="No eligible charts in this range"
                          text="Try a wider constant range or another goal."
                        />
                      )}
                      {displayedPlan.slots.map((slot, i) => (
                        <div className="plan-track" key={slot.chart.id}>
                          {i % 3 === 0 && (
                            <div className="credit-divider">
                              CREDIT {Math.floor(i / 3) + 1}
                              <span />
                            </div>
                          )}
                          <div className="track-content">
                            <span className="track-number">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <Cover chart={slot.chart} small />
                            <div className="track-details">
                              <div className={`phase ${slot.phase}`}>
                                {slot.phase === "warmup"
                                  ? "SETTLE IN"
                                  : slot.phase === "push"
                                    ? "FOCUSED TARGET"
                                    : "TRY SOMETHING NEW"}
                              </div>
                              <h3>{slot.chart.title}</h3>
                              <div className="track-meta">
                                <Badge chart={slot.chart} />
                                <span>
                                  {slot.chart.type.toUpperCase()} ·{" "}
                                  {slot.chart.constant.toFixed(1)}
                                </span>
                                <a
                                  href={slot.chart.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`View ${slot.chart.title} source`}
                                >
                                  <ExternalLink size={12} />
                                </a>
                              </div>
                              <p>{slot.reason}</p>
                            </div>
                            <div className="track-target">
                              <small>TARGET</small>
                              <strong>
                                {slot.target.toFixed(1)}
                                <span>%</span>
                              </strong>
                              <span className="gain-inline">
                                +{slot.gain} potential
                              </span>
                              <button
                                className="text-button"
                                onClick={() => openScore(slot.chart)}
                              >
                                Log result
                                <Plus size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      <details className="assumptions">
                        <summary>
                          How to read this plan <ChevronDown size={14} />
                        </summary>
                        {displayedPlan.notices.map((n) => (
                          <p key={n}>{n}</p>
                        ))}
                      </details>
                    </>
                  )}
                </section>
              </div>
              <section className="panel ai-panel">
                <div className="panel-heading">
                  <Sparkles size={20} />
                  <div>
                    <h2>A little guidance for the road</h2>
                    <p>
                      {aiConfigured
                        ? "Grounded AI coaching, using your plan and a curated exercise library."
                        : "Exercise-library guidance is available. Live AI will appear when the owner configures a provider."}
                    </p>
                  </div>
                  <span className="label-pill">
                    {advice?.mode === "ai" ? "LIVE AI" : "PRACTICE COACH"}
                  </span>
                </div>
                {advice ? (
                  <div className="advice-body">
                    <p className="advice-summary">{advice.advice.summary}</p>
                    <ul>
                      {advice.advice.tips.map((tip, i) => (
                        <li key={i}>{tip}</li>
                      ))}
                    </ul>
                    <p>{advice.advice.answer}</p>
                    {advice.notice && (
                      <p className="inline-warning">{advice.notice}</p>
                    )}
                    <details>
                      <summary>
                        Exercise sources ({advice.sources.length})
                      </summary>
                      {advice.sources.map((s) => (
                        <p key={s.id}>
                          <strong>{s.title}.</strong> {s.text}
                        </p>
                      ))}
                    </details>
                  </div>
                ) : (
                  <p className="coach-placeholder">
                    Your plan sets the targets. Your coach helps you approach
                    them.
                  </p>
                )}
                <form className="coach-form" onSubmit={askCoach}>
                  <input
                    aria-label="Question for coach"
                    placeholder={
                      aiConfigured
                        ? "Ask about your session…"
                        : "Get practical guidance for this session"
                    }
                    maxLength={600}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    disabled={!aiConfigured}
                  />
                  <button
                    className="button primary"
                    disabled={coaching || !displayedPlan?.slots.length}
                  >
                    {coaching ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Send size={16} />
                    )}
                    <span>{aiConfigured ? "Ask coach" : "Get guidance"}</span>
                  </button>
                </form>
                <p className="privacy-line">
                  Scores are sent to the server to plan. When live AI is
                  enabled, selected plan details and your question go to the AI
                  provider. We don’t store them on the server.
                </p>
              </section>
            </>
          )}

          {view === "library" && (
            <>
              <PageHeading
                eyebrow="FIND YOUR NEXT FAVORITE"
                title="A whole world of charts."
                description={`${fmt(catalog.songCount)} songs. ${fmt(catalog.charts.length)} charts. Available in maimai DX International.`}
              />
              <div className="library-filters">
                <label className="search-field">
                  <Search size={18} />
                  <input
                    aria-label="Search songs"
                    placeholder="Search title, artist, or chart ID…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      aria-label="Clear search"
                      onClick={() => setSearch("")}
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>
                <select
                  aria-label="Difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option value="all">All difficulties</option>
                  {Object.entries(diffName).map(([v, n]) => (
                    <option key={v} value={v}>
                      {n}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Chart type"
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value)}
                >
                  <option value="all">DX + Standard</option>
                  <option value="dx">DX only</option>
                  <option value="std">Standard only</option>
                </select>
                <select
                  aria-label="Level"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                >
                  <option value="all">All levels</option>
                  {Array.from({ length: 15 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      Level {i + 1} / {i + 1}+
                    </option>
                  ))}
                </select>
              </div>
              <div className="results-heading">
                <span>
                  {fmt(filtered.length)} charts
                  <span className="muted-text"> · sorted by constant</span>
                </span>
                <span className="muted-text">
                  International · {catalog.currentVersion}
                </span>
              </div>
              <div className="song-grid">
                {filtered.slice(page * 20, page * 20 + 20).map((chart) => (
                  <article className="song-card" key={chart.id}>
                    <Cover chart={chart} />
                    <div className="song-card-content">
                      <div className="song-card-top">
                        <Badge chart={chart} />
                        <a
                          href={chart.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Source for ${chart.title}`}
                        >
                          <ArrowUpRight size={15} />
                        </a>
                      </div>
                      <h3>{chart.title}</h3>
                      <p title={chart.artist}>{chart.artist}</p>
                      <div className="song-facts">
                        <span>
                          <strong>{chart.constant.toFixed(1)}</strong> constant
                        </span>
                        <span>
                          {chart.bpm
                            ? `${chart.bpm} BPM`
                            : chart.type.toUpperCase()}
                        </span>
                      </div>
                      <div className="song-bottom">
                        <span>
                          {scoreMap.has(chart.id)
                            ? `${scoreMap.get(chart.id)!.achievement.toFixed(4)}%`
                            : "No score yet"}
                        </span>
                        <button onClick={() => openScore(chart)}>
                          <Plus size={14} />
                          Log score
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {!filtered.length && (
                <Empty
                  title="No charts found"
                  text="Try another title, artist, or filter."
                />
              )}
              <div className="pagination">
                <button
                  className="button subtle"
                  disabled={page === 0}
                  onClick={() => {
                    setPage((p) => p - 1);
                    window.scrollTo(0, 0);
                  }}
                >
                  <ChevronLeft size={15} />
                  Previous
                </button>
                <span>
                  Page {page + 1} of{" "}
                  {Math.max(1, Math.ceil(filtered.length / 20))}
                </span>
                <button
                  className="button subtle"
                  disabled={(page + 1) * 20 >= filtered.length}
                  onClick={() => {
                    setPage((p) => p + 1);
                    window.scrollTo(0, 0);
                  }}
                >
                  Next
                  <ChevronRight size={15} />
                </button>
              </div>
            </>
          )}

          {view === "scores" && (
            <>
              <PageHeading
                eyebrow="EVERY PERSONAL BEST STARTS SOMEWHERE"
                title="Your progress. Your pace."
                description="Log your achievements, bring a JSON backup, and find your next milestone."
              />
              <div className="score-actions">
                <button
                  className="button primary"
                  onClick={() => navigate("library")}
                >
                  <Plus size={16} />
                  Find a chart to log
                </button>
                <button
                  className="button subtle"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={16} />
                  Import JSON
                </button>
                <button
                  className="button subtle"
                  onClick={() =>
                    downloadJson("maicoach-scores.json", {
                      schemaVersion: 1,
                      region: "intl",
                      version: catalog.currentVersion,
                      demo,
                      scores: activeScores,
                    })
                  }
                >
                  <ArrowDownToLine size={16} />
                  Export {demo ? "sample" : "scores"}
                </button>
                {!demo && userScores.length > 0 && (
                  <button
                    className="icon-button danger"
                    aria-label="Clear saved scores"
                    onClick={() => setResetting(true)}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
              <div className="score-overview">
                <Stat
                  label={demo ? "DEMO B50 TOTAL" : "RECORDED B50 TOTAL"}
                  value={fmt(stats.total)}
                  detail={`${stats.old.length}/35 old · ${stats.recent.length}/15 new`}
                  icon={<Target />}
                  accent
                />
                <div className="panel distribution">
                  <div>
                    <h3>Your B50, chart by chart</h3>
                    <span>
                      {stats.count < 50
                        ? "Incomplete profile · add more scores"
                        : "Highest 35 old + 15 recent-version chart ratings"}
                    </span>
                  </div>
                  <div
                    className="rating-bars"
                    aria-label="B50 chart rating distribution"
                  >
                    {[...stats.old, ...stats.recent].map((e, i) => (
                      <span
                        key={e.chart.id}
                        className={i >= stats.old.length ? "new" : ""}
                        style={{
                          height: `${Math.max(5, (e.value / 360) * 100)}%`,
                        }}
                        title={`${e.chart.title}: ${e.value} rating`}
                      />
                    ))}
                    {Array.from({ length: 50 - stats.count }, (_, i) => (
                      <span
                        className="empty"
                        key={i}
                        style={{ height: "8%" }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              {activeScores.length ? (
                <div className="panel score-table-wrap">
                  <table className="score-table">
                    <thead>
                      <tr>
                        <th>CHART</th>
                        <th>CONSTANT</th>
                        <th>ACHIEVEMENT</th>
                        <th>RATING</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...activeScores]
                        .sort(
                          (a, b) =>
                            rating(
                              chartMap.get(b.chartId)!.constant,
                              b.achievement,
                              b.combo,
                            ) -
                            rating(
                              chartMap.get(a.chartId)!.constant,
                              a.achievement,
                              a.combo,
                            ),
                        )
                        .map((score) => {
                          const chart = chartMap.get(score.chartId)!;
                          return (
                            <tr key={chart.id}>
                              <td>
                                <div className="table-song">
                                  <Cover chart={chart} small />
                                  <div>
                                    <strong>{chart.title}</strong>
                                    <div>
                                      <Badge chart={chart} />
                                      <span>
                                        {chart.type.toUpperCase()} ·{" "}
                                        {score.combo !== "none"
                                          ? score.combo.toUpperCase()
                                          : chart.bucket === "new"
                                            ? "NEW VERSION"
                                            : "OLD VERSION"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td>{chart.constant.toFixed(1)}</td>
                              <td>
                                <strong>{score.achievement.toFixed(4)}%</strong>
                                <span className="rank">
                                  {rank(score.achievement)}
                                </span>
                              </td>
                              <td className="rating-cell">
                                {rating(
                                  chart.constant,
                                  score.achievement,
                                  score.combo,
                                )}
                              </td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label={`Edit ${chart.title} score`}
                                  onClick={() => openScore(chart)}
                                >
                                  <Plus size={16} />
                                </button>
                                {!demo && (
                                  <button
                                    className="icon-button danger"
                                    aria-label={`Remove ${chart.title} score`}
                                    onClick={() => {
                                      try {
                                        commitScores(
                                          userScores.filter(
                                            (s) => s.chartId !== chart.id,
                                          ),
                                        );
                                        setToast("Score removed.");
                                      } catch (err) {
                                        setToast((err as Error).message);
                                      }
                                    }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Your first score belongs here."
                  text="Find a chart in the library and log an achievement, or import a MaiCoach JSON file."
                  action={() => navigate("library")}
                />
              )}
              <details className="panel import-help">
                <summary>
                  JSON format and import details
                  <ChevronDown size={15} />
                </summary>
                <p>
                  Import a MaiCoach export or an array of scores. Chart IDs come
                  from the library’s source links or an export. Imports merge
                  with your saved profile and keep the result with the highest
                  chart rating, then achievement. Unknown chart IDs reject the
                  whole file.
                </p>
                <pre>
                  {JSON.stringify(
                    {
                      region: "intl",
                      scores: [
                        {
                          chartId: catalog.charts[0]?.id,
                          achievement: 99.4321,
                          combo: "none",
                        },
                      ],
                    },
                    null,
                    2,
                  )}
                </pre>
                <button
                  className="text-button"
                  onClick={() =>
                    downloadJson("maicoach-import-template.json", {
                      region: "intl",
                      scores: [
                        {
                          chartId: catalog.charts[0].id,
                          achievement: 99.4321,
                          combo: "none",
                        },
                      ],
                    })
                  }
                >
                  Download example
                  <ArrowDownToLine size={14} />
                </button>
              </details>
            </>
          )}

          {view === "about" && (
            <>
              <PageHeading
                eyebrow="TRANSPARENT BY DESIGN"
                title="A coach you can question."
                description="Useful guidance starts with clear evidence, honest limits, and numbers you can check."
              />
              <div className="about-grid">
                <section className="panel about-panel">
                  <Globe2 className="lime-text" />
                  <h2>International means international.</h2>
                  <p>
                    The library includes only DXRating charts marked available
                    on the international server. Constants apply international
                    overrides first, then the selected version’s values. Utage
                    and special charts are excluded.
                  </p>
                  <dl>
                    <dt>Version</dt>
                    <dd>{catalog.currentVersion}</dd>
                    <dt>Songs / charts</dt>
                    <dd>
                      {fmt(catalog.songCount)} / {fmt(catalog.charts.length)}
                    </dd>
                    <dt>Source updated</dt>
                    <dd>{new Date(catalog.updatedAt).toLocaleString()}</dd>
                    <dt>Snapshot fetched</dt>
                    <dd>{new Date(catalog.fetchedAt).toLocaleString()}</dd>
                  </dl>
                  <a
                    className="text-button"
                    href="https://dxrating.net/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Data from DXRating
                    <ExternalLink size={14} />
                  </a>
                </section>
                <section className="panel about-panel">
                  <Target className="lime-text" />
                  <h2>Math first. Explanations second.</h2>
                  <p>
                    Rating comes from code: achievement coefficients, capped
                    achievement, AP bonus, and the highest 35 old plus 15
                    recent-version chart ratings.
                  </p>
                  <p>
                    The planner compares target scores with your recorded B50
                    and recalculates replacements sequentially. Gains assume
                    every target lands. With fewer than 50 entries, your total
                    is a partial record.
                  </p>
                  <p>
                    New charts get a provisional 97% target. It is a starting
                    point, not a prediction. Note counts describe chart
                    composition and cannot reveal your technique.
                  </p>
                </section>
                <section className="panel about-panel">
                  <Sparkles className="lime-text" />
                  <h2>Grounded coaching.</h2>
                  <p>
                    {aiConfigured
                      ? "Live AI is configured."
                      : "Live AI is not configured on this deployment."}{" "}
                    The planner and exercise library work without a model.
                    Optional LangChain coaching explains a computed session
                    using retrieved exercise notes and structured output.
                  </p>
                  <p>
                    Chart selection, constants, achievements, and projected
                    rating stay under the planner’s control. The model adds
                    prose, with exercise sources shown alongside it.
                  </p>
                  <div className="mode-note">
                    <i />
                    {aiConfigured
                      ? "AI available"
                      : "Planner + exercise-library mode"}
                  </div>
                </section>
                <section className="panel about-panel">
                  <ShieldCheck className="lime-text" />
                  <h2>Your scores, your browser.</h2>
                  <p>
                    No account is needed. Your scores are stored locally in this
                    browser. Switching to the demo never overwrites your saved
                    profile. Export a backup before clearing site data or moving
                    devices.
                  </p>
                  <p>
                    Session planning sends scores to the server for calculation.
                    Live coaching sends selected plan details and your question
                    to the configured AI provider. MaiCoach does not persist
                    these requests. Hosting access logs may contain IP
                    addresses.
                  </p>
                  <p>
                    MaiCoach is an independent fan project, unaffiliated with
                    SEGA or DXRating. Game names and content belong to their
                    respective owners.
                  </p>
                </section>
              </div>
              <section className="panel provenance">
                <BookOpen size={18} />
                <div>
                  <h3>Source provenance</h3>
                  <p>Catalog checksum (SHA-256)</p>
                  <code>{catalog.sha256}</code>
                  <p>
                    International version and rating rules were verified against{" "}
                    <a
                      href={`https://github.com/gekichumai/dxrating/tree/${catalog.sourceCommit}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      DXRating revision {catalog.sourceCommit.slice(0, 7)}
                    </a>
                    . Availability reflects the snapshot and may change.
                  </p>
                </div>
              </section>
            </>
          )}

          <footer>
            <span>
              <Logo small />
              Made for the next personal best.
            </span>
            <div>
              <a href="https://dxrating.net/" target="_blank" rel="noreferrer">
                Data from DXRating
                <ArrowUpRight size={11} />
              </a>
              <span>
                Independent fan project · © {new Date().getFullYear()} MaiCoach
              </span>
            </div>
          </footer>
        </main>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Import score file"
        onChange={(e) => importFile(e.target.files?.[0])}
      />
      <dialog
        ref={modalRef}
        className="score-modal"
        onCancel={() => setEditing(null)}
        onClick={(e) => {
          if (e.target === modalRef.current) closeScore();
        }}
      >
        {editing && (
          <form onSubmit={logScore}>
            <button
              type="button"
              className="modal-close icon-button"
              aria-label="Close score editor"
              onClick={closeScore}
            >
              <X size={19} />
            </button>
            <div className="eyebrow muted">ONE MORE PERSONAL BEST</div>
            <h2>Log your result.</h2>
            <div className="modal-song">
              <Cover chart={editing} small />
              <div>
                <h3>{editing.title}</h3>
                <Badge chart={editing} />
                <span>
                  {" "}
                  {editing.type.toUpperCase()} · {editing.constant.toFixed(1)}
                </span>
              </div>
            </div>
            <label className="field-label" htmlFor="achievement">
              Achievement (%)
            </label>
            <input
              id="achievement"
              autoFocus
              inputMode="decimal"
              type="number"
              min="0"
              max="101"
              step="0.0001"
              placeholder="99.4321"
              value={achievement}
              onChange={(e) => setAchievement(e.target.value)}
              required
            />
            <label className="field-label" htmlFor="combo">
              Combo badge
            </label>
            <select
              id="combo"
              value={combo}
              onChange={(e) => setCombo(e.target.value as Score["combo"])}
            >
              <option value="none">None</option>
              <option value="fc">FC</option>
              <option value="fcp">FC+</option>
              <option value="ap">AP</option>
              <option value="app">AP+</option>
            </select>
            {formError && (
              <p role="alert" className="inline-warning">
                {formError}
              </p>
            )}
            {demo && (
              <p className="settings-help">
                This result will be saved to your own profile. Sample scores
                stay in the demo.
              </p>
            )}
            <button className="button primary full">
              <Check size={17} />
              Save result
            </button>
          </form>
        )}
      </dialog>
      {resetting && (
        <div className="confirm-backdrop">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            className="panel confirm-modal"
          >
            <h2 id="reset-title">Clear your saved scores?</h2>
            <p>
              Export a backup first if you want to keep them. The demo profile
              stays available.
            </p>
            <div>
              <button
                className="button subtle"
                onClick={() => setResetting(false)}
              >
                Keep scores
              </button>
              <button
                className="button primary"
                onClick={() => {
                  try {
                    commitScores([]);
                    setResetting(false);
                    setToast("Saved scores cleared.");
                  } catch (err) {
                    setToast((err as Error).message);
                  }
                }}
              >
                Clear scores
              </button>
            </div>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`stat-card ${accent ? "accent" : ""}`}>
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div className="eyebrow muted">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: () => void;
}) {
  return (
    <div className="empty-state">
      <Disc3 size={35} />
      <h2>{title}</h2>
      <p>{text}</p>
      {action && (
        <button className="button primary" onClick={action}>
          Explore charts
          <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
