import assert from "node:assert/strict";
import test from "node:test";

import { DENTAL_DEMO_PROMPT } from "@/lib/agent-demo-config";

test("agent prompt requires live availability lookup to stay provisional until confirm succeeds", () => {
  assert.match(
    DENTAL_DEMO_PROMPT,
    /If live_availability_lookup is available, use it for routine first-visit booking as soon as you have service_line, preferred_date_1, and a usable preferred_time_range_1 or exact time/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /patient_name and phone_number are not prerequisites for live_availability_lookup/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /Before calling live_availability_lookup, say one short waiting sentence/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /If the caller gave date and time first, check candidates first, then collect any missing patient_name, phone_number, or callback_ok before live_hold_confirm or closing/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /Only when live_hold_confirm returns status confirmed may you say the reservation is confirmed during the call/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /If live_hold_confirm returns pending_finalize_post_call, say the final confirmation will continue after the call and do not promise completion on the spot/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /If you used live_availability_lookup, you may say you checked the current candidates during the call/u
  );
});
