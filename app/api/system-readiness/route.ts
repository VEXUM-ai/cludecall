import { NextResponse } from "next/server";

import { getAppointmentToolHealth } from "@/lib/appointment-tool/provider";
import { getServerConfig } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const config = getServerConfig();
  const appointmentTool = await getAppointmentToolHealth();

  return NextResponse.json({
    appointmentTool,
    slack: {
      configured: Boolean(
        (config.slackBotToken && config.slackChannelId) || config.slackWebhookUrl
      ),
      mode:
        config.slackBotToken && config.slackChannelId
          ? "bot_token"
          : config.slackWebhookUrl
            ? "incoming_webhook"
            : "none",
      channelId: config.slackChannelId,
      channelLabel: config.slackChannelLabel,
    },
    urgentTransfer: {
      configured: Boolean(config.urgentTransferPhoneNumber),
      mode: config.urgentTransferMode,
      targetPreview: config.urgentTransferPhoneNumber
        ? `${config.urgentTransferPhoneNumber.slice(0, 4)}...`
        : null,
    },
  });
}
