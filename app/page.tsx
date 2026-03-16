"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const API = "https://aiyiz7019bk9xi-8000.proxy.runpod.net";
const MAX_FILE_SIZE_MB = 100;

type JobStatus = "idle" | "uploading" | "queued" | "processing" | "done" | "error";

type StatusResponse = {
  status?: JobStatus;
  progress?: number;
  stems?: Record<string, string>;
  error?: string;
};

const ACCEPTED_AUDIO_TYPES = [
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
];

const STEM_META: Record<string, { label: string; icon: string; description: string }> = {
  vocals: {
    label: "Vocals",
    icon: "🎤",
    description: "Vocea principală separată",
  },
  drums: {
    label: "Drums",
    icon: "🥁",
    description: "Percuție și ritm",
  },
  bass: {
    label: "Bass",
    icon: "🎸",
    description: "Linia de bass separată",
  },
  other: {
    label: "Other",
    icon: "🎹",
    description: "Restul instrumentelor",
  },
};

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
  const [statusNote, setStatusNote] = useState("Încarcă un fișier pentru a porni separarea audio.");

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const clearPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const stemUrl = (stemName: string, id = jobId) => `${API}/download/stem/${id}/${stemName}`;

  const validateFile = (picked: File | null): string => {
    if (!picked) return "Nu ai selectat niciun fișier.";

    const sizeMb = picked.size / 1024 / 1024;
    if (sizeMb > MAX_FILE_SIZE_MB) {
      return `Fișierul este prea mare. Limita este ${MAX_FILE_SIZE_MB} MB.`;
    }

    const hasValidMime = ACCEPTED_AUDIO_TYPES.includes(picked.type);
    const hasAudioFallback =
      picked.type.startsWith("audio/") ||
      /\.(mp3|wav|m4a|aac|flac|ogg|webm)$/i.test(picked.name);

    if (!hasValidMime && !hasAudioFallback) {
      return "Format invalid. Încarcă MP3, WAV, M4A, AAC, FLAC, OGG sau WEBM.";
    }

    return "";
  };

  const resetJob = (removeFile = false) => {
    clearPolling();
    setJobId("");
    setProgress(0);
    setStatus("idle");
    setError("");
    setIsBusy(false);
    setStems({});
    setStatusNote("Încarcă un fișier pentru a porni separarea audio.");

    if (removeFile) {
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFile = (picked: File | null) => {
    const validationError = validateFile(picked);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    resetJob(false);
    setFile(picked);
    setStatusNote("Fișier selectat. Poți porni separarea stem-urilor.");
  };

  const pollStatus = async (id: string) => {
    try {
      const res = await fetch(`${API}/status/${id}`, {
        cache: "no-store",
      });

      const data: StatusResponse = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Status request failed");
      }

      const nextStatus = (data.status || "processing") as JobStatus;
      const nextProgress =
        typeof data.progress === "number"
          ? Math.max(0, Math.min(100, data.progress))
          : 0;

      setStatus(nextStatus);
      setProgress(nextProgress);
      setStems(data.stems || {});

      if (nextStatus === "queued") {
        setStatusNote("Jobul a intrat în coadă. Așteaptă alocarea procesării.");
      }

      if (nextStatus === "processing") {
        setStatusNote("Modelul AI separă vocals, drums, bass și other.");
      }

      if (nextStatus === "done") {
        clearPolling();
        setIsBusy(false);
        setProgress(100);
        setStatusNote("Stem-urile sunt gata. Acum ai preview și download.");
      }

      if (nextStatus === "error") {
        clearPolling();
        setIsBusy(false);
        setError(data.error || "Procesarea a eșuat.");
        setStatusNote("Procesarea s-a oprit.");
      }
    } catch (err) {
      clearPolling();
      setStatus("error");
      setIsBusy(false);
      setError(err instanceof Error ? err.message : "Nu am putut verifica statusul.");
      setStatusNote("Conexiunea cu serverul a eșuat.");
    }
  };

  const startPolling = (id: string) => {
    clearPolling();
    pollStatus(id);
    pollRef.current = setInterval(() => {
      pollStatus(id);
    }, 2500);
  };

  const handleUpload = async () => {
    if (isBusy) return;

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!file) {
      setError("Selectează un fișier audio mai întâi.");
      return;
    }

    setError("");
    setStatus("uploading");
    setProgress(5);
    setIsBusy(true);
    setStems({});
    setStatusNote("Fișierul se încarcă spre server...");

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

      if (!data?.job_id) {
        throw new Error("Serverul nu a returnat un job_id valid.");
      }

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
  };

  const handleRetry = () => {
    if (!file) {
      setError("Nu există fișier pentru retry.");
      return;
    }
    handleUpload();
  };

  const handleDownloadStem = (stem: string, id = jobId) => {
    const url = stemUrl(stem, id);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.download = `${stem}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadAll = async () => {
    const names = Object.keys(stems || {});
    for (const stem of names) {
      handleDownloadStem(stem);
      await new Promise((resolve) => setTimeout(resolve, 250));
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

  const availableStems = useMemo(() => {
    return Object.keys(stems || {}).sort((a, b) => {
      const order = ["vocals", "drums", "bass", "other"];
      const aIndex = order.indexOf(a);
      const bIndex = order.indexOf(b);
      return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    });
  }, [stems]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1c1c2b,transparent_35%),linear-gradient(180deg,#0b0b10_0%,#09090b_100%)] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10 md:px-10">
        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
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
                if (!isBusy) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (isBusy) return;
                handleFile(e.dataTransfer.files?.[0] || null);
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

                <label className={`flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.03] px-6 py-10 text-center transition hover:bg-white/[0.06] ${isBusy ? "pointer-events-none opacity-50" : ""}`}>
                  <div className="mb-3 text-4xl">🎵</div>
                  <div className="text-base font-medium">Drop file here</div>
                  <div className="mt-1 text-sm text-white/50">sau apasă pentru selectare</div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.webm"
                    className="hidden"
                    disabled={isBusy}
                    onChange={(e) => handleFile(e.target.files?.[0] || null)}
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

                <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={isBusy}
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none disabled:opacity-50"
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
                    onClick={() => resetJob(true)}
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

              <p className="mt-4 text-sm leading-6 text-white/55">{statusNote}</p>
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
                  <div className="font-medium">A apărut o eroare</div>
                  <div className="mt-1">{error}</div>
                  {file && (
                    <button
                      onClick={handleRetry}
                      className="mt-4 rounded-xl border border-red-300/20 bg-red-400/10 px-4 py-2 text-sm font-medium text-red-100 transition hover:bg-red-400/20"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </div>

            {status === "done" && availableStems.length > 0 && (
              <div className="mt-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Rezultate</h3>
                  <button
                    onClick={handleDownloadAll}
                    className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/5"
                  >
                    Download All
                  </button>
                </div>

                <div className="grid gap-4">
                  {availableStems.map((stem) => {
                    const meta = STEM_META[stem] || {
                      label: stem,
                      icon: "🎧",
                      description: "Stem audio procesat",
                    };

                    return (
                      <div
                        key={stem}
                        className="rounded-[22px] border border-white/10 bg-black/25 p-4"
                      >
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
                            className="shrink-0 rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/5"
                          >
                            Download
                          </button>
                        </div>

                        <audio
                          className="mt-4 w-full"
                          controls
                          preload="none"
                          src={stemUrl(stem)}
                        >
                          Browserul tău nu suportă audio preview.
                        </audio>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
