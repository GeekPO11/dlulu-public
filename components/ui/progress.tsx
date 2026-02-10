import * as React from "react"
import { cn } from "../../lib/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  variant?: "linear" | "circular"
  size?: "sm" | "md" | "lg"
  showValue?: boolean
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, variant = "linear", size = "md", showValue = false, ...props }, ref) => {
    const clampedValue = Math.min(100, Math.max(0, value))

    if (variant === "circular") {
      const sizes = {
        sm: { containerSize: 48, strokeWidth: 4, radius: 18, fontSize: "text-xs" },
        md: { containerSize: 64, strokeWidth: 5, radius: 26, fontSize: "text-sm" },
        lg: { containerSize: 80, strokeWidth: 6, radius: 34, fontSize: "text-base" },
      }
      const { containerSize, strokeWidth, radius, fontSize } = sizes[size]
      const circumference = 2 * Math.PI * radius
      const strokeDashoffset = circumference - (clampedValue / 100) * circumference

      return (
        <div
          ref={ref}
          className={cn("relative inline-flex items-center justify-center", className)}
          style={{ width: containerSize, height: containerSize }}
          {...props}
        >
          <svg
            className="transform -rotate-90"
            width={containerSize}
            height={containerSize}
          >
            {/* Background circle */}
            <circle
              cx={containerSize / 2}
              cy={containerSize / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-muted"
            />
            {/* Progress circle */}
            <circle
              cx={containerSize / 2}
              cy={containerSize / 2}
              r={radius}
              fill="none"
              stroke="url(#progressGradient)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-500 ease-out"
            />
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(var(--primary))" />
                <stop offset="100%" stopColor="hsl(var(--primary) / 0.7)" />
              </linearGradient>
            </defs>
          </svg>
          {showValue && (
            <span className={cn("absolute font-semibold text-foreground", fontSize)}>
              {Math.round(clampedValue)}%
            </span>
          )}
        </div>
      )
    }

    // Linear progress
    return (
      <div
        ref={ref}
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-muted",
          size === "sm" && "h-1.5",
          size === "md" && "h-2",
          size === "lg" && "h-3",
          className
        )}
        {...props}
      >
        <div
          className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500 ease-out rounded-full"
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    )
  }
)
Progress.displayName = "Progress"

export { Progress }
