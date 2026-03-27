"use client";

import { useState } from "react";

const ANALYZE_API = process.env.NEXT_PUBLIC_API_URL!;

type AnalysisResult = {
  success?: boolean;
  bpm?: number;
  key?: string;
  confidence?: number;
  analyzed_from?: string;
  error?: string;
  detail?: string;
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

const MAX_FILE_SIZE_MB = 100;

export default function AudioAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validateFile = (picked: File | null): string => {
    if (!picked) return "Selectează un fișier audio.";

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

  const handleAnalyze = async () => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!file) {
      setError("Selectează un fișier audio.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${ANALYZE_API}/analyze`, {
        method: "POST",
        body: form,
      });

      let data: AnalysisResult | null = null;

      try {
        data = await res.json();
      } catch {
        throw new Error("Serverul a returnat un răspuns invalid.");
      }

      if (!res.ok) {
        throw new Error(data?.error || data?.detail || "Eroare la analiză.");
      }

      setResult(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("A apărut o eroare.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
      <div className="mb-6">
        <div className="mb-4 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
          BPM + Key Detection
        </div>

        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Audio Analyzer
        </h2>

        <p className="mt-3 max-w-2xl text-base leading-7 text-white/65">
          Încarcă un fișier și detectează BPM, key și confidence.
        </p>
      </div>

      <div className="rounded-[28px] border border-white/15 bg-black/20 p-6">
        <div className="flex flex-col gap-5">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-white/10 bg-white/[0.03] px-6 py-10 text-center transition hover:bg-white/[0.06]">
            <div className="mb-3 text-4xl">🎼</div>
            <div className="text-base font-medium">Alege fișierul pentru analiză</div>
            <div className="mt-1 text-sm text-white/50">
              MP3, WAV, M4A, AAC, FLAC, OGG, WEBM · maxim {MAX_FILE_SIZE_MB} MB
            </div>

            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.webm"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0] || null;
                setFile(picked);
                setResult(null);
                setError("");
              }}
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

          <button
            onClick={handleAnalyze}
            disabled={!file || loading}
            className="rounded-2xl bg-white px-6 py-3 font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Se analizează..." : "Analizează BPM + Key"}
          </button>

          {error && (
            <div className="rounded-[24px] border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
              <div className="font-medium">A apărut o eroare</div>
              <div className="mt-1">{error}</div>
            </div>
          )}

          {result && (
            <div className="rounded-[24px] border border-white/10 bg-black/25 p-5">
              <h3 className="text-xl font-semibold">Rezultat analiză</h3>

              <div className="mt-4 grid gap-3 text-white/85">
                <p>
                  <strong>BPM:</strong> {result.bpm ?? "—"}
                </p>
                <p>
                  <strong>Key:</strong> {result.key ?? "—"}
                </p>
                <p>
                  <strong>Confidence:</strong>{" "}
                  {typeof result.confidence === "number" ? `${result.confidence}%` : "—"}
                </p>
                <p>
                  <strong>Analyzed from:</strong> {result.analyzed_from ?? "—"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
