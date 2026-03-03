import { useState, useMemo } from "react";
import { openContractCall } from "@stacks/connect";
import { uintCV, PostConditionMode } from "@stacks/transactions";
import { useWallet } from "../hooks/useWallet";
import { useBonds } from "../hooks/useBonds";
import { useSbtcBalance } from "../hooks/useSbtcBalance";
import { useBlockHeight } from "../hooks/useBlockHeight";
import { BondRow } from "../components/BondRow";
import { AmountInput } from "../components/AmountInput";
import { TxButton } from "../components/TxButton";
import { BlockTooltip } from "../components/BlockTooltip";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { formatSats, TERM_PRESET_BLOCKS } from "../lib/format";
import { stacksNetwork } from "../lib/stacks";
import { CONTRACT_ADDRESSES } from "../lib/contracts";

function parseContractId(fullAddress: string) {
  const parts = fullAddress.split(".");
  return { contractAddress: parts[0] ?? "", contractName: parts[1] ?? "" };
}

function parseSbtcInput(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === ".") return null;
  const parts = trimmed.split(".");
  if (parts.length > 2) return null;
  const whole = parts[0] ?? "0";
  const frac = (parts[1] ?? "").padEnd(8, "0").slice(0, 8);
  try {
    return BigInt(whole) * 100_000_000n + BigInt(frac);
  } catch {
    return null;
  }
}

const TERM_OPTIONS = [
  { label: "3M",     blocks: TERM_PRESET_BLOCKS["3M"]! },
  { label: "6M",     blocks: TERM_PRESET_BLOCKS["6M"]! },
  { label: "1Y",     blocks: TERM_PRESET_BLOCKS["1Y"]! },
  { label: "2Y",     blocks: TERM_PRESET_BLOCKS["2Y"]! },
  { label: "Custom", blocks: 0 },
] as const;

const MAX_TERM_BLOCKS = 12_614_400;

export function BondsPage() {
  const { address, isConnected } = useWallet();
  const currentBlock = useBlockHeight();
  const { bonds, loading: bondsLoading, error: bondsError, refetch } = useBonds(address);
  const { balance: sbtcBalance } = useSbtcBalance(address);

  const [amount, setAmount] = useState("");
  const [selectedTerm, setSelectedTerm] = useState<string>("3M");
  const [customBlocks, setCustomBlocks] = useState("");
  const [createPending, setCreatePending] = useState(false);

  const parsedAmount = parseSbtcInput(amount);

  const termBlocks =
    selectedTerm === "Custom"
      ? parseInt(customBlocks, 10) || 0
      : (TERM_PRESET_BLOCKS[selectedTerm] ?? 0);

  const maturityBlock =
    currentBlock !== null && termBlocks > 0 ? currentBlock + termBlocks : null;

  const termError =
    termBlocks > MAX_TERM_BLOCKS
      ? "Maximum term is 2 years (12,614,400 blocks)"
      : undefined;

  // Derived — auto-updates whenever amount OR sbtcBalance changes (e.g. balance loads after typing)
  const amountError = useMemo(() => {
    if (!amount) return undefined;
    const sats = parseSbtcInput(amount);
    if (!sats || sats <= 0n) return "Amount must be greater than 0";
    if (sbtcBalance !== null && sats > sbtcBalance)
      return `Insufficient sBTC — you have ${formatSats(sbtcBalance)} sBTC`;
    return undefined;
  }, [amount, sbtcBalance]);

  function handleCreateBond() {
    const sats = parsedAmount;
    if (!sats || sats <= 0n || termBlocks <= 0 || termBlocks > MAX_TERM_BLOCKS) return;

    const { contractAddress, contractName } = parseContractId(
      CONTRACT_ADDRESSES.bondFactory
    );
    setCreatePending(true);
    void openContractCall({
      contractAddress,
      contractName,
      functionName: "create-bond",
      functionArgs: [uintCV(sats), uintCV(termBlocks)],
      network: stacksNetwork,
      postConditionMode: PostConditionMode.Allow,
      onFinish: (data) => {
        console.log("[BondsPage] create-bond txid:", data.txId);
        setCreatePending(false);
        setAmount("");
        refetch();
      },
      onCancel: () => setCreatePending(false),
    });
  }

  const canCreate =
    isConnected &&
    sbtcBalance !== null &&
    parsedAmount !== null &&
    parsedAmount > 0n &&
    amountError === undefined &&
    termBlocks > 0 &&
    termBlocks <= MAX_TERM_BLOCKS;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Bonds</h1>

      {/* Create Bond Panel */}
      <Card className="bg-surface border-border">
        <CardHeader>
          <CardTitle className="text-base">Create Bond</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isConnected ? (
            <p className="text-text-muted text-sm">
              Connect your wallet to create a bond.
            </p>
          ) : (
            <>
              <AmountInput
                value={amount}
                onChange={setAmount}
                maxBalance={sbtcBalance ?? undefined}
                error={amountError}
                disabled={createPending}
              />

              {/* Term selector */}
              <div className="space-y-2">
                <p className="text-xs text-text-muted uppercase tracking-wider">Term</p>
                <div className="flex gap-2 flex-wrap">
                  {TERM_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setSelectedTerm(opt.label)}
                      className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                        selectedTerm === opt.label
                          ? "border-brand text-brand bg-brand-muted"
                          : "border-border text-text-muted hover:text-text hover:border-muted-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {selectedTerm === "Custom" && (
                  <input
                    type="number"
                    min={1}
                    max={MAX_TERM_BLOCKS}
                    value={customBlocks}
                    onChange={(e) => setCustomBlocks(e.target.value)}
                    placeholder="Number of blocks"
                    className="w-full rounded border border-border bg-secondary px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-brand focus:outline-none"
                  />
                )}
                {termError && (
                  <p className="text-xs text-error">{termError}</p>
                )}
              </div>

              {/* Maturity preview */}
              {maturityBlock !== null && currentBlock !== null && !termError && (
                <p className="text-sm text-text-muted">
                  Maturity:{" "}
                  <BlockTooltip block={maturityBlock} currentBlock={currentBlock}>
                    Block #{maturityBlock.toLocaleString()}
                  </BlockTooltip>
                </p>
              )}

              {/* You receive preview */}
              {parsedAmount && parsedAmount > 0n && !amountError && (
                <p className="text-sm text-text-muted">
                  You receive:{" "}
                  <span className="font-mono text-text">
                    1 PT NFT + 1 YT NFT
                  </span>{" "}
                  for{" "}
                  <span className="font-mono text-text">
                    {formatSats(parsedAmount)} sBTC
                  </span>
                </p>
              )}

              <TxButton
                className="w-full bg-brand text-primary-foreground font-semibold hover:bg-brand-hover"
                pending={createPending}
                disabled={!canCreate}
                onClick={handleCreateBond}
              >
                Create Bond
              </TxButton>
            </>
          )}
        </CardContent>
      </Card>

      {/* Bond List */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Your Bonds</h2>

        {!isConnected ? (
          <Card className="bg-surface border-border">
            <CardContent className="pt-6">
              <p className="text-text-muted text-sm">
                Connect your wallet to see your bonds.
              </p>
            </CardContent>
          </Card>
        ) : bondsLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full bg-surface" />
            <Skeleton className="h-28 w-full bg-surface" />
          </div>
        ) : bondsError ? (
          <Card className="bg-surface border-border">
            <CardContent className="pt-6 space-y-2">
              <p className="text-error text-sm">{bondsError}</p>
              <button
                onClick={refetch}
                className="text-xs text-text-muted underline hover:text-text"
              >
                Retry
              </button>
            </CardContent>
          </Card>
        ) : bonds.length === 0 ? (
          <Card className="bg-surface border-border">
            <CardContent className="pt-6">
              <p className="text-text-muted text-sm">
                No bonds yet. Create your first bond above.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {bonds.map((bond) => (
              <BondRow
                key={bond.tokenId.toString()}
                bond={bond}
                currentBlock={currentBlock ?? 0}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
