import { YieldChart } from "../components/YieldChart";

export function HomePage() {
  return (
    <div className="px-8 py-12 max-w-4xl mx-auto">
      <section className="text-center mb-16">
        <h1 className="text-5xl font-bold mb-4">The Bitcoin Yield Curve</h1>
        <p className="text-lg text-white/60 max-w-xl mx-auto">
          Fixed-rate zero-coupon bonds backed by sBTC. Earn predictable Bitcoin
          yield on Stacks L2.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-6">Yield Dashboard</h2>
        <YieldChart />
      </section>
    </div>
  );
}
