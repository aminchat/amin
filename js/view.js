let impl = () => {};

export function setRender(fn) {
  impl = fn;
}

export function render() {
  impl();
}
