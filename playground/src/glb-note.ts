/**
 * The words beside Share → Export → GLB (ruling PG-D5; card X5's note): what the browser writes,
 * and that it does not check it, as the CLI does. Apart from glb-export.ts and preview3d.ts so the
 * startup chunk can put the note in the menu without loading the writer or three.js.
 */

/** The package's own command for the validated GLB of a plan file. */
export const GLB_COMMAND = "npx -y @chanmeng666/archlang-3d build plan.arch -o plan.glb";
/** The note's words around {@link GLB_COMMAND}. */
export const GLB_NOTE_LEAD = "The whole plan as a GLB, written in your browser and not validated here. ";
export const GLB_NOTE_TAIL = " writes the same file and checks it with the Khronos glTF validator.";

/** Write the note into `el`: the lead, the command as code, the tail. */
export function fillGlbNote(el: HTMLElement): void {
  const cmd = document.createElement("code");
  cmd.className = "tools-code";
  cmd.textContent = GLB_COMMAND;
  el.replaceChildren(GLB_NOTE_LEAD, cmd, GLB_NOTE_TAIL);
}
