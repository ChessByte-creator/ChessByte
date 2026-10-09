import { createFileRoute } from "@tanstack/react-router";
import { ChessApp } from "@/components/ChessApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <ChessApp />;
}
