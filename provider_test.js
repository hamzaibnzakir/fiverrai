(() => {
  function installProviderTest(buttonId, keyIds, provider) {
    const current = document.getElementById(buttonId);
    if (!current) return;

    // popup.js already attached a listener. Clone the button so that listener
    // is removed before installing the deterministic provider test below.
    const button = current.cloneNode(true);
    current.replaceWith(button);

    button.addEventListener('click', async () => {
      const keys = keyIds
        .map(id => document.getElementById(id)?.value.trim())
        .filter(Boolean);

      if (!keys.length) {
        toast(`Enter a ${provider === 'claude' ? 'Claude' : 'Groq'} key first`, true);
        return;
      }

      const storageKey = provider === 'claude' ? 'anthropicKeys' : 'groqKeys';
      const modelKey = provider === 'claude' ? 'model' : 'groqModel';
      const model = document.getElementById(provider === 'claude' ? 'claudeModelSelect' : 'groqModelSelect')?.value;

      await chrome.storage.sync.set({
        [storageKey]: keys,
        ...(model ? { [modelKey]: model } : {})
      });

      button.textContent = '…';
      button.disabled = true;

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'AI_REQUEST',
          payload: {
            prompt: 'Say "OK" only.',
            systemPrompt: 'Reply with only "OK".',
            forceProvider: provider,
            maxTokens: 64
          }
        });

        if (response?.error) throw new Error(response.error);
        toast(`▸ ${provider === 'claude' ? 'Claude' : 'Groq'} connection OK`);
      } catch (error) {
        toast('Error: ' + (error?.message || 'Connection failed'), true);
      } finally {
        button.textContent = '▸ Test';
        button.disabled = false;
      }
    });
  }

  installProviderTest('testClaude', ['ck1', 'ck2'], 'claude');
  installProviderTest('testGroq', ['gk1', 'gk2', 'gk3'], 'groq');
})();