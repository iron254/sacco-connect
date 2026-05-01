import { Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

export const Logo = ({ className, variant = "default" }: { className?: string; variant?: "default" | "light" }) => (
  <div className={cn("flex items-center gap-2.5", className)}>
    <div className={cn(
      "flex h-9 w-9 items-center justify-center rounded-md",
      variant === "light" ? "bg-accent text-accent-foreground" : "bg-gradient-primary text-primary-foreground"
    )}>
      <Landmark className="h-5 w-5" />
    </div>
    <div className="flex flex-col leading-none">
      <span className={cn("font-display text-lg font-semibold", variant === "light" ? "text-primary-foreground" : "text-foreground")}>
        Umoja SACCO
      </span>
      <span className={cn("text-[10px] uppercase tracking-widest", variant === "light" ? "text-primary-foreground/70" : "text-muted-foreground")}>
        Members Portal
      </span>
    </div>
  </div>
);
