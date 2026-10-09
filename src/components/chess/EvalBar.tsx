import { evalBarPercent, type WhiteEval } from "@/lib/eval";

export function EvalBar({ evalWhite, flipped }: { evalWhite: WhiteEval; flipped: boolean }) {
  const white = evalBarPercent(evalWhite);
  return (
    <div className="relative w-6 self-stretch overflow-hidden rounded-md border border-line bg-ink sm:w-7" aria-hidden>
      <div
        className="eval-fill absolute right-0 left-0 bg-paper transition-[height] duration-300 ease-out"
        style={flipped ? { top: 0, height: `${white}%` } : { bottom: 0, height: `${white}%` }}
      />
    </div>
  );
}