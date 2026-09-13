<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'

import { useMutationObserver } from '@vueuse/core'
import { Primitive, useForwardExpose } from 'reka-ui'
import { watchEffect } from 'vue'

import { injectSwipeActionsContext } from './context'

const props = withDefaults(defineProps<PrimitiveProps & {
  /** Settled width per Item in CSS pixels. @default 88 */
  actionWidth?: number
  /** Maximum gap between Items in CSS pixels. @default 8 */
  gap?: number
}>(), { as: 'div', actionWidth: 88, gap: 8 })
const context = injectSwipeActionsContext()
const { open, reveal } = context
const { forwardRef, currentElement } = useForwardExpose()
watchEffect(() => {
  context.actionWidth.value = props.actionWidth
  context.actionGap.value = props.gap
})
// VueUse disconnects this observer when the List unmounts. DOM order also
// covers keyed reorders that do not mount or unregister an Item.
useMutationObserver(currentElement, context.refreshOrder, { childList: true, subtree: true })
</script>

<template>
  <Primitive
    :ref="forwardRef" :as="as" :as-child="asChild"
    data-swipe-actions-list
    :inert="!open" :aria-hidden="!open"
    :style="{ position: 'absolute', zIndex: 0, insetBlock: '0', right: '0', width: `${reveal}px`, visibility: reveal === 0 ? 'hidden' : 'visible', overflow: 'hidden' }"
  >
    <slot />
  </Primitive>
</template>
