import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/input";
import { cn } from "@/lib/utils";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: {
    resultIndex: number;
    results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
  }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognition(): Rec | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Rec;
    webkitSpeechRecognition?: new () => Rec;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "fr-BE";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  return rec;
}

/** Android Chrome often prepends the same opening words on every chunk. */
export function collapseSpeechRepeats(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  for (let guard = 0; guard < 8; guard++) {
    const words = t.split(" ").filter(Boolean);
    if (words.length < 4) break;
    let cut = 0;
    const max = Math.floor(words.length / 2);
    for (let k = max; k >= 2; k--) {
      const a = words.slice(0, k).join(" ").toLowerCase();
      const b = words.slice(k, 2 * k).join(" ").toLowerCase();
      if (a === b) {
        cut = k;
        break;
      }
    }
    if (!cut) break;
    t = words.slice(cut).join(" ");
  }
  return t;
}

export function VoiceCapture({
  value,
  onChange,
}: {
  value: string;
  onChange: (t: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<Rec | null>(null);
  const committedRef = useRef("");
  const wantRef = useRef(false);

  useEffect(() => {
    return () => {
      wantRef.current = false;
      recRef.current?.abort();
    };
  }, []);

  function toggle() {
    if (listening) {
      wantRef.current = false;
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = getRecognition();
    if (!rec) {
      setSupported(false);
      return;
    }
    committedRef.current = value.trim();
    wantRef.current = true;

    rec.onresult = (ev) => {
      let interim = "";
      let committed = committedRef.current;
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) {
          committed = collapseSpeechRepeats(`${committed} ${t}`.trim());
          committedRef.current = committed;
        } else {
          interim += t;
        }
      }
      onChange(collapseSpeechRepeats(`${committed} ${interim}`.trim()));
    };
    rec.onerror = (ev) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (ev.error === "language-not-supported") {
        rec.lang = "fr-FR";
        return;
      }
      wantRef.current = false;
      setListening(false);
    };
    rec.onend = () => {
      if (wantRef.current) {
        try {
          rec.start();
        } catch {
          setListening(false);
        }
        return;
      }
      setListening(false);
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide text-muted">Note vocale continue</p>
        <Button
          type="button"
          size="sm"
          variant={listening ? "danger" : "secondary"}
          onClick={toggle}
          className={cn(listening && "animate-pulse")}
        >
          {listening ? <Square /> : <Mic />}
          {listening ? "Stop" : "Dicter"}
        </Button>
      </div>
      {!supported && (
        <p className="mb-2 text-xs text-warn">
          La dictée n'est pas disponible sur ce navigateur — saisissez l'observation.
        </p>
      )}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Dictez sans vous arrêter : danger, mesure, zone / matériel. L'IA séparera les 3 blocs."
        rows={4}
      />
    </div>
  );
}
