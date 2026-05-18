<script>
  import { createEventDispatcher } from 'svelte';

  export let chapters = [];
  export let currentWordIndex = 0;

  const dispatch = createEventDispatcher();

  function close() {
    dispatch('close');
  }

  function jumpTo(wordIndex) {
    dispatch('jump', { wordIndex });
  }

  $: activeChapterIndex = (() => {
    if (chapters.length === 0) return -1;
    let activeIdx = -1;
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].wordIndex <= currentWordIndex) {
        activeIdx = i;
      } else {
        break;
      }
    }
    return activeIdx;
  })();
</script>

<div class="settings-panel">
  <div class="settings-header">
    <h3>Table of Contents</h3>
    <button class="close-btn" on:click={close} title="Close">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    </button>
  </div>

  <div class="chapters-list">
    {#if chapters.length === 0}
      <div class="empty-state">No chapters found in this document.</div>
    {:else}
      {#each chapters as chapter, i}
        <button
          class="chapter-btn"
          class:active={i === activeChapterIndex}
          on:click={() => jumpTo(chapter.wordIndex)}
        >
          <span class="chapter-title">{chapter.title}</span>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .settings-panel {
    background: #0a0a0a;
    border: 1px solid #222;
    border-radius: 20px;
    padding: 2rem;
    width: 480px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid #1a1a1a;
    flex-shrink: 0;
  }

  h3 {
    margin: 0;
    font-weight: 600;
    color: #fff;
    font-size: 1.5rem;
    letter-spacing: -0.01em;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #444;
    cursor: pointer;
    padding: 0.5rem;
    display: flex;
    border-radius: 10px;
    transition: all 0.15s;
  }

  .close-btn:hover {
    color: #fff;
    background: #1a1a1a;
  }

  .close-btn svg {
    width: 24px;
    height: 24px;
  }

  .chapters-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-right: 0.5rem;
  }

  /* Scrollbar */
  .chapters-list::-webkit-scrollbar {
    width: 6px;
  }

  .chapters-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .chapters-list::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 3px;
  }

  .chapter-btn {
    background: #111;
    border: 1px solid #222;
    color: #ccc;
    padding: 1rem;
    border-radius: 12px;
    font-size: 1.1rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
  }

  .chapter-btn:hover {
    background: #1a1a1a;
    border-color: #333;
    color: #fff;
  }

  .chapter-btn.active {
    border-color: #ff4444;
    box-shadow: 0 0 8px rgba(255, 68, 68, 0.2);
  }

  .chapter-title {
    flex: 1;
    line-height: 1.4;
  }

  .empty-state {
    color: #666;
    text-align: center;
    padding: 2rem 0;
    font-size: 1.1rem;
  }

  /* Mobile */
  @media (max-width: 600px) {
    .settings-panel {
      width: 100%;
      max-width: none;
      border-radius: 16px;
      padding: 1.5rem;
    }

    h3 {
      font-size: 1.25rem;
    }
  }
</style>
