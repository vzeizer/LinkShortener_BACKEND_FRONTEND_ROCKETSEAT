import { type ComponentProps, useState } from 'react'
import { tv } from 'tailwind-variants'

const labelStyles = tv({
  base: 'text-sm font-bold text-center transition-colors',
  variants: {
    state: {
      default: 'text-gray-600',
      error: 'text-danger',
      focused: 'text-brand-base', // Add focused state
    },
  },
  defaultVariants: {
    state: 'default',
  },
})

const inputStyles = tv({
  base: 'border rounded-md p-3 outline-none text-gray-600 transition-colors text-center',
  variants: {
    state: {
      default: 'border-gray-300 focus:border-brand-base',
      error: 'border-danger focus:border-danger placeholder:text-danger/50',
      focused: 'border-brand-base', // Add focused state
    },
  },
  defaultVariants: {
    state: 'default',
  },
})

type InputProps = ComponentProps<'input'> & {
  label: string
  isError?: boolean
}

export function Input({ label, isError, onFocus, onBlur, ...props }: InputProps) {
  const [isFocused, setIsFocused] = useState(false)
  
  const state = isError ? 'error' : isFocused ? 'focused' : 'default'

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true)
    onFocus?.(e)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false)
    onBlur?.(e)
  }

  return (
    <div className="flex flex-col gap-1 w-full">
      <label
        htmlFor={props.id || props.name}
        className={labelStyles({ state })}
      >
        {label}
      </label>
      <input
        {...props}
        id={props.id || props.name}
        className={inputStyles({ state })}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    </div>
  )
}