import type { Settings } from './contracts';
import { isLocalCompatibleUrl } from './compatible-url';

function transcriptionConfigured(settings: Settings): boolean {
  if (settings.transcriptionProvider === 'local') return Boolean(settings.whisperModelPath);
  if (settings.transcriptionProvider === 'gemini') return settings.hasGeminiKey;
  return settings.hasOpenAiKey;
}

function notesConfigured(settings: Settings): boolean {
  if (settings.notesProvider === 'ollama') return true;
  if (settings.notesProvider === 'openai') return settings.hasOpenAiKey;
  if (settings.notesProvider === 'anthropic') return settings.hasAnthropicKey;
  if (settings.notesProvider === 'gemini') return settings.hasGeminiKey;
  return (
    Boolean(settings.compatibleBaseUrl) &&
    (settings.hasCompatibleKey || isLocalCompatibleUrl(settings.compatibleBaseUrl))
  );
}

export function analysisConfigured(settings: Settings): boolean {
  return transcriptionConfigured(settings) && notesConfigured(settings) && Boolean(settings.model);
}

export function analysisDestination(settings: Settings): string {
  if (settings.transcriptionProvider === 'local' && settings.notesProvider === 'ollama') {
    return 'Toute l’analyse reste sur cet ordinateur.';
  }
  const destinations = new Set<string>();
  if (settings.transcriptionProvider === 'openai') destinations.add('OpenAI pour l’audio');
  if (settings.transcriptionProvider === 'gemini') destinations.add('Gemini pour l’audio');
  if (settings.notesProvider === 'openai') destinations.add('OpenAI pour les notes et images');
  if (settings.notesProvider === 'anthropic') destinations.add('Claude pour les notes et images');
  if (settings.notesProvider === 'gemini') destinations.add('Gemini pour les notes et images');
  if (settings.notesProvider === 'compatible')
    destinations.add('l’API personnalisée pour les notes et images');
  return `Données envoyées à ${[...destinations].join(' et ')}.`;
}
