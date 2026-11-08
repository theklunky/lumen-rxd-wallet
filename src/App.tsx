/**
 * App shell: routes between phases.
 *   loading -> splash
 *   setup   -> create/restore flow
 *   unlock  -> password gate
 *   ready   -> main wallet UI
 */
import { useApp } from "./state/AppContext";
import { LoadingSplash } from "./views/LoadingSplash";
import { SetupView } from "./views/SetupView";
import { UnlockView } from "./views/UnlockView";
import { MainLayout } from "./views/MainLayout";

export function App() {
  const { phase } = useApp();
  if (phase === "loading") return <LoadingSplash />;
  if (phase === "setup") return <SetupView />;
  if (phase === "unlock") return <UnlockView />;
  return <MainLayout />;
}
