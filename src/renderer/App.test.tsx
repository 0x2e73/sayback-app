// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Meeting } from '../shared/contracts';
import { App } from './App';
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
    expect(await screen.findByText('Votre prochaine réunion commence ici.')).toBeInTheDocument();
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
    expect(await screen.findByText('Votre prochaine réunion commence ici.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nouvelle réunion' })).toBeEnabled();
  });
  it('saves the personal API key through settings with visible feedback', async () => {
    const user = userEvent.setup();
    render(<App api={apiFor()} />);
    await user.click(await screen.findByRole('button', { name: 'Paramètres' }));
    await user.type(await screen.findByLabelText('Clé API OpenAI'), 'sk-test-personal');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les paramètres' }));
    expect(await screen.findByText('Paramètres enregistrés.')).toBeInTheDocument();
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
    await user.selectOptions(screen.getByLabelText('Transcription de l’audio'), 'local');
    await user.selectOptions(screen.getByLabelText('Compte rendu'), 'ollama');
    await user.type(screen.getByLabelText(/Modèle Whisper local/), '/models/ggml-small.bin');
    await user.click(
      await screen.findByRole('button', { name: 'Modèle pour les notes : aucun modèle choisi' }),
    );
    await user.click(screen.getByRole('option', { name: 'gemma3:latest' }));
    expect(screen.queryByLabelText('Clé API OpenAI')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer les paramètres' }));
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
    await user.selectOptions(screen.getByLabelText('Transcription de l’audio'), 'gemini');
    await user.selectOptions(screen.getByLabelText('Compte rendu'), 'compatible');
    await user.type(screen.getByLabelText('Clé API Gemini'), 'gemini-secret');
    await user.type(
      screen.getByLabelText('URL de base de l’API compatible'),
      'https://openrouter.ai/api/v1',
    );
    await user.type(screen.getByLabelText('Clé de cette API'), 'router-secret');
    await user.type(screen.getByPlaceholderText('ex. openai/gpt-4o'), 'openai/gpt-4o');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les paramètres' }));
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
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un modèle' }), '4o');
    expect(screen.queryByRole('option', { name: 'whisper-1' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'gpt-4o' }));
    expect(dropdown).toHaveTextContent('gpt-4o');
  });
  it('shows a denied screen permission prominently in the new meeting dialog', async () => {
    const api = apiFor();
    const openSettings = vi.fn(() => ok(undefined));
    api.openScreenRecordingSettings = openSettings;
    api.getSources = async () => ({
      ok: false,
      error: 'Accès à l’écran refusé. Autorisez SayBack dans Réglages Système.',
    });
    const user = userEvent.setup();
    render(<App api={api} />);
    await user.click(await screen.findByRole('button', { name: 'Nouvelle réunion' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Accès à l’écran refusé');
    expect(alert.compareDocumentPosition(screen.getByLabelText('Titre de la réunion'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await user.click(
      screen.getByRole('button', { name: 'Ouvrir les réglages de confidentialité' }),
    );
    expect(openSettings).toHaveBeenCalledOnce();
  });
  it('explains and enables automatic analysis when a personal key is configured', async () => {
    const api = apiFor();
    api.getSettings = () => ok({ ...settings, hasOpenAiKey: true });
    api.getSources = () =>
      ok([{ id: 'screen:1:0', name: 'Écran principal', thumbnail: 'data:image/png;base64,a' }]);
    const user = userEvent.setup();
    render(<App api={api} />);
    await user.click(await screen.findByRole('button', { name: 'Nouvelle réunion' }));
    expect(
      await screen.findByRole('checkbox', {
        name: /Transcrire et créer le compte rendu après l’arrêt/,
      }),
    ).toBeChecked();
    expect(
      screen.getByText(/OpenAI facture la transcription avec identification des voix/),
    ).toBeInTheDocument();
  });
  it('filters persisted meetings without creating sample data', async () => {
    const fixture: Meeting = {
      id: 'm1',
      title: 'Revue produit',
      createdAt: '2026-09-11T10:00:00Z',
      status: 'recorded',
      duration: 60,
      hasVideo: false,
      audioChunks: [],
      frames: [],
      transcript: [],
      notes: null,
      clarifications: [],
      error: null,
    };
    const user = userEvent.setup();
    render(<App api={apiFor([fixture])} />);
    expect(await screen.findByText('Revue produit')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'Budget');
    expect(screen.queryByText('Revue produit')).not.toBeInTheDocument();
    expect(screen.getByText('Aucune réunion trouvée.')).toBeInTheDocument();
  });
  it('shows a backend failure with a retry action', async () => {
    const api = apiFor();
    api.listMeetings = async () => ({ ok: false, error: 'Lecture impossible' });
    render(<App api={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Lecture impossible');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeEnabled();
  });
});
