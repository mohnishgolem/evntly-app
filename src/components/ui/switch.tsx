import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-foreground/20 transition-colors outline-none data-checked:bg-highlight data-disabled:opacity-60 focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-checked:translate-x-5"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
