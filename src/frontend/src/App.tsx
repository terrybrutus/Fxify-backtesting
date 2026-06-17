import Layout from "@/components/Layout";
import BacktestResultsPage from "@/pages/BacktestResultsPage";
import ChartPage from "@/pages/ChartPage";
import DataUploadPage from "@/pages/DataUploadPage";
import ReplayPage from "@/pages/ReplayPage";
import RuleEngineHealthPage from "@/pages/RuleEngineHealthPage";
import SetupDetectorPage from "@/pages/SetupDetectorPage";
import RejectedSetupsPage from "@/pages/RejectedSetupsPage";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";

const rootRoute = createRootRoute({ component: Layout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/data" });
  },
});

const dataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/data",
  component: DataUploadPage,
});

const healthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/health",
  component: RuleEngineHealthPage,
});

const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/audit",
  component: SetupDetectorPage,
});

const rejectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/rejected",
  component: RejectedSetupsPage,
});

const replayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/replay",
  component: ReplayPage,
});

const chartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chart",
  component: ChartPage,
});

const resultsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/results",
  component: BacktestResultsPage,
});

const tree = rootRoute.addChildren([
  indexRoute,
  dataRoute,
  healthRoute,
  auditRoute,
  rejectedRoute,
  replayRoute,
  chartRoute,
  resultsRoute,
]);
const router = createRouter({ routeTree: tree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return <RouterProvider router={router} />;
}
