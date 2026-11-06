/**
 * The Make-your-own sheet: every way to get a plan of your own, at equal weight, in the order
 * `site-shared/doors.json` gives the playground (`order.playground`). Every URL, command and the
 * agent prompt are read from that file, the one source every public surface shares
 * (test/site-doors.test.ts), so nothing here retypes a door.
 *
 * A chunk of its own, loaded on the sheet's first open (shell.ts): the view path never carries it.
 *
 * Privacy (PS-D9): opening the sheet sends nothing anywhere. "Start from this plan" is the one
 * control here that stores the plan on a server (a short link, `/api/share`), and only when it is
 * clicked, next to the note that says so; any failure falls back to the full `#z=` link, which
 * no browser sends to a server. The chat links say, next to them, that they put the plan in
 * that site's address.
 *
 * "Continue this plan with your AI" (ruling PG-D5) is the page's one home for handing the plan to an
 * AI: Open in Claude, Open in ChatGPT and Copy for LLM (`#copyLlm`), which the More menu no longer
 * repeats. The links are wired by actions.ts (shell.ts hands them over): a prefilled share link,
 * the copy fallback for a plan too long for a URL, the bare host after an edit.
 */
import { agentPrompt, canonicalLine, doors, links, order } from "../../site-shared/doors.json";
import { escapeHtml } from "./escape.js";
import { CHAT_HOSTS } from "./llm-prompt.js";
import { createShortLink, encodeSrc } from "./share.js";

/**
 * The two most-asked questions, answered by a docs page each (not doors: no plan comes out). The
 * URLs are doors.json's `links`; the labels live here, as the card words them.
 */
export const TOP_ASKS = [
  { label: "Starting from a photo or PDF? →", href: links.fromAnImage },
  { label: "Change one room only? →", href: links.editOneRoom },
] as const;

/**
 * What the chat links do with the plan, said where they sit (the sheet has no link buttons of its
 * own, so the note names Share's): a plan that fits goes into the host's address (its share link
 * inside the prefilled prompt), so the host's servers receive it; a longer one is copied instead;
 * only Copy full link keeps the plan off every server, and Copy short link stores it on ours.
 */
export const CHAT_NOTE =
  "These links put this plan in the chat host's URL, so the host's servers receive it, and the host may send it as your first message. A plan too long for a URL is copied instead, for you to paste. To keep the plan off every server, use Copy full link in Share; Copy short link stores it on archlang.uk's server.";

/** The agent prompt as one copyable text, line for line as doors.json has it. */
export const AGENT_PROMPT = agentPrompt.join("\n");

/** The prompt with a link to this plan appended ("Start from this plan"). */
export const promptWithPlan = (link: string): string => `${AGENT_PROMPT}\nStart from this plan: ${link}`;

/** One copyable line in an agent's tab: a caption and the exact text the Copy button copies. */
export interface CopyRow {
  caption: string;
  text: string;
}

const agent = doors.agent;

/** The coding-agent tabs: each agent's setup, every line a doors.json value. */
export const AGENT_TABS: readonly { id: string; label: string; rows: CopyRow[] }[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    rows: [
      { caption: "The hosted MCP server", text: agent.claudeCodeHttp },
      { caption: "Or the plugin, typed in Claude Code", text: agent.plugin.join("\n") },
    ],
  },
  { id: "codex", label: "Codex", rows: [{ caption: "The ArchLang skill", text: agent.skills.command }] },
  {
    id: "cursor",
    label: "Cursor",
    rows: [
      { caption: "The ArchLang skill", text: agent.skills.command },
      { caption: "Or the MCP server, in .cursor/mcp.json", text: JSON.stringify(agent.mcpConfig, null, 2) },
    ],
  },
  {
    id: "vscode",
    label: "VS Code",
    rows: [{ caption: "The ArchLang skill (or the extension, below)", text: agent.skills.command }],
  },
];

/** The doors the playground shows, in its order. An unknown key is a doors.json error, loudly. */
export function playgroundDoors(): string[] {
  for (const k of order.playground) if (!(k in doors)) throw new Error(`doors.json: unknown door "${k}"`);
  return order.playground;
}

const ext = (href: string, text: string, attrs = "") =>
  `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"${attrs}>${escapeHtml(text)}</a>`;

/** A line of code with a Copy button; `key` names the text in the sheet's copy table. */
const copyRow = (key: string, text: string, caption?: string) =>
  `<div class="mo-copy">${caption ? `<p class="mo-cap">${escapeHtml(caption)}</p>` : ""}` +
  `<div class="mo-copyrow"><code>${escapeHtml(text)}</code>` +
  `<button type="button" class="mo-copybtn" data-copy="${escapeHtml(key)}">Copy</button></div></div>`;

const door = (key: string, title: string, body: string) =>
  `<li class="mo-door" data-door="${key}"><h3>${escapeHtml(title)}</h3>${body}</li>`;

function doorHtml(key: string): string {
  switch (key) {
    case "chatgpt":
      return door(
        key,
        "ChatGPT",
        `${ext(doors.chatgpt.url, `${doors.chatgpt.label} ↗`, ' class="mo-go"')}<span>No install.</span>` +
          copyRow("chatgptExample", doors.chatgpt.example, "Then ask, for example:") +
          `<span>${escapeHtml(doors.chatgpt.returns)}</span>`,
      );
    case "claudeai":
      return door(
        key,
        "claude.ai",
        `${copyRow("claudeai", doors.claudeai.url)}<span>No install: add it as a custom connector.</span>` +
          `<ol class="mo-steps">${doors.claudeai.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>` +
          `<span>${escapeHtml(doors.claudeai.plansNote)}</span>` +
          `<span>${ext(doors.claudeai.stepsSource, "Claude's help page on custom connectors ↗")}</span>`,
      );
    case "agent": {
      const tabs = AGENT_TABS.map(
        (t, i) =>
          `<button type="button" role="tab" id="moTab-${t.id}" aria-controls="moPanel-${t.id}" ` +
          `aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${escapeHtml(t.label)}</button>`,
      ).join("");
      const panels = AGENT_TABS.map(
        (t, i) =>
          `<div role="tabpanel" id="moPanel-${t.id}" aria-labelledby="moTab-${t.id}"${i === 0 ? "" : " hidden"}>` +
          t.rows.map((r, j) => copyRow(`${t.id}.${j}`, r.text, r.caption)).join("") +
          `</div>`,
      ).join("");
      return door(
        key,
        doors.agent.label,
        `<span>Paste this into it; it writes the plan and checks it.</span>` +
          `<pre class="mo-prompt" id="moPrompt">${escapeHtml(AGENT_PROMPT)}</pre>` +
          `<div class="mo-actions"><button type="button" class="mo-copybtn" data-copy="prompt">Copy prompt</button>` +
          `<button type="button" class="mo-copybtn" id="moStartHere" aria-describedby="moStartNote">Start from this plan</button></div>` +
          `<p class="mo-note" id="moStartNote">Start from this plan stores this plan on archlang.uk's server for a short link, adds the link to the prompt and copies it.</p>` +
          `<p class="mo-cap">Set it up once:</p>` +
          `<div class="mo-tabs" role="tablist" aria-label="Coding agent">${tabs}</div>${panels}` +
          `<span>${ext(agent.skills.url, "The skill on skills.sh ↗")} · ` +
          `${ext(links.agents, "Every way to set up an agent ↗", ' id="agentsLink"')}</span>`,
      );
    }
    case "vscode":
      return door(
        key,
        doors.vscode.label,
        `<span class="mo-links">${ext(doors.vscode.marketplace, "Visual Studio Marketplace ↗", ' class="mo-go"')} ` +
          `${ext(doors.vscode.openVsx, "Open VSX ↗", ' class="mo-go"')}</span><span>Diagnostics as you type, and plans in Markdown preview.</span>`,
      );
    case "playground":
      return door(
        key,
        "Here",
        `<button type="button" class="mo-go" data-mo-edit>Edit this plan here</button><span>Opens the source beside the drawing.</span>`,
      );
    default:
      throw new Error(`doors.json: no sheet entry for door "${key}"`);
  }
}

/** The sheet's body, under its heading: the doors, Continue with your AI, the two top asks, a status line. */
export function sheetHtml(): string {
  const chat = (Object.keys(CHAT_HOSTS) as (keyof typeof CHAT_HOSTS)[])
    .map((h) =>
      ext(CHAT_HOSTS[h].base, `Open in ${CHAT_HOSTS[h].name} ↗`, ` data-chat-host="${h}" aria-describedby="chatNote"`),
    )
    .join(" ");
  return (
    `<p class="mo-lede">${escapeHtml(canonicalLine)}</p>` +
    `<ul class="mo-doors">${playgroundDoors().map(doorHtml).join("")}</ul>` +
    `<section class="mo-ask" aria-labelledby="moAskHead"><h3 id="moAskHead">Continue this plan with your AI</h3>` +
    `<p class="mo-links">${chat} ` +
    `<button type="button" class="mo-go" id="copyLlm" title="Copy a paste-ready prompt (source + facts + diagnostics) for an AI assistant">Copy for LLM</button></p>` +
    `<p class="mo-note" id="chatNote">${escapeHtml(CHAT_NOTE)}</p></section>` +
    `<p class="mo-top">${TOP_ASKS.map((a) => ext(a.href, a.label)).join(" ")}</p>` +
    `<p class="mo-status" id="moStatus" role="status" aria-live="polite"></p>`
  );
}

export interface SheetCtx {
  /** The plan on screen, for "Start from this plan". */
  getSource(): string;
}

export interface Sheet {
  /** Called on every open: the prompt goes back to the plain one and the status line clears. */
  reset(): void;
}

/** Render the sheet into `body` and wire its copy buttons, its tabs and "Start from this plan". */
export function mountSheet(body: HTMLElement, ctx: SheetCtx): Sheet {
  body.innerHTML = sheetHtml();
  const status = body.querySelector<HTMLElement>("#moStatus")!;
  const promptEl = body.querySelector<HTMLElement>("#moPrompt")!;
  const startBtn = body.querySelector<HTMLButtonElement>("#moStartHere")!;
  let prompt = AGENT_PROMPT;

  const texts = new Map<string, string>([
    ["claudeai", doors.claudeai.url],
    ["chatgptExample", doors.chatgpt.example],
  ]);
  for (const t of AGENT_TABS) for (const [j, r] of t.rows.entries()) texts.set(`${t.id}.${j}`, r.text);

  const say = (msg: string) => {
    status.textContent = msg;
  };
  async function copy(text: string, btn: HTMLButtonElement, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      say(done);
      const label = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => {
        if (btn.textContent === "Copied") btn.textContent = label;
      }, 1500);
    } catch {
      say("Copy failed: select the text and copy it");
    }
  }

  body.addEventListener("click", (e) => {
    const btn = (e.target as Element | null)?.closest<HTMLButtonElement>("button.mo-copybtn[data-copy]");
    if (!btn) return;
    const key = btn.dataset.copy!;
    if (key === "prompt") void copy(prompt, btn, "Prompt copied");
    else void copy(texts.get(key) ?? "", btn, "Copied");
  });

  // "Start from this plan": the short link is made here, on this click, and never before.
  // While it works the button stays focusable (a disabled button would drop the focus out of the
  // sheet) and a second click is ignored.
  let busy = false;
  startBtn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    startBtn.setAttribute("aria-busy", "true");
    say("Making a link to this plan…");
    try {
      const hash = await encodeSrc(ctx.getSource());
      const full = `${location.origin}${location.pathname}${hash}`;
      const short = await createShortLink(hash);
      prompt = promptWithPlan(short ?? full);
      promptEl.textContent = prompt;
      promptEl.scrollTop = promptEl.scrollHeight; // the added line is the one to see
      await copy(
        prompt,
        startBtn,
        short
          ? "Prompt copied, with a short link to this plan"
          : "Short link unavailable: prompt copied with the full link",
      );
    } finally {
      busy = false;
      startBtn.removeAttribute("aria-busy");
    }
  });

  // The agent tabs: arrow keys, Home and End move between them (one tab stop, roving tabindex).
  const tabs = [...body.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const select = (tab: HTMLButtonElement, focus: boolean) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      body.querySelector<HTMLElement>(`#${t.getAttribute("aria-controls")}`)!.hidden = !on;
    }
    if (focus) tab.focus();
  };
  for (const tab of tabs) {
    tab.addEventListener("click", () => select(tab, false));
    tab.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(tab);
      const to =
        e.key === "ArrowRight"
          ? tabs[(i + 1) % tabs.length]
          : e.key === "ArrowLeft"
            ? tabs[(i - 1 + tabs.length) % tabs.length]
            : e.key === "Home"
              ? tabs[0]
              : e.key === "End"
                ? tabs[tabs.length - 1]
                : undefined;
      if (!to) return;
      e.preventDefault();
      select(to, true);
    });
  }

  return {
    reset() {
      prompt = AGENT_PROMPT;
      promptEl.textContent = prompt;
      say("");
    },
  };
}
