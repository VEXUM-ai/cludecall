export type LiveConversationGuardrailPhase =
  | "intake"
  | "second_choice_optional"
  | "closing";

export type LiveConversationGuardrailState = {
  phase: LiveConversationGuardrailPhase;
  firstChoiceDateHint: string | null;
  firstChoiceTimeHint: string | null;
  secondChoiceDateHint: string | null;
  secondChoiceTimeHint: string | null;
  secondChoiceTimePromptCount: number;
  secondChoiceDateOnlyReplyCount: number;
  lastAgentPromptFingerprint: string | null;
  repeatedAgentPromptCount: number;
  lastUserText: string | null;
  sentUpdateKeys: string[];
};

export type LiveConversationGuardrailEvent =
  | { kind: "user_message"; text: string }
  | { kind: "agent_message"; text: string }
  | { kind: "interruption" };

export type LiveConversationGuardrailUpdate = {
  key: string;
  label: string;
  message: string;
  details: Record<string, string | number | boolean | null>;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeComparableText(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function containsAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

function extractDateHint(text: string) {
  const exactDateMatch = text.match(
    /(20\d{2}[\/\-.年]\d{1,2}[\/\-.月]\d{1,2}日?|\d{1,2}月\d{1,2}日|(?:再来週|来週|今週)[の ]?(?:月|火|水|木|金|土|日)(?:曜日|曜)?|(?:月|火|水|木|金|土|日)(?:曜日|曜)|平日|土日|週末)/
  );
  return exactDateMatch?.[0] ?? null;
}

function extractTimeHint(text: string) {
  const exactTimeMatch = text.match(
    /([01]?\d|2[0-3])(?::([0-5]\d)|時(?:半|[0-5]?\d分?)?)|午前|午後|夕方|夜/
  );
  return exactTimeMatch?.[0] ?? null;
}

function looksLikeClosing(text: string) {
  return containsAny(text, [
    "仮受付",
    "院内で確認",
    "折り返し",
    "確認してご連絡",
    "お電話ありがとうございました",
  ]);
}

function looksLikeQuestion(text: string) {
  return /[?？]$/.test(text) || containsAny(text, ["でしょうか", "ございますか", "いかが", "何時"]);
}

function looksLikeSecondChoicePrompt(text: string) {
  return containsAny(text, [
    "第2希望",
    "第二希望",
    "別日",
    "別のお日にち",
    "ほかの日",
    "他のお日にち",
    "もう一つ",
    "別の候補",
  ]);
}

function looksLikeSecondChoiceTimePrompt(text: string) {
  return (
    looksLikeSecondChoicePrompt(text) &&
    containsAny(text, ["時間", "お時間", "何時", "いつ頃", "午前", "午後", "夕方", "夜"])
  );
}

function buildPromptFingerprint(text: string) {
  const normalized = normalizeComparableText(text);
  if (!looksLikeQuestion(normalized)) {
    return null;
  }
  if (looksLikeSecondChoiceTimePrompt(normalized)) {
    return "ask_second_choice_time";
  }
  if (looksLikeSecondChoicePrompt(normalized)) {
    return "ask_second_choice";
  }
  return normalized.replace(/\d+/g, "#");
}

function hasSentUpdate(state: LiveConversationGuardrailState, key: string) {
  return state.sentUpdateKeys.includes(key);
}

function withSentUpdate(
  state: LiveConversationGuardrailState,
  update: LiveConversationGuardrailUpdate | null
) {
  if (!update || hasSentUpdate(state, update.key)) {
    return {
      state,
      update: null,
    };
  }

  return {
    state: {
      ...state,
      sentUpdateKeys: [...state.sentUpdateKeys, update.key],
    },
    update,
  };
}

export function createLiveConversationGuardrailState(): LiveConversationGuardrailState {
  return {
    phase: "intake",
    firstChoiceDateHint: null,
    firstChoiceTimeHint: null,
    secondChoiceDateHint: null,
    secondChoiceTimeHint: null,
    secondChoiceTimePromptCount: 0,
    secondChoiceDateOnlyReplyCount: 0,
    lastAgentPromptFingerprint: null,
    repeatedAgentPromptCount: 0,
    lastUserText: null,
    sentUpdateKeys: [],
  };
}

export function applyLiveConversationGuardrailEvent(
  currentState: LiveConversationGuardrailState,
  event: LiveConversationGuardrailEvent
) {
  let state = currentState;

  if (event.kind === "interruption") {
    if (!state.lastUserText) {
      return { state, update: null };
    }

    return withSentUpdate(state, {
      key: "honor-latest-user-correction",
      label: "割り込み後は最新の訂正を優先",
      message:
        "Runtime reminder: the user interrupted your previous reply. Discard the interrupted answer, use only the user's latest correction, and do not repeat the interrupted question.",
      details: {
        phase: state.phase,
        lastUserText: state.lastUserText,
      },
    });
  }

  const normalizedText = normalizeText(event.text);
  if (!normalizedText) {
    return { state, update: null };
  }

  if (event.kind === "user_message") {
    const dateHint = extractDateHint(normalizedText);
    const timeHint = extractTimeHint(normalizedText);

    state = {
      ...state,
      lastUserText: normalizedText,
    };

    if (state.phase === "second_choice_optional") {
      state = {
        ...state,
        secondChoiceDateHint: dateHint ?? state.secondChoiceDateHint,
        secondChoiceTimeHint: timeHint ?? state.secondChoiceTimeHint,
        secondChoiceDateOnlyReplyCount:
          dateHint && !timeHint
            ? state.secondChoiceDateOnlyReplyCount + 1
            : state.secondChoiceDateOnlyReplyCount,
      };
      return { state, update: null };
    }

    state = {
      ...state,
      firstChoiceDateHint: dateHint ?? state.firstChoiceDateHint,
      firstChoiceTimeHint: timeHint ?? state.firstChoiceTimeHint,
    };
    return { state, update: null };
  }

  if (looksLikeClosing(normalizedText)) {
    state = {
      ...state,
      phase: "closing",
      lastAgentPromptFingerprint: null,
      repeatedAgentPromptCount: 0,
    };
    return { state, update: null };
  }

  if (looksLikeSecondChoicePrompt(normalizedText)) {
    state = {
      ...state,
      phase: "second_choice_optional",
    };
  }

  const promptFingerprint = buildPromptFingerprint(normalizedText);
  const repeatedAgentPromptCount =
    promptFingerprint && promptFingerprint === state.lastAgentPromptFingerprint
      ? state.repeatedAgentPromptCount + 1
      : promptFingerprint
        ? 1
        : 0;

  state = {
    ...state,
    lastAgentPromptFingerprint: promptFingerprint,
    repeatedAgentPromptCount,
  };

  if (
    state.phase === "second_choice_optional" &&
    looksLikeSecondChoiceTimePrompt(normalizedText)
  ) {
    const nextPromptCount = state.secondChoiceTimePromptCount + 1;
    state = {
      ...state,
      secondChoiceTimePromptCount: nextPromptCount,
    };

    if (state.secondChoiceDateOnlyReplyCount > 0 && nextPromptCount > 1) {
      return withSentUpdate(state, {
        key: "skip-optional-second-choice-time-loop",
        label: "第2希望の時間ループを止める",
        message:
          "Runtime reminder: optional second-choice timing is already unresolved. Do not ask about the second choice again. Keep the latest second-choice date if available, leave preferred_time_range_2 null, store any ambiguity in unresolved_questions, and move to the provisional close.",
        details: {
          phase: state.phase,
          secondChoiceDateHint: state.secondChoiceDateHint,
          secondChoiceTimePromptCount: nextPromptCount,
        },
      });
    }
  }

  if (
    state.phase === "second_choice_optional" &&
    state.firstChoiceDateHint &&
    (normalizedText.includes(normalizeComparableText(state.firstChoiceDateHint)) ||
      normalizedText.includes("第一希望") ||
      normalizedText.includes("先ほど"))
  ) {
    return withSentUpdate(state, {
      key: "do-not-resurrect-first-choice",
      label: "第1希望の再確認を抑止",
      message:
        "Runtime reminder: you are in the optional second-choice step. Do not resurrect or re-confirm the first choice. Use only the caller's latest second-choice answer and continue.",
      details: {
        phase: state.phase,
        firstChoiceDateHint: state.firstChoiceDateHint,
      },
    });
  }

  if (looksLikeQuestion(normalizedText) && repeatedAgentPromptCount > 1) {
    return withSentUpdate(state, {
      key: `avoid-repeat:${promptFingerprint ?? "unknown"}`,
      label: "同一質問の反復を抑止",
      message:
        "Runtime reminder: do not repeat the same question again. If the value is still unclear, write it to unresolved_questions and continue with the next required step or close.",
      details: {
        phase: state.phase,
        promptFingerprint,
        repeatedAgentPromptCount,
      },
    });
  }

  return { state, update: null };
}
