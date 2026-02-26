import { config } from "./config";
import { VaultMonitor } from "./monitor";

async function main() {
  console.log(`SatCurve Liquidation Bot v0.1.0`);
  console.log(`Network: ${config.network}`);
  console.log(`API: ${config.apiUrl}`);

  const monitor = new VaultMonitor();
  await monitor.start();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
