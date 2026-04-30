import { HomePage } from "../pages/home";
import { JsonResultPage } from "../pages/json-result";
import {
  isJsonResultWindowView,
  openJsonResultWindow,
  type ParsedJsonResult,
} from "../features/json-parser";

export function AppShell() {
  const handleJsonParsed = (result: ParsedJsonResult) => {
    void openJsonResultWindow(result);
  };

  if (isJsonResultWindowView()) {
    return <JsonResultPage />;
  }

  return <HomePage onJsonParsed={handleJsonParsed} />;
}