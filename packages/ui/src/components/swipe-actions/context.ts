import type { CSSProperties, Ref } from 'vue'

import { createContext } from 'reka-ui'

/** Item selection can be canceled before the Root emits an action. */
export type SwipeActionsSelectEvent = CustomEvent<{ value: string, source: 'press' | 'swipe' }>

/** A mounted item's identity and live props. Registration belongs to one Root. */
export interface RegisteredItem {
  element: Readonly<Ref<HTMLElement>>
  value: Readonly<Ref<string>>
  disabled: Readonly<Ref<boolean>>
  select: (event: SwipeActionsSelectEvent) => void
}

/** Internal coordination between the gesture owner and its rendered parts. */
interface SwipeActionsContext {
  open: Readonly<Ref<boolean>>
  armed: Readonly<Ref<boolean>>
  committing: Readonly<Ref<boolean>>
  disabled: Readonly<Ref<boolean>>
  reveal: Readonly<Ref<number>>
  actionWidth: Ref<number>
  actionGap: Ref<number>
  register: (item: RegisteredItem) => () => void
  refreshOrder: () => void
  actionStyle: (item: RegisteredItem) => CSSProperties
  itemTakeover: (item: RegisteredItem) => number
  activate: (item: RegisteredItem) => void
  close: () => void
  toggle: () => void
  closeContent: (event: MouseEvent) => void
}

export const [injectSwipeActionsContext, provideSwipeActionsContext] = createContext<SwipeActionsContext>('SwipeActionsRoot')
