import { PositionCard } from "../components/PositionCard";

export function VaultPage() {
  return (
    <div className="px-8 py-12 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">My Position</h1>
      {/* TODO: Fetch position data from vault-engine contract and pass to PositionCard */}
      <div className="grid gap-4 md:grid-cols-2">
        <PositionCard />
      </div>
    </div>
  );
}
