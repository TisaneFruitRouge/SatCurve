import { useState, useEffect } from "react";
import { stacksNetwork } from "../lib/stacks";

export function useBlockHeight(): number | null {
  const [blockHeight, setBlockHeight] = useState<number | null>(null);

  useEffect(() => {
    const url = `${stacksNetwork.coreApiUrl}/v2/info`;

    async function load() {
      try {
        const res = await window.fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as { stacks_tip_height: number };
        setBlockHeight(data.stacks_tip_height);
      } catch {
        // silently ignore — UI handles null gracefully
      }
    }

    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, []);

  return blockHeight;
}
