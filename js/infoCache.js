// How long after a successful write we leave the device alone before letting
// the state poller overwrite the optimistic value.  Tapo devices don't report
// the new state back immediately, so polling too soon bounces the
// characteristic in the Home app.
const WRITE_SETTLE_MS = 3000;

// Short-lived cache around a Tapo handler's getDeviceInfo() call.
// Collapses bursts of HomeKit characteristic reads (HomeKit fires every
// onGet in parallel) into a single device round-trip, which is what the
// Tapo KLAP session can actually handle without flapping.
function createInfoCache(fetchInfo, ttlMs = 2000) {
  let value = null;
  let fetchedAt = 0;
  let inFlight = null;
  let patchedAt = 0;

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
      patchedAt = Date.now();
      if (value) {
        value = { ...value, ...updates };
      }
    },
    // Milliseconds since the last write we made through this handler.
    sinceWrite() {
      return patchedAt === 0 ? Infinity : Date.now() - patchedAt;
    },
  };
}

module.exports = { createInfoCache, WRITE_SETTLE_MS };
