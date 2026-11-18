"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAudioStore } from "@/store/audio";
import {
  decodeAudioFile,
  isAudioFile,
  sanitizeBaseName,
} from "@/lib/audio/engine";

export function FileDrop() {
  const [dragging, setDragging] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const setAudio = useAudioStore((s) => s.setAudio);

  const handleFile = useCallback(
    async (file: File) => {
      if (!isAudioFile(file)) {
        toast.error("That doesn't look like an audio file. Try MP3, WAV, FLAC, OGG or M4A.");
        return;
      }
      setDecoding(true);
      try {
        const { channels, fs, durationSec } = await decodeAudioFile(file);
        setAudio(
          channels,
          fs,
          {
            name: file.name,
            sizeBytes: file.size,
            durationSec,
            channels: channels.length,
            sampleRate: fs,
          },
          sanitizeBaseName(file.name)
        );
        toast.success(
          `Loaded "${file.name}" — ${Math.floor(durationSec / 60)}:${String(
            Math.floor(durationSec % 60)
          ).padStart(2, "0")}, ${channels.length >= 2 ? "stereo" : "mono"}`
        );
        if (durationSec > 12 * 60) {
          toast.warning("Long file detected — processing may take a little while.");
        }
      } catch (e) {
        console.error(e);
        toast.error(
          "Could not decode this file. It may be unsupported or corrupted."
        );
      } finally {
        setDecoding(false);
      }
    },
    [setAudio]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload an audio file"
      onClick={() => !decoding && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !decoding) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && !decoding) void handleFile(file);
      }}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all",
        dragging
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/50 hover:bg-accent/40",
        decoding && "pointer-events-none opacity-80"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.flac,.ogg,.oga,.m4a,.aac,.opus,.aif,.aiff"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {decoding ? (
        <>
          <Loader2 className="mb-4 size-10 animate-spin text-primary" />
          <p className="font-medium">Decoding audio…</p>
        </>
      ) : (
        <>
          <div className="bg-brand mb-4 flex size-14 items-center justify-center rounded-2xl shadow-sm transition-transform group-hover:scale-105">
            <Upload className="size-6 text-white" />
          </div>
          <p className="text-lg font-semibold">Drop your track here</p>
          <p className="mt-1 text-sm text-muted-foreground">
            or <span className="text-primary underline underline-offset-2">click to browse</span>
          </p>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground/70">
            <Lock className="size-3" />
            MP3, WAV, FLAC, OGG, M4A — processed 100% locally
          </p>
        </>
      )}
    </div>
  );
}
