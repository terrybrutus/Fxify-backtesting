import Layout from "@/components/Layout";
import BacktestResultsPage from "@/pages/BacktestResultsPage";
import BrutusBandLabPage from "@/pages/BrutusBandLabPage";
import BrutusExecutionPage from "@/pages/BrutusExecutionPage";
import BrutusResearchPage from "@/pages/BrutusResearchPage";
import ChartPage from "@/pages/ChartPage";
import CocoRiskLabPage from "@/pages/CocoRiskLabPage";
import CocoTradeProbePage from "@/pages/CocoTradeProbePage";
import DailyTradeDeskPage from "@/pages/DailyTradeDeskPage";
import DataUploadPage from "@/pages/DataUploadPage";
import DecisionConsolePage from "@/pages/DecisionConsolePage";
import DiscoveryLabPage from "@/pages/DiscoveryLabPage";
import ExperimentLabPage from "@/pages/ExperimentLabPage";
import ForwardTrackerPage from "@/pages/ForwardTrackerPage";
import LiveCandidatePage from "@/pages/LiveCandidatePage";
import RejectedSetupsPage from "@/pages/RejectedSetupsPage";
import ReplayPage from "@/pages/ReplayPage";
import RuleEngineHealthPage from "@/pages/RuleEngineHealthPage";
import SampleExpansionPage from "@/pages/SampleExpansionPage";
import SetupDetectorPage from "@/pages/SetupDetectorPage";
import TradingViewCapturePage from "@/pages/TradingViewCapturePage";
import TruthAuditPage from "@/pages/TruthAuditPage";
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

const dailyDeskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/daily-desk",
  component: DailyTradeDeskPage,
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

const truthAuditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/truth-audit",
  component: TruthAuditPage,
});

const cocoRiskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/coco-risk",
  component: CocoRiskLabPage,
});

const cocoTradeProbeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/coco-trade-probe",
  component: CocoTradeProbePage,
});

const brutusBandRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/brutus-band",
  component: BrutusBandLabPage,
});

const brutusResearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/brutus-research",
  component: BrutusResearchPage,
});

const brutusExecutionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/brutus-execution",
  component: BrutusExecutionPage,
});

const tradingViewCaptureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tradingview-capture",
  component: TradingViewCapturePage,
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

const sampleExpansionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sample-expansion",
  component: SampleExpansionPage,
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

const decisionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/decisions",
  component: DecisionConsolePage,
});

const liveCandidateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/live-candidates",
  component: LiveCandidatePage,
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
  dailyDeskRoute,
  healthRoute,
  auditRoute,
  truthAuditRoute,
  cocoRiskRoute,
  cocoTradeProbeRoute,
  brutusBandRoute,
  brutusResearchRoute,
  brutusExecutionRoute,
  tradingViewCaptureRoute,
  rejectedRoute,
  discoveryRoute,
  experimentRoute,
  sampleExpansionRoute,
  forwardRoute,
  walkForwardRoute,
  decisionRoute,
  liveCandidateRoute,
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
