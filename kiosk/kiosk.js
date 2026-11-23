const idleTime = 120_000;
const menuUrl = new URL('./', location.href);
const indexPath = new URL('index.html', menuUrl).pathname;
const menu = document.getElementById('menu');
const splash = document.getElementById('splash');
const openButton = document.getElementById('open-menu');
const information = document.getElementById('information');
const informationFrame = information.querySelector('iframe');
const activityEvents = ['pointerdown', 'pointerup', 'pointermove', 'pointercancel',
  'touchstart', 'touchend', 'touchcancel', 'wheel', 'scroll', 'keydown', 'input', 'change', 'click'];
const informationPaths = new Set(['terms.html', 'privacy.html', 'delivery.html',
  'contacts.html', 'data-processing.html', 'cookies.html', 'review-consent.html']
  .map(file => new URL(file, menuUrl).pathname));

let frame;
let timer;
let gesture;
let isOpen = false;

function loadMenu() {
  frame = document.createElement('iframe');
  frame.title = 'Меню и оформление заказа MissMaki';
  frame.src = menuUrl.href;
  frame.addEventListener('load', event => {
    if (event.currentTarget !== frame) return;
    const page = frame.contentDocument;
    if (!page) return;
    listenForActivity(page);
    page.addEventListener('click', showInformation);
    if (isOpen) resetTimer();
  });
  menu.replaceChildren(frame);
}

function listenForActivity(page) {
  for (const type of activityEvents) {
    page.addEventListener(type, resetTimer, { capture: true, passive: true });
  }
}

function showInformation(event) {
  const link = event.target.closest('a[href]');
  if (!link || link.origin !== menuUrl.origin || !informationPaths.has(link.pathname)) return;

  event.preventDefault();
  informationFrame.src = link.href;
  information.showModal();
}

function canReturnToSplash() {
  const page = frame.contentDocument;
  const cart = page?.getElementById('cart');
  const send = page?.getElementById('send');
  // The live menu renders quantity buttons only for products in the cart.
  // Require the existing empty-cart markup before replacing the menu frame.
  return Boolean(cart?.querySelectorAll('.line').length === 1 && send &&
    send.textContent.trim() !== 'Отправляем...' && !cart.querySelector('button'));
}

function resetTimer() {
  if (!isOpen) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (canReturnToSplash()) {
      isOpen = false;
      if (information.open) information.close();
      menu.inert = true;
      splash.inert = false;
      splash.classList.remove('open');
      loadMenu();
      if (document.activeElement !== document.body) openButton.focus({ preventScroll: true });
    } else {
      resetTimer();
    }
  }, idleTime);
}

function openMenu() {
  if (isOpen) return;
  isOpen = true;
  menu.inert = false;
  splash.inert = true;
  splash.classList.add('open');
  frame.focus({ preventScroll: true });
  resetTimer();
}

openButton.addEventListener('click', openMenu);
splash.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || event.clientY < splash.clientHeight * 0.65) return;
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
splash.addEventListener('pointerup', event => {
  if (gesture?.id !== event.pointerId) return;
  const rise = gesture.y - event.clientY;
  if (rise >= 55 && rise > Math.abs(gesture.x - event.clientX)) openMenu();
  gesture = undefined;
});
splash.addEventListener('pointercancel', () => { gesture = undefined; });
informationFrame.addEventListener('load', () => {
  const page = informationFrame.contentDocument;
  if (!page) return;
  listenForActivity(page);
  page.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || link.origin !== menuUrl.origin) return;
    if (link.pathname !== menuUrl.pathname && link.pathname !== indexPath) return;

    event.preventDefault();
    information.close();
  });
});
information.addEventListener('close', () => {
  informationFrame.removeAttribute('src');
  if (isOpen) frame.focus({ preventScroll: true });
});
menu.inert = true;
listenForActivity(document);
loadMenu();
