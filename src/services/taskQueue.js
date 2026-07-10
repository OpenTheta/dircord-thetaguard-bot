// Minimal promise queue with a concurrency bound. Used to keep Discord role
// mutations from firing unbounded when API calls and the full sync overlap
// (discord.js handles rate-limit headers, but queuing keeps the pressure and
// memory footprint predictable).
function createTaskQueue({ concurrency = 3 } = {}) {
    let active = 0;
    const pending = [];

    function next() {
        if (active >= concurrency || pending.length === 0) return;
        active++;
        const { fn, resolve, reject } = pending.shift();
        Promise.resolve()
            .then(fn)
            .then(resolve, reject)
            .finally(() => {
                active--;
                next();
            });
    }

    return {
        add(fn) {
            return new Promise((resolve, reject) => {
                pending.push({ fn, resolve, reject });
                next();
            });
        },
        get size() {
            return active + pending.length;
        },
    };
}

module.exports = { createTaskQueue };
