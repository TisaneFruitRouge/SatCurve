import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  estimatedBlockDate,
  formatDate,
  formatRelative,
  formatBlockNumber,
} from "../lib/format";
import type { ReactNode } from "react";

interface BlockTooltipProps {
  block: number;
  currentBlock: number;
  children?: ReactNode;
}

export function BlockTooltip({ block, currentBlock, children }: BlockTooltipProps) {
  const date = estimatedBlockDate(block, currentBlock);
  const dateStr = formatDate(date);
  const relStr = formatRelative(date);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help underline decoration-dashed decoration-text-faint underline-offset-2">
            {children ?? `#${formatBlockNumber(block)}`}
          </span>
        </TooltipTrigger>
        <TooltipContent className="bg-surface border-border text-text text-xs px-3 py-1.5">
          <p>Block #{formatBlockNumber(block)}</p>
          <p className="text-text-muted">
            ~{dateStr} · {relStr}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
