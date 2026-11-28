// Use a separate, temporary storage area for each customer. The kitchen watcher
// keeps its session until the kiosk replaces this document.
(() => {
  for (const name of ['localStorage', 'sessionStorage']) {
    const entries = new Map();
    Object.defineProperty(window, name, {
      value: {
        get length() { return entries.size; },
        key: index => [...entries.keys()][index] ?? null,
        getItem: key => entries.get(String(key)) ?? null,
        setItem: (key, value) => { entries.set(String(key), String(value)); },
        removeItem: key => { entries.delete(String(key)); },
        clear: () => entries.clear(),
      },
    });
  }

  // Supabase normally exchanges anonymous sessions with other tabs of this origin.
  const NativeChannel = window.BroadcastChannel;
  if (NativeChannel) {
    const scope = crypto.getRandomValues(new Uint32Array(4)).join('-');
    window.BroadcastChannel = class extends NativeChannel {
      constructor(name) { super('missmaki-kiosk-' + scope + ':' + name); }
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const order = document.getElementById('order');
    const sendOrder = submit;
    if (typeof sendOrder !== 'function') return;

    let accepted = false;
    submit = async (...args) => {
      const result = await sendOrder(...args);
      accepted = result?.ok === true;
      return result;
    };

    const runCheckout = checkoutOnce;
    checkoutOnce = async () => {
      if (busy) return;
      accepted = false;
      try {
        return await runCheckout();
      } finally {
        if (accepted) {
          accepted = false;
          resetCustomer(order);
        }
      }
    };
  });

  function resetCustomer(order) {
    for (const id of ['name', 'phone', 'area', 'address', 'comment', 'preorder-date']) {
      document.getElementById(id).value = '';
    }
    for (const field of order.querySelectorAll('input[type="radio"], input[type="checkbox"]')) {
      field.checked = field.defaultChecked;
    }
    // Invalidate an availability response that might still arrive.
    slotRequest++;
    unavailableSlots = [];
    for (const id of ['preorder-time', 'slot-message', 'slot-alternatives']) {
      document.getElementById(id).replaceChildren();
    }
    Object.keys(cart).forEach(key => { delete cart[key]; });
    pending = null;
    pickupIntent = undefined;
    sessionStorage.removeItem('missmaki-pending-order');
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key.startsWith('missmaki-order:') ||
          ['mm-pending-submission', 'missmaki-active-order', 'mm-pickup-intent'].includes(key)) {
        localStorage.removeItem(key);
      }
    }
    document.getElementById('review-form')?.reset();
    setMethod();
    updateTiming();
  }
})();
