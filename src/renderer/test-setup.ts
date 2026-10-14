// jsdom does not implement the modal methods of <dialog>.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
}

// jsdom has no media pipeline: play and pause only report the change, as a browser would:
// `paused` flips, and an event fires only when something changed.
if (typeof HTMLMediaElement !== 'undefined') {
  const playing = new WeakSet<HTMLMediaElement>();
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return !playing.has(this);
    },
  });
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    if (!playing.has(this)) {
      playing.add(this);
      this.dispatchEvent(new Event('play'));
    }
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
    if (playing.has(this)) {
      playing.delete(this);
      this.dispatchEvent(new Event('pause'));
    }
  };
  HTMLMediaElement.prototype.load = () => undefined;
}
