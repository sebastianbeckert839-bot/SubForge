"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTool } from "@/lib/tools";
import { useAudioStore } from "@/store/audio";
import type { Channels } from "@/lib/audio/dsp";
import { encodeWav, estimateWavBytes, type WavBitDepth } from "@/lib/audio/wav";
import { encodeMp3, estimateMp3Bytes, mp3Available } from "@/lib/audio/mp3";
import { downloadBlob, formatBytes } from "@/lib/audio/engine";

type FormatId = "wav16" | "wav24" | "wav32" | "mp3-320" | "mp3-192" | "mp3-128";

export function DownloadPanel({
  channels,
  fs,
  toolId,
  stale = false,
}: {
  channels: Channels;
  fs: number;
  toolId: string;
  /** true while a newer preview is being processed — blocks stale exports */
  stale?: boolean;
}) {
  const tool = getTool(toolId);
  const baseName = useAudioStore((s) => s.baseName);
  const [mp3Ok, setMp3Ok] = useState(false);
  const [format, setFormat] = useState<FormatId>("wav16");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    mp3Available().then((ok) => {
      if (alive) setMp3Ok(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const options = useMemo(() => {
    const opts: { value: FormatId; label: string }[] = [
      { value: "wav16", label: "WAV · 16-bit (universal)" },
      { value: "wav24", label: "WAV · 24-bit (studio)" },
      { value: "wav32", label: "WAV · 32-bit float (lossless)" },
    ];
    if (mp3Ok) {
      opts.push(
        { value: "mp3-320", label: "MP3 · 320 kbps" },
        { value: "mp3-192", label: "MP3 · 192 kbps" },
        { value: "mp3-128", label: "MP3 · 128 kbps" }
      );
    }
    return opts;
  }, [mp3Ok]);

  const sizeEstimate = useMemo(() => {
    switch (format) {
      case "wav16":
        return estimateWavBytes(channels, 16);
      case "wav24":
        return estimateWavBytes(channels, 24);
      case "wav32":
        return estimateWavBytes(channels, 32);
      case "mp3-320":
        return estimateMp3Bytes(channels, fs, 320);
      case "mp3-192":
        return estimateMp3Bytes(channels, fs, 192);
      case "mp3-128":
        return estimateMp3Bytes(channels, fs, 128);
    }
  }, [format, channels, fs]);

  const download = async () => {
    setBusy(true);
    try {
      const suffix = tool?.suffix ?? toolId;
      if (format.startsWith("wav")) {
        const depth = (format === "wav16"
          ? 16
          : format === "wav24"
            ? 24
            : 32) as WavBitDepth;
        const blob = encodeWav(channels, fs, depth);
        downloadBlob(blob, `${baseName}-${suffix}.wav`);
      } else {
        const kbps = parseInt(format.split("-")[1], 10);
        const blob = await encodeMp3(channels, fs, kbps);
        if (!blob) throw new Error("MP3 encoder unavailable — pick WAV instead.");
        downloadBlob(blob, `${baseName}-${suffix}.mp3`);
      }
      toast.success(`Download started — ${baseName}-${suffix}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Encoding failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Download className="size-4 text-primary" />
          Download
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Select value={format} onValueChange={(v) => setFormat(v as FormatId)}>
          <SelectTrigger aria-label="Export format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Approx. size: {formatBytes(sizeEstimate)} · full quality export
        </p>
        <Button
          onClick={download}
          disabled={busy || stale}
          size="lg"
          className="w-full"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Encoding…
            </>
          ) : stale ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Updating preview…
            </>
          ) : (
            <>
              <Download className="size-4" />
              Download {format.startsWith("wav") ? "WAV" : "MP3"}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
