import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Chess, type Square } from "chess.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

export type BoardArrow = {
  from: Square;
  to: Square;
  tone: "good" | "bad";
};

type Props = {
  fen: string;
  flipped: boolean;
  selected: Square | null;
  targets: Square[];
  lastMove: { from: Square; to: Square } | null;
  checkSquare: Square | null;
  arrows: BoardArrow[];
  interactive: boolean;
  player: "w" | "b" | "both";
  onSquare: (square: Square) => void;
  onDrop: (from: Square, to: Square) => void;
};

function point(square: Square, flipped: boolean) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const x = (flipped ? 7 - file : file) + 0.5;
  const y = (flipped ? rank : 7 - rank) + 0.5;
  return { x: (x / 8) * 100, y: (y / 8) * 100 };
}

export function Board({
  fen,
  flipped,
  selected,
  targets,
  lastMove,
  checkSquare,
  arrows,
  interactive,
  player,
  onSquare,
  onDrop,
}: Props) {
  const chess = new Chess(fen);
  const turn = chess.turn();
  const ranks = flipped ? [...RANKS].reverse() : [...RANKS];
  const files = flipped ? [...FILES].reverse() : [...FILES];
  const suppressClick = useRef(false);
  const [dragFrom, setDragFrom] = useState<Square | null>(null);
  const [ghost, setGhost] = useState<{ src: string; x: number; y: number } | null>(null);

  function pieceSrc(color: string, type: string) {
    return `/pieces/${color}${type.toUpperCase()}.svg`;
  }

  function canDrag(square: Square) {
    if (!interactive) return false;
    const piece = chess.get(square);
    if (!piece || piece.color !== turn) return false;
    return player === "both" || piece.color === player;
  }

  function beginPointer(event: ReactPointerEvent<HTMLButtonElement>, square: Square) {
    if (!canDrag(square)) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const piece = chess.get(square);
    if (!piece) return;
    let moved = false;
    const src = pieceSrc(piece.color, piece.type);
    function move(ev: PointerEvent) {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
        moved = true;
        setDragFrom(square);
      }
      if (!moved) return;
      setGhost({ src, x: ev.clientX, y: ev.clientY });
    }
    function up(ev: PointerEvent) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      setGhost(null);
      setDragFrom(null);
      suppressClick.current = true;
      if (!moved) {
        onSquare(square);
        return;
      }
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = hit?.closest("[data-square]")?.getAttribute("data-square");
      if (target) onDrop(square, target as Square);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  return (
    <div className="relative w-full">
      <div
        className="grid aspect-square w-full touch-none grid-cols-8 grid-rows-8 overflow-hidden rounded-lg border-4 border-walnut shadow-sm"
        role="grid"
        aria-label="Tabuleiro de xadrez"
      >
        {ranks.map((rank) =>
          files.map((file) => {
            const square = `${file}${rank}` as Square;
            const light = (file.charCodeAt(0) + rank) % 2 === 1;
            const piece = chess.get(square);
            const isSelected = selected === square;
            const isTarget = targets.includes(square);
            const isLast = lastMove?.from === square || lastMove?.to === square;
            const isCheck = checkSquare === square;
            const dragging = dragFrom === square;
            return (
              <button
                key={square}
                type="button"
                role="gridcell"
                data-square={square}
                aria-label={square}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  if (!canDrag(square)) onSquare(square);
                }}
                onPointerDown={(event) => beginPointer(event, square)}
                className={`relative h-full min-h-0 w-full min-w-0 p-0.5 sm:p-1 ${light ? "bg-light" : "bg-dark"} ${isSelected ? "ring-2 ring-inset ring-walnut" : ""} ${isCheck ? "ring-2 ring-inset ring-bad" : ""}`}
              >
                {isLast ? <span className="pointer-events-none absolute inset-0 bg-walnut/25" /> : null}
                {isTarget ? (
                  piece ? (
                    <span className="pointer-events-none absolute inset-1 rounded-full ring-2 ring-ink/35" />
                  ) : (
                    <span className="pointer-events-none absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink/35" />
                  )
                ) : null}
                {piece && !dragging ? (
                  <img
                    alt=""
                    draggable={false}
                    src={pieceSrc(piece.color, piece.type)}
                    className="pointer-events-none relative z-10 h-full w-full select-none object-contain"
                  />
                ) : null}
                {file === files[0] ? (
                  <span className={`absolute top-0.5 left-1 z-0 text-xs leading-none ${light ? "text-walnut/80" : "text-cream/90"}`}>
                    {rank}
                  </span>
                ) : null}
                {rank === ranks[ranks.length - 1] ? (
                  <span className={`absolute right-1 bottom-0.5 z-0 text-xs leading-none ${light ? "text-walnut/80" : "text-cream/90"}`}>
                    {file}
                  </span>
                ) : null}
              </button>
            );
          }),
        )}
        </div>
        {arrows.length > 0 ? (
          <svg className="pointer-events-none absolute inset-1 z-20" viewBox="0 0 100 100">
            <defs>
              <marker id="arrow-good" markerWidth="4" markerHeight="4" refX="3.2" refY="2" orient="auto">
                <path d="M0 0 L4 2 L0 4 z" className="fill-good" />
              </marker>
              <marker id="arrow-bad" markerWidth="4" markerHeight="4" refX="3.2" refY="2" orient="auto">
                <path d="M0 0 L4 2 L0 4 z" className="fill-bad" />
              </marker>
            </defs>
            {arrows.map((arrow) => {
              const start = point(arrow.from, flipped);
              const end = point(arrow.to, flipped);
              const dx = end.x - start.x;
              const dy = end.y - start.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              return (
                <line
                  key={`${arrow.tone}-${arrow.from}${arrow.to}`}
                  x1={start.x + ux * 2.4}
                  y1={start.y + uy * 2.4}
                  x2={end.x - ux * 3.6}
                  y2={end.y - uy * 3.6}
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  className={arrow.tone === "good" ? "stroke-good" : "stroke-bad"}
                  markerEnd={arrow.tone === "good" ? "url(#arrow-good)" : "url(#arrow-bad)"}
                />
              );
            })}
          </svg>
        ) : null}
        {ghost ? (
          <img
            alt=""
            src={ghost.src}
            className="pointer-events-none fixed z-50 size-16 -translate-x-1/2 -translate-y-1/2 object-contain"
            style={{ left: ghost.x, top: ghost.y }}
          />
        ) : null}
      </div>
    );
  }
