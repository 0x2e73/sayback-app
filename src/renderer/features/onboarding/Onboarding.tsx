import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { DesktopApi } from '../../../shared/contracts';
import { Button, Notice } from '../../components/ui';
import { LocalSetupPanel } from '../local-setup/LocalSetupPanel';

interface Step {
  title: string;
  eyebrow: string;
  body: string;
  detail: string;
  showsLocalSetup?: boolean;
}

const steps: Step[] = [
  {
    eyebrow: 'Capturer',
    title: 'Gardez le fil de vos réunions.',
    body: 'Enregistrez votre voix, le son de l’ordinateur et, si vous le souhaitez, l’écran ou une fenêtre.',
    detail: 'Vous choisissez les sources avant chaque réunion. La capture ne démarre jamais seule.',
  },
  {
    eyebrow: 'Garder le contrôle',
    title: 'Vos réunions restent chez vous.',
    body: 'Les enregistrements et les transcriptions sont conservés sur cet ordinateur. Vous pouvez les retrouver et les supprimer à tout moment.',
    detail:
      'Votre système demandera l’accès au microphone et à l’écran seulement lorsque vous en aurez besoin.',
  },
  {
    eyebrow: 'Retrouver l’essentiel',
    title: 'Des notes après la réunion.',
    body: 'Si vous choisissez l’analyse automatique, la transcription et le compte rendu commencent dès que l’enregistrement est terminé.',
    detail:
      'Vous choisissez les fournisseurs pour la transcription et les notes dans les paramètres. Selon votre choix, l’analyse reste locale ou utilise votre clé API.',
  },
  {
    eyebrow: 'Mode local',
    title: 'Préparez le mode local.',
    body: 'Par défaut, SayBack transcrit avec Whisper et rédige les notes avec Ollama, directement sur cet ordinateur.',
    detail:
      'Il manque un élément ? Le guide explique l’installation pas à pas. Vous pouvez aussi choisir une API distante dans les paramètres.',
    showsLocalSetup: true,
  },
];

interface OnboardingProps {
  api: DesktopApi;
  busy: boolean;
  error: string;
  onComplete(): Promise<void>;
}

export function Onboarding({ api, busy, error, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const current = steps[step]!;
  const last = step === steps.length - 1;

  // The title takes the focus on every change of step, going back included, not on arrival.
  const shown = useRef(step);
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    heading.current?.focus();
  }, [step]);

  return (
    <main className="onboarding">
      <div className="window-band window-band-fixed" aria-hidden="true" />
      <div className="onboarding-column">
        <div className="onboarding-topline">
          <span>Bienvenue dans SayBack</span>
          <Button variant="ghost" onClick={() => void onComplete()} disabled={busy}>
            Passer
          </Button>
        </div>
        <div className="onboarding-copy" key={step}>
          <p className="eyebrow">{current.eyebrow}</p>
          <h1 ref={heading} tabIndex={-1}>
            {current.title}
          </h1>
          <p className="onboarding-body">{current.body}</p>
          <p className="onboarding-detail">{current.detail}</p>
          {current.showsLocalSetup && <LocalSetupPanel api={api} />}
          {error && <Notice>{error}</Notice>}
        </div>
        <div className="onboarding-bottom">
          <p className="sr-only">
            Étape {step + 1} sur {steps.length}
          </p>
          <div className="onboarding-progress" aria-hidden="true">
            <span style={{ transform: `scaleX(${(step + 1) / steps.length})` }} />
          </div>
          <div className="onboarding-actions">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={16} aria-hidden="true" /> Retour
              </Button>
            )}
            <Button busy={busy} onClick={() => (last ? void onComplete() : setStep(step + 1))}>
              {last ? 'Commencer' : 'Continuer'} <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
