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
  vocals: { label: "Vocals", icon: "🎤", description: "Vocea principală separată" },
  drums: { label: "Drums", icon: "🥁", description: "Percuție și ritm" },
  bass: { label: "Bass", icon: "🎸", description: "Linia de bass separată" },
  other: { label: "Other", icon: "🎹", description: "Restul instrumentelor" },
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState("");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<JobStatus>("idle");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [stems, setStems] = useState<Record<string, string>>({});

  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const toolRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stemUrl = (stemName: string) => `${API}/download/stem/${jobId}/${stemName}`;

  const handleUpload = async () => {
    if (!file) return;

    setStatus("uploading");
    setIsBusy(true);

    const form = new FormData();
    form.append("file", file);

    const res = await fetch(`${API}/upload`, {
      method: "POST",
      body: form,
    });

    const data = await res.json();
    setJobId(data.job_id);
    setStatus("processing");

    pollRef.current = setInterval(async () => {
      const r = await fetch(`${API}/status/${data.job_id}`);
      const d: StatusResponse = await r.json();

      setProgress(d.progress || 0);
      setStatus(d.status || "processing");

      if (d.status === "done") {
        clearInterval(pollRef.current!);
        setIsBusy(false);
        setStems(d.stems || {});
      }
    }, 2000);
  };

  const availableStems = useMemo(() => Object.keys(stems || {}), [stems]);

  return (
    <main className="min-h-screen bg-black text-white p-10">

      <h1 className="text-4xl font-bold mb-10">Vocal Remover Pro</h1>

      <input
        type="file"
        accept="audio/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="mb-6"
      />

      <button
        onClick={handleUpload}
        className="bg-white text-black px-6 py-3 rounded-xl mb-10"
      >
        Start
      </button>

      <div className="mb-10">
        Status: {status} — {progress}%
      </div>

      {status === "done" && (
        <div>
          <h2 className="text-2xl mb-4">Rezultate</h2>

          {availableStems.map((stem) => (
            <div key={stem} className="mb-6">
              <div>{stem}</div>

              <audio controls src={stemUrl(stem)} className="w-full mt-2" />

              <a
                href={stemUrl(stem)}
                target="_blank"
                className="underline mt-2 block"
              >
                Download
              </a>
            </div>
          ))}
        </div>
      )}

      {/* DONATIONS ALWAYS VISIBLE */}

      <div className="mt-20 border border-white/20 p-8 rounded-3xl text-center">
        <h3 className="text-2xl mb-4">💖 Susține proiectul</h3>

        <p className="mb-6 text-white/60">
          Toolul rulează pe servere AI cu costuri reale.  
          Dacă ți-a fost util, poți contribui.
        </p>

        <div className="flex flex-col gap-3 items-center">
          <a
            href="https://revolut.me/adrian4sbr"
            target="_blank"
            className="bg-white text-black px-6 py-3 rounded-xl"
          >
            Revolut
          </a>

          <a
            href="https://paypal.me/Adriangrs88"
            target="_blank"
            className="border border-white px-6 py-3 rounded-xl"
          >
            PayPal
          </a>

          <a
            href="https://buymeacoffee.com/vocalremoverpro"
            target="_blank"
            className="border border-white px-6 py-3 rounded-xl"
          >
            BuyMeACoffee
          </a>
        </div>
      </div>

    </main>
  );
}
