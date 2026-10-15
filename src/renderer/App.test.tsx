// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { newMeetingDialog } from './new-meeting-harness';
import { chooseOption } from './select.test-support';
import { apiFor, ok, settings } from './test-api';

afterEach(cleanup);
describe('Meeting workspace', () => {
  it('explains the workflow on first launch and remembers completion', async () => {
    const api = apiFor();
    const complete = vi.fn(() => ok(undefined));
    api.getSettings = () => ok({ ...settings, onboardingCompleted: false });
    api.completeOnboarding = complete;
    const user = userEvent.setup();
    render(<App api={api} />);
    expect(
      await screen.findByRole('heading', { name: 'Gardez le fil de vos réunions.' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(
      screen.getByRole('heading', { name: 'Vos réunions restent chez vous.' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(
      screen.getByRole('heading', { name: 'Des notes après la réunion.' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(screen.getByRole('heading', { name: 'Préparez le mode local.' })).toBeInTheDocument();
    expect(await screen.findByText('Le mode local est prêt.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Commencer' }));
    expect(complete).toHaveBeenCalledOnce();
    expect(await screen.findByText('Enregistrez votre première réunion')).toBeInTheDocument();
  });
  it('lets people replay the introduction from settings', async () => {
    const user = userEvent.setup();
    render(<App api={apiFor()} />);
    await user.click(await screen.findByRole('button', { name: 'Paramètres' }));
    await user.click(screen.getByRole('button', { name: 'Revoir l’introduction' }));
    expect(
      screen.getByRole('heading', { name: 'Gardez le fil de vos réunions.' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Passer' }));
    expect(await screen.findByRole('heading', { name: /Paramètres/ })).toBeInTheDocument();
  });
  it('shows an honest empty library and a recording action', async () => {
    render(<App api={apiFor()} />);
    const pane = await screen.findByRole('complementary', { name: 'Liste des réunions' });
    expect(await within(pane).findByText('Aucune réunion')).toBeInTheDocument();
    expect(screen.getByText('Enregistrez votre première réunion')).toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Démarrer l’enregistrement' })).toBeEnabled();
  });
  it('saves the personal API key through settings with visible feedback', async () => {
    const user = userEvent.setup();
    render(<App api={apiFor()} />);
    await user.click(await screen.findByRole('button', { name: 'Paramètres' }));
    await user.type(await screen.findByLabelText('Clé API OpenAI'), 'sk-test-personal');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Enregistré')).toBeInTheDocument();
    expect(screen.getByLabelText('Clé API OpenAI')).toHaveValue('');
  });
  it('lets people select a fully local analysis without an API key', async () => {
    const api = apiFor();
    const save = vi.fn(() =>
      ok({
        ...settings,
        transcriptionProvider: 'local' as const,
        notesProvider: 'ollama' as const,
        model: 'gemma3:latest',
        whisperModelPath: '/models/ggml-small.bin',
      }),
    );
    api.listModels = () => ok(['gemma3:latest']);
    api.saveSettings = save;
    const user = userEvent.setup();
    render(<App api={api} />);
    await user.click(await screen.findByRole('button', { name: 'Paramètres' }));
    await chooseOption(user, 'Transcription de l’audio', 'Local · whisper.cpp');
    await chooseOption(user, 'Compte rendu', 'Ollama · local');
    await user.type(screen.getByLabelText(/Modèle Whisper local/), '/models/ggml-small.bin');
    await user.click(
      await screen.findByRole('button', { name: 'Modèle pour les notes Choisir un modèle' }),
    );
    await user.click(screen.getByRole('option', { name: 'gemma3:latest' }));
    expect(screen.queryByLabelText('Clé API OpenAI')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptionProvider: 'local',
        notesProvider: 'ollama',
        model: 'gemma3:latest',
        openAiKey: '',
      }),
    );
  });
  it('saves a Gemini transcription and a custom compatible notes provider', async () => {
    const api = apiFor();
    const save = vi.fn(() =>
      ok({
        ...settings,
        transcriptionProvider: 'gemini' as const,
        notesProvider: 'compatible' as const,
        hasGeminiKey: true,
        hasCompatibleKey: true,
      }),
    );
    api.saveSettings = save;
    api.listModels = () => ok([]);
    const user = userEvent.setup();
    render(<App api={api} />);
    await user.click(await screen.findByRole('button', { name: 'Paramètres' }));
    await chooseOption(user, 'Transcription de l’audio', 'Google · Gemini');
    await chooseOption(user, 'Compte rendu', 'API compatible OpenAI');
    await user.type(screen.getByLabelText('Clé API Gemini'), 'gemini-secret');
    await user.type(
      screen.getByLabelText('Adresse de l’API (compatible OpenAI)'),
      'https://openrouter.ai/api/v1',
    );
    await user.type(screen.getByLabelText('Clé de cette API'), 'router-secret');
    await user.click(screen.getByRole('button', { name: /^Modèle pour les notes/ }));
    await user.type(screen.getByRole('combobox'), 'openai/gpt-4o');
    await user.click(screen.getByRole('option', { name: 'Utiliser « openai/gpt-4o »' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptionProvider: 'gemini',
        notesProvider: 'compatible',
        model: 'openai/gpt-4o',
        geminiKey: 'gemini-secret',
        compatibleKey: 'router-secret',
        compatibleBaseUrl: 'https://openrouter.ai/api/v1',
      }),
    );
  });
  it('opens a searchable dropdown with every accessible model', async () => {
    const api = apiFor();
    api.getSettings = () => ok({ ...settings, hasOpenAiKey: true });
    const user = userEvent.setup();
    render(<App api={api} />);
    await user.click(await screen.findByRole('button', { name: 'Paramètres' }));
    const dropdown = await screen.findByRole('button', { name: /Modèle pour les notes/ });
    await user.click(dropdown);
    expect(screen.getByRole('option', { name: 'whisper-1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'gpt-4o' })).toBeInTheDocument();
    await user.type(await screen.findByRole('combobox', { name: 'Rechercher un modèle' }), '4o');
    expect(screen.queryByRole('option', { name: 'whisper-1' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'gpt-4o' }));
    expect(dropdown).toHaveTextContent('gpt-4o');
  });
  it('shows a denied screen permission in the new meeting dialog and opens the settings', async () => {
    const api = apiFor();
    const openSettings = vi.fn(() => ok(undefined));
    api.openScreenRecordingSettings = openSettings;
    api.getCapturePermission = (kind) => ok(kind === 'screen' ? 'denied' : 'granted');
    api.getSources = () => ok([]);
    const user = userEvent.setup();
    render(<App api={api} />);
    await user.click(await screen.findByRole('button', { name: 'Démarrer l’enregistrement' }));
    const dialog = await newMeetingDialog();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'SayBack n’a pas l’autorisation d’enregistrer l’écran.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Ouvrir les réglages macOS' }));
    expect(openSettings).toHaveBeenCalledOnce();
  });
  it('explains and enables automatic analysis when a personal key is configured', async () => {
    const api = apiFor();
    api.getSettings = () => ok({ ...settings, hasOpenAiKey: true });
    api.getSources = () =>
      ok([{ id: 'screen:1:0', name: 'Écran 1', thumbnail: 'data:image/png;base64,a' }]);
    const user = userEvent.setup();
    render(<App api={api} />);
    await user.click(await screen.findByRole('button', { name: 'Démarrer l’enregistrement' }));
    const dialog = await newMeetingDialog();
    const analysis = within(dialog).getByRole('switch', { name: 'Lancer l’analyse à l’arrêt' });
    expect(analysis).toBeChecked();
    expect(analysis).toHaveAccessibleDescription(/OpenAI pour l’audio/);
  });
  it('has no top bar, footer or marketing line around the workspace', async () => {
    render(<App api={apiFor()} />);
    await screen.findByRole('complementary', { name: 'Liste des réunions' });
    for (const text of [
      'Espace de travail',
      'En local',
      'Un peu moins à retenir. Un peu plus à partager.',
    ]) {
      expect(screen.queryByText(text, { exact: false })).toBeNull();
    }
    expect(document.querySelector('.main-card')).not.toBeNull();
  });
  it('lets the window be dragged from the onboarding too', async () => {
    const api = apiFor();
    api.getSettings = () => ok({ ...settings, onboardingCompleted: false });
    render(<App api={api} />);
    await screen.findByRole('heading', { name: 'Gardez le fil de vos réunions.' });
    expect(document.querySelector('.onboarding > .window-band')).not.toBeNull();
  });
});
