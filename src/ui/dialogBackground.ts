// A parent stays mounted under a child. Reference counts also handle loading
// a save (which unmounts several dialogs at once) and StrictMode cleanup.
const locks = new WeakMap<HTMLElement, { count: number; original: boolean }>();
let scrollLocks = 0;
let originalOverflow = '';
export function lockDialogBackground(root: HTMLElement): () => void {
  const elements: HTMLElement[] = [];
  let branch = root;
  while (branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
      const lock = locks.get(sibling) ?? { count: 0, original: sibling.inert };
      lock.count++;
      locks.set(sibling, lock);
      sibling.inert = true;
      elements.push(sibling);
    }
    branch = branch.parentElement;
    if (branch === document.body) break;
  }
  if (scrollLocks++ === 0) originalOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => {
    for (const element of elements) {
      const lock = locks.get(element);
      if (lock && --lock.count === 0) {
        element.inert = lock.original;
        locks.delete(element);
      }
    }
    if (--scrollLocks === 0) document.body.style.overflow = originalOverflow;
  };
}
