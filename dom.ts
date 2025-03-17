import { ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

type Attributes = {
  [key: string]: string | number | boolean
}
type TooltipPosition = 'top' | 'right' | 'bottom' | 'left'
export function createElement(tag: string, attributes: Attributes = {}, content?: string|Element): HTMLElement {
  const element: HTMLElement = document.createElement(tag)
  for (const [attribute, value] of Object.entries(attributes)) {
    if (typeof value === 'boolean') {
      element.setAttribute(attribute, value ? '' : 'false')
    } else if (value !== null && value !== undefined) {
      element.setAttribute(attribute, String(value))
    }
  }
  if (typeof content === 'string') {
    element.textContent = content
  } else if (content instanceof Element) {
    element.appendChild(content)
  }
  return element
}

export function createTooltip(element: HTMLElement, title: string, position: TooltipPosition = 'top'): HTMLElement {
  const wrapper: HTMLElement = createElement('div', {
    class: 'relative'
  })

  const tooltip: HTMLElement = createElement('div', {
    class: 'absolute hidden group-hover:block z-50 px-3 py-2 text-xs bg-neutral-950 text-light rounded pointer-events-none whitespace-nowrap'
  })
  tooltip.textContent = title

  const positions = {
    top: ['bottom-full', 'left-1/2', '-translate-x-1/2', '-translate-y-1'],
    right: ['left-full', 'top-1/2', 'translate-x-1', '-translate-y-1/2'],
    bottom: ['top-full', 'left-1/2', '-translate-x-1/2', 'translate-y-1'],
    left: ['right-full', 'top-1/2', '-translate-x-1', '-translate-y-1/2']
  }

  positions[position].forEach(className => {
    tooltip.classList.add(className)
  })

  wrapper.classList.add('group')
  wrapper.appendChild(tooltip)
  wrapper.appendChild(element)

  return wrapper
}

export function merge(...classes: ClassValue[]): string {
  return twMerge(clsx(classes))
}
