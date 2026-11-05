// Mock native modules for Web to prevent Webpack/Metro from bundling native code
export const InCallManager = null;
export const webrtc = null;
export const GoogleSignin = null;
export const statusCodes = {};
// Same shape as the real one in nativeModules.js, so call code that ends a call never crashes in a browser.
// (The real service only exists on Android; here both calls do nothing.)
export const CallForegroundService = { start() {}, stop() {} };
