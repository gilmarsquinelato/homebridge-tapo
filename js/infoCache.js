// Short-lived cache around a Tapo handler's getDeviceInfo() call.
// Collapses bursts of HomeKit characteristic reads (HomeKit fires every
// onGet in parallel) into a single device round-trip, which is what the
// Tapo KLAP session can actually handle without flapping.
function createInfoCache(fetchInfo, ttlMs = 2000) {
  let value = null;
  let fetchedAt = 0;
  let inFlight = null;

  return {
    async get() {
      const now = Date.now();
      if (value && now - fetchedAt < ttlMs) {
        return value;
      }
      if (inFlight) {
        return inFlight;
      }
      inFlight = (async () => {
        try {
          const fresh = await fetchInfo();
          value = fresh;
          fetchedAt = Date.now();
          return fresh;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },
    peek() {
      return value;
    },
    invalidate() {
      value = null;
      fetchedAt = 0;
    },
    patch(updates) {
      if (value) {
        value = { ...value, ...updates };
      }
    },
  };
}

module.exports = { createInfoCache };
