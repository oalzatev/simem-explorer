import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import AppSidebar from "@/components/AppSidebar";
import ExplorerPage from "@/pages/explorer";
import PresetsPage from "@/pages/presets";
import NotFound from "@/pages/not-found";

function AppRouter() {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <Switch>
        <Route path="/" component={ExplorerPage} />
        <Route path="/presets" component={PresetsPage} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
