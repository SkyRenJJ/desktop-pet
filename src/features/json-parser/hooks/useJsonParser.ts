import { useState } from "react";
import { parseJsonInput } from "../lib/parseJsonInput";
import type { ParsedJsonResult } from "../types/jsonParser";

export function useJsonParser(
  onSuccess: (result: ParsedJsonResult) => void,
) {
  const [panelVisible, setPanelVisible] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [errorText, setErrorText] = useState("");

  const openPanel = () => {
    setErrorText("");
    setPanelVisible(true);
  };

  const closePanel = () => {
    setErrorText("");
    setPanelVisible(false);
  };

  const handleInputChange = (value: string) => {
    setInputValue(value);

    if (errorText) {
      setErrorText("");
    }
  };

  const submitInput = () => {
    try {
      const result = parseJsonInput(inputValue);
      setPanelVisible(false);
      setErrorText("");
      onSuccess(result);
    } catch (error) {
      if (error instanceof Error) {
        setErrorText(error.message);
      } else {
        setErrorText("输入内容不是合法的 JSON");
      }
    }
  };

  return {
    panelVisible,
    inputValue,
    errorText,
    openPanel,
    closePanel,
    handleInputChange,
    submitInput,
  };
}