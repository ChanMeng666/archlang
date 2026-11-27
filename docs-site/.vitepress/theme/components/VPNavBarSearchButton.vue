<!--
  ArchLang override of VitePress 1.6.4's VPNavBarSearchButton.vue (aliased in config.ts, the
  "Overriding Internal Components" route VitePress documents). Two changes, both accessibility:

  1. No aria-label. The upstream label "Search" left out the shortcut keys drawn inside the
     button ("Ctrl K", or "⌘ K" on a Mac), so the accessible name did not contain the visible text
     (WCAG SC 2.5.3 Label in Name; axe label-content-name-mismatch on every page). The name now
     comes from the button's own text, and the shortcut is also stated in aria-keyshortcuts.
     (Upstream's `.dark` variables block is dropped: this site is light-only, ADR 0014.)
  2. Below 768px the "Search" text is visually hidden rather than display:none, so the
     icon-only button keeps a name on a phone.

  Everything else is the upstream file. Re-copy it when VitePress is upgraded.
-->
<script lang="ts" setup>
import { createSearchTranslate } from 'vitepress/dist/client/theme-default/support/translation.js'

type ButtonTranslations = { buttonText?: string; buttonAriaLabel?: string }

// Button-Translations
const defaultTranslations: { button: ButtonTranslations } = {
  button: {
    buttonText: 'Search',
    buttonAriaLabel: 'Search'
  }
}

const translate = createSearchTranslate(defaultTranslations)
</script>

<template>
  <button type="button" class="DocSearch DocSearch-Button" aria-keyshortcuts="Control+K Meta+K /">
    <span class="DocSearch-Button-Container">
      <span class="vp-icon DocSearch-Search-Icon" aria-hidden="true"></span>
      <span class="DocSearch-Button-Placeholder">{{ translate('button.buttonText') }}</span>
    </span>
    <span class="DocSearch-Button-Keys">
      <kbd class="DocSearch-Button-Key"></kbd>
      <kbd class="DocSearch-Button-Key">K</kbd>
    </span>
  </button>
</template>

<style>
[class*='DocSearch'] {
  --docsearch-primary-color: var(--vp-c-brand-1);
  --docsearch-highlight-color: var(--docsearch-primary-color);
  --docsearch-text-color: var(--vp-c-text-1);
  --docsearch-muted-color: var(--vp-c-text-2);
  --docsearch-searchbox-shadow: none;
  --docsearch-searchbox-background: transparent;
  --docsearch-searchbox-focus-background: transparent;
  --docsearch-key-gradient: transparent;
  --docsearch-key-shadow: none;
  --docsearch-modal-background: var(--vp-c-bg-soft);
  --docsearch-footer-background: var(--vp-c-bg);
}


.DocSearch-Button {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0;
  padding: 0;
  width: 48px;
  height: 55px;
  background: transparent;
  transition: border-color var(--dur-press) var(--ease-out);
}

.DocSearch-Button:hover {
  background: transparent;
}

.DocSearch-Button:focus {
  outline: 1px dotted;
  outline: 5px auto -webkit-focus-ring-color;
}

.DocSearch-Button-Key--pressed {
  transform: none;
  box-shadow: none;
}

.DocSearch-Button:focus:not(:focus-visible) {
  outline: none !important;
}

@media (min-width: 768px) {
  .DocSearch-Button {
    justify-content: flex-start;
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 0 10px 0 12px;
    width: 100%;
    height: 40px;
    background-color: var(--vp-c-bg-alt);
  }

  .DocSearch-Button:hover {
    border-color: var(--vp-c-brand-1);
    background: var(--vp-c-bg-alt);
  }
}

.DocSearch-Button .DocSearch-Button-Container {
  display: flex;
  align-items: center;
}

.DocSearch-Button .DocSearch-Search-Icon {
  position: relative;
  width: 16px;
  height: 16px;
  color: var(--vp-c-text-1);
  fill: currentColor;
  transition: color var(--dur-press) var(--ease-out);
}

.DocSearch-Button:hover .DocSearch-Search-Icon {
  color: var(--vp-c-text-1);
}

@media (min-width: 768px) {
  .DocSearch-Button .DocSearch-Search-Icon {
    top: 1px;
    margin-right: 8px;
    width: 14px;
    height: 14px;
    color: var(--vp-c-text-2);
  }
}

.DocSearch-Button .DocSearch-Button-Placeholder {
  /* Visually hidden, not display:none: it is the button's accessible name on a phone. The
     display is restated because DocSearch's own CSS hides the placeholder below 768px. */
  display: inline-block;
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  margin-top: 2px;
  padding: 0 16px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-text-2);
  transition: color var(--dur-press) var(--ease-out);
}

.DocSearch-Button:hover .DocSearch-Button-Placeholder {
  color: var(--vp-c-text-1);
}

@media (min-width: 768px) {
  .DocSearch-Button .DocSearch-Button-Placeholder {
    position: static;
    width: auto;
    height: auto;
    overflow: visible;
    clip-path: none;
    display: inline-block;
  }
}

.DocSearch-Button .DocSearch-Button-Keys {
  /*rtl:ignore*/
  direction: ltr;
  display: none;
  min-width: auto;
}

@media (min-width: 768px) {
  .DocSearch-Button .DocSearch-Button-Keys {
    display: flex;
    align-items: center;
  }
}

.DocSearch-Button .DocSearch-Button-Key {
  display: block;
  margin: 2px 0 0 0;
  border: 1px solid var(--vp-c-divider);
  /*rtl:begin:ignore*/
  border-right: none;
  border-radius: 4px 0 0 4px;
  padding-left: 6px;
  /*rtl:end:ignore*/
  min-width: 0;
  width: auto;
  height: 22px;
  line-height: 22px;
  font-family: var(--vp-font-family-base);
  font-size: 12px;
  font-weight: 500;
  transition:
    color var(--dur-press) var(--ease-out),
    border-color var(--dur-press) var(--ease-out);
}

.DocSearch-Button .DocSearch-Button-Key + .DocSearch-Button-Key {
  /*rtl:begin:ignore*/
  border-right: 1px solid var(--vp-c-divider);
  border-left: none;
  border-radius: 0 4px 4px 0;
  padding-left: 2px;
  padding-right: 6px;
  /*rtl:end:ignore*/
}

.DocSearch-Button .DocSearch-Button-Key:first-child {
  font-size: 0 !important;
}

.DocSearch-Button .DocSearch-Button-Key:first-child:after {
  content: 'Ctrl';
  font-size: 12px;
  letter-spacing: normal;
  color: var(--docsearch-muted-color);
}

.mac .DocSearch-Button .DocSearch-Button-Key:first-child:after {
  content: '\2318';
}

.DocSearch-Button .DocSearch-Button-Key:first-child > * {
  display: none;
}

.DocSearch-Search-Icon {
  --icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' stroke-width='1.6' viewBox='0 0 20 20'%3E%3Cpath fill='none' stroke='currentColor' stroke-linecap='round' stroke-linejoin='round' d='m14.386 14.386 4.088 4.088-4.088-4.088A7.533 7.533 0 1 1 3.733 3.733a7.533 7.533 0 0 1 10.653 10.653z'/%3E%3C/svg%3E");
}
</style>
