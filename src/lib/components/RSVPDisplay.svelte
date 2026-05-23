<script>
  import { afterUpdate, tick } from "svelte";
  import { getActualORPIndex } from "../rsvp-utils.js";
  import { FONTS, DEFAULT_FONT_ID } from "../fonts.js";

  export let word = "";
  export let wordGroup = [];
  export let highlightIndex = 0;
  export let opacity = 1;
  export let fadeDuration = 150;
  export let fadeEnabled = true;
  export let multiWordEnabled = false;
  export let inQuotes = false;
  export let quoteDepth = 0;
  export let highlightDialogue = false;
  export let textSize = 100;
  export let orpOffsetX = 0;
  export let orpOffsetY = 0;
  export let fontFamily = DEFAULT_FONT_ID;
  export let isItalic = false;
  export let isBold = false;
  export let contextMode = false;
  export let contextWords = [];
  export let contextActiveWordIndex = -1;
  export let paragraphPauseMode = 'none'; // 'none' | 'blank' | 'yellow' | 'pilcrow' | 'normal'

  $: activeFontCss =
    (FONTS.find((f) => f.id === fontFamily) ?? FONTS[0])?.cssFamily ??
    "sans-serif";

  $: useMultiMode = multiWordEnabled && wordGroup.length > 0;
  $: effectiveDepth = inQuotes ? Math.max(1, quoteDepth) : quoteDepth;
  $: isHighlighted = effectiveDepth > 0 && highlightDialogue;
  $: dialogueDepth = Math.min(effectiveDepth, 3); // clamp for CSS — depths >=3 share style

  // Get the current word (either from single mode or the highlighted word in group)
  $: currentWord = useMultiMode ? wordGroup[highlightIndex] || "" : word;

  // Override with pilcrow symbol during paragraph pause
  $: displayWord = paragraphPauseMode === 'pilcrow' ? '¶' : currentWord;

  // Always calculate ORP for the display word
  $: orpIdx = displayWord ? getActualORPIndex(displayWord) : -1;
  $: wordPrefix = displayWord ? displayWord.slice(0, orpIdx) : "";
  $: focusChar = displayWord ? displayWord[orpIdx] || "" : "";
  $: wordSuffix = displayWord ? displayWord.slice(orpIdx + 1) : "";

  // Words before and after the highlighted word (for multi-word mode)
  $: wordsBefore = useMultiMode ? wordGroup.slice(0, highlightIndex) : [];
  $: wordsAfter = useMultiMode ? wordGroup.slice(highlightIndex + 1) : [];

  // FIX: Detect Hebrew, Arabic, and other RTL scripts
  $: isRtl = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(displayWord);

  // Dynamic scaling logic to fit long words on screen
  let displayW = 0;
  let activePrefixW = 0;
  let activeSuffixW = 0;
  let orpW = 0;

  const PADDING = 4; // 4px padding to screen edge

  $: halfExtent  = Math.max(activePrefixW, activeSuffixW) + orpW / 2;
  $: allowedHalf = displayW / 2 - PADDING;
  $: scaleFactor = (halfExtent > 0 && allowedHalf > 0)
    ? Math.min(1, allowedHalf / halfExtent)
    : 1;

  // Context Mode Translation / Focus Locking
  let ty = 0;
  let displayEl;
  let orpEl;

  async function updateTranslation() {
    if (!contextMode || !displayEl || !orpEl) return;

    await tick();

    const containerRect = displayEl.getBoundingClientRect();
    const orpRect = orpEl.getBoundingClientRect();

    if (containerRect.height === 0 || orpRect.height === 0) return;

    // Center of the ORP character relative to the container viewport space
    const currentOrpY = orpRect.top - containerRect.top + orpRect.height / 2;

    // Desired focus position inside the container (including user custom offsets)
    const focusY = containerRect.height / 2 + (orpOffsetY * 0.5 * containerRect.height / 100);

    const deltaY = focusY - currentOrpY;

    // Use a small threshold to avoid infinite render loops/sub-pixel jitter
    if (Math.abs(deltaY) > 0.05) {
      ty = ty + deltaY;
    }
  }

  // When contextMode is toggled, reset the translations to let the feedback loop start fresh
  $: {
    if (!contextMode) {
      ty = 0;
    }
  }

  afterUpdate(() => {
    if (contextMode) {
      updateTranslation();
    }
  });
</script>

<div
  class="rsvp-display"
  bind:clientWidth={displayW}
  style="--orp-offset-x: {orpOffsetX}; --orp-offset-y: {orpOffsetY};"
>
  {#if contextMode}
    <!-- Context Mode: continuous inline text flow, with focus-locking translation -->
    <div
      class="context-display"
      bind:this={displayEl}
      style="--text-size-multiplier: {textSize / 100}; --rsvp-font-family: {activeFontCss};"
    >
      <div class="context-flow" style="transform: translateY({ty}px);">
        {#each contextWords as w, i}
          <span
            class="ctx-word"
            class:ctx-dim={i !== contextActiveWordIndex}
            class:ctx-active-word={i === contextActiveWordIndex}
            class:ctx-italic={w.isItalic}
            class:ctx-bold={w.isBold}
            class:ctx-dialogue={w.inQuotes && highlightDialogue}
            class:ctx-dialogue-2={w.inQuotes && highlightDialogue && (w.quoteDepth || 0) === 2}
            class:ctx-dialogue-3={w.inQuotes && highlightDialogue && (w.quoteDepth || 0) >= 3}
          >
            {#if i === contextActiveWordIndex}
              <span
                class="active-word-wrapper"
                class:dialogue={w.inQuotes && highlightDialogue}
                class:dialogue-2={w.inQuotes && highlightDialogue && (w.quoteDepth || 0) === 2}
                class:dialogue-3={w.inQuotes && highlightDialogue && (w.quoteDepth || 0) >= 3}
              >
                <span>{wordPrefix}</span><span class="orp" bind:this={orpEl}>{focusChar}</span><span>{wordSuffix}</span>
              </span>
            {:else}
              {w.text}
            {/if}
          </span>{" "}
        {/each}
      </div>
    </div>
  {:else}
    <!-- Normal Mode -->
    <div class="focus-marker">
      <div class="marker-line top"></div>
      <div class="marker-line bottom"></div>
    </div>

    <div
      class="word-container"
      class:multi-mode={useMultiMode}
      class:dialogue-highlight={isHighlighted}
      class:dialogue-depth-2={isHighlighted && dialogueDepth === 2}
      class:dialogue-depth-3={isHighlighted && dialogueDepth >= 3}
      class:paragraph-pause-yellow={paragraphPauseMode === 'yellow'}
      style="opacity: {opacity}; transition: opacity {fadeEnabled
        ? fadeDuration
        : 0}ms ease-in-out; --text-size-multiplier: {textSize /
        100}; --rsvp-font-family: {activeFontCss}; --rsvp-font-style: {isItalic
        ? 'italic'
        : 'normal'}; --rsvp-font-weight: {isBold ? 700 : 400};"
    >
      <!-- Hidden element to measure unscaled active word parts (supports all proportional and monospace fonts) -->
      <div
        aria-hidden="true"
        style="position: absolute; visibility: hidden; pointer-events: none; white-space: nowrap; font-family: var(--rsvp-font-family, sans-serif); font-size: calc(clamp(3rem, 8vw, 6rem) * var(--text-size-multiplier, 1)); font-weight: var(--rsvp-font-weight, 400); font-style: var(--rsvp-font-style, normal);"
      >
        <span style="display: inline-block;" bind:offsetWidth={activePrefixW}>{wordPrefix}</span>
        <span style="display: inline-block;" bind:offsetWidth={orpW}>{focusChar}</span>
        <span style="display: inline-block;" bind:offsetWidth={activeSuffixW}>{wordSuffix}</span>
      </div>

      <div class="scale-wrapper" style="transform: scale({scaleFactor});">
        {#if displayWord}
          <div class="word-wrapper">
            <!-- Content before ORP: prefix of current word + words before -->
            <span class="before-orp" style="direction: {isRtl ? 'rtl' : 'ltr'}">
              {#if isRtl}
                {wordSuffix}{#if useMultiMode && wordsAfter.length > 0}
                  &nbsp;<span class="context-words">{wordsAfter.join(" ")}</span>
                {/if}
              {:else}
                {#if useMultiMode && wordsBefore.length > 0}
                  <span class="context-words">{wordsBefore.join(" ")}</span>&nbsp;
                {/if}{wordPrefix}
              {/if}
            </span>

            <!-- ORP letter always centered at 50% -->
            <span class="orp">{focusChar}</span>

            <!-- Content after ORP: suffix of current word + words after -->
            <span class="after-orp" style="direction: {isRtl ? 'rtl' : 'ltr'}">
              {#if isRtl}
                {#if useMultiMode && wordsBefore.length > 0}
                  <span class="context-words">{wordsBefore.join(" ")}</span>&nbsp;
                {/if}{wordPrefix}
              {:else}
                {wordSuffix}{#if useMultiMode && wordsAfter.length > 0}
                  &nbsp;<span class="context-words">{wordsAfter.join(" ")}</span>
                {/if}
              {/if}
            </span>
          </div>
        {:else}
          <span class="placeholder">Ready</span>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .rsvp-display {
    --rsvp-text-color: #fff;
    --rsvp-dialogue-color: #4a90e2;
    --rsvp-dialogue-color-2: #7ec0f7;
    --rsvp-dialogue-color-3: #b6dcfb;
    --rsvp-orp-color: #ff4444;

    position: relative;
    width: 100%;
    height: 100%;
    min-height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    overflow: hidden;
    container-type: size;
  }

  .focus-marker {
    position: absolute;
    left: 50%;
    transform: translateX(calc(-50% + var(--orp-offset-x, 0) * 0.5cqw));
    height: 100%;
    width: 3px;
    pointer-events: none;
    z-index: 10;
  }

  .marker-line {
    position: absolute;
    left: 0;
    width: 100%;
    height: 50px;
  }

  .marker-line.top {
    top: 40px;
    background: linear-gradient(to bottom, var(--rsvp-orp-color), transparent);
  }

  .marker-line.bottom {
    bottom: 0;
    background: linear-gradient(to top, var(--rsvp-orp-color), transparent);
  }

  .word-container {
    position: relative;
    font-family: var(--rsvp-font-family, sans-serif);
    font-size: calc(clamp(3rem, 8vw, 6rem) * var(--text-size-multiplier, 1));
    font-weight: var(--rsvp-font-weight, 400);
    font-style: var(--rsvp-font-style, normal);
    line-height: 1;
    white-space: nowrap;
    text-rendering: geometricPrecision;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    /* Container needs width for absolute children to position against */
    width: 100%;
    height: 1.2em;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .scale-wrapper {
    position: absolute;
    width: 100%;
    height: 100%;
    transform-origin: center;
    display: flex;
    align-items: center;
    justify-content: center;
    translate: calc(var(--orp-offset-x, 0) * 0.5cqw) calc(var(--orp-offset-y, 0) * 0.5cqh);
  }

  .word-container.multi-mode {
    font-size: calc(clamp(1.2rem, 4vw, 3rem) * var(--text-size-multiplier, 1));
  }

  .word-container.dialogue-highlight {
    --rsvp-text-color: var(--rsvp-dialogue-color);
  }

  .word-container.dialogue-highlight.dialogue-depth-2 {
    --rsvp-text-color: var(--rsvp-dialogue-color-2);
  }

  .word-container.dialogue-highlight.dialogue-depth-3 {
    --rsvp-text-color: var(--rsvp-dialogue-color-3);
  }

  .word-container.paragraph-pause-yellow {
    --rsvp-text-color: #f5c518;
  }

  .context-words {
    color: #666;
    font-weight: 400;
  }

  .word-wrapper {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    width: 100%;
    height: 100%;
  }

  .orp {
    grid-column: 2;
    justify-self: center;
    color: var(--rsvp-orp-color);
    z-index: 2;
  }

  .before-orp {
    grid-column: 1;
    justify-self: end;
    min-width: 0;
    color: var(--rsvp-text-color);
    text-align: right;
    white-space: nowrap;
  }

  .after-orp {
    grid-column: 3;
    justify-self: start;
    min-width: 0;
    color: var(--rsvp-text-color);
    text-align: left;
    white-space: nowrap;
  }

  .placeholder {
    color: #333;
    font-size: 2rem;
    font-weight: 300;
    font-family: system-ui, sans-serif;
    line-height: 1;
  }

  /* Context Mode */
  .context-display {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background-color: #000;
    font-family: var(--rsvp-font-family, sans-serif);
    font-size: calc(clamp(0.9rem, 2.5vw, 1.8rem) * var(--text-size-multiplier, 1));
    line-height: 1.8;
  }

  .context-flow {
    position: absolute;
    width: 100%;
    max-width: 800px;
    left: 0;
    right: 0;
    margin: 0 auto;
    top: 0;
    box-sizing: border-box;
    padding: 0 1.5rem;
    white-space: normal;
    word-break: normal;
    overflow-wrap: break-word;
    text-align: left;
    color: #444;
  }

  .ctx-word {
    display: inline;
    transition: color 0.15s ease;
  }

  .ctx-dim {
    color: #444;
  }

  .ctx-dialogue {
    color: var(--rsvp-dialogue-color, #4a90e2);
    opacity: 0.55;
  }

  .ctx-dialogue.ctx-dialogue-2 {
    color: var(--rsvp-dialogue-color-2, #7ec0f7);
  }

  .ctx-dialogue.ctx-dialogue-3 {
    color: var(--rsvp-dialogue-color-3, #b6dcfb);
  }

  .ctx-active-word {
    color: #fff;
  }

  .ctx-italic {
    font-style: italic;
  }

  .ctx-bold {
    font-weight: bold;
  }

  .active-word-wrapper {
    color: #fff;
  }

  .active-word-wrapper.dialogue {
    color: var(--rsvp-dialogue-color, #4a90e2);
  }

  .active-word-wrapper.dialogue.dialogue-2 {
    color: var(--rsvp-dialogue-color-2, #7ec0f7);
  }

  .active-word-wrapper.dialogue.dialogue-3 {
    color: var(--rsvp-dialogue-color-3, #b6dcfb);
  }

  .active-word-wrapper .orp {
    color: var(--rsvp-orp-color, #ff4444);
  }

  @media (max-width: 600px) {
    .rsvp-display {
      min-height: 200px;
    }

    .marker-line {
      height: 30px;
    }

    .marker-line.top {
      top: 25px;
    }

    .word-container.multi-mode {
      font-size: calc(clamp(0.9rem, 3.5vw, 2rem) * var(--text-size-multiplier, 1));
    }
  }

  @media (max-width: 400px) {
    .word-container.multi-mode {
      font-size: calc(clamp(0.75rem, 3vw, 1.5rem) * var(--text-size-multiplier, 1));
    }
  }
</style>
