import { HomePage } from "@/components/home-page";
import { getServerConfig } from "@/lib/env";

export default function Page() {
  const config = getServerConfig();

  return <HomePage defaultOutboundNumber={config.demoOutboundTargetNumber ?? ""} />;
}
