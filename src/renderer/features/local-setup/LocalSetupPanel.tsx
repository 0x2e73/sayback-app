import { CircleAlert, CircleCheck, ExternalLink, RefreshCw } from 'lucide-react';
import type { DesktopApi, SetupGuide } from '../../../shared/contracts';
import { Button, Notice } from '../../components/ui';
import { guidesFor, missingItems, type MissingItem } from './setup-items';
import { useLocalSetup } from './use-local-setup';

const guideLabels: Record<SetupGuide, string> = {
  whisper: 'Ouvrir le guide Whisper',
  ollama: 'Ouvrir le guide Ollama',
};

interface MissingListProps {
  items: MissingItem[];
}

function MissingList({ items }: MissingListProps) {
  if (!items.length) {
    return (
      <p className="local-setup-ready">
        <CircleCheck size={17} />
        Le mode local est prêt.
      </p>
    );
  }
  return (
    <ul className="local-setup-missing">
      {items.map((item) => (
        <li key={item.label}>
          <CircleAlert size={16} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

interface LocalSetupPanelProps {
  api: DesktopApi;
}

export function LocalSetupPanel({ api }: LocalSetupPanelProps) {
  const setup = useLocalSetup(api);
  const items = setup.status ? missingItems(setup.status) : [];
  return (
    <div className="local-setup" aria-live="polite" aria-busy={setup.checking}>
      {setup.status && <MissingList items={items} />}
      {setup.error && <Notice>{setup.error}</Notice>}
      <div className="local-setup-actions">
        {guidesFor(items).map((guide) => (
          <Button key={guide} variant="secondary" onClick={() => void setup.openGuide(guide)}>
            <ExternalLink size={16} />
            {guideLabels[guide]}
          </Button>
        ))}
        <Button variant="ghost" busy={setup.checking} onClick={() => void setup.check()}>
          <RefreshCw size={16} />
          Revérifier
        </Button>
      </div>
    </div>
  );
}
