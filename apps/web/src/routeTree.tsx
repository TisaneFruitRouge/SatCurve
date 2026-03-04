import {
  createRootRoute,
  createRoute,
  Outlet,
} from "@tanstack/react-router";
import { RootLayout } from "./components/RootLayout";
import { HomePage } from "./routes/HomePage";
import { BondsPage } from "./routes/BondsPage";
import { BondDetailPage } from "./routes/BondDetailPage";
import { VaultPage } from "./routes/VaultPage";
import { MarketPage } from "./routes/MarketPage";

const rootRoute = createRootRoute({
  component: () => (
    <RootLayout>
      <Outlet />
    </RootLayout>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const bondsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bonds",
  component: BondsPage,
});

const bondDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bonds/$bondId",
  component: BondDetailPage,
});

// Legacy redirect: /vault → /bonds
const vaultRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/vault",
  component: VaultPage,
});

const marketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/market",
  component: MarketPage,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  bondsRoute,
  bondDetailRoute,
  vaultRoute,
  marketRoute,
]);
