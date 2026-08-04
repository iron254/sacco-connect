import { forwardRef } from "react";
import { Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

type LogoProps = React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "light" };

export const Logo = forwardRef<HTMLDivElement, LogoProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center gap-2.5", className)} {...props}>
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
  )
);
Logo.displayName = "Logo";
