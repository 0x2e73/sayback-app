import { AudioLines } from 'lucide-react';

export function EmptyLibrary() {
  return (
    <div className="empty-state">
      <div className="empty-orbit">
        <div className="empty-document">
          <AudioLines size={30} />
          <span />
          <span />
          <span />
        </div>
        <span className="orbit-dot" />
      </div>
      <h2>Votre prochaine réunion commence ici.</h2>
      <p>
        Enregistrez la conversation et ce qui se passe à l’écran.
        <br />
        Retrouvez ensuite les mots, les décisions et leur contexte.
      </p>
      <div className="empty-footnote">
        <span />
        <span>Enregistré sur votre ordinateur</span>
      </div>
    </div>
  );
}
