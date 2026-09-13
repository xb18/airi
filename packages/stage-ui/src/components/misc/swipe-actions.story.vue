<script setup lang="ts">
import { BasicButton, SwipeActionButton, SwipeActionsContent, SwipeActionsItem, SwipeActionsList, SwipeActionsRoot } from '@proj-airi/ui'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const showLabel = ref(true)
const open = ref(false)
const actions = [
  { id: 'delete', color: 'bg-red-500', icon: 'i-solar:trash-bin-trash-outline' },
  { id: 'archive', color: 'bg-neutral-500', icon: 'i-solar:archive-outline' },
  { id: 'pin', color: 'bg-green-500', icon: 'i-solar:pin-outline' },
]
</script>

<template>
  <Story title="Swipe Actions" group="misc" auto-props-disabled>
    <template #controls>
      <HstCheckbox v-model="showLabel" :title="t('stage.chat.swipe-demo.show-label')" />
    </template>
    <Variant id="playground" title="Playground">
      <SwipeActionsRoot v-slot="{ toggle }" v-model:open="open" :class="['w-full max-w-96 rounded-2xl']">
        <SwipeActionsContent>
          <div :class="['h-20 flex items-center gap-3 overflow-hidden rounded-2xl bg-white px-4 dark:bg-neutral-800']">
            <span :class="['i-solar:chat-line-outline size-5 shrink-0 text-neutral-400']" />
            <span :class="['min-w-0 flex-1 truncate']">{{ t('stage.chat.swipe-demo.row', { n: 1 }) }}</span>
            <BasicButton :aria-label="t('stage.chat.swipe-demo.actions')" @click="toggle">
              <span :class="['i-solar:menu-dots-bold size-5']" />
            </BasicButton>
          </div>
        </SwipeActionsContent>
        <SwipeActionsList :action-width="72">
          <SwipeActionsItem
            v-for="action in actions" :key="action.id"
            v-slot="{ takeover }" :value="action.id" as-child
          >
            <SwipeActionButton
              :label="t(`stage.chat.swipe-demo.${action.id}`)"
              :icon="action.icon"
              :surface-class="`${action.color} text-white`"
              :show-label="showLabel"
              :takeover="takeover"
            />
          </SwipeActionsItem>
        </SwipeActionsList>
      </SwipeActionsRoot>
    </Variant>
  </Story>
</template>
