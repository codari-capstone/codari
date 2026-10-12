import { cn } from 'cn'

function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-11 w-full min-w-0 rounded-lg border px-3 text-sm transition-[color,box-shadow] outline-none focus-visible:ring-3 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
