"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const API = "https://aiyiz7019bk9xi-8000.proxy.runpod.net";

type JobStatus = "idle" | "uploading" | "queued" | "processing" | "done" | "error";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<JobStatus>("idle");
  const [error, setError] = useState("");
  const [model, setModel] = useState("htdemucs");
  const [dragOver, setDragOver] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [stems, setStems] = useState<Record<string, string>>({});
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stemUrl = (stemName: string) => `${API}/download/stem/${jobId}/${stemName}`;

  const resetJob = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setJobId("");
    setProgress(0);
    setStatus("idle");
    setError("");
    setIsBusy(false);
    setStems({});
  };

  const handleFile = (picked: File | null) => {
    if (!picked) return;
    resetJob();
    setFile(picked);
  };

  const pollStatus = async (id: string) => {
    try {
      const res = await fetch(`${API}/status/${id}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Status request failed");
      }

      setStatus((data.status || "processing") as JobStatus);
      setProgress(typeof data.progress === "number" ? data.progress : 0);
      setStems(data.stems || {});

      if (data.status === "done") {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setIsBusy(false);
      }

      if (data.status === "error") {
        setError(data.error || "Procesarea a eșuat.");
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setIsBusy(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu am putut verifica statusul.");
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      setStatus("error");
      setIsBusy(false);
    }
  };

  const startPolling = (id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollStatus(id);
    pollRef.current = setInterval(() => pollStatus(id), 2500);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Selectează un fișier audio mai întâi.");
      return;
    }

    setError("");
    setStatus("uploading");
    setProgress(5);
    setIsBusy(true);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API}/upload?model=${encodeURIComponent(model)}`, {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail || data?.error || "Upload failed");
      }

      setJobId(data.job_id);
      setStatus("queued");
      setProgress(10);
      startPolling(data.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus("error");
      setProgress(0);
      setIsBusy(false);
    }
  };

  const statusText: Record<JobStatus, string> = {
    idle: "Așteaptă fișier",
    uploading: "Se încarcă",
    queued: "În coadă",
    processing: "Separare audio în curs",
    done: "Stem-uri pregătite",
    error: "Eroare",
  };

  const availableStems = useMemo(() => Object.keys(stems || {}), [stems]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c1c2b,transparent_35%),linear-gradient(180deg,#0b0b10_0%,#09090b_100%)] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-8">
              <div className="mb-4 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
                AI stem separation • Producer mode
              </div>
              <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
                Vocal Remover <span className="text-white/60">Pro</span>
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/65 md:text-lg">
                Încarci melodia și primești stem-uri separate pentru vocals, drums, bass și other.
              </p>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFile(e.dataTransfer.files?.[0] || null);
              }}
              className={`rounded-[28px] border border-dashed p-6 transition ${
                dragOver ? "border-white bg-white/10" : "border-white/15 bg-black/20"
              }`}
            >
              <div className="flex flex-col gap-5">
                <div>
                  <p className="text-lg font-medium">Încarcă fișier audio</p>
                  <p className="mt-1 text-sm text-white/55">MP3, WAV, M4A. Drag & drop sau selectează manual.</p>
                </div>

                <label className="flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.03] px-6 py-10 text-center transition hover:bg-white/[0.06]">
                  <div className="mb-3 text-4xl">🎵</div>
                  <div className="text-base font-medium">Drop file here</div>
                  <div className="mt-1 text-sm text-white/50">sau apasă pentru selectare</div>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0] || null)}
                  />
                </label>

                {file && (
                  <div className="rounded-[22px] border border-white/10 bg-white/[0.04] px-5 py-4">
                    <p className="text-sm text-white/50">Fișier selectat</p>
                    <p className="mt-1 break-all text-base font-medium">{file.name}</p>
                    <p className="mt-1 text-sm text-white/45">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
                  >
                    <option value="htdemucs">htdemucs · rapid</option>
                    <option value="htdemucs_ft">htdemucs_ft · calitate mai mare</option>
                    <option value="mdx_extra">mdx_extra</option>
                    <option value="mdx_extra_q">mdx_extra_q</option>
                  </select>

                  <button
                    onClick={handleUpload}
                    disabled={!file || isBusy}
                    className="rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isBusy ? "Processing..." : "Generate Stems"}
                  </button>

                  <button
                    onClick={() => {
                      setFile(null);
                      resetJob();
                    }}
                    className="rounded-2xl border border-white/10 px-6 py-3 font-medium text-white/90 transition hover:bg-white/5"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </section>

          <aside className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Job Monitor</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/70">
                {statusText[status]}
              </span>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-black/25 p-5">
              <div className="mb-3 flex items-center justify-between text-sm text-white/60">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-white to-white/70 transition-all duration-500"
                  style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
                />
              </div>
              <p className="mt-4 text-sm leading-6 text-white/55">
                {status === "processing"
                  ? "Modelul AI separă stem-urile. Modelele mai grele durează mai mult."
                  : status === "done"
                  ? "Stem-urile sunt gata de descărcare."
                  : status === "error"
                  ? "Procesarea s-a oprit. Verifică mesajul de eroare."
                  : "Încarcă un fișier pentru a porni separarea audio."}
              </p>
            </div>

            <div className="mt-6 grid gap-4">
              <div className="rounded-[24px] border border-white/10 bg-black/25 p-5">
                <p className="text-sm text-white/45">Status</p>
                <p className="mt-1 text-lg font-medium">{statusText[status]}</p>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/25 p-5">
                <p className="text-sm text-white/45">Job ID</p>
                <p className="mt-1 break-all text-sm text-white/75">{jobId || "—"}</p>
              </div>

              {error && (
                <div className="rounded-[24px] border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
                  {error}
                </div>
              )}
            </div>

            {status === "done" && availableStems.length > 0 && (
              <div className="mt-6 grid gap-3">
                {availableStems.map((stem) => (
                  <a
                    key={stem}
                    href={stemUrl(stem)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl border border-white/10 px-5 py-4 text-center font-medium text-white transition hover:bg-white/5"
                  >
                    Download {stem.charAt(0).toUpperCase() + stem.slice(1)}
                  </a>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}