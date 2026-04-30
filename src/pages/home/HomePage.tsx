import { PetWidget } from "../../features/pet";
import type { ParsedJsonResult } from "../../features/json-parser/types/jsonParser";
import "./HomePage.css";

type HomePageProps = {
  onJsonParsed: (result: ParsedJsonResult) => void;
};

export function HomePage({ onJsonParsed }: HomePageProps) {
  return (
    <main className="home-page">
      <PetWidget onJsonParsed={onJsonParsed} />
    </main>
  );
}