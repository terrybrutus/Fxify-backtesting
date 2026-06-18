import Layout from "@/components/Layout";
import BacktestResultsPage from "@/pages/BacktestResultsPage";
import ChartPage from "@/pages/ChartPage";
import DataUploadPage from "@/pages/DataUploadPage";
import DiscoveryLabPage from "@/pages/DiscoveryLabPage";
import ExperimentLabPage from "@/pages/ExperimentLabPage";
import ForwardTrackerPage from "@/pages/ForwardTrackerPage";
import RejectedSetupsPage from "@/pages/RejectedSetupsPage";
import ReplayPage from "@/pages/ReplayPage";
import RuleEngineHealthPage from "@/pages/RuleEngineHealthPage";
import SetupDetectorPage from "@/pages/SetupDetectorPage";
import WalkForwardPage from "@/pages/WalkForwardPage";
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

const discoveryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discovery",
  component: DiscoveryLabPage,
});

const experimentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/experiments",
  component: ExperimentLabPage,
});

const forwardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/forward",
  component: ForwardTrackerPage,
});

const walkForwardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/walk-forward",
  component: WalkForwardPage,
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
  discoveryRoute,
  experimentRoute,
  forwardRoute,
  walkForwardRoute,
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
