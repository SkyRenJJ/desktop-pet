import { HomePage } from "../pages/home";
import { JsonResultPage } from "../pages/json-result";
import { JsonInputPage } from "../pages/json-input";
import {
  isJsonResultWindowView,
  openJsonResultWindow,
  isJsonInputWindowView,
  type ParsedJsonResult,
} from "../features/json-parser";

export function AppShell() {
  const handleJsonParsed = (result: ParsedJsonResult) => {
    void openJsonResultWindow(result);
  };

  if (isJsonResultWindowView()) {
    return <JsonResultPage />;
  }

  if (isJsonInputWindowView()) {
    return <JsonInputPage />;
  }

  return <HomePage onJsonParsed={handleJsonParsed} />;
}