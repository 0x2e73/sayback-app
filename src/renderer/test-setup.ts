// jsdom does not implement the modal methods of <dialog>.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
}

// jsdom has no media pipeline: play and pause only report the change, as a browser would.
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  };
  HTMLMediaElement.prototype.load = () => undefined;
}
