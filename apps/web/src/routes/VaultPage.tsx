import { VaultCard } from "../components/VaultCard";

export function VaultPage() {
  return (
    <div className="px-8 py-12 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">My Vaults</h1>
      {/* TODO: Fetch vault data from vault-engine contract and render a VaultCard per vault */}
      <div className="grid gap-4 md:grid-cols-2">
        <VaultCard />
      </div>
    </div>
  );
}
