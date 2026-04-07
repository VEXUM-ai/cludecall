import type { TranscriptEntry } from "@/lib/types";

export type TranscriptTailCoverageAssessment = {
  lastTranscriptEntry: TranscriptEntry | null;
  lastTranscriptTimeInCallSecs: number | null;
  transcriptTailGapSecs: number | null;
  tailCoverageRequired: boolean;
  reasons: string[];
};

export function assessTranscriptTailCoverage(args: {
  durationSecs: number | null;
  transcript: TranscriptEntry[];
}): TranscriptTailCoverageAssessment {
  const lastTranscriptEntry =
    args.transcript.length > 0 ? args.transcript[args.transcript.length - 1] : null;
  const lastTranscriptTimeInCallSecs = lastTranscriptEntry?.timeInCallSecs ?? null;
  const transcriptTailGapSecs =
    typeof args.durationSecs === "number" && typeof lastTranscriptTimeInCallSecs === "number"
      ? Math.max(args.durationSecs - lastTranscriptTimeInCallSecs, 0)
      : null;

  const reasons: string[] = [];
  if (typeof transcriptTailGapSecs === "number" && transcriptTailGapSecs >= 15) {
    reasons.push("tail_gap_gte_15s");
  }
  if (lastTranscriptEntry?.role === "agent") {
    reasons.push("last_role_agent");
  }

  return {
    lastTranscriptEntry,
    lastTranscriptTimeInCallSecs,
    transcriptTailGapSecs,
    tailCoverageRequired: reasons.length > 0,
    reasons,
  };
}
