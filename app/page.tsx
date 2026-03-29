"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AudioAnalyzer from "./components/AudioAnalyzer";

// ─── Config ────────────────────────────────────────────────────────────────────
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const MAX_FILE_SIZE_MB = 100;
const POLL_INTERVAL_MS = 2500;
const POLL_BACKOFF_AFTER = 10; // slow down polling after N ticks
const POLL_INTERVAL_SLOW_MS = 5000;

// ─── Types ──────────────────────────────────────────────────────────────────────
type JobStatus = "idle" | "uploading" | "queued" | "processing" | "done" | "error";

interface StatusResponse {
  status?: JobStatus;
  progress?: number;
  stems?: Record<string, string>;
  error?: string;
}

// ─── Static data ────────────────────────────────────────────────────────────────
const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/flac",
  "audio/ogg",
  "audio/webm",
]);

const STEM_META: Record<string, { label: string; icon: string; description: string }> = {
  vocals: { label: "Vocals", icon: "🎤", description: "Vocea principală separată" },
  drums:  { label: "Drums",  icon: "🥁", description: "Percuție și ritm" },
  bass:   { label: "Bass",   icon: "🎸", description: "Linia de bass separată" },
  other:  { label: "Other",  icon: "🎹", description: "Restul instrumentelor" },
};

const STEM_ORDER = ["vocals", "drums", "bass", "other"];

const MODEL_DETAILS: Record<string, { title: string; short: string; description: string }> = {
  htdemucs: {
    title: "htdemucs",
    short: "Recomandat pentru majoritatea cazurilor",
    description:
      "Cel mai bun echilibru între viteză și calitate. Dacă nu știi ce să alegi, începe cu acest model.",
  },
  htdemucs_ft: {
    title: "htdemucs_ft",
    short: "Mai lent, dar adesea mai curat",
    description:
      "Variantă mai rafinată, utilă când vrei o separare mai atentă și accepți timp mai mare de procesare.",
  },
  mdx_extra: {
    title: "mdx_extra",
    short: "Alternativă solidă pentru comparație",
    description:
      "Poate oferi rezultate mai bune pe unele piese. Bun dacă vrei să testezi o separare diferită față de seria Demucs.",
  },
  mdx_extra_q: {
    title: "mdx_extra_q",
    short: "Mai rapid, mai ușor",
    description:
      "Potrivit pentru test rapid sau când viteza contează mai mult decât rafinarea maximă a separării.",
  },
};

const STATUS_TEXT: Record<JobStatus, string> = {
  idle:       "Așteaptă fișier",
  uploading:  "Se încarcă",
  queued:     "În coadă",
  processing: "Separare audio în curs",
  done:       "Stem-uri pregătite",
  error:      "Eroare",
};

const STATUS_NOTE: Partial<Record<JobStatus, string>> = {
  idle:       "Încarcă un fișier pentru a porni separarea audio.",
  queued:     "Jobul a intrat în coadă. Așteaptă alocarea procesării.",
  processing: "Modelul AI separă vocals, drums, bass și other.",
  done:       "Stem-urile sunt gata. Acum ai preview și download.",
  error:      "Procesarea s-a oprit.",
};

const FAQ_ITEMS: [string, string][] = [
  ["Ce formate acceptă?", "Poți urca MP3, WAV, M4A, AAC, FLAC, OGG și WEBM, în limita de 100 MB."],
  ["Ce primesc la final?", "Patru stem-uri separate: vocals, drums, bass și other."],
  ["Pot asculta înainte să descarc?", "Da. După procesare, fiecare stem poate fi redat direct în browser."],
  [
    "Ce diferență este între modele?",
    "htdemucs este alegerea recomandată. htdemucs_ft pune accent mai mare pe calitate, dar e mai lent. mdx_extra și mdx_extra_q sunt alternative bune pentru comparație.",
  ],
];

const USE_CASES = [
  ["Remix și mashup",     "Extragi vocea sau instrumentele pentru rework-uri, editări și experimente muzicale."],
  ["Karaoke și instrumental", "Obții rapid track-uri fără voce pentru karaoke, repetiții sau cover-uri."],
  ["Content creators",   "Util pentru TikTok, Shorts, Reels, podcast edit și clipuri cu sunet mai curat."],
  ["Economie de timp",   "Reduci drastic timpul pierdut cu metode manuale sau cu tool-uri slabe."],
];

// ─── Helpers ────────────────────────────────────────────────────────────────────
function validateFile(file: File | null): string {
  if (!file) return "Nu ai selectat niciun fișier.";
  if (file.size / 1024 / 1024 > MAX_FILE_SIZE_MB)
    return `Fișierul este prea mare. Limita este ${MAX_FILE_SIZE_MB} MB.`;
  const validMime = ACCEPTED_AUDIO_TYPES.has(file.type);
  const validFallback =
    file.type.startsWith("audio/") ||
    /\.(mp3|wav|m4a|aac|flac|ogg|webm)$/i.test(file.name);
  if (!validMime && !validFallback)
    return "Format invalid. Încarcă MP3, WAV, M4A, AAC, FLAC, OGG sau WEBM.";
  return "";
}

function stemUrl(jobId: string, stemName: string) {
  return `${API}/download/stem/${jobId}/${stemName}`;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noreferrer";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── Component ──────────────────────────────────────────────────────────────────
export default function Home() {
  const [file, setFile]         = useState<File | null>(null);
  const [jobId, setJobId]       = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus]     = useState<JobStatus>("idle");
  const [error, setError]       = useState("");
  const [model, setModel]       = useState("htdemucs_ft");
  const [dragOver, setDragOver] = useState(false);
  const [isBusy, setIsBusy]     = useState(false);
  const [stems, setStems]       = useState<Record<string, string>>({});
  const [statusNote, setStatusNote] = useState(STATUS_NOTE.idle!);

  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCount    = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toolRef      = useRef<HTMLElement | null>(null);

  // Cleanup polling on unmount
  useEffect(() => () => clearPolling(), []);

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      pollCount.current = 0;
    }
  }, []);

  const resetJob = useCallback((removeFile = false) => {
    clearPolling();
    setJobId("");
    setProgress(0);
    setStatus("idle");
    setError("");
    setIsBusy(false);
    setStems({});
    setStatusNote(STATUS_NOTE.idle!);
    if (removeFile) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [clearPolling]);

  const handleFile = useCallback((picked: File | null) => {
    const err = validateFile(picked);
    if (err) { setError(err); return; }
    setError("");
    resetJob(false);
    setFile(picked);
    setStatusNote("Fișier selectat. Poți porni separarea stem-urilor.");
  }, [resetJob]);

  const pollStatus = useCallback(async (id: string) => {
    try {
      const res  = await fetch(`${API}/status/${id}`, { cache: "no-store" });
      const data: StatusResponse = await res.json();

      if (!res.ok) throw new Error(data?.error ?? "Status request failed");

      const next = (data.status ?? "processing") as JobStatus;
      const pct  = typeof data.progress === "number"
        ? Math.max(0, Math.min(100, data.progress))
        : 0;

      setStatus(next);
      setProgress(pct);
      setStems(data.stems ?? {});
      if (STATUS_NOTE[next]) setStatusNote(STATUS_NOTE[next]!);

      if (next === "done") {
        clearPolling();
        setIsBusy(false);
        setProgress(100);
      }
      if (next === "error") {
        clearPolling();
        setIsBusy(false);
        setError(data.error ?? "Procesarea a eșuat.");
      }
    } catch (err) {
      clearPolling();
      setStatus("error");
      setIsBusy(false);
      setError(err instanceof Error ? err.message : "Nu am putut verifica statusul.");
      setStatusNote("Conexiunea cu serverul a eșuat.");
    }
  }, [clearPolling]);

  const startPolling = useCallback((id: string) => {
    clearPolling();
    pollStatus(id);
    pollRef.current = setInterval(() => {
      pollCount.current += 1;
      // Progressive backoff: slow down after POLL_BACKOFF_AFTER ticks
      if (pollCount.current === POLL_BACKOFF_AFTER) {
        clearPolling();
        pollRef.current = setInterval(() => pollStatus(id), POLL_INTERVAL_SLOW_MS);
      } else {
        pollStatus(id);
      }
    }, POLL_INTERVAL_MS);
  }, [clearPolling, pollStatus]);

  const handleUpload = useCallback(async () => {
    if (isBusy) return;
    const validationError = validateFile(file);
    if (validationError) { setError(validationError); return; }
    if (!file) { setError("Selectează un fișier audio mai întâi."); return; }

    setError("");
    setStatus("uploading");
    setProgress(5);
    setIsBusy(true);
    setStems({});
    setStatusNote("Fișierul se încarcă spre server...");

    try {
      const form = new FormData();
      form.append("file", file);

      const res  = await fetch(`${API}/upload?model=${encodeURIComponent(model)}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.detail ?? data?.error ?? "Upload failed");
      if (!data?.job_id) throw new Error("Serverul nu a returnat un job_id valid.");

      setJobId(data.job_id);
      setStatus("queued");
      setProgress(10);
      setStatusNote("Upload finalizat. Jobul a fost trimis la procesare.");
      startPolling(data.job_id);
    } catch (err) {
      setStatus("error");
      setProgress(0);
      setIsBusy(false);
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatusNote("Upload-ul a eșuat.");
    }
  }, [file, isBusy, model, startPolling]);

  const handleDownloadStem = useCallback((stem: string) => {
    triggerDownload(stemUrl(jobId, stem), `${stem}.wav`);
  }, [jobId]);

  // Sequential downloads with delay to avoid browser blocking
  const handleDownloadAll = useCallback(async () => {
    for (const stem of Object.keys(stems)) {
      handleDownloadStem(stem);
      await new Promise((r) => setTimeout(r, 300));
    }
  }, [stems, handleDownloadStem]);

  const scrollToTool = useCallback(() => {
    toolRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const availableStems = useMemo(
    () =>
      Object.keys(stems).sort(
        (a, b) =>
          (STEM_ORDER.indexOf(a) === -1 ? 99 : STEM_ORDER.indexOf(a)) -
          (STEM_ORDER.indexOf(b) === -1 ? 99 : STEM_ORDER.indexOf(b))
      ),
    [stems]
  );

  const clampedProgress = Math.max(0, Math.min(progress, 100));

  // ─── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#17172a,transparent_30%),linear-gradient(180deg,#07070a_0%,#09090b_100%)] text-white">

      {/* ── Nav ── */}
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 md:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-black">
              🎛️
            </div>
            <div>
              <p className="text-sm text-white/60">AI Audio Tool</p>
              <p className="text-lg font-semibold">Vocal Remover Pro</p>
            </div>
          </div>
          <button
            onClick={scrollToTool}
            className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:opacity-90"
          >
            Încearcă gratuit
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="mb-5 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75">
              4 stem-uri separate • procesare rapidă • preview direct în browser
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-tight tracking-tight md:text-7xl">
              Separă vocea și instrumentele din orice melodie,{" "}
              <span className="text-white/60">rapid și simplu</span>.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65">
              Încarci fișierul, alegi modelul potrivit și primești separat vocals, drums, bass și
              other. Totul direct în browser, fără instalări și fără workflow complicat.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <button
                onClick={scrollToTool}
                className="rounded-2xl bg-white px-6 py-4 font-semibold text-black transition hover:opacity-90"
              >
                Încearcă gratuit
              </button>
              <a
                href="#cum-functioneaza"
                className="rounded-2xl border border-white/10 px-6 py-4 font-semibold text-white transition hover:bg-white/5"
              >
                Vezi cum funcționează
              </a>
            </div>
            <p className="mt-5 text-sm text-white/45">
              Rulează pe servere GPU reale • Procesare audio AI • Rezultate gata de preview și download
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { value: "4",       label: "stem-uri separate" },
                { value: "100 MB",  label: "limită per fișier" },
                { value: "4 modele", label: "viteză sau calitate, în funcție de nevoie" },
              ].map(({ value, label }) => (
                <div key={label} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p className="text-3xl font-semibold">{value}</p>
                  <p className="mt-2 text-sm text-white/60">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Preview card */}
          <div className="rounded-[36px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
            <div className="rounded-[28px] border border-white/10 bg-black/30 p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/50">Previzualizare output</p>
                  <h2 className="text-2xl font-semibold">Ce primești la final</h2>
                </div>
                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                  Bun pentru creatori
                </div>
              </div>
              <div className="grid gap-3">
                {STEM_ORDER.map((key) => {
                  const meta = STEM_META[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-black">
                          {meta.icon}
                        </div>
                        <div>
                          <p className="font-medium">{meta.label}</p>
                          <p className="text-sm text-white/50">Preview + Download</p>
                        </div>
                      </div>
                      <div className="text-sm text-white/40">Separat</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/60">
                Patru stem-uri separate, gata pentru ascultare, descărcare și folosire în
                remixuri, karaoke, TikTok, podcast edit sau alte proiecte audio.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="cum-functioneaza" className="mx-auto max-w-7xl px-6 py-8 md:px-10 md:py-12">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-white/40">Cum funcționează</p>
          <h2 className="mt-3 text-3xl font-semibold md:text-5xl">3 pași simpli, fără bătăi de cap</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            ["1", "Încarci melodia",        "Adaugi fișierul audio prin drag & drop sau selectare manuală."],
            ["2", "Alegi modelul potrivit", "Poți merge pe viteză sau pe o separare mai atentă, în funcție de ce ai nevoie."],
            ["3", "Asculți și descarci",    "Primești stem-urile separate, le previzualizezi direct în browser și le descarci individual sau pe toate."],
          ].map(([step, title, desc]) => (
            <div key={step} className="rounded-[30px] border border-white/10 bg-white/5 p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-black font-semibold">
                {step}
              </div>
              <h3 className="text-xl font-semibold">{title}</h3>
              <p className="mt-3 leading-7 text-white/60">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Use cases ── */}
      <section className="mx-auto max-w-7xl px-6 py-8 md:px-10 md:py-12">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-white/40">De ce e util</p>
          <h2 className="mt-3 text-3xl font-semibold md:text-5xl">
            Gândit pentru folosire reală, nu doar pentru demo
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-4">
          {USE_CASES.map(([title, desc]) => (
            <div key={title} className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-white/60">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Models ── */}
      <section className="mx-auto max-w-7xl px-6 py-8 md:px-10 md:py-12">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-white/40">Modele disponibile</p>
          <h2 className="mt-3 text-3xl font-semibold md:text-5xl">Ce model să alegi?</h2>
          <p className="mt-4 max-w-3xl text-base leading-8 text-white/60">
            Fiecare model are un compromis diferit între viteză, claritate și tipul de rezultat.
            Nu toate piesele reacționează la fel, deci uneori merită să compari două variante.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {Object.values(MODEL_DETAILS).map((item) => (
            <div key={item.title} className="rounded-[30px] border border-white/10 bg-white/5 p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold">{item.title}</h3>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65">
                  model
                </span>
              </div>
              <p className="mt-3 text-sm font-medium text-white/75">{item.short}</p>
              <p className="mt-3 text-sm leading-7 text-white/60">{item.description}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-[28px] border border-white/10 bg-black/25 p-5 text-sm leading-7 text-white/65">
          <strong className="text-white">Nu știi ce să alegi?</strong> Începe cu{" "}
          <span className="font-semibold text-white">htdemucs</span>. Dacă vrei o separare mai
          atentă, încearcă <span className="font-semibold text-white">htdemucs_ft</span>. Dacă vrei
          o alternativă diferită, testează{" "}
          <span className="font-semibold text-white">mdx_extra</span> sau{" "}
          <span className="font-semibold text-white">mdx_extra_q</span>.
        </div>
      </section>

      {/* ── Why free ── */}
      <section className="mx-auto max-w-7xl px-6 py-8 md:px-10 md:py-12">
        <div className="rounded-[36px] border border-white/10 bg-white/5 p-8">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-white/40">De ce este gratuit?</p>
              <h2 className="mt-3 text-3xl font-semibold md:text-5xl">
                Important nu este modelul. Important este ce poți face cu rezultatul.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-white/60">
                Acest tool există pentru un scop simplu: să îți ofere rapid stem-uri utile, curate
                și ușor de folosit. În loc să pierzi timp cu instalări, setări și workflow-uri
                complicate, încarci fișierul și primești direct ce te interesează.
              </p>
              <p className="mt-4 max-w-2xl text-base leading-8 text-white/60">
                Tool-ul rulează pe infrastructură care implică costuri reale de procesare. L-am
                făcut disponibil gratuit pentru că poate fi util creatorilor, editorilor și celor
                care au nevoie de separare audio rapidă.
              </p>
              <p className="mt-4 max-w-2xl text-base leading-8 text-white/60">
                Dacă ți-a fost util și vrei să susții proiectul, poți contribui printr-o donație.
              </p>
            </div>
            <div className="grid gap-4">
              {["Remixuri și mashup-uri", "Karaoke și instrumental", "Voice cleanup pentru content", "Sampling și re-editare"].map(
                (item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-black/25 px-5 py-4">
                    {item}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Tool ── */}
      <section ref={toolRef} className="mx-auto max-w-7xl px-6 py-10 md:px-10 md:py-14">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-white/40">Tool</p>
            <h2 className="mt-3 text-3xl font-semibold md:text-5xl">Încearcă acum</h2>
          </div>
          <div className="hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/55 md:block">
            Uploadezi. Procesezi. Descarci.
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          {/* Upload panel */}
          <div className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
            <div
              onDragOver={(e) => { e.preventDefault(); if (!isBusy) setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!isBusy) handleFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`rounded-[28px] border border-dashed p-6 transition ${
                dragOver ? "border-white bg-white/10" : "border-white/15 bg-black/20"
              }`}
            >
              <div className="flex flex-col gap-5">
                <div>
                  <p className="text-lg font-medium">Încarcă fișier audio</p>
                  <p className="mt-1 text-sm text-white/55">
                    MP3, WAV, M4A, AAC, FLAC, OGG, WEBM · maxim {MAX_FILE_SIZE_MB} MB
                  </p>
                </div>

                <label
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.03] px-6 py-10 text-center transition hover:bg-white/[0.06] ${
                    isBusy ? "pointer-events-none opacity-50" : ""
                  }`}
                >
                  <div className="mb-3 text-4xl">🎵</div>
                  <div className="text-base font-medium">Trage fișierul aici</div>
                  <div className="mt-1 text-sm text-white/50">sau apasă pentru selectare</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.webm"
                    className="hidden"
                    disabled={isBusy}
                    onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  />
                </label>

                {file && (
                  <div className="rounded-[22px] border border-white/10 bg-white/[0.04] px-5 py-4">
                    <p className="text-sm text-white/50">Fișier selectat</p>
                    <p className="mt-1 break-all text-base font-medium">{file.name}</p>
                    <p className="mt-1 text-sm text-white/45">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                )}

                {error && (
                  <p className="rounded-[18px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                  </p>
                )}

                {/* Model selector */}
                <div className="rounded-[22px] border border-white/10 bg-black/25 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white/80">Model selectat</p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60">
                      recomandare: htdemucs
                    </span>
                  </div>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={isBusy}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none disabled:opacity-50"
                  >
                    <option value="htdemucs">htdemucs · recomandat pentru majoritatea cazurilor</option>
                    <option value="htdemucs_ft">htdemucs_ft · mai lent, adesea mai curat</option>
                    <option value="mdx_extra">mdx_extra · alternativă bună pentru comparație</option>
                    <option value="mdx_extra_q">mdx_extra_q · mai rapid, mai light</option>
                  </select>
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-medium text-white">{MODEL_DETAILS[model].title}</p>
                    <p className="mt-1 text-sm text-white/70">{MODEL_DETAILS[model].short}</p>
                    <p className="mt-2 text-sm leading-6 text-white/55">{MODEL_DETAILS[model].description}</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    onClick={handleUpload}
                    disabled={!file || isBusy}
                    className="rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isBusy ? "Se procesează..." : "Generează stem-uri"}
                  </button>
                  <button
                    onClick={() => resetJob(true)}
                    className="rounded-2xl border border-white/10 px-6 py-3 font-medium text-white/90 transition hover:bg-white/5"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Monitor panel */}
          <aside className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Monitor job</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70">
                {STATUS_TEXT[status]}
              </span>
            </div>

            {/* Progress */}
            <div className="rounded-[24px] border border-white/10 bg-black/25 p-5">
              <div className="mb-3 flex items-center justify-between text-sm text-white/60">
                <span>Progres</span>
                <span>{clampedProgress}%</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-white to-white/70 transition-all duration-500"
                  style={{ width: `${clampedProgress}%` }}
                />
              </div>
              <p className="mt-4 text-sm leading-6 text-white/55">{statusNote}</p>
            </div>

            {/* Status + Job ID */}
            <div className="mt-6 grid gap-4">
              <div className="rounded-[24px] border border-white/10 bg-black/25 p-5">
                <p className="text-sm text-white/45">Status</p>
                <p className="mt-1 text-lg font-medium">{STATUS_TEXT[status]}</p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/25 p-5">
                <p className="text-sm text-white/45">Job ID</p>
                <p className="mt-1 break-all text-sm text-white/75">{jobId || "—"}</p>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-[24px] border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
                  <div className="font-medium">A apărut o eroare</div>
                  <div className="mt-1">{error}</div>
                  {file && (
                    <button
                      onClick={handleUpload}
                      className="mt-4 rounded-xl border border-red-300/20 bg-red-400/10 px-4 py-2 text-sm font-medium text-red-100 transition hover:bg-red-400/20"
                    >
                      Încearcă din nou
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Results */}
            {status === "done" && availableStems.length > 0 && (
              <div className="mt-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Rezultate</h3>
                  <button
                    onClick={handleDownloadAll}
                    className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/5"
                  >
                    Descarcă tot
                  </button>
                </div>
                <div className="grid gap-4">
                  {availableStems.map((stem) => {
                    const meta = STEM_META[stem] ?? { label: stem, icon: "🎧", description: "Stem audio procesat" };
                    return (
                      <div key={stem} className="rounded-[22px] border border-white/10 bg-black/25 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{meta.icon}</span>
                              <h3 className="text-base font-semibold">{meta.label}</h3>
                            </div>
                            <p className="mt-1 text-sm text-white/55">{meta.description}</p>
                          </div>
                          <button
                            onClick={() => handleDownloadStem(stem)}
                            aria-label={`Descarcă ${meta.label}`}
                            className="shrink-0 rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/5"
                          >
                            Descarcă
                          </button>
                        </div>
                        <audio
                          className="mt-4 w-full"
                          controls
                          preload="none"
                          src={stemUrl(jobId, stem)}
                        >
                          Browserul tău nu suportă audio preview.
                        </audio>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Donate */}
            <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
              <h3 className="mb-3 text-xl font-semibold">💖 Susține acest proiect</h3>
              <p className="mb-4 text-white/65">
                Acest tool rulează pe servere AI care implică costuri reale. Dacă ți-a economisit
                timp sau ți-a fost util, îl poți susține printr-o donație.
              </p>
              <p className="mb-5 text-sm text-white/45">
                Orice contribuție ajută la menținerea proiectului gratuit.
              </p>
              <div className="flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
                {[
                  { href: "https://revolut.me/adrian4sbr",         label: "Donează prin Revolut", primary: true },
                  { href: "https://buymeacoffee.com/vocalremoverpro", label: "Buy Me a Coffee",     primary: false },
                  { href: "https://paypal.me/Adriangrs88",           label: "Donează prin PayPal",  primary: false },
                ].map(({ href, label, primary }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={
                      primary
                        ? "rounded-xl bg-white px-6 py-3 font-semibold text-black transition hover:opacity-90"
                        : "rounded-xl border border-white/20 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
                    }
                  >
                    {label}
                  </a>
                ))}
              </div>
              <p className="mt-4 text-xs text-white/35">Mulțumesc pentru susținere.</p>
            </div>
          </aside>
        </div>
      </section>

      {/* ── Audio Analyzer ── */}
      <section className="mx-auto max-w-7xl px-6 py-10 md:px-10 md:py-14">
        <AudioAnalyzer />
      </section>

      {/* ── FAQ ── */}
      <section className="mx-auto max-w-7xl px-6 py-10 md:px-10 md:py-14">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-white/40">Întrebări frecvente</p>
          <h2 className="mt-3 text-3xl font-semibold md:text-5xl">FAQ</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {FAQ_ITEMS.map(([q, a]) => (
            <div key={q} className="rounded-[28px] border border-white/10 bg-white/5 p-6">
              <h3 className="text-lg font-semibold">{q}</h3>
              <p className="mt-3 text-sm leading-7 text-white/60">{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-white/45 md:flex-row md:items-center md:justify-between md:px-10">
          <p>Proiect independent construit pentru comunitate.</p>
          <div className="flex gap-4">
            <button onClick={scrollToTool} className="transition hover:text-white">
              Încearcă gratuit
            </button>
            <a href="#cum-functioneaza" className="transition hover:text-white">
              Vezi cum funcționează
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
