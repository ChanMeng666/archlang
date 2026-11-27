// Let TypeScript resolve single-file component imports in the custom theme.
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// The two default-theme components this site overrides (components/VPSidebarItem.vue and
// components/VPNavBarSearchButton.vue, aliased in config.ts) import these VitePress internals,
// which ship without type declarations. Only the members those files use are declared.
declare module "vitepress/dist/client/theme-default/composables/sidebar.js" {
  import type { ComputedRef, Ref } from "vue";
  import type { DefaultTheme } from "vitepress/theme";
  export function useSidebarControl(item: ComputedRef<DefaultTheme.SidebarItem>): {
    collapsed: Ref<boolean>;
    collapsible: ComputedRef<boolean>;
    isLink: ComputedRef<boolean>;
    isActiveLink: Ref<boolean>;
    hasActiveLink: ComputedRef<boolean>;
    hasChildren: ComputedRef<boolean>;
    toggle: () => void;
  };
}
declare module "vitepress/dist/client/theme-default/support/translation.js" {
  export function createSearchTranslate(defaultTranslations: object): (key: string) => string;
}
