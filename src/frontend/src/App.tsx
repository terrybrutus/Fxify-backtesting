import Layout from "@/components/Layout";
import BacktestResultsPage from "@/pages/BacktestResultsPage";
import ChartPage from "@/pages/ChartPage";
import DataUploadPage from "@/pages/DataUploadPage";
import SetupDetectorPage from "@/pages/SetupDetectorPage";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";

const rootRoute = createRootRoute({
  component: Layout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/upload" });
  },
});

const uploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/upload",
  component: DataUploadPage,
});

const detectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/detect",
  component: SetupDetectorPage,
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
  uploadRoute,
  detectRoute,
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
