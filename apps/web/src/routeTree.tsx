import {
  createRootRoute,
  createRoute,
  Outlet,
} from "@tanstack/react-router";
import { RootLayout } from "./components/RootLayout";
import { HomePage } from "./routes/HomePage";
import { VaultPage } from "./routes/VaultPage";
import { BondsPage } from "./routes/BondsPage";

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

const vaultRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/vault",
  component: VaultPage,
});

const bondsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/bonds",
  component: BondsPage,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  vaultRoute,
  bondsRoute,
]);
