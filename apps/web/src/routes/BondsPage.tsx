export function BondsPage() {
  return (
    <div className="px-8 py-12 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Bond Market</h1>
      {/* TODO: List available zBTC bonds from bond-factory contract */}
      {/* TODO: Allow users to mint new bonds or buy/sell on secondary market */}
      <p className="text-white/60">
        No bonds available yet. Deploy contracts first.
      </p>
    </div>
  );
}
