"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import "./product-tour.css";
import {
  AI_ROW,
  AI_SUBTASKS,
  ROWS,
  TABS,
  aiRounds,
  range,
  rowHours,
  tabTotals,
  type Range,
  type TourRow,
  type TourTab,
} from "./tour-data";

// The left half of the sign-in page: an interactive tour of the product with demo data.
// Three steps play on their own (each advances when its progress bar finishes, so hovering pauses
// it); clicking anything stops the autoplay. With reduced motion nothing animates or advances.

/** Class names from product-tour.css. */
const styles = {
  bAi: "pt-bAi",
  bBench: "pt-bBench",
  bPast: "pt-bPast",
  badge: "pt-badge",
  bar: "pt-bar",
  big: "pt-big",
  card: "pt-card",
  cardBody: "pt-cardBody",
  cardNote: "pt-cardNote",
  cardTitle: "pt-cardTitle",
  chip: "pt-chip",
  chipInner: "pt-chipInner",
  content: "pt-content",
  copy: "pt-copy",
  crumb: "pt-crumb",
  dim: "pt-dim",
  eyebrow: "pt-eyebrow",
  fill: "pt-fill",
  flash: "pt-flash",
  headline: "pt-headline",
  hint: "pt-hint",
  ic: "pt-ic",
  icAi: "pt-icAi",
  icInfo: "pt-icInfo",
  icOk: "pt-icOk",
  layer: "pt-layer",
  lede: "pt-lede",
  line: "pt-line",
  main: "pt-main",
  meter: "pt-meter",
  meterLabel: "pt-meterLabel",
  mpr: "pt-mpr",
  nav: "pt-nav",
  num: "pt-num",
  on: "pt-on",
  out: "pt-out",
  paused: "pt-paused",
  playing: "pt-playing",
  reviewBtn: "pt-reviewBtn",
  reviewOk: "pt-reviewOk",
  row: "pt-row",
  selected: "pt-selected",
  shot: "pt-shot",
  side: "pt-side",
  stage: "pt-stage",
  status: "pt-status",
  statusOk: "pt-statusOk",
  statusWait: "pt-statusWait",
  stories: "pt-stories",
  story: "pt-story",
  struck: "pt-struck",
  table: "pt-table",
  tabs: "pt-tabs",
  title: "pt-title",
  totals: "pt-totals",
  tour: "pt-tour",
  track: "pt-track",
  ws: "pt-ws",
};

const STORIES = [
  {
    label: "Match past work",
    headline: (
      <>
        Estimates grounded in <em>real past work</em>, not guesswork.
      </>
    ),
    lede: "Each Task is matched to delivered projects. Switch platforms and click a row to see where every number comes from.",
  },
  {
    label: "AI estimate",
    headline: (
      <>
        An <em>AI estimate</em> when you want a second opinion.
      </>
    ),
    lede: "Claude sizes each Sub task in rounds with a risk factor. Drag minutes per round and watch the hours update.",
  },
  {
    label: "Review & export",
    headline: (
      <>
        Review, approve and <em>export</em> in one place.
      </>
    ),
    lede: "Tech Leads see flagged items first, approve, and the estimate goes out in Folio3's Excel template.",
  },
];

const STATUS = [
  { kind: "", icon: "●", text: "Submitted for review", sub: "Sent to Tech Lead" },
  { kind: styles.statusWait, icon: "…", text: "In review", sub: "2 items flagged" },
  {
    kind: styles.statusOk,
    icon: "✓",
    text: "Approved by Tech Lead",
    sub: "Ready to export to Excel",
  },
];

const REDUCE = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const query = matchMedia(REDUCE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => matchMedia(REDUCE).matches,
    () => false,
  );
}

/** Counts from the previous range to the new one. */
function CountUp({ value, reduced }: { value: Range; reduced: boolean }) {
  const [shown, setShown] = useState<Range>(value);
  const from = useRef<Range>(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (reduced) return;
    const t0 = performance.now();
    let frame = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 500);
      const e = 1 - Math.pow(1 - k, 3);
      setShown([
        Math.round(start[0] + (value[0] - start[0]) * e),
        Math.round(start[1] + (value[1] - start[1]) * e),
      ]);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value[0], value[1], reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{range(reduced ? value : shown)} h</>;
}

export function ProductTour() {
  const reduced = useReducedMotion();
  const [story, setStory] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [paused, setPaused] = useState(false);
  const [tab, setTab] = useState<TourTab>("backend");
  const [selected, setSelected] = useState(0);
  const [minutes, setMinutes] = useState(60);
  const [flash, setFlash] = useState(0);
  const [review, setReview] = useState<number | null>(null); // review step shown in the card
  const [swapping, setSwapping] = useState(false);
  const [copyStory, setCopyStory] = useState(0); // the step whose words are showing
  const stage = useRef<HTMLDivElement>(null);

  const swapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(swapTimer.current), []);

  // Step 3 plays Submitted → In review → Approved.
  useEffect(() => {
    if (review === null || review >= 2) return;
    const t = setTimeout(() => setReview(review + 1), reduced ? 0 : review === 0 ? 1300 : 1600);
    return () => clearTimeout(t);
  }, [review, reduced]);

  function showStory(i: number) {
    setStory(i);
    // Fade the headline out and back in.
    clearTimeout(swapTimer.current);
    if (reduced) setCopyStory(i);
    else {
      setSwapping(true);
      swapTimer.current = setTimeout(() => {
        setCopyStory(i);
        setSwapping(false);
      }, 220);
    }
    if (i === 0) {
      setTab("backend");
      setSelected(0);
      setReview(null);
    } else if (i === 1) {
      setSelected(AI_ROW);
      setReview(null);
    } else {
      setReview(0);
    }
  }
  const stop = () => setPlaying(false);

  const rows = ROWS[tab];
  const row = rows[selected] ?? rows[0];
  const totals = tabTotals(tab, minutes);
  const status =
    review !== null
      ? STATUS[review]
      : {
          kind: "",
          icon: "●",
          text: "Draft",
          sub: story === 1 ? "1 Task uses an AI estimate" : "18 of 24 features reviewed",
        };
  const dimMain = review !== null;
  const dimChip = story === 1 && review === null;

  return (
    <section
      aria-label="Product tour"
      className={`${styles.tour} ${playing && !reduced ? styles.playing : ""} ${paused ? styles.paused : ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className={`${styles.copy} ${swapping ? styles.out : ""}`} aria-live="polite">
        <div className={styles.eyebrow}>Folio3 · F3 Estimation Tool</div>
        <h2 className={styles.headline}>{STORIES[copyStory].headline}</h2>
        <p className={styles.lede}>{STORIES[copyStory].lede}</p>
      </div>

      <div
        ref={stage}
        className={styles.stage}
        onMouseMove={(e) => {
          if (reduced || !stage.current) return;
          const r = stage.current.getBoundingClientRect();
          stage.current.style.setProperty(
            "--px",
            ((e.clientX - r.left) / r.width - 0.5).toFixed(3),
          );
          stage.current.style.setProperty(
            "--py",
            ((e.clientY - r.top) / r.height - 0.5).toFixed(3),
          );
        }}
        onMouseLeave={() => {
          stage.current?.style.setProperty("--px", "0");
          stage.current?.style.setProperty("--py", "0");
        }}
      >
        <div className={`${styles.layer} ${styles.main} ${dimMain ? styles.dim : ""}`}>
          <div className={styles.shot}>
            <div className={styles.bar}>
              <i />
              <i />
              <i />
              <span>Estimate · Northwind Clinics: Patient portal</span>
            </div>
            <div className={styles.ws}>
              <div className={styles.nav} aria-hidden="true">
                <b>Work</b>
                <span>Home</span>
                <span className={styles.on}>Estimates</span>
                <span>Reviews</span>
                <b>Knowledge</b>
                <span>Past projects</span>
                <span>Feature hours</span>
              </div>
              <div className={styles.content}>
                <div className={styles.crumb}>Estimates / Northwind Clinics</div>
                <div className={styles.title}>Patient portal v2</div>
                <div className={styles.tabs} role="tablist" aria-label="Demo platforms">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.id}
                      onClick={() => {
                        stop();
                        setTab(t.id);
                        setSelected(0);
                        setReview(null);
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <table className={styles.table} key={tab}>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={r.name}
                        tabIndex={0}
                        aria-selected={i === selected}
                        className={`${styles.row} ${i === selected ? styles.selected : ""}`}
                        onClick={() => {
                          stop();
                          setSelected(i);
                          setReview(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            stop();
                            setSelected(i);
                            setReview(null);
                          }
                        }}
                      >
                        <td>{r.name}</td>
                        <td>
                          <Badge row={r} />
                        </td>
                        <td
                          key={r.src === "ai" ? flash : undefined}
                          className={`${styles.num} ${r.src === "ai" && flash ? styles.flash : ""}`}
                        >
                          {range(rowHours(r, minutes))} h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className={styles.hint}>Click a row to see where its number comes from.</p>
                <div className={styles.totals}>
                  <div>
                    <small>Development</small>
                    <strong>
                      <CountUp value={totals.dev} reduced={reduced} />
                    </strong>
                  </div>
                  <div>
                    <small title="Bugs 10%, QA 25%, PM 30%">Bugs + QA + PM</small>
                    <strong>
                      <CountUp value={totals.overheads} reduced={reduced} />
                    </strong>
                  </div>
                  <div>
                    <small>Total</small>
                    <strong>
                      <CountUp value={totals.total} reduced={reduced} />
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`${styles.layer} ${styles.side}`}>
          <div className={`${styles.shot} ${styles.card}`}>
            {review !== null ? (
              <ReviewCard step={review} />
            ) : (
              <SourceCard
                key={`${tab}-${selected}`}
                row={row}
                minutes={minutes}
                onMinutes={(m) => {
                  stop();
                  setMinutes(m);
                  setFlash((f) => f + 1);
                }}
              />
            )}
          </div>
        </div>

        <div className={`${styles.layer} ${styles.chip} ${dimChip ? styles.dim : ""}`}>
          <div className={`${styles.shot} ${styles.chipInner}`}>
            <span className={`${styles.status} ${status.kind}`} aria-hidden="true">
              {status.icon}
            </span>
            <div>
              {status.text}
              <small>{status.sub}</small>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.stories}>
        {STORIES.map((s, i) => (
          <button
            key={s.label}
            type="button"
            className={styles.story}
            aria-current={story === i ? "step" : undefined}
            onClick={() => {
              stop();
              showStory(i);
            }}
          >
            <b>{String(i + 1).padStart(2, "0")}</b>
            {s.label}
            <span className={styles.track}>
              <span
                key={story === i ? `on-${story}` : "off"}
                className={styles.fill}
                onAnimationEnd={() => {
                  if (playing && story === i) showStory((i + 1) % STORIES.length);
                }}
              />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Badge({ row }: { row: TourRow }) {
  if (row.src === "past")
    return <span className={`${styles.badge} ${styles.bPast}`}>Past project · {row.sim}%</span>;
  if (row.src === "bench")
    return <span className={`${styles.badge} ${styles.bBench}`}>Benchmark</span>;
  return <span className={`${styles.badge} ${styles.bAi}`}>AI estimate</span>;
}

function SourceCard(props: { row: TourRow; minutes: number; onMinutes: (m: number) => void }) {
  const { row, minutes } = props;
  const hours = rowHours(row, minutes);
  if (row.src === "past") {
    return (
      <div className={styles.cardBody}>
        <p className={styles.cardTitle}>
          <span className={`${styles.ic} ${styles.icOk}`}>↺</span>Past project match
        </p>
        <p className={styles.cardNote}>
          {row.ref}: actual {row.actual} h delivered
        </p>
        <div className={styles.meterLabel}>
          <span>Similarity</span>
          <span>{row.sim}%</span>
        </div>
        <div className={styles.meter}>
          <i style={{ width: `${row.sim}%` }} />
        </div>
        <div className={styles.big}>
          {range(hours)} h <small>suggested</small>
        </div>
      </div>
    );
  }
  if (row.src === "bench") {
    return (
      <div className={styles.cardBody}>
        <p className={styles.cardTitle}>
          <span className={`${styles.ic} ${styles.icInfo}`}>▤</span>Benchmark
        </p>
        <p className={styles.cardNote}>
          From the Feature hours library: “{row.ref}”, confirmed by an Architect.
        </p>
        <div className={styles.line}>
          <span>Pre-AI hours</span>
          <b className={styles.struck}>
            {range([Math.round(hours[0] * 1.4), Math.round(hours[1] * 1.4)])} h
          </b>
        </div>
        <div className={styles.line}>
          <span>With AI tools</span>
          <b>{range(hours)} h</b>
        </div>
        <div className={styles.big}>
          {range(hours)} h <small>suggested</small>
        </div>
      </div>
    );
  }
  const rounds = aiRounds();
  return (
    <div className={styles.cardBody}>
      <p className={styles.cardTitle}>
        <span className={`${styles.ic} ${styles.icAi}`}>✦</span>AI estimate · {row.name}
      </p>
      <p className={styles.cardNote}>AI-generated, no historical reference</p>
      {AI_SUBTASKS.map(([title, base, factor]) => (
        <div key={title} className={styles.line}>
          <span>{title}</span>
          <b>{range([base, Math.round(base * factor)])} rounds</b>
        </div>
      ))}
      <div className={styles.line}>
        <span>Integration (15%)</span>
        <b>{range(rounds.integration)} rounds</b>
      </div>
      <label className={styles.mpr}>
        Minutes per round
        <input
          type="range"
          min={15}
          max={120}
          step={15}
          value={minutes}
          onChange={(e) => props.onMinutes(Number(e.target.value))}
        />
        <output>{minutes} min</output>
      </label>
      <div className={styles.big}>
        {range(hours)} h <small>{range(rounds.total)} rounds</small>
      </div>
    </div>
  );
}

function ReviewCard({ step }: { step: number }) {
  const approved = step >= 2;
  const item = (done: boolean, text: string) => (
    <div className={styles.line}>
      <span>{text}</span>
      <b style={{ color: done ? "var(--ok)" : "var(--warn)" }}>
        {done ? "✓ Checked" : "Needs a look"}
      </b>
    </div>
  );
  return (
    <div className={styles.cardBody}>
      <p className={styles.cardTitle}>
        <span className={`${styles.ic} ${approved ? styles.icOk : styles.icInfo}`}>
          {approved ? "✓" : "☰"}
        </span>
        Review · Patient portal v2
      </p>
      <p className={styles.cardNote}>
        {approved ? "Approved by Tech Lead" : "Items needing attention come first"}
      </p>
      {item(step >= 1, "Work orders: AI estimate")}
      {item(step >= 1, "Offline sync: large override")}
      {item(true, "Rates confirmed")}
      <span className={`${styles.reviewBtn} ${approved ? styles.reviewOk : ""}`}>
        {approved ? "Export to Excel ↓" : "Approve"}
      </span>
    </div>
  );
}
