import { HomePage } from "@/components/home-page";
import { getServerConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function Page() {
  const config = getServerConfig();

  return <HomePage defaultOutboundNumber={config.demoOutboundTargetNumber ?? ""} />;
}
