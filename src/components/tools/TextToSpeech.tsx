import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Check, Eraser, Play, Pause, Volume2 } from "lucide-react";

export function TextToSpeech() {
  const [text, setText] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string>("");
  const [rate, setRate] = useState<number>(1);
  const [pitch, setPitch] = useState<number>(1);
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadVoices = useCallback(() => {
    const available = window.speechSynthesis.getVoices();
    if (available.length === 0) return;
    setVoices(available);
    setSelectedVoiceUri((prev) => {
      if (prev && available.some((v) => v.voiceURI === prev)) return prev;
      const defaultVoice =
        available.find((v) => v.default) ?? available.find((v) => v.lang.startsWith("en")) ?? available[0];
      return defaultVoice?.voiceURI ?? "";
    });
  }, []);

  useEffect(() => {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [loadVoices]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSpeaking(window.speechSynthesis.speaking);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const selectedVoice = useMemo(
    () => voices.find((v) => v.voiceURI === selectedVoiceUri) ?? voices[0] ?? null,
    [voices, selectedVoiceUri],
  );

  const handleSpeak = useCallback(() => {
    if (!text.trim() || !selectedVoice) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = selectedVoice;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }, [text, selectedVoice, rate, pitch]);

  const handleStop = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [text]);

  const languageGroups = useMemo(() => {
    const map = new Map<string, SpeechSynthesisVoice[]>();
    for (const voice of voices) {
      const lang = voice.lang || "Unknown";
      if (!map.has(lang)) map.set(lang, []);
      map.get(lang)!.push(voice);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [voices]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">TEXT</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setText("")}
            disabled={!text}
            className="h-7 gap-1.5 text-xs"
          >
            <Eraser className="h-3.5 w-3.5" /> Clear
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={!text}
            className="h-7 gap-1.5 text-xs"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type or paste text to speak..."
        className="min-h-[160px] rounded-2xl border-border bg-card text-foreground placeholder:text-muted-foreground/60"
      />

      <div className="grid gap-4 rounded-2xl border border-border bg-secondary/30 p-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            <Volume2 className="h-3.5 w-3.5" /> VOICE
          </label>
          <Select value={selectedVoiceUri} onValueChange={setSelectedVoiceUri} disabled={voices.length === 0}>
            <SelectTrigger className="rounded-xl border-border bg-card">
              <SelectValue placeholder="Loading voices..." />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {languageGroups.map(([lang, group]) => (
                <div key={lang}>
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {lang}
                  </p>
                  {group.map((voice) => (
                    <SelectItem key={voice.voiceURI} value={voice.voiceURI} className="text-xs">
                      {voice.name}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">SPEED</label>
            <span className="text-xs tabular-nums text-foreground">{rate.toFixed(1)}x</span>
          </div>
          <Slider
            value={[rate]}
            min={0.5}
            max={2}
            step={0.1}
            onValueChange={([v]) => v != null && setRate(v)}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">PITCH</label>
            <span className="text-xs tabular-nums text-foreground">{pitch.toFixed(1)}</span>
          </div>
          <Slider
            value={[pitch]}
            min={0.5}
            max={2}
            step={0.1}
            onValueChange={([v]) => v != null && setPitch(v)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={speaking ? handleStop : handleSpeak}
          disabled={!text.trim() || voices.length === 0}
          className="rounded-full px-6"
        >
          {speaking ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
          {speaking ? "Stop" : "Speak"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {voices.length === 0
            ? "No voices available in this browser."
            : `${voices.length} voice${voices.length === 1 ? "" : "s"} available`}
        </p>
      </div>
    </div>
  );
}
