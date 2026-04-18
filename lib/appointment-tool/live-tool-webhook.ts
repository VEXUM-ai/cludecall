import { getAppointmentLiveRuntimeSettings } from "@/lib/env";

export const APPOINTMENT_TOOL_WEBHOOK_SECRET_HEADER = "x-appointment-tool-secret";

export function getAppointmentToolWebhookSecret() {
  return getAppointmentLiveRuntimeSettings().appointmentToolWebhookSecret;
}

export function isAuthorizedAppointmentToolWebhookRequest(request: Request) {
  const expectedSecret = getAppointmentToolWebhookSecret();
  if (!expectedSecret) {
    return true;
  }

  const providedSecret = request.headers.get(APPOINTMENT_TOOL_WEBHOOK_SECRET_HEADER);
  return providedSecret === expectedSecret;
}
