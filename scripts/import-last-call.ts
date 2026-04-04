import { persistLatestPhoneCall } from "@/lib/elevenlabs/api";

function parseConversationIdArg(args: string[]): string | undefined {
  const value = args.find((arg) => arg.startsWith("--conversationId="));
  return value ? value.slice("--conversationId=".length) : undefined;
}

async function main() {
  const conversationId = parseConversationIdArg(process.argv.slice(2));
  const { markdownPath, jsonPath, run } = await persistLatestPhoneCall(conversationId);

  console.log("Imported latest phone conversation.");
  console.log(`conversationId: ${run.conversationId}`);
  console.log(`markdown: ${markdownPath}`);
  console.log(`json: ${jsonPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
