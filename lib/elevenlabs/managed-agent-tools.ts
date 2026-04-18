import { APPOINTMENT_TOOL_WEBHOOK_SECRET_HEADER } from "@/lib/appointment-tool/live-tool-webhook";

type JsonObject = Record<string, unknown>;

type ManagedWebhookToolConfig = {
  name: string;
  description: string;
  type: "webhook";
  api_schema: {
    url: string;
    method: "POST";
    request_body_schema: {
      type: "object";
      description: string;
      required: string[];
      properties: Record<string, JsonObject>;
    };
    request_headers: Record<string, string>;
  };
  response_timeout_secs: number;
  dynamic_variables: {
    dynamic_variable_placeholders: Record<string, never>;
  };
  assignments: [];
  disable_interruptions: boolean;
  force_pre_tool_speech: boolean;
};

export type ManagedConvAiToolRecord = {
  id: string;
  name: string;
  description: string | null;
};

export const LIVE_AVAILABILITY_TOOL_NAME = "live_availability_lookup";
export const LIVE_HOLD_CONFIRM_TOOL_NAME = "live_hold_confirm";
export const MANAGED_AGENT_TOOL_DESCRIPTION_MARKER =
  "Managed by scripts/apply-agent-demo-config.ts";

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildRequestHeaders(sharedSecret: string | null) {
  return {
    "Content-Type": "application/json",
    ...(sharedSecret
      ? {
          [APPOINTMENT_TOOL_WEBHOOK_SECRET_HEADER]: sharedSecret,
        }
      : {}),
  };
}

function buildStringProperty(description: string, dynamicVariable?: string) {
  return {
    type: "string",
    description,
    ...(dynamicVariable ? { dynamic_variable: dynamicVariable } : {}),
  } satisfies JsonObject;
}

function buildBooleanProperty(description: string) {
  return {
    type: "boolean",
    description,
  } satisfies JsonObject;
}

export function buildManagedAppointmentWebhookTools(args: {
  baseUrl: string;
  sharedSecret: string | null;
  waitTimeoutMs: number;
}): ManagedWebhookToolConfig[] {
  const baseUrl = trimTrailingSlash(args.baseUrl);
  const responseTimeoutSeconds = Math.max(5, Math.min(120, Math.ceil(args.waitTimeoutMs / 1000) + 5));
  const requestHeaders = buildRequestHeaders(args.sharedSecret);

  return [
    {
      name: LIVE_AVAILABILITY_TOOL_NAME,
      description:
        "Check current routine appointment candidates after collecting an exact preferred date. Use only for routine booking intake after you have YYYY-MM-DD and a rough time range. Returns status resolved/manual_only/pending_followup with up to three provisional candidates. Candidates are not confirmed until live_hold_confirm succeeds. " +
        MANAGED_AGENT_TOOL_DESCRIPTION_MARKER,
      type: "webhook",
      api_schema: {
        url: `${baseUrl}/api/appointment-tool/live-availability`,
        method: "POST",
        request_body_schema: {
          type: "object",
          description:
            "Live availability lookup payload. conversationId is injected from the current ElevenLabs conversation.",
          required: ["conversationId", "serviceLine", "preferredDate"],
          properties: {
            conversationId: buildStringProperty(
              "Current ElevenLabs conversation id.",
              "system__conversation_id"
            ),
            serviceLine: buildStringProperty(
              "Service line for this caller. Use general_initial for routine first-visit bookings."
            ),
            preferredDate: buildStringProperty(
              "Exact preferred date in YYYY-MM-DD. Convert relative dates to an exact date before calling."
            ),
            preferredTimeRange: buildStringProperty(
              "Optional preferred time window such as 11:30, 午前, 午後, or 15時以降."
            ),
            isNewPatient: buildBooleanProperty(
              "Whether this caller is a new patient."
            ),
          },
        },
        request_headers: requestHeaders,
      },
      response_timeout_secs: responseTimeoutSeconds,
      dynamic_variables: {
        dynamic_variable_placeholders: {},
      },
      assignments: [],
      disable_interruptions: true,
      force_pre_tool_speech: false,
    },
    {
      name: LIVE_HOLD_CONFIRM_TOOL_NAME,
      description:
        "Recheck a caller-selected candidate and attempt booking. Use immediately after the caller chooses one candidate returned by live_availability_lookup. Only say the booking is confirmed when this tool returns status confirmed. If status is rejected or pending_finalize_post_call, do not promise confirmation. " +
        MANAGED_AGENT_TOOL_DESCRIPTION_MARKER,
      type: "webhook",
      api_schema: {
        url: `${baseUrl}/api/appointment-tool/live-hold-confirm`,
        method: "POST",
        request_body_schema: {
          type: "object",
          description:
            "Live hold confirm payload. conversationId is injected from the current ElevenLabs conversation.",
          required: [
            "conversationId",
            "serviceLine",
            "preferredDate",
            "selectedTcStartTime",
            "patientName",
            "phoneNumber",
          ],
          properties: {
            conversationId: buildStringProperty(
              "Current ElevenLabs conversation id.",
              "system__conversation_id"
            ),
            serviceLine: buildStringProperty(
              "Service line for this caller. Use general_initial for routine first-visit bookings."
            ),
            preferredDate: buildStringProperty(
              "Exact appointment date in YYYY-MM-DD for the selected candidate."
            ),
            selectedTcStartTime: buildStringProperty(
              "Selected candidate counseling start time in HH:MM."
            ),
            preferredTimeRange: buildStringProperty(
              "Optional original preferred time range from the caller."
            ),
            patientName: buildStringProperty("Caller name as currently collected."),
            phoneNumber: buildStringProperty("Callback phone number as currently collected."),
            isNewPatient: buildBooleanProperty(
              "Whether this caller is a new patient."
            ),
            visitReason: buildStringProperty(
              "Short visit reason for the booking memo."
            ),
          },
        },
        request_headers: requestHeaders,
      },
      response_timeout_secs: responseTimeoutSeconds,
      dynamic_variables: {
        dynamic_variable_placeholders: {},
      },
      assignments: [],
      disable_interruptions: true,
      force_pre_tool_speech: false,
    },
  ];
}

export function mergeManagedToolIds(args: {
  currentToolIds: string[];
  managedToolIds: string[];
  knownManagedToolIds: string[];
}) {
  const nextToolIds = args.currentToolIds.filter(
    (toolId) => !args.knownManagedToolIds.includes(toolId)
  );

  for (const toolId of args.managedToolIds) {
    if (!nextToolIds.includes(toolId)) {
      nextToolIds.push(toolId);
    }
  }

  return nextToolIds;
}
