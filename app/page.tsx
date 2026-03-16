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
                Descarcă
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
        <a
          href="https://revolut.me/adrian4sbr"
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-white px-6 py-3 font-semibold text-black transition hover:opacity-90"
        >
          Donează prin Revolut
        </a>

        <a
          href="https://buymeacoffee.com/vocalremoverpro"
          target="_blank"
          rel="noreferrer"
          className="rounded-xl border border-white/20 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
        >
          Buy Me a Coffee
        </a>

        <a
          href="https://paypal.me/Adriangrs88"
          target="_blank"
          rel="noreferrer"
          className="rounded-xl border border-white/20 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
        >
          Donează prin PayPal
        </a>
      </div>

      <p className="mt-4 text-xs text-white/35">Mulțumesc pentru susținere.</p>
    </div>
  </div>
)}
