const BLOCK_DEFAULT = new Set([
  'Space', 'KeyE', 'KeyV', 'KeyM', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
]);

export class Input {
  constructor() {
    this.keys = new Set();
    this.justPressed = new Set();

    window.addEventListener('keydown', (e) => {
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => this.keys.clear());
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }
  endFrame() { this.justPressed.clear(); }
  clear() { this.keys.clear(); this.justPressed.clear(); }
}
