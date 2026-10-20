import { cva } from 'class-variance-authority'

export { default as Badge } from './Badge.vue'

export const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[var(--color-primary)] text-[var(--color-primary-foreground)]',
        secondary: 'border-transparent bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]',
        outline: 'border-[var(--color-border)] text-[var(--color-foreground)]',
        destructive: 'border-transparent bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)
