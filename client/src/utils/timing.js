// Timing helpers.

// Promise-based delay, used to pace the processing-screen step animation.
export const sleep = ms => new Promise(r => setTimeout(r, ms));
