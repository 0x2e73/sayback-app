import { useEffect, useRef, useState, type ComponentType } from 'react';
import { ArrowLeft, ArrowRight, AudioLines, Cpu, ShieldCheck, Sparkles } from 'lucide-react';
import type { DesktopApi } from '../../../shared/contracts';
import logo from '../../assets/sayback-mark.svg';
import { Button, Notice } from '../../components/ui';
import { LocalSetupPanel } from '../local-setup/LocalSetupPanel';

interface Step {
  title: string;
  eyebrow: string;
  body: string;
  detail: string;
  icon: ComponentType<{ size?: number }>;
  showsLocalSetup?: boolean;
}

const steps: Step[] = [
  {
    eyebrow: '01 — Capturer',
    title: 'Gardez le fil de vos réunions.',
    body: 'Enregistrez votre voix, le son de l’ordinateur et, si vous le souhaitez, l’écran ou une fenêtre.',
    detail: 'Vous choisissez les sources avant chaque réunion. La capture ne démarre jamais seule.',
    icon: AudioLines,
  },
  {
    eyebrow: '02 — Garder le contrôle',
    title: 'Vos réunions restent chez vous.',
    body: 'Les enregistrements et les transcriptions sont conservés sur cet ordinateur. Vous pouvez les retrouver et les supprimer à tout moment.',
    detail:
      'Votre système demandera l’accès au microphone et à l’écran seulement lorsque vous en aurez besoin.',
    icon: ShieldCheck,
  },
  {
    eyebrow: '03 — Retrouver l’essentiel',
    title: 'Des notes après la réunion.',
    body: 'Si vous choisissez l’analyse automatique, la transcription et le compte rendu commencent dès que l’enregistrement est terminé.',
    detail:
      'Vous choisissez les fournisseurs pour la transcription et les notes dans les paramètres. Selon votre choix, l’analyse reste locale ou utilise votre clé API.',
    icon: Sparkles,
  },
  {
    eyebrow: '04 — Mode local',
    title: 'Préparez le mode local.',
    body: 'Par défaut, SayBack transcrit avec Whisper et rédige les notes avec Ollama, directement sur cet ordinateur.',
    detail:
      'Il manque un élément ? Le guide explique l’installation pas à pas. Vous pouvez aussi choisir une API distante dans les paramètres.',
    icon: Cpu,
    showsLocalSetup: true,
  },
];

interface OnboardingProps {
  api: DesktopApi;
  busy: boolean;
  error: string;
  onComplete(): Promise<void>;
}

function OnboardingArtwork({ step }: { step: number }) {
  const Icon = steps[step]!.icon;
  return (
    <div className="onboarding-art" aria-hidden="true">
      <div className="onboarding-orbit orbit-outer" />
      <div className="onboarding-orbit orbit-inner" />
      <div className="onboarding-symbol" key={step}>
        <Icon size={66} />
      </div>
    </div>
  );
}

export function Onboarding({ api, busy, error, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const current = steps[step]!;
  const last = step === steps.length - 1;

  useEffect(() => {
    if (step > 0) heading.current?.focus();
  }, [step]);

  return (
    <main className="onboarding">
      <div className="window-band onboarding-band" aria-hidden="true" />
      <div className="onboarding-visual">
        <div className="onboarding-brand">
          <img src={logo} alt="" />
          <span>
            sayback<span className="brand-dot">.</span>
          </span>
        </div>
        <OnboardingArtwork step={step} />
        <p>Le contexte de chaque conversation, à portée de main.</p>
      </div>
      <div className="onboarding-main">
        <div className="onboarding-topline">
          <span>Bienvenue dans SayBack</span>
          <button type="button" onClick={() => void onComplete()} disabled={busy}>
            Passer
          </button>
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
          <div className="onboarding-progress" aria-label={`Étape ${step + 1} sur ${steps.length}`}>
            {steps.map((item, index) => (
              <span key={item.eyebrow} className={index === step ? 'active' : ''} />
            ))}
          </div>
          <div className="onboarding-actions">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft size={16} /> Retour
              </Button>
            )}
            <Button busy={busy} onClick={() => (last ? void onComplete() : setStep(step + 1))}>
              {last ? 'Commencer' : 'Continuer'} <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
