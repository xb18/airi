<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'

import type { RegisteredItem, SwipeActionsSelectEvent } from './context'

import { Primitive, useForwardExpose } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, toRef } from 'vue'

import { injectSwipeActionsContext, injectSwipeActionsListContext } from './context'

const props = withDefaults(defineProps<PrimitiveProps & {
  /** Unique, stable action identity within its List. */
  value: string
  /** Prevents selection by pressing or full swipe. @default false */
  disabled?: boolean
}>(), { as: 'button', disabled: false })
const emit = defineEmits<{
  /** Prevent default to cancel selection before the Root emits its action. */
  select: [event: SwipeActionsSelectEvent]
}>()
const context = injectSwipeActionsContext()
const { forwardRef, currentElement } = useForwardExpose()
const disabled = computed(() => props.disabled || context.disabled.value)
const list = injectSwipeActionsListContext()
const edge = computed<'left' | 'right'>(() => (list.side.value === 'end') === (context.direction.value === 'ltr') ? 'right' : 'left')
const item: RegisteredItem = {
  list,
  element: currentElement,
  value: toRef(props, 'value'),
  disabled: toRef(props, 'disabled'),
  select: event => emit('select', event),
}
let unregister: (() => void) | undefined
onMounted(() => unregister = context.register(item))
onBeforeUnmount(() => unregister?.())
const takeover = computed(() => context.itemTakeover(item))

/** Triggering workflow: pointer or native keyboard click -> Root selection. */
function press(event: MouseEvent) {
  if (disabled.value) {
    event.preventDefault()
    return
  }
  context.activate(item)
}

/** Custom elements need the same keyboard activation that native buttons supply. */
function keydown(event: KeyboardEvent) {
  const element = currentElement.value
  if (element.tagName === 'BUTTON' || (element.tagName === 'A' && element.hasAttribute('href')))
    return
  if (event.key !== 'Enter' && event.key !== ' ')
    return
  event.preventDefault()
  if (!disabled.value && !event.repeat)
    context.activate(item)
}
</script>

<template>
  <Primitive
    :ref="forwardRef" :as="as" :as-child="asChild"
    :type="as === 'button' ? 'button' : undefined"
    :role="as === 'button' && !asChild ? undefined : 'button'"
    :disabled="disabled" :aria-disabled="disabled || undefined" :tabindex="disabled ? -1 : 0"
    data-swipe-actions-item :data-value="value"
    :data-disabled="disabled ? '' : undefined"
    :data-state="takeover > 0 ? 'expanded' : 'idle'"
    :style="context.actionStyle(item)"
    @click="press" @keydown="keydown"
  >
    <slot :takeover="takeover" :disabled="disabled" :side="list.side.value" :edge="edge" />
  </Primitive>
</template>
