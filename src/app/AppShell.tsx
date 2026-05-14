import { useEffect } from "react";
import { HomePage } from "../pages/home";
import { JsonResultPage } from "../pages/json-result";
import { JsonInputPage } from "../pages/json-input";
import { SettingsPage } from "../pages/settings";
import { FeaturesPage } from "../pages/features";
import {
  isJsonResultWindowView,
  openJsonResultWindow,
  isJsonInputWindowView,
  type ParsedJsonResult,
} from "../features/json-parser";
import { isSettingsWindowView } from "../features/pet/lib/settingsWindow";
import { isFeaturesWindowView } from "../features/pet/lib/featuresWindow";
import { installWindowPositionPersistence } from "../features/pet/services/windowService";

export function AppShell() {
  const isJsonResult = isJsonResultWindowView();
  const isJsonInput = isJsonInputWindowView();
  const isSettings = isSettingsWindowView();
  const isFeatures = isFeaturesWindowView();

  useEffect(() => {
    if (!isJsonResult && !isJsonInput && !isSettings && !isFeatures) {
      void installWindowPositionPersistence();
    }
  }, [isJsonResult, isJsonInput, isSettings, isFeatures]);

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

  if (isFeatures) {
    return <FeaturesPage />;
  }

  return <HomePage onJsonParsed={handleJsonParsed} />;
}