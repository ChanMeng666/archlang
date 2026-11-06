<script setup lang="ts">
// One door's way in: the link, the URL to paste, the prompt or the command, read from
// doors.json through ../doors.ts. Used by /start (StartDoors) and the home doors card
// (DoorsCard), so the two surfaces cannot disagree about a door. The words around it are
// door-copy.json's; nothing here is typed twice.
import { AGENT_PROMPT, doors, type DoorId } from "../doors";
import CopyBox from "./CopyBox.vue";

defineProps<{ id: DoorId }>();
</script>

<template>
  <div class="door" :data-door="id">
    <template v-if="id === 'playground'">
      <a class="door__link" :href="doors.playground.url" target="_blank" rel="noopener"
        >{{ doors.playground.label }}&nbsp;↗</a
      >
      <span class="door__note">{{ doors.playground.note }}</span>
    </template>

    <template v-else-if="id === 'chatgpt'">
      <a class="door__link" :href="doors.chatgpt.url" target="_blank" rel="noopener"
        >{{ doors.chatgpt.label }}&nbsp;↗</a
      >
      <span class="door__note">{{ doors.chatgpt.note }}</span>
      <p class="door__label">Then ask, for example:</p>
      <CopyBox :text="doors.chatgpt.example" label="the example prompt for ChatGPT" />
      <p class="door__label">{{ doors.chatgpt.returns }}</p>
    </template>

    <template v-else-if="id === 'claudeai'">
      <p class="door__label">{{ doors.claudeai.label }} · {{ doors.claudeai.note }}</p>
      <CopyBox :text="doors.claudeai.url" label="the claude.ai connector URL" />
      <ol class="door__steps">
        <li v-for="s in doors.claudeai.steps" :key="s">{{ s }}</li>
      </ol>
      <p class="door__label">{{ doors.claudeai.plansNote }}</p>
      <p class="door__label">
        <a :href="doors.claudeai.stepsSource" target="_blank" rel="noopener"
          >Claude's help page on custom connectors&nbsp;↗</a
        >
      </p>
    </template>

    <template v-else-if="id === 'agent'">
      <CopyBox :text="AGENT_PROMPT" label="the prompt for your agent" />
      <p class="door__label">Claude Code, connected to the hosted server:</p>
      <CopyBox :text="doors.agent.claudeCodeHttp" label="the Claude Code command" />
      <p class="door__label">
        The skill on its own:
        <a :href="doors.agent.skills.url" target="_blank" rel="noopener">skills.sh&nbsp;↗</a>
      </p>
      <CopyBox :text="doors.agent.skills.command" label="the skills command" />
    </template>

    <template v-else-if="id === 'vscode'">
      <a class="door__link" :href="doors.vscode.marketplace" target="_blank" rel="noopener"
        >{{ doors.vscode.label }}, Visual Studio Marketplace&nbsp;↗</a
      >
      <a class="door__link" :href="doors.vscode.openVsx" target="_blank" rel="noopener"
        >{{ doors.vscode.label }}, Open VSX&nbsp;↗</a
      >
    </template>
  </div>
</template>

<style scoped>
.door {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 16px;
}
.door > :deep(.copybox) {
  flex: 1 1 100%;
}
.door__link {
  font-weight: 600;
}
.door__note,
.door__label {
  margin: 0;
  font-size: 14px;
  color: var(--ink-muted);
}
.door__label {
  flex: 1 1 100%;
}
.door__steps {
  flex: 1 1 100%;
  margin: 0;
  padding-left: 1.4em;
  font-size: 14px;
  line-height: 1.6;
  color: var(--ink);
}
</style>
