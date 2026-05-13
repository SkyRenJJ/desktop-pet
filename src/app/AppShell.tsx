import { useEffect } from "react";
import { HomePage } from "../pages/home";
import { JsonResultPage } from "../pages/json-result";
import { JsonInputPage } from "../pages/json-input";
import { SettingsPage } from "../pages/settings";
import {
  isJsonResultWindowView,
  openJsonResultWindow,
  isJsonInputWindowView,
  type ParsedJsonResult,
} from "../features/json-parser";
import { isSettingsWindowView } from "../features/pet/lib/settingsWindow";
import { installWindowPositionPersistence } from "../features/pet/services/windowService";

export function AppShell() {
  const isJsonResult = isJsonResultWindowView();
  const isJsonInput = isJsonInputWindowView();
  const isSettings = isSettingsWindowView();

  useEffect(() => {
    if (!isJsonResult && !isJsonInput && !isSettings) {
      void installWindowPositionPersistence();
    }
  }, [isJsonResult, isJsonInput, isSettings]);

  const handleJsonParsed = (result: ParsedJsonResult) => {
    void openJsonResultWindow(result);
  };

  if (isJsonResult) {
    return <JsonResultPage />;
  }

  if (isJsonInput) {
    return <JsonInputPage />;
  }

  if (isSettings) {
    return <SettingsPage />;
  }

  return <HomePage onJsonParsed={handleJsonParsed} />;
}