const test = require('ava');
const proxyquire = require('proxyquire');
const handlers = proxyquire(
  '../src',
  {
    '@cumulus/cumulus-message-adapter-js': {
      // We don't want to run the task, but we want to make sure the first
      // argument is a function, if we don't get a ReferenceError.
      runCumulusTask: (taskFn) => {
        if (typeof taskFn !== 'function') {
          throw new TypeError(
            `task function is not a function: ${JSON.stringify(taskFn)}`
          );
        }
      }
    }
  }
);

// Make sure that each function that is called by runCumulusTask has actually
// been properly `require`d within the index file that exports the handlers.
Object.entries(handlers)
  // This filtering is a hack to avoid trying to call non-handlers
  // that are exported.  Once the "discovery" required by scripts/run.js
  // is removed (by using unit tests instead), the extra exports can be
  // removed and this filter can then be removed as well.
  .filter(([name]) => name.endsWith("Handler"))
  .forEach(([name, handler]) =>
    test(
      `${name} should not throw a ReferenceError nor a TypeError`,
      (t) => t.notThrows(handler)
    )
  );
